// Tarea 3 · auditoría 2026-09-27, bloque 3 (P0-4 · C1 · C8 · C2). La cuota de
// cancelaciones por paquete es configurable (0 por defecto = sin límite) y
// sólo la cambia la dueña; salir de la lista de espera no la consume; la
// ventana es la configurada; recepción ajusta cancellationsUsed con motivo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, bookingId, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgcuota";
let A, f, recep, prevCancel, prevLoyalty;

const reservar = async (c, classId) => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return bookingId(r);
};
const cancelar = (c, id) => api("DELETE", `/api/bookings/${id}`, { token: c.token });
const usadas = async (userId) =>
  (await sql(`SELECT cancellations_used FROM memberships WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]))[0].cancellations_used;
const ponerCuota = (n) => api("PUT", "/api/admin/booking-policy", { token: A, body: { cancellationLimit: n } });
// Mueve la clase a N horas de ahora, en la zona del estudio (sin cruzar mal el día).
const aHoras = (classId, h) => sql(
  `UPDATE classes SET date = ((NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $2))::date,
                      start_time = ((NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $2))::time
    WHERE id = $1`, [classId, h]);
const ponerLealtad = (extra) => sql(
  `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1::jsonb)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [JSON.stringify({ ...(prevLoyalty?.value ?? {}), ...extra })]);

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  [prevCancel] = await sql(`SELECT value FROM settings WHERE key = 'cancellation_settings'`);
  [prevLoyalty] = await sql(`SELECT value FROM settings WHERE key = 'loyalty_config'`);
  // La suite arranca sin configurar: la cuota debe ser 0.
  await sql(`DELETE FROM settings WHERE key = 'cancellation_settings'`);
});
after(async () => {
  if (prevCancel) await sql(`INSERT INTO settings (key, value) VALUES ('cancellation_settings', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(prevCancel.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'cancellation_settings'`);
  if (prevLoyalty) await sql(`UPDATE settings SET value = $1::jsonb WHERE key = 'loyalty_config'`, [JSON.stringify(prevLoyalty.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'loyalty_config'`);
  await cleanup(PFX);
  await closeDb();
});

test("HIVE arranca sin límite de cancelaciones y con ventana de 12 horas", async () => {
  const policy = await api("GET", "/api/public/booking-policy");
  assert.equal(policy.body.data.cancellationLimit, 0);
  assert.equal(policy.body.data.cancelWindowHours, 12);
});

test("si la dueña configura cuota 2, la tercera cancelación → 403 CANCELLATION_LIMIT y nada cambia", async () => {
  await ponerCuota(2);
  const c = await makeClient(PFX, "tres");
  await giveMembership(A, c.id, f.plan.id, 8);
  const primera = await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(20) })));
  assert.equal(primera.status, 200, JSON.stringify(primera.body));
  assert.equal(primera.body.cancellationsUsed, 1);
  assert.equal(primera.body.cancellationLimit, 2);
  assert.equal(primera.body.cancellationsLeft, 1);
  assert.equal((await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(21) })))).status, 200);
  assert.equal(await usadas(c.id), 2);
  const id3 = await reservar(c, await makeClass(A, f, { date: day(22) }));
  const r3 = await cancelar(c, id3);
  assert.equal(r3.status, 403);
  assert.equal(r3.body.code, "CANCELLATION_LIMIT");
  assert.equal(r3.body.message, "Ya usaste tus 2 cancelaciones de este paquete. Si necesitas cancelar, habla con recepción.");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id3]))[0].status, "confirmed");
  assert.equal(await usadas(c.id), 2);
});

test("salir de la lista de espera con la cuota agotada → 200, sin sumar ni registrar falta aunque falten menos de 12 h", async () => {
  const ocupa = await makeClient(PFX, "ocupa");
  await giveMembership(A, ocupa.id, f.plan.id, 8);
  const c = await makeClient(PFX, "fila");
  await giveMembership(A, c.id, f.plan.id, 8);
  await sql(`UPDATE memberships SET cancellations_used = 2 WHERE user_id = $1`, [c.id]);
  const classId = await makeClass(A, f, { date: day(8), cap: 1 });
  await reservar(ocupa, classId);
  const id = await reservar(c, classId);
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id]))[0].status, "waitlist");
  await aHoras(classId, 5);
  const [antes] = await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]);
  const r = await cancelar(c, id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.leftWaitlist, true);
  assert.equal(r.body.message, "Saliste de la lista de espera. No usa una cancelación de tu paquete.");
  assert.equal(await usadas(c.id), 2, "salir de la fila no suma a la cuota");
  const [despues] = await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]);
  assert.equal(despues.faltas_count, antes.faltas_count, "salir de la fila no es falta");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id]))[0].status, "cancelled");
});

test("usa la ventana configurada: con 24 h, cancelar a 20 h pierde la clase y lo dice", async () => {
  await ponerLealtad({ faltas_cancel_window_hours: 24 });
  try {
    const c = await makeClient(PFX, "ventana");
    await giveMembership(A, c.id, f.plan.id, 8);
    const classId = await makeClass(A, f, { date: day(9) });
    const id = await reservar(c, classId);
    await aHoras(classId, 20);
    const antes = await credits(c.id);
    const r = await cancelar(c, id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.creditRestored, false);
    assert.equal(r.body.cancelWindowHours, 24);
    assert.match(r.body.message, /menos de 24 horas/);
    assert.equal(await credits(c.id), antes, "tarde: la clase no regresa");
    assert.equal((await api("GET", "/api/public/booking-policy")).body.data.cancelWindowHours, 24);
  } finally {
    await ponerLealtad({ faltas_cancel_window_hours: 12 });
  }
});

test("la dueña cambia la cuota (queda en la bitácora); recepción no; inválida → 400; la ruta genérica → 400", async () => {
  const r = await ponerCuota(3);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.cancellationLimit, 3);
  const pub = await api("GET", "/api/public/booking-policy");
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.body.data).sort(),
    ["bookingLeadHours", "cancelWindowHours", "cancellationLimit", "faltasEnabled", "faltasThreshold", "waitlistCutoffHours"]);
  assert.equal(pub.body.data.cancellationLimit, 3);
  const [log] = await sql(`SELECT before, after, meta FROM audit_log WHERE action = 'settings.update' ORDER BY created_at DESC LIMIT 1`);
  assert.deepEqual(log.before, { max_cancellations: 2 });
  assert.deepEqual(log.after, { max_cancellations: 3 });
  assert.equal((await api("PUT", "/api/admin/booking-policy", { token: recep.token, body: { cancellationLimit: 5 } })).status, 403);
  for (const bad of [-1, 2.5, "x", 21, null]) {
    const m = await ponerCuota(bad);
    assert.equal(m.status, 400, String(bad));
    assert.equal(m.body.message, "Escribe un número entero de 0 a 20.");
  }
  const generica = await api("PUT", "/api/settings/cancellation_settings", { token: A, body: { value: { max_cancellations: 9 } } });
  assert.equal(generica.status, 400);
  assert.equal((await api("GET", "/api/public/booking-policy")).body.data.cancellationLimit, 3);
  await ponerCuota(2);
});

test("0 = sin límite: con 7 usadas todavía cancela", async () => {
  await ponerCuota(0);
  try {
    const c = await makeClient(PFX, "sinlimite");
    await giveMembership(A, c.id, f.plan.id, 8);
    await sql(`UPDATE memberships SET cancellations_used = 7 WHERE user_id = $1`, [c.id]);
    const r = await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(23) })));
    assert.equal(r.status, 200);
    assert.equal(r.body.cancellationLimit, 0);
    assert.equal(r.body.cancellationsLeft, null);
  } finally {
    await ponerCuota(2);
  }
});

test("recepción ajusta cancellationsUsed con motivo; sin motivo → 400; guardar lo mismo no pide motivo", async () => {
  const c = await makeClient(PFX, "ajuste");
  await giveMembership(A, c.id, f.plan.id, 8);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id=$1`, [c.id]);
  await sql(`UPDATE memberships SET cancellations_used = 2 WHERE id = $1`, [m.id]);
  const sin = await api("PUT", `/api/memberships/${m.id}`, { token: recep.token, body: { cancellationsUsed: 0 } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal(await usadas(c.id), 2);
  const con = await api("PUT", `/api/memberships/${m.id}`, { token: recep.token, body: { cancellationsUsed: 0, reason: "Canceló por enfermedad, trajo receta" } });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal(await usadas(c.id), 0);
  const [log] = await sql(`SELECT actor_id, reason, before, after FROM audit_log WHERE entity_id=$1 AND action='membership.adjust' ORDER BY created_at DESC LIMIT 1`, [m.id]);
  assert.equal(log.actor_id, recep.id);
  assert.equal(log.reason, "Canceló por enfermedad, trajo receta");
  assert.deepEqual(log.before, { cancellations_used: 2 });
  assert.deepEqual(log.after, { cancellations_used: 0 });
  const igual = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { cancellationsUsed: 0 } });
  assert.equal(igual.status, 200);
  assert.equal(igual.body.unchanged, true);
  for (const bad of [-1, 1.5, "x"]) {
    const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { cancellationsUsed: bad, reason: "Motivo válido" } });
    assert.equal(r.status, 400, String(bad));
  }
});

