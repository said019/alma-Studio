// Llave del limitador: por usuaria si trae sesión válida, por IP si no
// (auditoría 2026-09-27, P1-4: todo el estudio en el mismo Wi-Fi compartía la cuota).
export function rateKey(req, verify) {
  const h = String(req.headers?.authorization || "");
  if (h.startsWith("Bearer ")) {
    try {
      const p = verify(h.slice(7));
      const id = p?.userId ?? p?.id ?? p?.sub;
      if (id) return `user:${id}`;
    } catch { /* token inválido: cae a IP */ }
  }
  const fwd = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return `ip:${fwd || req.ip || req.socket?.remoteAddress || "unknown"}`;
}
