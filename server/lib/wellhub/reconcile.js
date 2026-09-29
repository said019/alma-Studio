// Conciliación mensual de Wellhub en el panel de la dueña (auditoría 2026-09-27,
// P1-9): lo que confirmó Wellhub contra la asistencia en el estudio.
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "AAAA-MM" → { ok, month, from, to } (to = primer día del mes siguiente). Sin mes: el de `today`. */
export function wellhubMonthRange(month, today) {
  const m = month === undefined || month === null || month === "" ? String(today ?? "").slice(0, 7) : String(month);
  const hit = MONTH_RE.exec(m);
  if (!hit) return { ok: false, message: "Mes inválido (usa AAAA-MM)." };
  const y = Number(hit[1]);
  const mm = Number(hit[2]);
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  return { ok: true, month: m, from: `${m}-01`, to: `${next}-01` };
}

export function summarizeWellhubMonth(checkins = [], bookings = {}, unmatched = 0) {
  const por = (s) => checkins.filter((c) => c.status === s).length;
  return {
    confirmed: por("confirmed"),
    pending: por("pending"),
    failed: por("failed"),
    booked: Number(bookings?.booked ?? 0),
    attended: Number(bookings?.attended ?? 0),
    noShow: Number(bookings?.no_show ?? 0),
    unmatched: Number(unmatched) || 0,
  };
}
