// Textos de la bitácora del panel (GET /api/admin/audit). Auditoría 2026-09-27, bloque 2.
import { formatMXN } from "@/lib/format";

/** Mínimo de caracteres (sin espacios en los extremos) para un motivo de la
 *  bitácora. Lo comparten aquí, los ajustes de membresía, las cancelaciones
 *  del estudio y la corrección de una falta. */
export const REASON_MIN_CHARS = 5;

export type AuditEntry = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown>;
};

export type AuditPage = { data: AuditEntry[]; page: number; limit: number; total: number };

export const AUDIT_ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todo" },
  { value: "membership", label: "Ventas y membresías" },
  { value: "booking", label: "Reservas y asistencia" },
  { value: "class", label: "Clases" },
  { value: "class_week", label: "Limpiezas de semana" },
  { value: "user", label: "Bajas de usuarios" },
  { value: "order", label: "Reembolsos" },
  { value: "plan", label: "Planes" },
  { value: "settings", label: "Configuración" },
];

const ACTION_LABEL: Record<string, string> = {
  "user.password_reset": "Enlace de acceso solicitado",
  "booking.checkin_undone": "Asistencia deshecha",
  "membership.pause": "Membresía congelada",
  "membership.resume": "Membresía reactivada",
  "plan.reorder": "Planes reordenados",
  "class.duplicate_week": "Semana copiada",
  "membership.sale": "Venta en mostrador",
  "membership.adjust": "Ajuste de membresía",
  "booking.reschedule": "Cambio de horario de reserva",
  "booking.checkin": "Check-in",
  "booking.no_show": "Falta marcada",
  "booking.no_show_corrected": "Falta corregida a asistencia",
  "booking.cancel": "Reserva cancelada por el estudio",
  "class.cancel": "Clase cancelada",
  "class.bulk_edit": "Clase editada en lote",
  "class.delete": "Clase borrada (sin reservas)",
  "class.week_clear": "Limpieza de semana",
  "user.anonymize": "Usuario dado de baja (anonimizada)",
  // Bloque 3 (auditoría 2026-09-27)
  "booking.waitlist_promoted": "Subió de la lista de espera",
  "order.refund": "Reembolso",
  "plan.archive": "Plan archivado",
  "plan.delete": "Plan borrado (sin historial)",
  "settings.update": "Política de cancelación cambiada",
};

export function actionLabel(e: Pick<AuditEntry, "action" | "meta">): string {
  const m = e.meta ?? {};
  if (e.action === "membership.sale" && m.courtesy) return "Cortesía en mostrador ($0)";
  if (e.action === "membership.sale" && m.price_differs) return "Venta en mostrador con precio distinto";
  if (e.action === "booking.checkin") {
    if (m.method === "wellhub") return "Check-in (Wellhub)";
    return m.method === "qr" ? "Check-in (QR)" : "Check-in (lista)";
  }
  if (e.action === "order.refund") return m.kind === "partial" ? "Reembolso parcial" : m.kind === "total" ? "Reembolso total" : "Reembolso";
  return ACTION_LABEL[e.action] ?? e.action;
}

