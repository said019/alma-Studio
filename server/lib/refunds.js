// Reembolsos que registra la dueña (auditoría 2026-09-27, P1-12). El dinero se
// devuelve fuera del sistema (efectivo, transferencia o terminal): aquí sólo se
// registra, se ajustan las clases y se marca el pago. No se llama a ninguna pasarela.
//   - Total: devuelve lo que queda por devolver, cancela la membresía de la orden
//     y le deja las clases en 0.
//   - Parcial: un monto menor a lo que queda; la dueña elige cuántas clases sin
//     usar quitar (el panel sugiere la proporción) y la membresía sigue activa.
import { reasonProblem } from "./audit.js";
import { cleanPaymentReference } from "./membershipAdmin.js";

export const REFUND_METHODS = Object.freeze(["cash", "transfer", "card"]);

/** Pesos a 2 decimales: restas como 1500 − 365.54 no dejan colas de flotante en el JSON. */
export const round2 = (n) => Math.round(Number(n) * 100) / 100;
const pesos = (n) => `$${round2(n).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const isUnlimited = (v) => v === null || v === undefined || Number(v) >= 9999;

export function parseMoney(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return Number.NaN;
  return Number(v.trim().replace(",", "."));
}

export function refundPlan({ order, membership = null, input = {} } = {}) {
  if (!order) return { ok: false, status: 404, message: "Orden no encontrada" };
  if (String(order.status) !== "approved") {
    return { ok: false, status: 409, code: "ORDER_NOT_PAID", message: "Sólo se reembolsan órdenes pagadas (aprobadas)." };
  }
  if (String(order.payment_method) === "wellhub" || String(order.channel) === "wellhub") {
    return { ok: false, status: 409, code: "WELLHUB_ORDER", message: "Las visitas de Wellhub se concilian con Wellhub; no se reembolsan aquí." };
  }
  const charged = round2(order.total_amount ?? 0);
  const already = round2(order.refunded_amount ?? 0);
  const remaining = round2(charged - already);
  if (charged <= 0) {
    return { ok: false, status: 409, code: "NOTHING_CHARGED", message: "Esta orden no tiene monto cobrado (cortesía): no hay nada que reembolsar." };
  }
  if (order.refund_status === "refunded" || remaining <= 0) {
    return { ok: false, status: 409, code: "ALREADY_REFUNDED", message: "Esta orden ya se reembolsó completa." };
  }
  const { kind, amount, method, reference, reason, classesToRemove } = input || {};
  if (kind !== "total" && kind !== "partial") return { ok: false, status: 400, message: "Elige reembolso total o parcial." };
  if (!REFUND_METHODS.includes(method)) {
    return { ok: false, status: 400, message: "Elige cómo se devolvió el dinero: efectivo, transferencia o terminal." };
  }
  const problem = reasonProblem(reason);
  if (problem) return { ok: false, status: 400, code: "REASON_REQUIRED", message: problem };
  const ref = cleanPaymentReference(reference);
  if (!ref.ok) return { ok: false, status: 400, message: ref.message };
  const limited = Boolean(membership) && !isUnlimited(membership.classes_remaining);

  if (kind === "total") {
    return {
      ok: true, kind, amount: remaining, method, reference: ref.value,
      classesToRemove: limited ? Math.max(0, Number(membership.classes_remaining) || 0) : 0,
      cancelMembership: Boolean(membership) && membership.status !== "cancelled",
      newRefunded: charged, newStatus: "refunded", charged, remaining,
    };
  }

  const n = round2(parseMoney(amount));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, status: 400, message: "Escribe el monto a devolver (mayor a $0)." };
  if (n > remaining + 0.004) {
    return { ok: false, status: 400, message: `No puedes reembolsar más de lo cobrado: quedan ${pesos(remaining)} por devolver.` };
  }
  if (Math.abs(n - remaining) < 0.005) {
    return { ok: false, status: 400, message: "Es todo lo que queda por devolver: elige reembolso total." };
  }
  const c = classesToRemove === undefined || classesToRemove === null || classesToRemove === "" ? 0 : Number(classesToRemove);
  if (!Number.isInteger(c) || c < 0) {
    return { ok: false, status: 400, message: "Las clases a quitar deben ser un número entero de 0 en adelante." };
  }
  if (c > 0) {
    if (!membership) return { ok: false, status: 400, message: "Esta orden no tiene membresía: no hay clases que quitar." };
    if (!limited) return { ok: false, status: 400, message: "La membresía es ilimitada: no hay clases que quitar." };
    if (membership.status !== "active") return { ok: false, status: 400, message: "La membresía ya no está activa: no hay clases que quitar." };
    if (c > Number(membership.classes_remaining)) {
      return { ok: false, status: 400, message: `Sólo le quedan ${membership.classes_remaining} clases sin usar.` };
    }
  }
  return {
    ok: true, kind, amount: n, method, reference: ref.value, classesToRemove: c, cancelMembership: false,
    newRefunded: round2(already + n), newStatus: "partially_refunded", charged, remaining,
  };
}
