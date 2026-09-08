// Revisión de código, 8 sep 2026 · Lo que ve una instalación NUEVA.
// El arreglo del doble descuento sólo sirve si sobrevive a db:schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const MIG = path.join(import.meta.dirname, "..", "..", "supabase", "migrations");
const schema = fs.readFileSync(path.join(MIG, "schema_complete.sql"), "utf8");
const applier = fs.readFileSync(path.join(import.meta.dirname, "..", "..", "scripts", "db-apply-schema.cjs"), "utf8");

test("R1 schema_complete.sql NO recrea el trigger de doble descuento", () => {
  assert.ok(!/CREATE TRIGGER trigger_decrement_classes/.test(schema),
    "schema_complete.sql vuelve a crear trigger_decrement_classes: una instalación nueva o un db:schema reinstalan el doble cobro");
});

test("R1 schema_complete.sql define el valor 'closed' de class_status", () => {
  const enumLine = schema.match(/CREATE TYPE class_status[^;]+;/s)?.[0] || "";
  const addValue = /ALTER TYPE class_status ADD VALUE IF NOT EXISTS 'closed'/.test(schema);
  assert.ok(/'closed'/.test(enumLine) || addValue,
    "una base nueva no tendría el valor 'closed' y cerrar clase volvería a dar 500");
});

test("R1 la migración de la auditoría está en el aplicador de esquema", () => {
  assert.ok(/20260908_fix_doble_descuento_y_contador\.sql/.test(applier),
    "la migración no la aplica ningún camino automático: sólo existe si alguien la corre a mano");
});

test("R5 el harness de pruebas no lleva la contraseña por defecto escrita", () => {
  const helpers = fs.readFileSync(path.join(import.meta.dirname, "helpers.mjs"), "utf8");
  assert.ok(!/Alma\$Reformer2026!/.test(helpers),
    "helpers.mjs reintroduce en el repo justo la contraseña que seguridad.test.mjs exige eliminar");
});
