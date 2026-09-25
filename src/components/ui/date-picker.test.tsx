import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DatePicker } from "./date-picker";

/* F7 — el disparador usaba border-white/[0.08] (tema oscuro) sobre
   páginas claras, así que el borde no se veía. Ahora border-line-strong
   (1.5px, como los campos) y fondo surface. El panel desplegable del
   calendario sigue oscuro (Ruling T6, no se toca aquí). */
describe("DatePicker — disparador con borde visible sobre fondo claro (F7)", () => {
  it("el botón disparador usa border-line-strong y bg-surface, no el tema oscuro", () => {
    render(<DatePicker />);
    const trigger = screen.getByRole("button");
    expect(trigger.className).toMatch(/border-line-strong\b/);
    expect(trigger.className).toMatch(/bg-surface\b/);
    expect(trigger.className).not.toMatch(/border-white\//);
    expect(trigger.className).not.toMatch(/bg-white\//);
  });
});
