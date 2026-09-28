// Tarea 4 · auditoría 2026-09-27, bloque 3 (P1-1 · B5 · B4 · H4). Al liberarse
// un lugar sube sola la primera de la fila (orden de llegada) que pueda usarlo,
// hasta 2 h antes; nadie se salta la fila; dos liberaciones a la vez no suben dos
// veces a la misma ni pasan el cupo. El barrido (WAITLIST_SWEEP_MINUTES) va
// apagado en la base de pruebas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, liveBookings, bookingId, cleanup, closeDb, day, ventanaAhora, ADMIN, DB, STUDIO_TIMEZONE } from "./helpers.mjs";

const PFX = "rgfila";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  await cleanup(PFX);
  // Plan propio (inactivo) de la prueba del tope semanal bajo candado.
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

async function clienta(key, clases = 8) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, clases);
  return c;
}
async function reservar(c, classId) {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return { id: bookingId(r), status: r.body.booking?.status, body: r.body };
}
const estado = async (id) => (await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [id]))[0].s;
const cancelarEstudio = (id) => api("DELETE", `/api/admin/bookings/${id}`, { token: A, body: { reason: "La movimos a otra clase" } });
const subidas = (id) => sql(`SELECT actor_id, actor_name, meta FROM audit_log WHERE entity_id = $1 AND action = 'booking.waitlist_promoted'`, [id]);

test("al cancelar el estudio sube la primera de la fila: confirmada, usa su clase y queda en la bitácora como Sistema", async () => {
  const a = await clienta("a1");
  const w1 = await clienta("w1");
  const w2 = await clienta("w2");
  const classId = await makeClass(A, f, { date: day(10), cap: 1 });
  const ra = await reservar(a, classId);
  const r1 = await reservar(w1, classId);
  const r2 = await reservar(w2, classId);
  assert.equal(r1.status, "waitlist");
  assert.equal(r2.status, "waitlist");
  assert.equal(await credits(w1.id), 8, "estar en la fila no usa clase");
  const c = await cancelarEstudio(ra.id);
  assert.equal(c.status, 200, JSON.stringify(c.body).slice(0, 200));
  assert.equal(await estado(r1.id), "confirmed");
  assert.equal(await estado(r2.id), "waitlist");
  assert.equal(await credits(w1.id), 7, "usa su clase como una reserva normal");
  assert.equal(await liveBookings(classId), 1);
  const [log] = await subidas(r1.id);
  assert.equal(log.actor_id, null);
  assert.equal(log.actor_name, "Sistema");
  assert.equal(log.meta.actor, "system");
  assert.equal(log.meta.position, 1);
  const [b] = await sql(`SELECT promoted_at FROM bookings WHERE id = $1`, [r1.id]);
  assert.ok(b.promoted_at);
  const promo = c.body.data.waitlist_promoted;
  assert.equal(promo.length, 1);
  assert.equal(promo[0].user_id, w1.id);
  assert.ok(["unreached", "disabled"].includes(promo[0].whatsapp), `sin WhatsApp conectado no se finge el aviso (${promo[0].whatsapp})`);
  const mias = await api("GET", "/api/bookings/my-bookings", { token: w2.token });
  assert.equal(mias.body.data.find((x) => x.id === r2.id).waitlist_position, 1, "la que sigue ya es la primera");
});

test("la primera sin clases se salta y sigue en la fila; sube la siguiente", async () => {
  const a = await clienta("a2");
  const sin = await clienta("sin");
  const w = await clienta("w3");
  const classId = await makeClass(A, f, { date: day(11), cap: 1 });
  const ra = await reservar(a, classId);
  const rs = await reservar(sin, classId);
  const rw = await reservar(w, classId);
  await sql(`UPDATE memberships SET classes_remaining = 0 WHERE user_id = $1`, [sin.id]);
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rs.id), "waitlist", "la saltada sigue en la fila");
  assert.equal(await estado(rw.id), "confirmed");
  const [log] = await subidas(rw.id);
  assert.equal(log.meta.position, 2);
  assert.deepEqual(log.meta.skipped.map((s) => [s.booking_id, s.reason]), [[rs.id, "sin_clases"]]);
  const roster = await api("GET", `/api/classes/${classId}/roster`, { token: A });
  const fila = roster.body.data.roster.filter((x) => x.status === "waitlist");
  assert.deepEqual(fila.map((x) => [x.bookingId, x.waitlistPosition]), [[rs.id, 1]]);
});

