// Geocerca del pase de Apple Wallet: con `locations` el iPhone muestra el pase
// en la pantalla de bloqueo cuando la clienta está cerca del estudio.
//
// Para activarla, define en el entorno del servidor:
//   BUSINESS_LATITUDE   latitud del estudio en grados decimales
//   BUSINESS_LONGITUDE  longitud del estudio en grados decimales
//   BUSINESS_PASS_RADIUS_M  (opcional) radio en metros; 150 si no se define
// con las coordenadas de la dirección de src/lib/studio.ts (Cuauhtémoc #68,
// Del Carmen, Coyoacán, CDMX). No hay coordenadas de respaldo: sin las dos
// variables, o con valores inválidos, el pase se genera sin `locations` ni
// `maxDistance` y no hay aviso de cercanía.

export const DEFAULT_PASS_RADIUS_M = 150;

function coord(raw, limit) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/** Coordenadas y radio del estudio, o null si no están configurados. */
export function passGeofence(env = process.env) {
  const latitude = coord(env.BUSINESS_LATITUDE, 90);
  const longitude = coord(env.BUSINESS_LONGITUDE, 180);
  if (latitude === null || longitude === null) return null;
  const radius = Number(String(env.BUSINESS_PASS_RADIUS_M ?? "").trim() || DEFAULT_PASS_RADIUS_M);
  return {
    latitude,
    longitude,
    maxDistance: Number.isFinite(radius) && radius > 0 ? radius : DEFAULT_PASS_RADIUS_M,
  };
}

/** Campos de pass.json para la geocerca: `{ locations, maxDistance }` o `{}`. */
export function passLocationFields(relevantText, env = process.env) {
  const g = passGeofence(env);
  if (!g) return {};
  return {
    locations: [{ latitude: g.latitude, longitude: g.longitude, relevantText }],
    maxDistance: g.maxDistance,
  };
}
