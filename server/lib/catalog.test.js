import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG_PLANS } from './catalog.js';
import { resolveEffectivePrice } from './pricing.js';

test('diez planes HIVE, precios exactos de la imagen y vigencia de 30 días', () => {
  assert.deepEqual(CATALOG_PLANS.map(p => [p.name, p.price, p.opening_price, p.class_limit]), [
    ['1 Clase',300,280,1], ['4 Clases',1140,1080,4], ['10 Clases',2600,2450,10],
    ['20 Clases',4500,4200,20], ['Mes',4200,3750,null], ['Suscripción',4000,3900,null],
    ['Clases de 12 a 4',250,200,1], ['Mes de 12 a 4',3799,3600,null],
    ['Personalizado',500,500,1], ['Clase muestra',200,500,1],
  ]);
  for (const p of CATALOG_PLANS) {
    assert.equal(p.duration_days,30);
    assert.equal(resolveEffectivePrice(p,true),p.opening_price);
    assert.equal(resolveEffectivePrice(p,false),p.price);
  }
});
test('reglas de paquetes especiales', () => {
  assert.deepEqual(CATALOG_PLANS.filter(p=>p.afternoon_only).map(p=>p.name),['Clases de 12 a 4','Mes de 12 a 4']);
  assert.deepEqual(CATALOG_PLANS.filter(p=>p.personal_only).map(p=>p.name),['Personalizado']);
  assert.deepEqual(CATALOG_PLANS.filter(p=>p.is_non_repeatable).map(p=>p.name),['Clase muestra']);
  assert.match(CATALOG_PLANS.find(p=>p.name==='Suscripción').description,/Renovación manual/);
});
