import { useLayoutEffect } from "react";
import { useLocation } from "react-router-dom";
import { THEMES, type Theme } from "./tokens";

/**
 * Tema por ruta (spec 2026-09-25 §4). Vive en <html data-theme> para que
 * diálogos, menús y toasts —que se abren en portales— hereden el tema.
 * index.html replica `themeForPath` para la primera pintada.
 */
export const THEME_COLOR: Record<Theme, string> = {
  light: THEMES.light.surface, // la barra superior del panel es surface
  dark: THEMES.dark.canvas,
};

export const themeForPath = (path: string): Theme => (/^\/(app|auth)(\/|$)/.test(path) ? "dark" : "light");

export function applyTheme(theme: Theme, doc: Document = document) {
  doc.documentElement.dataset.theme = theme;
  let meta = doc.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = doc.createElement("meta");
    meta.setAttribute("name", "theme-color");
    doc.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLOR[theme]);
}

/** Fija el tema antes de pintar. `key` fuerza a reaplicarlo (p. ej. al cambiar de ruta). */
export function useTheme(theme: Theme, key?: unknown) {
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, key]);
}

/** Montado una vez dentro del router: el tema sigue a la ruta. */
export function RouteTheme() {
  const { pathname } = useLocation();
  useTheme(themeForPath(pathname), pathname);
  return null;
}
