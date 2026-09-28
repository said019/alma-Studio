// Tarea 10 · auditoría 2026-09-27, bloque 3. Punta a punta entre tareas que en
// su ola sólo vieron el gancho vacío:
//   - la cancelación de la clienta (T3), el reembolso total (T7) y la
//     cancelación por webhook de Wellhub (T6) suben la lista de espera (T4);
//   - la subida no gasta la cuota de nadie (T3).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, bookingId, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgintb3";
const SECRET = "whsec-qa-integracion";
const RUN = crypto.randomUUID().slice(0, 8);
let A, f, prevCreds, stub;

// Un Wellhub de mentira que acepta todo, como en wellhub-checkin.test.mjs.
const levantarStub = () => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});

const estado = async (id) => (await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [id]))[0].s;
const usadas = async (userId) => (await sql(`SELECT cancellations_used FROM memberships WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]))[0].cancellations_used;
async function clienta(key) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  return c;
}
const reservar = async (c, classId) => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return bookingId(r);
};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  stub = await levantarStub();
  [prevCreds] = await sql(`SELECT * FROM platform_credentials WHERE channel = 'wellhub'`);
  await sql(
    `INSERT INTO platform_credentials (channel, environment, is_enabled, gym_id, webhook_secret, access_base_url, booking_base_url, extra_config)
     VALUES ('wellhub', 'sandbox', true, 'g-int-b3', $1, $2, $2, '{}'::jsonb)
     ON CONFLICT (channel) DO UPDATE SET is_enabled = true, gym_id = 'g-int-b3', webhook_secret = $1,
       access_base_url = $2, booking_base_url = $2`,
    [SECRET, `http://127.0.0.1:${stub.address().port}`],
  );
});
after(async () => {
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
  await sql(`DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  await cleanup(PFX);
  await closeDb();
});

test("la clienta cancela a tiempo: sube la primera de la fila; sólo a la que canceló le cuenta", async () => {
  const a = await clienta("a");
  const w = await clienta("w");
  const classId = await makeClass(A, f, { date: day(12), cap: 1 });
  const ba = await reservar(a, classId);
  const bw = await reservar(w, classId);
  assert.equal(await estado(bw), "waitlist");
  const r = await api("DELETE", `/api/bookings/${ba}`, { token: a.token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await estado(bw), "confirmed", "la cancelación de la clienta sube la fila");
  assert.equal(await usadas(a.id), 1);
  assert.equal(await usadas(w.id), 0, "subir de la fila no gasta cuota");
});

test("el reembolso total de una inscrita sube la fila", async () => {
  const b = await makeClient(PFX, "b");
  const v = await api("POST", "/api/memberships", { token: A, body: { userId: b.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(v.status, 201);
  const [m] = await sql(`SELECT order_id FROM memberships WHERE user_id = $1`, [b.id]);
  const w = await clienta("w2");
  const classId = await makeClass(A, f, { date: day(13), cap: 1 });
  await reservar(b, classId);
  const bw = await reservar(w, classId);
  const r = await api("POST", `/api/admin/orders/${m.order_id}/refunds`, { token: A, body: { kind: "total", method: "cash", reason: "No pudo seguir por lesión" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await estado(bw), "confirmed");
});

test("la cancelación por webhook de Wellhub sube la fila", async () => {
  const s = await makeClient(PFX, "wh");
  const w = await clienta("w3");
  const classId = await makeClass(A, f, { date: day(14), cap: 1 });
  const ref = `WH-${RUN}-int`;
  await sql(`INSERT INTO bookings (class_id, user_id, status, channel, external_ref) VALUES ($1, $2, 'confirmed', 'wellhub', $3)`, [classId, s.id, ref]);
  const bw = await reservar(w, classId);
  assert.equal(await estado(bw), "waitlist");
  const raw = JSON.stringify({ event_type: "booking-canceled", event_id: `int-${RUN}`, gym_id: "g-int-b3", event_data: { booking_number: ref } });
  const firma = crypto.createHmac("sha1", SECRET).update(raw).digest("hex");
  const r = await api("POST", "/webhooks/wellhub", { raw, headers: { "x-gympass-signature": firma } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await estado(bw), "confirmed");
});
