import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "Index.tsx"), "utf8");

describe("Landing catálogo Alma", () => {
  it("ya no contiene precios viejos de barre", () => {
    expect(src).not.toContain("Clase muestra Barre");
    expect(src).not.toMatch(/price:\s*230/);
    expect(src).not.toMatch(/price:\s*585/);
  });
  it("usa effectivePrice del backend", () => {
    expect(src).toContain("effectivePrice");
  });
  it("no renderiza la sección de planes online ni los anillos de marketing", () => {
    expect(src).not.toContain("<ProgresoSection");
    expect(src).not.toContain("ONLINE_PLANS.map");
  });
});
