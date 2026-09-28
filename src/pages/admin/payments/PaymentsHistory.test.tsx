import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import PaymentsHistoryPage from "./PaymentsHistory";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const orden = (over: Record<string, unknown>) => ({
  source: "order", method: "cash", total_amount: 1700, createdAt: "2026-09-24T12:00:00Z", planName: "Paquete 8 clases",
  refundedAmount: 0, refundStatus: null, membershipStatus: "active", classesRemaining: 6, classLimit: 8, ...over,
});
const PAGOS = {
  data: [
    orden({ id: "o1", orderId: "o1", userName: "Camila Torres", userId: "u1", membershipId: "m1" }),
    orden({ id: "o2", orderId: "o2", userName: "Lucía Díaz", userId: "u2", membershipId: "m2", refundedAmount: 500, refundStatus: "partially_refunded" }),
    { id: "r1", orderId: "o2", source: "refund", userName: "Lucía Díaz", userId: "u2", planName: "Reembolso · Paquete 8 clases", total_amount: -500, method: "transfer", createdAt: "2026-09-25T09:00:00Z" },
    orden({ id: "o3", orderId: "o3", userName: "Sara Ruiz", userId: "u3", membershipId: "m3", refundedAmount: 1700, refundStatus: "refunded", membershipStatus: "cancelled", classesRemaining: 0 }),
  ],
  total: 4600,
  refundsTotal: 500,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: { data: {} } });
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/payments": PAGOS });
});
afterEach(() => vi.useRealTimers());

const fila = async (nombre: string, n = 0) => (await screen.findAllByText(nombre))[n].closest("tr")!;

describe("Cobros · Historial con reembolsos (auditoría 2026-09-27, P1-12)", () => {
  it("marca los reembolsos, sólo ofrece reembolsar lo que queda por devolver y los resta en las cifras", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    const camila = await fila("Camila Torres");
    expect(within(camila).getByRole("button", { name: "Reembolsar el pago de Camila Torres" })).toBeInTheDocument();
    const sara = await fila("Sara Ruiz");
    expect(within(sara).getByText("Reembolsado")).toBeInTheDocument();
    expect(within(sara).queryByRole("button", { name: /Reembolsar/ })).toBeNull();
    const lucias = await screen.findAllByText("Lucía Díaz");
    const textos = lucias.map((el) => el.closest("tr")!.textContent ?? "");
    expect(textos.some((t) => t.includes("Reembolso parcial · $500"))).toBe(true);
    expect(textos.some((t) => t.includes("-$500"))).toBe(true);
    expect(screen.getByText("Reembolsos · septiembre")).toBeInTheDocument();
  });

  it("reembolso parcial: sugiere clases proporcionales, pide motivo y manda lo elegido", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    fireEvent.click(within(await fila("Camila Torres")).getByRole("button", { name: "Reembolsar el pago de Camila Torres" }));
    const dlg = await screen.findByRole("dialog", { name: "Reembolsar a Camila Torres" });
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "425" } });
    expect(within(dlg).getByLabelText("Clases a quitar")).toHaveValue(2);
    const registrar = within(dlg).getByRole("button", { name: "Registrar reembolso" });
    expect(registrar).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "Se lesionó la rodilla" } });
    expect(registrar).toBeEnabled();
    expect(within(dlg).getByText("El dinero se devuelve fuera del sistema: aquí sólo queda registrado.")).toBeInTheDocument();
    fireEvent.click(registrar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/admin/orders/o1/refunds", {
      kind: "partial", method: "cash", reason: "Se lesionó la rodilla", amount: 425, classesToRemove: 2,
    }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Reembolso registrado" })));
  });

  it("reembolso total: explica que cancela la membresía y manda el método y la referencia", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    fireEvent.click(within(await fila("Camila Torres")).getByRole("button", { name: "Reembolsar el pago de Camila Torres" }));
    const dlg = await screen.findByRole("dialog", { name: "Reembolsar a Camila Torres" });
    expect(within(dlg).getByText(/Se devuelven \$1,700, se cancela la membresía y se quitan sus 6 clases sin usar/)).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText("¿Cómo se devolvió?"), { target: { value: "transfer" } });
    fireEvent.change(within(dlg).getByLabelText("Referencia (opcional)"), { target: { value: "SPEI 1" } });
    fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "No pudo seguir por lesión" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registrar reembolso" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/admin/orders/o1/refunds", {
      kind: "total", method: "transfer", reason: "No pudo seguir por lesión", reference: "SPEI 1",
    }));
  });

  it("una orden de Wellhub no ofrece Reembolsar (se concilia con Wellhub)", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/payments": { data: [orden({ id: "w1", orderId: "w1", userName: "Ana Wellhub", userId: "u9", membershipId: null, channel: "wellhub" })], total: 1700, refundsTotal: 0 },
    });
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    const ana = await fila("Ana Wellhub");
    expect(within(ana).getByText("Cobrado")).toBeInTheDocument();
    expect(within(ana).queryByRole("button", { name: /Reembolsar/ })).toBeNull();
  });
});
