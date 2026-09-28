import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, signatureProblem, maskSecret, isMaskedSecret } from "./validate.js";

const png = (w, h, extraBytes = 2000) => {
  const b = Buffer.alloc(33 + extraBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

test("isUuid", () => {
  assert.equal(isUuid("3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f"), true);
  for (const bad of [null, undefined, "", "no-es-uuid", "3f1b2c4d1a2b4c3d8e9f0a1b2c3d4e5f", 123, {}]) assert.equal(isUuid(bad), false);
});

test("signatureProblem acepta una firma PNG razonable", () => {
  assert.equal(signatureProblem(png(600, 200)), null);
});

test("signatureProblem acepta una firma real y corta (lienzo 330×140, ~450 caracteres base64)", () => {
  // Un trazo corto en un teléfono a devicePixelRatio 1 codifica a menos de
  // 1000 caracteres base64; el mínimo debe dejarla pasar (MIN_BASE64 = 200).
  assert.equal(signatureProblem(png(330, 140, 300)), null);
});

test("signatureProblem rechaza firmas vacías, diminutas o que no son PNG", () => {
  assert.ok(signatureProblem(""));
  assert.ok(signatureProblem("hola"));
  assert.ok(signatureProblem("data:image/jpeg;base64,AAAA"));
  assert.ok(signatureProblem(png(1, 1)), "1×1 px");
  assert.ok(signatureProblem(png(600, 200, 10)), "muy poco contenido (por debajo de 200 caracteres base64)");
  assert.ok(signatureProblem("data:image/png;base64," + Buffer.from("no soy png".repeat(200)).toString("base64")), "no es PNG");
  assert.ok(signatureProblem("data:image/png;base64,iVBORw0KGgo="), "cabecera truncada");
});

test("maskSecret e isMaskedSecret", () => {
  assert.equal(maskSecret(null), null);
  assert.equal(maskSecret(""), null);
  assert.equal(maskSecret("abcdefgh1234"), "••••1234");
  assert.equal(maskSecret("abc"), "••••");
  assert.equal(isMaskedSecret("••••1234"), true);
  assert.equal(isMaskedSecret("nuevo-secreto"), false);
  assert.equal(isMaskedSecret(undefined), false);
});
