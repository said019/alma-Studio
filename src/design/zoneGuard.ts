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

/** Fondo terracota en la misma línea que text-ink: en oscuro ink es claro (regla 1). */
export const FONDO_TERRACOTA = /\b(?:bg-accent(?![\w-])|bg-accent-gradient|from-accent(?![\w-]))/;
export const TINTA = /\btext-ink(?![\w-])/;
/** Blancos y negros fijos que ignoran el tema. */
export const FIJOS = /\b(?:bg|text|border|ring|from|to|via)-(?:white|black)\b|#(?:fff|000)\b/i;
/** Color en estilo en línea: jsdom no lo ve y no sigue al tema. */
export const COLOR_EN_LINEA = /style=\{\{[^}]*\b(?:color|backgroundColor|background|borderColor|border|boxShadow|fill|stroke)\s*:/;

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
    it("nunca pone text-ink sobre un fondo terracota", () => {
      expect(lineasCon(src, (l) => FONDO_TERRACOTA.test(l) && TINTA.test(l))).toEqual([]);
    });
  });
}
