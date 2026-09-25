import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClassTypesList from "./ClassTypesList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [
      { id: "t1", name: "Reformer Intermedio", color: "#111111", category: "reformer_tower", defaultDuration: 50, maxCapacity: 8, isActive: true },
      { id: "t2", name: "Barre", color: "#8A8A88", category: "studio", defaultDuration: 45, maxCapacity: 12, isActive: false },
    ] },
  });
});

describe("Tipos de clase", () => {
  it("la tabla muestra la muestra del bloque, la categoría y el estado", async () => {
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    expect(await screen.findByText("Reformer Intermedio")).toBeInTheDocument();
    expect(screen.getByText("Reformer/Tower")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("en escritorio, Nuevo tipo abre el formulario a un lado de la tabla", async () => {
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo tipo/ }));
    const panel = screen.getByRole("complementary", { name: "Nuevo tipo de clase" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Tower" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/class-types", expect.objectContaining({ name: "Tower" })));
  });

  it("sin tipos, en escritorio, Nuevo tipo (encabezado) sí abre el formulario (I2)", async () => {
    routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/class-types": { data: [] } });
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    await screen.findByText("Aún no hay tipos de clase");
    const [header] = screen.getAllByRole("button", { name: "Nuevo tipo" });
    fireEvent.click(header);
    expect(await screen.findByRole("complementary", { name: "Nuevo tipo de clase" })).toBeInTheDocument();
  });

  it("sin tipos, en escritorio, el CTA del vacío también abre el formulario (I2)", async () => {
    routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/class-types": { data: [] } });
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    await screen.findByText("Aún no hay tipos de clase");
    const botones = screen.getAllByRole("button", { name: "Nuevo tipo" });
    fireEvent.click(botones[botones.length - 1]); // el CTA del bloque vacío
    const panel = await screen.findByRole("complementary", { name: "Nuevo tipo de clase" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Mat" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/class-types", expect.objectContaining({ name: "Mat" })));
  });

  it("las etiquetas de color son legibles, los swatches de 44 px y el menú de fila trae aria-label (M9)", async () => {
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo tipo/ }));
    const panel = screen.getByRole("complementary", { name: "Nuevo tipo de clase" });
    const swatchButtons = within(panel).getAllByRole("button", { pressed: false }).filter((b) => b.hasAttribute("title"));
    expect(swatchButtons.length).toBeGreaterThan(0);
    for (const btn of swatchButtons) {
      const swatch = btn.querySelector("span[aria-hidden]") ?? btn.querySelector("span");
      expect(swatch?.className).toMatch(/h-11 w-11/);
      const label = btn.querySelector("span:last-child");
      expect(label?.className).toContain("text-[0.75rem]");
    }
    expect(screen.getByRole("button", { name: "Acciones de Reformer Intermedio" })).toBeInTheDocument();
  });
});
