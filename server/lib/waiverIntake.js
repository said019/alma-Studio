// Datos de la carta entregada por HIVE. Sólo se conservan claves conocidas.
export const WAIVER_INTAKE_LABELS = Object.freeze({
  emergency_contact_name: 'Contacto de emergencia',
  emergency_contact_phone: 'Teléfono de emergencia',
  medical_conditions: 'Condición médica declarada',
  blood_type: 'Tipo de sangre',
  medication_allergies: 'Alergias a medicamentos',
  food_allergies: 'Alergias a alimentos',
  body_oil_allergies: 'Alergia a aceites corporales',
  medical_insurance: 'Seguro o servicio médico',
  emergency_medical_service: 'Servicio médico para emergencias',
  physician_name: 'Médico particular o familiar',
  physician_phone: 'Teléfono del médico',
});
export const WAIVER_HEALTH_FIELDS = Object.keys(WAIVER_INTAKE_LABELS).filter(k => !k.startsWith('emergency_contact_'));

export function normalizeWaiverIntake(body, version) {
  const data = {};
  for (const key of Object.keys(WAIVER_INTAKE_LABELS)) {
    if (body[key] != null && typeof body[key] !== 'string') return { error: `${WAIVER_INTAKE_LABELS[key]} debe ser texto.` };
    const value = (body[key] ?? '').trim();
    if (value.length > 2000) return { error: `${WAIVER_INTAKE_LABELS[key]} es demasiado largo.` };
    if (value) data[key] = value;
  }
  if (version === 'v3') {
    if (typeof body.phone !== 'string' || body.phone.replace(/\D/g, '').length < 10) return { error: 'Indica un teléfono de contacto válido.' };
    if (!data.emergency_contact_name || !data.emergency_contact_phone || data.emergency_contact_phone.replace(/\D/g, '').length < 10) return { error: 'Indica nombre y teléfono válido de tu contacto de emergencia.' };
  }
  const hasHealth = WAIVER_HEALTH_FIELDS.some(k => data[k]);
  if (hasHealth && body.health_consent !== true) return { error: 'Autoriza expresamente el tratamiento de los datos de salud que deseas proporcionar.' };
  data.health_consent = body.health_consent === true;
  return { data };
}

export const waiverWithIntake = row => row ? { ...row, ...(row.intake_data ?? {}) } : null;
