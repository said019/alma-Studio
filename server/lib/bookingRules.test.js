import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClassCategory,
  isMembershipCategoryCompatible,
  isWithinMorningWindow,
  categoryLabel,
  mixtoBucketField,
  splitMixtoCredits,
  canMixtoBook,
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
test("mixto: bucket por categoría de clase", () => {
  assert.equal(mixtoBucketField("studio"), "studio_remaining");
  assert.equal(mixtoBucketField("reformer_tower"), "rt_remaining");
  assert.equal(mixtoBucketField("all"), null);
});
test("mixto: split conserva el total (studio + rt === total)", () => {
  assert.deepEqual(splitMixtoCredits(8, 4, 4), { studio: 4, rt: 4 });
  assert.deepEqual(splitMixtoCredits(16, 8, 8), { studio: 8, rt: 8 });
  // total impar / ratio desigual: el resto cae en rt, suma exacta
  const s = splitMixtoCredits(7, 1, 1);
  assert.equal(s.studio + s.rt, 7);
  const r = splitMixtoCredits(10, 6, 4);
  assert.deepEqual(r, { studio: 6, rt: 4 });
});
test("mixto: solo puede reservar el área con bucket > 0", () => {
  const buckets = { studioRemaining: 0, rtRemaining: 4 };
  assert.equal(canMixtoBook(buckets, "studio"), false);          // studio agotado
  assert.equal(canMixtoBook(buckets, "reformer_tower"), true);   // aún hay R/T
  assert.equal(canMixtoBook({ studioRemaining: 2, rtRemaining: 0 }, "reformer_tower"), false);
});
