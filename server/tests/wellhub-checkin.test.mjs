// Tarea 6 · auditoría 2026-09-27, bloque 3 (P1-9 · F6 · K6). El check-in que
// llega por webhook de Wellhub marca checked_in CON checked_in_at (cuenta en
// "Primera vez" y en reportes) y queda en la bitácora con actor "Wellhub"; la
// dueña concilia el mes; recepción no ve nada de esto. La validación de visita
// no cambia: aquí la atiende un Wellhub de mentira que siempre acepta.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, makeClass, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgwhci";
const SECRET = "whsec-qa-bloque3";
const RUN = crypto.randomUUID().slice(0, 8);
let A, f, recep, stub, prevCreds, bookingCheckin;

const levantarStub = () => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});
const webhook = (ruta, payload) => {
  const raw = JSON.stringify(payload);
  const firma = crypto.createHmac("sha1", SECRET).update(raw).digest("hex");
  return api("POST", ruta, { raw, headers: { "x-gympass-signature": firma } });
};
async function socia(key) {
  const c = await makeClient(PFX, key);
  const wid = `wh-${RUN}-${key}`;
  await sql(`UPDATE users SET wellhub_id = $2 WHERE id = $1`, [c.id, wid]);
  return { ...c, wid };
}
// Nota (desviación, ver task-6-report.md): $3 se usaba en dos contextos (valor
// de la columna enum `status` y comparación de texto en el CASE), y Postgres
// no puede deducirle un solo tipo para los dos ("inconsistent types deduced
// for parameter $3", 42P08). El cast explícito en la primera aparición no
// cambia el valor ni el orden de los parámetros, sólo desambigua el tipo.
const reservaWellhub = async (classId, userId, ref, status = "confirmed") =>
  (await sql(
    `INSERT INTO bookings (class_id, user_id, status, channel, external_ref, checked_in_at)
     VALUES ($1, $2, $3::booking_status, 'wellhub', $4, CASE WHEN $3 = 'checked_in' THEN NOW() END) RETURNING id`,
    [classId, userId, status, ref],
  ))[0].id;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  stub = await levantarStub();
  [prevCreds] = await sql(`SELECT * FROM platform_credentials WHERE channel = 'wellhub'`);
  await sql(
    `INSERT INTO platform_credentials (channel, environment, is_enabled, gym_id, webhook_secret, access_base_url, booking_base_url, extra_config)
     VALUES ('wellhub', 'sandbox', true, 'g-qa-b3', $1, $2, $2, '{}'::jsonb)
     ON CONFLICT (channel) DO UPDATE SET is_enabled = true, gym_id = 'g-qa-b3', webhook_secret = $1,
       access_base_url = $2, booking_base_url = $2`,
    [SECRET, `http://127.0.0.1:${stub.address().port}`],
  );
});
after(async () => {
  await sql(`DELETE FROM partner_checkins WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  if (prevCreds) {
    await sql(
      `UPDATE platform_credentials SET environment = $1, is_enabled = $2, gym_id = $3, webhook_secret = $4,
              access_base_url = $5, booking_base_url = $6 WHERE channel = 'wellhub'`,
      [prevCreds.environment, prevCreds.is_enabled, prevCreds.gym_id, prevCreds.webhook_secret, prevCreds.access_base_url, prevCreds.booking_base_url],
    );
  } else {
    await sql(`DELETE FROM platform_credentials WHERE channel = 'wellhub'`);
  }
  stub.close();
  await cleanup(PFX);
  await closeDb();
});

test("el check-in por webhook marca la asistencia con fecha y queda en la bitácora como Wellhub", async () => {
  const s = await socia("ci");
  const v = ventanaAhora();
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const ref = `WH-${RUN}-ci`;
  bookingCheckin = await reservaWellhub(classId, s.id, ref);
  const r = await webhook("/webhooks/wellhub/checkin", {
    event_type: "checkin", event_id: `ci-${RUN}`, gym_id: "g-qa-b3",
    event_data: { user: { id: s.wid }, booking_number: ref, occurred_at: new Date().toISOString() },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "confirmed");
  const [b] = await sql(`SELECT status::text AS status, checked_in_at FROM bookings WHERE id = $1`, [bookingCheckin]);
  assert.equal(b.status, "checked_in");
  assert.ok(b.checked_in_at, "sin checked_in_at no cuenta en Primera vez ni en los reportes");
  const [log] = await sql(`SELECT actor_id, actor_name, meta FROM audit_log WHERE entity_id = $1 AND action = 'booking.checkin'`, [bookingCheckin]);
  assert.equal(log.actor_id, null);
  assert.equal(log.actor_name, "Wellhub");
  assert.equal(log.meta.method, "wellhub");
  assert.equal(log.meta.actor, "wellhub");
  // "Primera vez": en su siguiente clase ya no es la primera.
  const otra = await makeClass(A, f, { date: day(3) });
  await sql(`INSERT INTO bookings (class_id, user_id, status, channel) VALUES ($1, $2, 'confirmed', 'app')`, [otra, s.id]);
  const roster = await api("GET", `/api/classes/${otra}/roster`, { token: A });
  assert.equal(roster.body.data.roster.find((x) => x.userId === s.id).firstVisit, false);
});

test("la dueña concilia el mes: check-ins, reservas de Wellhub y asistencias sin check-in", async () => {
  const s = await socia("sin");
  const classId = await makeClass(A, f, { date: day(0) });
  await reservaWellhub(classId, s.id, `WH-${RUN}-sin`, "checked_in");
  const mes = day(0).slice(0, 7);
  const r = await api("GET", `/api/partners/checkins?month=${mes}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.month, mes);
  assert.ok(r.body.summary.confirmed >= 1, "el check-in del webhook");
  assert.ok(r.body.summary.attended >= 2, "las dos asistencias de Wellhub del mes");
  assert.ok(r.body.unmatched.some((u) => u.user_name === "QA sin"), "asistió en el estudio sin check-in de Wellhub");
  assert.ok(!r.body.unmatched.some((u) => u.booking_id === bookingCheckin), "la del webhook sí está conciliada");
  const fila = r.body.data.find((x) => x.user_name === "QA ci");
  assert.equal(fila.booking_status, "checked_in");
  const sinMes = await api("GET", "/api/partners/checkins", { token: A });
  assert.equal(sinMes.status, 200);
  assert.equal(sinMes.body.month, mes, "sin mes, el actual del estudio");
});

