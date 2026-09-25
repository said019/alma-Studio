import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthShell, AuthField } from "./AuthShell";
import { COLOR } from "@/design/tokens";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

const MINIMAL_PROPS = {
  brandEyebrow: "Bienvenida",
  brandHeadline: "Encuentra tu ritmo",
  formEyebrow: "Acceso",
  formHeadline: "Inicia sesión",
};

describe("AuthShell — color del logo sobre el bloque oscuro (spec §5)", () => {
  it("el logo del enlace es coral (accent), no casi blanco, sobre inverse", () => {
    wrap(
      <AuthShell {...MINIMAL_PROPS}>
        <div />
      </AuthShell>
    );
    const lockup = screen.getByRole("img", { name: "HIVE Pilates Studio" });
    expect(lockup.className).toContain("text-accent");
    expect(lockup.className).not.toContain("text-inverse-foreground");
  });

  it("la marca de agua también es coral (accent), no casi blanca, sobre inverse", () => {
    const { container } = wrap(
      <AuthShell {...MINIMAL_PROPS}>
        <div />
      </AuthShell>
    );
    const watermark = container.querySelector('span[aria-hidden="true"].pointer-events-none');
    expect(watermark).not.toBeNull();
    expect(watermark?.className).toContain("text-accent");
    expect(watermark?.className).not.toContain("text-inverse-foreground");
  });
});

describe("AuthField — alineado con fields.tsx (spec §4.4, ruling F6)", () => {
  it("fondo surface, borde lineStrong de 1.5px", () => {
    render(<AuthField label="Correo" />);
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveStyle({ backgroundColor: COLOR.surface });
    expect(input.style.border).toContain("1.5px");
    expect(input).toHaveStyle({ borderColor: COLOR.lineStrong });
  });
  it("foco negro (ring-ink) con halo coral suave, no accent-strong", () => {
    render(<AuthField label="Teléfono" />);
    const input = screen.getByLabelText("Teléfono");
    expect(input.className).toMatch(/focus-visible:ring-ink\b/);
    expect(input.className).not.toMatch(/focus-visible:ring-accent-strong/);
  });
  it("con error: borde danger", () => {
    render(<AuthField label="Correo" error="Falta el dominio." />);
    expect(screen.getByLabelText("Correo")).toHaveStyle({ borderColor: COLOR.danger });
  });
  it("la etiqueta mide al menos 12px (0.75rem), en inkMuted", () => {
    render(<AuthField label="Correo" />);
    const label = screen.getByText("Correo");
    expect(label.className).toMatch(/text-\[0\.75rem\]/);
    expect(label).toHaveStyle({ color: COLOR.inkMuted });
  });
});
