import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import GenerateClasses from "./GenerateClasses";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [{ id: "t1", name: "Tower", color: "#111111" }] },
    "/instructors": { data: [{ id: "i1", displayName: "Sofía Ibarra" }] },
  });
});

describe("Generar clases", () => {
  it("muestra el horario oficial, la vista previa a un lado y esconde la plantilla sola", async () => {
    renderAdmin(<GenerateClasses />, { route: "/admin/class-generator" });
    expect(await screen.findByRole("heading", { name: "Horario oficial" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Vista previa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plantilla/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Generar/ })).toBeDisabled();
  });
});
