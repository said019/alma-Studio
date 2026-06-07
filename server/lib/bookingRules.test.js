import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClassCategory,
  isMembershipCategoryCompatible,
  isWithinMorningWindow,
  categoryLabel,
} from "./bookingRules.js";

test("normaliza categorías nuevas y desconocidas", () => {
  assert.equal(normalizeClassCategory("studio"), "studio");
  assert.equal(normalizeClassCategory("reformer_tower"), "reformer_tower");
  assert.equal(normalizeClassCategory("MIXTO"), "mixto");
  assert.equal(normalizeClassCategory("nope"), "all");
});
test("studio no puede reservar reformer_tower y viceversa", () => {
  assert.equal(isMembershipCategoryCompatible("studio", "reformer_tower"), false);
  assert.equal(isMembershipCategoryCompatible("reformer_tower", "studio"), false);
  assert.equal(isMembershipCategoryCompatible("studio", "studio"), true);
});
test("mixto y all reservan cualquier área", () => {
  assert.equal(isMembershipCategoryCompatible("mixto", "studio"), true);
  assert.equal(isMembershipCategoryCompatible("mixto", "reformer_tower"), true);
  assert.equal(isMembershipCategoryCompatible("all", "reformer_tower"), true);
});
test("ventana matutina: permite <=10am, bloquea tarde (hora Mexico City)", () => {
  assert.equal(isWithinMorningWindow("2026-06-08T15:00:00.000Z"), true);
  assert.equal(isWithinMorningWindow("2026-06-09T00:00:00.000Z"), false);
});
test("categoryLabel para mensajes", () => {
  assert.equal(categoryLabel("studio"), "Studio");
  assert.equal(categoryLabel("reformer_tower"), "Reformer/Tower");
});
