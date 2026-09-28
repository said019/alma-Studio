// Tarea 5 · auditoría 2026-09-27, bloque 2 (P0-3, P1-5 · I6). El estudio cancela
// con motivo y queda en la bitácora; "Limpiar semana" borra sólo lo vacío, cancela
// (crédito y aviso) lo que tiene reservas y no toca lo que ya ocurrió.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgcancel";
let A, adminId, f;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

async function reserva(key, date) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, c.id]);
  return { c, classId, bookingId: bk.id };
}
const cuantas = async (id) => (await sql(`SELECT COUNT(*)::int n FROM classes WHERE id=$1`, [id]))[0].n;

test("cancelar una reserva desde el panel exige motivo", async () => {
  const { bookingId } = await reserva("sinmotivo", day(30));
  for (const body of [{}, { reason: "ok" }, { reason: "     " }]) {
    const r = await api("DELETE", `/api/admin/bookings/${bookingId}`, { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.code, "REASON_REQUIRED");
  }
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "confirmed");
});

test("con motivo: cancela, devuelve crédito, guarda quién y por qué, y queda en la bitácora", async () => {
  const { c, bookingId } = await reserva("conmotivo", day(31));
  const antes = await credits(c.id);
  const r = await api("DELETE", `/api/admin/bookings/${bookingId}`, { token: A, body: { reason: "Nos pidió moverla por teléfono" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await credits(c.id), antes + 1);
  const [b] = await sql(`SELECT status, cancelled_by, cancellation_reason FROM bookings WHERE id=$1`, [bookingId]);
  assert.equal(b.status, "cancelled");
  assert.equal(b.cancelled_by, adminId);
  assert.equal(b.cancellation_reason, "Nos pidió moverla por teléfono");
  const [log] = await sql(`SELECT actor_id, subject_user_id, reason, before, after, meta FROM audit_log WHERE entity_id=$1 AND action='booking.cancel'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.subject_user_id, c.id);
  assert.equal(log.before.status, "confirmed");
  assert.equal(log.after.status, "cancelled");
  assert.equal(log.meta.credit_restored, true);
});

test("cancelar una clase deja quién y por qué en la clase y en la bitácora; la respuesta no cambia", async () => {
  const { classId } = await reserva("clase", day(35));
  const r = await api("PUT", `/api/classes/${classId}/cancel`, { token: A, body: { reason: "La coach se enfermó" } });
  assert.equal(r.status, 200);
  for (const k of ["bookings_cancelled", "credits_restored", "points_reverted", "wa_queued", "wa_failed", "wa_unreached", "wa_channel_state"]) {
    assert.ok(k in r.body.data, k);
  }
  const [cl] = await sql(`SELECT cancelled_by, cancellation_reason, cancelled_at FROM classes WHERE id=$1`, [classId]);
  assert.equal(cl.cancelled_by, adminId);
  assert.equal(cl.cancellation_reason, "La coach se enfermó");
  assert.ok(cl.cancelled_at);
  const [log] = await sql(`SELECT reason, meta FROM audit_log WHERE entity_id=$1 AND action='class.cancel'`, [classId]);
  assert.equal(log.reason, "La coach se enfermó");
  assert.equal(log.meta.source, "manual");
  assert.equal(log.meta.bookings_cancelled, 1);
});

test("limpiar semana: 409 con el resumen si hay reservas activas; con force exige motivo; nada cambia", async () => {
  const vacia = await makeClass(A, f, { date: day(40) });
  const { classId: conReserva } = await reserva("semana1", day(41));
  const r409 = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(40), endDate: day(46) } });
  assert.equal(r409.status, 409);
  assert.equal(r409.body.code, "ACTIVE_BOOKINGS");
  assert.equal(r409.body.activeBookings, 1);
  assert.equal(r409.body.classesToCancel, 1);
  assert.equal(r409.body.classesToDelete, 1);
  const sinMotivo = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(40), endDate: day(46), force: true } });
  assert.equal(sinMotivo.status, 400);
  assert.equal(sinMotivo.body.code, "REASON_REQUIRED");
  assert.equal(await cuantas(vacia), 1);
  assert.equal(await cuantas(conReserva), 1);
});

test("limpiar semana con motivo: borra vacías, cancela las que tienen reservas y conserva el historial", async () => {
  const vacia = await makeClass(A, f, { date: day(50) });
  const { c, classId: conReserva, bookingId } = await reserva("semana2", day(51));
  const soloHistorial = await reserva("semana3", day(52));
  await api("DELETE", `/api/admin/bookings/${soloHistorial.bookingId}`, { token: A, body: { reason: "Canceló por teléfono" } });
  const antes = await credits(c.id);
  const r = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(50), endDate: day(56), force: true, reason: "Cierre por vacaciones" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.deleted, 1);
  assert.equal(r.body.cancelled, 2);
  assert.equal(r.body.bookingsCancelled, 1);
  assert.equal(r.body.wa_failed, 1, "sin Evolution configurado: hay que avisar a mano");
  assert.equal(await cuantas(vacia), 0, "la vacía se borró");
  const [cr] = await sql(`SELECT status, cancelled_by, cancellation_reason FROM classes WHERE id=$1`, [conReserva]);
  assert.equal(cr.status, "cancelled");
  assert.equal(cr.cancelled_by, adminId);
  assert.equal(cr.cancellation_reason, "Cierre por vacaciones");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "cancelled", "la reserva sigue, cancelada");
  assert.equal(await credits(c.id), antes + 1, "se devolvió el crédito");
  assert.equal((await sql(`SELECT status FROM classes WHERE id=$1`, [soloHistorial.classId]))[0].status, "cancelled", "con sólo historial se cancela, no se borra");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM bookings WHERE id=$1`, [soloHistorial.bookingId]))[0].n, 1, "su reserva cancelada sigue");
  const [wk] = await sql(`SELECT reason, after FROM audit_log WHERE action='class.week_clear' AND meta->>'start' = $1`, [day(50)]);
  assert.equal(wk.reason, "Cierre por vacaciones");
  assert.equal(wk.after.deleted, 1);
  const cancels = await sql(`SELECT entity_id FROM audit_log WHERE action='class.cancel' AND meta->>'source'='week_clear' AND entity_id = ANY($1::uuid[])`, [[conReserva, soloHistorial.classId]]);
  assert.equal(cancels.length, 2);
});

