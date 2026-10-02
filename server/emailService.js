/**
 * HIVE Pilates Studio — correos transaccionales (Resend).
 *
 * Cada correo tiene dos funciones: `renderX(opts)` arma el mensaje
 * ({ from, to, subject, html }) sin enviar nada, y `sendX(opts)` se lo pasa a
 * sendEmail. Las pruebas y la vista previa sólo usan los render.
 *
 * Diseño "B · banda oscura + cuerpo claro": banda carbón con el isotipo
 * terracota, tarjeta blanca sobre Ivory Silk, CTA en píldora carbón y pie con
 * el lema. HTML de correo: tablas, estilos en línea y bgcolor (Gmail, Apple
 * Mail y Outlook de escritorio); nada de mask, flex ni grid.
 */

import { Resend } from "resend";
import { waitlistJoinRule } from "./lib/waitlist.js";

// Resend es opcional: si no hay API key, el servicio de email queda inactivo
// (los envíos se omiten en vez de crashear el server). Degrada graciosamente.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Remitente. Configurable por env; el buzón y el dominio son los verificados en Resend.
const FROM_EMAIL = process.env.EMAIL_FROM || "HIVE Pilates Studio <noreply@agendafull.com.mx>";
const SITE_URL = (process.env.SITE_URL || process.env.APP_URL || "https://hivestudio.com.mx").replace(/\/+$/, "");
const SITE_LABEL = SITE_URL.replace(/^https?:\/\//, "");
// Isotipo terracota sobre transparente, a 3× (lo genera scripts/brand-assets.mjs).
const LOGO_URL = `${SITE_URL}/email/hive-mark.png`;
const LOGO_W = 40;
const LOGO_H = 46;

// Datos públicos del estudio. Copia de src/lib/studio.ts (el servidor no
// importa TypeScript); emailService.test.mjs verifica que sigan iguales.
const STUDIO = {
  name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  instagram: "hive.pilates",
};
const MOTTO = "MOVIMIENTO · BIENESTAR · COMUNIDAD";

// ─── Paleta (src/design/tokens.ts, LIGHT + banda de DARK) ─────────────────────
const C = {
  page: "#F2EFEA",        // Ivory Silk — fondo
  band: "#141210",        // carbón — banda superior
  onBand: "#F2EFEA",      // wordmark
  onBandMuted: "#A69C91", // "PILATES STUDIO"
  card: "#FFFFFF",
  line: "#DDD6CD",
  ink: "#1A1714",
  muted: "#6B6259",
  accentStrong: "#9A5236", // eyebrow, lema y píldora
  accentSoft: "#F3DED3",
};
const DISPLAY = "'Unbounded','Arial Black',Helvetica,Arial,sans-serif";
const SANS = "'Manrope',Helvetica,Arial,sans-serif";

// ─── Utilidades de texto ──────────────────────────────────────────────────────
/** Escapa un dato (nombre, clase, motivo…) antes de meterlo al HTML. */
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
/** Primer nombre, o "" si no hay nombre. */
function firstNameOf(name) {
  return String(name ?? "").trim().split(/\s+/)[0] || "";
}
/** Sin límite: null, o el centinela 9999 que usa el servidor. */
function isUnlimited(n) {
  return n === null || Number(n) >= 9999;
}
/** <strong> en tinta dentro de textos grises. */
function emphasize(html) {
  return String(html).replace(/<strong>/g, `<strong style="color:${C.ink};font-weight:700;">`);
}

/**
 * Canal de contacto honesto: WhatsApp sólo si el estudio configuró su número
 * (STUDIO_PHONE); si no, Instagram, igual que la landing.
 */
function contactChannel() {
  const phone = String(process.env.STUDIO_PHONE || "").trim();
  return phone
    ? { name: "WhatsApp", url: `https://wa.me/521${phone}`, cta: "Contactar por WhatsApp" }
    : {
        name: `Instagram (@${STUDIO.instagram})`,
        url: `https://www.instagram.com/${STUDIO.instagram}`,
        cta: "Escríbenos por Instagram",
      };
}

// ─── Base layout ──────────────────────────────────────────────────────────────
function spacer(height) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${height}" style="height:${height}px;font-size:0;line-height:0;mso-line-height-rule:exactly;">&nbsp;</td></tr></table>`;
}

