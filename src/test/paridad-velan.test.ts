// Paridad de vistas con Velan (24 sep 2026).
// HIVE sólo debe exponer las vistas que Velan expone, más las excepciones
// documentadas en src/config/features.ts. Lo demás se apaga, no se borra.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { FEATURES } from "../config/features";

const APP = fs.readFileSync(path.join(__dirname, "..", "App.tsx"), "utf8");
/** La línea de código inmediatamente anterior a la declaración de una ruta. */
const lineaAnterior = (ruta: string): string => {
  const lineas = APP.split("\n");
  const i = lineas.findIndex((l) => l.includes(`path="${ruta}"`));
  return i > 0 ? lineas[i - 1] : "";
};

const rutasVivas = () => {
  // Rutas declaradas fuera de un bloque apagado por bandera.
  const encontradas = [...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  return new Set(encontradas);
};

/** Vistas que Velan NO tiene y que aquí deben quedar apagadas. */
const APAGADAS: Record<string, keyof typeof FEATURES> = {
  "/admin/loyalty": "loyalty",
  "/admin/reviews": "reviews",
  "/admin/pos": "pos",
  "/admin/schedules": "scheduleTemplates",
  "/app/wallet/history": "walletExtras",
  "/app/wallet/rewards": "walletExtras",
  "/app/profile/membership": "membershipDetail",
  "/auth/onboarding": "onboarding",
};

/** Vistas que se quedan aunque Velan no las tenga, con su motivo. */
const EXCEPCIONES: Record<string, string> = {
  "/admin/visitas": "gestión de visitas e invitados solicitada con la paridad ampliada",
  "/admin/whatsapp-templates": "campañas equivalentes a la difusión de Velan",
  "/admin/notifications": "avisos operativos",
  "/app/orders/:orderId": "consultar y continuar compras desde el historial",
  "/app/profile/security": "gestión de contraseña",
  "/staff/instructor": "portal exclusivo del coach",
  "/staff/reception": "portal de recepción",
  "/app/profile/responsiva": "el backend bloquea la primera reserva sin responsiva firmada",
  "/admin/pasar-lista": "es el equivalente de /admin/checkin de Velan",
  "/admin/class-generator": "destino real de /admin/classes/generate, que Velan sí tiene",
  "/admin/class-types": "destino real de /admin/classes/types, que Velan sí tiene",
  "/app/wallet": "equivale a /app/pass de Velan",
  "/admin/bitacora": "bitácora de la dueña pedida por la auditoría de producción (2026-09-27, P0-3)",
  "/admin/settings/platforms": "Wellhub está activo en producción: la dueña configura la integración (auditoría 2026-09-27, P1-9)",
  "/admin/bookings/partners-checkins": "la dueña concilia las visitas de Wellhub (auditoría 2026-09-27, P1-9)",
};

describe("paridad de vistas con Velan", () => {
  it("cada vista apagada tiene su bandera y está en false", () => {
    for (const [ruta, bandera] of Object.entries(APAGADAS)) {
      expect(FEATURES[bandera], `falta la bandera de ${ruta}`).toBe(false);
    }
  });

  it("ninguna vista apagada sigue declarada sin condición en el router", () => {
    const vivas = rutasVivas();
    const coladas = Object.keys(APAGADAS).filter((r) => {
      if (!vivas.has(r)) return false;
      // Vale si su declaración está dentro de un bloque condicionado por la bandera.
      return !lineaAnterior(r).includes("FEATURES.");
    });
    expect(coladas, `rutas apagadas que siguen abiertas: ${coladas.join(", ")}`).toEqual([]);
  });

  it("las excepciones siguen disponibles", () => {
    const vivas = rutasVivas();
    for (const [ruta, motivo] of Object.entries(EXCEPCIONES)) {
      expect(vivas.has(ruta), `${ruta} debe seguir viva: ${motivo}`).toBe(true);
    }
  });

  it("la responsiva no queda detrás de ninguna bandera", () => {
    expect(APP.includes('path="/app/profile/responsiva"'), "la ruta de responsiva desapareció").toBe(true);
    expect(lineaAnterior("/app/profile/responsiva").includes("FEATURES."),
      "la responsiva quedó condicionada: sin ella nadie puede reservar").toBe(false);
  });

  it("login y registro no mandan a una ruta apagada", () => {
    for (const archivo of ["pages/auth/Login.tsx", "pages/auth/Register.tsx"]) {
      const txt = fs.readFileSync(path.join(__dirname, "..", archivo), "utf8");
      if (!FEATURES.onboarding) {
        // Sólo cuentan los navigate INCONDICIONALES: uno envuelto en la bandera
        // no se ejecuta mientras esté apagada.
        const incondicional = txt
          .split("\n")
          .filter((l) => /navigate\(\s*["'`]\/auth\/onboarding/.test(l))
          .filter((l) => !l.includes("FEATURES.onboarding"))
          .filter((_, idx, arr) => {
            const linea = arr[idx];
            const pos = txt.indexOf(linea);
            const previa = txt.slice(0, pos).split("\n").slice(-2).join("\n");
            return !previa.includes("FEATURES.onboarding");
          });
        expect(incondicional,
          `${archivo} manda a /auth/onboarding sin condición: caería en 404`).toEqual([]);
      }
    }
  });
});
