import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import OrdersVerification from "./OrdersVerification";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const orden = (id: string, userName: string, totalAmount: number, status: string, paymentMethod: string) =>
  ({ id, userName, userId: id, totalAmount, status, paymentMethod, createdAt: "2026-09-25T10:28:00", planName: "Paquete 8 clases", proofUrl: null });

beforeEach(() => {
  // Escritorio: el detalle vive a la derecha (useIsDesktop lee este media query).
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: /min-width/.test(q), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 3 },
    "/admin/orders?status=pending_verification": { data: [orden("o1", "Camila Torres", 1450, "pending_verification", "transfer"), orden("o3", "Tarjeta Auto", 900, "pending_verification", "card")] },
    "/admin/orders?status=pending_payment": { data: [orden("o2", "Lucía Navarro", 780, "pending_payment", "cash")] },
  });
});

describe("Cobros · Verificar", () => {
  it("la primera orden se ve a la derecha con el monto a verificar y se aprueba con notas", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    const detalle = await screen.findByRole("complementary", { name: "Detalle de la orden" });
    expect(within(detalle).getByText("Monto a verificar")).toBeInTheDocument();
    expect(within(detalle).getByText("$1,450")).toBeInTheDocument();
    expect(screen.queryByText("Tarjeta Auto")).toBeNull(); // las de tarjeta no se verifican a mano
    fireEvent.change(within(detalle).getByLabelText("Notas internas (opcional)"), { target: { value: "ok" } });
    fireEvent.click(within(detalle).getByRole("button", { name: /Aprobar/ }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/orders/o1/verify", { notes: "ok" }));
  });

  it("rechazar pide el motivo", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    const detalle = await screen.findByRole("complementary", { name: "Detalle de la orden" });
    fireEvent.click(within(detalle).getByRole("button", { name: /Rechazar/ }));
    const confirmar = within(detalle).getByRole("button", { name: /Confirmar rechazo/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(detalle).getByLabelText(/Motivo del rechazo/), { target: { value: "El monto no coincide" } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/orders/o1/reject", { notes: "El monto no coincide", reason: "El monto no coincide" }));
  });

  it("elegir otra fila cambia el detalle y la pestaña Verificar lleva el contador", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    fireEvent.click(await screen.findByText("Lucía Navarro"));
    const detalle = screen.getByRole("complementary", { name: "Detalle de la orden" });
    expect(within(detalle).getByText("$780")).toBeInTheDocument();
    const tab = screen.getByRole("link", { name: /Verificar/ });
    expect(within(tab).getByText("3")).toBeInTheDocument();
  });
});
