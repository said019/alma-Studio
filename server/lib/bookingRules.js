const VALID_CATEGORIES = ["studio", "reformer_tower", "mixto", "all"];

export function normalizeClassCategory(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  return VALID_CATEGORIES.includes(raw) ? raw : fallback;
}

export function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  const memCat = normalizeClassCategory(membershipCategory, "all");
  const clsCat = normalizeClassCategory(classCategory, "all");
  if (clsCat === "all") return true;
  if (memCat === "all" || memCat === "mixto") return true;
  return memCat === clsCat;
}

export function categoryLabel(category) {
  switch (normalizeClassCategory(category)) {
    case "studio": return "Studio";
    case "reformer_tower": return "Reformer/Tower";
    case "mixto": return "Mixto";
    default: return "Alma";
  }
}

// AM Club: solo clases que empiezan a las 10:00am o antes, hora del studio.
export function isWithinMorningWindow(startsAt, timeZone = "America/Mexico_City", lastHour = 10) {
  if (!startsAt) return false;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(d)
  );
  return hour <= lastHour;
}

// ─── Paquetes MIXTOS: créditos por área (studio / reformer_tower) ───────────

// Columna del bucket que corresponde a la categoría de una clase. null si la
// categoría no es específica (no debería pasar para una clase real).
export function mixtoBucketField(classCategory) {
  const c = normalizeClassCategory(classCategory, "all");
  if (c === "studio") return "studio_remaining";
  if (c === "reformer_tower") return "rt_remaining";
  return null;
}

// Reparte un total por el ratio studio:rt. Garantiza studio + rt === total
// (el resto cae en rt). Misma fórmula que el trigger/backfill en SQL.
export function splitMixtoCredits(total, studioCredits, rtCredits) {
  const t = Math.max(0, Math.floor(Number(total) || 0));
  const sc = Math.max(0, Number(studioCredits) || 0);
  const rc = Math.max(0, Number(rtCredits) || 0);
  if (sc + rc === 0) return { studio: 0, rt: t };
  const studio = Math.floor((t * sc) / (sc + rc));
  return { studio, rt: t - studio };
}

// ¿Puede una membresía mixta reservar esta categoría? (bucket > 0).
export function canMixtoBook(buckets, classCategory) {
  const field = mixtoBucketField(classCategory);
  if (field === "studio_remaining") return Number(buckets?.studioRemaining) > 0;
  if (field === "rt_remaining") return Number(buckets?.rtRemaining) > 0;
  return true;
}
