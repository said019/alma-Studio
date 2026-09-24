/**
 * Tokens de color de HIVE — única fuente de verdad.
 *
 * Nombran para qué sirve cada color, no a qué marca pertenece: si la marca
 * vuelve a cambiar, cambian los valores, no los nombres. Los leen Tailwind
 * (tailwind.config.ts), las variables de shadcn (src/index.css) y los estilos
 * en línea de la app.
 *
 * Siempre hex #RRGGBB: hay código que les pega transparencia (`${COLOR.ink}8c`).
 * Spec: docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md §3
 */
export const COLOR = {
  canvas: "#F4F4F3",
  surface: "#FFFFFF",
  sunken: "#EAEAE9",
  line: "#DEDEDC",
  lineStrong: "#8A8A88",
  ink: "#111111",
  inkMuted: "#5B5B59",
  accent: "#FA936A",
  onAccent: "#111111",
  accentSoft: "#FEE4D8",
  accentStrong: "#B94A26",
  success: "#2E6B50",
  danger: "#A3243B",
  inverse: "#111111",
  inverseRaised: "#1E1E1E",
  onInverse: "#F4F4F3",
  onInverseMuted: "#A3A3A1",
} as const;

export type ColorToken = keyof typeof COLOR;

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

export const TONE_STYLE: Record<Tone, ToneStyle> = {
  ink: { fg: COLOR.ink, softBg: COLOR.sunken, softFg: COLOR.ink, solidBg: COLOR.ink, solidFg: COLOR.canvas },
  muted: { fg: COLOR.inkMuted, softBg: COLOR.sunken, softFg: COLOR.inkMuted, solidBg: COLOR.inkMuted, solidFg: COLOR.canvas },
  // Coral suave lleva texto ink: coral profundo sobre coral suave da 4.25:1.
  accent: { fg: COLOR.accentStrong, softBg: COLOR.accentSoft, softFg: COLOR.ink, solidBg: COLOR.accent, solidFg: COLOR.onAccent },
  // Éxito y error van sobre blanco (spec §4.2): funcionales, no decorativos.
  success: { fg: COLOR.success, softBg: COLOR.surface, softFg: COLOR.success, solidBg: COLOR.success, solidFg: COLOR.canvas },
  danger: { fg: COLOR.danger, softBg: COLOR.surface, softFg: COLOR.danger, solidBg: COLOR.danger, solidFg: COLOR.canvas },
};


const isTone = (t: string): t is Tone => (TONES as readonly string[]).includes(t);

/** Estilo de un tono. Un valor desconocido cae a `fallback` en vez de romper la pantalla. */
export function resolveTone(tone: string | undefined, fallback: Tone = "muted"): ToneStyle {
  if (tone && isTone(tone)) return TONE_STYLE[tone];
  return TONE_STYLE[fallback];
}
