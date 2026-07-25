import { test } from "node:test";
import assert from "node:assert";
import { resolveWellhubPrice } from "./pricing.js";

test("default 170 cuando falta o inválido", () => {
  assert.equal(resolveWellhubPrice(null), 170);
  assert.equal(resolveWellhubPrice({}), 170);
  assert.equal(resolveWellhubPrice({ wellhub_class_price: "abc" }), 170);
});
test("respeta el valor configurado", () => {
  assert.equal(resolveWellhubPrice({ wellhub_class_price: 200 }), 200);
  assert.equal(resolveWellhubPrice({ wellhub_class_price: "150" }), 150);
  assert.equal(resolveWellhubPrice({ wellhub_class_price: 0 }), 0);
  assert.equal(resolveWellhubPrice({ wellhubClassPrice: 99 }), 99);
});
