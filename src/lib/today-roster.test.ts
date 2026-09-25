import { describe, it, expect } from "vitest";
import { daySummary, durationMin, hhmm, minutesUntil, splitDay, summarize, type TodayClass } from "./today-roster";

const e = (id: string, status: string) => ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: id });
const c = (id: string, start: string, end: string, cap: number, roster: ReturnType<typeof e>[] = []): TodayClass => ({
  id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap,
  class_type_name: id, instructor_name: "Fer", roster,
});

describe("today-roster", () => {
  it("hhmm entiende hora sola y fecha con hora", () => {
    expect(hhmm("11:00:00")).toBe("11:00");
    expect(hhmm("2026-09-26T07:30:00")).toBe("07:30");
    expect(hhmm(null)).toBe("");
  });
  it("minutos que faltan y duración", () => {
    expect(minutesUntil("11:00", "10:40")).toBe(20);
    expect(minutesUntil("11:00", "11:10")).toBe(-10);
    expect(durationMin(c("x", "11:00", "11:50", 8))).toBe(50);
  });
  it("cuenta reservadas, asistencias, faltas y espera", () => {
    const s = summarize(c("x", "07:00", "07:50", 3, [e("a", "checked_in"), e("b", "confirmed"), e("c", "no_show"), e("d", "waitlist"), e("f", "confirmed")]));
    expect(s).toEqual({ booked: 3, attended: 1, noShow: 1, waitlist: 1, pending: 2, full: true });
  });
  it("sobrecupo cuenta como llena", () => {
    expect(summarize(c("x", "07:00", "07:50", 1, [e("a", "confirmed"), e("b", "confirmed")])).full).toBe(true);
  });
  it("parte el día en pasadas, siguiente y el resto", () => {
    const day = [c("13", "13:00", "13:50", 6), c("07", "07:00", "07:50", 8), c("11", "11:00", "11:50", 8)];
    const a = splitDay(day, "10:40");
    expect(a.past.map((x) => x.id)).toEqual(["07"]);
    expect(a.next?.id).toBe("11");
    expect(a.later.map((x) => x.id)).toEqual(["13"]);
    expect(splitDay(day, "11:20").next?.id).toBe("11"); // en curso
    const tarde = splitDay(day, "14:00");
    expect(tarde.next).toBeNull();
    expect(tarde.past).toHaveLength(3);
    expect(splitDay([], "10:00")).toEqual({ past: [], next: null, later: [] });
  });
  it("resume el día", () => {
    expect(daySummary([c("a", "07:00", "07:50", 8, [e("1", "confirmed"), e("2", "waitlist")]), c("b", "09:00", "09:50", 6)]))
      .toEqual({ booked: 1, capacity: 14, waitlist: 1, count: 2 });
  });
});
