import { describe, it, expect } from "vitest";
import { FONDO_TERRACOTA, TINTA, FIJOS, COLOR_EN_LINEA, opacidadesSinCss } from "./zoneGuard";

const terracotaConTinta = (l: string) => FONDO_TERRACOTA.test(l) && TINTA.test(l);

describe("reglas de la guardia de zona", () => {
  it("marca text-ink junto a un fondo terracota (en oscuro ink es claro)", () => {
    expect(terracotaConTinta('className="bg-accent-gradient text-ink"')).toBe(true);
    expect(terracotaConTinta('className="bg-accent text-ink font-bold"')).toBe(true);
    expect(terracotaConTinta('className="bg-accent-gradient text-accent-foreground"')).toBe(false);
    expect(terracotaConTinta('className="bg-accent-soft text-ink"')).toBe(false);
    expect(terracotaConTinta('className="bg-accent text-ink-muted"')).toBe(false);
  });
  it("marca blancos y negros fijos", () => {
    expect(FIJOS.test('className="bg-white"')).toBe(true);
    expect(FIJOS.test('fill="#fff"')).toBe(true);
    expect(FIJOS.test('className="bg-surface text-ink"')).toBe(false);
  });
  it("marca opacidades que Tailwind no genera", () => {
    expect(opacidadesSinCss('className="bg-danger/6 border-danger/19"')).toEqual(["bg-danger/6", "border-danger/19"]);
    expect(opacidadesSinCss('className="bg-accent/8 bg-surface/70 border-line/15 text-ink/55"')).toEqual([]);
    expect(opacidadesSinCss('className="text-sm/6 w-1/2 bg-ink/[.06]"')).toEqual([]);
  });
  it("marca color en estilos en línea", () => {
    expect(COLOR_EN_LINEA.test("style={{ color: x }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ backgroundColor: y, height: 4 }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ height: 4 }}")).toBe(false);
  });
});
