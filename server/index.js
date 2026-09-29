import "dotenv/config";

// ─── Zona horaria del estudio ────────────────────────────────────────────────
// El contenedor de Railway corre en UTC, pero el estudio opera en hora civil de
// CDMX. Sin anclar esto, a partir de las 18:00 hora local el proceso ya cree
// que es el día siguiente: una membresía que vence hoy se lee vencida, los
// recordatorios se agendan un día corrido y los reportes cortan mal el día.
// Se fija ANTES de cualquier uso de Date; Node lee process.env.TZ de forma
// perezosa, asi que asignarlo aqui alcanza. Auditoria de zona, 2026-09-14.
const TZ_PEDIDA = process.env.STUDIO_TIMEZONE || "America/Mexico_City";
// Una zona invalida en el arranque de libpq tumba TODAS las conexiones con
// `FATAL: invalid value for parameter "TimeZone"`, asi que se valida antes de
// usarla y se cae al default con un aviso, en vez de dejar el sistema muerto.
function zonaValida(z) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: z }); return true; } catch { return false; }
}
export const STUDIO_TIMEZONE = zonaValida(TZ_PEDIDA) ? TZ_PEDIDA : "America/Mexico_City";
if (STUDIO_TIMEZONE !== TZ_PEDIDA) {
  console.warn(`⚠️  STUDIO_TIMEZONE="${TZ_PEDIDA}" no es una zona valida; se usa ${STUDIO_TIMEZONE}.`);
}
// OJO: en ESM los `import` se evaluan ANTES que esta linea, asi que esto no
// protege a un modulo importado que capture la zona al cargarse. La garantia
// de verdad es arrancar el contenedor con TZ ya puesta (nixpacks.toml lo hace);
// esta asignacion es la red de seguridad para Date en este proceso.
process.env.TZ = STUDIO_TIMEZONE;

/** Fecha civil de HOY en el estudio, "YYYY-MM-DD". */
export function todayInStudio(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

import express from "express";
import cors from "cors";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import multer from "multer";
import axios from "axios";
import crypto from "crypto";
import http2 from "http2";
import archiver from "archiver";
import sharp from "sharp";
import { execSync } from "child_process";
import {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  FROM_EMAIL,
} from "./emailService.js";
import { CATALOG_CLASS_TYPES, CATALOG_SCHEDULE_SLOTS, CATALOG_SCHEDULE_DAYS, CATALOG_PLANS } from "./lib/catalog.js";
import { seedClassTypesIfEmpty, seedPlansIfEmpty } from "./lib/catalogSeed.js";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "./lib/notificationTemplates.js";
import { PASS_DEFAULT_TEXTS, LOYALTY_MILESTONES_SEED } from "./lib/passDefaults.js";
import { passLocationFields } from "./lib/passGeofence.js";
import { syntheticGuestEmail } from "./lib/syntheticEmail.js";
import { resolveEffectivePrice } from "./lib/pricing.js";
import { saleAmountPlan, planMembershipAdjust, cleanPaymentReference, saleStartProblem, saleStartDay, saleAuditAfter, PAYMENT_METHODS, normalizePaymentMethod, PAYMENT_METHOD_INVALID, calcMembershipEndDate } from "./lib/membershipAdmin.js";
import { cancellationLimitProblem, cancellationQuota, clientCancelDecision, normalizeCancellationSettings, publicBookingPolicy } from "./lib/cancellationPolicy.js";
import { isMembershipCategoryCompatible as ruleCategoryCompatible, normalizeClassCategory as ruleNormalizeCategory, isWithinMorningWindow, categoryLabel, canMixtoBook } from "./lib/bookingRules.js";
import { rateKey } from "./lib/rateKey.js";
import { isWithinCancelWindow, penaltyDueAt, faltaReversal } from "./lib/faltas.js";
import { scheduleAt } from "./lib/schedule.js";
import { verifyWellhubSignature, extractSignatureHeader } from "./lib/wellhub/signature.js";
import { extractGymId, computeEventId } from "./lib/wellhub/payload.js";
import { planWeekClear, weekRangeProblem } from "./lib/weekClear.js";
import { promotionWindowOpen, freeSeats, queueBlocksNewBooking, firstEligible, sweepMinutes, MAX_SWEEP_MINUTES, singleFlight, bookingNotice, classEditReleasesSeats } from "./lib/waitlist.js";
import { getWellhubCredentials } from "./lib/wellhub/credentials.js";
import { publicPartnerSettings, mergeSecret } from "./lib/partnerSettings.js";
import { createAccountGate } from "./lib/accountGate.js";
import { userAnonymizationValues, buildAnonymizeUpdate, WAIVER_ANON_VALUES, GUEST_ANON_VALUES, eventRegistrationAnonValues } from "./lib/anonymize.js";
import { refundPlan, round2 } from "./lib/refunds.js";
import { validateWellhubVisit as wellhubValidateVisit } from "./lib/wellhub/api.js";
import { handleBookingRequested, handleCheckin, handleCancel, handlePlanChange } from "./lib/wellhub/flows.js";
import { wellhubMonthRange, summarizeWellhubMonth } from "./lib/wellhub/reconcile.js";
import { isUuid, isDay, signatureProblem } from "./lib/validate.js";
import { checkinRule, noShowCorrectionRule } from "./lib/checkin.js";
import { responsivaDocument, waiverVersionProblem } from "./lib/responsiva.js";
import { pgReminderLog, sendClassReminders } from "./lib/classReminder.js";
import { createChannelState } from "./lib/whatsappState.js";
import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";
import { PRIVACY_NOTICE_VERSION, healthDataChanges, hasCurrentHealthConsent, healthConsentProblem } from "./lib/privacy.js";
import {
  validateStripeConfig,
  createOrGetStripeCustomer,
  createCheckoutSession,
  verifyWebhookSignature,
} from "./lib/stripe.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || "dev_alma_secret_change_me";

const APP_PUBLIC_URL = String(process.env.APP_URL || process.env.SITE_URL || "https://www.almamovement.com.mx").replace(/\/+$/, "");

// ─── Evolution API (WhatsApp) config ────────────────────────────────────────
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || "";
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || "";
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE_NAME || "alma-movement";
const evolutionApi = axios.create({
  baseURL: EVOLUTION_API_URL,
  headers: { apikey: EVOLUTION_API_KEY },
  timeout: 20000,
});

const DEFAULT_GENERAL_SETTINGS = {
  // Alineado con src/lib/studio.ts (única fuente de verdad de los datos
  // públicos del estudio). Teléfono y WhatsApp: pendientes (null), igual que ahí.
  studio_name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  phone: null,
  instagram: "@hive.pilates",
  facebook: "",
  timezone: "America/Mexico_City",
  currency: "MXN",
  maintenance_mode: false,
  venue_media_url: "",
  venue_media_type: "",
  venue_media_drive_id: "",
  venue_media_name: "",
  venue_media_updated_at: "",
  opening_pricing_active: true,
};

// Operación diaria: dueña, recepción e instructoras.
const OPERATIONS_ROLES = ["admin", "super_admin", "instructor", "reception"];
// Dinero y configuración sensible: SÓLO la dueña.
const OWNER_ROLES = ["admin", "super_admin"];

// Los datos bancarios reales vivían aquí, en el repositorio. Ahora se leen del
// entorno y, en operación normal, de settings.bank_info (editable desde el
// panel con PUT /api/admin/bank-info). Auditoría 2026-09-08, P0-5.
const DEFAULT_BANK_INFO = Object.freeze({
  bank: process.env.BANK_NAME || "",
  account_holder: process.env.BANK_ACCOUNT_HOLDER || "",
  account_number: process.env.BANK_ACCOUNT_NUMBER || "",
  clabe: process.env.BANK_CLABE || "",
});

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatClabe(value) {
  const digits = digitsOnly(value);
  if (digits.length !== 18) return String(value || "").trim();
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 17)} ${digits.slice(17)}`;
}

function formatAccountNumber(value) {
  const digits = digitsOnly(value);
  if (digits.length === 10) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  return String(value || "").trim();
}

let bankInfoWarned = false;
function normalizeBankInfo(rawValue) {
  const raw = rawValue && typeof rawValue === "object" ? rawValue : {};
  const candidate = {
    bank: String(raw.bank || raw.bank_name || raw.banco || "").trim(),
    account_holder: String(raw.account_holder || raw.accountHolder || raw.titular || raw.holder || "").trim(),
    account_number: String(raw.account_number || raw.accountNumber || raw.cuenta || raw.account || "").trim(),
    clabe: String(raw.clabe || raw.clabe_interbancaria || "").trim(),
  };

  const holderLower = candidate.account_holder.toLowerCase();
  const clabeDigits = digitsOnly(candidate.clabe);
  const accountDigits = digitsOnly(candidate.account_number);
  const shouldUseDefault =
    !candidate.bank ||
    !candidate.account_holder ||
    clabeDigits.length !== 18 ||
    (accountDigits && accountDigits.length < 10) ||
    clabeDigits === "012180001234567890" ||
    clabeDigits === "012180012345678901" ||
    clabeDigits === "710180000068980" ||
    holderLower.includes("balance studio") ||
    holderLower.includes("alma barre studio");

  const base = shouldUseDefault ? DEFAULT_BANK_INFO : candidate;
  if (shouldUseDefault && !DEFAULT_BANK_INFO.clabe && !bankInfoWarned) {
    bankInfoWarned = true;
    console.warn(
      "⚠️  No hay datos bancarios configurados. Captúralos en el panel " +
      "(Ajustes → Datos bancarios) o define BANK_NAME / BANK_ACCOUNT_HOLDER / " +
      "BANK_ACCOUNT_NUMBER / BANK_CLABE: sin esto la pantalla de transferencia sale vacía."
    );
  }
  const formattedAccount = formatAccountNumber(base.account_number || DEFAULT_BANK_INFO.account_number);
  const formattedClabe = formatClabe(base.clabe || DEFAULT_BANK_INFO.clabe);
  const holder = String(base.account_holder || DEFAULT_BANK_INFO.account_holder).trim();
  const bank = String(base.bank || DEFAULT_BANK_INFO.bank).trim();

  return {
    bank,
    bank_name: bank,
    account_holder: holder,
    accountHolder: holder,
    account_number: formattedAccount,
    accountNumber: formattedAccount,
    clabe: formattedClabe,
  };
}

async function getConfiguredBankInfo(dbClient = pool) {
  try {
    // La config vive en la tabla `settings` (key 'bank_info'). Antes esto
    // consultaba `system_settings` —tabla inexistente— así que SIEMPRE caía al
    // catch y devolvía los datos hardcodeados. Por eso editar no se reflejaba.
    const settingsRes = await dbClient.query(
      "SELECT value FROM settings WHERE key = 'bank_info' LIMIT 1"
    );
    const raw = settingsRes.rows.length > 0 ? settingsRes.rows[0].value : null;
    return normalizeBankInfo(raw);
  } catch (_) {
    return normalizeBankInfo(DEFAULT_BANK_INFO);
  }
}

// Textos de respaldo de policies_settings. Desde el bloque 3 las páginas legales
// ya no los muestran: los documentos viven versionados en src/pages/legal. Se
// dejan en HIVE por si algo viejo los lee (auditoría 2026-09-27, punto 7).
const DEFAULT_POLICIES_SETTINGS = {
  cancellation_policy: "La política de cancelación vigente de HIVE Pilates Studio está en /legal/cancelacion.",
  terms_of_service: "Los términos y condiciones vigentes de HIVE Pilates Studio están en /legal/terminos.",
  privacy_policy: "El aviso de privacidad vigente de HIVE Pilates Studio está en /legal/privacidad.",
};

const DEFAULT_NOTIFICATION_SETTINGS = {
  email_reminders: true,
  whatsapp_reminders: true,
  reminder_hours_before: 2,
  // Teléfonos que reciben WhatsApps administrativos (nueva reserva, etc.).
  // Independiente de los usuarios con role=admin: aquí se configura a quién
  // realmente notificamos (la dueña, recepcionistas con cel personal, etc.).
  admin_phones: [],
};

// Templates en voz HIVE (cercana, casual, con primer nombre).
// Editables vía system_settings.notification_templates (admin UI).
// Extraído a server/lib/notificationTemplates.js (ver ese archivo para el
// detalle de cada template y sus variables).

const DEFAULT_SETTINGS_BY_KEY = {
  general_settings: DEFAULT_GENERAL_SETTINGS,
  policies_settings: DEFAULT_POLICIES_SETTINGS,
  notification_settings: DEFAULT_NOTIFICATION_SETTINGS,
  notification_templates: DEFAULT_NOTIFICATION_TEMPLATES,
};

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(baseValue, overrideValue) {
  if (!isPlainObject(baseValue)) {
    return overrideValue === undefined ? baseValue : overrideValue;
  }
  if (!isPlainObject(overrideValue)) {
    return baseValue;
  }
  const output = { ...baseValue };
  for (const [key, val] of Object.entries(overrideValue)) {
    const baseEntry = output[key];
    output[key] = isPlainObject(baseEntry) && isPlainObject(val)
      ? deepMerge(baseEntry, val)
      : val;
  }
  return output;
}

function mergeSettingsWithDefaults(key, rawValue) {
  const defaults = DEFAULT_SETTINGS_BY_KEY[key];
  if (!defaults) return rawValue ?? null;
  if (!isPlainObject(rawValue)) return JSON.parse(JSON.stringify(defaults));
  const merged = deepMerge(defaults, rawValue);
  if (key === "policies_settings") {
    for (const [fieldKey, defaultValue] of Object.entries(defaults)) {
      const current = merged[fieldKey];
      if (typeof defaultValue === "string" && (!current || !String(current).trim())) {
        merged[fieldKey] = defaultValue;
      }
    }
  }
  return merged;
}

// ─── File upload (memory storage, max 10 MB) ────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── Google Drive helpers ────────────────────────────────────────────────────
async function getGoogleDriveAccessToken() {
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN || "",
    grant_type: "refresh_token",
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

async function makeGoogleDriveFilePublic(fileId, accessToken) {
  await axios.post(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    { role: "reader", type: "anyone" },
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
  ).catch(() => { }); // best-effort
}

/**
 * Devuelve el folder ID de Drive ya saneado: corta cualquier basura que viene
 * pegada cuando alguien copia el ID desde la URL del navegador (`?hl=es`,
 * `?usp=...`, `/edit`, espacios). Drive es estricto con esto y un ID con
 * sufijo provoca "File not found".
 */
function getDriveFolderId() {
  const raw = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  if (!raw) return "";
  // Si pegaron una URL completa, quédate con el último segmento.
  let id = raw;
  const slashIdx = id.lastIndexOf("/");
  if (slashIdx !== -1) id = id.slice(slashIdx + 1);
  // Recorta lo que venga después de `?` o `#` (querystring/fragmento).
  const qIdx = id.search(/[?#]/);
  if (qIdx !== -1) id = id.slice(0, qIdx);
  return id.trim();
}

/** Upload a Buffer to Google Drive using simple multipart (for small files like thumbnails) */
async function uploadBufferToDrive(buffer, fileName, mimeType, accessToken) {
  const folderId = getDriveFolderId();
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  // Build multipart body manually
  const boundary = "hive_boundary_" + Date.now();
  const metaPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const filePart = Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const endPart = Buffer.from(`\r\n--${boundary}--`);
  const body = Buffer.concat([metaPart, filePart, buffer, endPart]);

  const resp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    body,
    { headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary="${boundary}"` }, maxBodyLength: Infinity, maxContentLength: Infinity }
  );
  return resp.data; // { id, webViewLink }
}

/**
 * Upload a file from disk to Google Drive using Resumable Upload (streams in 5 MB chunks).
 * Works for files of any size without loading them entirely into memory.
 * @param {string} filePath  - absolute path to the temp file on disk
 * @param {string} fileName  - desired file name in Drive
 * @param {string} mimeType  - e.g. "video/mp4"
 * @param {string} accessToken - Google OAuth2 access token
 * @returns {{ id: string, webViewLink?: string }}
 */
async function uploadFileToDriveResumable(filePath, fileName, mimeType, accessToken) {
  const folderId = getDriveFolderId();
  const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };
  const fileSize = fs.statSync(filePath).size;

  // Step 1: Initiate resumable upload session
  const initResp = await axios.post(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    metadata,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(fileSize),
      },
    }
  );
  const uploadUri = initResp.headers.location; // resumable session URI

  // Step 2: Upload file in chunks of 5 MB (must be multiples of 256 KB)
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
  let offset = 0;
  const fd = fs.openSync(filePath, "r");

  try {
    while (offset < fileSize) {
      const bytesToRead = Math.min(CHUNK_SIZE, fileSize - offset);
      const chunk = Buffer.alloc(bytesToRead);
      fs.readSync(fd, chunk, 0, bytesToRead, offset);

      const endByte = offset + bytesToRead - 1;
      const contentRange = `bytes ${offset}-${endByte}/${fileSize}`;

      const resp = await axios.put(uploadUri, chunk, {
        headers: {
          "Content-Length": String(bytesToRead),
          "Content-Range": contentRange,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        // 308 Resume Incomplete is expected for intermediate chunks
        validateStatus: (status) => status === 200 || status === 201 || status === 308,
      });

      if (resp.status === 200 || resp.status === 201) {
        // Final chunk — upload complete
        return resp.data; // { id, webViewLink }
      }

      // 308: read next range from Range header
      const rangeHeader = resp.headers.range; // e.g. "bytes=0-5242879"
      if (rangeHeader) {
        offset = parseInt(rangeHeader.split("-")[1], 10) + 1;
      } else {
        offset += bytesToRead;
      }
    }
  } finally {
    fs.closeSync(fd);
  }

  throw new Error("Resumable upload ended without a final 200/201 response");
}

// Normaliza una foto de perfil: corrige orientación EXIF, acota a 1280px
// (sin agrandar), recomprime a JPEG de buena calidad y limpia metadatos.
// Devuelve { buffer, mimeType, ext } listos para subir al almacenamiento.
async function processProfilePhoto(inputBuffer) {
  const out = await sharp(inputBuffer)
    .rotate()
    .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  return { buffer: out, mimeType: "image/jpeg", ext: "jpg" };
}

// Sube una foto de perfil ya procesada al almacenamiento y la hace pública.
// Devuelve la URL servida por el proxy (/api/drive/image/<id>) o null si el
// almacenamiento no está configurado (en cuyo caso el caller decide fallback).
function photoDriveConfig() {
  const dedicated = Boolean(process.env.PHOTOS_DRIVE_CLIENT_ID || process.env.PHOTOS_DRIVE_CLIENT_SECRET || process.env.PHOTOS_DRIVE_REFRESH_TOKEN);
  const prefix = dedicated ? "PHOTOS_DRIVE_" : "GOOGLE_";
  return { clientId: process.env[prefix + "CLIENT_ID"], clientSecret: process.env[prefix + "CLIENT_SECRET"], refreshToken: process.env[prefix + "REFRESH_TOKEN"], folderId: dedicated ? process.env.PHOTOS_DRIVE_FOLDER_ID : process.env.GOOGLE_DRIVE_FOLDER_ID };
}

function isGoogleDriveConfigured() {
  return Boolean(
    photoDriveConfig().folderId &&
    photoDriveConfig().clientId &&
    photoDriveConfig().clientSecret &&
    photoDriveConfig().refreshToken
  );
}

async function storePhotoReference(value) {
  if (typeof value !== "string" || !value.startsWith("data:")) return value;
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error("Formato de imagen no permitido");
  if (!isGoogleDriveConfigured()) throw new Error("Almacenamiento de fotos no disponible");
  const { fileId } = await uploadBufferToGoogleDrive(Buffer.from(match[2], "base64"), `studio_${Date.now()}`, match[1]);
  return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
}

async function uploadBufferToGoogleDrive(buffer, filename, mimeType) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) throw new Error("Formato de imagen no permitido");
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: photoDriveConfig().clientId,
      client_secret: photoDriveConfig().clientSecret,
      refresh_token: photoDriveConfig().refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error(`Google OAuth error: ${tokenData.error_description || tokenData.error || "unknown"}`);
  }
  const accessToken = tokenData.access_token;

  const boundary = "drive_upload_" + Date.now();
  const metadata = JSON.stringify({
    name: filename,
    parents: [photoDriveConfig().folderId],
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadResp = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const uploadJson = await uploadResp.json();
  if (!uploadJson.id) throw new Error(`Drive upload failed: ${JSON.stringify(uploadJson)}`);

  const permission = await fetch(`https://www.googleapis.com/drive/v3/files/${uploadJson.id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  if (!permission.ok) throw new Error("No se pudo publicar la foto");
  return { fileId: uploadJson.id };
}

async function storeProfilePhoto(processed, label) {
  if (!isGoogleDriveConfigured()) return `data:${processed.mimeType};base64,${processed.buffer.toString("base64")}`;
  const { fileId } = await uploadBufferToGoogleDrive(processed.buffer, `perfil_${label}_${Date.now()}.${processed.ext}`, processed.mimeType);
  return `https://lh3.googleusercontent.com/d/${fileId}=w1600`;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
  // Ancla la zona en cada conexion: con esto CURRENT_DATE, NOW()::date y los
  // casts implicitos timestamp→timestamptz operan en hora del estudio, no en la
  // del servidor. Es la defensa de fondo: neutraliza de raiz los 54
  // CURRENT_DATE y los 4 NOW()::date que hay repartidos por el archivo, en vez
  // de parchear consulta por consulta. Auditoria de zona, 2026-09-14.
  options: `-c TimeZone=${STUDIO_TIMEZONE}`,
});

// Red de seguridad: si algun proveedor ignora `options`, se fija por sesion.
pool.on("connect", (client) => {
  client.query(`SET TIME ZONE '${STUDIO_TIMEZONE}'`).catch((e) =>
    console.warn("[pool] no se pudo fijar la zona de la sesion:", e?.message));
});

// Ensure users table has password_hash column (idempotent migration)
async function ensureSchema() {
  try {
    // ── Asegurar que el enum user_role acepta 'guest' ─────────────────────
    // El schema original definía user_role como ENUM('client','instructor',
    // 'admin','super_admin','reception'). El flujo de visitas/acompañantes
    // crea users con role='guest' (user "shadow" 1:1 al guest_profile), por
    // lo que el enum tiene que aceptarlo. ALTER TYPE ADD VALUE IF NOT EXISTS
    // es idempotente y NO necesita estar fuera de transacción en PG 12+.
    await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'guest'`).catch((e) => {
      // Algunas versiones viejas de PG no permiten esto en transacción; el
      // pool aquí no abre transacción explícita, pero por las dudas log y
      // seguimos — el flujo de visitas fallará con mensaje claro si falta.
      console.warn("[ensureSchema] ALTER TYPE user_role ADD VALUE 'guest':", e?.message);
    });

    // ── Auditoria 2026-09-08 — correcciones que DEBEN existir en la base ──
    // El deploy corre `node server/index.js`, no un paso de migraciones, asi
    // que estas tres van aqui: si viven solo en supabase/migrations, en
    // produccion no se aplican nunca y el arreglo del doble cobro no existe.
    // Las tres son idempotentes.
    //
    // 1) El trigger descontaba la clase al hacer check-in mientras la app ya la
    //    descuenta al reservar: cada clase asistida costaba 2 creditos.
    await pool.query(`DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings`).catch((e) => {
      console.warn("[ensureSchema] drop trigger_decrement_classes:", e?.message);
    });
    await pool.query(`DROP FUNCTION IF EXISTS decrement_membership_classes()`).catch(() => { });
    // 2) 'closed' lo escribe PUT /api/classes/:id/close y no existia en el enum.
    await pool.query(`ALTER TYPE class_status ADD VALUE IF NOT EXISTS 'closed'`).catch((e) => {
      console.warn("[ensureSchema] ALTER TYPE class_status ADD VALUE 'closed':", e?.message);
    });
    // 3) Reparar el contador de cupo que quedo inflado mientras el trigger y el
    //    handler sumaban los dos. A partir de ahora solo lo mantiene el trigger.
    await pool.query(`
      UPDATE classes c SET current_bookings = COALESCE((
        SELECT COUNT(*) FROM bookings b
         WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')), 0)
       WHERE c.date >= CURRENT_DATE - INTERVAL '1 day'
         AND c.current_bookings IS DISTINCT FROM COALESCE((
        SELECT COUNT(*) FROM bookings b
         WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')), 0)`)
      .then((r) => { if (r.rowCount) console.log(`✅ Cupo recalculado en ${r.rowCount} clases`); })
      .catch((e) => console.warn("[ensureSchema] recalculo de cupo:", e?.message));

    // ── Ensure all users columns the app needs ────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_terms BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS accepts_communications BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_notes TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_reminders BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_last_read_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notifications_last_read_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_promotions BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS receive_weekly_summary BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    // Videoteca retirada: se elimina la columna del regalo de cumpleaños de acceso.
    await pool.query(`ALTER TABLE users DROP COLUMN IF EXISTS video_library_access_until`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_gift_year INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(10)`).catch(() => { });
    // Teléfono opcional: el alta manual de clientas permite registrar sin teléfono.
    await pool.query(`ALTER TABLE users ALTER COLUMN phone DROP NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_injury BOOLEAN`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS practiced_barre_before BOOLEAN`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS injury_details TEXT`).catch(() => { });
    {
      // onboarding_completed: añadir la columna y, solo la primera vez (cuando
      // aún no existía), marcar a las usuarias YA registradas como completadas
      // para no forzarlas al cuestionario. Registros nuevos nacen con false.
      const colExists = await pool
        .query(
          `SELECT 1 FROM information_schema.columns
           WHERE table_name = 'users' AND column_name = 'onboarding_completed'`
        )
        .then((r) => r.rows.length > 0)
        .catch(() => true); // ante la duda, no hacer backfill
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false`).catch(() => { });
      if (!colExists) {
        await pool
          .query(`UPDATE users SET onboarding_completed = true`)
          .catch((e) => console.warn("[migrate] onboarding backfill skipped:", e.message));
      }
    }
    // ── Password reset tokens ───────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       VARCHAR(255) NOT NULL UNIQUE,
        expires_at  TIMESTAMP WITH TIME ZONE NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON password_reset_tokens(expires_at)`).catch(() => { });
    // Cleanup best-effort to keep table compact.
    await pool.query(`
      DELETE FROM password_reset_tokens
      WHERE used = true OR expires_at < NOW() - INTERVAL '7 days'
    `).catch(() => { });
    // Ensure referrals table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code VARCHAR(20) NOT NULL UNIQUE,
        uses_count INTEGER DEFAULT 0,
        reward_points INTEGER DEFAULT 200,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`).catch(() => { });
    await pool.query(`ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS max_uses INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE referral_codes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    // Ensure discount_codes table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS discount_codes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code VARCHAR(50) NOT NULL UNIQUE,
        discount_type VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent','fixed')),
        discount_value DECIMAL(10,2) NOT NULL,
        max_uses INTEGER,
        uses_count INTEGER DEFAULT 0,
        class_category VARCHAR(20),
        channel VARCHAR(20) NOT NULL DEFAULT 'all',
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── class_types (tipos de clase editables desde admin) ──────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_types (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(100) NOT NULL,
        subtitle     VARCHAR(150),
        description  TEXT,
        category     VARCHAR(20)  NOT NULL DEFAULT 'studio' CHECK (category IN ('studio','reformer_tower')),
        intensity    VARCHAR(20)  DEFAULT 'media' CHECK (intensity IN ('ligera','media','pesada','todas')),
        level        VARCHAR(50)  DEFAULT 'Todos los niveles',
        duration_min INTEGER      DEFAULT 50,
        capacity     INTEGER      DEFAULT 5,
        color        VARCHAR(50)  DEFAULT '#c026d3',
        emoji        VARCHAR(10)  DEFAULT '🏃',
        is_active    BOOLEAN      DEFAULT true,
        sort_order   INTEGER      DEFAULT 0,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS subtitle VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS category VARCHAR(20) DEFAULT 'studio'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS intensity VARCHAR(20) DEFAULT 'media'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS level VARCHAR(50) DEFAULT 'Todos los niveles'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS duration_min INTEGER DEFAULT 50`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 5`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ALTER COLUMN capacity SET DEFAULT 5`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS color VARCHAR(50) DEFAULT '#c026d3'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS emoji VARCHAR(10) DEFAULT '🏃'`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    // ── schedule_slots (horario semanal editable desde admin) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_slots (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot       VARCHAR(20) NOT NULL,
        day_of_week     INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
        class_type_id   UUID REFERENCES class_types(id) ON DELETE SET NULL,
        class_type_name VARCHAR(100),
        instructor_name VARCHAR(100),
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_schedule_slots_day ON schedule_slots(day_of_week)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS class_type_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS instructor_name VARCHAR(100)`).catch(() => { });
    await pool.query(`ALTER TABLE schedule_slots ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_slots_slot ON schedule_slots(time_slot, day_of_week) WHERE is_active = true`).catch(() => { });
    // ── schedule_templates (plantilla simple con class_label) ───────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schedule_templates (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        time_slot   VARCHAR(10)  NOT NULL,
        day_of_week SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 1 AND 6),
        class_label VARCHAR(50)  NOT NULL,
        shift       VARCHAR(10)  NOT NULL DEFAULT 'morning' CHECK (shift IN ('morning','evening')),
        is_active   BOOLEAN      DEFAULT true,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (time_slot, day_of_week)
      );
    `);
    // ── packages (tabla legacy de paquetes de precios) ──────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name          VARCHAR(100) NOT NULL,
        num_classes   VARCHAR(20)  NOT NULL,
        price         DECIMAL(10,2) NOT NULL,
        category      VARCHAR(20)  NOT NULL DEFAULT 'mixto' CHECK (category IN ('studio','reformer_tower','mixto','all')),
        validity_days INTEGER      DEFAULT 30,
        is_active     BOOLEAN      DEFAULT true,
        sort_order    INTEGER      DEFAULT 0,
        created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_category_check`).catch(() => { });
    await pool.query(`UPDATE packages SET category='mixto' WHERE category NOT IN ('studio','reformer_tower','mixto','all')`).catch(() => { });
    await pool.query(`ALTER TABLE packages ADD CONSTRAINT packages_category_check CHECK (category IN ('studio','reformer_tower','mixto','all'))`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_packages_category ON packages(category)`).catch(() => { });
    // La tabla `packages` es legacy (solo display). La landing ahora lee de
    // `plans`. Desactivamos cualquier fila para no mostrar precios viejos.
    await pool.query(`UPDATE packages SET is_active = false`).catch(() => { });
    // ── Seed class_types: catálogo inicial sólo si la tabla está vacía ────
    await pool.query(`ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_category_check`).catch(() => { });
    await pool.query(`UPDATE class_types SET category = 'studio' WHERE category NOT IN ('studio','reformer_tower')`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD CONSTRAINT class_types_category_check CHECK (category IN ('studio','reformer_tower'))`).catch(() => { });
    // Con filas existentes (lo que el estudio captura en el panel) no se
    // desactiva ni se reescribe nada. Ver server/lib/catalogSeed.js.
    await seedClassTypesIfEmpty(pool, CATALOG_CLASS_TYPES);
    // ── Seed schedule_slots si la tabla está vacía ─────────────────────────
    const existingSlots = await pool.query(`SELECT COUNT(*)::int AS n FROM schedule_slots`);
    if (existingSlots.rows[0].n === 0) {
      const values = [];
      const params = [];
      let i = 1;
      for (const day of CATALOG_SCHEDULE_DAYS) {
        for (const slot of CATALOG_SCHEDULE_SLOTS) {
          values.push(`($${i++}, $${i++}, NULL)`);
          params.push(slot, day);
        }
      }
      await pool.query(
        `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name) VALUES ${values.join(", ")}`,
        params
      );
    }
    // ── Ensure plans columns exist ───────────────────────────────────────
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS description TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'MXN'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_limit INTEGER`).catch(() => { });
    // weekly_class_limit: tope ISO-semanal (lun–dom hora MX). NULL = sin tope semanal.
    // Se DERIVA del nombre ('… N Clase(s) por semana') vía trigger, así cualquier
    // endpoint que cree/edite un plan obtiene el tope correcto sin hardcodear nombres.
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS weekly_class_limit INTEGER`).catch(() => { });
    await pool.query(`
      CREATE OR REPLACE FUNCTION alma_set_weekly_class_limit() RETURNS trigger AS $$
      DECLARE m text;
      BEGIN
        m := substring(lower(coalesce(NEW.name, '')) from '(\\d+)\\s+clases?\\s+por\\s+semana');
        NEW.weekly_class_limit := CASE WHEN m IS NULL OR m = '' THEN NULL ELSE m::int END;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `).catch((e) => { console.error("weekly_class_limit fn error:", e.message); });
    await pool.query(`
      DROP TRIGGER IF EXISTS alma_set_weekly_class_limit_trg ON plans;
      CREATE TRIGGER alma_set_weekly_class_limit_trg
        BEFORE INSERT OR UPDATE ON plans
        FOR EACH ROW EXECUTE FUNCTION alma_set_weekly_class_limit();
    `).catch((e) => { console.error("weekly_class_limit trg error:", e.message); });
    // Backfill: re-deriva el tope de todas las filas existentes a partir del nombre.
    await pool.query(`
      UPDATE plans
         SET weekly_class_limit = CASE
               WHEN substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana') IS NULL
                 OR substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana') = ''
               THEN NULL
               ELSE (substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana'))::int
             END
       WHERE weekly_class_limit IS DISTINCT FROM CASE
               WHEN substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana') IS NULL
                 OR substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana') = ''
               THEN NULL
               ELSE (substring(lower(name) from '(\\d+)\\s+clases?\\s+por\\s+semana'))::int
             END
    `).catch((e) => { console.error("weekly_class_limit backfill error:", e.message); });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]'::jsonb`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS class_category VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_transferable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_non_repeatable BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS repeat_key VARCHAR(80)`).catch(() => { });
    // Paquete de visitas (1, 5, 10): marca el plan como vendible a invitadas
    // (no socias) desde POS, y habilita el flujo de cuestionario reutilizable.
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_visit_pack BOOLEAN DEFAULT false`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS opening_price DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS morning_only BOOLEAN DEFAULT false`).catch(() => { });
    // Paquetes MIXTOS: créditos dedicados a cada área (NULL = el plan no es mixto).
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS studio_credits INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS rt_credits INTEGER`).catch(() => { });
    // Tabla de perfiles de invitada/acompañante (no socia). El cuestionario
    // inicial vive aquí y se reusa al volver con el mismo teléfono.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS guest_profiles (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        host_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        display_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        date_of_birth DATE,
        has_injury BOOLEAN,
        injury_details TEXT,
        practiced_barre_before BOOLEAN,
        emergency_contact_name TEXT,
        emergency_contact_phone TEXT,
        accepted_waiver_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_guest_profiles_phone ON guest_profiles(phone) WHERE phone IS NOT NULL`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_guest_profiles_host ON guest_profiles(host_user_id)`).catch(() => { });
    // Booking puede ser PARA una acompañante (descuenta del pack de quien la trajo).
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_profile_id UUID REFERENCES guest_profiles(id) ON DELETE SET NULL`).catch(() => { });
    // Usuario "lite" con role='guest' vinculado a su guest_profile (1:1).
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_profile_id UUID REFERENCES guest_profiles(id)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_guest_profile_unique ON users(guest_profile_id) WHERE guest_profile_id IS NOT NULL`).catch(() => { });
    // ── Migrate class_types: 'Barre' es disciplina Studio ──
    // (En una base nueva la categoría la fija la siembra inicial de CATALOG_CLASS_TYPES; 'barre' ya no es
    //  una categoría válida según el CHECK class_types_category_check.)
    await pool.query(`
      UPDATE class_types SET category = 'studio' WHERE name = 'Barre';
    `).catch(() => { });
    // ── Migrate plans: 'mixto' class_category means both, keep as 'mixto' for logic ──
    // (mixto plans are still valid — the booking endpoint allows them on both categories)
    // ── Seed plans: el lineup inicial sólo se siembra si la tabla está vacía ──
    // Con filas existentes (los paquetes que el estudio captura en el panel) no
    // se desactiva ni se reescribe nada. Ver server/lib/catalogSeed.js.
    await seedPlansIfEmpty(pool, CATALOG_PLANS);
    // Planes de muestra/visita heredados eliminados: el catálogo inicial define
    // "Studio Intro" como única clase muestra y las clases únicas Studio /
    // Reformer-Tower como sesiones sueltas. Ver server/lib/catalog.js.
    // (Si la dueña requiere un pack de visitas/invitadas lo crea desde el admin
    //  con is_visit_pack=true.)
    // ── Products table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(150) NOT NULL,
        price      DECIMAL(10,2) DEFAULT 0,
        category   VARCHAR(50) DEFAULT 'accesorios',
        stock      INTEGER DEFAULT 0,
        sku        VARCHAR(100),
        is_active  BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Order items table ───────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id UUID REFERENCES products(id) ON DELETE SET NULL,
        quantity   INTEGER NOT NULL DEFAULT 1,
        unit_price DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    `);
    // ── Payment proofs table ────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_proofs (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        file_url    TEXT NOT NULL,
        file_name   VARCHAR(255),
        mime_type   VARCHAR(100),
        status      VARCHAR(30) NOT NULL DEFAULT 'pending',
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        reviewed_at TIMESTAMP WITH TIME ZONE,
        CONSTRAINT uq_payment_proofs_order UNIQUE (order_id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_proofs_order ON payment_proofs(order_id);
    `);
    // ── Instructors table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS instructors (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        display_name VARCHAR(150) NOT NULL,
        email        VARCHAR(255),
        phone        VARCHAR(30),
        bio          TEXT,
        specialties  TEXT,
        photo_url    TEXT,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_x SMALLINT DEFAULT 50`).catch(() => {});
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_focus_y SMALLINT DEFAULT 50`).catch(() => {});
    await pool.query(`ALTER TABLE instructors ADD COLUMN IF NOT EXISTS photo_url_2 TEXT`).catch(() => {});
    // Esquemas heredados (schema_complete.sql) dejaron instructors.user_id como
    // NOT NULL; el alta de coaches desde admin no envía user_id. Lo relajamos
    // para que POST /api/instructors funcione en cualquier base.
    await pool.query(`ALTER TABLE instructors ALTER COLUMN user_id DROP NOT NULL`).catch(() => {});
    // ── Reviews table ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
        rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment     TEXT,
        class_id    UUID,
        is_approved BOOLEAN DEFAULT false,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);
    `);
    // Ensure all review columns exist even if table was created by an older schema
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS user_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS rating SMALLINT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS overall_rating SMALLINT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS comment TEXT`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS class_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT false`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => {});
    await pool.query(`UPDATE reviews SET rating = COALESCE(rating, overall_rating, 5) WHERE rating IS NULL`).catch(() => {});
    await pool.query(`UPDATE reviews SET overall_rating = COALESCE(overall_rating, rating, 5) WHERE overall_rating IS NULL`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET DEFAULT 5`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET DEFAULT 5`).catch(() => {});
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => {});
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='reviews' AND column_name='overall_rating'
        ) AND NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'reviews_overall_rating_check'
            AND conrelid = 'reviews'::regclass
        ) THEN
          ALTER TABLE reviews ADD CONSTRAINT reviews_overall_rating_check CHECK (overall_rating BETWEEN 1 AND 5);
        END IF;
      END $$;
    `).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN rating SET NOT NULL`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ALTER COLUMN overall_rating SET NOT NULL`).catch(() => {});
    await pool.query(`
      CREATE OR REPLACE FUNCTION reviews_sync_overall_rating()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.overall_rating := COALESCE(NEW.overall_rating, NEW.rating, 5);
        NEW.rating := COALESCE(NEW.rating, NEW.overall_rating, 5);
        RETURN NEW;
      END;
      $$;
    `).catch(() => {});
    await pool.query(`DROP TRIGGER IF EXISTS trg_reviews_sync_overall_rating ON reviews`).catch(() => {});
    await pool.query(`
      CREATE TRIGGER trg_reviews_sync_overall_rating
      BEFORE INSERT OR UPDATE ON reviews
      FOR EACH ROW
      EXECUTE FUNCTION reviews_sync_overall_rating();
    `).catch(() => {});
    // Add booking_id, instructor_id, tag_ids columns to reviews if missing
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS booking_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS instructor_id UUID`).catch(() => {});
    await pool.query(`ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tag_ids UUID[] DEFAULT '{}'`).catch(() => {});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_reviews_booking ON reviews(booking_id)`).catch(() => {});
    await pool.query(`
      DELETE FROM reviews a
      USING reviews b
      WHERE a.booking_id IS NOT NULL
        AND a.booking_id = b.booking_id
        AND a.created_at < b.created_at
    `).catch(() => {});
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_booking_unique
      ON reviews(booking_id)
      WHERE booking_id IS NOT NULL
    `).catch((err) => {
      console.warn("[DB] Could not create unique review index on booking_id:", err?.message || err);
    });
    // ── Review-tag links (many-to-many) ────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tag_links (
        review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
        tag_id    UUID REFERENCES review_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (review_id, tag_id)
      );
    `).catch(() => {});
    // ── Loyalty transactions table ─────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_transactions (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        VARCHAR(10) NOT NULL CHECK (type IN ('earn','redeem','adjust')),
        points      INTEGER NOT NULL,
        description TEXT,
        created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user ON loyalty_transactions(user_id)`).catch(() => { });
    // ── referrals table (tracks which users were referred) ─────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        referral_code_id UUID REFERENCES referral_codes(id) ON DELETE CASCADE,
        referred_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        rewarded         BOOLEAN DEFAULT false,
        created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(referral_code_id)`).catch(() => { });
    // ── orders: add missing columns if needed ─────────────────────────────
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel VARCHAR(30) DEFAULT 'web'`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS plan_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS verified_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(20)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number) WHERE order_number IS NOT NULL`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_orders_discount_code_id ON orders(discount_code_id)`).catch(() => { });
    // Make plan_id nullable (POS orders don't always have a plan)
    await pool.query(`ALTER TABLE orders ALTER COLUMN plan_id DROP NOT NULL`).catch(() => { });
    // Make user_id nullable (walk-in POS sales may not have a user)
    await pool.query(`ALTER TABLE orders ALTER COLUMN user_id DROP NOT NULL`).catch(() => { });
    // ── Feature de videos RETIRADA: el estudio no tiene videoteca/clases grabadas.
    // Limpia tablas y columnas de raíz para que la BD quede sin restos. ─────────
    await pool.query(`ALTER TABLE plans DROP COLUMN IF EXISTS includes_video_library`).catch(() => { });
    await pool.query(`DROP TABLE IF EXISTS video_plans CASCADE`).catch(() => { });
    await pool.query(`DROP TABLE IF EXISTS video_access_grants CASCADE`).catch(() => { });
    await pool.query(`DROP TABLE IF EXISTS video_purchases CASCADE`).catch(() => { });
    await pool.query(`DROP TABLE IF EXISTS videos CASCADE`).catch(() => { });
    await pool.query(`DROP TABLE IF EXISTS homepage_video_cards CASCADE`).catch(() => { });
    // ── memberships: add order_id column ─────────────────────────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS order_id UUID`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_order ON memberships(order_id) WHERE order_id IS NOT NULL`).catch(() => { });
    // ── orders/memberships: columnas legacy del complemento (sin uso) ─────
    // La feature de complemento online fue retirada con la videoteca; las
    // columnas se conservan para compatibilidad pero ya no se escriben.
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS addon_plan_id UUID`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS addon_amount DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS is_addon BOOLEAN NOT NULL DEFAULT false`).catch(() => { });
    // ── memberships: add fallback name/limit override columns ─────────────
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS plan_name_override VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS class_limit_override INTEGER`).catch(() => { });
    // notes: observaciones del alta manual / complementos (lo usa POST /admin/clients/manual)
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS notes TEXT`).catch(() => { });
    // Fix existing 9999 unlimited sentinel values → NULL
    await pool.query(`
      UPDATE memberships SET classes_remaining = NULL WHERE classes_remaining >= 9999;
    `).catch(() => { });
    // ── memberships: track how many times a user has cancelled ────────────
    await pool.query(`
      ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellations_used INTEGER NOT NULL DEFAULT 0;
    `).catch(() => { });
    // ── users: contador de faltas (no-show o cancelación dentro de la ventana) ──
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS faltas_count INTEGER NOT NULL DEFAULT 0").catch(() => { });
    // ── Responsiva y consentimiento informado (se firma en la 1a reserva) ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waivers (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        full_name      VARCHAR(150),
        phone          VARCHAR(40),
        email          VARCHAR(150),
        image_consent  BOOLEAN DEFAULT false,
        signature_data TEXT,
        waiver_version VARCHAR(20) DEFAULT 'v1',
        signed_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_waivers_user ON waivers(user_id)`).catch(() => { });
    // (Bloque 3, auditoría 2026-09-27, P0-4: aquí corría en cada arranque una
    // "reconciliación" que igualaba cancellations_used al total de reservas
    // canceladas de la membresía. Contaba también las cancelaciones del estudio y
    // las salidas de la lista de espera, y deshacía los ajustes de recepción. El
    // contador lo mueven sólo la cancelación de la clienta y el ajuste con motivo.)
    // (homepage_video_cards retirada junto con la feature de videos — ver DROP arriba)
    // ── discount_codes: normalise discount_type values ────────────────────
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS min_order_amount DECIMAL(10,2) DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES plans(id) ON DELETE SET NULL`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS class_category VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'all'`).catch(() => { });
    await pool.query(`ALTER TABLE discount_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_plan ON discount_codes(plan_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_category ON discount_codes(class_category)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_discount_codes_channel ON discount_codes(channel)`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET discount_type = 'percent' WHERE discount_type IN ('percentage', 'porcentaje', '%')`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET channel = 'all' WHERE channel IS NULL OR channel = ''`).catch(() => { });
    await pool.query(`UPDATE discount_codes SET class_category = NULL WHERE class_category NOT IN ('all','studio','reformer_tower','mixto')`).catch(() => { });
    // ── bookings: add checked_in_at column ────────────────────────────────
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMP WITH TIME ZONE`).catch(() => { });

    // ── Limpieza de reservas ACTIVAS duplicadas (mismo user_id + class_id) ──
    // Necesario ANTES de crear el índice único: si ya existen duplicados, el
    // CREATE UNIQUE INDEX falla. Conserva la mejor fila (checked_in > confirmada
    // > más antigua), devuelve el crédito consumido por la duplicada y luego
    // recalcula el cupo (current_bookings) de las clases de hoy en adelante.
    await pool.query(`
      DO $$
      DECLARE v_removed INT := 0;
      BEGIN
        CREATE TEMP TABLE _dup_bookings ON COMMIT DROP AS
          SELECT id, membership_id, status
          FROM (
            SELECT id, membership_id, status,
                   ROW_NUMBER() OVER (
                     PARTITION BY user_id, class_id
                     ORDER BY CASE status WHEN 'checked_in' THEN 0 WHEN 'confirmed' THEN 1 ELSE 2 END,
                              created_at ASC, id ASC
                   ) AS rn
            FROM bookings
            WHERE user_id IS NOT NULL AND status NOT IN ('cancelled')
          ) t
          WHERE t.rn > 1;

        SELECT COUNT(*) INTO v_removed FROM _dup_bookings;
        IF v_removed = 0 THEN RETURN; END IF;

        UPDATE memberships m
           SET classes_remaining = classes_remaining + sub.cnt,
               updated_at = NOW()
          FROM (
            SELECT membership_id, COUNT(*) AS cnt
              FROM _dup_bookings
             WHERE membership_id IS NOT NULL
               AND status IN ('confirmed','checked_in')
             GROUP BY membership_id
          ) sub
         WHERE m.id = sub.membership_id
           AND m.classes_remaining IS NOT NULL
           AND m.classes_remaining < 9999;

        DELETE FROM bookings WHERE id IN (SELECT id FROM _dup_bookings);
        RAISE NOTICE '[dedup bookings] % reserva(s) duplicada(s) eliminada(s)', v_removed;
      END $$;
    `).catch((e) => console.warn("[dedup bookings]", e.message));

    // ── Paquetes MIXTOS: créditos por área (studio_remaining / rt_remaining) ──
    // Invariante: para una membresía mixta, classes_remaining (total) SIEMPRE
    // es igual a studio_remaining + rt_remaining. NULL en planes no-mixto.
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS studio_remaining INTEGER`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS rt_remaining INTEGER`).catch(() => { });
    // Trigger: al CREAR una membresía mixta reparte el total por el ratio del
    // plan (studio_credits : rt_credits). Cubre todos los endpoints de alta.
    await pool.query(`
      CREATE OR REPLACE FUNCTION alma_set_mixto_buckets() RETURNS trigger AS $$
      DECLARE pcat text; sc int; rc int; tot int; s int;
      BEGIN
        SELECT class_category, studio_credits, rt_credits
          INTO pcat, sc, rc FROM plans WHERE id = NEW.plan_id;
        IF pcat = 'mixto' AND COALESCE(sc,0) + COALESCE(rc,0) > 0
           AND NEW.studio_remaining IS NULL AND NEW.rt_remaining IS NULL THEN
          tot := COALESCE(NEW.classes_remaining, sc + rc);
          s := FLOOR(tot::numeric * sc / (sc + rc));
          NEW.studio_remaining := s;
          NEW.rt_remaining := tot - s;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `).catch((e) => console.error("mixto buckets fn error:", e.message));
    await pool.query(`
      DROP TRIGGER IF EXISTS alma_set_mixto_buckets_trg ON memberships;
      CREATE TRIGGER alma_set_mixto_buckets_trg
        BEFORE INSERT ON memberships
        FOR EACH ROW EXECUTE FUNCTION alma_set_mixto_buckets();
    `).catch((e) => console.error("mixto buckets trg error:", e.message));
    // Backfill idempotente de membresías mixtas ya existentes (corre DESPUÉS de
    // todas las reconciliaciones de crédito previas).
    await pool.query(`
      UPDATE memberships m
         SET studio_remaining = FLOOR(COALESCE(m.classes_remaining,0)::numeric * p.studio_credits / NULLIF(p.studio_credits + p.rt_credits,0)),
             rt_remaining     = COALESCE(m.classes_remaining,0) - FLOOR(COALESCE(m.classes_remaining,0)::numeric * p.studio_credits / NULLIF(p.studio_credits + p.rt_credits,0))
        FROM plans p
       WHERE m.plan_id = p.id
         AND p.class_category = 'mixto'
         AND m.studio_remaining IS NULL
         AND m.rt_remaining IS NULL
    `).catch((e) => console.error("mixto buckets backfill error:", e.message));

    await pool.query(`
      UPDATE classes c
         SET current_bookings = COALESCE((
           SELECT COUNT(*) FROM bookings b
            WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')
         ), 0)
       WHERE c.date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date
    `).catch(() => { });

    // Índice único para impedir reservas activas duplicadas (mismo user+clase).
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_user_class_active
      ON bookings (user_id, class_id)
      WHERE status NOT IN ('cancelled')
    `).catch(() => { });
    // Eliminar el constraint LEGACY 'unique_booking' (UNIQUE(class_id, user_id)
    // SIN filtrar por status) que venía del schema original de Supabase. Ese
    // constraint bloqueaba re-reservar la misma clase después de cancelar:
    // el INSERT chocaba con la fila cancelada previa, aunque la lógica del
    // negocio sí lo permite. El índice parcial idx_bookings_user_class_active
    // ya cubre la regla correcta (solo bookings activas son únicas).
    await pool.query(`ALTER TABLE bookings DROP CONSTRAINT IF EXISTS unique_booking`).catch(() => { });
    // ── Risk scoring + wallet update queue (infra de retención y sincronía de pases) ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS risk_scores (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        computed_for_date DATE NOT NULL DEFAULT CURRENT_DATE,
        score             NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
        risk_level        VARCHAR(20) NOT NULL CHECK (risk_level IN ('low','medium','high')),
        signals           JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, computed_for_date)
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_risk_scores_user_date ON risk_scores(user_id, computed_for_date DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_risk_scores_level ON risk_scores(risk_level)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_update_queue (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
        reason       VARCHAR(80) NOT NULL DEFAULT 'ring_state_change',
        status       VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
        attempts     INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        detail       JSONB NOT NULL DEFAULT '{}'::jsonb,
        available_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP WITH TIME ZONE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_status ON wallet_update_queue(status, available_at)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_update_queue_user ON wallet_update_queue(user_id)`).catch(() => { });
    // ── Settings table ─────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        key        VARCHAR(100) PRIMARY KEY,
        value      JSONB NOT NULL DEFAULT '{}',
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Cupo por disciplina: lo fija el seed de class_types (Reformer/Tower = 4,
    // Studio = 8). El admin puede editar el cupo por clase libremente.
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["general_settings", JSON.stringify(DEFAULT_GENERAL_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["policies_settings", JSON.stringify(DEFAULT_POLICIES_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_settings", JSON.stringify(DEFAULT_NOTIFICATION_SETTINGS)],
    ).catch(() => { });
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      ["notification_templates", JSON.stringify(DEFAULT_NOTIFICATION_TEMPLATES)],
    ).catch(() => { });
    for (const [settingKey, defaults] of Object.entries(DEFAULT_SETTINGS_BY_KEY)) {
      await pool.query(
        `UPDATE settings
            SET value = $2::jsonb || COALESCE(value, '{}'::jsonb),
                updated_at = NOW()
          WHERE key = $1 AND jsonb_typeof(value) = 'object'`,
        [settingKey, JSON.stringify(defaults)],
      ).catch(() => { });
    }
    // ── Seed inicial: teléfono de la dueña como destinatario de notificaciones
    //    admin (nueva reserva, etc.). Solo corre UNA vez (marker en settings);
    //    si la admin lo borra después desde la UI, NO lo restauramos.
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM settings WHERE key = 'admin_phones_seed_v1') THEN
          UPDATE settings
             SET value = jsonb_set(
               COALESCE(value, '{}'::jsonb),
               '{admin_phones}',
               COALESCE(value->'admin_phones', '[]'::jsonb) || '["+524445082461"]'::jsonb,
               true
             ),
                 updated_at = NOW()
           WHERE key = 'notification_settings'
             AND NOT (COALESCE(value->'admin_phones', '[]'::jsonb) @> '["+524445082461"]'::jsonb);
          INSERT INTO settings (key, value)
            VALUES ('admin_phones_seed_v1', jsonb_build_object('seeded_at', to_jsonb(NOW())))
            ON CONFLICT (key) DO NOTHING;
        END IF;
      END $$;
    `).catch(() => { });
    // ── Loyalty rewards table ──────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_rewards (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name         VARCHAR(150) NOT NULL,
        description  TEXT,
        points_cost  INTEGER NOT NULL,
        reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom',
        reward_value VARCHAR(150),
        stock        INTEGER,
        is_active    BOOLEAN DEFAULT true,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // ── Loyalty rewards: add new columns if table already exists ───────────
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_type  VARCHAR(30) NOT NULL DEFAULT 'custom'`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS reward_value VARCHAR(150)`).catch(() => { });
    await pool.query(`ALTER TABLE loyalty_rewards ADD COLUMN IF NOT EXISTS stock        INTEGER`).catch(() => { });
    // ── Apple Wallet device registration table ────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS apple_wallet_devices (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        device_id      VARCHAR(255) NOT NULL,
        push_token     VARCHAR(255) NOT NULL DEFAULT '',
        pass_type_id   VARCHAR(255) NOT NULL,
        serial_number  VARCHAR(255) NOT NULL,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(device_id, pass_type_id, serial_number)
      );
    `).catch(() => { });
    // Backward compatibility: some DBs still have the old wallet schema
    // (device_id, pass_type_id, membership_id) without serial_number.
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS serial_number VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS pass_type_id VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ADD COLUMN IF NOT EXISTS push_token VARCHAR(255) NOT NULL DEFAULT ''`).catch(() => { });
    await pool.query(`
      UPDATE apple_wallet_devices
      SET serial_number = CONCAT(
        'legacy_',
        REPLACE(COALESCE(membership_id::text, id::text), '-', '')
      )
      WHERE serial_number IS NULL OR serial_number = ''
    `).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN serial_number SET NOT NULL`).catch(() => { });
    await pool.query(`ALTER TABLE apple_wallet_devices ALTER COLUMN membership_id DROP NOT NULL`).catch(() => { });
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_apple_wallet_devices_device_pass_serial
      ON apple_wallet_devices(device_id, pass_type_id, serial_number)
    `).catch(() => { });
    // ── Wallet push notifications log ─────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_notification_logs (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
        reason         VARCHAR(160) NOT NULL DEFAULT 'wallet_update',
        apple_sent     INTEGER NOT NULL DEFAULT 0,
        apple_failed   INTEGER NOT NULL DEFAULT 0,
        google_synced  BOOLEAN NOT NULL DEFAULT false,
        google_mode    VARCHAR(40),
        status         VARCHAR(20) NOT NULL DEFAULT 'ok',
        detail         JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at     TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_user ON wallet_notification_logs(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wallet_notification_logs_created_at ON wallet_notification_logs(created_at DESC)`).catch(() => { });
    // ── Motivation sends (dedupe ≤1/día y registro de qué milestone ya disparó) ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS motivation_sends (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        template_key VARCHAR(80) NOT NULL,
        sent_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        sent_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, sent_date)
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_motivation_sends_user_template ON motivation_sends(user_id, template_key)`).catch(() => { });
    // ── Loyalty milestones (recompensas auto al hit de N clases) ─────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_milestones (
        id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name                 VARCHAR(120) NOT NULL,
        description          TEXT,
        classes_required     INTEGER NOT NULL CHECK (classes_required > 0),
        period               VARCHAR(20) NOT NULL DEFAULT 'lifetime'
                             CHECK (period IN ('lifetime', 'month', 'year')),
        award_type           VARCHAR(20) NOT NULL DEFAULT 'points'
                             CHECK (award_type IN ('points', 'reward')),
        award_points         INTEGER DEFAULT 0,
        award_reward_id      UUID REFERENCES loyalty_rewards(id) ON DELETE SET NULL,
        message_template_key VARCHAR(80),
        is_active            BOOLEAN DEFAULT true,
        sort_order           INTEGER DEFAULT 0,
        created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(classes_required, period)
      );
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS loyalty_milestone_awards (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        milestone_id      UUID NOT NULL REFERENCES loyalty_milestones(id) ON DELETE CASCADE,
        classes_at_award  INTEGER NOT NULL,
        awarded_at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, milestone_id)
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_loyalty_milestone_awards_user ON loyalty_milestone_awards(user_id)`).catch(() => { });
    // ── Campaigns (broadcast manual de promos por segmento) ──────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name            VARCHAR(160) NOT NULL,
        segment         VARCHAR(60) NOT NULL,
        message         TEXT,
        template_key    VARCHAR(80),
        template_vars   JSONB DEFAULT '{}'::jsonb,
        total_targets   INTEGER NOT NULL DEFAULT 0,
        total_sent      INTEGER NOT NULL DEFAULT 0,
        total_failed    INTEGER NOT NULL DEFAULT 0,
        total_skipped   INTEGER NOT NULL DEFAULT 0,
        status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                        CHECK (status IN ('queued', 'sending', 'completed', 'failed')),
        created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        completed_at    TIMESTAMP WITH TIME ZONE
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaign_logs (
        id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
        phone        VARCHAR(40),
        status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'sent', 'skipped', 'failed')),
        reason       VARCHAR(80),
        rendered     TEXT,
        sent_at      TIMESTAMP WITH TIME ZONE,
        created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign ON campaign_logs(campaign_id, status)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_campaign_logs_user ON campaign_logs(user_id)`).catch(() => { });
    // Seed default HIVE milestones si la tabla está vacía (LOYALTY_MILESTONES_SEED
    // en server/lib/passDefaults.js — ver server/lib/brandResidue.test.js).
    const lmCount = await pool.query("SELECT COUNT(*)::int AS n FROM loyalty_milestones");
    if (lmCount.rows[0].n === 0) {
      for (const m of LOYALTY_MILESTONES_SEED) {
        await pool.query(
          `INSERT INTO loyalty_milestones (name, description, classes_required, period, award_type, award_points, message_template_key, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT DO NOTHING`,
          [m.name, m.description, m.classesRequired, m.period, m.awardType, m.awardPoints, m.messageTemplateKey, m.sortOrder],
        ).catch(() => { });
      }
    }
    // ── Review tags table ──────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS review_tags (
        id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name       VARCHAR(100) NOT NULL,
        color      VARCHAR(20) DEFAULT '#c026d3',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // (Tablas videos/video_purchases retiradas — ver DROP en la migración de arriba)

    // ── Módulo de Eventos ────────────────────────────────────────────────
    await pool.query(`
      DO $$ BEGIN
        CREATE TYPE event_type AS ENUM (
          'masterclass','workshop','retreat','challenge','openhouse','special'
        );
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        type                event_type NOT NULL,
        title               VARCHAR(200) NOT NULL,
        description         TEXT NOT NULL,
        instructor_name     VARCHAR(100) NOT NULL,
        instructor_photo    TEXT,
        date                DATE NOT NULL,
        start_time          TIME NOT NULL,
        end_time            TIME NOT NULL,
        location            VARCHAR(200) NOT NULL,
        capacity            INTEGER NOT NULL DEFAULT 1,
        registered          INTEGER DEFAULT 0,
        price               NUMERIC(10,2) NOT NULL DEFAULT 0,
        currency            VARCHAR(3) DEFAULT 'MXN',
        early_bird_price    NUMERIC(10,2),
        early_bird_deadline DATE,
        member_discount     NUMERIC(5,2) DEFAULT 0,
        image               TEXT,
        requirements        VARCHAR(500) DEFAULT '',
        includes            JSONB DEFAULT '[]',
        tags                JSONB DEFAULT '[]',
        status              VARCHAR(20) DEFAULT 'draft',
        created_by          UUID,
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_registrations (
        id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id                 UUID,
        name                    VARCHAR(100) NOT NULL,
        email                   VARCHAR(255) NOT NULL,
        phone                   VARCHAR(20) DEFAULT '',
        status                  VARCHAR(20) DEFAULT 'pending',
        amount                  NUMERIC(10,2) DEFAULT 0,
        payment_method          VARCHAR(20),
        payment_reference       VARCHAR(200),
        payment_proof_url       TEXT,
        payment_proof_file_name VARCHAR(255),
        transfer_date           DATE,
        paid_at                 TIMESTAMPTZ,
        checked_in              BOOLEAN DEFAULT false,
        checked_in_at           TIMESTAMPTZ,
        checked_in_by           UUID,
        waitlist_position       INTEGER,
        notes                   TEXT,
        created_at              TIMESTAMPTZ DEFAULT NOW(),
        updated_at              TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_status    ON events(status)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_date       ON events(date)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_type       ON events(type)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_event  ON event_registrations(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_user   ON event_registrations(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_regs_status ON event_registrations(status)`).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_passes (
        id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        registration_id UUID REFERENCES event_registrations(id) ON DELETE SET NULL,
        user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        pass_code      VARCHAR(60) NOT NULL UNIQUE,
        status         VARCHAR(20) NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','used','cancelled')),
        issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        used_at        TIMESTAMPTZ,
        cancelled_at   TIMESTAMPTZ,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_user ON event_passes(user_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_event ON event_passes(event_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_event_passes_status ON event_passes(status)`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_passes_registration_unique ON event_passes(registration_id) WHERE registration_id IS NOT NULL`).catch(() => { });

    // ── Stripe ──────────────────────────────────────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`).catch(() => { });
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_session_id        TEXT,
        ADD COLUMN IF NOT EXISTS stripe_checkout_url      TEXT,
        ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_payment_status    TEXT,
        ADD COLUMN IF NOT EXISTS payment_provider         TEXT DEFAULT 'internal'
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id     TEXT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => { });

    // ── Wellhub / partner channels ──────────────────────────────────────────
    await pool.query(`CREATE TABLE IF NOT EXISTS platform_credentials (
      channel        VARCHAR(20) PRIMARY KEY,
      environment    VARCHAR(20) NOT NULL DEFAULT 'production',
      is_enabled     BOOLEAN NOT NULL DEFAULT false,
      gym_id         TEXT,
      webhook_secret TEXT,
      access_token   TEXT,
      api_base_url   TEXT, booking_base_url TEXT, access_base_url TEXT,
      webhook_url    TEXT,
      extra_config   JSONB DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      updated_at     TIMESTAMPTZ DEFAULT NOW()
    )`).catch((e) => console.warn("[schema] platform_credentials:", e.message));

    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'app'`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_ref TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_metadata JSONB DEFAULT '{}'::jsonb`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_status TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_reported_at TIMESTAMPTZ`).catch(() => { });
    // Responsiva con motivo — recepción puede asignar sin firma si deja constancia
    // (auditoría 2026-09-27, bloque 1, tarea 5).
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_channel_ref
      ON bookings(channel, external_ref) WHERE channel <> 'app' AND external_ref IS NOT NULL`).catch(() => { });

    await pool.query(`CREATE TABLE IF NOT EXISTS channel_inventory (
      class_id UUID NOT NULL, channel VARCHAR(20) NOT NULL,
      max_spots INT NOT NULL DEFAULT 0, booked_spots INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (class_id, channel)
    )`).catch((e) => console.warn("[schema] channel_inventory:", e.message));

    await pool.query(`CREATE TABLE IF NOT EXISTS partner_class_mappings (
      class_id UUID NOT NULL, channel VARCHAR(20) NOT NULL,
      external_class_id TEXT, external_slot_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (class_id, channel)
    )`).catch((e) => console.warn("[schema] partner_class_mappings:", e.message));

    await pool.query(`CREATE TABLE IF NOT EXISTS partner_checkins (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      booking_id UUID, user_id UUID, channel VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      method VARCHAR(20) NOT NULL DEFAULT 'automated',
      validated_at TIMESTAMPTZ, external_response JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch((e) => console.warn("[schema] partner_checkins:", e.message));

    await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (
      event_id TEXT PRIMARY KEY, channel VARCHAR(20), created_at TIMESTAMPTZ DEFAULT NOW()
    )`).catch((e) => console.warn("[schema] processed_events:", e.message));

    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wellhub_id TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_plan TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS source TEXT`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_wellhub_id ON users(wellhub_id)`).catch(() => { });

    // Trigger: booked_spots por canal = COUNT real de bookings activas (el código nunca lo toca a mano).
    await pool.query(`CREATE OR REPLACE FUNCTION fn_update_channel_inventory() RETURNS TRIGGER AS $$
      DECLARE cid UUID; ch VARCHAR(20);
      BEGIN
        cid := COALESCE(NEW.class_id, OLD.class_id); ch := COALESCE(NEW.channel, OLD.channel);
        IF ch IS NULL OR ch = 'app' THEN RETURN NULL; END IF;
        UPDATE channel_inventory SET booked_spots = (
          SELECT COUNT(*) FROM bookings b WHERE b.class_id = cid AND b.channel = ch
            AND b.status NOT IN ('cancelled','no_show')
        ), updated_at = NOW() WHERE class_id = cid AND channel = ch;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql`).catch((e) => console.warn("[schema] inv fn:", e.message));
    await pool.query(`DROP TRIGGER IF EXISTS trg_channel_inventory ON bookings`).catch(() => { });
    await pool.query(`CREATE TRIGGER trg_channel_inventory AFTER INSERT OR UPDATE OR DELETE ON bookings
      FOR EACH ROW EXECUTE FUNCTION fn_update_channel_inventory()`).catch((e) => console.warn("[schema] inv trg:", e.message));

    // ── Bitácora de acciones del personal (auditoría 2026-09-27, bloque 2) ──
    // Sin llaves foráneas a propósito: la bitácora sobrevive a la persona y a la
    // fila que describe. Nada de esto cambia datos existentes.
    await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor_id        UUID,
      actor_role      VARCHAR(30),
      actor_name      TEXT,
      action          VARCHAR(60) NOT NULL,
      entity_type     VARCHAR(30) NOT NULL,
      entity_id       UUID,
      subject_user_id UUID,
      reason          TEXT,
      before          JSONB,
      after           JSONB,
      meta            JSONB NOT NULL DEFAULT '{}'::jsonb
    )`).catch((e) => console.warn("[schema] audit_log:", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON audit_log(subject_user_id, created_at DESC)`).catch(() => { });
    // Columnas que escribe el bloque 2. Algunas existen en schema_complete.sql,
    // pero no hay garantía de que producción las tenga.
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS activated_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID`).catch(() => { });
    // La falta que registró ESTA reserva (para poder corregirla el mismo día).
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS falta_recorded_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancelled_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_by UUID`).catch(() => { });

    // ── Bloque 3 de la auditoría (2026-09-27): lista de espera, reembolsos,
    // planes archivados y consentimiento de datos de salud. Sólo CREATE / ADD
    // COLUMN / CREATE INDEX: nada de esto cambia datos existentes.
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_class_waitlist
      ON bookings(class_id, created_at, id) WHERE status = 'waitlist'`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`).catch(() => { });
    // Reembolsos registrados por la dueña. Sin llaves foráneas, como audit_log:
    // el registro sobrevive a la fila que describe.
    await pool.query(`CREATE TABLE IF NOT EXISTS refunds (
      id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      order_id             UUID NOT NULL,
      membership_id        UUID,
      user_id              UUID,
      amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      kind                 VARCHAR(10) NOT NULL CHECK (kind IN ('total', 'partial')),
      method               VARCHAR(20) NOT NULL,
      reference            VARCHAR(100),
      reason               TEXT NOT NULL,
      classes_removed      INTEGER NOT NULL DEFAULT 0,
      membership_cancelled BOOLEAN NOT NULL DEFAULT false,
      bookings_cancelled   INTEGER NOT NULL DEFAULT 0,
      created_by           UUID
    )`).catch((e) => console.warn("[schema] refunds:", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at DESC)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS archived_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_version VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_at TIMESTAMPTZ`).catch(() => { });

    console.log("✅ Schema ensured");
  } catch (err) {
    console.error("Schema migration warning:", err.message);
  }

  // ── Stripe config (only if key is set; allows running without Stripe in dev) ──
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      validateStripeConfig();
      console.log("[Stripe] Config validated OK");
    } catch (stripeConfigErr) {
      console.error("[Stripe] Config error:", stripeConfigErr.message);
      process.exit(1);
    }
  }

  // ── Seed demo classes for the next 4 weeks (only if classes table is empty) ──
  // No se siembran instructoras demo: el estudio carga las reales desde el admin.
  // Sin instructoras activas este bloque no genera clases (no-op), por diseño.
  try {
    const classCount = await pool.query("SELECT COUNT(*) FROM classes");
    if (parseInt(classCount.rows[0].count) === 0) {
      // Fetch real class_type ids and instructor ids from DB
      const typesRes = await pool.query(
        "SELECT id, name FROM class_types WHERE is_active = true ORDER BY sort_order ASC LIMIT 8"
      );
      const instRes = await pool.query(
        "SELECT id FROM instructors WHERE is_active = true ORDER BY created_at ASC LIMIT 4"
      );

      if (typesRes.rows.length > 0 && instRes.rows.length > 0) {
        const types = typesRes.rows;       // [{id, name}, ...]
        const insts = instRes.rows;        // [{id}, ...]
        const getType = (i) => types[i % types.length].id;
        const getInst = (i) => insts[i % insts.length].id;

        // Build classes for Mon–Sat for the next 4 weeks
        const today = new Date();
        // Find Monday of current week
        const dayOfWeek = today.getDay(); // 0=Sun
        const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMon);

        // Time slots: morning + evening
        const SLOTS = [
          { hour: 7, min: 0, dur: 55 },
          { hour: 9, min: 0, dur: 55 },
          { hour: 11, min: 0, dur: 60 },
          { hour: 18, min: 0, dur: 55 },
          { hour: 19, min: 30, dur: 55 },
        ];
        // Days: Mon(1)–Sat(6), no Sunday
        const DAYS = [0, 1, 2, 3, 4, 5]; // offset from monday

        let typeIdx = 0;
        let instIdx = 0;
        const inserts = [];

        for (let week = 0; week < 4; week++) {
          for (const dayOffset of DAYS) {
            const date = new Date(monday);
            date.setDate(monday.getDate() + week * 7 + dayOffset);
            const dateStr = date.toISOString().slice(0, 10); // YYYY-MM-DD

            // Not every slot on every day — skip some to feel realistic
            const slotsToday = SLOTS.filter((_, si) => {
              // Weekends (Sat = offset 5) only morning slots
              if (dayOffset === 5 && si > 2) return false;
              // Some variety: skip slot if typeIdx+dayOffset+si is divisible by 7
              if ((typeIdx + dayOffset + si) % 7 === 0) return false;
              return true;
            });

            for (const slot of slotsToday) {
              const startH = String(slot.hour).padStart(2, "0");
              const startM = String(slot.min).padStart(2, "0");
              const totalMin = slot.hour * 60 + slot.min + slot.dur;
              const endH = String(Math.floor(totalMin / 60)).padStart(2, "0");
              const endM = String(totalMin % 60).padStart(2, "0");
              inserts.push({
                classTypeId: getType(typeIdx),
                instructorId: getInst(instIdx),
                date: dateStr,
                startTime: `${startH}:${startM}`,
                endTime: `${endH}:${endM}`,
                maxCapacity: 5,
              });
              typeIdx++;
              instIdx++;
            }
          }
        }

        for (const c of inserts) {
          await pool.query(
            `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
             VALUES ($1,$2,$3,$4,$5,$6,'scheduled') ON CONFLICT DO NOTHING`,
            [c.classTypeId, c.instructorId, c.date, c.startTime, c.endTime, c.maxCapacity]
          );
        }
        console.log(`✅ Seeded ${inserts.length} demo classes for the next 4 weeks`);
      }
    }
  } catch (err) {
    console.error("Demo classes seed warning:", err.message);
  }


  try {
    // Alta del admin SÓLO si no existe. Antes esto hacía
    // "ON CONFLICT DO UPDATE SET password_hash", así que cada reinicio
    // revertía la contraseña de la dueña al valor por defecto — y ese valor
    // estaba escrito aquí, en un repositorio git. Auditoría 2026-09-08, P0-4.
    const adminEmail = process.env.ADMIN_EMAIL || "admin@almamovement.mx";
    const adminPassword = process.env.ADMIN_PASSWORD;
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [adminEmail]);
    if (existing.rows.length) {
      // Nunca se toca la contraseña de una cuenta que ya existe.
      await pool.query("UPDATE users SET role = 'admin' WHERE email = $1 AND role <> 'admin'", [adminEmail]);
      console.log(`✅ Admin user ready: ${adminEmail}`);
    } else if (!adminPassword) {
      console.warn(
        `⚠️  No existe ${adminEmail} y no se definió ADMIN_PASSWORD. ` +
        `Define ADMIN_PASSWORD para crear la cuenta de administración.`
      );
    } else if (!isStrongPassword(adminPassword)) {
      console.warn("⚠️  ADMIN_PASSWORD es débil (mínimo 8 caracteres, una mayúscula y un número). No se creó la cuenta.");
    } else {
      const adminHash = await bcrypt.hash(adminPassword, 12);
      await pool.query(
        `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, accepts_communications)
         VALUES ('Admin HIVE', $2, '0000000000', $1, 'admin', true, false)
         ON CONFLICT (email) DO NOTHING`,
        [adminHash, adminEmail]
      );
      console.log(`✅ Admin user created: ${adminEmail}`);
    }
  } catch (err) {
    console.error("Admin seed warning:", err.message);
  }
}

// ─── Middleware ──────────────────────────────────────────────────────────────
const CORS_ALLOWED_ORIGINS = String(
  process.env.CORS_ALLOWED_ORIGINS ||
  [
    "https://alma-movement.com.mx",
    "https://www.alma-movement.com.mx",
    "https://almamovement.com.mx",
    "https://www.almamovement.com.mx",
    "https://alma-movement-production.up.railway.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
  ].join(","),
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const SECURITY_RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.API_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_RATE_LIMIT_MAX = Math.max(30, Number(process.env.API_RATE_LIMIT_MAX || 180));
const SECURITY_AUTH_WINDOW_MS = Math.max(10_000, Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 60_000));
const SECURITY_AUTH_MAX = Math.max(5, Number(process.env.AUTH_RATE_LIMIT_MAX || 20));

app.disable("x-powered-by");
app.use(cors({
  origin: (origin, callback) => {
    // Allow non-browser / same-origin server requests (no Origin header).
    if (!origin) return callback(null, true);
    if (CORS_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Origen no listado: NO lanzar Error (eso se convertía en 500 con HTML y
    // rompía la carga de /assets cuando el navegador los pide con crossorigin).
    // En su lugar respondemos sin headers CORS — la petición sigue su curso y
    // los archivos estáticos se sirven igual. Las rutas /api con credenciales
    // seguirán protegidas por authMiddleware.
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  // camera=(self) habilita la cámara para el mismo origen (escáner QR del
  // check-in). Sin esto, getUserMedia rechaza con NotAllowedError aunque el
  // usuario tenga el permiso del navegador y del SO concedidos.
  // microphone y geolocation siguen bloqueados (no se usan en la app).
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(self)");
  next();
});

const rateLimitBuckets = new Map();
function getRateLimitIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  if (forwarded) return forwarded;
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}
function createSimpleRateLimiter({ windowMs, max, keyPrefix, shouldApply, keyFn }) {
  return (req, res, next) => {
    if (!shouldApply(req)) return next();
    const id = keyFn ? keyFn(req) : getRateLimitIp(req);
    const key = `${keyPrefix}:${id}`;
    const limit = typeof max === "function" ? max(id) : max;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." });
    }
    current.count += 1;
    return next();
  };
}
// Best-effort in-memory cleanup to avoid unbounded map growth.
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitBuckets.entries()) {
    if (!value || value.resetAt <= now) rateLimitBuckets.delete(key);
  }
}, 60_000).unref();

const SECURITY_RATE_LIMIT_USER_MAX = Math.max(60, Number(process.env.API_RATE_LIMIT_USER_MAX || 600));
app.use(createSimpleRateLimiter({
  windowMs: SECURITY_RATE_LIMIT_WINDOW_MS,
  keyPrefix: "api",
  keyFn: (req) => rateKey(req, (t) => jwt.verify(t, JWT_SECRET)),
  max: (key) => (key.startsWith("user:") ? SECURITY_RATE_LIMIT_USER_MAX : SECURITY_RATE_LIMIT_MAX),
  shouldApply: (req) =>
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/wallet/v1/") &&
    req.path !== "/api/webhook/evolution",
}));
app.use(createSimpleRateLimiter({
  windowMs: SECURITY_AUTH_WINDOW_MS,
  max: SECURITY_AUTH_MAX,
  keyPrefix: "auth",
  shouldApply: (req) =>
    req.path === "/api/auth/login" ||
    req.path === "/api/auth/register" ||
    req.path === "/api/auth/forgot-password" ||
    req.path === "/api/auth/reset-password",
}));

// Skip JSON body parsing for binary upload-chunk endpoint
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  if (req.path === "/api/stripe/webhook") return next();
  if (req.path.startsWith("/webhooks/wellhub")) return next();
  express.json({ limit: "20mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  if (req.path === "/api/stripe/webhook") return next();
  if (req.path.startsWith("/webhooks/wellhub")) return next();
  express.urlencoded({ extended: true, limit: "20mb" })(req, res, next);
});

// ─── Validación de parámetros de ruta ────────────────────────────────────────
// Un id mal formado (uuid basura, fecha imposible, número negativo) llegaba
// crudo a Postgres y salía como 500 "Error interno" desde el catch de cada
// handler. Son ~236 respuestas 500 con un solo origen: falta de validación.
// Estos nombres SÍ mapean a columnas uuid; :key, :fileId, :sessionId,
// :deviceId, :passTypeId y :serial no, y por eso quedan fuera.
// Auditoría 2026-09-08, familia P2.
for (const paramName of ["id", "userId", "eventId", "classId", "regId"]) {
  app.param(paramName, (req, res, next, value) => {
    if (!isUuid(String(value || ""))) {
      return res.status(400).json({ message: "Identificador inválido" });
    }
    next();
  });
}

// ─── Wellhub / partner webhooks (raw body, firma HMAC-SHA1, idempotencia) ────
async function wellhubWebhookHandler(req, res, eventTypeOverride) {
  const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? ""));
  let payload;
  try { payload = JSON.parse(rawBuf.toString("utf8")); }
  catch { return res.status(400).json({ message: "JSON inválido" }); }

  const creds = await getWellhubCredentials(pool).catch(() => null);
  if (!creds || !creds.is_enabled) return res.status(503).json({ message: "Wellhub no habilitado" });

  const sig = extractSignatureHeader(req.headers);
  const verdict = verifyWellhubSignature(rawBuf, sig, creds.webhook_secret);
  if (verdict === false) return res.status(401).json({ message: "Firma Wellhub inválida" });
  if (verdict === null) {
    console.warn("[wellhub] webhook rechazado: la integración está encendida sin webhook_secret");
    return res.status(401).json({ message: "Wellhub sin secreto configurado" });
  }

  const gymId = extractGymId(payload);
  if (gymId && creds.gym_id && String(gymId) !== String(creds.gym_id)) {
    return res.status(200).json({ status: "ignored", reason: "gym_mismatch" });
  }

  const eventType = eventTypeOverride || payload.event_type || payload.type;
  const eventId = computeEventId(eventType, payload);
  try {
    const r = await pool.query(
      "INSERT INTO processed_events (event_id, channel) VALUES ($1,'wellhub') ON CONFLICT (event_id) DO NOTHING RETURNING event_id",
      [eventId],
    );
    if (!r.rows.length) return res.status(200).json({ status: "already_processed" });
  } catch (e) { console.warn("[wellhub] idempotency:", e.message); }

  try {
    let result;
    switch (eventType) {
      case "booking-requested": result = await handleBookingRequested(pool, creds, payload); break;
      case "checkin":
      case "checkin-booking-occurred": result = await handleCheckin(pool, creds, payload); break;
      case "booking-canceled": result = await handleCancel(pool, creds, payload, { late: false }); break;
      case "booking-late-canceled": result = await handleCancel(pool, creds, payload, { late: true }); break;
      case "change":
      case "cancel": result = await handlePlanChange(pool, creds, payload); break;
      default: result = { status: "ignored", eventType };
    }
    // Lo que liberó lugar sube la lista de espera (auditoría 2026-09-27, P1-1).
    // Los ids de clase no van en la respuesta a Wellhub. Se responde ANTES de
    // la subida: sus avisos pueden tardar varios segundos (sonda de WhatsApp) y
    // Wellhub reintentaría el evento por timeout. El evento ya quedó en
    // processed_events, así que un reintento no repite nada; la subida corre
    // después y sus errores sólo van al log.
    const { classIds, ...body } = result ?? {};
    res.status(200).json(body);
    if (Array.isArray(classIds) && classIds.length) {
      onSeatReleased(classIds, { source: "wellhub" })
        .catch((e) => console.error("[wellhub] subida de la lista de espera:", e?.message));
    }
    return;
  } catch (err) {
    console.error("[wellhub] handler error:", err.message);
    await pool.query("DELETE FROM processed_events WHERE event_id=$1", [eventId]).catch(() => {});
    return res.status(500).json({ message: "Error interno" });
  }
}

app.post("/webhooks/wellhub", express.raw({ type: "*/*" }), (req, res) => wellhubWebhookHandler(req, res));
app.post("/webhooks/wellhub/checkin", express.raw({ type: "*/*" }), (req, res) => wellhubWebhookHandler(req, res, "checkin"));
app.post("/webhooks/wellhub/cancel", express.raw({ type: "*/*" }), (req, res) => wellhubWebhookHandler(req, res, "cancel"));
app.post("/webhooks/wellhub/change", express.raw({ type: "*/*" }), (req, res) => wellhubWebhookHandler(req, res, "change"));
app.post("/webhooks/wellhub/debug/echo", express.raw({ type: "*/*" }), (req, res) => {
  let body = null;
  try { body = JSON.parse(req.body.toString("utf8")); } catch { body = req.body?.toString?.("utf8") ?? null; }
  return res.status(200).json({ ok: true, headers: req.headers, body });
});

// ─── Wellhub / partner management (admin) ───────────────────────────────────
app.get("/api/partners/settings", ownerMiddleware, async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM platform_credentials WHERE channel='wellhub'");
    return res.json({ data: publicPartnerSettings(r.rows[0] || null) });
  } catch (err) { console.error("[partners settings GET]", err.message); return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/partners/settings", ownerMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const cur = (await pool.query("SELECT webhook_secret, access_token FROM platform_credentials WHERE channel='wellhub'")).rows[0] || {};
    const webhookSecret = mergeSecret(b.webhook_secret, cur.webhook_secret);
    const accessToken = mergeSecret(b.access_token, cur.access_token);
    await pool.query(
      `INSERT INTO platform_credentials (channel, environment, is_enabled, gym_id, webhook_secret, access_token, api_base_url, booking_base_url, access_base_url, webhook_url, extra_config, updated_at)
       VALUES ('wellhub', $1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
       ON CONFLICT (channel) DO UPDATE SET
         environment=EXCLUDED.environment, is_enabled=EXCLUDED.is_enabled, gym_id=EXCLUDED.gym_id,
         webhook_secret=EXCLUDED.webhook_secret, access_token=EXCLUDED.access_token,
         api_base_url=EXCLUDED.api_base_url, booking_base_url=EXCLUDED.booking_base_url,
         access_base_url=EXCLUDED.access_base_url, webhook_url=EXCLUDED.webhook_url,
         extra_config=EXCLUDED.extra_config, updated_at=NOW()`,
      [b.environment || "production", b.is_enabled ?? false, b.gym_id || null, webhookSecret,
       accessToken, b.api_base_url || null, b.booking_base_url || null, b.access_base_url || null,
       b.webhook_url || null, JSON.stringify(b.extra_config || {})],
    );
    const r = await pool.query("SELECT * FROM platform_credentials WHERE channel='wellhub'");
    return res.json({ data: publicPartnerSettings(r.rows[0]) });
  } catch (err) { console.error("[partners settings PUT]", err.message); return res.status(500).json({ message: "Error interno" }); }
});

// Publicar clases a Wellhub, sus check-ins y su resumen: sólo la dueña (auditoría 2026-09-27, P1-9).
app.post("/api/partners/wellhub/publish/:classId", ownerMiddleware, async (req, res) => {
  try {
    const { classId } = req.params;
    const quota = Number(req.body?.quota ?? 0);
    const externalSlotId = req.body?.externalSlotId || null;
    if (!Number.isFinite(quota) || quota < 0) return res.status(400).json({ message: "quota inválida" });
    await pool.query(
      `INSERT INTO channel_inventory (class_id, channel, max_spots) VALUES ($1,'wellhub',$2)
       ON CONFLICT (class_id, channel) DO UPDATE SET max_spots=EXCLUDED.max_spots, updated_at=NOW()`,
      [classId, quota],
    );
    await pool.query(
      `INSERT INTO partner_class_mappings (class_id, channel, external_slot_id) VALUES ($1,'wellhub',$2)
       ON CONFLICT (class_id, channel) DO UPDATE SET external_slot_id=EXCLUDED.external_slot_id`,
      [classId, externalSlotId],
    );
    return res.json({ data: { classId, quota, externalSlotId } });
  } catch (err) { console.error("[partners publish]", err.message); return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/partners/wellhub/unpublish/:classId", ownerMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM channel_inventory WHERE class_id=$1 AND channel='wellhub'", [req.params.classId]);
    await pool.query("DELETE FROM partner_class_mappings WHERE class_id=$1 AND channel='wellhub'", [req.params.classId]);
    return res.json({ data: { classId: req.params.classId, published: false } });
  } catch (err) { console.error("[partners unpublish]", err.message); return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/partners/wellhub/class-status/:classId", adminMiddleware, async (req, res) => {
  try {
    const inv = await pool.query("SELECT max_spots, booked_spots FROM channel_inventory WHERE class_id=$1 AND channel='wellhub'", [req.params.classId]);
    const map = await pool.query("SELECT external_slot_id FROM partner_class_mappings WHERE class_id=$1 AND channel='wellhub'", [req.params.classId]);
    return res.json({ data: {
      published: inv.rows.length > 0,
      maxSpots: inv.rows[0]?.max_spots ?? 0,
      bookedSpots: inv.rows[0]?.booked_spots ?? 0,
      externalSlotId: map.rows[0]?.external_slot_id ?? null,
    } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/partners/checkins?month=AAAA-MM — conciliación del mes (P1-9): los
// check-ins de Wellhub con la asistencia en el estudio, el resumen y las
// asistencias de Wellhub sin check-in confirmado. Sólo la dueña.
app.get("/api/partners/checkins", ownerMiddleware, async (req, res) => {
  const range = wellhubMonthRange(typeof req.query.month === "string" ? req.query.month : undefined, todayInStudio());
  if (!range.ok) return res.status(400).json({ message: range.message });
  try {
    const [rows, bookings, unmatched] = await Promise.all([
      pool.query(
        `SELECT pc.id, pc.status, pc.method, pc.validated_at, pc.created_at, pc.channel, pc.booking_id,
                u.display_name AS user_name, u.wellhub_id,
                to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name,
                b.status::text AS booking_status, b.checked_in_at
           FROM partner_checkins pc
           LEFT JOIN users u ON u.id = pc.user_id
           LEFT JOIN bookings b ON b.id = pc.booking_id
           LEFT JOIN classes c ON c.id = b.class_id
           LEFT JOIN class_types ct ON ct.id = c.class_type_id
          WHERE pc.channel = 'wellhub'
            AND pc.created_at >= ($1::date::timestamp AT TIME ZONE '${STUDIO_TIMEZONE}')
            AND pc.created_at <  ($2::date::timestamp AT TIME ZONE '${STUDIO_TIMEZONE}')
          ORDER BY pc.created_at DESC
          LIMIT 500`,
        [range.from, range.to],
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE b.status <> 'cancelled')::int AS booked,
                COUNT(*) FILTER (WHERE b.status = 'checked_in')::int AS attended,
                COUNT(*) FILTER (WHERE b.status = 'no_show')::int AS no_show
           FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.channel = 'wellhub' AND c.date >= $1::date AND c.date < $2::date`,
        [range.from, range.to],
      ),
      pool.query(
        `SELECT b.id AS booking_id, u.display_name AS user_name, u.wellhub_id,
                to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name, b.checked_in_at
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
           LEFT JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN users u ON u.id = b.user_id
          WHERE b.channel = 'wellhub' AND b.status = 'checked_in'
            AND c.date >= $1::date AND c.date < $2::date
            AND NOT EXISTS (SELECT 1 FROM partner_checkins pc WHERE pc.booking_id = b.id AND pc.status = 'confirmed')
          ORDER BY c.date DESC
          LIMIT 200`,
        [range.from, range.to],
      ),
    ]);
    return res.json({
      data: rows.rows,
      summary: summarizeWellhubMonth(rows.rows, bookings.rows[0], unmatched.rows.length),
      unmatched: unmatched.rows,
      month: range.month,
    });
  } catch (err) {
    console.error("[partners checkins]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.post("/api/partners/checkins/:id/confirm", ownerMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "UPDATE partner_checkins SET status='confirmed', validated_at=COALESCE(validated_at,NOW()), method='manual' WHERE id=$1 RETURNING *",
      [req.params.id],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Check-in no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/partners/summary", ownerMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT channel, COUNT(*)::int AS checkins,
              COUNT(*) FILTER (WHERE status='confirmed')::int AS confirmed
         FROM partner_checkins
        WHERE created_at >= date_trunc('month', NOW())
        GROUP BY channel`,
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Helper: snake_case → camelCase row mapper ──────────────────────────────
function camelRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}
function camelRows(rows) { return rows.map(camelRow); }

function normalizeDiscountType(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "percent" || raw === "percentage" || raw === "%") return "percent";
  if (raw === "fixed" || raw === "amount" || raw === "monto") return "fixed";
  return null;
}

function calculateDiscountAmount(type, value, subtotal) {
  const safeSubtotal = Number(subtotal || 0);
  const safeValue = Number(value || 0);
  if (safeSubtotal <= 0 || safeValue <= 0) return 0;
  const normalized = normalizeDiscountType(type);
  const amount = normalized === "percent"
    ? safeSubtotal * (safeValue / 100)
    : safeValue;
  return Math.max(0, Math.min(amount, safeSubtotal));
}

function normalizeClassCategory(value, fallback = "all") {
  return ruleNormalizeCategory(value, fallback);
}

function normalizeDiscountChannel(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["all", "membership", "pos", "event"].includes(raw)) return raw;
  return fallback;
}

function isUnlimitedClasses(value) {
  return value === null || value === undefined || Number(value) >= 9999;
}

function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  return ruleCategoryCompatible(membershipCategory, classCategory);
}

async function selectMembershipForClass({ userId, classCategory, client = null }) {
  if (!userId) return null;
  const q = client ?? pool;
  const clsCat = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT m.id,
            m.user_id,
            m.classes_remaining,
            m.studio_remaining,
            m.rt_remaining,
            m.end_date,
            m.created_at,
            COALESCE(p.class_category, 'all') AS class_category,
            COALESCE(p.morning_only, false) AS morning_only
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        AND (
          COALESCE(p.class_category, 'all') IN ('all', 'mixto')
          OR COALESCE(p.class_category, 'all') = $2
        )
        AND (
          m.classes_remaining IS NULL
          OR m.classes_remaining >= 9999
          OR m.classes_remaining > 0
        )
        AND (
          COALESCE(p.class_category, 'all') <> 'mixto'
          OR ($2 = 'studio' AND COALESCE(m.studio_remaining, 0) > 0)
          OR ($2 = 'reformer_tower' AND COALESCE(m.rt_remaining, 0) > 0)
        )
      ORDER BY
        CASE
          WHEN COALESCE(p.class_category, 'all') = $2 THEN 0
          WHEN COALESCE(p.class_category, 'all') = 'mixto' THEN 1
          WHEN COALESCE(p.class_category, 'all') = 'all' THEN 2
          ELSE 3
        END ASC,
        CASE WHEN m.end_date IS NULL THEN 1 ELSE 0 END ASC,
        m.end_date ASC,
        CASE WHEN m.classes_remaining IS NULL OR m.classes_remaining >= 9999 THEN 1 ELSE 0 END ASC,
        m.created_at ASC
      LIMIT 1`,
    [userId, clsCat]
  );
  return r.rows[0] ?? null;
}

// ─── Créditos de membresía con soporte de paquetes MIXTOS ──────────────────
// El total (classes_remaining) y —para mixto— el bucket de la categoría de la
// clase se mueven SIEMPRE juntos, manteniendo la invariante
// classes_remaining === studio_remaining + rt_remaining. La categoría se
// resuelve desde la clase reservada (classId). En planes no-mixto los buckets
// son NULL y solo cambia el total (comportamiento idéntico al anterior).
async function consumeMembershipCredit(client, membershipId, classId) {
  await client.query(
    `UPDATE memberships m
        SET classes_remaining = GREATEST(m.classes_remaining - 1, 0),
            studio_remaining = CASE WHEN m.studio_remaining IS NOT NULL AND cls.cat = 'studio'
                                    THEN GREATEST(m.studio_remaining - 1, 0) ELSE m.studio_remaining END,
            rt_remaining     = CASE WHEN m.rt_remaining IS NOT NULL AND cls.cat = 'reformer_tower'
                                    THEN GREATEST(m.rt_remaining - 1, 0) ELSE m.rt_remaining END,
            updated_at = NOW()
       FROM (SELECT ct.category AS cat
               FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
              WHERE c.id = $2) cls
      WHERE m.id = $1`,
    [membershipId, classId]
  );
}

async function restoreMembershipCredit(client, membershipId, classId) {
  await client.query(
    `UPDATE memberships m
        SET classes_remaining = m.classes_remaining + 1,
            studio_remaining = CASE WHEN m.studio_remaining IS NOT NULL AND cls.cat = 'studio'
                                    THEN m.studio_remaining + 1 ELSE m.studio_remaining END,
            rt_remaining     = CASE WHEN m.rt_remaining IS NOT NULL AND cls.cat = 'reformer_tower'
                                    THEN m.rt_remaining + 1 ELSE m.rt_remaining END,
            updated_at = NOW()
       FROM (SELECT ct.category AS cat
               FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
              WHERE c.id = $2) cls
      WHERE m.id = $1 AND m.classes_remaining IS NOT NULL AND m.classes_remaining < 9999`,
    [membershipId, classId]
  );
}

// Re-deriva los buckets mixtos desde el total actual. Para ediciones de total
// SIN categoría (alta manual, renovación idempotente, ajuste de admin). No-op
// en planes no-mixto.
async function resyncMixtoBuckets(client, membershipId) {
  await client.query(
    `UPDATE memberships m
        SET studio_remaining = FLOOR(COALESCE(m.classes_remaining,0)::numeric * p.studio_credits / NULLIF(p.studio_credits + p.rt_credits,0)),
            rt_remaining     = COALESCE(m.classes_remaining,0) - FLOOR(COALESCE(m.classes_remaining,0)::numeric * p.studio_credits / NULLIF(p.studio_credits + p.rt_credits,0))
       FROM plans p
      WHERE m.id = $1 AND p.id = m.plan_id AND p.class_category = 'mixto'`,
    [membershipId]
  );
}

async function findApplicableDiscountCode({
  code,
  subtotal,
  planId = null,
  classCategory = "all",
  channel = "all",
  client = null,
}) {
  if (!code) return null;
  const q = client ?? pool;
  const normalizedCode = String(code).toUpperCase().trim();
  const normalizedChannel = normalizeDiscountChannel(channel, "all");
  const normalizedCategory = normalizeClassCategory(classCategory, "all");
  const r = await q.query(
    `SELECT *
       FROM discount_codes
      WHERE code = $1
        AND is_active = true
        AND (expires_at IS NULL OR expires_at > NOW())
        AND (max_uses IS NULL OR uses_count < max_uses)
        AND (channel = 'all' OR channel = $2)
        AND (plan_id IS NULL OR plan_id = $3)
        AND (
          class_category IS NULL
          OR class_category = 'all'
          OR class_category = $4
          OR (class_category = 'mixto' AND $4 IN ('studio','reformer_tower'))
        )
      ORDER BY
        CASE WHEN plan_id IS NULL THEN 1 ELSE 0 END ASC,
        CASE WHEN class_category IS NULL OR class_category = 'all' THEN 1 ELSE 0 END ASC
      LIMIT 1`,
    [normalizedCode, normalizedChannel, planId, normalizedCategory]
  );
  if (!r.rows.length) return null;
  const dc = r.rows[0];
  const safeSubtotal = Number(subtotal || 0);
  const minOrderAmount = Number(dc.min_order_amount || 0);
  if (safeSubtotal < minOrderAmount) {
    return {
      code: dc,
      discountAmount: 0,
      minOrderAmount,
      rejectedByMinOrder: true,
    };
  }
  const discountAmount = calculateDiscountAmount(dc.discount_type, dc.discount_value, safeSubtotal);
  return {
    code: dc,
    discountAmount,
    minOrderAmount,
    rejectedByMinOrder: false,
  };
}

async function incrementDiscountUsage(discountId, client = null) {
  if (!discountId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE discount_codes
        SET uses_count = uses_count + 1,
            updated_at = NOW()
      WHERE id = $1
        AND (max_uses IS NULL OR uses_count < max_uses)
    RETURNING id, uses_count, max_uses`,
    [discountId]
  );
  if (!r.rows.length) {
    const usageErr = new Error("El código de descuento alcanzó su límite de usos");
    usageErr.status = 409;
    throw usageErr;
  }
  return r.rows[0];
}

function buildEventPassCode(eventId, userId) {
  const eventPart = String(eventId || "").replace(/-/g, "").slice(0, 6).toUpperCase();
  const userPart = String(userId || "").replace(/-/g, "").slice(-4).toUpperCase();
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `EV-${eventPart}-${userPart}-${randomPart}`;
}

async function ensureEventPassForRegistration({ eventId, registrationId, userId, client = null }) {
  if (!eventId || !registrationId || !userId) return null;
  const q = client ?? pool;

  const existing = await q.query(
    "SELECT * FROM event_passes WHERE registration_id = $1 LIMIT 1",
    [registrationId]
  );
  if (existing.rows.length) {
    const row = existing.rows[0];
    if (row.status === "issued") return row;
    const updated = await q.query(
      `UPDATE event_passes
          SET event_id = $1,
              user_id = $2,
              status = 'issued',
              issued_at = NOW(),
              used_at = NULL,
              cancelled_at = NULL,
              updated_at = NOW()
        WHERE id = $3
      RETURNING *`,
      [eventId, userId, row.id]
    );
    return updated.rows[0] ?? row;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const passCode = buildEventPassCode(eventId, userId);
    try {
      const inserted = await q.query(
        `INSERT INTO event_passes (event_id, registration_id, user_id, pass_code, status, issued_at)
         VALUES ($1, $2, $3, $4, 'issued', NOW())
         RETURNING *`,
        [eventId, registrationId, userId, passCode]
      );
      return inserted.rows[0] ?? null;
    } catch (err) {
      if (err?.code !== "23505") throw err;
    }
  }

  throw new Error("No se pudo generar un pase único para el evento");
}

async function cancelEventPassByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'cancelled',
            cancelled_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status <> 'cancelled'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

async function markEventPassUsedByRegistration({ registrationId, client = null }) {
  if (!registrationId) return null;
  const q = client ?? pool;
  const r = await q.query(
    `UPDATE event_passes
        SET status = 'used',
            used_at = NOW(),
            updated_at = NOW()
      WHERE registration_id = $1
        AND status = 'issued'
    RETURNING *`,
    [registrationId]
  );
  return r.rows[0] ?? null;
}

function normalizePosItems(items) {
  const qtyByProduct = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const productId = String(raw?.productId ?? "").trim();
    const qty = Number(raw?.qty ?? 0);
    if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
    qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + Math.floor(qty));
  }
  return Array.from(qtyByProduct.entries()).map(([productId, qty]) => ({ productId, qty }));
}

async function processPosSale({ userId, items, paymentMethod = "efectivo", discountCode = null }) {
  const normalizedItems = normalizePosItems(items);
  if (!normalizedItems.length) {
    return { error: { status: 400, message: "Se requieren artículos válidos" } };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const productIds = normalizedItems.map((item) => item.productId);
    const productsRes = await client.query(
      "SELECT * FROM products WHERE id = ANY($1::uuid[]) FOR UPDATE",
      [productIds]
    );
    const productsById = new Map(productsRes.rows.map((p) => [p.id, p]));
    if (productsById.size !== productIds.length) {
      const missing = productIds.find((id) => !productsById.has(id));
      await client.query("ROLLBACK");
      return { error: { status: 404, message: `Producto ${missing} no encontrado` } };
    }

    let subtotal = 0;
    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      if (Number(product.stock) < item.qty) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: `Stock insuficiente para ${product.name}` } };
      }
      subtotal += Number(product.price) * item.qty;
    }

    let discountAmount = 0;
    let discountCodeRow = null;
    if (discountCode) {
      const discount = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        channel: "pos",
        classCategory: "all",
        client,
      });
      if (!discount) {
        await client.query("ROLLBACK");
        return { error: { status: 400, message: "Código de descuento no válido para POS" } };
      }
      if (discount.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return {
          error: {
            status: 400,
            message: `Compra mínima requerida: $${Number(discount.minOrderAmount || 0).toFixed(2)} MXN`,
          },
        };
      }
      discountAmount = discount.discountAmount;
      discountCodeRow = discount.code;
    }

    const total = Math.max(0, subtotal - discountAmount);
    const orderRes = await client.query(
      `INSERT INTO orders (
         user_id, subtotal, tax_amount, total_amount, payment_method,
         status, discount_amount, discount_code_id, channel
       )
       VALUES ($1,$2,0,$3,$4,'approved',$5,$6,'pos')
       RETURNING *`,
      [userId || null, subtotal, total, paymentMethod, discountAmount, discountCodeRow?.id ?? null]
    );
    const order = orderRes.rows[0];

    for (const item of normalizedItems) {
      const product = productsById.get(item.productId);
      await client.query(
        "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)",
        [order.id, item.productId, item.qty, product.price]
      );
      const stockUpdate = await client.query(
        "UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1",
        [item.qty, item.productId]
      );
      if (stockUpdate.rowCount === 0) {
        const stockErr = new Error(`Stock insuficiente para ${product.name}`);
        stockErr.status = 400;
        throw stockErr;
      }
    }

    if (discountCodeRow?.id) {
      await incrementDiscountUsage(discountCodeRow.id, client);
    }

    if (userId && total > 0) {
      const cfg = await getLoyaltyConfig(client);
      const pts = Math.floor(total * cfg.points_per_peso);
      if (cfg.enabled !== false && pts > 0) {
        await client.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
          [userId, pts, `Venta POS — $${total}`]
        );
      }
    }

    await client.query("COMMIT");
    if (userId) {
      triggerWalletPassSync(userId, "pos_sale_approved");
    }
    return { data: order };
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    throw err;
  } finally {
    client.release();
  }
}

// ── Faltas (inasistencias / cancelaciones tardías) ──────────────────────────
// Registra una falta para el usuario y, cada vez que el contador alcanza un
// múltiplo del umbral configurable, descuenta puntos de loyalty (asiento
// 'adjust' con puntos negativos, mismo patrón que el reverso de check-in).
// No aplica a invitadas (role='guest') ni a cancelaciones de admin.
async function recordFalta({ userId, reason, client = null }) {
  if (!userId) return { faltasCount: 0, penaltyApplied: false };
  const q = client ?? pool;
  const cfg = await getLoyaltyConfig(q);
  if (cfg.faltas_enabled === false) return { faltasCount: 0, penaltyApplied: false };
  const upd = await q.query(
    "UPDATE users SET faltas_count = COALESCE(faltas_count,0) + 1 WHERE id = $1 RETURNING faltas_count",
    [userId]
  );
  const faltasCount = Number(upd.rows[0]?.faltas_count ?? 0);
  const threshold = Number(cfg.faltas_threshold);
  const penaltyPoints = Number(cfg.faltas_penalty_points);
  let penaltyApplied = false;
  if (penaltyDueAt(faltasCount, threshold) && penaltyPoints > 0) {
    await q.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1,'adjust',$2,$3)",
      [userId, -Math.abs(penaltyPoints), `Penalización por ${threshold} inasistencias/cancelaciones tardías${reason ? " (" + reason + ")" : ""}`]
    );
    penaltyApplied = true;
  }
  return { faltasCount, penaltyApplied };
}

async function awardBirthdayBonusIfEligible(userId, client = null) {
  if (!userId) return null;
  const q = client ?? pool;
  const userRes = await q.query(
    "SELECT date_of_birth FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const dob = userRes.rows[0]?.date_of_birth;
  if (!dob) return null;

  const today = new Date();
  const birth = new Date(dob);
  const isBirthdayToday =
    birth.getUTCDate() === today.getUTCDate() &&
    birth.getUTCMonth() === today.getUTCMonth();
  if (!isBirthdayToday) return null;

  const cfg = await getLoyaltyConfig(q);
  const points = Number(cfg.birthday_bonus);
  if (cfg.enabled === false || points <= 0) return null;

  const year = today.getUTCFullYear();
  const desc = `Bono de cumpleaños ${year}`;
  const exists = await q.query(
    "SELECT id FROM loyalty_transactions WHERE user_id = $1 AND description = $2 LIMIT 1",
    [userId, desc]
  );
  if (exists.rows.length) return null;

  const inserted = await q.query(
    "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3) RETURNING *",
    [userId, points, desc]
  );
  return inserted.rows[0] ?? null;
}

const NON_REPEATABLE_ORDER_BLOCK_STATUSES = ["pending_payment", "pending_verification", "approved"];

function parseBooleanFlag(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return ["true", "1", "yes", "si", "sí", "t"].includes(v);
  }
  return false;
}

function getPlanRepeatKey(plan) {
  const raw = plan?.repeat_key ?? plan?.repeatKey;
  if (raw === null || raw === undefined) return null;
  const key = String(raw).trim();
  return key || null;
}

function getPlanFlags(plan) {
  return {
    isNonTransferable: parseBooleanFlag(plan?.is_non_transferable ?? plan?.isNonTransferable),
    isNonRepeatable: parseBooleanFlag(plan?.is_non_repeatable ?? plan?.isNonRepeatable),
    repeatKey: getPlanRepeatKey(plan),
  };
}

async function findNonRepeatablePlanConflict({
  userId,
  plan,
  excludeOrderId = null,
  client = null,
}) {
  if (!userId || !plan?.id) return null;
  const { isNonRepeatable, repeatKey } = getPlanFlags(plan);
  if (!isNonRepeatable) return null;

  const q = client ?? pool;
  const key = repeatKey || `plan:${plan.id}`;

  const memConflict = await q.query(
    `SELECT m.id, m.status, p.name AS plan_name
       FROM memberships m
       LEFT JOIN plans p ON p.id = m.plan_id
      WHERE m.user_id = $1
        AND (
          m.plan_id = $2
          OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
        )
      ORDER BY m.created_at DESC
      LIMIT 1`,
    [userId, plan.id, key]
  );
  if (memConflict.rows.length) {
    return {
      source: "membership",
      message: `La "${plan.name}" es de un solo uso, no transferible y no se puede repetir.`,
      detail: memConflict.rows[0],
    };
  }

  const params = [userId, plan.id, key, NON_REPEATABLE_ORDER_BLOCK_STATUSES];
  let orderSql = `
    SELECT o.id, o.status, p.name AS plan_name
      FROM orders o
      JOIN plans p ON p.id = o.plan_id
     WHERE o.user_id = $1
       AND (
         o.plan_id = $2
         OR (COALESCE(p.repeat_key, '') <> '' AND p.repeat_key = $3)
       )
       AND o.status::text = ANY($4::text[])
  `;
  if (excludeOrderId) {
    params.push(excludeOrderId);
    orderSql += ` AND o.id <> $${params.length}`;
  }
  orderSql += " ORDER BY o.created_at DESC LIMIT 1";

  const orderConflict = await q.query(orderSql, params);
  if (orderConflict.rows.length) {
    const status = orderConflict.rows[0].status;
    if (status === "pending_payment" || status === "pending_verification") {
      return {
        source: "order",
        message: "Ya tienes una sesión muestra en proceso. No puede repetirse.",
        detail: orderConflict.rows[0],
      };
    }
    return {
      source: "order",
      message: `La "${plan.name}" ya fue utilizada y no se puede repetir.`,
      detail: orderConflict.rows[0],
    };
  }

  return null;
}

function serializeSpecialtiesForDb(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) {
    const items = value.map((v) => String(v).trim()).filter(Boolean);
    return items.length ? JSON.stringify(items) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Already JSON string? keep as-is if parseable.
    if ((trimmed.startsWith("[") && trimmed.endsWith("]")) || (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
      try {
        JSON.parse(trimmed);
        return trimmed;
      } catch (_) {
        // fall through and normalize as csv list
      }
    }
    const items = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
    return JSON.stringify(items);
  }
  return JSON.stringify(value);
}

function normalizeQrDataUrl(raw) {
  if (!raw) return null;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `data:image/png;base64,${trimmed}`;
}

function pickEvolutionQrPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  // Evolution often returns both "code" and "base64".
  // "code" is not always an image payload, so prefer explicit base64/image fields.
  const candidates = [
    payload?.base64,
    payload?.qrcode?.base64,
    payload?.qrCode?.base64,
    payload?.qr?.base64,
    payload?.instance?.qrcode?.base64,
    payload?.instance?.qrCode?.base64,
    payload?.instance?.qr?.base64,
    payload?.code,
    payload?.qrcode?.code,
    payload?.qrCode?.code,
    payload?.qr?.code,
  ];

  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) return trimmed;
    // Raw base64 image strings should not include separators like comma + '@'
    // seen in non-image "code" values.
    const looksLikeRawBase64Image =
      !trimmed.includes(",") &&
      !trimmed.includes("@") &&
      /^[A-Za-z0-9+/=]+$/.test(trimmed) &&
      trimmed.length > 120;
    if (looksLikeRawBase64Image) return trimmed;
  }
  return null;
}

// ─── Auth helpers ────────────────────────────────────────────────────────────
function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: "30d" });
}

function normalizeEmailAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isStrongPassword(password) {
  const candidate = String(password || "");
  return candidate.length >= 8 && /[A-Z]/.test(candidate) && /[0-9]/.test(candidate);
}

// Cuentas dadas de baja (anonimizadas) o borradas: su token deja de servir
// aunque no haya vencido. Ver server/lib/accountGate.js (auditoría 2026-09-27, P1-5).
const accountGate = createAccountGate({
  lookup: async (userId) => {
    if (!isUuid(userId)) return false;
    const r = await pool.query("SELECT anonymized_at FROM users WHERE id = $1", [userId]);
    return r.rows.length === 0 || r.rows[0].anonymized_at != null;
  },
});

// Venta o asignación a una clienta dada de baja: 409 antes de abrir cualquier
// transacción, para no reactivarla por accidente.
async function anonymizedSaleConflict(userId) {
  if (!isUuid(userId)) return null;
  const r = await pool.query("SELECT anonymized_at FROM users WHERE id = $1", [userId]);
  if (r.rows.length && r.rows[0].anonymized_at) {
    return { code: "ACCOUNT_ANONYMIZED", message: "Esta clienta fue dada de baja." };
  }
  return null;
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
  req.userId = payload.sub;
  if (await accountGate.isDisabled(req.userId)) {
    return res.status(401).json({ code: "ACCOUNT_DISABLED", message: "Esta cuenta fue dada de baja." });
  }
  next();
}

function roleGuard(allowed) {
  return async function guard(req, res, next) {
    authMiddleware(req, res, async () => {
      try {
        const r = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
        const role = r.rows[0]?.role;
        if (!role || !allowed.includes(role)) {
          return res.status(403).json({ message: "Acceso restringido" });
        }
        req.userRole = role;
        next();
      } catch { return res.status(500).json({ message: "Error interno" }); }
    });
  };
}

// Declaraciones (no const): estas referencias se usan en rutas registradas
// más arriba en el archivo y necesitan hoisting.
function adminMiddleware(req, res, next) {
  return roleGuard(OPERATIONS_ROLES)(req, res, next);
}

// Recepción e instructoras pueden operar el estudio, pero no ver ingresos,
// reportes de negocio ni datos bancarios. Auditoría 2026-09-08, P1-1.
function ownerMiddleware(req, res, next) {
  return roleGuard(OWNER_ROLES)(req, res, next);
}

function mapUser(u) {
  return {
    id: u.id,
    displayName: u.display_name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    gender: u.gender ?? null,
    photoUrl: u.photo_url ?? null,
    dateOfBirth: u.date_of_birth ?? null,
    emergencyContactName: u.emergency_contact_name ?? null,
    emergencyContactPhone: u.emergency_contact_phone ?? null,
    healthNotes: u.health_notes ?? null,
    receiveReminders: u.receive_reminders ?? true,
    receivePromotions: u.receive_promotions ?? false,
    receiveWeeklySummary: u.receive_weekly_summary ?? false,
    hasInjury: u.has_injury ?? null,
    practicedBarreBefore: u.practiced_barre_before ?? null,
    injuryDetails: u.injury_details ?? null,
    onboardingCompleted: u.onboarding_completed ?? false,
    // Aviso de privacidad y consentimiento de salud (auditoría 2026-09-27, P1-10).
    privacyNoticeVersion: u.privacy_notice_version ?? null,
    healthConsentVersion: u.health_consent_version ?? null,
    healthConsentAt: u.health_consent_at ?? null,
    createdAt: u.created_at,
  };
}

// ─── Routes: /api/auth ───────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  const { email, password, displayName, phone, gender, dateOfBirth, acceptsTerms, acceptsCommunications, healthConsent } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ message: "Nombre, email y contraseña son requeridos" });
  }
  // Normalize/validate dateOfBirth: YYYY-MM-DD or null. Reject impossible dates.
  let normalizedDob = null;
  if (dateOfBirth) {
    const m = String(dateOfBirth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return res.status(400).json({ message: "Fecha de nacimiento inválida (YYYY-MM-DD)" });
    const year = Number(m[1]);
    const dt = new Date(dateOfBirth + "T00:00:00Z");
    const now = new Date();
    if (Number.isNaN(dt.getTime()) || year < 1900 || dt > now) {
      return res.status(400).json({ message: "Fecha de nacimiento inválida" });
    }
    normalizedDob = dateOfBirth;
  }
  try {
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "Este email ya está registrado" });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    // Aceptar términos deja la versión y la fecha del aviso de privacidad; la
    // casilla de salud (opcional al registrarse) deja su consentimiento expreso
    // (auditoría 2026-09-27, P1-10).
    const versionAviso = acceptsTerms === true ? PRIVACY_NOTICE_VERSION : null;
    const versionSalud = healthConsent === true ? PRIVACY_NOTICE_VERSION : null;
    const result = await pool.query(
      `INSERT INTO users (display_name, email, phone, gender, date_of_birth, password_hash, accepts_terms, accepts_communications, role,
                          privacy_notice_version, privacy_accepted_at, health_consent_version, health_consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'client',
               $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL ELSE NOW() END,
               $10::varchar, CASE WHEN $10::varchar IS NULL THEN NULL ELSE NOW() END)
       RETURNING *`,
      [displayName.trim(), email.toLowerCase().trim(), phone || null, gender || null, normalizedDob, passwordHash,
       acceptsTerms ?? false, acceptsCommunications ?? false, versionAviso, versionSalud]
    );
    const user = result.rows[0];
    // Auto-create referral code (best-effort: nunca debe tirar el registro).
    try {
      const code = "HIVE" + Math.random().toString(36).slice(2, 7).toUpperCase();
      await pool.query(
        "INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [user.id, code]
      );
    } catch (e) {
      console.warn("[register] referral_codes insert skipped:", e.message);
    }
    // Award welcome bonus loyalty points (best-effort).
    try {
      const cfg = await getLoyaltyConfig();
      const pts = cfg.welcome_bonus;
      if (cfg.enabled !== false && pts > 0) {
        await pool.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Bono de bienvenida')",
          [user.id, pts]
        );
      }
    } catch (e) {
      console.warn("[register] loyalty bonus skipped:", e.message);
    }
    const token = signToken(user.id);
    return res.status(201).json({ user: mapUser(user), token });
  } catch (err) {
    console.error("[register] FAILED:", {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      column: err?.column,
      constraint: err?.constraint,
      table: err?.table,
      stack: String(err?.stack || "").split("\n").slice(0, 4).join("\n"),
    });
    return res.status(500).json({
      message: "No pudimos crear tu cuenta",
      detail: process.env.NODE_ENV === "production" ? undefined : err?.message,
    });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: "Email y contraseña requeridos" });
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return res.status(401).json({ message: "Credenciales incorrectas" });
    const user = result.rows[0];
    if (!user.password_hash) return res.status(401).json({ message: "Credenciales incorrectas" });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ message: "Credenciales incorrectas" });
    try {
      await awardBirthdayBonusIfEligible(user.id);
    } catch (bonusErr) {
      console.error("[Loyalty] birthday bonus login:", bonusErr?.message || bonusErr);
    }
    const token = signToken(user.id);
    return res.json({ user: mapUser(user), token });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// GET /api/auth/me
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(result.rows[0]) });
  } catch (err) {
    console.error("Me error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// ── Responsiva y consentimiento informado ──────────────────────────────────
// GET: la responsiva firmada por la alumna (o null si aún no firma).
app.get("/api/me/waiver", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM waivers WHERE user_id = $1 LIMIT 1", [req.userId]);
    return res.json({ data: r.rows[0] ?? null });
  } catch (err) {
    console.error("GET waiver error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST: firma la responsiva (nombre + firma dibujada + consentimiento de imagen).
// Guarda la versión del texto que la clienta leyó (auditoría 2026-09-27, punto 7):
// la app manda `waiver_version`; sin él, v1 — una app en caché de antes del
// versionado mostró la v1, y sin este resguardo quedaría registrado que aceptó
// un texto (v2) que nunca vio. Las ya firmadas no se tocan ni se piden de nuevo.
app.post("/api/me/waiver", authMiddleware, async (req, res) => {
  const { full_name, phone, email, image_consent, signature_data, waiver_version } = req.body || {};
  if (!full_name?.trim() || !signature_data) {
    return res.status(400).json({ message: "Nombre y firma son requeridos." });
  }
  const firmaMala = signatureProblem(signature_data);
  if (firmaMala) return res.status(400).json({ message: firmaMala });
  const versionMala = waiverVersionProblem(waiver_version);
  if (versionMala) return res.status(400).json({ message: versionMala });
  const version = waiver_version ?? "v1";
  try {
    const r = await pool.query(
      `INSERT INTO waivers (user_id, full_name, phone, email, image_consent, signature_data, waiver_version, signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name=$2, phone=$3, email=$4, image_consent=$5, signature_data=$6, waiver_version=$7, signed_at=NOW()
       RETURNING *`,
      [req.userId, full_name.trim(), phone || null, email || null, !!image_consent, signature_data, version]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST waiver error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/auth/change-password — cambiar contraseña estando logueado.
// Sirve a cualquier rol (cliente, admin, super_admin). Pide la contraseña
// actual y la nueva; valida fuerza de la nueva. No invalida el token actual
// (la sesión sigue viva), pero el frontend puede pedir re-login si lo desea.
app.post("/api/auth/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Contraseña actual y nueva son requeridas" });
  }
  if (!isStrongPassword(newPassword)) {
    return res.status(400).json({ message: "La nueva contraseña debe tener mínimo 8 caracteres, una mayúscula y un número" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ message: "La nueva contraseña debe ser distinta a la actual" });
  }
  try {
    const r = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.userId]);
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const hash = r.rows[0].password_hash;
    // Si la cuenta no tiene contraseña aún (ej. creada por admin sin pass),
    // permitimos establecerla sin exigir la "actual".
    if (hash) {
      const match = await bcrypt.compare(currentPassword, hash);
      if (!match) return res.status(401).json({ message: "La contraseña actual no es correcta" });
    }
    const newHash = await bcrypt.hash(newPassword, 12);
    await pool.query("UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2", [newHash, req.userId]);
    // Invalida tokens de reset pendientes (por higiene).
    await pool.query("UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false", [req.userId]).catch(() => {});
    return res.json({ ok: true, message: "Contraseña actualizada" });
  } catch (err) {
    console.error("[change-password] FAILED:", err?.message);
    return res.status(500).json({ message: "No pudimos cambiar la contraseña" });
  }
});

// POST /api/auth/onboarding — la alumna responde salud/experiencia post-registro
app.post("/api/auth/onboarding", authMiddleware, async (req, res) => {
  const { hasInjury, practicedBarreBefore, injuryDetails } = req.body;
  if (typeof hasInjury !== "boolean" || typeof practicedBarreBefore !== "boolean") {
    return res.status(400).json({ message: "Responde todas las preguntas" });
  }
  // Si reporta lesión, exigimos el detalle.
  const details = typeof injuryDetails === "string" ? injuryDetails.trim() : "";
  if (hasInjury && !details) {
    return res.status(400).json({ message: "Describe la lesión o condición que debemos saber" });
  }
  try {
    // Reportar una lesión es dato de salud: exige consentimiento expreso
    // vigente o la casilla (auditoría 2026-09-27, P1-10).
    const cur = await pool.query(
      "SELECT has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1",
      [req.userId],
    );
    if (!cur.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const hasConsent = hasCurrentHealthConsent(cur.rows[0]);
    const consentGiven = req.body?.healthConsent === true;
    const problem = healthConsentProblem({
      changes: healthDataChanges(cur.rows[0], { hasInjury, injuryDetails: details }), consentGiven, hasConsent,
    });
    if (problem) return res.status(400).json(problem);
    const recordConsent = consentGiven && !hasConsent;
    const r = await pool.query(
      `UPDATE users SET
         has_injury             = $1,
         practiced_barre_before = $2,
         injury_details         = $3,
         onboarding_completed   = true,
         health_consent_version = CASE WHEN $5 THEN $6 ELSE health_consent_version END,
         health_consent_at      = CASE WHEN $5 THEN NOW() ELSE health_consent_at END,
         updated_at             = NOW()
       WHERE id = $4
       RETURNING *`,
      [hasInjury, practicedBarreBefore, hasInjury ? details : null, req.userId, recordConsent, PRIVACY_NOTICE_VERSION]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("[onboarding] FAILED:", err?.message);
    return res.status(500).json({ message: "No pudimos guardar tus respuestas" });
  }
});

// POST /api/auth/forgot-password
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = normalizeEmailAddress(req.body?.email);
  if (!email) return res.status(400).json({ message: "Email es requerido" });

  try {
    const user = await pool.query("SELECT id, display_name FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      // Return 200 to prevent user enumeration
      return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    // Expiration set to 2 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 2);

    // Invalidate older active reset links before creating a new one.
    await pool.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [user.rows[0].id],
    );
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.rows[0].id, token, expiresAt]
    );

    await sendPasswordResetEmail({
      to: email,
      name: user.rows[0].display_name || "Clienta",
      token,
      resetUrl: `${APP_PUBLIC_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });

    return res.json({ message: "Si el correo existe, recibirás un enlace de recuperación." });
  } catch (err) {
    console.error("Auth /forgot-password error:", err);
    return res.status(500).json({ message: "Error interno del servidor" });
  }
});

// POST /api/auth/reset-password
app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token || "").trim();
  const password = String(req.body?.password || "");
  if (!token || !password) return res.status(400).json({ message: "Datos incompletos" });
  if (!isStrongPassword(password)) {
    return res.status(400).json({ message: "La contraseña debe tener al menos 8 caracteres, una mayúscula y un número." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Check token validity
    const t = await client.query(
      `SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = $1 FOR UPDATE`,
      [token]
    );
    if (t.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    const dbToken = t.rows[0];
    if (dbToken.used) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ya fue utilizado. Solicita uno nuevo." });
    }
    if (new Date() > new Date(dbToken.expires_at)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Este enlace ha expirado." });
    }

    // Hash new password and update
    const hash = await bcrypt.hash(password, 12);
    const userUpdate = await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, dbToken.user_id]);
    if (!userUpdate.rowCount) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "El enlace es inválido o ha expirado." });
    }

    // Mark current and any still-active tokens as used for this user.
    await client.query(
      `UPDATE password_reset_tokens
       SET used = true
       WHERE user_id = $1 AND used = false`,
      [dbToken.user_id],
    );

    await client.query("COMMIT");

    return res.json({ message: "Contraseña restablecida con éxito." });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("Auth /reset-password error:", err);
    return res.status(500).json({ message: "Error al actualizar la contraseña." });
  } finally {
    client.release();
  }
});

// ─── Routes: /api/plans ─────────────────────────────────────────────────────

// GET /api/plans
app.get("/api/plans", async (req, res) => {
  try {
    // El storefront pasa ?active=true para no recibir planes legacy inactivos.
    // El admin llama sin parámetro para poder gestionar también los inactivos.
    const onlyActive = req.query.active === "true" || req.query.is_active === "true";
    const r = await pool.query(
      `SELECT * FROM plans ${onlyActive ? "WHERE is_active = true" : ""} ORDER BY sort_order ASC, price ASC`
    );
    const general = await getSettingValueWithDefaults("general_settings");
    const openingActive = general?.opening_pricing_active !== false;
    const data = r.rows.map((p) => {
      const row = camelRow(p);
      const effective = resolveEffectivePrice(p, openingActive);
      const openingThisRow = openingActive && p.opening_price != null;
      return {
        ...row,
        effective_price: effective,
        effectivePrice: effective,
        opening_active: openingThisRow,
        openingActive: openingThisRow,
      };
    });
    return res.json({ data });
  } catch (err) {
    console.error("Plans error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/memberships ───────────────────────────────────────────────

// GET /api/memberships/my
app.get("/api/memberships/my", authMiddleware, async (req, res) => {
  try {
    // Las columnas opcionales ya las garantiza ensureSchema al arrancar; no se
    // migran por-request (antes corrían 8 ALTER TABLE en cada petición).
    const r = await pool.query(
      `SELECT m.id, m.user_id, m.plan_id, m.status, m.start_date, m.end_date,
              m.classes_remaining, m.studio_remaining, m.rt_remaining,
              m.payment_method, m.created_at, m.updated_at,
              m.order_id, m.cancellations_used,
              COALESCE(m.plan_name_override, '') AS plan_name_override,
              m.class_limit_override,
              COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name,
              COALESCE(p.class_limit, m.class_limit_override)      AS class_limit,
              COALESCE(p.duration_days, 30)                        AS duration_days,
              p.features,
              COALESCE(p.class_category, 'all')                    AS class_category,
              (m.end_date IS NOT NULL AND m.end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) AS is_expired
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1
       ORDER BY
         -- La que la clienta puede usar primero: activa vigente, luego
         -- pendientes, luego activa vencida (para mostrarle que venció) y al
         -- final el resto. Una cancelada conserva su end_date, así que no
         -- basta con "no vencida" para ganar (auditoría 2026-09-27, P1-6).
         -- Postgres no deja usar el alias is_expired dentro de una expresión
         -- del ORDER BY: el predicado se repite.
         CASE
           WHEN m.status = 'active'
            AND NOT (m.end_date IS NOT NULL AND m.end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) THEN 0
           WHEN m.status IN ('pending_activation', 'pending_payment') THEN 1
           WHEN m.status = 'active' THEN 2
           ELSE 3
         END,
         CASE
           WHEN m.status = 'active' AND (m.classes_remaining IS NULL OR m.classes_remaining >= 9999) THEN 1
           ELSE 0
         END ASC,
         CASE
           WHEN m.status = 'active' AND m.end_date IS NULL THEN 1
           ELSE 0
         END ASC,
         m.end_date ASC NULLS LAST,
         m.created_at DESC
       LIMIT 1`,
      [req.userId]
    );
    if (!r.rows[0]) return res.json({ data: null });
    const row = camelRows([r.rows[0]])[0];
    // Treat 9999 or very large numbers as unlimited (null)
    if (row.classesRemaining >= 9999) row.classesRemaining = null;
    if (row.classLimit >= 9999) row.classLimit = null;
    // Cuota de cancelaciones del paquete (auditoría 2026-09-27, P0-4).
    const policy = await getBookingPolicy();
    const quota = cancellationQuota({ used: row.cancellationsUsed, limit: policy.cancellationLimit });
    row.cancellationsUsed = quota.used;
    row.cancellationLimit = policy.cancellationLimit;
    row.cancellationsLeft = quota.left;
    return res.json({ data: row });
  } catch (err) {
    console.error("Memberships/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/memberships/mine/all — TODAS las membresías activas/pendientes del
// usuario.
app.get("/api/memberships/mine/all", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT m.id, m.user_id, m.plan_id, m.status, m.start_date, m.end_date,
              m.classes_remaining, m.studio_remaining, m.rt_remaining,
              m.payment_method, m.created_at, m.updated_at,
              m.order_id, m.cancellations_used,
              COALESCE(m.plan_name_override, '') AS plan_name_override,
              m.class_limit_override,
              COALESCE(p.name, m.plan_name_override, 'Membresía') AS plan_name,
              COALESCE(p.class_limit, m.class_limit_override)      AS class_limit,
              COALESCE(p.duration_days, 30)                        AS duration_days,
              p.features,
              COALESCE(p.class_category, 'all')                    AS class_category
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1
         AND m.status IN ('active','pending_activation','pending_payment')
         AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
       ORDER BY
         CASE m.status WHEN 'active' THEN 1 WHEN 'pending_activation' THEN 2 ELSE 3 END,
         m.end_date ASC NULLS LAST,
         m.created_at DESC`,
      [req.userId]
    );
    const policy = await getBookingPolicy();
    const rows = camelRows(r.rows).map((row) => {
      if (row.classesRemaining >= 9999) row.classesRemaining = null;
      if (row.classLimit >= 9999) row.classLimit = null;
      const quota = cancellationQuota({ used: row.cancellationsUsed, limit: policy.cancellationLimit });
      return { ...row, cancellationsUsed: quota.used, cancellationLimit: policy.cancellationLimit, cancellationsLeft: quota.left };
    });
    return res.json({ data: rows });
  } catch (err) {
    console.error("Memberships/mine/all error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/classes ───────────────────────────────────────────────────

// GET /api/classes?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get("/api/classes", async (req, res) => {
  try {
    const { start, end, limit } = req.query;
    // current_bookings se calcula EN VIVO desde bookings (confirmed/checked_in)
    // para no depender del contador denormalizado, que puede desfasarse y
    // mostrar la clase como llena/sobrecupo sin estarlo (issue: "5/4 con solo 3 inscritas").
    let query = `
      SELECT c.*,
             c.max_capacity                         AS capacity,
             (c.date || 'T' || c.start_time)        AS start_time_full,
             (c.date || 'T' || c.end_time)          AS end_time_full,
             ct.name  AS class_type_name,
             ct.color AS class_type_color,
             ct.icon  AS class_type_icon,
             ct.level AS class_type_level,
             i.display_name AS instructor_name,
             i.photo_url    AS instructor_photo,
             f.name         AS facility_name,
             COALESCE((
               SELECT COUNT(*)::int FROM bookings b
                WHERE b.class_id = c.id
                  AND b.status IN ('confirmed','checked_in')
             ), 0) AS live_current_bookings,
             -- Lista de espera viva: la usa el panel para Reservas y Lista de espera.
             COALESCE((
               SELECT COUNT(*)::int FROM bookings b
                WHERE b.class_id = c.id
                  AND b.status = 'waitlist'
             ), 0) AS waitlist_count
      FROM classes c
      JOIN class_types ct   ON c.class_type_id  = ct.id
      JOIN instructors i    ON c.instructor_id   = i.id
      LEFT JOIN facilities f ON c.facility_id    = f.id
      WHERE c.status != 'cancelled'
    `;
    const params = [];
    if (start) { params.push(start); query += ` AND c.date >= $${params.length}`; }
    if (end) { params.push(end); query += ` AND c.date <= $${params.length}`; }
    query += " ORDER BY c.date ASC, c.start_time ASC";
    if (limit) { params.push(parseInt(limit)); query += ` LIMIT $${params.length}`; }
    const r = await pool.query(query, params);
    // Normalise: expose start_time / end_time as full ISO strings for front-end consumers
    const rows = r.rows.map((row) => ({
      ...row,
      // Ensure date is always a plain YYYY-MM-DD string (pg returns Date objects for DATE columns)
      date: row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : (typeof row.date === "string" ? row.date.slice(0, 10) : row.date),
      start_time: row.start_time_full ?? row.start_time,
      end_time: row.end_time_full ?? row.end_time,
      // Sobrescribir el contador con el conteo real para que el calendar nunca muestre sobrecupo fantasma.
      current_bookings: row.live_current_bookings ?? 0,
    }));
    return res.json({ data: rows });
  } catch (err) {
    console.error("Classes error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/classes/:id
app.get("/api/classes/:id", async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT c.*,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              ct.name  AS class_type_name,
              ct.color AS class_type_color,
              ct.icon  AS class_type_icon,
              ct.level AS class_type_level,
              i.display_name AS instructor_name,
              i.photo_url    AS instructor_photo,
              i.bio          AS instructor_bio,
              f.name         AS facility_name
       FROM classes c
       JOIN class_types ct   ON c.class_type_id  = ct.id
       JOIN instructors i    ON c.instructor_id   = i.id
       LEFT JOIN facilities f ON c.facility_id    = f.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Clase no encontrada" });
    const row = r.rows[0];
    // Usar el conteo real de lugares ocupados (no el contador guardado, que
    // puede estar desfasado y mostrar la clase como "llena" sin estarlo).
    row.current_bookings = await liveBookingCount(req.params.id);
    row.waitlist_count = await waitingCount(req.params.id);
    return res.json({ data: row });
  } catch (err) {
    console.error("Class/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/bookings ──────────────────────────────────────────────────

// GET /api/bookings/my-bookings
app.get("/api/bookings/my-bookings", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.*,
              c.date,
              (c.date || 'T' || c.start_time) AS start_time,
              (c.date || 'T' || c.end_time)   AS end_time,
              c.status AS class_status,
              ct.name  AS class_type_name,
              ct.color AS class_color,
              i.display_name AS instructor_name,
              i.photo_url    AS instructor_photo,
              EXISTS(
                SELECT 1
                FROM reviews rv
                WHERE rv.booking_id = b.id
              ) AS has_review,
              f.name         AS facility_name
              , CASE WHEN b.status = 'waitlist' THEN (
                  SELECT COUNT(*)::int + 1 FROM bookings w
                   WHERE w.class_id = b.class_id AND w.status = 'waitlist'
                     AND (w.created_at, w.id) < (b.created_at, b.id)
                ) END AS waitlist_position_live
       FROM bookings b
       JOIN classes c       ON b.class_id       = c.id
       JOIN class_types ct  ON c.class_type_id  = ct.id
       JOIN instructors i   ON c.instructor_id  = i.id
       LEFT JOIN facilities f ON c.facility_id  = f.id
       WHERE b.user_id = $1
       ORDER BY c.date DESC, c.start_time DESC`,
      [req.userId]
    );
    // waitlist_position en vivo por orden de llegada (antes salía siempre null).
    return res.json({
      data: r.rows.map(({ waitlist_position_live, ...row }) => ({ ...row, waitlist_position: waitlist_position_live ?? null })),
    });
  } catch (err) {
    console.error("Bookings/my error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

/**
 * Verifica el tope semanal del plan ('Barre — N por semana').
 * Cuenta reservas activas (confirmed/checked_in) en la misma ISO-week
 * de la fecha de la clase, contra el límite del plan. La lista de espera
 * (waitlist) NO consume cupo semanal hasta que se confirma.
 *
 * Returns { ok: true, count, limit } si pasa, o { ok: false, count, limit, message }
 * con mensaje listo para devolver al cliente. Para planes sin tope semanal
 * (weekly_class_limit IS NULL), siempre returns ok=true.
 */
async function checkWeeklyClassLimit(client, userId, membershipId, classDate) {
  const planRes = await client.query(
    `SELECT p.weekly_class_limit
       FROM memberships m JOIN plans p ON p.id = m.plan_id
      WHERE m.id = $1`,
    [membershipId],
  );
  const limit = planRes.rows[0]?.weekly_class_limit;
  if (!limit || limit <= 0) return { ok: true };
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM bookings b
       JOIN classes c ON c.id = b.class_id
      WHERE b.user_id = $1
        AND b.membership_id = $2
        AND b.status IN ('confirmed', 'checked_in')
        AND date_trunc('week', c.date::date) = date_trunc('week', $3::date)`,
    [userId, membershipId, classDate],
  );
  const count = countRes.rows[0]?.n || 0;
  if (count >= limit) {
    return {
      ok: false,
      limit,
      count,
      message: `Tu paquete permite ${limit} clase${limit === 1 ? "" : "s"} por semana. Esta semana ya tienes ${count} reservada${count === 1 ? "" : "s"}. Cancela una si quieres mover el día.`,
    };
  }
  return { ok: true, limit, count };
}

// GET /api/bookings/weekly-status — alumna ve cuántas le quedan esta semana
// Devuelve para CADA membresía activa con weekly_class_limit el conteo + remaining.
app.get("/api/bookings/weekly-status", authMiddleware, async (req, res) => {
  try {
    const ref = req.query.date || todayInStudio();
    const r = await pool.query(
      `SELECT m.id AS membership_id, p.name AS plan_name, p.weekly_class_limit AS limit,
              (SELECT COUNT(*)::int FROM bookings b
                 JOIN classes c ON c.id = b.class_id
                WHERE b.user_id = $1 AND b.membership_id = m.id
                  AND b.status IN ('confirmed','checked_in')
                  AND date_trunc('week', c.date::date) = date_trunc('week', $2::date)
              ) AS used
         FROM memberships m
         JOIN plans p ON p.id = m.plan_id
        WHERE m.user_id = $1
          AND m.status = 'active'
          AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
          AND p.weekly_class_limit IS NOT NULL`,
      [req.userId, ref],
    );
    const data = r.rows.map((row) => ({
      membership_id: row.membership_id,
      plan_name: row.plan_name,
      limit: row.limit,
      used: row.used,
      remaining: Math.max(0, row.limit - row.used),
    }));
    return res.json({ data, week_ref: ref });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Las reservas de clientas cierran este número de horas antes del inicio de la
// clase (da tiempo de preparar la lista del día). El admin sí puede registrar
// walk-ins de último momento desde el roster.
const BOOKING_LEAD_HOURS = 2;
const BOOKING_LEAD_MS = BOOKING_LEAD_HOURS * 60 * 60 * 1000;
// Membresía vencida en el calendario del estudio (no en el del servidor).
const MEMBERSHIP_EXPIRED_SQL = `(end_date IS NOT NULL AND end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date)`;

// Conteo REAL de lugares ocupados (confirmadas + check-in). Fuente de verdad
// del cupo, en lugar del contador denormalizado classes.current_bookings, que
// puede desfasarse (y hacía que una clase con lugar se viera "llena").
async function liveBookingCount(classId, db = pool) {
  const r = await db.query(
    "SELECT COUNT(*)::int AS cnt FROM bookings WHERE class_id = $1 AND status IN ('confirmed','checked_in')",
    [classId]
  );
  return r.rows[0]?.cnt ?? 0;
}

// ── Lista de espera: subida automática (auditoría 2026-09-27, P1-1) ─────────
// Se liberó uno o más lugares. Lo llaman, DESPUÉS de su COMMIT y con await,
// todas las vías que liberan cupo:
//   - la clienta que cancela y el estudio que cancela una reserva;
//   - subir el cupo, cancelar una membresía o reembolsarla;
//   - la cancelación por webhook de Wellhub, reabrir una clase;
//   - la reserva nueva que entra a la fila.
// Quien llama debe haber soltado ya su cliente de la transacción: la subida
// pide su propia conexión y el aviso puede tardar hasta 5 s (sonda de WhatsApp).
// Sube, clase por clase, a la primera de la fila (orden de llegada) que pueda
// usar el lugar:
//   - membresía vigente con clases para esa categoría;
//   - AM Club y tope semanal respetados;
//   - cuenta no dada de baja.
// La que no cumple se salta y sigue en la fila. Sólo en clases 'scheduled' y
// hasta BOOKING_LEAD_HOURS antes del inicio; después el lugar queda libre.
// Concurrencia: cada subida es su propia transacción y empieza con
// SELECT … FOR UPDATE de la clase. Así dos liberaciones a la vez se forman, y
// ninguna sube dos veces a la misma ni pasa el cupo. Una subida bloquea una
// sola membresía y siempre en el orden clase → fila → membresía, así que no
// forma un ciclo de candados con una reserva o una cancelación sola; si
// Postgres aun así corta un interbloqueo (40P01), la vuelta se reintenta.
// Contrato: nunca lanza y devuelve las subidas
// [{ booking_id, user_id, display_name, phone, whatsapp, email }].
// ctx: { source?: string, quietUserIds?: string[] }.
async function onSeatReleased(classIds, ctx = {}) {
  const out = [];
  try {
    const ids = [...new Set([].concat(classIds ?? []).map((x) => String(x ?? "")).filter((x) => isUuid(x)))];
    const quietUserIds = Array.isArray(ctx?.quietUserIds) ? ctx.quietUserIds.map(String) : [];
    for (const id of ids) {
      try {
        out.push(...(await promoteWaitlist(id, { quietUserIds })));
      } catch (err) {
        console.error(`[waitlist] no se pudo subir la fila de ${id} (${ctx?.source ?? "?"}):`, err?.message);
      }
    }
  } catch (err) {
    console.error(`[waitlist] onSeatReleased (${ctx?.source ?? "?"}):`, err?.message);
  }
  return out;
}

const waitingCount = async (classId, db = pool) =>
  Number((await db.query(
    "SELECT COUNT(*)::int AS n FROM bookings WHERE class_id = $1 AND status = 'waitlist'", [classId],
  )).rows[0]?.n ?? 0);

/** Una subida, en su propia transacción. null = nada que hacer; { retry } = revisar otra vez. */
async function promoteOneFromWaitlist(classId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query(
      `SELECT c.id, c.status::text AS status, c.max_capacity, c.date, c.start_time,
              to_char(c.date, 'YYYY-MM-DD') AS day,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') AS starts_at,
              ct.category AS class_category, ct.name AS class_name, i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON ct.id = c.class_type_id
         LEFT JOIN instructors i ON i.id = c.instructor_id
        WHERE c.id = $1
        FOR UPDATE OF c`,
      [classId],
    );
    const cls = c.rows[0];
    if (!cls || cls.status !== "scheduled" || !promotionWindowOpen(cls.starts_at, Date.now(), BOOKING_LEAD_HOURS)) {
      await client.query("ROLLBACK");
      return null;
    }
    if (freeSeats(cls.max_capacity, await liveBookingCount(classId, client)) <= 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const queue = (await client.query(
      `SELECT b.id, b.user_id, (u.anonymized_at IS NOT NULL) AS anonymized
         FROM bookings b
         LEFT JOIN users u ON u.id = b.user_id
        WHERE b.class_id = $1 AND b.status = 'waitlist'
        ORDER BY b.created_at ASC, b.id ASC
        FOR UPDATE OF b`,
      [classId],
    )).rows;
    const category = normalizeClassCategory(cls.class_category, "all");
    const candidates = [];
    for (const [i, w] of queue.entries()) {
      let mem = null;
      let reason = null;
      // Dada de baja (bloque 2): no sube aunque le quede una fila previa.
      if (w.anonymized) reason = "baja";
      else {
        mem = w.user_id ? await selectMembershipForClass({ userId: w.user_id, classCategory: category, client }) : null;
        if (!mem) reason = "sin_clases";
        else if (mem.morning_only && !isWithinMorningWindow(cls.starts_at)) reason = "solo_manana";
        else if (!(await checkWeeklyClassLimit(client, w.user_id, mem.id, cls.date)).ok) reason = "tope_semanal";
      }
      candidates.push({ bookingId: w.id, userId: w.user_id, membershipId: mem?.id ?? null, position: i + 1, reason });
      if (!reason) break; // la primera que cumple; las de atrás siguen esperando
    }
    const { promote, skipped } = firstEligible(candidates);
    if (!promote) {
      await client.query("ROLLBACK");
      return null;
    }
    // Se revalida bajo candado: entre la elección y el candado la membresía pudo
    // cancelarse, vencer, gastar su última clase (o la de su área, si es mixta)
    // o llenar su tope semanal con una reserva de otra clase. Si ya no sirve no
    // se usa; la siguiente vuelta la vuelve a evaluar (y la salta si no tiene otra).
    const locked = (await client.query(
      `SELECT id, classes_remaining, studio_remaining, rt_remaining, status::text AS status, end_date,
              (SELECT p.class_category FROM plans p WHERE p.id = memberships.plan_id) AS plan_category,
              (end_date IS NOT NULL AND end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) AS expired
         FROM memberships WHERE id = $1 FOR UPDATE`,
      [promote.membershipId],
    )).rows[0];
    const stillUsable = locked
      && locked.status === "active" && !locked.expired
      && (isUnlimitedClasses(locked.classes_remaining) || Number(locked.classes_remaining) > 0)
      && (normalizeClassCategory(locked.plan_category, "all") !== "mixto"
        || canMixtoBook({ studioRemaining: locked.studio_remaining, rtRemaining: locked.rt_remaining }, category))
      // El tope semanal se cuenta otra vez ya con la membresía bloqueada: una
      // reserva nueva de la misma clienta la bloquea antes de contar e insertar.
      && (await checkWeeklyClassLimit(client, promote.userId, promote.membershipId, cls.date)).ok;
    if (!stillUsable) {
      await client.query("ROLLBACK");
      return { retry: true };
    }
    await client.query(
      "UPDATE bookings SET status = 'confirmed', membership_id = $2, promoted_at = NOW() WHERE id = $1",
      [promote.bookingId, promote.membershipId],
    );
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
    if (!isUnlimitedClasses(locked.classes_remaining)) {
      await consumeMembershipCredit(client, promote.membershipId, classId);
    }
    await recordAudit(client, {
      systemActor: "system", action: "booking.waitlist_promoted", entityType: "booking",
      entityId: promote.bookingId, subjectUserId: promote.userId,
      before: { status: "waitlist" }, after: { status: "confirmed" },
      meta: {
        class_id: cls.id, class_name: cls.class_name, day: cls.day, start_time: String(cls.start_time).slice(0, 5),
        position: promote.position, membership_id: promote.membershipId,
        skipped: skipped.map((s) => ({ booking_id: s.bookingId, position: s.position, reason: s.reason })),
      },
    });
    await client.query("COMMIT");
    return { bookingId: promote.bookingId, userId: promote.userId, membershipId: promote.membershipId, cls };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Interbloqueo o candado no disponible: la otra transacción ya confirmó o se
// revirtió; la subida se vuelve a intentar en la siguiente vuelta.
const RETRYABLE_PG_CODES = new Set(["40P01", "55P03", "40001"]);

/** Sube mientras haya lugar y alguien que cumpla; luego avisa (salvo a quietUserIds). */
async function promoteWaitlist(classId, { quietUserIds = [] } = {}) {
  const promoted = [];
  let retries = 0;
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    let p;
    try {
      p = await promoteOneFromWaitlist(classId);
    } catch (err) {
      if (RETRYABLE_PG_CODES.has(err?.code) && ++retries <= 5) continue;
      // Las que ya subieron (y confirmaron) se avisan igual.
      console.error(`[waitlist] subida en ${classId}:`, err?.message);
      break;
    }
    if (!p) break;
    if (p.retry) {
      if (++retries > 5) break; // nunca un ciclo sin fin si algo no converge
      continue;
    }
    retries = 0;
    promoted.push(p);
  }
  const out = [];
  for (const p of promoted) {
    const aviso = quietUserIds.includes(String(p.userId))
      ? { whatsapp: "skipped", email: "skipped" }
      : await notifyWaitlistPromoted(p);
    const u = (await pool.query("SELECT display_name, phone FROM users WHERE id = $1", [p.userId]).catch(() => ({ rows: [] }))).rows[0] ?? {};
    out.push({ booking_id: p.bookingId, user_id: p.userId, display_name: u.display_name ?? null, phone: u.phone ?? null, ...aviso });
  }
  return out;
}

// Aviso de la subida, con la regla honesta del bloque 1: con el canal de
// WhatsApp caído o los avisos apagados no se intenta y se dice
// ("unreached" | "disabled"), para que recepción avise a mano. Va también el
// correo de "reserva confirmada" y se sincroniza el pase. La plantilla
// "waitlist_promoted" no está en DEFAULT_NOTIFICATION_TEMPLATES
// (server/lib/notificationTemplates.js): sale el texto de respaldo, salvo que
// se guarde una plantilla con esa llave.
async function notifyWaitlistPromoted(p) {
  const out = { whatsapp: "skipped", email: "skipped" };
  try {
    triggerWalletPassSync(p.userId, "waitlist_promoted");
    const cls = p.cls;
    const dateStr = cls.date ? new Date(cls.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
    const timeStr = cls.start_time ? String(cls.start_time).slice(0, 5) : "";
    const className = cls.class_name || "tu clase";
    const notif = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    const waOn = notif?.whatsapp_reminders !== false;
    const channel = waOn ? await whatsappChannelState() : { connected: false, state: "disabled" };
    if (!channel.connected) {
      out.whatsapp = channel.state === "disabled" ? "disabled" : "unreached";
    } else {
      const r = await notifyByTemplate(
        p.userId,
        "waitlist_promoted",
        { class: className, date: dateStr, time: timeStr },
        ({ firstName }) =>
          `${firstName}, se liberó un lugar en ${className}${dateStr ? ` del ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""} y ya quedó a tu nombre: se usó una clase de tu paquete. Si no puedes ir, cancela desde la app; aplican las reglas de cancelación.`,
      );
      out.whatsapp = r?.sent ? "queued" : "failed";
    }
    const u = (await pool.query("SELECT email, display_name FROM users WHERE id = $1", [p.userId])).rows[0];
    if (u?.email && (await areEmailNotificationsEnabled())) {
      const mem = p.membershipId
        ? (await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [p.membershipId])).rows[0]
        : null;
      const cfg = await getLoyaltyConfig();
      sendBookingConfirmed({
        to: u.email, name: u.display_name || "Alumna", className, date: cls.date, startTime: cls.start_time,
        instructor: cls.instructor_name, classesLeft: mem?.classes_remaining ?? null, isWaitlist: false,
        cancelHours: cfg.faltas_cancel_window_hours,
      }).catch((e) => console.error("[Email] subida de lista de espera:", e.message));
      out.email = "queued";
    }
  } catch (e) {
    console.warn("[waitlist] aviso de subida:", e?.message);
  }
  return out;
}

// Red de seguridad: clases con lugar libre y fila, por si una subida no ocurrió
// (un reinicio a media cancelación o una vía sin gancho). Lo corre
// scheduleEmailCrons cada WAITLIST_SWEEP_MINUTES, que viene APAGADO por
// defecto (ver sweepMinutes en server/lib/waitlist.js). singleFlight: si una
// vuelta tarda más que el intervalo (avisos de hasta 5 s por subida), la
// siguiente no arranca encima de ella.
const runWaitlistSweep = singleFlight(async () => {
  const r = await pool.query(
    `SELECT c.id FROM classes c
      WHERE c.status = 'scheduled'
        AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') >= NOW() + make_interval(hours => $1)
        AND c.date <= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date + 60
        AND EXISTS (SELECT 1 FROM bookings w WHERE w.class_id = c.id AND w.status = 'waitlist')
        AND (SELECT COUNT(*) FROM bookings b
              WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in')) < c.max_capacity`,
    [BOOKING_LEAD_HOURS],
  );
  if (r.rows.length) await onSeatReleased(r.rows.map((x) => x.id), { source: "sweep" });
});

// Responsiva firmada — helper compartido por /bookings, /bookings/with-guest
// y /admin/bookings/assign (auditoría 2026-09-27, bloque 1, tarea 5).
const hasSignedWaiver = async (db, userId) =>
  (await db.query("SELECT 1 FROM waivers WHERE user_id = $1 LIMIT 1", [userId]).catch(() => ({ rows: [] }))).rows.length > 0;
const WAIVER_REQUIRED_MSG = "Antes de tu primera reserva necesitas leer y firmar la responsiva y consentimiento informado.";

// WhatsApp de una reserva nueva (app y asignación) según su estado final: la que
// queda en la fila usa su propia llave (bookingNotice, server/lib/waitlist.js),
// nunca la plantilla de "reserva confirmada". Las plantillas usan {firstName}.
function sendBookingNoticeWhatsApp(u, cl, status) {
  const firstName = firstNameOf(u?.display_name, "Alumna");
  const date = cl?.date ? new Date(cl.date).toLocaleDateString("es-MX") : "";
  const time = cl?.start_time ? String(cl.start_time).slice(0, 5) : "";
  const notice = bookingNotice({
    status, firstName, className: cl?.class_type_name, date, time, cutoffHours: BOOKING_LEAD_HOURS,
  });
  if (!notice) return Promise.resolve({ sent: false, reason: "no_notice" });
  return sendConfiguredWhatsAppTemplate({
    templateKey: notice.templateKey,
    phone: u?.phone,
    vars: { firstName, name: u?.display_name || firstName, class: cl?.class_type_name || "Clase", date, time },
    fallbackMessage: notice.fallbackMessage,
  });
}

// POST /api/bookings
app.post("/api/bookings", authMiddleware, async (req, res) => {
  const { classId } = req.body;
  if (!classId) return res.status(400).json({ message: "classId requerido" });
  if (!isUuid(classId)) return res.status(400).json({ message: "Identificador inválido" });
  // Gate: la primera reserva requiere la responsiva y consentimiento firmados.
  if (!(await hasSignedWaiver(pool, req.userId))) {
    return res.status(403).json({ code: "WAIVER_REQUIRED", message: WAIVER_REQUIRED_MSG });
  }
  // La política se lee antes de tomar el cliente de la transacción: con el pool
  // lleno, pedir otra conexión teniendo ésta podía dejar a la petición
  // esperándose a sí misma (misma regla que en DELETE /bookings/:id). De aquí
  // sale cancelWindowHours para el correo de "Reserva confirmada".
  let policy;
  try {
    policy = await getBookingPolicy();
  } catch (err) {
    console.error("POST bookings policy error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
  const client = await pool.connect();
  // El cliente se suelta justo después del COMMIT: la subida de la fila pide su
  // propia conexión (auditoría 2026-09-27, P1-1).
  let released = false;
  try {
    await client.query("BEGIN");

    // Lock class row to avoid overbooking in concurrent requests
    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, c.date, c.start_time,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') AS starts_at,
              ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled" || cls.status === "closed") {
      await client.query("ROLLBACK");
      return res.status(400).json({
        message: cls.status === "closed" ? "Esta clase ya no admite nuevas reservas." : "Esta clase fue cancelada",
      });
    }

    // ── Cierre de reservas: las clientas no pueden reservar dentro de las
    //    2 h previas al inicio de la clase. (El admin sí puede registrar
    //    walk-ins de último momento desde el roster.)
    if (cls.starts_at) {
      const msToStart = new Date(cls.starts_at).getTime() - Date.now();
      if (msToStart < BOOKING_LEAD_MS) {
        await client.query("ROLLBACK");
        return res.status(403).json({
          code: "BOOKING_WINDOW_CLOSED",
          message: `Las reservas cierran ${BOOKING_LEAD_HOURS} horas antes del inicio de la clase.`,
        });
      }
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const membership = await selectMembershipForClass({
      userId: req.userId,
      classCategory: clsCategory,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "No tienes una membresía activa con clases disponibles para reservar.",
      });
    }

    // Lock selected membership row to prevent double consumption. Bajo el
    // candado se revisa otra vez que siga vigente: un reembolso total o una
    // cancelación pudo confirmarse entre la elección y el candado, y en una
    // ilimitada (clases NULL) el tope de clases no lo detecta.
    const lockedMembershipRes = await client.query(
      `SELECT id, classes_remaining, status::text AS status, end_date,
              ${MEMBERSHIP_EXPIRED_SQL} AS expired
         FROM memberships WHERE id = $1 FOR UPDATE`,
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta reserva." });
    }
    if (lockedMembership.status !== "active" || lockedMembership.expired) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "MEMBERSHIP_NOT_CURRENT", message: "Tu paquete ya no está vigente." });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = categoryLabel(clsCategory);
      return res.status(403).json({
        message: `Tu membresía no incluye clases de ${label}. Necesitas una membresía ${label}, Mixta o Unlimited.`,
      });
    }
    if (membership.morning_only && !isWithinMorningWindow(cls.starts_at)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Tu paquete AM Club solo permite reservar clases matutinas (hasta las 10:00 am).",
      });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) <= 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Ya no tienes clases disponibles en tu paquete. Renueva o adquiere un nuevo plan.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, req.userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "Ya tienes una reserva para esta clase" });
    }

    // Tope semanal (planes 'Barre — N Clases por semana').
    const weeklyCheck = await checkWeeklyClassLimit(client, req.userId, membership.id, cls.date);
    if (!weeklyCheck.ok) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: weeklyCheck.message });
    }

    // Lista de espera por orden de llegada (auditoría 2026-09-27, P1-1): si ya
    // hay fila y la subida aplica, la reserva nueva entra a la fila aunque haya
    // lugar. Tras el COMMIT corre la subida: si las de adelante no pueden usar el
    // lugar, sube ella. Nadie se salta la fila y el lugar no se desperdicia.
    const liveNow = await liveBookingCount(classId, client);
    const queueFirst = queueBlocksNewBooking({
      waiting: await waitingCount(classId, client), startsAt: cls.starts_at, now: Date.now(), cutoffHours: BOOKING_LEAD_HOURS,
    });
    const insertAsWaitlist = liveNow >= cls.max_capacity || queueFirst;
    const status = insertAsWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [classId, req.userId, membership.id, status]
    );

    if (!insertAsWaitlist) {
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        // Descuenta total y, si es mixto, el bucket del área de la clase.
        await consumeMembershipCredit(client, membership.id, classId);
      }
    }
    await client.query("COMMIT");
    client.release();
    released = true;

    if (insertAsWaitlist && liveNow < cls.max_capacity) {
      await onSeatReleased([classId], { source: "new_booking", quietUserIds: [req.userId] });
      const final = await pool.query("SELECT status::text AS status FROM bookings WHERE id = $1", [result.rows[0].id]);
      if (final.rows[0]?.status) result.rows[0].status = final.rows[0].status;
    }
    // Avisos según el estado FINAL: "Reserva confirmada" sólo si quedó
    // exactamente confirmada (igual que en la asignación); la fila tiene su
    // propio aviso; otro estado (la cancelaron a media petición) no avisa.
    const finalStatus = result.rows[0].status;
    const isWaitlist = finalStatus === "waitlist";
    const isConfirmed = finalStatus === "confirmed";

    // ── Email: booking confirmed / waitlist ────────────────────────────────
    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0] && (isConfirmed || isWaitlist)) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
            waitlistCutoffHours: BOOKING_LEAD_HOURS,
            cancelHours: policy.cancelWindowHours,
          }).catch((e) => console.error("[Email] booking confirmed:", e.message));
        }
        sendBookingNoticeWhatsApp(u, cl, finalStatus)
          .catch((e) => console.error("[WA] booking confirmed:", e.message));
        // Notificación a la dueña/admins de nueva reserva (no espera la respuesta).
        if (isConfirmed) {
          const dateStr = cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "";
          const timeStr = cl.start_time ? String(cl.start_time).slice(0, 5) : "";
          notifyAdminsByTemplate(
            "admin_new_booking",
            {
              clientName: u.display_name || "Alumna",
              class: cl.class_type_name || "Clase",
              date: dateStr,
              time: timeStr,
            },
            `Nueva reserva: ${u.display_name || "Alumna"} en ${cl.class_type_name || "clase"}${dateStr ? ` el ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""}.`
          );
        }
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed query error:", emailErr.message);
    }

    const msg = isWaitlist ? "Añadido a lista de espera" : "Reserva confirmada";
    // El WhatsApp de "reserva confirmada" ya salió arriba, vía
    // sendBookingNoticeWhatsApp (respeta whatsapp_reminders, el template
    // habilitado y usa el firstName real); aquí sólo queda refrescar el pase
    // (antes se mandaba dos veces: ésta y notifyBookingConfirmed).
    if (isWaitlist) {
      triggerWalletPassSync(req.userId, "booking_waitlist_created");
    } else if (isConfirmed) {
      triggerWalletPassSync(req.userId, "booking_confirmed");
    }
    return res.status(201).json({ message: msg, booking: result.rows[0] });
  } catch (err) {
    if (!released) { try { await client.query("ROLLBACK"); } catch (_) { } }
    console.error("POST bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    if (!released) client.release();
  }
});

// DELETE /api/bookings/:id — la clienta cancela su reserva o sale de la lista de
// espera. Una sola política (auditoría 2026-09-27, P0-4):
//   - cuota de cancelaciones por paquete (settings.cancellation_settings; 0 = sin límite);
//   - ventana configurable (loyalty_config; 12 h por defecto): cancelar tarde
//     pierde la clase y cuenta como falta.
// Salir de la lista de espera no consulta ni suma la cuota, ni cuenta como falta.
// Una reserva con asistencia o falta ya no se cancela desde la app. Si se libera
// un lugar, sube la fila (onSeatReleased, después del COMMIT y con el pool libre).
// ?expect=waitlist: la app cree que la reserva sigue en la fila. Si ya subió, 409
// ALREADY_PROMOTED sin tocar nada; se revisa con la reserva bloqueada, así que
// la subida y la salida no se cruzan.
app.delete("/api/bookings/:id", authMiddleware, async (req, res) => {
  // La política se lee antes de tomar el cliente: con el pool lleno, pedir otra
  // conexión teniendo ésta podía dejar a la petición esperándose a sí misma.
  let policy;
  try {
    policy = await getBookingPolicy();
  } catch (err) {
    console.error("DELETE bookings policy error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
  const expectWaitlist = req.query?.expect === "waitlist";
  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");

    // Load + LOCK booking (FOR UPDATE OF b) para serializar cancelaciones
    // concurrentes: con doble-clic, la 2ª petición espera y ve status
    // 'cancelled' → aborta. Evita doble devolución de crédito / doble falta.
    const r = await client.query(
      `SELECT b.*, c.date, c.start_time, ct.name AS class_type_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.id = $1 AND b.user_id = $2
       FOR UPDATE OF b`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const booking = r.rows[0];

    let membership = null;
    if (booking.membership_id) {
      const memRes = await client.query(
        "SELECT id, classes_remaining, cancellations_used, plan_id FROM memberships WHERE id = $1 FOR UPDATE",
        [booking.membership_id]
      );
      membership = memRes.rows[0] ?? null;
    }
    const limit = membership ? policy.cancellationLimit : 0;
    const decision = clientCancelDecision({ bookingStatus: booking.status, used: membership?.cancellations_used ?? 0, limit, expectWaitlist });
    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(decision.status).json({ code: decision.code, message: decision.message });
    }

    // Ventana para devolver la clase: hora del estudio contra el inicio real.
    const classStartRes = await client.query(
      `SELECT (c.date + c.start_time::time) AT TIME ZONE '${STUDIO_TIMEZONE}' AS class_start_utc
       FROM classes c WHERE c.id = $1`,
      [booking.class_id]
    );
    const classStartUTC = classStartRes.rows[0]?.class_start_utc ? new Date(classStartRes.rows[0].class_start_utc) : null;
    const minutesUntilClass = classStartUTC ? (classStartUTC.getTime() - Date.now()) / 60_000 : 999;
    const isLate = decision.countsTowardQuota && isWithinCancelWindow(minutesUntilClass, policy.cancelWindowHours);

    await client.query("UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1", [req.params.id]);
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).

    let used = Number(membership?.cancellations_used ?? 0);
    if (decision.countsTowardQuota && membership) {
      const up = await client.query(
        "UPDATE memberships SET cancellations_used = COALESCE(cancellations_used, 0) + 1 WHERE id = $1 RETURNING cancellations_used",
        [membership.id]
      );
      used = Number(up.rows[0]?.cancellations_used ?? used + 1);
      // A tiempo: la clase regresa al paquete (si tiene tope). Tarde: se pierde.
      if (!isLate && !isUnlimitedClasses(membership.classes_remaining)) {
        await restoreMembershipCredit(client, membership.id, booking.class_id);
      }
    }
    const creditRestored = decision.countsTowardQuota && !isLate;

    await client.query("COMMIT");
    client.release();
    released = true;

    // ── Después del COMMIT (pool libre) ─────────────────────────────────────
    // Falta por cancelación tardía (misma ventana). Excluye invitadas.
    if (decision.countsTowardQuota && isLate && !booking.guest_profile_id) {
      try {
        await recordFalta({ userId: req.userId, reason: `cancelación dentro de ${policy.cancelWindowHours}h` });
      } catch (e) { console.warn("[faltas] late-cancel:", e.message); }
    }
    // Se liberó un lugar: sube la primera de la fila que pueda usarlo (P1-1).
    if (decision.freesSeat) await onSeatReleased([booking.class_id], { source: "client_cancel" });

    // Correo + WhatsApp sólo al cancelar una reserva (salir de la fila no avisa).
    if (!decision.leavingWaitlist) {
      try {
        const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
        const memAfter = membership
          ? await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id])
          : null;
        if (uRes.rows[0]) {
          const u = uRes.rows[0];
          if (await areEmailNotificationsEnabled()) {
            sendBookingCancelled({
              to: u.email,
              name: u.display_name || "Alumna",
              className: booking.class_type_name || "tu clase",
              date: booking.date,
              startTime: booking.start_time,
              creditRestored,
              isLate,
              classesLeft: memAfter?.rows[0]?.classes_remaining ?? null,
              cancelHours: policy.cancelWindowHours,
            }).catch((e) => console.error("[Email] booking cancelled:", e.message));
          }
          sendConfiguredWhatsAppTemplate({
            templateKey: "booking_cancelled",
            phone: u.phone,
            vars: {
              name: u.display_name || "Alumna",
              class: booking.class_type_name || "tu clase",
              date: booking.date ? new Date(booking.date).toLocaleDateString("es-MX") : "",
              time: booking.start_time ? String(booking.start_time).slice(0, 5) : "",
              creditRestored: creditRestored ? "Sí" : "No",
            },
            fallbackMessage: isLate
              ? `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. La clase no se devolvió por cancelación tardía.`
              : `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. Tu crédito fue devuelto.`,
          }).catch((e) => console.error("[WA] booking cancelled:", e.message));
        }
      } catch (emailErr) {
        console.error("[Email] cancelled query:", emailErr.message);
      }
    }

    triggerWalletPassSync(req.userId, decision.leavingWaitlist ? "waitlist_left" : isLate ? "booking_cancelled_late" : "booking_cancelled");
    const quota = cancellationQuota({ used, limit });
    return res.json({
      message: decision.leavingWaitlist
        ? "Saliste de la lista de espera. No usa una cancelación de tu paquete."
        : isLate
          ? `Reserva cancelada. Por cancelar con menos de ${policy.cancelWindowHours} horas de anticipación, la clase cuenta como utilizada y NO se devuelve a tu paquete.`
          : "Reserva cancelada. Se devolvió el crédito a tu paquete.",
      creditRestored,
      leftWaitlist: decision.leavingWaitlist,
      cancellationsUsed: quota.used,
      cancellationLimit: limit,
      cancellationsLeft: quota.left,
      cancelWindowHours: policy.cancelWindowHours,
    });
  } catch (err) {
    if (!released) { try { await client.query("ROLLBACK"); } catch (_) { } }
    console.error("DELETE bookings error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    if (!released) client.release();
  }
});

// POST /api/reviews
app.post("/api/reviews", authMiddleware, async (req, res) => {
  const { bookingId, rating, comment, tagIds } = req.body;
  if (!bookingId || !rating) return res.status(400).json({ message: "bookingId y rating requeridos" });
  try {
    const safeRating = Math.max(1, Math.min(5, Number(rating)));
    if (!Number.isFinite(safeRating)) {
      return res.status(400).json({ message: "rating inválido" });
    }
    // Verify booking belongs to user and was attended
    const bRes = await pool.query(
      `SELECT b.id, b.status, c.id AS class_id, c.instructor_id
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       WHERE b.id = $1 AND b.user_id = $2`,
      [bookingId, req.userId]
    );
    if (bRes.rows.length === 0) return res.status(404).json({ message: "Reserva no encontrada" });
    const booking = bRes.rows[0];
    // Solo se puede reseñar una clase efectivamente asistida (check-in).
    if (booking.status !== "checked_in") {
      return res.status(403).json({ message: "Solo puedes reseñar una clase a la que asististe." });
    }

    // Check if already reviewed
    const existing = await pool.query("SELECT id FROM reviews WHERE booking_id = $1", [bookingId]);
    if (existing.rows.length > 0) return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });

    // Compatible insert for both schemas:
    // - reviews.rating (legacy/current)
    // - reviews.overall_rating (production variants)
    const colRes = await pool.query(
      `SELECT a.attname AS column_name
       FROM pg_attribute a
       JOIN pg_class c ON a.attrelid = c.oid
       JOIN pg_namespace n ON c.relnamespace = n.oid
       WHERE n.nspname='public'
         AND c.relname='reviews'
         AND a.attnum > 0
         AND NOT a.attisdropped
         AND a.attname = ANY($1::text[])`,
      [["rating", "overall_rating", "tag_ids"]]
    );
    const hasRating = colRes.rows.some((r) => r.column_name === "rating");
    const hasOverallRating = colRes.rows.some((r) => r.column_name === "overall_rating");
    const hasTagIds = colRes.rows.some((r) => r.column_name === "tag_ids");

    const insertCols = ["user_id", "booking_id", "class_id", "instructor_id"];
    const insertVals = [req.userId, bookingId, booking.class_id, booking.instructor_id || null];

    if (hasRating) {
      insertCols.push("rating");
      insertVals.push(safeRating);
    }
    if (hasOverallRating) {
      insertCols.push("overall_rating");
      insertVals.push(safeRating);
    }

    insertCols.push("comment");
    insertVals.push(comment || null);

    if (hasTagIds) {
      insertCols.push("tag_ids");
      insertVals.push(tagIds || []);
    }

    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(", ");

    let review;
    try {
      const rRes = await pool.query(
        `INSERT INTO reviews (${insertCols.join(", ")})
         VALUES (${placeholders}) RETURNING *`,
        insertVals
      );
      review = rRes.rows[0];
    } catch (insertErr) {
      // Safety retry for schemas where overall_rating exists but wasn't detected
      const shouldRetry =
        insertErr?.code === "23502" &&
        insertErr?.column === "overall_rating" &&
        !insertCols.includes("overall_rating");

      if (!shouldRetry) throw insertErr;

      const retryCols = [...insertCols];
      const retryVals = [...insertVals];
      const insertAt = hasRating ? retryCols.indexOf("rating") + 1 : 4;
      retryCols.splice(insertAt, 0, "overall_rating");
      retryVals.splice(insertAt, 0, safeRating);
      const retryPlaceholders = retryCols.map((_, i) => `$${i + 1}`).join(", ");

      const retryRes = await pool.query(
        `INSERT INTO reviews (${retryCols.join(", ")})
         VALUES (${retryPlaceholders}) RETURNING *`,
        retryVals
      );
      review = retryRes.rows[0];
    }

    // Insert tag links
    if (Array.isArray(tagIds) && tagIds.length > 0) {
      for (const tagId of tagIds) {
        await pool.query(
          "INSERT INTO review_tag_links (review_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [review.id, tagId]
        ).catch(() => {});
      }
    }

    return res.json({ message: "Reseña enviada — gracias por tu opinión", data: review });
  } catch (err) {
    if (
      err?.code === "23505" &&
      String(err?.detail || err?.message || "").toLowerCase().includes("booking_id")
    ) {
      return res.status(409).json({ message: "Ya dejaste una reseña para esta clase" });
    }
    console.error("POST reviews error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/orders ────────────────────────────────────────────────────

// GET /api/orders
app.get("/api/orders", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days
       FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
       WHERE o.user_id = $1
       ORDER BY o.created_at DESC`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET orders error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/orders/:id
app.get("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT o.*, p.name AS plan_name, p.duration_days, p.features,
              pp.file_url AS proof_url, pp.status AS proof_status, pp.uploaded_at AS proof_uploaded_at
       FROM orders o
       LEFT JOIN plans p ON o.plan_id = p.id
       LEFT JOIN payment_proofs pp ON pp.order_id = o.id
       WHERE o.id = $1 AND o.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "Orden no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("GET orders/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── Activate a Stripe-paid order (called from webhook, never from HTTP) ────
async function finalizeStripeOrder(client, orderId) {
  const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
  if (!orderRes.rows.length) throw new Error(`Order ${orderId} not found`);
  const order = orderRes.rows[0];

  if (order.status === "approved") return; // already activated — idempotent

  await client.query(
    "UPDATE orders SET status = 'approved', verified_at = NOW() WHERE id = $1",
    [orderId]
  );

  if (!order.plan_id || !order.user_id) return;

  const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
  if (!planRes.rows.length) return;
  const plan = planRes.rows[0];

  // Carry-over: cancel active memberships and transfer remaining credits
  let carryOver = 0;
  const activeMemberships = await client.query(
    `SELECT id, classes_remaining FROM memberships
      WHERE user_id = $1 AND status = 'active' AND classes_remaining > 0`,
    [order.user_id]
  );
  if (activeMemberships.rows.length > 0) {
    for (const m of activeMemberships.rows) {
      carryOver += Number(m.classes_remaining) || 0;
    }
    const oldIds = activeMemberships.rows.map((m) => m.id);
    await client.query(
      `UPDATE memberships
          SET status = 'cancelled',
              cancellation_reason = 'Renovación: créditos transferidos a nueva membresía',
              cancelled_at = NOW(),
              end_date = NOW()
        WHERE id = ANY($1::uuid[])`,
      [oldIds]
    );
  }

  const newCredits = (plan.class_limit ?? 0) + carryOver;
  const end = new Date();
  end.setDate(end.getDate() + (plan.duration_days || 30));

  const existing = await client.query(
    `SELECT id FROM memberships WHERE order_id = $1 AND COALESCE(is_addon, false) = false`,
    [orderId]
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE memberships SET status = 'active', classes_remaining = $1 WHERE id = $2`,
      [newCredits, existing.rows[0].id]
    );
    // Re-reparte buckets si es mixto (el UPDATE no dispara el trigger de alta).
    await resyncMixtoBuckets(client, existing.rows[0].id);
  } else {
    await client.query(
      `INSERT INTO memberships
          (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
         VALUES ($1, $2, 'active', 'card', NOW(), $3, $4, $5)`,
      [order.user_id, order.plan_id, end.toISOString(), newCredits, orderId]
    );
  }

  if (order.discount_code_id) {
    await incrementDiscountUsage(order.discount_code_id, client);
  }

  // Empuja la actualización del pase (Apple APNs + Google object) tras activar
  // por tarjeta. El sync es diferido (debounce interno), así que lee la
  // membresía ya commiteada — antes faltaba y por eso la compra con tarjeta no
  // disparaba notificación al pase (las de transferencia sí, al verificarlas).
  triggerWalletPassSync(order.user_id, "stripe_payment_completed");
}

// ── Generate short order number: OPH-YYMM-XXXX ──
async function generateOrderNumber(client) {
  const now = new Date();
  const prefix = `OPH-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const res = await client.query(
    `SELECT COUNT(*)::int AS cnt FROM orders WHERE order_number LIKE $1`,
    [prefix + "-%"]
  );
  const seq = (res.rows[0]?.cnt ?? 0) + 1;
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

// ── POST /api/stripe/webhook ───────────────────────────────────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = verifyWebhookSignature(req.body, sig);
    } catch (err) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ message: "Invalid signature" });
    }

    const eventId = event.id;

    // Dedup: ignore already-processed events (PRIMARY KEY violation = duplicate)
    try {
      await pool.query(
        "INSERT INTO stripe_webhook_events (event_id) VALUES ($1)",
        [eventId]
      );
    } catch (_dupErr) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await handleStripeEvent(client, event);
      await client.query("COMMIT");
      return res.status(200).json({ received: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // Delete dedup row so Stripe retries this event
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]).catch(() => {});
      console.error("[Stripe Webhook] Handler error for", eventId, ":", err.message);
      return res.status(500).json({ message: "Webhook handler error" });
    } finally {
      client.release();
    }
  }
);

// ── Stripe event dispatcher ────────────────────────────────────────────────
async function handleStripeEvent(client, event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (!orderId) {
        console.warn("[Stripe] checkout.session.completed missing order_id in metadata");
        return;
      }
      // Update Stripe fields on the order regardless of payment_status
      await client.query(
        `UPDATE orders SET
            stripe_session_id        = $1,
            stripe_payment_intent_id = $2,
            stripe_payment_status    = $3,
            payment_provider         = 'stripe'
          WHERE id = $4`,
        [session.id, session.payment_intent ?? null, session.payment_status, orderId]
      );
      // Only activate when fully paid (card). OXXO arrives as 'unpaid' here —
      // activation waits for payment_intent.succeeded below.
      if (session.payment_status === "paid") {
        await finalizeStripeOrder(client, orderId);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET status = 'expired', stripe_session_id = $1
          WHERE id = $2 AND status = 'pending_payment'`,
        [session.id, orderId]
      );
      break;
    }

    case "payment_intent.succeeded": {
      // Handles OXXO: session.completed arrives 'unpaid', this fires when cash collected
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET stripe_payment_intent_id = $1, stripe_payment_status = 'paid'
          WHERE id = $2`,
        [pi.id, orderId]
      );
      await finalizeStripeOrder(client, orderId);
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET stripe_payment_status = 'failed', stripe_payment_intent_id = $1
          WHERE id = $2`,
        [pi.id, orderId]
      );
      break;
    }

    case "charge.refunded":
    case "charge.dispute.created":
      console.log(`[Stripe] ${event.type}: ${event.data.object.id} — review in Stripe Dashboard`);
      break;

    default:
      // Unhandled event types — Stripe sends many, silence is intentional
      break;
  }
}

// POST /api/orders
app.post("/api/orders", authMiddleware, async (req, res) => {
  const { planId, discountCode, paymentMethod = "transfer" } = req.body;
  if (!planId) return res.status(400).json({ message: "planId requerido" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (planRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = planRes.rows[0];

    const generalForPrice = await getSettingValueWithDefaults("general_settings");
    const effectivePrice = resolveEffectivePrice(plan, generalForPrice?.opening_pricing_active !== false);

    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: req.userId, plan, client });
    if (nonRepeatableConflict) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }

    const subtotal = parseFloat(effectivePrice);
    let discount = 0;
    let appliedDiscountCode = null;

    if (discountCode) {
      const discountResult = await findApplicableDiscountCode({
        code: discountCode,
        subtotal,
        planId,
        classCategory: normalizeClassCategory(plan.class_category, "all"),
        channel: "membership",
        client,
      });
      if (!discountResult) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Código de descuento no válido para este plan" });
      }
      if (discountResult.rejectedByMinOrder) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
        });
      }
      discount = discountResult.discountAmount;
      appliedDiscountCode = discountResult.code;
    }

    const total = subtotal - discount;
    const bankInfo = await getConfiguredBankInfo(client);
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    const orderNumber = await generateOrderNumber(client);
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount, discount_code_id, bank_info, expires_at, order_number)
       VALUES ($1, $2, 'pending_payment', $3, $4, 0, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.userId,
        planId,
        paymentMethod,
        subtotal,
        total,
        discount,
        appliedDiscountCode?.id ?? null,
        JSON.stringify(bankInfo),
        expires,
        orderNumber,
      ]
    );

    await client.query("COMMIT");

    const order = orderRes.rows[0];

    // ── Card: create Stripe Checkout Session ──────────────────────────────
    if (paymentMethod === "card") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ message: "Pagos con tarjeta no disponibles en este momento" });
      }
      try {
        const customerId = await createOrGetStripeCustomer(pool, req.userId);
        const session = await createCheckoutSession(pool, {
          order,
          plan,
          totalAmount: total,
          customerId,
        });
        await pool.query(
          `UPDATE orders SET
              stripe_session_id   = $1,
              stripe_checkout_url = $2,
              payment_provider    = 'stripe'
            WHERE id = $3`,
          [session.id, session.url, order.id]
        );
        return res.status(201).json({
          data: {
            ...order,
            plan_name: plan.name,
            checkout_url: session.url,
          },
        });
      } catch (stripeErr) {
        // Log con type/code para diagnosticar en Railway (api version, key, etc.)
        console.error("[Stripe] createCheckoutSession error:", stripeErr?.message, "| type:", stripeErr?.type, "| code:", stripeErr?.code);
        return res.status(502).json({
          message: "Error al crear sesión de pago. Intenta de nuevo.",
          detail: stripeErr?.message ?? null,
        });
      }
    }

    // ── Transfer / cash ───────────────────────────────────────────────────
    return res.status(201).json({
      data: {
        ...order,
        plan_name: plan.name,
        bank_details: { ...bankInfo, amount: total, currency: "MXN" },
      },
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("POST orders error:", err);
    return res.status(500).json({ message: err?.message || "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/orders/:id/proof  (multipart)
app.post("/api/orders/:id/proof", authMiddleware, upload.any(), async (req, res) => {
  try {
    const orderRes = await pool.query(
      "SELECT * FROM orders WHERE id = $1 AND user_id = $2",
      [req.params.id, req.userId]
    );
    if (orderRes.rows.length === 0) return res.status(404).json({ message: "Orden no encontrada" });

    // Accept any uploaded field name ("proof", "file", etc.)
    const uploadedFile = req.files?.[0] ?? req.file ?? null;

    let fileUrl, fileName, mimeType;
    if (uploadedFile) {
      mimeType = uploadedFile.mimetype;
      fileName = uploadedFile.originalname;
      // Sube el comprobante a Google Drive si está configurado (evita inflar la BD
      // con base64 y mantener ligeras las listas). Si no, cae a base64 (dev).
      const driveConfigured = Boolean(
        process.env.GOOGLE_DRIVE_FOLDER_ID && process.env.GOOGLE_CLIENT_ID &&
        process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
      );
      if (driveConfigured) {
        try {
          const token = await getGoogleDriveAccessToken();
          const up = await uploadBufferToDrive(
            uploadedFile.buffer,
            `comprobante_${req.params.id}_${Date.now()}_${fileName}`,
            mimeType,
            token
          );
          await makeGoogleDriveFilePublic(up.id, token);
          fileUrl = `/api/drive/image/${up.id}`;
        } catch (e) {
          console.warn("[proof] Drive upload falló, fallback base64:", e?.message);
          fileUrl = `data:${mimeType};base64,${uploadedFile.buffer.toString("base64")}`;
        }
      } else {
        fileUrl = `data:${mimeType};base64,${uploadedFile.buffer.toString("base64")}`;
      }
    } else if (req.body.fileUrl) {
      fileUrl = req.body.fileUrl;
      fileName = req.body.fileName || "comprobante";
      mimeType = req.body.mimeType || "application/octet-stream";
    } else {
      return res.status(400).json({ message: "No se recibió ningún archivo" });
    }

    const updateRes = await pool.query(
      `UPDATE payment_proofs 
       SET file_url = $2, file_name = $3, mime_type = $4, status = 'pending', uploaded_at = NOW()
       WHERE order_id = $1 RETURNING id`,
      [req.params.id, fileUrl, fileName, mimeType]
    );

    if (updateRes.rowCount === 0) {
      await pool.query(
        `INSERT INTO payment_proofs (order_id, file_url, file_name, mime_type, status)
         VALUES ($1, $2, $3, $4, 'pending')`,
        [req.params.id, fileUrl, fileName, mimeType]
      );
    }
    await pool.query(
      "UPDATE orders SET status = 'pending_verification', paid_at = COALESCE(paid_at, NOW()) WHERE id = $1",
      [req.params.id]
    );
    return res.json({ message: "Comprobante recibido — estamos verificando tu pago" });
  } catch (err) {
    console.error("POST orders/proof error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/discount-codes ────────────────────────────────────────────

// POST /api/discount-codes/validate
app.post("/api/discount-codes/validate", authMiddleware, async (req, res) => {
  const { code, planId, classCategory, channel } = req.body;
  if (!code) return res.status(400).json({ message: "Código requerido" });
  try {
    const planRes = await pool.query("SELECT price, class_category FROM plans WHERE id = $1", [planId || null]);
    const originalPrice = planRes.rows.length > 0 ? parseFloat(planRes.rows[0].price) : 0;
    const effectiveCategory = normalizeClassCategory(
      classCategory ?? planRes.rows[0]?.class_category ?? "all",
      "all"
    );
    const discountResult = await findApplicableDiscountCode({
      code,
      subtotal: originalPrice,
      planId: planId || null,
      classCategory: effectiveCategory,
      channel: channel || "membership",
    });
    if (!discountResult) return res.status(404).json({ message: "Código no válido o expirado" });
    if (discountResult.rejectedByMinOrder) {
      return res.status(400).json({
        message: `Compra mínima requerida: $${Number(discountResult.minOrderAmount || 0).toFixed(2)} MXN`,
      });
    }
    const dc = discountResult.code;
    const discount = discountResult.discountAmount;
    return res.json({
      data: {
        code: dc.code,
        discount_type: dc.discount_type,
        discount_value: parseFloat(dc.discount_value),
        discount_amount: Math.min(discount, originalPrice),
        final_price: Math.max(originalPrice - discount, 0),
      }
    });
  } catch (err) {
    console.error("Discount validate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/wallet ────────────────────────────────────────────────────

// GET /api/wallet/pass
app.get("/api/wallet/pass", authMiddleware, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT email, display_name FROM users WHERE id = $1 LIMIT 1", [req.userId]);
    const userName = userRes.rows[0]?.display_name || userRes.rows[0]?.email || PASS_DEFAULT_TEXTS.memberFallbackName;
    const pointsRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const total = parseInt(pointsRes.rows[0].total);
    const passesRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              ep.used_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ep.user_id = $1
          AND ep.status <> 'cancelled'
        ORDER BY e.date DESC, e.start_time DESC
        LIMIT 20`,
      [req.userId]
    );
    let membership = null;
    try {
      const memRes = await pool.query(
        `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
                m.plan_name_override, m.class_limit_override,
                p.name AS plan_name, p.class_limit AS plan_class_limit,
                p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
           FROM memberships m
      LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1
            AND m.status = 'active'
            AND m.end_date >= CURRENT_DATE
       ORDER BY m.end_date DESC
          LIMIT 1`,
        [req.userId]
      );
      if (memRes.rows.length > 0) {
        const m = memRes.rows[0];
        membership = {
          id: m.id,
          status: m.status,
          plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
          class_limit: m.class_limit_override ?? m.plan_class_limit,
          classes_remaining: m.classes_remaining,
          start_date: m.start_date,
          end_date: m.end_date,
          class_category: normalizeClassCategory(m.class_category, "all"),
          is_non_transferable: parseBooleanFlag(m.is_non_transferable),
          is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
          repeat_key: m.repeat_key || null,
        };
      }
    } catch (memErr) {
      console.error("Wallet/pass membership error:", memErr.message);
    }
    let nextBooking = null;
    try {
      const bookRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_name, i.display_name AS instructor_name
           FROM bookings b
           JOIN classes c ON b.class_id = c.id
           JOIN class_types ct ON c.class_type_id = ct.id
      LEFT JOIN instructors i ON c.instructor_id = i.id
          WHERE b.user_id = $1
            AND b.status IN ('confirmed', 'waitlist')
            AND c.date >= CURRENT_DATE
       ORDER BY c.date ASC, c.start_time ASC
          LIMIT 1`,
        [req.userId],
      );
      if (bookRes.rows.length > 0) nextBooking = bookRes.rows[0];
    } catch (bookErr) {
      console.error("Wallet/pass next booking error:", bookErr.message);
    }
    // QR data: user ID encoded
    const qrData = Buffer.from(req.userId).toString("base64");
    return res.json({
      data: {
        user_name: userName,
        points: total,
        qr_code: qrData,
        membership,
        next_booking: nextBooking,
        event_passes: passesRes.rows.map((row) => ({
          id: row.id,
          passCode: row.pass_code,
          status: row.status,
          issuedAt: row.issued_at,
          usedAt: row.used_at,
          eventId: row.event_id,
          eventTitle: row.event_title,
          eventDate: row.event_date ? String(row.event_date).slice(0, 10) : null,
          eventStartTime: row.event_start_time ? String(row.event_start_time).slice(0, 5) : null,
        })),
      },
    });
  } catch (err) {
    console.error("Wallet/pass error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/notifications — feed unificado de eventos del studio para la dueña.
app.get("/api/admin/notifications", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lastReadRes = await pool.query(
      "SELECT admin_notifications_last_read_at FROM users WHERE id = $1",
      [req.userId],
    );
    const lastReadAt = lastReadRes.rows[0]?.admin_notifications_last_read_at;
    const lastReadMs = lastReadAt ? new Date(lastReadAt).getTime() : 0;

    const [users, orders, milestones, checkins, campaigns, rejected, expiring] = await Promise.all([
      // Nuevas alumnas registradas (últimos 30d)
      pool.query(
        `SELECT id, display_name, email, phone, created_at
           FROM users
          WHERE role = 'client' AND created_at > $1
          ORDER BY created_at DESC LIMIT 20`,
        [cutoff30],
      ),
      // Órdenes pendientes de verificación (recientes)
      pool.query(
        `SELECT o.id, o.total_amount, o.status, o.created_at, u.display_name AS user_name
           FROM orders o
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.status IN ('pending_verification', 'pending_payment')
            AND o.created_at > $1
          ORDER BY o.created_at DESC LIMIT 20`,
        [cutoff30],
      ),
      // Milestones otorgados (recientes)
      pool.query(
        `SELECT a.id, a.classes_at_award, a.awarded_at, m.name AS milestone_name,
                m.award_points, u.display_name AS user_name
           FROM loyalty_milestone_awards a
           JOIN loyalty_milestones m ON m.id = a.milestone_id
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.awarded_at > $1
          ORDER BY a.awarded_at DESC LIMIT 20`,
        [cutoff30],
      ),
      // Check-ins (recientes)
      pool.query(
        `SELECT b.id, b.checked_in_at, ct.name AS class_name, u.display_name AS user_name
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
           JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN users u ON u.id = b.user_id
          WHERE b.status = 'checked_in' AND b.checked_in_at > $1
          ORDER BY b.checked_in_at DESC LIMIT 20`,
        [new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)],
      ),
      // Campañas enviadas (recientes)
      pool.query(
        `SELECT id, name, segment, total_targets, total_sent, total_failed, status, created_at, completed_at
           FROM campaigns
          WHERE created_at > $1
          ORDER BY created_at DESC LIMIT 10`,
        [cutoff30],
      ),
      // Órdenes rechazadas (recientes)
      pool.query(
        `SELECT o.id, o.total_amount, o.created_at, u.display_name AS user_name
           FROM orders o
           LEFT JOIN users u ON u.id = o.user_id
          WHERE o.status = 'rejected' AND o.created_at > $1
          ORDER BY o.created_at DESC LIMIT 10`,
        [cutoff30],
      ),
      // Membresías por vencer próximos 7 días
      pool.query(
        `SELECT m.id, m.end_date, p.name AS plan_name, u.display_name AS user_name
           FROM memberships m
           LEFT JOIN plans p ON p.id = m.plan_id
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.status = 'active'
            AND m.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
          ORDER BY m.end_date ASC LIMIT 15`,
      ),
    ]);

    const items = [
      ...users.rows.map((r) => ({
        id: `u_${r.id}`,
        category: "new_user",
        title: "Nueva alumna registrada",
        body: r.display_name + (r.email ? ` · ${r.email}` : ""),
        time: r.created_at,
        link: `/admin/clients/${r.id}`,
      })),
      ...orders.rows.map((r) => ({
        id: `o_${r.id}`,
        category: "order_pending",
        title: r.status === "pending_verification" ? "Orden por verificar" : "Orden pendiente de pago",
        body: `${r.user_name || "Alumna"} · $${Number(r.total_amount || 0).toLocaleString("es-MX")}`,
        time: r.created_at,
        link: "/admin/orders",
      })),
      ...milestones.rows.map((r) => ({
        id: `aw_${r.id}`,
        category: "milestone",
        title: `Logro otorgado: ${r.milestone_name}`,
        body: `${r.user_name || "Alumna"} · ${r.classes_at_award} clases · +${r.award_points} pts`,
        time: r.awarded_at,
        link: "/admin/loyalty",
      })),
      ...checkins.rows.map((r) => ({
        id: `c_${r.id}`,
        category: "checkin",
        title: "Check-in",
        body: `${r.user_name || "Alumna"} · ${r.class_name}`,
        time: r.checked_in_at,
        link: "/admin/bookings",
      })),
      ...campaigns.rows.map((r) => ({
        id: `cp_${r.id}`,
        category: "campaign",
        title: `Campaña ${r.status === "completed" ? "completada" : r.status === "sending" ? "enviando" : r.status}`,
        body: `${r.name} · ${r.total_sent}/${r.total_targets} enviadas${r.total_failed ? ` · ${r.total_failed} fallaron` : ""}`,
        time: r.completed_at || r.created_at,
        link: "/admin/campaigns",
      })),
      ...rejected.rows.map((r) => ({
        id: `or_${r.id}`,
        category: "order_rejected",
        title: "Orden rechazada",
        body: `${r.user_name || "Alumna"} · $${Number(r.total_amount || 0).toLocaleString("es-MX")}`,
        time: r.created_at,
        link: "/admin/orders",
      })),
      ...expiring.rows.map((r) => {
        const days = Math.ceil((new Date(r.end_date) - new Date()) / 86400000);
        return {
          id: `exp_${r.id}`,
          category: "expiring",
          title: days <= 0 ? "Membresía vence hoy" : days === 1 ? "Membresía vence mañana" : `Membresía vence en ${days} días`,
          body: `${r.user_name || "Alumna"} · ${r.plan_name || "Paquete"}`,
          time: r.end_date,
          link: "/admin/memberships",
        };
      }),
    ]
      .filter((x) => x.time)
      .map((x) => ({ ...x, unread: lastReadMs === 0 || new Date(x.time).getTime() > lastReadMs }))
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, limit);

    return res.json({
      data: items,
      meta: {
        unread_count: items.filter((x) => x.unread).length,
        last_read_at: lastReadAt,
      },
    });
  } catch (err) {
    console.error("[admin/notifications]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/notifications/mark-read — dueña marca toda la bandeja como leída
app.post("/api/admin/notifications/mark-read", adminMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET admin_notifications_last_read_at = NOW() WHERE id = $1",
      [req.userId],
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/notifications/unread-count — lightweight para badge en sidebar
app.get("/api/admin/notifications/unread-count", adminMiddleware, async (req, res) => {
  try {
    const u = await pool.query("SELECT admin_notifications_last_read_at FROM users WHERE id = $1", [req.userId]);
    const lastReadAt = u.rows[0]?.admin_notifications_last_read_at;
    // Si nunca leyó, cuenta los últimos 30d (cap razonable para nuevo admin).
    const cutoff = lastReadAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const r = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM users WHERE role='client' AND created_at > $1) +
        (SELECT COUNT(*)::int FROM orders WHERE status IN ('pending_verification', 'pending_payment') AND created_at > $1) +
        (SELECT COUNT(*)::int FROM loyalty_milestone_awards WHERE awarded_at > $1) +
        (SELECT COUNT(*)::int FROM bookings WHERE status = 'checked_in' AND checked_in_at > $1) +
        (SELECT COUNT(*)::int FROM campaigns WHERE COALESCE(completed_at, created_at) > $1) +
        (SELECT COUNT(*)::int FROM orders WHERE status = 'rejected' AND created_at > $1) +
        (SELECT COUNT(*)::int FROM memberships WHERE status = 'active'
          AND end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days'))
        AS n`,
      [cutoff],
    );
    return res.json({ data: { unread_count: r.rows[0]?.n || 0 } });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/me/notifications — feed unificado de eventos para la alumna.
// Une motivation_sends, milestone_awards, loyalty_transactions y bookings
// recientes, ordenado por fecha descendente. Útil para /app/notifications.
app.get("/api/me/notifications", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    // 1) Motivation/milestone WhatsApp templates enviados
    const motivRes = await pool.query(
      `SELECT 'motivation' AS source, id, template_key AS title, sent_at AS occurred_at
         FROM motivation_sends
        WHERE user_id = $1
        ORDER BY sent_at DESC LIMIT $2`,
      [userId, limit],
    );

    // 2) Milestones desbloqueados con info del milestone
    const mileRes = await pool.query(
      `SELECT 'milestone' AS source, a.id, m.name AS title, m.award_points AS points,
              a.classes_at_award AS classes, a.awarded_at AS occurred_at
         FROM loyalty_milestone_awards a
         JOIN loyalty_milestones m ON m.id = a.milestone_id
        WHERE a.user_id = $1
        ORDER BY a.awarded_at DESC LIMIT $2`,
      [userId, limit],
    );

    // 3) Transacciones de puntos (earn / spend / adjust)
    const txRes = await pool.query(
      `SELECT 'transaction' AS source, id, type, points, description AS title, created_at AS occurred_at
         FROM loyalty_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC LIMIT $2`,
      [userId, limit],
    );

    // 4) Bookings recientes (confirmados / atendidos / cancelados)
    const bookRes = await pool.query(
      `SELECT 'booking' AS source, b.id, b.status, ct.name AS class_name,
              c.date, c.start_time, b.created_at, b.checked_in_at,
              GREATEST(b.checked_in_at, b.created_at) AS occurred_at
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
         JOIN class_types ct ON ct.id = c.class_type_id
        WHERE b.user_id = $1
          AND b.status IN ('confirmed', 'checked_in', 'cancelled')
        ORDER BY GREATEST(b.checked_in_at, b.created_at) DESC LIMIT $2`,
      [userId, limit],
    );

    // Lookup last_read_at para marcar unread
    const userRes = await pool.query(
      "SELECT notifications_last_read_at FROM users WHERE id = $1",
      [userId],
    );
    const lastReadAt = userRes.rows[0]?.notifications_last_read_at;
    const lastReadMs = lastReadAt ? new Date(lastReadAt).getTime() : 0;

    const linkForCategory = (cat) => {
      switch (cat) {
        case "booking": return "/app/bookings";
        case "milestone": return "/app/wallet/rewards";
        case "loyalty_earn":
        case "loyalty_spend": return "/app/wallet/history";
        case "membership": return "/app/profile/membership";
        case "marketing": return "/app/checkout";
        case "motivation":
        case "system":
        default: return "/app";
      }
    };

    // Mergear y ordenar
    const items = [
      ...motivRes.rows.map((r) => {
        const k = String(r.title || "");
        const cat = k.startsWith("milestone_") ? "milestone"
          : k.startsWith("motivation_") ? "motivation"
          : k.startsWith("promo_") ? "marketing"
          : k.startsWith("class_") || k.startsWith("booking_") ? "booking"
          : k.startsWith("membership_") || k.startsWith("renewal_") ? "membership"
          : "system";
        return {
          id: `m_${r.id}`,
          category: cat,
          title: prettyTemplateKey(k),
          body: humanizeMotivationKey(k),
          time: r.occurred_at,
          link: linkForCategory(cat),
        };
      }),
      ...mileRes.rows.map((r) => ({
        id: `award_${r.id}`,
        category: "milestone",
        title: `Logro desbloqueado: ${r.title}`,
        body: `Alcanzaste ${r.classes} clases · +${r.points} pts en tu cuenta.`,
        time: r.occurred_at,
        link: "/app/wallet/rewards",
      })),
      ...txRes.rows.map((r) => ({
        id: `tx_${r.id}`,
        category: r.type === "earn" || r.type === "adjust" ? "loyalty_earn" : "loyalty_spend",
        title: r.type === "earn"
          ? (r.title || "Puntos ganados")
          : r.type === "adjust"
            ? (r.title || "Ajuste de puntos")
            : (r.title || "Puntos canjeados"),
        body: `${r.points >= 0 && r.type !== "spend" ? "+" : "−"}${Math.abs(r.points)} pts`,
        time: r.occurred_at,
        link: "/app/wallet/history",
      })),
      ...bookRes.rows.map((r) => {
        const dateStr = r.date
          ? new Date(r.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
          : "";
        const timeStr = r.start_time ? String(r.start_time).slice(0, 5) : "";
        const labels = {
          confirmed: ["Reserva confirmada", `${r.class_name} · ${dateStr} ${timeStr}`],
          checked_in: ["Clase atendida ✨", `${r.class_name} · ${dateStr}`],
          cancelled: ["Reserva cancelada", `${r.class_name} · ${dateStr}`],
        };
        const [t, b] = labels[r.status] || ["Reserva", r.class_name];
        return {
          id: `b_${r.id}`,
          category: "booking",
          title: t,
          body: b,
          time: r.occurred_at,
          link: "/app/bookings",
        };
      }),
    ]
      .filter((x) => x.time)
      .map((x) => ({ ...x, unread: lastReadMs === 0 || new Date(x.time).getTime() > lastReadMs }))
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, limit);

    return res.json({
      data: items,
      meta: {
        unread_count: items.filter((x) => x.unread).length,
        last_read_at: lastReadAt,
      },
    });
  } catch (err) {
    console.error("GET /api/me/notifications error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/me/notifications/mark-read — alumna marca todo leído
app.post("/api/me/notifications/mark-read", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE users SET notifications_last_read_at = NOW() WHERE id = $1",
      [req.userId],
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/me/notifications/unread-count — sólo el contador (lightweight)
app.get("/api/me/notifications/unread-count", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const u = await pool.query("SELECT notifications_last_read_at FROM users WHERE id = $1", [userId]);
    const lastReadAt = u.rows[0]?.notifications_last_read_at;
    // Conteo simple: motivation_sends + milestone_awards + transactions + bookings con time > lastReadAt
    const cutoff = lastReadAt || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // si nunca leyó, contar últimos 30d
    const r = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM motivation_sends WHERE user_id = $1 AND sent_at > $2) +
        (SELECT COUNT(*)::int FROM loyalty_milestone_awards WHERE user_id = $1 AND awarded_at > $2) +
        (SELECT COUNT(*)::int FROM loyalty_transactions WHERE user_id = $1 AND created_at > $2) +
        (SELECT COUNT(*)::int FROM bookings WHERE user_id = $1
          AND status IN ('confirmed','checked_in','cancelled')
          AND GREATEST(checked_in_at, created_at) > $2)
        AS n`,
      [userId, cutoff],
    );
    return res.json({ data: { unread_count: r.rows[0]?.n || 0 } });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

function prettyTemplateKey(key) {
  const map = {
    welcome: "Bienvenida a HIVE",
    booking_confirmed: "Reserva confirmada",
    booking_cancelled: "Reserva cancelada",
    class_reminder: "Recordatorio de clase",
    class_attended: "Check-in registrado",
    membership_activated: "Tu paquete está activo",
    membership_expiring_today: "Tu paquete vence hoy",
    membership_expiring_tomorrow: "Tu paquete vence mañana",
    membership_expiring_n_days: "Tu paquete vence pronto",
    membership_expired: "Tu paquete terminó",
    renewal_reminder: "Recordatorio de renovación",
    transfer_rejected: "Comprobante rechazado",
    points_earned: "Sumaste puntos",
    reward_redeemed: "Recompensa canjeada",
    event_registered: "Inscrita al evento",
    motivation_first_class_week: "Arrancando la semana",
    motivation_almost_ringed: "Te falta una",
    motivation_streak_2_weeks: "Dos semanas seguidas",
    motivation_streak_4_weeks: "Un mes completo",
    motivation_streak_8_weeks: "Imparable",
    motivation_comeback: "Qué bueno tenerte de regreso",
    milestone_classes_5: "Primera meta",
    milestone_classes_10: "10 clases",
    milestone_classes_25: "25 clases",
    milestone_classes_50: "50 clases",
    milestone_classes_100: "100 clases",
    promo_custom: "Promo HIVE",
    promo_dormant_invite: "Te extrañamos",
    promo_expiring_offer: "Renueva con beneficio",
    promo_birthday_month: "Feliz mes",
  };
  return map[key] || "Aviso de HIVE";
}

function humanizeMotivationKey(key) {
  if (key.startsWith("milestone_")) return "Lograste un nuevo milestone HIVE.";
  if (key.startsWith("motivation_")) return "Te enviamos un mensaje motivacional al WhatsApp.";
  if (key.startsWith("promo_")) return "Te enviamos una promoción al WhatsApp.";
  if (key === "class_attended") return "Tenemos tu check-in.";
  if (key === "points_earned") return "Sumaste puntos a tu cuenta.";
  if (key === "reward_redeemed") return "Canjeaste una recompensa.";
  if (key === "event_registered") return "Quedaste inscrita a un evento.";
  if (key.startsWith("booking_")) return "Actualización sobre tu reserva.";
  if (key.startsWith("membership_") || key === "renewal_reminder") return "Estado de tu paquete.";
  return "Recibiste una notificación.";
}

// ─── Routes: /api/loyalty ───────────────────────────────────────────────────

// GET /api/loyalty/my-history
app.get("/api/loyalty/my-history", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT lt.*,
              CASE WHEN lt.type = 'earn' OR lt.points > 0 THEN 'earned' ELSE 'redeemed' END AS movement_type
       FROM loyalty_transactions lt
       WHERE lt.user_id = $1
       ORDER BY lt.created_at DESC
       LIMIT 100`,
      [req.userId]
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/my-history error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/loyalty/rewards
app.get("/api/loyalty/rewards", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE is_active = true ORDER BY points_cost ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("Loyalty/rewards error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/loyalty/redeem
app.post("/api/loyalty/redeem", authMiddleware, async (req, res) => {
  const { rewardId } = req.body;
  if (!rewardId) return res.status(400).json({ message: "rewardId requerido" });
  try {
    const rewardRes = await pool.query(
      "SELECT * FROM loyalty_rewards WHERE id = $1 AND is_active = true",
      [rewardId]
    );
    if (rewardRes.rows.length === 0) return res.status(404).json({ message: "Recompensa no encontrada" });
    const reward = rewardRes.rows[0];
    // Check user balance from loyalty_transactions
    const balanceRes = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS balance FROM loyalty_transactions WHERE user_id = $1",
      [req.userId]
    );
    const balance = parseInt(balanceRes.rows[0].balance);
    if (balance < reward.points_cost) {
      return res.status(400).json({ message: `Necesitas ${reward.points_cost} puntos. Tienes ${balance}.` });
    }
    // Deduct points via loyalty_transactions (type=redeem)
    await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'redeem', $2, $3)",
      [req.userId, reward.points_cost, `Canje: ${reward.name}`]
    );
    // Decrement stock if limited
    if (reward.stock !== null) {
      await pool.query("UPDATE loyalty_rewards SET stock = stock - 1 WHERE id = $1 AND stock > 0", [rewardId]);
    }
    notifyRewardRedeemed(req.userId, reward.name, reward.points_cost).catch(() => {});
    return res.json({ message: `¡Recompensa canjeada! ${reward.name}` });
  } catch (err) {
    console.error("Loyalty/redeem error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Google Wallet helpers ──────────────────────────────────────────────────

const SITE_URL = process.env.SITE_URL || "https://www.almamovement.com.mx";
const GW_ISSUER_ID = process.env.GOOGLE_ISSUER_ID || "";
const GW_ISSUER_NAME = process.env.GOOGLE_ISSUER_NAME || PASS_DEFAULT_TEXTS.issuerName;
const GW_PROGRAM_NAME = process.env.GOOGLE_PROGRAM_NAME || PASS_DEFAULT_TEXTS.programName;
const GW_HEX_BG = process.env.GOOGLE_HEX_BACKGROUND_COLOR || "#FFF7F2";
const GW_HEX_BG_EVENT = process.env.GOOGLE_HEX_BACKGROUND_COLOR_EVENT || "#FFF7F2";

/**
 * Parse the Google Service Account private key from various env var formats.
 * Supports:
 *  - GOOGLE_SA_KEY_JSON_BASE64: the entire service-account JSON file base64-encoded (easiest)
 *  - GOOGLE_SA_PRIVATE_KEY: just the private key PEM (escaped \\n, raw, or base64-encoded)
 */
function parseGWServiceAccount() {
  let email = process.env.GOOGLE_SA_EMAIL || "";
  let key = "";

  // El email y la llave de un mismo JSON son SIEMPRE un par. Por eso, cuando la
  // credencial viene de un JSON completo (base64 o crudo), el client_email de
  // ESE archivo manda sobre GOOGLE_SA_EMAIL — así nunca se mezcla el email de
  // una service account con la llave privada de otra (causa típica de OAuth 400).
  const applyServiceAccountJson = (sa, source) => {
    if (sa.private_key) key = sa.private_key;
    if (sa.client_email) email = sa.client_email;
    console.log(`GW Key: parsed from ${source} ✓`);
  };

  // Option A: whole JSON file base64-encoded (e.g. cat sa.json | base64 -w0 | pbcopy)
  const jsonB64 = process.env.GOOGLE_SA_KEY_JSON_BASE64 || "";
  if (jsonB64) {
    try {
      applyServiceAccountJson(JSON.parse(Buffer.from(jsonB64, "base64").toString("utf8")), "GOOGLE_SA_KEY_JSON_BASE64");
    } catch (e) {
      console.error("Failed to parse GOOGLE_SA_KEY_JSON_BASE64:", e.message);
    }
  }

  // Option A2: el JSON crudo de la service account, tal cual lo descargas de
  // Google Cloud (sin base64). Mismo formato y mismas garantías que Option A.
  if (!key) {
    const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
    if (rawJson.trim()) {
      try {
        applyServiceAccountJson(JSON.parse(rawJson), "GOOGLE_SERVICE_ACCOUNT_JSON");
      } catch (e) {
        console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON:", e.message);
      }
    }
  }

  // Option B: separate GOOGLE_SA_PRIVATE_KEY env var
  if (!key) {
    let raw = process.env.GOOGLE_SA_PRIVATE_KEY || "";
    if (raw) {
      // Step 1: URL-decode if needed (Railway sometimes encodes)
      if (raw.includes("%3D") || raw.includes("%2B") || raw.includes("%2F")) {
        try { raw = decodeURIComponent(raw); } catch (_) {}
      }
      // Step 2: If it's a JSON-escaped string (starts with "), unwrap it
      if (raw.startsWith('"') || raw.startsWith("'")) {
        try { raw = JSON.parse(raw); } catch (_) {
          raw = raw.slice(1, -1); // strip quotes manually
        }
      }
      // Step 3: If the whole thing looks like base64 (no PEM markers), decode
      if (!raw.includes("-----BEGIN") && !raw.includes("\\n") && raw.length > 100) {
        try {
          const decoded = Buffer.from(raw, "base64").toString("utf8");
          if (decoded.includes("-----BEGIN") || decoded.includes("PRIVATE KEY")) raw = decoded;
        } catch (_) {}
      }
      // Step 4: Replace escaped newlines (\\n → \n, plus double-escaped)
      raw = raw.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n");
      // Step 5: Reconstruct PEM if markers exist but no real newlines between them
      if (raw.includes("-----BEGIN") && raw.includes("-----END")) {
        // Ensure proper line breaks around the markers
        raw = raw
          .replace(/(-----BEGIN [A-Z ]+-----)\s*/g, "$1\n")
          .replace(/\s*(-----END [A-Z ]+-----)/g, "\n$1");
        // If the body between markers has no newlines, it's the base64 blob — add line breaks every 64 chars
        const match = raw.match(/(-----BEGIN [A-Z ]+-----)\n?([\s\S]*?)\n?(-----END [A-Z ]+-----)/);
        if (match) {
          const body = match[2].replace(/\s+/g, ""); // strip all whitespace from body
          const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
          raw = `${match[1]}\n${wrapped}\n${match[3]}`;
        }
      }
      key = raw.trim();
      console.log("GW Key: parsed from GOOGLE_SA_PRIVATE_KEY, length=" + key.length + ", hasPEM=" + key.includes("-----BEGIN"));
    }
  }

  // Normaliza saltos de línea escapados (\n literal → salto real) para llaves
  // que vienen de un JSON con doble escape. Idempotente si ya están correctas.
  if (key && key.includes("\\n")) key = key.replace(/\\n/g, "\n");

  // Validate the key can be used for RS256
  if (key) {
    try {
      crypto.createPrivateKey(key);
      console.log("GW Key: ✅ Valid RSA private key");
    } catch (e) {
      console.error("GW Key: ⚠️ Key validation failed:", e.message);
      // Last resort: try wrapping in PKCS#8 markers if missing
      if (!key.includes("-----BEGIN")) {
        const body = key.replace(/\s+/g, "");
        const wrapped = body.match(/.{1,64}/g)?.join("\n") || body;
        key = `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----`;
        try {
          crypto.createPrivateKey(key);
          console.log("GW Key: ✅ Valid after adding PEM headers");
        } catch (e2) {
          console.error("GW Key: ❌ Still invalid after adding headers:", e2.message);
          key = ""; // unset — will disable Google Wallet gracefully
        }
      } else {
        key = ""; // unset — will disable Google Wallet gracefully
      }
    }
  }

  return { email, key };
}

const { email: _gwEmail, key: _gwKey } = parseGWServiceAccount();
const GW_SA_EMAIL = _gwEmail;
const GW_SA_PRIVATE_KEY = _gwKey;
const GW_CLASS_ID = GW_ISSUER_ID ? `${GW_ISSUER_ID}.alma_loyalty_v1` : "";

function isGoogleWalletConfigured() {
  return !!(GW_ISSUER_ID && GW_SA_EMAIL && GW_SA_PRIVATE_KEY);
}

/** Get OAuth2 access token for Google Wallet API using service account */
async function getGoogleWalletAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: GW_SA_EMAIL,
    scope: "https://www.googleapis.com/auth/wallet_object.issuer",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const saJwt = jwt.sign(claim, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  const resp = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: saJwt,
  }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  return resp.data.access_token;
}

/** Create or update the Google Wallet Loyalty Class (run once at startup) */
async function ensureGoogleWalletClass() {
  if (!isGoogleWalletConfigured()) return;
  try {
    const token = await getGoogleWalletAccessToken();
    const classObj = {
      id: GW_CLASS_ID,
      issuerName: GW_ISSUER_NAME,
      programName: GW_PROGRAM_NAME,
      programLogo: {
        sourceUri: { uri: `${SITE_URL}/hive-mark-light.png` },
        contentDescription: { defaultValue: { language: "es", value: PASS_DEFAULT_TEXTS.logoDescription } },
      },
      heroImage: {
        sourceUri: { uri: `${SITE_URL}/wallet-hero-hive.png` },
        contentDescription: { defaultValue: { language: "es", value: PASS_DEFAULT_TEXTS.heroDescription } },
      },
      // Tarjeta cálida Desert Rock — paleta oficial HIVE (club exclusivo)
      hexBackgroundColor: "#A48D78",
      reviewStatus: "UNDER_REVIEW",
      countryCode: "MX",
      multipleDevicesAndHoldersAllowedStatus: "MULTIPLE_HOLDERS",
      localizedIssuerName: {
        defaultValue: { language: "es", value: GW_ISSUER_NAME },
      },
      localizedProgramName: {
        defaultValue: { language: "es", value: GW_PROGRAM_NAME },
        translatedValues: [
          { language: "es", value: PASS_DEFAULT_TEXTS.programNameTranslated },
        ],
      },
    };
    // Try to GET the class first
    try {
      await axios.get(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // If exists, update it
      await axios.put(`https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass/${GW_CLASS_ID}`, classObj, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      console.log("✅ Google Wallet loyalty class updated:", GW_CLASS_ID);
    } catch (getErr) {
      if (getErr.response?.status === 404) {
        // Create new class
        await axios.post("https://walletobjects.googleapis.com/walletobjects/v1/loyaltyClass", classObj, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        console.log("✅ Google Wallet loyalty class created:", GW_CLASS_ID);
      } else {
        throw getErr;
      }
    }
  } catch (err) {
    console.error("⚠️  Google Wallet class setup error:", err.response?.data || err.message);
  }
}

function formatWalletEventSchedule(eventPass) {
  if (!eventPass?.eventDate) return "";
  const eventDate = new Date(eventPass.eventDate);
  if (Number.isNaN(eventDate.getTime())) return "";
  const dateLabel = eventDate.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const startTime = eventPass.eventStartTime ? String(eventPass.eventStartTime).slice(0, 5) : "";
  const endTime = eventPass.eventEndTime ? String(eventPass.eventEndTime).slice(0, 5) : "";
  const timeLabel = startTime && endTime ? `${startTime} - ${endTime}` : (startTime || "");
  return `${dateLabel}${timeLabel ? ` · ${timeLabel}` : ""}`.trim();
}

/** Build a Google Wallet Save URL (JWT) for a user
 *  @param {Object} opts
 *  @param {string} opts.userId
 *  @param {string} opts.userName
 *  @param {number} opts.points
 *  @param {string} opts.qrCode
 *  @param {Object|null} opts.membership  - { plan_name, class_limit, classes_remaining, end_date, start_date }
 *  @param {Object|null} opts.nextBooking - { class_name, instructor_name, date, start_time }
 *  @param {Object|null} opts.activeEventPass - { eventTitle, eventDate, eventStartTime, eventEndTime, eventLocation, passCode }
 */
function buildGoogleWalletSaveUrl({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass, memberSince = null, passKind = "membership" }) {
  const isEventPass = String(passKind || "membership") === "event";
  const objectId = isEventPass
    ? `${GW_ISSUER_ID}.alma_event_${String(activeEventPass?.eventId || "event").replace(/-/g, "")}_${userId.replace(/-/g, "")}`
    : `${GW_ISSUER_ID}.alma_${userId.replace(/-/g, "")}`;

  // ── Determine pass type and details based on membership ──────────────────
  const hasMembership = !isEventPass && !!membership;
  const hasEventPass = isEventPass && !!activeEventPass;
  const showFullGooglePassText = parseBooleanFlag(process.env.GOOGLE_WALLET_SHOW_FULL_TEXT || false);
  const compactEventMode = hasEventPass && !showFullGooglePassText;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = activeEventPass?.eventTitle || "Evento especial";
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel = getWalletCategoryLabel(membershipCategory);
  const progressSummary = getWalletProgressSummary(membership);
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const classLimit = Number(membership?.class_limit ?? 0);
  const hasIconStampMode = hasMembership && !isUnlimited && classLimit > 0;
  const isPackage = hasMembership && !isUnlimited && membership.class_limit > 1;
  const isSingleClass = hasMembership && !isUnlimited && membership.class_limit === 1;
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);

  // Header label
  let passHeader = PASS_DEFAULT_TEXTS.passHeader;
  if (hasEventPass) {
    passHeader = "PASE DE EVENTO";
  } else if (hasMembership) {
    if (isTrialSingleSession) passHeader = "CLASE MUESTRA";
    else if (isUnlimited) passHeader = "MEMBRESÍA";
    else if (isPackage) passHeader = "PAQUETE";
    else if (isSingleClass) passHeader = "CLASE INDIVIDUAL";
  }

  // ── Build textModulesData rows ───────────────────────────────────────────
  const textModules = [];

  if (hasEventPass) {
    textModules.push({
      id: "event_title",
      header: "EVENTO ACTIVO",
      body: eventTitle,
    });
    if (eventSchedule) {
      textModules.push({
        id: "event_schedule",
        header: "FECHA Y HORA",
        body: eventSchedule,
      });
    }
    if (!compactEventMode && activeEventPass?.eventLocation) {
      textModules.push({
        id: "event_location",
        header: "LUGAR",
        body: activeEventPass.eventLocation,
      });
    }
    if (!compactEventMode && activeEventPass?.passCode) {
      textModules.push({
        id: "event_code",
        header: "CÓDIGO EVENTO",
        body: activeEventPass.passCode,
      });
    }
  }

  if (!compactEventMode && !isEventPass) {
    // Frente tipo club: NIVEL (paquete) · SOCIA DESDE · DISPONIBLES · VIGENTE.
    // (El NOMBRE va en accountName; los operativos en la vista de detalle.)
    if (hasMembership) {
      textModules.push({
        id: "nivel",
        header: "NIVEL",
        body: membership.plan_name || "Plan Activo",
      });
      if (memberSince) {
        textModules.push({ id: "socia_desde", header: "SOCIA DESDE", body: memberSince });
      }
      if (isUnlimited) {
        textModules.push({ id: "clases", header: "DISPONIBLES", body: "Ilimitadas" });
      } else if (membership.class_limit && !hasIconStampMode) {
        textModules.push({
          id: "clases",
          header: "DISPONIBLES",
          body: progressSummary.remainingLabel,
        });
      }
      if (membership.end_date) {
        const endDate = new Date(membership.end_date);
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
        const endFormatted = endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
        textModules.push({
          id: "vigencia",
          header: "VIGENTE HASTA",
          body: `${endFormatted} (${daysLeft} días)`,
        });
      }
    } else {
      textModules.push({ id: "nivel", header: "NIVEL", body: "Bienvenida" });
      if (memberSince) {
        textModules.push({ id: "socia_desde", header: "SOCIA DESDE", body: memberSince });
      }
    }

    // Row 4: Next class
    if (nextBooking) {
      const bookingDate = new Date(nextBooking.date);
      const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
      const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
      textModules.push({
        id: "next_class",
        header: "PRÓXIMA CLASE",
        body: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}`,
      });
      if (nextBooking.instructor_name) {
        textModules.push({
          id: "instructor",
          header: "INSTRUCTORA",
          body: nextBooking.instructor_name,
        });
      }
    }
  }

  // Row 5: Points
  textModules.push({
    id: "puntos",
    header: PASS_DEFAULT_TEXTS.pointsLabel,
    body: `${points.toLocaleString("es-MX")} pts`,
  });

  const infoRows = [];
  if (compactEventMode) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Fecha", value: eventSchedule || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Código", value: activeEventPass?.passCode || "—" },
        { label: "Puntos", value: String(points) },
      ],
    });
  } else if (hasEventPass) {
    infoRows.push({
      columns: [
        { label: "Evento", value: eventTitle },
        { label: "Código", value: activeEventPass.passCode || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Horario", value: eventSchedule || "—" },
        { label: "Sede", value: activeEventPass.eventLocation || "—" },
      ],
    });
  }
  if (hasMembership) {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Plan", value: membership.plan_name || "—" },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Modalidad", value: membershipCategoryLabel },
        { label: "Meta", value: progressSummary.completionLabel },
      ],
    });
    infoRows.push({
      columns: [
        { label: "Disponibles", value: progressSummary.remainingLabel },
        { label: "Reglas", value: [nonTransferable ? "No transferible" : "", nonRepeatable ? "No repetible" : ""].filter(Boolean).join(" · ") || "—" },
      ],
    });
  } else {
    infoRows.push({
      columns: [
        { label: "Miembro", value: userName },
        { label: "Puntos", value: String(points) },
      ],
    });
  }

  // ── Build loyaltyObject ──────────────────────────────────────────────────
  const loyaltyObject = {
    id: objectId,
    classId: GW_CLASS_ID,
    state: "ACTIVE",
    accountId: userId,
    accountName: userName,
    // Tarjeta cálida Desert Rock — paleta oficial HIVE (club exclusivo)
    hexBackgroundColor: "#A48D78",
    // Hero a nivel OBJETO: sobreescribe el hero de la clase. Se firma local
    // (sin OAuth), así que limpia el branding viejo aunque la clase persistida
    // en Google no se pueda actualizar todavía. ?v fuerza re-fetch del CDN.
    heroImage: {
      sourceUri: { uri: `${SITE_URL}/wallet-hero-hive.png?v=hive1` },
      contentDescription: { defaultValue: { language: "es", value: PASS_DEFAULT_TEXTS.heroDescription } },
    },
    barcode: {
      type: "QR_CODE",
      value: qrCode,
    },
    loyaltyPoints: {
      balance: { int: points },
      label: "PUNTOS",
    },
    header: {
      defaultValue: { language: "es", value: passHeader },
    },
    textModulesData: textModules,
    linksModuleData: {
      uris: [
        { uri: `${SITE_URL}/app/wallet`, description: "Mi Wallet", id: "wallet_link" },
        {
          uri: hasEventPass ? `${SITE_URL}/app/events` : `${SITE_URL}/app/bookings`,
          description: hasEventPass ? "Mis Eventos" : "Reservar Clase",
          id: hasEventPass ? "events_link" : "book_link",
        },
      ],
    },
    infoModuleData: {
      showLastUpdateTime: true,
      labelValueRows: infoRows,
    },
  };

  const payload = {
    iss: GW_SA_EMAIL,
    aud: "google",
    origins: [SITE_URL],
    typ: "savetowallet",
    payload: {
      loyaltyObjects: [loyaltyObject],
    },
  };
  const signedJwt = jwt.sign(payload, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${signedJwt}`;
}

// ─── Routes: /api/wallet/google ─────────────────────────────────────────────

// GET /api/wallet/google/save-url — returns Save URL for logged-in user
app.get("/api/wallet/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    // Ensure loyalty class exists (best-effort — don't fail the request if this errors)
    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0,3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/events/google/save-url — returns event-specific Save URL for logged-in user
app.get("/api/wallet/events/google/save-url", authMiddleware, async (req, res) => {
  if (!isGoogleWalletConfigured()) {
    return res.status(503).json({ message: "Google Wallet no configurado", detail: { issuer: !!GW_ISSUER_ID, email: !!GW_SA_EMAIL, key: !!GW_SA_PRIVATE_KEY } });
  }
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    try {
      await ensureGoogleWalletClass();
    } catch (classErr) {
      console.error("Google Wallet class ensure error (non-fatal):", classErr.response?.data || classErr.message);
    }

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    if (!snapshot.activeEventPass) {
      return res.status(404).json({ message: "No existe pase activo para ese evento" });
    }
    const saveUrl = buildGoogleWalletSaveUrl({
      ...snapshot,
      membership: null,
      nextBooking: null,
      passKind: "event",
    });
    return res.json({ data: { saveUrl } });
  } catch (err) {
    console.error("Google Wallet event save-url error:", err.response?.data || err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
    return res.status(500).json({ message: "Error generando pase de evento en Google Wallet", detail: err.message });
  }
});

// GET /api/wallet/google/diagnostics — check env config (admin only)
app.get("/api/wallet/google/diagnostics", adminMiddleware, async (_req, res) => {
  const rawKey = process.env.GOOGLE_SA_PRIVATE_KEY || "";
  const keyPreview = GW_SA_PRIVATE_KEY
    ? `parsed_length=${GW_SA_PRIVATE_KEY.length}, hasNewlines=${GW_SA_PRIVATE_KEY.includes("\n")}, begins=${GW_SA_PRIVATE_KEY.substring(0, 32)}…`
    : "❌ missing";
  const rawKeyPreview = rawKey
    ? `raw_length=${rawKey.length}, hasBeginMarker=${rawKey.includes("-----BEGIN")}, hasLiteralBackslashN=${rawKey.includes("\\n")}`
    : "❌ env var not set";

  // Test JWT signing
  let jwtSignTest = "not tested";
  if (GW_SA_EMAIL && GW_SA_PRIVATE_KEY) {
    try {
      jwt.sign({ iss: GW_SA_EMAIL, aud: "test", iat: Math.floor(Date.now() / 1000) }, GW_SA_PRIVATE_KEY, { algorithm: "RS256" });
      jwtSignTest = "✅ JWT signing works";
    } catch (e) {
      jwtSignTest = `❌ JWT signing failed: ${e.message}`;
    }
  }

  // Test OAuth token
  let oauthTest = "not tested";
  if (isGoogleWalletConfigured()) {
    try {
      const token = await getGoogleWalletAccessToken();
      oauthTest = `✅ Got access token (${token.substring(0, 10)}...)`;
    } catch (e) {
      oauthTest = `❌ OAuth failed: ${e.response?.data?.error_description || e.message}`;
    }
  }

  return res.json({
    configured: isGoogleWalletConfigured(),
    issuerId: GW_ISSUER_ID ? `✅ ${GW_ISSUER_ID}` : "❌ missing",
    saEmail: GW_SA_EMAIL ? `✅ ${GW_SA_EMAIL}` : "❌ missing",
    saPrivateKey: keyPreview,
    rawKeyInfo: rawKeyPreview,
    classId: GW_CLASS_ID || "N/A",
    issuerName: GW_ISSUER_NAME,
    programName: GW_PROGRAM_NAME,
    jwtSignTest,
    oauthTest,
  });
});

// ─── Apple Wallet config ────────────────────────────────────────────────────

const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";
const APPLE_PASS_TYPE_ID = process.env.APPLE_PASS_TYPE_ID || "";
const APPLE_KEY_ID = process.env.APPLE_KEY_ID || "";
const APPLE_APNS_KEY_BASE64 = process.env.APPLE_APNS_KEY_BASE64 || "";
const APPLE_AUTH_TOKEN = process.env.APPLE_AUTH_TOKEN || crypto.randomBytes(32).toString("hex");
const APPLE_CERT_PASSWORD = process.env.APPLE_CERT_PASSWORD || "";

// ── Certificate loading: files first, then base64 env vars ──────────────────
// Priority 1: Read from files in wallet-assets/apple-pass/
// Priority 2: Decode from base64 env vars (APPLE_SIGNER_CERT_BASE64, etc.)

function safeExists(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath);
  } catch (_) {
    return false;
  }
}

function normalizePemText(value) {
  if (!value) return "";
  return String(value)
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
}

function looksLikeBase64(value) {
  const raw = String(value || "").replace(/\s/g, "");
  if (raw.length < 100) return false;
  return /^[A-Za-z0-9+/=]+$/.test(raw);
}

const WALLET_ASSET_DIR_CANDIDATES = [
  process.env.APPLE_PASS_CERT_DIR,
  path.join(__dirname, "..", "wallet-assets", "apple-pass"),
  path.join(__dirname, "wallet-assets", "apple-pass"),
  path.join(process.cwd(), "wallet-assets", "apple-pass"),
  "/app/wallet-assets/apple-pass",
  "/app/server/wallet-assets/apple-pass",
].filter(Boolean);

const WALLET_ASSETS_DIR = WALLET_ASSET_DIR_CANDIDATES.find((dir) => safeExists(dir)) || WALLET_ASSET_DIR_CANDIDATES[0];

const CERT_FILE_CANDIDATES = {
  cert: [
    process.env.APPLE_PASS_CERT_PATH,
    process.env.APPLE_PASS_CERT,
    path.join(WALLET_ASSETS_DIR, "pass.pem"),
    path.join(WALLET_ASSETS_DIR, "certificate.pem"),
  ].filter(Boolean),
  key: [
    process.env.APPLE_PASS_KEY_PATH,
    process.env.APPLE_PASS_KEY,
    path.join(WALLET_ASSETS_DIR, "pass.key"),
    path.join(WALLET_ASSETS_DIR, "private.key"),
  ].filter(Boolean),
  wwdr: [
    process.env.APPLE_PASS_WWDR_PATH,
    process.env.APPLE_PASS_WWDR,
    path.join(WALLET_ASSETS_DIR, "wwdr.pem"),
    path.join(WALLET_ASSETS_DIR, "AppleWWDRCA.pem"),
    path.join(WALLET_ASSETS_DIR, "wwdr_rsa.pem"),
  ].filter(Boolean),
};

/** Try to load PEM from file, return empty string if not found */
function loadCertFile(filePath) {
  try {
    if (safeExists(filePath)) {
      const content = normalizePemText(fs.readFileSync(filePath, "utf8"));
      if (content.includes("-----BEGIN")) {
        console.log(`[Apple Wallet] ✅ Loaded cert from file: ${filePath} (${content.length} chars)`);
        return content;
      }
    }
  } catch (e) {
    console.error(`[Apple Wallet] ❌ Error reading ${filePath}:`, e.message);
  }
  return "";
}

function loadFirstCertFile(paths = []) {
  for (const p of paths) {
    const cert = loadCertFile(p);
    if (cert) return cert;
  }
  return "";
}

/** Decode base64 env var to PEM, ensuring proper PEM formatting */
function decodeBase64ToPem(b64, label = "CERTIFICATE") {
  if (!b64) return "";
  try {
    let raw = Buffer.from(String(b64), "base64").toString("utf8").trim();
    if (!raw) return "";
    if (raw.includes("-----BEGIN")) {
      return normalizePemText(raw);
    }
    const cleanB64 = String(b64).replace(/[\s\n\r]/g, "");
    if (!cleanB64) return "";
    const lines = cleanB64.match(/.{1,64}/g) || [cleanB64];
    return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
  } catch (_) {
    return "";
  }
}

function loadPemFromEnvValue(value, label = "CERTIFICATE") {
  const raw = normalizePemText(value || "");
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw;
  if (safeExists(raw)) return loadCertFile(raw);
  if (looksLikeBase64(raw)) return decodeBase64ToPem(raw, label);
  return "";
}

const CERT_FILE_PATHS = {
  cert: CERT_FILE_CANDIDATES.cert.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.cert[0] || "",
  key: CERT_FILE_CANDIDATES.key.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.key[0] || "",
  wwdr: CERT_FILE_CANDIDATES.wwdr.find((p) => safeExists(p)) || CERT_FILE_CANDIDATES.wwdr[0] || "",
};

// Load certs: env PEM/path first, then files, then base64 env vars
const APPLE_SIGNER_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_CERT_PEM || process.env.APPLE_PASS_CERT_PEM || process.env.APPLE_PASS_CERT, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.cert)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_CERT_BASE64 || process.env.APPLE_PASS_CERT_BASE64 || "", "CERTIFICATE");

const APPLE_SIGNER_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_SIGNER_KEY_PEM || process.env.APPLE_PASS_KEY_PEM || process.env.APPLE_PASS_KEY, "PRIVATE KEY")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.key)
  || decodeBase64ToPem(process.env.APPLE_SIGNER_KEY_BASE64 || process.env.APPLE_PASS_KEY_BASE64 || "", "PRIVATE KEY");

const APPLE_WWDR_CERT_PEM =
  loadPemFromEnvValue(process.env.APPLE_WWDR_CERT_PEM || process.env.APPLE_PASS_WWDR_PEM || process.env.APPLE_PASS_WWDR, "CERTIFICATE")
  || loadFirstCertFile(CERT_FILE_CANDIDATES.wwdr)
  || decodeBase64ToPem(process.env.APPLE_WWDR_CERT_BASE64 || process.env.APPLE_PASS_WWDR_BASE64 || "", "CERTIFICATE");

const APPLE_APNS_KEY_PEM =
  loadPemFromEnvValue(process.env.APPLE_APNS_KEY_PEM || process.env.APPLE_APNS_KEY || process.env.APPLE_APNS_KEY_PATH, "PRIVATE KEY")
  || decodeBase64ToPem(APPLE_APNS_KEY_BASE64 || "", "PRIVATE KEY");
const APPLE_APNS_HOST = process.env.APPLE_APNS_HOST || "https://api.push.apple.com";

function isAppleWalletConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_PASS_TYPE_ID && APPLE_SIGNER_CERT_PEM && APPLE_SIGNER_KEY_PEM && APPLE_WWDR_CERT_PEM);
}

function isAppleApnsConfigured() {
  return !!(APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PASS_TYPE_ID && APPLE_APNS_KEY_PEM);
}

function buildAppleWalletSerialFromUserId(userId) {
  const cleaned = String(userId || "").trim();
  if (!cleaned) return "";
  return `alma_${cleaned.replace(/-/g, "")}`;
}

function parseUserIdFromAppleWalletSerial(serial) {
  const raw = String(serial || "").replace(/^alma_/, "").trim();
  if (!/^[0-9a-fA-F]{32}$/.test(raw)) return null;
  return raw.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5").toLowerCase();
}

function truncateWalletField(value, max = 26) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getWalletCategoryLabel(category) {
  const normalized = normalizeClassCategory(category, "all");
  if (normalized === "studio") return "Studio";
  if (normalized === "reformer_tower") return "Reformer/Tower";
  if (normalized === "mixto") return "Mixto";
  if (normalized === "all") return "Todas las disciplinas";
  return "Pilates";
}

function getWalletProgressSummary(membership) {
  if (!membership) {
    return {
      isUnlimited: false,
      classLimit: 0,
      classesRemaining: 0,
      classesUsed: 0,
      completionPercent: 0,
      completionLabel: "Sin meta activa",
      remainingLabel: "Sin paquete activo",
      goalLabel: "Activa un plan para iniciar tu meta",
    };
  }

  const classLimitRaw = membership.class_limit;
  const isUnlimited = classLimitRaw === null || Number(classLimitRaw) >= 9999;
  if (isUnlimited) {
    return {
      isUnlimited: true,
      classLimit: null,
      classesRemaining: null,
      classesUsed: null,
      completionPercent: 100,
      completionLabel: "Meta abierta",
      remainingLabel: "Clases ilimitadas",
      goalLabel: "Constancia activa",
    };
  }

  const classLimit = Math.max(0, Number(classLimitRaw || 0));
  const classesRemaining = Math.max(0, Number(membership.classes_remaining ?? classLimit));
  const classesUsed = Math.max(0, classLimit - classesRemaining);
  const completionPercent = classLimit > 0 ? Math.round((classesUsed / classLimit) * 100) : 0;
  return {
    isUnlimited: false,
    classLimit,
    classesRemaining,
    classesUsed,
    completionPercent,
    completionLabel: classLimit > 0 ? `${classesUsed}/${classLimit} completadas` : "Sin meta activa",
    remainingLabel: classLimit > 0 ? `${classesRemaining} restantes` : "Sin paquete activo",
    goalLabel: classLimit > 0 ? `${completionPercent}% de tu meta` : "Activa un plan para iniciar tu meta",
  };
}

/** Find image assets — check both public/ and dist/ directories */
function findAssetDir() {
  const candidates = [
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "dist"),
    path.join(__dirname, "..", "dist", "public"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "dist"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "wallet-logo.png"))) {
      return dir;
    }
  }
  return candidates[0];
}

/** Find the first existing asset file by trying file names across common asset dirs. */
function findAssetFile(fileNames = []) {
  const dirs = [
    findAssetDir(),
    path.join(__dirname, "..", "public"),
    path.join(__dirname, "..", "src", "assets"),
    path.join(process.cwd(), "public"),
    path.join(process.cwd(), "src", "assets"),
  ];
  const checked = new Set();
  for (const dir of dirs) {
    if (!dir || checked.has(dir)) continue;
    checked.add(dir);
    for (const name of fileNames) {
      const fullPath = path.join(dir, name);
      if (fs.existsSync(fullPath)) return fullPath;
    }
  }
  return null;
}

const WALLET_STRIP_TOTAL_BUCKETS = [1, 4, 8, 12, 16, 20];

function resolveWalletStripStampState(classLimitRaw, classesRemainingRaw) {
  const classLimit = Number(classLimitRaw ?? 0);
  const classesRemaining = Math.max(0, Number(classesRemainingRaw ?? 0));
  if (!Number.isFinite(classLimit) || classLimit <= 0) {
    return { total: 0, remaining: 0 };
  }
  const nearestTotal = WALLET_STRIP_TOTAL_BUCKETS.reduce((best, current) =>
    Math.abs(current - classLimit) < Math.abs(best - classLimit) ? current : best,
  WALLET_STRIP_TOTAL_BUCKETS[0]);
  const ratio = classLimit > 0 ? Math.min(1, Math.max(0, classesRemaining / classLimit)) : 0;
  const remainingBucket = Math.min(nearestTotal, Math.max(0, Math.round(ratio * nearestTotal)));
  return { total: nearestTotal, remaining: remainingBucket };
}

const appleApnsProviderTokenCache = {
  token: "",
  expiresAtMs: 0,
};

function getAppleApnsProviderToken() {
  const now = Date.now();
  if (appleApnsProviderTokenCache.token && appleApnsProviderTokenCache.expiresAtMs > now + 30_000) {
    return appleApnsProviderTokenCache.token;
  }
  if (!isAppleApnsConfigured()) {
    throw new Error("Apple APNS no configurado");
  }
  const iat = Math.floor(now / 1000);
  const token = jwt.sign(
    { iss: APPLE_TEAM_ID, iat },
    APPLE_APNS_KEY_PEM,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: APPLE_KEY_ID },
    },
  );
  // Apple recomienda reutilizar por hasta 60 min. Renovamos cada 50 min.
  appleApnsProviderTokenCache.token = token;
  appleApnsProviderTokenCache.expiresAtMs = now + 50 * 60 * 1000;
  return token;
}

function shouldPruneApplePushToken(pushResult) {
  if (!pushResult || pushResult.ok) return false;
  if (pushResult.status === 410) return true;
  const badReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);
  return pushResult.status === 400 && badReasons.has(pushResult.reason);
}

function sendApplePassUpdatedPush(pushToken, providerToken) {
  return new Promise((resolve) => {
    const session = http2.connect(APPLE_APNS_HOST);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      try { session.close(); } catch (_) { }
      resolve(result);
    };
    session.setTimeout(12_000, () => finish({ ok: false, status: 0, reason: "APNS timeout", pushToken }));
    session.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));

    const req = session.request({
      ":method": "POST",
      ":path": `/3/device/${pushToken}`,
      authorization: `bearer ${providerToken}`,
      "apns-topic": APPLE_PASS_TYPE_ID,
      "apns-push-type": "background",
      "apns-priority": "5",
      "content-type": "application/json",
    });

    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (headers) => {
      status = Number(headers?.[":status"] || 0);
    });
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      let reason = "";
      if (body) {
        try {
          reason = JSON.parse(body)?.reason || "";
        } catch (_) {
          reason = body.slice(0, 120);
        }
      }
      finish({ ok: status === 200, status, reason, pushToken });
    });
    req.on("error", (err) => finish({ ok: false, status: 0, reason: err.message, pushToken }));
    req.end("{}");
  });
}

async function getWalletSnapshotForUser(userId, { eventId = null } = {}) {
  const userRes = await pool.query("SELECT id, email, display_name, created_at FROM users WHERE id = $1 LIMIT 1", [userId]);
  if (!userRes.rows.length) return null;
  const user = userRes.rows[0];
  const userName = user.display_name || user.email;
  let memberSince = null;
  if (user.created_at) {
    const _ms = new Date(user.created_at).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
    memberSince = _ms.charAt(0).toUpperCase() + _ms.slice(1);
  }

  const pointsRes = await pool.query(
    "SELECT COALESCE(SUM(CASE WHEN type='earn' THEN points WHEN type='adjust' THEN points ELSE -points END), 0) AS total FROM loyalty_transactions WHERE user_id = $1",
    [userId],
  );
  const points = parseInt(pointsRes.rows[0]?.total ?? 0, 10) || 0;

  let membership = null;
  try {
    const memRes = await pool.query(
      `SELECT m.id, m.status, m.classes_remaining, m.start_date, m.end_date,
              m.plan_name_override, m.class_limit_override,
              p.name AS plan_name, p.class_limit AS plan_class_limit,
              p.class_category, p.is_non_transferable, p.is_non_repeatable, p.repeat_key
       FROM memberships m
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.user_id = $1 AND m.status = 'active' AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
       ORDER BY m.end_date DESC NULLS LAST
       LIMIT 1`,
      [userId],
    );
    if (memRes.rows.length > 0) {
      const m = memRes.rows[0];
      membership = {
        id: m.id,
        plan_name: m.plan_name_override || m.plan_name || "Plan Activo",
        class_limit: m.class_limit_override ?? m.plan_class_limit,
        classes_remaining: m.classes_remaining,
        start_date: m.start_date,
        end_date: m.end_date,
        class_category: normalizeClassCategory(m.class_category, "all"),
        is_non_transferable: parseBooleanFlag(m.is_non_transferable),
        is_non_repeatable: parseBooleanFlag(m.is_non_repeatable),
        repeat_key: m.repeat_key || null,
      };
    }
  } catch (err) {
    console.error("[Wallet] membership snapshot error:", err.message);
  }

  let nextBooking = null;
  try {
    const bookRes = await pool.query(
      `SELECT c.date, c.start_time, ct.name AS class_name, i.display_name AS instructor_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE b.user_id = $1
         AND b.status IN ('confirmed', 'waitlist')
         AND c.date >= CURRENT_DATE
       ORDER BY c.date ASC, c.start_time ASC
       LIMIT 1`,
      [userId],
    );
    if (bookRes.rows.length > 0) nextBooking = bookRes.rows[0];
  } catch (err) {
    console.error("[Wallet] next booking snapshot error:", err.message);
  }

  let activeEventPass = null;
  try {
    const params = [userId];
    const where = [
      "ep.user_id = $1",
      "ep.status = 'issued'",
      "e.status <> 'cancelled'",
    ];
    if (eventId) {
      params.push(eventId);
      where.push(`ep.event_id = $${params.length}`);
    } else {
      where.push(`(
        e.date > CURRENT_DATE
        OR (e.date = CURRENT_DATE AND (e.end_time IS NULL OR e.end_time >= CURRENT_TIME))
      )`);
    }
    const eventPassRes = await pool.query(
      `SELECT ep.id,
              ep.pass_code,
              ep.status,
              ep.issued_at,
              e.id AS event_id,
              e.title AS event_title,
              e.date AS event_date,
              e.start_time AS event_start_time,
              e.end_time AS event_end_time,
              e.location AS event_location
         FROM event_passes ep
         JOIN events e ON e.id = ep.event_id
        WHERE ${where.join("\n          AND ")}
        ORDER BY e.date ASC, e.start_time ASC, ep.issued_at DESC
        LIMIT 1`,
      params,
    );
    if (eventPassRes.rows.length > 0) {
      const ev = eventPassRes.rows[0];
      activeEventPass = {
        id: ev.id,
        passCode: ev.pass_code,
        status: ev.status,
        issuedAt: ev.issued_at,
        eventId: ev.event_id,
        eventTitle: ev.event_title || "Evento especial",
        eventDate: ev.event_date,
        eventStartTime: ev.event_start_time,
        eventEndTime: ev.event_end_time,
        eventLocation: ev.event_location || "",
      };
    }
  } catch (err) {
    console.error("[Wallet] active event pass snapshot error:", err.message);
  }

  return {
    userId,
    userName,
    points,
    memberSince,
    qrCode: Buffer.from(String(userId)).toString("base64"),
    membership,
    nextBooking,
    activeEventPass,
  };
}

function decodeBase64UrlToObject(value) {
  if (!value) return null;
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (_) {
    return null;
  }
}

function extractGoogleLoyaltyObjectFromSaveUrl(saveUrl) {
  const token = String(saveUrl || "").split("/save/")[1] || "";
  const payloadPart = token.split(".")[1] || "";
  const decoded = decodeBase64UrlToObject(payloadPart);
  return decoded?.payload?.loyaltyObjects?.[0] || null;
}

async function syncGoogleWalletObjectForUser(userId, { reason = "wallet_update" } = {}) {
  if (!isGoogleWalletConfigured()) {
    return { synced: false, reason: "google_wallet_not_configured" };
  }
  const snapshot = await getWalletSnapshotForUser(userId);
  if (!snapshot) return { synced: false, reason: "user_not_found" };

  const saveUrl = buildGoogleWalletSaveUrl({ ...snapshot, activeEventPass: null, passKind: "membership" });
  const loyaltyObject = extractGoogleLoyaltyObjectFromSaveUrl(saveUrl);
  if (!loyaltyObject?.id) {
    return { synced: false, reason: "google_object_build_failed" };
  }

  try {
    await ensureGoogleWalletClass();
    const accessToken = await getGoogleWalletAccessToken();
    const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const objectIdPath = encodeURIComponent(loyaltyObject.id);
    try {
      await axios.put(
        `https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/${objectIdPath}`,
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "updated", objectId: loyaltyObject.id };
    } catch (err) {
      if (err.response?.status !== 404) throw err;
      await axios.post(
        "https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject",
        loyaltyObject,
        { headers },
      );
      return { synced: true, mode: "created", objectId: loyaltyObject.id };
    }
  } catch (err) {
    console.error(`[Google Wallet] sync failed (${reason}) user=${userId}:`, err.response?.data || err.message);
    return { synced: false, reason: err.message || "google_sync_failed" };
  }
}

async function notifyApplePassUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  const serial = buildAppleWalletSerialFromUserId(userId);
  if (!serial || !APPLE_PASS_TYPE_ID) {
    return { serial, touched: 0, sent: 0, failed: 0, reason: "missing_serial_or_pass_type" };
  }

  let touched = 0;
  try {
    const touchRes = await pool.query(
      "UPDATE apple_wallet_devices SET updated_at = NOW() WHERE pass_type_id = $1 AND serial_number = $2",
      [APPLE_PASS_TYPE_ID, serial],
    );
    touched = touchRes.rowCount || 0;
  } catch (err) {
    console.error("[Apple Wallet] touch serial error:", err.message);
  }

  const regRes = await pool.query(
    `SELECT device_id, push_token
     FROM apple_wallet_devices
     WHERE pass_type_id = $1 AND serial_number = $2 AND COALESCE(push_token, '') <> ''`,
    [APPLE_PASS_TYPE_ID, serial],
  ).catch(() => ({ rows: [] }));
  const pushTokens = [...new Set(regRes.rows.map((r) => String(r.push_token || "").trim()).filter(Boolean))];

  if (!pushTokens.length) {
    return { serial, touched, total: 0, sent: 0, failed: 0, reason: "no_registered_devices" };
  }

  if (!isAppleApnsConfigured()) {
    console.log(`[Apple Wallet] APNS no configurado; pase marcado para ${serial} (${reason})`);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: 0, reason: "apns_not_configured" };
  }

  let providerToken = "";
  try {
    providerToken = getAppleApnsProviderToken();
  } catch (err) {
    console.error("[Apple Wallet] APNS token error:", err.message);
    return { serial, touched, total: pushTokens.length, sent: 0, failed: pushTokens.length, reason: "apns_token_error" };
  }

  const pushResults = [];
  for (const pushToken of pushTokens) {
    // Throttle light to reduce burst rate on APNS.
    const result = await sendApplePassUpdatedPush(pushToken, providerToken);
    pushResults.push(result);
    await new Promise((r) => setTimeout(r, 120));
  }

  const sent = pushResults.filter((r) => r.ok).length;
  const failed = pushResults.length - sent;
  const tokensToPrune = pushResults.filter(shouldPruneApplePushToken).map((r) => r.pushToken);
  if (tokensToPrune.length) {
    await pool.query(
      `UPDATE apple_wallet_devices
       SET push_token = '', updated_at = NOW()
       WHERE pass_type_id = $1 AND serial_number = $2 AND push_token = ANY($3::text[])`,
      [APPLE_PASS_TYPE_ID, serial, tokensToPrune],
    ).catch(() => { });
  }

  if (failed > 0) {
    const sampleReason = pushResults.find((r) => !r.ok)?.reason || "unknown";
    console.warn(`[Apple Wallet] push parcial serial=${serial}, sent=${sent}, failed=${failed}, reason=${sampleReason}`);
  }

  return { serial, touched, total: pushResults.length, sent, failed, reason: failed ? "partial_failure" : "ok" };
}

async function persistWalletNotificationLog(payload) {
  const userId = payload?.userId || null;
  const reason = String(payload?.reason || "wallet_update").slice(0, 160);
  const apple = payload?.apple || {};
  const google = payload?.google || {};
  const appleSent = Number(apple.sent || 0);
  const appleFailed = Number(apple.failed || 0);
  const googleSynced = !!google.synced;
  const googleMode = google.mode ? String(google.mode).slice(0, 40) : null;
  const appleReason = String(apple.reason || "");
  const googleReason = String(google.reason || "");
  const appleOk = appleFailed === 0 && !["apns_token_error"].includes(appleReason);
  const googleOk = googleSynced || ["google_wallet_not_configured", "user_not_found"].includes(googleReason);
  const status = appleOk && googleOk ? "ok" : (appleOk || googleOk ? "partial" : "failed");

  await pool.query(
    `INSERT INTO wallet_notification_logs
      (user_id, reason, apple_sent, apple_failed, google_synced, google_mode, status, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [userId, reason, appleSent, appleFailed, googleSynced, googleMode, status, JSON.stringify({ apple, google })],
  );
}

async function notifyWalletPassesUpdatedForUser(userId, { reason = "wallet_update" } = {}) {
  if (!userId) {
    return { userId, reason, apple: { reason: "missing_user_id" }, google: { reason: "missing_user_id" } };
  }
  const [appleResult, googleResult] = await Promise.allSettled([
    notifyApplePassUpdatedForUser(userId, { reason }),
    syncGoogleWalletObjectForUser(userId, { reason }),
  ]);
  const result = {
    userId,
    reason,
    apple: appleResult.status === "fulfilled" ? appleResult.value : { reason: appleResult.reason?.message || "apple_notify_failed" },
    google: googleResult.status === "fulfilled" ? googleResult.value : { reason: googleResult.reason?.message || "google_sync_failed" },
  };
  await persistWalletNotificationLog(result).catch((err) => {
    console.error("[Wallet] could not persist notification log:", err.message);
  });
  return result;
}

const walletSyncQueue = new Map();

function triggerWalletPassSync(userId, reason = "wallet_update") {
  if (!userId) return;
  const key = String(userId);
  const existing = walletSyncQueue.get(key);
  if (existing?.timer) {
    clearTimeout(existing.timer);
    existing.reasons.add(reason);
  }
  const reasons = existing?.reasons || new Set([reason]);
  const timer = setTimeout(() => {
    walletSyncQueue.delete(key);
    const mergedReason = [...reasons].join(",");
    notifyWalletPassesUpdatedForUser(userId, { reason: mergedReason }).catch((err) => {
      console.error(`[Wallet] async sync failed (${mergedReason}) user=${userId}:`, err.message);
    });
  }, 1500);
  walletSyncQueue.set(key, { timer, reasons });
}

// ─── Domain-level notification helpers ─────────────────────────────────
// Each event in SISTEMAS_LEALTAD_EVENTOS_WALLETS opens up to 3 channels:
//   1. Wallet pass update  (via triggerWalletPassSync → Apple APNS + Google object refresh)
//   2. WhatsApp            (via queueWhatsAppSend, Evolution API)
//   3. Email               (via emailService imports already present)
//
// All helpers are best-effort: never throw upstream, always log on failure.
// Voz del estudio: cercana, casual, te recibe una amiga. Sin em dashes, sin marketing,
// sin emojis decorativos masivos (uno o dos cuando aplica). Con primer nombre.

const phoneE164 = (raw) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("52") ? digits : `52${digits}`;
};

const firstNameOf = (displayName, fallback = "") => {
  const raw = String(displayName ?? "").trim();
  if (!raw) return fallback;
  return raw.split(/\s+/)[0];
};

/**
 * Send a configured WhatsApp template to a user.
 * Reads template body from system_settings.notification_templates (admin-editable).
 * Falls back to inline message if template empty/missing.
 *
 * @param {string} userId
 * @param {string} templateKey  Key into DEFAULT_NOTIFICATION_TEMPLATES
 * @param {object} extraVars    Variables besides firstName/name (auto-filled from user)
 * @param {string|((ctx:object)=>string)} fallback  Backup message if template is empty.
 */
async function notifyByTemplate(userId, templateKey, extraVars = {}, fallback = "") {
  if (!userId || !templateKey) return { sent: false, reason: "missing_arg" };
  if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE) {
    return { sent: false, reason: "evolution_not_configured" };
  }
  try {
    const res = await pool.query(
      "SELECT phone, display_name, accepts_communications, receive_reminders FROM users WHERE id = $1 LIMIT 1",
      [userId],
    );
    const u = res.rows[0];
    if (!u) return { sent: false, reason: "user_not_found" };
    if (u.accepts_communications === false && u.receive_reminders === false) {
      return { sent: false, reason: "user_opted_out" };
    }
    const number = phoneE164(u.phone);
    if (!number) return { sent: false, reason: "no_phone" };
    const firstName = firstNameOf(u.display_name, "alumna");
    const vars = { firstName, name: u.display_name || firstName, ...extraVars };
    const fallbackMessage = typeof fallback === "function" ? fallback(vars) : String(fallback || "");
    return await sendConfiguredWhatsAppTemplate({
      templateKey,
      phone: number,
      vars,
      fallbackMessage,
    });
  } catch (err) {
    console.error(`[Notify WhatsApp] error key=${templateKey}:`, err?.message);
    return { sent: false, reason: "exception", error: err?.message };
  }
}

/**
 * Pick the most relevant motivation template after a check-in.
 * Returns null when no special context applies (caller will fall back to class_attended).
 *
 * Priority (envía solo UNA por check-in):
 *   1. milestone (10/25/50/100 clases lifetime) — más impactante, one-shot
 *   2. comeback (≥14 días sin venir desde el check-in previo)
 *   3. streak_N (N semanas consecutivas asistiendo a clase)
 *   4. almost_ringed (le falta exactamente 1 clase para la meta semanal)
 *   5. first_class_week (primera clase de la semana)
 */
const WEEKLY_ATTENDANCE_GOAL = 2; // meta semanal de clases para los mensajes motivacionales

async function pickMotivationTemplate(userId) {
  // Lifetime attended count (incluye el check-in que acabamos de marcar).
  const lifetimeRes = await pool.query(
    "SELECT COUNT(*)::int AS total FROM bookings WHERE user_id = $1 AND status = 'checked_in'",
    [userId],
  );
  const lifetime = lifetimeRes.rows[0]?.total || 0;

  // Milestones lifetime ahora los maneja loyalty_milestones (recompensas + WA).
  // Esta función se enfoca solo en streak/comeback/almost/first.

  // Comeback: gap entre el check-in actual (más reciente) y el penúltimo.
  const prevRes = await pool.query(
    `SELECT checked_in_at
       FROM bookings
      WHERE user_id = $1 AND status = 'checked_in' AND checked_in_at IS NOT NULL
      ORDER BY checked_in_at DESC
      OFFSET 1 LIMIT 1`,
    [userId],
  );
  const prevCheckin = prevRes.rows[0]?.checked_in_at;
  if (prevCheckin) {
    const daysAway = Math.floor((Date.now() - new Date(prevCheckin).getTime()) / 86400000);
    if (daysAway >= 14) {
      return { templateKey: "motivation_comeback", vars: { daysAway } };
    }
  }

  // Asistencia por semana (últimas 12 semanas) derivada directo de bookings.
  // Cada fila = una semana con check-ins; week_offset 0 es la semana actual.
  const weeksRes = await pool.query(
    `SELECT FLOOR(EXTRACT(EPOCH FROM (
              date_trunc('week', NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date
              - date_trunc('week', (checked_in_at AT TIME ZONE '${STUDIO_TIMEZONE}'))::date
            )) / 604800)::int AS week_offset,
            COUNT(*)::int AS classes
       FROM bookings
      WHERE user_id = $1
        AND status = 'checked_in'
        AND checked_in_at IS NOT NULL
        AND checked_in_at >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}') - INTERVAL '12 weeks'
      GROUP BY 1
      ORDER BY 1 ASC`,
    [userId],
  );
  const classesByOffset = new Map();
  for (const row of weeksRes.rows) {
    classesByOffset.set(Number(row.week_offset), Number(row.classes || 0));
  }
  const classesThisWeek = classesByOffset.get(0) || 0;

  // Streak: semanas consecutivas (desde la actual hacia atrás) en que se asistió
  // a la meta semanal. Se rompe en la primera semana sin cumplir la meta.
  let streak = 0;
  for (let offset = 0; offset < 12; offset++) {
    if ((classesByOffset.get(offset) || 0) >= WEEKLY_ATTENDANCE_GOAL) streak++;
    else break;
  }
  if (classesThisWeek >= WEEKLY_ATTENDANCE_GOAL) {
    const streakMap = {
      2: "motivation_streak_2_weeks",
      4: "motivation_streak_4_weeks",
      8: "motivation_streak_8_weeks",
    };
    if (streakMap[streak]) {
      return { templateKey: streakMap[streak], vars: { streak } };
    }
  }

  if (classesThisWeek === WEEKLY_ATTENDANCE_GOAL - 1) {
    return { templateKey: "motivation_almost_ringed", vars: {} };
  }
  if (classesThisWeek === 1) {
    return {
      templateKey: "motivation_first_class_week",
      vars: { classesThisWeek: 1, weekGoal: WEEKLY_ATTENDANCE_GOAL },
    };
  }
  return null;
}

/**
 * Resolve and send a motivation message for the user, deduped to ≤1/día.
 * Milestones (one-shot) además se dedupan globalmente para que no se repitan.
 * Returns the templateKey sent, or null if nothing fired.
 */
async function sendMotivationIfDue(userId) {
  const pick = await pickMotivationTemplate(userId);
  if (!pick) return null;
  const { templateKey, vars } = pick;
  // Milestones son one-shot: si ya se mandó alguna vez, no repetir.
  if (templateKey.startsWith("motivation_milestone_")) {
    const dup = await pool.query(
      "SELECT 1 FROM motivation_sends WHERE user_id = $1 AND template_key = $2 LIMIT 1",
      [userId, templateKey],
    );
    if (dup.rows.length) return null;
  }
  // Dedupe diario (UNIQUE(user_id, sent_date)). Si ya hay registro hoy, no mandar.
  const insert = await pool.query(
    `INSERT INTO motivation_sends (user_id, template_key, sent_date)
     VALUES ($1, $2, CURRENT_DATE)
     ON CONFLICT (user_id, sent_date) DO NOTHING
     RETURNING id`,
    [userId, templateKey],
  );
  if (!insert.rows.length) return null;
  await notifyByTemplate(userId, templateKey, vars, "");
  return templateKey;
}

/**
 * Check loyalty milestones (recompensas auto al hit de N clases).
 * Otorga puntos/recompensa, manda WA con template configurable, y registra en
 * motivation_sends para que el resto del pipeline (motivation/class_attended)
 * no mande otro mensaje el mismo día.
 *
 * Returns array of awarded milestones (vacío si ninguno disparó).
 */
async function checkLoyaltyMilestones(userId) {
  // Milestones activos NO otorgados todavía a este usuario.
  const milestonesRes = await pool.query(
    `SELECT m.id, m.name, m.classes_required, m.period, m.award_type, m.award_points,
            m.award_reward_id, m.message_template_key
       FROM loyalty_milestones m
      WHERE m.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM loyalty_milestone_awards a
           WHERE a.user_id = $1 AND a.milestone_id = m.id
        )
      ORDER BY m.classes_required ASC`,
    [userId],
  );
  if (!milestonesRes.rows.length) return [];

  // Conteos por período (lifetime/month/year). Calculamos solo los que se necesiten.
  const counts = {};
  const ensureCount = async (period) => {
    if (counts[period] !== undefined) return counts[period];
    let q;
    if (period === "month") {
      q = `SELECT COUNT(*)::int AS n FROM bookings
            WHERE user_id = $1 AND status = 'checked_in'
              AND date_trunc('month', checked_in_at AT TIME ZONE '${STUDIO_TIMEZONE}')
                = date_trunc('month', NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')`;
    } else if (period === "year") {
      q = `SELECT COUNT(*)::int AS n FROM bookings
            WHERE user_id = $1 AND status = 'checked_in'
              AND date_trunc('year', checked_in_at AT TIME ZONE '${STUDIO_TIMEZONE}')
                = date_trunc('year', NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')`;
    } else {
      q = "SELECT COUNT(*)::int AS n FROM bookings WHERE user_id = $1 AND status = 'checked_in'";
    }
    const r = await pool.query(q, [userId]);
    counts[period] = r.rows[0]?.n || 0;
    return counts[period];
  };

  const awarded = [];
  for (const m of milestonesRes.rows) {
    const count = await ensureCount(m.period);
    if (count < m.classes_required) continue;

    // Insert award (idempotente por UNIQUE(user_id, milestone_id)).
    const ins = await pool.query(
      `INSERT INTO loyalty_milestone_awards (user_id, milestone_id, classes_at_award)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, milestone_id) DO NOTHING
       RETURNING id`,
      [userId, m.id, count],
    );
    if (!ins.rows.length) continue; // race: ya estaba.

    // Aplicar el award.
    if (m.award_type === "points" && Number(m.award_points) > 0) {
      await pool.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
        [userId, m.award_points, `Milestone: ${m.name}`],
      ).catch((err) => console.warn("[Milestone] points insert error:", err?.message));
    } else if (m.award_type === "reward" && m.award_reward_id) {
      // Auto-grant: log como transacción 0pts y opcionalmente decrementa stock.
      await pool.query(
        `INSERT INTO loyalty_transactions (user_id, type, points, description)
         VALUES ($1, 'earn', 0, $2)`,
        [userId, `Milestone reward: ${m.name}`],
      ).catch(() => {});
    }

    // Reservar el slot del día en motivation_sends para evitar duplicados.
    if (m.message_template_key) {
      const reserved = await pool.query(
        `INSERT INTO motivation_sends (user_id, template_key, sent_date)
         VALUES ($1, $2, CURRENT_DATE)
         ON CONFLICT (user_id, sent_date) DO NOTHING
         RETURNING id`,
        [userId, m.message_template_key],
      );
      if (reserved.rows.length) {
        notifyByTemplate(
          userId,
          m.message_template_key,
          { classes: count, points: m.award_points || 0, milestoneName: m.name },
          ({ firstName }) => `${firstName}, alcanzaste un nuevo logro: ${m.name}.`,
        ).catch(() => {});
      }
    }
    triggerWalletPassSync(userId, `milestone_${m.classes_required}_${m.period}`);
    awarded.push(m);
  }
  return awarded;
}

/**
 * Class attended (check-in completado en estudio).
 * Pipeline: loyalty milestone → motivation → fallback class_attended.
 * Solo UN WhatsApp por check-in (motivation_sends UNIQUE(user_id, sent_date)).
 */
async function notifyClassAttended(userId, ctx = {}) {
  triggerWalletPassSync(userId, "class_attended");
  let milestonesAwarded = [];
  try {
    milestonesAwarded = await checkLoyaltyMilestones(userId);
  } catch (err) {
    console.warn("[Milestones] error:", err?.message);
  }
  let motivated = null;
  try {
    motivated = await sendMotivationIfDue(userId);
  } catch (err) {
    console.warn("[Motivation] error:", err?.message);
  }
  if (!milestonesAwarded.length && !motivated) {
    notifyByTemplate(
      userId,
      "class_attended",
      { class: ctx.className || "tu clase" },
      ({ firstName, class: cls }) => `Listo, ${firstName}. Tenemos tu check-in de ${cls}. Buena clase. ✨`,
    ).catch(() => {});
  }
}

/**
 * Points earned. Manda WA solo si delta ≥ 50 pts (evita ruido por +10 por clase).
 * Template: points_earned · vars: firstName, points, totalPoints
 */
async function notifyPointsEarned(userId, points, totalPoints) {
  triggerWalletPassSync(userId, "points_earned");
  if (Number(points || 0) >= 50) {
    notifyByTemplate(
      userId,
      "points_earned",
      { points, totalPoints },
      ({ firstName }) => `${firstName}, sumaste ${points} puntos HIVE. Total: ${totalPoints}.`,
    ).catch(() => {});
  }
}

/**
 * Membresía activada / renovada.
 * Template: membership_activated · vars: firstName, plan, startDate, endDate
 */
async function notifyMembershipRenewed(userId, planName, ctx = {}) {
  triggerWalletPassSync(userId, "membership_renewed");
  notifyByTemplate(
    userId,
    "membership_activated",
    {
      plan: planName || "tu paquete",
      startDate: ctx.startDate || "",
      endDate: ctx.endDate || "",
    },
    ({ firstName, plan }) => `${firstName}, tu paquete ${plan} ya quedó activo. Tu pase HIVE está al día.`,
  ).catch(() => {});
}

/**
 * Membresía vence pronto. Despacha al template más específico según urgencia.
 * Templates: membership_expiring_today / _tomorrow / _n_days · vars: firstName, days
 */
async function notifyMembershipExpiring(userId, daysRemaining) {
  const days = Number(daysRemaining);
  triggerWalletPassSync(userId, `membership_expiring_${days}d`);
  const key =
    days <= 0 ? "membership_expiring_today"
    : days === 1 ? "membership_expiring_tomorrow"
    : "membership_expiring_n_days";
  const fallback = ({ firstName }) => {
    if (days <= 0) return `${firstName}, hoy vence tu paquete HIVE. Renueva desde la app.`;
    if (days === 1) return `${firstName}, mañana vence tu paquete HIVE. Renueva desde la app.`;
    return `${firstName}, te quedan ${days} días en tu paquete HIVE.`;
  };
  notifyByTemplate(userId, key, { days }, fallback).catch(() => {});
}

/**
 * Membresía vencida.
 * Template: membership_expired · vars: firstName
 */
async function notifyMembershipExpired(userId) {
  triggerWalletPassSync(userId, "membership_expired");
  notifyByTemplate(
    userId,
    "membership_expired",
    {},
    ({ firstName }) => `${firstName}, tu paquete terminó. Aquí seguimos cuando quieras volver.`,
  ).catch(() => {});
}

/**
 * Reserva confirmada.
 * Template: booking_confirmed · vars: firstName, class, date, time
 */
async function notifyBookingConfirmed(userId, ctx = {}) {
  triggerWalletPassSync(userId, "booking_confirmed");
  notifyByTemplate(
    userId,
    "booking_confirmed",
    {
      class: ctx.className || "tu clase",
      date: ctx.date || ctx.when || "",
      time: ctx.time || "",
    },
    ({ firstName, class: cls }) => `${firstName}, te apartamos lugar de ${cls}. Tu pase HIVE ya lo trae cargado.`,
  ).catch(() => {});
}

/**
 * Reserva cancelada (live flow usa el template DB en el endpoint mismo).
 * Template: booking_cancelled · vars: firstName, class, date, creditRestored
 */
async function notifyBookingCancelled(userId, ctx = {}) {
  triggerWalletPassSync(userId, "booking_cancelled");
  notifyByTemplate(
    userId,
    "booking_cancelled",
    {
      class: ctx.className || "tu clase",
      date: ctx.date || "",
      creditRestored: ctx.creditRestored ? "Sí" : "No",
    },
    ({ firstName, class: cls }) => `${firstName}, cancelaste tu reserva de ${cls}.`,
  ).catch(() => {});
}

/**
 * Inscripción a evento.
 * Template: event_registered · vars: firstName, eventTitle
 */
async function notifyEventRegistered(userId, ctx = {}) {
  triggerWalletPassSync(userId, "event_registered");
  notifyByTemplate(
    userId,
    "event_registered",
    { eventTitle: ctx.eventTitle || "tu evento" },
    ({ firstName, eventTitle }) => `${firstName}, quedaste inscrita a ${eventTitle}. En tu HIVE Wallet ya tienes el pase con QR.`,
  ).catch(() => {});
}

/**
 * Recompensa canjeada.
 * Template: reward_redeemed · vars: firstName, rewardName, points
 */
async function notifyRewardRedeemed(userId, rewardName, pointsSpent) {
  triggerWalletPassSync(userId, "reward_redeemed");
  notifyByTemplate(
    userId,
    "reward_redeemed",
    { rewardName: rewardName || "tu recompensa", points: pointsSpent },
    ({ firstName, rewardName: rn }) => `${firstName}, canjeaste "${rn}". Pasa por recepción a reclamarlo. ✨`,
  ).catch(() => {});
}

console.log("[Apple Wallet] Config check:",
  isAppleWalletConfigured() ? "✅ All certs configured — .pkpass mode" : "⚠️ Missing certs — web pass fallback mode");
console.log("[Apple Wallet]",
  "| TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
  "| PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
  "| CERT:", APPLE_SIGNER_CERT_PEM ? `✅ (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌",
  "| KEY:", APPLE_SIGNER_KEY_PEM ? `✅ (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌",
  "| WWDR:", APPLE_WWDR_CERT_PEM ? `✅ (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌",
  "| APNS:", isAppleApnsConfigured() ? "✅" : "⚠️");
console.log("[Apple Wallet] File paths checked:",
  "cert:", CERT_FILE_PATHS.cert, safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌",
  "| key:", CERT_FILE_PATHS.key, safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌",
  "| wwdr:", CERT_FILE_PATHS.wwdr, safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌");
console.log("[Apple Wallet] Cert dir candidates:", WALLET_ASSET_DIR_CANDIDATES.join(" | "));
console.log("[Apple Wallet] ASSET_DIR:", findAssetDir());

// Validate certs at startup if configured
if (isAppleWalletConfigured()) {
  try {
    console.log("[Apple Wallet] Cert PEM starts with:", APPLE_SIGNER_CERT_PEM.substring(0, 50));
    console.log("[Apple Wallet] Key PEM starts with:", APPLE_SIGNER_KEY_PEM.substring(0, 50));
    console.log("[Apple Wallet] WWDR PEM starts with:", APPLE_WWDR_CERT_PEM.substring(0, 50));
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      console.log("[Apple Wallet] ✅ Private key validated successfully");
    } catch (keyErr) {
      console.error("[Apple Wallet] ❌ Private key validation failed:", keyErr.message);
    }
  } catch (certErr) {
    console.error("[Apple Wallet] ❌ Cert decode error:", certErr.message);
  }
}

/** Check if we can at least generate a web pass (always true — no certs needed) */
function isAppleWebPassAvailable() {
  return true;
}

/**
 * Generate a .pkpass file as a Buffer for a given user.
 * Apple .pkpass = ZIP containing: pass.json, manifest.json, signature, icon.png, logo.png, strip.png
 */
// ─── Dynamic strip renderer (branded SVG → PNG via sharp) ─────────
// Builds a 375×123 strip image: fondo cálido con marco de esquinas y el
// isotipo HIVE al centro. Ya no dibuja anillos ni texto.

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Isotipo HIVE (versión clara, transparente) como data URI, cacheado.
// Se embebe como <image> en el strip: es imagen, no texto, así que renderiza en
// el servidor sin depender de fuentes. Devuelve null si no se halla el asset.
const MARK_LIGHT_CACHE = { dataUri: undefined };
function getMarkLightDataUri() {
  if (MARK_LIGHT_CACHE.dataUri !== undefined) return MARK_LIGHT_CACHE.dataUri;
  let uri = null;
  try {
    const p = findAssetFile(["hive-mark-light.png"]);
    if (p) uri = `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch (e) { console.warn("[wallet] hive-mark-light no disponible:", e.message); }
  MARK_LIGHT_CACHE.dataUri = uri;
  return uri;
}

function buildPassStripSvg(ringState, scale = 1, opts = {}) {
  const W = Math.round(375 * scale);
  const H = Math.round(123 * scale);
  const fg = "#FAF9F6"; // Feather White

  // Membresía de CLUB EXCLUSIVO: fondo cálido Desert Rock + marco de esquinas +
  // el isotipo HIVE (imagen embebida, CERO texto → nunca "tofu"). Diseñado
  // en viewBox 0 0 375 123; resvg lo escala nítido a W×H.
  const mark = getMarkLightDataUri();

  // Marco de esquinas (estilo tarjeta de club acuñada).
  const ins = 14, arm = 16;
  const cb = (x1, y1, x2, y2) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${fg}" stroke-opacity="0.5" stroke-width="1" stroke-linecap="round" />`;
  const corners = [
    cb(ins, ins, ins + arm, ins), cb(ins, ins, ins, ins + arm),
    cb(375 - ins, ins, 375 - ins - arm, ins), cb(375 - ins, ins, 375 - ins, ins + arm),
    cb(ins, 123 - ins, ins + arm, 123 - ins), cb(ins, 123 - ins, ins, 123 - ins - arm),
    cb(375 - ins, 123 - ins, 375 - ins - arm, 123 - ins), cb(375 - ins, 123 - ins, 375 - ins, 123 - ins - arm),
  ].join("");

  // Guilloché (engine-turn) sutil: dos familias de ondas finas tipo billete/sello.
  const wave = (step, amp, cycles, phase, opBase, opFade) => {
    let out = "", i = 0;
    for (let y = step; y < 123; y += step) {
      const pts = [];
      for (let x = 0; x <= 375; x += 7.8) {
        const yy = y + amp * Math.sin((x / 375) * cycles * 2 * Math.PI + phase + y * 0.18);
        pts.push(`${x.toFixed(1)} ${yy.toFixed(1)}`);
      }
      const op = Math.max(0.04, opBase - i * opFade);
      out += `<path d="M${pts.join("L")}" fill="none" stroke="#E6DAC8" stroke-width="0.5" stroke-opacity="${op.toFixed(3)}" stroke-linecap="round" />`;
      i++;
    }
    return out;
  };
  const guilloche = wave(7, 1.5, 6, 0, 0.13, 0.003) + wave(9, 1.2, 4.5, Math.PI / 2, 0.09, 0.002);

  // Emblema central: el logo real; si faltara el asset, anillo vector de respaldo.
  const lsize = 96, lx = 187.5 - lsize / 2, ly = 61.5 - lsize / 2;
  const emblem = mark
    ? `<image href="${mark}" x="${lx}" y="${ly}" width="${lsize}" height="${lsize}" opacity="0.96" preserveAspectRatio="xMidYMid meet" />`
    : `<circle cx="187.5" cy="61.5" r="13" fill="none" stroke="${fg}" stroke-opacity="0.85" stroke-width="1" /><circle cx="187.5" cy="61.5" r="2" fill="${fg}" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 375 123">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#AC9682" />
      <stop offset="100%" stop-color="#9A8166" />
    </linearGradient>
    <radialGradient id="seal" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"   stop-color="#F4F1EA" stop-opacity="0.18" />
      <stop offset="60%"  stop-color="#E6DAC8" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#A48D78" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="375" height="123" fill="url(#bg)" />
  ${guilloche}
  <rect width="375" height="123" fill="url(#seal)" />
  ${corners}
  ${emblem}
</svg>`;
}

function detectStripMode({ membership }) {
  const hasMembership = !!membership;
  if (!hasMembership) return "welcome";
  const endDate = membership?.end_date ? new Date(membership.end_date) : null;
  if (endDate && !Number.isNaN(endDate.getTime()) && endDate < new Date()) return "expired";
  return "default";
}

async function buildPassStripPng(ringState, scale = 1, opts = {}) {
  const svg = buildPassStripSvg(ringState, scale, {
    mode: opts.mode || "default",
    planName: opts.planName || "",
    classesLabel: opts.classesLabel || "",
  });
  return await sharp(Buffer.from(svg, "utf8")).png({ compressionLevel: 9 }).toBuffer();
}

async function generateApplePkpass({ userId, userName, points, qrCode, membership, nextBooking, activeEventPass }) {
  const baseSerialNumber = buildAppleWalletSerialFromUserId(userId);
  const hasMembership = !!membership;
  const hasEventPass = !!activeEventPass;
  const eventSerialHash = hasEventPass
    ? crypto.createHash("sha1").update(String(activeEventPass?.eventId || activeEventPass?.passCode || "")).digest("hex").slice(0, 12)
    : "";
  const serialNumber = hasEventPass ? `${baseSerialNumber}_ev_${eventSerialHash}` : baseSerialNumber;
  const eventSchedule = formatWalletEventSchedule(activeEventPass);
  const eventTitle = truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 30);
  const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
  const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
  const eventDateShort = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { day: "numeric", month: "short" })
    : "Por confirmar";
  const eventDateLong = hasValidEventDate
    ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "Fecha por confirmar";
  const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
  const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
  const eventTimeShort = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel}-${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Por confirmar");
  const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
    ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
    : (eventStartTimeLabel || "Horario por confirmar");
  const eventLocationShort = truncateWalletField(activeEventPass?.eventLocation || PASS_DEFAULT_TEXTS.eventLocationDefault, 24);
  const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || PASS_DEFAULT_TEXTS.eventLocationDefault, 38);
  const eventCodeLabel = truncateWalletField(activeEventPass?.passCode || "—", 18);
  // HIVE lockscreen relevance:
  // - Para membership pass: 30 min antes de la próxima clase (si existe).
  //   Apple muestra el pase en la lockscreen automáticamente alrededor de esta hora.
  // - Geocerca: `locations` (abajo) para que también aparezca cuando la alumna
  //   esté cerca del estudio, sólo si BUSINESS_LATITUDE/BUSINESS_LONGITUDE existen.
  const membershipRelevantDate = (() => {
    if (hasEventPass) return null;
    if (!nextBooking?.date) return null;
    try {
      const day = String(nextBooking.date).slice(0, 10);
      const time = String(nextBooking.start_time || "07:00:00").slice(0, 8);
      const start = new Date(`${day}T${time}`);
      if (Number.isNaN(start.getTime())) return null;
      // 30 min before to give the alumna time to walk in
      start.setMinutes(start.getMinutes() - 30);
      return start.toISOString();
    } catch (_) {
      return null;
    }
  })();

  const eventRelevantDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const startDate = new Date(eventDateObj);
    if (eventStartTimeLabel) {
      const [hh, mm] = eventStartTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        startDate.setHours(hh, mm, 0, 0);
      }
    } else {
      startDate.setHours(10, 0, 0, 0);
    }
    return startDate.toISOString();
  })();
  const eventExpirationDate = (() => {
    if (!hasEventPass || !hasValidEventDate) return null;
    const endDate = new Date(eventDateObj);
    if (eventEndTimeLabel) {
      const [hh, mm] = eventEndTimeLabel.split(":").map((p) => Number(p));
      if (Number.isFinite(hh) && Number.isFinite(mm)) {
        endDate.setHours(hh, mm, 0, 0);
      }
    } else {
      endDate.setHours(23, 0, 0, 0);
    }
    endDate.setHours(endDate.getHours() + 8);
    return endDate.toISOString();
  })();
  const membershipCategory = hasMembership
    ? normalizeClassCategory(membership.class_category, "all")
    : "all";
  const membershipCategoryLabel = getWalletCategoryLabel(membershipCategory);
  const progressSummary = getWalletProgressSummary(membership);
  const isUnlimited = hasMembership && (membership.class_limit === null || membership.class_limit >= 9999);
  const isTrialSingleSession = hasMembership && String(membership.repeat_key || "").startsWith("trial_single_session");
  const nonTransferable = hasMembership && parseBooleanFlag(membership.is_non_transferable);
  const nonRepeatable = hasMembership && parseBooleanFlag(membership.is_non_repeatable);
  // Drenched espresso card — brand "firma" for wallet
  // Tarjeta cálida Desert Rock (colores heredados del pase anterior).
  const passBackground = "rgb(164, 141, 120)";  // Desert Rock #A48D78 — fondo cálido
  const passForeground = "rgb(250, 249, 246)";  // Feather White #FAF9F6 — valores (alto contraste)
  const passAccent = "rgb(230, 218, 200)";      // Creamed Oat #E6DAC8 — labels
  const classLimit = hasMembership ? Number(membership.class_limit ?? 0) : 0;
  const classesRemaining = hasMembership
    ? Math.max(0, Number(membership.classes_remaining ?? classLimit ?? 0))
    : 0;
  const stripStampState = resolveWalletStripStampState(classLimit, classesRemaining);
  const hasIconStampMode = hasMembership && !isUnlimited && stripStampState.total > 0;
  const membershipHeadline = isTrialSingleSession
    ? "Clase Muestra"
    : (isUnlimited ? "Meta abierta" : PASS_DEFAULT_TEXTS.membershipHeadline);
  const memberDisplayName = truncateWalletField(userName, 22);
  const planDisplayName = truncateWalletField(
    hasMembership ? (membership.plan_name || `${membershipCategoryLabel} ${isUnlimited ? "Ilimitado" : ""}`.trim()) : "",
    28,
  );
  const shouldUseStampStrip = !hasEventPass && hasMembership && !isUnlimited && stripStampState.total > 0;
  const showFullFrontTextFields = hasEventPass
    ? parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_EVENT || false)
    : parseBooleanFlag(process.env.APPLE_WALLET_SHOW_FRONT_TEXT_MEMBERSHIP || false);

  // Build secondary/auxiliary fields
  const secondaryFields = [];
  const auxiliaryFields = [];
  const compactAuxiliaryFields = [];
  const backFields = [];

  // ── Next loyalty milestone (recompensa por asistencia) — para back field ──
  // Independiente del estado de membresía: si la dueña ya configuró milestones,
  // queremos surfacearlos en el pase para gamificación.
  let nextMilestone = null;
  let milestoneClassesRemaining = null;
  if (userId) {
    try {
      const lifetimeRes = await pool.query(
        "SELECT COUNT(*)::int AS n FROM bookings WHERE user_id = $1 AND status = 'checked_in'",
        [userId],
      );
      const lifetime = lifetimeRes.rows[0]?.n || 0;
      const nextRes = await pool.query(
        `SELECT m.name, m.classes_required, m.award_points, m.award_type
           FROM loyalty_milestones m
          WHERE m.is_active = true
            AND m.period = 'lifetime'
            AND m.classes_required > $1
            AND NOT EXISTS (
              SELECT 1 FROM loyalty_milestone_awards a
               WHERE a.user_id = $2 AND a.milestone_id = m.id
            )
          ORDER BY m.classes_required ASC
          LIMIT 1`,
        [lifetime, userId],
      );
      if (nextRes.rows.length) {
        nextMilestone = nextRes.rows[0];
        milestoneClassesRemaining = nextMilestone.classes_required - lifetime;
      }
    } catch (_) { /* milestone lookup falla silently */ }
  }

  // ── Weekly cap (planes 'Barre — N por semana') — para back field ──
  let weeklyCap = null;
  if (hasMembership) {
    try {
      const wRes = await pool.query(
        `SELECT p.weekly_class_limit AS lim,
                (SELECT COUNT(*)::int FROM bookings b
                   JOIN classes c ON c.id = b.class_id
                  WHERE b.user_id = $1 AND b.membership_id = $2
                    AND b.status IN ('confirmed','waitlist','checked_in')
                    AND date_trunc('week', c.date::date) = date_trunc('week', CURRENT_DATE)
                ) AS used
           FROM plans p
          WHERE p.id = (SELECT plan_id FROM memberships WHERE id = $2)`,
        [userId, membership.id],
      );
      const lim = wRes.rows[0]?.lim;
      if (lim && lim > 0) {
        weeklyCap = { limit: lim, used: wRes.rows[0]?.used || 0 };
      }
    } catch (_) { /* weekly cap lookup falla silently */ }
  }

  // Socia desde: fecha de registro de la alumna (para el pase tipo club).
  let memberSinceLabel = null;
  try {
    const _u = await pool.query("SELECT created_at FROM users WHERE id = $1", [userId]);
    const _ca = _u.rows[0]?.created_at;
    if (_ca) {
      const _m = new Date(_ca).toLocaleDateString("es-MX", { month: "short", year: "numeric" });
      memberSinceLabel = _m.charAt(0).toUpperCase() + _m.slice(1);
    }
  } catch (_) { /* socia desde opcional */ }

  if (hasEventPass) {
    secondaryFields.push({
      key: "event_title",
      label: "EVENTO",
      value: truncateWalletField(eventTitle, 24),
    });
    secondaryFields.push({
      key: "event_date",
      label: "FECHA",
      value: eventDateLong,
    });
    auxiliaryFields.push({
      key: "event_time",
      label: "HORARIO",
      value: eventTimeLong,
    });
    auxiliaryFields.push({
      key: "event_code",
      label: "CÓDIGO",
      value: eventCodeLabel,
    });
    if (activeEventPass?.eventLocation) {
      auxiliaryFields.push({
        key: "event_location",
        label: "SEDE",
        value: eventLocationLong,
      });
    }
    compactAuxiliaryFields.push(
      {
        key: "compact_event_time",
        label: "HORA",
        value: eventTimeShort,
      },
      {
        key: "compact_event_venue",
        label: "SEDE",
        value: eventLocationShort,
      },
      {
        key: "compact_event_code",
        label: "CÓDIGO",
        value: eventCodeLabel,
      },
    );
  }

  if (hasMembership) {
    // Frente tipo club: NOMBRE · NIVEL (paquete) + SOCIA DESDE · DISPONIBLES.
    // Los operativos (modalidad, vigencia, reglas) van al reverso.
    secondaryFields.push({
      key: "nombre",
      label: "NOMBRE",
      value: memberDisplayName || "Miembro",
    });
    secondaryFields.push({
      key: "nivel",
      label: "NIVEL",
      value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
    });
    if (memberSinceLabel) {
      auxiliaryFields.push({ key: "socia_desde", label: "SOCIA DESDE", value: memberSinceLabel });
    }
    if (isUnlimited) {
      auxiliaryFields.push({ key: "clases", label: "DISPONIBLES", value: "Ilimitadas" });
    } else if (classLimit > 0 && !hasIconStampMode && !hasEventPass) {
      auxiliaryFields.push({
        key: "clases",
        label: "DISPONIBLES",
        value: progressSummary.remainingLabel,
        changeMessage: "Clases restantes: %@",
      });
    }
    // Tope semanal — visible solo si el plan lo tiene
    if (weeklyCap) {
      const remaining = Math.max(0, weeklyCap.limit - weeklyCap.used);
      backFields.push({
        key: "weekly_cap",
        label: "Tope semanal",
        value: remaining === 0
          ? `Ya reservaste tus ${weeklyCap.limit} clases de esta semana`
          : `Te quedan ${remaining} de ${weeklyCap.limit} esta semana`,
        changeMessage: "Tope semanal: %@",
      });
    }
    // Próximo logro (loyalty milestone)
    if (nextMilestone && milestoneClassesRemaining !== null) {
      const reward = nextMilestone.award_type === "points"
        ? `+${nextMilestone.award_points} pts`
        : "recompensa";
      backFields.push({
        key: "next_milestone",
        label: "Próximo logro",
        value: milestoneClassesRemaining === 1
          ? `1 clase más para ${nextMilestone.name} · ${reward}`
          : `${milestoneClassesRemaining} clases más para ${nextMilestone.name} · ${reward}`,
        changeMessage: "Tu próximo logro: %@",
      });
    }
  } else {
    // Sin membresía activa: pase de bienvenida tipo club (NOMBRE · NIVEL · SOCIA DESDE).
    secondaryFields.push({
      key: "nombre",
      label: "NOMBRE",
      value: memberDisplayName || "Miembro",
    });
    secondaryFields.push({
      key: "nivel",
      label: "NIVEL",
      value: "Bienvenida",
    });
    if (memberSinceLabel) {
      auxiliaryFields.push({ key: "socia_desde", label: "SOCIA DESDE", value: memberSinceLabel });
    }
    backFields.push(
      {
        key: "intro_back",
        label: PASS_DEFAULT_TEXTS.welcomeBackLabel,
        value: "Te recibimos como te recibe una amiga. Grupos pequeños: el cupo de cada clase se ve en la app. Atención personalizada y alguien que te conoce por tu nombre.",
      },
      {
        key: "muestra_back",
        label: "Tu primera clase",
        value: "Reserva tu clase muestra Studio por $150 desde la app o por WhatsApp. Te explicamos el equipo y te acompañamos en cada movimiento.",
      },
    );
    // Próximo logro como meta aspiracional para alumnas sin paquete
    if (nextMilestone && milestoneClassesRemaining !== null) {
      const reward = nextMilestone.award_type === "points"
        ? `+${nextMilestone.award_points} pts`
        : "recompensa";
      backFields.push({
        key: "next_milestone_welcome",
        label: "Tu primer logro",
        value: `${nextMilestone.classes_required} clases para ${nextMilestone.name} · ${reward}`,
      });
    }
  }

  if (nextBooking) {
    const bookingDate = new Date(nextBooking.date);
    const dateStr = bookingDate.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });
    const timeStr = nextBooking.start_time ? String(nextBooking.start_time).substring(0, 5) : "";
    backFields.push({
      key: "next_class",
      label: "PRÓXIMA CLASE",
      value: `${nextBooking.class_name || "Clase"} — ${dateStr} ${timeStr}${nextBooking.instructor_name ? ` — ${nextBooking.instructor_name}` : ""}`,
      changeMessage: "%@",
    });
  }

  if (!showFullFrontTextFields) {
    if (hasMembership) {
      backFields.unshift(
        {
          key: "membership_plan_back",
          label: "PLAN",
          value: planDisplayName || `${membershipCategoryLabel}${isUnlimited ? " ilimitado" : ""}`,
        },
        {
          key: "membership_mode_back",
          label: "MODALIDAD",
          value: membershipCategoryLabel,
        },
      );
      if (membership.end_date) {
        const endDate = new Date(membership.end_date);
        const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
        backFields.unshift({
          key: "membership_valid_back",
          label: "VIGENTE HASTA",
          value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })} (${daysLeft}d)`,
        });
      }
      if (isUnlimited) {
        backFields.unshift({ key: "membership_classes_back", label: "CLASES", value: "Ilimitadas" });
      } else if (classLimit > 0) {
        backFields.unshift({
          key: "membership_classes_back",
          label: "CLASES",
          value: `${progressSummary.completionLabel} · ${progressSummary.remainingLabel}`,
        });
      }
      const rules = [];
      if (nonTransferable) rules.push("No transferible");
      if (nonRepeatable) rules.push("No repetible");
      if (rules.length) {
        backFields.unshift({
          key: "membership_rules_back",
          label: "REGLAS",
          value: rules.join(" · "),
        });
      }
    } else {
      backFields.unshift({ key: "membership_status_back", label: "ESTADO", value: "Sin membresía activa" });
    }
  }

  if (hasEventPass) {
    backFields.push(
      {
        key: "event_title_back",
        label: "EVENTO",
        value: activeEventPass.eventTitle || "Evento especial",
      },
      {
        key: "event_code_back",
        label: "CÓDIGO DE CHECK-IN",
        value: activeEventPass.passCode || "—",
      },
    );
    if (eventSchedule) {
      backFields.push({
        key: "event_schedule_back",
        label: "HORARIO",
        value: eventSchedule,
      });
    }
    if (activeEventPass?.eventLocation) {
      backFields.push({
        key: "event_location_back",
        label: "UBICACIÓN",
        value: activeEventPass.eventLocation,
      });
    }
    backFields.push(
      {
        key: "event_access_back",
        label: "ACCESO",
        value: "Pase personal de un solo acceso. No transferible.",
      },
      {
        key: "event_checkin_back",
        label: "CHECK-IN",
        value: "Presenta tu QR en recepción 10 minutos antes del evento.",
      },
    );
  }

  backFields.push(
    { key: "cliente", label: "CLIENTE", value: userName },
    { key: "puntos", label: PASS_DEFAULT_TEXTS.pointsLabel, value: `${points.toLocaleString("es-MX")} pts` },
    { key: "studio", label: "ESTUDIO", value: PASS_DEFAULT_TEXTS.studioAddress },
    { key: "horario_studio", label: "HORARIOS", value: PASS_DEFAULT_TEXTS.studioHours },
    // Sin WhatsApp/teléfono público todavía (STUDIO.phone es null en
    // src/lib/studio.ts): se omite el campo en vez de mostrar un número viejo.
    { key: "web", label: "RESERVAR EN LÍNEA", value: `${SITE_URL}/app/bookings` },
    {
      key: "terms",
      label: "TÉRMINOS",
      value: hasEventPass
        ? "Pase válido para un acceso al evento indicado. Presenta el QR en recepción."
        : PASS_DEFAULT_TEXTS.termsDefault,
    }
  );

  const primaryFields = [
    {
      key: "headline",
      label: hasEventPass ? "EVENTO ACTIVO" : (hasMembership ? "PASE ACTIVO" : "MIEMBRO"),
      value: hasEventPass
        ? truncateWalletField(activeEventPass.eventTitle || "Evento especial", 20)
        : hasMembership
          ? truncateWalletField(progressSummary.isUnlimited ? membershipHeadline : progressSummary.completionLabel, 20)
          : (memberDisplayName || "Miembro"),
      changeMessage: hasEventPass
        ? "Evento activo: %@"
        : hasMembership
          ? "Tu pase ahora es %@"
          : undefined,
    },
  ];

  const compactPrimaryFields = hasEventPass
    ? []
    : [
      {
        key: "compact_title",
        label: hasMembership ? "CLASES" : "MIEMBRO",
        value: hasMembership
          ? truncateWalletField(progressSummary.isUnlimited ? "Ilimitado" : progressSummary.remainingLabel, 22)
          : truncateWalletField(memberDisplayName || "Miembro", 22),
      },
    ];

  const compactSecondaryFields = [];
  if (hasEventPass) {
    compactSecondaryFields.push({
      key: "compact_event_title",
      label: "EVENTO",
      value: truncateWalletField(activeEventPass?.eventTitle || "Evento especial", 20),
    });
    compactSecondaryFields.push({
      key: "compact_event_date",
      label: "FECHA",
      value: truncateWalletField(eventDateShort, 16),
    });
  } else if (hasMembership && membership.end_date) {
    const endDate = new Date(membership.end_date);
    const daysLeft = Math.max(0, Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24)));
    compactSecondaryFields.push({
      key: "compact_valid_until",
      label: "VIGENCIA",
      value: `${endDate.toLocaleDateString("es-MX", { day: "numeric", month: "short" })} (${daysLeft}d)`,
    });
  }

  // Build pass.json
  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: APPLE_PASS_TYPE_ID,
    serialNumber,
    teamIdentifier: APPLE_TEAM_ID,
    organizationName: PASS_DEFAULT_TEXTS.organizationName,
    description: hasEventPass
      ? `Evento — ${activeEventPass?.eventTitle || PASS_DEFAULT_TEXTS.eventLocationDefault}`
      : `${PASS_DEFAULT_TEXTS.membershipHeadline} — ${progressSummary.goalLabel}`,
    logoText: "",
    foregroundColor: passForeground,
    backgroundColor: passBackground,
    labelColor: passAccent,
    storeCard: {
      headerFields: [
        { key: "points", label: "PUNTOS", value: points, textAlignment: "PKTextAlignmentRight", changeMessage: "Ahora tienes %@ puntos" },
      ],
      primaryFields: hasEventPass
        ? (showFullFrontTextFields ? primaryFields : compactPrimaryFields)
        : (showFullFrontTextFields ? primaryFields : []),
      secondaryFields: hasEventPass
        ? (showFullFrontTextFields ? secondaryFields : compactSecondaryFields)
        : secondaryFields,
      auxiliaryFields: hasEventPass
        ? (showFullFrontTextFields ? auxiliaryFields : compactAuxiliaryFields)
        : auxiliaryFields,
      backFields,
    },
    barcode: {
      message: qrCode,
      format: "PKBarcodeFormatQR",
      messageEncoding: "iso-8859-1",
    },
    barcodes: [
      {
        message: qrCode,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
      },
    ],
    webServiceURL: `${SITE_URL}/api/wallet`,
    authenticationToken: APPLE_AUTH_TOKEN,
    relevantDate: membershipRelevantDate || eventRelevantDate,
    // Geocerca: el pase aparece en la pantalla de bloqueo cerca del estudio.
    // Para activarla define BUSINESS_LATITUDE y BUSINESS_LONGITUDE (y, opcional,
    // BUSINESS_PASS_RADIUS_M) con las coordenadas de Cuauhtémoc #68, Del Carmen,
    // Coyoacán, CDMX (src/lib/studio.ts). Sin ellas no hay coordenadas de
    // respaldo: el pase sale sin `locations` ni aviso de cercanía.
    // Ver server/lib/passGeofence.js.
    ...passLocationFields(hasEventPass
      ? "Estás cerca del estudio. Saca tu pase del evento."
      : PASS_DEFAULT_TEXTS.geofenceRelevantText),
  };
  if (eventExpirationDate) {
    passJson.expirationDate = eventExpirationDate;
  }

  // Read image assets with dedicated retina variants to avoid pixelation in Wallet.
  const assetCategory =
    hasEventPass
      ? "event"
      : membershipCategory === "mixto"
        ? "mixto"
        : "pilates";

  const iconPath = findAssetFile([
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
  ]);
  const icon2xPath = findAssetFile([
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
  ]);
  const icon3xPath = findAssetFile([
    `wallet-icon-${assetCategory}@3x.png`,
    "wallet-icon-event@3x.png",
    "wallet-icon-mixto@3x.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    "wallet-icon-mixto@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
    "wallet-icon-mixto.png",
  ]);

  const logoPath = findAssetFile([
    "wallet-logo.png",
    "wallet-logo-black.png",
  ]);
  const logo2xPath = findAssetFile([
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);
  const logo3xPath = findAssetFile([
    "wallet-logo@3x.png",
    "wallet-logo@2x.png",
    "wallet-logo.png",
    "wallet-logo-black@3x.png",
    "wallet-logo-black@2x.png",
    "wallet-logo-black.png",
  ]);

  const thumbPath = findAssetFile([
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
  ]);
  const thumb2xPath = findAssetFile([
    `wallet-thumb-${assetCategory}@2x.png`,
    "wallet-thumb-event@2x.png",
    `wallet-thumb-${assetCategory}.png`,
    "wallet-thumb-event.png",
    `wallet-icon-${assetCategory}@2x.png`,
    "wallet-icon-event@2x.png",
    `wallet-icon-${assetCategory}.png`,
    "wallet-icon-event.png",
  ]);

  let dynamicStripName = "none";
  let stripPath = null;
  let strip2xPath = null;
  let strip3xPath = null;
  if (!hasEventPass) {
    const stripCategory =
      membershipCategory === "mixto" ? "mixto"
        : "pilates";
    dynamicStripName = shouldUseStampStrip
      ? `wallet-strip-${stripCategory}-t${stripStampState.total}-r${stripStampState.remaining}.png`
      : `wallet-strip-${stripCategory}.png`;
    const dynamicStripPath = shouldUseStampStrip
      ? findAssetFile([dynamicStripName])
      : null;
    const stripCandidates = [`wallet-strip-${stripCategory}.png`, "wallet-strip-mixto.png"];
    const strip2xCandidates = [`wallet-strip-${stripCategory}@2x.png`, "wallet-strip-mixto@2x.png"];
    const strip3xCandidates = [`wallet-strip-${stripCategory}@3x.png`, "wallet-strip-mixto@3x.png"];
    stripPath = dynamicStripPath || findAssetFile(stripCandidates);
    strip2xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@2x.png")])
      : findAssetFile(strip2xCandidates);
    strip3xPath = dynamicStripPath
      ? findAssetFile([dynamicStripName.replace(".png", "@3x.png")])
      : findAssetFile(strip3xCandidates);
  }

  const readAssetBuffer = (assetPath) => (assetPath && fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : null);
  const iconBuffer = readAssetBuffer(iconPath);
  const icon2xBuffer = readAssetBuffer(icon2xPath) || iconBuffer;
  const icon3xBuffer = readAssetBuffer(icon3xPath) || icon2xBuffer || iconBuffer;
  const logoBuffer = readAssetBuffer(logoPath);
  const logo2xBuffer = readAssetBuffer(logo2xPath) || logoBuffer;
  const logo3xBuffer = readAssetBuffer(logo3xPath) || logo2xBuffer || logoBuffer;
  const thumbBuffer = readAssetBuffer(thumbPath);
  const thumb2xBuffer = readAssetBuffer(thumb2xPath) || thumbBuffer;
  // Strip: prefer dynamically rendered SVG with current ring progress.
  // Falls back to disk-based strip if rendering fails (e.g., sharp missing).
  let stripBuffer = null;
  let strip2xBuffer = null;
  let strip3xBuffer = null;
  if (!hasEventPass) {
    try {
      const stripMode = detectStripMode({ membership });
      const stripPlanName = hasMembership ? planDisplayName : "";
      const stripClassesLabel = hasMembership
        ? (progressSummary.isUnlimited ? "Ilimitado" : progressSummary.remainingLabel)
        : "";
      const stripOpts = { mode: stripMode, planName: stripPlanName, classesLabel: stripClassesLabel };
      const [s1, s2, s3] = await Promise.all([
        buildPassStripPng(null, 1, stripOpts),
        buildPassStripPng(null, 2, stripOpts),
        buildPassStripPng(null, 3, stripOpts),
      ]);
      stripBuffer = s1;
      strip2xBuffer = s2;
      strip3xBuffer = s3;
      console.log(`[Apple Wallet] ✅ Dynamic strip rendered (mode=${stripMode})`,
        `plan: ${stripPlanName || "—"}`, `clases: ${stripClassesLabel || "—"}`,
      );
    } catch (err) {
      console.warn("[Apple Wallet] Dynamic strip render failed, falling back to disk:", err?.message);
      stripBuffer = readAssetBuffer(stripPath);
      strip2xBuffer = readAssetBuffer(strip2xPath) || stripBuffer;
      strip3xBuffer = readAssetBuffer(strip3xPath) || strip2xBuffer || stripBuffer;
    }
  } else {
    // Event passes keep disk-based strip art (event-specific)
    stripBuffer = readAssetBuffer(stripPath);
    strip2xBuffer = readAssetBuffer(strip2xPath) || stripBuffer;
    strip3xBuffer = readAssetBuffer(strip3xPath) || strip2xBuffer || stripBuffer;
  }

  console.log(
    "[Apple Wallet] Assets found — icon:", !!iconBuffer,
    "icon@2x:", !!icon2xBuffer,
    "icon@3x:", !!icon3xBuffer,
    "logo:", !!logoBuffer,
    "logo@2x:", !!logo2xBuffer,
    "logo@3x:", !!logo3xBuffer,
    "thumbnail:", !!thumbBuffer,
    "thumbnail@2x:", !!thumb2xBuffer,
    "strip:", !!stripBuffer,
    "stripState:", `${stripStampState.remaining}/${stripStampState.total}`,
    "stripAsset:", dynamicStripName,
  );

  // Build file map for the pass
  const files = {};
  const passJsonBuffer = Buffer.from(JSON.stringify(passJson));
  files["pass.json"] = passJsonBuffer;
  if (iconBuffer) {
    files["icon.png"] = iconBuffer;
    files["icon@2x.png"] = icon2xBuffer || iconBuffer;
    files["icon@3x.png"] = icon3xBuffer || icon2xBuffer || iconBuffer;
  }
  // El logo va GRANDE y centrado en la banda; en membresías omitimos el logo de
  // la esquina (su cuadro claro rompía la estética). Eventos sí lo conservan.
  if (logoBuffer && hasEventPass) {
    files["logo.png"] = logoBuffer;
    files["logo@2x.png"] = logo2xBuffer || logoBuffer;
    files["logo@3x.png"] = logo3xBuffer || logo2xBuffer || logoBuffer;
  }
  if (thumbBuffer) {
    files["thumbnail.png"] = thumbBuffer;
    files["thumbnail@2x.png"] = thumb2xBuffer || thumbBuffer;
  }
  if (stripBuffer) files["strip.png"] = stripBuffer;
  if (strip2xBuffer) files["strip@2x.png"] = strip2xBuffer;
  if (strip3xBuffer) files["strip@3x.png"] = strip3xBuffer;

  // Build manifest.json (SHA1 hashes of each file)
  const manifest = {};
  for (const [name, buf] of Object.entries(files)) {
    manifest[name] = crypto.createHash("sha1").update(buf).digest("hex");
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  files["manifest.json"] = manifestBuffer;

  // Sign manifest with Apple certificates to create PKCS#7 signature
  // Use pre-loaded PEM variables (from files or base64 env vars)
  const signerCertPem = APPLE_SIGNER_CERT_PEM;
  const signerKeyPem = APPLE_SIGNER_KEY_PEM;
  const wwdrPem = APPLE_WWDR_CERT_PEM;

  console.log("[Apple Wallet] PEM sizes — cert:", signerCertPem.length, "key:", signerKeyPem.length, "wwdr:", wwdrPem.length);

  // Use openssl to create detached PKCS#7 signature
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pkpass-"));
  const manifestPath = path.join(tmpDir, "manifest.json");
  const certPath = path.join(tmpDir, "signer.pem");
  const keyPath = path.join(tmpDir, "signer.key");
  const wwdrPath = path.join(tmpDir, "wwdr.pem");
  const sigPath = path.join(tmpDir, "signature");

  fs.writeFileSync(manifestPath, manifestBuffer);
  fs.writeFileSync(certPath, signerCertPem);
  fs.writeFileSync(keyPath, signerKeyPem);
  fs.writeFileSync(wwdrPath, wwdrPem);

  const opensslCmd = `openssl smime -binary -sign -certfile "${wwdrPath}" -signer "${certPath}" -inkey "${keyPath}" -in "${manifestPath}" -out "${sigPath}" -outform DER${APPLE_CERT_PASSWORD ? ` -passin pass:${APPLE_CERT_PASSWORD}` : ""}`;
  console.log("[Apple Wallet] Signing manifest with openssl...");
  try {
    execSync(opensslCmd, { stdio: "pipe" });
    console.log("[Apple Wallet] ✅ Signature created successfully");
  } catch (opensslErr) {
    const errMsg = opensslErr.stderr?.toString() || opensslErr.message;
    console.error("[Apple Wallet] ❌ OpenSSL signing failed:", errMsg);
    // Clean up temp files
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw new Error(`OpenSSL signing failed: ${errMsg}`);
  }

  const signatureBuffer = fs.readFileSync(sigPath);
  files["signature"] = signatureBuffer;

  // Clean up temp files
  fs.rmSync(tmpDir, { recursive: true, force: true });

  // Create ZIP (.pkpass)
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { store: true }); // no compression for .pkpass
    const chunks = [];
    archive.on("data", (chunk) => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);

    for (const [name, buf] of Object.entries(files)) {
      archive.append(buf, { name });
    }
    archive.finalize();
  });
}

// ── Apple Wallet endpoints ─────────────────────────────────────────────────

// GET /api/wallet/apple/pkpass — generate and download .pkpass (or web pass fallback)
app.get("/api/wallet/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const snapshot = await getWalletSnapshotForUser(req.userId);
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, membership, nextBooking } = snapshot;
    const progressSummary = getWalletProgressSummary(membership);

    // If Apple Developer certs are configured, generate real .pkpass
    if (isAppleWalletConfigured()) {
      console.log("[Apple Wallet] ✅ Certs detected — generating real .pkpass for user:", req.userId);
      try {
        const pkpassBuffer = await generateApplePkpass({
          userId: req.userId,
          userName,
          points,
          qrCode,
          membership,
          nextBooking,
          activeEventPass: null,
        });
        console.log("[Apple Wallet] ✅ .pkpass generated, size:", pkpassBuffer.length, "bytes");
        res.setHeader("Content-Type", "application/vnd.apple.pkpass");
        res.setHeader("Content-Disposition", `attachment; filename="hive-pass.pkpass"`);
        res.setHeader("Content-Length", pkpassBuffer.length);
        return res.send(pkpassBuffer);
      } catch (pkpassErr) {
        console.error("[Apple Wallet] ❌ .pkpass generation failed:", {
          message: pkpassErr?.message,
          name: pkpassErr?.name,
          code: pkpassErr?.code,
          stack: String(pkpassErr?.stack || "").split("\n").slice(0, 8).join("\n"),
          assetDir: typeof findAssetDir === "function" ? findAssetDir() : null,
          userId: req.userId,
          hasMembership: Boolean(membership),
        });
        return res.status(500).json({
          message: "Error generando pase .pkpass",
          error: pkpassErr?.message ?? String(pkpassErr),
          fallback: "webpass",
        });
      }
    }

    // No certs configured — return web pass HTML
    console.log("[Apple Wallet] ⚠️ Certs not configured — using web pass fallback.",
      "TEAM:", APPLE_TEAM_ID ? "✅" : "❌",
      "PASS_TYPE:", APPLE_PASS_TYPE_ID ? "✅" : "❌",
      "CERT:", APPLE_SIGNER_CERT_PEM ? "✅" : "❌",
      "KEY:", APPLE_SIGNER_KEY_PEM ? "✅" : "❌",
      "WWDR:", APPLE_WWDR_CERT_PEM ? "✅" : "❌"
    );

    // Fallback: generate a beautiful standalone HTML pass page
    const nextBookingHtml = nextBooking
      ? `<div class="field"><span class="label">Próxima clase</span><span class="value">${nextBooking.class_name || ""}</span></div>
         <div class="field"><span class="label">Fecha</span><span class="value">${nextBooking.date ? new Date(nextBooking.date).toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : ""} ${nextBooking.start_time || ""}</span></div>`
      : "";
    const membershipHtml = membership
      ? `<div class="field wide"><span class="label">Plan</span><span class="value">${membership.plan_name}</span></div>
         <div class="field"><span class="label">Disponibles</span><span class="value">${progressSummary.isUnlimited ? "Ilimitado" : progressSummary.remainingLabel}</span></div>
         <div class="field"><span class="label">Vigencia</span><span class="value">${membership.end_date ? new Date(membership.end_date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "—"}</span></div>`
      : `<div class="field wide"><span class="label">Plan</span><span class="value">Sin membresía activa</span></div>`;

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="${PASS_DEFAULT_TEXTS.webPassTitle}">
<title>${PASS_DEFAULT_TEXTS.webPassTitle} — ${userName}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#241B1A;color:#FAF9F6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:380px;border-radius:28px;overflow:hidden;background:#241B1A;box-shadow:0 20px 60px rgba(0,0,0,.45),0 0 0 1px rgba(250,249,246,.1)}
.header{padding:24px 24px 16px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:18px;font-weight:850;color:#FAF9F6}
.badge{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:#6E5A46;background:rgba(110,90,70,.15);border:1px solid rgba(110,90,70,.35);padding:4px 10px;border-radius:20px}
.sphere{margin:10px auto 20px;width:168px;height:168px;border-radius:999px;display:grid;place-items:center;background:conic-gradient(#6E5A46 ${progressSummary.completionPercent}%, #3a2820 0);position:relative}
.sphere:before{content:"";position:absolute;inset:15px;border-radius:999px;background:#241B1A;border:7px solid #3a2820}
.sphere:after{content:"";position:absolute;inset:-7px;border-radius:999px;border:4px solid #F58A24;clip-path:polygon(50% 0,100% 0,100% 45%,50% 45%)}
.sphere-content{position:relative;text-align:center}
.points-label{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#6E5A46;margin-bottom:5px;font-weight:800}
.points{font-size:42px;font-weight:950;color:#FAF9F6;line-height:1}
.points-sub{font-size:12px;color:#a49588;margin-top:4px}
.qr-section{display:flex;justify-content:center;padding:0 24px 24px}
.qr-wrap{background:#FAF9F6;border-radius:20px;padding:16px;box-shadow:0 8px 32px rgba(0,0,0,.4)}
.qr-wrap img{width:160px;height:160px;display:block}
.qr-hint{text-align:center;font-size:11px;color:#a49588;padding:0 24px 20px;line-height:1.5}
.fields{padding:0 24px 24px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.field{display:flex;flex-direction:column;gap:4px;padding:12px 14px;background:#2e221f;border-radius:14px;border:1px solid rgba(110,90,70,.2)}
.field.wide{grid-column:1/-1}
.label{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6E5A46;font-weight:800}
.value{font-size:14px;font-weight:700;color:#FAF9F6}
.footer{text-align:center;padding:0 24px 24px;display:flex;gap:8px;justify-content:center}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:12px 20px;border-radius:14px;border:none;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.btn-primary{background:#F58A24;color:#241B1A;flex:1}
.btn-primary:hover{opacity:.9}
.btn-outline{background:#2e221f;color:#FAF9F6;border:1px solid rgba(110,90,70,.25);flex:1}
.btn-outline:hover{background:#3a2820}
.name{text-align:center;font-size:16px;font-weight:700;padding:0 24px 4px;color:#FAF9F6}
</style>
</head>
<body>
<div class="pass">
  <div class="header">
    <div class="logo">${PASS_DEFAULT_TEXTS.webPassLogo}</div>
    <div class="badge">Club</div>
  </div>
  <div class="name">${userName}</div>
  <div class="sphere">
    <div class="sphere-content">
      <div class="points-label">Clases</div>
      <div class="points">${membership ? (progressSummary.isUnlimited ? "∞" : String(progressSummary.classesRemaining ?? 0)) : "—"}</div>
      <div class="points-sub">${membership ? (progressSummary.isUnlimited ? "ilimitado" : "restantes") : "sin paquete"}</div>
    </div>
  </div>
  <div class="qr-section">
    <div class="qr-wrap">
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrCode)}&bgcolor=FFFFFF&color=322028" alt="QR Code" />
    </div>
  </div>
  <div class="qr-hint">Presenta este QR al llegar. Tu pase se actualiza con cada visita.</div>
  <div class="fields">
    ${membershipHtml}
    ${nextBookingHtml}
  </div>
  <div class="footer">
    <button class="btn btn-primary" onclick="window.print()">Imprimir</button>
    <button class="btn btn-outline" onclick="alert('En Safari: Compartir, Agregar a pantalla de inicio')">Guardar</button>
  </div>
</div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de Apple Wallet" });
  }
});

// GET /api/wallet/events/apple/pkpass — generate and download event-specific .pkpass
app.get("/api/wallet/events/apple/pkpass", authMiddleware, async (req, res) => {
  try {
    const eventIdRaw = String(req.query?.eventId || "").trim();
    const eventId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventIdRaw)
      ? eventIdRaw
      : null;
    if (!eventId) return res.status(400).json({ message: "eventId inválido" });

    const snapshot = await getWalletSnapshotForUser(req.userId, { eventId });
    if (!snapshot) return res.status(404).json({ message: "Usuario no encontrado" });
    const { userName, points, qrCode, activeEventPass } = snapshot;
    if (!activeEventPass) return res.status(404).json({ message: "No existe pase activo para ese evento" });
    const eventDateObj = activeEventPass?.eventDate ? new Date(activeEventPass.eventDate) : null;
    const hasValidEventDate = !!eventDateObj && !Number.isNaN(eventDateObj.getTime());
    const eventDateLong = hasValidEventDate
      ? eventDateObj.toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
      : "Fecha por confirmar";
    const eventStartTimeLabel = activeEventPass?.eventStartTime ? String(activeEventPass.eventStartTime).slice(0, 5) : "";
    const eventEndTimeLabel = activeEventPass?.eventEndTime ? String(activeEventPass.eventEndTime).slice(0, 5) : "";
    const eventTimeLong = eventStartTimeLabel && eventEndTimeLabel
      ? `${eventStartTimeLabel} - ${eventEndTimeLabel}`
      : (eventStartTimeLabel || "Horario por confirmar");
    const eventLocationLong = truncateWalletField(activeEventPass?.eventLocation || PASS_DEFAULT_TEXTS.eventLocationDefault, 38);

    if (isAppleWalletConfigured()) {
      const pkpassBuffer = await generateApplePkpass({
        userId: req.userId,
        userName,
        points,
        qrCode,
        membership: null,
        nextBooking: null,
        activeEventPass,
      });
      res.setHeader("Content-Type", "application/vnd.apple.pkpass");
      res.setHeader("Content-Disposition", `attachment; filename="hive-event-pass.pkpass"`);
      res.setHeader("Content-Length", pkpassBuffer.length);
      return res.send(pkpassBuffer);
    }

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${PASS_DEFAULT_TEXTS.webEventPassTitle}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#241B1A;color:#FAF9F6;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.pass{width:100%;max-width:390px;border-radius:24px;overflow:hidden;background:#241B1A;box-shadow:0 22px 60px rgba(0,0,0,.45),0 0 0 1px rgba(250,249,246,.1)}
.header{padding:20px 22px 10px}
.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;background:rgba(245,138,36,.13);color:#F58A24;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.title{margin-top:10px;font-weight:800;font-size:22px;line-height:1.1;color:#FAF9F6}
.meta{padding:0 22px 6px;display:grid;grid-template-columns:1fr 1fr;gap:10px}
.meta-item{border:1px solid rgba(110,90,70,.2);border-radius:12px;padding:10px 11px;background:#2e221f}
.meta-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:#F58A24;font-weight:700}
.meta-value{font-size:13px;line-height:1.3;color:#FAF9F6;margin-top:4px}
.qr{display:flex;justify-content:center;padding:16px 20px 10px}
.qr img{background:#FAF9F6;border-radius:18px;padding:12px}
.code{padding:0 22px 22px;text-align:center;font-size:13px;color:#FAF9F6}
.code strong{color:#F58A24;letter-spacing:.04em}
</style>
</head>
<body>
  <div class="pass">
    <div class="header">
      <span class="badge">Pase de evento</span>
      <div class="title">${activeEventPass.eventTitle || PASS_DEFAULT_TEXTS.eventTitleDefault}</div>
    </div>
    <div class="meta">
      <div class="meta-item">
        <div class="meta-label">Fecha</div>
        <div class="meta-value">${eventDateLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Horario</div>
        <div class="meta-value">${eventTimeLong || "Por confirmar"}</div>
      </div>
      <div class="meta-item" style="grid-column:1 / span 2;">
        <div class="meta-label">Sede</div>
        <div class="meta-value">${eventLocationLong || PASS_DEFAULT_TEXTS.eventLocationDefault}</div>
      </div>
    </div>
    <div class="qr"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(activeEventPass.passCode || qrCode)}&bgcolor=FFFFFF&color=1F0047" alt="QR"/></div>
    <div class="code">Código de acceso: <strong>${activeEventPass.passCode || "—"}</strong></div>
  </div>
</body>
</html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.send(html);
  } catch (err) {
    console.error("Apple Wallet event pkpass error:", err.message);
    return res.status(500).json({ message: "Error generando pase de evento Apple Wallet" });
  }
});

// GET /api/wallet/apple/status — check Apple Wallet config (admin only)
app.get("/api/wallet/apple/status", adminMiddleware, async (_req, res) => {
  return res.json({
    configured: true, // Always true — we have web pass fallback even without Apple certs
    nativePkpass: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    teamId: APPLE_TEAM_ID ? "✅ set" : "❌ (web pass mode)",
    passTypeId: APPLE_PASS_TYPE_ID || "N/A (web pass mode)",
    keyId: APPLE_KEY_ID ? "✅ set" : "❌",
    apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars)` : "❌",
    apnsHost: APPLE_APNS_HOST,
    signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars)` : "❌ (web pass mode)",
    wwdrCert: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars)` : "❌ (web pass mode)",
    certFiles: {
      cert: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅" : "❌"}`,
      key: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅" : "❌"}`,
      wwdr: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅" : "❌"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
  });
});

// GET /api/wallet/apple/debug — detailed cert diagnostics (admin only)
app.get("/api/wallet/apple/debug", authMiddleware, async (req, res) => {
  // Check if user is admin
  try {
    const userRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    if (userRes.rows[0]?.role !== "admin") return res.status(403).json({ message: "Solo admin" });
  } catch { return res.status(403).json({ message: "Error" }); }

  const checks = {
    configured: isAppleWalletConfigured(),
    apnsConfigured: isAppleApnsConfigured(),
    envVars: {
      APPLE_TEAM_ID: APPLE_TEAM_ID ? `✅ "${APPLE_TEAM_ID}"` : "❌ not set",
      APPLE_PASS_TYPE_ID: APPLE_PASS_TYPE_ID ? `✅ "${APPLE_PASS_TYPE_ID}"` : "❌ not set",
      APPLE_KEY_ID: APPLE_KEY_ID ? `✅ "${APPLE_KEY_ID}"` : "❌ not set",
      APPLE_CERT_PASSWORD: APPLE_CERT_PASSWORD ? "✅ set" : "⬜ not set (OK if key has no password)",
    },
    certFiles: {
      certPath: `${CERT_FILE_PATHS.cert} ${safeExists(CERT_FILE_PATHS.cert) ? "✅ exists" : "❌ not found"}`,
      keyPath: `${CERT_FILE_PATHS.key} ${safeExists(CERT_FILE_PATHS.key) ? "✅ exists" : "❌ not found"}`,
      wwdrPath: `${CERT_FILE_PATHS.wwdr} ${safeExists(CERT_FILE_PATHS.wwdr) ? "✅ exists" : "❌ not found"}`,
    },
    certDirCandidates: WALLET_ASSET_DIR_CANDIDATES,
    loadedPems: {
      signerCert: APPLE_SIGNER_CERT_PEM ? `✅ loaded (${APPLE_SIGNER_CERT_PEM.length} chars), starts: ${APPLE_SIGNER_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      signerKey: APPLE_SIGNER_KEY_PEM ? `✅ loaded (${APPLE_SIGNER_KEY_PEM.length} chars), starts: ${APPLE_SIGNER_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
      wwdr: APPLE_WWDR_CERT_PEM ? `✅ loaded (${APPLE_WWDR_CERT_PEM.length} chars), starts: ${APPLE_WWDR_CERT_PEM.substring(0, 40)}...` : "❌ not loaded",
      apnsKey: APPLE_APNS_KEY_PEM ? `✅ loaded (${APPLE_APNS_KEY_PEM.length} chars), starts: ${APPLE_APNS_KEY_PEM.substring(0, 40)}...` : "❌ not loaded",
    },
    base64EnvFallback: {
      APPLE_SIGNER_CERT_BASE64: process.env.APPLE_SIGNER_CERT_BASE64 ? `✅ (${process.env.APPLE_SIGNER_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_SIGNER_KEY_BASE64: process.env.APPLE_SIGNER_KEY_BASE64 ? `✅ (${process.env.APPLE_SIGNER_KEY_BASE64.length} chars)` : "⬜ not set",
      APPLE_WWDR_CERT_BASE64: process.env.APPLE_WWDR_CERT_BASE64 ? `✅ (${process.env.APPLE_WWDR_CERT_BASE64.length} chars)` : "⬜ not set",
      APPLE_APNS_KEY_BASE64: process.env.APPLE_APNS_KEY_BASE64 ? `✅ (${process.env.APPLE_APNS_KEY_BASE64.length} chars)` : "⬜ not set",
    },
    assetDir: findAssetDir(),
    assetsFound: {
      "wallet-logo.png": fs.existsSync(path.join(findAssetDir(), "wallet-logo.png")),
      "wallet-logo@2x.png": fs.existsSync(path.join(findAssetDir(), "wallet-logo@2x.png")),
    },
    opensslVersion: "unknown",
    keyValidation: "not tested",
    apnsKeyValidation: "not tested",
  };

  // Check openssl
  try {
    checks.opensslVersion = execSync("openssl version", { encoding: "utf8" }).trim();
  } catch (e) {
    checks.opensslVersion = "❌ openssl not found: " + e.message;
  }

  // Validate private key
  if (APPLE_SIGNER_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_SIGNER_KEY_PEM);
      checks.keyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.keyValidation = "❌ " + keyErr.message;
    }
  }

  if (APPLE_APNS_KEY_PEM) {
    try {
      crypto.createPrivateKey(APPLE_APNS_KEY_PEM);
      checks.apnsKeyValidation = "✅ key is valid";
    } catch (keyErr) {
      checks.apnsKeyValidation = "❌ " + keyErr.message;
    }
  }

  return res.json(checks);
});

// Apple Wallet Web Service endpoints (protocol V1)

// POST /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.post("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const pushToken = req.body?.pushToken || "";
  try {
    await pool.query(`
      INSERT INTO apple_wallet_devices (device_id, push_token, pass_type_id, serial_number)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (device_id, pass_type_id, serial_number) DO UPDATE SET push_token = $2, updated_at = NOW()
    `, [deviceId, pushToken, effectivePassTypeId, serial]);
    return res.status(201).send();
  } catch (err) {
    console.error("Apple register device error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/devices/:deviceId/registrations/:passTypeId
app.get("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const rawSince = String(req.query?.passesUpdatedSince || "").trim();
  const sinceDate = rawSince ? new Date(rawSince) : null;
  const hasValidSince = !!(sinceDate && !Number.isNaN(sinceDate.getTime()));
  try {
    const params = [deviceId, effectivePassTypeId];
    let query = `
      SELECT serial_number, updated_at
      FROM apple_wallet_devices
      WHERE device_id = $1 AND pass_type_id = $2
    `;
    if (hasValidSince) {
      params.push(sinceDate.toISOString());
      query += ` AND updated_at > $${params.length}`;
    }
    query += " ORDER BY updated_at DESC";
    const r = await pool.query(query, params);
    if (r.rows.length === 0) return res.status(204).send();
    const latestUpdatedAt = r.rows.reduce((latest, row) => {
      const current = row.updated_at ? new Date(row.updated_at) : null;
      if (!current || Number.isNaN(current.getTime())) return latest;
      if (!latest) return current;
      return current > latest ? current : latest;
    }, null);
    return res.json({
      serialNumbers: r.rows.map((d) => d.serial_number),
      lastUpdated: latestUpdatedAt?.toISOString() || new Date().toISOString(),
    });
  } catch (err) {
    console.error("Apple list passes error:", err);
    return res.status(500).send();
  }
});

// GET /api/wallet/v1/passes/:passTypeId/:serial — download updated pass
app.get("/api/wallet/v1/passes/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  if (!isAppleWalletConfigured()) {
    return res.status(501).json({ message: "Apple Wallet signing not configured" });
  }
  const { serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  const userId = parseUserIdFromAppleWalletSerial(serial);
  if (!userId) return res.status(404).send();
  try {
    const snapshot = await getWalletSnapshotForUser(userId);
    if (!snapshot) return res.status(404).send();
    const { userName, points, qrCode, membership, nextBooking } = snapshot;
    const pkpassBuffer = await generateApplePkpass({
      userId,
      userName,
      points,
      qrCode,
      membership,
      nextBooking,
      activeEventPass: null,
    });
    const touchRes = await pool.query(
      "SELECT MAX(updated_at) AS updated_at FROM apple_wallet_devices WHERE pass_type_id = $1 AND serial_number = $2",
      [effectivePassTypeId, serial],
    ).catch(() => ({ rows: [] }));
    const lastUpdated = touchRes.rows[0]?.updated_at ? new Date(touchRes.rows[0].updated_at) : new Date();
    res.setHeader("Content-Type", "application/vnd.apple.pkpass");
    res.setHeader("Last-Modified", lastUpdated.toUTCString());
    return res.send(pkpassBuffer);
  } catch (err) {
    console.error("Apple V1 pass download error:", err.message);
    return res.status(500).send();
  }
});

// DELETE /api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial
app.delete("/api/wallet/v1/devices/:deviceId/registrations/:passTypeId/:serial", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("ApplePass ") || authHeader.replace("ApplePass ", "") !== APPLE_AUTH_TOKEN) {
    return res.status(401).send("Unauthorized");
  }
  const { deviceId, serial, passTypeId } = req.params;
  const effectivePassTypeId = passTypeId || APPLE_PASS_TYPE_ID;
  try {
    await pool.query(
      "DELETE FROM apple_wallet_devices WHERE device_id = $1 AND pass_type_id = $2 AND serial_number = $3",
      [deviceId, effectivePassTypeId, serial]
    );
    return res.status(200).send();
  } catch (err) {
    console.error("Apple unregister device error:", err);
    return res.status(500).send();
  }
});

// POST /api/wallet/v1/log — Apple Wallet error log
app.post("/api/wallet/v1/log", (req, res) => {
  console.log("Apple Wallet log:", JSON.stringify(req.body));
  return res.status(200).send();
});

// GET /api/admin/wallet/notifications — latest wallet push/sync logs
app.get("/api/admin/wallet/notifications", adminMiddleware, async (req, res) => {
  try {
    const parsedLimit = Number(req.query.limit ?? 30);
    const limit = Math.min(120, Math.max(1, Number.isFinite(parsedLimit) ? parsedLimit : 30));
    const r = await pool.query(
      `SELECT l.*,
              u.display_name,
              u.email
         FROM wallet_notification_logs l
         LEFT JOIN users u ON u.id = l.user_id
        ORDER BY l.created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("[Admin wallet notifications] error:", err.message);
    return res.status(500).json({ message: "Error obteniendo historial de notificaciones de Wallet" });
  }
});

// POST /api/admin/wallet/notify/:userId — force pass update notifications
app.post("/api/admin/wallet/notify/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = "manual_admin_notify" } = req.body || {};
    const result = await notifyWalletPassesUpdatedForUser(userId, { reason });
    return res.json({ data: result });
  } catch (err) {
    console.error("[Admin wallet notify] error:", err.message);
    return res.status(500).json({ message: "Error notificando wallet", detail: err.message });
  }
});

// GET /api/admin/users/:userId/waiver — responsiva firmada por la alumna (admin).
app.get("/api/admin/users/:userId/waiver", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM waivers WHERE user_id = $1 LIMIT 1", [req.params.userId]);
    return res.json({ data: r.rows[0] ?? null });
  } catch (err) {
    console.error("GET /admin/users/:userId/waiver error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/users/:userId/waiver/pdf — responsiva firmada como PDF, con el texto de SU versión (bloque 3, punto 7)
app.get("/api/admin/users/:userId/waiver/pdf", adminMiddleware, async (req, res) => {
  try {
    const wr = await pool.query(
      "SELECT w.*, u.display_name FROM waivers w JOIN users u ON u.id = w.user_id WHERE w.user_id = $1 LIMIT 1",
      [req.params.userId]
    );
    const w = wr.rows[0];
    if (!w) return res.status(404).json({ message: "Sin responsiva firmada" });
    const documento = responsivaDocument(w.waiver_version);

    const { default: PDFDocument } = await import("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const INK = "#241B1A", STONE = "#8A7968", BODY = "#43392F";
    const signedAt = w.signed_at ? new Date(w.signed_at) : null;
    const fmtDate = signedAt ? signedAt.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" }) : "—";
    const safeName = String(w.full_name || w.display_name || "alumna").replace(/[^a-zA-Z0-9]+/g, "_");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="responsiva_${safeName}.pdf"`);
    doc.pipe(res);

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text(documento.studio);
    doc.fillColor(STONE).font("Helvetica").fontSize(11).text(documento.title);
    doc.moveDown(0.4);
    doc.strokeColor("#E0D5C6").lineWidth(1).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.8);

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Datos del firmante");
    doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor(BODY);
    doc.text(`Nombre: ${w.full_name || w.display_name || "—"}`);
    doc.text(`Teléfono: ${w.phone || "—"}`);
    doc.text(`Correo: ${w.email || "—"}`);
    doc.text(`Uso de imagen (Sección 4): ${w.image_consent ? "Sí autorizo" : "No autorizo"}`);
    doc.text(`Firmado: ${fmtDate}`);
    doc.text(`Versión del documento: ${w.waiver_version || "v1"}`);
    doc.moveDown(0.8);

    doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text("Términos aceptados");
    doc.moveDown(0.3);
    for (const s of documento.sections) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(`${s.n}. ${s.title}`);
      doc.font("Helvetica").fontSize(9).fillColor(BODY).text(s.body, { align: "justify" });
      doc.moveDown(0.5);
    }

    doc.moveDown(0.4).font("Helvetica-Bold").fontSize(10).fillColor(INK).text("Firma");
    doc.moveDown(0.3);
    if (typeof w.signature_data === "string" && w.signature_data.startsWith("data:image")) {
      try {
        const buf = Buffer.from(w.signature_data.split(",")[1], "base64");
        doc.image(buf, { fit: [220, 90] });
      } catch (_) {
        doc.font("Helvetica").fontSize(9).fillColor(STONE).text("(firma no disponible)");
      }
    }
    doc.moveDown(0.4).font("Helvetica").fontSize(8).fillColor(STONE).text(`${w.full_name || ""} · ${fmtDate}`);

    doc.end();
  } catch (err) {
    console.error("waiver pdf error:", err?.message);
    if (!res.headersSent) res.status(500).json({ message: "Error al generar PDF" });
  }
});

// ─── Routes: /api/users ─────────────────────────────────────────────────────

// PUT /api/users/:id — la clienta edita su perfil o la dueña edita a cualquiera.
// Si una clienta escribe datos de salud nuevos sin consentimiento expreso
// vigente, pide la casilla (400 HEALTH_CONSENT_REQUIRED) y no guarda nada. Editar
// otros datos nunca lo pide, y el personal no queda bloqueado ni al editar su
// propio perfil: el consentimiento lo da la titular de los datos, y el personal
// no captura salud propia por aquí (auditoría 2026-09-27, P1-10).
app.put("/api/users/:id", authMiddleware, async (req, res) => {
  try {
    const selfRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = selfRes.rows[0]?.role || "client";
    const isAdminCaller = ["admin", "super_admin"].includes(callerRole);
    if (req.params.id !== req.userId && !isAdminCaller) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    const {
      displayName, phone, dateOfBirth, gender,
      emergencyContactName, emergencyContactPhone, healthNotes,
      receiveReminders, receivePromotions, receiveWeeklySummary,
      acceptsCommunications,
      role, healthConsent,
    } = req.body;
    // Un tipo raro en un dato de salud (número, arreglo, objeto…) haría fallar
    // la escritura en la base con un 500; se rechaza aquí con 400, antes de
    // tocar nada.
    if (healthNotes !== undefined && healthNotes !== null && typeof healthNotes !== "string") {
      return res.status(400).json({ message: "Las notas de salud deben ser texto." });
    }
    // Non-admins cannot change role
    const newRole = isAdminCaller && role ? role : null;
    const targetId = req.params.id;
    const cur = await pool.query(
      "SELECT health_notes, has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1",
      [targetId],
    );
    if (!cur.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const selfEdit = targetId === req.userId;
    // La casilla sólo se exige si la clienta edita su propio perfil: es ella
    // quien consiente sobre sus datos. El personal no queda bloqueado, ni
    // siquiera al editar el suyo.
    const consentApplies = selfEdit && callerRole === "client";
    const hasConsent = hasCurrentHealthConsent(cur.rows[0]);
    const consentGiven = healthConsent === true;
    if (consentApplies) {
      const problem = healthConsentProblem({ changes: healthDataChanges(cur.rows[0], { healthNotes }), consentGiven, hasConsent });
      if (problem) return res.status(400).json(problem);
    }
    const recordConsent = consentApplies && consentGiven && !hasConsent;
    const r = await pool.query(
      `UPDATE users SET
         display_name              = COALESCE($1, display_name),
         phone                     = COALESCE($2, phone),
         date_of_birth             = COALESCE($3, date_of_birth),
         emergency_contact_name    = COALESCE($4, emergency_contact_name),
         emergency_contact_phone   = COALESCE($5, emergency_contact_phone),
         health_notes              = COALESCE($6, health_notes),
         receive_reminders         = COALESCE($7, receive_reminders),
         receive_promotions        = COALESCE($8, receive_promotions),
         receive_weekly_summary    = COALESCE($9, receive_weekly_summary),
         accepts_communications    = COALESCE($10, accepts_communications),
         role                      = COALESCE($11, role),
         gender                    = COALESCE($12, gender),
         health_consent_version    = CASE WHEN $14 THEN $15 ELSE health_consent_version END,
         health_consent_at         = CASE WHEN $14 THEN NOW() ELSE health_consent_at END,
         updated_at                = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        displayName || null, phone || null, dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null,
        receiveReminders ?? null, receivePromotions ?? null, receiveWeeklySummary ?? null,
        acceptsCommunications ?? null,
        newRole,
        gender || null,
        targetId,
        recordConsent, PRIVACY_NOTICE_VERSION,
      ]
    );
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("PUT users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/me/health-consent — la clienta retira su consentimiento para datos
// de salud: se borran sus notas de salud y sus lesiones registradas
// (auditoría 2026-09-27, P1-10).
app.delete("/api/me/health-consent", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE users SET health_notes = NULL, has_injury = NULL, injury_details = NULL,
              health_consent_version = NULL, health_consent_at = NULL, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [req.userId],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(r.rows[0]), message: "Retiraste tu consentimiento: borramos tus datos de salud de tu perfil." });
  } catch (err) {
    console.error("[DELETE /me/health-consent]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/referrals ─────────────────────────────────────────────────

// GET /api/referrals/code
app.get("/api/referrals/code", authMiddleware, async (req, res) => {
  try {
    let r = await pool.query(
      "SELECT * FROM referral_codes WHERE user_id = $1 LIMIT 1",
      [req.userId]
    );
    if (r.rows.length === 0) {
      const code = "OPH" + Math.random().toString(36).slice(2, 8).toUpperCase();
      r = await pool.query(
        "INSERT INTO referral_codes (user_id, code) VALUES ($1, $2) RETURNING *",
        [req.userId, code]
      );
    }
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("Referrals/code error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/class-types ─────────────────────────────────────────

// GET /api/admin/class-types
app.get("/api/admin/class-types", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types ORDER BY sort_order, name");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/class-types
app.post("/api/admin/class-types", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name.trim(), subtitle || null, description || null,
      category || "studio", intensity || "media",
      level || "all", duration_min || 50, capacity || 5,
      color || "#c026d3", emoji || "🏃", sort_order ?? 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/class-types/:id
app.put("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE class_types SET
         name         = COALESCE($1, name),
         subtitle     = COALESCE($2, subtitle),
         description  = COALESCE($3, description),
         category     = COALESCE($4, category),
         intensity    = COALESCE($5, intensity),
         level        = COALESCE($6, level),
         duration_min = COALESCE($7, duration_min),
         capacity     = COALESCE($8, capacity),
         color        = COALESCE($9, color),
         emoji        = COALESCE($10, emoji),
         is_active    = COALESCE($11, is_active),
         sort_order   = COALESCE($12, sort_order),
         updated_at   = NOW()
       WHERE id = $13 RETURNING *`,
      [name || null, subtitle || null, description || null,
      category || null, intensity || null, level || null,
      duration_min || null, capacity || null, color || null,
      emoji || null, is_active ?? null, sort_order ?? null,
      req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/class-types/:id
app.delete("/api/admin/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/class-types error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin/schedule-slots ──────────────────────────────────────

// GET /api/admin/schedule-slots
app.get("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ss.*, ct.color as class_color, ct.emoji as class_emoji
       FROM schedule_slots ss
       LEFT JOIN class_types ct ON ss.class_type_id = ct.id
       WHERE ss.is_active = true
       ORDER BY ss.time_slot, ss.day_of_week`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule-slots
app.post("/api/admin/schedule-slots", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name } = req.body;
  if (!time_slot?.trim() || !day_of_week) return res.status(400).json({ message: "time_slot y day_of_week requeridos" });
  try {
    // Resolve name from class_type_id if provided
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT ON CONSTRAINT idx_schedule_slots_slot DO UPDATE
         SET class_type_id = EXCLUDED.class_type_id,
             class_type_name = EXCLUDED.class_type_name,
             instructor_name = EXCLUDED.instructor_name
       RETURNING *`,
      [time_slot.trim(), parseInt(day_of_week), class_type_id || null, ctName, instructor_name || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule-slots/:id
app.put("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active } = req.body;
  try {
    let ctName = class_type_name || null;
    if (class_type_id && !ctName) {
      const ct = await pool.query("SELECT name FROM class_types WHERE id = $1", [class_type_id]);
      ctName = ct.rows[0]?.name || null;
    }
    const r = await pool.query(
      `UPDATE schedule_slots SET
         time_slot       = COALESCE($1, time_slot),
         day_of_week     = COALESCE($2, day_of_week),
         class_type_id   = COALESCE($3, class_type_id),
         class_type_name = COALESCE($4, class_type_name),
         instructor_name = COALESCE($5, instructor_name),
         is_active       = COALESCE($6, is_active)
       WHERE id = $7 RETURNING *`,
      [time_slot || null, day_of_week ? parseInt(day_of_week) : null,
      class_type_id || null, ctName, instructor_name || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule-slots/:id
app.delete("/api/admin/schedule-slots/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) {
    console.error("DELETE admin/schedule-slots error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// CRUD de planes consolidado en /api/plans (POST/PUT/DELETE), que es lo que usa
// el frontend. Se eliminaron los duplicados /api/admin/plans: estaban incompletos
// (no manejaban opening_price/morning_only/is_visit_pack) y eran código muerto.

// ─── Routes: /api/admin/schedule (schedule_templates) ───────────────────────

// GET /api/admin/schedule
app.get("/api/admin/schedule", adminMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM schedule_templates ORDER BY time_slot ASC, day_of_week ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/schedule
app.post("/api/admin/schedule", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift } = req.body;
  if (!time_slot || !day_of_week || !class_label) {
    return res.status(400).json({ message: "time_slot, day_of_week y class_label requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO schedule_templates (time_slot, day_of_week, class_label, shift)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (time_slot, day_of_week) DO UPDATE
         SET class_label = EXCLUDED.class_label, shift = EXCLUDED.shift, updated_at = NOW()
       RETURNING *`,
      [time_slot, Number(day_of_week), class_label.toUpperCase(), shift || "morning"]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/schedule/:id
app.put("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  const { time_slot, day_of_week, class_label, shift, is_active } = req.body;
  try {
    const r = await pool.query(
      `UPDATE schedule_templates SET
         time_slot   = COALESCE($1, time_slot),
         day_of_week = COALESCE($2, day_of_week),
         class_label = COALESCE($3, class_label),
         shift       = COALESCE($4, shift),
         is_active   = COALESCE($5, is_active),
         updated_at  = NOW()
       WHERE id = $6 RETURNING *`,
      [time_slot || null, day_of_week ? Number(day_of_week) : null,
      class_label ? class_label.toUpperCase() : null,
      shift || null, is_active ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/schedule/:id
app.delete("/api/admin/schedule/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_templates WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/schedule error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/packages ──────────────────────────────────────────────────

// GET /api/packages  (público — landing + checkout)
app.get("/api/packages", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT * FROM packages WHERE is_active = true ORDER BY category ASC, sort_order ASC"
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("GET packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/packages
app.post("/api/admin/packages", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, sort_order } = req.body;
  if (!name?.trim() || !num_classes || price === undefined || !category) {
    return res.status(400).json({ message: "name, num_classes, price y category requeridos" });
  }
  try {
    const r = await pool.query(
      `INSERT INTO packages (name, num_classes, price, category, validity_days, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name.trim(), num_classes, Number(price), category, validity_days || 30, sort_order || 0]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/packages/:id
app.put("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  const { name, num_classes, price, category, validity_days, is_active, sort_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE packages SET
         name          = COALESCE($1, name),
         num_classes   = COALESCE($2, num_classes),
         price         = COALESCE($3, price),
         category      = COALESCE($4, category),
         validity_days = COALESCE($5, validity_days),
         is_active     = COALESCE($6, is_active),
         sort_order    = COALESCE($7, sort_order),
         updated_at    = NOW()
       WHERE id = $8 RETURNING *`,
      [name || null, num_classes || null,
      price !== undefined ? Number(price) : null,
      category || null, validity_days ?? null,
      is_active ?? null, sort_order ?? null, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("PUT admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/packages/:id
app.delete("/api/admin/packages/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM packages WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE admin/packages error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Routes: /api/admin (protected admin routes) ────────────────────────────

// GET /api/users/:id — get single user (admin)
app.get("/api/users/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM users WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ data: mapUser(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/me/photo — cliente sube su propia foto de perfil
app.post("/api/me/photo", authMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const processed = await processProfilePhoto(req.file.buffer);
    const photoUrl = await storeProfilePhoto(processed, req.userId);
    await pool.query("UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2", [photoUrl, req.userId]);
    triggerWalletPassSync(req.userId, "profile_photo_updated");
    return res.json({ data: { photoUrl } });
  } catch (err) {
    console.error("POST /me/photo error:", err?.message);
    return res.status(500).json({ message: "Error al subir la foto" });
  }
});

// POST /api/users/:id/photo — recepción/admin sube o reemplaza la foto de un cliente
app.post("/api/users/:id/photo", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const exists = await pool.query("SELECT id FROM users WHERE id = $1", [req.params.id]);
    if (!exists.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const processed = await processProfilePhoto(req.file.buffer);
    const photoUrl = await storeProfilePhoto(processed, req.params.id);
    await pool.query("UPDATE users SET photo_url = $1, updated_at = NOW() WHERE id = $2", [photoUrl, req.params.id]);
    triggerWalletPassSync(req.params.id, "profile_photo_updated");
    return res.json({ data: { photoUrl } });
  } catch (err) {
    console.error("POST /users/:id/photo error:", err?.message);
    return res.status(500).json({ message: "Error al subir la foto" });
  }
});

// GET /api/class-types — public alias for admin/class-types
app.get("/api/class-types", async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM class_types WHERE is_active = true ORDER BY sort_order ASC");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/instructors — public (no auth) active instructors for homepage
app.get("/api/public/instructors", async (_req, res) => {
  try {
    const r = await pool.query(
      "SELECT id, display_name, bio, specialties, photo_url, photo_url_2, photo_focus_x, photo_focus_y FROM instructors WHERE is_active = true ORDER BY created_at ASC"
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/public/review-tags — public (no auth) review tags for client review form
app.get("/api/public/review-tags", async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/class-types — alias CRUD (admin)
app.post("/api/class-types", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "name requerido" });
  const validCategories = ["studio", "reformer_tower"];
  const cat = validCategories.includes(category) ? category : "studio";
  try {
    const r = await pool.query(
      `INSERT INTO class_types (name, color, category, duration_min, capacity, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING *`,
      [name.trim(), color || "#c026d3", cat, defaultDuration || 60, maxCapacity || 5, isActive !== false]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/class-types/:id — alias CRUD (admin)
app.put("/api/class-types/:id", adminMiddleware, async (req, res) => {
  const { name, color, category, defaultDuration, maxCapacity, isActive } = req.body;
  const validCategories = ["studio", "reformer_tower"];
  const cat = validCategories.includes(category) ? category : null;
  try {
    const r = await pool.query(
      `UPDATE class_types SET name=COALESCE($1,name), color=COALESCE($2,color),
       category=COALESCE($3,category),
       duration_min=COALESCE($4,duration_min), capacity=COALESCE($5,capacity),
       is_active=COALESCE($6,is_active), updated_at=NOW() WHERE id=$7 RETURNING *`,
      [name || null, color || null, cat, defaultDuration || null, maxCapacity || null, isActive ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "No encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/class-types/:id — alias CRUD (admin)
app.delete("/api/class-types/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM class_types WHERE id = $1", [req.params.id]);
    return res.json({ message: "Eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/classes — admin creates a class (alias)
app.post("/api/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, maxCapacity, capacity, notes } = req.body;
    if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
    if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });

    // startTime may come as a full ISO/datetime-local string "YYYY-MM-DDTHH:mm"
    // The classes table uses separate DATE and TIME columns
    let dateStr, startTimeStr, endTimeStr;
    if (startTime && startTime.includes("T")) {
      const [d, t] = startTime.split("T");
      dateStr = d;
      startTimeStr = t.slice(0, 5); // "HH:mm"
    } else {
      return res.status(400).json({ message: "startTime debe ser datetime (YYYY-MM-DDTHH:mm)" });
    }
    if (endTime && endTime.includes("T")) {
      endTimeStr = endTime.split("T")[1].slice(0, 5);
    } else if (endTime && endTime.length === 5) {
      endTimeStr = endTime; // already "HH:mm"
    } else {
      // default +55 min
      const [h, m] = startTimeStr.split(":").map(Number);
      const total = h * 60 + m + 55;
      endTimeStr = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }
    const cap = maxCapacity ?? capacity ?? 5;
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId, dateStr, startTimeStr, endTimeStr, cap, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("POST /classes error:", err); return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/classes/:id/cancel
/**
 * Helper: aplica el rollback completo cuando se cancela un booking.
 * Maneja todos los side-effects derivados del status previo.
 *
 * Para booking que era 'checked_in':
 *   - Inserta loyalty_transactions tipo 'adjust' con puntos negativos para
 *     revertir los +10 que se otorgaron al hacer check-in. Description
 *     'Reverso por cancelación admin'.
 *   - NO revoca loyalty_milestone_awards (no se quitan logros desbloqueados,
 *     pero al bajar lifetime no se desbloquearán nuevos hasta que vuelva a
 *     subir de forma natural).
 *
 * Para booking que era 'confirmed':
 *   - Restaura crédito a memberships.classes_remaining (+1) si tiene
 *     membership_id.
 *   - Decrementa classes.current_bookings.
 *
 * Para booking que era 'waitlist': nada.
 *
 * @param client PG client en transacción abierta.
 * @param booking row con id, user_id, class_id, membership_id, status, date,
 *                checked_in_at.
 * @param opts { skipCreditRestore?: boolean } — si la política del caller
 *             decide que NO debe devolver crédito (cancelación tardía
 *             de alumna), pasa true.
 * @returns { creditRestored, pointsReverted }
 */
async function applyCancellationRollback(client, booking, opts = {}) {
  const result = { creditRestored: false, pointsReverted: 0 };
  const wasCheckedIn = booking.status === "checked_in";
  const wasConfirmed = booking.status === "confirmed";

  // Cuando se cancela TODA la clase (la clase no ocurrió), también se devuelve
  // crédito a quienes ya tenían check-in: pasaron a "asistir" a una clase que
  // ya no existe. Pasar opts.refundCheckedIn=true desde ese caller.
  const shouldRefundCredit = !opts.skipCreditRestore
    && booking.membership_id
    && (wasConfirmed || (wasCheckedIn && opts.refundCheckedIn));

  if (shouldRefundCredit) {
    // Devuelve total y, si es mixto, el bucket del área de la clase.
    await restoreMembershipCredit(client, booking.membership_id, booking.class_id);
    result.creditRestored = true;
  }
  // Tanto confirmadas como checked_in ocupaban lugar, ambos deben restarse del
  // cupo cuando se cancelan.
  if (wasConfirmed || wasCheckedIn) {
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
  }

  if (wasCheckedIn) {
    // 1) Revertir puntos de loyalty (los +10 que dio el check-in).
    try {
      const cfg = await getLoyaltyConfig(client);
      const pts = Number(cfg.points_per_class);
      if (pts > 0 && booking.user_id) {
        await client.query(
          `INSERT INTO loyalty_transactions (user_id, type, points, description)
           VALUES ($1, 'adjust', $2, $3)`,
          [booking.user_id, -pts, "Reverso por cancelación de check-in"],
        );
        result.pointsReverted = pts;
      }
    } catch (loyaltyErr) {
      console.warn("[cancel rollback] loyalty revert error:", loyaltyErr?.message);
    }
  }

  return result;
}

// ── Cancelar una clase (compartido por PUT /classes/:id/cancel y "Limpiar
// semana"). Auditoría 2026-09-27, bloque 2. ─────────────────────────────────
/**
 * Dentro de una transacción abierta: marca la clase cancelada con quién y por
 * qué, cancela sus reservas activas devolviendo crédito y puntos
 * (applyCancellationRollback) y deja la fila en la bitácora. Devuelve null si
 * la clase no existe o ya estaba cancelada. Los avisos van DESPUÉS del COMMIT
 * con notifyClassCancelled().
 */
async function cancelClassInTx(client, classId, { actorId, reason, source = "manual" }) {
  const actor = isUuid(actorId) ? actorId : null;
  const why = cleanReason(reason);
  const cls = await client.query(
    `WITH prev AS (SELECT id, status::text AS status FROM classes WHERE id = $1 FOR UPDATE)
     UPDATE classes c
        SET status = 'cancelled', updated_at = NOW(), cancelled_at = NOW(),
            cancelled_by = $2, cancellation_reason = $3
       FROM prev
      WHERE c.id = prev.id AND prev.status <> 'cancelled'
      RETURNING c.id, c.date, c.start_time, c.class_type_id, to_char(c.date, 'YYYY-MM-DD') AS day, prev.status AS prev_status`,
    [classId, actor, why],
  );
  if (!cls.rows.length) return null;
  const classRow = cls.rows[0];

  // Reservas activas ANTES de cancelarlas (incluye checked_in: la admin puede
  // cancelar una clase a posteriori).
  const bookingsRes = await client.query(
    `SELECT b.id, b.user_id, b.class_id, b.membership_id, b.status, b.checked_in_at,
            c.date AS class_date,
            u.display_name, u.phone, ct.name AS class_name
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN classes c ON c.id = b.class_id
       LEFT JOIN class_types ct ON ct.id = c.class_type_id
      WHERE b.class_id = $1 AND b.status NOT IN ('cancelled', 'no_show')`,
    [classId],
  );
  const activeBookings = bookingsRes.rows;
  let creditsRestored = 0;
  let pointsReverted = 0;
  for (const b of activeBookings) {
    await client.query(
      `UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by=$2,
              cancellation_reason = COALESCE($3, cancellation_reason)
        WHERE id=$1`,
      [b.id, actor, why],
    );
    // Al cancelar la clase completa se devuelve crédito también a quienes ya
    // tenían check-in (la clase no ocurrió).
    const rollback = await applyCancellationRollback(client, b, { refundCheckedIn: true });
    if (rollback.creditRestored) creditsRestored++;
    if (rollback.pointsReverted) pointsReverted += rollback.pointsReverted;
  }
  // Red de seguridad: recalcula el cupo desde las reservas vivas en vez de asumir 0.
  await client.query(
    `UPDATE classes c SET current_bookings = COALESCE((
       SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')
     ), 0) WHERE c.id = $1`,
    [classId],
  );
  await recordAudit(client, {
    actorId: actor, action: "class.cancel", entityType: "class", entityId: classRow.id, reason: why,
    before: { status: classRow.prev_status }, after: { status: "cancelled" },
    meta: {
      source, day: classRow.day, start_time: String(classRow.start_time).slice(0, 5),
      bookings_cancelled: activeBookings.length, credits_restored: creditsRestored, points_reverted: pointsReverted,
      booking_ids: activeBookings.map((b) => b.id),
    },
  });
  return { classRow, activeBookings, creditsRestored, pointsReverted };
}

/** Avisos de una clase cancelada, fuera de la transacción. Con el canal caído o
 *  los avisos apagados no se intenta y se devuelve la lista para avisar a mano
 *  (auditoría 2026-09-27, P0-1). */
async function notifyClassCancelled(classRow, activeBookings, reason) {
  const dateStr = classRow.date ? new Date(classRow.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
  const timeStr = classRow.start_time ? String(classRow.start_time).slice(0, 5) : "";
  const notifSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  const waOn = notifSettings?.whatsapp_reminders !== false;
  const channel = waOn ? await whatsappChannelState() : { connected: false, state: "disabled" };
  let waQueued = 0;
  const waUnreached = [];
  for (const b of activeBookings) {
    if (!b.user_id) continue;
    triggerWalletPassSync(b.user_id, "admin_class_cancelled");
    if (!channel.connected) {
      waUnreached.push({ user_id: b.user_id, display_name: b.display_name, phone: b.phone });
      continue;
    }
    const className = b.class_name || "tu clase";
    const cancelReason = reason ? ` (motivo: ${reason})` : "";
    notifyByTemplate(
      b.user_id,
      "booking_cancelled",
      { class: className, date: dateStr, time: timeStr, creditRestored: "Sí" },
      ({ firstName }) =>
        `${firstName}, tuvimos que cancelar la clase de ${className}${dateStr ? ` del ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""}.${cancelReason} Tu clase regresó a tu paquete.`,
    ).catch(() => {});
    waQueued++;
  }
  return { waQueued, waUnreached, channelState: channel.state };
}

// PUT /api/classes/:id/cancel — admin cancela clase completa. Cascada:
//   1. classes.status = 'cancelled', con quién y por qué.
//   2. Cada booking activo: status='cancelled', cancelled_at=NOW(), restaura
//      crédito al membership (siempre, al cancelar el estudio la clase).
//   3. WA a cada alumna con reason opcional.
// Body opcional: { reason: "instructora enferma" } se incluye en el WA y en la
// bitácora. La respuesta no cambia (auditoría 2026-09-27, bloque 2).
app.put("/api/classes/:id/cancel", adminMiddleware, async (req, res) => {
  const { reason } = req.body || {};
  // Mismo motivo limpio (recortado, sin espacios en los extremos) en la clase,
  // la bitácora, el WhatsApp y la respuesta — no el crudo del body.
  const why = cleanReason(reason);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const done = await cancelClassInTx(client, req.params.id, { actorId: req.userId, reason: why, source: "manual" });
    if (!done) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada o ya cancelada" });
    }
    await client.query("COMMIT");
    const wa = await notifyClassCancelled(done.classRow, done.activeBookings, why);
    return res.json({
      data: {
        class_id: done.classRow.id,
        bookings_cancelled: done.activeBookings.length,
        credits_restored: done.creditsRestored,
        points_reverted: done.pointsReverted,
        wa_queued: wa.waQueued,
        wa_failed: wa.waUnreached.length,
        wa_unreached: wa.waUnreached,
        // "disabled" = la dueña apagó los avisos; otro estado = canal caído.
        wa_channel_state: wa.channelState,
        reason: why,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /classes/:id/cancel]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// PUT /api/classes/:id/close — cierra la clase a NUEVAS reservas SIN cancelarla.
// Las reservas existentes siguen válidas, NO se reembolsa nada, NO se avisa de
// cancelación. Distinto de cancelar. Solo aplica a clases 'scheduled' (abiertas).
app.put("/api/classes/:id/close", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE classes SET status='closed', updated_at=NOW()
        WHERE id=$1 AND status='scheduled'
        RETURNING id, status`,
      [req.params.id],
    );
    if (!r.rows.length) {
      return res.status(404).json({ message: "Clase no encontrada o no está abierta" });
    }
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("[PUT /classes/:id/close]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/classes/:id/reopen — reabre una clase cerrada (vuelve a 'scheduled').
app.put("/api/classes/:id/reopen", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE classes SET status='scheduled', updated_at=NOW()
        WHERE id=$1 AND status='closed'
        RETURNING id, status`,
      [req.params.id],
    );
    if (!r.rows.length) {
      return res.status(404).json({ message: "Clase no encontrada o no está cerrada" });
    }
    // Mientras estuvo cerrada no subió nadie: al reabrir, sube la fila (P1-1).
    const promoted = await onSeatReleased([req.params.id], { source: "reopen" });
    return res.json({ data: r.rows[0], waitlist_promoted: promoted });
  } catch (err) {
    console.error("[PUT /classes/:id/reopen]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/bookings/:id — el estudio cancela una reserva (override de
// la política de 2 h). Motivo obligatorio: queda en la reserva, en la bitácora
// y, como antes, en el WhatsApp (auditoría 2026-09-27, P0-3).
app.delete("/api/admin/bookings/:id", adminMiddleware, async (req, res) => {
  // refundCredit (default true): la admin decide si devolver el crédito. En false
  // se cancela y libera el lugar pero la clase cuenta como usada (ej. una falta).
  const { reason, refundCredit } = req.body || {};
  const problem = reasonProblem(reason);
  if (problem) return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
  const why = cleanReason(reason);
  const client = await pool.connect();
  // Se suelta tras el COMMIT: la subida de la fila pide su propia conexión (P1-1).
  let released = false;
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT b.id, b.user_id, b.class_id, b.membership_id, b.status, b.checked_in_at,
              c.date, c.start_time, to_char(c.date, 'YYYY-MM-DD') AS day, ct.name AS class_name
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
         JOIN class_types ct ON ct.id = c.class_type_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [req.params.id],
    );
    if (!r.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const booking = r.rows[0];
    if (booking.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta reserva ya estaba cancelada" });
    }
    await client.query(
      `UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by=$2, cancellation_reason=$3 WHERE id=$1`,
      [req.params.id, req.userId, why],
    );
    // Rollback completo (créditos y puntos). La admin que cancela a mano espera
    // que el crédito se devuelva incluso si ya tenía check-in (suele ser un
    // check-in por error o re-clasificación de la asistencia).
    const rb = await applyCancellationRollback(client, booking, { refundCheckedIn: true, skipCreditRestore: refundCredit === false });
    await recordAudit(client, {
      actorId: req.userId, action: "booking.cancel", entityType: "booking", entityId: booking.id,
      subjectUserId: booking.user_id, reason: why,
      before: { status: booking.status }, after: { status: "cancelled" },
      meta: {
        class_id: booking.class_id, day: booking.day, class_name: booking.class_name,
        refund_credit_requested: refundCredit !== false, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted,
      },
    });
    await client.query("COMMIT");
    client.release();
    released = true;

    // WA + wallet sync (igual que antes)
    if (booking.user_id) {
      const dateStr = booking.date ? new Date(booking.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
      const timeStr = booking.start_time ? String(booking.start_time).slice(0, 5) : "";
      notifyByTemplate(
        booking.user_id,
        "booking_cancelled",
        { class: booking.class_name || "tu clase", date: dateStr, time: timeStr, creditRestored: rb.creditRestored ? "Sí" : "No" },
        ({ firstName }) =>
          `${firstName}, cancelamos tu reserva de ${booking.class_name || "la clase"}${dateStr ? ` del ${dateStr}` : ""}. (motivo: ${why})${rb.creditRestored ? " Tu clase regresó a tu paquete." : ""}`,
      ).catch(() => {});
      triggerWalletPassSync(booking.user_id, "admin_booking_cancelled");
    }
    // Si ocupaba lugar, sube la fila (P1-1). La respuesta dice a quién, para
    // que recepción avise a mano si no le llegó el WhatsApp.
    const promoted = ["confirmed", "checked_in"].includes(booking.status)
      ? await onSeatReleased([booking.class_id], { source: "studio_cancel" })
      : [];
    return res.json({ data: {
      id: booking.id, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted, reason: why,
      waitlist_promoted: promoted,
    } });
  } catch (err) {
    if (!released) await client.query("ROLLBACK").catch(() => {});
    console.error("[DELETE /admin/bookings/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    if (!released) client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
//                      VISITAS / ACOMPAÑANTES (sub-fase 1)
// ─────────────────────────────────────────────────────────────────────────────
// Una invitada (no socia) se almacena en `guest_profiles` con su cuestionario
// inicial (lesión, barre antes, etc.). Para reusar la infra de membresías y
// bookings, se crea un usuario "lite" (role='guest', sin password) vinculado
// 1:1 al guest_profile vía users.guest_profile_id. El paquete de visitas es
// una membership normal con class_limit=N (planes con is_visit_pack=true).
// ═══════════════════════════════════════════════════════════════════════════

// Normaliza un teléfono para búsqueda (solo dígitos, sin +52, etc.).
function normGuestPhone(raw) {
  return String(raw || "").replace(/\D/g, "");
}

// Encuentra (por teléfono) o crea un guest_profile. Si ya existe, actualiza
// los campos del cuestionario con los valores nuevos (no nulos) — la última
// visita refresca el intake si el admin lo capturó otra vez.
async function findOrCreateGuestProfile(opts, db = pool) {
  const {
    name, phone, email, dateOfBirth,
    hasInjury, injuryDetails, practicedBarreBefore,
    emergencyContactName, emergencyContactPhone,
    acceptedWaiver, hostUserId,
  } = opts;
  if (!name) throw new Error("name requerido");
  const phoneNorm = normGuestPhone(phone);
  let existing = null;
  if (phoneNorm) {
    const r = await db.query(
      "SELECT * FROM guest_profiles WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $1 LIMIT 1",
      [phoneNorm]
    );
    existing = r.rows[0] ?? null;
  }
  if (existing) {
    // Actualizar solo los campos provistos (no sobrescribir con null).
    const r = await db.query(
      `UPDATE guest_profiles SET
         display_name = COALESCE($2, display_name),
         email = COALESCE($3, email),
         date_of_birth = COALESCE($4, date_of_birth),
         has_injury = COALESCE($5, has_injury),
         injury_details = COALESCE($6, injury_details),
         practiced_barre_before = COALESCE($7, practiced_barre_before),
         emergency_contact_name = COALESCE($8, emergency_contact_name),
         emergency_contact_phone = COALESCE($9, emergency_contact_phone),
         accepted_waiver_at = CASE WHEN $10::boolean THEN NOW() ELSE accepted_waiver_at END,
         host_user_id = COALESCE(host_user_id, $11),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        existing.id, name, email || null, dateOfBirth || null,
        hasInjury ?? null, injuryDetails || null, practicedBarreBefore ?? null,
        emergencyContactName || null, emergencyContactPhone || null,
        acceptedWaiver === true, hostUserId || null,
      ]
    );
    return r.rows[0];
  }
  const ins = await db.query(
    `INSERT INTO guest_profiles
       (host_user_id, display_name, phone, email, date_of_birth, has_injury,
        injury_details, practiced_barre_before, emergency_contact_name,
        emergency_contact_phone, accepted_waiver_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
             CASE WHEN $11::boolean THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      hostUserId || null, name, phoneNorm || null, email || null,
      dateOfBirth || null, hasInjury ?? null, injuryDetails || null,
      practicedBarreBefore ?? null, emergencyContactName || null,
      emergencyContactPhone || null, acceptedWaiver === true,
    ]
  );
  return ins.rows[0];
}

// Para reusar memberships/bookings, cada guest_profile tiene un user "lite"
// asociado (role='guest', sin password). Si ya existe, lo devuelve.
async function findOrCreateGuestUser(guestProfile, db = pool) {
  if (!guestProfile?.id) throw new Error("guestProfile sin id");
  const found = await db.query(
    "SELECT * FROM users WHERE guest_profile_id = $1 LIMIT 1",
    [guestProfile.id]
  );
  if (found.rows.length) {
    // Sync nombre por si cambió en el perfil. NO sincronizamos phone porque
    // puede chocar con un UNIQUE index si la socia comparte el teléfono con la
    // acompañante (ej. familiares). El phone definitivo vive en guest_profiles.
    await db.query(
      "UPDATE users SET display_name = $2, updated_at = NOW() WHERE id = $1",
      [found.rows[0].id, guestProfile.display_name]
    );
    return found.rows[0];
  }
  // INSERT defensivo:
  //  - users.email es NOT NULL (schema viejo) — generamos uno sintético
  //    único por guest_profile.id; nunca se usa para login ni envío real, y la
  //    búsqueda de arriba es por guest_profile_id, no por correo
  //    (server/lib/syntheticEmail.js).
  //  - Si choca con UNIQUE (típicamente users.phone porque la socia/otra
  //    alumna ya tiene ese teléfono), reintenta sin phone — el phone vive
  //    en guest_profiles, no necesita estar en users para que la reserva
  //    funcione.
  const realEmail = guestProfile.email && String(guestProfile.email).includes("@")
    ? guestProfile.email
    : null;
  const syntheticEmail = syntheticGuestEmail(guestProfile.id);
  const emailToUse = realEmail || syntheticEmail;
  try {
    const ins = await db.query(
      `INSERT INTO users (display_name, email, phone, role, guest_profile_id, accepts_terms, password_hash)
       VALUES ($1, $2, $3, 'guest', $4, true, NULL)
       RETURNING *`,
      [guestProfile.display_name, emailToUse, guestProfile.phone || null, guestProfile.id]
    );
    return ins.rows[0];
  } catch (err) {
    if (err && err.code === "23505") {
      // unique_violation — intenta sin phone (la causa más común). Si el
      // choque fue por email real (raro: dos guests con el mismo email),
      // usamos el sintético.
      const emailFallback = err.constraint && /email/i.test(err.constraint)
        ? syntheticEmail
        : emailToUse;
      try {
        const ins2 = await db.query(
          `INSERT INTO users (display_name, email, phone, role, guest_profile_id, accepts_terms, password_hash)
           VALUES ($1, $2, NULL, 'guest', $3, true, NULL)
           RETURNING *`,
          [guestProfile.display_name, emailFallback, guestProfile.id]
        );
        return ins2.rows[0];
      } catch (err2) {
        // último recurso: sintético + sin phone (cubre cualquier UNIQUE residual)
        if (err2 && err2.code === "23505") {
          const ins3 = await db.query(
            `INSERT INTO users (display_name, email, phone, role, guest_profile_id, accepts_terms, password_hash)
             VALUES ($1, $2, NULL, 'guest', $3, true, NULL)
             RETURNING *`,
            [guestProfile.display_name, syntheticEmail, guestProfile.id]
          );
          return ins3.rows[0];
        }
        throw err2;
      }
    }
    throw err;
  }
}

// GET /api/admin/guest-profiles — lista paginada con búsqueda por nombre/tel.
// Incluye datos del host (socia que la trajo) y resumen del pack activo.
app.get("/api/admin/guest-profiles", adminMiddleware, async (req, res) => {
  try {
    const { search = "", limit = 100 } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    if (search) {
      params.push(`%${String(search).trim()}%`);
      const phoneDigits = String(search).replace(/\D/g, "");
      params.push(`%${phoneDigits}%`);
      where += ` AND (gp.display_name ILIKE $${params.length - 1} OR regexp_replace(COALESCE(gp.phone,''), '\\D', '', 'g') ILIKE $${params.length})`;
    }
    params.push(parseInt(limit));
    const r = await pool.query(
      `SELECT gp.*,
              host.display_name AS host_name,
              host.phone AS host_phone,
              (
                SELECT json_build_object(
                  'id', m.id,
                  'plan_name', p.name,
                  'classes_remaining', m.classes_remaining,
                  'end_date', m.end_date
                )
                  FROM users u
                  JOIN memberships m ON m.user_id = u.id
                  LEFT JOIN plans p ON p.id = m.plan_id
                 WHERE u.guest_profile_id = gp.id
                   AND m.status = 'active'
                   AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
                   AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
                 ORDER BY m.created_at DESC
                 LIMIT 1
              ) AS active_pack
         FROM guest_profiles gp
         LEFT JOIN users host ON host.id = gp.host_user_id
         ${where}
         ORDER BY gp.updated_at DESC
         LIMIT $${params.length}`,
      params
    );
    return res.json({ data: r.rows });
  } catch (err) {
    console.error("[GET /admin/guest-profiles]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/guest-profiles — registra una invitada de antemano (sin
// reserva ni venta). Útil para pre-cargar contactos con su cuestionario.
app.post("/api/admin/guest-profiles", adminMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ message: "Nombre requerido" });
    if (!b.phone) return res.status(400).json({ message: "Teléfono requerido" });
    const guest = await findOrCreateGuestProfile({
      name: b.name,
      phone: b.phone,
      email: b.email,
      dateOfBirth: b.dateOfBirth,
      hasInjury: b.hasInjury,
      injuryDetails: b.hasInjury ? (b.injuryDetails || null) : null,
      practicedBarreBefore: b.practicedBarreBefore,
      emergencyContactName: b.emergencyContactName,
      emergencyContactPhone: b.emergencyContactPhone,
      acceptedWaiver: b.acceptedWaiver,
      hostUserId: b.hostUserId,
    });
    // Crear/asegurar el user lite (para que pueda recibir membresías después).
    await findOrCreateGuestUser(guest);
    return res.status(201).json({ data: guest });
  } catch (err) {
    console.error("[POST /admin/guest-profiles]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/guest-profiles/:id — editar cuestionario/contacto.
app.put("/api/admin/guest-profiles/:id", adminMiddleware, async (req, res) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `UPDATE guest_profiles SET
         display_name = COALESCE($2, display_name),
         phone = COALESCE($3, phone),
         email = COALESCE($4, email),
         date_of_birth = COALESCE($5, date_of_birth),
         has_injury = COALESCE($6, has_injury),
         injury_details = COALESCE($7, injury_details),
         practiced_barre_before = COALESCE($8, practiced_barre_before),
         emergency_contact_name = COALESCE($9, emergency_contact_name),
         emergency_contact_phone = COALESCE($10, emergency_contact_phone),
         accepted_waiver_at = CASE WHEN $11::boolean THEN NOW() ELSE accepted_waiver_at END,
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.phone != null ? String(b.phone).replace(/\D/g, "") : null,
        b.email ?? null,
        b.dateOfBirth ?? null,
        b.hasInjury ?? null,
        b.injuryDetails ?? null,
        b.practicedBarreBefore ?? null,
        b.emergencyContactName ?? null,
        b.emergencyContactPhone ?? null,
        b.acceptedWaiver === true,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Invitada no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    console.error("[PUT /admin/guest-profiles/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/today-roster — todas las clases de HOY (Mexico) con su roster
// y status, para una vista de pasar lista por taps (sin cámara, sin QR).
app.get("/api/admin/today-roster", adminMiddleware, async (_req, res) => {
  try {
    const classes = await pool.query(
      `SELECT c.id, c.date, c.start_time, c.end_time, c.max_capacity,
              ct.name AS class_type_name, ct.color AS class_type_color,
              i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         JOIN instructors i ON c.instructor_id = i.id
        WHERE c.date = (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date
          AND c.status <> 'cancelled'
        ORDER BY c.start_time ASC`
    );
    if (!classes.rows.length) return res.json({ data: [] });
    const classIds = classes.rows.map((c) => c.id);
    const rosters = await pool.query(
      `SELECT b.id AS booking_id, b.class_id, b.status, b.checked_in_at,
              b.guest_profile_id,
              u.id AS user_id, u.display_name, u.phone,
              gp.display_name AS guest_name,
              host.display_name AS host_name,
              COALESCE(gp.has_injury, u.has_injury, false) AS has_injury,
              COALESCE(gp.injury_details, u.injury_details) AS injury_details,
              u.health_notes,
              -- Las reservas de invitada también traen user_id (la usuaria
              -- sombra de findOrCreateGuestUser, una por guest_profile) y
              -- bookings.user_id es NOT NULL: basta con user_id, que tiene índice.
              NOT EXISTS (
                SELECT 1 FROM bookings pb
                 WHERE pb.user_id = b.user_id AND pb.checked_in_at IS NOT NULL AND pb.id <> b.id
              ) AS first_visit
         FROM bookings b
         LEFT JOIN users u ON b.user_id = u.id
         LEFT JOIN guest_profiles gp ON b.guest_profile_id = gp.id
         LEFT JOIN users host ON host.id = gp.host_user_id
        WHERE b.class_id = ANY($1::uuid[]) AND b.status <> 'cancelled'
        ORDER BY CASE b.status
          WHEN 'confirmed'  THEN 1
          WHEN 'checked_in' THEN 2
          WHEN 'waitlist'   THEN 3
          WHEN 'no_show'    THEN 4
          ELSE 5 END,
          COALESCE(gp.display_name, u.display_name) ASC`,
      [classIds]
    );
    const byClass = new Map();
    for (const c of classes.rows) byClass.set(c.id, { ...c, roster: [] });
    for (const r of rosters.rows) {
      byClass.get(r.class_id)?.roster.push(r);
    }
    return res.json({ data: Array.from(byClass.values()) });
  } catch (err) {
    console.error("[GET /admin/today-roster]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/guest-profiles/search?phone=XXX — autocompleta por teléfono.
// Devuelve el guest_profile + su pack de visitas activo (si lo tiene).
app.get("/api/admin/guest-profiles/search", adminMiddleware, async (req, res) => {
  try {
    const phone = normGuestPhone(req.query.phone);
    if (!phone) return res.json({ data: null });
    const gp = await pool.query(
      "SELECT * FROM guest_profiles WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $1 LIMIT 1",
      [phone]
    );
    if (!gp.rows.length) return res.json({ data: null });
    const profile = gp.rows[0];
    const u = await pool.query(
      "SELECT id FROM users WHERE guest_profile_id = $1 LIMIT 1",
      [profile.id]
    );
    const userId = u.rows[0]?.id ?? null;
    let activeMembership = null;
    if (userId) {
      const m = await pool.query(
        `SELECT m.id, m.classes_remaining, m.start_date, m.end_date,
                p.name AS plan_name, p.class_limit
           FROM memberships m
           LEFT JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1 AND m.status = 'active'
            AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
            AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
          ORDER BY m.created_at DESC LIMIT 1`,
        [userId]
      );
      activeMembership = m.rows[0] ?? null;
    }
    return res.json({ data: { profile, userId, activeMembership } });
  } catch (err) {
    console.error("[GET /admin/guest-profiles/search]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/visit-sale — venta de pack de visitas a una invitada.
// Body: { profile: {...}, planId, paymentMethod, startDate?, hostUserId? }
// Plan debe tener is_visit_pack=true. Crea/reusa guest_profile + user lite +
// crea membership con class_limit del plan + orden 'approved' con el método.
app.post("/api/admin/visit-sale", adminMiddleware, async (req, res) => {
  const { profile = {}, planId, paymentMethod = "cash", startDate, hostUserId } = req.body || {};
  if (!profile.name) return res.status(400).json({ message: "Nombre requerido" });
  if (!planId) return res.status(400).json({ message: "Plan requerido" });
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const planRes = await dbClient.query(
      "SELECT * FROM plans WHERE id = $1 AND is_active = true",
      [planId]
    );
    if (!planRes.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = planRes.rows[0];
    if (plan.is_visit_pack !== true) {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ message: "Este plan no está marcado como paquete de visitas." });
    }
    const _gen = await getSettingValueWithDefaults("general_settings");
    const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
    const guest = await findOrCreateGuestProfile({ ...profile, hostUserId }, dbClient);
    const user = await findOrCreateGuestUser(guest, dbClient);
    const startStr = startDate ? saleStartDay(startDate) : todayInStudio();
    if (!startStr) {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ message: "Fecha de inicio inválida (usa AAAA-MM-DD)." });
    }
    const endStr = calcMembershipEndDate(startStr, plan);
    const pm = normalizePaymentMethod(paymentMethod);
    if (!pm) {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ message: PAYMENT_METHOD_INVALID });
    }
    // Orden primero y membresía ligada a ella (order_id): /api/payments la
    // cuenta una sola vez y un reembolso encuentra la membresía.
    const orderRes = await dbClient.query(
      `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount, channel, verified_at, verified_by)
       VALUES ($1, $2, 'approved', $3, $4, $4, 'pos_visit', NOW(), $5)
       RETURNING *`,
      [user.id, plan.id, pm, _eff ?? 0, req.userId || null]
    );
    const memRes = await dbClient.query(
      `INSERT INTO memberships
         (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, notes, order_id)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [user.id, plan.id, pm, startStr, endStr, plan.class_limit ?? null,
       `Venta visita POS — ${guest.display_name}`, orderRes.rows[0].id]
    );
    await dbClient.query("COMMIT");
    return res.status(201).json({
      data: {
        guestProfile: guest,
        userId: user.id,
        membership: memRes.rows[0],
        order: orderRes.rows[0],
      },
    });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/visit-sale]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    dbClient.release();
  }
});

// POST /api/admin/classes/:id/walkin-visit — asigna una invitada a una clase.
// Body: { profile: {...}, hostUserId?, sale?: { planId, paymentMethod } }
// Si la invitada YA tiene pack activo con crédito: solo crea el booking.
// Si NO tiene pack y viene `sale`: vende el pack y reserva en el mismo paso.
app.post("/api/admin/classes/:id/walkin-visit", adminMiddleware, async (req, res) => {
  const { profile = {}, hostUserId, sale } = req.body || {};
  const classId = req.params.id;
  if (!profile.name) return res.status(400).json({ message: "Nombre de la invitada requerido" });
  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");
    const clsRes = await dbClient.query(
      "SELECT id, max_capacity, status FROM classes WHERE id = $1 FOR UPDATE",
      [classId]
    );
    if (!clsRes.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = clsRes.rows[0];
    if (cls.status === "cancelled") {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }
    const occupied = await liveBookingCount(classId, dbClient);
    if (occupied >= cls.max_capacity) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "La clase está llena" });
    }

    const guest = await findOrCreateGuestProfile({ ...profile, hostUserId }, dbClient);
    const user = await findOrCreateGuestUser(guest, dbClient);

    // Evitar duplicado: misma invitada ya reservada en esta clase.
    const dup = await dbClient.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, user.id]
    );
    if (dup.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "Esta visitante ya tiene reserva en esta clase" });
    }

    // ── Prioridad de descuento de crédito ───────────────────────────────
    // 1) Si la admin pasó hostUserId (la invitada llega "invitada por" una
    //    socia), intentar descontar del PACK DE VISITAS activo de la socia
    //    (mismo flujo que /admin/bookings/assign with-guest).
    // 2) Si no, usar el pack propio de la invitada (visit pack que le hayan
    //    vendido antes).
    // 3) Si tampoco hay y viene `sale`, vendérselo en el momento.
    let memRow = null;
    let chargedHostUserId = null;
    if (hostUserId) {
      const hostPackRes = await dbClient.query(
        `SELECT m.id, m.classes_remaining
           FROM memberships m
           JOIN plans p ON p.id = m.plan_id
          WHERE m.user_id = $1 AND m.status = 'active'
            AND p.is_visit_pack = true
            AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
            AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
          ORDER BY m.created_at DESC LIMIT 1
          FOR UPDATE`,
        [hostUserId]
      );
      if (hostPackRes.rows.length) {
        memRow = hostPackRes.rows[0];
        chargedHostUserId = hostUserId;
      }
      // Si hostUserId vino pero no tiene pack de visitas activo, NO bloqueamos
      // —caemos al flujo normal (pack propio de la invitada o venta en el
      // momento). La admin decide.
    }
    if (!memRow) {
      memRow = (await dbClient.query(
        `SELECT id, classes_remaining FROM memberships
          WHERE user_id = $1 AND status = 'active'
            AND (end_date IS NULL OR end_date >= CURRENT_DATE)
            AND (classes_remaining IS NULL OR classes_remaining > 0)
          ORDER BY created_at DESC LIMIT 1
          FOR UPDATE`,
        [user.id]
      )).rows[0] ?? null;
    }

    let saleOrder = null;
    if (!memRow) {
      if (!sale?.planId) {
        await dbClient.query("ROLLBACK");
        return res.status(400).json({
          message: hostUserId
            ? "La socia anfitriona no tiene paquete de visitas con créditos y la invitada tampoco tiene pack. Véndele uno o quita la anfitriona."
            : "La invitada no tiene un pack activo. Manda `sale: { planId, paymentMethod }` para venderlo en el momento.",
        });
      }
      const planRes = await dbClient.query(
        "SELECT * FROM plans WHERE id = $1 AND is_active = true AND is_visit_pack = true",
        [sale.planId]
      );
      if (!planRes.rows.length) {
        await dbClient.query("ROLLBACK");
        return res.status(404).json({ message: "Plan de visita no encontrado" });
      }
      const plan = planRes.rows[0];
      const _gen = await getSettingValueWithDefaults("general_settings");
      const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
      const pm = normalizePaymentMethod(sale.paymentMethod);
      if (!pm) {
        await dbClient.query("ROLLBACK");
        return res.status(400).json({ message: PAYMENT_METHOD_INVALID });
      }
      const startStr = todayInStudio();
      const endStr = calcMembershipEndDate(startStr, plan);
      // Orden primero y membresía ligada a ella (order_id), como en visit-sale.
      const orderIns = await dbClient.query(
        `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount, channel, verified_at, verified_by)
         VALUES ($1, $2, 'approved', $3, $4, $4, 'pos_visit', NOW(), $5)
         RETURNING *`,
        [user.id, plan.id, pm, _eff ?? 0, req.userId || null]
      );
      saleOrder = orderIns.rows[0];
      const memIns = await dbClient.query(
        `INSERT INTO memberships
           (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, notes, order_id)
         VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8) RETURNING *`,
        [user.id, plan.id, pm, startStr, endStr, plan.class_limit ?? 1,
         `Venta visita en roster — ${guest.display_name}`, saleOrder.id]
      );
      memRow = memIns.rows[0];
    }

    // Crear booking confirmed + descontar crédito + actualizar contador.
    const bookingIns = await dbClient.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, guest_profile_id, status)
       VALUES ($1, $2, $3, $4, 'confirmed') RETURNING *`,
      [classId, user.id, memRow.id, guest.id]
    );
    if (memRow.classes_remaining !== null) {
      await dbClient.query(
        "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
        [memRow.id]
      );
    }
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
    await dbClient.query("COMMIT");

    return res.status(201).json({
      data: {
        booking: bookingIns.rows[0],
        guestProfile: guest,
        userId: user.id,
        membershipId: memRow.id,
        soldOrder: saleOrder,
        chargedHostUserId,
      },
    });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/classes/:id/walkin-visit]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    dbClient.release();
  }
});

// ── Endpoints de socia (self-service) para acompañantes ────────────────────────

// GET /api/my-guests/search?phone=… — la socia ve solo a las invitadas que ELLA
// ha llevado antes (host_user_id = req.userId). Para autocompletar en su app.
app.get("/api/my-guests/search", authMiddleware, async (req, res) => {
  try {
    const phone = normGuestPhone(req.query.phone);
    if (!phone) return res.json({ data: null });
    const r = await pool.query(
      `SELECT * FROM guest_profiles
        WHERE host_user_id = $1
          AND regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $2
        LIMIT 1`,
      [req.userId, phone]
    );
    return res.json({ data: r.rows[0] ?? null });
  } catch (err) {
    console.error("[GET /my-guests/search]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/bookings/with-guest — la socia reserva PARA una acompañante usando
// SU pack de visitas. Body: { classId, guest: { name, phone, ...intake... } }.
// La socia debe tener un membership activo con plan.is_visit_pack=true y créditos.
app.post("/api/bookings/with-guest", authMiddleware, async (req, res) => {
  const { classId, guest = {} } = req.body || {};
  if (!classId) return res.status(400).json({ message: "classId requerido" });
  if (!isUuid(classId)) return res.status(400).json({ message: "Identificador inválido" });
  // Gate: la anfitriona (quien reserva) debe tener su propia responsiva firmada.
  if (!(await hasSignedWaiver(pool, req.userId))) {
    return res.status(403).json({ code: "WAIVER_REQUIRED", message: WAIVER_REQUIRED_MSG });
  }
  if (!guest.name) return res.status(400).json({ message: "Nombre de la acompañante requerido" });
  if (!guest.phone) return res.status(400).json({ message: "Teléfono de la acompañante requerido" });
  if (!guest.acceptedWaiver) return res.status(400).json({ message: "Confirma el waiver de la acompañante" });

  const dbClient = await pool.connect();
  try {
    await dbClient.query("BEGIN");

    // Validar clase + ventana de 2 h (misma regla que reservar para sí misma).
    const clsRes = await dbClient.query(
      `SELECT c.id, c.max_capacity, c.status,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') AS starts_at
         FROM classes c
        WHERE c.id = $1
        FOR UPDATE`,
      [classId]
    );
    if (!clsRes.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = clsRes.rows[0];
    if (cls.status === "cancelled" || cls.status === "closed") {
      await dbClient.query("ROLLBACK");
      return res.status(400).json({
        message: cls.status === "closed" ? "Esta clase ya no admite nuevas reservas." : "Esta clase fue cancelada",
      });
    }
    if (cls.starts_at) {
      const msToStart = new Date(cls.starts_at).getTime() - Date.now();
      if (msToStart < BOOKING_LEAD_MS) {
        await dbClient.query("ROLLBACK");
        return res.status(403).json({
          code: "BOOKING_WINDOW_CLOSED",
          message: `Las reservas cierran ${BOOKING_LEAD_HOURS} horas antes del inicio de la clase.`,
        });
      }
    }

    // La socia tiene pack de visitas activo con crédito?
    const packRes = await dbClient.query(
      `SELECT m.id, m.classes_remaining
         FROM memberships m
         JOIN plans p ON p.id = m.plan_id
        WHERE m.user_id = $1
          AND m.status = 'active'
          AND p.is_visit_pack = true
          AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
          AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
        ORDER BY m.created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [req.userId]
    );
    if (!packRes.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(403).json({
        message: "No tienes un paquete de visitas activo con créditos. Pídelo en recepción.",
      });
    }
    const pack = packRes.rows[0];

    // Cupo en vivo.
    const occupied = await liveBookingCount(classId, dbClient);
    if (occupied >= cls.max_capacity) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "La clase está llena" });
    }

    // Crear/reusar guest_profile vinculado a la socia (host_user_id = req.userId).
    const guestProfile = await findOrCreateGuestProfile({
      name: guest.name,
      phone: guest.phone,
      email: guest.email,
      hasInjury: guest.hasInjury,
      injuryDetails: guest.injuryDetails,
      practicedBarreBefore: guest.practicedBarreBefore,
      acceptedWaiver: guest.acceptedWaiver,
      hostUserId: req.userId,
    }, dbClient);
    const guestUser = await findOrCreateGuestUser(guestProfile, dbClient);

    // Anti-duplicado: misma invitada ya reservada en esta clase.
    const dup = await dbClient.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, guestUser.id]
    );
    if (dup.rows.length) {
      await dbClient.query("ROLLBACK");
      return res.status(409).json({ message: "Esta acompañante ya tiene reserva en esta clase" });
    }

    // Crear booking. user_id = invitada (es quien asistirá), membership_id =
    // pack de la socia (de ahí sale el crédito), guest_profile_id = profile.
    const bookingIns = await dbClient.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, guest_profile_id, status)
       VALUES ($1, $2, $3, $4, 'confirmed') RETURNING *`,
      [classId, guestUser.id, pack.id, guestProfile.id]
    );
    // Descontar 1 del pack de la socia (si no es ilimitado).
    if (pack.classes_remaining !== null) {
      await dbClient.query(
        "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
        [pack.id]
      );
    }
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
    await dbClient.query("COMMIT");

    // Notificar a la dueña/admins de la nueva reserva (con acompañante).
    try {
      const clsInfo = await pool.query(
        `SELECT ct.name AS class_name, c.date, c.start_time
           FROM classes c JOIN class_types ct ON ct.id = c.class_type_id
          WHERE c.id = $1`,
        [classId]
      );
      const socia = await pool.query("SELECT display_name FROM users WHERE id = $1", [req.userId]);
      const cl = clsInfo.rows[0] || {};
      const dateStr = cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "";
      const timeStr = cl.start_time ? String(cl.start_time).slice(0, 5) : "";
      const sociaName = socia.rows[0]?.display_name || "Socia";
      notifyAdminsByTemplate(
        "admin_new_booking",
        {
          clientName: `${guestProfile.display_name} (acompañante de ${sociaName})`,
          class: cl.class_name || "Clase",
          date: dateStr,
          time: timeStr,
        },
        `Nueva reserva con acompañante: ${guestProfile.display_name} (con ${sociaName}) en ${cl.class_name || "clase"}${dateStr ? ` el ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""}.`
      );
    } catch (_) { /* no romper el flujo si la notif falla */ }

    const remaining = pack.classes_remaining === null ? null : Math.max(0, pack.classes_remaining - 1);
    return res.status(201).json({
      data: {
        booking: bookingIns.rows[0],
        guestProfile,
        packMembershipId: pack.id,
        creditsRemaining: remaining,
      },
    });
  } catch (err) {
    await dbClient.query("ROLLBACK").catch(() => {});
    console.error("[POST /bookings/with-guest]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    dbClient.release();
  }
});

// DELETE /api/classes/week — "Limpiar semana" sin borrar historial
// (auditoría 2026-09-27, P1-5 · I6). Borra sólo las clases sin ninguna reserva;
// las que tienen reservas y no han empezado se cancelan con el flujo de
// cancelar clase (devuelve créditos y avisa); las que ya empezaron no se tocan.
// Sin force, si hay reservas activas responde 409 con el resumen; con force
// exige motivo porque cancela reservas.
app.delete("/api/classes/week", adminMiddleware, async (req, res) => {
  const { startDate, endDate, force, reason } = req.body || {};
  const start = typeof startDate === "string" ? startDate.slice(0, 10) : null;
  const end = typeof endDate === "string" ? endDate.slice(0, 10) : null;
  const rangeProblem = weekRangeProblem(start, end);
  if (rangeProblem) return res.status(400).json({ message: rangeProblem });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM classes WHERE date >= $1 AND date <= $2 FOR UPDATE", [start, end]);
    const rows = (await client.query(
      `SELECT c.id, c.status::text AS status,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') <= NOW() AS started,
              COUNT(b.id)::int AS total_bookings,
              (COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in','waitlist')))::int AS active_bookings
         FROM classes c
         LEFT JOIN bookings b ON b.class_id = c.id
        WHERE c.date >= $1 AND c.date <= $2
        GROUP BY c.id
        ORDER BY c.date, c.start_time`,
      [start, end],
    )).rows;
    const plan = planWeekClear(rows);
    if (plan.activeBookings > 0 && !force) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "ACTIVE_BOOKINGS",
        message: "Hay reservas activas esta semana. Esas clases se cancelan (se devuelve el crédito y se avisa a cada alumna) en lugar de borrarse.",
        activeBookings: plan.activeBookings,
        classesToCancel: plan.cancel.length,
        classesToDelete: plan.delete.length,
        classesKept: plan.keep.length,
      });
    }
    if (plan.activeBookings > 0) {
      const problem = reasonProblem(reason);
      if (problem) {
        await client.query("ROLLBACK");
        return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
      }
    }
    const cancelled = [];
    for (const id of plan.cancel) {
      const done = await cancelClassInTx(client, id, { actorId: req.userId, reason: cleanReason(reason) || "Limpieza de la semana", source: "week_clear" });
      if (done) cancelled.push(done);
    }
    let deleted = 0;
    let deletedIds = [];
    if (plan.delete.length) {
      // NOT EXISTS: una clase que recibió una reserva entre el conteo y aquí no se borra.
      const del = await client.query(
        `DELETE FROM classes c
          WHERE c.id = ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id)
          RETURNING c.id`,
        [plan.delete],
      );
      deletedIds = del.rows.map((r) => r.id);
      deleted = deletedIds.length;
    }
    // Si el NOT EXISTS salvó alguna (le llegó una reserva entre el conteo y el
    // DELETE), esa clase se conserva, no se borró: va con las que ya se conservaban.
    const savedIds = plan.delete.filter((id) => !deletedIds.includes(id));
    const keptIds = [...plan.keep, ...savedIds];
    const bookingsCancelled = cancelled.reduce((s, c) => s + c.activeBookings.length, 0);
    const creditsRestored = cancelled.reduce((s, c) => s + c.creditsRestored, 0);
    await recordAudit(client, {
      actorId: req.userId, action: "class.week_clear", entityType: "class_week",
      reason: plan.activeBookings > 0 ? reason : null,
      after: { deleted, cancelled: cancelled.length, kept: keptIds.length },
      meta: {
        start, end, deleted_ids: deletedIds, cancelled_ids: cancelled.map((c) => c.classRow.id), kept_ids: keptIds,
        bookings_cancelled: bookingsCancelled, credits_restored: creditsRestored,
      },
    });
    await client.query("COMMIT");

    // Avisos después del COMMIT, igual que al cancelar una clase.
    let waQueued = 0;
    let channelState = null;
    const unreached = new Map();
    for (const c of cancelled) {
      if (!c.activeBookings.length) continue;
      const wa = await notifyClassCancelled(c.classRow, c.activeBookings, cleanReason(reason));
      waQueued += wa.waQueued;
      channelState = wa.channelState;
      for (const u of wa.waUnreached) if (!unreached.has(u.user_id)) unreached.set(u.user_id, u);
    }
    return res.json({
      deleted, cancelled: cancelled.length, kept: keptIds.length, bookingsCancelled, creditsRestored,
      wa_queued: waQueued, wa_failed: unreached.size, wa_unreached: [...unreached.values()], wa_channel_state: channelState,
      startDate: start, endDate: end,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "23503") {
      return res.status(409).json({ message: "Alguna clase tiene registros ligados: cancélala en lugar de borrarla." });
    }
    console.error("[DELETE /classes/week]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

function toDbDateString(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addMinutesToTimeString(timeValue, minutesToAdd) {
  const [hours, minutes] = String(timeValue || "00:00").split(":").map(Number);
  const totalMinutes = (hours * 60) + minutes + minutesToAdd;
  const normalizedMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalizedMinutes / 60)).padStart(2, "0")}:${String(normalizedMinutes % 60).padStart(2, "0")}`;
}

function parseTimeSlotTo24Hour(timeValue) {
  const raw = String(timeValue || "").trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const meridiem = match[3];

  if (meridiem === "pm" && hours !== 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// POST /api/classes/generate — bulk generate (transaccional: o se crean todas
// o ninguna; antes un fallo a mitad dejaba clases a medias y respondía 500).
app.post("/api/classes/generate", adminMiddleware, async (req, res) => {
  const { startDate, endDate, classTypeId, instructorId, daysOfWeek, startTime, endTime, maxCapacity = 5 } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ message: "startDate y endDate requeridos" });
  if (!classTypeId) return res.status(400).json({ message: "classTypeId requerido" });
  if (!instructorId) return res.status(400).json({ message: "instructorId requerido" });
  if (!Array.isArray(daysOfWeek) || !daysOfWeek.length) return res.status(400).json({ message: "Selecciona al menos un día" });
  if (!/^\d{2}:\d{2}$/.test(String(startTime || "")) || !/^\d{2}:\d{2}$/.test(String(endTime || ""))) {
    return res.status(400).json({ message: "startTime y endTime deben tener formato HH:mm" });
  }
  if (String(endTime) <= String(startTime)) {
    return res.status(400).json({ message: "La hora de fin debe ser posterior a la de inicio." });
  }
  const cap = Number(maxCapacity);
  if (!Number.isInteger(cap) || cap < 1) {
    return res.status(400).json({ message: "El cupo debe ser un entero >= 1" });
  }
  // Append T00:00:00 to parse as local midnight (not UTC)
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return res.status(400).json({ message: "Fechas inválidas" });
  }
  if (end < start) {
    return res.status(400).json({ message: "La fecha de fin no puede ser anterior a la de inicio." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const created = [];

    // Modo formulario (el que usa la app): classTypeId + daysOfWeek + horas.
    if (classTypeId && Array.isArray(daysOfWeek) && daysOfWeek.length && startTime && endTime) {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const jsDay = d.getDay(); // 0=Sun,1=Mon...
        if (!daysOfWeek.includes(jsDay)) continue;
        const classDate = toDbDateString(d);
        const exists = await client.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTime, classTypeId]
        );
        if (exists.rows.length) continue;
        const r = await client.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,$6,'scheduled') RETURNING *`,
          [classTypeId, instructorId, classDate, startTime, endTime, cap]
        );
        created.push(r.rows[0]);
      }
      await client.query("COMMIT");
      return res.json({ created: created.length, data: created });
    }

    // Fallback: generate from schedule_templates
    const slotsRes = await client.query("SELECT * FROM schedule_templates WHERE is_active = true");
    const classTypeRes = await client.query("SELECT id, name, category FROM class_types WHERE is_active = true");
    const classTypes = classTypeRes.rows;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay() === 0 ? 7 : d.getDay();
      const daySlots = slotsRes.rows.filter(s => s.day_of_week === dayOfWeek);
      for (const slot of daySlots) {
        const startTimeValue = parseTimeSlotTo24Hour(slot.time_slot);
        if (!startTimeValue) continue;
        const classDate = toDbDateString(d);
        const endTimeValue = addMinutesToTimeString(startTimeValue, 55);
        const label = slot.class_label?.toLowerCase();
        let ct = classTypes.find(c => c.category?.toLowerCase() === label || (label && c.name?.toLowerCase().includes(label)));
        if (!ct) ct = classTypes[0];
        if (!ct) continue;
        const exists = await client.query(
          "SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3",
          [classDate, startTimeValue, ct.id]
        );
        if (exists.rows.length) continue;
        const r = await client.query(
          `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
           VALUES ($1,$2,$3,$4,$5,10,'scheduled') RETURNING *`,
          [ct.id, instructorId, classDate, startTimeValue, endTimeValue]
        );
        created.push(r.rows[0]);
      }
    }
    await client.query("COMMIT");
    return res.json({ created: created.length, data: created });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("generate classes error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// ─── Schedules (schedule_slots) CRUD ────────────────────────────────────────

// GET /api/schedules
app.get("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM schedule_slots ORDER BY day_of_week, time_slot");
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/schedules
app.post("/api/schedules", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive = true } = req.body;
    if (!timeSlot || !dayOfWeek) return res.status(400).json({ message: "timeSlot y dayOfWeek requeridos" });
    const r = await pool.query(
      `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_id, class_type_name, instructor_name, is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/schedules/:id
app.put("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    const { timeSlot, dayOfWeek, classTypeName, classTypeId, instructorName, isActive } = req.body;
    const r = await pool.query(
      `UPDATE schedule_slots SET time_slot=$1, day_of_week=$2, class_type_id=$3, class_type_name=$4, instructor_name=$5, is_active=$6
       WHERE id=$7 RETURNING *`,
      [timeSlot, dayOfWeek, classTypeId || null, classTypeName || null, instructorName || null, isActive !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Slot no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/schedules/:id
app.delete("/api/schedules/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM schedule_slots WHERE id = $1", [req.params.id]);
    return res.json({ message: "Slot eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/schedules/reset-template — borra schedule_slots y siembra la plantilla de 23 horarios.
// Si body.generateClasses === true, también crea las class instances en `classes`
// para las próximas body.weeksAhead semanas (default 4) usando body.instructorId.
//
// Body: { generateClasses?: boolean, weeksAhead?: number,
//         instructorId?: string, classTypeId?: string, maxCapacity?: number }
app.post("/api/schedules/reset-template", adminMiddleware, async (req, res) => {
  const {
    generateClasses = false,
    weeksAhead = 4,
    instructorId: bodyInstructorId,
    classTypeId: bodyClassTypeId,
    maxCapacity = 5,
  } = req.body || {};

  // Canonical slots (day_of_week, time_slot, end_time +55min)
  const TEMPLATE_SLOTS = [
    [1, "7:00 am"], [1, "8:00 am"], [1, "7:00 pm"], [1, "8:00 pm"],
    [2, "7:00 am"], [2, "8:00 am"], [2, "7:00 pm"], [2, "8:00 pm"],
    [3, "7:00 am"], [3, "8:00 am"], [3, "7:00 pm"], [3, "8:00 pm"],
    [4, "7:00 am"], [4, "8:00 am"], [4, "7:00 pm"], [4, "8:00 pm"],
    [5, "7:00 am"], [5, "8:00 am"], [5, "7:00 pm"], [5, "8:00 pm"],
    [6, "7:00 am"], [6, "8:00 am"], [6, "9:00 am"],
  ];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM schedule_slots");
    for (const [dow, ts] of TEMPLATE_SLOTS) {
      await client.query(
        `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name, is_active)
         VALUES ($1, $2, 'Barre', true)`,
        [ts, dow],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    console.error("reset-template (slots) error:", err);
    return res.status(500).json({ message: "Error interno seedeando slots", error: err.message });
  }
  client.release();

  // Si no se pidió generar instancias, devolvemos solo el seed.
  if (!generateClasses) {
    const r = await pool.query("SELECT * FROM schedule_slots ORDER BY day_of_week, time_slot");
    return res.json({
      data: { slots: r.rows, classesCreated: 0 },
      message: "Plantilla HIVE restablecida (23 slots)",
    });
  }

  // Resolver class_type (prefiere Barre si existe; si no, el primero activo) e instructor.
  let classTypeId = bodyClassTypeId;
  if (!classTypeId) {
    const ctRes = await pool.query(
      `SELECT id FROM class_types WHERE is_active = true
        ORDER BY (name ILIKE '%barre%') DESC, sort_order ASC LIMIT 1`,
    );
    classTypeId = ctRes.rows[0]?.id;
  }
  if (!classTypeId) {
    return res.status(400).json({
      message: "No hay class_type activo. Crea 'Barre' en /admin/classes/types primero.",
    });
  }
  let instructorId = bodyInstructorId;
  if (!instructorId) {
    const insRes = await pool.query(
      `SELECT id FROM instructors WHERE is_active = true ORDER BY created_at ASC LIMIT 1`,
    );
    instructorId = insRes.rows[0]?.id;
  }
  if (!instructorId) {
    return res.status(400).json({
      message: "No hay instructora activa. Crea una en /admin/classes (tab Instructoras) primero.",
    });
  }

  // Generar instancias: del próximo lunes hasta +N semanas-1.
  const nWeeks = Math.max(1, Math.min(12, Number(weeksAhead) || 4));
  const today = new Date();
  // Inicio: el lunes de esta semana (date_trunc style)
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const dow = start.getDay() === 0 ? 6 : start.getDay() - 1; // 0=Mon..6=Sun
  start.setDate(start.getDate() - dow);
  const end = new Date(start);
  end.setDate(end.getDate() + nWeeks * 7 - 1);

  const created = [];
  const skipped = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    // schedule_slots usa 1=Mon..6=Sat; JS Date.getDay() es 0=Sun..6=Sat
    const jsDay = d.getDay();
    if (jsDay === 0) continue; // Domingo: la plantilla no tiene horarios
    const slotDay = jsDay; // 1..6 directos
    const slotsForDay = TEMPLATE_SLOTS.filter(([dw]) => dw === slotDay);
    const dateStr = toDbDateString(d);
    for (const [, timeSlot] of slotsForDay) {
      const startTime = parseTimeSlotTo24Hour(timeSlot);
      if (!startTime) continue;
      const endTime = addMinutesToTimeString(startTime, 55);
      const exists = await pool.query(
        `SELECT id FROM classes WHERE date = $1 AND start_time = $2 AND class_type_id = $3 LIMIT 1`,
        [dateStr, startTime, classTypeId],
      );
      if (exists.rows.length) {
        skipped.push({ date: dateStr, time: startTime, reason: "exists" });
        continue;
      }
      const r = await pool.query(
        `INSERT INTO classes (class_type_id, instructor_id, date, start_time, end_time, max_capacity, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'scheduled') RETURNING id, date, start_time`,
        [classTypeId, instructorId, dateStr, startTime, endTime, maxCapacity],
      );
      created.push(r.rows[0]);
    }
  }

  return res.json({
    data: {
      slotsSeeded: 23,
      classesCreated: created.length,
      classesSkipped: skipped.length,
      weeksAhead: nWeeks,
      classTypeId,
      instructorId,
    },
    message: `Plantilla HIVE restablecida. ${created.length} clases creadas (${skipped.length} ya existían).`,
  });
});

// POST /api/pos/checkout — alias for /pos/sale
app.post("/api/pos/checkout", adminMiddleware, async (req, res) => {
  try {
    const { userId, items, paymentMethod = "efectivo", discountCode } = req.body;
    const result = await processPosSale({ userId, items, paymentMethod, discountCode });
    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }
    return res.status(201).json({ data: result.data });
  } catch (err) {
    console.error("pos/checkout error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: err?.message || "Error interno" });
  }
});

// ─── Loyalty config & rewards admin ─────────────────────────────────────────

const LOYALTY_CONFIG_DEFAULTS = {
  enabled: true,
  points_per_class: 10,
  points_per_peso: 1,
  welcome_bonus: 50,
  birthday_bonus: 100,
  faltas_enabled: true,
  faltas_threshold: 5,
  faltas_penalty_points: 50,
  faltas_cancel_window_hours: 12,
};

async function getLoyaltyConfig(q = pool) {
  try {
    const r = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    return r.rows.length ? { ...LOYALTY_CONFIG_DEFAULTS, ...r.rows[0].value } : { ...LOYALTY_CONFIG_DEFAULTS };
  } catch {
    return { ...LOYALTY_CONFIG_DEFAULTS };
  }
}

// GET/PUT /api/loyalty/config
app.get("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    const cfg = await getLoyaltyConfig();
    return res.json({ data: cfg });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/config", adminMiddleware, async (req, res) => {
  try {
    // Strip referral_bonus if accidentally sent
    const { referral_bonus, pointsPerReferral, ...clean } = req.body;
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1)
       ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()`,
      [JSON.stringify(clean)]
    );
    return res.json({ data: clean });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/loyalty/rewards — admin CRUD for loyalty rewards
app.post("/api/loyalty/rewards", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type = "custom", reward_value = "", is_active = true, stock = null } = req.body;
    if (!name || !points_cost) return res.status(400).json({ message: "name y points_cost requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_rewards (name, description, points_cost, reward_type, reward_value, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [name, description || null, points_cost, reward_type, reward_value || null, stock || null, is_active]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards POST:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, description, points_cost, reward_type, reward_value, stock, is_active } = req.body;
    const r = await pool.query(
      "UPDATE loyalty_rewards SET name=$1, description=$2, points_cost=$3, reward_type=$4, reward_value=$5, stock=$6, is_active=$7 WHERE id=$8 RETURNING *",
      [name, description || null, points_cost, reward_type || "custom", reward_value || null, stock || null, is_active !== false, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Recompensa no encontrada" });
    return res.json({ data: r.rows[0] });
  } catch (err) { console.error("loyalty rewards PUT:", err); return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/loyalty/rewards/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM loyalty_rewards WHERE id=$1", [req.params.id]);
    return res.json({ message: "Recompensa eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Loyalty milestones (recompensas auto al hit de N clases) ────────────
// GET /api/admin/loyalty-milestones — admin list with how many users have claimed each.
app.get("/api/admin/loyalty-milestones", adminMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(`
      SELECT m.*,
             (SELECT COUNT(*) FROM loyalty_milestone_awards a WHERE a.milestone_id = m.id)::int AS awarded_count
        FROM loyalty_milestones m
       ORDER BY m.sort_order ASC, m.classes_required ASC
    `);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/admin/loyalty-milestones
app.post("/api/admin/loyalty-milestones", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, classes_required, period = "lifetime",
      award_type = "points", award_points = 0, award_reward_id,
      message_template_key, is_active = true, sort_order = 0,
    } = req.body || {};
    if (!name || !Number.isFinite(Number(classes_required)) || Number(classes_required) < 1) {
      return res.status(400).json({ message: "name y classes_required (>=1) son requeridos" });
    }
    const r = await pool.query(
      `INSERT INTO loyalty_milestones (name, description, classes_required, period, award_type, award_points, award_reward_id, message_template_key, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name, description || null, Number(classes_required), period, award_type, Number(award_points) || 0,
       award_reward_id || null, message_template_key || null, is_active, Number(sort_order) || 0],
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// PUT /api/admin/loyalty-milestones/:id
app.put("/api/admin/loyalty-milestones/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, classes_required, period, award_type,
      award_points, award_reward_id, message_template_key, is_active, sort_order,
    } = req.body || {};
    const r = await pool.query(
      `UPDATE loyalty_milestones SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         classes_required = COALESCE($3, classes_required),
         period = COALESCE($4, period),
         award_type = COALESCE($5, award_type),
         award_points = COALESCE($6, award_points),
         award_reward_id = COALESCE($7, award_reward_id),
         message_template_key = COALESCE($8, message_template_key),
         is_active = COALESCE($9, is_active),
         sort_order = COALESCE($10, sort_order),
         updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [name ?? null, description ?? null, classes_required ?? null, period ?? null,
       award_type ?? null, award_points ?? null, award_reward_id ?? null,
       message_template_key ?? null, is_active ?? null, sort_order ?? null, req.params.id],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Milestone no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/admin/loyalty-milestones/:id
app.delete("/api/admin/loyalty-milestones/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM loyalty_milestones WHERE id = $1", [req.params.id]);
    return res.json({ message: "Milestone eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/loyalty-milestones/awards — feed de quién ganó qué (auditoría)
app.get("/api/admin/loyalty-milestones/awards", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const r = await pool.query(`
      SELECT a.id, a.user_id, a.classes_at_award, a.awarded_at,
             u.display_name, u.phone,
             m.name AS milestone_name, m.classes_required, m.award_type, m.award_points
        FROM loyalty_milestone_awards a
        LEFT JOIN users u ON u.id = a.user_id
        LEFT JOIN loyalty_milestones m ON m.id = a.milestone_id
       ORDER BY a.awarded_at DESC
       LIMIT $1
    `, [limit]);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/loyalty/milestones/me — progreso del usuario logueado (próximo milestone)
app.get("/api/loyalty/milestones/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const lifetimeRes = await pool.query(
      "SELECT COUNT(*)::int AS n FROM bookings WHERE user_id = $1 AND status = 'checked_in'",
      [userId],
    );
    const lifetime = lifetimeRes.rows[0]?.n || 0;
    const milestonesRes = await pool.query(
      `SELECT m.id, m.name, m.description, m.classes_required, m.period, m.award_type, m.award_points,
              CASE WHEN a.id IS NOT NULL THEN true ELSE false END AS achieved,
              a.awarded_at
         FROM loyalty_milestones m
         LEFT JOIN loyalty_milestone_awards a
           ON a.milestone_id = m.id AND a.user_id = $1
        WHERE m.is_active = true
        ORDER BY m.sort_order ASC, m.classes_required ASC`,
      [userId],
    );
    const next = milestonesRes.rows.find((m) => !m.achieved && m.period === "lifetime");
    return res.json({
      data: {
        lifetime_classes: lifetime,
        next_milestone: next || null,
        next_progress: next ? Math.min(lifetime, next.classes_required) : null,
        next_remaining: next ? Math.max(0, next.classes_required - lifetime) : null,
        milestones: milestonesRes.rows,
      },
    });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Campañas (broadcast manual de promociones por segmento) ────────────────
// Segmentos pre-armados via SQL. Cada query devuelve users con phone + display_name
// + accepts_communications/receive_reminders + extra context (days_inactive, etc).
const CAMPAIGN_SEGMENTS = {
  all_active: {
    label: "Todas las alumnas activas",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, NULL::date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
        JOIN memberships m ON m.user_id = u.id
       WHERE u.is_active = true
         AND m.status = 'active'
         AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
       GROUP BY u.id`,
  },
  dormant_14d: {
    label: "Alumnas sin venir 14+ días",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             COALESCE((CURRENT_DATE - MAX(b.checked_in_at)::date)::int, 999) AS days_inactive,
             NULL::date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
        LEFT JOIN bookings b ON b.user_id = u.id AND b.status = 'checked_in'
       WHERE u.is_active = true
       GROUP BY u.id
      HAVING COALESCE(MAX(b.checked_in_at), '1970-01-01'::timestamptz)
             < (NOW() - INTERVAL '14 days')`,
  },
  dormant_30d: {
    label: "Alumnas sin venir 30+ días",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             COALESCE((CURRENT_DATE - MAX(b.checked_in_at)::date)::int, 999) AS days_inactive,
             NULL::date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
        LEFT JOIN bookings b ON b.user_id = u.id AND b.status = 'checked_in'
       WHERE u.is_active = true
       GROUP BY u.id
      HAVING COALESCE(MAX(b.checked_in_at), '1970-01-01'::timestamptz)
             < (NOW() - INTERVAL '30 days')`,
  },
  expiring_7d: {
    label: "Membresía vence en 7 días",
    sql: `
      SELECT DISTINCT ON (u.id)
             u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, m.end_date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
        JOIN memberships m ON m.user_id = u.id
       WHERE u.is_active = true
         AND m.status = 'active'
         AND m.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
       ORDER BY u.id, m.end_date ASC`,
  },
  // Socias con pack ACTIVO (regular, no visit pack) que aún no tienen
  // ninguna reserva (confirmed/checked_in) para esta semana. Pensado para
  // recordatorio de mitad de semana ("ya es miércoles, aparta tu lugar").
  active_no_booking_this_week: {
    label: "Pack activo, sin reservar esta semana",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, NULL::date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
       WHERE u.is_active = true
         AND EXISTS (
           SELECT 1 FROM memberships m
             JOIN plans p ON p.id = m.plan_id
            WHERE m.user_id = u.id
              AND m.status = 'active'
              AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
              AND COALESCE(p.is_visit_pack, false) = false
              AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
         )
         AND NOT EXISTS (
           SELECT 1 FROM bookings b
             JOIN classes c ON c.id = b.class_id
            WHERE b.user_id = u.id
              AND b.status IN ('confirmed','checked_in')
              AND date_trunc('week', c.date::date) = date_trunc('week', CURRENT_DATE)
         )`,
  },
  expired_recently: {
    label: "Membresía vencida en últimos 30 días",
    sql: `
      SELECT DISTINCT ON (u.id)
             u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, m.end_date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
        JOIN memberships m ON m.user_id = u.id
       WHERE u.is_active = true
         AND m.end_date BETWEEN (CURRENT_DATE - INTERVAL '30 days') AND (CURRENT_DATE - INTERVAL '1 day')
         AND NOT EXISTS (
           SELECT 1 FROM memberships m2
            WHERE m2.user_id = u.id AND m2.status = 'active'
              AND (m2.end_date IS NULL OR m2.end_date >= CURRENT_DATE)
         )
       ORDER BY u.id, m.end_date DESC`,
  },
  birthday_month: {
    label: "Cumpleaños este mes",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, NULL::date AS plan_expires_at, u.date_of_birth
        FROM users u
       WHERE u.is_active = true
         AND u.date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM u.date_of_birth) = EXTRACT(MONTH FROM CURRENT_DATE)`,
  },
  all: {
    label: "Todas las alumnas (con cuidado)",
    sql: `
      SELECT u.id, u.display_name, u.phone, u.accepts_communications, u.receive_reminders,
             NULL::int AS days_inactive, NULL::date AS plan_expires_at, NULL::date AS date_of_birth
        FROM users u
       WHERE u.is_active = true`,
  },
};

async function resolveCampaignTargets(segment) {
  const cfg = CAMPAIGN_SEGMENTS[segment];
  if (!cfg) throw new Error(`segment desconocido: ${segment}`);
  const r = await pool.query(cfg.sql);
  return r.rows;
}

/**
 * Build template vars for a target row, merging campaign-level vars
 * with row-derived values (firstName, days, etc).
 */
function buildCampaignVars(target, baseVars = {}, message = "") {
  const firstName = firstNameOf(target.display_name, "alumna");
  return {
    firstName,
    name: target.display_name || firstName,
    message: message || baseVars.message || "",
    days: target.days_inactive ?? baseVars.days ?? "",
    ...baseVars,
  };
}

/**
 * Send a campaign in the background. Each target gets its own row in
 * campaign_logs. Respects opt-out (accepts_communications + receive_reminders).
 * Uses queueWhatsAppSend (1.2s rate-limited) so 100 sends ≈ 2 min.
 */
async function dispatchCampaign(campaignId) {
  const cRes = await pool.query("SELECT * FROM campaigns WHERE id = $1", [campaignId]);
  const campaign = cRes.rows[0];
  if (!campaign) return;
  await pool.query("UPDATE campaigns SET status = 'sending' WHERE id = $1", [campaignId]);

  let targets;
  try {
    targets = await resolveCampaignTargets(campaign.segment);
  } catch (err) {
    await pool.query(
      "UPDATE campaigns SET status = 'failed', completed_at = NOW() WHERE id = $1",
      [campaignId],
    );
    console.error("[Campaign] resolve targets error:", err?.message);
    return;
  }

  let sent = 0, failed = 0, skipped = 0;
  const baseVars = campaign.template_vars || {};
  const message = campaign.message || "";

  // Pre-create logs (todas pending) — facilita auditoría aún si el server reinicia.
  for (const t of targets) {
    await pool.query(
      `INSERT INTO campaign_logs (campaign_id, user_id, phone, status)
       VALUES ($1, $2, $3, 'pending')`,
      [campaignId, t.id, t.phone || null],
    ).catch(() => {});
  }

  for (const t of targets) {
    const vars = buildCampaignVars(t, baseVars, message);
    let logStatus = "pending";
    let reason = null;
    let rendered = "";

    if (t.accepts_communications === false && t.receive_reminders === false) {
      logStatus = "skipped"; reason = "opted_out"; skipped++;
    } else if (!t.phone) {
      logStatus = "skipped"; reason = "no_phone"; skipped++;
    } else {
      // Build text: prefer template_key, fallback to {message} substitution.
      try {
        if (campaign.template_key) {
          const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
          const tpl = templates?.[campaign.template_key];
          rendered = renderTemplateVars(tpl?.body || "", vars).trim();
        }
        if (!rendered && message) {
          rendered = renderTemplateVars(message, vars).trim();
        }
        if (!rendered) {
          logStatus = "skipped"; reason = "empty_message"; skipped++;
        } else {
          await queueWhatsAppSend(normalisePhone(t.phone), rendered);
          logStatus = "sent"; sent++;
        }
      } catch (err) {
        logStatus = "failed"; reason = (err?.message || "send_error").slice(0, 80); failed++;
      }
    }

    await pool.query(
      `UPDATE campaign_logs
          SET status = $1, reason = $2, rendered = $3, sent_at = CASE WHEN $1 = 'sent' THEN NOW() ELSE NULL END
        WHERE campaign_id = $4 AND user_id = $5`,
      [logStatus, reason, rendered || null, campaignId, t.id],
    ).catch(() => {});
  }

  await pool.query(
    `UPDATE campaigns
        SET total_sent = $1, total_failed = $2, total_skipped = $3,
            status = 'completed', completed_at = NOW()
      WHERE id = $4`,
    [sent, failed, skipped, campaignId],
  );
}

// GET /api/admin/campaigns/segments — preview cuántas alumnas hay en cada segmento.
app.get("/api/admin/campaigns/segments", adminMiddleware, async (_req, res) => {
  try {
    const out = {};
    for (const [key, cfg] of Object.entries(CAMPAIGN_SEGMENTS)) {
      try {
        const r = await pool.query(`SELECT COUNT(*)::int AS n FROM (${cfg.sql}) seg`);
        out[key] = { label: cfg.label, count: r.rows[0]?.n || 0 };
      } catch (err) {
        out[key] = { label: cfg.label, count: 0, error: err.message.slice(0, 80) };
      }
    }
    return res.json({ data: out });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/admin/campaigns/preview — cuántas alumnas y primeros 5 nombres.
app.post("/api/admin/campaigns/preview", adminMiddleware, async (req, res) => {
  try {
    const { segment } = req.body || {};
    if (!CAMPAIGN_SEGMENTS[segment]) {
      return res.status(400).json({ message: "Segmento inválido", available: Object.keys(CAMPAIGN_SEGMENTS) });
    }
    const targets = await resolveCampaignTargets(segment);
    const optedOut = targets.filter((t) => t.accepts_communications === false && t.receive_reminders === false).length;
    const noPhone = targets.filter((t) => !t.phone).length;
    return res.json({
      data: {
        segment,
        label: CAMPAIGN_SEGMENTS[segment].label,
        total: targets.length,
        sendable: targets.length - optedOut - noPhone,
        opted_out: optedOut,
        no_phone: noPhone,
        first_names: targets.slice(0, 8).map((t) => firstNameOf(t.display_name, "alumna")),
      },
    });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/admin/campaigns/send — crea campaign + dispara envío en background.
// Tope de seguridad para envíos masivos de WhatsApp. Evita un "mandé a 500 sin
// querer". Configurable por env; por encima del tope hace falta confirm:true
// explícito y, para volúmenes muy grandes, ser super_admin.
const CAMPAIGN_SOFT_LIMIT = Number(process.env.CAMPAIGN_SOFT_LIMIT) || 50;
const CAMPAIGN_HARD_LIMIT = Number(process.env.CAMPAIGN_HARD_LIMIT) || 300;

app.post("/api/admin/campaigns/send", adminMiddleware, async (req, res) => {
  try {
    const { name, segment, message, templateKey, vars, confirm } = req.body || {};
    if (!name || !segment) {
      return res.status(400).json({ message: "name y segment son requeridos" });
    }
    if (!CAMPAIGN_SEGMENTS[segment]) {
      return res.status(400).json({ message: "Segmento inválido", available: Object.keys(CAMPAIGN_SEGMENTS) });
    }
    if (!message && !templateKey) {
      return res.status(400).json({ message: "Define `message` (texto custom) o `templateKey`" });
    }
    const targets = await resolveCampaignTargets(segment);

    // ── Tope de seguridad ────────────────────────────────────────────────
    const count = targets.length;
    // Rol del caller (para el tope alto).
    const callerRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = callerRes.rows[0]?.role || "client";
    const isSuperAdmin = callerRole === "super_admin";

    // Por encima del tope duro, ni con confirmación: solo super_admin.
    if (count > CAMPAIGN_HARD_LIMIT && !isSuperAdmin) {
      return res.status(403).json({
        message: `Esta campaña alcanza a ${count} personas, por encima del máximo permitido (${CAMPAIGN_HARD_LIMIT}). Pide a un super admin que la envíe o usa un segmento más reducido.`,
        requiresSuperAdmin: true,
        count,
      });
    }
    // Por encima del tope blando, exige confirmación explícita.
    if (count > CAMPAIGN_SOFT_LIMIT && !confirm) {
      return res.status(409).json({
        message: `Vas a enviar a ${count} personas. Confirma para continuar.`,
        requiresConfirm: true,
        count,
        softLimit: CAMPAIGN_SOFT_LIMIT,
      });
    }
    const r = await pool.query(
      `INSERT INTO campaigns (name, segment, message, template_key, template_vars, total_targets, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7) RETURNING *`,
      [name, segment, message || null, templateKey || null, JSON.stringify(vars || {}), targets.length, req.userId || null],
    );
    const campaign = r.rows[0];
    // Fire-and-forget background dispatch.
    dispatchCampaign(campaign.id).catch((err) => {
      console.error("[Campaign] dispatch error:", err?.message);
    });
    return res.status(201).json({ data: { campaign, total_targets: targets.length } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/campaigns — listado paginado.
app.get("/api/admin/campaigns", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const r = await pool.query(
      `SELECT id, name, segment, status, total_targets, total_sent, total_failed, total_skipped,
              created_at, completed_at
         FROM campaigns
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/campaigns/:id — detalle + stats.
app.get("/api/admin/campaigns/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM campaigns WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Campaña no encontrada" });
    const stats = await pool.query(
      `SELECT status, COUNT(*)::int AS n FROM campaign_logs WHERE campaign_id = $1 GROUP BY status`,
      [req.params.id],
    );
    return res.json({ data: { ...r.rows[0], stats: stats.rows } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/admin/campaigns/:id/logs — logs por user (paginado).
app.get("/api/admin/campaigns/:id/logs", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const r = await pool.query(
      `SELECT cl.id, cl.user_id, cl.phone, cl.status, cl.reason, cl.rendered, cl.sent_at,
              u.display_name
         FROM campaign_logs cl
         LEFT JOIN users u ON u.id = cl.user_id
        WHERE cl.campaign_id = $1
        ORDER BY cl.sent_at DESC NULLS LAST, cl.created_at DESC
        LIMIT $2`,
      [req.params.id, limit],
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/loyalty/points/:userId
app.get("/api/loyalty/points/:userId", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      "SELECT COALESCE(SUM(CASE WHEN type='earn' OR type='adjust' THEN points ELSE -points END),0) AS balance FROM loyalty_transactions WHERE user_id=$1",
      [req.params.userId]
    );
    return res.json({ data: { balance: parseInt(r.rows[0].balance) } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reports sub-routes ──────────────────────────────────────────────────────

// Helper: parsea ?from=&to= y devuelve current + previous range (mismo número de días hacia atrás)
// Fecha civil local (NO toISOString(), que convierte a UTC y en México adelanta
// el día a partir de las 18:00). Auditoría 2026-09-08, P0-2.
function localDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Los reportes comparan con BETWEEN $1 AND $2. Si el extremo superior es una
// fecha "pelona", Postgres la interpreta como medianoche y TODO lo del día en
// curso queda fuera: el dashboard mostraba $0 de ingresos y 0 reservas hasta
// el día siguiente. El extremo superior se cierra al final del día.
// Auditoría 2026-09-08, P0-2.
function parseDateRange(req) {
  const now = new Date();
  let from, to;
  if (req.query.from && req.query.to) {
    from = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00`);
    to = new Date(`${String(req.query.to).slice(0, 10)}T00:00:00`);
  } else {
    // Default: este mes, hasta hoy inclusive
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = now;
  }
  if (isNaN(from) || isNaN(to)) {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = now;
  }
  // Contar días civiles: con `to = now`, restar milisegundos redondeaba hacia
  // arriba después del mediodía y el período previo salía un día más largo que
  // el actual, torciendo todos los deltas. Revisión de código 2026-09-08, R7.
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.max(1, Math.round((midnight(to) - midnight(from)) / 86400000) + 1);
  const prevTo = new Date(from);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (days - 1));
  const endOfDay = (d) => `${localDate(d)} 23:59:59.999`;
  return {
    from: localDate(from),
    to: endOfDay(to),
    toDate: localDate(to),
    prevFrom: localDate(prevFrom),
    prevTo: endOfDay(prevTo),
    days,
  };
}

function pctChange(curr, prev) {
  curr = Number(curr || 0);
  prev = Number(prev || 0);
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Number((((curr - prev) / prev) * 100).toFixed(1));
}

// Ingreso neto en caja de un rango: ventas aprobadas − reembolsos registrados en
// el rango (auditoría 2026-09-27, P1-12). Un reembolso resta en su fecha: no
// reescribe meses cerrados.
const NET_REVENUE_SQL = `SELECT
    (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'approved' AND created_at BETWEEN $1 AND $2) AS gross,
    (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE created_at BETWEEN $1 AND $2) AS refunds`;

app.get("/api/reports/overview", ownerMiddleware, async (req, res) => {
  try {
    const range = parseDateRange(req);
    const monthStart = range.from;
    const [members, revenue, bookings, classes, newMembers, reviews, churn,
           prevRevenue, prevBookings, prevNewMembers, prevReviews] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM memberships WHERE status = 'active' AND (end_date IS NULL OR end_date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date)`),
      pool.query(NET_REVENUE_SQL, [range.from, range.to]),
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status != 'cancelled') AS total,
            COUNT(*) FILTER (WHERE status = 'checked_in') AS attended,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
            COUNT(*) FILTER (WHERE status = 'no_show')  AS no_show
           FROM bookings
          WHERE created_at BETWEEN $1 AND $2`,
        [range.from, range.to],
      ),
      pool.query("SELECT COUNT(*) FROM classes WHERE status='scheduled' AND date BETWEEN $1 AND $2", [range.from, range.to]),
      pool.query("SELECT COUNT(*) FROM users WHERE role='client' AND created_at BETWEEN $1 AND $2", [range.from, range.to]),
      pool.query(
        `SELECT COUNT(*) AS total,
                COUNT(CASE WHEN is_approved = false THEN 1 END) AS pending,
                COALESCE(AVG(rating),0) AS average
           FROM reviews
          WHERE created_at BETWEEN $1 AND $2`,
        [range.from, range.to],
      ),
      // Churn: alumnas con membresía vencida en últimos 30d sin renovación posterior
      pool.query(
        `WITH expired_recent AS (
           SELECT DISTINCT user_id FROM memberships
            WHERE end_date BETWEEN (CURRENT_DATE - INTERVAL '30 days') AND (CURRENT_DATE - INTERVAL '1 day')
         ),
         still_active AS (
           SELECT DISTINCT user_id FROM memberships
            WHERE status = 'active' AND (end_date IS NULL OR end_date >= CURRENT_DATE)
         ),
         active_30d_ago AS (
           SELECT DISTINCT user_id FROM memberships
            WHERE start_date <= (CURRENT_DATE - INTERVAL '30 days')
              AND (end_date IS NULL OR end_date > (CURRENT_DATE - INTERVAL '30 days'))
         )
         SELECT
           (SELECT COUNT(*) FROM expired_recent e
             WHERE NOT EXISTS (SELECT 1 FROM still_active s WHERE s.user_id = e.user_id))::int AS churned,
           GREATEST(1, (SELECT COUNT(*) FROM active_30d_ago))::int AS base`,
      ),
      // Previous period (mismo número de días hacia atrás)
      pool.query(NET_REVENUE_SQL, [range.prevFrom, range.prevTo]),
      pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status != 'cancelled') AS total,
            COUNT(*) FILTER (WHERE status = 'checked_in') AS attended,
            COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
           FROM bookings WHERE created_at BETWEEN $1 AND $2`,
        [range.prevFrom, range.prevTo],
      ),
      pool.query("SELECT COUNT(*) FROM users WHERE role='client' AND created_at BETWEEN $1 AND $2", [range.prevFrom, range.prevTo]),
      pool.query(
        `SELECT COUNT(*) AS total, COALESCE(AVG(rating),0) AS average
           FROM reviews WHERE created_at BETWEEN $1 AND $2`,
        [range.prevFrom, range.prevTo],
      ),
    ]);
    const monthlyBookings = parseInt(bookings.rows[0].total || 0);
    const attended = parseInt(bookings.rows[0].attended || 0);
    const cancelled = parseInt(bookings.rows[0].cancelled || 0);
    const totalIncludingCancelled = monthlyBookings + cancelled;
    const classOccupancyRate = monthlyBookings > 0
      ? Number(((attended / monthlyBookings) * 100).toFixed(1))
      : 0;
    const cancelRate = totalIncludingCancelled > 0
      ? Number(((cancelled / totalIncludingCancelled) * 100).toFixed(1))
      : 0;
    const churnRate = Number((100 * churn.rows[0].churned / churn.rows[0].base).toFixed(1));
    const grossRevenue = parseFloat(revenue.rows[0].gross);
    const refundsTotal = parseFloat(revenue.rows[0].refunds);
    // round2: restar flotantes dejaba colas como 699.9300000000001 en el JSON.
    const monthlyRevenue = round2(grossRevenue - refundsTotal);
    const newMembersCount = parseInt(newMembers.rows[0].count || 0);
    const reviewsAvg = Number(parseFloat(reviews.rows[0].average || 0).toFixed(1));
    const prevRev = round2(parseFloat(prevRevenue.rows[0].gross) - parseFloat(prevRevenue.rows[0].refunds));
    const prevBookingsCount = parseInt(prevBookings.rows[0].total || 0);
    const prevAttended = parseInt(prevBookings.rows[0].attended || 0);
    const prevOccupancy = prevBookingsCount > 0 ? (prevAttended / prevBookingsCount) * 100 : 0;
    const prevNewMembersCount = parseInt(prevNewMembers.rows[0].count || 0);
    const prevReviewsAvg = Number(parseFloat(prevReviews.rows[0].average || 0).toFixed(1));

    const prevCancelled = parseInt(prevBookings.rows[0].cancelled || 0);
    const prevCancelRate = (prevBookingsCount + prevCancelled) > 0
      ? (prevCancelled / (prevBookingsCount + prevCancelled)) * 100
      : 0;

    return res.json({
      data: {
        activeMembers: parseInt(members.rows[0].count),
        monthlyRevenue,
        grossRevenue,
        refundsTotal,
        monthlyBookings, // ahora excluye canceladas
        cancelledBookings: cancelled,
        cancelRate,
        upcomingClasses: parseInt(classes.rows[0].count),
        classOccupancyRate,
        newMembersThisMonth: newMembersCount,
        churnRate,
        churnedUsers: churn.rows[0].churned,
        reviewsTotal: parseInt(reviews.rows[0].total || 0),
        reviewsPending: parseInt(reviews.rows[0].pending || 0),
        reviewsAverage: reviewsAvg,
        // Deltas vs previous period (porcentaje)
        deltas: {
          revenue: pctChange(monthlyRevenue, prevRev),
          bookings: pctChange(monthlyBookings, prevBookingsCount),
          occupancy: pctChange(classOccupancyRate, prevOccupancy),
          newMembers: pctChange(newMembersCount, prevNewMembersCount),
          reviewsAvg: pctChange(reviewsAvg, prevReviewsAvg),
          cancelRate: pctChange(cancelRate, prevCancelRate),
        },
        range: { from: range.from, to: range.toDate, days: range.days },
      }
    });
  } catch (err) {
    console.error("[reports/overview]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// Sparkline data: ingresos por semana últimas 12 semanas
app.get("/api/reports/revenue-sparkline", ownerMiddleware, async (req, res) => {
  try {
    // Neto: ventas de la semana − reembolsos de la semana (auditoría 2026-09-27, P1-12).
    const r = await pool.query(`
      WITH weeks AS (
        SELECT DATE_TRUNC('week', CURRENT_DATE) - (INTERVAL '1 week' * gs.n) AS week_start
        FROM generate_series(0, 11) AS gs(n)
      ),
      sales AS (
        SELECT DATE_TRUNC('week', created_at) AS week_start, SUM(total_amount) AS amount
          FROM orders WHERE status = 'approved' GROUP BY 1
      ),
      refunded AS (
        SELECT DATE_TRUNC('week', created_at) AS week_start, SUM(amount) AS amount
          FROM refunds GROUP BY 1
      )
      SELECT w.week_start AS week,
             (COALESCE(s.amount, 0) - COALESCE(rf.amount, 0))::int AS amount
        FROM weeks w
        LEFT JOIN sales s ON s.week_start = w.week_start
        LEFT JOIN refunded rf ON rf.week_start = w.week_start
       ORDER BY w.week_start ASC
    `);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/revenue", ownerMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `WITH months AS (
         SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
         FROM generate_series(0, 11) AS gs(n)
       ),
       orders_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
           FROM orders
          WHERE status = 'approved'
          GROUP BY 1
       ),
       -- Reembolsos en el mes en que se registraron (auditoría 2026-09-27, P1-12):
       -- amount es neto y no reescribe meses cerrados.
       refunds_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start, COALESCE(SUM(amount), 0) AS total
           FROM refunds
          GROUP BY 1
       )
       SELECT m.month_start AS month,
              COALESCE(o.total, 0) - COALESCE(rf.total, 0) AS amount,
              COALESCE(o.count, 0) AS count,
              COALESCE(rf.total, 0) AS refunds
         FROM months m
         LEFT JOIN orders_by_month o ON o.month_start = m.month_start
         LEFT JOIN refunds_by_month rf ON rf.month_start = m.month_start
        ORDER BY m.month_start ASC`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/classes", ownerMiddleware, async (req, res) => {
  try {
    // Excluye bookings cancelados de la columna 'bookings' para que refleje
    // demanda real, no intención.
    const r = await pool.query(
      `SELECT ct.name,
              COUNT(b.id) FILTER (WHERE b.status != 'cancelled')::INT AS bookings,
              COUNT(b.id) FILTER (WHERE b.status = 'checked_in')::INT AS attended,
              COUNT(b.id) FILTER (WHERE b.status = 'cancelled')::INT AS cancelled
       FROM classes c
       JOIN class_types ct ON c.class_type_id=ct.id
       LEFT JOIN bookings b ON b.class_id=c.id
       GROUP BY ct.name ORDER BY bookings DESC LIMIT 10`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/retention", ownerMiddleware, async (req, res) => {
  try {
    // Time-series mensual: para cada uno de los últimos 12 meses, calcula
    // % de alumnas que estaban activas el mes anterior y siguen activas este mes.
    const r = await pool.query(`
      WITH months AS (
        SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
        FROM generate_series(0, 11) AS gs(n)
      )
      SELECT
        m.month_start AS month,
        (SELECT COUNT(DISTINCT user_id) FROM memberships
          WHERE start_date <= m.month_start
            AND (end_date IS NULL OR end_date >= m.month_start))::int AS active_at_month,
        (SELECT COUNT(DISTINCT m1.user_id) FROM memberships m1
          WHERE m1.start_date <= (m.month_start - INTERVAL '1 month')
            AND (m1.end_date IS NULL OR m1.end_date >= (m.month_start - INTERVAL '1 month'))
            AND EXISTS (
              SELECT 1 FROM memberships m2
               WHERE m2.user_id = m1.user_id
                 AND m2.start_date <= m.month_start
                 AND (m2.end_date IS NULL OR m2.end_date >= m.month_start)
            ))::int AS retained
      FROM months m
      ORDER BY m.month_start ASC
    `);
    const series = r.rows.map((row) => {
      const prevActive = Number(row.active_at_month) > 0 ? Number(row.active_at_month) : 1;
      // retention rate = retained from prev month / active prev month
      // Simplificado: retained ya está calculado contra el mes anterior
      const rate = Number(row.retained) > 0
        ? Number(((Number(row.retained) / prevActive) * 100).toFixed(1))
        : 0;
      return {
        month: row.month,
        active: Number(row.active_at_month),
        retained: Number(row.retained),
        rate,
      };
    });
    return res.json({ data: series });
  } catch (err) {
    console.error("[reports/retention]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// Top alumnas por asistencia (lifetime + último mes)
app.get("/api/reports/top-attendance", ownerMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const r = await pool.query(
      `SELECT u.id, u.display_name, u.phone,
              COUNT(*) FILTER (WHERE b.status = 'checked_in')::int AS lifetime,
              COUNT(*) FILTER (WHERE b.status = 'checked_in' AND b.checked_in_at >= DATE_TRUNC('month', CURRENT_DATE))::int AS this_month,
              MAX(b.checked_in_at) AS last_visit
         FROM users u
         JOIN bookings b ON b.user_id = u.id
        WHERE u.role = 'client' AND b.status = 'checked_in'
        GROUP BY u.id, u.display_name, u.phone
        ORDER BY lifetime DESC, this_month DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Conversión clase muestra → paquete recurrente
app.get("/api/reports/conversion", ownerMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      WITH muestras AS (
        SELECT DISTINCT m.user_id, MIN(m.start_date) AS muestra_date
          FROM memberships m
          JOIN plans p ON p.id = m.plan_id
         WHERE p.repeat_key LIKE 'trial_single_session%'
            OR p.name ILIKE '%muestra%'
         GROUP BY m.user_id
      ),
      converted AS (
        SELECT DISTINCT m.user_id
          FROM memberships m
          JOIN plans p ON p.id = m.plan_id
          JOIN muestras mu ON mu.user_id = m.user_id
         WHERE p.class_limit > 1
           AND m.start_date >= mu.muestra_date
      )
      SELECT
        (SELECT COUNT(*) FROM muestras)::int AS muestras_total,
        (SELECT COUNT(*) FROM converted)::int AS converted_total
    `);
    const muestras = r.rows[0]?.muestras_total || 0;
    const converted = r.rows[0]?.converted_total || 0;
    const rate = muestras > 0 ? Number(((converted / muestras) * 100).toFixed(1)) : 0;
    return res.json({ data: { muestras_total: muestras, converted_total: converted, conversion_rate: rate } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Dormant cohort: distribución por días sin venir
app.get("/api/reports/dormant", ownerMiddleware, async (req, res) => {
  try {
    const r = await pool.query(`
      WITH last_visit AS (
        SELECT u.id AS user_id,
               COALESCE(MAX(b.checked_in_at)::date, u.created_at::date) AS last_at
          FROM users u
          LEFT JOIN bookings b ON b.user_id = u.id AND b.status = 'checked_in'
         WHERE u.role = 'client'
           AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id)
         GROUP BY u.id, u.created_at
      )
      SELECT
        SUM(CASE WHEN (CURRENT_DATE - last_at) <= 7 THEN 1 ELSE 0 END)::int AS active_7d,
        SUM(CASE WHEN (CURRENT_DATE - last_at) BETWEEN 8 AND 14 THEN 1 ELSE 0 END)::int AS dormant_8_14d,
        SUM(CASE WHEN (CURRENT_DATE - last_at) BETWEEN 15 AND 30 THEN 1 ELSE 0 END)::int AS dormant_15_30d,
        SUM(CASE WHEN (CURRENT_DATE - last_at) BETWEEN 31 AND 60 THEN 1 ELSE 0 END)::int AS dormant_31_60d,
        SUM(CASE WHEN (CURRENT_DATE - last_at) > 60 THEN 1 ELSE 0 END)::int AS lost_60d
      FROM last_visit
    `);
    return res.json({ data: r.rows[0] || {} });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.get("/api/reports/instructors", ownerMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT i.id,
              i.display_name AS name,
              COUNT(c.id)::INT AS class_count,
              COUNT(b.id)::INT AS total_students
       FROM instructors i
       LEFT JOIN classes c ON c.instructor_id=i.id
       LEFT JOIN bookings b ON b.class_id=c.id
       GROUP BY i.id, i.display_name
       ORDER BY class_count DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Reviews public endpoints & admin ───────────────────────────────────────

// GET /api/reviews (public, approved only; admin sees all via /api/admin/reviews)
app.get("/api/reviews", async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    // Público: SOLO reseñas aprobadas. El admin ve todas vía /api/admin/reviews.
    let q = `SELECT rv.*, u.display_name AS user_name FROM reviews rv LEFT JOIN users u ON rv.user_id=u.id WHERE rv.is_approved=true`;
    const params = [];
    params.push(parseInt(limit)); q += ` ORDER BY rv.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/reviews/stats
app.get("/api/reviews/stats", async (req, res) => {
  try {
    const r = await pool.query("SELECT AVG(rating) AS average, COUNT(*) AS total FROM reviews WHERE is_approved=true");
    const dist = await pool.query("SELECT rating, COUNT(*) FROM reviews WHERE is_approved=true GROUP BY rating ORDER BY rating DESC");
    return res.json({ data: { average: parseFloat(r.rows[0].average || 0).toFixed(1), total: parseInt(r.rows[0].total), distribution: dist.rows } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// Review tags (admin)
app.get("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM review_tags ORDER BY name").catch(() => ({ rows: [] }));
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.post("/api/review-tags", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "INSERT INTO review_tags (name, color) VALUES ($1,$2) RETURNING *",
      [name, color || "#c026d3"]
    ).catch(() => ({ rows: [{ id: "1", name, color }] }));
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, color } = req.body;
    const r = await pool.query(
      "UPDATE review_tags SET name=$1, color=$2 WHERE id=$3 RETURNING *",
      [name, color || "#c026d3", req.params.id]
    ).catch(() => ({ rows: [{ id: req.params.id, name, color }] }));
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.delete("/api/review-tags/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM review_tags WHERE id=$1", [req.params.id]).catch(() => { });
    return res.json({ message: "Tag eliminado" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── Referrals admin ─────────────────────────────────────────────────────────

// GET /api/referrals/codes — all codes (admin)
app.get("/api/referrals/codes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rc.*, u.display_name AS user_name, u.email, rc.uses_count
       FROM referral_codes rc LEFT JOIN users u ON rc.user_id=u.id
       ORDER BY rc.uses_count DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/referrals — referral history
app.get("/api/referrals", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT r.*, rc.code, u.display_name AS referred_name
       FROM referrals r
       JOIN referral_codes rc ON r.referral_code_id=rc.id
       LEFT JOIN users u ON r.referred_user_id=u.id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    return res.json({ data: r.rows });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// GET /api/referrals/stats
app.get("/api/referrals/stats", adminMiddleware, async (req, res) => {
  try {
    const [total, rewarded] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM referrals"),
      pool.query("SELECT COUNT(*) FROM referrals WHERE rewarded=true"),
    ]);
    return res.json({ data: { total: parseInt(total.rows[0].count), rewarded: parseInt(rewarded.rows[0].count) } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// POST /api/admin/referrals/codes — crear código manualmente
app.post("/api/admin/referrals/codes", adminMiddleware, async (req, res) => {
  try {
    let { code, user_id, reward_points = 200, max_uses, is_active = true } = req.body || {};
    if (!code) {
      // Auto-generar código corto y único
      const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ23456789";
      do {
        code = "HIVE-" + Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        const exists = await pool.query("SELECT 1 FROM referral_codes WHERE code = $1", [code]);
        if (!exists.rows.length) break;
      } while (true);
    } else {
      code = String(code).toUpperCase().trim();
      const exists = await pool.query("SELECT 1 FROM referral_codes WHERE code = $1", [code]);
      if (exists.rows.length) {
        return res.status(409).json({ message: "Ese código ya existe" });
      }
    }
    if (!user_id) {
      user_id = req.userId; // default: admin que crea
    }
    const r = await pool.query(
      `INSERT INTO referral_codes (user_id, code, reward_points, max_uses, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [user_id, code, Number(reward_points) || 200, max_uses ? Number(max_uses) : null, !!is_active],
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("[POST /admin/referrals/codes]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/referrals/codes/:id — actualizar
app.put("/api/admin/referrals/codes/:id", adminMiddleware, async (req, res) => {
  try {
    const { reward_points, max_uses, is_active } = req.body || {};
    const r = await pool.query(
      `UPDATE referral_codes SET
         reward_points = COALESCE($1, reward_points),
         max_uses = COALESCE($2, max_uses),
         is_active = COALESCE($3, is_active)
       WHERE id = $4 RETURNING *`,
      [
        reward_points != null ? Number(reward_points) : null,
        max_uses != null ? Number(max_uses) : null,
        is_active != null ? !!is_active : null,
        req.params.id,
      ],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Código no encontrado" });
    return res.json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/referrals/codes/:id
app.delete("/api/admin/referrals/codes/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM referral_codes WHERE id = $1", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Settings ────────────────────────────────────────────────────────────────

const PUBLIC_SETTINGS_KEYS = new Set([
  "policies_settings",
]);

async function getSettingValueWithDefaults(key) {
  const r = await pool.query("SELECT value FROM settings WHERE key=$1", [key]);
  const raw = r.rows.length ? r.rows[0].value : null;
  return mergeSettingsWithDefaults(key, raw);
}

app.get("/api/public/settings/:key", async (req, res) => {
  try {
    const { key } = req.params;
    if (!PUBLIC_SETTINGS_KEYS.has(key)) {
      return res.status(403).json({ message: "Configuración no pública" });
    }
    const value = await getSettingValueWithDefaults(key);
    return res.json({ data: value });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.get("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    const value = await getSettingValueWithDefaults(req.params.key);
    return res.json({ data: value });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

app.put("/api/settings/:key", adminMiddleware, async (req, res) => {
  try {
    // La cuota de cancelaciones tiene su ruta (sólo la dueña, validada y en la
    // bitácora): por aquí recepción podía cambiarla (auditoría 2026-09-27, P0-4).
    if (req.params.key === "cancellation_settings") {
      return res.status(400).json({ message: "La cuota de cancelaciones se cambia en Configuración → Políticas." });
    }
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ message: "Falta `value` en el body" });
    }
    const merged = mergeSettingsWithDefaults(req.params.key, value);
    if (req.params.key === "general_settings" && typeof merged.venue_media_url === "string" && merged.venue_media_url.startsWith("data:image/")) merged.venue_media_url = await storePhotoReference(merged.venue_media_url);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      [req.params.key, JSON.stringify(merged)]
    );
    return res.json({ data: { key: req.params.key, value: merged } });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ── Política de reservas y cancelación (auditoría 2026-09-27, P0-4) ─────────
// Cuota de cancelaciones por paquete (settings.cancellation_settings; 2 por
// defecto, 0 = sin límite), ventana real (loyalty_config) y cierre de reservas y
// de la lista de espera (BOOKING_LEAD_HOURS). La app, los legales y el panel la
// leen de aquí: una sola política.
async function getBookingPolicy(db = pool) {
  const [raw, loyalty] = await Promise.all([
    db.query("SELECT value FROM settings WHERE key = 'cancellation_settings' LIMIT 1")
      .then((r) => r.rows[0]?.value ?? null)
      .catch(() => null),
    getLoyaltyConfig(db),
  ]);
  return publicBookingPolicy({ settings: raw, loyalty, bookingLeadHours: BOOKING_LEAD_HOURS });
}

app.get("/api/public/booking-policy", async (_req, res) => {
  try {
    return res.json({ data: await getBookingPolicy() });
  } catch (err) {
    console.error("[GET /public/booking-policy]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/booking-policy — sólo la dueña fija la cuota de cancelaciones.
app.put("/api/admin/booking-policy", ownerMiddleware, async (req, res) => {
  const problem = cancellationLimitProblem(req.body?.cancellationLimit);
  if (problem) return res.status(400).json({ message: problem });
  const next = Number(req.body.cancellationLimit);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT value FROM settings WHERE key = 'cancellation_settings' FOR UPDATE");
    const raw = cur.rows[0]?.value && typeof cur.rows[0].value === "object" ? cur.rows[0].value : {};
    const prev = normalizeCancellationSettings(raw).max_cancellations;
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('cancellation_settings', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ ...raw, max_cancellations: next })],
    );
    if (prev !== next) {
      await recordAudit(client, {
        actorId: req.userId, action: "settings.update", entityType: "settings",
        before: { max_cancellations: prev }, after: { max_cancellations: next },
        meta: { key: "cancellation_settings" },
      });
    }
    await client.query("COMMIT");
    // Con el mismo cliente: pedir otra conexión del pool teniendo ésta puede
    // quedarse esperando si el pool está lleno.
    return res.json({ data: await getBookingPolicy(client) });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /admin/booking-policy]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// ── Datos de transferencia bancaria — editables por el admin ─────────────────
// GET devuelve los datos actuales (ya normalizados); el cliente los usa en el
// checkout. PUT valida y guarda en settings.key='bank_info'.
app.get("/api/admin/bank-info", ownerMiddleware, async (_req, res) => {
  try {
    const info = await getConfiguredBankInfo(pool);
    return res.json({ data: info });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.put("/api/admin/bank-info", ownerMiddleware, async (req, res) => {
  try {
    const { bank, account_holder, clabe, account_number } = req.body || {};
    const clabeDigits = digitsOnly(clabe);
    if (!String(bank || "").trim()) {
      return res.status(400).json({ message: "El banco es requerido" });
    }
    if (!String(account_holder || "").trim()) {
      return res.status(400).json({ message: "El titular es requerido" });
    }
    if (clabeDigits.length !== 18) {
      return res.status(400).json({ message: "La CLABE debe tener exactamente 18 dígitos" });
    }
    // Guardamos en limpio (sin formato); normalizeBankInfo lo formatea al leer.
    const value = {
      bank: String(bank).trim(),
      account_holder: String(account_holder).trim(),
      clabe: clabeDigits,
      account_number: digitsOnly(account_number),
    };
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ('bank_info', $1) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=NOW()",
      [JSON.stringify(value)]
    );
    // Devolvemos ya normalizado para que el admin vea exactamente lo que verá la clienta.
    const info = await getConfiguredBankInfo(pool);
    return res.json({ data: info });
  } catch (err) {
    console.error("[bank-info] PUT failed:", err?.message);
    return res.status(500).json({ message: "No pudimos guardar los datos de transferencia" });
  }
});

// ── WhatsApp templates (admin-friendly wrapper around notification_templates) ──
// Variables disponibles por template — usado por admin UI para mostrar chips
// de placeholders y validar al guardar.
const TEMPLATE_VARIABLES = {
  admin_new_booking: ["clientName", "class", "date", "time"],
  welcome: ["firstName"],
  password_reset: ["firstName", "link"],
  booking_confirmed: ["firstName", "class", "date", "time"],
  booking_cancelled: ["firstName", "class", "date", "creditRestored"],
  class_reminder: ["firstName", "class", "time"],
  class_attended: ["firstName", "class"],
  membership_activated: ["firstName", "plan", "startDate", "endDate"],
  membership_expiring_today: ["firstName"],
  membership_expiring_tomorrow: ["firstName"],
  membership_expiring_n_days: ["firstName", "days"],
  membership_expired: ["firstName"],
  renewal_reminder: ["firstName", "plan", "expiresAt"],
  transfer_rejected: ["firstName", "reason"],
  points_earned: ["firstName", "points", "totalPoints"],
  reward_redeemed: ["firstName", "rewardName", "points"],
  event_registered: ["firstName", "eventTitle"],
  motivation_first_class_week: ["firstName", "classesThisWeek", "weekGoal"],
  motivation_almost_ringed: ["firstName"],
  motivation_streak_2_weeks: ["firstName"],
  motivation_streak_4_weeks: ["firstName"],
  motivation_streak_8_weeks: ["firstName"],
  motivation_milestone_10_classes: ["firstName"],
  motivation_milestone_25_classes: ["firstName"],
  motivation_milestone_50_classes: ["firstName"],
  motivation_milestone_100_classes: ["firstName"],
  motivation_comeback: ["firstName", "daysAway"],
  milestone_classes_5: ["firstName", "classes", "points"],
  milestone_classes_10: ["firstName", "classes", "points"],
  milestone_classes_25: ["firstName", "classes", "points"],
  milestone_classes_50: ["firstName", "classes", "points"],
  milestone_classes_100: ["firstName", "classes", "points"],
  promo_custom: ["firstName", "message"],
  promo_dormant_invite: ["firstName", "days", "message"],
  promo_expiring_offer: ["firstName", "message"],
  promo_birthday_month: ["firstName", "message"],
};

app.get("/api/admin/whatsapp-templates", adminMiddleware, async (_req, res) => {
  try {
    const current = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
    return res.json({
      data: {
        templates: current,
        defaults: DEFAULT_NOTIFICATION_TEMPLATES,
        variables: TEMPLATE_VARIABLES,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.put("/api/admin/whatsapp-templates", adminMiddleware, async (req, res) => {
  try {
    const { templates } = req.body || {};
    if (!templates || typeof templates !== "object") {
      return res.status(400).json({ message: "Falta `templates` en el body" });
    }
    const merged = mergeSettingsWithDefaults("notification_templates", templates);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      ["notification_templates", JSON.stringify(merged)]
    );
    return res.json({ data: { templates: merged } });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/notification-settings — devuelve la config global de avisos
// (toggle email/WA + lista de teléfonos admin que reciben alertas).
app.get("/api/admin/notification-settings", adminMiddleware, async (_req, res) => {
  try {
    const settings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    return res.json({ data: settings });
  } catch (err) {
    console.error("[GET /admin/notification-settings]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/notification-settings — actualiza toggles + admin_phones.
// Body acepta cualquier campo de DEFAULT_NOTIFICATION_SETTINGS (merge parcial).
app.put("/api/admin/notification-settings", adminMiddleware, async (req, res) => {
  try {
    const updates = req.body || {};
    if (Array.isArray(updates.admin_phones)) {
      // Limpia: solo strings con dígitos válidos, dedupe.
      const seen = new Set();
      updates.admin_phones = updates.admin_phones
        .filter((p) => typeof p === "string" && p.trim())
        .map((p) => p.trim())
        .filter((p) => {
          const key = String(p).replace(/\D/g, "");
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
    }
    const merged = mergeSettingsWithDefaults("notification_settings", updates);
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      ["notification_settings", JSON.stringify(merged)]
    );
    return res.json({ data: merged });
  } catch (err) {
    console.error("[PUT /admin/notification-settings]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

app.post("/api/admin/whatsapp-templates/reset", adminMiddleware, async (_req, res) => {
  try {
    await pool.query(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
      ["notification_templates", JSON.stringify(DEFAULT_NOTIFICATION_TEMPLATES)]
    );
    return res.json({ data: { templates: DEFAULT_NOTIFICATION_TEMPLATES } });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.get("/api/admin/motivation/log", adminMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const r = await pool.query(
      `SELECT m.id, m.user_id, m.template_key, m.sent_date, m.sent_at,
              u.display_name, u.phone
         FROM motivation_sends m
         LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.sent_at DESC
        LIMIT $1`,
      [limit],
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

app.post("/api/admin/whatsapp-templates/preview", adminMiddleware, async (req, res) => {
  try {
    const { templateKey, vars } = req.body || {};
    if (!templateKey) {
      return res.status(400).json({ message: "Falta `templateKey`" });
    }
    const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
    const tpl = templates?.[templateKey];
    if (!tpl) return res.status(404).json({ message: "Template no encontrado" });
    return res.json({
      data: {
        subject: renderTemplateVars(tpl.subject || "", vars || {}),
        body: renderTemplateVars(tpl.body || "", vars || {}),
      },
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/whatsapp-templates/test-send — dueña envía template real
// a un teléfono para validar antes de mandar masivo.
// Body: { templateKey, phone, vars? }
app.post("/api/admin/whatsapp-templates/test-send", adminMiddleware, async (req, res) => {
  try {
    const { templateKey, phone, vars } = req.body || {};
    if (!templateKey || !phone) {
      return res.status(400).json({ message: "templateKey y phone son requeridos" });
    }
    if (!EVOLUTION_API_URL || !EVOLUTION_INSTANCE) {
      return res.status(503).json({ message: "Evolution API no está configurada" });
    }
    // Check connection state
    try {
      const stateRes = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
      const state = stateRes.data?.instance?.state || stateRes.data?.state || "unknown";
      if (state !== "open") {
        return res.status(503).json({
          message: `WhatsApp no está conectado (estado: ${state}). Conecta primero en /admin/settings.`,
        });
      }
    } catch (stateErr) {
      return res.status(503).json({
        message: "No se pudo verificar conexión Evolution. Revisa configuración.",
      });
    }
    // Default sample vars (la dueña puede sobrescribir)
    const sampleVars = {
      firstName: "Estefanía",
      name: "Estefanía",
      class: "Pilates Reformer",
      date: "viernes 15 mayo",
      time: "07:00",
      points: 50, totalPoints: 1500,
      classes: 10, classesThisWeek: 1, weekGoal: 4, days: 7,
      rewardName: "Clase muestra Studio",
      eventTitle: "Clase muestra",
      message: "esto es una prueba del template",
      plan: "Studio Ilimitado",
      startDate: "1 mayo", endDate: "31 mayo",
      expiresAt: "31 mayo",
      reason: "comprobante ilegible",
      link: "https://www.almamovement.com.mx/test",
      creditRestored: "Sí",
      ...(vars || {}),
    };
    const result = await sendConfiguredWhatsAppTemplate({
      templateKey,
      phone: normalisePhone(phone),
      vars: sampleVars,
      fallbackMessage: "",
    });
    if (!result.sent) {
      return res.status(400).json({
        message: result.reason === "whatsapp_disabled"
          ? "WhatsApp deshabilitado en configuración"
          : result.reason === "empty_message"
            ? "Template renderea vacío. Revisa el body."
            : `No se pudo enviar (${result.reason})`,
      });
    }
    return res.json({
      data: {
        sent: true,
        phone: normalisePhone(phone),
        templateKey,
      },
    });
  } catch (err) {
    console.error("[test-send]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Evolution API (WhatsApp) ─────────────────────────────────────────────────

// Helper: normalise phone to WhatsApp format (521XXXXXXXXXX for MX)
function normalisePhone(raw) {
  let phone = String(raw).replace(/\D/g, "");
  if (phone.startsWith("52") && phone.length === 12) return phone; // already 521XXXXXXXXXX or 52XXXXXXXXXX
  if (phone.length === 10) return "52" + phone; // local MX 10 digits
  return phone;
}

const EVOLUTION_SEND_DELAY_MS = Number(process.env.EVOLUTION_SEND_DELAY_MS || 2500);
let evolutionSendQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendTypingIndicator(number, durationMs) {
  try {
    await evolutionApi.post(`/chat/sendPresence/${EVOLUTION_INSTANCE}`, {
      number,
      options: { presence: "composing", delay: durationMs },
    });
    await sleep(durationMs + 300);
  } catch (_) {
    // typing indicator failure is non-fatal — continue with send
  }
}

async function sendWhatsAppNow(number, text) {
  const typingMs = Math.min(Math.max(Math.round(text.length * 55), 1500), 4500);
  await sendTypingIndicator(number, typingMs);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await evolutionApi.post(`/message/sendText/${EVOLUTION_INSTANCE}`, { number, text });
    } catch (err) {
      lastErr = err;
      const errMsg = err?.response?.data?.message ?? err?.message ?? "unknown";
      console.error(`[WA] send attempt ${attempt}/3 to ${number} failed: ${errMsg}`);
      if (attempt < 3) await sleep(attempt * 5000);
    }
  }
  throw lastErr;
}

function queueWhatsAppSend(number, text) {
  const run = evolutionSendQueue.then(async () => {
    const jitter = Math.floor(Math.random() * 1500);
    return sendWhatsAppNow(number, text).finally(async () => {
      await sleep(Math.max(1000, EVOLUTION_SEND_DELAY_MS + jitter));
    });
  });
  evolutionSendQueue = run.catch(() => {});
  return run;
}

async function getSettingsValue(key, fallback = null) {
  try {
    const r = await pool.query("SELECT value FROM settings WHERE key = $1 LIMIT 1", [key]);
    if (!r.rows.length || r.rows[0].value == null) return fallback;
    return r.rows[0].value;
  } catch (_) {
    return fallback;
  }
}

function renderTemplateVars(template, vars = {}) {
  if (typeof template !== "string" || !template.trim()) return "";
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null ? "" : String(value);
  });
}

async function sendConfiguredWhatsAppTemplate({ templateKey, phone, vars = {}, fallbackMessage = "" }) {
  if (!phone) return { sent: false, reason: "no_phone" };
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  if (notificationSettings?.whatsapp_reminders === false) {
    return { sent: false, reason: "whatsapp_disabled" };
  }
  const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
  // Permite desactivar un template puntual desde el admin (no se envía ese aviso).
  if (templates?.[templateKey]?.enabled === false) {
    return { sent: false, reason: "template_disabled" };
  }
  const templateBody = templates?.[templateKey]?.body || "";
  const rendered = renderTemplateVars(templateBody, vars).trim();
  const text = rendered || String(fallbackMessage || "").trim();
  if (!text) return { sent: false, reason: "empty_message" };
  await queueWhatsAppSend(normalisePhone(phone), text);
  return { sent: true };
}

// Notifica por WhatsApp a la dueña/admins de un evento. Respeta el flag
// whatsapp_reminders global y el flag enabled del template puntual.
//
// Destinos (en orden de prioridad):
//   1) notification_settings.admin_phones (lista configurable).
//   2) Fallback: users con role IN ('admin','super_admin'), phone no nulo,
//      is_active=true — para no quedarse mudo si nunca se configuró la lista.
async function notifyAdminsByTemplate(templateKey, vars = {}, fallbackMessage = "") {
  try {
    const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    if (notificationSettings?.whatsapp_reminders === false) return;
    const templates = await getSettingsValue("notification_templates", DEFAULT_NOTIFICATION_TEMPLATES);
    if (templates?.[templateKey]?.enabled === false) return;

    let phones = Array.isArray(notificationSettings?.admin_phones)
      ? notificationSettings.admin_phones.filter((p) => typeof p === "string" && p.trim())
      : [];

    if (phones.length === 0) {
      const admins = await pool.query(
        `SELECT phone FROM users
          WHERE role IN ('admin','super_admin')
            AND phone IS NOT NULL AND phone <> ''
            AND is_active = true`
      );
      phones = admins.rows.map((u) => u.phone);
    }

    // Dedupe por número normalizado para no spamear si el mismo teléfono está
    // en la lista Y como user admin.
    const seen = new Set();
    const unique = phones.filter((p) => {
      const key = normalisePhone(p);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    await Promise.all(unique.map((phone) =>
      sendConfiguredWhatsAppTemplate({
        templateKey,
        phone,
        vars,
        fallbackMessage,
      }).catch((e) => console.warn(`[admin WA ${templateKey}]`, e?.message))
    ));
  } catch (err) {
    console.warn(`[notifyAdminsByTemplate ${templateKey}]`, err?.message);
  }
}

async function areEmailNotificationsEnabled() {
  const notificationSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
  return notificationSettings?.email_reminders !== false;
}

// Webhook (no auth, Evolution lo llama directo). Procesa eventos:
//   - MESSAGES_UPSERT: mensaje entrante (alumna respondió a WA). Logueamos.
//   - MESSAGES_UPDATE: receipt de delivery/read. Actualiza campaign_logs.
//   - CONNECTION_UPDATE: cambio de estado WA (open/close).
// Idempotente — siempre responde 200 (Evolution no debería reintentar).
app.post("/api/webhook/evolution", async (req, res) => {
  try {
    const body = req.body || {};
    const event = String(body.event || body.eventName || "").toUpperCase();
    const data = body.data || {};

    if (event === "MESSAGES_UPDATE" || event === "messages.update".toUpperCase()) {
      // Evolution envía { key: { remoteJid, id }, status: 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED' }
      // O en algunos schemas: { messageId, status, ... }
      const updates = Array.isArray(data) ? data : (data.update ? [data.update] : [data]);
      for (const u of updates) {
        const remoteJid = u.key?.remoteJid || u.remoteJid || u.recipient;
        const status = String(u.status || u.update?.status || "").toUpperCase();
        if (!remoteJid) continue;
        const phone = String(remoteJid).split("@")[0].replace(/\D/g, "");
        if (!phone) continue;

        // Map Evolution status → nuestro tracking
        // PENDING / SERVER_ACK = mandado pero no entregado todavía
        // DELIVERY_ACK = entregado al device
        // READ = leído por el usuario
        // PLAYED = audio escuchado (no aplica para text)
        let newStatus = null;
        if (status === "READ") newStatus = "read";
        else if (status === "DELIVERY_ACK" || status === "DELIVERED") newStatus = "delivered";
        if (!newStatus) continue;

        // Match al campaign_log más reciente para ese teléfono dentro de últimas 24h
        try {
          await pool.query(
            `UPDATE campaign_logs SET
                status = CASE
                  WHEN status = 'sent' AND $2 IN ('delivered','read') THEN $2
                  WHEN status = 'delivered' AND $2 = 'read' THEN 'read'
                  ELSE status
                END
              WHERE id IN (
                SELECT id FROM campaign_logs
                 WHERE phone LIKE '%' || $1
                   AND status IN ('sent','delivered')
                   AND sent_at >= NOW() - INTERVAL '24 hours'
                 ORDER BY sent_at DESC
                 LIMIT 1
              )`,
            [phone, newStatus],
          );
        } catch (_) { /* silent */ }
      }
    }

    if (event === "MESSAGES_UPSERT" || event === "messages.upsert".toUpperCase()) {
      // Mensaje entrante (alumna respondió). Por ahora solo logueamos.
      // Futuro: podríamos parsear como "reply" a campaign y marcar engagement.
      const msgs = Array.isArray(data) ? data : (data.messages ? data.messages : [data]);
      for (const m of msgs) {
        // Skip mensajes que el server envió (fromMe = true)
        if (m.key?.fromMe || m.fromMe) continue;
        const remoteJid = m.key?.remoteJid || m.remoteJid;
        const text = m.message?.conversation || m.message?.extendedTextMessage?.text || "";
        if (remoteJid && text) {
          console.log("[EVOLUTION INCOMING]", remoteJid, ":", text.slice(0, 100));
          // TODO future: registrar en una tabla wa_inbound_messages para inbox admin
        }
      }
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error("[EVOLUTION WEBHOOK ERROR]", err.message);
    return res.sendStatus(200);
  }
});

// Sonda cruda del canal de Evolution/WhatsApp: sin caché, golpea la API de
// Evolution en cada llamada. `whatsappChannelState()` (justo abajo) la envuelve
// con caché corta y timeout para no intentar envíos con el canal caído y para
// poder avisarlo en el panel (auditoría 2026-09-27, P0-1).
async function probeEvolution() {
  if (!EVOLUTION_API_URL) {
    return { connected: false, state: "disconnected", instanceExists: false };
  }
  // Check if instance exists first
  let instanceExists = false;
  try {
    const listRes = await evolutionApi.get("/instance/fetchInstances");
    const instances = listRes.data?.data || listRes.data || [];
    instanceExists = Array.isArray(instances)
      ? instances.some((i) =>
        i.instance?.instanceName === EVOLUTION_INSTANCE ||
        i.instanceName === EVOLUTION_INSTANCE ||
        i.name === EVOLUTION_INSTANCE
      )
      : false;
  } catch (_) { instanceExists = false; }

  if (!instanceExists) {
    return { connected: false, state: "disconnected", instanceExists: false };
  }

  const r = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
  const state = r.data?.instance?.state || r.data?.state || "unknown";

  let qrCode = null;
  if (state === "connecting" || state === "qr") {
    try {
      const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
      qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
    } catch (_) { }
  }

  return {
    connected: state === "open",
    state: state === "open" ? "connected" : state === "qr" || state === "connecting" ? "qr_pending" : "disconnected",
    number: r.data?.instance?.profileName || null,
    instanceExists: true,
    qrCode,
  };
}

// Estado cacheado (60 s) del canal, usado por el flujo de cancelar clase y por
// el cron de recordatorios para no intentar envíos con Evolution caído.
const whatsappChannelState = createChannelState({ probe: probeEvolution });

// GET /api/evolution/status
app.get("/api/evolution/status", adminMiddleware, async (req, res) => {
  try {
    return res.json({ data: await probeEvolution() });
  } catch (err) {
    console.error("[EVOLUTION STATUS]", err.response?.data || err.message);
    return res.json({ data: { connected: false, state: "disconnected", instanceExists: false } });
  }
});

// Helper: configura el webhook de Evolution apuntando a nuestro server.
// Idempotente — se puede llamar las veces que quieras. Evolution v2 espera
// POST /webhook/set/:instance con body { webhook: { url, events, enabled } }.
async function configureEvolutionWebhook() {
  const webhookUrl = (process.env.SITE_URL || "https://www.almamovement.com.mx").replace(/\/$/, "") + "/api/webhook/evolution";
  try {
    await evolutionApi.post(`/webhook/set/${EVOLUTION_INSTANCE}`, {
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          "MESSAGES_UPSERT",       // mensaje entrante (alumna responde)
          "MESSAGES_UPDATE",       // delivery / read receipts
          "CONNECTION_UPDATE",     // wa conectado/desconectado
          "QRCODE_UPDATED",
        ],
      },
    });
    console.log("[Evolution] Webhook configurado:", webhookUrl);
    return { ok: true, url: webhookUrl };
  } catch (err) {
    // Algunas versiones aceptan el body sin 'webhook:' wrapper
    try {
      await evolutionApi.post(`/webhook/set/${EVOLUTION_INSTANCE}`, {
        url: webhookUrl,
        enabled: true,
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
      });
      console.log("[Evolution] Webhook configurado (formato v1):", webhookUrl);
      return { ok: true, url: webhookUrl };
    } catch (err2) {
      console.warn("[Evolution] No se pudo configurar webhook:", err2.response?.data || err2.message);
      return { ok: false, error: err2.response?.data || err2.message };
    }
  }
}

// POST /api/evolution/connect — create instance (or fetch QR if already exists)
app.post("/api/evolution/connect", adminMiddleware, async (req, res) => {
  try {
    const isAlreadyInUseError = (status, rawMessage) =>
      status === 409 || status === 403 || /already in use|in use|ya existe/i.test(rawMessage || "");

    // Try creating the instance
    let createData = null;
    let createErrStatus = null;
    let createErrMessage = "";
    let createAlreadyInUse = false;
    try {
      const createRes = await evolutionApi.post("/instance/create", {
        instanceName: EVOLUTION_INSTANCE,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
      });
      createData = createRes.data;
      // Configura webhook automáticamente tras crear (no bloquea si falla)
      configureEvolutionWebhook().catch(() => {});
    } catch (createErr) {
      createErrStatus = createErr.response?.status ?? null;
      createErrMessage = JSON.stringify(createErr.response?.data || createErr.message || "");
      createAlreadyInUse = isAlreadyInUseError(createErrStatus, createErrMessage);
      // "already in use" is an expected case when the instance already exists.
      if (!createAlreadyInUse) {
        console.error("[EVOLUTION CREATE]", createErr.response?.data || createErr.message);
      } else {
        console.log("[EVOLUTION CREATE] Instance already exists, proceeding to connect:", EVOLUTION_INSTANCE);
      }
    }

    // Extract QR from create response (Evolution v2 returns it inline)
    let qrCode =
      normalizeQrDataUrl(pickEvolutionQrPayload(createData));

    // If not in create response, try the connect endpoint
    if (!qrCode) {
      try {
        const qrRes = await evolutionApi.get(`/instance/connect/${EVOLUTION_INSTANCE}`);
        console.log("[EVOLUTION QR RESPONSE]", JSON.stringify(qrRes.data).slice(0, 300));
        qrCode = normalizeQrDataUrl(pickEvolutionQrPayload(qrRes.data));
      } catch (qrErr) {
        console.error("[EVOLUTION QR FETCH]", qrErr.response?.data || qrErr.message);
      }
    }

    if (!qrCode) {
      // If there is no QR, check if the instance is already linked/open.
      try {
        const stateResp = await evolutionApi.get(`/instance/connectionState/${EVOLUTION_INSTANCE}`);
        const currentState = stateResp.data?.instance?.state || stateResp.data?.state || "unknown";
        if (currentState === "open") {
          return res.json({
            data: {
              state: "connected",
              connected: true,
              message: "WhatsApp ya está conectado en esta instancia",
            },
          });
        }
      } catch (_) {
        // ignore and continue with error mapping below
      }

      if (createAlreadyInUse) {
        return res.status(409).json({
          message: `No se pudo obtener QR para la instancia "${EVOLUTION_INSTANCE}". Ese nombre ya está en uso. Cambia EVOLUTION_INSTANCE_NAME en Railway por un nombre único (ej. hive-pilates-2026).`,
        });
      }
      return res.status(502).json({ message: "Evolution respondió sin QR. Intenta nuevamente en unos segundos." });
    }

    // Asegura webhook configurado (idempotente)
    configureEvolutionWebhook().catch(() => {});

    return res.json({ data: { qrCode, state: "qr_pending", message: "Escanea el código QR con WhatsApp" } });
  } catch (err) {
    console.error("[EVOLUTION CONNECT]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al conectar con Evolution API" });
  }
});

// POST /api/evolution/configure-webhook — forzar reconfiguración del webhook
app.post("/api/evolution/configure-webhook", adminMiddleware, async (req, res) => {
  const result = await configureEvolutionWebhook();
  return res.status(result.ok ? 200 : 502).json(result);
});

// POST /api/evolution/disconnect
app.post("/api/evolution/disconnect", adminMiddleware, async (req, res) => {
  try {
    await evolutionApi.delete(`/instance/logout/${EVOLUTION_INSTANCE}`);
    return res.json({ data: { message: "WhatsApp desconectado correctamente" } });
  } catch (err) {
    // If instance not found it's already disconnected
    if (err.response?.status === 404) {
      return res.json({ data: { message: "Ya estaba desconectado" } });
    }
    console.error("[EVOLUTION DISCONNECT]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al desconectar WhatsApp" });
  }
});

// POST /api/evolution/send-test  { phone: "5219XXXXXXXXX" }
app.post("/api/evolution/send-test", adminMiddleware, async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ message: "Se requiere número de teléfono" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(
      number,
      "✅ Mensaje de prueba desde HIVE Pilates Studio. ¡WhatsApp conectado correctamente!",
    );
    return res.json({ data: { message: "Mensaje de prueba enviado correctamente" } });
  } catch (err) {
    console.error("[EVOLUTION SEND-TEST]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje de prueba" });
  }
});

// POST /api/evolution/send-message  { phone, message }
app.post("/api/evolution/send-message", adminMiddleware, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) return res.status(400).json({ message: "Se requieren teléfono y mensaje" });
    const number = normalisePhone(phone);
    await queueWhatsAppSend(number, message);
    return res.json({ data: { message: "Mensaje enviado", number } });
  } catch (err) {
    console.error("[EVOLUTION SEND-MSG]", err.response?.data || err.message);
    return res.status(500).json({ message: "Error al enviar mensaje" });
  }
});

// POST /api/evolution/notify-clients — disabled for safety
app.post("/api/evolution/notify-clients", adminMiddleware, async (req, res) => {
  return res.status(410).json({
    message: "Los envíos masivos por WhatsApp fueron deshabilitados por seguridad.",
  });
});

// ─── Direct-to-Drive Upload (server proxies upload to avoid CORS) ───────────

// POST /api/drive/init-upload — creates a Google Drive resumable session, returns sessionId
app.post("/api/drive/init-upload", adminMiddleware, async (req, res) => {
  try {
    const { fileName, mimeType, fileSize } = req.body;
    if (!fileName || !mimeType) {
      return res.status(400).json({ message: "fileName y mimeType son requeridos" });
    }

    const isDriveConfigured = Boolean(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REFRESH_TOKEN
    );
    if (!isDriveConfigured) {
      return res.status(503).json({ message: "Google Drive no configurado" });
    }

    const accessToken = await getGoogleDriveAccessToken();
    const folderId = getDriveFolderId();
    const rawFolder = String(process.env.GOOGLE_DRIVE_FOLDER_ID || "");
    if (rawFolder && rawFolder !== folderId) {
      console.warn(`[drive] GOOGLE_DRIVE_FOLDER_ID tenía sufijo (${JSON.stringify(rawFolder)}); saneado a ${JSON.stringify(folderId)}`);
    }
    const metadata = { name: fileName, ...(folderId ? { parents: [folderId] } : {}) };

    // Initiate a resumable upload session on Google Drive
    const initResp = await axios.post(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
      metadata,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": mimeType,
          ...(fileSize ? { "X-Upload-Content-Length": String(fileSize) } : {}),
        },
      }
    );

    const uploadUrl = initResp.headers.location;
    if (!uploadUrl) {
      return res.status(500).json({ message: "No se obtuvo URL de subida de Google Drive" });
    }

    // Store session in memory (short-lived) for the chunk upload endpoint
    const sessionId = crypto.randomBytes(16).toString("hex");
    driveUploadSessions.set(sessionId, { uploadUrl, accessToken, mimeType, fileSize: Number(fileSize) || 0, createdAt: Date.now() });
    // Clean up old sessions after 6 hours. Long enough for an 8 GB upload on a
    // slow connection (45-90 min typical, with room for retries/pauses). The
    // chunk PUT goes to Drive's resumable uploadUrl which is pre-authorized, so
    // the stored OAuth accessToken going stale (~1h) does not break late chunks.
    setTimeout(() => driveUploadSessions.delete(sessionId), 6 * 60 * 60 * 1000);

    return res.json({ data: { sessionId } });
  } catch (err) {
    console.error("Drive init-upload error:", err?.response?.data || err.message);
    const driveMsg = err?.response?.data?.error?.message || "";
    // Caso muy común: la env var apunta a una carpeta inexistente o sin acceso
    // por la cuenta autorizada. Damos un mensaje accionable, no el crudo de Drive.
    if (/file not found/i.test(driveMsg)) {
      return res.status(500).json({
        message:
          "La carpeta de almacenamiento configurada no existe o no es accesible. " +
          "Verifica la variable GOOGLE_DRIVE_FOLDER_ID en Railway: debe ser solo el ID (sin ?hl=es ni /edit) " +
          "y la carpeta debe estar compartida con la cuenta autorizada.",
      });
    }
    return res.status(500).json({ message: "Error al iniciar subida: " + (driveMsg || err.message) });
  }
});

// In-memory map to store active Drive upload sessions
const driveUploadSessions = new Map();

// PUT /api/drive/upload-chunk/:sessionId — proxy a chunk from browser to Google Drive
// The browser sends chunks of ~5MB via this endpoint; the server forwards them to Drive.
// This avoids CORS issues (browser → our server → googleapis.com)
app.put("/api/drive/upload-chunk/:sessionId", adminMiddleware, async (req, res) => {
  const session = driveUploadSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Sesión de upload no encontrada o expirada" });

  const contentRange = req.headers["content-range"] || "";
  const contentLength = req.headers["content-length"] || "";
  const contentType = req.headers["content-type"] || session.mimeType;

  try {
    // Collect the chunk from the browser request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    // Forward to Google Drive
    const driveResp = await axios.put(session.uploadUrl, body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        ...(contentRange ? { "Content-Range": contentRange } : {}),
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: (s) => s === 200 || s === 201 || s === 308,
    });

    if (driveResp.status === 200 || driveResp.status === 201) {
      // Upload complete — return the file data
      driveUploadSessions.delete(req.params.sessionId);
      return res.json({ done: true, data: driveResp.data });
    }

    // 308 Resume Incomplete — return range info so browser knows where to continue
    const range = driveResp.headers.range || "";
    return res.json({ done: false, range });
  } catch (err) {
    console.error("Drive upload-chunk error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error al subir chunk: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// GET /api/drive/upload-chunk/:sessionId/status — pregunta a Drive cuántos
// bytes ya recibió de la sesión. Lo usa el cliente al reanudar tras un error
// transitorio para no reenviar bytes ya almacenados (PUT con Content-Length: 0
// y Content-Range: bytes *​/{total} → 308 con Range: bytes=0-N, o 200/201 si
// la subida estaba completa).
app.get("/api/drive/upload-chunk/:sessionId/status", adminMiddleware, async (req, res) => {
  const session = driveUploadSessions.get(req.params.sessionId);
  if (!session) return res.status(404).json({ message: "Sesión de upload no encontrada o expirada" });
  try {
    const driveResp = await axios.put(session.uploadUrl, "", {
      headers: {
        "Content-Length": "0",
        "Content-Range": `bytes */${session.fileSize ?? "*"}`,
      },
      validateStatus: (s) => s === 200 || s === 201 || s === 308,
    });
    if (driveResp.status === 200 || driveResp.status === 201) {
      driveUploadSessions.delete(req.params.sessionId);
      return res.json({ done: true, data: driveResp.data });
    }
    const range = driveResp.headers.range || "";
    let nextOffset = 0;
    if (range) {
      const m = range.match(/bytes=\d+-(\d+)/);
      if (m) nextOffset = parseInt(m[1], 10) + 1;
    }
    return res.json({ done: false, range, nextOffset });
  } catch (err) {
    console.error("Drive upload-chunk status error:", err?.response?.data || err.message);
    return res.status(500).json({ message: "Error consultando estado: " + (err?.response?.data?.error?.message || err.message) });
  }
});

// POST /api/drive/make-public/:fileId — make a Drive file publicly readable
app.post("/api/drive/make-public/:fileId", adminMiddleware, async (req, res) => {
  try {
    const accessToken = await getGoogleDriveAccessToken();
    await makeGoogleDriveFilePublic(req.params.fileId, accessToken);
    return res.json({ ok: true });
  } catch (err) {
    console.error("Drive make-public error:", err?.response?.data || err.message);
    return res.status(driveErrorStatus(err)).json({ message: "No se pudo publicar el archivo" });
  }
});

// GET /api/drive/image/:fileId — proxy a public Google Drive image
// Un proxy a Google Drive no debe devolver 500 por algo que decidio Drive:
// si no hay credenciales es 503, y un archivo inexistente o un id invalido es
// 404/400. Auditoria 2026-09-08, familia P2 (regla "el panel no da 500").
function driveErrorStatus(err) {
  const upstream = Number(err?.response?.status) || 0;
  if (upstream === 404) return 404;
  if (upstream === 401 || upstream === 403) return 503;
  if (upstream >= 400 && upstream < 500) return 400;
  if (/credential|token|no configurad|not configured/i.test(String(err?.message || ""))) return 503;
  return 502;
}

app.get("/api/drive/image/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();
    const accessToken = await getGoogleDriveAccessToken();
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, name } = metaResp.data;
    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` }, responseType: "stream" }
    );
    res.set({
      "Content-Type": mimeType || "image/jpeg",
      "Cache-Control": "public, max-age=604800",
      "Content-Disposition": `inline; filename="${name || "image.jpg"}"`,
    });
    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive image proxy error:", err?.response?.data || err.message);
    if (!res.headersSent) res.status(driveErrorStatus(err)).json({ message: "No se pudo obtener la imagen" });
  }
});

// GET /api/drive/video/:fileId — proxy de video con soporte de Range (seeking)
app.get("/api/drive/video/:fileId", async (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId || fileId.length < 10) return res.status(400).end();
    const accessToken = await getGoogleDriveAccessToken();
    const metaResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,name,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const { mimeType, name, size } = metaResp.data;
    const range = req.headers.range;
    const driveHeaders = { Authorization: `Bearer ${accessToken}` };
    if (range) driveHeaders.Range = range;
    const driveResp = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      { headers: driveHeaders, responseType: "stream", validateStatus: (s) => s === 200 || s === 206 }
    );
    const baseHeaders = {
      "Content-Type": mimeType || "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=604800",
      "Content-Disposition": `inline; filename="${name || "video.mp4"}"`,
    };
    if (driveResp.status === 206) {
      // Drive devolvió contenido parcial: respondemos 206 SIEMPRE (aunque por
      // alguna razón falte Content-Range), reenviando los headers de rango que
      // sí vengan. Caer a 200 con Content-Length completo truncaría el stream.
      const extra = {};
      if (driveResp.headers["content-range"]) extra["Content-Range"] = driveResp.headers["content-range"];
      if (driveResp.headers["content-length"]) extra["Content-Length"] = driveResp.headers["content-length"];
      res.status(206).set({ ...baseHeaders, ...extra });
    } else {
      res.status(200).set({ ...baseHeaders, ...(size ? { "Content-Length": size } : {}) });
    }
    driveResp.data.pipe(res);
  } catch (err) {
    console.error("Drive video proxy error:", err?.response?.status || err?.message);
    if (!res.headersSent) res.status(driveErrorStatus(err)).json({ message: "No se pudo obtener el video" });
  }
});

// GET /api/admin/stats
// GET /api/admin/birthdays?month=N (1-12, default current month)
// Returns clients with date_of_birth in the requested month, sorted by day.
app.get("/api/admin/birthdays", adminMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const monthRaw = Number(req.query.month);
    const month = Number.isInteger(monthRaw) && monthRaw >= 1 && monthRaw <= 12
      ? monthRaw
      : now.getMonth() + 1;
    const result = await pool.query(
      `SELECT id, display_name, email, phone, photo_url, date_of_birth,
              EXTRACT(DAY FROM date_of_birth)::int   AS day,
              EXTRACT(MONTH FROM date_of_birth)::int AS month
       FROM users
       WHERE role = 'client'
         AND date_of_birth IS NOT NULL
         AND EXTRACT(MONTH FROM date_of_birth) = $1
       ORDER BY EXTRACT(DAY FROM date_of_birth) ASC, display_name ASC`,
      [month]
    );
    const today = { day: now.getDate(), month: now.getMonth() + 1 };
    const data = result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      email: row.email,
      phone: row.phone,
      photoUrl: row.photo_url,
      dateOfBirth: row.date_of_birth,
      day: row.day,
      month: row.month,
      isToday: row.month === today.month && row.day === today.day,
    }));
    return res.json({
      month,
      total: data.length,
      todayCount: data.filter((u) => u.isToday).length,
      data,
    });
  } catch (err) {
    console.error("admin/birthdays error:", err.message);
    return res.status(500).json({ message: "Error obteniendo cumpleaños" });
  }
});

app.get("/api/admin/stats", adminMiddleware, async (req, res) => {
  try {
    const today = todayInStudio();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

    const [classesToday, activeMembers, monthlyRevenue, pendingAlerts] = await Promise.all([
      pool.query("SELECT COUNT(*) FROM classes WHERE date = $1", [today]),
      pool.query(`SELECT COUNT(*) FROM memberships WHERE status = 'active' AND (end_date IS NULL OR end_date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date)`),
      // Neto: ventas del mes − reembolsos del mes (auditoría 2026-09-27, P1-12).
      pool.query(
        `SELECT (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'approved' AND created_at >= $1)
              - (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE created_at >= $1) AS total`,
        [monthStart],
      ),
      pool.query("SELECT COUNT(*) FROM orders WHERE status = 'pending_verification'"),
    ]);

    // Recepción e instructoras necesitan los contadores operativos (clases de
    // hoy, membresías activas, órdenes por verificar); el ingreso del mes es
    // sólo de la dueña. Cerrar la ruta entera les dejaba ceros presentados como
    // hechos. Revisión de código 2026-09-08, R4.
    const puedeVerDinero = OWNER_ROLES.includes(req.userRole);
    return res.json({
      classesToday: parseInt(classesToday.rows[0].count),
      activeMembers: parseInt(activeMembers.rows[0].count),
      monthlyRevenue: puedeVerDinero ? parseFloat(monthlyRevenue.rows[0].total) : null,
      pendingAlerts: parseInt(pendingAlerts.rows[0].count),
    });
  } catch (err) {
    console.error("admin/stats error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/users?role=&search=
app.get("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { role, search = "" } = req.query;
    let q = `SELECT id, display_name, email, phone, role, created_at FROM users WHERE anonymized_at IS NULL`;
    const params = [];
    if (role) { params.push(role); q += ` AND role = $${params.length}`; }
    const searchValue = String(search ?? "").trim();
    if (searchValue) {
      params.push(`%${searchValue}%`);
      const textIdx = params.length;
      const digitSearch = searchValue.replace(/\D/g, "");
      let phoneClause = "";
      if (digitSearch) {
        params.push(`%${digitSearch}%`);
        phoneClause = ` OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE $${params.length}`;
      }
      q += ` AND (display_name ILIKE $${textIdx} OR email ILIKE $${textIdx}${phoneClause})`;
    }
    q += " ORDER BY display_name ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    console.error("GET /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/users — admin creates a client
app.post("/api/users", adminMiddleware, async (req, res) => {
  try {
    const { email, displayName, phone, role = "client", dateOfBirth, emergencyContactName, emergencyContactPhone, healthNotes } = req.body;
    if (!email || !displayName) return res.status(400).json({ message: "Email y nombre requeridos" });
    const exists = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows.length) return res.status(409).json({ message: "Email ya registrado" });
    const tempPassword = Math.random().toString(36).slice(2, 10);
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.default.hash(tempPassword, 10);
    const r = await pool.query(
      `INSERT INTO users (display_name, email, phone, role, password_hash, date_of_birth, emergency_contact_name, emergency_contact_phone, health_notes, accepts_terms)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING *`,
      [displayName, email, phone || null, role, hash, dateOfBirth || null, emergencyContactName || null, emergencyContactPhone || null, healthNotes || null]
    );
    return res.status(201).json({ user: mapUser(r.rows[0]), tempPassword });
  } catch (err) {
    console.error("POST /api/users error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// Columnas que existen en la base, por tabla (la baja sólo toca ésas).
async function existingColumns(db, tables) {
  const r = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tables],
  );
  const out = Object.fromEntries(tables.map((t) => [t, new Set()]));
  for (const row of r.rows) out[row.table_name]?.add(row.column_name);
  return out;
}

// DELETE /api/users/:id — dar de baja a una clienta SIN borrar su historial
// (auditoría 2026-09-27, P1-5 · A9 · EC15). Antes el DELETE se llevaba en cascada
// sus órdenes, pagos y reservas. Ahora se anonimiza: se quitan sus datos
// personales y de salud, se cierra su acceso y se conserva todo lo demás con el
// mismo id. Sólo la dueña: es irreversible.
app.delete("/api/users/:id", ownerMiddleware, async (req, res) => {
  // `id` no se valida aquí: app.param("id") (arriba, registro de rutas) ya
  // responde 400 "Identificador inválido" para cualquier valor que no sea un
  // UUID, antes de que este handler corra.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      "SELECT id, role::text AS role, is_active, anonymized_at, guest_profile_id FROM users WHERE id = $1 FOR UPDATE",
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clienta no encontrada" });
    }
    const target = cur.rows[0];
    // `target.id` es el id tal como Postgres lo normaliza (uuid canónico en
    // minúsculas), no el texto crudo de la URL: si llega en otra mayúscula o
    // minúscula, de aquí en adelante se usa el normalizado para que el correo
    // anónimo, el candado de caché (accountGate) y el serial de Apple Wallet
    // coincidan exactamente con lo que ya usa el resto del sistema (que siempre
    // trabaja con el id normalizado que devuelve la base).
    const id = target.id;
    if (id === req.userId) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No puedes eliminar tu propia cuenta." });
    }
    if (!["client", "guest"].includes(target.role)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Sólo se pueden dar de baja clientas desde aquí." });
    }
    if (target.anonymized_at) {
      await client.query("ROLLBACK");
      return res.json({ message: "La clienta ya estaba dada de baja.", data: { id, alreadyAnonymized: true } });
    }
    // No dar de baja con historial vivo: membresías activas o reservas próximas.
    const deps = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM memberships
            WHERE user_id = $1 AND status IN ('active','pending_activation','pending_payment')) AS memberships,
         (SELECT COUNT(*) FROM bookings b JOIN classes c ON b.class_id = c.id
            WHERE b.user_id = $1 AND b.status IN ('confirmed','checked_in')
              AND c.date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) AS upcoming`,
      [id],
    );
    const d = deps.rows[0] || {};
    if (Number(d.memberships) > 0 || Number(d.upcoming) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "No se puede eliminar: la clienta tiene membresías activas o reservas próximas. Cancélalas primero.",
      });
    }
    // La lista de espera no cuenta para el candado de "reservas próximas"
    // (no ocupa cupo ni consume crédito), pero si la clienta se va no debe
    // quedar esperando un lugar en una clase futura: se cancelan esos
    // lugares en la misma transacción. Sin devolver crédito: la lista de
    // espera no lo consume.
    const waitlistCancel = await client.query(
      `UPDATE bookings b SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2,
              cancellation_reason = 'Baja de la clienta'
         FROM classes c
        WHERE b.class_id = c.id AND b.user_id = $1 AND b.status = 'waitlist'
          AND c.date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date
       RETURNING b.id`,
      [id, req.userId],
    );
    const waitlistCancelled = waitlistCancel.rows.length;

    const kept = (await client.query(
      `SELECT (SELECT COUNT(*)::int FROM memberships WHERE user_id = $1) AS memberships,
              (SELECT COUNT(*)::int FROM orders WHERE user_id = $1) AS orders,
              (SELECT COUNT(*)::int FROM bookings WHERE user_id = $1) AS bookings,
              (SELECT COUNT(*)::int FROM event_registrations WHERE user_id = $1) AS "eventRegistrations"`,
      [id],
    )).rows[0];

    const cols = await existingColumns(client, ["users", "waivers", "guest_profiles", "event_registrations", "campaign_logs"]);
    const u = buildAnonymizeUpdate({
      table: "users", values: userAnonymizationValues(id, req.userId),
      nowColumns: ["anonymized_at", "updated_at"], existing: cols.users, id,
    });
    await client.query(u.sql, u.params);
    const w = buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: cols.waivers, idColumn: "user_id", id });
    if (w) await client.query(w.sql, w.params);
    if (target.guest_profile_id) {
      const g = buildAnonymizeUpdate({ table: "guest_profiles", values: GUEST_ANON_VALUES, nowColumns: ["updated_at"], existing: cols.guest_profiles, id: target.guest_profile_id });
      if (g) await client.query(g.sql, g.params);
    }
    // Inscripciones a eventos: se conserva la fila (el evento asistido queda
    // en el historial), pero el nombre, correo y teléfono con los que se
    // inscribió se anonimizan igual que en `users`.
    const er = buildAnonymizeUpdate({
      table: "event_registrations", values: eventRegistrationAnonValues(id),
      nowColumns: ["updated_at"], existing: cols.event_registrations, idColumn: "user_id", id,
    });
    if (er) await client.query(er.sql, er.params);
    // campaign_logs.phone: sólo si la tabla y sus columnas existen en esta base
    // (no está en schema_complete.sql, sólo la crea ensureSchema). Sin forma de
    // ligar una fila a la usuaria (sin user_id) no hay nada que anonimizar ahí.
    if (cols.campaign_logs.has("user_id") && cols.campaign_logs.has("phone")) {
      await client.query("UPDATE campaign_logs SET phone = NULL WHERE user_id = $1", [id]);
    }
    await client.query("UPDATE referral_codes SET is_active = false WHERE user_id = $1", [id]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
    const serial = buildAppleWalletSerialFromUserId(id);
    await client.query("DELETE FROM apple_wallet_devices WHERE serial_number = $1 OR serial_number LIKE $2", [serial, `${serial}_ev_%`]);
    await recordAudit(client, {
      actorId: req.userId, action: "user.anonymize", entityType: "user", entityId: id, subjectUserId: id,
      reason: req.body?.reason,
      before: { role: target.role, is_active: target.is_active !== false },
      after: { is_active: false, anonymized: true },
      meta: { kept, waitlist_cancelled: waitlistCancelled },
    });
    await client.query("COMMIT");
    accountGate.forget(id);
    return res.json({
      message: "Clienta dada de baja: se borraron sus datos personales y se conserva su historial.",
      data: { id, anonymized: true, kept },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// ─── Memberships admin CRUD ──────────────────────────────────────────────────

// GET /api/memberships — admin list all
app.get("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { status, userId, limit = 100 } = req.query;
    let q = `SELECT m.*, u.display_name AS user_name, p.name AS plan_name,
                    p.class_limit, p.duration_days, p.class_category
             FROM memberships m
             LEFT JOIN users u ON m.user_id = u.id
             LEFT JOIN plans p ON m.plan_id = p.id
             WHERE 1=1`;
    const params = [];
    if (status === "expiring") {
      // "expiring" (por vencer) es un estado calculado, no un valor del enum:
      // membresías activas que vencen dentro de los próximos 7 días.
      q += ` AND m.status = 'active'
             AND m.end_date IS NOT NULL
             AND m.end_date >= ((NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date)
             AND m.end_date <= ((NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date + INTERVAL '7 days')`;
    } else if (status === "active") {
      // Filtro "activas": una membresía vencida (end_date pasado) sigue con
      // status='active' hasta el barrido de cron, pero no debe listarse aquí
      // como si estuviera vigente.
      q += ` AND m.status = 'active'
             AND (m.end_date IS NULL OR m.end_date >= ((NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date))`;
    } else if (status) {
      params.push(status); q += ` AND m.status = $${params.length}`;
    }
    // Filtro por user_id — la ficha del cliente (ClientDetail) llama a este
    // endpoint con ?userId=<uuid>; sin este filtro el admin veía las 100
    // membresías más recientes globales en cada ficha individual.
    if (userId) { params.push(userId); q += ` AND m.user_id = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    const policy = await getBookingPolicy();
    return res.json({
      data: r.rows.map(m => ({
        id: m.id,
        userId: m.user_id,
        userName: m.user_name ?? m.user_id,
        planId: m.plan_id,
        planName: m.plan_name ?? m.plan_id,
        classCategory: m.class_category ?? "all",
        status: m.status,
        paymentMethod: m.payment_method,
        startDate: m.start_date,
        endDate: m.end_date,
        classesRemaining: m.classes_remaining,
        studioRemaining: m.studio_remaining,
        rtRemaining: m.rt_remaining,
        classLimit: m.class_limit,
        cancellationsUsed: Number(m.cancellations_used ?? 0),
        cancellationLimit: policy.cancellationLimit,
        durationDays: m.duration_days ?? null,
        createdAt: m.created_at,
      }))
    });
  } catch (err) {
    console.error("GET /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/memberships — venta en mostrador: activa la membresía y su orden
// aprobada en una transacción. Guarda quién vendió (activated_by), la
// referencia del pago y, si lo cobrado es $0 o distinto al plan, el motivo
// obligatorio; todo en la bitácora (auditoría 2026-09-27, P0-3 · E2).
app.post("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { userId, planId, startDate } = req.body || {};
    if (!userId || !planId) return res.status(400).json({ message: "userId y planId requeridos" });
    if (!isUuid(userId) || !isUuid(planId)) return res.status(400).json({ message: "Identificador inválido" });
    const anonConflict = await anonymizedSaleConflict(userId);
    if (anonConflict) return res.status(409).json(anonConflict);
    // El método de pago se exige explícito: el default anterior ("efectivo") ni
    // siquiera era un valor del enum payment_method y reventaba con 500, además
    // de registrar como efectivo lo que quizá fue transferencia.
    // Auditoría 2026-09-08, P0-3 / P2.
    const paymentMethod = String(req.body.paymentMethod || "").trim();
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        message: `Método de pago requerido. Opciones: ${PAYMENT_METHODS.join(", ")}.`,
      });
    }
    // "2026-02-30" no da NaN en `new Date()`: se corre silenciosamente a marzo,
    // y "2026-09-25 junk" también parsea a una fecha válida pero equivocada
    // (JS ignora la basura y cambia de mes). `saleStartDay` exige el día
    // AAAA-MM-DD exacto (o un ISO completo del que sólo recorta la hora) y
    // `start` se arma desde ese día ya validado, nunca desde el texto crudo.
    const startProblem = saleStartProblem(startDate);
    if (startProblem) return res.status(400).json({ message: startProblem });
    const start = startDate ? new Date(`${saleStartDay(startDate)}T00:00:00Z`) : new Date();
    const ref = cleanPaymentReference(req.body.paymentReference);
    if (!ref.ok) return res.status(400).json({ message: ref.message });

    const planRes = await pool.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (!planRes.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    const plan = planRes.rows[0];
    const _gen = await getSettingValueWithDefaults("general_settings");
    const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
    const sale = saleAmountPlan({ listPrice: _eff ?? 0, amount: req.body.amount, reason: req.body.reason });
    if (!sale.ok) return res.status(400).json({ ...(sale.code ? { code: sale.code } : {}), message: sale.message });
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId, plan });
    if (nonRepeatableConflict) {
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }
    const end = new Date(start);
    end.setDate(end.getDate() + (plan.duration_days || 30));

    // Membresía, orden, referencia y bitácora en la misma transacción: los
    // ingresos se calculan sobre `orders` (auditoría 2026-09-08, P0-3).
    const saleClient = await pool.connect();
    let r;
    try {
      await saleClient.query("BEGIN");
      r = await saleClient.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, activated_by, activated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,NOW())
         RETURNING *, to_char(start_date, 'YYYY-MM-DD') AS start_ymd, to_char(end_date, 'YYYY-MM-DD') AS end_ymd`,
        [userId, planId, paymentMethod, start.toISOString(), end.toISOString(), plan.class_limit ?? null, req.userId || null]
      );
      const orderRes = await saleClient.query(
        `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount,
                             channel, verified_at, verified_by, approved_at, approved_by, paid_at)
         VALUES ($1,$2,'approved',$3,$4,0,$5,$6,'counter',NOW(),$7,NOW(),$7,NOW())
         RETURNING id, order_number`,
        [userId, planId, paymentMethod, sale.subtotal, sale.amount, sale.discount, req.userId || null]
      );
      const order = orderRes.rows[0];
      const paymentReference = ref.value || order.order_number || order.id;
      await saleClient.query(`UPDATE memberships SET order_id = $2, payment_reference = $3 WHERE id = $1`,
        [r.rows[0].id, order.id, paymentReference]);
      r.rows[0].order_id = order.id;
      r.rows[0].payment_reference = paymentReference;
      await recordAudit(saleClient, {
        actorId: req.userId, action: "membership.sale", entityType: "membership", entityId: r.rows[0].id,
        subjectUserId: userId, reason: sale.courtesy || sale.priceDiffers ? req.body.reason : null,
        after: saleAuditAfter({
          plan, listPrice: sale.listPrice, amount: sale.amount, paymentMethod, paymentReference,
          orderId: order.id, startDate: r.rows[0].start_ymd, endDate: r.rows[0].end_ymd,
          classesRemaining: plan.class_limit ?? null,
        }),
        meta: { source: "mostrador", courtesy: sale.courtesy, price_differs: sale.priceDiffers },
      });
      await saleClient.query("COMMIT");
    } catch (saleErr) {
      await saleClient.query("ROLLBACK").catch(() => { });
      throw saleErr;
    } finally {
      saleClient.release();
    }

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: plan.name,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
            classLimit: plan.class_limit ?? null,
          }).catch((e) => console.error("[Email] membership activated:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            firstName: (u.display_name || "Alumna").split(" ")[0],
            plan: plan.name || "tu plan",
            startDate: start.toLocaleDateString("es-MX"),
            endDate: end.toLocaleDateString("es-MX"),
          },
          fallbackMessage: `Hola ${(u.display_name || "Alumna").split(" ")[0]}, tu membresía ${plan.name || ""} ya está activa. Vigencia: ${start.toLocaleDateString("es-MX")} al ${end.toLocaleDateString("es-MX")}.`,
        })
          .then((r) => { if (!r?.sent) console.warn("[WA] membership_activated SKIPPED:", r?.reason, "phone:", u.phone || "(vacío)"); })
          .catch((e) => console.error("[WA] membership activated:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] membership create query:", emailErr.message);
    }

    // ── Puntos por compra: sobre lo cobrado (una cortesía no da puntos) ──
    // La descripción se queda con `plan.price` (no `sale.amount`): así sigue
    // coincidiendo con la que arma /admin/loyalty/recalculate/:userId para no
    // duplicar puntos al recalcular; los PUNTOS sí se calculan sobre lo
    // cobrado.
    if (userId && sale.amount > 0) {
      try {
        const cfg = await getLoyaltyConfig();
        const pts = Math.floor(sale.amount * cfg.points_per_peso);
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [userId, pts, `Membresía asignada — ${plan.name} ($${plan.price})`]
          );
        }
      } catch (e) { /* loyalty error shouldn't fail membership creation */ }
    }

    triggerWalletPassSync(userId, "membership_created");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id/activate
// Acepta ?resend=true para forzar el reenvío de email/WA aun si la membresía
// ya estaba activa (útil si la dueña reporta que no llegó la notificación).
app.put("/api/memberships/:id/activate", adminMiddleware, async (req, res) => {
  const forceResend = req.query.resend === "true" || req.body?.resend === true;
  try {
    // Idempotente: solo activamos (y notificamos) si la membresía NO estaba ya activa.
    // Si ya estaba activa, devolvemos el row tal cual sin reenviar email/WA/wallet sync,
    // así doble-click del admin no spamea a la alumna. Excepción: ?resend=true.
    const r = await pool.query(
      `UPDATE memberships SET status = 'active', updated_at = NOW()
         WHERE id = $1 AND status <> 'active'
         RETURNING *, (SELECT name FROM plans WHERE id = memberships.plan_id) AS plan_name,
                      (SELECT class_limit FROM plans WHERE id = memberships.plan_id) AS plan_class_limit`,
      [req.params.id]
    );
    let mem;
    let alreadyActive = false;
    if (!r.rows.length) {
      const cur = await pool.query(
        `SELECT m.*, (SELECT name FROM plans WHERE id = m.plan_id) AS plan_name,
                     (SELECT class_limit FROM plans WHERE id = m.plan_id) AS plan_class_limit
           FROM memberships m WHERE m.id = $1`,
        [req.params.id]
      );
      if (!cur.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
      if (!forceResend) {
        // Ya estaba activa: respuesta idempotente (200 con el row, sin side effects).
        return res.json({ data: cur.rows[0], alreadyActive: true });
      }
      mem = cur.rows[0];
      alreadyActive = true;
    } else {
      mem = r.rows[0];
    }

    // ── Email: membership activated ──────────────────────────────────────
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [mem.user_id]);
      if (uRes.rows[0]) {
        const u = uRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendMembershipActivated({
            to: u.email,
            name: u.display_name || "Alumna",
            planName: mem.plan_name || mem.plan_name_override || "Tu membresía",
            startDate: mem.start_date,
            endDate: mem.end_date,
            classLimit: mem.plan_class_limit ?? mem.class_limit_override ?? null,
          }).catch((e) => console.error("[Email] membership activate:", e.message));
        }
        sendConfiguredWhatsAppTemplate({
          templateKey: "membership_activated",
          phone: u.phone,
          vars: {
            firstName: (u.display_name || "Alumna").split(" ")[0],
            plan: mem.plan_name || mem.plan_name_override || "tu plan",
            startDate: mem.start_date ? new Date(mem.start_date).toLocaleDateString("es-MX") : "",
            endDate: mem.end_date ? new Date(mem.end_date).toLocaleDateString("es-MX") : "",
          },
          fallbackMessage: `Hola ${(u.display_name || "Alumna").split(" ")[0]}, tu membresía ${mem.plan_name || mem.plan_name_override || ""} ya está activa.`,
        })
          .then((r) => { if (!r?.sent) console.warn("[WA] membership_activated (PUT activate) SKIPPED:", r?.reason, "phone:", u.phone || "(vacío)"); })
          .catch((e) => console.error("[WA] membership activate:", e.message));
      }
    } catch (emailErr) {
      console.error("[Email] activate query:", emailErr.message);
    }

    triggerWalletPassSync(mem.user_id, "membership_activated");
    return res.json({ data: mem, alreadyActive, resent: alreadyActive && forceResend });
  } catch (err) {
    console.error("PUT /memberships/:id/activate error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/memberships/:id/cancel
// Cancela la membresía y, en la misma transacción, cancela también las
// bookings FUTURAS confirmadas atadas a esa membresía (decrementando
// current_bookings de cada clase). NO se restauran créditos porque la
// membresía deja de existir. Idempotente: si ya estaba cancelada, devuelve
// el row sin tocar bookings ni notificar.
app.put("/api/memberships/:id/cancel", adminMiddleware, async (req, res) => {
  const { reason } = req.body || {};
  const cancellationReason = (reason && String(reason).trim()) || "Cancelada por admin";
  const client = await pool.connect();
  // Se suelta tras el COMMIT: la subida de la fila pide su propia conexión (P1-1).
  let released = false;
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `UPDATE memberships
          SET status = 'cancelled',
              cancellation_reason = $2,
              cancelled_at = NOW(),
              updated_at = NOW()
        WHERE id = $1 AND status <> 'cancelled'
        RETURNING *`,
      [req.params.id, cancellationReason]
    );

    if (!r.rows.length) {
      // O no existe, o ya estaba cancelada → respuesta idempotente.
      const cur = await client.query("SELECT * FROM memberships WHERE id = $1", [req.params.id]);
      await client.query("ROLLBACK");
      if (!cur.rows.length) return res.status(404).json({ message: "Membresía no encontrada" });
      return res.json({ data: cur.rows[0], alreadyCancelled: true });
    }
    const membership = r.rows[0];

    // Cancelar bookings FUTURAS confirmadas de esta membresía (no checked_in,
    // no no_show, no cancelled). Decrementar current_bookings de cada clase.
    const futureBookings = await client.query(
      `SELECT b.id, b.class_id, b.user_id
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
        WHERE b.membership_id = $1
          AND b.status = 'confirmed'
          AND (c.date > CURRENT_DATE
               OR (c.date = CURRENT_DATE AND c.start_time > CURRENT_TIME))`,
      [req.params.id]
    );

    let bookingsCancelled = 0;
    for (const b of futureBookings.rows) {
      await client.query(
        `UPDATE bookings SET status='cancelled', cancelled_at=NOW() WHERE id = $1`,
        [b.id]
      );
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
      bookingsCancelled++;
    }

    await client.query("COMMIT");
    client.release();
    released = true;

    // Side effects fuera de la transacción (fire-and-forget).
    triggerWalletPassSync(membership.user_id, "membership_cancelled");
    // Los lugares que dejan sus reservas futuras suben la fila (P1-1).
    const promoted = await onSeatReleased(futureBookings.rows.map((b) => b.class_id), { source: "membership_cancel" });

    return res.json({
      data: membership,
      bookings_cancelled: bookingsCancelled,
      reason: cancellationReason,
      waitlist_promoted: promoted,
    });
  } catch (err) {
    if (!released) await client.query("ROLLBACK").catch(() => {});
    console.error("PUT /memberships/:id/cancel error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    if (!released) client.release();
  }
});

// PUT /api/memberships/:id — ajuste de saldo, vigencia, estado o método.
// Cambiar saldo, vigencia o estado exige motivo; todo cambio queda en la
// bitácora con el antes y el después (auditoría 2026-09-27, P0-3 · D12 · I5).
// El panel manda todos los campos aunque no cambien: sólo cuenta lo que cambia
// de verdad (9999 e ilimitado son lo mismo).
app.put("/api/memberships/:id", adminMiddleware, async (req, res) => {
  const { status, classesRemaining, endDate, startDate, paymentMethod, reason, cancellationsUsed } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT m.id, m.user_id, m.status::text AS status, m.classes_remaining,
              COALESCE(m.cancellations_used, 0)::int AS cancellations_used,
              m.payment_method::text AS payment_method,
              to_char(m.start_date, 'YYYY-MM-DD') AS start_date, to_char(m.end_date, 'YYYY-MM-DD') AS end_date,
              p.duration_days, p.class_limit AS plan_class_limit, p.name AS plan_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
        WHERE m.id = $1
        FOR UPDATE OF m`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Membresía no encontrada" });
    }
    const before = cur.rows[0];
    const plan = planMembershipAdjust({ before, input: { status, classesRemaining, startDate, endDate, paymentMethod, cancellationsUsed } });
    if (!plan.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: plan.message });
    }
    if (!plan.changes.changed.length) {
      const same = await client.query("SELECT * FROM memberships WHERE id = $1", [req.params.id]);
      await client.query("ROLLBACK");
      return res.json({ data: same.rows[0], unchanged: true });
    }
    if (plan.needsReason) {
      const problem = reasonProblem(reason);
      if (problem) {
        await client.query("ROLLBACK");
        return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
      }
    }
    // Sólo se escriben los campos que de verdad cambiaron (`plan.changes`), no
    // todo `plan.next`: si el panel manda 9999 sobre una membresía ilimitada
    // (NULL) para otro campo (p. ej. sólo el estado), 9999 y NULL son el mismo
    // valor y no debe grabarse — si se grabara, quedaría un cambio real de
    // dato sin motivo ni bitácora.
    const n = plan.next;
    const changed = new Set(plan.changes.changed);
    const val = (key) => (changed.has(key) ? n[key] ?? null : null);
    const r = await client.query(
      `UPDATE memberships SET
         status = COALESCE($1, status),
         classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date),
         start_date = COALESCE($4, start_date),
         payment_method = COALESCE($5, payment_method),
         cancellations_used = COALESCE($6, cancellations_used),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [val("status"), val("classes_remaining"), val("end_date"), val("start_date"), val("payment_method"), val("cancellations_used"), req.params.id],
    );
    // Si cambió el total de una membresía mixta, re-reparte los buckets.
    if (plan.changes.changed.includes("classes_remaining")) await resyncMixtoBuckets(client, req.params.id);
    await recordAudit(client, {
      actorId: req.userId, action: "membership.adjust", entityType: "membership", entityId: req.params.id,
      subjectUserId: before.user_id, reason: cleanReason(reason),
      before: plan.changes.before, after: plan.changes.after,
      meta: { plan_name: before.plan_name ?? null, plan_class_limit: before.plan_class_limit ?? null, above_plan: plan.abovePlan },
    });
    await client.query("COMMIT");
    triggerWalletPassSync(r.rows[0].user_id, "membership_updated");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PUT /memberships/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// ─── Plans admin CRUD ────────────────────────────────────────────────────────

// GET /api/plans — public
// (Already exists above as GET /api/plans)

// POST /api/plans — admin (mirror of /api/admin/plans)
// PUT /api/plans/:id
app.put("/api/plans/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency, durationDays, classLimit, classCategory,
      features, isActive, sortOrder, isNonTransferable, isNonRepeatable, repeatKey,
      opening_price, morning_only,
    } = req.body;
    const validCats = ["studio", "reformer_tower", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : null;
    const openingPrice = opening_price === "" || opening_price == null ? null : Number(opening_price);
    const morningOnly = morning_only === undefined ? null : parseBooleanFlag(morning_only);
    // Un flag ausente del cuerpo se conserva (null → COALESCE), no se apaga:
    // parseBooleanFlag(undefined) devuelve false y borraba la configuración del
    // plan en cualquier PUT parcial. Auditoría 2026-09-08, P1-2.
    const flagOrNull = (...keys) =>
      keys.some((k) => Object.prototype.hasOwnProperty.call(req.body, k))
        ? parseBooleanFlag(keys.map((k) => req.body[k]).find((v) => v !== undefined))
        : null;
    const nonTransferable = flagOrNull("isNonTransferable", "is_non_transferable");
    const nonRepeatable = flagOrNull("isNonRepeatable", "is_non_repeatable");
    const safeRepeatKey = nonRepeatable === true
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    // features can be array or comma-string — always store as jsonb array
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const isVisitPack = flagOrNull("isVisitPack", "is_visit_pack");
    const r = await pool.query(
      // PUT parcial: lo que el cuerpo no menciona se conserva. Un cuerpo
      // incompleto llegaba a borrar el nombre y el precio del plan (o a
      // reventar con NOT NULL). Auditoría 2026-09-08, P1-2.
      // class_limit y description SI admiten NULL como valor real (NULL =
      // ilimitado, y el formulario manda classLimit:null para eso). Un COALESCE
      // hacia imposible volver ilimitado un plan. Se distingue "no vino en el
      // cuerpo" de "vino como null". Revision de codigo 2026-09-08, R2.
      `UPDATE plans SET name=COALESCE($1, name),
       description = CASE WHEN $18::boolean THEN $2 ELSE description END,
       price=COALESCE($3, price), currency=COALESCE($4, currency),
       duration_days=COALESCE($5, duration_days),
       class_limit = CASE WHEN $19::boolean THEN $6 ELSE class_limit END,
       features=COALESCE($7, features),
       is_active=COALESCE($8, is_active), sort_order=COALESCE($9, sort_order),
       class_category=COALESCE($10, class_category),
       is_non_transferable=COALESCE($11, is_non_transferable),
       is_non_repeatable=COALESCE($12, is_non_repeatable),
       repeat_key=CASE WHEN $12::boolean IS NULL THEN repeat_key ELSE $13 END,
       is_visit_pack=COALESCE($14, is_visit_pack),
       opening_price=COALESCE($15, opening_price), morning_only=COALESCE($16, morning_only),
       updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [
        name ?? null,
        description ?? null,
        price ?? null,
        currency || null,
        durationDays ?? null,
        classLimit ?? null,
        Object.prototype.hasOwnProperty.call(req.body, "features") ? JSON.stringify(featuresArr) : null,
        isActive === undefined ? null : isActive !== false,
        sortOrder ?? null,
        cat,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        isVisitPack,
        openingPrice,
        morningOnly,
        req.params.id,
        Object.prototype.hasOwnProperty.call(req.body, "description"),
        Object.prototype.hasOwnProperty.call(req.body, "classLimit")
          || Object.prototype.hasOwnProperty.call(req.body, "class_limit"),
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[PUT /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/plans/:id — un plan con historial (membresías, órdenes o códigos
// de descuento) se ARCHIVA: deja de venderse (is_active = false) y su historial
// se conserva. Sólo un plan sin nada ligado se borra. `?cascade=true` ya no
// borra nada: antes se llevaba membresías y órdenes (auditoría 2026-09-27,
// familia de P1-5). Todo queda en la bitácora.
app.delete("/api/plans/:id", adminMiddleware, async (req, res) => {
  const cascadeRequested = parseBooleanFlag(
    req.query?.cascade ?? req.query?.purgeRelated ?? req.body?.cascade ?? req.body?.purgeRelated
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT p.id, p.name, p.price, p.is_active,
              (SELECT COUNT(*)::int FROM memberships m WHERE m.plan_id = p.id) AS memberships,
              (SELECT COUNT(*)::int FROM orders o WHERE o.plan_id = p.id) AS orders,
              (SELECT COUNT(*)::int FROM discount_codes d WHERE d.plan_id = p.id) AS discount_codes
         FROM plans p
        WHERE p.id = $1
        FOR UPDATE OF p`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = cur.rows[0];
    const kept = { memberships: plan.memberships, orders: plan.orders, discount_codes: plan.discount_codes };
    const archivar = async (porque) => {
      await client.query(
        `UPDATE plans SET is_active = false, archived_at = COALESCE(archived_at, NOW()),
                archived_by = COALESCE(archived_by, $2), updated_at = NOW()
          WHERE id = $1`,
        [plan.id, req.userId],
      );
      await recordAudit(client, {
        actorId: req.userId, action: "plan.archive", entityType: "plan", entityId: plan.id,
        before: { for_sale: plan.is_active !== false }, after: { for_sale: false },
        meta: { plan_name: plan.name, kept, cascade_requested: cascadeRequested, why: porque },
      });
      await client.query("COMMIT");
      return res.json({
        message: "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.",
        data: { id: plan.id, archived: true, kept },
      });
    };
    if (plan.memberships + plan.orders + plan.discount_codes > 0) return await archivar("historial");

    // Sin nada ligado: se borra. Si otra tabla lo referencia, se archiva.
    await client.query("SAVEPOINT borrar_plan");
    try {
      await client.query("DELETE FROM plans WHERE id = $1", [plan.id]);
    } catch (err) {
      if (err?.code !== "23503") throw err;
      await client.query("ROLLBACK TO SAVEPOINT borrar_plan");
      return await archivar("referencias");
    }
    await recordAudit(client, {
      actorId: req.userId, action: "plan.delete", entityType: "plan", entityId: plan.id,
      before: { plan_name: plan.name, list_price: Number(plan.price), for_sale: plan.is_active !== false },
      meta: { plan_name: plan.name },
    });
    await client.query("COMMIT");
    return res.json({ message: "Plan eliminado", data: { id: plan.id, deleted: true } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[DELETE /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/plans
app.post("/api/plans", adminMiddleware, async (req, res) => {
  try {
    const {
      name, description, price, currency = "MXN", durationDays = 30, classLimit,
      classCategory, features, isActive = true, sortOrder = 0,
      isNonTransferable, isNonRepeatable, repeatKey,
      opening_price, morning_only,
    } = req.body;
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const validCats = ["studio", "reformer_tower", "mixto", "all"];
    const cat = validCats.includes(classCategory) ? classCategory : "all";
    const openingPrice = opening_price === "" || opening_price == null ? null : Number(opening_price);
    const morningOnly = parseBooleanFlag(morning_only);
    const nonTransferable = parseBooleanFlag(isNonTransferable ?? req.body.is_non_transferable);
    const nonRepeatable = parseBooleanFlag(isNonRepeatable ?? req.body.is_non_repeatable);
    const safeRepeatKey = nonRepeatable
      ? String(repeatKey ?? req.body.repeat_key ?? "").trim() || null
      : null;
    const featuresArr = Array.isArray(features)
      ? features
      : typeof features === "string" && features.trim()
        ? features.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    const isVisitPack = parseBooleanFlag(req.body.isVisitPack ?? req.body.is_visit_pack);
    const r = await pool.query(
      `INSERT INTO plans
        (name, description, price, currency, duration_days, class_limit, class_category, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key, is_visit_pack, opening_price, morning_only)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        name,
        description || null,
        price || 0,
        currency,
        durationDays,
        classLimit ?? null,
        cat,
        JSON.stringify(featuresArr),
        isActive,
        sortOrder,
        nonTransferable,
        nonRepeatable,
        safeRepeatKey,
        isVisitPack,
        openingPrice,
        morningOnly,
      ]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("[POST /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Bookings admin ──────────────────────────────────────────────────────────

// GET /api/bookings — admin sees all
app.get("/api/bookings", adminMiddleware, async (req, res) => {
  try {
    const { status, classId, userId, limit = 100 } = req.query;
    let q = `SELECT b.*, u.display_name AS user_name, (c.date || 'T' || c.start_time) AS start_time, ct.name AS class_name
             FROM bookings b
             LEFT JOIN users u ON b.user_id = u.id
             LEFT JOIN classes c ON b.class_id = c.id
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND b.status = $${params.length}`; }
    if (classId) { params.push(classId); q += ` AND b.class_id = $${params.length}`; }
    // Filtro por user_id — la ficha del cliente (ClientDetail) llama a este
    // endpoint con ?userId=<uuid>; sin este filtro veía las 100 reservas más
    // recientes globales en la pestaña Reservas de cada cliente.
    if (userId) { params.push(userId); q += ` AND b.user_id = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY b.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({ data: r.rows.map(b => ({ ...b, userName: b.user_name, className: b.class_name, startTime: b.start_time })) });
  } catch (err) {
    console.error("GET /bookings error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/bookings/assign — admin assigns a class booking to a specific member.
// Si viene `guest: { name, phone, hasInjury, ... acceptedWaiver }`, también reserva
// para la acompañante en la misma transacción. Dos modos de cobro:
//   a) Sin `guestSale`: descuenta del pack de visitas (is_visit_pack=true) de la
//      socia. Descuenta 2 créditos: 1 del pack regular + 1 del pack de visitas.
//   b) Con `guestSale: { planId, paymentMethod }`: vende el plan (clase suelta
//      o paquete) DIRECTAMENTE a la acompañante en el mismo paso, crea la
//      membership a su nombre y descuenta de ahí. La socia solo paga su clase.
app.post("/api/admin/bookings/assign", adminMiddleware, async (req, res) => {
  const { classId, userId, guest, guestSale } = req.body;
  if (!classId || !userId) return res.status(400).json({ message: "classId y userId requeridos" });
  if (!isUuid(classId) || !isUuid(userId)) return res.status(400).json({ message: "Identificador inválido" });
  const anonConflict = await anonymizedSaleConflict(userId);
  if (anonConflict) return res.status(409).json(anonConflict);
  // Responsiva: recepción puede asignar sin firma si deja el motivo por el que
  // la clienta firmará en recepción (auditoría 2026-09-27, bloque 1, tarea 5).
  const override = req.body?.waiverOverride;
  const overrideReason = typeof override?.reason === "string" ? override.reason.trim() : "";
  if (override && overrideReason.length < 5) return res.status(400).json({ message: "Escribe el motivo (mínimo 5 caracteres)." });
  const signed = await hasSignedWaiver(pool, userId);
  if (!signed && !override) {
    return res.status(403).json({ code: "WAIVER_REQUIRED", message: "Esta clienta no ha firmado su responsiva." });
  }
  const withGuest = guest && typeof guest === "object" && guest.name && guest.phone;
  if (withGuest && !guest.acceptedWaiver) {
    return res.status(400).json({ message: "Confirma el waiver de la acompañante" });
  }
  const hasGuestSale = withGuest && guestSale && typeof guestSale === "object" && guestSale.planId;
  // La política se lee antes de tomar el cliente de la transacción, igual que
  // en POST /api/bookings: de aquí sale cancelWindowHours para el correo.
  let policy;
  try {
    policy = await getBookingPolicy();
  } catch (err) {
    console.error("POST admin/bookings/assign policy error:", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
  const client = await pool.connect();
  // Se suelta tras el COMMIT: la subida de la fila pide su propia conexión (P1-1).
  let released = false;
  try {
    await client.query("BEGIN");

    const classRes = await client.query(
      `SELECT c.id, c.max_capacity, c.current_bookings, c.status, c.date, c.start_time,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') AS starts_at,
              ct.category AS class_category
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE c.id = $1
       FOR UPDATE`,
      [classId]
    );
    if (classRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = classRes.rows[0];
    if (cls.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta clase fue cancelada" });
    }

    const clsCategory = normalizeClassCategory(cls.class_category, "all");
    const membership = await selectMembershipForClass({
      userId,
      classCategory: clsCategory,
      client,
    });
    if (!membership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "La clienta no tiene membresía activa con créditos para esta clase" });
    }

    // Vigencia revisada bajo candado, como en POST /api/bookings.
    const lockedMembershipRes = await client.query(
      `SELECT id, classes_remaining, status::text AS status, end_date,
              ${MEMBERSHIP_EXPIRED_SQL} AS expired
         FROM memberships WHERE id = $1 FOR UPDATE`,
      [membership.id]
    );
    const lockedMembership = lockedMembershipRes.rows[0];
    if (!lockedMembership) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "No se encontró una membresía válida para esta clase" });
    }
    if (lockedMembership.status !== "active" || lockedMembership.expired) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "MEMBERSHIP_NOT_CURRENT", message: "El paquete de la clienta ya no está vigente." });
    }

    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = clsCategory === "studio" ? "Studio" : clsCategory === "reformer_tower" ? "Reformer/Tower" : "esta disciplina";
      return res.status(403).json({
        message: `La membresía de la clienta no incluye clases de ${label}.`,
      });
    }
    if (membership.morning_only && !isWithinMorningWindow(cls.starts_at)) {
      await client.query("ROLLBACK");
      return res.status(403).json({ message: "Este paquete (AM Club) solo permite clases matutinas (hasta las 10:00 am)." });
    }

    if (!isUnlimitedClasses(lockedMembership.classes_remaining) && Number(lockedMembership.classes_remaining) <= 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "La clienta ya no tiene clases disponibles en su membresía.",
      });
    }

    const dupRes = await client.query(
      "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
      [classId, userId]
    );
    if (dupRes.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "La clienta ya tiene una reserva para esta clase" });
    }

    // Tope semanal (planes 'Barre — N Clases por semana').
    const adminWeeklyCheck = await checkWeeklyClassLimit(client, userId, membership.id, cls.date);
    if (!adminWeeklyCheck.ok) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: `La clienta llegó a su tope semanal: ${adminWeeklyCheck.limit} clase${adminWeeklyCheck.limit === 1 ? "" : "s"} por semana. Esta semana ya tiene ${adminWeeklyCheck.count} reservada${adminWeeklyCheck.count === 1 ? "" : "s"}.`,
      });
    }

    // Misma regla que la app (P1-1): con fila y subida vigente, la socia entra a
    // la fila aunque haya lugar; a menos de 2 h el lugar queda libre y se asigna.
    // En una clase cerrada no hay subida, así que la fila no bloquea: recepción
    // asigna el lugar libre como antes.
    const liveNow = await liveBookingCount(classId, client);
    const queueFirst = cls.status === "scheduled" && queueBlocksNewBooking({
      waiting: await waitingCount(classId, client), startsAt: cls.starts_at, now: Date.now(), cutoffHours: BOOKING_LEAD_HOURS,
    });
    let isWaitlist = liveNow >= cls.max_capacity || queueFirst;
    const bookingStatus = isWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status, waiver_override_reason, waiver_override_by, waiver_override_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [classId, userId, membership.id, bookingStatus,
       !signed ? overrideReason : null, !signed ? req.userId : null, !signed ? new Date() : null]
    );

    if (!isWaitlist) {
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        // Descuenta total y, si es mixto, el bucket del área de la clase.
        await consumeMembershipCredit(client, membership.id, classId);
      }
    }

    // ── Reserva opcional para la acompañante usando el pack de visitas
    //    de la socia. Descuenta 2 créditos en total (1 del pack regular
    //    arriba + 1 del pack de visitas aquí abajo).
    let guestData = null;
    if (withGuest) {
      if (isWaitlist) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "La socia quedaría en lista de espera (la clase está llena o ya tiene fila); no se puede agregar acompañante.",
        });
      }
      const occupiedAfter = await liveBookingCount(classId, client);
      if (occupiedAfter >= cls.max_capacity) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          message: "Solo queda 1 lugar; no caben socia + acompañante en esta clase.",
        });
      }
      // Crear/recuperar el guest_profile + guest user PRIMERO; lo usan ambos
      // modos de cobro.
      const guestProfile = await findOrCreateGuestProfile({
        name: guest.name, phone: guest.phone, email: guest.email,
        hasInjury: guest.hasInjury,
        injuryDetails: guest.hasInjury ? (guest.injuryDetails || null) : null,
        practicedBarreBefore: guest.practicedBarreBefore,
        acceptedWaiver: guest.acceptedWaiver,
        hostUserId: userId,
      }, client);
      const guestUser = await findOrCreateGuestUser(guestProfile, client);
      const dup = await client.query(
        "SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2 AND status != 'cancelled'",
        [classId, guestUser.id]
      );
      if (dup.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "La acompañante ya tiene reserva en esta clase" });
      }

      // ── Resolver de dónde sale el crédito de la acompañante ──────────
      // Modo A (default): pack de visitas de la socia.
      // Modo B (`guestSale`): venderle clase suelta / pack a la acompañante.
      let guestMembershipId = null;
      let guestMembershipCreditsAfter = null;
      let guestSaleOrder = null;

      if (hasGuestSale) {
        const planRes = await client.query(
          "SELECT * FROM plans WHERE id = $1 AND is_active = true",
          [guestSale.planId]
        );
        if (!planRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ message: "Plan para la acompañante no encontrado" });
        }
        const plan = planRes.rows[0];
        const _gen = await getSettingValueWithDefaults("general_settings");
        const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
        const pm = normalizePaymentMethod(guestSale.paymentMethod);
        if (!pm) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: PAYMENT_METHOD_INVALID });
        }
        const startStr = todayInStudio();
        const endStr = calcMembershipEndDate(startStr, plan);
        // Si no especifica class_limit, asumimos clase suelta (1).
        const credits = plan.class_limit ?? 1;
        // Primero la orden y luego la membresía ligada a ella (order_id): así
        // /api/payments la cuenta una sola vez (por la orden) y un reembolso
        // encuentra la membresía. Las ventas viejas sin order_id no se tocan.
        const orderIns = await client.query(
          `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount, channel, verified_at, verified_by)
           VALUES ($1, $2, 'approved', $3, $4, $4, 'pos_guest_sale', NOW(), $5)
           RETURNING *`,
          [guestUser.id, plan.id, pm, _eff ?? 0, req.userId || null]
        );
        guestSaleOrder = orderIns.rows[0];
        const memIns = await client.query(
          `INSERT INTO memberships
             (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, notes, order_id)
           VALUES ($1, $2, 'active', $3, $4, $5, $6, $7, $8) RETURNING *`,
          [guestUser.id, plan.id, pm, startStr, endStr, credits,
           `Venta acompañante en roster — invitada por user ${userId}`, guestSaleOrder.id]
        );
        const memRow = memIns.rows[0];
        guestMembershipId = memRow.id;
        guestMembershipCreditsAfter = (memRow.classes_remaining ?? 1) - 1;
        if (memRow.classes_remaining !== null) {
          await client.query(
            "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
            [memRow.id]
          );
        }
      } else {
        // Modo A: pack de visitas activo de la socia.
        const packRes = await client.query(
          `SELECT m.id, m.classes_remaining
             FROM memberships m
             JOIN plans p ON p.id = m.plan_id
            WHERE m.user_id = $1 AND m.status = 'active'
              AND p.is_visit_pack = true
              AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
              AND (m.classes_remaining IS NULL OR m.classes_remaining > 0)
            ORDER BY m.created_at DESC LIMIT 1
            FOR UPDATE`,
          [userId]
        );
        if (!packRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(403).json({
            message: "La socia no tiene un paquete de visitas activo con créditos. Véndele uno primero o vende clase suelta para la acompañante.",
          });
        }
        const pack = packRes.rows[0];
        guestMembershipId = pack.id;
        guestMembershipCreditsAfter = pack.classes_remaining === null
          ? null
          : Math.max(0, pack.classes_remaining - 1);
        if (pack.classes_remaining !== null) {
          await client.query(
            "UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - 1, 0), updated_at = NOW() WHERE id = $1",
            [pack.id]
          );
        }
      }

      const guestBookingIns = await client.query(
        `INSERT INTO bookings (class_id, user_id, membership_id, guest_profile_id, status)
         VALUES ($1, $2, $3, $4, 'confirmed') RETURNING *`,
        [classId, guestUser.id, guestMembershipId, guestProfile.id]
      );
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
      guestData = {
        booking: guestBookingIns.rows[0],
        guestProfile,
        packMembershipId: guestMembershipId,
        creditsRemaining: guestMembershipCreditsAfter,
        soldOrder: guestSaleOrder,
        chargedTo: hasGuestSale ? "guest" : "host_visit_pack",
      };
    }

    await client.query("COMMIT");
    client.release();
    released = true;

    if (isWaitlist && liveNow < cls.max_capacity) {
      // Entró a la fila con lugar libre: corre la subida (quizá sube ella).
      await onSeatReleased([classId], { source: "new_booking", quietUserIds: [userId] });
      const st = await pool.query("SELECT status::text AS status FROM bookings WHERE id = $1", [result.rows[0].id]);
      if (st.rows[0]?.status === "confirmed") {
        isWaitlist = false;
        result.rows[0].status = "confirmed";
      }
    }

    try {
      const userRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [userId]);
      const classFullRes = await pool.query(
        `SELECT c.date, c.start_time, ct.name AS class_type_name,
                i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON c.class_type_id = ct.id
         LEFT JOIN instructors i ON c.instructor_id = i.id
         WHERE c.id = $1`,
        [classId]
      );
      const memAfter = await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id]);
      const classesLeft = memAfter.rows[0]?.classes_remaining ?? null;

      if (userRes.rows[0] && classFullRes.rows[0]) {
        const u = userRes.rows[0];
        const cl = classFullRes.rows[0];
        if (await areEmailNotificationsEnabled()) {
          sendBookingConfirmed({
            to: u.email,
            name: u.display_name || "Alumna",
            className: cl.class_type_name,
            date: cl.date,
            startTime: cl.start_time,
            instructor: cl.instructor_name,
            classesLeft,
            isWaitlist,
            waitlistCutoffHours: BOOKING_LEAD_HOURS,
            cancelHours: policy.cancelWindowHours,
          }).catch((e) => console.error("[Email] booking confirmed (admin):", e.message));
        }
        sendBookingNoticeWhatsApp(u, cl, isWaitlist ? "waitlist" : "confirmed")
          .catch((e) => console.error("[WA] booking confirmed (admin):", e.message));
        // Notifica a la dueña/admins (puede haber otras recepcionistas o instructoras).
        if (!isWaitlist) {
          const dateStr = cl.date ? new Date(cl.date).toLocaleDateString("es-MX") : "";
          const timeStr = cl.start_time ? String(cl.start_time).slice(0, 5) : "";
          notifyAdminsByTemplate(
            "admin_new_booking",
            {
              clientName: u.display_name || "Alumna",
              class: cl.class_type_name || "Clase",
              date: dateStr,
              time: timeStr,
            },
            `Nueva reserva: ${u.display_name || "Alumna"} en ${cl.class_type_name || "clase"}${dateStr ? ` el ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""}.`
          );
        }
      }
    } catch (emailErr) {
      console.error("[Email] booking confirmed (admin) query error:", emailErr.message);
    }

    const message = isWaitlist
      ? "Clienta agregada a lista de espera"
      : guestData
        ? (guestData.chargedTo === "guest"
            ? "Socia reservada + clase suelta vendida a la acompañante"
            : "Socia + acompañante reservadas (2 créditos descontados)")
        : "Reserva asignada correctamente";
    triggerWalletPassSync(userId, isWaitlist ? "admin_booking_waitlist_created" : "admin_booking_created");
    return res.status(201).json({
      message,
      data: { booking: result.rows[0], isWaitlist, guest: guestData },
    });
  } catch (err) {
    if (!released) { try { await client.query("ROLLBACK"); } catch (_) { } }
    console.error("POST /admin/bookings/assign error:", err);
    // Devolver detalle del error de Postgres (constraint que falló) en lugar
    // del genérico "Error interno", para que la admin pueda diagnosticar y
    // reintentar (ej. teléfono duplicado, constraint violation, etc.).
    const pgDetail = err && err.detail ? err.detail : null;
    const constraint = err && err.constraint ? err.constraint : null;
    const code = err && err.code ? err.code : null;
    let userMessage = "No se pudo asignar la reserva.";
    if (code === "23505") userMessage = `Conflicto de duplicado: ${constraint || pgDetail || err.message}`;
    else if (code === "23503") userMessage = `Referencia rota: ${pgDetail || err.message}`;
    else if (code === "23502") userMessage = `Falta un dato obligatorio: ${pgDetail || err.message}`;
    else if (err && err.message) userMessage = `Error: ${err.message}`;
    return res.status(500).json({
      message: userMessage,
      ...(code ? { code } : {}),
      ...(constraint ? { constraint } : {}),
    });
  } finally {
    if (!released) client.release();
  }
});

// Fecha y minuto actuales en la zona del estudio, para la regla de check-in.
async function studioNow(client = pool) {
  const r = await client.query(
    `SELECT to_char((NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date, 'YYYY-MM-DD') AS d,
            EXTRACT(HOUR FROM (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}'))::int * 60
              + EXTRACT(MINUTE FROM (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}'))::int AS m`,
  );
  return { nowDate: r.rows[0].d, nowMinutes: Number(r.rows[0].m) };
}

// +puntos por asistir (una sola vez por reserva): compartido por lista y QR.
async function awardCheckinPoints(userId) {
  try {
    const cfg = await getLoyaltyConfig();
    await insertCheckinPoints(pool, userId, cfg);
  } catch (e) { console.warn("[check-in] loyalty insert failed:", e?.message); }
}

// Inserta los puntos de "Clase asistida": los comparte el check-in (lista/QR,
// dentro del try/catch best-effort de awardCheckinPoints) y la corrección de
// falta (dentro de su transacción). Devuelve los puntos otorgados (0 si el
// programa está apagado); lanza si la base falla.
async function insertCheckinPoints(q, userId, cfg) {
  const pts = Number(cfg.points_per_class);
  if (cfg.enabled === false || !(pts > 0)) return 0;
  await q.query(
    "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Clase asistida')",
    [userId, pts],
  );
  return pts;
}

// Refleja en Wellhub una asistencia marcada en el estudio (lista o corrección
// de falta) para que la visita se facture. Best-effort, sin esperar.
function reflectWellhubVisit(booking) {
  (async () => {
    try {
      const creds = await getWellhubCredentials(pool);
      if (creds && creds.is_enabled) {
        const u = await pool.query("SELECT wellhub_id FROM users WHERE id=$1", [booking.user_id]);
        const vres = await wellhubValidateVisit(creds, { customCode: u.rows[0]?.wellhub_id });
        await pool.query(
          `INSERT INTO partner_checkins (booking_id, user_id, channel, status, method, validated_at, external_response)
           VALUES ($1,$2,'wellhub',$3,'manual',NOW(),$4)`,
          [booking.id, booking.user_id, vres.ok ? "confirmed" : "failed", JSON.stringify(vres.data || {})],
        );
      }
    } catch (e) { console.warn("[wellhub] reflect visit:", e.message); }
  })();
}

// PUT /api/bookings/:id/check-in
app.put("/api/bookings/:id/check-in", adminMiddleware, async (req, res) => {
  try {
    // 1) Lookup primero para saber si ya estaba checked-in y evitar duplicar puntos,
    //    trae también la clase para aplicar la regla única de check-in.
    const before = await pool.query(
      `SELECT b.user_id, b.status, b.checked_in_at, b.class_id, c.status AS class_status,
              to_char(c.date, 'YYYY-MM-DD') AS class_date, c.start_time
         FROM bookings b JOIN classes c ON c.id = b.class_id
        WHERE b.id = $1`,
      [req.params.id],
    );
    if (!before.rows.length) {
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const bk = before.rows[0];
    // Repetir el check-in de una reserva ya asistida es idempotente aunque la
    // clase sea de otro día: la regla decide si se puede marcar asistencia, no
    // si ya se marcó. Sin cambios ni puntos.
    if (bk.status === "checked_in") {
      const current = await pool.query("SELECT * FROM bookings WHERE id = $1", [req.params.id]);
      return res.json({ data: current.rows[0], alreadyCheckedIn: true });
    }
    const rule = checkinRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, startTime: String(bk.start_time), ...(await studioNow()) });
    if (!rule.ok) return res.status(409).json({ code: rule.code, message: rule.message });
    const wasAlreadyCheckedIn = !!before.rows[0].checked_in_at;
    // 2) UPDATE (idempotente: si ya estaba, refresca el timestamp pero no doblamos puntos).
    const r = await pool.query(
      "UPDATE bookings SET status = 'checked_in', checked_in_at = COALESCE(checked_in_at, NOW()), checked_in_by = COALESCE(checked_in_by, $2) WHERE id = $1 RETURNING *",
      [req.params.id, req.userId],
    );
    const booking = r.rows[0];
    // ── Reflejar visita Wellhub si el check-in fue local (recepción/QR/coach) ──
    // Fire-and-forget, best-effort: valida la visita contra Wellhub para facturar.
    if (booking.channel === "wellhub" && !wasAlreadyCheckedIn) reflectWellhubVisit(booking);
    // 3) Otorgar +10 pts SOLO si es primer check-in.
    if (booking.user_id && !wasAlreadyCheckedIn) await awardCheckinPoints(booking.user_id);
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.checkin", entityType: "booking", entityId: booking.id,
      subjectUserId: booking.user_id, before: { status: bk.status }, after: { status: "checked_in" },
      meta: { method: "manual", class_id: booking.class_id },
    });
    // 4) notifyClassAttended (motivación + milestones + wallet sync) SOLO si es primer check-in.
    if (booking.user_id && !wasAlreadyCheckedIn) {
      // Get className for the notify ctx
      let className = null;
      try {
        const cl = await pool.query(
          "SELECT ct.name FROM classes c JOIN class_types ct ON ct.id = c.class_type_id WHERE c.id = $1",
          [booking.class_id],
        );
        className = cl.rows[0]?.name || null;
      } catch (_) { /* opcional */ }
      notifyClassAttended(booking.user_id, { className }).catch((e) => {
        console.warn("[check-in] notifyClassAttended async error:", e?.message);
      });
    }
    return res.json({
      data: booking,
      alreadyCheckedIn: wasAlreadyCheckedIn,
    });
  } catch (err) {
    console.error("[check-in] error:", err?.message, err?.code, err?.detail);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/checkin/scan — check-in por QR del pase (wallet).
// El QR del pase codifica base64(userId). Ubica la reserva confirmada de la
// clienta para la clase de HOY más cercana a la hora actual y la marca asistida.
app.post("/api/admin/checkin/scan", adminMiddleware, async (req, res) => {
  try {
    const raw = String(req.body?.code ?? "").trim();
    if (!raw) return res.status(400).json({ status: "error", message: "Código vacío" });

    let userId = null;
    if (isUuid(raw)) {
      userId = raw;
    } else {
      try {
        const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
        if (isUuid(decoded)) userId = decoded;
      } catch (_) { /* código inválido */ }
    }
    if (!userId) {
      return res.status(404).json({ status: "not_found", message: "Código no reconocido" });
    }

    const userRes = await pool.query("SELECT id, display_name FROM users WHERE id = $1 LIMIT 1", [userId]);
    if (!userRes.rows.length) {
      return res.status(404).json({ status: "not_found", message: "Clienta no encontrada" });
    }
    const name = userRes.rows[0].display_name || "Clienta";

    const bookingRes = await pool.query(
      `SELECT b.id, b.status, ct.name AS class_name, c.start_time,
              c.status AS class_status, to_char(c.date,'YYYY-MM-DD') AS class_date
         FROM bookings b
         JOIN classes c ON b.class_id = c.id
         JOIN class_types ct ON c.class_type_id = ct.id
        WHERE b.user_id = $1
          AND b.status IN ('confirmed','checked_in')
          AND c.status <> 'cancelled'
          AND c.date = (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date
        ORDER BY ABS(EXTRACT(EPOCH FROM (((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') - NOW())))
        LIMIT 1`,
      [userId]
    );
    if (!bookingRes.rows.length) {
      return res.json({ status: "no_booking", name, message: `${name} no tiene reserva para hoy.` });
    }
    const bk = bookingRes.rows[0];
    const timeStr = String(bk.start_time || "").slice(0, 5);

    const rule = checkinRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, startTime: String(bk.start_time), ...(await studioNow()) });
    if (!rule.ok) return res.status(409).json({ status: "rejected", code: rule.code, name, message: `${name}: ${rule.message}` });

    if (bk.status === "checked_in") {
      return res.json({
        status: "already", name, className: bk.class_name, time: timeStr,
        message: `${name} ya tenía check-in (${bk.class_name} ${timeStr}).`,
      });
    }

    await pool.query(
      "UPDATE bookings SET status = 'checked_in', checked_in_at = NOW(), checked_in_by = $2 WHERE id = $1",
      [bk.id, req.userId]
    );
    // Puntos por asistir (igual que el check-in manual del roster)
    await awardCheckinPoints(userId);
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.checkin", entityType: "booking", entityId: bk.id,
      subjectUserId: userId, before: { status: bk.status }, after: { status: "checked_in" },
      meta: { method: "qr", class_name: bk.class_name },
    });

    // Igual que el check-in manual del roster: dispara motivación, milestones y
    // sincronización del pase de wallet (antes el check-in por QR no lo hacía).
    notifyClassAttended(userId, { className: bk.class_name }).catch((e) => {
      console.warn("[checkin/scan] notifyClassAttended async error:", e?.message);
    });

    return res.json({
      status: "ok", name, className: bk.class_name, time: timeStr,
      message: `✓ ${name} — ${bk.class_name} ${timeStr}`,
    });
  } catch (err) {
    console.error("[POST /admin/checkin/scan]", err.message);
    return res.status(500).json({ status: "error", message: "Error interno" });
  }
});

// PUT /api/bookings/:id/no-show — marca falta. La falta queda ligada a ESTA
// reserva (falta_recorded_at) para poder corregirla el mismo día, y el cambio
// queda en la bitácora (auditoría 2026-09-27, bloque 2).
app.put("/api/bookings/:id/no-show", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `WITH prev AS (SELECT id, status::text AS status FROM bookings WHERE id = $1 FOR UPDATE)
       UPDATE bookings b SET status = 'no_show'
         FROM prev
        WHERE b.id = prev.id AND prev.status NOT IN ('cancelled', 'no_show')
       RETURNING b.*, prev.status AS prev_status`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Reserva no encontrada o ya procesada" });
    const { prev_status: prevStatus, ...bk } = r.rows[0];
    triggerWalletPassSync(bk.user_id, "booking_no_show");
    // Registrar falta por no-show (excluye invitadas con guest_profile_id).
    let falta = null;
    try {
      if (bk.user_id && !bk.guest_profile_id) {
        falta = await recordFalta({ userId: bk.user_id, reason: "no-show" });
        if (falta.faltasCount > 0) {
          // Sólo si sigue en falta: si ya la corrigieron a asistencia mientras
          // esto corría, no le vuelve a poner una marca de falta.
          await pool.query("UPDATE bookings SET falta_recorded_at = NOW() WHERE id = $1 AND status = 'no_show'", [bk.id]);
        }
      }
    } catch (e) { console.warn("[faltas] no-show:", e.message); }
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.no_show", entityType: "booking", entityId: bk.id,
      subjectUserId: bk.user_id, before: { status: prevStatus }, after: { status: "no_show" },
      meta: { falta_recorded: Boolean(falta?.faltasCount), penalty_applied: Boolean(falta?.penaltyApplied) },
    });
    return res.json({ data: bk });
  } catch (err) {
    console.error("[PUT /bookings/:id/no-show]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/bookings/:id/correct-no-show — corrige a asistencia una falta
// marcada por error, sólo el mismo día de la clase y con motivo. Revierte la
// falta que registró ESTA reserva (el contador y, si esa falta completó el
// umbral, la penalización), da los puntos de asistencia una sola vez y deja
// constancia en la bitácora. Pedido del dueño, auditoría 2026-09-27, bloque 2.
app.put("/api/bookings/:id/correct-no-show", adminMiddleware, async (req, res) => {
  const reason = req.body?.reason;
  const problem = reasonProblem(reason);
  if (problem) return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT b.id, b.user_id, b.status::text AS status, b.checked_in_at, b.guest_profile_id,
              b.falta_recorded_at, b.channel, c.status::text AS class_status,
              to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
         LEFT JOIN class_types ct ON ct.id = c.class_type_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const bk = cur.rows[0];
    const { nowDate } = await studioNow(client);
    const rule = noShowCorrectionRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, nowDate });
    if (!rule.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: rule.code, message: rule.message });
    }
    const firstAttendance = !bk.checked_in_at;
    await client.query(
      `UPDATE bookings
          SET status = 'checked_in', checked_in_at = COALESCE(checked_in_at, NOW()),
              checked_in_by = COALESCE(checked_in_by, $2), falta_recorded_at = NULL
        WHERE id = $1`,
      [bk.id, req.userId],
    );
    const cfg = await getLoyaltyConfig(client);
    let faltas = null;
    if (bk.falta_recorded_at && bk.user_id && !bk.guest_profile_id) {
      const u = await client.query("SELECT COALESCE(faltas_count, 0)::int AS n FROM users WHERE id = $1 FOR UPDATE", [bk.user_id]);
      const antes = Number(u.rows[0]?.n ?? 0);
      const rev = faltaReversal({ faltasCount: antes, threshold: cfg.faltas_threshold, penaltyPoints: cfg.faltas_penalty_points });
      await client.query("UPDATE users SET faltas_count = $2 WHERE id = $1", [bk.user_id, rev.newCount]);
      if (rev.refundPoints > 0) {
        await client.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'adjust', $2, $3)",
          [bk.user_id, rev.refundPoints, "Reverso de penalización: falta corregida a asistencia"],
        );
      }
      faltas = { antes, despues: rev.newCount, refund: rev.refundPoints };
    }
    let pointsAwarded = 0;
    if (firstAttendance && bk.user_id) {
      pointsAwarded = await insertCheckinPoints(client, bk.user_id, cfg);
    }
    await recordAudit(client, {
      actorId: req.userId, action: "booking.no_show_corrected", entityType: "booking", entityId: bk.id,
      subjectUserId: bk.user_id, reason,
      before: { status: "no_show", ...(faltas ? { faltas_count: faltas.antes } : {}) },
      after: { status: "checked_in", ...(faltas ? { faltas_count: faltas.despues } : {}) },
      meta: { class_name: bk.class_name, falta_reverted: Boolean(faltas), penalty_refunded: faltas?.refund ?? 0, points_awarded: pointsAwarded },
    });
    await client.query("COMMIT");
    if (bk.user_id) {
      triggerWalletPassSync(bk.user_id, "no_show_corrected");
      if (pointsAwarded > 0) {
        checkLoyaltyMilestones(bk.user_id).catch((e) => console.warn("[Milestones] corrección de falta:", e?.message));
      }
    }
    if (bk.channel === "wellhub" && firstAttendance) reflectWellhubVisit({ id: bk.id, user_id: bk.user_id });
    const row = await pool.query("SELECT * FROM bookings WHERE id = $1", [bk.id]);
    return res.json({ data: row.rows[0], falta_reverted: Boolean(faltas), penalty_refunded: faltas?.refund ?? 0, points_awarded: pointsAwarded });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /bookings/:id/correct-no-show]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// GET /api/classes/:id/roster — lista de alumnos reservados en una clase
app.get("/api/classes/:id/roster", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.id AS booking_id, b.status, b.checked_in_at,
              u.id AS user_id, u.display_name, u.email, u.phone,
              m.plan_id, p.name AS plan_name, m.classes_remaining,
              COALESCE(u.has_injury, false) AS has_injury, u.injury_details, u.health_notes,
              NOT EXISTS (SELECT 1 FROM bookings pb WHERE pb.user_id = b.user_id AND pb.checked_in_at IS NOT NULL AND pb.id <> b.id) AS first_visit
              , CASE WHEN b.status = 'waitlist' THEN (
                  SELECT COUNT(*)::int + 1 FROM bookings w
                   WHERE w.class_id = b.class_id AND w.status = 'waitlist'
                     AND (w.created_at, w.id) < (b.created_at, b.id)
                ) END AS waitlist_position
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       LEFT JOIN memberships m ON b.membership_id = m.id
       LEFT JOIN plans p ON m.plan_id = p.id
       WHERE b.class_id = $1 AND b.status != 'cancelled'
       ORDER BY CASE b.status
         WHEN 'confirmed'  THEN 1
         WHEN 'checked_in' THEN 2
         WHEN 'waitlist'   THEN 3
         WHEN 'no_show'    THEN 4
         ELSE 5 END,
         CASE WHEN b.status = 'waitlist' THEN b.created_at END ASC NULLS LAST,
         CASE WHEN b.status = 'waitlist' THEN b.id END ASC NULLS LAST,
         u.display_name ASC`,
      [req.params.id]
    );
    // Also get class info
    const cls = await pool.query(
      `SELECT c.*, ct.name AS class_type_name, ct.color,
              i.display_name AS instructor_name,
              (c.date || 'T' || c.start_time) AS starts_at
       FROM classes c
       JOIN class_types ct ON c.class_type_id = ct.id
       JOIN instructors i ON c.instructor_id = i.id
       WHERE c.id = $1`,
      [req.params.id]
    );
    return res.json({ data: { class: camelRow(cls.rows[0] ?? {}), roster: r.rows.map(camelRow) } });
  } catch (err) {
    console.error("[GET /classes/:id/roster]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/clients/manual — crea clienta + membresía en un solo paso (sin que use la app)
app.post("/api/admin/clients/manual", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      displayName, email, phone, dateOfBirth,
      emergencyContactName, emergencyContactPhone, healthNotes,
      planId, paymentMethod = "cash", startDate,
      notes, discountCode,
    } = req.body;
    if (!displayName || !email) return res.status(400).json({ message: "Nombre y email son requeridos" });

    // El alta es un upsert por email: si ya hay una clienta dada de baja con
    // este correo, el ON CONFLICT de abajo la reactivaría sin querer.
    const emailNorm = email.toLowerCase().trim();
    const existingByEmail = await client.query("SELECT id, anonymized_at FROM users WHERE email = $1", [emailNorm]);
    if (existingByEmail.rows.length && existingByEmail.rows[0].anonymized_at) {
      return res.status(409).json({ code: "ACCOUNT_ANONYMIZED", message: "Esta clienta fue dada de baja." });
    }

    await client.query("BEGIN");

    // 1. Create user (random password — they can reset later)
    const tempPassword = Math.random().toString(36).slice(2, 10) + "Op1!";
    const hash = await bcrypt.hash(tempPassword, 10);
    const userRes = await client.query(
      `INSERT INTO users (display_name, email, phone, date_of_birth, emergency_contact_name,
        emergency_contact_phone, health_notes, role, password_hash, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'client',$8,true)
       ON CONFLICT (email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         phone = EXCLUDED.phone,
         updated_at = NOW()
       RETURNING id, display_name, email`,
      [displayName, emailNorm, phone || null, dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null, hash]
    );
    const user = userRes.rows[0];

    // 2. Assign membership if plan selected
    let membership = null;
    if (planId) {
      const planRes = await client.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
      if (!planRes.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Plan no encontrado" }); }
      const plan = planRes.rows[0];
      const _gen = await getSettingValueWithDefaults("general_settings");
      const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
      const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId: user.id, plan, client });
      if (nonRepeatableConflict) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: nonRepeatableConflict.message });
      }
      // Misma validación que la venta en mostrador: día AAAA-MM-DD exacto,
      // nunca texto crudo con basura pegada.
      const startProblem = saleStartProblem(startDate);
      if (startProblem) { await client.query("ROLLBACK"); return res.status(400).json({ message: startProblem }); }
      const start = startDate ? new Date(`${saleStartDay(startDate)}T00:00:00Z`) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + plan.duration_days);

      // Cupón opcional: valida y calcula el precio final que pagó la clienta
      // (queda registrado en las notas para control del admin). Si el cupón es
      // inválido para este plan, abortamos para que el admin lo sepa.
      // Si hay dinero de por medio, el metodo de pago se valida contra el enum
      // (no se asume efectivo). Revision de codigo 2026-09-08, R3.
      if (!PAYMENT_METHODS.includes(String(paymentMethod))) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          message: `Método de pago inválido. Opciones: ${PAYMENT_METHODS.join(", ")}.`,
        });
      }
      let priceNote = "";
      let orderDiscount = 0;
      if (discountCode) {
        const dc = await findApplicableDiscountCode({
          code: discountCode,
          planId: plan.id,
          classCategory: plan.class_category,
          channel: "membership",
          client,
        });
        if (!dc) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "El cupón no es válido para este plan" });
        }
        const subtotal = Number(_eff) || 0;
        const discount = calculateDiscountAmount(dc.discount_type, Number(dc.discount_value), subtotal);
        const finalPrice = Math.max(0, subtotal - discount);
        priceNote = ` · Cupón ${dc.code}: $${subtotal} → $${finalPrice}`;
        orderDiscount = discount;
        // Incrementa el uso del cupón.
        await client.query("UPDATE discount_codes SET uses_count = uses_count + 1 WHERE id = $1", [dc.id]).catch(() => {});
      }

      // Cortesía en el alta manual (sale en $0): exige motivo, en `reason` o en
      // Notas del formulario (auditoría 2026-09-27, P0-3).
      const chargedPrice = Math.max(0, (Number(_eff) || 0) - orderDiscount);
      const saleReason = typeof req.body.reason === "string" && req.body.reason.trim() ? req.body.reason : notes;
      if (chargedPrice === 0) {
        const p = reasonProblem(saleReason);
        if (p) {
          await client.query("ROLLBACK");
          return res.status(400).json({ code: "REASON_REQUIRED", message: `Es una cortesía ($0): escribe el motivo en Notas. ${p}` });
        }
      }

      const memRes = await client.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date,
          classes_remaining, notes, activated_by, activated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
        [user.id, plan.id, paymentMethod, start.toISOString().split("T")[0],
        end.toISOString().split("T")[0],
        plan.class_limit === 0 ? null : plan.class_limit,
        (notes || `Alta manual por admin`) + priceNote, req.userId || null]
      );
      membership = camelRow(memRes.rows[0]);

      // Esta es la OTRA via de venta de mostrador (el alta manual con paquete).
      // Los ingresos se calculan sobre `orders`, asi que sin esto el dinero
      // cobrado aqui tampoco aparecia en el reporte — el mismo P0-3, en la ruta
      // que se me habia pasado. Revision de codigo 2026-09-08, R3.
      const ordRes = await client.query(
        `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount,
                             total_amount, discount_amount, channel, verified_at, verified_by,
                             approved_at, approved_by, paid_at)
         VALUES ($1,$2,'approved',$3,$4,0,$5,$6,'counter',NOW(),$7,NOW(),$7,NOW())
         RETURNING id, order_number`,
        [user.id, plan.id, paymentMethod, Number(_eff) || 0,
         chargedPrice, orderDiscount, req.userId || null]
      );
      const paymentReference = ordRes.rows[0].order_number || ordRes.rows[0].id;
      await client.query(`UPDATE memberships SET order_id = $2, payment_reference = $3 WHERE id = $1`,
        [memRes.rows[0].id, ordRes.rows[0].id, paymentReference]);
      membership.orderId = ordRes.rows[0].id;
      membership.paymentReference = paymentReference;
      await recordAudit(client, {
        actorId: req.userId, action: "membership.sale", entityType: "membership", entityId: memRes.rows[0].id,
        subjectUserId: user.id, reason: chargedPrice === 0 ? saleReason : null,
        after: saleAuditAfter({
          plan, listPrice: Number(_eff) || 0, amount: chargedPrice, paymentMethod, paymentReference,
          orderId: ordRes.rows[0].id, startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0],
          classesRemaining: plan.class_limit === 0 ? null : plan.class_limit,
        }),
        meta: { source: "alta_manual", courtesy: chargedPrice === 0, price_differs: orderDiscount > 0, discount_code: discountCode || null },
      });
    }

    await client.query("COMMIT");
    if (membership?.userId || user?.id) {
      triggerWalletPassSync(membership?.userId || user.id, membership ? "admin_client_manual_with_membership" : "admin_client_manual_created");
    }
    return res.status(201).json({
      data: { user: camelRow(user), membership, tempPassword: planId ? undefined : tempPassword },
      message: planId ? "Clienta registrada y membresía activada" : "Clienta registrada",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[POST /admin/clients/manual]", err.message);
    if (err.code === "23505") return res.status(409).json({ message: "Ya existe una clienta con ese email" });
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// GET /api/admin/orders — all orders
app.get("/api/admin/orders", adminMiddleware, async (req, res) => {
  try {
    const { status, limit = 100 } = req.query;
    let q = `SELECT o.*, u.display_name AS user_name, p.name AS plan_name,
                    pp.file_url AS proof_url, pp.status AS proof_status, pp.uploaded_at AS proof_uploaded_at
             FROM orders o
             LEFT JOIN users u ON o.user_id = u.id
             LEFT JOIN plans p ON o.plan_id = p.id
             LEFT JOIN payment_proofs pp ON pp.order_id = o.id
             WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); q += ` AND o.status = $${params.length}`; }
    params.push(parseInt(limit)); q += ` ORDER BY o.created_at DESC LIMIT $${params.length}`;
    const r = await pool.query(q, params);
    return res.json({
      data: r.rows.map(o => ({
        ...o,
        userName: o.user_name,
        userId: o.user_id,
        planName: o.plan_name,
        proofUrl: o.proof_url,
        proofStatus: o.proof_status,
        proofUploadedAt: o.proof_uploaded_at,
        totalAmount: o.total_amount,
        paymentMethod: o.payment_method,
        createdAt: o.created_at,
      })),
    });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/orders/:id/verify
app.put("/api/admin/orders/:id/verify", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!orderRes.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }
    let order = orderRes.rows[0];
    let justApproved = false;

    if (order.status !== "approved") {
      let plan = null;
      if (order.plan_id) {
        const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
        if (planRes.rows.length) {
          plan = planRes.rows[0];
          const nonRepeatableConflict = await findNonRepeatablePlanConflict({
            userId: order.user_id,
            plan,
            excludeOrderId: order.id,
            client,
          });
          if (nonRepeatableConflict) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: nonRepeatableConflict.message });
          }
        }
      }

      const approvedRes = await client.query(
        "UPDATE orders SET status = 'approved', verified_at = NOW(), verified_by = $1 WHERE id = $2 RETURNING *",
        [req.userId, req.params.id]
      );
      order = approvedRes.rows[0];
      justApproved = true;

      // Activate membership if this order is for a plan
      if (order.plan_id && plan && order.user_id) {
        // Carry-over: suma créditos de membresías activas a la nueva membresía.
        let carryOver = 0;
        const activeMemberships = await client.query(
          `SELECT m.id, m.classes_remaining
             FROM memberships m LEFT JOIN plans p ON p.id = m.plan_id
            WHERE m.user_id = $1 AND m.status = 'active' AND m.classes_remaining > 0`,
          [order.user_id]
        );
        if (activeMemberships.rows.length > 0) {
          for (const m of activeMemberships.rows) {
            carryOver += (Number(m.classes_remaining) || 0);
          }
          const oldIds = activeMemberships.rows.map((m) => m.id);
          await client.query(
            `UPDATE memberships SET status = 'cancelled', cancellation_reason = 'Renovación: créditos transferidos a nueva membresía', cancelled_at = NOW(), end_date = NOW()
             WHERE id = ANY($1::uuid[])`,
            [oldIds]
          );
        }

        const newCredits = (plan.class_limit ?? 0) + carryOver;
        const end = new Date();
        end.setDate(end.getDate() + (plan.duration_days || 30));

        const existing = await client.query(
          `SELECT id FROM memberships WHERE order_id = $1 AND COALESCE(is_addon,false) = false`, [order.id]
        );
        if (existing.rows.length > 0) {
          await client.query(
            `UPDATE memberships SET status = 'active', classes_remaining = $1 WHERE id = $2`,
            [newCredits, existing.rows[0].id]
          );
          // Re-reparte buckets si es mixto (el UPDATE no dispara el trigger).
          await resyncMixtoBuckets(client, existing.rows[0].id);
        } else {
          await client.query(
            `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
             VALUES ($1,$2,'active',$3,NOW(),$4,$5,$6)`,
            [order.user_id, order.plan_id, order.payment_method || "transfer", end.toISOString(), newCredits, order.id]
          );
        }
      }

      if (order.discount_code_id) {
        await incrementDiscountUsage(order.discount_code_id, client);
      }
    }

    await client.query("COMMIT");

    let plan = null;
    if (order.plan_id) {
      const planRes = await pool.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
      if (planRes.rows.length) plan = planRes.rows[0];
    }

    // Email: membership activated
    if (justApproved && order.user_id && plan) {
      try {
        const end = new Date();
        end.setDate(end.getDate() + (plan.duration_days || 30));
        const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
        if (uRes.rows[0]) {
          const u = uRes.rows[0];
          if (await areEmailNotificationsEnabled()) {
            sendMembershipActivated({
              to: u.email,
              name: u.display_name || "Alumna",
              planName: plan.name,
              startDate: new Date().toISOString(),
              endDate: end.toISOString(),
              classLimit: plan.class_limit ?? null,
            }).catch((e) => console.error("[Email] admin order verify:", e.message));
          }
          sendConfiguredWhatsAppTemplate({
            templateKey: "membership_activated",
            phone: u.phone,
            vars: {
              firstName: (u.display_name || "Alumna").split(" ")[0],
              plan: plan.name || "tu plan",
              startDate: new Date().toLocaleDateString("es-MX"),
              endDate: end.toLocaleDateString("es-MX"),
            },
            fallbackMessage: `Hola ${(u.display_name || "Alumna").split(" ")[0]}, tu membresía ${plan.name || ""} ya está activa.`,
          })
            .then((r) => { if (!r?.sent) console.warn("[WA] membership_activated (order verify) SKIPPED:", r?.reason, "phone:", u.phone || "(vacío)"); })
            .catch((e) => console.error("[WA] admin order verify:", e.message));
        }
      } catch (emailErr) {
        console.error("[Email] admin order verify query:", emailErr.message);
      }
    }

    // Award loyalty points for purchase
    if (justApproved && order.user_id && order.total_amount > 0) {
      try {
        const cfg = await getLoyaltyConfig();
        const pts = Math.floor((order.total_amount || 0) * cfg.points_per_peso);
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [order.user_id, pts, `Compra aprobada — $${order.total_amount}`]
          );
        }
      } catch (e) { /* loyalty earn error shouldn't fail verify */ }
    }

    if (order.user_id) {
      if (justApproved) {
        notifyMembershipRenewed(order.user_id, plan?.name).catch(() => {});
      } else {
        triggerWalletPassSync(order.user_id, "order_verify_retrigger");
      }
    }
    return res.json({ data: order });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("PUT /admin/orders/:id/verify error:", err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return res.status(status).json({ message: "Error al aprobar la orden" });
  } finally {
    client.release();
  }
});

// PUT /api/admin/orders/:id/reject
app.put("/api/admin/orders/:id/reject", adminMiddleware, async (req, res) => {
  try {
    const { notes, reason } = req.body;
    const rejectionReason = reason || notes || "No especificado";
    // Guard de estado: solo se puede rechazar mientras NO esté ya aprobada/rechazada.
    // Evita el caso "rechazo una orden ya aprobada" que dejaría la membresía activa
    // pero el WhatsApp/email contradiciendo el estado real. Si quieres "deshacer una
    // aprobación", hay que hacer rollback transaccional aparte (membresía + descuento).
    const r = await pool.query(
      `UPDATE orders SET status = 'rejected', verified_at = NOW(), verified_by = $3, notes = $2
         WHERE id = $1 AND status NOT IN ('approved','rejected')
         RETURNING *, user_id`,
      [req.params.id, rejectionReason, req.userId]
    );
    if (!r.rows.length) {
      // Distinguir 404 (no existe) vs 409 (estado incompatible) para que el front pueda mostrarlo bien.
      const exists = await pool.query("SELECT status FROM orders WHERE id = $1", [req.params.id]);
      if (!exists.rows.length) return res.status(404).json({ message: "Orden no encontrada" });
      return res.status(409).json({
        message: `La orden ya está '${exists.rows[0].status}' y no se puede rechazar`,
        currentStatus: exists.rows[0].status,
      });
    }
    const order = r.rows[0];

    // Notify the client about rejection via email and WhatsApp
    try {
      const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [order.user_id]);
      if (uRes.rows.length) {
        const u = uRes.rows[0];
        const userName = u.display_name || "Clienta";
        const rejMsg = `Hola ${userName} 👋\n\nTu comprobante de pago fue revisado y lamentablemente *no pudo ser aprobado*.\n\n📌 Motivo: ${rejectionReason}\n\nSi crees que es un error o tienes dudas, responde este mensaje. ¡Estamos para ayudarte! 💜`;

        // WhatsApp notification
        if (u.phone) {
          try {
            await sendConfiguredWhatsAppTemplate({
              templateKey: "transfer_rejected",
              phone: u.phone,
              vars: {
                name: userName,
                reason: rejectionReason,
              },
              fallbackMessage: rejMsg,
            });
          } catch (waErr) {
            console.error("[Reject WhatsApp]", waErr.response?.data || waErr.message);
          }
        }

        // Email notification
        if (u.email) {
          try {
            const { sendOrderRejected } = await import("./emailService.js").catch(() => ({}));
            if (typeof sendOrderRejected === "function") {
              await sendOrderRejected({ to: u.email, name: userName, reason: rejectionReason });
            }
          } catch (emailErr) {
            console.error("[Reject Email]", emailErr.message);
          }
        }
      }
    } catch (notifyErr) {
      console.error("[Reject notify]", notifyErr.message);
    }

    return res.json({ data: order });
  } catch (err) {
    console.error("PUT /admin/orders/:id/reject error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Payments admin ──────────────────────────────────────────────────────────

// GET /api/payments — el libro de cobros de la dueña: órdenes aprobadas,
// membresías viejas sin orden y, desde el bloque 3, los reembolsos como filas
// negativas en su fecha (auditoría 2026-09-27, P1-12). Cada orden trae su
// reembolso, su canal y su membresía para el diálogo "Reembolsar". `total` es neto.
app.get("/api/payments", ownerMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    // Un filtro basura daba 500 (Postgres rechazaba el uuid o la fecha). isDay
    // pide además que el día exista (ida y vuelta por Date): "2026-02-30" pasa
    // el formato pero Postgres lo rechaza.
    if (userId && !isUuid(String(userId))) return res.status(400).json({ message: "Identificador inválido" });
    for (const d of [startDate, endDate]) {
      if (d && !isDay(d)) return res.status(400).json({ message: "Fecha inválida (usa AAAA-MM-DD)." });
    }
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(req.query.limit ?? "200"), 10) || 200));
    const params = [];
    const filtros = (col, userCol) => {
      let w = "";
      if (startDate) { params.push(startDate); w += ` AND ${col} >= $${params.length}`; }
      // endDate inclusivo: hasta el final de ese día en la zona del estudio (la
      // conexión ya ancla TimeZone=STUDIO_TIMEZONE), no a la medianoche que lo
      // abre. "< día siguiente" en vez de "<= endDate" para no dejar fuera lo
      // que se cobró ese mismo día.
      if (endDate) { params.push(endDate); w += ` AND ${col} < ($${params.length}::date + INTERVAL '1 day')`; }
      if (userId) { params.push(userId); w += ` AND ${userCol} = $${params.length}`; }
      return w;
    };
    const ordenes = `
      SELECT o.id, o.user_id, u.display_name AS user_name, p.name AS plan_name,
             o.total_amount::numeric AS total_amount, o.payment_method::text AS method, o.status::text AS status,
             o.created_at, 'order'::text AS source, o.id AS order_id, o.channel::text AS channel,
             COALESCE(o.refunded_amount, 0)::numeric AS refunded_amount, o.refund_status::text AS refund_status,
             mm.id AS membership_id, mm.status::text AS membership_status, mm.classes_remaining, p.class_limit,
             NULL::text AS reason
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN plans p ON o.plan_id = p.id
        LEFT JOIN LATERAL (
          SELECT m.id, m.status, m.classes_remaining FROM memberships m
           WHERE m.order_id = o.id ORDER BY m.created_at ASC LIMIT 1
        ) mm ON true
       WHERE o.status = 'approved'${filtros("o.created_at", "o.user_id")}`;
    const membresias = `
      SELECT m.id, m.user_id, u.display_name AS user_name, p.name AS plan_name,
             p.price::numeric AS total_amount, m.payment_method::text AS method, m.status::text AS status,
             m.created_at, 'membership'::text AS source, NULL::uuid AS order_id, NULL::text AS channel,
             0::numeric AS refunded_amount, NULL::text AS refund_status,
             m.id AS membership_id, m.status::text AS membership_status, m.classes_remaining, p.class_limit,
             NULL::text AS reason
        FROM memberships m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.status = 'active' AND m.order_id IS NULL${filtros("m.created_at", "m.user_id")}`;
    const reembolsos = `
      SELECT r.id, r.user_id, u.display_name AS user_name, p.name AS plan_name,
             (-r.amount)::numeric AS total_amount, r.method::text AS method, 'refunded'::text AS status,
             r.created_at, 'refund'::text AS source, r.order_id, NULL::text AS channel,
             r.amount::numeric AS refunded_amount, NULL::text AS refund_status,
             r.membership_id, NULL::text AS membership_status, NULL::int AS classes_remaining, NULL::int AS class_limit,
             r.reason
        FROM refunds r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN plans p ON p.id = o.plan_id
       WHERE true${filtros("r.created_at", "r.user_id")}`;
    params.push(limit);
    const r = await pool.query(
      `(${ordenes}) UNION ALL (${membresias}) UNION ALL (${reembolsos}) ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    const total = round2(r.rows.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0));
    const refundsTotal = round2(r.rows.filter((o) => o.source === "refund").reduce((sum, o) => sum + parseFloat(o.refunded_amount || 0), 0));
    return res.json({
      data: r.rows.map((o) => ({
        ...o,
        userName: o.user_name,
        userId: o.user_id,
        planName: o.source === "refund" ? `Reembolso · ${o.plan_name ?? "orden"}` : o.plan_name,
        createdAt: o.created_at,
        orderId: o.order_id ?? null,
        refundedAmount: Number(o.refunded_amount ?? 0),
        refundStatus: o.refund_status ?? null,
        membershipId: o.membership_id ?? null,
        membershipStatus: o.membership_status ?? null,
        classesRemaining: o.classes_remaining ?? null,
        classLimit: o.class_limit ?? null,
      })),
      total,
      refundsTotal,
    });
  } catch (err) {
    console.error("[GET /payments]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Reembolsos (auditoría 2026-09-27, P1-12) ───────────────────────────────
// La dueña registra un reembolso total o parcial de una orden aprobada. El
// dinero se devuelve fuera del sistema (efectivo, transferencia o terminal):
// aquí no se llama a ninguna pasarela.
//   - Total: cancela la membresía de la orden, deja sus clases en 0 y cancela
//     sus reservas futuras (confirmadas y en fila), aunque la membresía ya
//     estuviera cancelada; los lugares suben la fila.
//   - Parcial: resta las clases que eligió la dueña; la membresía sigue activa.
// La orden queda approved con refunded_amount y refund_status; los reportes
// restan el reembolso en su fecha. Todo en una transacción con la orden
// bloqueada: dos totales a la vez no pasan (el segundo espera y da 409).
// Orden de candados: orden → reservas → membresía, el mismo que la subida de la
// lista de espera (clase → reservas de la fila → membresía). Si el reembolso
// tomara la membresía antes que las reservas, una subida que ya tiene la fila y
// va por la membresía de esta clienta se interbloquearía con él.
app.post("/api/admin/orders/:id/refunds", ownerMiddleware, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ message: "Identificador inválido" });
  const input = req.body || {};
  const client = await pool.connect();
  let released = false;
  try {
    await client.query("BEGIN");
    // 1. La orden, con candado.
    const o = await client.query(
      `SELECT o.id, o.user_id, o.status::text AS status, o.payment_method::text AS payment_method, o.channel,
              o.total_amount, COALESCE(o.refunded_amount, 0) AS refunded_amount, o.refund_status, o.order_number,
              p.name AS plan_name
         FROM orders o
         LEFT JOIN plans p ON p.id = o.plan_id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [req.params.id],
    );
    if (!o.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }
    const order = o.rows[0];
    // 2. El id de la membresía de la orden, sin candado todavía.
    const membershipId = (await client.query(
      `SELECT id FROM memberships WHERE order_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [order.id],
    )).rows[0]?.id ?? null;
    // 3. Si es total: sus reservas futuras confirmadas y en fila, con candado.
    let futuras = [];
    if (membershipId && input.kind === "total") {
      futuras = (await client.query(
        `SELECT b.id, b.class_id, b.status::text AS status
           FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.membership_id = $1 AND b.status IN ('confirmed', 'waitlist')
            AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') > NOW()
          ORDER BY b.id
          FOR UPDATE OF b`,
        [membershipId],
      )).rows;
    }
    // 4. Sólo entonces la membresía, con candado.
    const membership = membershipId
      ? (await client.query(
          `SELECT id, user_id, status::text AS status, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE`,
          [membershipId],
        )).rows[0] ?? null
      : null;
    // 5. Una reserva nueva toma la membresía antes de insertarse: la que se
    //    confirmó mientras esperábamos ese candado no salió en el paso 3. Con
    //    SKIP LOCKED no se espera a la que otra transacción ya tiene (una
    //    cancelación en curso, que va de la reserva a la membresía): esperarla
    //    teniendo la membresía sería un interbloqueo.
    //    Las saltadas no se pierden: la cancelación en curso termina sola; una
    //    subida de la fila que esperaba esta membresía la verá cancelada y se
    //    revierte, y la reserva que deja en 'waitlist' la cancela la sentencia
    //    del paso 7, después del COMMIT.
    if (membership && input.kind === "total") {
      const tarde = (await client.query(
        `SELECT b.id, b.class_id, b.status::text AS status
           FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.membership_id = $1 AND b.status IN ('confirmed', 'waitlist')
            AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') > NOW()
            AND NOT (b.id = ANY($2::uuid[]))
          ORDER BY b.id
          FOR UPDATE OF b SKIP LOCKED`,
        [membership.id, futuras.map((b) => b.id)],
      )).rows;
      futuras = futuras.concat(tarde);
    }
    const plan = refundPlan({ order, membership, input });
    if (!plan.ok) {
      await client.query("ROLLBACK");
      return res.status(plan.status).json({ ...(plan.code ? { code: plan.code } : {}), message: plan.message });
    }
    const why = cleanReason(input.reason);
    let membershipAfter = membership;
    let bookings = [];
    if (plan.kind === "total" && membership) {
      // Si ya estaba cancelada, conserva su fecha y su motivo de cancelación;
      // sólo le deja las clases en 0.
      membershipAfter = (await client.query(
        `UPDATE memberships
            SET cancelled_at = CASE WHEN status = 'cancelled' THEN cancelled_at ELSE NOW() END,
                cancellation_reason = CASE WHEN status = 'cancelled' THEN cancellation_reason ELSE $2 END,
                status = 'cancelled',
                classes_remaining = CASE WHEN classes_remaining IS NULL OR classes_remaining >= 9999
                                         THEN classes_remaining ELSE 0 END,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id, status::text AS status, classes_remaining`,
        [membership.id, `Reembolso total: ${why}`.slice(0, 500)],
      )).rows[0];
      await resyncMixtoBuckets(client, membership.id);
      if (futuras.length) {
        await client.query(
          `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancellation_reason = $3
            WHERE id = ANY($1::uuid[])`,
          [futuras.map((b) => b.id), req.userId, `Reembolso total: ${why}`.slice(0, 500)],
        );
        // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
        bookings = futuras;
      }
    } else if (plan.classesToRemove > 0) {
      membershipAfter = (await client.query(
        `UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - $2, 0), updated_at = NOW()
          WHERE id = $1
          RETURNING id, status::text AS status, classes_remaining`,
        [membership.id, plan.classesToRemove],
      )).rows[0];
      await resyncMixtoBuckets(client, membership.id);
    }
    const refund = (await client.query(
      `INSERT INTO refunds (order_id, membership_id, user_id, amount, kind, method, reference, reason,
                            classes_removed, membership_cancelled, bookings_cancelled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [order.id, membership?.id ?? null, order.user_id, plan.amount, plan.kind, plan.method, plan.reference, why,
       plan.classesToRemove, plan.cancelMembership, bookings.length, req.userId],
    )).rows[0];
    await client.query(
      `UPDATE orders SET refunded_amount = $2, refund_status = $3, refunded_at = NOW() WHERE id = $1`,
      [order.id, plan.newRefunded, plan.newStatus],
    );
    await recordAudit(client, {
      actorId: req.userId, action: "order.refund", entityType: "order", entityId: order.id, subjectUserId: order.user_id,
      reason: why,
      before: {
        refunded_amount: Number(order.refunded_amount), refund_status: order.refund_status ?? null,
        ...(membership ? { classes_remaining: membership.classes_remaining, membership_status: membership.status } : {}),
      },
      after: {
        refunded_amount: plan.newRefunded, refund_status: plan.newStatus,
        ...(membershipAfter ? { classes_remaining: membershipAfter.classes_remaining, membership_status: membershipAfter.status } : {}),
      },
      meta: {
        refund_id: refund.id, kind: plan.kind, amount: plan.amount, method: plan.method, reference: plan.reference,
        classes_removed: plan.classesToRemove, bookings_cancelled: bookings.length,
        order_number: order.order_number ?? null, plan_name: order.plan_name ?? null,
      },
    });
    await client.query("COMMIT");
    // La subida de la fila pide su propia conexión: se devuelve ésta antes.
    client.release();
    released = true;

    // 7. Filas en fila que siguen ligadas a la membresía reembolsada: las que el
    //    paso 5 saltó porque una subida las tenía y cuya subida se revirtió al
    //    ver la membresía cancelada. Best-effort, una sola sentencia fuera de la
    //    transacción: no vuelve a tomar la orden ni la membresía. Espera, a lo
    //    más, a que esa subida suelte la reserva.
    if (plan.kind === "total" && membership) {
      try {
        const sueltas = await pool.query(
          `UPDATE bookings b
              SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancellation_reason = $3
             FROM classes c
            WHERE c.id = b.class_id AND b.membership_id = $1 AND b.status = 'waitlist'
              AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') > NOW()
            RETURNING b.id`,
          [membership.id, req.userId, `Reembolso total: ${why}`.slice(0, 500)],
        );
        if (sueltas.rowCount) {
          console.warn(`[refunds] ${sueltas.rowCount} reserva(s) en fila de la membresía ${membership.id} se cancelaron después del COMMIT`);
        }
      } catch (e) {
        console.warn("[refunds] no se pudieron cancelar las filas sueltas:", e?.message);
      }
    }

    const freed = [...new Set(bookings.filter((b) => b.status === "confirmed").map((b) => b.class_id))];
    if (freed.length) await onSeatReleased(freed, { source: "refund" });
    if (order.user_id) triggerWalletPassSync(order.user_id, "refund");
    return res.status(201).json({
      data: {
        refund,
        order: { id: order.id, refunded_amount: plan.newRefunded, refund_status: plan.newStatus },
        membership: membershipAfter ?? null,
        bookings_cancelled: bookings.length,
      },
    });
  } catch (err) {
    if (!released) await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/orders/:id/refunds]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    if (!released) client.release();
  }
});

// ─── Discount codes admin CRUD ───────────────────────────────────────────────

// GET /api/discount-codes
app.get("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       ORDER BY dc.created_at DESC`
    );
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/discount-codes
app.post("/api/discount-codes", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType = "percent",
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive = true,
    } = req.body;
    if (!code || !discountValue) return res.status(400).json({ message: "Código y valor requeridos" });
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, studio, reformer_tower o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `INSERT INTO discount_codes (
         code, discount_type, discount_value, max_uses, expires_at,
         min_order_amount, plan_id, class_category, channel, is_active
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        code.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive,
      ]
    );
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.status(201).json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ message: "Código ya existe" });
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/discount-codes/:id
app.put("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxUses,
      expiresAt,
      minOrderAmount,
      minPurchaseAmount,
      planId,
      classCategory,
      channel,
      isActive,
    } = req.body;
    const normalizedType = normalizeDiscountType(discountType);
    if (!normalizedType) return res.status(400).json({ message: "Tipo de descuento inválido" });
    const normalizedMinOrder = Number(minOrderAmount ?? minPurchaseAmount ?? 0) || 0;
    const normalizedCategory =
      classCategory === undefined || classCategory === null || classCategory === ""
        ? null
        : normalizeClassCategory(classCategory, "__invalid__");
    if (normalizedCategory === "__invalid__") {
      return res.status(400).json({ message: "Categoría inválida. Usa: all, studio, reformer_tower o mixto." });
    }
    const normalizedChannel =
      channel === undefined || channel === null || channel === ""
        ? "all"
        : normalizeDiscountChannel(channel, "__invalid__");
    if (normalizedChannel === "__invalid__") {
      return res.status(400).json({ message: "Canal inválido. Usa: all, membership, pos o event." });
    }
    if (planId) {
      const planExists = await pool.query("SELECT id FROM plans WHERE id = $1", [planId]);
      if (!planExists.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    }
    const r = await pool.query(
      `UPDATE discount_codes SET code=$1, discount_type=$2, discount_value=$3, max_uses=$4,
       expires_at=$5, min_order_amount=$6, plan_id=$7, class_category=$8, channel=$9, is_active=$10, updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [
        code?.toUpperCase(),
        normalizedType,
        discountValue,
        maxUses || null,
        expiresAt || null,
        normalizedMinOrder,
        planId || null,
        normalizedCategory,
        normalizedChannel,
        isActive !== false,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Código no encontrado" });
    const enriched = await pool.query(
      `SELECT dc.*, p.name AS plan_name
       FROM discount_codes dc
       LEFT JOIN plans p ON p.id = dc.plan_id
       WHERE dc.id = $1`,
      [r.rows[0].id]
    );
    return res.json({ data: camelRow(enriched.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/discount-codes/:id
app.delete("/api/discount-codes/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM discount_codes WHERE id = $1", [req.params.id]);
    return res.json({ message: "Código eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Products CRUD (POS) ─────────────────────────────────────────────────────

// GET /api/products
app.get("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { search = "", active } = req.query;
    let q = "SELECT * FROM products WHERE 1=1";
    const params = [];
    if (search) { params.push(`%${search}%`); q += ` AND name ILIKE $${params.length}`; }
    if (active !== undefined) {
      params.push(String(active) === "true");
      q += ` AND is_active = $${params.length}`;
    }
    q += " ORDER BY created_at DESC";
    const r = await pool.query(q, params);
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/products
app.post("/api/products", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock = 0, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    if (!name) return res.status(400).json({ message: "Nombre requerido" });
    const r = await pool.query(
      "INSERT INTO products (name, price, category, stock, sku, is_active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [name, price || 0, category || "accesorios", stock, sku || null, isActive]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/products/:id
app.put("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, stock, sku } = req.body;
    const isActive = parseBooleanFlag(req.body?.isActive ?? req.body?.is_active ?? true);
    const r = await pool.query(
      "UPDATE products SET name=$1, price=$2, category=$3, stock=$4, sku=$5, is_active=$6, updated_at=NOW() WHERE id=$7 RETURNING *",
      [name, price, category, stock, sku || null, isActive, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Producto no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/products/:id
app.delete("/api/products/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    return res.json({ message: "Producto eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// (POST /api/pos/sale eliminado: era duplicado exacto de /api/pos/checkout
//  —el que usa el POS—; ambos llamaban a processPosSale.)

// ─── Loyalty admin ───────────────────────────────────────────────────────────

// GET /api/admin/loyalty/users — list users with points
app.get("/api/admin/loyalty/users", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT u.id, u.display_name, u.email,
              COALESCE(SUM(CASE WHEN lt.type='earn' THEN lt.points ELSE -lt.points END), 0) AS balance
       FROM users u
       LEFT JOIN loyalty_transactions lt ON lt.user_id = u.id
       WHERE u.role = 'client'
       GROUP BY u.id ORDER BY balance DESC LIMIT 50`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/adjust — manual points adjustment
app.post("/api/admin/loyalty/adjust", adminMiddleware, async (req, res) => {
  try {
    const { userId, points, reason, type = "earn" } = req.body;
    if (!userId || !points) return res.status(400).json({ message: "userId y points requeridos" });
    const r = await pool.query(
      "INSERT INTO loyalty_transactions (user_id, type, points, description, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [userId, type, Math.abs(points), reason || "Ajuste manual", req.userId]
    );
    triggerWalletPassSync(userId, "loyalty_adjust");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/loyalty/recalculate/:userId — award missing membership points retroactively
app.post("/api/admin/loyalty/recalculate/:userId", adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    // Get loyalty config
    const cfg = await getLoyaltyConfig();
    const ppp = Number(cfg.points_per_peso);
    if (cfg.enabled === false) return res.json({ data: { awarded: 0, message: "Loyalty desactivado en configuración" } });

    // Get all active/expired memberships for this user, con el total de la
    // orden ligada (si la hay): una cortesía es una orden en $0 y no debe
    // recibir puntos retroactivos.
    const mRes = await pool.query(
      `SELECT m.id, p.price, p.name, o.total_amount
       FROM memberships m
       JOIN plans p ON m.plan_id = p.id
       LEFT JOIN orders o ON o.id = m.order_id
       WHERE m.user_id = $1 AND m.status IN ('active','expired')`,
      [userId]
    );
    if (!mRes.rows.length) return res.json({ data: { awarded: 0, message: "No hay membresías para recalcular" } });

    // Check which memberships already have a loyalty transaction
    const txRes = await pool.query(
      "SELECT description FROM loyalty_transactions WHERE user_id=$1 AND type='earn'",
      [userId]
    );
    const existingDescs = new Set(txRes.rows.map((r) => r.description));

    let awarded = 0;
    for (const m of mRes.rows) {
      const desc = `Membresía asignada — ${m.name} ($${m.price})`;
      // Skip if already awarded for this membership (by description match)
      if (existingDescs.has(desc)) continue;
      // Cortesía (orden ligada en $0): sin puntos, sin movimiento.
      const orderAmount = m.total_amount == null ? null : Number(m.total_amount);
      if (orderAmount === 0) continue;
      const charged = orderAmount != null ? orderAmount : parseFloat(m.price);
      const pts = Math.floor(charged * ppp);
      if (pts <= 0) continue;
      await pool.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
        [userId, pts, desc]
      );
      awarded += pts;
    }

    if (awarded > 0) {
      triggerWalletPassSync(userId, "loyalty_recalculate");
    }
    return res.json({ data: { awarded, message: awarded > 0 ? `Se otorgaron ${awarded} puntos retroactivos` : "Todos los puntos ya estaban registrados" } });
  } catch (err) {
    console.error("[Recalculate loyalty]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Instructors / Staff ─────────────────────────────────────────────────────

// GET /api/instructors
app.get("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM instructors ORDER BY created_at DESC");
    return res.json({ data: camelRows(r.rows) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/instructors
app.post("/api/instructors", adminMiddleware, async (req, res) => {
  try {
    const { displayName, email, phone, bio, specialties, isActive = true, photoFocusX = 50, photoFocusY = 50 } = req.body;
    if (!displayName) return res.status(400).json({ message: "Nombre requerido" });
    const specialtiesValue = serializeSpecialtiesForDb(specialties);
    const safeFocusX = Math.max(0, Math.min(100, Number(photoFocusX || 50)));
    const safeFocusY = Math.max(0, Math.min(100, Number(photoFocusY || 50)));
    const r = await pool.query(
      "INSERT INTO instructors (display_name, email, phone, bio, specialties, is_active, photo_focus_x, photo_focus_y) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [displayName, email || null, phone || null, bio || null, specialtiesValue, isActive, safeFocusX, safeFocusY]
    );
    return res.status(201).json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/instructors/:id
app.put("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    // PUT parcial: un cuerpo que no menciona un campo NO debe borrarlo. Antes
    // este UPDATE era de reemplazo y cambiar sólo el nombre dejaba email,
    // teléfono y bio en NULL devolviendo 200. Auditoría 2026-09-08, P1-2.
    const { displayName, email, phone, bio, specialties, isActive, photoFocusX, photoFocusY } = req.body;
    const has = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
    const clampFocus = (v) => Math.max(0, Math.min(100, Number(v ?? 50)));
    const r = await pool.query(
      `UPDATE instructors SET
         display_name  = COALESCE($1, display_name),
         email         = CASE WHEN $2::boolean THEN $3 ELSE email END,
         phone         = CASE WHEN $4::boolean THEN $5 ELSE phone END,
         bio           = CASE WHEN $6::boolean THEN $7 ELSE bio END,
         specialties   = CASE WHEN $8::boolean THEN $9 ELSE specialties END,
         is_active     = COALESCE($10, is_active),
         photo_focus_x = COALESCE($11, photo_focus_x),
         photo_focus_y = COALESCE($12, photo_focus_y),
         updated_at    = NOW()
       WHERE id=$13 RETURNING *`,
      [
        displayName ?? null,
        has("email"), email || null,
        has("phone"), phone || null,
        has("bio"), bio || null,
        has("specialties"), has("specialties") ? serializeSpecialtiesForDb(specialties) : null,
        isActive === undefined ? null : isActive !== false,
        has("photoFocusX") ? clampFocus(photoFocusX) : null,
        has("photoFocusY") ? clampFocus(photoFocusY) : null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/instructors/:id
app.delete("/api/instructors/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM instructors WHERE id = $1", [req.params.id]);
    return res.json({ message: "Instructor eliminado" });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// Public studio photos use separate credentials from videos and documents.
app.post("/api/photos/upload", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Debes adjuntar una imagen" });
    if (!isGoogleDriveConfigured()) return res.status(503).json({ message: "Almacenamiento de fotos no disponible" });
    const { fileId } = await uploadBufferToGoogleDrive(req.file.buffer, `studio_${Date.now()}`, req.file.mimetype);
    return res.json({ fileId, url: `https://lh3.googleusercontent.com/d/${fileId}=w1600` });
  } catch (error) { return res.status(503).json({ message: "No se pudo guardar la foto. Intenta de nuevo." }); }
});

// POST /api/instructors/:id/photo — upload instructor photo to Google Drive
app.post("/api/instructors/:id/photo", adminMiddleware, upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No se envió archivo" });
    const instructorId = req.params.id;

    const photoUrl = await storeProfilePhoto({ buffer: req.file.buffer, mimeType: req.file.mimetype, ext: 'image' }, instructorId);

    // slot=2 actualiza la foto secundaria (la del hover/click); por defecto la principal.
    // Columna en whitelist — sin riesgo de inyección.
    const photoColumn = String(req.query.slot || "1") === "2" ? "photo_url_2" : "photo_url";
    const r = await pool.query(
      `UPDATE instructors SET ${photoColumn}=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [photoUrl, instructorId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    return res.json({ data: camelRow(r.rows[0]) });
  } catch (err) {
    console.error("Instructor photo upload error:", err);
    return res.status(500).json({ message: err.message || "Error al subir foto" });
  }
});

// POST /api/instructors/:id/magic-link — generate a one-time login link for an instructor
app.post("/api/instructors/:id/magic-link", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("SELECT * FROM instructors WHERE id = $1", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Instructor no encontrado" });
    const ins = r.rows[0];
    // Find or create a user account for this instructor
    let userRow = null;
    if (ins.email) {
      const uRes = await pool.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [ins.email]);
      if (uRes.rows.length) {
        userRow = uRes.rows[0];
      } else {
        // Create a user for the instructor
        const newU = await pool.query(
          `INSERT INTO users (email, display_name, role, is_verified) VALUES ($1, $2, 'instructor', true) RETURNING *`,
          [ins.email, ins.display_name]
        );
        userRow = newU.rows[0];
      }
    }
    if (!userRow) return res.status(400).json({ message: "El instructor necesita un email para generar magic link" });
    // Generate a short-lived JWT
    const token = jwt.sign({ userId: userRow.id, role: userRow.role, type: "magic_link" }, JWT_SECRET, { expiresIn: "24h" });
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const link = `${baseUrl}/auth/magic?token=${token}`;
    return res.json({ data: { link } });
  } catch (err) {
    console.error("magic-link error:", err);
    return res.status(500).json({ message: "Error al generar magic link" });
  }
});


// (GET /api/admin/reports eliminado: reporte legacy no usado por el frontend,
//  que consume /api/reports/* —overview, revenue, classes, retention, etc.)

// ─── Classes admin ──────────────────────────────────────────────────────────

// GET /api/admin/classes — all scheduled classes
app.get("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, instructorId } = req.query;
    let q = `SELECT c.*, ct.name AS class_type_name, i.display_name AS instructor_name
             FROM classes c
             LEFT JOIN class_types ct ON c.class_type_id = ct.id
             LEFT JOIN instructors i ON c.instructor_id = i.id
             WHERE 1=1`;
    const params = [];
    if (startDate) { params.push(startDate); q += ` AND c.date >= $${params.length}`; }
    if (endDate) { params.push(endDate); q += ` AND c.date <= $${params.length}`; }
    if (instructorId) { params.push(instructorId); q += ` AND c.instructor_id = $${params.length}`; }
    q += " ORDER BY c.date ASC, c.start_time ASC LIMIT 200";
    const r = await pool.query(q, params);
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// POST /api/admin/classes — create a class
app.post("/api/admin/classes", adminMiddleware, async (req, res) => {
  try {
    const { classTypeId, instructorId, startTime, endTime, capacity = 5, location, notes } = req.body;
    if (!classTypeId || !startTime) return res.status(400).json({ message: "classTypeId y startTime requeridos" });
    const r = await pool.query(
      `INSERT INTO classes (class_type_id, instructor_id, start_time, end_time, capacity, location, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *`,
      [classTypeId, instructorId || null, startTime, endTime || null, capacity, location || null, notes || null]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/classes/:id — actualiza una clase específica (no el tipo).
// Body: { classTypeId?, instructorId?, startTime?, endTime?, maxCapacity?,
//         capacity?, status?, notes? }
// Tanto `maxCapacity` como `capacity` se mapean a la columna max_capacity.
// Si el nuevo max_capacity es MENOR al conteo real de reservas activas, se
// rechaza para no dejar bookings "fuera del cupo" silenciosamente.
app.put("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  try {
    const {
      classTypeId, instructorId, startTime, endTime,
      maxCapacity, capacity, status, notes,
    } = req.body || {};

    // Cancelar tiene su propia cascada (PUT /api/classes/:id/cancel) que
    // reembolsa y avisa. Por aquí NO se permite, para no dejar reservas activas
    // en una clase 'cancelled' sin devolver crédito. 'closed' (cerrar) sí.
    if (status === "cancelled") {
      return res.status(400).json({
        message: "Para cancelar usa la opción Cancelar clase (devuelve créditos y avisa a las alumnas).",
      });
    }

    // Acepta cualquiera de los dos nombres para no romper consumidores viejos.
    const newCap = maxCapacity ?? capacity;
    if (newCap != null) {
      const capNum = Number(newCap);
      if (!Number.isFinite(capNum) || capNum < 1) {
        return res.status(400).json({ message: "El cupo debe ser un número >= 1" });
      }
      const occupied = await liveBookingCount(req.params.id);
      if (capNum < occupied) {
        return res.status(400).json({
          message: `No puedes bajar el cupo a ${capNum}: la clase ya tiene ${occupied} reserva${occupied === 1 ? "" : "s"} activa${occupied === 1 ? "" : "s"}.`,
        });
      }
    }

    // startTime/endTime pueden venir como datetime-local "YYYY-MM-DDTHH:mm".
    // La tabla usa columnas DATE y TIME separadas → hay que separarlas. Antes se
    // escribía el ISO completo en la columna TIME y nunca se tocaba `date`, por
    // eso editar (reprogramar) una clase fallaba o corrompía la hora.
    let dateStr = null, startTimeStr = null, endTimeStr = null;
    if (startTime) {
      const s = String(startTime);
      if (s.includes("T")) { const [d, t] = s.split("T"); dateStr = d; startTimeStr = t.slice(0, 5); }
      else if (s.length >= 5) { startTimeStr = s.slice(0, 5); }
    }
    if (endTime) {
      const e = String(endTime);
      endTimeStr = e.includes("T") ? e.split("T")[1].slice(0, 5) : (e.length >= 5 ? e.slice(0, 5) : null);
    }
    if (startTimeStr && endTimeStr && endTimeStr <= startTimeStr) {
      return res.status(400).json({ message: "La hora de fin debe ser posterior a la de inicio." });
    }

    // Cupo y estado de antes: sólo se sube la fila si la edición libera lugar.
    const prev = (await pool.query(
      "SELECT max_capacity, status::text AS status FROM classes WHERE id = $1", [req.params.id],
    )).rows[0];
    if (!prev) return res.status(404).json({ message: "Clase no encontrada" });

    const r = await pool.query(
      `UPDATE classes SET
         class_type_id = COALESCE($1, class_type_id),
         instructor_id = COALESCE($2, instructor_id),
         date          = COALESCE($3, date),
         start_time    = COALESCE($4, start_time),
         end_time      = COALESCE($5, end_time),
         max_capacity  = COALESCE($6, max_capacity),
         status        = COALESCE($7, status),
         notes         = COALESCE($8, notes),
         updated_at    = NOW()
       WHERE id = $9 RETURNING *`,
      [
        classTypeId || null, instructorId || null,
        dateStr, startTimeStr, endTimeStr,
        newCap != null ? Number(newCap) : null,
        status || null, notes ?? null,
        req.params.id,
      ]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Clase no encontrada" });
    // Sube la fila sólo si hay lugares nuevos (el cupo aumentó) o la clase
    // pasó de 'closed' a 'scheduled'. Cambiar la coach, la hora o las notas no
    // libera nada: no debe inscribir a nadie ni descontarle una clase.
    const promoted = classEditReleasesSeats({ before: prev, after: r.rows[0] })
      ? await onSeatReleased([req.params.id], { source: "capacity" })
      : [];
    return res.json({ data: r.rows[0], waitlist_promoted: promoted });
  } catch (err) {
    console.error("[PUT /admin/classes/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/admin/classes/:id — sólo borra una clase sin ninguna reserva (de
// ningún estado): borrarla con reservas se llevaba su historial en cascada. Con
// reservas se cancela (PUT /api/classes/:id/cancel). Auditoría 2026-09-27, P1-5.
app.delete("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT c.id, to_char(c.date, 'YYYY-MM-DD') AS day, c.start_time, c.status::text AS status
         FROM classes c WHERE c.id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = cur.rows[0];
    // NOT EXISTS dentro del propio DELETE (no un SELECT COUNT aparte): si algo
    // reserva la clase entre el SELECT de arriba y aquí, esta consulta ya no
    // borra nada — nunca una foto vieja del conteo.
    const del = await client.query(
      `DELETE FROM classes c WHERE c.id = $1 AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id)`,
      [cls.id],
    );
    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "CLASS_HAS_BOOKINGS", message: "Esta clase tiene reservas o historial: cancélala en lugar de borrarla." });
    }
    await recordAudit(client, {
      actorId: req.userId, action: "class.delete", entityType: "class", entityId: cls.id,
      before: { day: cls.day, start_time: String(cls.start_time).slice(0, 5), status: cls.status },
      meta: { source: "manual" },
    });
    await client.query("COMMIT");
    return res.json({ message: "Clase eliminada" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "23503") {
      return res.status(409).json({ code: "CLASS_HAS_BOOKINGS", message: "La clase tiene registros ligados: cancélala en lugar de borrarla." });
    }
    console.error("[DELETE /admin/classes/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});

// POST /api/admin/classes/generate — OBSOLETO. La app usa POST /api/classes/generate
// (transaccional, modo formulario). Se conserva como 410 para evitar mantener dos
// generadores casi-iguales con comportamiento divergente.
app.post("/api/admin/classes/generate", adminMiddleware, async (_req, res) => {
  return res.status(410).json({ message: "Endpoint obsoleto. Usa POST /api/classes/generate." });
});

// GET /api/admin/referrals
app.get("/api/admin/referrals", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rc.*, u.display_name AS user_name, u.email,
              COUNT(r2.id) AS referral_count
       FROM referral_codes rc
       LEFT JOIN users u ON rc.user_id = u.id
       LEFT JOIN referrals r2 ON r2.referral_code_id = rc.id
       GROUP BY rc.id, u.display_name, u.email
       ORDER BY referral_count DESC`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// GET /api/admin/reviews
app.get("/api/admin/reviews", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT rv.*,
              u.display_name AS user_name,
              u.email,
              i.display_name AS instructor_name,
              ct.name AS class_type_name,
              c.date AS class_date,
              c.start_time AS class_start_time
       FROM reviews rv
       LEFT JOIN users u ON rv.user_id = u.id
       LEFT JOIN bookings b ON rv.booking_id = b.id
       LEFT JOIN classes c ON c.id = COALESCE(rv.class_id, b.class_id)
       LEFT JOIN class_types ct ON c.class_type_id = ct.id
       LEFT JOIN instructors i ON i.id = COALESCE(rv.instructor_id, c.instructor_id)
       ORDER BY rv.created_at DESC LIMIT 100`
    );
    return res.json({ data: r.rows });
  } catch (err) {
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/reviews/:id/approve
app.put("/api/admin/reviews/:id/approve", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("UPDATE reviews SET is_approved=true WHERE id=$1 RETURNING *", [req.params.id]);
    return res.json({ data: r.rows[0] });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// DELETE /api/admin/reviews/:id
app.delete("/api/admin/reviews/:id", adminMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM reviews WHERE id = $1", [req.params.id]);
    return res.json({ message: "Reseña eliminada" });
  } catch (err) { return res.status(500).json({ message: "Error interno" }); }
});

// ─── MÓDULO DE EVENTOS ────────────────────────────────────────────────────────

/** Helper: normalize a DB row to camelCase API shape */
function mapEventRow(row) {
  const toYMD = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.slice(0, 10);
    return new Date(v).toISOString().slice(0, 10);
  };
  const toHM = (v) => {
    if (!v) return null;
    return String(v).slice(0, 5);
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    instructor: row.instructor_name,
    instructorPhoto: row.instructor_photo || null,
    date: toYMD(row.date),
    startTime: toHM(row.start_time),
    endTime: toHM(row.end_time),
    location: row.location,
    capacity: Number(row.capacity),
    registered: Number(row.registered || 0),
    price: Number(row.price || 0),
    currency: row.currency || "MXN",
    earlyBirdPrice: row.early_bird_price != null ? Number(row.early_bird_price) : null,
    earlyBirdDeadline: toYMD(row.early_bird_deadline),
    memberDiscount: Number(row.member_discount || 0),
    image: row.image || null,
    requirements: row.requirements || "",
    includes: Array.isArray(row.includes) ? row.includes : (row.includes ? JSON.parse(row.includes) : []),
    tags: Array.isArray(row.tags) ? row.tags : (row.tags ? JSON.parse(row.tags) : []),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    name: row.name,
    email: row.email,
    phone: row.phone || "",
    status: row.status,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || null,
    paymentReference: row.payment_reference || null,
    hasPaymentProof: !!row.payment_proof_url,
    paymentProofFileName: row.payment_proof_file_name || null,
    transferDate: row.transfer_date ? String(row.transfer_date).slice(0, 10) : null,
    paidAt: row.paid_at || null,
    checkedIn: !!row.checked_in,
    checkedInAt: row.checked_in_at || null,
    waitlistPosition: row.waitlist_position || null,
    notes: row.notes || null,
    eventPassId: row.event_pass_id || null,
    eventPassCode: row.event_pass_code || null,
    eventPassStatus: row.event_pass_status || null,
    eventPassIssuedAt: row.event_pass_issued_at || null,
    eventPassUsedAt: row.event_pass_used_at || null,
    createdAt: row.created_at,
  };
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeDecodeBase64ToText(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return Buffer.from(padded, "base64").toString("utf8").trim();
  } catch (_) {
    return "";
  }
}

function extractScanTokens(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) return [];
  const tokens = new Set([raw]);
  const passCodeMatch = raw.match(/EV-[A-Z0-9-]{6,}/i);
  if (passCodeMatch) tokens.add(passCodeMatch[0].toUpperCase());
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const params = parsed.searchParams;
      ["code", "pass", "passCode", "qr", "id", "user", "userId", "token"].forEach((key) => {
        const value = params.get(key);
        if (value) tokens.add(value.trim());
      });
      parsed.pathname
        .split("/")
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => tokens.add(part));
    } catch (_) {
      // ignore malformed URLs from third-party scanners
    }
  }
  return [...tokens].filter(Boolean);
}

function extractUserIdFromToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  if (UUID_V4_RE.test(raw)) return raw;
  const decoded = safeDecodeBase64ToText(raw);
  if (UUID_V4_RE.test(decoded)) return decoded;
  return null;
}

async function resolveEventRegistrationFromScanCode(eventId, rawCode) {
  const tokens = extractScanTokens(rawCode);
  if (!tokens.length) return null;

  for (const token of tokens) {
    const byEventPass = await pool.query(
      `SELECT er.*
         FROM event_registrations er
         JOIN event_passes ep ON ep.registration_id = er.id
        WHERE er.event_id = $1
          AND UPPER(ep.pass_code) = UPPER($2)
        LIMIT 1`,
      [eventId, token],
    );
    if (byEventPass.rows.length) {
      return { registration: byEventPass.rows[0], source: "event_pass" };
    }
  }

  for (const token of tokens) {
    if (!UUID_V4_RE.test(token)) continue;
    const byRegId = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND id = $2
        LIMIT 1`,
      [eventId, token],
    );
    if (byRegId.rows.length) {
      return { registration: byRegId.rows[0], source: "registration_id" };
    }
  }

  for (const token of tokens) {
    const userId = extractUserIdFromToken(token);
    if (!userId) continue;
    const byUser = await pool.query(
      `SELECT *
         FROM event_registrations
        WHERE event_id = $1 AND user_id = $2 AND status != 'cancelled'
        ORDER BY CASE WHEN status = 'confirmed' THEN 0 WHEN status = 'pending' THEN 1 ELSE 2 END, created_at DESC
        LIMIT 1`,
      [eventId, userId],
    );
    if (byUser.rows.length) {
      return { registration: byUser.rows[0], source: "wallet_user_qr" };
    }
  }

  return null;
}

async function performEventCheckin({ eventId, registrationId, adminUserId, source = "manual" }) {
  const regRes = await pool.query(
    `SELECT *
       FROM event_registrations
      WHERE id = $1 AND event_id = $2
      LIMIT 1`,
    [registrationId, eventId],
  );
  if (!regRes.rows.length) {
    return { ok: false, code: "not_found", status: 404, message: "Inscripción no encontrada" };
  }
  const reg = regRes.rows[0];
  if (reg.status !== "confirmed") {
    return { ok: false, code: "not_confirmed", status: 409, message: "Solo puedes hacer check-in a inscripciones confirmadas", registration: reg };
  }
  if (reg.checked_in) {
    return { ok: true, alreadyCheckedIn: true, registration: reg, source };
  }

  const upd = await pool.query(
    `UPDATE event_registrations
        SET checked_in = true,
            checked_in_at = NOW(),
            checked_in_by = $1,
            updated_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [adminUserId, registrationId],
  );
  const updated = upd.rows[0];
  await markEventPassUsedByRegistration({ registrationId: updated.id }).catch(() => { });
  triggerWalletPassSync(updated.user_id, "event_checked_in");
  return { ok: true, alreadyCheckedIn: false, registration: updated, source };
}

// ── GET /api/events — Lista pública (solo published) ──────────────────────────
app.get("/api/events", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
      } catch { }
    }
    const { type, upcoming } = req.query;
    const conditions = ["e.status = 'published'"];
    const params = [];
    if (type) { conditions.push(`e.type = $${params.length + 1}`); params.push(type); }
    if (upcoming === "true") { conditions.push(`e.date >= CURRENT_DATE`); }
    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const rows = await pool.query(
      `SELECT * FROM events e ${where} ORDER BY e.date ASC, e.start_time ASC`,
      params
    );
    return res.json(rows.rows.map(mapEventRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/admin/all — Todos los eventos con inscripciones ──────────
app.get("/api/events/admin/all", adminMiddleware, async (req, res) => {
  try {
    const evRows = await pool.query(
      `SELECT * FROM events ORDER BY date DESC, start_time DESC`
    );
    const regRows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       ORDER BY er.created_at ASC`
    );
    const regsByEvent = {};
    for (const r of regRows.rows) {
      if (!regsByEvent[r.event_id]) regsByEvent[r.event_id] = [];
      regsByEvent[r.event_id].push(mapRegRow(r));
    }
    const events = evRows.rows.map((e) => ({
      ...mapEventRow(e),
      registrations: regsByEvent[e.id] || [],
    }));
    return res.json(events);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id — Detalle de evento ───────────────────────────────────
app.get("/api/events/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    let userId = null;
    let isAdmin = false;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded?.sub || decoded?.userId || null;
        isAdmin = decoded?.role === "admin" || decoded?.role === "super_admin";
      } catch { }
    }
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    const ev = evRes.rows[0];
    if (!isAdmin && ev.status !== "published") return res.status(404).json({ message: "Evento no disponible" });
    const result = mapEventRow(ev);
    if (userId) {
      const regRes = await pool.query(
        `SELECT er.*,
                ep.id AS event_pass_id,
                ep.pass_code AS event_pass_code,
                ep.status AS event_pass_status,
                ep.issued_at AS event_pass_issued_at,
                ep.used_at AS event_pass_used_at
           FROM event_registrations er
           LEFT JOIN event_passes ep ON ep.registration_id = er.id
          WHERE er.event_id = $1 AND er.user_id = $2 AND er.status != 'cancelled'
          LIMIT 1`,
        [req.params.id, userId]
      );
      result.myRegistration = regRes.rows.length ? mapRegRow(regRes.rows[0]) : null;
    }
    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events — Crear evento ──────────────────────────────────────────
app.post("/api/events", adminMiddleware, async (req, res) => {
  try {
    const {
      type, title, description, instructor_name, instructor_photo,
      date, start_time, end_time, location, capacity = 12, price = 0,
      early_bird_price, early_bird_deadline, member_discount = 0,
      image, requirements = "", includes = [], tags = [],
      status = "draft",
    } = req.body;
    if (!type || !title || !description || !instructor_name || !date || !start_time || !end_time || !location) {
      return res.status(400).json({ message: "Faltan campos requeridos" });
    }
    const r = await pool.query(
      `INSERT INTO events (type, title, description, instructor_name, instructor_photo,
        date, start_time, end_time, location, capacity, price, early_bird_price,
        early_bird_deadline, member_discount, image, requirements, includes, tags,
        status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        type, title, description, instructor_name, await storePhotoReference(instructor_photo) || null,
        date, start_time, end_time, location, capacity, price,
        early_bird_price || null, early_bird_deadline || null, member_discount,
        await storePhotoReference(image) || null, requirements,
        JSON.stringify(Array.isArray(includes) ? includes.filter(Boolean) : []),
        JSON.stringify(Array.isArray(tags) ? tags.filter(Boolean) : []),
        status, req.userId,
      ]
    );
    return res.status(201).json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id — Actualizar evento ───────────────────────────────────
app.put("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const allowed = [
      "type", "title", "description", "instructor_name", "instructor_photo",
      "date", "start_time", "end_time", "location", "capacity", "price",
      "early_bird_price", "early_bird_deadline", "member_discount", "image",
      "requirements", "includes", "tags", "status",
    ];
    const sets = [];
    const vals = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        vals.push(["includes", "tags"].includes(key) ? JSON.stringify(req.body[key]) : ["image", "instructor_photo"].includes(key) ? await storePhotoReference(req.body[key]) : req.body[key]);
        sets.push(`${key} = $${vals.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ message: "Nada que actualizar" });
    vals.push(req.params.id);
    sets.push("updated_at = NOW()");
    const r = await pool.query(
      `UPDATE events SET ${sets.join(", ")} WHERE id = $${vals.length} RETURNING *`,
      vals
    );
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json(mapEventRow(r.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id — Eliminar evento ──────────────────────────────────
app.delete("/api/events/:id", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query("DELETE FROM events WHERE id = $1 RETURNING id", [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ message: "Evento no encontrado" });
    return res.json({ message: "Evento eliminado" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:id/register — Inscribirse ───────────────────────────────
app.post("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, phone = "", payment_method } = req.body;
    if (!name || !email) return res.status(400).json({ message: "name y email son requeridos" });
    const evRes = await pool.query("SELECT * FROM events WHERE id = $1 AND status = 'published'", [req.params.id]);
    if (!evRes.rows.length) return res.status(404).json({ message: "Evento no disponible" });
    const ev = evRes.rows[0];

    // Check existing registration
    const existingRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id = $1 AND user_id = $2 LIMIT 1",
      [req.params.id, userId]
    );
    const existing = existingRes.rows[0];
    if (existing && existing.status !== "cancelled") {
      return res.status(400).json({ message: "Ya estás inscrito en este evento" });
    }

    // Calculate price
    let amount = Number(ev.price);
    const now = new Date();
    if (ev.early_bird_price != null && ev.early_bird_deadline) {
      const deadline = new Date(ev.early_bird_deadline);
      if (now <= deadline) amount = Number(ev.early_bird_price);
    }
    if (Number(ev.member_discount) > 0) {
      const memRes = await pool.query(
        `SELECT id FROM memberships WHERE user_id = $1 AND status = 'active' AND end_date >= CURRENT_DATE LIMIT 1`,
        [userId]
      );
      if (memRes.rows.length) {
        amount = Math.round(amount * (1 - Number(ev.member_discount) / 100));
      }
    }

    // Determine status
    const regCount = await pool.query(
      "SELECT COUNT(*) FROM event_registrations WHERE event_id = $1 AND status = 'confirmed'",
      [req.params.id]
    );
    const confirmedCount = Number(regCount.rows[0].count);
    let regStatus = "pending";
    let waitlistPosition = null;
    let paidAt = null;
    if (confirmedCount >= Number(ev.capacity)) {
      regStatus = "waitlist";
      const wlRes = await pool.query(
        "SELECT COALESCE(MAX(waitlist_position), 0) + 1 AS pos FROM event_registrations WHERE event_id = $1 AND status = 'waitlist'",
        [req.params.id]
      );
      waitlistPosition = wlRes.rows[0].pos;
    } else if (amount === 0) {
      regStatus = "confirmed";
      paidAt = new Date();
    }

    let reg;
    if (existing && existing.status === "cancelled") {
      const r = await pool.query(
        `UPDATE event_registrations SET name=$1, email=$2, phone=$3, status=$4, amount=$5,
         payment_method=$6, payment_reference=NULL, payment_proof_url=NULL,
         payment_proof_file_name=NULL, transfer_date=NULL,
         paid_at=$7, waitlist_position=$8, checked_in=false, checked_in_at=NULL, updated_at=NOW()
         WHERE id=$9 RETURNING *`,
        [name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition, existing.id]
      );
      reg = r.rows[0];
    } else {
      const r = await pool.query(
        `INSERT INTO event_registrations (event_id, user_id, name, email, phone, status, amount, payment_method, paid_at, waitlist_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [req.params.id, userId, name, email, phone, regStatus, amount, payment_method || null, paidAt, waitlistPosition]
      );
      reg = r.rows[0];
    }

    // Update registered count if confirmed
    if (regStatus === "confirmed") {
      await pool.query(
        "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
        [req.params.id]
      );
    }

    let issuedPass = null;
    if (regStatus === "confirmed" && reg.user_id) {
      issuedPass = await ensureEventPassForRegistration({
        eventId: req.params.id,
        registrationId: reg.id,
        userId: reg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on register:", passErr?.message || passErr);
        return null;
      });
    } else {
      await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    }

    if (regStatus === "confirmed" && reg.user_id) {
      notifyEventRegistered(reg.user_id, { eventTitle: ev.title }).catch(() => {});
    }

    let message;
    if (regStatus === "waitlist") message = `Te agregamos a la lista de espera (posición ${waitlistPosition})`;
    else if (amount === 0) message = "¡Registro confirmado! Te esperamos en el evento.";
    else if (payment_method === "cash") message = "Registro pendiente. Puedes pagar en recepción del studio para confirmar tu lugar.";
    else message = "Registro pendiente de pago. Una vez confirmado tu pago, recibirás la confirmación.";

    return res.status(201).json({
      id: reg.id,
      status: reg.status,
      amount: Number(reg.amount),
      isFree: amount === 0,
      waitlistPosition,
      passCode: issuedPass?.pass_code ?? null,
      message,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── DELETE /api/events/:id/register — Cancelar inscripción ───────────────────
app.delete("/api/events/:id/register", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length) return res.status(404).json({ message: "No tienes inscripción en este evento" });
    const reg = regRes.rows[0];
    if (!["confirmed", "pending", "waitlist"].includes(reg.status)) {
      return res.status(400).json({ message: "No puedes cancelar este registro" });
    }
    await pool.query(
      "UPDATE event_registrations SET status='cancelled', updated_at=NOW() WHERE id=$1",
      [reg.id]
    );
    await cancelEventPassByRegistration({ registrationId: reg.id }).catch(() => { });
    await pool.query(
      "UPDATE events SET registered = GREATEST(0, (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed')) WHERE id=$1",
      [req.params.id]
    );
    return res.json({ message: "Registro cancelado exitosamente" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── GET /api/events/:id/registrations — Inscripciones admin ──────────────────
app.get("/api/events/:id/registrations", adminMiddleware, async (req, res) => {
  try {
    const rows = await pool.query(
      `SELECT er.*, u.display_name,
              ep.id AS event_pass_id,
              ep.pass_code AS event_pass_code,
              ep.status AS event_pass_status,
              ep.issued_at AS event_pass_issued_at,
              ep.used_at AS event_pass_used_at
         FROM event_registrations er
       LEFT JOIN users u ON er.user_id = u.id
       LEFT JOIN event_passes ep ON ep.registration_id = er.id
       WHERE er.event_id = $1 ORDER BY er.created_at ASC`,
      [req.params.id]
    );
    return res.json(rows.rows.map(mapRegRow));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:eventId/registrations/:regId — Actualizar status ─────────
app.put("/api/events/:eventId/registrations/:regId", adminMiddleware, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const valid = ["confirmed", "pending", "waitlist", "cancelled", "no_show"];
    if (status && !valid.includes(status)) {
      return res.status(400).json({ message: "Status inválido" });
    }
    const sets = ["updated_at=NOW()"];
    const vals = [];
    if (status) {
      vals.push(status);
      sets.push(`status=$${vals.length}`);
      if (status === "confirmed") {
        sets.push("paid_at = COALESCE(paid_at, NOW())");
      }
    }
    if (notes !== undefined) {
      vals.push(notes);
      sets.push(`notes=$${vals.length}`);
    }
    vals.push(req.params.regId);
    const r = await pool.query(
      `UPDATE event_registrations SET ${sets.join(",")} WHERE id=$${vals.length} AND event_id=$${vals.length + 1} RETURNING *`,
      [...vals, req.params.eventId]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Inscripción no encontrada" });
    // Refresh registered count
    await pool.query(
      "UPDATE events SET registered = (SELECT COUNT(*) FROM event_registrations WHERE event_id=$1 AND status='confirmed') WHERE id=$1",
      [req.params.eventId]
    );
    const updatedReg = r.rows[0];
    if (updatedReg.status === "confirmed" && updatedReg.user_id) {
      await ensureEventPassForRegistration({
        eventId: req.params.eventId,
        registrationId: updatedReg.id,
        userId: updatedReg.user_id,
      }).catch((passErr) => {
        console.error("[Events] pass issue on admin status update:", passErr?.message || passErr);
      });
    } else if (["cancelled", "no_show", "waitlist", "pending"].includes(updatedReg.status)) {
      await cancelEventPassByRegistration({ registrationId: updatedReg.id }).catch(() => { });
    }
    return res.json({ message: "Inscripción actualizada", status: r.rows[0].status });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/:regId — Check-in ───────────────────────
app.post("/api/events/:eventId/checkin/:regId", adminMiddleware, async (req, res) => {
  try {
    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: req.params.regId,
      adminUserId: req.userId,
      source: "manual",
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }
    return res.json({
      message: result.alreadyCheckedIn ? "Esta inscripción ya tenía check-in" : "Check-in exitoso",
      checkedIn: true,
      alreadyCheckedIn: result.alreadyCheckedIn,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── POST /api/events/:eventId/checkin/scan — Check-in por QR/código ─────────
app.post("/api/events/:eventId/checkin/scan", adminMiddleware, async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "Debes enviar un código QR para validar" });
    }

    const resolved = await resolveEventRegistrationFromScanCode(req.params.eventId, code);
    if (!resolved?.registration?.id) {
      return res.status(404).json({ message: "No se encontró una inscripción válida para este QR en el evento" });
    }

    const result = await performEventCheckin({
      eventId: req.params.eventId,
      registrationId: resolved.registration.id,
      adminUserId: req.userId,
      source: resolved.source,
    });
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.message || "No se pudo registrar el check-in" });
    }

    return res.json({
      message: result.alreadyCheckedIn ? "La clienta ya tenía check-in registrado" : "Check-in exitoso",
      data: {
        registrationId: result.registration.id,
        name: result.registration.name,
        email: result.registration.email,
        alreadyCheckedIn: !!result.alreadyCheckedIn,
        source: resolved.source,
      },
    });
  } catch (err) {
    console.error("[Events] scan check-in error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ── PUT /api/events/:id/register/payment — Enviar comprobante ─────────────────
app.put("/api/events/:id/register/payment", authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;
    const { payment_method, transfer_reference, transfer_date, file_data, file_name, notes } = req.body;

    const regRes = await pool.query(
      "SELECT * FROM event_registrations WHERE event_id=$1 AND user_id=$2 AND status='pending' LIMIT 1",
      [req.params.id, userId]
    );
    if (!regRes.rows.length)
      return res.status(404).json({ message: "No tienes una inscripción pendiente en este evento" });
    const reg = regRes.rows[0];

    if (payment_method === "transfer" && !transfer_reference && !file_data) {
      return res.status(400).json({ message: "Debes proporcionar una referencia o comprobante de transferencia" });
    }

    let r;
    if (payment_method === "cash") {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='cash',
             payment_reference=NULL,
             payment_proof_url=NULL,
             payment_proof_file_name=NULL,
             transfer_date=NULL,
             updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [reg.id]
      );
    } else {
      r = await pool.query(
        `UPDATE event_registrations
         SET payment_method='transfer',
             payment_reference=$1,
             transfer_date=$2,
             payment_proof_url=$3,
             payment_proof_file_name=$4,
             updated_at=NOW()
         WHERE id=$5 RETURNING *`,
        [transfer_reference || null, transfer_date || null, file_data || null, file_name || null, reg.id]
      );
    }

    return res.json({
      message: payment_method === "cash"
        ? "Seleccionado pago en studio. El admin confirmará tu lugar cuando pagues en recepción."
        : "Comprobante enviado exitosamente. Tu pago será verificado pronto.",
      registration: {
        id: r.rows[0].id,
        status: r.rows[0].status,
        paymentReference: r.rows[0].payment_reference,
        hasPaymentProof: !!r.rows[0].payment_proof_url,
      },
    });
  } catch (err) {
    console.error("PUT events/register/payment error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Email test endpoint (admin only) ─────────────────────────────────────────
app.post("/api/admin/test-emails", adminMiddleware, async (req, res) => {
  const testTo = req.body.to || "saidromero19@gmail.com";
  const testName = "Said (Test)";
  const results = [];
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  const jobs = [
    { label: "Membresía activada", fn: () => sendMembershipActivated({ to: testTo, name: testName, planName: "4 Sesiones Studio", startDate: new Date().toISOString(), endDate: new Date(Date.now() + 30 * 86400000).toISOString(), classLimit: 4 }) },
    { label: "Reserva confirmada", fn: () => sendBookingConfirmed({ to: testTo, name: testName, className: "Pilates Reformer", date: new Date().toISOString(), startTime: "09:00", instructor: "Instructora Diana", classesLeft: 3, isWaitlist: false }) },
    { label: "Reserva cancelada (a tiempo)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Pilates Mat", date: new Date().toISOString(), startTime: "11:00", creditRestored: true, isLate: false, classesLeft: 4 }) },
    { label: "Reserva cancelada (tardía)", fn: () => sendBookingCancelled({ to: testTo, name: testName, className: "Sculpt", date: new Date().toISOString(), startTime: "18:00", creditRestored: false, isLate: true, classesLeft: 3 }) },
    { label: "Recordatorio semanal", fn: () => sendWeeklyReminder({ to: testTo, name: testName, classesLeft: 2, endDate: new Date(Date.now() + 15 * 86400000).toISOString() }) },
    { label: "Renovación (última clase)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "4 Sesiones Studio", classesLeft: 1, endDate: new Date(Date.now() + 5 * 86400000).toISOString(), reason: "last_class" }) },
    { label: "Renovación (por vencer)", fn: () => sendRenewalReminder({ to: testTo, name: testName, planName: "Studio Ilimitado", classesLeft: null, endDate: new Date(Date.now() + 3 * 86400000).toISOString(), reason: "expiring_soon" }) },
    { label: "Reset de contraseña", fn: () => sendPasswordResetEmail({ to: testTo, name: testName, token: "test-token-123456" }) },
  ];

  // Send one at a time with 700ms delay to respect Resend's 2 req/s limit
  for (const job of jobs) {
    try {
      await job.fn();
      results.push(`✅ ${job.label}`);
    } catch (e) {
      results.push(`❌ ${job.label}: ${e.message}`);
    }
    await delay(700);
  }

  const hasResendKey = !!process.env.RESEND_API_KEY;
  return res.json({
    message: hasResendKey
      ? `Se enviaron ${results.filter(r => r.startsWith("✅")).length} emails de prueba a ${testTo}`
      : "⚠️ RESEND_API_KEY no está configurada. Los emails NO se enviaron.",
    resendKeySet: hasResendKey,
    fromEmail: FROM_EMAIL,
    results,
  });
});

// ─── Bitácora (audit_log) ────────────────────────────────────────────────────
// Sólo la dueña (admin, super_admin): quién cobró, ajustó, canceló, corrigió o
// dio de baja, cuándo, por qué y el antes/después. Auditoría 2026-09-27, P0-3.
app.get("/api/admin/audit", ownerMiddleware, async (req, res) => {
  const q = buildAuditQuery(req.query, { timezone: STUDIO_TIMEZONE });
  if (!q.ok) return res.status(400).json({ message: q.message });
  try {
    const [rows, count] = await Promise.all([pool.query(q.sql, q.params), pool.query(q.countSql, q.countParams)]);
    return res.json({ data: rows.rows.map(auditRowOut), page: q.page, limit: q.limit, total: Number(count.rows[0]?.n ?? 0) });
  } catch (err) {
    console.error("[GET /admin/audit]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// Personas del equipo que aparecen en la bitácora (filtro "Quién").
app.get("/api/admin/audit/actors", ownerMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (a.actor_id) a.actor_id AS id,
              COALESCE(u.display_name, a.actor_name) AS name,
              COALESCE(u.role::text, a.actor_role) AS role
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.actor_id IS NOT NULL
        ORDER BY a.actor_id, a.created_at DESC`,
    );
    const data = r.rows.sort((x, y) => String(x.name ?? "").localeCompare(String(y.name ?? ""), "es"));
    return res.json({ data });
  } catch (err) {
    console.error("[GET /admin/audit/actors]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// ─── Healthcheck (Railway, uptime monitors) ──────────────────────────────────
app.get("/api/health", async (_req, res) => {
  const startedAt = Date.now();
  const out = {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    db: "unknown",
    appleWallet: isAppleWalletConfigured() ? "configured" : "fallback",
    googleWallet: isGoogleWalletConfigured() ? "configured" : "disabled",
  };
  try {
    // Zona horaria efectiva: el estudio opera en hora civil de CDMX y el
    // contenedor de Railway arranca en UTC. Exponerlo aqui permite detectar un
    // contenedor o una base mal configurados sin entrar a la base, que es
    // justo el fallo que no da error y solo se nota de noche.
    // Auditoria de zona, 2026-09-14.
    const tz = await pool.query(
      `SELECT current_setting('TimeZone') AS db_tz,
              CURRENT_DATE::text          AS db_today,
              (now() AT TIME ZONE $1)::date::text AS studio_today`,
      [STUDIO_TIMEZONE],
    );
    out.db = "ok";
    const row = tz.rows[0];
    const procTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    out.timezone = {
      studio: STUDIO_TIMEZONE,
      process: procTz,
      db: row.db_tz,
      today: row.studio_today,
      // Comparar NOMBRES de zona, no fechas: dos fechas coinciden ~18 h al dia
      // aunque la sesion este en UTC, asi que compararlas oculta el fallo de dia.
      matchesDb: row.db_tz === STUDIO_TIMEZONE && procTz === STUDIO_TIMEZONE,
    };
    if (!out.timezone.matchesDb) {
      out.status = "degraded";
      out.timezoneWarning =
        `El servidor no opera en hora del estudio (proceso=${procTz}, base=${row.db_tz}, ` +
        `hoy segun la base=${row.db_today}, hoy en el estudio=${row.studio_today}). ` +
        `Las vigencias y los cortes de dia van a fallar por la tarde.`;
    }
  } catch (err) {
    out.db = "error";
    out.dbError = String(err?.message ?? err).slice(0, 160);
    res.status(503).json({ ...out, latencyMs: Date.now() - startedAt });
    return;
  }
  res.status(200).json({ ...out, latencyMs: Date.now() - startedAt });
});

// ─── Versión de la app (para el aviso "nueva versión disponible") ────────────
// Cambia en cada deploy: Railway expone el SHA del commit; si no, cae al
// timestamp de arranque (cada redeploy reinicia el proceso → valor nuevo).
const APP_VERSION =
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  process.env.RAILWAY_DEPLOYMENT_ID ||
  process.env.GIT_COMMIT_SHA ||
  String(Date.now());
app.get("/api/version", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({ version: APP_VERSION });
});

// ─── Serve React SPA (static) ────────────────────────────────────────────────
const distDir = path.resolve(__dirname, "..", "dist");
const distExists = fs.existsSync(distDir);
const indexHtmlExists = fs.existsSync(path.join(distDir, "index.html"));
console.log("[Static] distDir:", distDir, "exists:", distExists, "index.html:", indexHtmlExists);
if (distExists) {
  try {
    const assetsDir = path.join(distDir, "assets");
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir).slice(0, 6);
      console.log("[Static] dist/assets sample:", files.join(", "));
    } else {
      console.warn("[Static] WARNING: dist/assets/ does not exist");
    }
  } catch (err) {
    console.warn("[Static] Could not list dist/assets:", err.message);
  }
}

app.use(express.static(distDir, {
  index: false,
  maxAge: "1h",
  setHeaders: (res, filePath) => {
    if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css; charset=utf-8");
    else if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    else if (filePath.endsWith(".webmanifest")) res.setHeader("Content-Type", "application/manifest+json");
    else if (filePath.endsWith(".svg")) res.setHeader("Content-Type", "image/svg+xml");
  },
}));

app.get("*", (req, res) => {
  // Any unresolved API call: JSON 404, never HTML.
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ message: "API route not found", path: req.path });
  }
  // Any path under /assets/ that wasn't served by static = real 404, never SPA fallback.
  if (req.path.startsWith("/assets/")) {
    return res.status(404).type("text/plain").send("Not found");
  }
  // Any other file-like request (.css, .js, .png, .map, etc.) = real 404.
  if (/\.[a-z0-9]+$/i.test(req.path)) {
    return res.status(404).type("text/plain").send("Not found");
  }
  // SPA fallback: send index.html (only for actual page navigations).
  if (!indexHtmlExists) {
    return res.status(503).type("text/plain").send("Frontend build missing. Check Railway build logs.");
  }
  // El index.html NUNCA se cachea: así, tras cada deploy, el navegador pide la
  // versión fresca y referencia los hashes de assets correctos. (Los assets en
  // sí sí se cachean — sus nombres llevan hash, cambian en cada build.) Esto
  // evita el error "Refused to apply style ... MIME text/html" que aparece
  // cuando un HTML viejo en caché pide un asset que el build nuevo ya renombró.
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(distDir, "index.html"));
});

// ─── Global error handler ────────────────────────────────────────────────────
// Multer lanza errores ANTES del try/catch del handler (p.ej. archivo > 10 MB).
// Sin esto, Express respondería un 500 HTML y el front no podría leer el motivo.
// Devolvemos JSON limpio para que el toast muestre un mensaje claro.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  // Cuerpo JSON malformado: es un error del que llama, no del servidor. Sin
  // esto, 94 rutas devolvían 500. Auditoría 2026-09-08, familia P2.
  if (err?.type === "entity.parse.failed" || err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ message: "El cuerpo de la petición no es JSON válido" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "El cuerpo de la petición es demasiado grande" });
  }
  if (err?.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "El archivo supera el límite de 10 MB" });
  }
  if (err?.code && String(err.code).startsWith("LIMIT_")) {
    return res.status(400).json({ message: "Archivo no válido para subir" });
  }
  console.error("[express error]", err?.message || err);
  return res.status(500).json({ message: "Error interno" });
});

// ─── Email Cron Jobs ─────────────────────────────────────────────────────────

/**
 * Runs every Sunday at 8:00 AM Mexico City time (UTC-6 = 14:00 UTC).
 * Sends weekly reminder to all users with an active membership.
 */
async function runWeeklyReminderCron() {
  try {
    const res = await pool.query(`
      SELECT u.email, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
    `);
    console.log(`[Cron] Weekly reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      await sendWeeklyReminder({
        to: row.email,
        name: row.name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
      }).catch((e) => console.error("[Email] weekly cron:", e.message));
      // Small delay to avoid rate limits
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Weekly reminder error:", err.message);
  }
}

/**
 * Runs every day at 9:00 AM.
 * Sends renewal reminder to members with 1 class left OR expiring in ≤7 days.
 */
async function runRenewalReminderCron() {
  try {
    const res = await pool.query(`
      SELECT u.id AS user_id, u.email, COALESCE(u.display_name, 'Alumna') AS name,
             m.classes_remaining, m.end_date,
             COALESCE(p.name, m.plan_name_override, 'Tu membresía') AS plan_name
      FROM memberships m
      JOIN users u ON m.user_id = u.id
      LEFT JOIN plans p ON m.plan_id = p.id
      WHERE m.status = 'active'
        AND (m.end_date IS NULL OR m.end_date >= CURRENT_DATE)
        AND (
          m.classes_remaining = 1
          OR (m.end_date IS NOT NULL AND m.end_date <= CURRENT_DATE + INTERVAL '7 days')
        )
    `);
    console.log(`[Cron] Renewal reminder — ${res.rows.length} members`);
    for (const row of res.rows) {
      const reason = row.classes_remaining === 1 ? "last_class" : "expiring_soon";
      await sendRenewalReminder({
        to: row.email,
        name: row.name,
        planName: row.plan_name,
        classesLeft: row.classes_remaining,
        endDate: row.end_date,
        reason,
      }).catch((e) => console.error("[Email] renewal cron:", e.message));
      // Also push wallet update + WhatsApp for the same membership
      if (row.user_id && row.end_date) {
        const days = Math.max(0, Math.ceil((new Date(row.end_date) - new Date()) / 86400000));
        notifyMembershipExpiring(row.user_id, days).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Renewal reminder error:", err.message);
  }
}

async function runMembershipExpiredCron() {
  try {
    // Memberships that just transitioned past their end_date today.
    const res = await pool.query(`
      SELECT m.user_id, m.end_date
      FROM memberships m
      WHERE m.status = 'active'
        AND m.end_date IS NOT NULL
        AND m.end_date < CURRENT_DATE
        AND m.end_date >= CURRENT_DATE - INTERVAL '1 day'
    `);
    console.log(`[Cron] Membership expired — ${res.rows.length} members`);
    for (const row of res.rows) {
      if (row.user_id) {
        notifyMembershipExpired(row.user_id).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 200));
    }
  } catch (err) {
    console.error("[Cron] Membership expired error:", err.message);
  }
}

/**
 * Runs every 10 minutes.
 * Finds bookings whose class starts in ~2 hours (105–135 min from now, UTC)
 * and sends a WhatsApp pre-class reminder + triggers APNS wallet push.
 * Deduplicates via wallet_notification_logs (reason = 'class_reminder_<bookingId>').
 */
async function runClassReminderCron() {
  try {
    const res = await pool.query(`
      SELECT
        b.id           AS booking_id,
        b.user_id,
        ct.name        AS class_name,
        c.start_time,
        i.display_name AS instructor_name
      FROM bookings b
      JOIN classes     c  ON c.id  = b.class_id
      JOIN class_types ct ON ct.id = c.class_type_id
      JOIN instructors i  ON i.id  = c.instructor_id
      JOIN users       u  ON u.id  = b.user_id
      WHERE b.status = 'confirmed'
        AND u.receive_reminders IS NOT FALSE
        AND u.phone IS NOT NULL
        AND (c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}'
              BETWEEN NOW() + INTERVAL '105 minutes'
                  AND NOW() + INTERVAL '135 minutes'
    `);

    if (res.rows.length === 0) return;
    console.log(`[Cron] Class reminder — ${res.rows.length} upcoming bookings`);

    // Mismo ajuste que respeta cancelar clase: con los avisos de WhatsApp
    // apagados por la dueña no se envía ni se registra 'failed'; el pase se
    // sincroniza igual (auditoría 2026-09-27, P0-1).
    const notifSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    await sendClassReminders(res.rows, {
      log: pgReminderLog(pool),
      remindersOn: notifSettings?.whatsapp_reminders !== false,
      channelState: whatsappChannelState,
      syncPass: triggerWalletPassSync,
      notify: (row) => {
        const timeStr = row.start_time ? String(row.start_time).slice(0, 5) : "";
        const className = row.class_name || "tu clase";
        return notifyByTemplate(
          row.user_id,
          "class_reminder",
          { class: className, time: timeStr },
          ({ firstName }) =>
            `${firstName}, te vemos en ${className} a las ${timeStr}. Llega 10 minutos antes.`,
        );
      },
    });
  } catch (err) {
    console.error("[Cron] Class reminder error:", err.message);
  }
}

function scheduleEmailCrons() {
  // Jobs a hora de reloj del estudio. Antes esto era un setInterval de 1 h que
  // comparaba contra `(getUTCHours() - 6 + 24) % 24`: el offset -6 escrito a
  // mano, el dia de la semana tomado en UTC, y el minuto de corrida decidido
  // por la hora del ultimo deploy. Con reinicios en la hora equivocada el
  // bloque podia dispararse dos veces (correos duplicados: el recordatorio de
  // renovacion no tiene guard de idempotencia) o ninguna.
  // Auditoria de zona, 2026-09-15.
  // Registro de ultima corrida en `settings`: permite recuperar un aviso que se
  // perdio porque el proceso estaba caido a esa hora, y a la vez impide que un
  // reinicio lo repita (runRenewalReminderCron no tiene guard de idempotencia,
  // asi que repetirlo son correos duplicados a las clientas).
  const cronStore = {
    async get(label) {
      const r = await pool.query(
        `SELECT value->>$1 AS v FROM settings WHERE key = 'cron_last_run'`, [label]);
      return r.rows[0]?.v ?? null;
    },
    async set(label, iso) {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('cron_last_run', jsonb_build_object($1::text, $2::text))
         ON CONFLICT (key) DO UPDATE SET value = settings.value || jsonb_build_object($1::text, $2::text)`,
        [label, iso]);
    },
  };
  const opciones = { store: cronStore };

  scheduleAt("recordatorio semanal", { hour: 8, minute: 0, weekday: 0 }, () =>
    runWeeklyReminderCron(), opciones);
  scheduleAt("recordatorio de renovacion", { hour: 9, minute: 0 }, () =>
    runRenewalReminderCron(), opciones);
  scheduleAt("barrido de membresias vencidas", { hour: 10, minute: 0 }, () =>
    runMembershipExpiredCron(), opciones);

  // Pre-class reminder: every 10 minutes, find classes starting in ~2 hours
  setInterval(async () => {
    await runClassReminderCron().catch((e) =>
      console.error("[Cron] class_reminder interval error:", e?.message),
    );
  }, 10 * 60 * 1000); // every 10 minutes

  // ── Lista de espera: barrido de respaldo (auditoría 2026-09-27, P1-1) ──
  // APAGADO por defecto: sólo se programa si WAITLIST_SWEEP_MINUTES es un
  // número mayor que 0. En producción hay filas viejas en clases con lugar y,
  // al desplegar, el barrido las inscribiría solas, les descontaría una clase y
  // les mandaría aviso sin que el dueño lo decida. La subida por evento
  // (onSeatReleased) corre siempre.
  const sweepMin = sweepMinutes(process.env.WAITLIST_SWEEP_MINUTES);
  if (sweepMin > 0) {
    setInterval(() => {
      runWaitlistSweep().catch((e) => console.error("[Cron] lista de espera:", e?.message));
    }, sweepMin * 60 * 1000);
  } else if (Number(process.env.WAITLIST_SWEEP_MINUTES) > MAX_SWEEP_MINUTES) {
    console.warn(`[Cron] WAITLIST_SWEEP_MINUTES pasa de ${MAX_SWEEP_MINUTES}: el barrido de la lista de espera queda apagado.`);
  }

  // ── Wellhub: reconcile inventario cada 5 min (safety net del trigger) ──
  setInterval(async () => {
    try {
      await pool.query(`UPDATE channel_inventory ci SET booked_spots = (
        SELECT COUNT(*) FROM bookings b WHERE b.class_id = ci.class_id AND b.channel = ci.channel
          AND b.status NOT IN ('cancelled','no_show')
      ), updated_at = NOW()`);
    } catch (e) { console.error("[Cron] wellhub reconcile:", e?.message); }
  }, 5 * 60 * 1000);

  // ── Wellhub: resumen diario de check-ins confirmados (23:40 hora del estudio) ──
  // Antes era un setInterval de 5 min con una ventana 23:40-23:45: si el
  // servidor se reiniciaba en ese hueco, el resumen de ese dia no salia nunca.
  scheduleAt("resumen diario Wellhub", { hour: 23, minute: 40 }, async () => {
    try {
      const mx = new Date();
      const creds = await getWellhubCredentials(pool);
      const url = creds?.is_enabled ? creds.extra_config?.daily_summary_url : null;
      if (!url) return;
      const r = await pool.query(
        `SELECT id, user_id, validated_at FROM partner_checkins
          WHERE channel='wellhub' AND status='confirmed' AND created_at::date = NOW()::date`,
      );
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(creds.access_token ? { Authorization: `Bearer ${creds.access_token}` } : {}) },
        body: JSON.stringify({ date: todayInStudio(mx), checkins: r.rows }),
      }).catch(() => {});
    } catch (e) { console.error("[Cron] wellhub daily summary:", e?.message); }
  }, opciones);
}

// ─── Start ───────────────────────────────────────────────────────────────────
async function bootServer() {
  await ensureSchema();
  scheduleEmailCrons();
  // Initialize Google Wallet loyalty class if configured
  ensureGoogleWalletClass().catch(() => { });
  const server = app.listen(PORT, () => {
    console.log(`🚀 HIVE API + Frontend → http://localhost:${PORT}`);
  });
  // Timeouts amplios para soportar la subida resumible de archivos grandes
  // (chunks proxeados a Google Drive). Si no los subimos, Node 18+
  // corta a los 5 min por requestTimeout y se rompen subidas largas.
  server.requestTimeout = 30 * 60 * 1000; // 30 min por request
  server.headersTimeout = 60 * 1000;      // 60s para recibir los headers
  server.keepAliveTimeout = 65 * 1000;    // un pelo más que headers
}

bootServer().catch((err) => {
  console.error("❌ Fatal startup error:", err.message);
  process.exit(1);
});
