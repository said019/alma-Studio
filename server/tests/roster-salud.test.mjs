// P1-8 · Alerta de salud y "primera vez" en las listas de clase. Auditoría 2026-09-27.
// Invariante: la coach ve en el roster de hoy y en el de cada clase si la
// clienta tiene lesión, notas de salud o es su primera visita, sin abrir su ficha.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgsalud";
let A, f, cliente, classId;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  cliente = await makeClient(PFX, "c1");
  await giveMembership(A, cliente.id, f.plan.id, 8);
  await sql(`UPDATE users SET has_injury = true, injury_details = 'Rodilla' WHERE id = $1`, [cliente.id]);

  const v = ventanaAhora();
  classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: cliente.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 200)}`);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("today-roster: su fila trae la lesión y, sin check-ins previos, es su primera vez", async () => {
  const r = await api("GET", "/api/admin/today-roster", { token: A });
  assert.equal(r.status, 200, `today-roster devolvió ${r.status}`);
  const cls = r.body.data.find((c) => c.id === classId);
  assert.ok(cls, "la clase de hoy debe aparecer en el roster");
  const fila = cls.roster.find((row) => row.user_id === cliente.id);
  assert.ok(fila, "la fila de la clienta debe estar en el roster");
  assert.equal(fila.has_injury, true, "has_injury debe venir true");
  assert.equal(fila.injury_details, "Rodilla", "injury_details debe venir con el detalle");
  assert.equal(fila.first_visit, true, "sin check-ins previos, es su primera visita");
});

test("today-roster: tras un check-in anterior deja de ser primera visita", async () => {
  const pastClassId = await makeClass(A, f, { date: day(-1), start: "07:00", end: "08:00" });
  await sql(
    `INSERT INTO bookings (class_id, user_id, status, checked_in_at) VALUES ($1, $2, 'checked_in', now())`,
    [pastClassId, cliente.id],
  );

  const r = await api("GET", "/api/admin/today-roster", { token: A });
  assert.equal(r.status, 200, `today-roster devolvió ${r.status}`);
  const cls = r.body.data.find((c) => c.id === classId);
  const fila = cls.roster.find((row) => row.user_id === cliente.id);
  assert.equal(fila.first_visit, false, "ya tiene un check-in anterior: no es su primera visita");
});

test("classes/:id/roster: la fila trae la lesión en camelCase", async () => {
  const r = await api("GET", `/api/classes/${classId}/roster`, { token: A });
  assert.equal(r.status, 200, `classes/:id/roster devolvió ${r.status}`);
  const fila = r.body.data.roster.find((row) => row.userId === cliente.id);
  assert.ok(fila, "la fila de la clienta debe estar en el roster de la clase");
  assert.equal(fila.hasInjury, true, "hasInjury debe venir true en camelCase");
});
