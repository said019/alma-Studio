// La plantilla de horario del generador de clases (panel → Generar clases →
// "Guardar solo la plantilla") vive en /api/schedules/reset-template. La ruta
// vieja llevaba el nombre de la marca anterior.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { api, login, makeClient, sql, cleanup, closeDb, ADMIN } from "./helpers.mjs";

const PFX = "rgplantilla";
const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
let A, clienta;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  clienta = await makeClient(PFX, "cli");
  // La ruta borra schedule_slots: se guarda una copia para dejar la base igual.
  await sql(`DROP TABLE IF EXISTS qa_plantilla_respaldo`);
  await sql(`CREATE TABLE qa_plantilla_respaldo AS SELECT * FROM schedule_slots`);
});
after(async () => {
  await sql(`DELETE FROM schedule_slots`);
  await sql(`INSERT INTO schedule_slots SELECT * FROM qa_plantilla_respaldo`);
  await sql(`DROP TABLE qa_plantilla_respaldo`);
  await cleanup(PFX);
  await closeDb();
});

test("admin guarda la plantilla de 23 horarios sin crear clases", async () => {
  const r = await api("POST", "/api/schedules/reset-template", { token: A, body: { generateClasses: false } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.slots.length, 23);
  assert.equal(r.body.data.classesCreated, 0);
  const [{ n }] = await sql(`SELECT COUNT(*)::int n FROM schedule_slots`);
  assert.equal(n, 23);
});

test("una clienta no puede restablecer la plantilla", async () => {
  const r = await api("POST", "/api/schedules/reset-template", { token: clienta.token, body: { generateClasses: false } });
  assert.ok(r.status === 401 || r.status === 403, `recibió ${r.status}`);
});

test("la ruta ya no lleva el nombre de la marca anterior", () => {
  assert.match(SRC, /app\.post\("\/api\/schedules\/reset-template"/);
  assert.doesNotMatch(SRC, /reset-alma/);
});
