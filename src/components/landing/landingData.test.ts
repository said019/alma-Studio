import { describe, it, expect } from "vitest";
import {
  accountLink, heroCta, normalizeClasses, weekStartFor, weekDays, groupByDay, defaultDay,
  availability, toLandingPlan, splitPlans, specialtiesText, classTypeDuration, type ApiClass, type LandingClass,
} from "./landingData";

const client = { role: "client" };
const staff = { role: "reception" };

describe("destinos según la sesión", () => {
  it("menú: Entrar, Mi cuenta o Panel", () => {
    expect(accountLink(null, false)).toEqual({ to: "/auth/login", label: "Entrar" });
    expect(accountLink(client, true)).toEqual({ to: "/app", label: "Mi cuenta" });
    expect(accountLink(staff, true)).toEqual({ to: "/admin/dashboard", label: "Panel" });
    expect(accountLink(client, false)).toEqual({ to: "/auth/login", label: "Entrar" });
  });
  it("portada: registro con regreso a comprar; clienta a comprar; staff al panel", () => {
    expect(heroCta(null, false)).toEqual({ to: "/auth/register?returnUrl=%2Fapp%2Fcheckout", label: "Reserva tu clase muestra" });
    expect(heroCta(client, true)).toEqual({ to: "/app/checkout", label: "Reserva tu clase muestra" });
    expect(heroCta(staff, true)).toEqual({ to: "/admin/dashboard", label: "Ir al panel" });
  });
});

const now = new Date(2026, 8, 23, 7, 30); // mié 23 sep 2026 07:30 (hora local)
const raw: ApiClass[] = [
  { id: "a", date: "2026-09-23", start_time: "06:00:00", end_time: "06:50:00", class_type_name: "Reformer", instructor_name: "Ana", capacity: 6, current_bookings: 2, status: "scheduled" },
  { id: "b", class_date: "2026-09-23", start_time: "2026-09-23T09:00:00.000Z", end_time: "2026-09-23T09:50:00.000Z", class_type_name: "Reformer", instructor_name: "Diego", max_capacity: 6, current_bookings: 5 },
  { id: "c", date: "2026-09-24T00:00:00.000Z", start_time: "07:00", end_time: "07:50", class_type_name: "Reformer", capacity: 6 },
  { id: "d", date: "2026-09-24", start_time: "08:00", end_time: "08:50", class_type_name: "Reformer", capacity: 6, current_bookings: 6, status: "cancelled" },
  { id: "e", date: "2026-09-25", start_time: "17:00", end_time: "17:50", capacity: 0 },
];

