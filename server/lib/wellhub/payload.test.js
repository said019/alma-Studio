import { test } from "node:test";
import assert from "node:assert";
import {
  extractGymId, extractBookingNumber, extractExternalSlotId,
  extractWellhubUserId, computeEventId, checkinWindow,
} from "./payload.js";

test("extractGymId de event_data.slot.gym_id", () => {
  assert.equal(extractGymId({ event_data: { slot: { gym_id: "838259" } } }), "838259");
});
test("extractGymId variantes", () => {
  assert.equal(extractGymId({ gym_id: "1" }), "1");
  assert.equal(extractGymId({ slot: { gym_id: "2" } }), "2");
  assert.equal(extractGymId({}), null);
});
test("extractBookingNumber", () => {
  assert.equal(extractBookingNumber({ event_data: { booking_number: "BK1" } }), "BK1");
  assert.equal(extractBookingNumber({ event_data: { booking: { booking_number: "BK2" } } }), "BK2");
});
test("extractExternalSlotId", () => {
  assert.equal(extractExternalSlotId({ event_data: { slot: { slot_id: "S9" } } }), "S9");
  assert.equal(extractExternalSlotId({ slot: { id: "S1" } }), "S1");
});
test("extractWellhubUserId", () => {
  assert.equal(extractWellhubUserId({ event_data: { user: { id: "U1" } } }), "U1");
});
test("computeEventId determinístico", () => {
  const p = { event_data: { booking_number: "BK1", user: { id: "U1" }, occurred_at: "2026-07-24T10:00:00Z" } };
  assert.equal(computeEventId("checkin", p), computeEventId("checkin", p));
  assert.ok(computeEventId("checkin", p).startsWith("checkin:"));
});
test("checkinWindow respeta expires_at futuro", () => {
  const future = Math.floor(Date.now() / 1000) + 600;
  assert.equal(checkinWindow({ event_data: { expires_at: future } }, Date.now()).withinWindow, true);
});
test("checkinWindow expira", () => {
  const past = Math.floor(Date.now() / 1000) - 600;
  assert.equal(checkinWindow({ event_data: { expires_at: past } }, Date.now()).withinWindow, false);
});
test("checkinWindow respaldo 90 min sin expires_at", () => {
  const now = Date.now();
  assert.equal(checkinWindow({}, now).withinWindow, true);
});
