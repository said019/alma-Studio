// Reglas de la venta en mostrador y de los ajustes de membresía
// (auditoría 2026-09-27, bloque 2: P0-3 · E2 · D12 · I5).
import { isDay } from "./validate.js";
import { reasonProblem, changedFields } from "./audit.js";

export const MEMBERSHIP_STATUS = Object.freeze(["pending_payment", "pending_activation", "active", "expired", "paused", "cancelled"]);
export const PAYMENT_METHODS = Object.freeze(["cash", "transfer", "card", "online"]);
/** Cambiar alguno de estos exige motivo (bloque 3: también las cancelaciones usadas). Cambiar sólo el método, no. */
export const REASON_FIELDS = Object.freeze(["classes_remaining", "start_date", "end_date", "status", "cancellations_used"]);
const ADJUST_FIELDS = ["status", "classes_remaining", "start_date", "end_date", "payment_method", "cancellations_used"];

const given = (v) => v !== undefined && v !== null && v !== "";
const round2 = (n) => Math.round(n * 100) / 100;

/** 9999 o más es el viejo centinela de "ilimitado"; null también lo es. */
export const creditsKey = (v) => (v === null || v === undefined || Number(v) >= 9999 ? "ilimitado" : Number(v));

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

const ISO_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Día AAAA-MM-DD de una fecha de inicio de venta, o null si no sirve. Exige
 * `isDay` exacto sobre el valor completo; sólo si es un ISO completo válido
 * (AAAA-MM-DDTHH:mm…) recorta esa parte de hora y valida el día resultante.
 * Cualquier otra basura pegada al día ("2026-09-25 junk") se rechaza: antes,
 * un `.slice(0, 10)` la dejaba pasar y `new Date()` la corría silenciosamente
 * a otro mes sin marcar error.
 */
export function saleStartDay(v) {
  const s = String(v);
  if (isDay(s)) return s;
  const m = ISO_DATETIME_RE.exec(s);
  if (m && isDay(m[1])) return m[1];
  return null;
}

/**
 * Problema con la fecha de inicio de una venta, o null si sirve (sin fecha
 * incluido). `new Date("2026-02-30")` no da NaN: la corre silenciosamente al
 * 2 de marzo. Sin este chequeo, esa fecha inválida se colaba a la venta.
 */
export function saleStartProblem(v) {
  if (!given(v)) return null;
  return saleStartDay(v) ? null : "Fecha de inicio inválida (usa AAAA-MM-DD).";
}

/**
 * Monto de una venta manual. `listPrice` es el precio efectivo del plan (con
 * precio de apertura si aplica). Si lo cobrado es $0 (cortesía) o distinto al
 * plan, exige motivo.
 */
export function saleAmountPlan({ listPrice, amount, reason }) {
  const list = round2(Number(listPrice) || 0);
  let charged = list;
  if (given(amount)) {
    const n = typeof amount === "number" ? amount : Number(String(amount).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return { ok: false, message: "El monto cobrado debe ser un número de 0 en adelante." };
    }
    charged = round2(n);
  }
  const courtesy = charged === 0;
  const priceDiffers = Math.abs(charged - list) >= 0.01;
  if (courtesy || priceDiffers) {
    const p = reasonProblem(reason);
    if (p) {
      return {
        ok: false,
        code: "REASON_REQUIRED",
        message: courtesy ? `Es una cortesía ($0). ${p}` : `Lo cobrado es distinto al precio del plan. ${p}`,
      };
    }
  }
  return {
    ok: true, amount: charged, listPrice: list, courtesy, priceDiffers,
    discount: round2(Math.max(0, list - charged)), subtotal: Math.max(list, charged),
  };
}

/** Referencia de pago opcional (folio de transferencia, voucher). */
export function cleanPaymentReference(value) {
  if (!given(value)) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "La referencia de pago debe ser texto." };
  const s = value.trim();
  if (s.length > 100) return { ok: false, message: "La referencia de pago es demasiado larga (máximo 100 caracteres)." };
  return { ok: true, value: s || null };
}

/**
 * `after` de la bitácora en `membership.sale`: misma forma en la venta de
 * mostrador y en el alta manual con paquete.
 */
export function saleAuditAfter({ plan, listPrice, amount, paymentMethod, paymentReference, orderId, startDate, endDate, classesRemaining }) {
  return {
    plan_id: plan.id, plan_name: plan.name,
    list_price: round2(Number(listPrice) || 0), amount: round2(Number(amount) || 0),
    payment_method: paymentMethod, payment_reference: paymentReference, order_id: orderId,
    start_date: startDate, end_date: endDate, classes_remaining: classesRemaining ?? null,
  };
}

/**
 * Qué cambia un PUT /memberships/:id. `before` trae la fila actual con fechas
 * "AAAA-MM-DD", `duration_days` y `plan_class_limit` del plan.
 */
export function planMembershipAdjust({ before, input }) {
  const { status, classesRemaining, startDate, endDate, paymentMethod, cancellationsUsed } = input || {};
  if (given(status) && !MEMBERSHIP_STATUS.includes(status)) {
    return { ok: false, message: `status inválido. Debe ser uno de: ${MEMBERSHIP_STATUS.join(", ")}` };
  }
  if (given(classesRemaining)) {
    const n = Number(classesRemaining);
    if (!Number.isInteger(n) || n < 0) return { ok: false, message: "Las clases restantes deben ser un número entero de 0 en adelante." };
  }
  if (given(startDate) && !isDay(startDate)) return { ok: false, message: "Fecha de inicio inválida (usa AAAA-MM-DD)." };
  if (given(endDate) && !isDay(endDate)) return { ok: false, message: "Fecha de fin inválida (usa AAAA-MM-DD)." };
  if (given(paymentMethod) && !PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, message: `Método de pago inválido. Opciones: ${PAYMENT_METHODS.join(", ")}.` };
  }
  if (given(cancellationsUsed)) {
    const n = Number(cancellationsUsed);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      return { ok: false, message: "Las cancelaciones usadas deben ser un número entero de 0 en adelante." };
    }
  }
  const next = {};
  if (given(status)) next.status = status;
  if (given(classesRemaining)) next.classes_remaining = Number(classesRemaining);
  if (given(startDate)) next.start_date = startDate;
  // Igual que antes: si llega sólo el inicio, el fin se recalcula con la duración del plan.
  if (given(endDate)) next.end_date = endDate;
  else if (given(startDate) && before?.duration_days) next.end_date = addDaysYmd(startDate, before.duration_days);
  if (given(paymentMethod)) next.payment_method = paymentMethod;
  if (given(cancellationsUsed)) next.cancellations_used = Number(cancellationsUsed);

  const start = next.start_date ?? before?.start_date ?? null;
  const end = next.end_date ?? before?.end_date ?? null;
  if (start && end && end < start) return { ok: false, message: "La fecha de fin no puede ser anterior a la de inicio." };

  const changes = changedFields(before, next, ADJUST_FIELDS, (k, v) =>
    k === "classes_remaining" ? creditsKey(v) : k === "cancellations_used" ? Number(v ?? 0) : v);
  const needsReason = changes.changed.some((k) => REASON_FIELDS.includes(k));
  const limit = before?.plan_class_limit;
  const newCredits = changes.after.classes_remaining;
  const abovePlan = newCredits !== undefined && creditsKey(newCredits) !== "ilimitado" && limit != null && Number(newCredits) > Number(limit);
  return { ok: true, next, changes, needsReason, abovePlan };
}
