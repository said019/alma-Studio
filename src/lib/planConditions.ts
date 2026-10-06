/** Structured commercial conditions shared by the catalog and checkout. */
export interface PlanRules {
  promotion_mode: "studio" | "disabled" | "price" | "percent" | "amount";
  promotion_value: number | null;
  promotion_payment_url: string | null;
  daily_class_limit: number | null;
  allowed_weekdays: number[];
  booking_start_time: string | null;
  booking_end_time: string | null;
  requires_student_id: boolean;
  guest_passes: number;
  guest_pass_period: 'membership' | 'month';
  complimentary_coffee_per_day: number;
  billing_period: 'one_time' | 'month';
  commitment_months: number;
  auto_renew: boolean;
  payment_url: string | null;
  opening_payment_url: string | null;
  transferable: boolean;
  extendable: boolean;
}
export const DEFAULT_PLAN_RULES: PlanRules = {
  promotion_mode: "studio", promotion_value: null, promotion_payment_url: null,
  daily_class_limit: null, allowed_weekdays: [0, 1, 2, 3, 4, 5, 6],
  booking_start_time: null, booking_end_time: null, requires_student_id: false,
  guest_passes: 0, guest_pass_period: 'membership', complimentary_coffee_per_day: 0,
  billing_period: 'one_time', commitment_months: 0, auto_renew: false,
  payment_url: null, opening_payment_url: null, transferable: false, extendable: false,
};
export function normalizePlanRules(raw?: Partial<PlanRules> | null): PlanRules {
  return { ...DEFAULT_PLAN_RULES, ...raw };
}
const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export function planConditions(plan: { rules?: Partial<PlanRules> | null; personalOnly?: boolean; personal_only?: boolean; afternoonOnly?: boolean; afternoon_only?: boolean; morningOnly?: boolean; morning_only?: boolean }): string[] {
  const r = normalizePlanRules(plan.rules);
  const out: string[] = [];
  if (r.daily_class_limit) out.push(`${r.daily_class_limit} ${r.daily_class_limit === 1 ? 'sesión' : 'sesiones'} por día`);
  if (r.allowed_weekdays.length < 7) out.push(r.allowed_weekdays.length === 5 && [1,2,3,4,5].every(d => r.allowed_weekdays.includes(d)) ? 'De lunes a viernes' : r.allowed_weekdays.map(d => DAYS[d]).join(', '));
  if (r.booking_start_time && r.booking_end_time) out.push(`Inicio de clase de ${r.booking_start_time} a ${r.booking_end_time} (CDMX)`);
  else if (plan.afternoonOnly || plan.afternoon_only) out.push('De lunes a viernes, de 11:00 a 16:00 (CDMX)');
  else if (plan.morningOnly || plan.morning_only) out.push('Inicio de clase hasta las 10:00 (CDMX)');
  if (plan.personalOnly || plan.personal_only) out.push('Sesión personalizada 1 a 1');
  if (r.requires_student_id) out.push('Requiere credencial de estudiante vigente');
  if (r.guest_passes) out.push(`${r.guest_passes} guest pass ${r.guest_pass_period === 'month' ? 'por mes' : 'por vigencia'}`);
  if (r.complimentary_coffee_per_day) out.push(`${r.complimentary_coffee_per_day} café regular de cortesía por día`);
  if (r.billing_period === 'month') out.push('Pago mensual');
  if (r.commitment_months) out.push(`Compromiso de ${r.commitment_months} meses`);
  if (r.auto_renew) out.push('Renovación mensual: confirma las condiciones en Mercado Pago');
  if (plan.rules && !r.transferable) out.push('Personal e intransferible');
  if (plan.rules && !r.extendable) out.push('Sin extensión de vigencia');
  return out;
}

/** Calendar preview; the server rechecks all limits under a lock when reserving. */
export function classRestriction(membership: Record<string, any>, session: {start_time?: string | null; max_capacity?: number | null; capacity?: number | null; class_category?: string | null}, bookings: Array<{membership_id?: string | null; start_time: string; status: string; plan_late_cancel?: boolean}> = []): string | null {
  const raw = session.start_time;
  if (!raw) return 'Horario no disponible';
  let day: string, time: string;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !/(Z|[+-]\d{2}:?\d{2})$/.test(raw)) {
    day = raw.slice(0,10); time = raw.slice(11,16);
  } else {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return 'Horario no disponible';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(p => [p.type,p.value]));
    day = `${parts.year}-${parts.month}-${parts.day}`; time = `${parts.hour}:${parts.minute}`;
  }
  const r = normalizePlanRules(membership.rules);
  const start = membership.startDate ?? membership.start_date;
  const end = membership.endDate ?? membership.end_date;
  if ((start && day < String(start).slice(0,10)) || (end && day > String(end).slice(0,10))) return 'Fuera de vigencia';
  const category = membership.classCategory ?? membership.class_category ?? 'all';
  if (session.class_category && !['all','mixto'].includes(category) && session.class_category !== category) return 'Otra membresía';
  const capacity = session.max_capacity ?? session.capacity;
  const personal = membership.personalOnly ?? membership.personal_only;
  if (capacity != null && personal && capacity !== 1) return 'Solo sesión personalizada';
  const legacyGroupPlan = membership.rules && Object.keys(membership.rules).length === 0;
  if (capacity === 1 && !personal && !legacyGroupPlan) return 'Requiere plan personalizado';
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  if (!r.allowed_weekdays.includes(weekday)) return 'Día fuera de tu plan';
  if ((r.booking_start_time && time < r.booking_start_time) || (r.booking_end_time && time > r.booking_end_time)) return 'Horario fuera de tu plan';
  if ((membership.afternoonOnly ?? membership.afternoon_only) && (![1,2,3,4,5].includes(weekday) || time < '11:00' || time > '16:00')) return 'Horario fuera de tu plan';
  if ((membership.morningOnly ?? membership.morning_only) && time > '10:00') return 'Horario fuera de tu plan';
  if (r.requires_student_id) {
    const validUntil = membership.studentIdValidUntil ?? membership.student_id_valid_until;
    if (!validUntil || String(validUntil).slice(0,10) < day) return 'Verifica tu credencial en recepción';
  }
  const credits = membership.classesRemaining ?? membership.classes_remaining;
  if (credits === 0) return 'Sin clases disponibles';
  if (membership.id && r.daily_class_limit) {
    const used = bookings.filter(b => b.membership_id === membership.id && (['confirmed','checked_in','no_show'].includes(b.status) || (b.status === 'cancelled' && b.plan_late_cancel === true)) && b.start_time.slice(0,10) === day).length;
    if (used >= r.daily_class_limit) return 'Límite diario alcanzado';
  }
  return null;
}
