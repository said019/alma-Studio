import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: 2 },
    { id: "c13", date: "2026-09-25", start_time: "2026-09-25T13:00:00", class_type_name: "Tower", instructor_name: "Sofía", max_capacity: 6, current_bookings: 3, waitlist_count: 0 },
  ],
};
const roster = (entries: object[]) => ({
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: entries,
  },
});
const r = (bookingId: string, status: string, displayName: string, classesRemaining: number | null = 3) =>
  ({ bookingId, status, checkedInAt: null, userId: bookingId, displayName, email: `${bookingId}@x.com`, phone: "5512345678", planName: "Paquete 8", classesRemaining });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/classes?start=": semana,
    "/classes/c11/roster": roster([r("b1", "confirmed", "Camila Torres"), r("b2", "checked_in", "Valeria Ruiz", 9999), r("b3", "waitlist", "Regina López")]),
    "/classes/c13/roster": { data: { class: { classTypeName: "Tower", startsAt: "2026-09-25T13:00:00", date: "2026-09-25", instructorName: "Sofía" }, roster: [] } },
    "/classes/zzz/roster": Object.assign(new Error("404"), { response: { status: 404, data: {} } }),
    "/loyalty/config": { data: { faltas_cancel_window_hours: 12 } },
    "/users?role=client": { data: [] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Reservas · Semana", () => {
  it("con ?clase= abre la lista de esa clase junto a la semana", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    expect(await within(lista).findByText("Reformer Intermedio")).toBeInTheDocument();
    expect(within(lista).getByText("Asistió")).toBeInTheDocument();
    expect(within(lista).getByText("Lista de espera")).toBeInTheDocument();
    expect(within(lista).getByText(/Ilimitado/)).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: "Check-in de Camila Torres" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/b1/check-in"));
    expect(screen.getByRole("region", { name: "Clases de la semana" })).toBeInTheDocument();
  });

  it("elegir otra clase la pone en la URL", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings", path: "/admin/bookings" });
    fireEvent.click(await screen.findByRole("button", { name: /Tower/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?clase=c13"));
  });

  it("con visitas apagadas no se ofrece visitante ni acompañante", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    await within(lista).findByText("Reformer Intermedio");
    expect(screen.queryByRole("button", { name: "Asignar visitante" })).toBeNull();
    fireEvent.click(within(lista).getByRole("button", { name: /Asignar socia/ }));
    expect(await screen.findByText("Asignar reserva a socia")).toBeInTheDocument();
    expect(screen.queryByText("Llevará acompañante")).toBeNull();
  });

  it("un enlace viejo muestra el error con salida", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=zzz", path: "/admin/bookings" });
    expect(await screen.findByText("No pudimos cargar la clase")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elegir otra clase" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/bookings"));
  });

  it("la pestaña Lista de espera cuenta la espera de la semana", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings", path: "/admin/bookings" });
    const tab = await screen.findByRole("link", { name: /Lista de espera/ });
    await waitFor(() => expect(within(tab).getByText("2")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page");
  });
});
