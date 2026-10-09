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

test("si la base falla, propaga el error sin permitir acceso ni cachearlo", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; throw new Error("ECONNREFUSED"); } });
  await assert.rejects(gate.isDisabled("u3"), /ECONNREFUSED/);
  await assert.rejects(gate.isDisabled("u3"), /ECONNREFUSED/);
  assert.equal(calls, 2);
});

test("sin id no consulta", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return true; } });
  assert.equal(await gate.isDisabled(undefined), false);
  assert.equal(calls, 0);
});

test("carrera: forget() a la mitad de una consulta en vuelo no vuelve a cachear el resultado viejo", async () => {
  let calls = 0;
  const resolvers = [];
  const gate = createAccountGate({ lookup: () => { calls++; return new Promise((resolve) => resolvers.push(resolve)); } });
  const p1 = gate.isDisabled("u4"); // consulta #1 en vuelo, todavía no resuelve
  gate.forget("u4");                // la baja ocurre a la mitad de esa consulta
  resolvers[0](false);              // la consulta #1 resuelve con el valor ya viejo
  assert.equal(await p1, false);
  // Si ese resultado viejo se hubiera cacheado, esta llamada no volvería a
  // consultar dentro del TTL. Como forget() invalidó la generación, sí vuelve.
  const p2 = gate.isDisabled("u4");
  assert.equal(calls, 2);
  resolvers[1](true);
  assert.equal(await p2, true);
});

test("el caché no crece sin límite: al llegar a maxEntries se limpia entero", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return false; }, maxEntries: 2 });
  await gate.isDisabled("a");
  await gate.isDisabled("b");
  assert.equal(calls, 2);
  // La tercera llave distinta llena el caché (tamaño 2 === maxEntries) y lo limpia
  // antes de insertar la suya.
  await gate.isDisabled("c");
  assert.equal(calls, 3);
  // "a" ya no está: se limpió con el resto, así que se vuelve a consultar.
  await gate.isDisabled("a");
  assert.equal(calls, 4);
});
