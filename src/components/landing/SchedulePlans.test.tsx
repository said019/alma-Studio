import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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
  it("anuncia el día elegido con un resumen para lector, no con el panel entero", () => {
    const { container } = renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    expect(screen.queryByLabelText("Clases del día")).toBeNull();
    const vivos = container.querySelectorAll("[aria-live]");
    expect(vivos).toHaveLength(1);
    const resumen = vivos[0];
    expect(resumen).toHaveAttribute("aria-live", "polite");
    expect(resumen).toHaveClass("sr-only");
    expect(resumen).toHaveTextContent("3 clases el MIÉ 23");
    fireEvent.click(screen.getByRole("button", { name: /JUE/ }));
    expect(resumen).toHaveTextContent("1 clase el JUE 24");
    fireEvent.click(screen.getByRole("button", { name: /VIE/ }));
    expect(resumen).toHaveTextContent("Sin clases el VIE 25");
  });
  it("la hora no se pega al nombre: primera columna auto y bloque de hora de ancho fijo mínimo", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    const hora = screen.getByText("08:00");
    const fila = hora.closest("li")!;
    expect(fila).toHaveClass("grid-cols-[auto_1fr_auto]", "gap-3");
    expect(fila.className).not.toMatch(/grid-cols-\[3\.2rem/);
    expect(hora.parentElement).toHaveClass("min-w-[3.75rem]", "tabular-nums");
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


describe("categorías de planes HIVE", () => {
  it("separa sesiones, membresías y especiales sin perder condiciones ni precios", () => {
    const annual = plan({ id: "annual", name: "Plan anual", kind: "membership", billingPeriod: "month", conditions: ["2 sesiones por día", "Compromiso de 12 meses", "2 guest pass por mes"], price: 4200, finalPrice: 3900, opening: true });
    const student = plan({ id: "student", name: "Estudiante", kind: "special", conditions: ["Requiere credencial de estudiante vigente"], price: 250, finalPrice: 250, classLimit: 1, perClass: null });
    renderPage(<Plans trial={null} plans={[plan({ id: "pack", kind: "sessions", durationDays: 60 }), annual, student]} {...listo} />, "/");
    expect(screen.getByText("60 días naturales desde la compra")).toBeInTheDocument();
    expect(screen.queryByText("Plan anual")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Membresías" }));
    expect(screen.getByRole("button", { name: "Membresías" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Compromiso de 12 meses")).toBeInTheDocument();
    expect(screen.getByText("2 guest pass por mes")).toBeInTheDocument();
    expect(screen.getByText("$3,900")).toBeInTheDocument();
    expect(screen.getByText("por mes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Especiales" }));
    expect(screen.getByText("Requiere credencial de estudiante vigente")).toBeInTheDocument();
    expect(screen.queryByText("Plan anual")).toBeNull();
  });
});


describe("selector dinámico de planes", () => {
  const detalle = () => screen.getByRole("article", { name: "Detalle del plan seleccionado" });
  it("selecciona cuatro clases por defecto y cambia todo el detalle desde los datos", () => {
    const twenty = plan({ id: "api-twenty", name: "Mi paquete largo", classLimit: 20, price: 4400, finalPrice: 4000, opening: true, durationDays: 60, perClass: 200, description: "Descripción del catálogo", conditions: ["Personal e intransferible", "Sin prórroga", "Sin acumulación"] });
    renderPage(<Plans {...listo} trial={null} plans={[twenty, plan({ id: "api-four", name: "Mi paquete inicial" })]} />);
    expect(screen.getByRole("button", { name: "Mi paquete inicial" })).toHaveAttribute("aria-pressed", "true");
    expect(within(detalle()).getByRole("heading")).toHaveTextContent("Mi paquete inicial");
    fireEvent.click(screen.getByRole("button", { name: "Mi paquete largo" }));
    expect(screen.getByRole("button", { name: "Mi paquete largo" })).toHaveAttribute("aria-pressed", "true");
    const detail = within(detalle());
    ["Descripción del catálogo", "$4,400", "$4,000", "60 días naturales desde la compra", "$200 por clase", ...twenty.conditions!].forEach(text => expect(detail.getByText(text)).toBeInTheDocument());
    expect(detail.queryByText("30 días naturales desde la compra")).toBeNull();
    expect(detail.getByRole("link", { name: "Comprar paquete" })).toHaveAttribute("href", "/app/checkout");
  });
  it("permite elegir cada membresía y especial manteniendo todas sus condiciones", () => {
    const entries = [plan({ id: "monthly", name: "Mensual API", kind: "membership", billingPeriod: "month", classLimit: 999, perClass: null, conditions: ["Una sesión por día", "2 guest pass"] }), plan({ id: "annual", name: "Anual API", kind: "membership", billingPeriod: "month", classLimit: 999, perClass: null, conditions: ["2 sesiones por día", "Compromiso de 12 meses", "2 guest pass por mes", "Un café regular por día", "Cada pago requiere confirmación"] }), plan({ id: "student", name: "Estudiante API", kind: "special", conditions: ["Credencial vigente", "Cualquier horario"] }), plan({ id: "private", name: "Personal API", kind: "special", conditions: ["Lunes a viernes", "11:00–16:00", "Atención individual"] })];
    renderPage(<Plans {...listo} trial={null} plans={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Anual API" }));
    entries[1].conditions!.forEach(text => expect(within(detalle()).getByText(text)).toBeInTheDocument());
    expect(within(detalle()).getByText("por mes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Especiales" }));
    entries[2].conditions!.forEach(text => expect(within(detalle()).getByText(text)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Personal API" }));
    entries[3].conditions!.forEach(text => expect(within(detalle()).getByText(text)).toBeInTheDocument());
    expect(within(detalle()).queryByText("Credencial vigente")).toBeNull();
  });
  it("revalida plan y categoría eliminados y usa valores actualizados al refrescar", () => {
    const initial = [plan({ id: "four", name: "Cuatro" }), plan({ id: "ten", name: "Diez", classLimit: 10 }), plan({ id: "annual", name: "Anual", kind: "membership" })];
    const view = (plans: LandingPlan[]) => <MemoryRouter><Plans {...listo} trial={null} plans={plans} /></MemoryRouter>;
    const { rerender } = render(view(initial));
    fireEvent.click(screen.getByRole("button", { name: "Diez" }));
    rerender(view([initial[0], initial[2]]));
    expect(screen.getByRole("button", { name: "Cuatro" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Membresías" }));
    rerender(view([{ ...initial[0], price: 1750, finalPrice: 1750, conditions: ["Condición actualizada"] }]));
    expect(within(detalle()).getByRole("heading")).toHaveTextContent("Cuatro");
    expect(within(detalle()).getByText("$1,750")).toBeInTheDocument();
    expect(within(detalle()).getByText("Condición actualizada")).toBeInTheDocument();
    rerender(view([]));
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.queryByRole("link", { name: "Comprar paquete" })).toBeNull();
  });
  it("sin paquete de cuatro elige el primero y conserva compra cuando sólo hay prueba", () => {
    const { unmount } = renderPage(<Plans {...listo} trial={null} plans={[plan({ name: "Primero", classLimit: 10 }), plan({ id: "other", name: "Segundo", classLimit: 20 })]} />);
    expect(screen.getByRole("button", { name: "Primero" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    renderPage(<Plans {...listo} trial={plan({ name: "Prueba API", conditions: ["Sólo una vez"] })} plans={[]} />);
    expect(screen.getByText("Sólo una vez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comprar paquete" })).toHaveAttribute("href", "/app/checkout");
  });
});