/**
 * @param {object} o
 * @param {string} o.preheader  texto de vista previa en la bandeja
 * @param {string} o.eyebrow    rótulo terracota sobre el título
 * @param {string} o.title      título (HTML ya escapado)
 * @param {string} o.content    cuerpo: párrafos, píldora, tabla de datos, avisos
 * @param {string} [o.ctaUrl]   botón principal
 * @param {string} [o.ctaText]
 * @param {string} [o.note]     nota gris después del botón
 */
function baseLayout({ preheader = "", eyebrow = "", title = "", content = "", ctaUrl = "", ctaText = "", note = "" } = {}) {
  const ctaBlock = ctaUrl
    ? `${spacer(10)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:999px;mso-padding-alt:15px 24px;">
              <a href="${esc(ctaUrl)}" target="_blank" class="hive-cta"
                 style="display:block;padding:15px 24px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:${C.onBand};text-decoration:none;border-radius:999px;mso-line-height-rule:exactly;">${ctaText}</a>
            </td></tr>
          </table>`
    : "";
  const noteBlock = note
    ? `${spacer(16)}
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="${C.page}" style="background-color:${C.page};border-radius:12px;padding:13px 16px;font-family:${SANS};font-size:13px;line-height:20px;color:${C.muted};mso-line-height-rule:exactly;">${emphasize(note)}</td></tr>
          </table>`
    : "";
  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${STUDIO.name}</title>
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <style>
    td, th, p, a, span, div, h1, h2 { font-family: Arial, Helvetica, sans-serif !important; }
    .hive-display { font-family: 'Arial Black', Arial, sans-serif !important; }
  </style>
  <![endif]-->
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&family=Unbounded:wght@700;800&display=swap" rel="stylesheet">
  <!--<![endif]-->
  <style>
    :root { color-scheme: light; supported-color-schemes: light; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; font-size: inherit !important; font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important; }
    @media only screen and (max-width: 480px) {
      .hive-band { padding: 26px 16px 22px !important; }
      .hive-outer { padding: 14px 10px 26px !important; }
      .hive-card { padding: 26px 20px 24px !important; }
      .hive-title { font-size: 21px !important; line-height: 27px !important; }
      .hive-motto { letter-spacing: 1.6px !important; }
    }
  </style>
  <style>
    /* Resplandor terracota de la banda (sólo clientes que lo soportan; el resto ve carbón liso). */
    .hive-band { background-image: radial-gradient(90% 100% at 50% 0%, rgba(169,96,63,0.35), rgba(20,18,16,0) 70%); }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};" bgcolor="${C.page}">
  <div role="article" aria-roledescription="email" aria-label="${STUDIO.name}" lang="es" style="background-color:${C.page};">
  <!-- preheader -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.page};">
    ${preheader}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background-color:${C.page};">
    <!-- Banda carbón: isotipo + wordmark -->
    <tr><td align="center" bgcolor="${C.band}" class="hive-band" style="background-color:${C.band};padding:32px 20px 26px;">
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">
        <tr><td align="center" style="padding:0 0 12px;">
          <img src="${LOGO_URL}" width="${LOGO_W}" height="${LOGO_H}" alt="HIVE"
               style="display:block;width:${LOGO_W}px;height:${LOGO_H}px;border:0;margin:0 auto;font-family:${SANS};font-size:14px;font-weight:800;color:${C.onBand};">
        </td></tr>
        <tr><td align="center" class="hive-display" style="font-family:${DISPLAY};font-size:22px;line-height:26px;font-weight:800;letter-spacing:1px;color:${C.onBand};mso-line-height-rule:exactly;">HIVE</td></tr>
        <tr><td align="center" style="padding:5px 0 0 3px;font-family:${SANS};font-size:9px;line-height:13px;font-weight:700;letter-spacing:3px;color:${C.onBandMuted};mso-line-height-rule:exactly;">PILATES STUDIO</td></tr>
      </table>
    </td></tr>

    <tr><td align="center" class="hive-outer" style="padding:24px 16px 32px;">
      <!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;border-collapse:separate;">
        <!-- Tarjeta -->
        <tr><td bgcolor="${C.card}" class="hive-card" style="background-color:${C.card};border:1px solid ${C.line};border-radius:16px;padding:34px 36px 32px;">
          ${eyebrow ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:16px;font-weight:800;letter-spacing:2.2px;text-transform:uppercase;color:${C.accentStrong};mso-line-height-rule:exactly;">${eyebrow}</p>` : ""}
          <h1 class="hive-display hive-title" style="margin:0 0 14px;font-family:${DISPLAY};font-size:25px;line-height:31px;font-weight:800;text-transform:uppercase;color:${C.ink};mso-line-height-rule:exactly;">${title}</h1>
          ${content}
          ${ctaBlock}
          ${noteBlock}
        </td></tr>

        <!-- Pie -->
        <tr><td align="center" style="padding:28px 12px 0;font-family:${SANS};">
          <p class="hive-motto" style="margin:0 0 12px;font-family:${SANS};font-size:10px;line-height:15px;font-weight:800;letter-spacing:2.8px;color:${C.accentStrong};mso-line-height-rule:exactly;">${MOTTO}</p>
          <p style="margin:0 0 6px;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted};">${STUDIO.name} · ${STUDIO.address}</p>
          <p style="margin:0 0 10px;font-family:${SANS};font-size:12px;line-height:19px;color:${C.muted};">
            <a href="${SITE_URL}" target="_blank" style="color:${C.ink};font-weight:700;text-decoration:none;">${SITE_LABEL}</a>
            &nbsp;·&nbsp;
            <a href="https://www.instagram.com/${STUDIO.instagram}" target="_blank" style="color:${C.ink};font-weight:700;text-decoration:none;">@${STUDIO.instagram}</a>
          </p>
          <p style="margin:0;font-family:${SANS};font-size:11px;line-height:17px;color:${C.muted};">© ${year} ${STUDIO.name}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
  </div>
</body>
</html>`;
}

// ─── Helpers (el título va en baseLayout: { eyebrow, title }) ────────────────
function h2(text) {
  return `<h2 class="hive-display" style="margin:10px 0 8px;font-family:${DISPLAY};font-size:15px;line-height:21px;font-weight:800;letter-spacing:.3px;text-transform:uppercase;color:${C.ink};mso-line-height-rule:exactly;">${text}</h2>`;
}
function p(text) {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:24px;color:${C.muted};mso-line-height-rule:exactly;">${emphasize(text)}</p>`;
}
const LABEL_STYLE = `font-family:${SANS};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;color:${C.muted};mso-line-height-rule:exactly;`;
const shownValue = (value) => (value === null || value === undefined || value === "" ? "—" : esc(value));
/** Fila etiqueta | valor, como la maqueta. */
function infoRow(label, value) {
  return `<tr>
              <td class="hive-label" style="border-top:1px solid ${C.line};padding:12px 12px 12px 0;vertical-align:middle;${LABEL_STYLE}">${label}</td>
              <td align="right" style="border-top:1px solid ${C.line};padding:12px 0;font-family:${SANS};font-size:14px;line-height:20px;font-weight:700;color:${C.ink};text-align:right;vertical-align:middle;overflow-wrap:break-word;word-wrap:break-word;mso-line-height-rule:exactly;">${shownValue(value)}</td>
            </tr>`;
}
/** Fila apilada (etiqueta arriba, valor abajo) para valores largos que se copian: correo, contraseña. */
function infoRowStacked(label, value, { mono = false } = {}) {
  const font = mono ? "Menlo,Consolas,'Courier New',monospace" : SANS;
  return `<tr>
              <td class="hive-label" colspan="2" style="border-top:1px solid ${C.line};padding:12px 0 4px;${LABEL_STYLE}">${label}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:0 0 12px;font-family:${font};font-size:15px;line-height:22px;font-weight:700;color:${C.ink};word-break:break-all;mso-line-height-rule:exactly;">${shownValue(value)}</td>
            </tr>`;
}
function infoTable(rows) {
  return `${spacer(6)}
          <table role="presentation" class="hive-datos" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${rows.join("")}
          </table>
          ${spacer(12)}`;
}
/**
 * Píldora de estado. El texto va en tinta sobre terracota suave (13.8:1; la
 * convención softFg de src/design/tokens.ts): terracota sobre ese fondo no
 * llega a AA. El ✓ opcional es decorativo y va terracota en su propio span; el
 * estado lo dice la palabra.
 */
