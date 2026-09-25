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

  it("CSS, HTML y Tailwind no tienen nada de Alma", () => {
    const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
    const tw = fs.readFileSync(path.join(root, "tailwind.config.ts"), "utf8");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    for (const [nombre, txt] of [["index.css", css], ["tailwind.config.ts", tw]] as const) {
      expect(txt, nombre).not.toMatch(/Fraunces|Jost|Alilato|\balma\b|alma-/i);
    }
    expect(html).not.toMatch(/Fraunces|Jost/);
    expect(tw).not.toMatch(/\b(gulfs|bebas|syne|dm|alilato):/);
  });

  const CORAL = /COLOR\.accent\b|\bbg-accent\b(?!-)/;
  const LIGHT = /COLOR\.(canvas|surface|onInverse|onInverseMuted)\b|\btext-(canvas|surface|white|inverse-foreground|inverse-muted)\b/;
  const lightOnCoral = (line: string) => CORAL.test(line) && LIGHT.test(line);

  it("lightOnCoral marca texto claro sobre coral, línea por línea", () => {
    const casos: [string, boolean][] = [
      ['className="bg-accent text-inverse-muted"', true],
      ['className="bg-accent text-canvas"', true],
      ["style={{ backgroundColor: COLOR.accent, color: COLOR.onInverseMuted }}", true],
      ['className="bg-accent text-ink"', false],
      ["style={{ backgroundColor: COLOR.accent, color: COLOR.onAccent }}", false],
      ['className="bg-accent-soft text-ink"', false],
      ["color: COLOR.accentStrong", false],
    ];
    for (const [line, esperado] of casos) {
      expect(lightOnCoral(line), line).toBe(esperado);
    }
  });

  // F3 — la guardia de hex de 6 dígitos no veía #RRGGBBAA ni rgba()/rgb()
  // literales. Misma lista de excepciones que arriba: wellhubBrand.ts
  // completo (identidad ajena); en Wallet.tsx sólo los seis hex oficiales
  // de los botones de wallet (ninguno es rgba ni #RRGGBBAA, así que ese
  // archivo no necesita excepción aquí).
  const PERMITIDOS_TODO: Record<string, "*"> = {
    "src/lib/wellhubBrand.ts": "*",
  };

  it("no quedan colores #RRGGBBAA fuera de src/design (spec §3.2 regla 6)", () => {
    const malos: string[] = [];
    for (const f of sourceFiles()) {
      const r = rel(f);
      if (PERMITIDOS_TODO[r] === "*") continue;
      const hits = (fs.readFileSync(f, "utf8").match(/#[0-9A-Fa-f]{8}\b/g) ?? []);
      if (hits.length) malos.push(`${r}: ${[...new Set(hits)].join(" ")}`);
    }
    expect(malos).toEqual([]);
  });

  it("no quedan rgba()/rgb() con números escritos a mano fuera de src/design (spec §3.2 regla 6)", () => {
    const malos: string[] = [];
    for (const f of sourceFiles()) {
      const r = rel(f);
      if (PERMITIDOS_TODO[r] === "*") continue;
      if (/rgba?\(\s*\d/.test(fs.readFileSync(f, "utf8"))) malos.push(r);
    }
    expect(malos).toEqual([]);
  });

  it("src/index.css no tiene hex de 6/8 dígitos ni rgb(a)( con números fuera de comentarios", () => {
    const cssPath = path.join(root, "src/index.css");
    const raw = fs.readFileSync(cssPath, "utf8");
    const sinComentarios = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sinComentarios).not.toMatch(/#[0-9A-Fa-f]{6,8}\b/);
    expect(sinComentarios).not.toMatch(/rgba?\(\s*\d/);
  });

  it("ninguna pieza compartida pone texto claro sobre coral", () => {
    const dirs = ["src/components/app", "src/components/ui", "src/components/admin", "src/components/brand"];
    const malos: string[] = [];
    for (const d of dirs) {
      for (const f of fs.readdirSync(path.join(root, d)).filter((x) => /\.tsx$/.test(x) && !/\.test\./.test(x))) {
        fs.readFileSync(path.join(root, d, f), "utf8").split("\n").forEach((line, i) => {
          if (lightOnCoral(line)) malos.push(`${d}/${f}:${i + 1}`);
        });
      }
    }
    expect(malos).toEqual([]);
  });
});
