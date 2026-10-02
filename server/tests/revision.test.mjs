// Revisión de código, 8 sep 2026 · Regresiones que introdujeron mis propios arreglos.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN, fakeSignaturePng } from "./helpers.mjs";

const PFX = "rgrev";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("R2 un plan puede volver a ser ilimitado (classLimit null)", async () => {
  const [p] = await sql(
    `INSERT INTO plans (name, price, duration_days, class_limit, is_active, class_category)
     VALUES ($1, 100, 30, 8, true, 'studio') RETURNING id`, [`${PFX} Plan`]);
  const r = await api("PUT", `/api/plans/${p.id}`, { token: A, body: { classLimit: null } });
  assert.ok(r.status < 400, `PUT devolvió ${r.status}`);
  const [after_] = await sql(`SELECT class_limit FROM plans WHERE id=$1`, [p.id]);
  assert.equal(after_.class_limit, null,
    "el formulario manda classLimit:null para 'ilimitado'; COALESCE lo ignoraba y el plan quedaba limitado para siempre");
});

test("R2 un PUT que no menciona classLimit lo conserva", async () => {
  const [p] = await sql(
    `INSERT INTO plans (name, price, duration_days, class_limit, is_active, class_category)
     VALUES ($1, 100, 30, 12, true, 'studio') RETURNING id`, [`${PFX} Plan2`]);
  await api("PUT", `/api/plans/${p.id}`, { token: A, body: { isActive: true } });
  const [after_] = await sql(`SELECT class_limit FROM plans WHERE id=$1`, [p.id]);
  assert.equal(after_.class_limit, 12, "sin mencionar classLimit el valor debe conservarse");
});

test("R3 alta manual, firma y venta posterior también entran una sola vez en ingresos", async () => {
  const plan = f.plan;
  const profile = { displayName: `${PFX} Alta`, email: `${PFX}_alta@qa.local`, phone: "5512340000" };
  const combined = await api("POST", "/api/admin/clients/manual", { token: A, body: { ...profile, planId: plan.id, paymentMethod: "cash" } });
  assert.equal(combined.status, 403);
  assert.equal(combined.body.code, "WAIVER_REQUIRED");
  assert.equal((await sql('SELECT count(*)::int n FROM users WHERE email=$1',[profile.email]))[0].n, 0);
  const r = await api("POST", "/api/admin/clients/manual", { token: A, body: profile });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const u = r.body.data.user;
  assert.equal((await sql('SELECT count(*)::int n FROM orders WHERE user_id=$1',[u.id]))[0].n, 0);
  const signed = await api("POST", `/api/admin/users/${u.id}/waiver`, { token: A, body: {
    full_name: profile.displayName, phone: profile.phone, waiver_version: "v3", signature_data: fakeSignaturePng(),
    emergency_contact_name: "Contacto QA", emergency_contact_phone: "5511112222",
  } });
  assert.equal(signed.status, 201, JSON.stringify(signed.body));
  const sale = await api("POST", "/api/memberships", { token: A, body: { userId: u.id, planId: plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(sale.status, 201, JSON.stringify(sale.body));
  const ords = await sql(`SELECT status, total_amount FROM orders WHERE user_id=$1`, [u.id]);
  assert.equal(ords.length, 1, "la venta posterior al alta debe dejar exactamente una orden");
  assert.equal(ords[0].status, "approved");
  assert.equal(Number(ords[0].total_amount), Number(plan.price), "monto del catálogo del servidor");
});

test("R4 recepción conserva sus contadores operativos y no ve el ingreso", async () => {
  const recep = await makeClient(PFX, "recep", { role: "reception", waiver: false });
  const r = await api("GET", "/api/admin/stats", { token: recep.token });
  assert.ok(r.status < 400, `recepción recibió ${r.status} en /api/admin/stats: pierde clases de hoy y órdenes pendientes`);
  const d = r.body?.data ?? r.body ?? {};
  assert.ok("classesToday" in d, "recepción necesita las clases de hoy");
  assert.ok("activeMembers" in d, "recepción necesita las membresías activas");
  assert.ok(!("monthlyRevenue" in d) || d.monthlyRevenue === null,
    "recepción no debe recibir el ingreso del mes");
});

test("R4 la dueña sí recibe el ingreso en /api/admin/stats", async () => {
  const r = await api("GET", "/api/admin/stats", { token: A });
  const d = r.body?.data ?? r.body ?? {};
  assert.ok("monthlyRevenue" in d && d.monthlyRevenue !== null, "la dueña sí debe ver el ingreso");
});

test("R6 editar especialidades de una instructora no revienta", async () => {
  const r = await api("PUT", `/api/instructors/${f.instructorId}`, { token: A, body: {
    displayName: "Coach QA", specialties: ["reformer", "mat"] } });
  assert.ok(r.status < 500, `devolvió ${r.status}: el cast ::jsonb falla si la columna es TEXT`);
  assert.equal(r.status, 200);
});

test("R7 el período previo tiene los mismos días que el actual", async () => {
  const r = await api("GET", "/api/reports/overview", { token: A });
  const range = r.body?.data?.range;
  assert.ok(range, "el overview debe exponer el rango");
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T00:00:00`);
  const diasReales = Math.round((to - from) / 86400000) + 1;
  assert.equal(range.days, diasReales,
    `days=${range.days} pero el rango ${range.from}..${range.to} son ${diasReales} días: el período previo queda descuadrado`);
});
