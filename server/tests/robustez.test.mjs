// P1-2, P1-3 y familias P2 · El panel no debe devolver 500. Auditoría 2026-09-08.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, studioFixtures, makeClass, makeClient, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgrob";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("P1-2 editar sólo el nombre de una instructora NO borra sus otros datos", async () => {
  await sql(`UPDATE instructors SET email=$2, phone=$3, bio=$4 WHERE id=$1`,
    [f.instructorId, "coach@qa.local", "5511111111", "bio original"]);
  const r = await api("PUT", `/api/instructors/${f.instructorId}`, { token: A, body: { displayName: "Nombre Nuevo" } });
  assert.equal(r.status, 200);
  const [i] = await sql(`SELECT display_name,email,phone,bio FROM instructors WHERE id=$1`, [f.instructorId]);
  assert.equal(i.display_name, "Nombre Nuevo", "el campo enviado sí debe cambiar");
  assert.equal(i.email, "coach@qa.local", "email no enviado debe conservarse");
  assert.equal(i.phone, "5511111111", "teléfono no enviado debe conservarse");
  assert.equal(i.bio, "bio original", "bio no enviada debe conservarse");
});

test("P1-2 editar un plan parcialmente no borra su nombre ni su precio", async () => {
  const [plan] = await sql(`SELECT id,name,price,duration_days FROM plans WHERE is_active LIMIT 1`);
  const r = await api("PUT", `/api/plans/${plan.id}`, { token: A, body: { isActive: true } });
  assert.ok(r.status < 500, `PUT parcial de plan devolvió ${r.status}`);
  const [p] = await sql(`SELECT name,price,duration_days FROM plans WHERE id=$1`, [plan.id]);
  assert.equal(p.name, plan.name, "el nombre del plan debe conservarse");
  assert.equal(Number(p.price), Number(plan.price), "el precio debe conservarse");
});

test("P1-3 cerrar y reabrir una clase funciona", async () => {
  const id = await makeClass(A, f, { date: day(11) });
  const cerrar = await api("PUT", `/api/classes/${id}/close`, { token: A, body: {} });
  assert.equal(cerrar.status, 200, `cerrar devolvió ${cerrar.status}`);
  const abrir = await api("PUT", `/api/classes/${id}/reopen`, { token: A, body: {} });
  assert.equal(abrir.status, 200, `reabrir devolvió ${abrir.status}`);
  const [c] = await sql(`SELECT status FROM classes WHERE id=$1`, [id]);
  assert.equal(c.status, "scheduled", "tras reabrir la clase vuelve a estar agendada");
});

test("P1-3 una clase cerrada no admite nuevas reservas", async () => {
  const id = await makeClass(A, f, { date: day(12) });
  await api("PUT", `/api/classes/${id}/close`, { token: A, body: {} });
  const cliente = await makeClient(PFX, "cerrada");
  await api("POST", "/api/memberships", { token: A, body: { userId: cliente.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  await sql(`UPDATE memberships SET classes_remaining=8,status='active',end_date=$2 WHERE user_id=$1`, [cliente.id, day(60)]);
  const r = await api("POST", "/api/bookings", { token: cliente.token, body: { classId: id } });
  assert.ok(r.status >= 400 && r.status < 500, `reservar en clase cerrada devolvió ${r.status}`);
});

test("P2 un JSON malformado devuelve 400, no 500", async () => {
  const rutas = [["POST", "/api/auth/login"], ["POST", "/api/bookings"], ["POST", "/api/classes"],
                 ["PUT", "/api/admin/bank-info"], ["POST", "/api/memberships"]];
  for (const [m, ruta] of rutas) {
    const r = await api(m, ruta, { token: A, raw: "{esto no es json" });
    assert.equal(r.status, 400, `${m} ${ruta} devolvió ${r.status} con JSON roto`);
  }
});

test("P2 un identificador inválido en la ruta devuelve 400, no 500", async () => {
  const sondas = ["no-es-uuid", "2026-13-45", "-1", "1e400"];
  const rutas = [["GET", (v) => `/api/users/${v}`], ["GET", (v) => `/api/classes/${v}`],
                 ["PUT", (v) => `/api/instructors/${v}`], ["PUT", (v) => `/api/memberships/${v}/cancel`]];
  for (const [m, mk] of rutas) {
    for (const s of sondas) {
      const r = await api(m, mk(encodeURIComponent(s)), { token: A, body: m === "GET" ? undefined : {} });
      assert.ok(r.status < 500, `${m} ${mk(s)} devolvió ${r.status}`);
    }
  }
});

test("P2 vender sin indicar método de pago se rechaza con 400, no revienta", async () => {
  const cliente = await makeClient(PFX, "sinmetodo");
  const r = await api("POST", "/api/memberships", { token: A, body: { userId: cliente.id, planId: f.plan.id } });
  assert.ok(r.status < 500, `devolvió ${r.status}`);
  assert.equal(r.status, 400, "sin método de pago debe ser 400 explícito, no un default silencioso");
});

test("P2 el error interno no filtra el detalle de la base al cliente", async () => {
  const r = await api("PUT", `/api/classes/${crypto.randomUUID()}/close`, { token: A, body: {} });
  const txt = JSON.stringify(r.body);
  assert.ok(!/enum|syntax|column|relation|pg_/i.test(txt), `la respuesta filtra detalle interno: ${txt.slice(0,150)}`);
});
