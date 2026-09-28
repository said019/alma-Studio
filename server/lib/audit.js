// Bitácora de acciones del personal: quién, cuándo, qué, por qué y el antes y
// después (auditoría de producción 2026-09-27, bloque 2: P0-3 · I8 y P1-5).
import { isUuid, isDay } from "./validate.js";

export const REASON_MIN = 5;
export const REASON_MAX = 500;

export const AUDIT_ACTIONS = Object.freeze([
  "membership.sale",
  "membership.adjust",
  "booking.checkin",
  "booking.no_show",
  "booking.no_show_corrected",
  "booking.cancel",
  "class.cancel",
  "class.delete",
  "class.week_clear",
  "user.anonymize",
]);

export const AUDIT_ENTITY_TYPES = Object.freeze(["membership", "booking", "class", "class_week", "user"]);

/** null si el motivo sirve; si no, el texto del 400. */
export function reasonProblem(reason, min = REASON_MIN) {
  const s = typeof reason === "string" ? reason.trim() : "";
  if (s.length < min) return `Escribe el motivo (mínimo ${min} caracteres).`;
  if (s.length > REASON_MAX) return `El motivo es demasiado largo (máximo ${REASON_MAX} caracteres).`;
  return null;
}

/** Motivo listo para guardar: sin espacios en los extremos y recortado, o null. */
export function cleanReason(reason) {
  const s = typeof reason === "string" ? reason.trim() : "";
  return s ? s.slice(0, REASON_MAX) : null;
}

/**
 * Campos que cambian entre la fila actual (`before`) y lo que se va a guardar
 * (`next`). Sólo mira las llaves presentes en `next`. `normalize(llave, valor)`
 * iguala representaciones del mismo valor (p. ej. 9999 e ilimitado).
 */
export function changedFields(before, next, keys, normalize = (_k, v) => v) {
  const b = {};
  const a = {};
  for (const k of keys) {
    if (!next || !(k in next)) continue;
    const prev = before?.[k] ?? null;
    const val = next[k] ?? null;
    if (JSON.stringify(normalize(k, prev)) !== JSON.stringify(normalize(k, val))) {
      b[k] = prev;
      a[k] = val;
    }
  }
  return { changed: Object.keys(a), before: b, after: a };
}

const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * Escribe una fila en audit_log. `db` es el pool o el cliente de la transacción
 * en curso: dentro de una transacción, la bitácora se confirma o se revierte con
 * la acción. Lanza si la acción o la entidad no son conocidas, o si la base falla.
 */
export async function recordAudit(db, entry) {
  const {
    actorId = null, action, entityType, entityId = null, subjectUserId = null,
    reason = null, before = null, after = null, meta = {},
  } = entry || {};
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`Acción de bitácora desconocida: ${action}`);
  if (!AUDIT_ENTITY_TYPES.includes(entityType)) throw new Error(`Entidad de bitácora desconocida: ${entityType}`);
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, actor_name, action, entity_type, entity_id,
                            subject_user_id, reason, before, after, meta)
     VALUES ($1::uuid,
             (SELECT role::text FROM users WHERE id = $1::uuid),
             (SELECT display_name FROM users WHERE id = $1::uuid),
             $2, $3, $4::uuid, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      isUuid(actorId) ? actorId : null, action, entityType,
      isUuid(entityId) ? entityId : null, isUuid(subjectUserId) ? subjectUserId : null,
      cleanReason(reason), toJson(before), toJson(after), JSON.stringify(meta ?? {}),
    ],
  );
}

/** Para rutas sin transacción (check-in, QR, falta): nunca convierte un éxito en 500. */
export function recordAuditBestEffort(db, entry) {
  return recordAudit(db, entry).catch((e) => {
    console.error("[audit] no se pudo registrar", entry?.action, e?.message);
  });
}

/**
 * Consulta de GET /api/admin/audit a partir del querystring.
 * { ok:false, message } → 400; { ok:true, sql, params, countSql, countParams, page, limit }.
 * `entityId` busca en entity_id O subject_user_id: con el id de una clienta trae todo lo suyo.
 * `from`/`to` son días de la zona del estudio, inclusive.
 */
export function buildAuditQuery(query = {}, { timezone = "America/Mexico_City" } = {}) {
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const where = [];
  const params = [];
  const add = (frag, value) => {
    params.push(value);
    const n = `$${params.length}`;
    where.push(frag.replaceAll("?", () => n));
  };

  const entityType = s(query.entityType);
  if (entityType) {
    if (!AUDIT_ENTITY_TYPES.includes(entityType)) return { ok: false, message: "Tipo de registro inválido." };
    add("a.entity_type = ?", entityType);
  }
  const action = s(query.action);
  if (action) {
    if (!AUDIT_ACTIONS.includes(action)) return { ok: false, message: "Acción inválida." };
    add("a.action = ?", action);
  }
  const entityId = s(query.entityId);
  if (entityId) {
    if (!isUuid(entityId)) return { ok: false, message: "Identificador inválido" };
    add("(a.entity_id = ?::uuid OR a.subject_user_id = ?::uuid)", entityId);
  }
  const actorId = s(query.actorId);
  if (actorId) {
    if (!isUuid(actorId)) return { ok: false, message: "Identificador inválido" };
    add("a.actor_id = ?::uuid", actorId);
  }
  const from = s(query.from);
  const to = s(query.to);
  if (from && !isDay(from)) return { ok: false, message: "Fecha 'desde' inválida (usa AAAA-MM-DD)." };
  if (to && !isDay(to)) return { ok: false, message: "Fecha 'hasta' inválida (usa AAAA-MM-DD)." };
  if (from && to && from > to) return { ok: false, message: "La fecha 'desde' es posterior a 'hasta'." };
  const tz = String(timezone).replace(/'/g, "");
  if (from) add(`a.created_at >= (?::date::timestamp AT TIME ZONE '${tz}')`, from);
  if (to) add(`a.created_at < ((?::date + 1)::timestamp AT TIME ZONE '${tz}')`, to);

  const num = (v, dflt) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? dflt : Number(v));
  const page = num(query.page, 1);
  const limit = num(query.limit, 50);
  if (!Number.isInteger(page) || page < 1 || page > 100000) return { ok: false, message: "Página inválida." };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, message: "El límite debe estar entre 1 y 100." };

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*)::int AS n FROM audit_log a ${whereSql}`;
  const countParams = [...params];
  const sql = `SELECT a.*, su.display_name AS subject_name
                 FROM audit_log a
                 LEFT JOIN users su ON su.id = a.subject_user_id
                 ${whereSql}
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  return { ok: true, sql, params: [...params, limit, (page - 1) * limit], countSql, countParams, page, limit };
}

/** Fila de audit_log → JSON del API (camelCase, como el resto del panel). */
export function auditRowOut(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    actorId: r.actor_id ?? null,
    actorName: r.actor_name ?? null,
    actorRole: r.actor_role ?? null,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    subjectUserId: r.subject_user_id ?? null,
    subjectName: r.subject_name ?? null,
    reason: r.reason ?? null,
    before: r.before ?? null,
    after: r.after ?? null,
    meta: r.meta ?? {},
  };
}
