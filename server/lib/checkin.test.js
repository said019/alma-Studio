import { test } from "node:test";
import assert from "node:assert/strict";
import { checkinRule } from "./checkin.js";

const base = { bookingStatus: "confirmed", classStatus: "scheduled", classDate: "2026-09-27", startTime: "08:00:00", nowDate: "2026-09-27", nowMinutes: 7 * 60 + 45 };

test("reserva confirmada de hoy dentro de la ventana → ok", () => {
  assert.deepEqual(checkinRule(base), { ok: true });
  assert.deepEqual(checkinRule({ ...base, bookingStatus: "checked_in" }), { ok: true });
  assert.deepEqual(checkinRule({ ...base, nowMinutes: 22 * 60 }), { ok: true }, "después de la clase, mismo día");
});

test("reservas no activas", () => {
  for (const s of ["cancelled", "waitlist", "no_show"]) {
    assert.equal(checkinRule({ ...base, bookingStatus: s }).code, "BOOKING_NOT_ACTIVE");
  }
});

test("clase cancelada", () => {
  assert.equal(checkinRule({ ...base, classStatus: "cancelled" }).code, "CLASS_CANCELLED");
});

test("otro día (futuro o pasado), comparando fechas de la zona del estudio", () => {
  const f = checkinRule({ ...base, classDate: "2026-12-15" });
  assert.equal(f.code, "NOT_TODAY");
  assert.match(f.message, /otro día/);
  assert.equal(checkinRule({ ...base, classDate: "2026-09-26", startTime: "23:30:00", nowDate: "2026-09-27", nowMinutes: 10 }).code, "NOT_TODAY");
});

test("demasiado temprano: abre 90 min antes", () => {
  const r = checkinRule({ ...base, nowMinutes: 6 * 60 + 29 });
  assert.equal(r.code, "TOO_EARLY");
  assert.match(r.message, /06:30/);
  assert.deepEqual(checkinRule({ ...base, nowMinutes: 6 * 60 + 30 }), { ok: true });
});
