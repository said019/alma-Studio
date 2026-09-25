import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone, read } from "./zoneGuard";

const root = path.resolve(__dirname, "..", "..");
const listar = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return listar(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

/** Zona de la app (spec 2026-09-25 §9): todo lo que se ve en oscuro. */
export const ZONA = [
  ...listar("src/pages/client"), ...listar("src/pages/auth"), ...listar("src/components/app"), ...listar("src/components/auth"),
  "src/pages/NotFound.tsx", "src/components/brand/HexPedestal.tsx", "src/components/account/ChangePassword.tsx", "src/components/ui/toaster.tsx",
].sort();

describeZone(ZONA, {
  // Botones oficiales de Apple/Google Wallet: sus colores son de la marca (lista de permitidos en guards.test.ts).
  permitir: /#(?:000000|FFFFFF|4285F4|EA4335|FBBC05|34A853)/i,
});

describe("textos de la zona", () => {
  it("no quedan textos Alma, salvo los que decide el sub-proyecto A", () => {
    const PERMITIDOS = [/Responsiva y consentimiento informado firmado con Alma Movement/, /alma-pass\.pkpass/, /paleta Alma/];
    const malos = ZONA.flatMap((f) =>
      read(f).split("\n").map((l, i) => [l, i + 1] as const)
        .filter(([l]) => /\bAlma\b/.test(l) && !PERMITIDOS.some((re) => re.test(l)))
        .map(([, n]) => `${f}:${n}`));
    expect(malos).toEqual([]);
  });
});
