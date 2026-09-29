import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import DiscountCodes from "./DiscountCodes";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/plans": { data: [] },
    "/discount-codes": { data: [
      { id: "d1", code: "HIVEAMIGA", discountType: "fixed", discountValue: 150, usesCount: 50, maxUses: 50, channel: "membership", isActive: true },
      { id: "d2", code: "ONLINE75", discountType: "fixed", discountValue: 75, usesCount: 23, maxUses: null, channel: "all", isActive: true },
    ] },
  });
});

describe("Descuentos", () => {
  it("muestra los usos, marca el agotado y copia el código", async () => {
    renderAdmin(<DiscountCodes />, { route: "/admin/discount-codes" });
    const amiga = (await screen.findAllByText("HIVEAMIGA")).map((el) => el.closest("tr")).find(Boolean)!;
    expect(within(amiga).getByText("Sin cupo")).toBeInTheDocument();
    const online = screen.getAllByText("ONLINE75").map((el) => el.closest("tr")).find(Boolean)!;
    expect(within(online).getByText(/23/)).toBeInTheDocument();
    fireEvent.click(within(amiga).getByRole("button", { name: "Copiar HIVEAMIGA" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("HIVEAMIGA"));
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull(); // sin pestañas Reportes/Descuentos
  });
});
