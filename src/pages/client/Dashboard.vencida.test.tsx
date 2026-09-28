import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import Dashboard from "./Dashboard";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const base = {
  "/wallet/pass": { data: { points: 120 } },
  "/me/notifications/unread-count": { data: { unread_count: 0 } },
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("Inicio: membresía vencida (tarea 7, auditoría 2026-09-27)", () => {
  it('con isExpired:true muestra "Vencida" y no "Activa"', async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      ...base,
      "/memberships/my": { data: { planName: "Mes", classLimit: 8, classesRemaining: 3, isExpired: true } },
    }) as never);
    renderPage(<Dashboard />, "/app");
    await screen.findByText("Mes");
    expect(screen.getByText("Vencida")).toBeInTheDocument();
    expect(screen.queryByText("Activa")).toBeNull();
  });

  it('control: sin isExpired (o en false) sigue mostrando "Activa"', async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      ...base,
      "/memberships/my": { data: { planName: "Mes", classLimit: 8, classesRemaining: 3, isExpired: false } },
    }) as never);
    renderPage(<Dashboard />, "/app");
    await screen.findByText("Mes");
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.queryByText("Vencida")).toBeNull();
  });
});
