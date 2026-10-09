const STORAGE_KEY = 'hive:manual-sale-intent';
type Intent = { key: string; fingerprint: string };
let memory: Intent | null = null;
/** Keep the same intention after a lost response; successful sales clear it. */
export function manualSaleKey(payload: unknown): string {
  const fingerprint = JSON.stringify(payload);
  let stored = memory;
  try { stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null') ?? memory; } catch { /* storage can be disabled */ }
  if (stored?.fingerprint === fingerprint) { memory = stored; return stored.key; }
  memory = {key:crypto.randomUUID(),fingerprint};
  try { sessionStorage.setItem(STORAGE_KEY,JSON.stringify(memory)); } catch { /* in-memory retry still works */ }
  return memory.key;
}
export function completeManualSale() {
  memory = null;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* optional storage */ }
}
