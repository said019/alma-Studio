import { test } from "node:test";
import assert from "node:assert/strict";
import { publicPartnerSettings, mergeSecret } from "./partnerSettings.js";

test("publicPartnerSettings nunca devuelve los secretos", () => {
  const row = { channel: "wellhub", is_enabled: true, webhook_secret: "s3cr3t-webhook-abcd", access_token: "eyJ.token.wxyz", gym_id: "g1" };
  const out = publicPartnerSettings(row);
  assert.equal(out.webhook_secret, "••••abcd");
  assert.equal(out.access_token, "••••wxyz");
  assert.equal(out.has_webhook_secret, true);
  assert.equal(out.has_access_token, true);
  assert.equal(out.gym_id, "g1");
  assert.ok(!JSON.stringify(out).includes("s3cr3t"));
  assert.equal(publicPartnerSettings(null), null);
  const vacio = publicPartnerSettings({ channel: "wellhub", webhook_secret: null, access_token: "" });
  assert.equal(vacio.webhook_secret, null);
  assert.equal(vacio.has_access_token, false);
});

test("mergeSecret conserva el valor guardado salvo que llegue uno nuevo", () => {
  assert.equal(mergeSecret(undefined, "viejo"), "viejo");
  assert.equal(mergeSecret("", "viejo"), "viejo");
  assert.equal(mergeSecret(null, "viejo"), "viejo");
  assert.equal(mergeSecret("••••ejo1", "viejo"), "viejo");
  assert.equal(mergeSecret("nuevo", "viejo"), "nuevo");
  assert.equal(mergeSecret("nuevo", null), "nuevo");
  assert.equal(mergeSecret(undefined, null), null);
});
