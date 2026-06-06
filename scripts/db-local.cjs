// Lanzador PERSISTENTE de PostgreSQL embebido para desarrollo local de Alma Movement.
// Mantiene el proceso vivo. Detener: matar el proceso (Ctrl-C / TaskStop).
const EmbeddedPostgres = require("embedded-postgres").default || require("embedded-postgres");
const path = require("path");

const pg = new EmbeddedPostgres({
  databaseDir: path.join(process.cwd(), ".pgdata"),
  user: "alma",
  password: "alma",
  port: 5433,
  persistent: true,
});

let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  try { await pg.stop(); } catch {}
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

(async () => {
  try { await pg.initialise(); } catch (e) { /* ya inicializado: ok */ }
  await pg.start();
  try { await pg.createDatabase("alma"); } catch (e) { /* ya existe: ok */ }
  console.log("DB_READY on 127.0.0.1:5433 (db=alma)");
  // mantener vivo
  setInterval(() => {}, 1 << 30);
})().catch((e) => { console.error("DB_FAIL:", e.message); process.exit(1); });
