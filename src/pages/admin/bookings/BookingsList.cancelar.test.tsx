// WhatsApp honesto (auditoría 2026-09-27, P0-1): cancelar una clase con el
// canal de WhatsApp caído no debe decir "enviado" — debe avisar a recepción
// a quién no se pudo notificar para que lo haga a mano.
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };

const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: 0 },
  ],
};
const roster = {
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: [
      { bookingId: "b1", status: "confirmed", checkedInAt: null, userId: "u1", displayName: "Ana", email: "ana@x.com", phone: "5512345678", planName: "Paquete 8", classesRemaining: 3 },
      { bookingId: "b2", status: "confirmed", checkedInAt: null, userId: "u2", displayName: "Bea", email: "bea@x.com", phone: "5599999999", planName: "Paquete 8", classesRemaining: 3 },
    ],
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset();
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

describe("Cancelar clase · WhatsApp desconectado (P0-1)", () => {
  it("avisa a mano a las alumnas que no se pudieron notificar", async () => {
    mockApi.put.mockResolvedValue({
      data: {
        data: {
          bookings_cancelled: 2,
          credits_restored: 2,
          wa_queued: 0,
          wa_failed: 2,
          wa_unreached: [
            { user_id: "u1", display_name: "Ana", phone: "5512345678" },
            { user_id: "u2", display_name: "Bea", phone: "5599999999" },
          ],
        },
      },
    });

    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    await within(lista).findByText("Reformer Intermedio");

    fireEvent.click(within(lista).getByRole("button", { name: "Más acciones de la clase" }));
    fireEvent.click(await screen.findByText("Cancelar clase"));

    // Paso 1: motivo (opcional) — confirma con "Continuar".
    await screen.findByText("Motivo de cancelación");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    // Paso 2: confirmación destructiva — confirma con "Cancelar clase".
    await screen.findByText("¿Cancelar la clase completa?");
    const confirmButtons = screen.getAllByRole("button", { name: "Cancelar clase" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/classes/c11/cancel", { reason: undefined }));

    const unreachedDialog = (await screen.findByRole("dialog", { name: "Avisa a mano a estas alumnas" }));
    expect(within(unreachedDialog).getByText("Ana")).toBeInTheDocument();
    expect(within(unreachedDialog).getByText("Bea")).toBeInTheDocument();
    expect(within(unreachedDialog).getByRole("link", { name: "5512345678" })).toHaveAttribute("href", "tel:5512345678");
    expect(within(unreachedDialog).getByRole("link", { name: "5599999999" })).toHaveAttribute("href", "tel:5599999999");

    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    await waitFor(() => expect(screen.queryByText("Avisa a mano a estas alumnas")).toBeNull());
  });
});
