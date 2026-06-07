import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinCancelWindow, penaltyDueAt } from "./faltas.js";
test("ventana de cancelación 12h", () => {
  assert.equal(isWithinCancelWindow(719), true);   // <12h
  assert.equal(isWithinCancelWindow(720), false);  // exactamente 12h
  assert.equal(isWithinCancelWindow(60), true);
  assert.equal(isWithinCancelWindow(1000), false);
});
test("penalización cada N faltas", () => {
  assert.equal(penaltyDueAt(5, 5), true);
  assert.equal(penaltyDueAt(4, 5), false);
  assert.equal(penaltyDueAt(10, 5), true);
  assert.equal(penaltyDueAt(0, 5), false);
});
