#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Promueve (o crea) un usuario a `admin` y le envía un correo de bienvenida
 * con su contraseña temporal (Resend, plantilla de marca Alma).
 *
 *   node scripts/grant-admin.cjs <email> ["Nombre Completo"]
 *
 * - Si el email YA existe  → lo promueve a admin + resetea su contraseña.
 *                            El nombre es opcional (conserva el actual).
 * - Si el email NO existe   → requiere "Nombre Completo" para crearlo.
 * - Genera contraseña temporal (cumple ≥8, mayúscula, número) y la imprime.
 * - Envía el correo de bienvenida con esa contraseña temporal.
 * - onboarding_completed=true para que no caiga en el cuestionario de cliente.
 *
 * Pensado para correr DENTRO de Railway (red interna + Resend ya configurados):
 *   railway ssh "node scripts/grant-admin.cjs <email> [nombre]"
 *
 * Nunca commitees DATABASE_URL ni la contraseña generada.
 */

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { pathToFileURL } = require("url");

const ROLE = "admin"; // acceso completo de admin; super_admin se reserva al dueño

const args = process.argv.slice(2);
const email = (args[0] || "").trim().toLowerCase();
const nameArg = (args[1] || "").trim();

if (!email) {
  console.error('Uso: node scripts/grant-admin.cjs <email> ["Nombre Completo"]');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(`Email inválido: ${email}`);
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("Falta DATABASE_URL. Córrelo dentro de Railway: railway ssh \"node scripts/grant-admin.cjs ...\"");
  process.exit(1);
}

// Contraseña temporal que cumple el schema (≥8 chars, mayúscula, número).
const generatePassword = () => {
  const bytes = crypto.randomBytes(12).toString("base64").replace(/[+/=]/g, "");
  return `K${bytes.slice(0, 14)}9`;
};
const tempPassword = generatePassword();

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

(async () => {
  const client = await pool.connect();
  try {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`).catch(() => {});
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false`).catch(() => {});

    const hash = await bcrypt.hash(tempPassword, 12);
    const existing = await client.query("SELECT id, role, display_name FROM users WHERE email = $1", [email]);

    let action, userId, finalName;
    if (existing.rows.length === 0) {
      if (!nameArg) {
        console.error(`NO_USER: ${email} no tiene cuenta. Re-ejecuta con su nombre completo:`);
        console.error(`  railway ssh "node scripts/grant-admin.cjs ${email} \\"Nombre Completo\\""`);
        process.exit(3);
      }
      const r = await client.query(
        `INSERT INTO users (display_name, email, password_hash, role, accepts_terms, accepts_communications, onboarding_completed)
         VALUES ($1, $2, $3, $4, true, false, true)
         RETURNING id`,
        [nameArg, email, hash, ROLE]
      );
      userId = r.rows[0].id;
      finalName = nameArg;
      action = "creada nueva";
    } else {
      const prev = existing.rows[0];
      const r = await client.query(
        `UPDATE users SET role = $1, password_hash = $2,
           display_name = COALESCE(NULLIF($3, ''), display_name),
           onboarding_completed = true, updated_at = NOW()
         WHERE email = $4
         RETURNING id, display_name`,
        [ROLE, hash, nameArg, email]
      );
      userId = r.rows[0].id;
      finalName = r.rows[0].display_name;
      action = `promovida (rol anterior: ${prev.role})`;
    }

    // Correo de bienvenida (Resend). emailService es ESM → import dinámico.
    let emailed = false;
    let emailErr = null;
    try {
      const modUrl = pathToFileURL(path.join(__dirname, "..", "server", "emailService.js")).href;
      const { sendAdminWelcome } = await import(modUrl);
      const base = (process.env.APP_URL || process.env.SITE_URL || "https://www.almamovement.com.mx").replace(/\/$/, "");
      await sendAdminWelcome({ to: email, name: finalName, tempPassword, loginUrl: `${base}/auth/login` });
      emailed = !!process.env.RESEND_API_KEY;
    } catch (e) {
      emailErr = e.message;
    }

    console.log("");
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  Admin ${action}`);
    console.log("════════════════════════════════════════════════════════════");
    console.log(`  ID:       ${userId}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Nombre:   ${finalName}`);
    console.log(`  Rol:      ${ROLE}`);
    console.log(`  Password: ${tempPassword}   ← temporal, que la cambie al entrar`);
    console.log(`  Correo:   ${emailed ? "enviado ✓" : "NO enviado" + (emailErr ? ` (${emailErr})` : " (RESEND_API_KEY ausente)")}`);
    console.log("════════════════════════════════════════════════════════════");
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
