import { test } from "node:test";
import assert from "node:assert/strict";
import {
  promotionWindowOpen, freeSeats, queueBlocksNewBooking, firstEligible, sweepMinutes,
  waitlistJoinRule, bookingNotice, WAITLIST_JOINED_TEMPLATE_KEY,
} from "./waitlist.js";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "./notificationTemplates.js";

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

test("entrar a la fila explica la subida automática, no promete sólo un aviso", () => {
  assert.equal(
    waitlistJoinRule(2),
    "Si se libera un lugar hasta 2 horas antes de la clase, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.",
  );
  assert.equal(waitlistJoinRule(), waitlistJoinRule(2));
  assert.match(waitlistJoinRule(1), /hasta 1 hora antes/);
});

test("una reserva que entra a la fila no manda la plantilla de reserva confirmada", () => {
  const base = { firstName: "Ana", className: "Reformer", date: "30/9/2026", time: "07:00", cutoffHours: 2 };
  const fila = bookingNotice({ ...base, status: "waitlist" });
  assert.notEqual(fila.templateKey, "booking_confirmed");
  assert.equal(fila.templateKey, WAITLIST_JOINED_TEMPLATE_KEY);
  assert.equal(Object.hasOwn(DEFAULT_NOTIFICATION_TEMPLATES, WAITLIST_JOINED_TEMPLATE_KEY), false,
    "sin plantilla por defecto: sale el texto de respaldo");
  assert.equal(fila.fallbackMessage, `Hola Ana, quedaste en lista de espera para Reformer (30/9/2026 07:00). ${waitlistJoinRule(2)}`);
  assert.doesNotMatch(fila.fallbackMessage, /confirmada/);

  const ok = bookingNotice({ ...base, status: "confirmed" });
  assert.equal(ok.templateKey, "booking_confirmed");
  assert.equal(ok.fallbackMessage, "Hola Ana, tu reserva para Reformer (30/9/2026 07:00) está confirmada.");

  for (const otro of ["cancelled", "checked_in", undefined]) {
    assert.equal(bookingNotice({ ...base, status: otro }), null, `${otro}: sin aviso`);
  }
  assert.match(bookingNotice({ status: "waitlist" }).fallbackMessage, /^Hola Alumna, quedaste en lista de espera para tu clase\. /,
    "sin nombre ni clase no sale vacío");
});
