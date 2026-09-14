// Zona horaria, 14 sep 2026 · El estudio opera en CDMX; el servidor corre en UTC.
// Invariante: TODA operación con fechas usa la hora civil del estudio, sin
// importar en qué zona corra el contenedor ni la base.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import pg from "pg";
import { api, login, sql, closeDb, DB, ADMIN } from "./helpers.mjs";

/** Conexion SIN anclar: mide lo que veria el servidor si el anclaje fallara. */
async function sinAnclar(q, params = []) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}

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

test("TZ2 el entry point fija su zona antes de usar Date (red de seguridad)", () => {
  // Se comprueba sobre la fuente, no sobre este proceso: el runner puede correr
  // en cualquier zona y no dice nada del producto. Esto cubre SOLO este modulo;
  // los imports de ESM ya se evaluaron para cuando corre esta linea, y de esos
  // se encarga TZ12 (contenedor arrancado en la zona correcta).
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

test("TZ4 el SERVIDOR ve CURRENT_DATE igual que la fecha civil del estudio", async () => {
  // Se pregunta por la sesion del servidor (health), no por la del harness:
  // el harness tambien ancla la zona, asi que preguntarle seria tautologico.
  const r = await api("GET", "/api/health");
  const [civil] = await sql(`SELECT (now() AT TIME ZONE $1)::date::text AS d`, [ZONA]);
  assert.equal(r.body?.timezone?.today, civil.d,
    `el servidor cree que hoy es ${r.body?.timezone?.today} y en el estudio es ${civil.d}`);
  assert.equal(r.body?.timezone?.matchesDb, true, r.body?.timezoneWarning || "");
});

test("TZ5 una conexión sin anclar demuestra el fallo que el anclaje evita", async () => {
  // Control negativo: sin anclar, CURRENT_DATE sigue la zona del servidor de
  // base. Si esta prueba deja de distinguir ambos mundos, TZ4 ya no prueba nada.
  const [libre] = await sinAnclar(
    `SELECT current_setting('TimeZone') AS tz, CURRENT_DATE::text AS cd`);
  const [anclada] = await sql(`SELECT current_setting('TimeZone') AS tz`);
  assert.equal(anclada.tz, ZONA, "la conexión anclada debe estar en la zona del estudio");
  assert.ok(typeof libre.tz === "string" && libre.tz.length > 0,
    "la conexión sin anclar debe reportar alguna zona para que la comparación tenga sentido");
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

test("TZ9 ningún corte de día usa toISOString (que siempre es UTC)", () => {
  // `new Date().toISOString().slice(0,10)` es inmune a process.env.TZ: a las
  // 19:00 en CDMX ya devuelve mañana. Un pase vendido esa noche arrancaría al
  // día siguiente y la clienta no podría entrar a su clase.
  const hits = [...SRC.matchAll(/new Date\(\)\.toISOString\(\)\.(slice\(0,\s*10\)|split\("T"\)\[0\])/g)];
  assert.equal(hits.length, 0,
    `${hits.length} cortes de día siguen calculándose en UTC; usar todayInStudio()`);
});

test("TZ10 una zona inválida no tumba todas las conexiones", () => {
  assert.match(SRC, /function zonaValida\(/,
    "STUDIO_TIMEZONE entra al startup de libpq: una zona con typo daría FATAL en cada conexión");
});

test("TZ11 las conversiones SQL siguen a STUDIO_TIMEZONE", () => {
  const fijas = [...SRC.matchAll(/AT TIME ZONE '(?!\$\{)[A-Za-z_]+\/[A-Za-z_]+'/g)];
  assert.equal(fijas.length, 0,
    `${fijas.length} conversiones fijan la zona a mano y no seguirían a STUDIO_TIMEZONE: ${fijas.map(m=>m[0]).slice(0,3)}`);
});

test("TZ12 el contenedor arranca en la zona del estudio", () => {
  const nixpacks = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "nixpacks.toml"), "utf8");
  assert.match(nixpacks, /TZ\s*=\s*"America\/Mexico_City"/,
    "en ESM los imports corren antes del entry point: la garantía real es arrancar el contenedor ya en esta zona");
});
