import { isSameMonth, startOfWeek } from "date-fns";

export type PaymentRow = { createdAt?: string; method?: string; total_amount?: number | string; amount?: number | string };

/* Totales del Historial calculados con la misma lista de GET /payments. Los
   reembolsos llegan como filas negativas (bloque 3): restan del total, se
   cuentan aparte y también restan de su propio método en el desglose (no
   del método con el que se pagó originalmente), para que "Por método · mes"
   sume lo mismo que el neto del mes (ronda de ajustes, A9). */
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
      const key = p.method ?? "otro";
      if (amount < 0) {
        refunds.amount += -amount;
        refunds.count += 1;
        byMethod[key] = (byMethod[key] ?? 0) + amount;
      } else {
        month.count += 1;
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
