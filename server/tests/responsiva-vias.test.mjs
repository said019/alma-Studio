// Tarea 5 · auditoría 2026-09-27, bloque 1.
// Recepción ya no puede asignar a una clienta sin responsiva salvo que deje
// un motivo (queda registrado); reservar con invitada exige la responsiva
// de la anfitriona, no de la invitada.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  api, login, sql, makeClient, studioFixtures, makeClass, giveMembership,
  cleanup, closeDb, day, ADMIN,
} from "./helpers.mjs";

const PFX = "rgwaiver";
let A, adminId, f, sinResponsiva, conResponsiva;

before(async () => {
  const admin = await login(ADMIN.email, ADMIN.password);
  A = admin.token;
  adminId = admin.user.id;
  f = await studioFixtures(PFX, A);
  sinResponsiva = await makeClient(PFX, "sinr", { waiver: false });
  conResponsiva = await makeClient(PFX, "conr", { waiver: true });
  // Saldo legado anterior al requisito de firmar antes de comprar. La API
  // de venta ya debe rechazar este caso, pero asignación conserva su override.
  await sql(`INSERT INTO memberships(user_id,plan_id,status,payment_method,start_date,end_date,classes_remaining)
    VALUES($1,$2,'active','cash',CURRENT_DATE,CURRENT_DATE+30,8)`, [sinResponsiva.id, f.plan.id]);
  await giveMembership(A, conResponsiva.id, f.plan.id, 8);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("(a) assign de admin a clienta sin responsiva y sin override → 403 WAIVER_REQUIRED", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/admin/bookings/assign", { token: A, body: { classId: id, userId: sinResponsiva.id } });
  assert.equal(r.status, 403);
  assert.equal(r.body?.code, "WAIVER_REQUIRED");
});

test("(b) assign con waiverOverride → 2xx y guarda motivo/quién/cuándo", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/admin/bookings/assign", {
    token: A,
    body: { classId: id, userId: sinResponsiva.id, waiverOverride: { reason: "Firmará en recepción hoy" } },
  });
  assert.ok(r.status < 300, `assign con override devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  const [bk] = await sql(
    `SELECT waiver_override_reason, waiver_override_by, waiver_override_at
       FROM bookings WHERE class_id=$1 AND user_id=$2`,
    [id, sinResponsiva.id],
  );
  assert.equal(bk.waiver_override_reason, "Firmará en recepción hoy");
  assert.equal(bk.waiver_override_by, adminId);
  assert.ok(bk.waiver_override_at, "waiver_override_at no debe ser nulo");
});

test("(c) assign con motivo de menos de 5 caracteres → 400", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/admin/bookings/assign", {
    token: A,
    body: { classId: id, userId: sinResponsiva.id, waiverOverride: { reason: "ok" } },
  });
  assert.equal(r.status, 400);
});

test("(d) POST /api/bookings/with-guest de clienta sin responsiva → 403 WAIVER_REQUIRED", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/bookings/with-guest", {
    token: sinResponsiva.token,
    body: { classId: id, guest: { name: "Invitada QA", phone: "5511112222", acceptedWaiver: true } },
  });
  assert.equal(r.status, 403);
  assert.equal(r.body?.code, "WAIVER_REQUIRED");
});

test("(e) assign con classId inválido → 400", async () => {
  const r = await api("POST", "/api/admin/bookings/assign", { token: A, body: { classId: "basura", userId: sinResponsiva.id } });
  assert.equal(r.status, 400);
});

test("(f) con responsiva firmada, assign sin override → 2xx y columnas nulas", async () => {
  const id = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/admin/bookings/assign", { token: A, body: { classId: id, userId: conResponsiva.id } });
  assert.ok(r.status < 300, `assign devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  const [bk] = await sql(
    `SELECT waiver_override_reason, waiver_override_by, waiver_override_at
       FROM bookings WHERE class_id=$1 AND user_id=$2`,
    [id, conResponsiva.id],
  );
  assert.equal(bk.waiver_override_reason, null);
  assert.equal(bk.waiver_override_by, null);
  assert.equal(bk.waiver_override_at, null);
});
