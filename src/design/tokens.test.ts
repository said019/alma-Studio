import { describe, it, expect } from "vitest";
import { contrast, luminance } from "./contrast";
import { COLOR, TONES, TONE_STYLE, resolveTone, type ColorToken } from "./tokens";

const TEXT = 4.5;
const CONTROL = 3;

describe("contraste", () => {
  it("reproduce los valores de referencia de WCAG", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("rechaza lo que no sea #RRGGBB", () => {
    expect(() => luminance("#FFF")).toThrow();
    expect(() => luminance("hsl(0 0% 0%)")).toThrow();
  });
});

describe("tokens", () => {
  it("todos son hex #RRGGBB en mayúsculas (el código les pega transparencia: `${COLOR.ink}8c`)", () => {
    for (const [nombre, valor] of Object.entries(COLOR)) {
      expect(valor, nombre).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  const permitidos: [ColorToken, ColorToken, number][] = [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["ink", "sunken", TEXT],
    ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT], ["inkMuted", "sunken", TEXT],
    ["onAccent", "accent", TEXT], ["ink", "accentSoft", TEXT],
    ["accentStrong", "canvas", TEXT], ["accentStrong", "surface", TEXT],
    ["success", "canvas", TEXT], ["success", "surface", TEXT],
    ["danger", "canvas", TEXT], ["danger", "surface", TEXT],
    ["onInverse", "inverse", TEXT], ["onInverseMuted", "inverse", TEXT], ["onInverse", "inverseRaised", TEXT],
    ["canvas", "ink", TEXT], ["canvas", "success", TEXT], ["canvas", "danger", TEXT],
    ["canvas", "inkMuted", TEXT], ["canvas", "accentStrong", TEXT],
    ["accent", "inverse", CONTROL],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL],
  ];
  it.each(permitidos)("%s sobre %s alcanza %s:1", (fg, bg, minimo) => {
    expect(contrast(COLOR[fg], COLOR[bg])).toBeGreaterThanOrEqual(minimo);
  });

  // Prohibidas por regla (spec §3.2). Ninguna pieza puede usarlas.
  const prohibidos: [ColorToken, ColorToken][] = [
    ["onInverse", "accent"],        // texto claro sobre coral
    ["accent", "canvas"],           // coral como texto
    ["accentStrong", "accentSoft"], // coral profundo sobre coral suave: 4.25:1
    // F5 — 4.29:1, no llega a AA. Register.tsx:125, OrderDetail.tsx:171 y
    // ProfileMembership.tsx:110-112 lo usan hoy; queda para el sub-proyecto 2
    // (ruling F5: no se tocan esas pantallas en esta ronda).
    ["accentStrong", "sunken"],
  ];
  it.each(prohibidos)("%s sobre %s no llega a 4.5:1 y está prohibido", (fg, bg) => {
    expect(contrast(COLOR[fg], COLOR[bg])).toBeLessThan(TEXT);
  });
});

describe("tonos", () => {
  it.each(TONES)("el tono %s es legible en todas sus formas", (t) => {
    const s = TONE_STYLE[t];
    expect(contrast(s.fg, COLOR.canvas)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.fg, COLOR.surface)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.softFg, s.softBg)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.solidFg, s.solidBg)).toBeGreaterThanOrEqual(TEXT);
  });

  it("resuelve los tonos nuevos", () => {
    expect(resolveTone("success")).toBe(TONE_STYLE.success);
    expect(resolveTone("accent")).toBe(TONE_STYLE.accent);
  });

  it("ya no acepta nombres de Alma: caen al neutro", () => {
    expect(resolveTone("olive")).toBe(TONE_STYLE.muted);
    expect(resolveTone("berry")).toBe(TONE_STYLE.muted);
  });

  it("un tono desconocido cae al neutro en vez de romper la pantalla", () => {
    expect(resolveTone("violeta")).toBe(TONE_STYLE.muted);
    expect(resolveTone(undefined)).toBe(TONE_STYLE.muted);
    expect(resolveTone("violeta", "ink")).toBe(TONE_STYLE.ink);
  });
});
