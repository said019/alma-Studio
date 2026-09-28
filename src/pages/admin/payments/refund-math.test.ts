import { describe, it, expect } from "vitest";
import { refundRemaining, suggestedClassesToRemove, REFUND_METHOD_LABEL } from "./refund-math";

describe("reembolsos · cálculos del panel", () => {
  it("lo que queda por devolver", () => {
    expect(refundRemaining(1700, 0)).toBe(1700);
    expect(refundRemaining(1700, 500.5)).toBe(1199.5);
    expect(refundRemaining(1700, null)).toBe(1700);
  });
  it("clases sugeridas: proporcionales a lo devuelto, con tope en las que le quedan", () => {
    expect(suggestedClassesToRemove({ amount: 425, charged: 1700, classLimit: 8, classesRemaining: 6 })).toBe(2);
    expect(suggestedClassesToRemove({ amount: 1600, charged: 1700, classLimit: 8, classesRemaining: 5 })).toBe(5);
    expect(suggestedClassesToRemove({ amount: 100, charged: 1700, classLimit: null, classesRemaining: null })).toBe(0);
    expect(suggestedClassesToRemove({ amount: Number.NaN, charged: 1700, classLimit: 8, classesRemaining: 6 })).toBe(0);
  });
  it("cómo se devolvió", () => {
    expect(REFUND_METHOD_LABEL).toEqual({ cash: "Efectivo", transfer: "Transferencia", card: "Terminal" });
  });
});
