// Catálogo inicial (tipos de clase y paquetes): sólo se siembra en una tabla
// vacía. Con filas existentes —lo que el estudio captura en el panel— el
// arranque no desactiva ni reescribe nada. Revisión final de la landing, C1.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { seedClassTypesIfEmpty, seedPlansIfEmpty } from "./lib/catalogSeed.js";
import { CATALOG_CLASS_TYPES, CATALOG_PLANS } from "./lib/catalog.js";

/** Pool falso: registra cada consulta y responde el conteo pedido. */
function fakePool(n) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (/SELECT\s+COUNT\(\*\)/i.test(text)) return { rows: [{ n }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
}
const writes = (calls) => calls.filter((c) => /^\s*(UPDATE|INSERT|DELETE)\b/i.test(c.text));

test("tipos de clase: con la tabla vacía inserta cada fila", async () => {
  const pool = fakePool(0);
  await seedClassTypesIfEmpty(pool, CATALOG_CLASS_TYPES);
  assert.match(pool.calls[0].text, /SELECT\s+COUNT\(\*\).*FROM\s+class_types/is);
  const w = writes(pool.calls);
  assert.equal(w.length, CATALOG_CLASS_TYPES.length);
  for (const [i, c] of CATALOG_CLASS_TYPES.entries()) {
    assert.match(w[i].text, /^\s*INSERT INTO class_types/i);
    assert.equal(w[i].params[0], c.name);
  }
});

test("tipos de clase: con filas existentes no desactiva ni inserta nada", async () => {
  const pool = fakePool(3);
  await seedClassTypesIfEmpty(pool, CATALOG_CLASS_TYPES);
  assert.deepEqual(writes(pool.calls), []);
  assert.equal(pool.calls.length, 1, "sólo el conteo");
});

test("paquetes: con la tabla vacía inserta cada fila", async () => {
  const pool = fakePool(0);
  await seedPlansIfEmpty(pool, CATALOG_PLANS);
  assert.match(pool.calls[0].text, /SELECT\s+COUNT\(\*\).*FROM\s+plans/is);
  const w = writes(pool.calls);
  assert.equal(w.length, CATALOG_PLANS.length);
  for (const [i, p] of CATALOG_PLANS.entries()) {
    assert.match(w[i].text, /^\s*INSERT INTO plans/i);
    assert.equal(w[i].params[0], p.name);
  }
});

test("paquetes: con filas existentes no desactiva ni inserta nada", async () => {
  const pool = fakePool(12);
  await seedPlansIfEmpty(pool, CATALOG_PLANS);
  assert.deepEqual(writes(pool.calls), []);
  assert.equal(pool.calls.length, 1, "sólo el conteo");
});

test("el arranque ya no reimpone el catálogo inicial", () => {
  const source = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  // El `UPDATE plans SET is_active = false … WHERE id = $1` del borrado suave
  // de un paquete en uso (DELETE /plans/:id) es lógica de negocio y se queda:
  // lo que desaparece es la desactivación masiva por lista de nombres.
  assert.doesNotMatch(source, /UPDATE plans SET is_active = false[^`"']*WHERE name <> ALL/);
  assert.doesNotMatch(source, /UPDATE class_types SET is_active = false WHERE name <> ALL/);
  const start = source.indexOf("async function ensureSchema()");
  const schema = source.slice(start, source.indexOf("\n}\n", start));
  assert.ok(start >= 0 && schema.length > 0);
  assert.doesNotMatch(schema, /for \(const [cp] of CATALOG_(CLASS_TYPES|PLANS)\)/, "sin upsert incondicional");
  assert.match(schema, /seedClassTypesIfEmpty\(pool, CATALOG_CLASS_TYPES\)/);
  assert.match(schema, /seedPlansIfEmpty\(pool, CATALOG_PLANS\)/);
});
