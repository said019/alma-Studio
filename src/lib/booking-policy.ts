// Política de reservas y cancelación de HIVE: una sola fuente de texto para
// /legal/cancelacion, el detalle de clase, el diálogo de cancelar y la vista
// previa de Configuración (auditoría 2026-09-27, P0-4 · P1-1). Los números
// vienen de GET /api/public/booking-policy.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type BookingPolicy = {
  /** Cancelaciones permitidas por paquete; 0 = sin límite. */
  cancellationLimit: number;
  /** Horas antes del inicio para cancelar sin perder la clase. */
  cancelWindowHours: number;
  /** Horas antes del inicio en que cierran las reservas de la app. */
  bookingLeadHours: number;
  /** Hasta cuántas horas antes del inicio sube sola la lista de espera. */
  waitlistCutoffHours: number;
  faltasEnabled: boolean;
  faltasThreshold: number;
};

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  cancellationLimit: 0,
  cancelWindowHours: 12,
  bookingLeadHours: 2,
  waitlistCutoffHours: 2,
  faltasEnabled: true,
  faltasThreshold: 5,
};

const entero = (v: unknown, dflt: number, min: number) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isInteger(n) && n >= min ? n : dflt;
};
const horas = (v: unknown, dflt: number) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

export function normalizeBookingPolicy(raw: unknown): BookingPolicy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_BOOKING_POLICY;
  return {
    cancellationLimit: entero(r.cancellationLimit, d.cancellationLimit, 0),
    cancelWindowHours: horas(r.cancelWindowHours, d.cancelWindowHours),
    bookingLeadHours: horas(r.bookingLeadHours, d.bookingLeadHours),
    waitlistCutoffHours: horas(r.waitlistCutoffHours, d.waitlistCutoffHours),
    faltasEnabled: r.faltasEnabled === undefined ? d.faltasEnabled : r.faltasEnabled !== false,
    faltasThreshold: entero(r.faltasThreshold, d.faltasThreshold, 1),
  };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
export const horasTexto = (h: number) => `${h} ${plural(h, "hora", "horas")}`;

/** Las reglas de cancelación, en el mismo orden y con las mismas palabras en
 *  todas las pantallas: cuota, ventana y pérdida de la clase (y las faltas). */
export function cancellationRules(p: BookingPolicy): string[] {
  const rules = [
    p.cancellationLimit > 0
      ? `Puedes cancelar hasta ${p.cancellationLimit} ${plural(p.cancellationLimit, "vez", "veces")} por paquete. Salir de la lista de espera no cuenta.`
      : "No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.",
    `Si cancelas con ${horasTexto(p.cancelWindowHours)} o más de anticipación, la clase regresa a tu paquete.`,
    `Si cancelas con menos de ${horasTexto(p.cancelWindowHours)}, pierdes la clase: no regresa a tu paquete${p.faltasEnabled ? " y cuenta como falta" : ""}.`,
  ];
  if (p.faltasEnabled) {
    rules.push(`Al juntar ${p.faltasThreshold} faltas (cancelaciones tardías o inasistencias) se descuentan puntos.`);
  }
  return rules;
}

/** La regla de la lista de espera (P1-1). */
export function waitlistRule(p: BookingPolicy): string {
  return `Si la clase está llena entras a la lista de espera, por orden de llegada. Si se libera un lugar hasta ${horasTexto(p.waitlistCutoffHours)} antes, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.`;
}

/** "Te quedan N cancelaciones de este paquete." o null si no hay límite. */
export function cancellationsLeftText(left: number | null | undefined, limit: number): string | null {
  if (!limit || left === null || left === undefined) return null;
  if (left <= 0) return `Ya usaste tus ${limit} ${plural(limit, "cancelación", "cancelaciones")} de este paquete.`;
  return `Te ${plural(left, "queda", "quedan")} ${left} ${plural(left, "cancelación", "cancelaciones")} de este paquete.`;
}

/** La política vigente; mientras carga (o si falla) devuelve la de por defecto. */
export function useBookingPolicy() {
  const q = useQuery<{ data?: unknown }>({
    queryKey: ["booking-policy"],
    queryFn: async () => (await api.get("/public/booking-policy")).data,
    staleTime: 5 * 60_000,
  });
  return { policy: normalizeBookingPolicy(q.data?.data), isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
