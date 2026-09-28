import { test } from "node:test";
import assert from "node:assert/strict";
import { refundPlan, parseMoney, REFUND_METHODS } from "./refunds.js";

const order = { status: "approved", payment_method: "cash", channel: "counter", total_amount: "1700.00", refunded_amount: "0", refund_status: null };
const mem = { status: "active", classes_remaining: 6 };
const base = { method: "cash", reason: "No pudo seguir por lesión" };

test("total: devuelve lo que queda, cancela la membresía y quita sus clases", () => {
  const r = refundPlan({ order, membership: mem, input: { ...base, kind: "total" } });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 1700);
  assert.equal(r.newStatus, "refunded");
  assert.equal(r.newRefunded, 1700);
  assert.equal(r.cancelMembership, true);
  assert.equal(r.classesToRemove, 6);
  const tras = refundPlan({ order: { ...order, refunded_amount: "500", refund_status: "partially_refunded" }, membership: mem, input: { ...base, kind: "total" } });
  assert.equal(tras.amount, 1200, "después de un parcial, el total es lo que quedaba");
  const ilimitada = refundPlan({ order, membership: { status: "active", classes_remaining: null }, input: { ...base, kind: "total" } });
  assert.equal(ilimitada.classesToRemove, 0);
});

test("parcial: monto menor a lo que queda y las clases que decida la dueña", () => {
  const r = refundPlan({ order, membership: mem, input: { ...base, kind: "partial", amount: "425,50", classesToRemove: 2 } });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 425.5);
  assert.equal(r.classesToRemove, 2);
  assert.equal(r.cancelMembership, false);
  assert.equal(r.newStatus, "partially_refunded");
  assert.equal(r.newRefunded, 425.5);
});

test("no deja devolver más de lo cobrado, ni lo mismo dos veces, ni clases que no hay", () => {
  const msg = (input, o = order, m = mem) => refundPlan({ order: o, membership: m, input: { ...base, ...input } });
  assert.equal(msg({ kind: "partial", amount: 1800 }).message, "No puedes reembolsar más de lo cobrado: quedan $1,700 por devolver.");
  assert.equal(msg({ kind: "partial", amount: 1700 }).message, "Es todo lo que queda por devolver: elige reembolso total.");
  assert.equal(msg({ kind: "partial", amount: 0 }).message, "Escribe el monto a devolver (mayor a $0).");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 7 }).message, "Sólo le quedan 6 clases sin usar.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1.5 }).message, "Las clases a quitar deben ser un número entero de 0 en adelante.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1 }, order, { status: "active", classes_remaining: null }).message,
    "La membresía es ilimitada: no hay clases que quitar.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1 }, order, null).message, "Esta orden no tiene membresía: no hay clases que quitar.");
  const ya = msg({ kind: "total" }, { ...order, refunded_amount: "1700", refund_status: "refunded" });
  assert.equal(ya.status, 409);
  assert.equal(ya.code, "ALREADY_REFUNDED");
});

test("sólo órdenes pagadas, con monto, que no sean de Wellhub", () => {
  assert.equal(refundPlan({ order: { ...order, status: "pending_verification" }, input: { ...base, kind: "total" } }).code, "ORDER_NOT_PAID");
  assert.equal(refundPlan({ order: { ...order, total_amount: "0" }, input: { ...base, kind: "total" } }).code, "NOTHING_CHARGED");
  assert.equal(refundPlan({ order: { ...order, channel: "wellhub" }, input: { ...base, kind: "total" } }).code, "WELLHUB_ORDER");
  assert.equal(refundPlan({ order: null, input: {} }).status, 404);
});

test("entrada: tipo, método y motivo", () => {
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "otro" } }).message, "Elige reembolso total o parcial.");
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "total", method: "cheque" } }).message,
    "Elige cómo se devolvió el dinero: efectivo, transferencia o terminal.");
  const sin = refundPlan({ order, membership: mem, input: { kind: "total", method: "cash", reason: "ok" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.code, "REASON_REQUIRED");
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "total", reference: "x".repeat(101) } }).status, 400);
  assert.deepEqual(REFUND_METHODS, ["cash", "transfer", "card"]);
  assert.equal(parseMoney("99,50"), 99.5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});
