// Auditoría 2026-09-27, bloque 2. Bitácora: sólo la dueña la lee, con
// filtros por entidad (o clienta), actor y fechas, paginada; entrada mala → 400.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api, login, sql, makeClient, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgbitacora";
const ENT = randomUUID();
let A, adminId, recep;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  recep = await makeClient(PFX, "recep", { role: "reception" });
  await sql(
    `INSERT INTO audit_log (created_at, actor_id, actor_role, actor_name, action, entity_type, entity_id, reason, before, after, meta)
     VALUES (NOW() - INTERVAL '2 days', $1, 'admin', 'QA Admin', 'membership.adjust', 'membership', $2, 'Compensación por clase cancelada',
             '{"classes_remaining":1}', '{"classes_remaining":3}', '{"above_plan":false}'),
            (NOW(), $1, 'admin', 'QA Admin', 'booking.checkin', 'booking', $2, NULL,
             '{"status":"confirmed"}', '{"status":"checked_in"}', '{"method":"manual"}')`,
    [adminId, ENT],
  );
});
after(async () => {
  await sql(`DELETE FROM audit_log WHERE entity_id = $1`, [ENT]);
  await cleanup(PFX);
  await closeDb();
});

test("la tabla audit_log existe (ensureSchema)", async () => {
  const [r] = await sql(`SELECT to_regclass('audit_log') AS t`);
  assert.ok(r.t, "audit_log debe existir");
});

test("la dueña lee la bitácora de un registro, lo más nuevo primero, con motivo y antes/después", async () => {
  const r = await api("GET", `/api/admin/audit?entityId=${ENT}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.total, 2);
  assert.deepEqual(r.body.data.map((e) => e.action), ["booking.checkin", "membership.adjust"]);
  const ajuste = r.body.data[1];
  assert.equal(ajuste.actorName, "QA Admin");
  assert.equal(ajuste.reason, "Compensación por clase cancelada");
  assert.deepEqual(ajuste.before, { classes_remaining: 1 });
  assert.deepEqual(ajuste.after, { classes_remaining: 3 });
});

test("filtros: fechas en la zona del estudio, actor y tipo", async () => {
  const hoy = await api("GET", `/api/admin/audit?entityId=${ENT}&from=${day(0)}&to=${day(0)}`, { token: A });
  assert.equal(hoy.body.total, 1);
  assert.equal(hoy.body.data[0].action, "booking.checkin");
  const antes = await api("GET", `/api/admin/audit?entityId=${ENT}&to=${day(-1)}`, { token: A });
  assert.equal(antes.body.total, 1);
  assert.equal(antes.body.data[0].action, "membership.adjust");
  const actor = await api("GET", `/api/admin/audit?entityId=${ENT}&actorId=${adminId}`, { token: A });
  assert.equal(actor.body.total, 2);
  const tipo = await api("GET", `/api/admin/audit?entityId=${ENT}&entityType=booking`, { token: A });
  assert.equal(tipo.body.total, 1);
});

test("paginación", async () => {
  const r = await api("GET", `/api/admin/audit?entityId=${ENT}&limit=1&page=2`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.page, 2);
  assert.equal(r.body.limit, 1);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].action, "membership.adjust");
});

test("recepción no puede leer la bitácora (403)", async () => {
  for (const ruta of ["/api/admin/audit", "/api/admin/audit/actors"]) {
    const r = await api("GET", ruta, { token: recep.token });
    assert.equal(r.status, 403, ruta);
  }
});

test("filtros inválidos → 400 con mensaje, nunca 500", async () => {
  for (const q of ["entityId=basura", "actorId=1", "from=2026-13-40", `from=${day(1)}&to=${day(0)}`, "limit=0", "limit=500", "page=-1", "entityType=planetas", "action=borrar.todo"]) {
    const r = await api("GET", `/api/admin/audit?${q}`, { token: A });
    assert.equal(r.status, 400, q);
    assert.equal(typeof r.body.message, "string", q);
  }
});

test("actores de la bitácora para el filtro Quién", async () => {
  const r = await api("GET", "/api/admin/audit/actors", { token: A });
  assert.equal(r.status, 200);
  const yo = r.body.data.find((a) => a.id === adminId);
  assert.ok(yo, "la admin aparece como actora");
  assert.equal(yo.name, "QA Admin");
});
