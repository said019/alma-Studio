// Tarea 1 · auditoría 2026-09-27, bloque 3. Esquema nuevo (sólo CREATE/ADD
// COLUMN/CREATE INDEX) y el arranque sin la "reconciliación" que pisaba el
// contador de cancelaciones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { sql, closeDb } from "./helpers.mjs";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
const boot = SRC.slice(0, SRC.indexOf("✅ Schema ensured"));

after(async () => { await closeDb(); });

test("columnas nuevas del bloque 3", async () => {
  const esperadas = [
    ["bookings", "promoted_at"],
    ["orders", "refunded_amount"], ["orders", "refund_status"], ["orders", "refunded_at"],
    ["plans", "archived_at"], ["plans", "archived_by"],
    ["users", "privacy_notice_version"], ["users", "privacy_accepted_at"],
    ["users", "health_consent_version"], ["users", "health_consent_at"],
  ];
  const filas = await sql(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[]) AND column_name = ANY($2::text[])`,
    [[...new Set(esperadas.map(([t]) => t))], esperadas.map(([, c]) => c)],
  );
  const hay = new Set(filas.map((f) => `${f.table_name}.${f.column_name}`));
  for (const [t, c] of esperadas) assert.ok(hay.has(`${t}.${c}`), `falta ${t}.${c}`);
  const [def] = await sql(
    `SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'refunded_amount'`,
  );
  assert.equal(def.is_nullable, "NO");
  assert.match(String(def.column_default), /^0/);
});

test("tabla refunds e índices", async () => {
  const [r] = await sql(`SELECT to_regclass('refunds') AS t, to_regclass('idx_refunds_order') AS i1,
                                to_regclass('idx_refunds_created') AS i2, to_regclass('idx_bookings_class_waitlist') AS i3`);
  assert.ok(r.t && r.i1 && r.i2 && r.i3, JSON.stringify(r));
});

test("el arranque ya no recalcula cancellations_used (pisaba los ajustes de recepción)", () => {
  assert.ok(!/SET cancellations_used = sub\.cnt/.test(boot), "la reconciliación sigue en ensureSchema()");
  assert.ok(!/Reconcile cancellations_used/.test(boot));
});

test("el bloque de esquema nuevo no trae UPDATE ni DELETE", () => {
  const i = boot.indexOf("// ── Bloque 3 de la auditoría (2026-09-27)");
  assert.ok(i > 0, "falta el bloque de esquema del bloque 3");
  const bloque = boot.slice(i);
  assert.ok(!/\bUPDATE\b|\bDELETE\b/.test(bloque), "el esquema del bloque 3 no debe cambiar datos");
});

test("existe el gancho onSeatReleased", () => {
  assert.match(SRC, /async function onSeatReleased\(classIds, ctx = \{\}\)/);
});
