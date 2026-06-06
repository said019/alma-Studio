// Aplica el esquema de Alma Movement a la BD local embebida.
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const CONN = "postgres://alma:alma@127.0.0.1:5433/alma";
const MIG = path.join(process.cwd(), "supabase", "migrations");
const FLAG = path.join(process.cwd(), ".schema_applied");

const IDEMPOTENT = ["schema_complete.sql", "20260506_alma_progress_rings.sql"];
const ONCE = ["20260226_fix_plans_real_prices.sql"]; // DELETE+INSERT, solo primera vez

async function connectWithRetry(tries = 30) {
  for (let i = 0; i < tries; i++) {
    const c = new Client({ connectionString: CONN });
    try { await c.connect(); return c; }
    catch (e) { await new Promise(r => setTimeout(r, 1000)); }
  }
  throw new Error("No se pudo conectar a la BD tras varios intentos");
}

(async () => {
  const c = await connectWithRetry();
  console.log("Conectado. Aplicando schema...");
  for (const f of IDEMPOTENT) {
    const sql = fs.readFileSync(path.join(MIG, f), "utf8");
    await c.query(sql);
    console.log("  ✓", f);
  }
  if (!fs.existsSync(FLAG)) {
    for (const f of ONCE) {
      try {
        const sql = fs.readFileSync(path.join(MIG, f), "utf8");
        await c.query(sql);
        console.log("  ✓ (once)", f);
      } catch (e) { console.log("  ! omitido", f, "-", e.message.slice(0, 80)); }
    }
    fs.writeFileSync(FLAG, new Date().toISOString());
  } else {
    console.log("  (migraciones 'once' ya aplicadas, omito)");
  }
  const t = await c.query("select count(*)::int n from information_schema.tables where table_schema='public'");
  console.log("Tablas en public:", t.rows[0].n);
  await c.end();
  console.log("SCHEMA_OK");
})().catch(e => { console.error("SCHEMA_FAIL:", e.message); process.exit(1); });
