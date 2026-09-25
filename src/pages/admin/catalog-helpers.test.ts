import { describe, it, expect } from "vitest";
import { expiresSoon } from "./memberships/membership-helpers";
import { usageInfo } from "./discount-codes/discount-helpers";

describe("expiresSoon", () => {
  const now = new Date(2026, 8, 25, 10, 0);
  it("vence en 7 días o menos, sin haber vencido", () => {
    expect(expiresSoon("2026-09-28", now)).toBe(true);
    expect(expiresSoon("2026-09-25", now)).toBe(true);
    expect(expiresSoon("2026-10-02", now)).toBe(true);
    expect(expiresSoon("2026-10-03", now)).toBe(false);
    expect(expiresSoon("2026-09-24", now)).toBe(false);
    expect(expiresSoon(null, now)).toBe(false);
    expect(expiresSoon("no-es-fecha", now)).toBe(false);
  });
});

describe("usageInfo", () => {
  it("con tope: cifra, porcentaje y agotado", () => {
    expect(usageInfo(7, 50)).toEqual({ label: "7/50", pct: 14, exhausted: false });
    expect(usageInfo(50, 50)).toEqual({ label: "50/50 · agotado", pct: 100, exhausted: true });
  });
  it("sin tope: infinito", () => {
    expect(usageInfo(23, null)).toEqual({ label: "23/∞", pct: null, exhausted: false });
  });
});
