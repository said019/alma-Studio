// Reglas puras de la penalización por inasistencias.
export function isWithinCancelWindow(minutesUntilClass, windowHours = 12) {
  const m = Number(minutesUntilClass);
  if (!Number.isFinite(m)) return false;
  return m < windowHours * 60;
}
export function penaltyDueAt(newFaltasCount, threshold = 5) {
  const n = Number(newFaltasCount), t = Number(threshold);
  if (!Number.isFinite(n) || !Number.isFinite(t) || t <= 0) return false;
  return n > 0 && n % t === 0;
}

/** Qué deshacer al corregir UNA falta: el contador baja uno y, si el contador
 *  actual es múltiplo del umbral (esa falta completó la penalización), se
 *  devuelve la penalización. Auditoría 2026-09-27, bloque 2. */
export function faltaReversal({ faltasCount, threshold = 5, penaltyPoints = 0 }) {
  const n = Math.max(0, Math.trunc(Number(faltasCount) || 0));
  if (n === 0) return { newCount: 0, refundPoints: 0 };
  const refund = penaltyDueAt(n, threshold) && Number(penaltyPoints) > 0 ? Math.abs(Number(penaltyPoints)) : 0;
  return { newCount: n - 1, refundPoints: refund };
}