const FIELD_LABEL: Record<string, string> = {
  class_type_name: "Disciplina",
  instructor_name: "Instructora",
  max_capacity: "Cupo",
  start_time: "Hora de inicio",
  end_time: "Hora de fin",
  notes: "Notas",
  plan_name: "Plan",
  amount: "Cobrado",
  list_price: "Precio del plan",
  payment_method: "Método",
  payment_reference: "Referencia",
  classes_remaining: "Clases",
  start_date: "Inicio",
  end_date: "Vence",
  status: "Estado",
  faltas_count: "Faltas",
  is_active: "Acceso",
  deleted: "Borradas",
  cancelled: "Canceladas",
  kept: "Sin tocar",
  // Bloque 3 (auditoría 2026-09-27)
  cancellations_used: "Cancelaciones usadas",
  refunded_amount: "Reembolsado",
  refund_status: "Pago",
  membership_status: "Membresía",
  for_sale: "En venta",
  max_cancellations: "Cancelaciones por paquete",
};
const MONEY = new Set(["amount", "list_price", "refunded_amount"]);
const STATUS_LABEL: Record<string, string> = {
  active: "Activa", expired: "Vencida", cancelled: "Cancelada", paused: "Pausada",
  pending_payment: "Pendiente de pago", pending_activation: "Pendiente de activar",
  confirmed: "Confirmada", checked_in: "Asistió", no_show: "Falta", waitlist: "Lista de espera",
  scheduled: "Programada", closed: "Cerrada",
};
const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", online: "En línea" };
// Métodos de un reembolso (bloque 3): "Terminal", no "Tarjeta", para no
// confundirlo con el cobro original.
const REFUND_METHOD_LABEL: Record<string, string> = { cash: "Efectivo", card: "Terminal", transfer: "Transferencia" };
const REFUND_LABEL: Record<string, string> = { refunded: "Reembolsado", partially_refunded: "Reembolso parcial" };
// En un borrado no hay "después": se muestra la clase (o el plan) en "sobre quién".
const NO_CHANGES = new Set(["class.delete", "plan.delete"]);

export function formatAuditValue(key: string, v: unknown): string {
  if (key === "classes_remaining") return v === null || v === undefined || Number(v) >= 9999 ? "Ilimitadas" : String(v);
  if (key === "refund_status") return REFUND_LABEL[String(v)] ?? "Sin reembolso";
  if (key === "for_sale") return v ? "Sí" : "No";
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key)) return formatMXN(Number(v));
  if (key === "status") return STATUS_LABEL[String(v)] ?? String(v);
  if (key === "membership_status") return STATUS_LABEL[String(v)] ?? String(v);
  if (key === "max_cancellations") return Number(v) === 0 ? "Sin límite" : String(v);
  if (key === "payment_method") return METHOD_LABEL[String(v)] ?? String(v);
  if (key === "is_active") return v ? "Activo" : "Cerrado";
  return String(v);
}

export function auditChanges(e: AuditEntry): { key: string; label: string; before: string | null; after: string }[] {
  if (NO_CHANGES.has(e.action)) return [];
  const b = e.before ?? {};
  const a = e.after ?? {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => FIELD_LABEL[k]);
  return keys.map((k) => ({
    key: k,
    label: FIELD_LABEL[k],
    before: k in b ? formatAuditValue(k, b[k]) : null,
    after: formatAuditValue(k, a[k]),
  }));
}

const pluralEs = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** Cuántas se saltó la subida de la lista de espera: el campo puede llegar
 *  como un arreglo de `{ booking_id, position, reason }` en vez de un
 *  número ya contado, así que se normaliza a partir de su longitud. */
function skippedCount(skipped: unknown): number {
  if (Array.isArray(skipped)) return skipped.length;
  const n = Number(skipped);
  return Number.isFinite(n) ? n : 0;
}

/** "Se conserva: …" de un plan archivado: el meta puede llegar como un
 *  objeto `{ memberships, orders, discount_codes }` con conteos, o como
 *  arreglo o texto simple; se acepta cualquiera de las tres formas. */
function keptLine(kept: unknown): string | null {
  if (kept && typeof kept === "object" && !Array.isArray(kept)) {
    const k = kept as Record<string, unknown>;
    const memberships = Number(k.memberships) || 0;
    const orders = Number(k.orders) || 0;
    const discountCodes = Number(k.discount_codes) || 0;
    const parts: string[] = [];
    if (memberships > 0) parts.push(`${memberships} ${pluralEs(memberships, "membresía", "membresías")}`);
    if (orders > 0) parts.push(`${orders} ${pluralEs(orders, "orden", "órdenes")}`);
    if (discountCodes > 0) parts.push(`${discountCodes} ${pluralEs(discountCodes, "código de descuento", "códigos de descuento")}`);
    return parts.length ? `Se conserva: ${parts.join(", ")}` : null;
  }
  if (Array.isArray(kept)) return kept.length ? `Se conserva: ${kept.join(", ")}` : null;
  if (kept !== undefined && kept !== null && kept !== "") return `Se conserva: ${String(kept)}`;
  return null;
}

