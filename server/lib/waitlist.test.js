import { test } from "node:test";
import assert from "node:assert/strict";
import { promotionWindowOpen, freeSeats, queueBlocksNewBooking, firstEligible, sweepMinutes } from "./waitlist.js";

const AHORA = Date.parse("2026-10-01T10:00:00Z");

test("la subida aplica hasta 2 h antes del inicio (justo 2 h todavía sí)", () => {
  assert.equal(promotionWindowOpen(new Date("2026-10-01T12:00:00Z"), AHORA, 2), true);
  assert.equal(promotionWindowOpen("2026-10-01T15:00:00Z", AHORA, 2), true);
  assert.equal(promotionWindowOpen("2026-10-01T11:59:00Z", AHORA, 2), false);
  assert.equal(promotionWindowOpen("2026-10-01T09:00:00Z", AHORA, 2), false, "ya empezó");
  assert.equal(promotionWindowOpen("basura", AHORA, 2), false);
  assert.equal(promotionWindowOpen(null, AHORA, 2), false);
});

test("lugares libres", () => {
  assert.equal(freeSeats(5, 3), 2);
  assert.equal(freeSeats(5, 7), 0);
  assert.equal(freeSeats(null, 1), 0);
});

test("con fila, la reserva nueva entra a la fila sólo mientras aplique la subida", () => {
  const lejos = "2026-10-02T10:00:00Z";
  assert.equal(queueBlocksNewBooking({ waiting: 1, startsAt: lejos, now: AHORA, cutoffHours: 2 }), true);
  assert.equal(queueBlocksNewBooking({ waiting: 0, startsAt: lejos, now: AHORA, cutoffHours: 2 }), false);
  assert.equal(queueBlocksNewBooking({ waiting: 3, startsAt: "2026-10-01T11:00:00Z", now: AHORA, cutoffHours: 2 }), false,
    "a menos de 2 h el lugar queda libre");
});

test("firstEligible: sube la primera que cumple; las de adelante que no cumplen se saltan", () => {
  const a = { bookingId: "a", position: 1, reason: "sin_clases" };
  const b = { bookingId: "b", position: 2, reason: "tope_semanal" };
  const c = { bookingId: "c", position: 3, reason: null };
  assert.deepEqual(firstEligible([a, b, c]), { promote: c, skipped: [a, b] });
  assert.deepEqual(firstEligible([c, a]), { promote: c, skipped: [] });
  assert.deepEqual(firstEligible([a]), { promote: null, skipped: [a] });
  assert.deepEqual(firstEligible([]), { promote: null, skipped: [] });
});

test("el barrido de respaldo viene apagado: sin la variable, en 0 o con basura no se programa", () => {
  assert.equal(sweepMinutes(undefined), 0);
  assert.equal(sweepMinutes(null), 0);
  assert.equal(sweepMinutes(""), 0);
  assert.equal(sweepMinutes("0"), 0);
  assert.equal(sweepMinutes("-3"), 0);
  assert.equal(sweepMinutes("cinco"), 0);
  assert.equal(sweepMinutes("5"), 5);
  assert.equal(sweepMinutes(" 10 "), 10);
});
