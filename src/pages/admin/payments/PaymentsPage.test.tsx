import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PaymentsPage from "./PaymentsPage";
import PaymentsHistoryPage from "./PaymentsHistory";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678" };

function tabla() {
  return {
    "/admin/stats": { pendingAlerts: 3 },
    "/plans": { data: [
      { id: "p8", name: "Paquete 8 clases", price: 1450, classLimit: 8, durationDays: 30, classCategory: "studio", isActive: true },
      { id: "pu", name: "Ilimitado mensual", price: 2680, classLimit: null, durationDays: 30, classCategory: "reformer_tower", isActive: true },
    ] },
    "/users?role=client&search=cam": { data: [CAMILA] },
    "/users/u1": { data: CAMILA },
    "/users/zzz": Object.assign(new Error("404"), { response: { status: 404, data: {} } }),
    "/payments": { data: [
      { id: "y1", userName: "Camila Torres", createdAt: "2026-09-25T10:18:00", method: "transfer", total_amount: 1450 },
      { id: "y2", userName: "Isabel Rojas", createdAt: "2026-09-15T08:05:00", method: "cash", total_amount: 780 },
    ] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  routeApi(mockApi, tabla());
});
afterEach(() => vi.useRealTimers());

describe("Cobros · Cobrar", () => {
  it("clienta, plan y método en una sola pantalla con el resumen a un lado", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    const confirmar = within(resumen).getByRole("button", { name: "Confirmar y activar membresía" });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/ }));

    expect(within(resumen).getByText("Camila Torres")).toBeInTheDocument();
    expect(within(resumen).getByText("$1,450")).toBeInTheDocument();
    expect(within(resumen).getByText("25 sep – 25 oct")).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", {
      userId: "u1", planId: "p8", paymentMethod: "card", startDate: "2026-09-25",
    }));
  });

  it("con ?clienta= llega con la clienta elegida", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=u1", path: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    expect(await within(resumen).findByText("Camila Torres")).toBeInTheDocument();
  });

  it("con un id que no existe lo dice y deja buscar", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=zzz", path: "/admin/payments" });
    expect(await screen.findByText("No encontramos a esa clienta. Búscala abajo.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" })).toBeInTheDocument();
  });

  it("recepción no ve la pestaña Historial", async () => {
    loginAs("reception");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    expect(await screen.findByRole("link", { name: /Verificar/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Historial" })).toBeNull();
  });
});

describe("Cobros · Historial", () => {
  it("totales de la semana y del mes y la tabla", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    const semana = (await screen.findByText("Esta semana")).closest("div")!;
    expect(within(semana).getByText("$1,450")).toBeInTheDocument();
    const mes = screen.getByText("septiembre").closest("div")!;
    expect(within(mes).getByText("$2,230")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /Isabel Rojas/ })).toBeInTheDocument();
    // Se acota a las pestañas de Cobros: la barra superior también tiene un
    // enlace "Cobrar" (acción rápida) que no es la pestaña que se prueba aquí.
    const tabs = screen.getByRole("navigation", { name: "Secciones de Cobros" });
    expect(within(tabs).getByRole("link", { name: "Historial" })).toHaveAttribute("aria-current", "page");
    expect(within(tabs).getByRole("link", { name: "Cobrar" })).not.toHaveAttribute("aria-current");
  });
});
