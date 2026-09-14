// Zona horaria, 14 sep 2026 · El estudio opera en CDMX; el servidor corre en UTC.
// Invariante: TODA operación con fechas usa la hora civil del estudio, sin
// importar en qué zona corra el contenedor ni la base.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { api, login, sql, closeDb, ADMIN } from "./helpers.mjs";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
const ZONA = "America/Mexico_City";

let A;
before(async () => { A = (await login(ADMIN.email, ADMIN.password)).token; });
after(async () => { await closeDb(); });

test("TZ1 el pool ancla la zona del estudio en cada conexión", () => {
  const pool = SRC.slice(SRC.indexOf("const pool = new Pool("), SRC.indexOf("const pool = new Pool(") + 600);
  assert.match(pool, /options:.*TimeZone=/,
    "sin anclar la zona en el pool, CURRENT_DATE y NOW() operan en la zona del servidor (UTC en Railway)");
});

test("TZ2 el servidor fija su zona ANTES de cualquier uso de Date", () => {
  // Se comprueba sobre la fuente, no sobre este proceso de pruebas: el runner
  // puede correr en cualquier zona y no dice nada del producto. Que el servidor
  // real quede en CDMX lo verifica TZ7 leyendo /api/health.
  const cabeza = SRC.slice(0, SRC.indexOf("import express"));
  assert.match(cabeza, /process\.env\.TZ\s*=/,
    "TZ debe fijarse en la cabecera del archivo; Node la lee de forma perezosa y después ya es tarde");
  const primerDate = SRC.indexOf("new Date(");
  assert.ok(SRC.indexOf("process.env.TZ =") < primerDate,
    "hay un uso de Date antes de fijar la zona");
});

test("TZ3 la sesión de base del SERVIDOR responde en hora del estudio", async () => {
  // Se pregunta por la sesión del servidor (vía health), no por la de este
  // harness: son conexiones distintas y sólo la del servidor importa.
  const r = await api("GET", "/api/health");
  assert.equal(r.body?.timezone?.db, ZONA,
    `la sesión de base del servidor está en ${r.body?.timezone?.db}`);
});

test("TZ4 CURRENT_DATE coincide con la fecha civil de CDMX", async () => {
  const [r] = await sql(
    `SELECT CURRENT_DATE::text AS actual, (now() AT TIME ZONE $1)::date::text AS civil`, [ZONA]);
  assert.equal(r.actual, r.civil,
    `CURRENT_DATE devuelve ${r.actual} pero en el estudio es ${r.civil}: una membresía que vence hoy se leería vencida`);
});

test("TZ5 una membresía que vence HOY sigue sirviendo para reservar", async () => {
  const [r] = await sql(
    `SELECT ((now() AT TIME ZONE $1)::date >= CURRENT_DATE) AS vigente`, [ZONA]);
  assert.equal(r.vigente, true,
    "en la tarde-noche el sistema adelanta el día y rechaza membresías todavía vigentes");
});

test("TZ6 no hay offsets de zona escritos a mano en las consultas", () => {
  const hits = [...SRC.matchAll(/\|\| '-0[0-9]:00'/g)];
  assert.equal(hits.length, 0,
    `${hits.length} consultas fijan el offset a mano; si México reinstaura el horario de verano, todas mienten a la vez`);
});

test("TZ7 el servidor reporta su zona efectiva en /api/health", async () => {
  const r = await api("GET", "/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.body?.timezone?.studio, ZONA,
    "health debe exponer la zona efectiva para detectar un contenedor mal configurado sin entrar a la base");
  assert.equal(r.body?.timezone?.matchesDb, true,
    "la zona del proceso y la de la base deben coincidir");
});

test("TZ8 el frontend no parsea fechas civiles con new Date()", () => {
  // `new Date("2026-09-14")` es medianoche UTC: en CDMX se pinta como el día
  // anterior. Para fechas civiles va parseISO (o safeParse, que lo usa).
  const dir = path.join(import.meta.dirname, "..", "..", "src");
  const malos = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!/\.(tsx?|jsx?)$/.test(e.name)) continue;
      const txt = fs.readFileSync(f, "utf8");
      const re = /new Date\(\s*(?:String\()?[A-Za-z_$][\w$.?\[\]"']*\b(?:class_date|classDate|end_date|endDate|start_date|startDate|\.date)\b/g;
      for (const m of txt.matchAll(re)) {
        malos.push(`${path.relative(dir, f)} :: ${m[0]}`);
      }
    }
  };
  walk(dir);
  assert.deepEqual(malos, [],
    `fechas civiles parseadas con new Date(): se muestran un día antes\n  ${malos.join("\n  ")}`);
});
