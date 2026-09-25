import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

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
    "/classes/c11/roster": { data: { class: {}, roster: [{ status: "waitlist", displayName: "Regina López" }] } },
  });
});
afterEach(() => vi.useRealTimers());

describe("Clases · Calendario", () => {
  it("al tocar una clase abre su panel con el resumen, sin Wellhub y con enlace directo a Reservas", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    expect(await screen.findByRole("heading", { level: 1, name: "Clases" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Reformer Intermedio.*8 de 8, llena/ }));
    expect(await screen.findByText("Llena · 8/8")).toBeInTheDocument();
    expect(await screen.findByText("1 en espera")).toBeInTheDocument();
    expect(screen.queryByText("Wellhub")).toBeNull();
    expect(screen.getByText("Gestionar en Reservas").closest("a")).toHaveAttribute("href", "/admin/bookings?clase=c11");
  });

  it("muestra el resumen de la semana y las acciones", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    // El resumen va en varios <span>: se compara el texto completo del contenedor.
    expect(await screen.findByText((_, el) => el?.textContent === "1 clases · 8 reservas · 100% ocupación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar semana" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Generar semana" })).toHaveAttribute("href", "/admin/class-generator");
    expect(screen.getByRole("button", { name: /Nueva clase$/ })).toBeInTheDocument();
  });
});
