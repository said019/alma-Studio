import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Dashboard.tsx"), "utf8");

describeZone(["src/pages/client/Dashboard.tsx"]);

describe("Inicio en oscuro (spec 2026-09-25 §6.1)", () => {
  it("encabezado Tu semana / en HIVE.", () => {
    expect(src).toMatch(/title="Tu semana"/);
    expect(src).toMatch(/titleAccent="en HIVE\."/);
    expect(src).not.toMatch(/\bAlma\b/);
  });
  it("la próxima clase va en ActionRow y las clases por usar en cifra terracota", () => {
    expect(src).toContain("<ActionRow");
    expect(src).toMatch(/font-display[^"]*text-accent\b|text-accent\b[^"]*font-display/);
  });
  it("los anillos siguen al tema (currentColor), sin colores en línea", () => {
    expect(src).toMatch(/stroke="currentColor"/);
  });
});
