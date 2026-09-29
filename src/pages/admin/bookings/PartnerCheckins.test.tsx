import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PartnerCheckins from "./PartnerCheckins";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const RESPUESTA = {
  month: "2026-09",
  summary: { confirmed: 3, pending: 1, failed: 0, booked: 6, attended: 4, noShow: 1, unmatched: 1 },
  data: [
    { id: "p1", status: "confirmed", method: "automated", created_at: "2026-09-24T12:00:00Z", user_name: "Lucía Díaz", class_name: "Reformer", class_date: "2026-09-24", booking_status: "checked_in" },
    { id: "p2", status: "pending", method: "automated", created_at: "2026-09-25T12:00:00Z", user_name: "Sara Ruiz", class_name: "Reformer", class_date: "2026-09-25", booking_status: "confirmed" },
  ],
  unmatched: [{ booking_id: "b9", user_name: "Ana Wellhub", class_name: "Reformer", class_date: "2026-09-20" }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/partners/checkins?month=": RESPUESTA });
});
afterEach(() => vi.useRealTimers());

const pedidas = () => mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/partners/checkins"));

describe("Check-ins Wellhub (auditoría 2026-09-27, P1-9)", () => {
  it("la dueña concilia el mes: cifras, tabla en español y asistencias sin check-in", async () => {
    loginAs("admin");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    expect(await screen.findByRole("heading", { level: 1, name: "Check-ins Wellhub" })).toBeInTheDocument();
    expect(pedidas()[0]).toBe("/partners/checkins?month=2026-09");
    expect(await screen.findByText("Confirmados por Wellhub")).toBeInTheDocument();
    const tabla = screen.getByRole("region", { name: "Check-ins del mes" });
    const lucia = within(tabla).getByText("Lucía Díaz").closest("tr")!;
    expect(within(lucia).getByText("Confirmado")).toBeInTheDocument();
    expect(within(lucia).getByText("Automático")).toBeInTheDocument();
    expect(within(lucia).getByText("Asistió")).toBeInTheDocument();
    const sin = screen.getByRole("region", { name: "Asistencias sin check-in de Wellhub" });
    expect(within(sin).getByText("Ana Wellhub")).toBeInTheDocument();
    const sara = within(tabla).getByText("Sara Ruiz").closest("tr")!;
    fireEvent.click(within(sara).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/partners/checkins/p2/confirm"));
  });

  it("cambiar el mes pide ese mes", async () => {
    loginAs("admin");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    fireEvent.change(await screen.findByLabelText("Mes"), { target: { value: "2026-08" } });
    await waitFor(() => expect(pedidas().at(-1)).toBe("/partners/checkins?month=2026-08"));
  });

  it("recepción no entra ni pide los check-ins", async () => {
    loginAs("reception");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(pedidas()).toEqual([]);
  });
});
