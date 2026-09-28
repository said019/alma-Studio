import { describe, it, expect } from "vitest";
import {
  DEFAULT_BOOKING_POLICY, normalizeBookingPolicy, cancellationRules, waitlistRule, cancellationsLeftText, horasTexto,
} from "./booking-policy";

describe("política de reservas y cancelación", () => {
  it("las tres reglas con la política por defecto (cuota, ventana, pérdida de la clase) y las faltas", () => {
    expect(cancellationRules(DEFAULT_BOOKING_POLICY)).toEqual([
      "Puedes cancelar hasta 2 veces por paquete. Salir de la lista de espera no cuenta.",
      "Si cancelas con 12 horas o más de anticipación, la clase regresa a tu paquete.",
      "Si cancelas con menos de 12 horas, pierdes la clase: no regresa a tu paquete y cuenta como falta.",
      "Al juntar 5 faltas (cancelaciones tardías o inasistencias) se descuentan puntos.",
    ]);
  });

  it("usa la configuración real: sin límite, otra ventana, faltas apagadas, singular", () => {
    const r = cancellationRules({ ...DEFAULT_BOOKING_POLICY, cancellationLimit: 0, cancelWindowHours: 24, faltasEnabled: false });
    expect(r).toEqual([
      "No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.",
      "Si cancelas con 24 horas o más de anticipación, la clase regresa a tu paquete.",
      "Si cancelas con menos de 24 horas, pierdes la clase: no regresa a tu paquete.",
    ]);
    expect(cancellationRules({ ...DEFAULT_BOOKING_POLICY, cancellationLimit: 1 })[0]).toBe(
      "Puedes cancelar hasta 1 vez por paquete. Salir de la lista de espera no cuenta.",
    );
    expect(horasTexto(1)).toBe("1 hora");
  });

  it("la regla de la lista de espera dice el corte y que usa una clase", () => {
    expect(waitlistRule(DEFAULT_BOOKING_POLICY)).toBe(
      "Si la clase está llena entras a la lista de espera, por orden de llegada. Si se libera un lugar hasta 2 horas antes, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.",
    );
  });

  it("te quedan N cancelaciones", () => {
    expect(cancellationsLeftText(2, 2)).toBe("Te quedan 2 cancelaciones de este paquete.");
    expect(cancellationsLeftText(1, 3)).toBe("Te queda 1 cancelación de este paquete.");
    expect(cancellationsLeftText(0, 2)).toBe("Ya usaste tus 2 cancelaciones de este paquete.");
    expect(cancellationsLeftText(0, 1)).toBe("Ya usaste tus 1 cancelación de este paquete.");
    expect(cancellationsLeftText(null, 0)).toBeNull();
    expect(cancellationsLeftText(undefined, 2)).toBeNull();
  });

  it("normaliza lo que llega del servidor y cae a los valores por defecto", () => {
    expect(normalizeBookingPolicy(undefined)).toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ cancellationLimit: "x", cancelWindowHours: -3, faltasThreshold: 0 })).toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ cancellationLimit: 0, cancelWindowHours: 24, faltasEnabled: false }).cancellationLimit).toBe(0);
    expect(normalizeBookingPolicy({ cancelWindowHours: 24 }).cancelWindowHours).toBe(24);
    expect(normalizeBookingPolicy({ faltasEnabled: false }).faltasEnabled).toBe(false);
  });
});
