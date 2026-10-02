import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_PLANS } from './catalog.js';
import { resolveEffectivePrice } from './pricing.js';
import { validatePlanRules } from './planRules.js';
test('nueve planes y precios exactos de la imagen vigente',()=>{
 assert.deepEqual(CATALOG_PLANS.map(p=>[p.price,p.opening_price,p.class_limit,p.duration_days]),[[330,290,1,30],[1200,1080,4,30],[2700,2200,10,30],[4400,4000,20,60],[4800,4200,null,30],[4200,3900,null,30],[250,null,1,30],[250,null,1,30],[500,null,1,30]]);
 for(const p of CATALOG_PLANS) { validatePlanRules(p.rules); assert.equal(resolveEffectivePrice(p,true),p.opening_price??p.price);assert.equal(resolveEffectivePrice(p,false),p.price); }
});
test('condiciones mensual, anual, estudiante y personalizado',()=>{
 const byName=n=>CATALOG_PLANS.find(p=>p.name===n);
 assert.equal(byName('Plan mensual').rules.daily_class_limit,1);
 const annual=byName('Plan anual / pago mensual').rules;
 assert.equal(annual.daily_class_limit,2);assert.equal(annual.commitment_months,12);assert.equal(annual.guest_passes,2);assert.equal(annual.complimentary_coffee_per_day,1);assert.equal(annual.auto_renew,true);
 assert.equal(byName('Promo estudiante').rules.requires_student_id,true);
 assert.deepEqual(byName('Personalizado').rules.allowed_weekdays,[1,2,3,4,5]);
 assert.equal(byName('Personalizado').personal_only,true);
 assert.equal(byName('Horario especial').rules.booking_start_time,'11:00');
});
test('horarios semilla incluyen domingo y franjas propias del fin de semana',async()=>{
 const {CATALOG_SCHEDULE_BY_DAY:s}=await import('./catalog.js');
 assert.deepEqual(s[0],['8:00 am','9:00 am','10:00 am','11:00 am']);
 assert.deepEqual(s[6],['8:00 am','9:00 am','10:00 am','11:00 am','12:00 pm']);
 assert.ok(s[1].includes('6:00 am'));assert.ok(s[1].includes('4:00 pm'));assert.ok(s[1].includes('8:00 pm'));
});
