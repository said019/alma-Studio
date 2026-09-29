import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import ProfileMembership from "./ProfileMembership";
import { renderPage, respuestas } from "@/test/renderPage";
import { cancellationRules, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 2, cancelWindowHours: 12 };
const MEMBRESIA = {
  id: "m1", status: "active", planName: "Paquete 8", startDate: "2026-09-01", endDate: "2026-10-01",
  classesRemaining: 5, classLimit: 8,
  cancellationsUsed: 1, cancellationLimit: 2, cancellationsLeft: 1,
};

function montar(membresia: Record<string, unknown> = MEMBRESIA, politica: Record<string, unknown> = POLITICA) {
  vi.mocked(api.get).mockImplementation(respuestas({
    "/memberships/my": { data: membresia },
    "/public/booking-policy": { data: politica },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
  return renderPage(<ProfileMembership />, "/app/profile/membership");
}

beforeEach(() => { vi.mocked(api.get).mockReset(); });

describe("Mi membresía · Cancelaciones con la política real", () => {
  it("lista las reglas de la política configurada, no el texto fijo de 12 horas", async () => {
    montar();
    const section = (await screen.findByText(cancellationRules(POLITICA)[0])).closest("ol");
    expect(section).not.toBeNull();
    expect(Array.from(section!.querySelectorAll("li")).map((li) => li.querySelector("span:last-child")?.textContent)).toEqual(cancellationRules(POLITICA));
  });

  it("usa el texto de la política aunque cambien sus horas, y no el fijo anterior", async () => {
    montar(MEMBRESIA, { ...POLITICA, cancelWindowHours: 24 });
    await screen.findByText(cancellationRules({ ...POLITICA, cancelWindowHours: 24 })[1]);
    expect(screen.queryByText("Cancela con más de 12 horas de anticipación sin penalización.")).toBeNull();
  });

  it("muestra cuántas cancelaciones le quedan con la cuota real del paquete", async () => {
    montar();
    expect(await screen.findByText("Te queda 1 cancelación de este paquete.")).toBeInTheDocument();
  });

  it("con la cuota agotada dice que ya las usó todas", async () => {
    montar({ ...MEMBRESIA, cancellationsUsed: 2, cancellationsLeft: 0 });
    expect(await screen.findByText("Ya usaste tus 2 cancelaciones de este paquete.")).toBeInTheDocument();
  });
});
