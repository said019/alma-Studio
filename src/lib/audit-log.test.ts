import { describe, it, expect } from "vitest";
import { actionLabel, auditChanges, auditMetaLines, auditSubject, formatAuditValue, AUDIT_ENTITY_OPTIONS, type AuditEntry } from "./audit-log";

const base: AuditEntry = {
  id: "e1", createdAt: "2026-09-28T16:00:00Z", actorId: "a1", actorName: "Dueña HIVE", actorRole: "admin",
  action: "membership.adjust", entityType: "membership", entityId: "m1", subjectUserId: "u1", subjectName: "Ana Pérez",
  reason: "Compensación", before: { classes_remaining: 1, end_date: "2026-10-01" }, after: { classes_remaining: 3, end_date: "2026-12-31" }, meta: {},
};

describe("bitácora · textos", () => {
  it("nombra cada acción en español", () => {
    expect(actionLabel(base)).toBe("Ajuste de membresía");
    expect(actionLabel({ ...base, action: "membership.sale", meta: { courtesy: true } })).toBe("Cortesía en mostrador ($0)");
    expect(actionLabel({ ...base, action: "membership.sale", meta: { price_differs: true } })).toBe("Venta en mostrador con precio distinto");
    expect(actionLabel({ ...base, action: "membership.sale", meta: {} })).toBe("Venta en mostrador");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "qr" } })).toBe("Check-in (QR)");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "manual" } })).toBe("Check-in (lista)");
    expect(actionLabel({ ...base, action: "booking.no_show_corrected" })).toBe("Falta corregida a asistencia");
    expect(actionLabel({ ...base, action: "algo.nuevo" })).toBe("algo.nuevo");
  });

  it("antes → después con etiquetas y formato", () => {
    expect(auditChanges(base)).toEqual([
      { key: "classes_remaining", label: "Clases", before: "1", after: "3" },
      { key: "end_date", label: "Vence", before: "2026-10-01", after: "2026-12-31" },
    ]);
  });

  it("una venta muestra sólo el después y el dinero en pesos; los ids no se muestran", () => {
    const sale = { ...base, action: "membership.sale", before: null, after: { plan_name: "Paquete 8", amount: 0, list_price: 1700, payment_method: "cash", payment_reference: "ORD-000001", order_id: "o1" } };
    expect(auditChanges(sale)).toEqual([
      { key: "plan_name", label: "Plan", before: null, after: "Paquete 8" },
      { key: "amount", label: "Cobrado", before: null, after: "$0" },
      { key: "list_price", label: "Precio del plan", before: null, after: "$1,700" },
      { key: "payment_method", label: "Método", before: null, after: "Efectivo" },
      { key: "payment_reference", label: "Referencia", before: null, after: "ORD-000001" },
    ]);
  });

  it("sobre quién: clienta, clase o semana", () => {
    expect(auditSubject(base)).toBe("Ana Pérez");
    expect(auditSubject({ ...base, subjectName: null, entityType: "class", meta: { day: "2026-10-01", start_time: "09:00" } })).toBe("la clase del 2026-10-01 09:00");
    expect(auditSubject({ ...base, subjectName: null, entityType: "class_week", meta: { start: "2026-09-21", end: "2026-09-27" } })).toBe("la semana del 2026-09-21 al 2026-09-27");
  });

  it("valores especiales", () => {
    expect(formatAuditValue("classes_remaining", null)).toBe("Ilimitadas");
    expect(formatAuditValue("classes_remaining", 9999)).toBe("Ilimitadas");
    expect(formatAuditValue("status", "no_show")).toBe("Falta");
    expect(formatAuditValue("end_date", null)).toBe("—");
    expect(formatAuditValue("is_active", false)).toBe("Cerrado");
  });

  it("resume crédito, puntos y conteos de meta, sin datos personales", () => {
    expect(auditMetaLines({ action: "booking.cancel", after: null, meta: { credit_restored: true, points_reverted: 20 } }))
      .toEqual(["Crédito devuelto: Sí", "Puntos revertidos: 20"]);
    expect(auditMetaLines({ action: "booking.cancel", after: null, meta: { credit_restored: false, points_reverted: 0 } }))
      .toEqual(["Crédito devuelto: No", "Puntos revertidos: 0"]);
    expect(auditMetaLines({ action: "booking.cancel", after: null, meta: {} })).toEqual([]);
    expect(auditMetaLines({ action: "class.cancel", after: null, meta: { bookings_cancelled: 3, credits_restored: 2 } }))
      .toEqual(["Reservas canceladas: 3", "Créditos devueltos: 2"]);
    expect(auditMetaLines({ action: "class.cancel", after: { bookings_cancelled: 1, credits_restored: 0 }, meta: {} }))
      .toEqual(["Reservas canceladas: 1", "Créditos devueltos: 0"]);
    expect(auditMetaLines({ action: "booking.no_show_corrected", after: null, meta: { penalty_refunded: 50 } }))
      .toEqual(["Puntos devueltos por la falta: 50"]);
    expect(auditMetaLines({ action: "booking.no_show_corrected", after: null, meta: { penalty_refunded: 0 } })).toEqual([]);
    expect(auditMetaLines({ action: "membership.adjust", after: null, meta: { classes_remaining: 3 } })).toEqual([]);
  });
});

