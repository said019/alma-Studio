// Tarea 3 · auditoría 2026-09-27, bloque 2 (P0-3 · E2 · D12 · I5). Venta en
// mostrador con quién, referencia y motivo si es $0 o distinto al plan; ajustes
// de saldo/vigencia/estado con motivo; todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgventas";
let A, adminId, f, listPrice;
const venta = (body) => api("POST", "/api/memberships", { token: A, body: { paymentMethod: "cash", startDate: day(0), ...body } });
const auditOf = (entityId, action) => sql(`SELECT * FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at`, [entityId, action]);
const membresiaDe = async (userId) => (await sql(
  `SELECT m.id, m.activated_by, m.activated_at, m.payment_reference, m.classes_remaining,
          o.id AS oid, o.order_number, o.total_amount, o.discount_amount
     FROM memberships m LEFT JOIN orders o ON o.id = m.order_id
    WHERE m.user_id = $1 ORDER BY m.created_at DESC LIMIT 1`, [userId]))[0];

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
  const planes = await api("GET", "/api/plans", { token: A });
  listPrice = Number(planes.body.data.find((p) => p.id === f.plan.id).effectivePrice);
});
after(async () => {
  await cleanup(PFX);
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

test("venta al precio del plan: activated_by, referencia y bitácora sin motivo", async () => {
  const c = await makeClient(PFX, "lista");
  const r = await venta({ userId: c.id, planId: f.plan.id });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(m.activated_by, adminId);
  assert.ok(m.activated_at);
  assert.ok([m.order_number, m.oid].includes(m.payment_reference), `payment_reference=${m.payment_reference}`);
  assert.equal(Number(m.total_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.subject_user_id, c.id);
  assert.equal(log.reason, null);
  assert.equal(Number(log.after.amount), listPrice);
  assert.equal(log.meta.courtesy, false);
});

test("cortesía $0: sin motivo → 400 y no crea nada; con motivo → orden en $0 y sin puntos de compra", async () => {
  const c = await makeClient(PFX, "cortesia");
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: 0 });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM memberships WHERE user_id=$1`, [c.id]))[0].n, 0);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: 0, reason: "Cortesía por evento de apertura" });
  assert.equal(con.status, 201, JSON.stringify(con.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), 0);
  assert.equal(Number(m.discount_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.reason, "Cortesía por evento de apertura");
  assert.equal(log.meta.courtesy, true);
  const pts = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND description LIKE 'Membresía asignada%'`, [c.id]);
  assert.equal(pts[0].n, 0, "una cortesía no da puntos de compra");
});

test("precio distinto al plan: sin motivo → 400; con motivo → 201 con descuento", async () => {
  const c = await makeClient(PFX, "descuento");
  const cobrado = listPrice - 200;
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado });
  assert.equal(sin.status, 400);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado, reason: "Descuento de amiga de la dueña" });
  assert.equal(con.status, 201);
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), cobrado);
  assert.equal(Number(m.discount_amount), 200);
});

test("la referencia escrita por la admin se guarda tal cual", async () => {
  const c = await makeClient(PFX, "referencia");
  const r = await venta({ userId: c.id, planId: f.plan.id, paymentMethod: "transfer", paymentReference: "SPEI 998877" });
  assert.equal(r.status, 201);
  assert.equal((await membresiaDe(c.id)).payment_reference, "SPEI 998877");
});

test("entradas malas en la venta → 400, nunca 500", async () => {
  const c = await makeClient(PFX, "malas");
  for (const body of [
    { userId: c.id, planId: f.plan.id, amount: "abc" },
    { userId: "basura", planId: f.plan.id },
    { userId: c.id, planId: f.plan.id, paymentReference: "x".repeat(101) },
    { userId: c.id, planId: f.plan.id, startDate: "no-es-fecha" },
    { userId: c.id, planId: f.plan.id, startDate: "2026-02-30" },
  ]) {
    const r = await venta(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
  }
});

test("ajuste de saldo: sin motivo → 400 y no cambia; con motivo → 200 y bitácora antes/después", async () => {
  const c = await makeClient(PFX, "ajuste");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  await sql(`UPDATE memberships SET classes_remaining = 1 WHERE id = $1`, [m.id]);
  const sin = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3 } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await membresiaDe(c.id)).classes_remaining, 1);
  const con = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3, reason: "Compensación por clase cancelada" } });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal((await membresiaDe(c.id)).classes_remaining, 3);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.reason, "Compensación por clase cancelada");
  assert.deepEqual(log.before, { classes_remaining: 1 });
  assert.deepEqual(log.after, { classes_remaining: 3 });
});

test("guardar sin cambios (como el panel) no pide motivo ni escribe bitácora", async () => {
  const c = await makeClient(PFX, "igual");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const [cur] = await sql(`SELECT status::text AS status, classes_remaining, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM memberships WHERE id=$1`, [m.id]);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { status: cur.status, classesRemaining: cur.classes_remaining, startDate: cur.s, endDate: cur.e } });
  assert.equal(r.status, 200);
  assert.equal(r.body.unchanged, true);
  assert.equal((await auditOf(m.id, "membership.adjust")).length, 0);
});

test("cambiar sólo el método: sin motivo y queda en la bitácora", async () => {
  const c = await makeClient(PFX, "metodo");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { paymentMethod: "transfer" } });
  assert.equal(r.status, 200);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.deepEqual(log.after, { payment_method: "transfer" });
});

test("fechas inválidas o fin antes del inicio → 400", async () => {
  const c = await makeClient(PFX, "fechas");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  for (const body of [{ endDate: "2026-13-45", reason: "Motivo válido" }, { startDate: day(10), endDate: day(1), reason: "Motivo válido" }, { classesRemaining: 2.5, reason: "Motivo válido" }]) {
    const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("alta manual con paquete: activated_by, referencia y bitácora; en $0 exige motivo en Notas", async () => {
  const email = `${PFX}_alta@qa.local`;
  const r = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta", email, planId: f.plan.id, paymentMethod: "cash" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [u] = await sql(`SELECT id FROM users WHERE email=$1`, [email]);
  const m = await membresiaDe(u.id);
  assert.equal(m.activated_by, adminId);
  assert.ok(m.payment_reference);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.meta.source, "alta_manual");

  const [p0] = await sql(`INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                          VALUES ($1, 'QA cortesía', 0, 'MXN', 30, 1, $2, true, 999) RETURNING id`, [`${PFX} cortesía`, f.category]);
  const email0 = `${PFX}_alta0@qa.local`;
  const sin = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta 0", email: email0, planId: p0.id, paymentMethod: "cash" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM users WHERE email=$1`, [email0]))[0].n, 0, "se revirtió todo");
  const con = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta 0", email: email0, planId: p0.id, paymentMethod: "cash", notes: "Cortesía por evento de apertura" } });
  assert.equal(con.status, 201, JSON.stringify(con.body).slice(0, 200));
});
