import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "NotFound.tsx"), "utf8");

describeZone(["src/pages/NotFound.tsx"]);

describe("404 en oscuro (spec 2026-09-25 §6.11)", () => {
  it("el símbolo HIVE va en text-accent en vez del wordmark Alma Movement", () => {
    expect(src).toMatch(/<BrandLogo\b/);
    expect(src).toMatch(/text-accent\b/);
    expect(src).not.toMatch(/Alma Movement/);
  });
  it("el numeral 404 va en font-display text-ink", () => {
    expect(src).toMatch(/font-display[^"]*text-ink\b|text-ink\b[^"]*font-display/);
  });
  it("trae el hexágono grande", () => {
    expect(src).toMatch(/<HexPedestal size="lg"\s*\/>/);
  });
  it("el texto de apoyo va en text-ink-muted, no en text-accent-strong", () => {
    const apoyo = src.match(/<p className="[^"]*">\s*La dirección que buscas no existe/)?.[0] ?? "";
    expect(apoyo).toMatch(/text-ink-muted\b/);
    expect(apoyo).not.toMatch(/text-accent-strong\b/);
  });
  it("el botón de volver es PrimaryButton", () => {
    expect(src).toMatch(/<PrimaryButton\b[^>]*to="\/"/);
  });
  it("dice HIVE Pilates Studio y no el estudio anterior", () => {
    expect(src).toContain("HIVE Pilates Studio");
    expect(src).not.toMatch(/Estudio de Pilates · Juriquilla/);
  });
  it("sigue forzando el tema oscuro por ruta (Tarea 2)", () => {
    expect(src).toMatch(/useTheme\("dark",\s*(?:location\.pathname|pathname)\)/);
  });
});