describe("bitácora · textos del bloque 3", () => {
  it("nombra las acciones nuevas", () => {
    expect(actionLabel({ ...base, action: "booking.waitlist_promoted" })).toBe("Subió de la lista de espera");
    expect(actionLabel({ ...base, action: "order.refund", meta: { kind: "total" } })).toBe("Reembolso total");
    expect(actionLabel({ ...base, action: "order.refund", meta: { kind: "partial" } })).toBe("Reembolso parcial");
    expect(actionLabel({ ...base, action: "plan.archive" })).toBe("Plan archivado");
    expect(actionLabel({ ...base, action: "plan.delete" })).toBe("Plan borrado (sin historial)");
    expect(actionLabel({ ...base, action: "settings.update" })).toBe("Política de cancelación cambiada");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "wellhub" } })).toBe("Check-in (Wellhub)");
  });

  it("antes → después de cancelaciones, reembolsos, planes y política", () => {
    expect(auditChanges({ ...base, before: { cancellations_used: 2 }, after: { cancellations_used: 0 } })).toEqual([
      { key: "cancellations_used", label: "Cancelaciones usadas", before: "2", after: "0" },
    ]);
    expect(auditChanges({ ...base, action: "order.refund", before: { refunded_amount: 0, refund_status: null }, after: { refunded_amount: 500, refund_status: "partially_refunded" } })).toEqual([
      { key: "refunded_amount", label: "Reembolsado", before: "$0", after: "$500" },
      { key: "refund_status", label: "Pago", before: "Sin reembolso", after: "Reembolso parcial" },
    ]);
    expect(auditChanges({ ...base, action: "plan.archive", before: { for_sale: true }, after: { for_sale: false } })).toEqual([
      { key: "for_sale", label: "En venta", before: "Sí", after: "No" },
    ]);
    expect(formatAuditValue("max_cancellations", 0)).toBe("Sin límite");
    expect(formatAuditValue("membership_status", "cancelled")).toBe("Cancelada");
  });

  it("sobre qué: plan y política", () => {
    expect(auditSubject({ ...base, subjectName: null, entityType: "plan", meta: { plan_name: "Paquete 8" } })).toBe("el plan Paquete 8");
    expect(auditSubject({ ...base, subjectName: null, entityType: "settings", meta: {} })).toBe("la política de cancelación");
  });

  it("filtros nuevos", () => {
    expect(AUDIT_ENTITY_OPTIONS.map((o) => o.label)).toEqual(expect.arrayContaining(["Reembolsos", "Planes", "Configuración"]));
  });

  it("meta del bloque 3: subida de fila, reembolso y plan archivado", () => {
    // meta.skipped en 0 (número) no se muestra.
    expect(auditMetaLines({ action: "booking.waitlist_promoted", after: null, meta: { position: 1, skipped: 0 } }))
      .toEqual(["Posición en la fila: 1"]);
    // meta.skipped como número > 0 (compatibilidad).
    expect(auditMetaLines({ action: "booking.waitlist_promoted", after: null, meta: { position: 3, skipped: 2 } }))
      .toEqual(["Posición en la fila: 3", "Personas saltadas: 2"]);
    expect(auditMetaLines({
      action: "order.refund", after: null,
      meta: { amount: 500, kind: "partial", method: "card", reference: "AUTH123", classes_removed: 2, bookings_cancelled: 1 },
    })).toEqual([
      "Monto: $500", "Método: Terminal", "Referencia: AUTH123", "Clases quitadas: 2", "Reservas canceladas: 1",
    ]);
    expect(auditMetaLines({
      action: "order.refund", after: null,
      meta: { amount: 1200, kind: "total", method: "cash", classes_removed: 0, bookings_cancelled: 0 },
    })).toEqual(["Monto: $1,200", "Método: Efectivo", "Clases quitadas: 0", "Reservas canceladas: 0"]);
    expect(auditMetaLines({ action: "plan.archive", after: null, meta: { kept: "membresías" } }))
      .toEqual(["Se conserva: membresías"]);
    expect(auditMetaLines({ action: "plan.archive", after: null, meta: { kept: ["membresías", "órdenes"], cascade_requested: true } }))
      .toEqual(["Se conserva: membresías, órdenes", "Se pidió borrar todo: Sí"]);
  });

  it("meta del bloque 3: skipped como arreglo de saltadas y kept como objeto de conteos", () => {
    expect(auditMetaLines({
      action: "booking.waitlist_promoted", after: null,
      meta: {
        position: 2,
        skipped: [
          { booking_id: "b1", position: 1, reason: "sin clases" },
          { booking_id: "b2", position: 2, reason: "membresía vencida" },
        ],
      },
    })).toEqual(["Posición en la fila: 2", "Personas saltadas: 2"]);

    expect(auditMetaLines({
      action: "plan.archive", after: null,
      meta: { kept: { memberships: 1, orders: 1, discount_codes: 0 } },
    })).toEqual(["Se conserva: 1 membresía, 1 orden"]);

    expect(auditMetaLines({
      action: "plan.archive", after: null,
      meta: { kept: { memberships: 2, orders: 0, discount_codes: 3 } },
    })).toEqual(["Se conserva: 2 membresías, 3 códigos de descuento"]);

    expect(auditMetaLines({
      action: "plan.archive", after: null,
      meta: { kept: { memberships: 0, orders: 0, discount_codes: 0 } },
    })).toEqual([]);
  });
});
