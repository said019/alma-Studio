import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import fs from "fs";
import path from "path";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PlansList from "./PlansList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; delete: Mock };

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
    // El timeout por-llamada que traía esta prueba (78dd137) ya no hace
    // falta: `asyncUtilTimeout` sube a 3000ms para toda la suite desde
    // src/test/setup.ts (Task 9 del review).
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

  it("un plan con categoría desconocida cae en 'Otros' y se puede editar/eliminar (M8)", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/plans": { data: [
        { id: "p8", name: "Paquete 8 clases", price: 1450, duration_days: 30, class_limit: 8, class_category: "studio", is_active: true },
        { id: "pl", name: "Plan legado", price: 500, duration_days: 30, class_limit: 4, class_category: "", is_active: true },
      ] },
    });
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    expect(await screen.findByRole("heading", { name: "Otros" })).toBeInTheDocument();
    const legado = screen.getByRole("heading", { name: "Plan legado" }).closest("article")!;
    fireEvent.keyDown(within(legado).getByRole("button", { name: "Acciones de Plan legado" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Eliminar" })).toBeInTheDocument();
  });

  it("eliminar explica que un plan con historial se archiva y ya no manda cascade", async () => {
    mockApi.delete.mockReset().mockResolvedValue({ data: { message: "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.", data: { archived: true } } });
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    const paquete = (await screen.findByRole("heading", { name: "Paquete 8 clases" })).closest("article")!;
    fireEvent.keyDown(within(paquete).getByRole("button", { name: "Acciones de Paquete 8 clases" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText(/se archiva: deja de venderse y su historial se conserva/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith("/plans/p8"));
  });

  it("un plan archivado dice Archivado", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/plans": { data: [
        { id: "pa", name: "Plan viejo", price: 900, duration_days: 30, class_limit: 4, class_category: "studio", is_active: false, archived_at: "2026-09-28T10:00:00Z" },
      ] },
    });
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    const viejo = (await screen.findByRole("heading", { name: "Plan viejo" })).closest("article")!;
    expect(within(viejo).getByText("Archivado")).toBeInTheDocument();
  });

  it("ya no hay borrado en cascada por nombre de plan, ni texto de menos de 12 px", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "PlansList.tsx"), "utf8");
    expect(src).not.toMatch(/cascade|CASCADE_DELETE_PLAN_NAME/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
});
