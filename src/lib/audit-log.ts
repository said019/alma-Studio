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
  { value: "user", label: "Bajas de clientas" },
];

const ACTION_LABEL: Record<string, string> = {
  "membership.sale": "Venta en mostrador",
  "membership.adjust": "Ajuste de membresía",
  "booking.checkin": "Check-in",
  "booking.no_show": "Falta marcada",
  "booking.no_show_corrected": "Falta corregida a asistencia",
  "booking.cancel": "Reserva cancelada por el estudio",
  "class.cancel": "Clase cancelada",
  "class.delete": "Clase borrada (sin reservas)",
  "class.week_clear": "Limpieza de semana",
  "user.anonymize": "Clienta dada de baja (anonimizada)",
};

export function actionLabel(e: Pick<AuditEntry, "action" | "meta">): string {
  const m = e.meta ?? {};
  if (e.action === "membership.sale" && m.courtesy) return "Cortesía en mostrador ($0)";
  if (e.action === "membership.sale" && m.price_differs) return "Venta en mostrador con precio distinto";
  if (e.action === "booking.checkin") return m.method === "qr" ? "Check-in (QR)" : "Check-in (lista)";
  return ACTION_LABEL[e.action] ?? e.action;
}

const FIELD_LABEL: Record<string, string> = {
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
};
const MONEY = new Set(["amount", "list_price"]);
const STATUS_LABEL: Record<string, string> = {
  active: "Activa", expired: "Vencida", cancelled: "Cancelada", paused: "Pausada",
  pending_payment: "Pendiente de pago", pending_activation: "Pendiente de activar",
  confirmed: "Confirmada", checked_in: "Asistió", no_show: "Falta", waitlist: "Lista de espera",
  scheduled: "Programada", closed: "Cerrada",
};
const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", online: "En línea" };
// En un borrado no hay "después": se muestra la clase en "sobre quién".
const NO_CHANGES = new Set(["class.delete"]);

export function formatAuditValue(key: string, v: unknown): string {
  if (key === "classes_remaining") return v === null || v === undefined || Number(v) >= 9999 ? "Ilimitadas" : String(v);
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key)) return formatMXN(Number(v));
  if (key === "status") return STATUS_LABEL[String(v)] ?? String(v);
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
  return null;
}
