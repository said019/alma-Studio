import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");

const FILES = [
  "src/pages/client/Profile.tsx",
  "src/pages/client/ProfileEdit.tsx",
  "src/pages/client/ProfilePreferences.tsx",
  "src/pages/client/ProfileMembership.tsx",
  "src/pages/client/ProfileSecurity.tsx",
  "src/pages/client/OrderDetail.tsx",
];

describeZone(FILES);

describe("Perfil en oscuro (spec 2026-09-25 §6.8)", () => {
  const profileSrc = read("Profile.tsx");

  it('el pie dice "HIVE Pilates Studio · año" y no "Versión Alma"', () => {
    expect(profileSrc).toMatch(/HIVE Pilates Studio\s*·\s*\{new Date\(\)\.getFullYear\(\)\}/);
    expect(profileSrc).not.toMatch(/Versión Alma/);
  });

  it("el avatar grande es una baldosa clara (bg-inverse text-inverse-foreground)", () => {
    const avatarBlock = profileSrc.slice(
      profileSrc.indexOf("h-20 w-20"),
      profileSrc.indexOf("h-20 w-20") + 400,
    );
    expect(avatarBlock).toContain("bg-inverse");
    expect(avatarBlock).toContain("text-inverse-foreground");
  });

  it('"Cerrar sesión" sigue siendo destructivo', () => {
    const rows = profileSrc.split(/(?=<ListRow)/).filter((b) => b.startsWith("<ListRow"));
    const logoutRow = rows.find((b) => /Cerrar sesión/.test(b));
    expect(logoutRow).toBeDefined();
    expect(logoutRow).toMatch(/\bdestructive\b/);
  });
});

describe("Pantallas ocultas en oscuro (sin diseño propio, spec §6.8)", () => {
  it("OrderDetail conserva intacto el flujo de subir comprobante (UploadDropzone)", () => {
    const src = read("OrderDetail.tsx");
    expect(src).toContain("<UploadDropzone");
    expect(src).toContain("/orders/${orderId}/proof");
    expect(src).toContain('api.post(`/orders/${orderId}/proof`');
  });

  it("ProfileMembership conserva el cálculo de días y clases restantes", () => {
    const src = read("ProfileMembership.tsx");
    expect(src).toContain("differenceInCalendarDays");
    expect(src).toContain("classes_remaining");
  });

  it("ProfileSecurity sigue usando el ChangePassword compartido", () => {
    const src = read("ProfileSecurity.tsx");
    expect(src).toContain("<ChangePassword");
  });
});