test("sólo la dueña: check-ins, confirmar, resumen y publicar a Wellhub; un mes inválido → 400", async () => {
  const mes = day(0).slice(0, 7);
  assert.equal((await api("GET", `/api/partners/checkins?month=${mes}`, { token: recep.token })).status, 403);
  assert.equal((await api("GET", "/api/partners/summary", { token: recep.token })).status, 403);
  const classId = await makeClass(A, f, { date: day(4) });
  assert.equal((await api("POST", `/api/partners/wellhub/publish/${classId}`, { token: recep.token, body: { quota: 2 } })).status, 403);
  assert.equal((await api("POST", `/api/partners/checkins/${crypto.randomUUID()}/confirm`, { token: recep.token })).status, 403);
  const malo = await api("GET", "/api/partners/checkins?month=2026-13", { token: A });
  assert.equal(malo.status, 400);
  assert.equal(malo.body.message, "Mes inválido (usa AAAA-MM).");
});

test("la cancelación por webhook libera el lugar y no le devuelve a Wellhub los ids de clase", async () => {
  const s = await socia("cx");
  const classId = await makeClass(A, f, { date: day(5) });
  const ref = `WH-${RUN}-cx`;
  await reservaWellhub(classId, s.id, ref);
  const r = await webhook("/webhooks/wellhub", {
    event_type: "booking-canceled", event_id: `cx-${RUN}`, gym_id: "g-qa-b3",
    event_data: { booking_number: ref },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "cancelled");
  assert.equal(r.body.classIds, undefined);
  const [b] = await sql(`SELECT status::text AS s FROM bookings WHERE external_ref = $1`, [ref]);
  assert.equal(b.s, "cancelled");
});
