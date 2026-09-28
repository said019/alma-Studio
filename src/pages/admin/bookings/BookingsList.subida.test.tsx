// Auditoría 2026-09-27, bloque 3 (P1-1): al cancelar una reserva, el aviso dice
// quién subió de la lista de espera y si hay que avisarle a mano.
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock; delete: Mock };

const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: 1 },
  ],
};
const roster = {
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: [
      { bookingId: "b1", status: "confirmed", checkedInAt: null, userId: "u1", displayName: "Ana", email: "ana@x.com", phone: "5512345678", planName: "Paquete 8", classesRemaining: 3 },
      { bookingId: "b9", status: "waitlist", checkedInAt: null, userId: "u9", displayName: "Regina López", email: "regi@x.com", phone: "5578901234", planName: "Paquete 8", classesRemaining: 4, waitlistPosition: 1 },
    ],
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/classes?start=": semana,
    "/classes/c11/roster": roster,
    "/loyalty/config": { data: { faltas_cancel_window_hours: 12 } },
    "/users?role=client": { data: [] },
  });
});
afterEach(() => vi.useRealTimers());

async function cancelarReservaDeAna() {
  renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
  const lista = await screen.findByRole("region", { name: "Lista de la clase" });
  await within(lista).findByText("Ana");
  fireEvent.keyDown(within(lista).getByRole("button", { name: "Más acciones para Ana" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Cancelar reserva (devuelve crédito)" }));
  const dlg = await screen.findByRole("dialog", { name: "Cancelar reserva de Ana" });
  fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "Nos pidió moverla" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Cancelar reserva" }));
}

describe("Reservas · subida de la lista de espera (P1-1)", () => {
  it("dice quién subió y pide avisarle a mano si no le llegó el WhatsApp", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [
      { booking_id: "b9", user_id: "u9", display_name: "Regina López", phone: "5578901234", whatsapp: "unreached", email: "queued" },
    ] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada",
      description: "Crédito devuelto a la alumna. Subió de la lista de espera: Regina López. Avísale tú: no le llegó el WhatsApp.",
    })));
  });

  it("con el WhatsApp enviado no pide avisar a mano", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [
      { booking_id: "b9", user_id: "u9", display_name: "Regina López", phone: "5578901234", whatsapp: "queued", email: "queued" },
    ] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: "Crédito devuelto a la alumna. Subió de la lista de espera: Regina López.",
    })));
  });

  it("sin nadie en la fila el aviso es el de siempre", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada", description: "Crédito devuelto a la alumna.",
    })));
  });
});
