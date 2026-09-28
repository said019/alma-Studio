import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
import Privacidad from "./Privacidad";

describe("Aviso de privacidad integral (P1-10, LFPDPPP)", () => {
  it("trae responsable, datos, finalidades, salud, transferencias, ARCO, almacenamiento local, cambios y versión", () => {
    render(<MemoryRouter><Privacidad /></MemoryRouter>);
    for (const h of [
      "1. Responsable", "2. Datos que recabamos", "3. Para qué los usamos (finalidades primarias)", "4. Finalidades secundarias",
      "5. Datos de salud y consentimiento expreso", "6. Con quién compartimos tus datos",
      "7. Tus derechos ARCO, revocación y limitación", "8. Almacenamiento local y cookies",
      "9. Seguridad y conservación", "10. Cambios a este aviso", "11. Contacto",
    ]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(screen.getByText("Versión 2026-09-28")).toBeInTheDocument();
    expect(screen.getByText(/Última actualización: 29 de septiembre de 2026/)).toBeInTheDocument();
    expect(screen.getByText(/es responsable del tratamiento de tus datos personales/)).toHaveTextContent("HIVE Pilates Studio, con domicilio en Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX");
    expect(screen.getByText(/Cuando tú misma los escribes en la app.*te pedimos tu consentimiento expreso/)).toBeInTheDocument();
    expect(screen.getByText(/El equipo del estudio.*también puede registrar los datos de salud que tú le comuniques/)).toBeInTheDocument();
    expect(screen.getByText(/Acompañantes:/)).toBeInTheDocument();
    expect(screen.getByText(/Si cambian las finalidades, te lo informaremos y, cuando la ley lo exija, te pediremos de nuevo tu consentimiento/)).toBeInTheDocument();
    expect(screen.getByText(/A Wellhub, si reservas a través de Wellhub/)).toBeInTheDocument();
    expect(screen.getByText(/presenta tu solicitud en recepción, en Cuauhtémoc #68/)).toBeInTheDocument();
    expect(screen.getByText(/20 días hábiles/)).toBeInTheDocument();
    expect(screen.getByText(/no usa cookies de publicidad ni herramientas de rastreo de terceros/)).toBeInTheDocument();
  });

  it("sin nada de Alma, sin un correo inventado y sin nombrar al proveedor de archivos", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "Privacidad.tsx"), "utf8");
    expect(src).not.toMatch(/\bAlma\b|almamovement|Estefanía|info@|Drive/); // \b: "Almacenamiento" sí va
    expect(src).not.toMatch(/usePolicyText|LegalDynamicBody/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
});
