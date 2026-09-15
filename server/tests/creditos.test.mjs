// P0-1 · Un crédito por clase. Auditoría 2026-09-08.
// Invariante: reservar debita 1; el check-in NO vuelve a debitar.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, credits, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, bookingId, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgcred";
let A, f, cliente;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  cliente = await makeClient(PFX, "c1");
  await giveMembership(A, cliente.id, f.plan.id, 8);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("P0-1 reservar debita exactamente 1 crédito", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const antes = await credits(cliente.id);
  const r = await api("POST", "/api/bookings", { token: cliente.token, body: { classId: id } });
  assert.equal(r.status, 201, `reserva devolvió ${r.status}`);
  assert.equal(await credits(cliente.id), antes - 1, "reservar debe descontar exactamente 1");
});

test("P0-1 el check-in NO vuelve a debitar (el crédito ya se apartó al reservar)", async () => {
  const v = ventanaAhora();
  const id = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId: id } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 200)}`);
  const trasReservar = await credits(cliente.id);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [id, cliente.id]);
  const ci = await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(ci.status, 200, `check-in devolvió ${ci.status}`);
  assert.equal(await credits(cliente.id), trasReservar,
    "el check-in NO debe descontar: el crédito ya se descontó al reservar");
});

test("P0-1 una clase completa (reservar + asistir) cuesta 1 crédito, no 2", async () => {
  await sql(`UPDATE memberships SET classes_remaining=8 WHERE user_id=$1`, [cliente.id]);
  const v = ventanaAhora();
  const id = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const antes = await credits(cliente.id);
  const asg2 = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId: id } });
  assert.ok(asg2.status < 300, `asignar devolvió ${asg2.status}: ${JSON.stringify(asg2.body).slice(0, 200)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [id, cliente.id]);
  await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(antes - (await credits(cliente.id)), 1, "1 clase asistida debe costar 1 crédito");
});

test("P0-1 doble check-in sigue siendo idempotente", async () => {
  const [bk] = await sql(`SELECT b.id FROM bookings b JOIN users u ON u.id=b.user_id
                          WHERE u.email LIKE $1 AND b.status='checked_in' LIMIT 1`, [`${PFX}%`]);
  const antes = await credits(cliente.id);
  await api("PUT", `/api/bookings/${bk.id}/check-in`, { token: A });
  assert.equal(await credits(cliente.id), antes, "un segundo check-in no debe mover el saldo");
});

test("P1-6 current_bookings coincide con las reservas vivas", async () => {
  const id = await makeClass(A, f, { date: day(9) });
  await sql(`UPDATE memberships SET classes_remaining=8 WHERE user_id=$1`, [cliente.id]);
  await api("POST", "/api/bookings", { token: cliente.token, body: { classId: id } });
  const [c] = await sql(`SELECT current_bookings FROM classes WHERE id=$1`, [id]);
  const vivas = Number((await sql(`SELECT count(*)::int n FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')`, [id]))[0].n);
  assert.equal(c.current_bookings, vivas, `contador=${c.current_bookings} vs reservas vivas=${vivas}`);
});

test("P1-6 cancelar deja el contador en cero", async () => {
  const id = await makeClass(A, f, { date: day(10) });
  await sql(`UPDATE memberships SET classes_remaining=8 WHERE user_id=$1`, [cliente.id]);
  const r = await api("POST", "/api/bookings", { token: cliente.token, body: { classId: id } });
  const cancel = await api("DELETE", `/api/bookings/${bookingId(r)}`, { token: cliente.token });
  assert.equal(cancel.status, 200, `cancelar devolvió ${cancel.status}`);
  const [c] = await sql(`SELECT current_bookings FROM classes WHERE id=$1`, [id]);
  assert.equal(c.current_bookings, 0, "tras cancelar la única reserva el contador debe ser 0");
});
