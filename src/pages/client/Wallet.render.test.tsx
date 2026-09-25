import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import Wallet from "./Wallet";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
// Las banderas reales están apagadas; aquí se encienden para los casos de control.
const bandera = vi.hoisted(() => ({ walletPassCard: false, loyalty: false }));
vi.mock("@/config/features", async (original) => {
  const real = await original<typeof import("@/config/features")>();
  return {
    ...real,
    FEATURES: new Proxy(real.FEATURES, {
      get: (t, k) => (k in bandera ? bandera[k as keyof typeof bandera] : t[k as keyof typeof t]),
    }),
  };
});

const PASE = {
  user_name: "Cristopher Said",
  points: 200,
  qr_code: "HIVE-QR-123",
  membership: { plan_name: "Plan 8 clases", class_limit: 8, classes_remaining: 5, end_date: "2026-10-20" },
};

const montar = async () => {
  vi.mocked(api.get).mockImplementation(
    respuestas({ "/wallet/pass": { data: PASE }, "/wallet/google/save-url": { data: { saveUrl: "https://pay.google.com/x" } } }) as never,
  );
  renderPage(<Wallet />, "/app/wallet");
  await screen.findByText("Check-in en recepción");
};

afterEach(() => {
  bandera.walletPassCard = false;
  bandera.loyalty = false;
  vi.clearAllMocks();
});

describe("Tu pase: sólo el QR y los botones de Wallet", () => {
  it("con la tarjeta apagada no hay titular, créditos, vencimiento ni puntos", async () => {
    await montar();
    expect(screen.getByRole("button", { name: /Copiar código/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agregar a Apple Wallet/ })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Agregar a Google Wallet/ })).toBeInTheDocument();
    expect(screen.queryByText("Titular")).toBeNull();
    expect(screen.queryByText("Cristopher Said")).toBeNull();
    expect(screen.queryByText("Por usar")).toBeNull();
    expect(screen.queryByText("Vence")).toBeNull();
    expect(screen.queryByText(/puntos/i)).toBeNull();
  });

  it("control: con la tarjeta encendida vuelve el pase, pero sin puntos mientras lealtad esté apagada", async () => {
    bandera.walletPassCard = true;
    await montar();
    expect(screen.getByText("Titular")).toBeInTheDocument();
    expect(screen.getByText("Cristopher Said")).toBeInTheDocument();
    expect(screen.getByText("Por usar")).toBeInTheDocument();
    expect(screen.queryByText("Puntos")).toBeNull();
    expect(screen.queryByText(/puntos/i)).toBeNull();
  });

  it("control: con la tarjeta y lealtad encendidas, los puntos regresan", async () => {
    bandera.walletPassCard = true;
    bandera.loyalty = true;
    await montar();
    expect(screen.getByText("Puntos")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });
});
