import { describe, it, expect } from "vitest";
import { FIJOS, COLOR_EN_LINEA, opacidadesSinCss, textosChicos, terracotaSinTexto } from "./zoneGuard";

describe("reglas de la guardia de zona", () => {
  it("un relleno terracota lleva text-accent-foreground o es decorativo (regla 1, invertida)", () => {
    expect(terracotaSinTexto('className="bg-accent text-ink-muted"')).toBe(true);
    expect(terracotaSinTexto('className="bg-accent-gradient text-canvas"')).toBe(true);
    expect(terracotaSinTexto('className="from-accent to-accent-deep"')).toBe(true);
    expect(terracotaSinTexto('className="bg-accent text-accent-foreground"')).toBe(false);
    expect(terracotaSinTexto('className="bg-accent-gradient text-accent-foreground shadow-accent-glow"')).toBe(false);
    expect(terracotaSinTexto('className="dark:bg-accent-gradient dark:text-accent-foreground"')).toBe(false);
    expect(terracotaSinTexto(': "bg-accent") + /* decorativo */')).toBe(false);
    expect(terracotaSinTexto('<span aria-hidden="true" className="h-2 w-2 rounded-full bg-accent" />')).toBe(false);
    expect(terracotaSinTexto('className="bg-accent-soft text-ink"')).toBe(false);
    expect(terracotaSinTexto('className="bg-accent-strong text-canvas"')).toBe(false);
  });
  it("caso particular: text-ink nunca va junto a un fondo terracota (en oscuro ink es claro)", () => {
    expect(terracotaSinTexto('className="bg-accent-gradient text-ink"')).toBe(true);
    expect(terracotaSinTexto('className="bg-accent text-ink font-bold"')).toBe(true);
    // Una ternaria con las dos ramas en la misma línea tampoco pasa, aunque una lleve el texto oscuro.
    expect(terracotaSinTexto('(on ? "bg-accent-gradient text-accent-foreground" : "hover:text-ink")')).toBe(true);
    expect(terracotaSinTexto('className="bg-accent text-ink" /* decorativo */')).toBe(true);
  });
  it("marca blancos y negros fijos", () => {
    expect(FIJOS.test('className="bg-white"')).toBe(true);
    expect(FIJOS.test('fill="#fff"')).toBe(true);
    expect(FIJOS.test('className="bg-surface text-ink"')).toBe(false);
  });
  it("marca la paleta por defecto de Tailwind (50…950)", () => {
    for (const c of ["text-gray-500", "bg-slate-950", "border-zinc-200", "ring-rose-50", "from-amber-400", "via-sky-100",
      "to-emerald-900", "bg-neutral-800/50", "hover:bg-stone-100", "dark:text-indigo-300", "text-red-600"]) {
      expect(FIJOS.test(`className="${c}"`), c).toBe(true);
    }
    for (const c of ["text-success", "bg-danger/10", "bg-accent-soft", "text-ink-muted", "border-line-strong", "text-gray", "bg-sunken"]) {
      expect(FIJOS.test(`className="${c}"`), c).toBe(false);
    }
  });
  it("marca blanco, negro y paleta también en fill, stroke, shadow, divide, outline, decoration, placeholder y caret", () => {
    for (const c of ["fill-white", "stroke-black", "shadow-black/10", "divide-white", "outline-black", "decoration-white",
      "placeholder-black", "caret-white", "fill-gray-400", "stroke-slate-700", "shadow-zinc-900/20", "divide-gray-200",
      "outline-blue-500", "decoration-pink-300", "placeholder-gray-400", "placeholder:text-gray-400", "caret-violet-600"]) {
      expect(FIJOS.test(`className="${c}"`), c).toBe(true);
    }
    for (const c of ["fill-current", "stroke-current", "shadow-float", "divide-line", "outline-none", "decoration-accent", "placeholder:text-ink-faint", "caret-accent"]) {
      expect(FIJOS.test(`className="${c}"`), c).toBe(false);
    }
  });
  it("marca opacidades que Tailwind no genera", () => {
    expect(opacidadesSinCss('className="bg-danger/6 border-danger/19"')).toEqual(["bg-danger/6", "border-danger/19"]);
    expect(opacidadesSinCss('className="bg-accent/8 bg-surface/70 border-line/15 text-ink/55"')).toEqual([]);
    expect(opacidadesSinCss('className="text-sm/6 w-1/2 bg-ink/[.06]"')).toEqual([]);
  });
  it("marca texto de menos de 12 px", () => {
    expect(textosChicos('className="text-[0.72rem] text-[11px]"')).toEqual(["text-[0.72rem]", "text-[11px]"]);
    expect(textosChicos('className="text-[0.75rem] text-[12px] text-[1.1rem] text-xs"')).toEqual([]);
  });
  it("marca color en estilos en línea", () => {
    expect(COLOR_EN_LINEA.test("style={{ color: x }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ backgroundColor: y, height: 4 }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ height: 4 }}")).toBe(false);
  });
});
