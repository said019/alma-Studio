// Regla única de check-in para QR, lista y coach (auditoría 2026-09-27, P0-5).
export const CHECKIN_OPENS_MIN_BEFORE = 90;

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function checkinRule({ bookingStatus, classStatus, classDate, startTime, nowDate, nowMinutes }) {
  if (!["confirmed", "checked_in"].includes(bookingStatus)) {
    return { ok: false, code: "BOOKING_NOT_ACTIVE", message: "La reserva no está activa." };
  }
  if (classStatus === "cancelled") {
    return { ok: false, code: "CLASS_CANCELLED", message: "La clase fue cancelada." };
  }
  if (classDate !== nowDate) {
    return { ok: false, code: "NOT_TODAY", message: `La clase es de otro día (${classDate}).` };
  }
  const opens = Math.max(0, toMin(startTime) - CHECKIN_OPENS_MIN_BEFORE);
  if (nowMinutes < opens) {
    return { ok: false, code: "TOO_EARLY", message: `El check-in abre a las ${fmt(opens)}.` };
  }
  return { ok: true };
}

/** Corregir una falta a asistencia (pedido del dueño, bloque 2): sólo una
 *  reserva marcada como falta, de una clase no cancelada y el mismo día de la
 *  clase en la zona del estudio. */
export function noShowCorrectionRule({ bookingStatus, classStatus, classDate, nowDate }) {
  if (bookingStatus !== "no_show") {
    return { ok: false, code: "NOT_NO_SHOW", message: "La reserva no está marcada como falta." };
  }
  if (classStatus === "cancelled") {
    return { ok: false, code: "CLASS_CANCELLED", message: "La clase fue cancelada." };
  }
  if (classDate !== nowDate) {
    return { ok: false, code: "NOT_SAME_DAY", message: `Sólo se puede corregir el mismo día de la clase (${classDate}).` };
  }
  return { ok: true };
}
