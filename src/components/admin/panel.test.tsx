import { describe, it, expect, vi } from "vitest";

// window.localStorage en este entorno de prueba es un stub roto (sólo trae
// los métodos de Object.prototype; a `useAuthStore` — que usa el middleware
// `persist` de zustand — le hace falta un `setItem` real). zustand lee
// `window.localStorage` una sola vez, al importar el store, así que el
// parche tiene que estar listo antes de esa importación: `vi.hoisted` mueve
// este bloque por encima de los imports (incluido el de AdminLayout, que
// importa `useAuthStore`). Es un polyfill mínimo en memoria sólo para esta
// prueba; no toca la app ni el setup global de pruebas.
vi.hoisted(() => {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, "localStorage", { value: memoryStorage, configurable: true, writable: true });
});

import fs from "fs";
import path from "path";
import { buttonVariants } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminLayout, { adminNavItemClass } from "./AdminLayout";
import FigureCard from "./FigureCard";
import SectionTabs from "./SectionTabs";
import { useAuthStore } from "@/stores/authStore";
import { COLOR } from "@/design/tokens";

const root = path.resolve(__dirname, "..", "..", "..");

describe("panel", () => {
  it("la sección activa lleva una línea coral a la izquierda sobre canvas", () => {
    const c = adminNavItemClass(true, false);
    expect(c).toMatch(/bg-canvas/);
    expect(c).toMatch(/shadow-\[inset_3px_0_0_theme\(colors\.accent\.DEFAULT\)\]/);
  });
  it("la inactiva no usa coral", () => {
    expect(adminNavItemClass(false, false)).not.toMatch(/accent/);
  });
  it("el botón por defecto es negro y mide 44 px", () => {
    const c = buttonVariants();
    expect(c).toMatch(/bg-primary/);
    expect(c).toMatch(/\bh-11\b/);
  });
  it("ningún tamaño de botón baja de 44 px", () => {
    for (const size of ["default", "sm", "lg", "icon"] as const) {
      expect(buttonVariants({ size }), size).toMatch(/\bh-(11|12)\b/);
    }
  });
  it("el panel no tiene botón coral (coral = atención)", () => {
    for (const variant of ["default", "destructive", "outline", "secondary", "ghost", "link"] as const) {
      expect(buttonVariants({ variant }), variant).not.toMatch(/\bbg-accent\b/);
    }
    // Y ninguna pantalla del panel usa el botón coral de la app.
    // (Excluye los .test.tsx: si no, este mismo archivo se autodetecta por
    // contener el literal del regex de abajo.)
    const archivos = ["src/pages/admin", "src/components/admin"].flatMap((d) =>
      (fs.readdirSync(path.join(root, d), { recursive: true }) as string[])
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
        .map((f) => path.join(d, f)));
    expect(archivos.length).toBeGreaterThan(20);
    const conCoral = archivos.filter((f) => /variant="accent"/.test(fs.readFileSync(path.join(root, f), "utf8")));
    expect(conCoral).toEqual([]);
  });
  it("la pill de atención es coral con texto negro", () => {
    expect(badgeVariants({ variant: "attention" })).toMatch(/bg-accent\b.*text-ink|text-ink.*bg-accent\b/);
  });
  it("deshabilitado: fondo sunken y texto lineStrong, sin transparencia (spec §4.1)", () => {
    const c = buttonVariants();
    expect(c).toMatch(/disabled:bg-sunken/);
    expect(c).toMatch(/disabled:text-line-strong/);
    expect(c).not.toMatch(/disabled:opacity/);
  });
});

describe("tarjeta de cifra", () => {
  it("normal: blanca, borde line, número negro", () => {
    render(<FigureCard label="Clases hoy" value="12" />);
    expect(screen.getByText("12")).toHaveStyle({ color: COLOR.ink });
    expect(screen.getByText("12").closest("[data-figure-card]")).toHaveStyle({ backgroundColor: COLOR.surface, borderColor: COLOR.line });
  });
  it("atención: borde coral y número en coral profundo, con su etiqueta", () => {
    render(<FigureCard label="Por verificar" value="3" attention />);
    expect(screen.getByText("3")).toHaveStyle({ color: COLOR.accentStrong });
    expect(screen.getByText("3").closest("[data-figure-card]")).toHaveStyle({ borderColor: COLOR.accent });
    expect(screen.getByText("Por verificar")).toBeInTheDocument();
  });
});

describe("SectionTabs", () => {
  it("la pestaña activa va en negro y todas miden 44 px", () => {
    render(
      <MemoryRouter initialEntries={["/admin/class-types"]}>
        <SectionTabs tabs={[{ label: "Calendario", to: "/admin/classes" }, { label: "Tipos de clase", to: "/admin/class-types" }]} />
      </MemoryRouter>,
    );
    const activa = screen.getByRole("link", { name: "Tipos de clase" });
    expect(activa).toHaveAttribute("aria-current", "page");
    expect(activa.className).toMatch(/\bbg-ink\b.*\btext-canvas\b/);
    for (const a of screen.getAllByRole("link")) expect(a.className).toMatch(/min-h-\[44px\]/);
  });
});

// Fix round 1 — hallazgo 2: shadcn TabsTrigger quedaba por debajo del mínimo
// de 44 px táctiles (spec §4.1/§4.4), usado en al menos 10 pantallas del panel.
describe("shadcn Tabs", () => {
  it("la pestaña mide al menos 44 px y la lista ya no fija h-12", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tab").className).toMatch(/min-h-\[44px\]/);
    expect(screen.getByRole("tablist").className).not.toMatch(/\bh-12\b/);
  });
});

// Fix round 1 — hallazgo 3: el ítem activo del menú lateral no llevaba
// aria-current="page", a diferencia de SectionTabs y la barra inferior móvil
// del mismo archivo. Se renderiza AdminLayout en una ruta de admin (en vez de
// una prueba de sólo-fuente) porque adminNavItemClass sólo genera el
// className — el atributo aria-current vive en el JSX del <Link>, así que
// hace falta el árbol real para verificar que está puesto (ver el parche de
// localStorage arriba, necesario para que useAuthStore pueda renderizar).
describe("AdminLayout — menú lateral", () => {
  it("el ítem activo del menú lleva aria-current=page", () => {
    useAuthStore.setState({ user: { role: "admin" } as any });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/dashboard"]}>
          <AdminLayout>{null}</AdminLayout>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const activo = screen.getByRole("link", { name: "Inicio" });
    expect(activo).toHaveAttribute("aria-current", "page");
    const inactivo = screen.getByRole("link", { name: "Reservas" });
    expect(inactivo).not.toHaveAttribute("aria-current");
  });
});

// Fix round 1 — hallazgo 1: Ruling 3 (mínimo 12 px) quedó incompleta —
// sobrevivían tamaños de texto arbitrarios por debajo de 12 px.
describe("AdminLayout — tamaños de texto", () => {
  it("ningún text-[...] arbitrario baja de 12 px", () => {
    const src = fs.readFileSync(path.join(root, "src/components/admin/AdminLayout.tsx"), "utf8");
    const tamaños = [...src.matchAll(/\btext-\[([\d.]+)(px|rem)\]/g)];
    expect(tamaños.length).toBeGreaterThan(0);
    for (const [token, num, unit] of tamaños) {
      const px = unit === "rem" ? parseFloat(num) * 16 : parseFloat(num);
      expect(px, token).toBeGreaterThanOrEqual(12);
    }
  });
});
