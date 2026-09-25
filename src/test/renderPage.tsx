import type { ReactNode } from "react";
import { vi } from "vitest";
import { configure, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Una pantalla completa tarda en montar cuando la suite corre en paralelo:
// márgenes amplios para findBy/waitFor y para cada prueba que usa este módulo.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 30_000 });

/**
 * Montar una pantalla de la app en pruebas: react-query sin reintentos y router
 * en memoria. Cada archivo de prueba simula `@/lib/api` y `ClientAuthGuard`
 * con `vi.mock` (se elevan al inicio del archivo, no pueden vivir aquí).
 */
export const renderPage = (ui: ReactNode, route = "/app") =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

/**
 * Respuestas de `api.get` por prefijo de ruta: gana el primer prefijo que
 * coincide; un `Error` se lanza (la query cae en error); lo demás es una lista vacía.
 */
export const respuestas = (tabla: Record<string, unknown>) => async (url: string) => {
  const hit = Object.keys(tabla).find((k) => url.startsWith(k));
  if (hit === undefined) return { data: { data: [] } };
  const v = tabla[hit];
  if (v instanceof Error) throw v;
  return { data: v };
};

/** El elemento y sus ancestros que se atenúan con una opacidad propia (`opacity-*` sin variante). */
export const atenuadoPor = (el: Element) => {
  const out: Element[] = [];
  for (let n: Element | null = el; n; n = n.parentElement) {
    if (/(?:^|\s)opacity-\d+/.test(n.getAttribute("class") ?? "")) out.push(n);
  }
  return out;
};
