// Push a main, 8 sep 2026 · El deploy corre `node server/index.js`, sin paso de
// migraciones. Si estas correcciones viven sólo en supabase/migrations, en
// producción no existen y el arreglo del doble cobro es papel.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
const railway = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "..", "railway.json"), "utf8"));
const boot = SRC.slice(0, SRC.indexOf("✅ Schema ensured"));

test("D1 el arranque quita el trigger del doble descuento", () => {
  assert.ok(/DROP TRIGGER IF EXISTS trigger_decrement_classes ON bookings/.test(boot),
    "sin esto, un deploy sobre la base actual deja vivo el doble cobro");
});

test("D2 el arranque agrega el valor 'closed' al enum", () => {
  assert.ok(/ALTER TYPE class_status ADD VALUE IF NOT EXISTS 'closed'/.test(boot),
    "sin esto, cerrar clase sigue dando 500 en producción");
});

test("D3 el arranque repara el contador de cupo inflado", () => {
  assert.ok(/UPDATE classes c SET current_bookings = COALESCE\(\(/.test(boot),
    "el desfase acumulado por el doble incremento no se corrige solo");
});

test("D4 el comando de arranque no incluye migraciones (por eso van en el boot)", () => {
  assert.match(railway.deploy.startCommand, /node server\/index\.js/,
    "si el deploy gana un paso de migraciones, revisar si estas correcciones deben moverse allí");
});
