import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, "Index.tsx"), "utf8");

describe("Alma landing — copy fiel al estudio real", () => {
  it("incluye el copy correcto del estudio de Pilates", () => {
    expect(indexSource).toMatch(/Evoluciona[\s\S]*en cada clase\./);
    expect(indexSource).toContain("Cada clase trabaja técnica, alineación y control en grupos pequeños.");
    expect(indexSource).toContain("Cupos reducidos: 4 lugares en Reformer y Tower, 8 en Studio.");
    // Ubicación real (Juriquilla, Querétaro)
    expect(indexSource).toContain("Plaza Arce");
    expect(indexSource).toContain("Lun a Sáb");
  });

  it("no contiene rastros del estudio anterior (Kala/Karla/barre)", () => {
    expect(indexSource).not.toContain("Karla");
    expect(indexSource).not.toContain("Playlists y rutinas nuevas cada día.");
  });

  it("no contiene testimonios inventados", () => {
    expect(indexSource).not.toContain("Ana García");
    expect(indexSource).not.toContain("Laura Martínez");
    expect(indexSource).not.toContain("Sofía Hernández");
    expect(indexSource).not.toContain("Alumna desde 2025");
  });

  it("no ofrece funciones inexistentes (videos / gamificación / promos)", () => {
    expect(indexSource).not.toContain("Clases grabadas");
    expect(indexSource).not.toContain("biblioteca de videos");
    expect(indexSource).not.toContain("ONLINE_PLANS");
    expect(indexSource).not.toContain("anillos");
    expect(indexSource).not.toContain("Compra directa desde la app");
  });

  it("no contiene datos de contacto de otra ciudad (San Luis Potosí)", () => {
    expect(indexSource).not.toContain("444 307");
    expect(indexSource).not.toContain("Nicolas Zapata");
    expect(indexSource).not.toContain("Plaza San Martin");
  });
});
