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
 * Minutos del barrido de respaldo, leídos de WAITLIST_SWEEP_MINUTES. Viene
 * APAGADO por defecto: sin la variable, en 0 o con un valor que no es un número
 * positivo devuelve 0 y el barrido no se programa. Motivo: en producción hay
 * filas viejas en clases con lugar, y al desplegar el barrido las inscribiría
 * solas, les descontaría una clase y les mandaría aviso sin que el dueño lo
 * decida. La subida por evento (onSeatReleased) sí corre siempre.
 */
export function sweepMinutes(raw) {
  const n = Number(typeof raw === "string" ? raw.trim() : raw ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
