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
