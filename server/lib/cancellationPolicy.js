// Cuota de cancelaciones por paquete y política pública de reservas (auditoría
// 2026-09-27, P0-4). La cuota vive en settings.cancellation_settings (2 por
// defecto, 0 = sin límite); la ventana, en loyalty_config.faltas_cancel_window_hours.
// Cuenta toda cancelación que la clienta hace de una reserva confirmada, a tiempo
// o tarde. Salir de la lista de espera no cuenta.
export const DEFAULT_CANCELLATION_LIMIT = 2;
export const MAX_CANCELLATION_LIMIT = 20;

export function normalizeCancellationSettings(raw) {
  const n = raw && typeof raw === "object" ? raw.max_cancellations : undefined;
  const ok = Number.isInteger(n) && n >= 0 && n <= MAX_CANCELLATION_LIMIT;
  return { max_cancellations: ok ? n : DEFAULT_CANCELLATION_LIMIT };
}

/** null si la cuota que manda la dueña sirve; si no, el texto del 400. */
export function cancellationLimitProblem(value) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_CANCELLATION_LIMIT
    ? null
    : `Escribe un número entero de 0 a ${MAX_CANCELLATION_LIMIT}.`;
}

export function cancellationQuota({ used = 0, limit = 0 } = {}) {
  const u = Math.max(0, Math.trunc(Number(used) || 0));
  const l = Math.max(0, Math.trunc(Number(limit) || 0));
  return { limited: l > 0, used: u, limit: l, left: l > 0 ? Math.max(0, l - u) : null, exhausted: l > 0 && u >= l };
}

/** Qué pasa cuando la clienta cancela desde la app (DELETE /api/bookings/:id). */
export function clientCancelDecision({ bookingStatus, used = 0, limit = 0 }) {
  if (bookingStatus === "cancelled") {
    return { ok: false, status: 400, code: "ALREADY_CANCELLED", message: "Esta reserva ya fue cancelada" };
  }
  if (bookingStatus === "checked_in" || bookingStatus === "no_show") {
    return {
      ok: false, status: 409, code: "ATTENDANCE_RECORDED",
      message: "Esta reserva ya tiene la asistencia registrada. Si hay un error, habla con recepción.",
    };
  }
  if (bookingStatus === "waitlist") {
    return { ok: true, leavingWaitlist: true, countsTowardQuota: false, freesSeat: false };
  }
  const q = cancellationQuota({ used, limit });
  if (q.exhausted) {
    return {
      ok: false, status: 403, code: "CANCELLATION_LIMIT",
      message: `Ya usaste tus ${q.limit} ${q.limit === 1 ? "cancelación" : "cancelaciones"} de este paquete. Si necesitas cancelar, habla con recepción.`,
    };
  }
  return { ok: true, leavingWaitlist: false, countsTowardQuota: true, freesSeat: true };
}

/** La política que ven la app, los legales y el panel (contrato de src/lib/booking-policy.ts). */
export function publicBookingPolicy({ settings, loyalty, bookingLeadHours = 2 } = {}) {
  const s = normalizeCancellationSettings(settings);
  const w = Number(loyalty?.faltas_cancel_window_hours);
  const t = Number(loyalty?.faltas_threshold);
  return {
    cancellationLimit: s.max_cancellations,
    cancelWindowHours: Number.isFinite(w) && w > 0 ? w : 12,
    bookingLeadHours,
    waitlistCutoffHours: bookingLeadHours,
    faltasEnabled: loyalty?.faltas_enabled !== false,
    faltasThreshold: Number.isInteger(t) && t > 0 ? t : 5,
  };
}
