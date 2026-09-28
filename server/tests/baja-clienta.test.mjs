// Tarea 6 · auditoría 2026-09-27, bloque 2 (P1-5 · A9 · EC15). Dar de baja a una
// clienta la anonimiza: sin datos personales ni de salud, sin acceso, y con sus
// órdenes, membresías y reservas conservadas. Sólo la dueña.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgbaja";
let A, adminId, f;
const bajas = [];

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  // Las anonimizadas ya no tienen el correo con el prefijo: se limpian por id.
  if (bajas.length) {
    await sql(`DELETE FROM bookings WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM waivers WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1::uuid[]))`, [bajas]);
    await sql(`DELETE FROM orders WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM memberships WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [bajas]);
  }
  await cleanup(PFX);
  await closeDb();
});

test("dar de baja: borra datos personales y de salud, conserva historial y cierra el acceso", async () => {
  const c = await makeClient(PFX, "baja");
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(3) });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}`);
  // Historial viejo: la clase ya pasó, asistió, y la membresía venció.
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-30), classId]);
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE class_id = $1`, [classId]);
  await sql(`UPDATE memberships SET status = 'expired', end_date = $2 WHERE user_id = $1`, [c.id, day(-1)]);
  await sql(
    `UPDATE users SET has_injury = true, injury_details = 'Rodilla derecha', health_notes = 'Asma',
            date_of_birth = '1990-05-05', emergency_contact_name = 'Mamá', emergency_contact_phone = '5511112222'
      WHERE id = $1`, [c.id]);
  const [antes] = await sql(`SELECT email, phone FROM users WHERE id=$1`, [c.id]);
  const cuenta = async () => (await sql(
    `SELECT (SELECT COUNT(*)::int FROM orders WHERE user_id=$1) o,
            (SELECT COUNT(*)::int FROM memberships WHERE user_id=$1) m,
            (SELECT COUNT(*)::int FROM bookings WHERE user_id=$1) b`, [c.id]))[0];
  const hist = await cuenta();

  const r = await api("DELETE", `/api/users/${c.id}`, { token: A, body: { reason: "Lo pidió por WhatsApp" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  bajas.push(c.id);

  const [u] = await sql(
    `SELECT display_name, email, phone, has_injury, injury_details, health_notes, date_of_birth,
            emergency_contact_name, password_hash, is_active, anonymized_at, anonymized_by
       FROM users WHERE id=$1`, [c.id]);
  assert.equal(u.display_name, "Clienta dada de baja");
  assert.match(u.email, /^baja\+[0-9a-f]{32}@hive\.invalid$/);
  for (const k of ["phone", "has_injury", "injury_details", "health_notes", "date_of_birth", "emergency_contact_name", "password_hash"]) {
    assert.equal(u[k], null, k);
  }
  assert.equal(u.is_active, false);
  assert.ok(u.anonymized_at);
  assert.equal(u.anonymized_by, adminId);
  const [w] = await sql(`SELECT full_name, signature_data FROM waivers WHERE user_id=$1`, [c.id]);
  assert.equal(w.signature_data, null);
  assert.equal(w.full_name, "Clienta dada de baja");
  assert.deepEqual(await cuenta(), hist, "órdenes, membresías y reservas se conservan");

  // Acceso cerrado: el token viejo ya no sirve y no puede volver a entrar.
  const me = await api("GET", "/api/auth/me", { token: c.token });
  assert.equal(me.status, 401);
  assert.equal(me.body.code, "ACCOUNT_DISABLED");
  assert.equal((await api("GET", "/api/memberships/my", { token: c.token })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { body: { email: c.email, password: c.password } })).status, 401);

  // Ya no aparece en la lista de clientas.
  const lista = await api("GET", `/api/users?role=client&search=${encodeURIComponent("Clienta dada de baja")}`, { token: A });
  assert.equal(lista.body.data.length, 0);

  // La bitácora dice quién y por qué, sin guardar lo borrado.
  const [log] = await sql(`SELECT * FROM audit_log WHERE entity_id=$1 AND action='user.anonymize'`, [c.id]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.reason, "Lo pidió por WhatsApp");
  const txt = JSON.stringify(log);
  for (const pii of [antes.email, antes.phone, "Rodilla", "Asma", "1990-05-05", "5511112222"]) {
    assert.ok(!txt.includes(pii), `la bitácora guardó ${pii}`);
  }
  assert.deepEqual(log.meta.kept, { memberships: hist.m, orders: hist.o, bookings: hist.b });

  // Repetir no hace nada nuevo.
  const again = await api("DELETE", `/api/users/${c.id}`, { token: A, body: {} });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.alreadyAnonymized, true);
});

test("con membresía activa o reservas próximas → 409 y no cambia nada", async () => {
  const c = await makeClient(PFX, "activa");
  await giveMembership(A, c.id, f.plan.id, 8);
  const r = await api("DELETE", `/api/users/${c.id}`, { token: A, body: {} });
  assert.equal(r.status, 409);
  const [u] = await sql(`SELECT display_name, anonymized_at FROM users WHERE id=$1`, [c.id]);
  assert.equal(u.display_name, "QA activa");
  assert.equal(u.anonymized_at, null);
});

test("sólo la dueña; sólo clientas; no a sí misma; ids malos", async () => {
  const recep = await makeClient(PFX, "recep", { role: "reception" });
  const c = await makeClient(PFX, "protegida");
  assert.equal((await api("DELETE", `/api/users/${c.id}`, { token: recep.token, body: {} })).status, 403);
  assert.equal((await api("DELETE", `/api/users/${recep.id}`, { token: A, body: {} })).status, 400);
  assert.equal((await api("DELETE", `/api/users/${adminId}`, { token: A, body: {} })).status, 400);
  assert.equal((await api("DELETE", "/api/users/no-es-uuid", { token: A })).status, 400);
  assert.equal((await api("DELETE", `/api/users/${crypto.randomUUID()}`, { token: A, body: {} })).status, 404);
});
