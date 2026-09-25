import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClassesCalendar from "./ClassesCalendar";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [] },
    "/instructors": { data: [] },
    "/classes?start=": { data: [{
      id: "c11", class_type_id: "t1", class_type_name: "Reformer Intermedio", instructor_id: "i1", instructor_name: "Fer",
      start_time: "2026-09-25T11:00:00", end_time: "2026-09-25T11:50:00", max_capacity: 8, current_bookings: 8, status: "scheduled",
    }] },
    "/classes/c11/roster": { data: { class: {}, roster: [
      { status: "confirmed", displayName: "Camila Torres" },
      { status: "waitlist", displayName: "Regina López" },
    ] } },
  });
});
afterEach(() => vi.useRealTimers());

describe("Clases · Calendario", () => {
  it("al tocar una clase abre su panel con el resumen, iniciales de inscritas, sin Wellhub y con enlace directo a Reservas", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    expect(await screen.findByRole("heading", { level: 1, name: "Clases" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Reformer Intermedio.*8 de 8, llena/ }));
    expect(await screen.findByText("Llena · 8/8")).toBeInTheDocument();
    expect(await screen.findByText("1 en espera")).toBeInTheDocument();
    // Iniciales de la clienta confirmada (Camila Torres → "CT"), no de la instructora.
    expect(await screen.findByText("CT")).toBeInTheDocument();
    expect(screen.queryByText("Wellhub")).toBeNull();
    expect(screen.getByText("Gestionar en Reservas").closest("a")).toHaveAttribute("href", "/admin/bookings?clase=c11");
  });

  it("muestra el resumen de la semana, el número de semana y las acciones", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    // El resumen va en varios <span>: se compara el texto completo del contenedor.
    expect(await screen.findByText((_, el) => el?.textContent === "1 clase · 8 reservas · 100% ocupación")).toBeInTheDocument();
    expect(await screen.findByText(/^Semana \d+ · /)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar semana" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Generar semana" })).toHaveAttribute("href", "/admin/class-generator");
    expect(screen.getByRole("button", { name: /Nueva clase$/ })).toBeInTheDocument();
  });

  it("semana sin clases: el aviso conserva su propio enlace a Generar semana", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/class-types": { data: [] },
      "/instructors": { data: [] },
      "/classes?start=": { data: [] },
    });
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    const banner = await screen.findByTestId("empty-week-banner");
    expect(within(banner).getByText("Semana sin clases")).toBeInTheDocument();
    expect(within(banner).getByRole("link", { name: "Generar semana" })).toHaveAttribute("href", "/admin/class-generator");
  });
});
