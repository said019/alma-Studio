import { test } from "node:test";
import assert from "node:assert/strict";
import { ALMA_CLASS_TYPES, ALMA_SCHEDULE_SLOTS, ALMA_PLANS } from "./almaCatalog.js";

test("5 disciplinas en 2 areas con cupos correctos", () => {
  assert.equal(ALMA_CLASS_TYPES.length, 5);
  const byName = Object.fromEntries(ALMA_CLASS_TYPES.map((c) => [c.name, c]));
  assert.equal(byName["Pilates Reformer"].category, "reformer_tower");
  assert.equal(byName["Pilates Reformer"].capacity, 4);
  assert.equal(byName["Barre"].category, "studio");
  assert.equal(byName["Barre"].capacity, 8);
});
test("horarios cubren mañana y tarde", () => {
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("6:00 am"));
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("11:00 am"));
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("8:00 pm"));
  assert.ok(!ALMA_SCHEDULE_SLOTS.includes("9:00 pm"));
});
test("17 planes con categorias validas", () => {
  assert.equal(ALMA_PLANS.length, 17);
  const cats = new Set(["studio", "reformer_tower", "mixto", "all"]);
  for (const p of ALMA_PLANS) assert.ok(cats.has(p.class_category), p.name);
});
test("solo los 3 ilimitados tienen opening_price y class_limit null", () => {
  const withOpening = ALMA_PLANS.filter((p) => p.opening_price != null);
  assert.equal(withOpening.length, 3);
  for (const p of withOpening) assert.equal(p.class_limit, null);
  assert.deepEqual(
    withOpening.map((p) => [p.price, p.opening_price]).sort((a, b) => a[0] - b[0]),
    [[2700, 2300], [2900, 2500], [3900, 3500]]
  );
});
test("Alma Studio Intro es trial no repetible", () => {
  const intro = ALMA_PLANS.find((p) => p.name === "Alma Studio Intro");
  assert.equal(intro.is_non_repeatable, true);
  assert.equal(intro.repeat_key, "alma_studio_intro");
});
test("AM Club marca morning_only", () => {
  assert.equal(ALMA_PLANS.find((p) => p.name === "AM Club").morning_only, true);
  assert.equal(ALMA_PLANS.find((p) => p.name === "AM Club Reformer & Tower").morning_only, true);
});