test("limpiar semana no toca clases que ya ocurrieron", async () => {
  const { c, classId, bookingId } = await reserva("pasada", day(20));
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-200), classId]);
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`, [bookingId]);
  const antes = await credits(c.id);
  const r = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(-200), endDate: day(-200) } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.kept, 1);
  assert.equal(r.body.deleted, 0);
  assert.notEqual((await sql(`SELECT status FROM classes WHERE id=$1`, [classId]))[0].status, "cancelled");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "checked_in");
  assert.equal(await credits(c.id), antes, "no se devuelve crédito de una clase que ocurrió");
});

test("rango inválido → 400, nunca 500", async () => {
  for (const body of [{}, { startDate: "basura", endDate: day(1) }, { startDate: day(5), endDate: day(1) }, { startDate: day(0), endDate: day(60) }]) {
    const r = await api("DELETE", "/api/classes/week", { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("borrar una clase con reservas → 409; sin reservas se borra y queda en la bitácora; inexistente → 404", async () => {
  const { classId } = await reserva("borrar", day(33));
  const r409 = await api("DELETE", `/api/admin/classes/${classId}`, { token: A });
  assert.equal(r409.status, 409);
  assert.equal(r409.body.code, "CLASS_HAS_BOOKINGS");
  assert.equal(await cuantas(classId), 1);
  const vacia = await makeClass(A, f, { date: day(34) });
  const ok = await api("DELETE", `/api/admin/classes/${vacia}`, { token: A });
  assert.equal(ok.status, 200);
  assert.equal(await cuantas(vacia), 0);
  const [log] = await sql(`SELECT actor_id FROM audit_log WHERE entity_id=$1 AND action='class.delete'`, [vacia]);
  assert.equal(log.actor_id, adminId);
  assert.equal((await api("DELETE", `/api/admin/classes/${crypto.randomUUID()}`, { token: A })).status, 404);
});
