import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const indexSource = readFileSync(resolve(here, "Index.tsx"), "utf8");

describe("Alma landing client copy", () => {
  it("includes the client-requested landing copy", () => {
    expect(indexSource).toContain("Fuerza");
    expect(indexSource).toContain("Equilibrio");
    expect(indexSource).toContain("Flexibilidad");
    expect(indexSource).toMatch(/Evoluciona[\s\S]*en cada clase\./);
    expect(indexSource).toContain("Playlists y rutinas nuevas cada día.");
    expect(indexSource).toContain("Cupos reducidos: 4 lugares en Reformer y Tower, 8 en Studio.");
    expect(indexSource).toMatch(/Aquí crecemos[\s\S]*juntas\./);
    expect(indexSource).toContain("El movimiento es para todas, sin condiciones.");
  });

  it("removes copy the client asked to take out", () => {
    expect(indexSource).not.toContain("No configures tu meta");
    expect(indexSource).not.toContain("gánala.");
    expect(indexSource).not.toContain("Karla decide la recompensa por plan");
  });

  it("ya no ofrece clases grabadas / planes online (eliminado en Fase 1)", () => {
    // Fase 1 quitó la biblioteca de video y los planes online del catálogo.
    expect(indexSource).not.toContain("Clases grabadas");
    expect(indexSource).not.toContain("biblioteca de videos");
    expect(indexSource).not.toContain("ONLINE_PLANS");
  });
});