describe("clases de la semana", () => {
  it("normaliza, quita canceladas y pasadas, y ordena", () => {
    const cs = normalizeClasses(raw, now);
    expect(cs.map((c) => c.id)).toEqual(["b", "c", "e"]); // a ya pasó (06:00 < 07:30), d cancelada
    expect(cs[0]).toMatchObject({ day: "2026-09-23", start: "09:00", end: "09:50", coach: "Diego", capacity: 6, remaining: 1, durationMin: 50 });
    expect(cs[1]).toMatchObject({ day: "2026-09-24", start: "07:00", coach: "Por confirmar", remaining: 6 });
    expect(cs[2]).toMatchObject({ name: "Clase", capacity: 0, remaining: 0 });
  });
  it("la semana empieza en lunes; domingo desde mediodía muestra la siguiente", () => {
    expect(weekStartFor(new Date(2026, 8, 23, 7)).getDate()).toBe(21);
    expect(weekStartFor(new Date(2026, 8, 27, 11)).getDate()).toBe(21);
    expect(weekStartFor(new Date(2026, 8, 27, 12)).getDate()).toBe(28);
    const d = weekDays(new Date(2026, 8, 21));
    expect(d.map((x) => x.weekday)).toEqual(["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]);
    expect(d[0]).toEqual({ iso: "2026-09-21", weekday: "LUN", dayNum: "21" });
  });
  it("día inicial: hoy si tiene clases; si no, el primero con clases; si ninguno, hoy", () => {
    const days = weekDays(new Date(2026, 8, 21));
    const by = groupByDay(normalizeClasses(raw, now));
    expect(defaultDay(days, by, "2026-09-23")).toBe("2026-09-23");
    expect(defaultDay(days, by, "2026-09-22")).toBe("2026-09-23");
    expect(defaultDay(days, {}, "2026-09-22")).toBe("2026-09-22");
  });
  it("lugares: N de M, último, pocos, llena (capacidad 0 cuenta como llena)", () => {
    const c = (remaining: number, capacity = 6) => ({ remaining, capacity } as LandingClass);
    expect(availability(c(4))).toEqual({ label: "4 de 6 lugares", full: false, scarce: false });
    expect(availability(c(2))).toEqual({ label: "Pocos lugares", full: false, scarce: true });
    expect(availability(c(1))).toEqual({ label: "Último lugar", full: false, scarce: true });
    expect(availability(c(0))).toEqual({ label: "Llena", full: true, scarce: false });
    expect(availability(c(0, 0))).toEqual({ label: "Llena", full: true, scarce: false });
  });
});

describe("paquetes", () => {
  it("precios como texto; apertura sólo si es menor", () => {
    expect(toLandingPlan({ id: "1", name: "4 clases", price: "1140.00", effectivePrice: "1080.00", openingActive: true, classLimit: 4 }))
      .toMatchObject({ price: 1140, finalPrice: 1080, opening: true, perClass: 270 });
    expect(toLandingPlan({ id: "2", name: "1 clase", price: "300.00", classLimit: 1 }))
      .toMatchObject({ price: 300, finalPrice: 300, opening: false, perClass: null });
    expect(toLandingPlan({ id: "3", name: "Mes", price: 4200, effective_price: 4200, opening_active: true, class_limit: null }))
      .toMatchObject({ finalPrice: 4200, opening: false, perClass: null });
  });
  it("precio por clase sólo con 2 a 899 clases: 900 o más es ilimitado, como en Checkout", () => {
    expect(toLandingPlan({ id: "i", name: "Ilimitado", price: "3900.00", class_limit: 999 }).perClass).toBeNull();
    expect(toLandingPlan({ id: "j", name: "Ilimitado", price: 3900, classLimit: 900 }).perClass).toBeNull();
    expect(toLandingPlan({ id: "k", name: "Muchas", price: 8990, classLimit: 899 }).perClass).toBe(10);
    expect(toLandingPlan({ id: "l", name: "Cero", price: 500, classLimit: 0 }).perClass).toBeNull();
  });
  it("clase muestra: bandera + 1 clase; si no, por nombre; si no, ninguna", () => {
    const base = { price: 200, classLimit: 1 };
    expect(splitPlans([{ id: "t", name: "Prueba", isNonRepeatable: true, ...base }, { id: "x", name: "1 clase", price: 300, classLimit: 1 }]).trial?.id).toBe("t");
    expect(splitPlans([{ id: "m", name: "Clase muestra", ...base }]).trial?.id).toBe("m");
    const s = splitPlans([{ id: "x", name: "1 clase", price: 300, classLimit: 1, sortOrder: 2 }, { id: "y", name: "4 clases", price: 1140, classLimit: 4, sortOrder: 1 }]);
    expect(s.trial).toBeNull();
    expect(s.rest.map((p) => p.id)).toEqual(["y", "x"]);
  });
});

describe("clases y coaches", () => {
  it("especialidades en lista, texto o JSON", () => {
    expect(specialtiesText(["Reformer", "Fuerza"])).toBe("Reformer · Fuerza");
    expect(specialtiesText('["Reformer"]')).toBe("Reformer");
    expect(specialtiesText("Reformer")).toBe("Reformer");
    expect(specialtiesText(null)).toBe("");
  });
  it("duración del tipo de clase", () => {
    expect(classTypeDuration({ id: "1", name: "R", durationMin: 50 })).toBe(50);
    expect(classTypeDuration({ id: "1", name: "R", durationMinutes: 60 })).toBe(60);
    expect(classTypeDuration({ id: "1", name: "R" })).toBeNull();
  });
});
