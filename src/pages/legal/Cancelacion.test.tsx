import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
import api from "@/lib/api";
import Cancelacion from "./Cancelacion";
import { cancellationRules, waitlistRule, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 3, cancelWindowHours: 24 };
const montar = (policy = POLITICA) => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: policy } } as never);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Cancelacion /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("Política de cancelación de HIVE (P0-4 · punto 7)", () => {
  it("publica las mismas reglas que la app, con la configuración real", async () => {
    montar();
    const reglas = await screen.findByRole("list", { name: "Reglas de cancelación" });
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA));
    expect(screen.getByText(waitlistRule(POLITICA))).toBeInTheDocument();
    expect(screen.getByText("Salir de la lista de espera no usa una cancelación de tu paquete.")).toBeInTheDocument();
    expect(screen.getByText(/Última actualización: 1 de octubre de 2026/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/public/booking-policy");
    expect(screen.getAllByText(/HIVE Pilates Studio/).length).toBeGreaterThan(0);
  });

  it("la política suministrada permite cancelar desde 12 horas sin cuota y conserva puntualidad y vigencias", async () => {
    montar(DEFAULT_BOOKING_POLICY);
    const reglas = await screen.findByRole("list", { name: "Reglas de cancelación" });
    expect(reglas).toHaveTextContent("No hay límite de cancelaciones por paquete");
    expect(reglas).toHaveTextContent("12 horas o más de anticipación, la clase regresa");
    expect(screen.queryByText(/En la app ves cuántas cancelaciones te quedan/)).toBeNull();
    expect(screen.getByText(/La puerta se cierra 5 minutos/)).toBeInTheDocument();
    expect(screen.getByText(/Las vigencias no se extienden/)).toHaveTextContent("60 días naturales");
    expect(screen.queryByText(/evaluar extender/)).toBeNull();
  });

  it("ya no trae nada de Alma, ni el texto editable, ni letra de menos de 12 px", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "Cancelacion.tsx"), "utf8");
    expect(src).not.toMatch(/Alma|almamovement|Juriquilla/);
    expect(src).not.toMatch(/usePolicyText|LegalDynamicBody/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
});
