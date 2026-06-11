import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "BookClasses.tsx"), "utf8");

describe("BookClasses redesign (day-strip + lista editorial)", () => {
  it("la semana inicia en lunes", () => {
    expect(source).toContain("weekStartsOn: 1");
    expect(source).not.toContain("weekStartsOn: 0");
    expect(source).toMatch(/DAY_LABELS = \["lun", "mar", "mié", "jue", "vie", "sáb", "dom"\]/);
  });

  it("tiene day-strip sticky accesible anclado al día elegido", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("aria-selected");
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("sticky top-16");
    expect(source).toContain("scrollTo");
  });

  it("lista editorial: cupos legibles y fila completa que navega a confirmar", () => {
    expect(source).toContain("lugares");
    expect(source).toContain("Lista de espera");
    expect(source).toContain("/app/classes/");
    expect(source).toContain("nums");
    expect(source).toContain("font-display");
    expect(source).toContain("CAT_LABEL");
  });

  it("estados honestos: error con reintento, skeleton y descanso por día", () => {
    expect(source).toContain("ErrorState");
    expect(source).toContain("onRetry");
    expect(source).toContain("SkeletonRow");
    expect(source).toContain("EmptyState");
    expect(source).toContain("Este día el estudio descansa.");
  });

  it("switcher de semana como pills accesibles", () => {
    expect(source).toContain("SegmentedTabs");
    expect(source).toContain("Anterior");
    expect(source).toContain("Siguiente");
  });

  it("contexto de membresía inline con link a membresía", () => {
    expect(source).toContain("/app/profile/membership");
    expect(source).toContain("vence");
    expect(source).toContain("Te quedan");
  });

  it("no regresan los anti-patterns", () => {
    expect(source).not.toContain("Lista móvil");
    expect(source).not.toContain("radial-gradient");
    expect(source).not.toContain("linear-gradient");
    expect(source).not.toContain("Sparkles");
    expect(source).not.toContain("backdrop-blur");
    expect(source).not.toContain("CAT_TINT");
    expect(source).not.toContain("ALMA.coral");
    expect(source).not.toContain("window.confirm");
    expect(source).not.toContain("font-bebas");
    expect(source).not.toContain("—");
    // Un fallo de red ya no se disfraza de "Sin clases".
    expect(source).not.toContain("Sin clases");
  });
});
