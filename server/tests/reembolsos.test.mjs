// Tarea 7 · auditoría 2026-09-27, bloque 3 (P1-12 · E6 · EC11). La dueña
// registra reembolsos total o parcial de una orden aprobada: no más de lo cobrado
// ni dos totales; ajusta las clases; los reportes, el dashboard y /api/payments
// restan el reembolso en su fecha; todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, bookingId, cleanup, closeDb, day, ADMIN, DB } from "./helpers.mjs";

const PFX = "rgreemb";
let A, f, recep, precio, parte;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  const planes = await api("GET", "/api/plans", { token: A });
  precio = Number(planes.body.data.find((p) => p.id === f.plan.id).effectivePrice);
  assert.ok(precio > 10, `el plan de prueba debe cobrar algo (precio=${precio})`);
  parte = Math.round(precio * 0.3);
});
after(async () => {
  await sql(`DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  await cleanup(PFX);
  await closeDb();
});

async function venta(key) {
  const c = await makeClient(PFX, key);
  const r = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [m] = await sql(`SELECT id, order_id, classes_remaining FROM memberships WHERE user_id = $1`, [c.id]);
  assert.ok(m.order_id, "la venta de mostrador liga su orden (bloque 2)");
  return { c, membershipId: m.id, orderId: m.order_id, clases: m.classes_remaining };
}
const reembolsar = (orderId, body, token = A) =>
  api("POST", `/api/admin/orders/${orderId}/refunds`, { token, body: { method: "cash", reason: "Se mudó de ciudad", ...body } });

test("total: registra, marca la orden, cancela la membresía y sus reservas futuras, y queda en la bitácora", async () => {
  const { c, membershipId, orderId } = await venta("total");
  const classId = await makeClass(A, f, { date: day(9) });
  assert.equal((await api("POST", "/api/bookings", { token: c.token, body: { classId } })).status, 201);
  const r = await reembolsar(orderId, { kind: "total", method: "transfer", reference: "SPEI 123", reason: "No pudo seguir por lesión" });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(Number(r.body.data.refund.amount), precio);
  assert.equal(r.body.data.order.refund_status, "refunded");
  assert.equal(r.body.data.bookings_cancelled, 1);
  const [o] = await sql(`SELECT status::text AS s, refunded_amount, refund_status, refunded_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(o.s, "approved", "la orden sigue aprobada: nada de lo que cuenta órdenes aprobadas se rompe");
  assert.equal(Number(o.refunded_amount), precio);
  assert.equal(o.refund_status, "refunded");
  assert.ok(o.refunded_at);
  const [m] = await sql(`SELECT status::text AS s, classes_remaining, cancellation_reason FROM memberships WHERE id = $1`, [membershipId]);
  assert.equal(m.s, "cancelled");
  assert.equal(m.classes_remaining, 0);
  assert.match(m.cancellation_reason, /^Reembolso total: No pudo seguir por lesión/);
  const [b] = await sql(`SELECT status::text AS s, cancellation_reason FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, c.id]);
  assert.equal(b.s, "cancelled");
  const [log] = await sql(`SELECT actor_id, reason, before, after, meta FROM audit_log WHERE entity_id = $1 AND action = 'order.refund'`, [orderId]);
  assert.equal(log.reason, "No pudo seguir por lesión");
  assert.equal(log.meta.kind, "total");
  assert.equal(Number(log.meta.amount), precio);
  assert.equal(log.meta.method, "transfer");
  assert.equal(log.meta.reference, "SPEI 123");
  assert.equal(log.meta.bookings_cancelled, 1);
  assert.equal(log.after.refund_status, "refunded");
  assert.equal(log.after.membership_status, "cancelled");
  const otra = await reembolsar(orderId, { kind: "total" });
  assert.equal(otra.status, 409);
  assert.equal(otra.body.code, "ALREADY_REFUNDED");
});

test("parcial: quita las clases elegidas, la membresía sigue activa y no deja pasar de lo cobrado", async () => {
  const { membershipId, orderId, clases } = await venta("parcial");
  const r = await reembolsar(orderId, { kind: "partial", amount: parte, classesToRemove: 2 });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.order.refund_status, "partially_refunded");
  const [m] = await sql(`SELECT status::text AS s, classes_remaining FROM memberships WHERE id = $1`, [membershipId]);
  assert.equal(m.s, "active");
  assert.equal(m.classes_remaining, clases - 2);
  const quedan = precio - parte;
  const mas = await reembolsar(orderId, { kind: "partial", amount: quedan + 1 });
  assert.equal(mas.status, 400);
  assert.match(mas.body.message, /^No puedes reembolsar más de lo cobrado: quedan/);
  const exacto = await reembolsar(orderId, { kind: "partial", amount: quedan });
  assert.equal(exacto.body.message, "Es todo lo que queda por devolver: elige reembolso total.");
  const muchas = await reembolsar(orderId, { kind: "partial", amount: 1, classesToRemove: clases });
  assert.equal(muchas.status, 400);
  assert.equal(muchas.body.message, `Sólo le quedan ${clases - 2} clases sin usar.`);
  const resto = await reembolsar(orderId, { kind: "total" });
  assert.equal(resto.status, 201);
  assert.equal(Number(resto.body.data.refund.amount), quedan, "el total devuelve sólo lo que quedaba");
  const [o] = await sql(`SELECT refunded_amount, refund_status FROM orders WHERE id = $1`, [orderId]);
  assert.equal(Number(o.refunded_amount), precio);
  assert.equal(o.refund_status, "refunded");
});

test("dos totales a la vez: uno pasa y el otro 409 (no se devuelve dos veces)", async () => {
  const { orderId } = await venta("doble");
  const [x, y] = await Promise.all([reembolsar(orderId, { kind: "total" }), reembolsar(orderId, { kind: "total" })]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId]))[0].n, 1);
});

test("sin motivo, método o tipo malos → 400; recepción → 403; inexistente → 404; id basura → 400", async () => {
  const { orderId } = await venta("malas");
  const sin = await api("POST", `/api/admin/orders/${orderId}/refunds`, { token: A, body: { kind: "total", method: "cash" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await reembolsar(orderId, { kind: "total", method: "cheque" })).status, 400);
  assert.equal((await reembolsar(orderId, { kind: "casi" })).status, 400);
  assert.equal((await reembolsar(orderId, { kind: "total" }, recep.token)).status, 403);
  assert.equal((await reembolsar(crypto.randomUUID(), { kind: "total" })).status, 404);
  assert.equal((await api("POST", "/api/admin/orders/basura/refunds", { token: A, body: { kind: "total", method: "cash", reason: "Motivo válido" } })).status, 400);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId]))[0].n, 0);
});

test("una cortesía, una orden sin pagar o una de Wellhub no se reembolsan (409)", async () => {
  const c = await makeClient(PFX, "cortesia");
  const r = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0), amount: 0, reason: "Cortesía por evento de apertura" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [m] = await sql(`SELECT order_id FROM memberships WHERE user_id = $1`, [c.id]);
  const cero = await reembolsar(m.order_id, { kind: "total" });
  assert.equal(cero.status, 409);
  assert.equal(cero.body.code, "NOTHING_CHARGED");
  const [p] = await sql(`INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount) VALUES ($1, $2, 'pending_verification', 'transfer', 100, 100) RETURNING id`, [c.id, f.plan.id]);
  assert.equal((await reembolsar(p.id, { kind: "total" })).body.code, "ORDER_NOT_PAID");
  const [w] = await sql(`INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount, channel) VALUES ($1, $2, 'approved', 'cash', 170, 170, 'wellhub') RETURNING id`, [c.id, f.plan.id]);
  assert.equal((await reembolsar(w.id, { kind: "total" })).body.code, "WELLHUB_ORDER");
  // El panel necesita el canal para no ofrecer "Reembolsar" en una orden de Wellhub.
  const pagos = await api("GET", `/api/payments?userId=${c.id}`, { token: A });
  assert.equal(pagos.status, 200);
  assert.equal(pagos.body.data.find((x) => x.id === w.id)?.channel, "wellhub");
});

test("los reportes, el dashboard y /api/payments restan el reembolso en su fecha", async () => {
  const { c, orderId } = await venta("reporte");
  const antes = (await api("GET", "/api/reports/overview", { token: A })).body.data;
  const stAntes = (await api("GET", "/api/admin/stats", { token: A })).body;
  const r = await reembolsar(orderId, { kind: "partial", amount: parte });
  assert.equal(r.status, 201);
  const despues = (await api("GET", "/api/reports/overview", { token: A })).body.data;
  assert.equal(Number(despues.monthlyRevenue), Number(antes.monthlyRevenue) - parte);
  assert.equal(Number(despues.refundsTotal), Number(antes.refundsTotal) + parte);
  assert.equal(Number(despues.grossRevenue), Number(antes.grossRevenue), "las ventas no cambian");
  const stDespues = (await api("GET", "/api/admin/stats", { token: A })).body;
  assert.equal(Number(stDespues.monthlyRevenue), Number(stAntes.monthlyRevenue) - parte);
  const pagos = await api("GET", `/api/payments?userId=${c.id}`, { token: A });
  assert.equal(pagos.status, 200);
  const orden = pagos.body.data.find((p) => p.source === "order");
  assert.equal(orden.refundStatus, "partially_refunded");
  assert.equal(orden.refundedAmount, parte);
  assert.equal(orden.orderId, orderId);
  assert.ok(orden.createdAt, "createdAt para el historial (antes salía vacío)");
  const fila = pagos.body.data.find((p) => p.source === "refund");
  assert.equal(Number(fila.total_amount), -parte);
  assert.match(fila.planName, /^Reembolso · /);
  assert.equal(Number(pagos.body.total), precio - parte);
  assert.equal(Number(pagos.body.refundsTotal), parte);
  const meses = (await api("GET", "/api/reports/revenue", { token: A })).body.data;
  assert.ok(Number(meses.at(-1).refunds) >= parte, "el mes actual resta el reembolso");
});

test("un parcial sobre una membresía ilimitada no quita clases", async () => {
  const { membershipId, orderId } = await venta("ilimitada");
  await sql(`UPDATE memberships SET classes_remaining = NULL WHERE id = $1`, [membershipId]);
  const r = await reembolsar(orderId, { kind: "partial", amount: parte, classesToRemove: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "La membresía es ilimitada: no hay clases que quitar.");
  assert.equal((await reembolsar(orderId, { kind: "partial", amount: parte })).status, 201);
});

// ── Rulings del controlador (R4, R8, R17) ───────────────────────────────────

test("/api/payments rechaza un userId que no es UUID y fechas que no son AAAA-MM-DD (400, no 500)", async () => {
  const basura = await api("GET", "/api/payments?userId=basura", { token: A });
  assert.equal(basura.status, 400);
  assert.equal(basura.body.message, "Identificador inválido");
  for (const q of ["startDate=2026-9-1", "endDate=ayer", "startDate=2026-09-01T00:00:00"]) {
    const r = await api("GET", `/api/payments?${q}`, { token: A });
    assert.equal(r.status, 400, q);
    assert.equal(r.body.message, "Fecha inválida (usa AAAA-MM-DD).", q);
  }
  assert.equal((await api("GET", `/api/payments?startDate=${day(-30)}&endDate=${day(1)}`, { token: A })).status, 200);
});

test("total sobre una membresía ya cancelada: igual cancela sus reservas futuras y no pisa la cancelación", async () => {
  const { c, membershipId, orderId } = await venta("yacancelada");
  const classId = await makeClass(A, f, { date: day(11) });
  assert.equal((await api("POST", "/api/bookings", { token: c.token, body: { classId } })).status, 201);
  await sql(`UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Baja pedida por la clienta' WHERE id = $1`, [membershipId]);
  const r = await reembolsar(orderId, { kind: "total" });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.bookings_cancelled, 1);
  const [m] = await sql(`SELECT status::text AS s, cancellation_reason, classes_remaining FROM memberships WHERE id = $1`, [membershipId]);
  assert.equal(m.s, "cancelled");
  assert.equal(m.cancellation_reason, "Baja pedida por la clienta", "la cancelación previa conserva su motivo");
  assert.equal(m.classes_remaining, 0);
  const [b] = await sql(`SELECT status::text AS s FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, c.id]);
  assert.equal(b.s, "cancelled");
});

/** Una clienta con venta de mostrador, en fila de una clase de cupo 1 que ocupa otra. */
async function enFila(key, date) {
  const v = await venta(key);
  const otra = await makeClient(PFX, `${key}-otra`);
  await giveMembership(A, otra.id, f.plan.id);
  const classId = await makeClass(A, f, { date, cap: 1 });
  const ocupa = await api("POST", "/api/bookings", { token: otra.token, body: { classId } });
  assert.equal(ocupa.status, 201, JSON.stringify(ocupa.body).slice(0, 200));
  const fila = await api("POST", "/api/bookings", { token: v.c.token, body: { classId } });
  assert.equal(fila.status, 201, JSON.stringify(fila.body).slice(0, 200));
  assert.equal(fila.body.booking.status, "waitlist");
  return { ...v, classId, ocupaId: bookingId(ocupa), filaId: bookingId(fila) };
}

test("reembolso total de una clienta en fila y cancelación del estudio en esa clase, a la vez: 201 y 200, sin 500 ni bloqueo", async () => {
  const { orderId, ocupaId, filaId } = await enFila("fila", day(8));
  const [x, y] = await Promise.all([
    reembolsar(orderId, { kind: "total" }),
    api("DELETE", `/api/admin/bookings/${ocupaId}`, { token: A, body: { reason: "La clienta pidió cancelar" } }),
  ]);
  assert.equal(x.status, 201, JSON.stringify(x.body).slice(0, 200));
  assert.equal(y.status, 200, JSON.stringify(y.body).slice(0, 200));
  const rows = await sql(`SELECT id, status::text AS s FROM bookings WHERE id = ANY($1::uuid[])`, [[ocupaId, filaId]]);
  assert.equal(rows.find((b) => b.id === ocupaId).s, "cancelled");
  // La de la fila queda cancelada por el reembolso (o, si la subida le ganó, el
  // reembolso cancela la reserva ya confirmada): nunca queda viva.
  assert.equal(rows.find((b) => b.id === filaId).s, "cancelled");
});

// Espera a que alguna conexión del cluster desechable esté esperando un candado.
async function esperaCandado(ms = 5000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    const [w] = await sql(`SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`);
    if (w.n > 0) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("el reembolso nunca llegó a esperar el candado");
}

test("mismo orden de candados que la subida de la fila (clase → reservas → membresía): no se interbloquean", async () => {
  const { orderId, membershipId, classId, filaId } = await enFila("candados", day(12));
  // Imita la subida: toma la clase y la fila, y al final la membresía de la que sube.
  const subida = new pg.Client({ connectionString: DB });
  await subida.connect();
  let r;
  try {
    await subida.query("BEGIN");
    await subida.query("SELECT id FROM classes WHERE id = $1 FOR UPDATE", [classId]);
    await subida.query("SELECT id FROM bookings WHERE class_id = $1 AND status = 'waitlist' ORDER BY created_at, id FOR UPDATE", [classId]);
    const pendiente = reembolsar(orderId, { kind: "total" });
    await esperaCandado();
    // Si el reembolso tomara la membresía antes que las reservas, aquí habría
    // un interbloqueo y Postgres abortaría a uno de los dos.
    await subida.query("SELECT id FROM memberships WHERE id = $1 FOR UPDATE", [membershipId]);
    await subida.query("ROLLBACK");
    r = await pendiente;
  } finally {
    await subida.end();
  }
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.bookings_cancelled, 1);
  assert.equal((await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [filaId]))[0].s, "cancelled");
});

test("una reserva que se confirma mientras el reembolso espera la membresía también se cancela", async () => {
  const { c, membershipId, orderId } = await venta("carrera");
  const classId = await makeClass(A, f, { date: day(13) });
  // Imita POST /api/bookings: toma la membresía, inserta la reserva y descuenta.
  const reserva = new pg.Client({ connectionString: DB });
  await reserva.connect();
  let r, nueva;
  try {
    await reserva.query("BEGIN");
    await reserva.query("SELECT id FROM memberships WHERE id = $1 FOR UPDATE", [membershipId]);
    [nueva] = (await reserva.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status) VALUES ($1, $2, $3, 'confirmed') RETURNING id`,
      [classId, c.id, membershipId],
    )).rows;
    await reserva.query("UPDATE memberships SET classes_remaining = classes_remaining - 1 WHERE id = $1", [membershipId]);
    const pendiente = reembolsar(orderId, { kind: "total" });
    await esperaCandado();
    await reserva.query("COMMIT");
    r = await pendiente;
  } finally {
    await reserva.end();
  }
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.bookings_cancelled, 1);
  assert.equal((await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [nueva.id]))[0].s, "cancelled",
    "la reserva nueva no se queda viva sobre una membresía reembolsada");
});
