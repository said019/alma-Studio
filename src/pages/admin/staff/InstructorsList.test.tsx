import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import InstructorsList from "./InstructorsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/instructors": { data: [
      { id: "i1", displayName: "Fer Salinas", email: "fer@hive.mx", specialties: ["Reformer", "Tower"], isActive: true, photoUrl: null },
      { id: "i2", displayName: "Carla Méndez", email: null, specialties: "Mat", isActive: false, photoUrl: null },
    ] },
  });
});

describe("Personas · Coaches", () => {
  it("una tarjeta por coach con especialidades y estado", async () => {
    renderAdmin(<InstructorsList />, { route: "/admin/staff" });
    const fer = (await screen.findByRole("heading", { name: "Fer Salinas" })).closest("article")!;
    expect(within(fer).getByText("Reformer")).toBeInTheDocument();
    expect(within(fer).getByText("Activa")).toBeInTheDocument();
    const carla = screen.getByRole("heading", { name: "Carla Méndez" }).closest("article")!;
    expect(within(carla).getByText("Inactiva")).toBeInTheDocument();
    fireEvent.keyDown(within(fer).getByRole("button", { name: "Acciones de Fer Salinas" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(await screen.findByText("Editar instructora")).toBeInTheDocument();
  });
});
