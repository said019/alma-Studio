import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/components/app/SignaturePad", () => ({ SignaturePad: () => <div aria-label="Firma manuscrita" /> }));
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
    "/users?search=cam": { data: [CAMILA] },
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
  it("usuario, plan y método en una sola pantalla con el resumen a un lado", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    const confirmar = within(resumen).getByRole("button", { name: "Confirmar y activar membresía" });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/ }));

    expect(within(resumen).getByText("Camila Torres")).toBeInTheDocument();
    expect(within(resumen).getByText("$1,450")).toBeInTheDocument();
    expect(within(resumen).getByText("25 sep – 25 oct")).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", {
      idempotencyKey: expect.any(String),
      userId: "u1", planId: "p8", paymentMethod: "card", startDate: "2026-09-25", amount: 1450,
    }));
  });

  it("cobrar distinto al plan pide motivo y lo manda", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Precio cobrado"), { target: { value: "1200" } });
    const confirmar = within(resumen).getByRole("button", { name: "Confirmar y activar membresía" });
    expect(screen.getByText("Lo cobrado es distinto al precio del plan.", { exact: false })).toBeInTheDocument();
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo (obligatorio)"), { target: { value: "Descuento de amiga" } });
    expect(confirmar).toBeEnabled();
    expect(within(resumen).getByText("$1,200")).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", {
      idempotencyKey: expect.any(String),
      userId: "u1", planId: "p8", paymentMethod: "cash", startDate: "2026-09-25", amount: 1200, reason: "Descuento de amiga",
    }));
  });

  it("una cortesía en $0 se marca y pide motivo", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Precio cobrado"), { target: { value: "0" } });
    expect(within(resumen).getByText("Cortesía")).toBeInTheDocument();
    expect(screen.getByText("Es una cortesía ($0).", { exact: false })).toBeInTheDocument();
    expect(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" })).toBeDisabled();
  });

  it("la referencia de pago viaja con la venta y sin motivo si el precio es el del plan", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Referencia de pago (opcional)"), { target: { value: "SPEI 998877" } });
    fireEvent.click(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", expect.objectContaining({ amount: 1450, paymentReference: "SPEI 998877" })));
    expect(mockApi.post.mock.calls[0][1]).not.toHaveProperty("reason");
  });

  it("un plan con precio de apertura cobra el precio efectivo sin pedir motivo", async () => {
    routeApi(mockApi, { ...tabla(), "/plans": { data: [{ id: "pa", name: "Ilimitado apertura", price: 2700, effectivePrice: 2300, classLimit: null, durationDays: 30, classCategory: "studio", isActive: true }] } });
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Ilimitado apertura/ }));
    expect(screen.getByLabelText("Precio cobrado")).toHaveValue(2300);
    expect(screen.queryByLabelText("Motivo (obligatorio)")).toBeNull();
    fireEvent.click(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", expect.objectContaining({ planId: "pa", amount: 2300 })));
  });

  it("solicita la firma presencial si falta responsiva antes de vender", async () => {
    mockApi.post.mockRejectedValueOnce({ response: { status: 403, data: { code: "WAIVER_REQUIRED", message: "Firma requerida" } } });
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=u1", path: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    await within(resumen).findByText("Camila Torres");
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.click(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" }));
    expect(await screen.findByText("HIVE Pilates Studio — Carta de Consentimiento Informado y Responsiva")).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre completo *")).toHaveValue("Camila Torres");
    expect(screen.getByRole("button", { name: "Firmar y continuar" })).toBeDisabled();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
  });

  it("con ?usuario= llega con el usuario elegida", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=u1", path: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    expect(await within(resumen).findByText("Camila Torres")).toBeInTheDocument();
  });

  it("con un id que no existe lo dice y deja buscar", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=zzz", path: "/admin/payments" });
    expect(await screen.findByText("No encontramos a esa usuario. Búscala abajo.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Buscar usuario para cobrar" })).toBeInTheDocument();
  });

  it("recepción no llega a la pantalla de Cobrar (I3)", async () => {
    loginAs("reception");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(screen.queryByRole("complementary", { name: "Resumen de la membresía" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Buscar usuario para cobrar" })).toBeNull();
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

  it("recepción no entra ni pide los pagos (sin 403 en la consola)", async () => {
    loginAs("reception");
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/payments"))).toEqual([]);
  });
});
