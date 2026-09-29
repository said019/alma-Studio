import { test } from "node:test";
import assert from "node:assert/strict";
import { isWithinCancelWindow, penaltyDueAt, faltaReversal } from "./faltas.js";
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
test("revertir UNA falta: baja el contador y devuelve la penalización si esa falta la completó", () => {
  assert.deepEqual(faltaReversal({ faltasCount: 5, threshold: 5, penaltyPoints: 50 }), { newCount: 4, refundPoints: 50 });
  assert.deepEqual(faltaReversal({ faltasCount: 6, threshold: 5, penaltyPoints: 50 }), { newCount: 5, refundPoints: 0 });
  assert.deepEqual(faltaReversal({ faltasCount: 10, threshold: 5, penaltyPoints: 50 }), { newCount: 9, refundPoints: 50 });
  assert.deepEqual(faltaReversal({ faltasCount: 5, threshold: 5, penaltyPoints: 0 }), { newCount: 4, refundPoints: 0 });
  assert.deepEqual(faltaReversal({ faltasCount: 0, threshold: 5, penaltyPoints: 50 }), { newCount: 0, refundPoints: 0 });
});
