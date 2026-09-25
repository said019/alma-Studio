import { addDays, parseISO, startOfDay } from "date-fns";

/** ¿Vence hoy o en los próximos `days` días? (spec §5.14: "· vence pronto"). */
export function expiresSoon(endDate?: string | null, now: Date = new Date(), days = 7): boolean {
  if (!endDate) return false;
  const end = startOfDay(parseISO(String(endDate).slice(0, 10)));
  if (Number.isNaN(end.getTime())) return false;
  const today = startOfDay(now);
  return end >= today && end <= addDays(today, days);
}
