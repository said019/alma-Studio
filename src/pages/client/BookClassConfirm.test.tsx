import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import api from "@/lib/api";
import BookClassConfirm from "./BookClassConfirm";
import { renderPage, respuestas } from "@/test/renderPage";
import { cancellationRules, horasTexto, waitlistRule, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

// jsdom no implementa IntersectionObserver (usado por StickyCta, ya en esta
// pantalla antes de esta tarea); mismo stub local que src/components/app/widgets.test.tsx,
// para no tocar el setup compartido de pruebas.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  // @ts-expect-error jsdom no lo define
  window.IntersectionObserver = MockIntersectionObserver;
  global.IntersectionObserver = MockIntersectionObserver;
}

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));

const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 3, cancelWindowHours: 24 };
const CLASE = {
  id: "c1", class_type_name: "Reformer", instructor_name: "Ana",
  start_time: "2026-09-26T10:00:00", end_time: "2026-09-26T10:50:00", max_capacity: 4, current_bookings: 2, waitlist_count: 0,
};
const MEM = { status: "active", classesRemaining: 5, planName: "Paquete 8", cancellationsUsed: 1, cancellationLimit: 3, cancellationsLeft: 2 };

function montar(clase: Record<string, unknown> = CLASE, membresia: Record<string, unknown> = MEM) {
  vi.mocked(api.get).mockImplementation(respuestas({
    "/classes/c1": { data: clase },
    "/memberships/my": { data: membresia },
    "/public/booking-policy": { data: POLITICA },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
  return renderPage(<Routes><Route path="/app/classes/:classId" element={<BookClassConfirm />} /></Routes>, "/app/classes/c1");
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  toastSpy.mockReset();
});

describe("Detalle de clase · política y fila (P0-4 · P1-1)", () => {
  it("las reglas son las de la política configurada, iguales a /legal/cancelacion, y dice cuántas le quedan", async () => {
    montar();
    const reglas = await screen.findByRole("list", { name: "Reglas de cancelación" });
    await within(reglas).findByText(cancellationRules(POLITICA)[0]);
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA));
    expect(screen.getByText("Te quedan 2 cancelaciones de este paquete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la política completa" })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.queryByText(/no cuenta como falta/)).toBeNull();
    expect(screen.getByText(waitlistRule(POLITICA))).toBeInTheDocument();
  });

  it("con fila y lugares libres, la clase se ofrece como lista de espera", async () => {
    montar({ ...CLASE, current_bookings: 2, waitlist_count: 1 });
    expect(await screen.findByRole("button", { name: "Unirme a la lista de espera" })).toBeInTheDocument();
    expect(screen.getByText("Lista de espera")).toBeInTheDocument();
  });

  it("con la cuota agotada lo dice antes de reservar", async () => {
    montar(CLASE, { ...MEM, cancellationsUsed: 3, cancellationsLeft: 0 });
    expect(await screen.findByText("Ya usaste tus 3 cancelaciones de este paquete.")).toBeInTheDocument();
  });

  it("sin límite no muestra el contador", async () => {
    montar(CLASE, { ...MEM, cancellationLimit: 0, cancellationsLeft: null });
    await screen.findByRole("list", { name: "Reglas de cancelación" });
    expect(screen.queryByText(/cancelaciones de este paquete/)).toBeNull();
  });

  it("al quedar en lista de espera, el aviso dice cuándo sube sola en vez del genérico anterior", async () => {
    montar({ ...CLASE, current_bookings: 2, waitlist_count: 1 });
    vi.mocked(api.post).mockResolvedValue({ data: { booking: { status: "waitlist" } } } as never);
    fireEvent.click(await screen.findByRole("button", { name: "Unirme a la lista de espera" }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Quedaste en lista de espera",
      description: `Si se libera un lugar hasta ${horasTexto(POLITICA.waitlistCutoffHours)} antes, quedas inscrita sola y se usa una clase de tu paquete.`,
    })));
  });
});
