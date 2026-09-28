import { test } from "node:test";
import assert from "node:assert/strict";
import { createChannelState } from "./whatsappState.js";

test("cachea el estado durante el TTL", async () => {
  let calls = 0, t = 0;
  const get = createChannelState({ probe: async () => { calls++; return { connected: true, state: "connected" }; }, ttlMs: 1000, now: () => t });
  assert.deepEqual(await get(), { connected: true, state: "connected" });
  await get();
  assert.equal(calls, 1);
  t = 1500;
  await get();
  assert.equal(calls, 2);
});

test("si la sonda falla, el canal cuenta como desconectado", async () => {
  const get = createChannelState({ probe: async () => { throw new Error("ECONNREFUSED"); } });
  assert.deepEqual(await get(), { connected: false, state: "disconnected" });
});

test("sonda lenta: se corta a los 5 s y cuenta como desconectado", async () => {
  const get = createChannelState({ probe: () => new Promise(() => {}), timeoutMs: 50 });
  assert.deepEqual(await get(), { connected: false, state: "disconnected" });
});
