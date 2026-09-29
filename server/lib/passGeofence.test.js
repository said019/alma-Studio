import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { passGeofence, passLocationFields, DEFAULT_PASS_RADIUS_M } from "./passGeofence.js";

const TEXTO = "Estás cerca de HIVE. Saca tu pase para check-in.";

test("sin BUSINESS_LATITUDE/BUSINESS_LONGITUDE no hay geocerca ni coordenadas de respaldo", () => {
  assert.equal(passGeofence({}), null);
  assert.deepEqual(passLocationFields(TEXTO, {}), {});
  // Con una sola de las dos tampoco: una geocerca a medias apuntaría a otro lado.
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LATITUDE: "19.35" }), {});
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LONGITUDE: "-99.16" }), {});
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LATITUDE: "  ", BUSINESS_LONGITUDE: "" }), {});
});

test("valores inválidos o fuera de rango se tratan como no configurados", () => {
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LATITUDE: "abc", BUSINESS_LONGITUDE: "-99.16" }), {});
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LATITUDE: "95", BUSINESS_LONGITUDE: "-99.16" }), {});
  assert.deepEqual(passLocationFields(TEXTO, { BUSINESS_LATITUDE: "19.35", BUSINESS_LONGITUDE: "-181" }), {});
});

test("con las dos variables el pase lleva locations y el radio (150 m por defecto)", () => {
  const env = { BUSINESS_LATITUDE: "19.35", BUSINESS_LONGITUDE: "-99.16" };
  assert.deepEqual(passLocationFields(TEXTO, env), {
    locations: [{ latitude: 19.35, longitude: -99.16, relevantText: TEXTO }],
    maxDistance: DEFAULT_PASS_RADIUS_M,
  });
  assert.equal(passGeofence({ ...env, BUSINESS_PASS_RADIUS_M: "80" }).maxDistance, 80);
  assert.equal(passGeofence({ ...env, BUSINESS_PASS_RADIUS_M: "-5" }).maxDistance, DEFAULT_PASS_RADIUS_M);
});

test("el servidor ya no trae las coordenadas viejas de respaldo y usa passLocationFields", () => {
  const src = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /22\.1536775|-100\.9970307/);
  assert.doesNotMatch(src, /BUSINESS_LATITUDE \|\||BUSINESS_LONGITUDE \|\|/);
  assert.match(src, /\.\.\.passLocationFields\(/);
});
