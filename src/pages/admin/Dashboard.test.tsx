import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import Dashboard from "./Dashboard";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const e = (id: string, status: string, name = `Clienta ${id}`) =>
  ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: name, guest_name: null });
const clase = (id: string, start: string, end: string, type: string, coach: string, cap: number, roster: ReturnType<typeof e>[]) =>
  ({ id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap, class_type_name: type, instructor_name: coach, roster });

const DIA = [
  clase("c07", "07:00", "07:50", "Reformer Básico", "Fer", 8, [e("a", "checked_in"), e("b", "checked_in"), e("c", "no_show")]),
  clase("c11", "11:00", "11:50", "Reformer Intermedio", "Fer", 2, [e("d", "confirmed", "Camila Torres"), e("f", "confirmed"), e("g", "waitlist"), e("h", "waitlist")]),
  clase("c13", "13:00", "13:50", "Tower", "Sofía", 6, [e("i", "confirmed")]),
];

function tabla(over: Record<string, unknown> = {}) {
  return {
    "/admin/stats": { classesToday: 3, activeMembers: 112, monthlyRevenue: 86400, pendingAlerts: 1 },
    "/admin/today-roster": { data: DIA },
    "/memberships?status=expiring": { data: [{ id: "m1" }, { id: "m2" }] },
    "/memberships?limit=5": { data: [{ id: "m9", userName: "Camila Torres", planName: "Paquete 8 clases", status: "active" }] },
    "/admin/orders?status=pending_verification": { data: [{ id: "o1", status: "pending_verification", totalAmount: 1450 }] },
    "/admin/orders?status=pending_payment": { data: [] },
    "/admin/birthdays": { data: [{ id: "u5", displayName: "Andrea Martínez", isToday: true, day: 25, month: 9 }] },
    "/reports/overview": { data: { classOccupancyRate: 72, deltas: { occupancy: 6 } } },
    "/reports/revenue": { data: [{ month: "2026-08-01", amount: 77000 }, { month: "2026-09-01", amount: 86400 }] },
    "/reports/dormant": { data: { active_7d: 142, dormant_8_14d: 38, dormant_15_30d: 21, dormant_31_60d: 17, lost_60d: 29 } },
    "/classes?start=2026-09-26": { data: [{ class_type_name: "Reformer Básico", start_time: "2026-09-26T07:00:00" }] },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Inicio", () => {
  it("la dueña ve la siguiente clase, lo pendiente, sus cifras y las gráficas", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });

    const hero = await screen.findByRole("region", { name: "Siguiente clase" });
    expect(within(hero).getByText("11:00")).toBeInTheDocument();
    expect(within(hero).getByText("Reformer Intermedio")).toBeInTheDocument();
    expect(within(hero).getByText("Siguiente · en 20 min")).toBeInTheDocument();
    expect(within(hero).getByText("Llena · 2/2")).toBeInTheDocument();
    expect(within(hero).getByText("2 en espera")).toBeInTheDocument();

    expect(screen.getByText("de 16 lugares en 3 clases")).toBeInTheDocument();
    expect(await screen.findByText("Ingresos · septiembre")).toBeInTheDocument();

    const pendientes = screen.getByRole("region", { name: "Por atender" });
    expect(await within(pendientes).findByText("Pagos por verificar")).toBeInTheDocument();
    expect(within(pendientes).getByText("$1,450 por confirmar")).toBeInTheDocument();
    expect(within(pendientes).getByText(/en lista de espera hoy/)).toBeInTheDocument();
    expect(within(pendientes).getByText(/membresías por vencer/)).toBeInTheDocument();
    expect(within(pendientes).getByText(/Andrea Martínez/)).toBeInTheDocument();

    const agenda = screen.getByRole("region", { name: "Agenda de hoy" });
    expect(within(agenda).getByText("Tower")).toBeInTheDocument();
    expect(within(agenda).getByText("2 asistieron · 1 falta")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Ingresos · últimos 6 meses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver en Reportes/ })).toHaveAttribute("href", "/admin/reports");
    expect(screen.queryByText(/Reactivar por WhatsApp/)).toBeNull();
  });

  it("recepción no ve dinero ni pide los reportes", async () => {
    loginAs("reception");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    expect(await screen.findByText("Clases hoy")).toBeInTheDocument();
    expect(screen.getByText("En lista de espera hoy")).toBeInTheDocument();
    expect(screen.queryByText(/Ingresos/)).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/reports/revenue");
    expect(mockApi.get).not.toHaveBeenCalledWith(expect.stringContaining("/reports/overview"));
  });

  it("cuando ya no hay clases, lo dice y anuncia la primera de mañana", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 0));
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    const hero = await screen.findByRole("region", { name: "Siguiente clase" });
    expect(within(hero).getByText("Ya no hay más clases hoy")).toBeInTheDocument();
    expect(await within(hero).findByText("Mañana abre Reformer Básico a las 07:00.")).toBeInTheDocument();
  });

  it("sin nada pendiente dice Todo al día", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({
      "/admin/stats": { classesToday: 1, activeMembers: 10, monthlyRevenue: 0, pendingAlerts: 0 },
      "/admin/today-roster": { data: [DIA[2]] },
      "/memberships?status=expiring": { data: [] },
      "/admin/orders?status=pending_verification": { data: [] },
      "/admin/birthdays": { data: [] },
    }));
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    const pendientes = await screen.findByRole("region", { name: "Por atender" });
    expect(await within(pendientes).findByText("Todo al día")).toBeInTheDocument();
  });
});
