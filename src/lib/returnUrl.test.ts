import { describe, it, expect } from "vitest";
import { safeReturnUrl, withReturnUrl } from "./returnUrl";

describe("returnUrl seguro", () => {
  it("acepta rutas internas de la app", () => {
    expect(safeReturnUrl("/app")).toBe("/app");
    expect(safeReturnUrl("/app/classes/abc-123")).toBe("/app/classes/abc-123");
    expect(safeReturnUrl("/app/checkout?plan=1")).toBe("/app/checkout?plan=1");
  });
  it("ignora externas, raras o fuera de la app", () => {
    for (const bad of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "/admin", "/application", "app/classes", "/app//evil.com"]) {
      expect(safeReturnUrl(bad as string | null)).toBeNull();
    }
  });
  it("agrega el regreso a una ruta", () => {
    expect(withReturnUrl("/auth/onboarding", "/app/classes/1")).toBe("/auth/onboarding?returnUrl=%2Fapp%2Fclasses%2F1");
    expect(withReturnUrl("/auth/onboarding", null)).toBe("/auth/onboarding");
  });
});

import fs from "fs";
import path from "path";
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", f), "utf8");

describe("registro, bienvenida y login respetan returnUrl", () => {
  it("Register lee returnUrl y lo pasa a la bienvenida o navega a él", () => {
    const src = read("src/pages/auth/Register.tsx");
    expect(src).toContain("safeReturnUrl(params.get(\"returnUrl\"))");
    expect(src).toMatch(/withReturnUrl\("\/auth\/onboarding", returnUrl\)/);
  });
  it("Onboarding navega a returnUrl al terminar", () => {
    expect(read("src/pages/auth/Onboarding.tsx")).toMatch(/navigate\(returnUrl \?\? "\/app"\)/);
  });
  it("Login conserva returnUrl en la liga de crear cuenta", () => {
    expect(read("src/pages/auth/Login.tsx")).toMatch(/withReturnUrl\("\/auth\/register", safeReturnUrl\(params\.get\("returnUrl"\)\)\)/);
  });
});
