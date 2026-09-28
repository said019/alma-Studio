// Ajustes de partners (Wellhub): el navegador nunca recibe los secretos
// (auditoría de producción 2026-09-27, P0-2 / L8).
const SECRETS = ["webhook_secret", "access_token"];
const mask = (v) => (v ? "••••" + (String(v).length > 4 ? String(v).slice(-4) : "") : null);
const isMasked = (v) => typeof v === "string" && v.startsWith("••••");

export function publicPartnerSettings(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of SECRETS) {
    out[`has_${k}`] = Boolean(row[k]);
    out[k] = mask(row[k]);
  }
  return out;
}

export function mergeSecret(incoming, current) {
  if (incoming === undefined || incoming === null || incoming === "" || isMasked(incoming)) return current ?? null;
  return incoming;
}
