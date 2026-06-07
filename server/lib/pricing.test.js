import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffectivePrice } from "./pricing.js";

test("usa opening_price cuando el modo apertura está activo", () => {
  const plan = { price: 2700, opening_price: 2300 };
  assert.equal(resolveEffectivePrice(plan, true), 2300);
});
test("usa price regular cuando el modo apertura está apagado", () => {
  const plan = { price: 2700, opening_price: 2300 };
  assert.equal(resolveEffectivePrice(plan, false), 2700);
});
test("usa price regular si no hay opening_price aunque apertura esté activa", () => {
  const plan = { price: 900, opening_price: null };
  assert.equal(resolveEffectivePrice(plan, true), 900);
});
test("ignora opening_price inválido", () => {
  const plan = { price: 900, opening_price: "x" };
  assert.equal(resolveEffectivePrice(plan, true), 900);
});
