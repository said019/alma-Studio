import {test} from 'node:test';import assert from 'node:assert/strict';
import {validatePlanRules,sessionWithinRules,sessionWithinValidity} from './planRules.js';
import {membershipAllowsSession} from './bookingRules.js';
test('hora local, fines de semana y límites exactos',()=>{
 const r={allowed_weekdays:[1,2,3,4,5],booking_start_time:'11:00',booking_end_time:'16:00'};
 for(const [d,ok] of [['2026-10-02T10:59:00-06:00',false],['2026-10-02T11:00:00-06:00',true],['2026-10-02T16:00:00-06:00',true],['2026-10-02T16:01:00-06:00',false],['2026-10-03T12:00:00-06:00',false],['2026-10-04T12:00:00-06:00',false]]) assert.equal(sessionWithinRules(r,d),ok,d);
 assert.equal(sessionWithinRules(r,'invalid'),false);
});
test('fecha de la clase debe caer dentro de vigencia, incluida compra y vencimiento',()=>{
 const m={start_date:'2026-10-01',end_date:'2026-10-30',rules:{}};
 assert.equal(sessionWithinValidity(m,'2026-10-01T00:00:00-06:00'),true);
 assert.equal(sessionWithinValidity(m,'2026-10-30T23:59:00-06:00'),true);
 assert.equal(membershipAllowsSession(m,'2026-10-31T00:00:00-06:00',4),false);
 assert.equal(membershipAllowsSession(m,'2026-09-30T12:00:00-06:00',4),false);
});
test('rechaza condiciones inconsistentes, fracciones, links inseguros y prórrogas',()=>{
 for(const r of [{daily_class_limit:0},{daily_class_limit:1.5},{guest_passes:-1},{allowed_weekdays:[]},{allowed_weekdays:[7]},{booking_start_time:'25:00'},{booking_start_time:'16:00',booking_end_time:'11:00'},{auto_renew:true,billing_period:'one_time'},{payment_url:'javascript:alert(1)'},{transferable:true},{extendable:true}]) assert.throws(()=>validatePlanRules(r));
 assert.deepEqual(validatePlanRules({daily_class_limit:null,booking_start_time:null,booking_end_time:null}),{daily_class_limit:null,booking_start_time:null,booking_end_time:null});
});
