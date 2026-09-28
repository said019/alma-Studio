// "Limpiar semana" sin borrar historial (auditoría 2026-09-27, P1-5 · I6).
import { isDay } from "./validate.js";

export const MAX_CLEAR_DAYS = 31;

/**
 * Clasifica cada clase del rango. Antes que nada: si ya empezó (o ya pasó) no
 * se toca, tenga o no reservas — "Limpiar semana" nunca cancela ni devuelve
 * crédito de una clase que ya ocurrió. De las que faltan por pasar:
 *  - sin ninguna reserva (de ningún estado) → se borra;
 *  - ya estaba cancelada → se deja igual;
 *  - el resto (tiene reservas y no ha empezado) → se cancela con el flujo de
 *    cancelar clase, que devuelve créditos y avisa.
 */
export function planWeekClear(rows) {
  const plan = { delete: [], cancel: [], keep: [], activeBookings: 0 };
  for (const r of rows || []) {
    const total = Number(r.total_bookings) || 0;
    if (r.started === true) plan.keep.push(r.id);
    else if (total === 0) plan.delete.push(r.id);
    else if (r.status === "cancelled") plan.keep.push(r.id);
    else {
      plan.cancel.push(r.id);
      plan.activeBookings += Number(r.active_bookings) || 0;
    }
  }
  return plan;
}

/** null si el rango sirve; si no, el texto del 400. */
export function weekRangeProblem(start, end) {
  if (!start || !end) return "startDate y endDate requeridos";
  if (!isDay(start) || !isDay(end)) return "Fechas inválidas (usa AAAA-MM-DD).";
  if (start > end) return "Rango de fechas inválido";
  const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_CLEAR_DAYS) return `El rango no puede pasar de ${MAX_CLEAR_DAYS} días.`;
  return null;
}
