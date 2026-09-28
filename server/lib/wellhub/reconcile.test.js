import { test } from "node:test";
import assert from "node:assert/strict";
import { wellhubMonthRange, summarizeWellhubMonth } from "./reconcile.js";

test("mes AAAA-MM; sin mes, el de hoy en el estudio; diciembre cruza de año", () => {
  assert.deepEqual(wellhubMonthRange("2026-09", "2026-10-02"), { ok: true, month: "2026-09", from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(wellhubMonthRange(undefined, "2026-10-02"), { ok: true, month: "2026-10", from: "2026-10-01", to: "2026-11-01" });
  assert.deepEqual(wellhubMonthRange("2026-12", "2026-12-31"), { ok: true, month: "2026-12", from: "2026-12-01", to: "2027-01-01" });
  for (const bad of ["2026-13", "2026-9", "09-2026", "basura"]) {
    assert.deepEqual(wellhubMonthRange(bad, "2026-10-02"), { ok: false, message: "Mes inválido (usa AAAA-MM)." }, bad);
  }
});

test("resumen del mes", () => {
  const s = summarizeWellhubMonth(
    [{ status: "confirmed" }, { status: "confirmed" }, { status: "pending" }, { status: "failed" }],
    { booked: 5, attended: 3, no_show: 1 },
    2,
  );
  assert.deepEqual(s, { confirmed: 2, pending: 1, failed: 1, booked: 5, attended: 3, noShow: 1, unmatched: 2 });
  assert.deepEqual(summarizeWellhubMonth(), { confirmed: 0, pending: 0, failed: 0, booked: 0, attended: 0, noShow: 0, unmatched: 0 });
});
