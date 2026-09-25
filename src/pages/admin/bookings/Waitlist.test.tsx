import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import Waitlist from "./Waitlist";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const clase = (id: string, time: string, name: string, waitlist: number) =>
  ({ id, date: "2026-09-25", start_time: `2026-09-25T${time}:00`, class_type_name: name, instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: waitlist });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
});
afterEach(() => vi.useRealTimers());

describe("Lista de espera", () => {
  it("sólo lista las clases con gente esperando y muestra el orden", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/classes?start=": { data: [clase("c07", "07:00", "Reformer Básico", 0), clase("c11", "11:00", "Reformer Intermedio", 2)] },
      "/classes/c11/roster": { data: {
        class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25" },
        roster: [
          { bookingId: "b1", status: "confirmed", displayName: "Camila Torres", email: "c@x.com", phone: null, planName: "Paquete 8", classesRemaining: 3 },
          { bookingId: "b2", status: "waitlist", displayName: "Regina López", email: "regi@x.com", phone: "5578901234", planName: "Paquete 8", classesRemaining: 4 },
          { bookingId: "b3", status: "waitlist", displayName: "Paula Herrera", email: "pau@x.com", phone: null, planName: "Paquete 4", classesRemaining: 1 },
        ] } },
    });
    renderAdmin(<Waitlist />, { route: "/admin/bookings/waitlist" });
    const lista = await screen.findByRole("region", { name: "Clases con lista de espera" });
    expect(within(lista).queryByText("Reformer Básico")).toBeNull();
    fireEvent.click(await within(lista).findByRole("button", { name: /Reformer Intermedio/ }));

    const detalle = await screen.findByRole("region", { name: "Quién espera" });
    expect(await within(detalle).findByText("Regina López")).toBeInTheDocument();
    expect(within(detalle).queryByText("Camila Torres")).toBeNull();
    expect(within(detalle).getByRole("link", { name: "WhatsApp a Regina López" })).toHaveAttribute("href", "https://wa.me/525578901234");
    expect(within(detalle).queryByRole("link", { name: "WhatsApp a Paula Herrera" })).toBeNull();
    expect(within(detalle).getByRole("link", { name: /Abrir en Reservas/ })).toHaveAttribute("href", "/admin/bookings?clase=c11");
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings/waitlist?clase=c11");

    const posicion1 = within(detalle).getByLabelText("Posición 1");
    const liRegina = posicion1.closest("li")!;
    expect(within(liRegina).getByText("Regina López")).toBeInTheDocument();

    const posicion2 = within(detalle).getByLabelText("Posición 2");
    const liPaula = posicion2.closest("li")!;
    expect(within(liPaula).getByText("Paula Herrera")).toBeInTheDocument();
    expect(within(liPaula).getAllByText("Paquete 4 · 1 clases").length).toBeGreaterThan(0);
  });

  it("sin espera en la semana lo dice", async () => {
    routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/classes?start=": { data: [clase("c07", "07:00", "Reformer Básico", 0)] } });
    renderAdmin(<Waitlist />, { route: "/admin/bookings/waitlist" });
    expect(await screen.findByText("Nadie en lista de espera esta semana.")).toBeInTheDocument();
  });
});
