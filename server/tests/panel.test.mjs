// Sub-proyecto 3 (panel): GET /api/classes cuenta la lista de espera.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgpanel";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("GET /api/classes cuenta la lista de espera de cada clase", async () => {
  const llena = await makeClass(A, f, { date: day(8), start: "07:00", end: "08:00", cap: 1 });
  const libre = await makeClass(A, f, { date: day(8), start: "09:00", end: "10:00", cap: 5 });
  const clientas = [];
  for (const k of ["w1", "w2", "w3"]) {
    const c = await makeClient(PFX, k);
    await giveMembership(A, c.id, f.plan.id, 8);
    clientas.push(c);
  }
  // Cupo 1: la primera confirma, las otras dos quedan en espera.
  for (const c of clientas) {
    const r = await api("POST", "/api/bookings", { token: c.token, body: { classId: llena } });
    assert.ok(r.status < 300, `reserva devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  }
  const r = await api("GET", `/api/classes?start=${day(8)}&end=${day(8)}`, { token: A });
  assert.equal(r.status, 200);
  const porId = Object.fromEntries(r.body.data.map((c) => [c.id, c]));
  assert.equal(porId[llena].waitlist_count, 2, "dos en espera");
  assert.equal(porId[llena].current_bookings, 1, "una confirmada");
  assert.equal(porId[libre].waitlist_count, 0, "la clase libre no tiene espera");
});

test("una espera cancelada ya no cuenta", async () => {
  const [c] = await sql(
    `SELECT c.id FROM classes c JOIN instructors i ON i.id = c.instructor_id
      WHERE i.display_name LIKE $1 AND c.max_capacity = 1 LIMIT 1`, [`${PFX}%`]);
  await sql(`UPDATE bookings SET status = 'cancelled' WHERE id = (
               SELECT id FROM bookings WHERE class_id = $1 AND status = 'waitlist' LIMIT 1)`, [c.id]);
  const r = await api("GET", `/api/classes?start=${day(8)}&end=${day(8)}`, { token: A });
  assert.equal(r.body.data.find((x) => x.id === c.id).waitlist_count, 1);
});
