import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..");

/** Archivos de código de src/, sin pruebas ni el propio módulo de diseño. */
export function sourceFiles(dir = path.join(root, "src")): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p === path.join(root, "src/design")) continue;
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const rel = (p: string) => path.relative(root, p);
const offenders = (re: RegExp, files = sourceFiles()) =>
  files.filter((f) => re.test(fs.readFileSync(f, "utf8"))).map(rel);

describe("guardias contra volver a Alma", () => {
  it("no quedan clases de color alma-*", () => {
    expect(offenders(/\b[\w:-]*-alma-(canvas|mist|oat|sandstone|stone|berry|ink|ink-deep|hairline|olive)\b/)).toEqual([]);
  });
  it("no queda el objeto ALMA ni el tipo AlmaTone", () => {
    expect(offenders(/\bALMA\b|\bAlmaTone\b/)).toEqual([]);
  });
  it("no quedan clases de fuentes de Alma", () => {
    expect(offenders(/\bfont-(bebas|gulfs|syne|dm|alilato|display-italic)\b/)).toEqual([]);
  });
  it("no quedan curvas --ease-alma", () => {
    expect(offenders(/--ease-alma-/)).toEqual([]);
    expect(fs.readFileSync(path.join(root, "src/index.css"), "utf8")).not.toMatch(/--ease-alma-/);
  });
  it("el archivo puente ya no existe", () => {
    expect(fs.existsSync(path.join(root, "src/components/app/tokens.ts"))).toBe(false);
  });
  it("no hay colores escritos a mano fuera de src/design (spec §3.2 regla 6)", () => {
    // Excepciones justificadas: colores de marcas ajenas que no pueden cambiar.
    const PERMITIDOS: Record<string, "*" | string[]> = {
      "src/lib/wellhubBrand.ts": "*", // identidad oficial de Wellhub
      // Botones oficiales "Add to Apple/Google Wallet": sus colores son de la marca.
      "src/pages/client/Wallet.tsx": ["#000000", "#FFFFFF", "#4285F4", "#EA4335", "#FBBC05", "#34A853"],
    };
    const malos: string[] = [];
    for (const f of sourceFiles()) {
      const r = rel(f);
      const permitido = PERMITIDOS[r];
      if (permitido === "*") continue;
      const hexes = (fs.readFileSync(f, "utf8").match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase());
      const sobran = hexes.filter((h) => !(permitido ?? []).includes(h));
      if (sobran.length) malos.push(`${r}: ${[...new Set(sobran)].join(" ")}`);
    }
    expect(malos).toEqual([]);
  });
});
