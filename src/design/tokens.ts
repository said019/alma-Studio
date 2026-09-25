/**
 * Tokens de color de HIVE — única fuente de verdad, en dos temas.
 *
 * Nombran para qué sirve cada color, no a qué marca pertenece. `LIGHT` es el
 * panel (y la landing/legales hasta el sub-proyecto A); `DARK` es la app de
 * clienta, el acceso y la 404. src/index.css copia estas tablas como variables
 * CSS por tema y Tailwind las lee por variable: `bg-surface` cambia solo
 * cuando `<html data-theme>` cambia.
 *
 * `COLOR` = `LIGHT` en hex: lo usan los estilos en línea del panel. La zona de
 * la app no lo usa (guardia src/design/app-zone.test.ts): ahí el color va en
 * clases, porque jsdom descarta var() en estilos en línea.
 * Spec: docs/superpowers/specs/2026-09-25-hive-app-oscura-design.md §3
 */
export const LIGHT = {
  canvas: "#F2EFEA",
  surface: "#FFFFFF",
  sunken: "#E8E3DC",
  line: "#DDD6CD",
  lineStrong: "#8A7F73",
  ink: "#1A1714",
  inkMuted: "#6B6259",
  inkFaint: "#8A7F73",
  accent: "#CF8A6B",
  accentDeep: "#A9603F",
  onAccent: "#1A1714",
  accentSoft: "#F3DED3",
  accentStrong: "#9A5236",
  success: "#2E6B50",
  danger: "#A3243B",
  inverse: "#1A1714",
  inverseRaised: "#26221E",
  onInverse: "#F2EFEA",
  onInverseMuted: "#A69C91",
} as const;

export type ColorToken = keyof typeof LIGHT;

export const DARK: Record<ColorToken, string> = {
  canvas: "#141210",
  surface: "#1E1B18",
  sunken: "#171412",
  line: "#2E2A26",
  lineStrong: "#6F665D",
  ink: "#F2EFEA",
  inkMuted: "#A69C91",
  inkFaint: "#8A7F73",
  accent: "#CF8A6B",
  accentDeep: "#A9603F",
  onAccent: "#141210",
  accentSoft: "#3A2A22",
  accentStrong: "#DDA084",
  success: "#8FCBA8",
  danger: "#F0A39B",
  inverse: "#F2EFEA",
  inverseRaised: "#FFFFFF",
  onInverse: "#141210",
  onInverseMuted: "#6B6259",
};

export type Theme = "light" | "dark";
export const THEMES: Record<Theme, Record<ColorToken, string>> = { light: LIGHT, dark: DARK };

/** Hex del tema claro: estilos en línea del panel y de las zonas claras. */
export const COLOR = LIGHT;

/** Variable CSS de un token: inkMuted → --c-ink-muted. */
export const cssVarName = (t: ColorToken) => `--c-${t.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;

/** Color que sigue al tema, para los pocos estilos en línea de la app (anillos SVG, degradados). */
export const cssColor = (t: ColorToken, alpha?: number) =>
  alpha === undefined ? `rgb(var(${cssVarName(t)}))` : `rgb(var(${cssVarName(t)}) / ${alpha})`;

export const FONT = {
  display: '"Unbounded", system-ui, sans-serif',
  body: '"Manrope", system-ui, sans-serif',
} as const;

export const TONES = ["ink", "muted", "accent", "success", "danger"] as const;
export type Tone = (typeof TONES)[number];

export type ToneStyle = {
  /** Texto o ícono sobre canvas o surface. */
  fg: string;
  /** Pill o banner suave. */
  softBg: string;
  softFg: string;
  /** Pill sólida. */
  solidBg: string;
  solidFg: string;
};

/** Tonos en hex del tema claro (panel). */
export const TONE_STYLE: Record<Tone, ToneStyle> = {
  ink: { fg: COLOR.ink, softBg: COLOR.sunken, softFg: COLOR.ink, solidBg: COLOR.ink, solidFg: COLOR.canvas },
  muted: { fg: COLOR.inkMuted, softBg: COLOR.sunken, softFg: COLOR.inkMuted, solidBg: COLOR.inkMuted, solidFg: COLOR.canvas },
  // Terracota suave lleva texto ink: accentStrong sobre accentSoft no llega a AA en claro.
  accent: { fg: COLOR.accentStrong, softBg: COLOR.accentSoft, softFg: COLOR.ink, solidBg: COLOR.accent, solidFg: COLOR.onAccent },
  success: { fg: COLOR.success, softBg: COLOR.surface, softFg: COLOR.success, solidBg: COLOR.success, solidFg: COLOR.canvas },
  danger: { fg: COLOR.danger, softBg: COLOR.surface, softFg: COLOR.danger, solidBg: COLOR.danger, solidFg: COLOR.canvas },
};

export type ToneClass = {
  fg: string;
  softBg: string;
  softFg: string;
  /** Contorno de la pill suave. */
  ring: string;
  solidBg: string;
  solidFg: string;
};

/** Tonos en clases: siguen al tema (piezas que viven en la app y en el panel). */
export const TONE_CLASS: Record<Tone, ToneClass> = {
  ink: { fg: "text-ink", softBg: "bg-sunken", softFg: "text-ink", ring: "ring-line", solidBg: "bg-ink", solidFg: "text-canvas" },
  muted: { fg: "text-ink-muted", softBg: "bg-sunken", softFg: "text-ink-muted", ring: "ring-line", solidBg: "bg-ink-muted", solidFg: "text-canvas" },
  accent: { fg: "text-accent-strong", softBg: "bg-accent-soft", softFg: "text-ink", ring: "ring-accent/30", solidBg: "bg-accent", solidFg: "text-accent-foreground" },
  success: { fg: "text-success", softBg: "bg-success/10", softFg: "text-success", ring: "ring-success/25", solidBg: "bg-success", solidFg: "text-canvas" },
  danger: { fg: "text-danger", softBg: "bg-danger/10", softFg: "text-danger", ring: "ring-danger/25", solidBg: "bg-danger", solidFg: "text-canvas" },
};

const isTone = (t: string): t is Tone => (TONES as readonly string[]).includes(t);

/** Estilo hex de un tono (panel). Un valor desconocido cae a `fallback`. */
export function resolveTone(tone: string | undefined, fallback: Tone = "muted"): ToneStyle {
  return tone && isTone(tone) ? TONE_STYLE[tone] : TONE_STYLE[fallback];
}

/** Clases de un tono (dos temas). Un valor desconocido cae a `fallback`. */
export function resolveToneClass(tone: string | undefined, fallback: Tone = "muted"): ToneClass {
  return tone && isTone(tone) ? TONE_CLASS[tone] : TONE_CLASS[fallback];
}
