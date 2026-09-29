import type { QueryClient } from "@tanstack/react-query";

/* Refresco de la zona «catálogo» (QA 2026-09-18).

   Principio de la tanda: después de guardar, la pantalla dice la verdad sin
   recargar. Dos causas distintas rompían eso aquí, y las dos nacen de repetir
   claves sueltas en cada mutación:

   · Claves olvidadas. Un plan que se desactiva sale del catálogo público, así
     que también cambia lo que ven el selector de venta de mostrador, el de
     walk-in y el de cupones. Cada pantalla invalidaba sólo la suya.
   · Una lista que se pide a la ruta equivocada: Planes usaba GET /api/plans
     (la pública, sólo activos), así que desactivar un paquete lo borraba de la
     vista del panel para siempre. El panel tiene ahora su propia lista
     (GET /api/admin/plans, clave ["admin-plans"]).

   Por eso hay UNA función por zona: quien agregue una pantalla que lea planes,
   cupones, consultas o ajustes añade su clave aquí y todas las mutaciones la
   refrescan, en vez de que alguien vuelva a olvidar una. */

type Clave = readonly unknown[];

const invalidar = (qc: QueryClient, claves: readonly Clave[]) => {
  for (const queryKey of claves) qc.invalidateQueries({ queryKey: [...queryKey] });
};

/** Todo lo que pinta paquetes: el panel, el catálogo público y los selectores de venta. */
const CLAVES_PLANES: readonly Clave[] = [
  ["admin-plans"],    // Catálogo › Planes (incluye los inactivos)
  ["plans"],          // selectores de venta: ficha de usuaria, Pagos, Membresías, checkout
  ["plans-active"],   // alta manual desde Usuarios
  ["plans-walkin"],   // venta de mostrador dentro de una clase
  ["coupon-plans"],   // selector de plan al crear un cupón
  ["public-plans"],   // la web pública
];

/** Refresca todas las pantallas que muestran paquetes tras crear, editar o borrar uno. */
export function refrescarPlanes(qc: QueryClient) {
  invalidar(qc, CLAVES_PLANES);
}

const CLAVES_CUPONES: readonly Clave[] = [
  ["admin-discount-codes"], ["discount-codes"],
  ["admin-discount-redemptions"], // por prefijo: cubre la clave con id
];

/** Refresca la lista de cupones y sus canjes. */
export function refrescarCupones(qc: QueryClient) {
  invalidar(qc, CLAVES_CUPONES);
}

const CLAVES_CONSULTAS: readonly Clave[] = [
  ["admin-consultations"], // por prefijo: cubre ["admin-consultations", filtro]
  ["admin-consultations-stats"],
  ["my-consultations"],    // lo que ve la usuaria en su tablero
];

/** Refresca la lista de consultas, sus contadores y la vista de la usuaria. */
export function refrescarConsultas(qc: QueryClient) {
  invalidar(qc, CLAVES_CONSULTAS);
}

/* Un ajuste guardado en el panel también cambia pantallas públicas que lo leen
   por otra ruta y con otra clave (modo mantenimiento, política de cancelación,
   datos de contacto). Sin esto, apagar el estudio no se nota hasta recargar. */
const CLAVES_PUBLICAS_POR_AJUSTE: Record<string, readonly Clave[]> = {
  general_settings: [["public-general-settings"]],
  cancellation_window: [["public-cancellation-policy"]],
};

/** Refresca un ajuste y las pantallas públicas que dependen de él. */
export function refrescarAjustes(qc: QueryClient, clave: string) {
  invalidar(qc, [["settings", clave], ...(CLAVES_PUBLICAS_POR_AJUSTE[clave] ?? [])]);
}

/* Cuando el dato guardado deja de caber en el filtro donde está parada la
   dueña, la fila desaparece. No puede esfumarse en silencio: el aviso dice, con
   la etiqueta exacta de la vista que existe en esa misma pantalla, a dónde se
   fue (RG88), igual que useUserActivation dice «Queda en Usuarios ›
   Desactivados». */
export function avisoDeDestino(nombre: string, estado: string, vista: string) {
  return `${nombre} quedó como «${estado}»: ya no cabe en esta vista. Lo encuentras en «${vista}».`;
}
