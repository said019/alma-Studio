import { test } from "node:test";
import assert from "node:assert";
import crypto from "crypto";
import { verifyWellhubSignature, extractSignatureHeader } from "./signature.js";

const secret = "s3cr3t";
const body = Buffer.from('{"a":1}');
const hmac = crypto.createHmac("sha1", secret).update(body).digest("hex");

test("firma válida (hex minúsculas)", () => {
  assert.equal(verifyWellhubSignature(body, hmac, secret), true);
});
test("acepta MAYÚSCULAS", () => {
  assert.equal(verifyWellhubSignature(body, hmac.toUpperCase(), secret), true);
});
test("acepta prefijo sha1=", () => {
  assert.equal(verifyWellhubSignature(body, "sha1=" + hmac, secret), true);
});
test("firma inválida => false", () => {
  assert.equal(verifyWellhubSignature(body, "0".repeat(40), secret), false);
});
test("sin secret => null (omitir)", () => {
  assert.equal(verifyWellhubSignature(body, hmac, ""), null);
});
test("sin header => false", () => {
  assert.equal(verifyWellhubSignature(body, null, secret), false);
});
test("extractSignatureHeader elige el primero presente", () => {
  assert.equal(extractSignatureHeader({ "X-Gympass-Signature": "abc" }), "abc");
  assert.equal(extractSignatureHeader({ "x-signature": "z" }), "z");
  assert.equal(extractSignatureHeader({ "content-type": "x" }), null);
});
