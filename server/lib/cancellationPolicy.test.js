import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCancellationSettings, cancellationLimitProblem, cancellationQuota, clientCancelDecision, publicBookingPolicy,
} from "./cancellationPolicy.js";

test("la cuota arranca en 2 y 0 es sin límite", () => {
  assert.deepEqual(normalizeCancellationSettings(null), { max_cancellations: 2 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 0 }), { max_cancellations: 0 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 5 }), { max_cancellations: 5 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: "5" }), { max_cancellations: 2 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 99 }), { max_cancellations: 2 });
});

test("cuota válida: entero de 0 a 20", () => {
  for (const ok of [0, 1, 20, "3"]) assert.equal(cancellationLimitProblem(ok), null, String(ok));
  for (const bad of [-1, 21, 2.5, "x", "", null, undefined]) {
    assert.equal(cancellationLimitProblem(bad), "Escribe un número entero de 0 a 20.", String(bad));
  }
});

test("te quedan N", () => {
  assert.deepEqual(cancellationQuota({ used: 1, limit: 2 }), { limited: true, used: 1, limit: 2, left: 1, exhausted: false });
  assert.deepEqual(cancellationQuota({ used: 2, limit: 2 }), { limited: true, used: 2, limit: 2, left: 0, exhausted: true });
  assert.deepEqual(cancellationQuota({ used: 7, limit: 0 }), { limited: false, used: 7, limit: 0, left: null, exhausted: false });
});

test("decisión al cancelar: fila, confirmada, cuota agotada, asistencia y ya cancelada", () => {
  assert.deepEqual(clientCancelDecision({ bookingStatus: "waitlist", used: 9, limit: 2 }),
    { ok: true, leavingWaitlist: true, countsTowardQuota: false, freesSeat: false });
  assert.deepEqual(clientCancelDecision({ bookingStatus: "confirmed", used: 1, limit: 2 }),
    { ok: true, leavingWaitlist: false, countsTowardQuota: true, freesSeat: true });
  const agotada = clientCancelDecision({ bookingStatus: "confirmed", used: 2, limit: 2 });
  assert.equal(agotada.ok, false);
  assert.equal(agotada.status, 403);
  assert.equal(agotada.code, "CANCELLATION_LIMIT");
  assert.equal(agotada.message, "Ya usaste tus 2 cancelaciones de este paquete. Si necesitas cancelar, habla con recepción.");
  assert.match(clientCancelDecision({ bookingStatus: "confirmed", used: 1, limit: 1 }).message, /tus 1 cancelación de/);
  assert.equal(clientCancelDecision({ bookingStatus: "confirmed", used: 50, limit: 0 }).ok, true, "0 = sin límite");
  for (const s of ["checked_in", "no_show"]) {
    const r = clientCancelDecision({ bookingStatus: s, used: 0, limit: 2 });
    assert.equal(r.status, 409);
    assert.equal(r.code, "ATTENDANCE_RECORDED");
  }
  const ya = clientCancelDecision({ bookingStatus: "cancelled" });
  assert.equal(ya.status, 400);
  assert.equal(ya.message, "Esta reserva ya fue cancelada");
});

test("política pública: cuota, ventana real, cierres y faltas", () => {
  assert.deepEqual(publicBookingPolicy({ settings: null, loyalty: {}, bookingLeadHours: 2 }), {
    cancellationLimit: 2, cancelWindowHours: 12, bookingLeadHours: 2, waitlistCutoffHours: 2, faltasEnabled: true, faltasThreshold: 5,
  });
  const p = publicBookingPolicy({
    settings: { max_cancellations: 0 },
    loyalty: { faltas_cancel_window_hours: 24, faltas_enabled: false, faltas_threshold: 3 },
    bookingLeadHours: 2,
  });
  assert.equal(p.cancellationLimit, 0);
  assert.equal(p.cancelWindowHours, 24);
  assert.equal(p.faltasEnabled, false);
  assert.equal(p.faltasThreshold, 3);
  assert.equal(publicBookingPolicy({ loyalty: { faltas_cancel_window_hours: -5 } }).cancelWindowHours, 12);
});
