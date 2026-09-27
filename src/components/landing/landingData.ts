import { addDays, format, startOfWeek } from "date-fns";

/* ── Sesión ─────────────────────────────────────────────────────────── */
export const STAFF_ROLES: readonly string[] = ["admin", "super_admin", "instructor", "reception"];
type SessionUser = { role: string } | null;
const isStaff = (u: SessionUser) => !!u && STAFF_ROLES.includes(u.role);

export function accountLink(user: SessionUser, isAuthenticated: boolean): { to: string; label: "Entrar" | "Mi cuenta" | "Panel" } {
  if (!isAuthenticated || !user) return { to: "/auth/login", label: "Entrar" };
  return isStaff(user) ? { to: "/admin/dashboard", label: "Panel" } : { to: "/app", label: "Mi cuenta" };
}

export function heroCta(user: SessionUser, isAuthenticated: boolean): { to: string; label: string } {
  if (!isAuthenticated || !user) return { to: `/auth/register?returnUrl=${encodeURIComponent("/app/checkout")}`, label: "Reserva tu clase muestra" };
  if (isStaff(user)) return { to: "/admin/dashboard", label: "Ir al panel" };
  return { to: "/app/checkout", label: "Reserva tu clase muestra" };
}

/* ── Clases ─────────────────────────────────────────────────────────── */
export type ApiClass = {
  id: string; date?: string; class_date?: string; start_time?: string; end_time?: string;
  class_type_name?: string; instructor_name?: string; capacity?: number; max_capacity?: number;
  current_bookings?: number; status?: string;
};
export type LandingClass = {
  id: string; day: string; start: string; end: string; name: string; coach: string;
  durationMin: number | null; capacity: number; remaining: number;
};

const hhmm = (t?: string) => {
  if (!t) return "";
  const part = t.includes("T") ? t.split("T")[1] : t;
  return part.slice(0, 5);
};
const minutes = (h: string) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : NaN);

export function normalizeClasses(raw: ApiClass[], now: Date): LandingClass[] {
  const nowIso = format(now, "yyyy-MM-dd");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return raw
    .filter((c) => c.status !== "cancelled")
    .map((c) => {
      const day = (c.date || c.class_date || c.start_time?.split("T")[0] || "").split("T")[0];
      const start = hhmm(c.start_time);
      const end = hhmm(c.end_time);
      const dur = minutes(end) - minutes(start);
      const capacity = Math.max(0, c.capacity ?? c.max_capacity ?? 0);
      return {
        id: c.id, day, start, end,
        name: c.class_type_name || "Clase",
        coach: c.instructor_name || "Por confirmar",
        durationMin: Number.isFinite(dur) && dur > 0 ? dur : null,
        capacity,
        remaining: Math.max(0, capacity - (c.current_bookings ?? 0)),
      };
    })
    .filter((c) => c.day > nowIso || (c.day === nowIso && minutes(c.start) > nowMin))
    .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
}

export function weekStartFor(now: Date): Date {
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return now.getDay() === 0 && now.getHours() >= 12 ? addDays(monday, 7) : monday;
}

export type WeekDay = { iso: string; weekday: string; dayNum: string };
const WEEKDAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
export function weekDays(start: Date): WeekDay[] {
  return WEEKDAYS.map((weekday, i) => {
    const d = addDays(start, i);
    return { iso: format(d, "yyyy-MM-dd"), weekday, dayNum: format(d, "d") };
  });
}

export function groupByDay(classes: LandingClass[]): Record<string, LandingClass[]> {
  return classes.reduce<Record<string, LandingClass[]>>((acc, c) => {
    (acc[c.day] ??= []).push(c);
    return acc;
  }, {});
}

export function defaultDay(days: WeekDay[], byDay: Record<string, LandingClass[]>, todayIso: string): string {
  if (byDay[todayIso]?.length) return todayIso;
  return days.find((d) => d.iso >= todayIso && byDay[d.iso]?.length)?.iso
    ?? days.find((d) => byDay[d.iso]?.length)?.iso
    ?? (days.some((d) => d.iso === todayIso) ? todayIso : days[0].iso);
}

