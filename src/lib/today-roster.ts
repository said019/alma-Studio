// Tipos y cálculos de GET /admin/today-roster. Los usan Inicio y Pasar lista.

export type TodayRosterEntry = {
  booking_id: string;
  class_id?: string;
  status: string; // confirmed | checked_in | waitlist | no_show
  checked_in_at: string | null;
  guest_profile_id?: string | null;
  user_id: string | null;
  display_name: string | null;
  phone?: string | null;
  guest_name?: string | null;
  host_name?: string | null;
};

export type TodayClass = {
  id: string;
  date?: string;
  start_time: string; // "HH:mm:ss"
  end_time: string;
  max_capacity: number;
  class_type_name: string;
  class_type_color?: string | null;
  instructor_name: string;
  roster: TodayRosterEntry[];
};

/** "11:00:00" → "11:00"; "2026-09-26T07:30:00" → "07:30". */
export const hhmm = (t: string | null | undefined): string => {
  const s = String(t ?? "");
  return (s.includes("T") ? s.split("T")[1] ?? "" : s).slice(0, 5);
};

const toMin = (t: string): number => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesUntil = (start: string, now: string): number => toMin(start) - toMin(now);

export const durationMin = (c: { start_time: string; end_time: string }): number =>
  Math.max(0, toMin(c.end_time) - toMin(c.start_time));

/** Reservadas = confirmadas + con check-in (igual que el cupo de Pasar lista). */
export function summarize(c: TodayClass) {
  let booked = 0, attended = 0, noShow = 0, waitlist = 0, pending = 0;
  for (const r of c.roster ?? []) {
    if (r.status === "confirmed") { booked++; pending++; }
    else if (r.status === "checked_in") { booked++; attended++; }
    else if (r.status === "no_show") noShow++;
    else if (r.status === "waitlist") waitlist++;
  }
  return { booked, attended, noShow, waitlist, pending, full: c.max_capacity > 0 && booked >= c.max_capacity };
}

/** Pasadas = ya terminaron. Siguiente = la primera que no ha terminado (puede estar en curso). */
export function splitDay(classes: TodayClass[], now: string) {
  const sorted = [...classes].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const past = sorted.filter((c) => toMin(c.end_time) <= toMin(now));
  const upcoming = sorted.filter((c) => toMin(c.end_time) > toMin(now));
  return { past, next: upcoming[0] ?? null, later: upcoming.slice(1) };
}

export function daySummary(classes: TodayClass[]) {
  return classes.reduce(
    (acc, c) => {
      const s = summarize(c);
      acc.booked += s.booked;
      acc.capacity += Math.max(0, Number(c.max_capacity) || 0);
      acc.waitlist += s.waitlist;
      acc.count += 1;
      return acc;
    },
    { booked: 0, capacity: 0, waitlist: 0, count: 0 },
  );
}
