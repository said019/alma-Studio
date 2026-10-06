import { validatePlanPromotion } from "./pricing.js";
import { studioDateTimeFormatter } from './studioDateFormatters.js';

// Persisted product conditions. Missing keys preserve legacy plans' behavior.
export function validatePlanRules(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Las condiciones del plan deben ser un objeto.');
  const rules = { ...input };
  validatePlanPromotion(rules);
  if (rules.transferable === true || rules.extendable === true) throw new Error("Los paquetes HIVE son personales, intransferibles y sin prórroga.");
  for (const key of ['daily_class_limit', 'guest_passes', 'complimentary_coffee_per_day', 'commitment_months']) {
    if (rules[key] == null && key === 'daily_class_limit') continue;
    if (rules[key] !== undefined && (!Number.isInteger(rules[key]) || rules[key] < (key === 'daily_class_limit' ? 1 : 0))) throw new Error(`Valor inválido: ${key}.`);
  }
  if (rules.allowed_weekdays !== undefined && (!Array.isArray(rules.allowed_weekdays) || !rules.allowed_weekdays.length || rules.allowed_weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6))) throw new Error('Selecciona al menos un día válido.');
  for (const key of ['booking_start_time','booking_end_time']) if (rules[key] != null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(rules[key])) throw new Error('Horario inválido. Usa HH:mm.');
  if (Boolean(rules.booking_start_time) !== Boolean(rules.booking_end_time) || (rules.booking_start_time && rules.booking_start_time > rules.booking_end_time)) throw new Error('Configura una franja horaria válida con inicio y fin.');
  for (const key of ['requires_student_id','auto_renew','transferable','extendable']) if (rules[key] !== undefined && typeof rules[key] !== 'boolean') throw new Error(`Valor inválido: ${key}.`);
  for (const [key, values] of [['billing_period',['one_time','month']],['guest_pass_period',['membership','month']]]) if (rules[key] !== undefined && !values.includes(rules[key])) throw new Error(`Valor inválido: ${key}.`);
  for (const key of ['payment_url','opening_payment_url','promotion_payment_url']) if (rules[key]) { let url; try { url = new URL(rules[key]); } catch { throw new Error('Enlace de pago inválido.'); } if (url.protocol !== 'https:' || url.username || url.password) throw new Error('El enlace de pago debe usar HTTPS.'); }
  if (rules.auto_renew && rules.billing_period !== 'month') throw new Error('La renovación automática requiere cobro mensual.');
  return rules;
}
export function sessionWithinRules(rules = {}, startsAt, timeZone = 'America/Mexico_City') {
  const date = new Date(startsAt);
  if (!startsAt || Number.isNaN(date.getTime())) return false;
  const parts = Object.fromEntries(studioDateTimeFormatter('rules', timeZone).formatToParts(date).map(p=>[p.type,p.value]));
  const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
  const time = `${parts.hour}:${parts.minute}`;
  return (!rules.allowed_weekdays || rules.allowed_weekdays.includes(weekday)) && (!rules.booking_start_time || time >= rules.booking_start_time) && (!rules.booking_end_time || time <= rules.booking_end_time);
}
export function sessionWithinValidity(membership, startsAt) {
  if (!startsAt) return true;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const day = studioDateTimeFormatter('day', 'America/Mexico_City').format(d);
  const civil = v => v instanceof Date ? v.toISOString().slice(0,10) : String(v).slice(0,10);
  return (!membership.start_date || day >= civil(membership.start_date)) && (!membership.end_date || day <= civil(membership.end_date));
}
