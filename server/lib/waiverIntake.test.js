import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWaiverIntake, waiverWithIntake } from './waiverIntake.js';
const valid = { phone: '5559449611', emergency_contact_name: 'Contacto', emergency_contact_phone: '5555555555' };
test('carta v3 requiere contacto y emergencia, no obliga datos médicos', () => {
  assert.ok(normalizeWaiverIntake({}, 'v3').error);
  assert.ok(normalizeWaiverIntake({ phone: valid.phone }, 'v3').error);
  assert.deepEqual(normalizeWaiverIntake(valid, 'v3').data, { emergency_contact_name: 'Contacto', emergency_contact_phone: '5555555555', health_consent: false });
});
test('salud requiere consentimiento explícito y no admite valores inesperados', () => {
  assert.ok(normalizeWaiverIntake({ ...valid, medical_conditions: 'Lesión' }, 'v3').error);
  assert.ok(normalizeWaiverIntake({ ...valid, medical_conditions: 'Lesión', health_consent: 'true' }, 'v3').error);
  assert.ok(normalizeWaiverIntake({ ...valid, blood_type: {} }, 'v3').error);
  const r = normalizeWaiverIntake({ ...valid, blood_type: ' A+ ', health_consent: true, role: 'admin' }, 'v3');
  assert.equal(r.data.blood_type, 'A+'); assert.equal(r.data.role, undefined);
});
test('documentos previos mantienen compatibilidad y datos se devuelven junto a firma', () => {
  assert.ok(normalizeWaiverIntake({}, 'v1').data);
  assert.equal(waiverWithIntake(null), null);
  assert.equal(waiverWithIntake({ waiver_version: 'v3', intake_data: { blood_type: 'A+' } }).blood_type, 'A+');
});
