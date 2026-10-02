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

test('link externo corresponde al precio efectivo; sin apertura usa regular',async()=>{
 const {resolvePlanPaymentUrl}=await import('./pricing.js');
 const p={price:4200,opening_price:3900,rules:{payment_url:'https://mpago.la/1YY3tpp',opening_payment_url:'https://mpago.la/1HWyxU1'}};
 assert.equal(resolvePlanPaymentUrl(p,true),p.rules.opening_payment_url);
 assert.equal(resolvePlanPaymentUrl(p,false),p.rules.payment_url);
 for(const opening_price of [null,0,-1,'invalid'])assert.equal(resolvePlanPaymentUrl({...p,opening_price},true),p.rules.payment_url);
});
test('no usa enlace regular de4200 para promoción3900 sin enlace específico',async()=>{
 const {resolvePlanPaymentUrl}=await import('./pricing.js');
 const p={price:4200,opening_price:3900,rules:{payment_url:'https://mpago.la/1YY3tpp'}};
 assert.equal(resolvePlanPaymentUrl(p,true),undefined);
 assert.equal(resolvePlanPaymentUrl({...p,opening_price:4200},true),p.rules.payment_url);
});
