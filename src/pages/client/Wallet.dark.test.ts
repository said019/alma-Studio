import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Wallet.tsx"), "utf8");

describeZone(["src/pages/client/Wallet.tsx", "src/pages/client/WalletHistory.tsx", "src/pages/client/WalletRewards.tsx"]);

describe("QR HIVE en una pantalla dedicada", () => {
  it("usa fondo de la app y una tarjeta clara con identidad HIVE", () => {
    expect(src).toMatch(/<main[^>]*bg-canvas/);
    expect(src).toMatch(/<article[^>]*bg-inverse/);
    expect(src).toMatch(/<BrandLogo[^>]*variant="mark"/);
    expect(src).not.toMatch(/<AppShell\b|<PageHeader\b/);
  });

  it("el QR tiene contraste fijo de lectura y se adapta al ancho disponible", () => {
    expect(src).toMatch(/fgColor=\{DARK\.onInverse\}/);
    expect(src).toMatch(/bgColor=\{DARK\.inverse\}/);
    expect(src).toContain("size={272}");
    expect(src).toContain("h-auto w-full max-w-[272px]");
    expect(src).toContain('title="Tu código QR de check-in"');
  });

  it("no descarga pases ni solicita integraciones externas de Wallet", () => {
    expect(src).not.toMatch(/\/wallet\/(?:google|apple)|google-wallet-save|\.pkpass|saveUrl/);
    expect(src).not.toMatch(/Apple Wallet|Google Wallet|walletBadge|GoogleLogo|AppleLogo/);
    expect(src).not.toContain("FEATURES.walletPassCard");
  });

  it("reserva los safe areas y usa altura dinámica para móviles", () => {
    expect(src).toContain("min-h-[100dvh]");
    expect(src).toContain("env(safe-area-inset-bottom)");
    expect(src).toContain("env(safe-area-inset-top)");
    expect(src).not.toContain("h-screen");
  });
});
