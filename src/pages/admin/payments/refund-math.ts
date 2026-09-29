// Cálculos del diálogo "Reembolsar" (auditoría 2026-09-27, P1-12). El servidor
// valida de nuevo; aquí sólo se sugiere y se explica.
export type RefundablePayment = {
  orderId: string;
  userName?: string | null;
  planName?: string | null;
  total_amount?: number | string;
  refundedAmount?: number | null;
  membershipId?: string | null;
  membershipStatus?: string | null;
  classesRemaining?: number | null;
  classLimit?: number | null;
};

export const REFUND_METHOD_LABEL: Record<"cash" | "transfer" | "card", string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Terminal",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const refundRemaining = (total: number, refunded?: number | null): number => round2(Number(total || 0) - Number(refunded || 0));

/** Clases a quitar en un parcial: proporcionales a lo devuelto (precio por
 *  clase = cobrado ÷ clases del plan), con tope en las que le quedan. */
export function suggestedClassesToRemove({ amount, charged, classLimit, classesRemaining }: {
  amount: number; charged: number; classLimit?: number | null; classesRemaining?: number | null;
}): number {
  const a = Number(amount);
  const c = Number(charged);
  const l = Number(classLimit);
  const r = Number(classesRemaining);
  if (!(a > 0) || !(c > 0) || !(l > 0) || classesRemaining === null || classesRemaining === undefined || !(r >= 0) || r >= 9999) return 0;
  return Math.min(r, Math.max(0, Math.round(a / (c / l))));
}
