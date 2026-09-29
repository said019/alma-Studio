// Validadores compartidos por las rutas (auditoría de producción 2026-09-27, bloque 1).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// 200, no 1000: una firma real de trazo corto en un teléfono a devicePixelRatio 1
// (lienzo ~330×140, un solo trazo) codifica a ~450 caracteres base64. El mínimo
// de 1000 original rechazaba esa firma genuina. Lo que bloquea el 1×1 px del
// caso de la auditoría es el mínimo de ancho/alto (MIN_W/MIN_H) de abajo, no éste.
const MIN_BASE64 = 200;
const MIN_W = 50;
const MIN_H = 20;

/** null si la firma es una PNG razonable; si no, el motivo (texto para el usuario). */
export function signatureProblem(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return "La firma debe ser una imagen PNG.";
  const b64 = dataUrl.slice(prefix.length);
  if (b64.length < MIN_BASE64) return "La firma está vacía o es demasiado pequeña.";
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_MAGIC) || buf.toString("ascii", 12, 16) !== "IHDR") {
    return "La firma no es una imagen PNG válida.";
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < MIN_W || h < MIN_H) return "La firma es demasiado pequeña.";
  return null;
}

export const maskSecret = (value) => {
  if (!value) return null;
  const s = String(value);
  return "••••" + (s.length > 4 ? s.slice(-4) : "");
};
export const isMaskedSecret = (value) => typeof value === "string" && value.startsWith("••••");

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "AAAA-MM-DD" de un día que existe en el calendario (bloque 2). */
export function isDay(value) {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
