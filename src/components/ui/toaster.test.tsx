import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toaster } from "./toaster";
import { toast } from "@/hooks/use-toast";
import { COLOR } from "@/design/tokens";

/* F1 — Toaster: fondo surface, título destructive en danger, éxito en
   success, por defecto en ink. Nunca coral. Ruling F1. */
describe("Toaster — colores por variante sobre superficie clara (spec F1)", () => {
  it("variant destructive: título en danger, fondo surface, sin coral", () => {
    toast({ title: "No se pudo guardar", variant: "destructive" });
    const { container } = render(<Toaster />);
    const title = screen.getByText("No se pudo guardar");
    expect(title).toHaveStyle({ color: COLOR.danger });
    const card = title.closest("[class*='rounded-2xl']") as HTMLElement;
    expect(card.className).toMatch(/\bbg-surface\b/);
    expect(container.innerHTML).not.toMatch(/\baccent\b/);
  });

  it("sin variant (por defecto): título en ink", () => {
    toast({ title: "Configuración guardada" });
    render(<Toaster />);
    const title = screen.getByText("Configuración guardada");
    expect(title).toHaveStyle({ color: COLOR.ink });
  });
});
