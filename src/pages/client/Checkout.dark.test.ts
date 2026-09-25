import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Checkout.tsx"), "utf8");

describeZone(["src/pages/client/Checkout.tsx", "src/components/app/UploadDropzone.tsx"]);

describe("Checkout en oscuro (spec 2026-09-25 §6.6)", () => {
  it("el plan elegido lleva borde terracota y fondo terracota suave", () => {
    expect(src).toMatch(/border-accent\b/);
    expect(src).toContain("bg-accent-soft");
  });
  it("los precios van en Unbounded con cifras tabulares", () => {
    expect(src).toMatch(/font-display[^"]*nums|nums[^"]*font-display/);
  });
});
