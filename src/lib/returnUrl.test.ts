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
  it("normaliza la ruta: rechaza las que escapan de la app con .. o %2e%2e", () => {
    for (const bad of ["/app/../admin", "/app/%2e%2e/admin", "/app/%2E%2E/admin", "/app/.%2e/admin", "/app/..%2fadmin/../../admin", "/app/x/../../admin/bookings"]) {
      expect(safeReturnUrl(bad)).toBeNull();
    }
    expect(safeReturnUrl("/app/classes/../checkout")).toBe("/app/checkout");
  });
  it("el prefijo es exacto o seguido de /, y conserva búsqueda y ancla", () => {
    expect(safeReturnUrl("/apple")).toBeNull();
    expect(safeReturnUrl("/app?x=1#y")).toBe("/app?x=1#y");
    expect(safeReturnUrl("/app/classes/1?from=landing#top")).toBe("/app/classes/1?from=landing#top");
  });
  it("/admin sólo se acepta con los prefijos del login", () => {
    expect(safeReturnUrl("/admin/bookings")).toBeNull();
    expect(safeReturnUrl("/admin/bookings", ["/app", "/admin", "/staff"])).toBe("/admin/bookings");
    expect(safeReturnUrl("/app/classes/1", ["/app", "/admin", "/staff"])).toBe("/app/classes/1");
    for (const bad of ["/administrador", "/admin//evil.com", "https://evil.com/admin", "//evil.com/admin", "/auth/login"]) {
      expect(safeReturnUrl(bad, ["/app", "/admin", "/staff"])).toBeNull();
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
  it("Login, tras entrar, sólo regresa a /app, /admin o /staff (staff con sesión vencida vuelve al panel)", () => {
    const src = read("src/pages/auth/Login.tsx");
    const seguro = 'safeReturnUrl(params.get("returnUrl"), ["/app", "/admin", "/staff"])';
    expect(src.split(seguro).length - 1).toBe(2);
    expect(src).not.toMatch(/=\s*params\.get\("returnUrl"\)/);
  });
  it("Register conserva returnUrl en la liga de iniciar sesión", () => {
    expect(read("src/pages/auth/Register.tsx")).toMatch(/<AuthSecondaryLink to=\{withReturnUrl\("\/auth\/login", returnUrl\)\}>Iniciar sesión<\/AuthSecondaryLink>/);
  });
});