/** Líneas de resumen de `meta` (crédito, puntos, conteos): sólo campos
 *  agregados o sí/no, nunca datos personales. */
export function auditMetaLines(e: Pick<AuditEntry, "action" | "meta" | "after">): string[] {
  const m = e.meta ?? {};
  const a = e.after ?? {};
  const lines: string[] = [];
  if (e.action === "booking.cancel") {
    if (m.credit_restored !== undefined) lines.push(`Crédito devuelto: ${m.credit_restored ? "Sí" : "No"}`);
    if (m.points_reverted !== undefined) lines.push(`Puntos revertidos: ${Number(m.points_reverted) || 0}`);
  }
  if (e.action === "class.cancel") {
    const bookingsCancelled = m.bookings_cancelled ?? a.bookings_cancelled;
    const creditsRestored = m.credits_restored ?? a.credits_restored;
    if (bookingsCancelled !== undefined) lines.push(`Reservas canceladas: ${Number(bookingsCancelled) || 0}`);
    if (creditsRestored !== undefined) lines.push(`Créditos devueltos: ${Number(creditsRestored) || 0}`);
  }
  if (e.action === "booking.no_show_corrected") {
    const refunded = Number(m.penalty_refunded) || 0;
    if (refunded > 0) lines.push(`Puntos devueltos por la falta: ${refunded}`);
  }
  // Cada acción trae su propia forma de meta (subida de fila, reembolso,
  // archivar plan): se listan por separado para no mezclar sus campos.
  if (e.action === "booking.waitlist_promoted") {
    if (m.position !== undefined) lines.push(`Posición en la fila: ${Number(m.position) || 0}`);
    if (m.skipped !== undefined) {
      const n = skippedCount(m.skipped);
      if (n > 0) lines.push(`Personas saltadas: ${n}`);
    }
  }
  if (e.action === "order.refund") {
    if (m.amount !== undefined) lines.push(`Monto: ${formatMXN(Number(m.amount) || 0)}`);
    if (m.method !== undefined) lines.push(`Método: ${REFUND_METHOD_LABEL[String(m.method)] ?? String(m.method)}`);
    if (m.reference) lines.push(`Referencia: ${String(m.reference)}`);
    if (m.classes_removed !== undefined) lines.push(`Clases quitadas: ${Number(m.classes_removed) || 0}`);
    if (m.bookings_cancelled !== undefined) lines.push(`Reservas canceladas: ${Number(m.bookings_cancelled) || 0}`);
  }
  if (e.action === "plan.archive") {
    if (m.kept !== undefined) {
      const line = keptLine(m.kept);
      if (line) lines.push(line);
    }
    if (m.cascade_requested !== undefined) lines.push(`Se pidió borrar todo: ${m.cascade_requested ? "Sí" : "No"}`);
  }
  return lines;
}

export function auditSubject(e: AuditEntry): string | null {
  if (e.subjectName) return e.subjectName;
  const m = e.meta ?? {};
  const b = (e.before ?? {}) as Record<string, unknown>;
  const day = (m.day ?? b.day) as string | undefined;
  if (e.entityType === "class" && day) {
    const hora = (m.start_time ?? b.start_time) as string | undefined;
    return `la clase del ${day}${hora ? ` ${hora}` : ""}`;
  }
  if (e.entityType === "class_week" && m.start) return `la semana del ${String(m.start)} al ${String(m.end)}`;
  if (e.entityType === "plan") return m.plan_name ? `el plan ${String(m.plan_name)}` : "un plan";
  if (e.entityType === "settings") return "la política de cancelación";
  return null;
}
