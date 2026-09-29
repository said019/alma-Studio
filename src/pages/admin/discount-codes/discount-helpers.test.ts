import { describe, expect, it } from "vitest";
import { couponStatus } from "./discount-helpers";

describe("estado operativo de cupones", () => {
  const coupon = { isActive: true, usesCount: 0, maxUses: null };
  const now = Date.parse("2026-09-29T18:00:00Z");
  it("distingue activos sin límite y pausados", () => {
    expect(couponStatus(coupon, now)).toBe("Activo");
    expect(couponStatus({ ...coupon, isActive: false }, now)).toBe("Inactivo");
  });
  it("considera vencido el cupón al llegar a su fecha límite", () => {
    expect(couponStatus({ ...coupon, expiresAt: "2026-09-29T18:00:00Z" }, now)).toBe("Vencido");
    expect(couponStatus({ ...coupon, expiresAt: "2026-09-30T18:00:00Z" }, now)).toBe("Activo");
  });
  it("distingue el límite agotado del cupo disponible", () => {
    expect(couponStatus({ ...coupon, maxUses: 10, usesCount: 10 }, now)).toBe("Agotado");
    expect(couponStatus({ ...coupon, maxUses: 10, usesCount: 9 }, now)).toBe("Activo");
  });
});
