import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthShell } from "./AuthShell";

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
