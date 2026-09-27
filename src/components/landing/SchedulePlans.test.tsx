import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderPage, atenuadoPor } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { WeekSchedule } from "./WeekSchedule";
import { Plans } from "./Plans";
import { weekDays, type LandingClass, type LandingPlan } from "./landingData";

describeZone(["src/components/landing/WeekSchedule.tsx", "src/components/landing/Plans.tsx"]);

const days = weekDays(new Date(2026, 8, 21));
const cls = (id: string, day: string, start: string, remaining: number): LandingClass =>
  ({ id, day, start, end: "", name: "Reformer", coach: "Ana", durationMin: 50, capacity: 6, remaining });
const CLASES = [cls("a", "2026-09-23", "06:00", 4), cls("b", "2026-09-23", "07:00", 1), cls("c", "2026-09-23", "08:00", 0), cls("d", "2026-09-24", "17:00", 6)];
const base = { days, todayIso: "2026-09-23", loading: false, error: false, onRetry: () => {} };

describe("horario", () => {
  it("tira de 7 días con el de hoy elegido y sus clases", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    const tira = screen.getByRole("group", { name: "Días de la semana" });
    expect(within(tira).getAllByRole("button")).toHaveLength(7);
    const elegido = within(tira).getByRole("button", { pressed: true });
    expect(elegido).toHaveAccessibleName("MIÉ 23");
    expect(screen.getByText("4 de 6 lugares")).toBeInTheDocument();
    expect(screen.getByText("Último lugar")).toBeInTheDocument();
  });
  it("reservar lleva a la clase en la app, con contexto para lector", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    const link = screen.getByRole("link", { name: /Reformer, 06:00: Reservar/ });
    expect(link).toHaveAttribute("href", "/app/classes/a");
  });
  it("clase llena: Llena y Lista de espera a opacidad completa", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    expect(screen.getByText("Llena")).toBeInTheDocument();
    const espera = screen.getByRole("link", { name: /Lista de espera/ });
    expect(espera).toHaveAttribute("href", "/app/classes/c");
    expect(atenuadoPor(espera)).toEqual([]);
  });
  it("cambiar de día muestra sus clases", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    fireEvent.click(screen.getByRole("button", { name: /JUE/ }));
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.queryByText("06:00")).toBeNull();
  });
  it("semana vacía: mensaje con Instagram; error: reintento", () => {
    const onRetry = vi.fn();
    const r = renderPage(<WeekSchedule {...base} classes={[]} />, "/");
    expect(screen.getByText("Pronto publicamos el horario de la semana.")).toBeInTheDocument();
    r.unmount();
    renderPage(<WeekSchedule {...base} classes={[]} error onRetry={onRetry} />, "/");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });
  it("reintentando tras un error: esqueleto, no el aviso", () => {
    const { container } = renderPage(<WeekSchedule {...base} classes={[]} loading error />, "/");
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.queryByText("No pudimos cargar el horario.")).toBeNull();
  });
});

const listo = { loading: false, error: false, onRetry: () => {} };
const plan = (o: Partial<LandingPlan>): LandingPlan =>
  ({ id: "p", name: "4 clases", description: null, price: 1140, finalPrice: 1140, opening: false, classLimit: 4, perClass: 285, durationDays: 30, nonRepeatable: false, ...o });

describe("paquetes", () => {
  it("clase muestra destacada; apertura con precio normal tachado y etiqueta", () => {
    renderPage(<Plans trial={plan({ id: "t", name: "Clase muestra", price: 200, finalPrice: 200, classLimit: 1, perClass: null })}
      plans={[plan({ id: "4", finalPrice: 1080, opening: true, perClass: 270 })]} {...listo} />, "/");
    expect(screen.getByText("Clase muestra")).toBeInTheDocument();
    expect(screen.getByText("Precio de apertura")).toBeInTheDocument();
    const tachado = screen.getByText("$1,140");
    expect(tachado.tagName).toBe("S");
    // ink-faint quedaba en 4.37:1 sobre el resplandor; ink-muted pasa AA.
    expect(tachado).toHaveClass("text-ink-muted");
    expect(tachado).not.toHaveClass("text-ink-faint");
    expect(screen.getByText("$1,080")).toBeInTheDocument();
    expect(screen.getByText("$270 por clase")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Comprar paquete/ })).toHaveAttribute("href", "/app/checkout");
  });
  it("sin apertura: un solo precio y sin etiqueta", () => {
    renderPage(<Plans trial={null} plans={[plan({})]} {...listo} />, "/");
    expect(screen.queryByText("Precio de apertura")).toBeNull();
    expect(screen.queryByText((_, el) => el?.tagName === "S")).toBeNull();
  });
  it("sin precio por clase no pinta nada, y nunca un 0 suelto", () => {
    const r = renderPage(<Plans trial={null} plans={[plan({ id: "i", name: "Ilimitado", classLimit: 999, perClass: null })]} {...listo} />, "/");
    expect(screen.queryByText(/por clase/)).toBeNull();
    r.unmount();
    renderPage(<Plans trial={null} plans={[plan({ id: "g", name: "Cortesía", price: 0, finalPrice: 0, perClass: 0 })]} {...listo} />, "/");
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("$0 por clase")).toBeInTheDocument();
  });
  it("cargando: la sección está con esqueletos de su altura, sin botón de compra", () => {
    renderPage(<Plans trial={null} plans={[]} {...listo} loading />, "/");
    const seccion = document.getElementById("paquetes")!;
    expect(within(seccion).getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(seccion.querySelectorAll(".animate-pulse").length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole("link", { name: /Comprar paquete/ })).toBeNull();
  });
  it("error: aviso y Reintentar de 44 px", () => {
    const onRetry = vi.fn();
    renderPage(<Plans trial={null} plans={[]} {...listo} error onRetry={onRetry} />, "/");
    expect(screen.getByText("No pudimos cargar los paquetes.")).toBeInTheDocument();
    const boton = screen.getByRole("button", { name: "Reintentar" });
    expect(boton.className).toMatch(/min-h-\[44px\]/);
    fireEvent.click(boton);
    expect(onRetry).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /Comprar paquete/ })).toBeNull();
  });
  it("clase muestra en apertura pero paquetes regulares sin apertura: sin etiqueta", () => {
    renderPage(<Plans trial={plan({ id: "t", name: "Clase muestra", price: 250, finalPrice: 200, opening: true, classLimit: 1, perClass: null })}
      plans={[plan({})]} {...listo} />, "/");
    expect(screen.queryByText("Precio de apertura")).toBeNull();
  });
});
