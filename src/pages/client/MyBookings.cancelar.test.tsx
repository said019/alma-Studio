import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, within, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import MyBookings from "./MyBookings";
import { renderPage, respuestas } from "@/test/renderPage";
import { cancellationRules, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));

const AHORA = new Date(2026, 8, 23, 10, 0);
const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 2 };
const RESERVAS = [
  { id: "b3", class_id: "c3", membership_id: "m1", class_type_name: "Mat", instructor_name: "Ana", start_time: "2026-09-26T10:00:00", status: "confirmed" },
  { id: "b4", class_id: "c4", membership_id: "m1", class_type_name: "Reformer", instructor_name: "Ana", start_time: "2026-09-27T10:00:00", status: "waitlist", waitlist_position: 2 },
];
const mem = (left: number) => ({ id: "m1", status: "active", cancellationsUsed: 2 - left, cancellationLimit: 2, cancellationsLeft: left });

function montar(left = 1) {
  vi.mocked(api.get).mockImplementation(respuestas({
    "/bookings/my-bookings": { data: RESERVAS },
    "/memberships/mine/all": { data: [mem(left)] },
    "/public/booking-policy": { data: POLITICA },
    "/public/review-tags": { data: [] },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
  renderPage(<MyBookings />, "/app/bookings");
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  toastSpy.mockReset();
  vi.mocked(api.delete).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Mis clases · cancelar y lista de espera (P0-4 · P1-1)", () => {
  it("el diálogo de cancelar lista las mismas reglas y cuántas le quedan; el aviso usa el mensaje del servidor", async () => {
    montar(1);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Cancelar tu reserva?" });
    const reglas = within(dlg).getByRole("list", { name: "Reglas de cancelación" });
    await waitFor(() => expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA)));
    expect(within(dlg).getByText("Te queda 1 cancelación de este paquete.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { message: "Reserva cancelada. Se devolvió el crédito a tu paquete.", creditRestored: true, leftWaitlist: false } } as never);
    fireEvent.click(within(dlg).getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/bookings/b3"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada", description: "Reserva cancelada. Se devolvió el crédito a tu paquete.",
    })));
  });

  it("con la cuota agotada no ofrece cancelar y manda a recepción", async () => {
    montar(0);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Cancelar tu reserva?" });
    expect(await within(dlg).findByText("Ya usaste tus 2 cancelaciones de este paquete.")).toBeInTheDocument();
    expect(within(dlg).getByText("Si necesitas cancelar, habla con recepción.")).toBeInTheDocument();
    expect(within(dlg).queryByRole("button", { name: "Sí, cancelar" })).toBeNull();
  });

  it("en la fila dice su lugar y puede salir sin usar una cancelación, aunque la cuota esté agotada", async () => {
    montar(0);
    expect(await screen.findByText("Lugar 2 en la fila")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir de la lista de espera" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Salir de la lista de espera?" });
    expect(within(dlg).getByText("Dejas tu lugar en la fila. No usa una cancelación de tu paquete.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { message: "Saliste de la lista de espera. No usa una cancelación de tu paquete.", creditRestored: false, leftWaitlist: true } } as never);
    fireEvent.click(within(dlg).getByRole("button", { name: "Sí, salir" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/bookings/b4"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Saliste de la lista de espera" })));
  });

  it("con el paquete de la reserva vencido (no viene en mine/all) no hereda la cuota de otro paquete activo (ronda 1)", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/bookings/my-bookings": { data: [
        { id: "b5", class_id: "c5", membership_id: "m-vencida", class_type_name: "Mat", instructor_name: "Ana", start_time: "2026-09-26T10:00:00", status: "confirmed" },
      ] },
      // /memberships/mine/all sólo trae vigentes: "m-vencida" no está aquí.
      // La única activa tiene la cuota agotada, pero es OTRO paquete.
      "/memberships/mine/all": { data: [mem(0)] },
      "/public/booking-policy": { data: POLITICA },
      "/public/review-tags": { data: [] },
      "/me/notifications/unread-count": { data: { unread_count: 0 } },
    }) as never);
    renderPage(<MyBookings />, "/app/bookings");
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Cancelar tu reserva?" });
    await within(dlg).findByRole("list", { name: "Reglas de cancelación" });
    expect(within(dlg).queryByText(/Ya usaste/)).toBeNull();
    expect(within(dlg).queryByText(/cancelaciones de este paquete/)).toBeNull();
    expect(within(dlg).queryByText("Si necesitas cancelar, habla con recepción.")).toBeNull();
    expect(within(dlg).getByRole("button", { name: "Sí, cancelar" })).toBeInTheDocument();
  });
});
