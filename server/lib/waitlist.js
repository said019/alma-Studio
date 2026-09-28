// Reglas puras de la lista de espera con subida automática (auditoría
// 2026-09-27, P1-1). La subida vive en server/index.js (promoteOneFromWaitlist).
const HOUR_MS = 60 * 60 * 1000;

const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v ?? ""));

/** ¿Todavía aplica la subida? Sólo si faltan cutoffHours o más para el inicio. */
export function promotionWindowOpen(startsAt, now = Date.now(), cutoffHours = 2) {
  const t = ms(startsAt);
  const n = ms(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  return t - n >= Number(cutoffHours) * HOUR_MS;
}

export function freeSeats(capacity, live) {
  return Math.max(0, (Number(capacity) || 0) - (Number(live) || 0));
}

/** Con fila y subida vigente, una reserva nueva entra a la fila aunque haya
 *  lugar: nadie se salta la fila. A menos de cutoffHours el lugar queda libre. */
export function queueBlocksNewBooking({ waiting, startsAt, now = Date.now(), cutoffHours = 2 }) {
  return Number(waiting) > 0 && promotionWindowOpen(startsAt, now, cutoffHours);
}

/** La primera que cumple, en orden de llegada, y las que se saltaron antes que ella. */
export function firstEligible(candidates = []) {
  const skipped = [];
  for (const c of candidates) {
    if (!c.reason) return { promote: c, skipped };
    skipped.push(c);
  }
  return { promote: null, skipped };
}

/**
 * Máximo de WAITLIST_SWEEP_MINUTES: setInterval admite hasta 2^31-1 ms
 * (≈ 35791,39 min); con más se desborda y Node lo corre cada 1 ms.
 */
export const MAX_SWEEP_MINUTES = 35791;

/**
 * Minutos del barrido de respaldo, leídos de WAITLIST_SWEEP_MINUTES. Viene
 * APAGADO por defecto: sin la variable, en 0 o con un valor que no es un número
 * positivo devuelve 0 y el barrido no se programa. Motivo: en producción hay
 * filas viejas en clases con lugar, y al desplegar el barrido las inscribiría
 * solas, les descontaría una clase y les mandaría aviso sin que el dueño lo
 * decida. La subida por evento (onSeatReleased) sí corre siempre.
 * Un valor mayor que MAX_SWEEP_MINUTES también se trata como apagado (no se
 * recorta): es un error de configuración, y ante la duda el barrido no corre.
 */
export function sweepMinutes(raw) {
  const n = Number(typeof raw === "string" ? raw.trim() : raw ?? 0);
  return Number.isFinite(n) && n > 0 && n <= MAX_SWEEP_MINUTES ? n : 0;
}

/**
 * Envuelve una tarea para que no se traslape consigo misma: mientras una vuelta
 * corre, las llamadas nuevas no hacen nada y devuelven false. Al terminar (bien
 * o con error) se puede volver a correr.
 */
export function singleFlight(fn) {
  let running = false;
  return async (...args) => {
    if (running) return false;
    running = true;
    try {
      await fn(...args);
      return true;
    } finally {
      running = false;
    }
  };
}

/**
 * ¿Una edición de la clase (PUT /api/admin/classes/:id) libera lugares? Sólo si
 * el cupo aumentó o si pasó de 'closed' a 'scheduled'. before/after:
 * { max_capacity, status }.
 */
export function classEditReleasesSeats({ before, after } = {}) {
  if (!before || !after) return false;
  const grew = Number(after.max_capacity) > Number(before.max_capacity);
  const reopened = before.status === "closed" && after.status === "scheduled";
  return grew || reopened;
}

/**
 * La regla que se le explica a quien entra a la fila, en el correo y en el
 * WhatsApp: la subida es automática y usa una clase del paquete, así que
 * "te avisamos si se libera" no basta para que sepa lo que va a pasar.
 */
export function waitlistJoinRule(cutoffHours = 2) {
  const h = Number(cutoffHours) > 0 ? Number(cutoffHours) : 2;
  return `Si se libera un lugar hasta ${h} ${h === 1 ? "hora" : "horas"} antes de la clase, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.`;
}

/** Llave del WhatsApp de "entraste a la fila". No tiene plantilla por defecto
 *  en DEFAULT_NOTIFICATION_TEMPLATES: sale el texto de respaldo, salvo que el
 *  estudio guarde una plantilla con esta llave. */
export const WAITLIST_JOINED_TEMPLATE_KEY = "booking_waitlisted";

/**
 * WhatsApp de una reserva nueva según su estado FINAL (después de la subida):
 * "confirmed" → booking_confirmed; "waitlist" → WAITLIST_JOINED_TEMPLATE_KEY;
 * cualquier otro (p. ej. la cancelaron a media petición) → null, sin aviso.
 * Una reserva que quedó en la fila nunca manda la plantilla de confirmada.
 */
export function bookingNotice({ status, firstName, className, date, time, cutoffHours = 2 } = {}) {
  const who = String(firstName ?? "").trim() || "Alumna";
  const cls = className || "tu clase";
  const when = [date, time].filter(Boolean).join(" ");
  const cuando = when ? ` (${when})` : "";
  if (status === "confirmed") {
    return { templateKey: "booking_confirmed", fallbackMessage: `Hola ${who}, tu reserva para ${cls}${cuando} está confirmada.` };
  }
  if (status === "waitlist") {
    return {
      templateKey: WAITLIST_JOINED_TEMPLATE_KEY,
      fallbackMessage: `Hola ${who}, quedaste en lista de espera para ${cls}${cuando}. ${waitlistJoinRule(cutoffHours)}`,
    };
  }
  return null;
}
