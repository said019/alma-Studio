import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guardia de la zona de la app (spec 2026-09-25 §9): el color va en clases por
 * tema. Cada prueba de pieza o pantalla llama `describeZone([...sus archivos])`;
 * la Tarea 12 la aplica a la zona entera (src/design/app-zone.test.ts).
 */
const root = path.resolve(__dirname, "..", "..");
export const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

/** Relleno terracota: `bg-accent` sin sufijo, el degradado o `from-accent` (no `bg-accent-soft`). */
export const FONDO_TERRACOTA = /\b(?:bg-accent(?![\w-])|bg-accent-gradient|from-accent(?![\w-]))/;
export const TINTA = /\btext-ink(?![\w-])/;
/** El único texto que va sobre terracota (regla 1). */
export const TEXTO_SOBRE_TERRACOTA = /\btext-accent-foreground\b/;
/** Adorno sin texto (punto, barra): la línea lo dice con `aria-hidden` o con el comentario `/* decorativo *\/`. */
export const DECORATIVA = /aria-hidden|\/\* decorativo \*\//;
/**
 * Regla 1, invertida: una línea con relleno terracota lleva `text-accent-foreground`
 * o es decorativa. Caso particular que nunca pasa: `text-ink` en la misma línea
 * (en oscuro ink es claro), aunque la otra rama de una ternaria lleve el texto oscuro.
 */
export const terracotaSinTexto = (l: string) =>
  FONDO_TERRACOTA.test(l) && (TINTA.test(l) || !(TEXTO_SOBRE_TERRACOTA.test(l) || DECORATIVA.test(l)));

/** Prefijos de color de Tailwind y su paleta por defecto: ninguno sigue al tema. */
const PREFIJOS_DE_COLOR = "bg|text|border|ring|from|to|via|fill|stroke|shadow|divide|outline|decoration|placeholder|caret";
const PALETA_TAILWIND =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
/** Blancos, negros y la paleta por defecto de Tailwind (50…950): colores fijos que ignoran el tema. */
export const FIJOS = new RegExp(
  `\\b(?:${PREFIJOS_DE_COLOR})-(?:(?:white|black)\\b|(?:${PALETA_TAILWIND})-(?:50|[1-9]00|950)\\b)|#(?:fff|000)\\b`,
  "i",
);
/** Color en estilo en línea: jsdom no lo ve y no sigue al tema. */
export const COLOR_EN_LINEA = /style=\{\{[^}]*\b(?:color|backgroundColor|background|borderColor|border|boxShadow|fill|stroke)\s*:/;

/** Opacidades que Tailwind genera: pasos de 5 más /8 (tailwind.config.ts). Otra cifra no produce CSS. */
export const OPACIDADES = new Set([...Array.from({ length: 21 }, (_, i) => i * 5), 8]);
const OPACIDAD = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|outline|divide|shadow|decoration|placeholder|caret)-([a-z][\w-]*)\/(\d+)\b/g;
const TALLAS_DE_TEXTO = /^(?:xs|sm|base|lg|\d?xl)$/;
/** Opacidades de color que Tailwind no genera (la clase queda sin efecto y ninguna prueba lo ve). */
export const opacidadesSinCss = (l: string) =>
  [...l.matchAll(OPACIDAD)]
    .filter(([c, nombre, n]) => !(c.startsWith("text-") && TALLAS_DE_TEXTO.test(nombre)) && !OPACIDADES.has(Number(n)))
    .map(([c]) => c);

/** Texto de menos de 12 px (spec: mínimo 12 px, `text-[0.75rem]`). */
const TALLA = /\btext-\[(\d*\.?\d+)(rem|px)\]/g;
export const textosChicos = (l: string) =>
  [...l.matchAll(TALLA)].filter(([, n, u]) => (u === "rem" ? Number(n) * 16 : Number(n)) < 12).map(([c]) => c);

export const lineasCon = (src: string, pred: (l: string) => boolean) =>
  src.split("\n").map((l, i) => [l, i + 1] as const).filter(([l]) => pred(l)).map(([, n]) => n);

export function describeZone(files: string[], opciones: { permitir?: RegExp } = {}) {
  const libre = (l: string) => !(opciones.permitir && opciones.permitir.test(l));
  describe.each(files)("zona de la app: %s", (f) => {
    const src = read(f);
    it("no usa COLOR ni los tonos en hex", () => {
      expect(src).not.toMatch(/\bCOLOR\b/);
      expect(src).not.toMatch(/\bresolveTone\(|\bTONE_STYLE\b/);
    });
    it("no pone colores en estilos en línea", () => {
      expect(lineasCon(src, (l) => libre(l) && COLOR_EN_LINEA.test(l) && !/cssColor\(/.test(l))).toEqual([]);
    });
    it("no usa blancos ni negros fijos", () => {
      expect(lineasCon(src, (l) => libre(l) && FIJOS.test(l))).toEqual([]);
    });
    it("sólo usa opacidades que Tailwind genera", () => {
      expect(lineasCon(src, (l) => opacidadesSinCss(l).length > 0)).toEqual([]);
    });
    it("no escribe texto de menos de 12 px", () => {
      expect(lineasCon(src, (l) => textosChicos(l).length > 0)).toEqual([]);
    });
    it("sobre terracota sólo va text-accent-foreground (o la línea es decorativa)", () => {
      expect(lineasCon(src, terracotaSinTexto)).toEqual([]);
    });
  });
}
