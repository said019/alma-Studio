import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from "@/lib/api";
import Register from "./Register";
import { renderPage } from "@/test/renderPage";

beforeEach(() => {
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { user: { id: "u1" }, token: "t" } } as never);
});

function llenar() {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "5512345678" } });
  fireEvent.change(screen.getByLabelText("Sexo"), { target: { value: "female" } });
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "1990-05-05" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@correo.com" } });
  fireEvent.change(screen.getByLabelText("Contraseña", { selector: "input" }), { target: { value: "Clave1234" } });
  fireEvent.change(screen.getByLabelText("Confirmar", { selector: "input" }), { target: { value: "Clave1234" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Acepto los términos y condiciones/ }));
}

describe("Registro · consentimiento de datos de salud (P1-10)", () => {
  it("la casilla es opcional, dice que es consentimiento expreso y viaja si se marca", async () => {
    renderPage(<Register />, "/auth/register");
    const casilla = screen.getByRole("checkbox", { name: /Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud/ });
    expect(casilla).toHaveAttribute("aria-checked", "false");
    llenar();
    fireEvent.click(casilla);
    fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/register", expect.objectContaining({ acceptsTerms: true, healthConsent: true })));
  });

  it("sin marcarla también se registra", async () => {
    renderPage(<Register />, "/auth/register");
    llenar();
    fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/register", expect.objectContaining({ healthConsent: false })));
  });
});
