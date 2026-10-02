import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
import Terminos from "./Terminos";

const fuente = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const montar = () => render(<MemoryRouter><Terminos /></MemoryRouter>);

describe("Términos y condiciones de HIVE (punto 7)", () => {
  it("son de HIVE en Coyoacán, con su fecha, y remiten a la política de cancelación y al aviso", () => {
    montar();
    expect(screen.getByText(/Última actualización: 1 de octubre de 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cuauhtémoc #68, Del Carmen, Coyoacán/).length).toBeGreaterThan(0);
    const cancelacion = screen.getAllByRole("link", { name: "Política de cancelación" });
    expect(cancelacion.some((a) => a.getAttribute("href") === "/legal/cancelacion")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Aviso de privacidad" }).some((a) => a.getAttribute("href") === "/legal/privacidad")).toBe(true);
    expect(screen.getByText(/Las reservas desde la app cierran 2 horas antes/)).toBeInTheDocument();
  });

  it("el logotipo y el © dicen HIVE; el contacto no trae correo mientras no haya uno", () => {
    montar();
    expect(screen.getByRole("link", { name: "HIVE Pilates Studio" })).toHaveAttribute("href", "/");
    expect(screen.getByText("© 2026 HIVE Pilates Studio")).toBeInTheDocument();
    expect(screen.queryByText(/Email:/)).toBeNull();
    expect(screen.getByText("Lun–vie: 6–10 am y 5–8 pm", { exact: false })).toBeInTheDocument();
  });

  it("ya no queda nada de Alma en Términos ni en el layout legal", () => {
    for (const f of ["Terminos.tsx", "LegalLayout.tsx"]) {
      expect(fuente(f), f).not.toMatch(/Alma|Juriquilla|Querétaro|Banorte|Estefanía|almamovement/);
      expect(fuente(f), f).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
    }
  });
});
