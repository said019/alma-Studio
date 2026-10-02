// Guardia del rebrand: las pantallas (src/pages, src/components), el manifest
// y el HTML ya no nombran la sede ni la marca anteriores (Alma Movement, en
// Juriquilla, Querétaro). HIVE Pilates Studio está en Coyoacán, CDMX
// (src/lib/studio.ts).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..");

// La responsiva v1 conserva el texto que firmaron las clientas de Alma: una
// responsiva firmada vale con el texto de su versión y su PDF debe salir igual.
const EXCEPCIONES = ["src/components/app/responsivaContent.ts"];

const PROHIBIDO = /juriquilla|quer[eé]taro|\bqro\b|alma\s+movement/i;

/** Código de pantallas: .ts/.tsx sin pruebas (las pruebas nombran lo prohibido para negarlo). */
function pantallas(dir: string): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return pantallas(rel);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
  });
}

const ARCHIVOS = [
  ...pantallas("src/pages"),
  ...pantallas("src/components"),
  "public/site.webmanifest",
  "index.html",
].filter((f) => !EXCEPCIONES.includes(f));

const lineasProhibidas = (f: string) =>
  fs.readFileSync(path.join(root, f), "utf8").split("\n")
    .map((l, i) => [l, i + 1] as const)
    .filter(([l]) => PROHIBIDO.test(l))
    .map(([l, n]) => `${f}:${n}: ${l.trim().slice(0, 80)}`);

describe("sin Alma Movement, Juriquilla ni Querétaro en lo que ven los usuarios", () => {
  it("recorre de verdad las pantallas y el manifest", () => {
    expect(ARCHIVOS.length).toBeGreaterThan(100);
    expect(ARCHIVOS).toContain("src/components/auth/AuthShell.tsx");
    expect(ARCHIVOS).toContain("public/site.webmanifest");
  });

  it("la expresión atrapa las formas que se usaban", () => {
    for (const t of ["Juriquilla, Querétaro, MX", "Queretaro", "76230 Juriquilla, Qro.", "Alma Movement", "ALMA MOVEMENT"]) {
      expect(PROHIBIDO.test(t), t).toBe(true);
    }
    // El dominio histórico y palabras como "almacenamiento" no cuentan.
    for (const t of ["almamovement.com.mx", "Almacenamiento local", "HIVE Pilates Studio, Coyoacán, CDMX"]) {
      expect(PROHIBIDO.test(t), t).toBe(false);
    }
  });

  it("ninguna pantalla, ni el manifest ni el HTML, los nombra", () => {
    expect(ARCHIVOS.flatMap(lineasProhibidas)).toEqual([]);
  });

  it("el banco de la transferencia sale de lo capturado en el panel, no escrito en las pantallas", () => {
    // Banorte era el banco de la marca anterior; el de HIVE se captura en
    // Configuración → Pagos y la pantalla de transferencia lo lee de ahí.
    const conBanco = ARCHIVOS.filter((f) => /Banorte/.test(fs.readFileSync(path.join(root, f), "utf8")));
    expect(conBanco).toEqual([]);
  });

  it("el manifest describe a HIVE en Coyoacán", () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, "public/site.webmanifest"), "utf8"));
    expect(m.name).toBe("HIVE Pilates Studio");
    expect(m.short_name).toBe("HIVE");
    expect(m.description).toMatch(/Coyoacán, CDMX/);
  });

  it("la única excepción es la responsiva v1, que sí conserva el texto firmado", () => {
    expect(fs.readFileSync(path.join(root, EXCEPCIONES[0]), "utf8")).toMatch(/Alma Movement/);
  });
});
