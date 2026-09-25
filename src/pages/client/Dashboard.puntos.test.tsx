import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import Dashboard from "./Dashboard";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// La bandera real está apagada; aquí se enciende para el caso de control.
const bandera = vi.hoisted(() => ({ loyalty: false }));
vi.mock("@/config/features", async (original) => {
  const real = await original<typeof import("@/config/features")>();
  return {
    ...real,
    FEATURES: new Proxy(real.FEATURES, {
      get: (t, k) => (k === "loyalty" ? bandera.loyalty : t[k as keyof typeof t]),
    }),
  };
});

const base = {
  "/memberships/my": { data: { planName: "Plan 8 clases", classLimit: 8, classesRemaining: 5 } },
  "/wallet/pass": { data: { points: 120 } },
  "/me/notifications/unread-count": { data: { unread_count: 0 } },
};

afterEach(() => {
  bandera.loyalty = false;
  vi.clearAllMocks();
});

describe("Inicio: la tarjeta del pase no muestra puntos con lealtad apagada", () => {
  it("lleva a tu QR, sin puntos ni recompensas y sin pedir el monedero", async () => {
    vi.mocked(api.get).mockImplementation(respuestas(base) as never);
    renderPage(<Dashboard />, "/app");
    await screen.findByText("Plan 8 clases");
    const tarjeta = screen.getByRole("link", { name: /Ver mi QR/ });
    expect(tarjeta).toHaveAttribute("href", "/app/wallet");
    expect(tarjeta).toHaveTextContent("Tu pase");
    expect(screen.queryByText("Puntos")).toBeNull();
    expect(screen.queryByText("Ver recompensas")).toBeNull();
    expect(screen.queryByText("120")).toBeNull();
    expect(screen.queryByText(/recompensas/i)).toBeNull();
    expect(vi.mocked(api.get).mock.calls.map(([u]) => String(u))).not.toContain("/wallet/pass");
  });

  it("control: con lealtad encendida vuelven los puntos", async () => {
    bandera.loyalty = true;
    vi.mocked(api.get).mockImplementation(respuestas(base) as never);
    renderPage(<Dashboard />, "/app");
    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(screen.getByText("Puntos")).toBeInTheDocument();
  });
});
