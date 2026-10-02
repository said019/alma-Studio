import { describe, expect, it } from 'vitest';
import { normalizePlanRules, planConditions } from './planConditions';

describe('condiciones comerciales HIVE', () => {
  it('muestra todos los beneficios y el compromiso anual sin llamarlo ilimitado', () => {
    const conditions = planConditions({ rules: normalizePlanRules({ daily_class_limit: 2, guest_passes: 2, guest_pass_period: 'month', complimentary_coffee_per_day: 1, billing_period: 'month', commitment_months: 12, auto_renew: true }) });
    expect(conditions).toEqual(['2 sesiones por día', '2 guest pass por mes', '1 café regular de cortesía por día', 'Pago mensual', 'Compromiso de 12 meses', 'Renovación mensual: confirma las condiciones en Mercado Pago', 'Personal e intransferible', 'Sin extensión de vigencia']);
  });
  it('horario especial conserva días y ambas horas; estudiante exige credencial', () => {
    expect(planConditions({ rules: normalizePlanRules({allowed_weekdays: [1,2,3,4,5], booking_start_time: '11:00', booking_end_time: '16:00'}) })).toContain('Inicio de clase de 11:00 a 16:00 (CDMX)');
    expect(planConditions({ rules: normalizePlanRules({requires_student_id:true}) })).toContain('Requiere credencial de estudiante vigente');
    expect(planConditions({ afternoon_only: true })).toEqual(['De lunes a viernes, de 11:00 a 16:00 (CDMX)']);
  });
});

import { classRestriction } from './planConditions';
describe('calendario según el plan', () => {
  const member = {id:'m1',startDate:'2026-10-01',endDate:'2026-10-30',rules:normalizePlanRules({allowed_weekdays:[1,2,3,4,5],booking_start_time:'11:00',booking_end_time:'16:00'})};
  it('respeta límites 11–16 en CDMX, fin de semana y fecha de vigencia', () => {
    for (const time of ['11:00','16:00']) expect(classRestriction(member,{start_time:`2026-10-02T${time}:00`,max_capacity:6})).toBeNull();
    expect(classRestriction(member,{start_time:'2026-10-02T16:01:00',max_capacity:6})).toBe('Horario fuera de tu plan');
    expect(classRestriction(member,{start_time:'2026-10-03T12:00:00',max_capacity:6})).toBe('Día fuera de tu plan');
    expect(classRestriction(member,{start_time:'2026-11-02T12:00:00',max_capacity:6})).toBe('Fuera de vigencia');
    expect(classRestriction(member,{start_time:'2026-10-02T17:00:00Z',max_capacity:6})).toBeNull();
  });
  it('requiere credencial vigente, sesión personalizada y créditos', () => {
    const session = {start_time:'2026-10-02T12:00:00',max_capacity:1};
    expect(classRestriction({...member,personalOnly:true},session)).toBeNull();
    expect(classRestriction(member,session)).toBe('Requiere plan personalizado');
    expect(classRestriction({...member,rules:{}},session)).toBeNull();
    expect(classRestriction({...member,personalOnly:true},{...session,max_capacity:6})).toBe('Solo sesión personalizada');
    const student = {...member,rules:normalizePlanRules({requires_student_id:true}),studentIdValidUntil:'2026-10-01'};
    expect(classRestriction(student,{...session,max_capacity:6})).toBe('Verifica tu credencial en recepción');
    expect(classRestriction({...student,studentIdValidUntil:'2026-10-02'},{...session,max_capacity:6})).toBeNull();
    expect(classRestriction({...member,classesRemaining:0},{...session,max_capacity:6})).toBe('Sin clases disponibles');
  });
  it('cuenta solo sesiones consumidas del mismo paquete para su límite diario', () => {
    const m = {...member,rules:normalizePlanRules({daily_class_limit:1})};
    const session = {start_time:'2026-10-02T12:00:00',max_capacity:6};
    expect(classRestriction(m,session,[{membership_id:'m1',start_time:'2026-10-02T11:00:00',status:'confirmed'}])).toBe('Límite diario alcanzado');
    expect(classRestriction(m,session,[{membership_id:'m1',start_time:'2026-10-02T11:00:00',status:'cancelled',plan_late_cancel:true}])).toBe('Límite diario alcanzado');
    expect(classRestriction(m,session,[{membership_id:'m1',start_time:'2026-10-02T11:00:00',status:'cancelled',plan_late_cancel:false}])).toBeNull();
    expect(classRestriction(m,session,[{membership_id:'m2',start_time:'2026-10-02T11:00:00',status:'confirmed'},{membership_id:'m1',start_time:'2026-10-02T11:00:00',status:'cancelled'}])).toBeNull();
  });
});
