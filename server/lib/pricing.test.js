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

test('per-plan promotion modes override studio opening consistently including zero', async () => {
 const {resolvePlanPricing}=await import('./pricing.js');
 for(const [mode,value,expected] of [['studio',null,900],['disabled',null,1200],['price',800,800],['price',0,0],['percent',10,1080],['percent',100,0],['percent',0,1200],['amount',200,1000],['amount',1200,0]]) {
  const plan={price:1200,opening_price:900,rules:{promotion_mode:mode,promotion_value:value}};
  assert.equal(resolveEffectivePrice(plan,true),expected);
  if(mode!=='studio')assert.equal(resolveEffectivePrice(plan,false),expected);
  const summary=resolvePlanPricing(plan,true);
  assert.equal(summary.promotionActive,expected!==1200);
  assert.equal(summary.openingActive,mode==='studio'&&expected!==1200);
  assert.equal(summary.promotionLabel,expected===1200?null:mode==='studio'?'Precio de apertura':'Promoción');
 }
 assert.equal(resolveEffectivePrice({price:333.33,rules:{promotion_mode:'percent',promotion_value:15}},false),283.33);
});
test('custom discounts never use fixed opening or mismatched regular links', async () => {
 const {resolvePlanPaymentUrl}=await import('./pricing.js');
 const rules={payment_url:'https://mpago.la/regular',opening_payment_url:'https://mpago.la/opening'};
 for(const promotion_mode of ['price','percent','amount']) {
  const promotion_value={price:900,percent:25,amount:300}[promotion_mode];
  const plan={price:1200,opening_price:900,rules:{...rules,promotion_mode,promotion_value}};
  assert.equal(resolvePlanPaymentUrl(plan,true),undefined);
  assert.equal(resolvePlanPaymentUrl(plan,false),undefined);
 }
 assert.equal(resolvePlanPaymentUrl({price:1200,opening_price:900,rules:{...rules,promotion_mode:'disabled'}},true),rules.payment_url);
 assert.equal(resolvePlanPaymentUrl({price:1200,opening_price:900,rules:{...rules,promotion_mode:'price',promotion_value:1200}},true),rules.payment_url);
});
test('invalid promotion values/types rejected and malformed saved promos cannot produce unsafe totals', async () => {
 const {validatePlanPromotion}=await import('./pricing.js');
 const {validatePlanRules}=await import('./planRules.js');
 for(const rules of [{promotion_mode:'wrong'},{promotion_mode:null},{promotion_value:'10'},{promotion_value:-1},{promotion_value:Infinity},{promotion_value:NaN},{promotion_value:true},{promotion_mode:'percent',promotion_value:101},{promotion_mode:'price'},{promotion_mode:'amount',promotion_value:null}]) {
  assert.throws(()=>validatePlanRules(rules));
  assert.equal(resolveEffectivePrice({price:1000,opening_price:900,rules},true),1000);
 }
 for(const promotion_mode of ['price','amount'])assert.throws(()=>validatePlanPromotion({promotion_mode,promotion_value:1001},1000));
 assert.doesNotThrow(()=>validatePlanPromotion({promotion_mode:'percent',promotion_value:100},0));
});

test('custom promotion has its own optional validated payment link, never an opening fallback', async () => {
 const {resolvePlanPaymentUrl,resolvePlanPricing}=await import('./pricing.js');
 const {validatePlanRules}=await import('./planRules.js');
 const rules={promotion_mode:'percent',promotion_value:20,payment_url:'https://mpago.la/regular',opening_payment_url:'https://mpago.la/opening',promotion_payment_url:'https://mpago.la/custom'};
 assert.equal(resolvePlanPaymentUrl({price:1000,opening_price:800,rules},true),rules.promotion_payment_url);
 assert.equal(resolvePlanPricing({price:1000,rules},false).paymentUrl,rules.promotion_payment_url);
 assert.equal(resolvePlanPaymentUrl({price:1000,rules:{...rules,promotion_value:0}},true),rules.payment_url);
 for(const promotion_payment_url of ['javascript:alert(1)','http://mpago.la/test','https://user:secret@mpago.la/test'])assert.throws(()=>validatePlanRules({...rules,promotion_payment_url}));
 assert.doesNotThrow(()=>validatePlanRules(rules));
});