export type Availability = { label: string; full: boolean; scarce: boolean };
export function availability(c: Pick<LandingClass, "remaining" | "capacity">): Availability {
  if (c.capacity <= 0 || c.remaining <= 0) return { label: "Llena", full: true, scarce: false };
  if (c.remaining === 1) return { label: "Último lugar", full: false, scarce: true };
  if (c.remaining === 2) return { label: "Pocos lugares", full: false, scarce: true };
  return { label: `${c.remaining} de ${c.capacity} lugares`, full: false, scarce: false };
}

/* ── Paquetes ───────────────────────────────────────────────────────── */
export type PlanRow = {
  id: string; name: string; description?: string | null; price: number | string;
  effectivePrice?: number | string; effective_price?: number | string; openingActive?: boolean; opening_active?: boolean;
  classLimit?: number | null; class_limit?: number | null; durationDays?: number | null; duration_days?: number | null;
  isNonRepeatable?: boolean; is_non_repeatable?: boolean; sortOrder?: number | null; sort_order?: number | null;
};
export type LandingPlan = {
  id: string; name: string; description: string | null; price: number; finalPrice: number; opening: boolean;
  classLimit: number | null; perClass: number | null; durationDays: number | null; nonRepeatable: boolean;
};

export function toLandingPlan(p: PlanRow): LandingPlan {
  const price = Number(p.price) || 0;
  const eff = Number(p.effectivePrice ?? p.effective_price ?? price) || price;
  const opening = Boolean(p.openingActive ?? p.opening_active) && eff > 0 && eff < price;
  const finalPrice = opening ? eff : price;
  const classLimit = p.classLimit ?? p.class_limit ?? null;
  // Como en Checkout: 900 clases o más es ilimitado, y ahí no hay precio por clase.
  const perClass = classLimit != null && classLimit > 1 && classLimit < 900 ? Math.round(finalPrice / classLimit) : null;
  return {
    id: p.id, name: p.name, description: p.description ?? null, price, finalPrice, opening, classLimit, perClass,
    durationDays: p.durationDays ?? p.duration_days ?? null,
    nonRepeatable: Boolean(p.isNonRepeatable ?? p.is_non_repeatable),
  };
}

const order = (p: PlanRow) => p.sortOrder ?? p.sort_order ?? 0;
export function splitPlans(raw: PlanRow[]): { trial: LandingPlan | null; rest: LandingPlan[] } {
  const sorted = [...raw].sort((a, b) => order(a) - order(b) || (Number(a.price) || 0) - (Number(b.price) || 0)).map(toLandingPlan);
  const trial = sorted.find((p) => p.nonRepeatable && p.classLimit === 1) ?? sorted.find((p) => /muestra/i.test(p.name)) ?? null;
  return { trial, rest: sorted.filter((p) => p !== trial) };
}

/* ── Clases y coaches ───────────────────────────────────────────────── */
export type ClassTypeRow = {
  id: string; name: string; subtitle?: string | null; description?: string | null;
  durationMin?: number | null; durationMinutes?: number | null;
};
export type CoachRow = {
  id: string; displayName: string; specialties?: unknown; photoUrl?: string | null;
  /** Encuadre de la foto que fija el panel, 0–100 (50/50 si no hay). */
  photoFocusX?: number | null; photoFocusY?: number | null;
};

export function specialtiesText(s: unknown): string {
  if (Array.isArray(s)) return s.filter(Boolean).join(" · ");
  if (typeof s === "string" && s.trim()) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(" · ");
    } catch { /* texto plano */ }
    return s.trim();
  }
  return "";
}

export const classTypeDuration = (t: ClassTypeRow): number | null => t.durationMin ?? t.durationMinutes ?? null;
