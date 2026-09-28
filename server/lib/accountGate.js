// Cuentas dadas de baja (anonimizadas): su token deja de servir aunque no haya
// vencido (auditoría 2026-09-27, P1-5). Caché corta para no consultar la base en
// cada petición; si la base falla, no se bloquea a nadie (el handler fallará igual).
export function createAccountGate({ lookup, ttlMs = 30_000, now = () => Date.now(), maxEntries = 5000 }) {
  const cache = new Map();
  async function isDisabled(userId) {
    const key = String(userId || "");
    if (!key) return false;
    const hit = cache.get(key);
    if (hit && hit.exp > now()) return hit.disabled;
    let disabled;
    try {
      disabled = Boolean(await lookup(key));
    } catch {
      return false;
    }
    if (cache.size >= maxEntries) cache.clear();
    cache.set(key, { disabled, exp: now() + ttlMs });
    return disabled;
  }
  return { isDisabled, forget: (userId) => { cache.delete(String(userId || "")); } };
}
