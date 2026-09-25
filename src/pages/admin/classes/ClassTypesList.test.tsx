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
});
