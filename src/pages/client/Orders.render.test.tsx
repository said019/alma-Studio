import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import Orders from "./Orders";
import { TONE_CLASS } from "@/design/tokens";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

afterEach(() => vi.clearAllMocks());

describe("Órdenes: estados traducidos (S2)", () => {
  it('una orden "expired" se lee "Vencido", en pill neutra (muted)', async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/orders": { data: [{ id: "o1", status: "expired", plan_name: "Plan 8 clases", created_at: "2026-09-01T10:00:00", total_amount: 1200, currency: "MXN" }] },
      "/me/notifications/unread-count": { data: { unread_count: 0 } },
    }) as never);
    renderPage(<Orders />, "/app/orders");
    const pill = await screen.findByText("Vencido");
    expect(screen.queryByText("expired")).toBeNull();
    const clases = pill.className.split(/\s+/);
    expect(clases).toEqual(expect.arrayContaining([TONE_CLASS.muted.softBg, TONE_CLASS.muted.softFg]));
  });
});
