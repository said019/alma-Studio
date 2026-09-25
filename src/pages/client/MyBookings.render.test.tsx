import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import api from "@/lib/api";
import MyBookings from "./MyBookings";
import { renderPage, respuestas, atenuadoPor } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const AHORA = new Date(2026, 8, 23, 10, 0);
const RESERVAS = [
  { id: "b1", class_id: "c1", class_type_name: "Reformer", instructor_name: "Ana", start_time: "2026-09-20T10:00:00", status: "checked_in", has_review: false },
  { id: "b2", class_id: "c2", class_type_name: "Studio Flow", instructor_name: "Ana", start_time: "2026-09-22T10:00:00", status: "cancelled" },
  { id: "b3", class_id: "c3", class_type_name: "Mat", instructor_name: "Ana", start_time: "2026-09-26T10:00:00", status: "confirmed" },
];

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  vi.mocked(api.get).mockImplementation(respuestas({
    "/bookings/my-bookings": { data: RESERVAS },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const abrirPasadas = async () => {
  renderPage(<MyBookings />, "/app/bookings");
  fireEvent.click(await screen.findByRole("tab", { name: /Pasadas/ }));
  await screen.findByText("Reformer");
};

describe("Mis clases: las pasadas se atenúan sin apagar sus controles (I1)", () => {
  it('"Dejar reseña" y el conmutador "Canceladas" no quedan dentro de un contenedor con opacidad', async () => {
    await abrirPasadas();
    expect(atenuadoPor(screen.getByRole("button", { name: /Dejar reseña/ }))).toEqual([]);
    expect(atenuadoPor(screen.getByRole("button", { name: /Canceladas/ }))).toEqual([]);
  });

  it("la pill de estado queda a opacidad completa y la información de la fila pasada va atenuada", async () => {
    await abrirPasadas();
    expect(atenuadoPor(screen.getByText("Asistida"))).toEqual([]);
    expect(atenuadoPor(screen.getByText("Reformer")).map((n) => n.className)).toEqual([
      expect.stringMatching(/(?:^|\s)opacity-60(?:\s|$)/),
    ]);
  });

  it("las canceladas, al abrirlas, siguen la misma regla", async () => {
    await abrirPasadas();
    fireEvent.click(screen.getByRole("button", { name: /Canceladas/ }));
    expect(atenuadoPor(screen.getByText("Cancelada"))).toEqual([]);
    expect(atenuadoPor(screen.getByText("Studio Flow"))).toHaveLength(1);
  });

  it("las próximas no se atenúan", async () => {
    renderPage(<MyBookings />, "/app/bookings");
    expect(atenuadoPor(await screen.findByText("Mat"))).toEqual([]);
    expect(atenuadoPor(screen.getByRole("button", { name: /Cancelar reserva/ }))).toEqual([]);
  });
});
