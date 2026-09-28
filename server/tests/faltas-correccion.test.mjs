// Auditoría 2026-09-27, bloque 2. Corregir una falta el mismo día con
// motivo: asistencia, sin esa falta (y su penalización si la completó), puntos
// una sola vez, y todo en la bitácora. Check-in manual y QR también se registran.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgfaltas";
let A, adminId, f, prevLoyalty;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
  [prevLoyalty] = await sql(`SELECT value FROM settings WHERE key = 'loyalty_config'`);
  await sql(
    `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ ...(prevLoyalty?.value ?? {}), enabled: true, points_per_class: 10, faltas_enabled: true, faltas_threshold: 5, faltas_penalty_points: 50 })],
  );
});
after(async () => {
  if (prevLoyalty) await sql(`UPDATE settings SET value = $1::jsonb WHERE key = 'loyalty_config'`, [JSON.stringify(prevLoyalty.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'loyalty_config'`);
  await cleanup(PFX);
  await closeDb();
});

async function reservaDeHoy(key) {
  const v = ventanaAhora();
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, c.id]);
  return { c, classId, bookingId: bk.id };
}
const puntos = async (userId, like) =>
  (await sql(`SELECT points FROM loyalty_transactions WHERE user_id=$1 AND description LIKE $2 ORDER BY created_at`, [userId, like])).map((r) => Number(r.points));
const corregir = (id, body) => api("PUT", `/api/bookings/${id}/correct-no-show`, { token: A, body });

test("falta del día corregida con motivo: asistencia, sin la falta, penalización devuelta y puntos una vez", async () => {
  const { c, bookingId } = await reservaDeHoy("corrige");
  await sql(`UPDATE users SET faltas_count = 4 WHERE id = $1`, [c.id]);
  const ns = await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  assert.equal(ns.status, 200);
  assert.equal((await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]))[0].faltas_count, 5);
  assert.deepEqual(await puntos(c.id, "Penalización%"), [-50]);
  assert.ok((await sql(`SELECT falta_recorded_at FROM bookings WHERE id=$1`, [bookingId]))[0].falta_recorded_at, "la falta queda ligada a la reserva");

  const r = await corregir(bookingId, { reason: "Sí vino, se marcó por error" });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.falta_reverted, true);
  assert.equal(r.body.penalty_refunded, 50);
  assert.equal(r.body.points_awarded, 10);
  const [b] = await sql(`SELECT status, checked_in_by, checked_in_at, falta_recorded_at FROM bookings WHERE id=$1`, [bookingId]);
  assert.equal(b.status, "checked_in");
  assert.equal(b.checked_in_by, adminId);
  assert.ok(b.checked_in_at);
  assert.equal(b.falta_recorded_at, null);
  assert.equal((await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]))[0].faltas_count, 4);
  assert.deepEqual(await puntos(c.id, "Reverso de penalización%"), [50]);
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10]);
  const logs = await sql(`SELECT action, reason, before, after FROM audit_log WHERE entity_id = $1 ORDER BY created_at`, [bookingId]);
  assert.deepEqual(logs.map((l) => l.action), ["booking.no_show", "booking.no_show_corrected"]);
  assert.equal(logs[1].reason, "Sí vino, se marcó por error");
  assert.equal(logs[1].before.faltas_count, 5);
  assert.equal(logs[1].after.faltas_count, 4);

  const otra = await corregir(bookingId, { reason: "Otra vez por si acaso" });
  assert.equal(otra.status, 409);
  assert.equal(otra.body.code, "NOT_NO_SHOW");
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10], "sin puntos repetidos");
  assert.deepEqual(await puntos(c.id, "Reverso de penalización%"), [50], "sin reverso repetido");
});

test("una falta sin marca (previa al despliegue) se corrige sin tocar el contador", async () => {
  const { c, bookingId } = await reservaDeHoy("sinmarca");
  await sql(`UPDATE users SET faltas_count = 3 WHERE id = $1`, [c.id]);
  await sql(`UPDATE bookings SET status = 'no_show', falta_recorded_at = NULL WHERE id = $1`, [bookingId]);
  const r = await corregir(bookingId, { reason: "Sí vino, falta vieja" });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.falta_reverted, false);
  assert.equal(r.body.penalty_refunded, 0);
  assert.equal((await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]))[0].faltas_count, 3);
  assert.deepEqual(await puntos(c.id, "Reverso de penalización%"), []);
});

test("sin motivo → 400 y la falta sigue", async () => {
  const { bookingId } = await reservaDeHoy("sinmotivo");
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  for (const body of [{}, { reason: "ok" }]) {
    const r = await corregir(bookingId, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.code, "REASON_REQUIRED");
  }
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "no_show");
});

test("una falta de otro día no se corrige: 409 NOT_SAME_DAY", async () => {
  const { bookingId, classId } = await reservaDeHoy("ayer");
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-1), classId]);
  const r = await corregir(bookingId, { reason: "Sí vino, se marcó por error" });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "NOT_SAME_DAY");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "no_show");
});

test("una reserva con check-in que luego se marcó falta: la corrección no da puntos otra vez", async () => {
  const { c, bookingId } = await reservaDeHoy("yavino");
  const ci = await api("PUT", `/api/bookings/${bookingId}/check-in`, { token: A });
  assert.equal(ci.status, 200, JSON.stringify(ci.body).slice(0, 150));
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  const r = await corregir(bookingId, { reason: "Se marcó falta por error" });
  assert.equal(r.status, 200);
  assert.equal(r.body.points_awarded, 0);
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10], "sólo los del check-in original");
  const [log] = await sql(`SELECT actor_id, meta FROM audit_log WHERE entity_id=$1 AND action='booking.checkin'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.meta.method, "manual");
});

test("el check-in por QR queda en la bitácora con el método", async () => {
  const { c, bookingId } = await reservaDeHoy("qr");
  const r = await api("POST", "/api/admin/checkin/scan", { token: A, body: { code: Buffer.from(c.id).toString("base64") } });
  assert.equal(r.body.status, "ok", JSON.stringify(r.body));
  const [log] = await sql(`SELECT actor_id, meta FROM audit_log WHERE entity_id=$1 AND action='booking.checkin'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.meta.method, "qr");
});

test("ids: basura → 400; inexistente → 404", async () => {
  assert.equal((await api("PUT", "/api/bookings/basura/correct-no-show", { token: A, body: { reason: "Motivo válido" } })).status, 400);
  assert.equal((await corregir(crypto.randomUUID(), { reason: "Motivo válido" })).status, 404);
});
