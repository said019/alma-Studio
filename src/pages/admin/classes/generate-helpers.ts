import { endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

/** Reglas que hoy no se validan (spec §5.7): fin después de inicio y cupo ≥ 1. */
export function validateGenerate(input: { startTime: string; endTime: string; maxCapacity: number | string }) {
  const time = input.startTime && input.endTime && input.endTime <= input.startTime
    ? "La hora de fin debe ser después de la de inicio."
    : null;
  const cap = Number(input.maxCapacity);
  const capacity = input.maxCapacity === "" || !Number.isFinite(cap) || cap < 1 ? "El cupo debe ser de al menos 1." : null;
  return { time, capacity };
}

/** Meses que tocan las fechas, cada uno en celdas de lunes a domingo (null = hueco). */
export function previewMonths(dates: Date[]) {
  const keys = [...new Set(dates.map((d) => format(d, "yyyy-MM")))].sort();
  return keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const first = startOfMonth(new Date(y, m - 1, 1));
    const last = endOfMonth(first);
    const lead = (getDay(first) + 6) % 7; // lunes = 0
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m - 1, d));
    return { key, label: format(first, "MMMM yyyy", { locale: es }), cells };
  });
}
