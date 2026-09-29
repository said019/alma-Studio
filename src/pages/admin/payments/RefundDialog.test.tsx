import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RefundDialog from "./RefundDialog";
import type { RefundablePayment } from "./refund-math";

vi.mock("@/lib/api", () => ({ default: { post: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));

function montar(payment: RefundablePayment) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RefundDialog payment={payment} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

const BASE: RefundablePayment = {
  orderId: "o1", userName: "Camila Torres", planName: "Paquete 8 clases",
  total_amount: 1700, refundedAmount: 0,
  membershipId: "m1", membershipStatus: "active", classesRemaining: 6, classLimit: 8,
};

beforeEach(() => { toastSpy.mockReset(); });

describe("RefundDialog · el resumen no miente (A8)", () => {
  it("total sobre una membresía activa: dice que la cancela y cuenta las clases que quita", async () => {
    montar(BASE);
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText(/Se devuelven \$1,700, se cancela la membresía y se quitan sus 6 clases sin usar; sus reservas futuras se cancelan\./)).toBeInTheDocument();
  });

  it("total sobre una membresía ya cancelada: no dice 'se cancela la membresía' otra vez, pero sí que cancela reservas y deja las clases en 0", async () => {
    montar({ ...BASE, membershipStatus: "cancelled", classesRemaining: 0 });
    const dlg = await screen.findByRole("dialog");
    const texto = within(dlg).getByText(/Se devuelven \$1,700/).textContent ?? "";
    expect(texto).toContain("se cancelan sus reservas futuras y se dejan las clases en 0");
    expect(texto).not.toContain("se cancela la membresía");
  });

  it("total sin membresía: no inventa una cancelación", async () => {
    montar({ ...BASE, membershipId: null, membershipStatus: null, classesRemaining: null, classLimit: null });
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByText("Se devuelven $1,700.")).toBeInTheDocument();
  });

  it("parcial sin membresía: no dice que 'la membresía sigue activa'", async () => {
    montar({ ...BASE, membershipId: null, membershipStatus: null, classesRemaining: null, classLimit: null });
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "200" } });
    expect(within(dlg).queryByText(/La membresía sigue activa/)).toBeNull();
  });

  it("parcial con la membresía ya cancelada: tampoco dice que 'sigue activa'", async () => {
    montar({ ...BASE, membershipStatus: "cancelled", classesRemaining: 0 });
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "200" } });
    expect(within(dlg).queryByText(/La membresía sigue activa/)).toBeNull();
  });

  it("parcial con la membresía vencida (expired): tampoco dice que 'sigue activa'", async () => {
    montar({ ...BASE, membershipStatus: "expired" });
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "200" } });
    expect(within(dlg).queryByText(/La membresía sigue activa/)).toBeNull();
  });

  it("parcial con la membresía en pausa (paused): tampoco dice que 'sigue activa'", async () => {
    montar({ ...BASE, membershipStatus: "paused" });
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "200" } });
    expect(within(dlg).queryByText(/La membresía sigue activa/)).toBeNull();
  });

  it("parcial con membresía activa: sí dice que sigue activa", async () => {
    montar(BASE);
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "200" } });
    expect(within(dlg).getByText(/La membresía sigue activa\./)).toBeInTheDocument();
  });

  it("el monto a devolver acepta centavos (step 0.01)", async () => {
    montar(BASE);
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    expect(within(dlg).getByLabelText("Monto a devolver")).toHaveAttribute("step", "0.01");
  });
});
