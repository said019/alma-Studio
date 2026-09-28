// Tarea 7 · auditoría 2026-09-27 — membresías vencidas fuera de los conteos de
// activas (reportes, admin/stats), /memberships/my marca isExpired, y
// GET /api/payments no cuenta doble una membresía que ya viene de una orden.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "vencep";
let A, f;

const adminStats = async () => (await api("GET", "/api/admin/stats", { token: A })).body;
const overview = async () => (await api("GET", "/api/reports/overview", { token: A })).body?.data || {};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("una membresía vencida (status='active', end_date pasado) no cuenta como activa", async () => {
  const cliente = await makeClient(PFX, "venc1");
  const antesStats = Number((await adminStats()).activeMembers);
  const antesReporte = Number((await overview()).activeMembers);

  await sql(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, payment_method)
     VALUES ($1, $2, 'active', 3, $3, $4, 'cash')`,
    [cliente.id, f.plan.id, day(-60), day(-10)],
  );

  const despuesStats = Number((await adminStats()).activeMembers);
  const despuesReporte = Number((await overview()).activeMembers);
  assert.equal(despuesStats, antesStats,
    `admin/stats.activeMembers no debe subir con una membresía vencida (antes=${antesStats}, después=${despuesStats})`);
  assert.equal(despuesReporte, antesReporte,
    `reports/overview.activeMembers no debe subir con una membresía vencida (antes=${antesReporte}, después=${despuesReporte})`);
});

test("GET /api/memberships/my marca isExpired:true en una membresía vencida", async () => {
  const cliente = await makeClient(PFX, "venc2");
  await sql(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, payment_method)
     VALUES ($1, $2, 'active', 3, $3, $4, 'cash')`,
    [cliente.id, f.plan.id, day(-60), day(-10)],
  );
  const r = await api("GET", "/api/memberships/my", { token: cliente.token });
  assert.equal(r.status, 200);
  assert.equal(r.body?.data?.isExpired, true,
    `/memberships/my debe marcar isExpired:true (data=${JSON.stringify(r.body?.data)})`);
});

test("GET /api/memberships/my no marca isExpired en una membresía vigente", async () => {
  const cliente = await makeClient(PFX, "venc3");
  await sql(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, payment_method)
     VALUES ($1, $2, 'active', 3, $3, $4, 'cash')`,
    [cliente.id, f.plan.id, day(0), day(60)],
  );
  const r = await api("GET", "/api/memberships/my", { token: cliente.token });
  assert.equal(r.status, 200);
  assert.equal(r.body?.data?.isExpired, false,
    `/memberships/my no debe marcar isExpired en una membresía vigente (data=${JSON.stringify(r.body?.data)})`);
});

test("GET /api/payments no duplica una compra: orden aprobada + membresía con order_id", async () => {
  const cliente = await makeClient(PFX, "venc4");
  const amount = Number(f.plan.price);
  const [orden] = await sql(
    `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount)
     VALUES ($1, $2, 'approved', 'transfer', $3, $3) RETURNING id, total_amount`,
    [cliente.id, f.plan.id, amount],
  );
  await sql(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, payment_method, order_id)
     VALUES ($1, $2, 'active', 8, $3, $4, 'transfer', $5)`,
    [cliente.id, f.plan.id, day(0), day(60), orden.id],
  );

  const r = await api("GET", `/api/payments?userId=${cliente.id}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 1,
    `debe verse una sola fila por la compra, no una por orden y otra por membresía (data=${JSON.stringify(r.body.data)})`);
  assert.equal(r.body.data[0].source, "order", "la fila que queda debe ser la de la orden, no la de la membresía");
  assert.equal(Number(r.body.total), Number(orden.total_amount),
    `total debe ser igual a total_amount de la orden (total=${r.body.total}, orden=${orden.total_amount})`);
});

test("el filtro admin 'activas' (status=active) de la lista de membresías excluye las vencidas", async () => {
  const cliente = await makeClient(PFX, "venc5");
  await sql(
    `INSERT INTO memberships (user_id, plan_id, status, classes_remaining, start_date, end_date, payment_method)
     VALUES ($1, $2, 'active', 3, $3, $4, 'cash')`,
    [cliente.id, f.plan.id, day(-60), day(-10)],
  );
  const r = await api("GET", `/api/memberships?status=active&userId=${cliente.id}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.length, 0,
    `el filtro 'activas' no debe listar la membresía vencida de esta clienta (data=${JSON.stringify(r.body.data)})`);
});
