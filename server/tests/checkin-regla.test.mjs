// Tarea 4 · auditoría 2026-09-27, bloque 1. Check-in (manual y QR) con una
// sola regla: sólo el día de la clase, dentro de su ventana, con la reserva
// activa. server/lib/checkin.js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgcheckin";
let A, adminId, f;

before(async () => {
  const adminLogin = await login(ADMIN.email, ADMIN.password);
  A = adminLogin.token;
  adminId = adminLogin.user.id;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("check-in manual de una clase de hoy, dentro de la ventana → 200 y queda quién lo hizo", async () => {
  const v = ventanaAhora();
  const cliente = await makeClient(PFX, "hoy");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, cliente.id]);

  const r = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(r.status, 200, `check-in devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);

  const [row] = await sql(`SELECT checked_in_by FROM bookings WHERE id=$1`, [bk.id]);
  assert.equal(row.checked_in_by, adminId, "checked_in_by debe quedar con el id de la admin que lo hizo");
});

test("check-in manual de una clase de otro día → 409 NOT_TODAY", async () => {
  const cliente = await makeClient(PFX, "otrodia");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(80) });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, cliente.id]);

  const r = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(r.status, 409, `check-in devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  assert.equal(r.body.code, "NOT_TODAY");
});

test("check-in manual de una reserva cancelada → 409 BOOKING_NOT_ACTIVE", async () => {
  const v = ventanaAhora();
  const cliente = await makeClient(PFX, "cancel");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, cliente.id]);
  await sql(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bk.id]);

  const r = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(r.status, 409, `check-in devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  assert.equal(r.body.code, "BOOKING_NOT_ACTIVE");
});

test("check-in por QR de una clase que empieza en ~3 h → 409 TOO_EARLY, rechazado", async () => {
  const v = ventanaAhora(180);
  const cliente = await makeClient(PFX, "qr3h");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);

  const r = await api("POST", "/api/admin/checkin/scan", { token: A, body: { code: cliente.id } });
  assert.equal(r.status, 409, `scan devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  assert.equal(r.body.status, "rejected");
  assert.equal(r.body.code, "TOO_EARLY");
});

test("check-in manual dos veces sobre la misma reserva no duplica los puntos", async () => {
  const v = ventanaAhora();
  const cliente = await makeClient(PFX, "puntos");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, cliente.id]);

  const r1 = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(r1.status, 200, `primer check-in devolvió ${r1.status}`);
  const r2 = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(r2.status, 200, `segundo check-in devolvió ${r2.status}`);

  const puntos = await sql(
    `SELECT count(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND description='Clase asistida'`,
    [cliente.id],
  );
  assert.equal(puntos[0].n, 1, "dos check-in de la misma reserva deben dejar una sola fila de puntos");
});
