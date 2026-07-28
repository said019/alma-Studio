#!/usr/bin/env node
/* eslint-disable no-console */
// Diagnóstico de la integración Wellhub. Corre dentro de Railway:
//   railway ssh "node scripts/wellhub-status.cjs"
// No imprime secretos (solo si están SET o no).

const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    const r = await pool.query(
      `SELECT environment, is_enabled, gym_id,
              (webhook_secret IS NOT NULL AND webhook_secret <> '') AS has_secret,
              (access_token   IS NOT NULL AND access_token   <> '') AS has_token,
              extra_config
         FROM platform_credentials WHERE channel = $1`,
      ["wellhub"],
    );
    console.log("──────────── Wellhub config ────────────");
    const row = r.rows[0];
    if (!row) {
      console.log("  (sin fila platform_credentials — NO configurado)");
    } else {
      const ec = row.extra_config || {};
      console.log("  environment   :", row.environment);
      console.log("  is_enabled    :", row.is_enabled);
      console.log("  gym_id        :", row.gym_id || "(VACÍO ✗)");
      console.log("  webhook_secret:", row.has_secret ? "SET ✓" : "FALTA ✗");
      console.log("  access_token  :", row.has_token ? "SET ✓" : "FALTA ✗");
      console.log("  product_id    :", ec.product_id || "(vacío)");
      console.log("  precio convenio:", ec.wellhub_class_price ?? 170);
    }
    const inv = await pool.query("SELECT COUNT(*)::int AS n FROM channel_inventory WHERE channel='wellhub'");
    const map = await pool.query("SELECT COUNT(*)::int AS n FROM partner_class_mappings WHERE channel='wellhub' AND external_slot_id IS NOT NULL AND external_slot_id <> ''");
    const ev = await pool.query("SELECT COUNT(*)::int AS n FROM processed_events WHERE channel='wellhub'");
    const bk = await pool.query("SELECT COUNT(*)::int AS n FROM bookings WHERE channel='wellhub'");
    const ci = await pool.query("SELECT COUNT(*)::int AS n FROM partner_checkins WHERE channel='wellhub'");
    console.log("──────────── Estado operativo ──────────");
    console.log("  clases publicadas a Wellhub :", inv.rows[0].n, "(con slot mapeado:", map.rows[0].n + ")");
    console.log("  eventos recibidos de Wellhub:", ev.rows[0].n);
    console.log("  reservas Wellhub            :", bk.rows[0].n);
    console.log("  check-ins Wellhub           :", ci.rows[0].n);
    console.log("────────────────────────────────────────");
    if (row && ev.rows[0].n === 0) {
      console.log("  ⚠ 0 eventos recibidos: aunque esté 'activo', Wellhub aún NO");
      console.log("    está mandando eventos a este backend. Falta ruta en el");
      console.log("    gateway (GYM_ROUTES) para el gym_id, o Wellhub no apunta al gateway.");
    }
  } catch (e) {
    console.error("ERR:", e.message);
  } finally {
    await pool.end();
  }
})();
