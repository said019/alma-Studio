import { isSameMonth, startOfWeek } from "date-fns";

export type PaymentRow = { createdAt?: string; method?: string; total_amount?: number | string; amount?: number | string };

/* Totales del Historial calculados con la misma lista de GET /payments. */
export function summarizePayments(payments: PaymentRow[], now: Date) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const week = { amount: 0, count: 0 };
  const month = { amount: 0, count: 0 };
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const d = p.createdAt ? new Date(p.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const amount = Number(p.total_amount ?? p.amount ?? 0) || 0;
    if (isSameMonth(d, now)) {
      month.amount += amount;
      month.count += 1;
      const key = p.method ?? "otro";
      byMethod[key] = (byMethod[key] ?? 0) + amount;
    }
    if (d >= weekStart && d <= now) {
      week.amount += amount;
      week.count += 1;
    }
  }
  return { week, month, byMethod };
}
