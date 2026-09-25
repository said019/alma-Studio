import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, PasswordField, PasswordRules } from "./fields";
import { describeZone } from "@/design/zoneGuard";

describeZone(["src/components/app/fields.tsx", "src/components/account/ChangePassword.tsx", "src/components/ui/toaster.tsx"]);

const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("campos (dos temas)", () => {
  it("fondo surface en claro y hundido en oscuro, borde 1.5 px que pasa 3:1, 48 px", () => {
    render(<Field label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    has(input, "bg-surface"); has(input, "dark:bg-sunken"); has(input, "border-[1.5px]");
    has(input, "border-line-strong"); has(input, "min-h-[48px]");
  });
  it("con error: borde y mensaje en danger", () => {
    render(<Field label="Correo" error="Falta el dominio del correo." />);
    has(screen.getByLabelText("Correo"), "border-danger");
    has(screen.getByText("Falta el dominio del correo."), "text-danger");
  });
  it("foco en tinta con halo terracota suave; marcador de posición tenue", () => {
    render(<Field label="Teléfono" />);
    const c = screen.getByLabelText("Teléfono").className;
    expect(c).toMatch(/focus-visible:ring-ink/);
    expect(c).toMatch(/focus-visible:shadow-\[0_0_0_5px_theme\(colors\.accent\.soft\)\]/);
    expect(c).toMatch(/placeholder:text-ink-faint/);
  });
  it("sin colores en línea (campos, contraseña y reglas)", () => {
    const { container } = render(<><Field label="A" /><PasswordField label="B" /><PasswordRules password="Abc12345" /></>);
    const conColor = [...container.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);
    expect(conColor).toEqual([]);
  });
});
