import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWithinAfternoonWindow, membershipAllowsSession, purchaseCredits } from './bookingRules.js';

test('franja de 12 a 4 usa inicio y hora de México, incluidos los límites', () => {
  for(const [time,expected] of [['11:59',false],['12:00',true],['15:59',true],['16:00',true],['16:01',false],['17:00',false]]) {
    assert.equal(isWithinAfternoonWindow(`2026-09-29T${time}:00-06:00`),expected,time);
  }
  assert.equal(isWithinAfternoonWindow('invalid'),false);
  assert.equal(isWithinAfternoonWindow(null),false);
});
test('paquetes restringidos no reservan fuera de su franja ni sesiones grupales con Personalizado', () => {
  const noon='2026-09-29T12:00:00-06:00', evening='2026-09-29T18:00:00-06:00';
  assert.equal(membershipAllowsSession({afternoon_only:true},noon,6),true);
  assert.equal(membershipAllowsSession({afternoon_only:true},evening,6),false);
  assert.equal(membershipAllowsSession({personal_only:true},noon,6),false);
  assert.equal(membershipAllowsSession({personal_only:true},noon,1),true);
  assert.equal(membershipAllowsSession({},noon,1),false);
  assert.equal(membershipAllowsSession({},evening,6),true);
});
test('mensual ilimitado sigue ilimitado tras comprar o renovar, aun con créditos previos', () => {
  assert.equal(purchaseCredits(null),null);
  assert.equal(purchaseCredits(null,7),null);
  assert.equal(purchaseCredits(4),4);
  assert.equal(purchaseCredits(10,2),12);
});