test("nadie se salta la fila: con un lugar libre y fila, la reserva nueva entra a la fila y sube la que esperaba", async () => {
  const a = await clienta("a3");
  const w = await clienta("w4");
  const nueva = await clienta("nueva");
  const classId = await makeClass(A, f, { date: day(12), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  // Un lugar que se liberó sin pasar por el gancho (p. ej. un reinicio a media cancelación).
  await sql(`UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [ra.id]);
  const rn = await reservar(nueva, classId);
  assert.equal(rn.status, "waitlist", "la nueva no se salta a quien ya esperaba");
  assert.equal(rn.body.message, "Añadido a lista de espera");
  assert.equal(await estado(rw.id), "confirmed", "sube la que esperaba");
  assert.equal(await liveBookings(classId), 1);
  const mias = await api("GET", "/api/bookings/my-bookings", { token: nueva.token });
  assert.equal(mias.body.data.find((x) => x.id === rn.id).waitlist_position, 1);
  const cls = await api("GET", `/api/classes/${classId}`);
  assert.equal(cls.body.data.waitlist_count, 1);
});

test("si las de adelante no pueden usar el lugar, sube la nueva (el lugar no se desperdicia)", async () => {
  const a = await clienta("a4");
  const sin = await clienta("sin2");
  const nueva = await clienta("nueva2");
  const classId = await makeClass(A, f, { date: day(13), cap: 1 });
  const ra = await reservar(a, classId);
  const rs = await reservar(sin, classId);
  await sql(`UPDATE memberships SET classes_remaining = 0 WHERE user_id = $1`, [sin.id]);
  await cancelarEstudio(ra.id);
  assert.equal(await liveBookings(classId), 0, "la única de la fila no tiene clases: nadie sube");
  const antes = await credits(nueva.id);
  const rn = await reservar(nueva, classId);
  assert.equal(rn.status, "confirmed");
  assert.equal(rn.body.message, "Reserva confirmada");
  assert.equal(await credits(nueva.id), antes - 1);
  assert.equal(await estado(rs.id), "waitlist");
});

test("a menos de 2 horas no sube nadie y recepción asigna directo el lugar libre", async () => {
  const a = await clienta("a5");
  const w = await clienta("w5");
  const walk = await clienta("walk");
  const v = ventanaAhora(90);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end, cap: 1 });
  const asignar = (u) => api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: u.id, classId } });
  assert.ok((await asignar(a)).status < 300);
  const enFila = await asignar(w);
  assert.equal(enFila.body.data.isWaitlist, true);
  const [ba] = await sql(`SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, a.id]);
  const [bw] = await sql(`SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, w.id]);
  await cancelarEstudio(ba.id);
  assert.equal(await estado(bw.id), "waitlist", "a menos de 2 h no sube nadie");
  const directo = await asignar(walk);
  assert.equal(directo.status, 201, JSON.stringify(directo.body).slice(0, 200));
  assert.equal(directo.body.data.isWaitlist, false, "el lugar quedó libre: recepción asigna directo");
});

test("subir el cupo sube a la fila", async () => {
  const a = await clienta("a6");
  const w = await clienta("w6");
  const classId = await makeClass(A, f, { date: day(14), cap: 1 });
  await reservar(a, classId);
  const rw = await reservar(w, classId);
  const r = await api("PUT", `/api/admin/classes/${classId}`, { token: A, body: { maxCapacity: 2 } });
  assert.equal(r.status, 200);
  assert.equal(await estado(rw.id), "confirmed");
});

test("cancelar la membresía de una inscrita sube a la fila", async () => {
  const a = await clienta("a7");
  const w = await clienta("w7");
  const classId = await makeClass(A, f, { date: day(15), cap: 1 });
  await reservar(a, classId);
  const rw = await reservar(w, classId);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id = $1`, [a.id]);
  const r = await api("PUT", `/api/memberships/${m.id}/cancel`, { token: A, body: { reason: "Se mudó de ciudad" } });
  assert.equal(r.status, 200);
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal(r.body.waitlist_promoted.length, 1);
});

test("una clase cerrada no sube a nadie; al reabrirla sí", async () => {
  const a = await clienta("a8");
  const w = await clienta("w8");
  const classId = await makeClass(A, f, { date: day(16), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  assert.equal((await api("PUT", `/api/classes/${classId}/close`, { token: A })).status, 200);
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rw.id), "waitlist");
  assert.equal((await api("PUT", `/api/classes/${classId}/reopen`, { token: A })).status, 200);
  assert.equal(await estado(rw.id), "confirmed");
});

test("dos liberaciones a la vez con dos en fila suben a las dos, una vez cada una, sin pasar el cupo", async () => {
  const a = await clienta("c1");
  const b = await clienta("c2");
  const w1 = await clienta("cw1");
  const w2 = await clienta("cw2");
  const classId = await makeClass(A, f, { date: day(17), cap: 2 });
  const ra = await reservar(a, classId);
  const rb = await reservar(b, classId);
  const r1 = await reservar(w1, classId);
  const r2 = await reservar(w2, classId);
  const [x, y] = await Promise.all([cancelarEstudio(ra.id), cancelarEstudio(rb.id)]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 200);
  assert.equal(await estado(r1.id), "confirmed");
  assert.equal(await estado(r2.id), "confirmed");
  assert.equal(await liveBookings(classId), 2);
  assert.equal((await subidas(r1.id)).length, 1);
  assert.equal((await subidas(r2.id)).length, 1);
  assert.equal(await credits(w1.id), 7);
  assert.equal(await credits(w2.id), 7);
});

test("dos liberaciones a la vez con una sola en fila: sube una vez y queda un lugar libre", async () => {
  const a = await clienta("d1");
  const b = await clienta("d2");
  const w = await clienta("dw");
  const classId = await makeClass(A, f, { date: day(18), cap: 2 });
  const ra = await reservar(a, classId);
  const rb = await reservar(b, classId);
  const rw = await reservar(w, classId);
  await Promise.all([cancelarEstudio(ra.id), cancelarEstudio(rb.id)]);
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal((await subidas(rw.id)).length, 1, "no sube dos veces a la misma");
  assert.equal(await credits(w.id), 7, "una sola clase usada");
  assert.equal(await liveBookings(classId), 1);
});

test("cancelación y reserva nueva a la vez: sube la de la fila y la nueva queda detrás", async () => {
  const a = await clienta("e1");
  const w = await clienta("ew");
  const nueva = await clienta("en");
  const classId = await makeClass(A, f, { date: day(19), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  const [, rn] = await Promise.all([
    cancelarEstudio(ra.id),
    api("POST", "/api/bookings", { token: nueva.token, body: { classId } }),
  ]);
  assert.ok(rn.status < 300, JSON.stringify(rn.body).slice(0, 150));
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal(await estado(bookingId(rn)), "waitlist");
  assert.equal(await liveBookings(classId), 1);
});

// ── Revisión previa del plan: R5, R14 y la ráfaga de concurrencia ──────────

test("membresía cancelada justo antes de la subida: no sube con ella y sube la siguiente", async () => {
  const a = await clienta("f1");
  const w = await clienta("fw");
  const w2 = await clienta("fw2");
  const classId = await makeClass(A, f, { date: day(20), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  const rw2 = await reservar(w2, classId);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id = $1`, [w.id]);
  // Otra transacción cancela su membresía y todavía no confirma: la subida la
  // elige (la ve activa) y se forma en su candado. Al confirmar la otra, la
  // subida debe ver que ya no está activa y no usarla.
  const otra = new pg.Client({ connectionString: DB, options: `-c TimeZone=${STUDIO_TIMEZONE}` });
  await otra.connect();
  let cancel;
  try {
    await otra.query("BEGIN");
    await otra.query(`UPDATE memberships SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [m.id]);
    cancel = cancelarEstudio(ra.id);
    let esperando = false;
    for (let i = 0; i < 100 && !esperando; i++) {
      const [q] = await sql(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%FROM memberships WHERE id = $1 FOR UPDATE%'`,
      );
      esperando = q.n > 0;
      if (!esperando) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(esperando, "la subida debió formarse en el candado de la membresía");
    await otra.query("COMMIT");
  } finally {
    await otra.query("ROLLBACK").catch(() => {});
    await otra.end();
  }
  const c = await cancel;
  assert.equal(c.status, 200, JSON.stringify(c.body).slice(0, 200));
  assert.equal(await estado(rw.id), "waitlist", "con la membresía cancelada no sube");
  assert.equal((await subidas(rw.id)).length, 0);
  const [mm] = await sql(`SELECT classes_remaining FROM memberships WHERE id = $1`, [m.id]);
  assert.equal(mm.classes_remaining, 8, "no se descontó nada de la membresía cancelada");
  assert.equal(await estado(rw2.id), "confirmed", "sube la siguiente");
  assert.deepEqual(c.body.data.waitlist_promoted.map((p) => p.user_id), [w2.id]);
});

test("una clienta dada de baja en la fila se salta y sube la siguiente", async () => {
  const a = await clienta("g1");
  const baja = await clienta("gbaja");
  const w = await clienta("gw");
  const classId = await makeClass(A, f, { date: day(21), cap: 1 });
  const ra = await reservar(a, classId);
  const rb = await reservar(baja, classId);
  const rw = await reservar(w, classId);
  await sql(`UPDATE users SET anonymized_at = NOW() WHERE id = $1`, [baja.id]);
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rb.id), "waitlist", "la dada de baja no sube");
  assert.equal(await credits(baja.id), 8);
  assert.equal(await estado(rw.id), "confirmed");
  const [log] = await subidas(rw.id);
  assert.deepEqual(log.meta.skipped.map((s) => [s.booking_id, s.reason]), [[rb.id, "baja"]]);
});

test("ráfaga: 3 liberaciones y 3 reservas nuevas en una clase de cupo 2 no pasan el cupo ni suben dos veces a nadie", async () => {
  const a = await clienta("h1");
  const b = await clienta("h2");
  const w1 = await clienta("hw1");
  const w2 = await clienta("hw2");
  const w3 = await clienta("hw3");
  const nuevas = [await clienta("hn1"), await clienta("hn2"), await clienta("hn3")];
  const classId = await makeClass(A, f, { date: day(22), cap: 2 });
  const ra = await reservar(a, classId);
  const rb = await reservar(b, classId);
  const r1 = await reservar(w1, classId);
  const r2 = await reservar(w2, classId);
  const r3 = await reservar(w3, classId);
  // Tres liberaciones: el estudio cancela a las dos inscritas y a la primera de
  // la fila (que puede alcanzar a subir antes y entonces libera su lugar).
  const res = await Promise.all([
    cancelarEstudio(ra.id),
    cancelarEstudio(rb.id),
    cancelarEstudio(r1.id),
    ...nuevas.map((n) => api("POST", "/api/bookings", { token: n.token, body: { classId } })),
  ]);
  for (const r of res) assert.ok(r.status < 300, `${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  assert.ok(await liveBookings(classId) <= 2, "nunca más que el cupo");
  assert.equal(await liveBookings(classId), 2, "con fila que puede subir, el lugar no se desperdicia");
  assert.equal(await estado(r1.id), "cancelled");
  assert.equal(await estado(r2.id), "confirmed");
  assert.equal(await estado(r3.id), "confirmed");
  for (const r of res.slice(3)) assert.equal(await estado(bookingId(r)), "waitlist", "las nuevas quedan detrás de la fila");
  const filas = await sql(
    `SELECT b.id, b.promoted_at, (SELECT COUNT(*)::int FROM audit_log l
        WHERE l.entity_id = b.id AND l.action = 'booking.waitlist_promoted') AS logs
       FROM bookings b WHERE b.class_id = $1`,
    [classId],
  );
  for (const x of filas) assert.equal(x.logs, x.promoted_at ? 1 : 0, `cada subida deja exactamente una fila en la bitácora (${x.id})`);
  assert.equal(await credits(w2.id), 7);
  assert.equal(await credits(w3.id), 7);
  assert.equal(await credits(w1.id), 8, "la cancelada no pierde su clase");
  for (const n of nuevas) assert.equal(await credits(n.id), 8, "estar en la fila no usa clase");
});

// ── La pantalla de la app puede ir atrás de la subida ──────────────────────

test("salir de la fila con la pantalla desfasada: si ya subió, 409 ALREADY_PROMOTED y no cambia nada", async () => {
  const a = await clienta("s1a");
  const w = await clienta("s1w");
  const classId = await makeClass(A, f, { date: day(23), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  assert.equal(rw.status, "waitlist");
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rw.id), "confirmed", "la subió el estudio mientras la app la mostraba en la fila");
  const foto = async () => (await sql(
    `SELECT m.cancellations_used, m.classes_remaining, u.faltas_count
       FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.user_id = $1`, [w.id]))[0];
  const antes = await foto();
  const r = await api("DELETE", `/api/bookings/${rw.id}?expect=waitlist`, { token: w.token });
  assert.equal(r.status, 409, JSON.stringify(r.body).slice(0, 200));
  assert.deepEqual(r.body, {
    code: "ALREADY_PROMOTED",
    message: "Ya subiste de la lista de espera: tu lugar está confirmado. Si quieres cancelarlo, aplican las reglas de cancelación.",
  });
  assert.equal(await estado(rw.id), "confirmed");
  assert.deepEqual(await foto(), antes, "ni cuota, ni clase, ni falta");
  assert.equal(await liveBookings(classId), 1);
  // Si de verdad sigue en la fila, ?expect=waitlist sale como siempre y sin cuota.
  const w2 = await clienta("s1w2");
  const rw2 = await reservar(w2, classId);
  assert.equal(rw2.status, "waitlist");
  const sale = await api("DELETE", `/api/bookings/${rw2.id}?expect=waitlist`, { token: w2.token });
  assert.equal(sale.status, 200, JSON.stringify(sale.body).slice(0, 200));
  assert.equal(sale.body.leftWaitlist, true);
  assert.equal(sale.body.cancellationsUsed, 0);
  assert.equal(await estado(rw2.id), "cancelled");
});

// ── La subida revalida bajo candado y sólo corre cuando se libera lugar ─────

test("tope semanal lleno entre la elección y el candado: no sube con él y sube la siguiente", async () => {
  const a = await clienta("t1a");
  const w = await clienta("t1w");
  const w2 = await clienta("t1w2");
  const [semanal] = await sql(
    `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
     VALUES ($1, 'Plan de la regresión: tope semanal', 1000, 'MXN', 30, 8, $2, false, 999)
     RETURNING id, weekly_class_limit`,
    [`${PFX} QA 1 Clase por semana`, f.category],
  );
  assert.equal(semanal.weekly_class_limit, 1);
  await sql(`UPDATE memberships SET plan_id = $2 WHERE user_id = $1`, [w.id, semanal.id]);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id = $1`, [w.id]);
  const classId = await makeClass(A, f, { date: day(24), cap: 1 });
  const otraClase = await makeClass(A, f, { date: day(24), start: "09:00", end: "10:00", cap: 5 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  const rw2 = await reservar(w2, classId);
  // Otra transacción le reserva otra clase de la misma semana con esa membresía
  // y todavía no confirma: la subida la elige (su tope aún se ve libre) y se
  // forma en el candado de la membresía. Al confirmar, el tope ya está lleno.
  const otra = new pg.Client({ connectionString: DB, options: `-c TimeZone=${STUDIO_TIMEZONE}` });
  await otra.connect();
  let cancel;
  try {
    await otra.query("BEGIN");
    await otra.query(`SELECT id FROM memberships WHERE id = $1 FOR UPDATE`, [m.id]);
    await otra.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status) VALUES ($1, $2, $3, 'confirmed')`,
      [otraClase, w.id, m.id],
    );
    cancel = cancelarEstudio(ra.id);
    let esperando = false;
    for (let i = 0; i < 100 && !esperando; i++) {
      const [q] = await sql(
        `SELECT COUNT(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query ILIKE '%FROM memberships WHERE id = $1 FOR UPDATE%'`,
      );
      esperando = q.n > 0;
      if (!esperando) await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(esperando, "la subida debió formarse en el candado de la membresía");
    await otra.query("COMMIT");
  } finally {
    await otra.query("ROLLBACK").catch(() => {});
    await otra.end();
  }
  const c = await cancel;
  assert.equal(c.status, 200, JSON.stringify(c.body).slice(0, 200));
  assert.equal(await estado(rw.id), "waitlist", "con el tope semanal lleno no sube");
  assert.equal((await subidas(rw.id)).length, 0);
  const [semana] = await sql(
    `SELECT COUNT(*)::int AS n FROM bookings WHERE membership_id = $1 AND status IN ('confirmed', 'checked_in')`, [m.id]);
  assert.equal(semana.n, 1, "nunca más reservas en la semana que su tope");
  assert.equal(await estado(rw2.id), "confirmed", "sube la siguiente");
  const [log] = await subidas(rw2.id);
  assert.deepEqual(log.meta.skipped.map((x) => [x.booking_id, x.reason]), [[rw.id, "tope_semanal"]]);
});

test("editar sólo la coach de una clase con lugar y fila no sube a nadie; subir el cupo o reabrirla sí", async () => {
  const a = await clienta("e5a");
  const w = await clienta("e5w");
  const classId = await makeClass(A, f, { date: day(25), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  // Un lugar que se liberó sin pasar por el gancho: hay lugar y fila a la vez.
  await sql(`UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [ra.id]);
  const coach = await api("POST", "/api/instructors", { token: A, body: { displayName: `${PFX} Coach 2`, isActive: true } });
  assert.ok(coach.body?.data?.id, JSON.stringify(coach.body).slice(0, 150));
  const put = (body) => api("PUT", `/api/admin/classes/${classId}`, { token: A, body });

  const r = await put({ instructorId: coach.body.data.id });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.instructor_id, coach.body.data.id);
  assert.deepEqual(r.body.waitlist_promoted, []);
  assert.equal(await estado(rw.id), "waitlist", "cambiar la coach no inscribe a nadie");
  assert.equal(await credits(w.id), 8, "ni le descuenta una clase");

  const mismo = await put({ maxCapacity: 1, notes: "sin cambio de cupo" });
  assert.equal(mismo.status, 200);
  assert.deepEqual(mismo.body.waitlist_promoted, [], "el mismo cupo no libera lugares");
  assert.equal(await estado(rw.id), "waitlist");

  assert.equal((await put({ status: "closed" })).status, 200);
  const reabre = await put({ status: "scheduled" });
  assert.equal(reabre.status, 200);
  assert.equal(reabre.body.waitlist_promoted.length, 1, "de cerrada a programada sí sube la fila");
  assert.equal(await estado(rw.id), "confirmed");
});
