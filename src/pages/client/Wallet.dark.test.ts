import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Wallet.tsx"), "utf8");

describeZone(["src/pages/client/Wallet.tsx", "src/pages/client/WalletHistory.tsx", "src/pages/client/WalletRewards.tsx"], {
  // Botones oficiales de Apple/Google Wallet: sus colores son de la marca (lista de permitidos en guards.test.ts).
  permitir: /#(?:000000|FFFFFF|4285F4|EA4335|FBBC05|34A853)/i,
});

describe("Wallet en oscuro (spec 2026-09-25 §6.5)", () => {
  it("el pase lleva el lockup HIVE y el resplandor", () => {
    expect(src).toMatch(/<BrandLogo[^>]*variant="lockup"/);
    expect(src).toContain("bg-pass-glow");
    expect(src).not.toMatch(/Alma <span/);
  });
  it("el QR va sobre baldosa clara con colores fijos de la tabla oscura", () => {
    expect(src).toContain("bg-inverse");
    expect(src).toMatch(/fgColor=\{DARK\.onInverse\}/);
    expect(src).toMatch(/bgColor=\{DARK\.inverse\}/);
  });
  it("el archivo del pase conserva su nombre (lo cambia el sub-proyecto A)", () => {
    expect(src).toContain('a.download = "alma-pass.pkpass"');
  });
});
