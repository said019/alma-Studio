// Tarea 9 · auditoría 2026-09-27, bloque 3 (familia de P1-5). Un plan con
// membresías, órdenes o códigos de descuento se archiva en lugar de borrarse,
// aunque llegue ?cascade=true; uno sin nada ligado se borra. Todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgplan";
let A, f;
const nuevoPlan = async (nombre) => (await sql(
  `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
   VALUES ($1, 'Plan de la prueba de archivar', 900, 'MXN', 30, 4, $2, true, 997) RETURNING id`,
  [`${PFX} ${nombre}`, f.category],
))[0].id;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  await sql(`DELETE FROM discount_codes WHERE code LIKE 'RGPLAN%'`);
  await cleanup(PFX);
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

test("con una membresía vendida, ?cascade=true archiva en vez de borrar y no toca la membresía ni la orden", async () => {
  const planId = await nuevoPlan("vendido");
  const c = await makeClient(PFX, "compra");
  const venta = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(venta.status, 201, JSON.stringify(venta.body).slice(0, 200));
  const r = await api("DELETE", `/api/plans/${planId}?cascade=true`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.archived, true);
  assert.equal(r.body.message, "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.");
  const [p] = await sql(`SELECT is_active, archived_at, archived_by FROM plans WHERE id = $1`, [planId]);
  assert.equal(p.is_active, false);
  assert.ok(p.archived_at);
  assert.ok(p.archived_by);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM memberships WHERE plan_id = $1`, [planId]))[0].n, 1);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM orders WHERE plan_id = $1`, [planId]))[0].n, 1);
  const [log] = await sql(`SELECT before, after, meta FROM audit_log WHERE entity_id = $1 AND action = 'plan.archive'`, [planId]);
  assert.deepEqual(log.before, { for_sale: true });
  assert.deepEqual(log.after, { for_sale: false });
  assert.equal(log.meta.cascade_requested, true);
  assert.deepEqual(log.meta.kept, { memberships: 1, orders: 1, discount_codes: 0 });
  const enVenta = (await api("GET", "/api/plans?active=true", { token: A })).body.data;
  assert.ok(!enVenta.some((x) => x.id === planId), "archivado: fuera de la venta");
  const otra = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId, paymentMethod: "cash" } });
  assert.equal(otra.status, 404, "no se puede vender un plan archivado");
});

test("un plan con un código de descuento también se archiva y el código se queda ligado", async () => {
  const planId = await nuevoPlan("concodigo");
  await sql(`INSERT INTO discount_codes (code, discount_type, discount_value, plan_id, is_active) VALUES ('RGPLAN10', 'percent', 10, $1, true)`, [planId]);
  const r = await api("DELETE", `/api/plans/${planId}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.archived, true);
  const [d] = await sql(`SELECT plan_id FROM discount_codes WHERE code = 'RGPLAN10'`);
  assert.equal(d.plan_id, planId, "el código no se vuelve de todos los planes");
});

test("un plan sin nada ligado se borra y queda en la bitácora", async () => {
  const planId = await nuevoPlan("vacio");
  const r = await api("DELETE", `/api/plans/${planId}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.deleted, true);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM plans WHERE id = $1`, [planId]))[0].n, 0);
  const [log] = await sql(`SELECT before, meta FROM audit_log WHERE entity_id = $1 AND action = 'plan.delete'`, [planId]);
  assert.equal(log.before.plan_name, `${PFX} vacio`);
  assert.equal(log.meta.plan_name, `${PFX} vacio`);
});

test("inexistente → 404; id basura → 400", async () => {
  assert.equal((await api("DELETE", `/api/plans/${crypto.randomUUID()}`, { token: A })).status, 404);
  assert.equal((await api("DELETE", "/api/plans/basura", { token: A })).status, 400);
});
