const BASE = "https://x.invalid";

/**
 * Sólo rutas internas bajo alguno de los prefijos (por defecto, la app de
 * clienta): evita redirecciones abiertas. La ruta se normaliza con `URL`, así
 * que `/app/../admin` o `/app/%2e%2e/admin` se evalúan como `/admin`.
 */
export function safeReturnUrl(raw: string | null | undefined, prefixes: readonly string[] = ["/app"]): string | null {
  if (!raw || !raw.startsWith("/")) return null;
  if (raw.includes("//") || raw.includes("\\")) return null;
  let u: URL;
  try {
    u = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (u.origin !== BASE) return null;
  if (!prefixes.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return null;
  return u.pathname + u.search + u.hash;
}

export const withReturnUrl = (path: string, returnUrl: string | null) =>
  returnUrl ? `${path}?returnUrl=${encodeURIComponent(returnUrl)}` : path;
