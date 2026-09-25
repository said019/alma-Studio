import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import MembershipsList from "./MembershipsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const m = (id: string, userName: string, status: string, endDate: string | null, classesRemaining: number | null, classLimit: number | null) =>
  ({ id, userId: id, userName, planId: "p", planName: "Paquete 8 clases", classCategory: "studio", status, startDate: "2026-09-01", endDate, classesRemaining, classLimit });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/memberships?status=expiring": { data: [m("m2", "Daniela Pérez", "active", "2026-09-28", 2, 8)] },
    "/memberships?status=pending_payment": { data: [m("m3", "Sofía Gómez", "pending_payment", null, null, null), m("m4", "Lucía Navarro", "pending_payment", null, null, 12)] },
    "/memberships?status=active": { data: [] },
    "/memberships": { data: [m("m1", "Camila Torres", "active", "2026-10-25", 3, 8), m("m2", "Daniela Pérez", "active", "2026-09-28", 2, 8), m("m5", "Valeria Ruiz", "active", "2026-10-18", 9999, null)] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Membresías", () => {
  it("cuenta por vencer y pendientes, y marca la que vence pronto", async () => {
    renderAdmin(<MembershipsList />, { route: "/admin/memberships" });
    expect(await screen.findByText("Camila Torres")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("tab", { name: /Pendientes/ })).getByText("2")).toBeInTheDocument());
    expect(within(screen.getByRole("tab", { name: /Por vencer/ })).getByText("1")).toBeInTheDocument();
    const daniela = screen.getByText("Daniela Pérez").closest("tr")!;
    expect(within(daniela).getByText("· vence pronto")).toBeInTheDocument();
    const valeria = screen.getByText("Valeria Ruiz").closest("tr")!;
    expect(within(valeria).getByText("Ilimitadas")).toBeInTheDocument();
  });

  it("?tab=expiring abre Por vencer y cambiar de pestaña cambia la URL", async () => {
    renderAdmin(<MembershipsList />, { route: "/admin/memberships?tab=expiring", path: "/admin/memberships" });
    expect(await screen.findByRole("tab", { name: /Por vencer/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Activas/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/memberships?tab=active"));
  });
});
