import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./fields";
import { COLOR } from "@/design/tokens";

describe("campos", () => {
  it("fondo blanco, borde que pasa 3:1 y alto de 48 px", () => {
    render(<Field label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input).toHaveStyle({ backgroundColor: COLOR.surface, minHeight: "48px" });
    expect(input.style.border).toContain("1.5px");
    expect(input).toHaveStyle({ borderColor: COLOR.lineStrong });
  });
  it("con error: borde y mensaje en danger", () => {
    render(<Field label="Correo" error="Falta el dominio del correo." />);
    expect(screen.getByLabelText("Correo")).toHaveStyle({ borderColor: COLOR.danger });
    expect(screen.getByText("Falta el dominio del correo.")).toHaveStyle({ color: COLOR.danger });
  });
  it("el foco es negro con halo coral suave", () => {
    render(<Field label="Teléfono" />);
    expect(screen.getByLabelText("Teléfono").className).toMatch(/focus-visible:ring-ink/);
  });
});
