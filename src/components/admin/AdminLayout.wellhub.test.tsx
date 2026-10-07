import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AdminLayout from "./AdminLayout";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
beforeEach(() => {
  mockApi.get.mockReset();
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 } });
});

describe("AdminLayout · Wellhub (P1-9)", () => {
  it("Wellhub permanece oculto también para la dueña hasta configurar HIVE", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    await screen.findByRole("link", { name: /Reservas/ });
    expect(screen.queryByRole("link", { name: /Wellhub/ })).toBeNull();
  });

  it("recepción no los ve", async () => {
    loginAs("reception");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    await screen.findByRole("link", { name: /Reservas/ });
    expect(screen.queryByRole("link", { name: /Wellhub/ })).toBeNull();
  });
});
