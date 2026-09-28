import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnonymizeUpdate, userAnonymizationValues, anonEmail, WAIVER_ANON_VALUES, ANON_NAME } from "./anonymize.js";

const ID = "3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("el correo anónimo es único por id y de un dominio que no existe", () => {
  assert.equal(anonEmail(ID), "baja+3f1b2c4d1a2b4c3d8e9f0a1b2c3d4e5f@hive.invalid");
});

test("users: borra datos personales y de salud y cierra el acceso", () => {
  const v = userAnonymizationValues(ID, "actor");
  assert.equal(v.display_name, ANON_NAME);
  for (const k of ["phone", "date_of_birth", "health_notes", "has_injury", "injury_details", "emergency_contact_name", "emergency_contact_phone", "password_hash"]) {
    assert.equal(v[k], null, k);
  }
  assert.equal(v.is_active, false);
  assert.equal(v.anonymized_by, "actor");
});

test("sólo toca columnas que existen, en orden, con NOW() para las de fecha", () => {
  const existing = new Set(["id", "display_name", "email", "phone", "health_notes", "anonymized_at", "is_active"]);
  const u = buildAnonymizeUpdate({ table: "users", values: userAnonymizationValues(ID, null), nowColumns: ["anonymized_at", "updated_at"], existing, id: ID });
  assert.equal(u.sql, "UPDATE users SET display_name = $2, email = $3, phone = $4, health_notes = $5, is_active = $6, anonymized_at = NOW() WHERE id = $1");
  assert.deepEqual(u.params, [ID, ANON_NAME, anonEmail(ID), null, null, false]);
});

test("responsiva por user_id; sin columnas → null", () => {
  const w = buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: new Set(["full_name", "signature_data"]), idColumn: "user_id", id: ID });
  assert.equal(w.sql, "UPDATE waivers SET full_name = $2, signature_data = $3 WHERE user_id = $1");
  assert.equal(buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: new Set(), id: ID }), null);
});