test("una reserva con asistencia o falta no se cancela desde la app → 409", async () => {
  const c = await makeClient(PFX, "asistio");
  await giveMembership(A, c.id, f.plan.id, 8);
  const id = await reservar(c, await makeClass(A, f, { date: day(24) }));
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`, [id]);
  const r = await cancelar(c, id);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "ATTENDANCE_RECORDED");
  await sql(`UPDATE bookings SET status = 'no_show', checked_in_at = NULL WHERE id = $1`, [id]);
  assert.equal((await cancelar(c, id)).status, 409);
  assert.equal(await usadas(c.id), 0);
});

test("las cancelaciones del estudio no cuentan para la cuota", async () => {
  const c = await makeClient(PFX, "estudio");
  await giveMembership(A, c.id, f.plan.id, 8);
  const id = await reservar(c, await makeClass(A, f, { date: day(25) }));
  const r = await api("DELETE", `/api/admin/bookings/${id}`, { token: A, body: { reason: "Cambio de coach, la movemos" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await usadas(c.id), 0);
});

test("la app y el panel reciben la cuota con la membresía", async () => {
  const c = await makeClient(PFX, "mia");
  await giveMembership(A, c.id, f.plan.id, 8);
  await sql(`UPDATE memberships SET cancellations_used = 1 WHERE user_id = $1`, [c.id]);
  const my = await api("GET", "/api/memberships/my", { token: c.token });
  assert.equal(my.body.data.cancellationsUsed, 1);
  assert.equal(my.body.data.cancellationLimit, 2);
  assert.equal(my.body.data.cancellationsLeft, 1);
  const all = await api("GET", "/api/memberships/mine/all", { token: c.token });
  assert.equal(all.body.data[0].cancellationsLeft, 1);
  const panel = await api("GET", `/api/memberships?userId=${c.id}`, { token: A });
  assert.equal(panel.body.data[0].cancellationsUsed, 1);
  assert.equal(panel.body.data[0].cancellationLimit, 2);
});
