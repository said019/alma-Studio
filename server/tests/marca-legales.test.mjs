// Tarea 2 · auditoría 2026-09-27, bloque 3 (punto 7). La responsiva vigente es
// la v2 (HIVE); las v1 ya firmadas siguen valiendo y no se tocan; el pase se
// descarga como HIVE y los textos legales por defecto ya no dicen Alma.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { api, API, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgmarca";
const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
let A, f;

// Firma PNG mínima que pasa signatureProblem() (misma receta que helpers.mjs).
const firma = () => {
  const b = Buffer.alloc(33 + 2000);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(600, 16); b.writeUInt32BE(200, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("firmar hoy con waiver_version:\"v2\" guarda v2", async () => {
  const a = await makeClient(PFX, "conver", { waiver: false });
  const r1 = await api("POST", "/api/me/waiver", { token: a.token, body: { full_name: "QA conver", signature_data: firma(), waiver_version: "v2" } });
  assert.equal(r1.status, 201, JSON.stringify(r1.body).slice(0, 200));
  assert.equal(r1.body.data.waiver_version, "v2");
});

// Ronda de ajustes 1: una firma sin `waiver_version` viene de una pestaña con el
// bundle anterior al versionado, que le mostró a la clienta el texto v1 (Alma).
// Guardarla como v2 dejaría registrado que aceptó un texto que nunca vio.
test("firmar sin mandar waiver_version guarda v1 (app en caché de antes del versionado)", async () => {
  const b = await makeClient(PFX, "sinver", { waiver: false });
  const r2 = await api("POST", "/api/me/waiver", { token: b.token, body: { full_name: "QA sinver", signature_data: firma() } });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.data.waiver_version, "v1");
});

test("una versión desconocida → 400 y no guarda nada", async () => {
  const c = await makeClient(PFX, "malver", { waiver: false });
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "QA malver", signature_data: firma(), waiver_version: "v9" } });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "Versión de responsiva desconocida.");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM waivers WHERE user_id=$1`, [c.id]))[0].n, 0);
});

test("una responsiva v1 ya firmada sigue valiendo: reserva sin firmar otra vez, no se toca y su PDF sale", async () => {
  const c = await makeClient(PFX, "vieja", { waiver: false });
  await sql(
    `INSERT INTO waivers (user_id, full_name, signature_data, waiver_version, signed_at)
     VALUES ($1, 'QA vieja', $2, 'v1', NOW() - INTERVAL '30 days')`, [c.id, firma()]);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.equal(r.status, 201, `no se le debe pedir firmar otra vez: ${JSON.stringify(r.body).slice(0, 150)}`);
  const [w] = await sql(`SELECT waiver_version FROM waivers WHERE user_id=$1`, [c.id]);
  assert.equal(w.waiver_version, "v1");
  const pdf = await fetch(`${API}/api/admin/users/${c.id}/waiver/pdf`, { headers: { Authorization: `Bearer ${A}` } });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") ?? "", /application\/pdf/);
});

test("volver a firmar deja la versión vigente", async () => {
  const c = await makeClient(PFX, "refirma", { waiver: false });
  await sql(`INSERT INTO waivers (user_id, full_name, signature_data, waiver_version) VALUES ($1, 'QA refirma', $2, 'v1')`, [c.id, firma()]);
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "QA refirma", signature_data: firma(), waiver_version: "v2" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.waiver_version, "v2");
});

test("el pase se descarga como hive-pass.pkpass y los textos legales por defecto ya no dicen Alma", () => {
  assert.match(SRC, /filename="hive-pass\.pkpass"/);
  assert.ok(!/alma-pass\.pkpass/.test(SRC));
  const inicio = SRC.indexOf("const DEFAULT_POLICIES_SETTINGS");
  const defaults = SRC.slice(inicio, SRC.indexOf("};", inicio));
  assert.ok(inicio > 0);
  assert.ok(!/Alma/.test(defaults), "DEFAULT_POLICIES_SETTINGS aún dice Alma");
  assert.match(defaults, /HIVE Pilates Studio/);
});
