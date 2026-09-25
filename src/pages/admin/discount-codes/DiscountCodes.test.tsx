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
      { id: "d1", code: "HIVEAMIGA", discount_type: "fixed", discount_value: 150, uses_count: 50, max_uses: 50, channel: "membership", is_active: true },
      { id: "d2", code: "ONLINE75", discount_type: "fixed", discount_value: 75, uses_count: 23, max_uses: null, channel: "all", is_active: true },
    ] },
  });
});

describe("Descuentos", () => {
  it("muestra los usos, marca el agotado y copia el código", async () => {
    renderAdmin(<DiscountCodes />, { route: "/admin/discount-codes" });
    const amiga = (await screen.findByText("HIVEAMIGA")).closest("tr")!;
    expect(within(amiga).getByText("50/50 · agotado")).toBeInTheDocument();
    const online = screen.getByText("ONLINE75").closest("tr")!;
    expect(within(online).getByText("23/∞")).toBeInTheDocument();
    fireEvent.click(within(amiga).getByRole("button", { name: "Copiar HIVEAMIGA" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("HIVEAMIGA"));
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull(); // sin pestañas Reportes/Descuentos
  });
});
