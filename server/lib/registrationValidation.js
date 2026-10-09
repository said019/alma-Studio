import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function validateRegistration(body = {}, now = new Date()) {
  if (typeof body.displayName !== 'string' || body.displayName.trim().length < 2) return { message: 'El nombre debe tener al menos 2 caracteres.' };
  if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) return { message: 'Email inválido.' };
  if (typeof body.password !== 'string' || body.password.length < 8 || !/[A-Z]/.test(body.password) || !/[0-9]/.test(body.password)) return { message: 'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.' };
  if (body.acceptsTerms !== true) return { message: 'Debes aceptar los términos.' };
  if (!['female', 'male', 'other'].includes(body.gender)) return { message: 'Selecciona una opción de género válida.' };
  const phone = typeof body.phone === 'string' ? parsePhoneNumberFromString(body.phone.trim(), 'MX') : null;
  if (!phone?.isValid()) return { message: 'Ingresa un teléfono válido con su lada internacional.' };
  const dob = body.dateOfBirth;
  if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return { message: 'Fecha de nacimiento inválida (YYYY-MM-DD).' };
  const date = new Date(dob + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || Number(dob.slice(0,4)) < 1900 || date > now || date.toISOString().slice(0,10) !== dob) return { message: 'Fecha de nacimiento inválida.' };
  return { data: { phone: phone.number, dateOfBirth: dob } };
}
