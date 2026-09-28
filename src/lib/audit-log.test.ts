import { describe, it, expect } from "vitest";
import { actionLabel, auditChanges, auditSubject, formatAuditValue, type AuditEntry } from "./audit-log";

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
});
