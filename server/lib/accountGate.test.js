import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountGate } from "./accountGate.js";

test("consulta una vez por usuaria dentro del TTL", async () => {
  let calls = 0, t = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return false; }, ttlMs: 1000, now: () => t });
  assert.equal(await gate.isDisabled("u1"), false);
  await gate.isDisabled("u1");
  assert.equal(calls, 1);
  t = 1500;
  await gate.isDisabled("u1");
  assert.equal(calls, 2);
});

test("una cuenta dada de baja queda bloqueada; forget() obliga a volver a consultar", async () => {
  let disabled = false, calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return disabled; } });
  assert.equal(await gate.isDisabled("u2"), false);
  disabled = true;
  gate.forget("u2");
  assert.equal(await gate.isDisabled("u2"), true);
  assert.equal(calls, 2);
});

test("si la base falla, no bloquea (y no guarda el error)", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; throw new Error("ECONNREFUSED"); } });
  assert.equal(await gate.isDisabled("u3"), false);
  assert.equal(await gate.isDisabled("u3"), false);
  assert.equal(calls, 2);
});

test("sin id no consulta", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return true; } });
  assert.equal(await gate.isDisabled(undefined), false);
  assert.equal(calls, 0);
});
