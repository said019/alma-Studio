import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ReportsPage from "./ReportsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/reports/overview": { data: { monthlyRevenue: 86400, activeMembers: 112, classOccupancyRate: 72, churnRate: 4.1, monthlyBookings: 1084, cancelledBookings: 62, cancelRate: 30, newMembersThisMonth: 9, reviewsTotal: 14, reviewsAverage: 4.8, deltas: { revenue: 12.2, occupancy: 6 } } },
    "/reports/revenue-sparkline": { data: [] },
    "/reports/revenue": { data: [{ month: "2026-09-01", amount: 86400 }] },
    "/reports/classes": { data: [] },
    "/reports/retention": { data: [] },
    "/reports/instructors": { data: [] },
    "/reports/top-attendance": { data: [] },
    "/reports/conversion": { data: { conversion_rate: 10, converted_total: 1, muestras_total: 10 } },
    "/reports/dormant": { data: { active_7d: 142, dormant_8_14d: 38, dormant_15_30d: 21, dormant_31_60d: 17, lost_60d: 29 } },
  });
});

describe("Reportes", () => {
  it("recepción no entra a Reportes por URL directa (I3)", async () => {
    loginAs("reception");
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    // Sin 403 en la consola: la pantalla no pide reportes antes de redirigir.
    expect(mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/reports"))).toEqual([]);
  });

  it("usa todo el ancho, sin el tope de max-w-6xl (M6)", async () => {
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    await screen.findByText("29 alumnas llevan más de 60 días sin venir");
    expect(document.querySelector(".max-w-6xl")).toBeNull();
  });

  it("sólo sugiere lo que lleva a una pantalla que existe", async () => {
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    expect(await screen.findByText("29 alumnas llevan más de 60 días sin venir")).toBeInTheDocument();
    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links.filter((h) => h.includes("whatsapp-templates"))).toEqual([]);
    expect(screen.queryByText(/Revisar política/)).toBeNull();
    expect(screen.queryByText(/follow-up/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Crear código de regreso" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/discount-codes"));
  });

  it("aclara que las gráficas no dependen del periodo y no trae pestañas duplicadas", async () => {
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    expect(await screen.findByText("No depende del periodo elegido arriba.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
  });
});
