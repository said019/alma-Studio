// Cuentas dadas de baja (anonimizadas): su token deja de servir aunque no haya
// vencido (auditoría 2026-09-27, P1-5). Caché corta para no consultar la base en
// cada petición; un error de consulta se propaga sin permitir acceso ni cachearlo.
export function createAccountGate({ lookup, ttlMs = 30_000, now = () => Date.now(), maxEntries = 5000 }) {
  const cache = new Map();
  // Generación por llave: si forget() corre mientras una consulta para esa
  // misma llave sigue en vuelo, la generación cambia y esa consulta —al
  // resolver con un valor ya viejo— no debe volver a cachearlo.
  const gens = new Map();
  const genOf = (key) => gens.get(key) || 0;

  async function isDisabled(userId) {
    const key = String(userId || "");
    if (!key) return false;
    const hit = cache.get(key);
    if (hit && hit.exp > now()) return hit.disabled;
    const genAtStart = genOf(key);
    const disabled = Boolean(await lookup(key));
    if (genOf(key) === genAtStart) {
      if (cache.size >= maxEntries) cache.clear();
      cache.set(key, { disabled, exp: now() + ttlMs });
    }
    return disabled;
  }

  function forget(userId) {
    const key = String(userId || "");
    if (!key) return;
    cache.delete(key);
    gens.set(key, genOf(key) + 1);
  }

  return { isDisabled, forget };
}
