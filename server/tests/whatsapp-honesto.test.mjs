// P0-1 · WhatsApp honesto: con Evolution sin configurar (como en producción
// hoy y en esta base de prueba, EVOLUTION_API_URL vacío) cancelar una clase
// NO debe contar los avisos como enviados — deben quedar en wa_unreached
// para que recepción avise a mano. Auditoría 2026-09-27.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, studioFixtures, makeClass, makeClient, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgwa";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("P0-1 cancelar una clase con Evolution sin configurar no cuenta wa_sent: todas quedan en wa_unreached", async () => {
  const c1 = await makeClient(PFX, "c1");
  const c2 = await makeClient(PFX, "c2");
  await giveMembership(A, c1.id, f.plan.id, 8);
  await giveMembership(A, c2.id, f.plan.id, 8);
  const id = await makeClass(A, f, { date: day(8) });
  const r1 = await api("POST", "/api/bookings", { token: c1.token, body: { classId: id } });
  const r2 = await api("POST", "/api/bookings", { token: c2.token, body: { classId: id } });
  assert.equal(r1.status, 201, `reserva 1 devolvió ${r1.status}`);
  assert.equal(r2.status, 201, `reserva 2 devolvió ${r2.status}`);

  const cancel = await api("PUT", `/api/classes/${id}/cancel`, { token: A, body: {} });
  assert.equal(cancel.status, 200, `cancelar devolvió ${cancel.status}: ${JSON.stringify(cancel.body).slice(0, 200)}`);
  const d = cancel.body.data;

  assert.equal(d.wa_queued, 0, "sin Evolution configurado no debe quedar nada en cola");
  assert.equal(d.wa_failed, 2, "las 2 alumnas con reserva viva deben quedar sin notificar");
  assert.equal(d.wa_unreached.length, 2, "wa_unreached debe traer a las 2 alumnas");
  const ids = d.wa_unreached.map((u) => u.user_id).sort();
  assert.deepEqual(ids, [c1.id, c2.id].sort());
  for (const u of d.wa_unreached) {
    assert.ok("display_name" in u && "phone" in u, "cada elemento trae display_name y phone");
  }
  assert.ok(!("wa_sent" in d), "wa_sent ya no debe existir en la respuesta");
});
