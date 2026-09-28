import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, makeClient, cleanup, closeDb } from "./helpers.mjs";

const PFX = "rgvalid";
let c;
before(async () => { c = await makeClient(PFX, "a"); });
after(async () => { await cleanup(PFX); await closeDb(); });

test("POST /api/bookings con classId que no es UUID → 400, no 500", async () => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId: "no-es-uuid" } });
  assert.equal(r.status, 400);
});

test("POST /api/me/waiver con firma de 1×1 px → 400", async () => {
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "Prueba", signature_data: tiny } });
  assert.equal(r.status, 400);
});
