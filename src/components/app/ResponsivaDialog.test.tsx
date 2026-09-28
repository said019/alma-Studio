import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResponsivaDialog } from "./ResponsivaDialog";
import api from "@/lib/api";

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
// El lienzo de firma usa Canvas2D y ResizeObserver, que jsdom no tiene: se
// simula con un botón que dispara onChange con una firma dummy, para poder
// completar el formulario y disparar mutation.mutate() en las pruebas.
vi.mock("@/components/app/SignaturePad", () => ({
  SignaturePad: ({ onChange }: { onChange: (v: string) => void }) => (
    <button type="button" data-testid="firma" onClick={() => onChange("data:image/png;base64,firma-de-prueba")} />
  ),
}));

beforeEach(() => {
  toastSpy.mockReset();
  vi.mocked(api.post).mockReset();
});

const abrir = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ResponsivaDialog open onClose={() => {}} onSigned={() => {}} />
    </QueryClientProvider>,
  );

/** Llena el formulario hasta que canSubmit sea true y hace clic en "Firmar y continuar". */
const llenarYEnviar = () => {
  fireEvent.change(screen.getByLabelText("Nombre completo *"), { target: { value: "Ana Test" } });
  fireEvent.click(screen.getByText("Sí autorizo"));
  fireEvent.click(screen.getByTestId("firma"));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Firmar y continuar/ }));
};

describe("ResponsivaDialog: velo (I2)", () => {
  it("el velo es canvas al 80 %, sin desenfoque ni inverse (en oscuro inverse es claro: velo lechoso)", () => {
    const { container } = abrir();
    const velo = container.firstElementChild!;
    expect(velo.className).toMatch(/\bfixed inset-0\b/);
    expect(velo.className.split(/\s+/)).toContain("bg-canvas/80");
    expect(velo.className).not.toMatch(/bg-inverse|backdrop-blur/);
  });
});

describe("ResponsivaDialog: marcas de obligatorio (M6)", () => {
  it('"Nombre completo *" conserva el id derivado de siempre', () => {
    abrir();
    expect(screen.getByLabelText("Nombre completo *").id).toBe("field-nombre-completo");
  });
  it('"Uso de imagen" y "Tu firma" llevan su asterisco', () => {
    abrir();
    expect(screen.getByText("Uso de imagen (sección 4) *")).toBeInTheDocument();
    expect(screen.getByText("Tu firma *")).toBeInTheDocument();
  });
  it("teléfono y correo siguen opcionales, sin asterisco", () => {
    abrir();
    expect(screen.getByLabelText("Teléfono").id).toBe("field-tel-fono");
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });
});

describe("ResponsivaDialog: mensaje de error del servidor (revisión, ronda 1, hallazgo importante #2)", () => {
  it("si el servidor rechaza la firma, el toast muestra su mensaje en vez del genérico", async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { status: 400, data: { message: "La firma es demasiado pequeña." } },
    });
    abrir();
    llenarYEnviar();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "No se pudo guardar la responsiva",
          description: "La firma es demasiado pequeña.",
          variant: "destructive",
        }),
      ),
    );
  });

  it("sin mensaje del servidor, conserva el texto genérico", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("network down"));
    abrir();
    llenarYEnviar();
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "No se pudo guardar la responsiva",
          description: "Inténtalo de nuevo.",
          variant: "destructive",
        }),
      ),
    );
  });
});
