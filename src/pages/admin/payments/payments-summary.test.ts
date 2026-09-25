import { describe, it, expect } from "vitest";
import { summarizePayments } from "./payments-summary";

const now = new Date(2026, 8, 25, 10, 40); // viernes
const p = (d: string, method: string, amount: number | string) => ({ createdAt: d, method, total_amount: amount });

describe("summarizePayments", () => {
  it("separa semana, mes y método; ignora otros meses", () => {
    const s = summarizePayments([
      p("2026-09-25T10:18:00", "transfer", 1450),
      p("2026-09-22T09:00:00", "cash", "780"),       // lunes: esta semana
      p("2026-09-15T12:00:00", "card", 2680),        // este mes, otra semana
      p("2026-08-30T12:00:00", "cash", 1000),        // otro mes
    ], now);
    expect(s.week).toEqual({ amount: 2230, count: 2 });
    expect(s.month).toEqual({ amount: 4910, count: 3 });
    expect(s.byMethod).toEqual({ transfer: 1450, cash: 780, card: 2680 });
  });
  it("sin fecha o sin monto no truena", () => {
    const s = summarizePayments([{ method: "cash" }, { createdAt: "x", total_amount: "abc" }], now);
    expect(s.month).toEqual({ amount: 0, count: 0 });
  });
});
