import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESPONSIVA_DOCUMENTS, RESPONSIVA_VERSIONS, CURRENT_RESPONSIVA_VERSION, responsivaDocument, waiverVersionProblem,
} from "./responsiva.js";

test("la vigente es la v3 de HIVE; la v1 de Alma se conserva tal como se firmó", () => {
  assert.equal(CURRENT_RESPONSIVA_VERSION, "v3");
  assert.deepEqual(RESPONSIVA_VERSIONS, ["v1", "v2", "v3"]);
  assert.equal(RESPONSIVA_DOCUMENTS.v2.studio, "HIVE Pilates Studio");
  assert.ok(!JSON.stringify(RESPONSIVA_DOCUMENTS.v2).includes("Alma"));
  assert.equal(RESPONSIVA_DOCUMENTS.v1.studio, "Alma Movement");
  assert.match(RESPONSIVA_DOCUMENTS.v1.sections[0].body, /^Participo de forma voluntaria en las clases, entrenamientos y actividades de Alma Movement \(Pilates Reformer, Tower, Mat, Barre y Sculpt\)/);
  assert.equal(RESPONSIVA_DOCUMENTS.v2.sections.length, 5);
});

test("una versión vacía o desconocida se lee como v1 (las firmas de antes del versionado)", () => {
  assert.equal(responsivaDocument(null), RESPONSIVA_DOCUMENTS.v1);
  assert.equal(responsivaDocument("v9"), RESPONSIVA_DOCUMENTS.v1);
  assert.equal(responsivaDocument("v2"), RESPONSIVA_DOCUMENTS.v2);
});

test("versión que se acepta al firmar", () => {
  assert.equal(waiverVersionProblem(undefined), null);
  assert.equal(waiverVersionProblem(null), null);
  assert.equal(waiverVersionProblem("v1"), null);
  assert.equal(waiverVersionProblem("v2"), null);
  for (const bad of ["v9", "", 2, "V2"]) assert.equal(waiverVersionProblem(bad), "Versión de responsiva desconocida.", String(bad));
});
