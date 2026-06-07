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
