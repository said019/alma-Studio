import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import BookClasses from "./BookClasses";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const AHORA = new Date(2026, 8, 23, 10, 0);
Element.prototype.scrollTo = () => {};

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  vi.mocked(api.get).mockImplementation(respuestas({
    "/classes": { data: [
      { id: "fila", start_time: "2026-09-23T18:00:00", end_time: "2026-09-23T18:50:00", class_type_name: "Reformer", instructor_name: "Ana", current_bookings: 2, max_capacity: 4, waitlist_count: 1 },
    ] },
    "/memberships/my": { data: { status: "active", classCategory: "all", classesRemaining: 5 } },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("Reservar: con fila, la clase es lista de espera aunque haya lugares (P1-1)", () => {
  it("nadie se salta la fila desde el calendario", async () => {
    renderPage(<BookClasses />, "/app/classes");
    expect((await screen.findAllByRole("button", { name: /Lista de espera/ })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Pocos lugares")).toBeNull();
  });
});
