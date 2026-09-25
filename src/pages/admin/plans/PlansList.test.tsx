import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PlansList from "./PlansList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/plans": { data: [
      { id: "p8", name: "Paquete 8 clases", price: 1450, duration_days: 30, class_limit: 8, class_category: "studio", opening_price: 1250, is_active: true },
      { id: "pu", name: "Ilimitado mensual", price: 2680, duration_days: 30, class_limit: null, class_category: "reformer_tower", is_non_transferable: true, is_active: true },
      { id: "pm", name: "Muestra gratis", price: 0, duration_days: 7, class_limit: 1, class_category: "studio", is_non_repeatable: true, is_active: false },
    ] },
  });
});

describe("Planes", () => {
  it("tarjetas agrupadas por categoría con precio, reglas y estado", async () => {
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    expect(await screen.findByRole("heading", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reformer/Tower" })).toBeInTheDocument();
    const paquete = screen.getByRole("heading", { name: "Paquete 8 clases" }).closest("article")!;
    expect(within(paquete).getByText("$1,450")).toBeInTheDocument();
    expect(within(paquete).getByText("Apertura $1,250")).toBeInTheDocument();
    expect(within(paquete).getByText("8 clases · 30 días")).toBeInTheDocument();
    const ilimitado = screen.getByRole("heading", { name: "Ilimitado mensual" }).closest("article")!;
    expect(within(ilimitado).getByText("No transferible")).toBeInTheDocument();
    expect(within(ilimitado).getByText("Ilimitado · 30 días")).toBeInTheDocument();
    const muestra = screen.getByRole("heading", { name: "Muestra gratis" }).closest("article")!;
    expect(within(muestra).getByText("Inactivo")).toBeInTheDocument();
    fireEvent.keyDown(within(paquete).getByRole("button", { name: "Acciones de Paquete 8 clases" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(await screen.findByText("Editar plan")).toBeInTheDocument();
  });
});
