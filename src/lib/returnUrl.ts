/** Sólo rutas internas de la app de clienta: evita redirecciones abiertas. */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/^\/app(?:[/?#]|$)/.test(raw)) return null;
  if (raw.includes("//") || raw.includes("\\")) return null;
  return raw;
}

export const withReturnUrl = (path: string, returnUrl: string | null) =>
  returnUrl ? `${path}?returnUrl=${encodeURIComponent(returnUrl)}` : path;
