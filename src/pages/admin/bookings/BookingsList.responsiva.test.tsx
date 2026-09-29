// Tarea 5 · auditoría 2026-09-27, bloque 1.
// Al asignar a una clienta sin responsiva, el panel no debe fallar en silencio
// ni con un toast genérico: debe ofrecer dejar constancia del motivo.
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };

const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 0, waitlist_count: 0 },
  ],
};
const roster = {
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: [],
  },
};

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/classes?start=": semana,
    "/classes/c11/roster": roster,
    "/loyalty/config": { data: { faltas_cancel_window_hours: 12 } },
    "/users?role=client": { data: [{ id: "u1", displayName: "Ana López", email: "ana@x.com", phone: "5551234567" }] },
  });
});

/** Abre el panel de asignar y hace clic sobre la única socia listada. */
async function abrirYElegirSocia() {
  renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
  const lista = await screen.findByRole("region", { name: "Lista de la clase" });
  await within(lista).findByText("Reformer Intermedio");
  fireEvent.click(within(lista).getByRole("button", { name: /Asignar socia/ }));
  await screen.findByText("Asignar reserva a socia");
  fireEvent.click(await screen.findByRole("button", { name: /Ana López/ }));
}

describe("BookingsList · responsiva al asignar", () => {
  it("403 WAIVER_REQUIRED muestra el aviso y la casilla, sin toast de error genérico", async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { status: 403, data: { code: "WAIVER_REQUIRED", message: "Este usuario no ha firmado su responsiva." } },
    });

    await abrirYElegirSocia();

    expect(await screen.findByText("Este usuario no ha firmado su responsiva")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Firmará en recepción/ })).toBeInTheDocument();
    // Sin toast genérico de "Error al asignar reserva" para este código.
    expect(screen.queryByText("Error al asignar reserva")).toBeNull();
  });

  it("motivo de menos de 5 caracteres deja deshabilitado el botón de reintento", async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { status: 403, data: { code: "WAIVER_REQUIRED", message: "Este usuario no ha firmado su responsiva." } },
    });

    await abrirYElegirSocia();
    await screen.findByText("Este usuario no ha firmado su responsiva");
    fireEvent.click(screen.getByRole("checkbox", { name: /Firmará en recepción/ }));

    const motivo = screen.getByPlaceholderText("Motivo (obligatorio)");
    const boton = screen.getByRole("button", { name: "Asignar de todos modos" });
    expect(boton).toBeDisabled();

    fireEvent.change(motivo, { target: { value: "ok" } });
    expect(boton).toBeDisabled();
  });

  it("con motivo válido, 'Asignar de todos modos' reintenta con waiverOverride", async () => {
    mockApi.post.mockRejectedValueOnce({
      response: { status: 403, data: { code: "WAIVER_REQUIRED", message: "Este usuario no ha firmado su responsiva." } },
    });
    mockApi.post.mockResolvedValueOnce({ data: { message: "Reserva asignada" } });

    await abrirYElegirSocia();
    await screen.findByText("Este usuario no ha firmado su responsiva");
    fireEvent.click(screen.getByRole("checkbox", { name: /Firmará en recepción/ }));

    const motivo = screen.getByPlaceholderText("Motivo (obligatorio)");
    fireEvent.change(motivo, { target: { value: "Firmará hoy en mostrador" } });

    const boton = screen.getByRole("button", { name: "Asignar de todos modos" });
    expect(boton).not.toBeDisabled();
    fireEvent.click(boton);

    await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(2));
    const [, body] = mockApi.post.mock.calls[1];
    expect(body).toEqual(expect.objectContaining({
      classId: "c11",
      userId: "u1",
      waiverOverride: { reason: "Firmará hoy en mostrador" },
    }));
  });
});