function pill(text, { check = false } = {}) {
  const mark = check
    ? `<span aria-hidden="true" style="color:${C.accentStrong};">✓</span>&nbsp;`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="${C.accentSoft}" class="hive-pill" style="background-color:${C.accentSoft};border-radius:999px;padding:6px 14px;font-family:${SANS};font-size:11px;line-height:14px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:${C.ink};mso-line-height-rule:exactly;">${mark}${text}</td></tr>
          </table>
          ${spacer(10)}`;
}
function alertBox(text) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td bgcolor="${C.accentSoft}" style="background-color:${C.accentSoft};border-radius:12px;padding:15px 18px;font-family:${SANS};font-size:14px;line-height:22px;color:${C.ink};mso-line-height-rule:exactly;">${text}</td></tr>
          </table>
          ${spacer(18)}`;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtTime(timeStr) {
  if (!timeStr) return "—";
  const t = String(timeStr).slice(0, 5);
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// ─── Core send function ───────────────────────────────────────────────────────
function message({ to, subject, html }) {
  return { from: FROM_EMAIL, to, subject, html };
}

async function sendEmail({ from = FROM_EMAIL, to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email to ${to} (${subject})`);
    return;
  }
  try {
    // BCC opcional vía env EMAIL_BCC (coma-separado). Por defecto NINGUNO:
    // antes copiaba TODO a saidromero19@gmail.com, lo que hacía llegar copias
    // de correos de las clientas (incluidos resets de contraseña) a ese buzón.
    const bccList = String(process.env.EMAIL_BCC || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      ...(bccList.length ? { bcc: bccList } : {}),
      subject,
      html,
    });
    if (error) console.error("[Email] Resend error:", error);
    else console.log(`[Email] Sent "${subject}" → ${to} (id: ${data?.id})`);
  } catch (err) {
    console.error("[Email] Exception sending email:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 1. MEMBRESÍA ACTIVADA / ASIGNADA ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to          — email del cliente
 * @param {string} opts.name        — nombre del cliente
 * @param {string} opts.planName    — nombre del plan
 * @param {string} opts.startDate   — fecha inicio
 * @param {string} opts.endDate     — fecha fin
 * @param {number|null} opts.classLimit — clases totales (null = ilimitado)
 */
function renderMembershipActivated(opts) {
  const { to, name, planName, startDate, endDate, classLimit } = opts;
  const first = firstNameOf(name);
  const classesText = classLimit && !isUnlimited(classLimit) ? `${classLimit} clases` : "Clases ilimitadas";
  const html = baseLayout({
    preheader: `¡Tu membresía ${esc(planName || "")} está activa! Reserva tus clases ahora.`,
    eyebrow: "Membresía activa",
    title: first ? `Bienvenida a HIVE, ${esc(first)}.` : "Bienvenida a HIVE.",
    content: `
          ${p("Tu membresía ya está activa. Reserva tu primera clase: aquí te acompañamos en cada movimiento.")}
          ${pill("Activa", { check: true })}
          ${infoTable([
            infoRow("Plan", planName),
            infoRow("Clases incluidas", classesText),
            infoRow("Inicio", fmtDate(startDate)),
            infoRow("Vencimiento", fmtDate(endDate)),
          ])}
          ${p("Entra a tu perfil para reservar tus primeras clases y ver el horario disponible.")}`,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Reservar clases",
  });
  return message({ to, subject: "Tu membresía en HIVE ya está activa", html });
}
async function sendMembershipActivated(opts) {
  await sendEmail(renderMembershipActivated(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 2. RESERVA CONFIRMADA ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.className       — tipo de clase (Barre, etc.)
 * @param {string} opts.date            — fecha de la clase (DATE)
 * @param {string} opts.startTime       — hora inicio (TIME "HH:MM")
 * @param {string} opts.instructor      — nombre instructor
 * @param {number|null} opts.classesLeft — clases restantes después de reservar (null = ilimitado)
 * @param {boolean} opts.isWaitlist     — true si es lista de espera
 * @param {number} [opts.cancelHours]   — ventana de cancelación (default 12)
 * @param {number} [opts.waitlistCutoffHours] — hasta cuántas horas antes sube la fila (default 2)
 */
function renderBookingConfirmed(opts) {
  const { to, name, className, date, startTime, instructor, classesLeft, isWaitlist } = opts;
  const cancelHours = Number(opts.cancelHours) > 0 ? Number(opts.cancelHours) : 12;
  const first = firstNameOf(name);
  const cls = className || "tu clase";

  const classesLeftText = classesLeft === undefined
    ? null
    : isUnlimited(classesLeft)
      ? "Ilimitadas"
      : `${classesLeft} clases restantes`;

  const waitlistNote = isWaitlist
    ? alertBox(`Estás en la <strong>lista de espera</strong>. ${esc(waitlistJoinRule(opts.waitlistCutoffHours ?? 2))}`)
    : "";

  const html = baseLayout({
    preheader: isWaitlist ? `Estás en lista de espera para ${esc(cls)}` : `Reserva confirmada para ${esc(cls)} el ${fmtDate(date)}`,
    eyebrow: isWaitlist ? "Tu reserva" : "Clase reservada",
    title: isWaitlist
      ? (first ? `En lista de espera, ${esc(first)}.` : "Estás en lista de espera.")
      : (first ? `Nos vemos en clase, ${esc(first)}.` : "Nos vemos en clase."),
    content: `
          ${p(isWaitlist
            ? "Te añadimos a la lista de espera de esta clase:"
            : "Tu lugar está apartado. Te esperamos en la colmena.")}
          ${isWaitlist ? pill("Lista de espera") : pill("Confirmada", { check: true })}
          ${infoTable([
            infoRow("Clase", cls),
            infoRow("Fecha", fmtDate(date)),
            infoRow("Hora", fmtTime(startTime)),
            ...(instructor ? [infoRow("Coach", instructor)] : []),
            ...(classesLeftText ? [infoRow("Tu paquete", classesLeftText)] : []),
          ])}
          ${waitlistNote}`,
    ctaUrl: `${SITE_URL}/app/bookings`,
    ctaText: "Ver mis reservas",
    note: `Puedes cancelar tu reserva hasta <strong>${cancelHours} horas antes</strong> para recuperar tu clase.`,
  });
  return message({ to, subject: isWaitlist ? `En lista de espera — ${cls}` : `Reserva confirmada — ${cls}`, html });
}
async function sendBookingConfirmed(opts) {
  await sendEmail(renderBookingConfirmed(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 3. RESERVA CANCELADA ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.className
 * @param {string}  opts.date
 * @param {string}  opts.startTime
 * @param {boolean} opts.creditRestored  — true si se devolvió el crédito
 * @param {boolean} opts.isLate          — cancelación tardía (dentro de la ventana)
 * @param {number|null} opts.classesLeft — clases restantes después de cancelar
 * @param {number} [opts.cancelHours]    — ventana de cancelación (default 12)
 */
function renderBookingCancelled(opts) {
  const { to, name, className, date, startTime, creditRestored, isLate, classesLeft } = opts;
  const cancelHours = Number(opts.cancelHours) > 0 ? Number(opts.cancelHours) : 12;
  const first = firstNameOf(name);
  const cls = className || "tu clase";
  const contact = contactChannel();

  const classesLeftText = classesLeft === undefined ? null : isUnlimited(classesLeft) ? "Ilimitadas" : `${classesLeft} clases`;

  const creditBlock = creditRestored
    ? alertBox(`<strong>Tu clase regresó a tu paquete.</strong> Cancelaste con más de ${cancelHours} horas de anticipación.`)
    : alertBox(`<strong>Esta vez la clase no regresó a tu paquete.</strong> La cancelación fue con menos de ${cancelHours} horas de anticipación, como indica nuestra política.`);

  const html = baseLayout({
    preheader: creditRestored ? "Tu clase fue devuelta al paquete." : "Cancelación tardía — crédito no recuperado.",
    eyebrow: "Cancelación",
    title: first ? `Reserva cancelada, ${esc(first)}.` : "Reserva cancelada.",
    content: `
          ${p("Tu reserva para la siguiente clase ha sido cancelada:")}
          ${infoTable([
            infoRow("Clase", cls),
            infoRow("Fecha", fmtDate(date)),
            infoRow("Hora", fmtTime(startTime)),
            ...(classesLeftText ? [infoRow("Clases restantes", classesLeftText)] : []),
          ])}
          ${creditBlock}
          ${isLate ? "" : p("¿Quieres reservar otra clase? Hay muchos horarios disponibles.")}`,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Ver horario",
    note: isLate
      ? `Si tienes dudas sobre la política de cancelación, escríbenos por <a href="${esc(contact.url)}" target="_blank" style="color:${C.accentStrong};font-weight:700;text-decoration:underline;">${contact.name}</a> o visita tu perfil.`
      : "",
  });
  return message({ to, subject: `Reserva cancelada — ${cls}`, html });
}
async function sendBookingCancelled(opts) {
  await sendEmail(renderBookingCancelled(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 4. RECORDATORIO SEMANAL (programa tu semana) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {number|null} opts.classesLeft — null = ilimitado
 * @param {string|null} opts.endDate     — fecha de vencimiento del paquete
 */
function renderWeeklyReminder(opts) {
  const { to, name, classesLeft, endDate } = opts;
  const first = firstNameOf(name);
  const unlimited = isUnlimited(classesLeft ?? null);
  const n = Number(classesLeft);

  const classesText = unlimited
    ? "Clases ilimitadas"
    : `${n} clase${n !== 1 ? "s" : ""} disponible${n !== 1 ? "s" : ""}`;

  const expiryNote = endDate
    ? alertBox(`Tu membresía vence el <strong>${fmtDate(endDate)}</strong>. Aún estás a tiempo de aprovechar tus clases.`)
    : "";

  const html = baseLayout({
    preheader: `Nueva semana en HIVE. Tienes ${unlimited ? "clases ilimitadas" : `${n} clases`} para reservar.`,
    eyebrow: "Nueva semana",
    title: first ? `Tu semana en HIVE, ${esc(first)}.` : "Tu semana en HIVE.",
    content: `
          ${p("Empieza una semana nueva y el horario ya está abierto. Aparta tus clases y date ese tiempo para ti.")}
          ${infoTable([infoRow("Tu paquete", classesText)])}
          ${expiryNote}
          ${h2("Date la cita contigo")}
          ${p("Grupos pequeños, técnica cuidada y alguien que te recibe por tu nombre. Reserva tus lugares antes de que se llenen.")}`,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Reservar mi semana",
  });
  return message({ to, subject: "Tu semana en HIVE — reserva tus clases", html });
}
async function sendWeeklyReminder(opts) {
  await sendEmail(renderWeeklyReminder(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 5. RECORDATORIO DE RENOVACIÓN ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.planName
 * @param {number|null} opts.classesLeft  — null = ilimitado
 * @param {string|null} opts.endDate
 * @param {'last_class'|'expiring_soon'} opts.reason
 */
function renderRenewalReminder(opts) {
  const { to, name, planName, classesLeft, endDate, reason } = opts;
  const first = firstNameOf(name);
  const plan = esc(planName || "tu membresía");

  const isLastClass = reason === "last_class";

  const urgencyBlock = isLastClass
    ? alertBox(`Te queda <strong>1 clase</strong> en tu paquete ${plan}. Renuévalo para no quedarte sin acceso.`)
    : alertBox(`Tu membresía <strong>${plan}</strong> vence el <strong>${fmtDate(endDate)}</strong>. Renuévala para mantener tu ritmo.`);

  const benefit = isLastClass
    ? p("Aprovecha y reserva esa última clase hoy, y de paso renueva tu paquete para seguir entrenando sin interrupciones.")
    : p("Renovar antes del vencimiento es la mejor forma de mantener tu constancia. ¡No dejes que el progreso se detenga!");

  const html = baseLayout({
    preheader: isLastClass ? "Te queda 1 clase. Renueva tu paquete." : "Tu membresía vence pronto. Renueva para seguir tu práctica.",
    eyebrow: "Renovación",
    title: first ? `${esc(first)}, es momento de renovar.` : "Es momento de renovar.",
    content: `
          ${urgencyBlock}
          ${p("En HIVE cuidamos tu constancia: renovar a tiempo es la forma de no perder el hilo de tu práctica.")}
          ${infoTable([
            infoRow("Plan actual", planName || "Tu membresía"),
            ...(classesLeft !== null && classesLeft !== undefined && !isUnlimited(classesLeft) ? [infoRow("Clases restantes", `${classesLeft}`)] : []),
            ...(endDate ? [infoRow("Vencimiento", fmtDate(endDate))] : []),
          ])}
          ${benefit}`,
    ctaUrl: `${SITE_URL}/app/checkout`,
    ctaText: "Renovar mi membresía",
  });
  return message({
    to,
    subject: isLastClass ? "Te queda 1 clase — renueva tu membresía" : "Tu membresía vence pronto — HIVE",
    html,
  });
}
async function sendRenewalReminder(opts) {
  await sendEmail(renderRenewalReminder(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 6. RECUPERACION DE CONTRASEÑA ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.token
 * @param {string=} opts.resetUrl
 */
function renderPasswordResetEmail(opts) {
  const { to, name, token, resetUrl } = opts;
  const firstName = firstNameOf(name) || "Clienta";
  const resolvedResetUrl = String(
    resetUrl || `${SITE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
  );
  const html = baseLayout({
    preheader: "Recupera el acceso a tu cuenta de HIVE Pilates Studio",
    eyebrow: "Tu cuenta",
    title: `Recupera tu contraseña, ${esc(firstName)}.`,
    content: `
          ${p("Recibimos una solicitud para cambiar la contraseña de tu cuenta en HIVE Pilates Studio.")}
          ${p("Si fuiste tú, usa el botón para crear una contraseña nueva. El enlace expira en <strong>2 horas</strong>.")}`,
    ctaUrl: resolvedResetUrl,
    ctaText: "Restablecer mi contraseña",
    note: `Si no solicitaste este cambio, puedes ignorar este correo; tu cuenta seguirá segura.<br><br>Si el botón no abre, copia y pega este enlace en tu navegador:<br><a href="${esc(resolvedResetUrl)}" target="_blank" style="color:${C.accentStrong};word-break:break-all;">${esc(resolvedResetUrl)}</a>`,
  });
  return message({ to, subject: "Restablecer tu contraseña — HIVE", html });
}
async function sendPasswordResetEmail(opts) {
  await sendEmail(renderPasswordResetEmail(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 7. RECHAZO DE COMPROBANTE ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.reason
 */
function renderOrderRejected(opts) {
  const { to, name, reason } = opts;
  const first = firstNameOf(name);
  const contact = contactChannel();
  const html = baseLayout({
    preheader: "Tu comprobante de pago fue revisado — HIVE Pilates Studio",
    eyebrow: "Comprobante de pago",
    title: "Revisamos tu comprobante.",
    content: `
          ${p(`${first ? `Hola ${esc(first)}, revisamos` : "Revisamos"} tu comprobante de pago y por ahora <strong>no pudimos aprobarlo</strong>.`)}
          ${alertBox(`<strong>Motivo:</strong> ${esc(reason || "No especificado")}`)}
          ${p(`Si crees que hubo un error, escríbenos por ${contact.name} y lo resolvemos contigo.`)}`,
    ctaUrl: contact.url,
    ctaText: contact.cta,
  });
  return message({ to, subject: "Comprobante de pago no aprobado — HIVE Pilates Studio", html });
}
async function sendOrderRejected(opts) {
  await sendEmail(renderOrderRejected(opts));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 8. BIENVENIDA DE ADMINISTRADORA (acceso + contraseña temporal) ────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to            Correo de la nueva administradora
 * @param {string} opts.name          Nombre (se usa el primer nombre para saludar)
 * @param {string} opts.tempPassword  Contraseña temporal en claro (la cambia al entrar)
 * @param {string} [opts.loginUrl]    URL de acceso (default: SITE_URL/auth/login)
 */
function renderAdminWelcome(opts) {
  const { to, name, tempPassword, loginUrl } = opts;
  const first = firstNameOf(name);
  const resolvedLoginUrl = String(loginUrl || `${SITE_URL}/auth/login`);
  const html = baseLayout({
    preheader: "Tu acceso de administradora a HIVE Pilates Studio",
    eyebrow: "Equipo HIVE",
    title: first ? `Bienvenida al equipo, ${esc(first)}.` : "Bienvenida al equipo.",
    content: `
          ${p("Te damos acceso de <strong>administradora</strong> a la plataforma de HIVE Pilates Studio. Desde tu cuenta podrás gestionar clases, reservas, membresías, comprobantes y más.")}
          ${p("Estos son tus datos de acceso:")}
          ${infoTable([
            infoRowStacked("Correo", to),
            infoRowStacked("Contraseña temporal", tempPassword, { mono: true }),
          ])}
          ${alertBox("Por tu seguridad, <strong>cambia esta contraseña</strong> la primera vez que entres: Perfil → Editar perfil → Seguridad.")}`,
    ctaUrl: resolvedLoginUrl,
    ctaText: "Entrar a la plataforma",
    note: "Si no esperabas este correo, ignóralo o escríbenos y lo revisamos.",
  });
  return message({ to, subject: "Tu acceso de administradora — HIVE Pilates Studio", html });
}
async function sendAdminWelcome(opts) {
  await sendEmail(renderAdminWelcome(opts));
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  FROM_EMAIL,
  SITE_URL,
  LOGO_URL,
  LOGO_W,
  LOGO_H,
  STUDIO,
  renderMembershipActivated,
  renderBookingConfirmed,
  renderBookingCancelled,
  renderWeeklyReminder,
  renderRenewalReminder,
  renderPasswordResetEmail,
  renderOrderRejected,
  renderAdminWelcome,
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  sendOrderRejected,
  sendAdminWelcome,
};

// Owner-composed communications. Unlike optional transactional notices, callers
// need provider failures to be reported rather than counted as successful sends.
export async function sendCustomBroadcast({to,name,subject,body,headline,ctaUrl,ctaText}) {
  if (!resend) throw new Error("Correo no configurado");
  const first=firstNameOf(name);
  const replace=(value)=>String(value||"").replace(/\{name\}/gi,first);
  let safeUrl;
  if (ctaUrl) {
    const url=new URL(ctaUrl);
    if (!["https:","http:"].includes(url.protocol)) throw new Error("Enlace inválido");
    safeUrl=url.href;
  }
  const html=baseLayout({preheader:replace(subject),eyebrow:"HIVE Pilates Studio",
    title:esc(replace(headline||"Hola, {name}")),
    content:replace(body).split(/\n\n/).map(line=>p(esc(line).replace(/\n/g,"<br>"))).join(""),
    ctaUrl:safeUrl,ctaText:ctaText?replace(ctaText):undefined});
  const result=await resend.emails.send({from:FROM_EMAIL,to:[to],subject:replace(subject),html});
  if (result.error) throw new Error(result.error.message||"El proveedor rechazó el correo");
  return result.data;
}
