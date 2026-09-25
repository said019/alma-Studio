import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthShell, AuthField, AuthCheckbox } from "./AuthShell";
import { describeZone } from "@/design/zoneGuard";

describeZone([
  "src/components/auth/AuthShell.tsx",
  "src/pages/auth/Login.tsx",
  "src/pages/auth/Register.tsx",
  "src/pages/auth/ForgotPassword.tsx",
  "src/pages/auth/ResetPassword.tsx",
  "src/pages/auth/Onboarding.tsx",
]);

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

const MINIMAL_PROPS = {
  brandEyebrow: "Bienvenida",
  brandHeadline: "Encuentra tu ritmo",
  formEyebrow: "Acceso",
  formHeadline: "Inicia sesión",
};

const renderShell = (children: React.ReactNode = <div />) =>
  wrap(
    <AuthShell {...MINIMAL_PROPS}>
      {children}
    </AuthShell>
  );

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

  it("la marca de agua también es coral (accent), no casi blanca, sobre inverse, y oculta a lectores de pantalla", () => {
    const { container } = wrap(
      <AuthShell {...MINIMAL_PROPS}>
        <div />
      </AuthShell>
    );
    const watermark = container.querySelector('span[aria-hidden="true"].pointer-events-none');
    expect(watermark).not.toBeNull();
    expect(watermark?.className).toContain("text-accent");
    expect(watermark?.className).not.toContain("text-inverse-foreground");
    expect(watermark?.getAttribute("aria-hidden")).toBe("true");
  });

  it("el panel de marca ya no es inverse (en oscuro inverse es claro)", () => {
    const { container } = renderShell();
    expect(container.innerHTML).not.toMatch(/\bbg-inverse\b/);
  });
});

describe("AuthField — alineado con fields.tsx (spec §4.4, ruling F6)", () => {
  it("fondo surface, borde lineStrong de 1.5px", () => {
    render(<AuthField label="Correo" />);
    const input = screen.getByLabelText("Correo");
    expect(input.className).toMatch(/\bbg-surface\b/);
    expect(input.className).toMatch(/dark:bg-sunken\b/);
    expect(input.className).toMatch(/\bborder-line-strong\b/);
    expect(input.className).toMatch(/border-\[1\.5px\]/);
  });
  it("foco negro (ring-ink) con halo coral suave, no accent-strong", () => {
    render(<AuthField label="Teléfono" />);
    const input = screen.getByLabelText("Teléfono");
    expect(input.className).toMatch(/focus-visible:ring-ink\b/);
    expect(input.className).not.toMatch(/focus-visible:ring-accent-strong/);
  });
  it("con error: borde danger", () => {
    render(<AuthField label="Correo" error="Falta el dominio." />);
    expect(screen.getByLabelText("Correo").className).toMatch(/\bborder-danger\b/);
  });
  it("la etiqueta mide al menos 12px (0.75rem), en inkMuted", () => {
    render(<AuthField label="Correo" />);
    const label = screen.getByText("Correo");
    expect(label.className).toMatch(/text-\[0\.75rem\]/);
    expect(label.className).toMatch(/text-ink-muted\b/);
  });
});

describe("AuthCheckbox — objetivo táctil", () => {
  it("toda la fila activa la casilla y mide al menos 44 px", () => {
    const onChange = vi.fn();
    render(<AuthCheckbox checked={false} onChange={onChange}>Acepto la responsiva</AuthCheckbox>);
    fireEvent.click(screen.getByText("Acepto la responsiva"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByText("Acepto la responsiva").closest("label")!.className).toContain("min-h-[44px]");
  });
});
