import "@testing-library/jest-dom";
import { configure } from "@testing-library/react";

// Bajo carga (suite completa, CI) el render inicial de una pantalla puede
// tardar más que el default de 1000ms de testing-library, y una prueba
// tronaba por lentitud del entorno, no por un defecto real (Task 9 del
// review). En vez de poner un timeout explícito por cada `findBy` lento, se
// sube una sola vez aquí para toda la suite.
configure({ asyncUtilTimeout: 3000 });

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// localStorage en memoria: el de este entorno no trae setItem y el store de
// sesión (zustand persist) lo usa al importarse. Sin esto, cualquier prueba
// que renderice una pantalla del panel truena antes de empezar.
if (typeof window.localStorage?.setItem !== "function") {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: memoryStorage, configurable: true, writable: true });
}

// Radix (menús, selects, popovers) mide con ResizeObserver y usa APIs de
// puntero que jsdom no trae. Sin esto, abrir un menú "⋯" en una prueba truena.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
Element.prototype.hasPointerCapture ??= function hasPointerCapture() { return false; };
Element.prototype.releasePointerCapture ??= function releasePointerCapture() {};
