import { test } from "node:test";
import assert from "node:assert/strict";
import { findOrCreatePartnerUser } from "./flows.js";
import { syntheticGuestEmail, syntheticPartnerEmail } from "../syntheticEmail.js";

const payload = (user) => ({ event_data: { user: { id: "wh-77", ...user } } });

/** Pool falso: `existing` responde la búsqueda por wellhub_id; registra todo. */
function fakePool(existing = null) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (/SELECT \* FROM users WHERE wellhub_id/.test(text)) return { rows: existing ? [existing] : [] };
      if (/^\s*INSERT INTO users/.test(text)) return { rows: [{ id: "nuevo", email: params[1] }] };
      return { rows: [] };
    },
  };
}

test("correos sintéticos nuevos con dominio de HIVE", () => {
  assert.equal(syntheticGuestEmail("abc"), "guest+abc@hive.guest");
  assert.equal(syntheticPartnerEmail("wh-77"), "wellhub+wh-77@hive.partner");
});

test("socia de Wellhub ya creada (con el dominio anterior) se encuentra por wellhub_id y no se duplica", async () => {
  const vieja = { id: "u1", email: "wellhub+wh-77@alma.partner", wellhub_id: "wh-77" };
  const pool = fakePool(vieja);
  const u = await findOrCreatePartnerUser(pool, payload({}));
  assert.equal(u, vieja);
  assert.equal(pool.calls.length, 1, "sólo la búsqueda, ningún INSERT");
  assert.match(pool.calls[0].text, /WHERE wellhub_id = \$1/);
  assert.deepEqual(pool.calls[0].params, ["wh-77"]);
});

test("socia nueva sin correo real: se crea con wellhub+<id>@hive.partner", async () => {
  const pool = fakePool(null);
  const u = await findOrCreatePartnerUser(pool, payload({ name: "Ana" }));
  assert.equal(u.email, "wellhub+wh-77@hive.partner");
});

test("socia nueva con correo real: se usa el suyo", async () => {
  const pool = fakePool(null);
  const u = await findOrCreatePartnerUser(pool, payload({ name: "Ana", email: "ana@example.com" }));
  assert.equal(u.email, "ana@example.com");
});
