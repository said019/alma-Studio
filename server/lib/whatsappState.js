// Estado del canal de WhatsApp (Evolution) con caché corta, para no intentar
// envíos con el canal caído y avisarlo en el panel (auditoría 2026-09-27, P0-1).
export function createChannelState({ probe, ttlMs = 60_000, timeoutMs = 5_000, now = () => Date.now() }) {
  let cached = null;
  let expires = 0;
  return async function channelState() {
    if (cached && now() < expires) return cached;
    let result;
    try {
      result = await Promise.race([
        probe(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
      ]);
    } catch {
      result = { connected: false, state: "disconnected" };
    }
    cached = { connected: Boolean(result?.connected), state: String(result?.state || (result?.connected ? "connected" : "disconnected")) };
    expires = now() + ttlMs;
    return cached;
  };
}
