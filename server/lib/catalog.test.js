import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_CLASS_TYPES, CATALOG_SCHEDULE_SLOTS, CATALOG_PLANS } from "./catalog.js";

test("5 disciplinas en 2 areas con cupos correctos", () => {
  assert.equal(CATALOG_CLASS_TYPES.length, 5);
  const byName = Object.fromEntries(CATALOG_CLASS_TYPES.map((c) => [c.name, c]));
  assert.equal(byName["Pilates Reformer"].category, "reformer_tower");
  assert.equal(byName["Pilates Reformer"].capacity, 4);
  assert.equal(byName["Barre"].category, "studio");
  assert.equal(byName["Barre"].capacity, 8);
});
test("horarios cubren mañana y tarde", () => {
  assert.ok(CATALOG_SCHEDULE_SLOTS.includes("6:00 am"));
  assert.ok(CATALOG_SCHEDULE_SLOTS.includes("11:00 am"));
  assert.ok(CATALOG_SCHEDULE_SLOTS.includes("8:00 pm"));
  assert.ok(!CATALOG_SCHEDULE_SLOTS.includes("9:00 pm"));
});
test("17 planes con categorias validas", () => {
  assert.equal(CATALOG_PLANS.length, 17);
  const cats = new Set(["studio", "reformer_tower", "mixto", "all"]);
  for (const p of CATALOG_PLANS) assert.ok(cats.has(p.class_category), p.name);
});
test("solo los 3 ilimitados tienen opening_price y class_limit null", () => {
  const withOpening = CATALOG_PLANS.filter((p) => p.opening_price != null);
  assert.equal(withOpening.length, 3);
  for (const p of withOpening) assert.equal(p.class_limit, null);
  assert.deepEqual(
    withOpening.map((p) => [p.price, p.opening_price]).sort((a, b) => a[0] - b[0]),
    [[2700, 2300], [2900, 2500], [3900, 3500]]
  );
});
test("Studio Intro es trial no repetible", () => {
  const intro = CATALOG_PLANS.find((p) => p.name === "Studio Intro");
  assert.equal(intro.is_non_repeatable, true);
  assert.equal(intro.repeat_key, "studio_intro");
});
test("AM Club marca morning_only", () => {
  assert.equal(CATALOG_PLANS.find((p) => p.name === "AM Club").morning_only, true);
  assert.equal(CATALOG_PLANS.find((p) => p.name === "AM Club Reformer & Tower").morning_only, true);
});
test("el catálogo inicial no lleva la marca anterior en nombres, descripciones ni claves", () => {
  for (const x of [...CATALOG_CLASS_TYPES, ...CATALOG_PLANS]) {
    assert.doesNotMatch(JSON.stringify(x), /alma/i, x.name);
  }
  assert.deepEqual(
    CATALOG_PLANS.filter((p) => p.class_category === "mixto" || p.class_category === "all").map((p) => p.name),
    ["Balance", "Fusion", "Experience", "Unlimited"],
  );
});
