import { test } from "node:test";
import assert from "node:assert/strict";
import { saleAmountPlan, cleanPaymentReference, planMembershipAdjust, creditsKey, addDaysYmd, saleStartProblem, saleAuditAfter } from "./membershipAdmin.js";

// R10 (rulings-preflight.md, T3): "2026-02-30" no da NaN en `new Date()`.
test("saleStartProblem: sin fecha o fecha válida no hay problema; una fecha que no existe en el calendario sí", () => {
  assert.equal(saleStartProblem(undefined), null);
  assert.equal(saleStartProblem(""), null);
  assert.equal(saleStartProblem("2026-09-25"), null);
  assert.match(saleStartProblem("2026-02-30"), /inválida/);
  assert.match(saleStartProblem("no-es-fecha"), /inválida/);
});

// R12 (rulings-preflight.md, T3): misma forma del `after` en venta y alta manual.
test("saleAuditAfter: arma el after de membership.sale", () => {
  const plan = { id: "p1", name: "Paquete 8" };
  assert.deepEqual(
    saleAuditAfter({
      plan, listPrice: 1700, amount: 1700, paymentMethod: "cash", paymentReference: "ORD-1",
      orderId: "o1", startDate: "2026-09-25", endDate: "2026-10-25", classesRemaining: 8,
    }),
    {
      plan_id: "p1", plan_name: "Paquete 8", list_price: 1700, amount: 1700,
      payment_method: "cash", payment_reference: "ORD-1", order_id: "o1",
      start_date: "2026-09-25", end_date: "2026-10-25", classes_remaining: 8,
    },
  );
  assert.equal(saleAuditAfter({ plan, listPrice: 0, amount: 0, classesRemaining: null }).classes_remaining, null);
});

test("venta al precio del plan: sin motivo", () => {
  assert.deepEqual(saleAmountPlan({ listPrice: 1700 }), { ok: true, amount: 1700, listPrice: 1700, courtesy: false, priceDiffers: false, discount: 0, subtotal: 1700 });
  assert.equal(saleAmountPlan({ listPrice: 1700, amount: "1700" }).ok, true);
});

test("cortesía $0 o precio distinto: exige motivo", () => {
  const c = saleAmountPlan({ listPrice: 1700, amount: 0 });
  assert.equal(c.ok, false);
  assert.equal(c.code, "REASON_REQUIRED");
  assert.match(c.message, /cortesía/);
  const d = saleAmountPlan({ listPrice: 1700, amount: 1200, reason: "ok" });
  assert.equal(d.ok, false);
  assert.match(d.message, /distinto/);
  const ok = saleAmountPlan({ listPrice: 1700, amount: 1200, reason: "Descuento de amiga" });
  assert.equal(ok.ok, true);
  assert.equal(ok.discount, 500);
  assert.equal(ok.priceDiffers, true);
  assert.equal(saleAmountPlan({ listPrice: 0 }).ok, false, "un plan de $0 también es cortesía");
});

test("cobrar de más: precio distinto, subtotal = lo cobrado, sin descuento", () => {
  const r = saleAmountPlan({ listPrice: 1700, amount: 1800, reason: "Incluye tapete" });
  assert.equal(r.ok, true);
  assert.equal(r.discount, 0);
  assert.equal(r.subtotal, 1800);
});

test("monto inválido → mensaje; coma decimal aceptada", () => {
  for (const bad of ["abc", -1, "1e9", Infinity]) assert.equal(saleAmountPlan({ listPrice: 100, amount: bad }).ok, false, String(bad));
  assert.equal(saleAmountPlan({ listPrice: 100, amount: "99,50", reason: "Redondeo acordado" }).amount, 99.5);
});

test("referencia de pago", () => {
  assert.deepEqual(cleanPaymentReference(undefined), { ok: true, value: null });
  assert.deepEqual(cleanPaymentReference("  SPEI 123  "), { ok: true, value: "SPEI 123" });
  assert.equal(cleanPaymentReference("x".repeat(101)).ok, false);
  assert.equal(cleanPaymentReference(123).ok, false);
});

const before = { status: "active", classes_remaining: 1, start_date: "2026-09-01", end_date: "2026-10-01", payment_method: "cash", duration_days: 30, plan_class_limit: 1 };

test("ajuste de saldo: exige motivo y marca que queda por encima del plan", () => {
  const r = planMembershipAdjust({ before, input: { classesRemaining: 3 } });
  assert.equal(r.ok, true);
  assert.equal(r.needsReason, true);
  assert.equal(r.abovePlan, true);
  assert.deepEqual(r.changes, { changed: ["classes_remaining"], before: { classes_remaining: 1 }, after: { classes_remaining: 3 } });
});

test("el panel manda todo aunque no cambie: sin cambios no pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { status: "active", classesRemaining: 1, startDate: "2026-09-01", endDate: "2026-10-01" } });
  assert.deepEqual(r.changes.changed, []);
  assert.equal(r.needsReason, false);
  const unl = planMembershipAdjust({ before: { ...before, classes_remaining: null, plan_class_limit: null }, input: { classesRemaining: 9999 } });
  assert.deepEqual(unl.changes.changed, [], "9999 e ilimitado son lo mismo");
});

test("sólo inicio: el fin se recalcula con la duración; cambiar vigencia pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { startDate: "2026-10-15" } });
  assert.equal(r.next.end_date, "2026-11-14");
  assert.equal(r.needsReason, true);
  assert.deepEqual(r.changes.changed, ["start_date", "end_date"]);
});

test("cambiar sólo el método de pago no pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { paymentMethod: "transfer" } });
  assert.deepEqual(r.changes.changed, ["payment_method"]);
  assert.equal(r.needsReason, false);
});

test("entradas malas → ok:false", () => {
  for (const input of [
    { status: "regalada" }, { classesRemaining: -1 }, { classesRemaining: 2.5 }, { classesRemaining: "x" },
    { startDate: "2026-13-45" }, { endDate: "31/12/2026" }, { paymentMethod: "efectivo" }, { endDate: "2026-08-01" },
  ]) {
    assert.equal(planMembershipAdjust({ before, input }).ok, false, JSON.stringify(input));
  }
});

test("utilidades", () => {
  assert.equal(creditsKey(null), "ilimitado");
  assert.equal(creditsKey(9999), "ilimitado");
  assert.equal(creditsKey("3"), 3);
  assert.equal(addDaysYmd("2026-12-20", 30), "2027-01-19");
});
