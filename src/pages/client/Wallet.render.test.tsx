import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import api from "@/lib/api";
import Wallet from "./Wallet";
import { renderPage } from "@/test/renderPage";

const toast = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const PASE = {
  user_name: "Cristopher Said",
  points: 200,
  qr_code: "HIVE-QR-123",
  membership: { plan_name: "Plan 8 clases", class_limit: 8, classes_remaining: 5, end_date: "2026-10-20" },
};
const clipboard = vi.fn();
const get = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
  clipboard.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  get.mockResolvedValue({ data: { data: PASE } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function montar(pass: unknown = PASE) {
  get.mockResolvedValue({ data: { data: pass } });
  const view = renderPage(<Wallet />, "/app/wallet");
  await screen.findByText("Cristopher Said");
  return view;
}

describe("QR de acceso dedicado", () => {
  it("muestra los datos del titular y la membresía sin servicios de Wallet", async () => {
    await montar();
    expect(screen.getByRole("heading", { level: 1, name: "Mi QR" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/app");
    expect(screen.getByText("Plan 8 clases")).toBeInTheDocument();
    const qr = screen.getByTitle("Tu código QR de check-in").closest("svg");
    expect(qr).toHaveAttribute("width", "272");
    expect(qr).toHaveClass("w-full", "max-w-[272px]");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByText("5 de 8")).toBeInTheDocument();
    expect(screen.getByText(/20.*oct/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar código/i })).toBeInTheDocument();
    expect(screen.queryByText(/Agregar a.*Wallet/i)).toBeNull();
    expect(screen.queryByText(/puntos/i)).toBeNull();
    expect(get.mock.calls.map(([url]) => url)).toEqual(["/wallet/pass"]);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("copia el código exacto de recepción y confirma el resultado", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Copiar código/i }));
    await waitFor(() => expect(clipboard).toHaveBeenCalledWith("HIVE-QR-123"));
    expect(await screen.findByRole("button", { name: /Copiado/i })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("si copiar falla conserva el QR y permite reintentar", async () => {
    clipboard.mockRejectedValueOnce(new Error("Clipboard denied"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Copiar código/i }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(screen.queryByRole("button", { name: /Copiado/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Copiar código/i }));
    await screen.findByRole("button", { name: /Copiado/i });
    expect(clipboard).toHaveBeenCalledTimes(2);
  });

  it("recupera los datos después de un error de conexión", async () => {
    get.mockRejectedValueOnce(new Error("Offline"));
    renderPage(<Wallet />, "/app/wallet");
    fireEvent.click(await screen.findByRole("button", { name: /Reintentar/i }));
    expect(await screen.findByText("Cristopher Said")).toBeInTheDocument();
    expect(get.mock.calls.map(([url]) => url)).toEqual(["/wallet/pass", "/wallet/pass"]);
  });

  it("sin QR no ofrece copiar un código vacío", async () => {
    await montar({ ...PASE, qr_code: "" });
    expect(screen.queryByRole("button", { name: /Copiar código/i })).toBeNull();
    expect(screen.getByText(/código.*(?:listo|disponible)/i)).toBeInTheDocument();
    expect(clipboard).not.toHaveBeenCalled();
    expect(screen.queryByTitle("Tu código QR de check-in")).toBeNull();
    get.mockResolvedValueOnce({ data: { data: PASE } });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByTitle("Tu código QR de check-in")).toBeInTheDocument();
  });

  it("sin membresía conserva el acceso QR y explica que no hay paquete", async () => {
    await montar({ ...PASE, membership: null });
    expect(screen.getByRole("link", { name: /Sin paquete activo/i })).toHaveAttribute("href", "/app/checkout");
    expect(screen.getByTitle("Tu código QR de check-in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copiar código/i })).toBeInTheDocument();
    expect(screen.queryByText("Plan 8 clases")).toBeNull();
  });

  it.each([null, 9999])("presenta clases ilimitadas con class_limit=%s", async (classLimit) => {
    await montar({ ...PASE, membership: { ...PASE.membership, class_limit: classLimit } });
    expect(screen.getByText(/ilimitad|∞/i)).toBeInTheDocument();
    expect(screen.queryByText("5 de 8")).toBeNull();
  });
  it("no inventa clases ni fecha cuando faltan datos de la membresía", async () => {
    await montar({ ...PASE, membership: { ...PASE.membership, classes_remaining: null, end_date: "invalid" } });
    expect(screen.getByText("Por confirmar")).toBeInTheDocument();
    expect(screen.queryByText("Vence")).toBeNull();
    expect(screen.queryByText(/Invalid Date|NaN/)).toBeNull();
  });

  it("libera el bloqueo de pantalla al salir de la vista", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() });
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    try {
      const view = await montar();
      await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
      view.unmount();
      await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
    } finally { Reflect.deleteProperty(navigator, "wakeLock"); }
  });

  it("un dispositivo que rechaza wake lock todavía muestra el QR", async () => {
    const request = vi.fn().mockRejectedValue(new Error("Not allowed"));
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: { request } });
    try {
      await montar();
      expect(screen.getByTitle("Tu código QR de check-in")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Copiar código/i })).toBeEnabled();
    } finally { Reflect.deleteProperty(navigator, "wakeLock"); }
  });

});
