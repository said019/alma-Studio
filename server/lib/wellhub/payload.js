// Extractores tolerantes a variantes de estructura del payload de Wellhub.
// Wellhub anida datos en event_data / data / raíz según el evento.

function dig(obj, paths) {
  for (const path of paths) {
    let cur = obj;
    let ok = true;
    for (const key of path) {
      if (cur && typeof cur === "object" && key in cur) cur = cur[key];
      else { ok = false; break; }
    }
    if (ok && cur != null) return cur;
  }
  return null;
}

export function extractGymId(payload) {
  return dig(payload, [
    ["event_data", "slot", "gym_id"],
    ["event_data", "gym_id"],
    ["data", "slot", "gym_id"],
    ["slot", "gym_id"],
    ["gym_id"],
  ]);
}

export function extractBookingNumber(payload) {
  return dig(payload, [
    ["event_data", "booking", "booking_number"],
    ["event_data", "booking_number"],
    ["data", "booking_number"],
    ["booking_number"],
  ]);
}

export function extractSlot(payload) {
  return dig(payload, [
    ["event_data", "slot"],
    ["data", "slot"],
    ["slot"],
  ]) || {};
}

export function extractExternalSlotId(payload) {
  const slot = extractSlot(payload);
  return slot.slot_id ?? slot.id ?? slot.external_slot_id ?? null;
}

export function extractWellhubUserId(payload) {
  return dig(payload, [
    ["event_data", "user", "id"],
    ["event_data", "user_id"],
    ["data", "user", "id"],
    ["user", "id"],
    ["user_id"],
  ]);
}

// Id determinístico para idempotencia (mismo evento → mismo id).
export function computeEventId(eventType, payload) {
  const explicit = dig(payload, [["event_id"], ["id"], ["event_data", "id"]]);
  if (explicit) return `${eventType || "evt"}:${explicit}`;
  const bn = extractBookingNumber(payload);
  const uid = extractWellhubUserId(payload);
  const ts = dig(payload, [["event_data", "occurred_at"], ["occurred_at"], ["timestamp"]]);
  return `${eventType || "evt"}:${bn || ""}:${uid || ""}:${ts || ""}`;
}

// Ventana de check-in. Respeta expires_at (epoch seg o ms); respaldo 90 min
// desde occurred_at (o ahora). Retorna { withinWindow, expiresAt }.
export function checkinWindow(payload, now) {
  const nowMs = now instanceof Date ? now.getTime() : (Number(now) || Date.now());
  const expiresAt = dig(payload, [["event_data", "expires_at"], ["expires_at"]]);
  if (expiresAt != null) {
    let ms = Number(expiresAt);
    if (Number.isFinite(ms)) {
      if (ms < 1e12) ms *= 1000; // epoch en segundos → ms
      return { withinWindow: nowMs <= ms, expiresAt: ms };
    }
  }
  const occurred = dig(payload, [["event_data", "occurred_at"], ["occurred_at"], ["timestamp"]]);
  let occMs = occurred ? Date.parse(occurred) : nowMs;
  if (Number.isNaN(occMs)) occMs = nowMs;
  const limit = occMs + 90 * 60 * 1000;
  return { withinWindow: nowMs <= limit, expiresAt: limit };
}
