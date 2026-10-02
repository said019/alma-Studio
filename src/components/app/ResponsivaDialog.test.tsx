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
  fireEvent.change(screen.getByLabelText("Teléfono *"), { target: { value: "5559449611" } });
  fireEvent.change(screen.getByLabelText("Contacto de emergencia: nombre *"), { target: { value: "Juan Test" } });
  fireEvent.change(screen.getByLabelText("Contacto de emergencia: teléfono *"), { target: { value: "5551234567" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /He leído y acepto/ }));
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
    expect(screen.getByText("Uso de imagen (opcional)")).toBeInTheDocument();
    expect(screen.getByText("Tu firma *")).toBeInTheDocument();
  });
  it("teléfono es requerido y correo opcional", () => {
    abrir();
    expect(screen.getByLabelText("Teléfono *").id).toBe("field-tel-fono");
    expect(screen.getByLabelText("Correo")).toBeInTheDocument();
  });
});

describe("ResponsivaDialog: mensaje de error del servidor", () => {
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

describe("ResponsivaDialog: versión del documento (bloque 3)", () => {
  it("muestra la responsiva de HIVE y manda la versión al firmar", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: {} } });
    abrir();
    expect(screen.getByText("HIVE Pilates Studio — Carta de Consentimiento Informado y Responsiva")).toBeInTheDocument();
    llenarYEnviar();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/waiver", expect.objectContaining({ waiver_version: "v3" })));
  });
});

describe("Responsiva HIVE v3: datos del documento", () => {
  it("exige consentimiento explícito antes de enviar datos de salud opcionales", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: {} } });
    abrir();
    fireEvent.change(screen.getByLabelText("Alergias a medicamentos"), { target: { value: "Penicilina" } });
    llenarYEnviar();
    expect(screen.getByRole("button", { name: /Firmar y continuar/ })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo expresamente/ }));
    fireEvent.click(screen.getByRole("button", { name: /Firmar y continuar/ }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/waiver", expect.objectContaining({
      health_consent: true, medication_allergies: "Penicilina", emergency_contact_name: "Juan Test", emergency_contact_phone: "5551234567", waiver_version: "v3",
    })));
  });

  it("no permite firmar sin el contacto de emergencia", () => {
    abrir();
    fireEvent.change(screen.getByLabelText("Nombre completo *"), { target: { value: "Ana Test" } });
    fireEvent.change(screen.getByLabelText("Teléfono *"), { target: { value: "5559449611" } });
    fireEvent.click(screen.getByTestId("firma"));
    fireEvent.click(screen.getByRole("checkbox", { name: /He leído y acepto/ }));
    expect(screen.getByRole("button", { name: /Firmar y continuar/ })).toBeDisabled();
  });
});


describe("firma presencial por administración", () => {
  it("guarda la firma del cliente seleccionado sin alterar la responsiva del administrador", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: {} } });
    render(<QueryClientProvider client={new QueryClient()}><ResponsivaDialog userId="cliente-presencial" open onClose={() => {}} onSigned={() => {}} /></QueryClientProvider>);
    llenarYEnviar();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/admin/users/cliente-presencial/waiver", expect.objectContaining({ waiver_version: "v3", full_name: "Ana Test" })));
    expect(vi.mocked(api.post).mock.calls.some(([url]) => url === "/me/waiver")).toBe(false);
  });
});
