import { describe, it, expect } from "vitest";
import { contrast, luminance } from "./contrast";
import {
  COLOR, LIGHT, DARK, THEMES, TONES, TONE_STYLE, TONE_CLASS, resolveTone, resolveToneClass,
  cssVarName, cssColor, type ColorToken, type Theme,
} from "./tokens";

const TEXT = 4.5;
const CONTROL = 3;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
/** `a` al `t` (0–1) sobre `b`. */
const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t)));

describe("contraste", () => {
  it("reproduce los valores de referencia de WCAG", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("rechaza lo que no sea #RRGGBB", () => {
    expect(() => luminance("#FFF")).toThrow();
  });
});

describe("tablas", () => {
  it("LIGHT y DARK tienen exactamente las mismas claves", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });
  it.each(["light", "dark"] as Theme[])("todo valor de %s es #RRGGBB en mayúsculas", (t) => {
    for (const [k, v] of Object.entries(THEMES[t])) expect(v, k).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("COLOR es el tema claro (lo usan los estilos en línea del panel)", () => {
    expect(COLOR).toBe(LIGHT);
  });
  it("el coral #FA936A ya no existe", () => {
    for (const t of Object.values(THEMES)) expect(Object.values(t)).not.toContain("#FA936A");
  });
});

// spec §3.2 — permitidas y prohibidas, por tema
const PERMITIDAS: Record<Theme, [ColorToken, ColorToken, number][]> = {
  dark: [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT],
    ["accent", "canvas", TEXT], ["accentStrong", "surface", TEXT], ["accentStrong", "canvas", TEXT],
    ["onAccent", "accent", TEXT], ["onAccent", "accentDeep", CONTROL], ["ink", "accentSoft", TEXT],
    ["accentStrong", "accentSoft", TEXT], ["success", "surface", TEXT], ["danger", "surface", TEXT],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL], ["onInverse", "inverse", TEXT],
    ["inkFaint", "canvas", TEXT], ["inkFaint", "surface", CONTROL],
  ],
  light: [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT],
    ["inkMuted", "sunken", TEXT], ["accentStrong", "canvas", TEXT], ["accentStrong", "surface", TEXT],
    ["onAccent", "accent", TEXT], ["ink", "accentSoft", TEXT], ["success", "surface", TEXT], ["danger", "surface", TEXT],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL], ["onInverse", "inverse", TEXT],
    ["inkFaint", "canvas", CONTROL], ["inkFaint", "surface", CONTROL],
  ],
};
const PROHIBIDAS: Record<Theme, [ColorToken, ColorToken][]> = {
  dark: [["ink", "accent"]],
  light: [["accent", "canvas"], ["onInverse", "accent"], ["accentStrong", "accentSoft"]],
};

describe.each(["dark", "light"] as Theme[])("tema %s", (theme) => {
  const T = THEMES[theme];
  it.each(PERMITIDAS[theme])("%s sobre %s alcanza %s:1", (fg, bg, min) => {
    expect(contrast(T[fg], T[bg])).toBeGreaterThanOrEqual(min);
  });
  it.each(PROHIBIDAS[theme])("%s sobre %s no llega a 4.5:1 (prohibida)", (fg, bg) => {
    expect(contrast(T[fg], T[bg])).toBeLessThan(TEXT);
  });
  it("el texto sobre el punto medio del degradado terracota pasa AA", () => {
    expect(contrast(T.onAccent, mix(T.accent, T.accentDeep, 0.5))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("cristal sobre resplandor (oscuro)", () => {
  // Resplandor más fuerte: accentDeep al 24 % sobre canvas; tarjeta: surface al 70 % encima.
  const glow = mix(DARK.accentDeep, DARK.canvas, 0.24);
  const card = mix(DARK.surface, glow, 0.7);
  it.each(["ink", "inkMuted", "accent", "accentStrong", "success", "danger"] as ColorToken[])(
    "%s se lee sobre la tarjeta translúcida",
    (t) => expect(contrast(DARK[t], card)).toBeGreaterThanOrEqual(TEXT),
  );
  it("inkFaint (íconos) pasa 3:1 sobre la tarjeta translúcida", () => {
    expect(contrast(DARK.inkFaint, card)).toBeGreaterThanOrEqual(CONTROL);
  });
});

// Clases de tono → color del tema, para medir contraste de TONE_CLASS.
const CLASS_TOKEN: Record<string, ColorToken> = {
  canvas: "canvas", surface: "surface", sunken: "sunken", line: "line", "line-strong": "lineStrong",
  ink: "ink", "ink-muted": "inkMuted", "ink-faint": "inkFaint", accent: "accent", "accent-deep": "accentDeep",
  "accent-foreground": "onAccent", "accent-soft": "accentSoft", "accent-strong": "accentStrong",
  success: "success", danger: "danger", inverse: "inverse", "inverse-foreground": "onInverse",
};
function colorOf(cls: string, theme: Theme, under: string): string {
  const m = /^(?:text|bg|ring)-([a-z-]+?)(?:\/(\d+))?$/.exec(cls);
  if (!m || !CLASS_TOKEN[m[1]]) throw new Error(`clase de tono desconocida: ${cls}`);
  const h = THEMES[theme][CLASS_TOKEN[m[1]]];
  return m[2] ? mix(h, under, Number(m[2]) / 100) : h;
}

describe.each(["dark", "light"] as Theme[])("tonos en clases, tema %s", (theme) => {
  const T = THEMES[theme];
  it.each(TONES)("%s es legible en todas sus formas", (tone) => {
    const c = TONE_CLASS[tone];
    expect(contrast(colorOf(c.fg, theme, T.surface), T.canvas)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(colorOf(c.fg, theme, T.surface), T.surface)).toBeGreaterThanOrEqual(TEXT);
    const softBg = colorOf(c.softBg, theme, T.surface);
    expect(contrast(colorOf(c.softFg, theme, softBg), softBg)).toBeGreaterThanOrEqual(TEXT);
    const solidBg = colorOf(c.solidBg, theme, T.surface);
    expect(contrast(colorOf(c.solidFg, theme, solidBg), solidBg)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("resolución de tonos", () => {
  it("resuelve hex (panel) y clases (dos temas)", () => {
    expect(resolveTone("success")).toBe(TONE_STYLE.success);
    expect(resolveToneClass("success")).toBe(TONE_CLASS.success);
  });
  it("un tono desconocido cae al neutro en vez de romper la pantalla", () => {
    expect(resolveToneClass("violeta")).toBe(TONE_CLASS.muted);
    expect(resolveToneClass(undefined)).toBe(TONE_CLASS.muted);
    expect(resolveToneClass("violeta", "ink")).toBe(TONE_CLASS.ink);
    expect(resolveTone("violeta")).toBe(TONE_STYLE.muted);
  });
});

describe("referencias CSS", () => {
  it("nombra la variable de cada token en kebab-case", () => {
    expect(cssVarName("inkMuted")).toBe("--c-ink-muted");
    expect(cssVarName("onInverseMuted")).toBe("--c-on-inverse-muted");
  });
  it("arma el color por tema, con y sin transparencia", () => {
    expect(cssColor("accent")).toBe("rgb(var(--c-accent))");
    expect(cssColor("accent", 0.3)).toBe("rgb(var(--c-accent) / 0.3)");
  });
});
