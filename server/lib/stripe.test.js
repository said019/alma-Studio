import { test } from "node:test";
import assert from "node:assert/strict";
import { statementDescriptor, DEFAULT_STATEMENT_DESCRIPTOR } from "./stripe.js";

test("sin STRIPE_STATEMENT_DESCRIPTOR el estado de cuenta dice HIVE PILATES STUDIO", () => {
  assert.equal(DEFAULT_STATEMENT_DESCRIPTOR, "HIVE PILATES STUDIO");
  assert.equal(statementDescriptor({}), "HIVE PILATES STUDIO");
  assert.ok(!/alma/i.test(statementDescriptor({})));
});

test("la variable de entorno manda y se corta a los 22 caracteres de Stripe", () => {
  assert.equal(statementDescriptor({ STRIPE_STATEMENT_DESCRIPTOR: "HIVE COYOACAN" }), "HIVE COYOACAN");
  assert.equal(statementDescriptor({ STRIPE_STATEMENT_DESCRIPTOR: "X".repeat(30) }).length, 22);
});
