// P0-2 y P0-3 · El dinero que la dueña ve. Auditoría 2026-09-08.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgrep";
let A, f, cliente;
const overview = async (q = "") => (await api("GET", `/api/reports/overview${q}`, { token: A })).body?.data || {};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  cliente = await makeClient(PFX, "c1");
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("P0-2 el dashboard incluye lo que pasó HOY", async () => {
  // venta de hoy
  await api("POST", "/api/memberships", { token: A, body: {
    userId: cliente.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  await sql(`UPDATE memberships SET classes_remaining=8, status='active', end_date=$2 WHERE user_id=$1`, [cliente.id, day(60)]);
  const id = await makeClass(A, f, { date: day(5) });
  await api("POST", "/api/bookings", { token: cliente.token, body: { classId: id } });

  const porDefecto = await overview();
  assert.ok(Number(porDefecto.monthlyBookings) > 0,
    `el rango por defecto oculta las reservas de hoy (monthlyBookings=${porDefecto.monthlyBookings})`);
});

test("P0-2 el rango por defecto y el rango explícito hasta mañana coinciden", async () => {
  const mes = day(0).slice(0, 8) + "01";
  const porDefecto = await overview();
  const explicito = await overview(`?from=${mes}&to=${day(1)}`);
  assert.equal(Number(porDefecto.monthlyBookings), Number(explicito.monthlyBookings),
    "el default debe cubrir el día en curso igual que un rango que termina mañana");
  assert.equal(Number(porDefecto.monthlyRevenue), Number(explicito.monthlyRevenue),
    "los ingresos del default deben incluir el día en curso");
});

test("P0-3 la venta de mostrador aparece en los ingresos", async () => {
  const cliente2 = await makeClient(PFX, "c2");
  const antes = Number((await overview()).monthlyRevenue || 0);
  const r = await api("POST", "/api/memberships", { token: A, body: {
    userId: cliente2.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.ok(r.status < 300, `venta manual devolvió ${r.status}`);
  const despues = Number((await overview()).monthlyRevenue || 0);
  assert.equal(despues - antes, Number(f.plan.price),
    `la venta en efectivo de $${f.plan.price} debe sumar a los ingresos (antes=${antes}, después=${despues})`);
});

test("P0-3 la venta de mostrador deja rastro contable consultable", async () => {
  const cliente3 = await makeClient(PFX, "c3");
  await api("POST", "/api/memberships", { token: A, body: {
    userId: cliente3.id, planId: f.plan.id, paymentMethod: "transfer", startDate: day(0) } });
  const filas = await sql(
    `SELECT status, payment_method, total_amount FROM orders WHERE user_id=$1`, [cliente3.id]);
  assert.equal(filas.length, 1, "la venta manual debe generar exactamente una orden");
  assert.equal(filas[0].status, "approved", "la venta cobrada en mostrador queda aprobada");
  assert.equal(filas[0].payment_method, "transfer", "debe conservar el método real de pago");
  assert.equal(Number(filas[0].total_amount), Number(f.plan.price), "monto del catálogo del servidor");
});

test("P0-3 la venta manual no duplica ingresos al repetirse la lectura", async () => {
  const a = Number((await overview()).monthlyRevenue || 0);
  const b = Number((await overview()).monthlyRevenue || 0);
  assert.equal(a, b, "leer el reporte dos veces no debe cambiar el total");
});
