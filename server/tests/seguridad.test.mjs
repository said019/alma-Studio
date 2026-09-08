// P0-4 y P0-5 · Credenciales y datos sensibles. Auditoría 2026-09-08.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { closeDb } from "./helpers.mjs";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");

test("P0-4 no hay contraseña de admin por defecto en el código", () => {
  assert.ok(!/Alma\$Reformer2026!/.test(SRC), "la contraseña por defecto sigue escrita en el código");
});

test("P0-4 el bootstrap NO reimpone la contraseña del admin en cada arranque", () => {
  const bloque = SRC.slice(Math.max(0, SRC.indexOf("Admin user ready") - 1600), SRC.indexOf("Admin user ready"));
  assert.ok(!/ON CONFLICT\s*\(email\)\s*DO UPDATE[\s\S]{0,220}password_hash\s*=/i.test(bloque),
    "el seed sigue sobrescribiendo password_hash: un reinicio revertiría el cambio de contraseña de la dueña");
});

test("P0-5 no hay CLABE ni cuenta bancaria real en el código", () => {
  assert.ok(!/072298012591154950/.test(SRC), "la CLABE real sigue en el código");
  assert.ok(!/4189143097040441/.test(SRC), "el número de cuenta real sigue en el código");
  assert.ok(!/Estefan[ií]a Torres Lanzagorta/.test(SRC), "el nombre del titular sigue en el código");
});

test("cierre", async () => { await closeDb(); });
