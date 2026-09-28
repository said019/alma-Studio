import { isSameMonth, startOfWeek } from "date-fns";

export type PaymentRow = { createdAt?: string; method?: string; total_amount?: number | string; amount?: number | string };

/* Totales del Historial calculados con la misma lista de GET /payments. Los
   reembolsos llegan como filas negativas (bloque 3): restan del total, se
   cuentan aparte y no entran al desglose por método. */
export function summarizePayments(payments: PaymentRow[], now: Date) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const week = { amount: 0, count: 0 };
  const month = { amount: 0, count: 0 };
  const refunds = { amount: 0, count: 0 };
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const d = p.createdAt ? new Date(p.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const amount = Number(p.total_amount ?? p.amount ?? 0) || 0;
    if (isSameMonth(d, now)) {
      month.amount += amount;
      if (amount < 0) {
        refunds.amount += -amount;
        refunds.count += 1;
      } else {
        month.count += 1;
        const key = p.method ?? "otro";
        byMethod[key] = (byMethod[key] ?? 0) + amount;
      }
    }
    if (d >= weekStart && d <= now) {
      week.amount += amount;
      if (amount >= 0) week.count += 1;
    }
  }
  return { week, month, byMethod, refunds };
}
