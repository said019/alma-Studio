# HIVE · Panel — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la estructura de las 18 pantallas del panel en la dirección A · Mostrador, sin perder ninguna función, con un solo cambio de servidor (`waitlist_count`).

**Architecture:** Primero se construyen piezas compartidas pequeñas y probadas (`src/components/admin/*`, `src/lib/*`) y el marco nuevo (menú, barra superior con buscador de clientas, navegación de celular). Después cada pantalla reemplaza su JSX de acomodo por esas piezas y **conserva sus consultas, mutaciones y diálogos** tal como están, salvo donde el spec pide un cambio. Cada tarea deja el panel completo y funcionando.

**Tech Stack:** React 18 + Vite 5 + TypeScript · Tailwind 3.4 + shadcn/ui · TanStack Query 5 · react-router-dom 6.30 · Recharts 2 · Vitest 3 + Testing Library (jsdom) · `node:test` contra una base Postgres desechable para el servidor.

**Spec:** [`docs/superpowers/specs/2026-09-25-hive-panel-design.md`](../specs/2026-09-25-hive-panel-design.md) · Lienzo: https://claude.ai/artifact/ACA2tnwBbjzpLiJi2S7iVt (página "Panel · dirección A").

## Global Constraints

- **Colores sólo por token** (`bg-canvas`, `bg-surface`, `bg-sunken`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-muted`, `bg-accent`, `bg-accent-soft`, `text-accent-strong`, `text-success`, `text-danger`, `bg-inverse`, `bg-inverse-raised`, `text-inverse-foreground`, `text-inverse-muted`) o `COLOR.*` de `@/design/tokens`. **Ningún `#RRGGBB`, `#RRGGBBAA` ni `rgb(`/`rgba(` con números fuera de `src/design/`** (lo vigila `src/design/guards.test.ts`).
- **Regla 1:** nunca texto claro sobre coral. **La guardia es por línea:** jamás escribir `bg-accent` y `text-canvas`/`text-surface`/`text-white`/`text-inverse-*` en la misma línea de código, ni siquiera en ramas distintas de un ternario — partir en líneas separadas.
- **Regla 2:** el coral no es texto: número, ícono o enlace coral = `text-accent-strong`.
- **Regla 3:** en el panel, coral = atención (sección activa, pendiente, lleno), siempre con texto o número; nunca el color solo.
- **Regla 4:** nunca coral sobre coral (un contador sobre un fondo coral va en `bg-ink text-canvas`).
- **El panel no tiene botón coral:** prohibido `variant="accent"` en `src/pages/admin` y `src/components/admin` (lo vigila `panel.test.tsx`).
- **Tipografía:** Unbounded (`font-display`, 600/800) para títulos y cifras sueltas; Manrope para todo lo demás; cifras de horas y montos con la clase `nums`. **Mínimo 12 px** (`text-[0.75rem]`). Títulos de pantalla en mayúsculas.
- **Áreas de toque de 44 px** mínimo (`min-h-[44px]`, `h-11`, `w-11`) en botones, pestañas y enlaces de acción.
- **Se conservan** todas las consultas, mutaciones, diálogos, textos de estados (carga, vacío, error) y endpoints actuales, salvo donde el spec dice otra cosa.
- **Texto nuevo** sin la palabra "Alma" (el texto viejo con "Alma" es del sub-proyecto 4 y no se toca).
- **Funciones apagadas se esconden:** Lealtad (`FEATURES.loyalty`), "Asignar visitante" y "Llevará acompañante" (`FEATURES.visits`), "Sólo guardar plantilla" (`FEATURES.scheduleTemplates`) y el control de Wellhub (`FEATURES.partnerPlatforms`). Al encender la bandera vuelven.
- **Roles:** dueña y súper admin (`admin`, `super_admin`) ven Cobros, "Cobrar", ingresos, gráficas, Reportes, la pestaña Pagos y "Editar" en la ficha; recepción y coach no. Se decide con `canSeeFinance` / `useCanSeeFinance` de `@/lib/roles`.
- **Servidor:** el único cambio es `waitlist_count` en `GET /api/classes`.
- **Movimiento:** sólo `transform` y `opacity`; respetar `prefers-reduced-motion`.
- **Ramas:** trabajar en `hive-panel`; al terminar se fusiona a `hive`. **Nada va a `main` ni a producción** sin preguntar.

## Review Focus

1. **Clase con sobrecupo o cupo raro** (9 reservadas de 8 tras una asignación manual, cupo 0 o nulo) — nada truena: el medidor muestra todo lleno y dice "9 de 8", el calendario la dibuja y la marca llena. → pruebas en Tarea 1 (`SeatMeter`) y Tarea 8 (`placeBlocks`).
2. **Ya no quedan clases hoy** (o no hay ninguna) — Inicio dice "Ya no hay más clases hoy" en vez de un bloque vacío, y Pasar lista no deja la sección abierta en blanco. → pruebas en Tarea 4 y Tarea 6.
3. **Búsqueda con acentos, `+`, `&` o tecleo rápido** ("ñ&+52") — el término va codificado en la URL y los resultados siempre corresponden a lo último que se escribió. → prueba en Tarea 2 (`ClientSearch`) y Tarea 12 (Clientas).
4. **Enlaces viejos o compartidos con un id que ya no existe** (`/admin/bookings?clase=<borrada>`, `/admin/payments?clienta=<borrada>`) — se ve un mensaje claro con salida, no una pantalla en blanco ni un error de consola. → pruebas en Tarea 5 y Tarea 10.
5. **Dos clases a la misma hora el mismo día** (dos salas) — el calendario las pone lado a lado, no una encima de otra. → prueba en Tarea 8.

---

## Preparación del entorno

El worktree ya existe (`alma-hive-panel`, rama `hive-panel`, con el spec). Una sola vez:

```bash
cd "/Users/saidromero/Alma Studio/alma-hive-panel"
ln -s "/Users/saidromero/Alma Studio/alma-Studio/node_modules" node_modules
npx vitest run 2>&1 | grep -E "Test Files|Tests "   # anotar los números: es la línea base
```

Notas del entorno:
- `npx tsc --noEmit -p tsconfig.app.json` tiene **un error preexistente** en `src/integrations/supabase/client.ts`. Siempre filtrar: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase` debe salir vacío.
- Build: `VITE_API_URL=/api npx vite build`.
- Pruebas de una pantalla: `npx vitest run <ruta del .test.tsx>`.
- La regresión del servidor necesita una API viva sobre una base desechable (ver Tarea 3, Paso 2).

**Comprobación que cierra cada tarea** (se cita como "comprobación estándar"):

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests |FAIL" ; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase ; VITE_API_URL=/api npx vite build 2>&1 | tail -1
```
Expected: todas las pruebas en verde (ninguna línea `FAIL`), `tsc` sin salida, build `✓ built in …`.

---

## Mapa de archivos

**Nuevos (compartidos)**

| Archivo | Responsabilidad |
|---|---|
| `src/lib/roles.ts` | `canSeeFinance`, `useCanSeeFinance`, `roleLabel` |
| `src/lib/phone.ts` | `waLink(phone)` para WhatsApp |
| `src/lib/today-roster.ts` | Tipos de `/admin/today-roster` y cálculos del día (`summarize`, `splitDay`, `minutesUntil`, `daySummary`) |
| `src/hooks/use-search-param-state.ts` | Un parámetro de la URL como estado (`?clase=`, `?clienta=`, `?tab=`) |
| `src/components/admin/AdminPage.tsx` | `AdminPage` (contenedor) y `AdminPageHeader` |
| `src/components/admin/Panel.tsx` | `Panel`, `PanelHeader`, `PanelLink` |
| `src/components/admin/KpiStrip.tsx` | Fila de cifras |
| `src/components/admin/SeatMeter.tsx` | Medidor de ocupación |
| `src/components/admin/StatusDot.tsx` | Estado con punto y palabra |
| `src/components/admin/PersonCell.tsx` | `PersonCell`, `Avatar`, `initials` |
| `src/components/admin/MasterDetail.tsx` | Lista + detalle |
| `src/components/admin/WeekNav.tsx` | Semana anterior / siguiente / Hoy |
| `src/components/admin/DayStrip.tsx` | Tira de 7 días con conteo |
| `src/components/admin/SaveBar.tsx` | "Tienes cambios sin guardar" |
| `src/components/admin/ClientSearch.tsx` | Buscador de clientas (combobox) |
| `src/components/admin/AdminTopBar.tsx` | Barra superior de escritorio |
| `src/components/admin/ClientEditSheet.tsx` | Panel "Editar clienta" (Clientas y ficha) |
| `src/test/admin-harness.tsx` | `loginAs`, `routeApi`, `renderAdmin` para pruebas de pantallas |

**Modificados:** `src/test/setup.ts`, `src/components/admin/SectionTabs.tsx`, `src/components/admin/AdminLayout.tsx`, `server/index.js`, `src/App.tsx` y los 17 archivos de pantallas de `src/pages/admin/`.

---

### Task 1: Piezas compartidas del panel

**Files:**
- Create: `src/lib/roles.ts`, `src/lib/phone.ts`, `src/hooks/use-search-param-state.ts`, `src/components/admin/AdminPage.tsx`, `src/components/admin/Panel.tsx`, `src/components/admin/KpiStrip.tsx`, `src/components/admin/SeatMeter.tsx`, `src/components/admin/StatusDot.tsx`, `src/components/admin/PersonCell.tsx`, `src/components/admin/MasterDetail.tsx`, `src/components/admin/WeekNav.tsx`, `src/components/admin/DayStrip.tsx`, `src/components/admin/SaveBar.tsx`, `src/test/admin-harness.tsx`
- Modify: `src/test/setup.ts`, `src/components/admin/SectionTabs.tsx`
- Test: `src/components/admin/pieces.test.tsx`

**Interfaces:**
- Produces:
  - `canSeeFinance(role?: string | null): boolean` · `useCanSeeFinance(): boolean` · `roleLabel(role?: string | null): string`
  - `waLink(phone?: string | null): string | null`
  - `useSearchParamState(key: string): [string | null, (value: string | null) => void]`
  - `AdminPage({ children, className? })` · `AdminPageHeader({ kicker, title, subtitle?, actions? })`
  - `Panel({ children, className?, "aria-label"? })` · `PanelHeader({ title, trailing? })` · `PanelLink({ to, children })`
  - `KpiStrip({ items: Kpi[] })`, `type Kpi = { label: string; value: ReactNode; hint?: ReactNode }`
  - `SeatMeter({ booked, capacity, muted?, size? })` — `role="img"`, `aria-label` "N de M lugares[ · llena]"
  - `StatusDot({ tone: "success" | "danger" | "muted" | "ink", children })`
  - `PersonCell({ name, sub?, photoUrl?, size? })` · `Avatar({ name, photoUrl?, size?, className? })` · `initials(name)`
  - `MasterDetail({ list, detail, hasSelection, onBack, backLabel?, layout?: "list-narrow" | "detail-narrow" })`
  - `WeekNav({ weekStart: Date, onChange: (weekStart: Date) => void })`
  - `DayStrip({ days: { date: string; label: string; day: number; count: number }[], value: string, onChange: (date: string) => void, today: string })`
  - `SaveBar({ dirty, saving?, onSave, onDiscard })`
  - `SectionTabs` acepta en cada pestaña `count?: number` y `exact?: boolean`, y el componente acepta `"aria-label"?: string`.
  - Pruebas: `loginAs(role)`, `routeApi(mock, table)`, `renderAdmin(ui, { route, path? })`

- [ ] **Step 1: Arreglar `localStorage` en el entorno de pruebas**

El `localStorage` de jsdom en este entorno no trae `setItem`, y el store de sesión (zustand `persist`) lo necesita al importarse. Hoy sólo `panel.test.tsx` lo parchea; las pruebas de pantallas lo necesitan todas. Agregar al final de `src/test/setup.ts`:

```ts
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
```

En las pruebas, un menú de Radix (`DropdownMenu`) se abre con teclado — `fireEvent.keyDown(disparador, { key: "Enter" })` — y sus opciones se eligen con `fireEvent.click(await screen.findByRole("menuitem", { name: "…" }))`. El proyecto no tiene `@testing-library/user-event`; no agregarlo.

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `src/test/admin-harness.tsx`:

```tsx
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Mock } from "vitest";
import { useAuthStore } from "@/stores/authStore";

export type StaffRole = "admin" | "super_admin" | "reception" | "instructor";

/** Deja una sesión de personal lista para que AuthGuard pase. */
export function loginAs(role: StaffRole = "admin") {
  useAuthStore.setState({
    user: { id: "u-staff", role, displayName: "Admin HIVE", email: "admin@hive.test" } as never,
    token: "t",
    isAuthenticated: true,
  });
}

type ApiMock = { get: Mock; post?: Mock; put?: Mock; delete?: Mock };

/**
 * Responde el `api.get` simulado por ruta. Gana la llave más larga que sea
 * igual o prefijo de la URL pedida. Un valor `Error` se rechaza (con
 * `response.status` si lo trae). Sin llave: 404, para que la pantalla muestre
 * su error y la prueba lo note.
 */
export function routeApi(mock: ApiMock, table: Record<string, unknown>) {
  mock.get.mockImplementation((url: string) => {
    const keys = Object.keys(table)
      .filter((k) => url === k || url.startsWith(k))
      .sort((a, b) => b.length - a.length);
    if (!keys.length) {
      return Promise.reject(Object.assign(new Error(`sin simulación para ${url}`), { response: { status: 404, data: {} } }));
    }
    const value = table[keys[0]];
    return value instanceof Error ? Promise.reject(value) : Promise.resolve({ data: value });
  });
}

/** Muestra la URL actual para que las pruebas lean `?clase=`, `?tab=`, etc. */
export function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="location">{loc.pathname + loc.search}</output>;
}

export function renderAdmin(ui: ReactElement, { route, path }: { route: string; path?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path ?? route.split("?")[0]} element={<>{ui}<LocationProbe /></>} />
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Crear `src/components/admin/pieces.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { canSeeFinance, roleLabel } from "@/lib/roles";
import { waLink } from "@/lib/phone";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { AdminPageHeader } from "./AdminPage";
import KpiStrip from "./KpiStrip";
import SeatMeter from "./SeatMeter";
import StatusDot from "./StatusDot";
import PersonCell, { initials } from "./PersonCell";
import MasterDetail from "./MasterDetail";
import WeekNav from "./WeekNav";
import DayStrip from "./DayStrip";
import SaveBar from "./SaveBar";
import SectionTabs from "./SectionTabs";
import { LocationProbe } from "@/test/admin-harness";

describe("roles", () => {
  it("sólo dueña y súper admin ven dinero", () => {
    expect(canSeeFinance("admin")).toBe(true);
    expect(canSeeFinance("super_admin")).toBe(true);
    expect(canSeeFinance("reception")).toBe(false);
    expect(canSeeFinance("instructor")).toBe(false);
    expect(canSeeFinance(undefined)).toBe(false);
  });
  it("nombra el rol en español", () => {
    expect(roleLabel("admin")).toBe("Dueña");
    expect(roleLabel("reception")).toBe("Recepción");
    expect(roleLabel("instructor")).toBe("Coach");
    expect(roleLabel("otro")).toBe("Equipo");
  });
});

describe("waLink", () => {
  it("antepone 52 a un número de 10 dígitos y limpia símbolos", () => {
    expect(waLink("55 1234-5678")).toBe("https://wa.me/525512345678");
    expect(waLink("+52 55 1234 5678")).toBe("https://wa.me/525512345678");
  });
  it("sin teléfono no hay enlace", () => {
    expect(waLink("")).toBeNull();
    expect(waLink(null)).toBeNull();
    expect(waLink("123")).toBeNull();
  });
});

describe("SeatMeter", () => {
  it("un segmento por lugar y anuncia cuando está llena", () => {
    render(<SeatMeter booked={8} capacity={8} />);
    expect(screen.getByRole("img", { name: "8 de 8 lugares · llena" }).children).toHaveLength(8);
  });
  it("sobrecupo: no truena, llena todo y dice la cifra real", () => {
    render(<SeatMeter booked={9} capacity={8} />);
    expect(screen.getByRole("img", { name: "9 de 8 lugares · llena" }).children).toHaveLength(8);
  });
  it("cupo 0 o inválido no dibuja segmentos", () => {
    render(<SeatMeter booked={3} capacity={0} />);
    expect(screen.getByRole("img", { name: "Sin cupo definido" })).toBeInTheDocument();
  });
  it("con más de 12 lugares usa una barra", () => {
    render(<SeatMeter booked={10} capacity={20} />);
    const m = screen.getByRole("img", { name: "10 de 20 lugares" });
    expect(m.children).toHaveLength(1);
    expect((m.firstElementChild as HTMLElement).style.width).toBe("50%");
  });
});

describe("StatusDot", () => {
  it("siempre lleva la palabra", () => {
    render(<StatusDot tone="success">Activa</StatusDot>);
    expect(screen.getByText("Activa")).toHaveClass("text-success");
  });
  it("un tono desconocido cae a gris", () => {
    render(<StatusDot tone={"raro" as never}>X</StatusDot>);
    expect(screen.getByText("X")).toHaveClass("text-ink-muted");
  });
});

describe("PersonCell", () => {
  it("iniciales de hasta dos palabras", () => {
    expect(initials("maría fernanda garza")).toBe("MF");
    expect(initials("  ")).toBe("?");
    expect(initials(null)).toBe("?");
  });
  it("un nombre largo se corta en vez de empujar la fila", () => {
    const largo = "María Fernanda de la Garza Villarreal Montemayor";
    render(<PersonCell name={largo} sub="maria@correo.com" />);
    expect(screen.getByText(largo)).toHaveClass("truncate");
    expect(screen.getByText(largo).closest("span.min-w-0")).not.toBeNull();
  });
});

describe("AdminPageHeader y KpiStrip", () => {
  it("encabezado con etiqueta, título y acciones", () => {
    render(<AdminPageHeader kicker="Reservas · semana 39" title="Reservas" actions={<button>Nueva</button>} />);
    expect(screen.getByRole("heading", { level: 1, name: "Reservas" })).toBeInTheDocument();
    expect(screen.getByText("Reservas · semana 39")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva" })).toBeInTheDocument();
  });
  it("cada cifra con su etiqueta", () => {
    render(<KpiStrip items={[{ label: "Reservas hoy", value: "49", hint: "de 66 lugares" }, { label: "Activas", value: "112" }]} />);
    expect(screen.getByText("Reservas hoy")).toBeInTheDocument();
    expect(screen.getByText("49")).toHaveClass("nums");
    expect(screen.getByText("de 66 lugares")).toBeInTheDocument();
  });
});

describe("MasterDetail", () => {
  it("con algo elegido, en angosto se ve el detalle con Volver", () => {
    const onBack = vi.fn();
    render(<MasterDetail list={<p>lista</p>} detail={<p>detalle</p>} hasSelection onBack={onBack} />);
    expect(screen.getByText("lista").parentElement).toHaveClass("hidden", "lg:block");
    fireEvent.click(screen.getByRole("button", { name: "Volver a la lista" }));
    expect(onBack).toHaveBeenCalled();
  });
  it("sin nada elegido, en angosto se ve la lista", () => {
    render(<MasterDetail list={<p>lista</p>} detail={<p>detalle</p>} hasSelection={false} onBack={() => {}} />);
    expect(screen.getByText("detalle").parentElement).toHaveClass("hidden", "lg:block");
    expect(screen.queryByRole("button", { name: "Volver a la lista" })).toBeNull();
  });
});

function ParamProbe() {
  const [clase, setClase] = useSearchParamState("clase");
  return (
    <>
      <span>clase={clase ?? "ninguna"}</span>
      <button onClick={() => setClase("c2")}>elegir</button>
      <button onClick={() => setClase(null)}>quitar</button>
      <LocationProbe />
    </>
  );
}

describe("useSearchParamState", () => {
  it("lee y escribe un parámetro sin tocar los demás", () => {
    render(<MemoryRouter initialEntries={["/admin/bookings?clase=c1&x=1"]}><ParamProbe /></MemoryRouter>);
    expect(screen.getByText("clase=c1")).toBeInTheDocument();
    fireEvent.click(screen.getByText("elegir"));
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?clase=c2&x=1");
    fireEvent.click(screen.getByText("quitar"));
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?x=1");
  });
});

describe("WeekNav y DayStrip", () => {
  it("mueve la semana de 7 en 7 días", () => {
    const onChange = vi.fn();
    render(<WeekNav weekStart={new Date(2026, 8, 21)} onChange={onChange} />);
    expect(screen.getByText("21 sep – 27 sep 2026")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));
    expect(onChange.mock.calls[0][0].getDate()).toBe(28);
  });
  it("marca el día elegido y avisa al tocar otro", () => {
    const onChange = vi.fn();
    const days = [21, 22].map((d) => ({ date: `2026-09-${d}`, label: d === 21 ? "LUN" : "MAR", day: d, count: 3 }));
    render(<DayStrip days={days} value="2026-09-21" onChange={onChange} today="2026-09-22" />);
    expect(screen.getByRole("button", { name: /LUN 21/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /MAR 22/ }));
    expect(onChange).toHaveBeenCalledWith("2026-09-22");
  });
});

describe("SaveBar", () => {
  it("sólo aparece con cambios y llama a guardar o descartar", () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    const { rerender } = render(<SaveBar dirty={false} onSave={onSave} onDiscard={onDiscard} />);
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();
    rerender(<SaveBar dirty onSave={onSave} onDiscard={onDiscard} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onSave).toHaveBeenCalled();
    expect(onDiscard).toHaveBeenCalled();
  });
});

describe("SectionTabs", () => {
  it("una pestaña exacta no se marca en sus sub-rutas y el contador va sobre coral", () => {
    render(
      <MemoryRouter initialEntries={["/admin/bookings/waitlist"]}>
        <SectionTabs aria-label="Secciones de Reservas" tabs={[
          { label: "Semana", to: "/admin/bookings", exact: true },
          { label: "Lista de espera", to: "/admin/bookings/waitlist", count: 6 },
        ]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("navigation", { name: "Secciones de Reservas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Semana" })).not.toHaveAttribute("aria-current");
    const espera = screen.getByRole("link", { name: /Lista de espera/ });
    expect(espera).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("6")).toHaveClass("bg-accent", "text-ink");
  });
});
```

- [ ] **Step 3: Correr las pruebas para verlas fallar**

Run: `npx vitest run src/components/admin/pieces.test.tsx`
Expected: FAIL — `Failed to resolve import "@/lib/roles"` (los módulos no existen).

- [ ] **Step 4: Escribir las piezas**

`src/lib/roles.ts`:

```ts
import { useAuthStore } from "@/stores/authStore";

/* Quién ve dinero en el panel (spec §8). El servidor ya protege las rutas;
   esto sólo decide qué se muestra. */
export const OWNER_ROLES = ["admin", "super_admin"] as const;

export const canSeeFinance = (role?: string | null): boolean =>
  (OWNER_ROLES as readonly string[]).includes(String(role ?? ""));

export function useCanSeeFinance(): boolean {
  const role = useAuthStore((s) => (s.user as { role?: string } | null)?.role);
  return canSeeFinance(role);
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Dueña",
  super_admin: "Súper admin",
  reception: "Recepción",
  instructor: "Coach",
  coach: "Coach",
};

export const roleLabel = (role?: string | null): string => ROLE_LABEL[String(role ?? "")] ?? "Equipo";
```

`src/lib/phone.ts`:

```ts
/* Enlace de WhatsApp para un teléfono de México. 10 dígitos → se antepone 52
   (igual que la ficha de clienta). Menos de 10 dígitos no es un teléfono. */
export function waLink(phone?: string | null): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `https://wa.me/${full}`;
}
```

`src/hooks/use-search-param-state.ts`:

```ts
import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/** Un parámetro de la URL como estado: `?clase=`, `?clienta=`, `?tab=`.
 *  Reemplaza la entrada del historial (no apila) y respeta los demás parámetros. */
export function useSearchParamState(key: string): [string | null, (value: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  const set = useCallback(
    (next: string | null) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set(key, next);
          else p.delete(key);
          return p;
        },
        { replace: true },
      );
    },
    [key, setParams],
  );
  return [value, set];
}
```

`src/components/admin/AdminPage.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Contenedor de cada pantalla del panel: todo el ancho, márgenes de 32 px en
   escritorio (spec §4.3). Reemplaza al viejo `.admin-page max-w-*`. */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-6 px-4 py-5 lg:px-8 lg:py-7", className)}>{children}</div>;
}

type AdminPageHeaderProps = {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/* Encabezado de pantalla (spec §4.3): etiqueta, título en mayúsculas,
   subtítulo opcional y, a la derecha, pestañas + acción principal. */
export function AdminPageHeader({ kicker, title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[0.75rem] font-bold uppercase leading-tight tracking-[0.12em] text-ink-muted">{kicker}</p>
        <h1 className="mt-2 break-words font-display text-[1.5rem] font-extrabold uppercase leading-[1.05] text-ink lg:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}
```

`src/components/admin/Panel.tsx`:

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Tarjeta blanca del panel: borde en vez de sombra (spec §4.7). */
export function Panel({ children, className, "aria-label": ariaLabel }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <section aria-label={ariaLabel} className={cn("rounded-2xl border border-line bg-surface", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, trailing }: { title: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 lg:px-6">
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {trailing}
    </div>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-[13px] font-bold text-ink no-underline hover:text-accent-strong">
      {children}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}
```

`src/components/admin/KpiStrip.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

export type Kpi = { label: string; value: ReactNode; hint?: ReactNode };

const COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

/* Fila de cifras en una sola tarjeta con divisores (spec §4.5). En celular
   van de dos en dos. */
export default function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <Panel>
      <dl className={cn("grid grid-cols-2", COLS[Math.min(Math.max(items.length, 1), 4)])}>
        {items.map((k, i) => (
          <div
            key={k.label}
            className={cn(
              "border-line px-5 py-4 lg:px-6 lg:py-5",
              i % 2 === 1 && "border-l",
              i >= 2 && "border-t lg:border-t-0",
              i > 0 && "lg:border-l",
            )}
          >
            <dt className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{k.label}</dt>
            <dd className="nums mt-2.5 font-display text-[1.5rem] font-semibold leading-[1.1] text-ink lg:text-[1.75rem]">{k.value}</dd>
            {k.hint && <dd className="mt-1.5 text-[13px] text-ink-muted">{k.hint}</dd>}
          </div>
        ))}
      </dl>
    </Panel>
  );
}
```

`src/components/admin/SeatMeter.tsx`:

```tsx
import { cn } from "@/lib/utils";

type SeatMeterProps = { booked: number; capacity: number; muted?: boolean; size?: "sm" | "md" };

/* Ocupación en segmentos, uno por lugar (spec §4.5). "Llena" va además en
   texto junto a la clase; aquí sólo se anuncia para lectores de pantalla.
   Con más de 12 lugares se dibuja una barra. Sobrecupo: todo lleno y la
   etiqueta dice la cifra real. */
export default function SeatMeter({ booked, capacity, muted = false, size = "md" }: SeatMeterProps) {
  const cap = Math.max(0, Math.floor(Number(capacity) || 0));
  const taken = Math.max(0, Math.floor(Number(booked) || 0));
  const full = cap > 0 && taken >= cap;
  const fill = muted ? "bg-line-strong" : "bg-ink";

  if (cap === 0) {
    return <span role="img" aria-label="Sin cupo definido" className="inline-block h-2 w-8 rounded-full bg-line" />;
  }
  const label = `${taken} de ${cap} lugares${full ? " · llena" : ""}`;
  if (cap > 12) {
    const pct = Math.min(100, Math.round((taken / cap) * 100));
    return (
      <span role="img" aria-label={label} className="inline-block h-2 w-24 overflow-hidden rounded-full bg-line">
        <span className={cn("block h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </span>
    );
  }
  const seg = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 gap-[3px]">
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={cn("rounded-[2px]", seg, i < taken ? fill : "bg-line")} />
      ))}
    </span>
  );
}
```

`src/components/admin/StatusDot.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "danger" | "muted" | "ink";

const TONE: Record<StatusTone, { text: string; dot: string }> = {
  success: { text: "text-success", dot: "bg-success" },
  danger: { text: "text-danger", dot: "bg-danger" },
  muted: { text: "text-ink-muted", dot: "bg-ink-muted" },
  ink: { text: "text-ink", dot: "bg-ink" },
};

/* Estado con punto y palabra (spec §4.2): el color nunca va solo. */
export default function StatusDot({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const t = TONE[tone] ?? TONE.muted;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold", t.text)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
```

`src/components/admin/PersonCell.tsx`:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const initials = (name?: string | null): string => {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
};

type AvatarProps = { name?: string | null; photoUrl?: string | null; size?: number; className?: string };

export function Avatar({ name, photoUrl, size = 36, className }: AvatarProps) {
  const box = { width: size, height: size };
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={cn("shrink-0 rounded-full object-cover", className)} style={box} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-sunken font-extrabold text-ink", className)}
      style={{ ...box, fontSize: Math.max(12, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

type PersonCellProps = { name?: string | null; sub?: ReactNode; photoUrl?: string | null; size?: number };

/* Avatar + nombre + línea secundaria. Los textos largos se cortan con "…"
   para no empujar la fila (Review Focus 5). */
export default function PersonCell({ name, sub, photoUrl, size = 36 }: PersonCellProps) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold text-ink">{name || "Sin nombre"}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-ink-muted">{sub}</span>}
      </span>
    </span>
  );
}
```

`src/components/admin/MasterDetail.tsx`:

```tsx
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type MasterDetailProps = {
  list: ReactNode;
  detail: ReactNode;
  hasSelection: boolean;
  onBack: () => void;
  backLabel?: string;
  /** "list-narrow": lista de 400 px y detalle ancho. "detail-narrow": al revés (Verificar). */
  layout?: "list-narrow" | "detail-narrow";
};

const GRID = {
  "list-narrow": "lg:grid-cols-[400px_minmax(0,1fr)]",
  "detail-narrow": "lg:grid-cols-[minmax(0,1fr)_440px]",
};

/* Lista y detalle lado a lado (spec §4.5). En pantallas angostas se ve uno a
   la vez: con algo elegido, el detalle con "Volver"; sin nada, la lista. */
export default function MasterDetail({ list, detail, hasSelection, onBack, backLabel = "Volver a la lista", layout = "list-narrow" }: MasterDetailProps) {
  return (
    <div className={cn("grid items-start gap-6", GRID[layout])}>
      <div className={cn("min-w-0", hasSelection && "hidden lg:block")}>{list}</div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        {hasSelection && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-ink-muted lg:hidden"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {backLabel}
          </button>
        )}
        {detail}
      </div>
    </div>
  );
}
```

`src/components/admin/WeekNav.tsx`:

```tsx
import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Semana anterior / siguiente / Hoy. Las semanas empiezan en lunes. */
export default function WeekNav({ weekStart, onChange }: { weekStart: Date; onChange: (weekStart: Date) => void }) {
  const end = addDays(weekStart, 6);
  const label = `${format(weekStart, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => onChange(addDays(weekStart, -7))}>
        <ChevronLeft size={18} />
      </Button>
      <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => onChange(addDays(weekStart, 7))}>
        <ChevronRight size={18} />
      </Button>
      <span className="nums ml-1 text-base font-extrabold text-ink">{label}</span>
      <Button variant="ghost" className="underline" onClick={() => onChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
        Hoy
      </Button>
    </div>
  );
}
```

`src/components/admin/DayStrip.tsx`:

```tsx
import { cn } from "@/lib/utils";

type Day = { date: string; label: string; day: number; count: number };

/* Tira de 7 días con número de clases. El elegido va en tinta; los días que
   ya pasaron, en gris. */
export default function DayStrip({ days, value, onChange, today }: { days: Day[]; value: string; onChange: (date: string) => void; today: string }) {
  return (
    <div role="group" aria-label="Días de la semana" className="flex gap-1.5">
      {days.map((d) => {
        const active = d.date === value;
        const past = d.date < today;
        return (
          <button
            key={d.date}
            type="button"
            aria-pressed={active}
            aria-label={`${d.label} ${d.day}, ${d.count} ${d.count === 1 ? "clase" : "clases"}`}
            onClick={() => onChange(d.date)}
            className={cn(
              "flex min-h-[60px] flex-1 flex-col items-center justify-center gap-px rounded-xl border",
              active ? "border-ink bg-ink text-canvas" : "border-line bg-transparent",
              !active && (past ? "text-ink-muted" : "text-ink"),
            )}
          >
            <span className="text-[0.75rem] font-extrabold tracking-[0.08em]">{d.label}</span>
            <span className="nums text-base font-extrabold leading-tight">{d.day}</span>
            <span className="nums text-[0.75rem] opacity-75">{d.count}</span>
          </button>
        );
      })}
    </div>
  );
}
```

`src/components/admin/SaveBar.tsx`:

```tsx
type SaveBarProps = { dirty: boolean; saving?: boolean; onSave: () => void; onDiscard: () => void };

/* Aviso fijo abajo cuando un formulario tiene cambios (spec §5.18). */
export default function SaveBar({ dirty, saving = false, onSave, onDiscard }: SaveBarProps) {
  if (!dirty) return null;
  return (
    <div role="status" className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-inverse px-5 py-3.5 text-inverse-foreground">
      <span className="flex-1 text-sm font-bold">Tienes cambios sin guardar</span>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        className="min-h-[44px] rounded-full border border-inverse-muted px-5 text-sm font-bold text-inverse-foreground"
      >
        Descartar
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="min-h-[44px] rounded-full bg-canvas px-5 text-sm font-bold text-ink disabled:bg-sunken disabled:text-line-strong"
      >
        {saving ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}
```

Reemplazar `src/components/admin/SectionTabs.tsx` completo:

```tsx
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface SectionTab {
  label: string;
  to: string;
  /** Contador de atención (coral). Sólo se muestra si es mayor que 0. */
  count?: number;
  /** Activa sólo en su ruta exacta, no en sus sub-rutas. */
  exact?: boolean;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  className?: string;
  "aria-label"?: string;
}

/**
 * Pestañas entre páginas hermanas de una sección (p. ej. Cobros → Cobrar /
 * Verificar / Historial). Van a la derecha del título (spec §4.3).
 */
const SectionTabs = ({ tabs, className, "aria-label": ariaLabel = "Secciones" }: SectionTabsProps) => {
  const location = useLocation();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1", className)}
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? location.pathname === tab.to
          : location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
        return (
          <Link
            key={tab.to}
            to={tab.to}
            data-press
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13px] font-bold no-underline transition-colors duration-200",
              active
                ? "bg-ink text-canvas"
                : "text-ink-muted hover:text-ink hover:bg-sunken",
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="nums grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.75rem] font-extrabold leading-none text-ink">
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default SectionTabs;
```

(El contador lleva `bg-accent text-ink` sobre la pestaña activa negra: coral sobre tinta está permitido; lo prohibido es texto claro sobre coral.)

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run src/components/admin/pieces.test.tsx src/components/admin/panel.test.tsx`
Expected: PASS en ambos archivos (la prueba vieja de `SectionTabs` sigue pasando: la activa es `bg-ink text-canvas` y todas miden 44 px).

- [ ] **Step 6: Comprobación estándar y commit**

Run: la comprobación estándar. Expected: verde, `tsc` sin salida, build ok.

```bash
git add src/lib/roles.ts src/lib/phone.ts src/hooks/use-search-param-state.ts src/components/admin src/test
git commit -m "feat(panel): piezas compartidas del panel HIVE

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Marco del panel — menú, barra superior y buscador

**Files:**
- Create: `src/components/admin/ClientSearch.tsx`, `src/components/admin/AdminTopBar.tsx`
- Modify: `src/components/admin/AdminLayout.tsx` (reescritura completa; se conserva `adminNavItemClass` tal cual)
- Test: `src/components/admin/shell.test.tsx`

**Interfaces:**
- Consumes (Task 1): `canSeeFinance`, `useCanSeeFinance`, `roleLabel`, `Avatar`, `loginAs`, `routeApi`.
- Produces:
  - `ClientSearch({ onSelect, inputRef?, autoFocus?, className?, shortcutHint?, placeholder?, label? })`, `type ClientHit = { id: string; displayName: string; email?: string | null; phone?: string | null }`, `MIN_CHARS = 2`.
  - `AdminTopBar({ className? })`.
  - `AdminLayout` usa la llave de consulta `["admin-stats"]` (`GET /admin/stats` → `{ pendingAlerts }`) para el contador de Cobros. Inicio (Tarea 4) usa la misma llave.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/components/admin/shell.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AdminLayout from "./AdminLayout";
import ClientSearch from "./ClientSearch";
import { loginAs, routeApi, LocationProbe } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678" };

function mount(route = "/admin/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <AdminLayout><p>contenido</p></AdminLayout>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockApi.get.mockReset();
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 3, classesToday: 8, activeMembers: 112, monthlyRevenue: 86400 },
    "/users?role=client&search=cam": { data: [CAMILA] },
    "/users?role=client&search=zz": { data: [] },
    "/users?role=client&search=": { data: [] },
  });
});

describe("marco del panel", () => {
  it("la dueña ve Cobrar y el contador de pagos por verificar en Cobros", async () => {
    loginAs("admin");
    mount();
    const cobros = await screen.findByRole("link", { name: /Cobros/ });
    await waitFor(() => expect(within(cobros).getByText("3")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Cobrar/ })).toHaveAttribute("href", "/admin/payments");
    expect(screen.getByRole("link", { name: /Pasar lista/ })).toHaveAttribute("href", "/admin/pasar-lista");
  });

  it("recepción no ve Cobros ni Cobrar, ni pide las cifras de dinero", async () => {
    loginAs("reception");
    mount();
    await screen.findByText("contenido");
    expect(screen.queryByRole("link", { name: /Cobros/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Cobrar/ })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/admin/stats");
  });

  it("el pie muestra el rol, Ver sitio y Cerrar sesión", async () => {
    loginAs("admin");
    mount();
    expect(await screen.findByText("Dueña")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver sitio" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeInTheDocument();
  });

  it("⌘K lleva el foco al buscador", async () => {
    loginAs("admin");
    mount();
    const combo = await screen.findByRole("combobox", { name: "Buscar clienta" });
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(document.activeElement).toBe(combo);
  });

  it("elegir una clienta en el buscador abre su ficha", async () => {
    loginAs("admin");
    mount();
    const combo = await screen.findByRole("combobox", { name: "Buscar clienta" });
    fireEvent.change(combo, { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    expect(screen.getByTestId("location").textContent).toBe("/admin/clients/u1");
  });
});

describe("ClientSearch", () => {
  const renderSearch = (onSelect = vi.fn()) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={qc}><ClientSearch onSelect={onSelect} /></QueryClientProvider>);
    return { onSelect, combo: screen.getByRole("combobox", { name: "Buscar clienta" }) };
  };

  it("con una sola letra no busca", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "c" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it("codifica acentos y símbolos en la URL", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "ñ&+52" } });
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith("/users?role=client&search=%C3%B1%26%2B52"));
  });

  it("flecha y Enter eligen; Esc cierra", async () => {
    const { combo, onSelect } = renderSearch();
    fireEvent.change(combo, { target: { value: "cam" } });
    await screen.findByRole("option", { name: /Camila Torres/ });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(CAMILA);
    fireEvent.change(combo, { target: { value: "cam" } });
    await screen.findByRole("listbox");
    fireEvent.keyDown(combo, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sin resultados lo dice", async () => {
    const { combo } = renderSearch();
    fireEvent.change(combo, { target: { value: "zz" } });
    expect(await screen.findByText("No encontramos a nadie con esos datos.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr para ver fallar**

Run: `npx vitest run src/components/admin/shell.test.tsx`
Expected: FAIL — `Failed to resolve import "./ClientSearch"`.

- [ ] **Step 3: Escribir `ClientSearch`**

`src/components/admin/ClientSearch.tsx`:

```tsx
import { useEffect, useId, useState, type KeyboardEvent, type Ref } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import { Avatar } from "./PersonCell";

export type ClientHit = { id: string; displayName: string; email?: string | null; phone?: string | null };

type ClientSearchProps = {
  onSelect: (client: ClientHit) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
  className?: string;
  /** Muestra el atajo ⌘K dentro del campo (barra superior). */
  shortcutHint?: boolean;
  placeholder?: string;
  label?: string;
};

export const MIN_CHARS = 2;

/**
 * Buscador de clientas (combobox, spec §4.2). Busca desde 2 letras, espera
 * 300 ms entre teclas y codifica el término. La llave de la consulta incluye
 * el término, así que los resultados siempre son los de lo último escrito.
 */
export default function ClientSearch({
  onSelect, inputRef, autoFocus, className, shortcutHint = false,
  placeholder = "Buscar clienta", label = "Buscar clienta",
}: ClientSearchProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounce(term.trim(), 300);
  const enabled = debounced.length >= MIN_CHARS;

  const { data, isFetching, isError, refetch } = useQuery<{ data: ClientHit[] }>({
    queryKey: ["client-search", debounced],
    queryFn: async () => (await api.get(`/users?role=client&search=${encodeURIComponent(debounced)}`)).data,
    enabled,
    staleTime: 30_000,
  });
  const hits = enabled && Array.isArray(data?.data) ? data!.data.slice(0, 8) : [];

  useEffect(() => setActive(0), [debounced]);

  const pick = (c: ClientHit) => {
    onSelect(c);
    setTerm("");
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && hits[active]) {
      e.preventDefault();
      pick(hits[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && enabled;
  const optionId = (i: number) => `${id}-opcion-${i}`;

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        id={id}
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && hits[active] ? optionId(active) : undefined}
        autoComplete="off"
        autoFocus={autoFocus}
        value={term}
        placeholder={placeholder}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-xl border border-line-strong bg-surface pl-10 pr-14 text-sm text-ink placeholder:text-ink-muted focus:border-2 focus:border-ink focus:outline-none focus:ring-4 focus:ring-accent-soft"
      />
      {shortcutHint && (
        <kbd aria-hidden="true" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-line bg-canvas px-1.5 text-[0.75rem] font-bold text-ink-muted">
          ⌘K
        </kbd>
      )}
      {showList && (
        <div id={listId} role="listbox" aria-label="Clientas encontradas" className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
          {isFetching && hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">Buscando…</p>
          ) : isError ? (
            <p className="flex items-center justify-between gap-3 px-4 py-2 text-sm text-danger">
              No pudimos buscar.
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => refetch()} className="min-h-[44px] font-bold underline">
                Reintentar
              </button>
            </p>
          ) : hits.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-muted">No encontramos a nadie con esos datos.</p>
          ) : (
            hits.map((c, i) => (
              <div
                key={c.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex min-h-[52px] cursor-pointer items-center gap-3 px-4 py-2", i === active && "bg-sunken")}
              >
                <Avatar name={c.displayName} size={32} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-bold text-ink">{c.displayName}</span>
                  <span className="block truncate text-xs text-ink-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Escribir `AdminTopBar`**

`src/components/admin/AdminTopBar.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCanSeeFinance } from "@/lib/roles";
import ClientSearch from "./ClientSearch";

/* Barra superior de escritorio (spec §4.2): buscador de clientas con ⌘K,
   "Pasar lista" y, para la dueña, "Cobrar". Sin migaja: el encabezado de
   cada pantalla ya dice dónde estás. */
export default function AdminTopBar({ className }: { className?: string }) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const showFinance = useCanSeeFinance();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className={cn("sticky top-0 z-30 h-[72px] shrink-0 items-center gap-4 border-b border-line bg-canvas px-8", className)}>
      <ClientSearch
        inputRef={inputRef}
        shortcutHint
        className="w-full max-w-[520px]"
        onSelect={(c) => navigate(`/admin/clients/${c.id}`)}
      />
      <div className="ml-auto flex items-center gap-2.5">
        <Link to="/admin/pasar-lista" className={cn(buttonVariants({ variant: "outline" }), "no-underline")}>
          <ScanLine size={16} aria-hidden="true" />
          Pasar lista
        </Link>
        {showFinance && (
          <Link to="/admin/payments" className={cn(buttonVariants(), "no-underline")}>
            <Plus size={16} aria-hidden="true" />
            Cobrar
          </Link>
        )}
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Reescribir `AdminLayout`**

Reemplazar `src/components/admin/AdminLayout.tsx` completo. `NAV_GROUPS`, `MOBILE_QUICK_NAV` y `adminNavItemClass` quedan **idénticos** a los actuales (copiarlos del archivo viejo, líneas 17-86); cambia todo lo demás:

```tsx
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { FEATURES } from "@/config/features";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { canSeeFinance, roleLabel } from "@/lib/roles";
import {
  LayoutDashboard, Package, CreditCard, Users, CalendarDays,
  BookOpen, DollarSign,
  ShoppingCart, BarChart2, Bell, MessageCircle, Award, Percent,
  Settings, ChevronLeft, ArrowLeft, LogOut, Globe, Menu, X, Search,
} from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import AdminTopBar from "./AdminTopBar";
import ClientSearch from "./ClientSearch";
import { Avatar } from "./PersonCell";

// NAV_GROUPS, OWNER_ROLES/canSeeFinance local (se borran: ahora vienen de
// @/lib/roles), MOBILE_QUICK_NAV y adminNavItemClass: copiar de la versión
// anterior sin cambios (líneas 17-86 del archivo viejo), salvo quitar
// `OWNER_ROLES` y `canSeeFinance` locales.

const PAYMENTS_PATH = "/admin/payments";
const ICON_BTN =
  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken hover:text-ink";

/* Contador de atención. Sobre un fondo coral (pestaña activa del celular) va
   en tinta: nunca coral sobre coral (regla 4). Las clases van en líneas
   separadas por la guardia de texto claro sobre coral. */
function PendingBadge({ count, onAccent = false, className }: { count: number; onAccent?: boolean; className?: string }) {
  if (count <= 0) return null;
  const tone = onAccent
    ? "bg-ink text-canvas"
    : "bg-accent text-ink";
  return (
    <span className={cn("nums grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[0.75rem] font-extrabold leading-none", tone, className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> pagos por verificar</span>
    </span>
  );
}

interface AdminLayoutProps {
  children: React.ReactNode;
}

const AdminLayout = ({ children }: AdminLayoutProps) => {
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user as { id?: string; role?: string; displayName?: string; display_name?: string; email?: string } | null);
  const userName = user?.displayName ?? user?.display_name ?? user?.email ?? "Admin";

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  const showFinance = canSeeFinance(user?.role);
  const navGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i: any) =>
      (showFinance || !i.ownerOnly) && (!i.feature || (FEATURES as any)[i.feature])),
  })).filter((g) => g.items.length > 0);
  const mobileQuickNav = MOBILE_QUICK_NAV.filter((i: any) =>
    (showFinance || !i.ownerOnly) && (!i.feature || (FEATURES as any)[i.feature]));
  const allItems = navGroups.flatMap((g) => g.items);
  const matchPath = (itemPath: string) => {
    const basePath = itemPath.split("?")[0];
    return location.pathname === basePath || location.pathname.startsWith(basePath + "/");
  };
  const currentItem = allItems.find((i) => matchPath(i.path));
  const isCompact = collapsed && !mobileOpen;
  const isClientFile = /^\/admin\/clients\/[^/]+$/.test(location.pathname);

  // Misma llave que Inicio: una sola petición para el contador y las cifras.
  const { data: stats } = useQuery<{ pendingAlerts?: number }>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
    enabled: !!user?.id && showFinance,
    refetchInterval: 60_000,
  });
  const pending = stats?.pendingAlerts ?? 0;

  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["admin-notifications-unread-count"],
    queryFn: async () => (await api.get("/admin/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id && FEATURES.adminInbox,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;
  const badgeFor = (path: string) => (path === PAYMENTS_PATH ? pending : path === "/admin/notifications" ? unreadCount : 0);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {mobileOpen && (
        <button aria-label="Cerrar menú" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col border-r border-line bg-surface transition-transform duration-300",
          "w-[88vw] max-w-[300px] -translate-x-full lg:static lg:translate-x-0",
          mobileOpen && "translate-x-0",
          collapsed ? "lg:w-[72px]" : "lg:w-[248px]",
        )}
      >
        <div className={cn("flex h-[72px] shrink-0 items-center border-b border-line", isCompact ? "justify-center px-3" : "justify-between px-5")}>
          {!isCompact && <BrandLogo variant="lockup" size={34} />}
          <button onClick={() => setMobileOpen(false)} className={cn(ICON_BTN, "lg:hidden")} aria-label="Cerrar menú">
            <X size={18} />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className={cn(ICON_BTN, "hidden lg:inline-flex")}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          >
            {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        <nav aria-label="Secciones del panel" className="flex-1 overflow-y-auto py-3.5 scrollbar-thin">
          {navGroups.map((group) => (
            <div key={group.label || "principal"} className="mb-1">
              {!isCompact && group.label && (
                <p className="px-6 pb-1.5 pt-4 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{group.label}</p>
              )}
              {group.items.map(({ path, label, icon: Icon }) => {
                const active = matchPath(path);
                const badge = badgeFor(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    data-press
                    title={isCompact ? label : undefined}
                    className={adminNavItemClass(active, isCompact)}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="relative inline-flex shrink-0">
                      <Icon size={18} />
                      {isCompact && <PendingBadge count={badge} className="absolute -right-2.5 -top-2" />}
                    </span>
                    {!isCompact && <span className="truncate text-sm leading-none">{label}</span>}
                    {!isCompact && <PendingBadge count={badge} className="ml-auto" />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className={cn("flex shrink-0 items-center gap-2 border-t border-line px-3 py-3", isCompact && "flex-col")}>
          <Avatar name={userName} size={36} />
          {!isCompact && (
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold text-ink">{userName}</p>
              <p className="text-[0.75rem] text-ink-muted">{roleLabel(user?.role)}</p>
            </div>
          )}
          <Link to="/" aria-label="Ver sitio" title="Ver sitio" className={ICON_BTN}>
            <Globe size={16} />
          </Link>
          <button type="button" onClick={handleLogout} aria-label="Cerrar sesión" title="Cerrar sesión" className={ICON_BTN}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar className="hidden lg:flex" />

        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:hidden">
          {isClientFile ? (
            <Link to="/admin/clients" aria-label="Volver a Clientas" className={ICON_BTN}>
              <ArrowLeft size={20} />
            </Link>
          ) : (
            <button type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" className={ICON_BTN}>
              <Menu size={20} />
            </button>
          )}
          {!isClientFile && <BrandLogo variant="mark" size={26} />}
          <span className="min-w-0 truncate text-[17px] font-extrabold text-ink">
            {isClientFile ? "Ficha de clienta" : currentItem?.label ?? "Panel"}
          </span>
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Abrir buscador de clientas"
            aria-expanded={searchOpen}
            className={cn(ICON_BTN, "ml-auto border border-line-strong text-ink")}
          >
            <Search size={18} />
          </button>
          <Avatar name={userName} size={36} />
        </header>
        {searchOpen && (
          <div className="border-b border-line bg-surface px-3 py-3 lg:hidden">
            <ClientSearch autoFocus label="Buscar clienta (celular)" onSelect={(c) => navigate(`/admin/clients/${c.id}`)} />
          </div>
        )}

        <main className="admin-mobile-main flex-1 overflow-auto bg-canvas pb-[96px] lg:pb-0">{children}</main>

        {isMobile && (
          <nav aria-label="Secciones" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe lg:hidden">
            <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileQuickNav.length}, minmax(0, 1fr))` }}>
              {mobileQuickNav.map((item) => {
                const active = matchPath(item.path);
                return (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      data-press
                      aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-[64px] flex-col items-center justify-center gap-1 text-[0.75rem] font-bold", active ? "text-ink" : "text-ink-muted")}
                    >
                      <span className={cn("relative inline-flex h-[30px] w-[54px] items-center justify-center rounded-full", active && "bg-accent text-ink")}>
                        <item.icon size={20} />
                        {item.path === PAYMENTS_PATH && <PendingBadge count={pending} onAccent={active} className="absolute -right-1 -top-1.5" />}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
};

export default AdminLayout;
```

(El buscador del celular lleva otra etiqueta — "Buscar clienta (celular)" — para que en pruebas y lectores de pantalla no haya dos combobox con el mismo nombre.)

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run src/components/admin/shell.test.tsx src/components/admin/panel.test.tsx`
Expected: PASS. En `panel.test.tsx` siguen pasando: aria-current del menú, tamaños de texto ≥ 12 px y sin botón coral.

- [ ] **Step 7: Comprobación estándar y commit**

```bash
git add src/components/admin
git commit -m "feat(panel): marco nuevo con buscador de clientas, contador de cobros y navegación de celular

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Servidor — `waitlist_count` en `GET /api/classes`

**Files:**
- Modify: `server/index.js:3540-3587` (consulta de `app.get("/api/classes", …)`)
- Test: `server/tests/panel.test.mjs`

**Interfaces:**
- Produces: cada clase de `GET /api/classes` trae `waitlist_count: number` (reservas en `waitlist`; las canceladas no cuentan). Lo usan Reservas (Tarea 5) y Lista de espera (Tarea 7).

- [ ] **Step 1: Escribir la prueba que falla**

Crear `server/tests/panel.test.mjs`:

```js
// Sub-proyecto 3 (panel): GET /api/classes cuenta la lista de espera.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgpanel";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("GET /api/classes cuenta la lista de espera de cada clase", async () => {
  const llena = await makeClass(A, f, { date: day(8), start: "07:00", end: "08:00", cap: 1 });
  const libre = await makeClass(A, f, { date: day(8), start: "09:00", end: "10:00", cap: 5 });
  const clientas = [];
  for (const k of ["w1", "w2", "w3"]) {
    const c = await makeClient(PFX, k);
    await giveMembership(A, c.id, f.plan.id, 8);
    clientas.push(c);
  }
  // Cupo 1: la primera confirma, las otras dos quedan en espera.
  for (const c of clientas) {
    const r = await api("POST", "/api/bookings", { token: c.token, body: { classId: llena } });
    assert.ok(r.status < 300, `reserva devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  }
  const r = await api("GET", `/api/classes?start=${day(8)}&end=${day(8)}`, { token: A });
  assert.equal(r.status, 200);
  const porId = Object.fromEntries(r.body.data.map((c) => [c.id, c]));
  assert.equal(porId[llena].waitlist_count, 2, "dos en espera");
  assert.equal(porId[llena].current_bookings, 1, "una confirmada");
  assert.equal(porId[libre].waitlist_count, 0, "la clase libre no tiene espera");
});

test("una espera cancelada ya no cuenta", async () => {
  const [c] = await sql(
    `SELECT c.id FROM classes c JOIN instructors i ON i.id = c.instructor_id
      WHERE i.display_name LIKE $1 AND c.max_capacity = 1 LIMIT 1`, [`${PFX}%`]);
  await sql(`UPDATE bookings SET status = 'cancelled' WHERE id = (
               SELECT id FROM bookings WHERE class_id = $1 AND status = 'waitlist' LIMIT 1)`, [c.id]);
  const r = await api("GET", `/api/classes?start=${day(8)}&end=${day(8)}`, { token: A });
  assert.equal(r.body.data.find((x) => x.id === c.id).waitlist_count, 1);
});
```

- [ ] **Step 2: Levantar la base y la API desechables y ver fallar**

```bash
SP=$(mktemp -d)
initdb -D "$SP/pg" -U alma --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$SP/pg" -o "-p 5531 -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l "$SP/pg.log" start >/dev/null; sleep 2
psql -h 127.0.0.1 -p 5531 -U alma -d postgres -qc "CREATE DATABASE hive;"
psql -h 127.0.0.1 -p 5531 -U alma -d hive -q -f supabase/migrations/schema_complete.sql
psql -h 127.0.0.1 -p 5531 -U alma -d hive -q -f supabase/migrations/20260908_fix_doble_descuento_y_contador.sql
(DATABASE_URL=postgres://alma:alma@127.0.0.1:5531/hive JWT_SECRET=hive_qa_secret_pruebas PORT=8131 \
  API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 nohup node server/index.js > "$SP/api.log" 2>&1 &)
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8131/api/health >/dev/null && break; sleep 1; done
echo "SP=$SP"   # guardarlo: se usa para reiniciar y apagar
API_URL=http://127.0.0.1:8131 DATABASE_URL=postgres://alma:alma@127.0.0.1:5531/hive \
  node --test --test-concurrency=1 server/tests/panel.test.mjs 2>&1 | grep -E "✖|ℹ (pass|fail)"
```

Expected: FAIL — `dos en espera` (`undefined !== 2`).

- [ ] **Step 3: Agregar el conteo**

En `server/index.js`, dentro de la consulta de `app.get("/api/classes", …)`, después del bloque que calcula `live_current_bookings` (termina en `), 0) AS live_current_bookings`), agregar una coma y:

```sql
             COALESCE((
               SELECT COUNT(*)::int FROM bookings b
                WHERE b.class_id = c.id
                  AND b.status = 'waitlist'
             ), 0) AS waitlist_count
```

Queda:

```js
             COALESCE((
               SELECT COUNT(*)::int FROM bookings b
                WHERE b.class_id = c.id
                  AND b.status IN ('confirmed','checked_in')
             ), 0) AS live_current_bookings,
             -- Lista de espera viva: la usa el panel para Reservas y Lista de espera.
             COALESCE((
               SELECT COUNT(*)::int FROM bookings b
                WHERE b.class_id = c.id
                  AND b.status = 'waitlist'
             ), 0) AS waitlist_count
      FROM classes c
```

El `rows.map` de abajo no cambia: `...row` ya pasa `waitlist_count`.

- [ ] **Step 4: Reiniciar la API y correr**

```bash
pkill -f "PORT=8131" ; sleep 1
(DATABASE_URL=postgres://alma:alma@127.0.0.1:5531/hive JWT_SECRET=hive_qa_secret_pruebas PORT=8131 \
  API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 nohup node server/index.js > "$SP/api.log" 2>&1 &)
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8131/api/health >/dev/null && break; sleep 1; done
API_URL=http://127.0.0.1:8131 DATABASE_URL=postgres://alma:alma@127.0.0.1:5531/hive \
  node --test --test-concurrency=1 "server/tests/*.test.mjs" 2>&1 | grep -E "ℹ (tests|pass|fail)"
```

Expected: `fail 0` (las suites de regresión existentes y la nueva).

Dejar la base y la API corriendo si se va a seguir; si no: `pkill -f "PORT=8131"; pg_ctl -D "$SP/pg" stop -m fast; rm -rf "$SP"`.

- [ ] **Step 5: Suites del repo y commit**

Run: `npm run test:server 2>&1 | grep -E "ℹ (pass|fail)"` → `fail 0`.

```bash
git add server/index.js server/tests/panel.test.mjs
git commit -m "feat(api): waitlist_count en GET /api/classes para el panel

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Inicio

**Files:**
- Create: `src/lib/today-roster.ts`, `src/lib/today-roster.test.ts`, `src/pages/admin/Dashboard.test.tsx`
- Modify: `src/pages/admin/Dashboard.tsx` (reescritura completa), `src/pages/admin/attendance/TodayAttendance.tsx` (sólo recibe el botón de la cámara)

**Interfaces:**
- Consumes (Tasks 1-2): `AdminPage`, `AdminPageHeader`, `Panel`, `PanelHeader`, `PanelLink`, `KpiStrip`, `SeatMeter`, `StatusDot`, `Avatar`, `useCanSeeFinance`, llave `["admin-stats"]`, `loginAs`, `routeApi`, `renderAdmin`.
- Produces (`src/lib/today-roster.ts`), también para Pasar lista (Tarea 6):
  - `type TodayRosterEntry`, `type TodayClass` (forma de `GET /admin/today-roster`)
  - `hhmm(t: string | null | undefined): string` — acepta `"11:00:00"` y `"2026-09-26T11:00:00"`
  - `minutesUntil(start: string, now: string): number`
  - `durationMin(c: { start_time: string; end_time: string }): number`
  - `summarize(c: TodayClass): { booked; attended; noShow; waitlist; pending; full }`
  - `splitDay(classes: TodayClass[], now: string): { past: TodayClass[]; next: TodayClass | null; later: TodayClass[] }`
  - `daySummary(classes: TodayClass[]): { booked; capacity; waitlist; count }`

- [ ] **Step 1: Pruebas de los cálculos del día**

Crear `src/lib/today-roster.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { daySummary, durationMin, hhmm, minutesUntil, splitDay, summarize, type TodayClass } from "./today-roster";

const e = (id: string, status: string) => ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: id });
const c = (id: string, start: string, end: string, cap: number, roster: ReturnType<typeof e>[] = []): TodayClass => ({
  id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap,
  class_type_name: id, instructor_name: "Fer", roster,
});

describe("today-roster", () => {
  it("hhmm entiende hora sola y fecha con hora", () => {
    expect(hhmm("11:00:00")).toBe("11:00");
    expect(hhmm("2026-09-26T07:30:00")).toBe("07:30");
    expect(hhmm(null)).toBe("");
  });
  it("minutos que faltan y duración", () => {
    expect(minutesUntil("11:00", "10:40")).toBe(20);
    expect(minutesUntil("11:00", "11:10")).toBe(-10);
    expect(durationMin(c("x", "11:00", "11:50", 8))).toBe(50);
  });
  it("cuenta reservadas, asistencias, faltas y espera", () => {
    const s = summarize(c("x", "07:00", "07:50", 3, [e("a", "checked_in"), e("b", "confirmed"), e("c", "no_show"), e("d", "waitlist"), e("f", "confirmed")]));
    expect(s).toEqual({ booked: 3, attended: 1, noShow: 1, waitlist: 1, pending: 2, full: true });
  });
  it("sobrecupo cuenta como llena", () => {
    expect(summarize(c("x", "07:00", "07:50", 1, [e("a", "confirmed"), e("b", "confirmed")])).full).toBe(true);
  });
  it("parte el día en pasadas, siguiente y el resto", () => {
    const day = [c("13", "13:00", "13:50", 6), c("07", "07:00", "07:50", 8), c("11", "11:00", "11:50", 8)];
    const a = splitDay(day, "10:40");
    expect(a.past.map((x) => x.id)).toEqual(["07"]);
    expect(a.next?.id).toBe("11");
    expect(a.later.map((x) => x.id)).toEqual(["13"]);
    expect(splitDay(day, "11:20").next?.id).toBe("11"); // en curso
    const tarde = splitDay(day, "14:00");
    expect(tarde.next).toBeNull();
    expect(tarde.past).toHaveLength(3);
    expect(splitDay([], "10:00")).toEqual({ past: [], next: null, later: [] });
  });
  it("resume el día", () => {
    expect(daySummary([c("a", "07:00", "07:50", 8, [e("1", "confirmed"), e("2", "waitlist")]), c("b", "09:00", "09:50", 6)]))
      .toEqual({ booked: 1, capacity: 14, waitlist: 1, count: 2 });
  });
});
```

Run: `npx vitest run src/lib/today-roster.test.ts` → FAIL (`Failed to resolve import "./today-roster"`).

- [ ] **Step 2: Escribir `src/lib/today-roster.ts`**

```ts
// Tipos y cálculos de GET /admin/today-roster. Los usan Inicio y Pasar lista.

export type TodayRosterEntry = {
  booking_id: string;
  class_id?: string;
  status: string; // confirmed | checked_in | waitlist | no_show
  checked_in_at: string | null;
  guest_profile_id?: string | null;
  user_id: string | null;
  display_name: string | null;
  phone?: string | null;
  guest_name?: string | null;
  host_name?: string | null;
};

export type TodayClass = {
  id: string;
  date?: string;
  start_time: string; // "HH:mm:ss"
  end_time: string;
  max_capacity: number;
  class_type_name: string;
  class_type_color?: string | null;
  instructor_name: string;
  roster: TodayRosterEntry[];
};

/** "11:00:00" → "11:00"; "2026-09-26T07:30:00" → "07:30". */
export const hhmm = (t: string | null | undefined): string => {
  const s = String(t ?? "");
  return (s.includes("T") ? s.split("T")[1] ?? "" : s).slice(0, 5);
};

const toMin = (t: string): number => {
  const [h, m] = hhmm(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minutesUntil = (start: string, now: string): number => toMin(start) - toMin(now);

export const durationMin = (c: { start_time: string; end_time: string }): number =>
  Math.max(0, toMin(c.end_time) - toMin(c.start_time));

/** Reservadas = confirmadas + con check-in (igual que el cupo de Pasar lista). */
export function summarize(c: TodayClass) {
  let booked = 0, attended = 0, noShow = 0, waitlist = 0, pending = 0;
  for (const r of c.roster ?? []) {
    if (r.status === "confirmed") { booked++; pending++; }
    else if (r.status === "checked_in") { booked++; attended++; }
    else if (r.status === "no_show") noShow++;
    else if (r.status === "waitlist") waitlist++;
  }
  return { booked, attended, noShow, waitlist, pending, full: c.max_capacity > 0 && booked >= c.max_capacity };
}

/** Pasadas = ya terminaron. Siguiente = la primera que no ha terminado (puede estar en curso). */
export function splitDay(classes: TodayClass[], now: string) {
  const sorted = [...classes].sort((a, b) => toMin(a.start_time) - toMin(b.start_time));
  const past = sorted.filter((c) => toMin(c.end_time) <= toMin(now));
  const upcoming = sorted.filter((c) => toMin(c.end_time) > toMin(now));
  return { past, next: upcoming[0] ?? null, later: upcoming.slice(1) };
}

export function daySummary(classes: TodayClass[]) {
  return classes.reduce(
    (acc, c) => {
      const s = summarize(c);
      acc.booked += s.booked;
      acc.capacity += Math.max(0, Number(c.max_capacity) || 0);
      acc.waitlist += s.waitlist;
      acc.count += 1;
      return acc;
    },
    { booked: 0, capacity: 0, waitlist: 0, count: 0 },
  );
}
```

Run: `npx vitest run src/lib/today-roster.test.ts` → PASS.

- [ ] **Step 3: Prueba de la pantalla**

Crear `src/pages/admin/Dashboard.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import Dashboard from "./Dashboard";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const e = (id: string, status: string, name = `Clienta ${id}`) =>
  ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: name, guest_name: null });
const clase = (id: string, start: string, end: string, type: string, coach: string, cap: number, roster: ReturnType<typeof e>[]) =>
  ({ id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap, class_type_name: type, instructor_name: coach, roster });

const DIA = [
  clase("c07", "07:00", "07:50", "Reformer Básico", "Fer", 8, [e("a", "checked_in"), e("b", "checked_in"), e("c", "no_show")]),
  clase("c11", "11:00", "11:50", "Reformer Intermedio", "Fer", 2, [e("d", "confirmed", "Camila Torres"), e("f", "confirmed"), e("g", "waitlist"), e("h", "waitlist")]),
  clase("c13", "13:00", "13:50", "Tower", "Sofía", 6, [e("i", "confirmed")]),
];

function tabla(over: Record<string, unknown> = {}) {
  return {
    "/admin/stats": { classesToday: 3, activeMembers: 112, monthlyRevenue: 86400, pendingAlerts: 1 },
    "/admin/today-roster": { data: DIA },
    "/memberships?status=expiring": { data: [{ id: "m1" }, { id: "m2" }] },
    "/memberships?limit=5": { data: [{ id: "m9", userName: "Camila Torres", planName: "Paquete 8 clases", status: "active" }] },
    "/admin/orders?status=pending_verification": { data: [{ id: "o1", status: "pending_verification", totalAmount: 1450 }] },
    "/admin/orders?status=pending_payment": { data: [] },
    "/admin/birthdays": { data: [{ id: "u5", displayName: "Andrea Martínez", isToday: true, day: 25, month: 9 }] },
    "/reports/overview": { data: { classOccupancyRate: 72, deltas: { occupancy: 6 } } },
    "/reports/revenue": { data: [{ month: "2026-08-01", amount: 77000 }, { month: "2026-09-01", amount: 86400 }] },
    "/reports/dormant": { data: { active_7d: 142, dormant_8_14d: 38, dormant_15_30d: 21, dormant_31_60d: 17, lost_60d: 29 } },
    "/classes?start=2026-09-26": { data: [{ class_type_name: "Reformer Básico", start_time: "2026-09-26T07:00:00" }] },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Inicio", () => {
  it("la dueña ve la siguiente clase, lo pendiente, sus cifras y las gráficas", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });

    const hero = await screen.findByRole("region", { name: "Siguiente clase" });
    expect(within(hero).getByText("11:00")).toBeInTheDocument();
    expect(within(hero).getByText("Reformer Intermedio")).toBeInTheDocument();
    expect(within(hero).getByText("Siguiente · en 20 min")).toBeInTheDocument();
    expect(within(hero).getByText("Llena · 2/2")).toBeInTheDocument();
    expect(within(hero).getByText("2 en espera")).toBeInTheDocument();

    expect(screen.getByText("de 16 lugares en 3 clases")).toBeInTheDocument();
    expect(await screen.findByText("Ingresos · septiembre")).toBeInTheDocument();

    const pendientes = screen.getByRole("region", { name: "Por atender" });
    expect(await within(pendientes).findByText("Pagos por verificar")).toBeInTheDocument();
    expect(within(pendientes).getByText("$1,450 por confirmar")).toBeInTheDocument();
    expect(within(pendientes).getByText(/en lista de espera hoy/)).toBeInTheDocument();
    expect(within(pendientes).getByText(/membresías por vencer/)).toBeInTheDocument();
    expect(within(pendientes).getByText(/Andrea Martínez/)).toBeInTheDocument();

    const agenda = screen.getByRole("region", { name: "Agenda de hoy" });
    expect(within(agenda).getByText("Tower")).toBeInTheDocument();
    expect(within(agenda).getByText("2 asistieron · 1 falta")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Ingresos · últimos 6 meses" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver en Reportes/ })).toHaveAttribute("href", "/admin/reports");
    expect(screen.queryByText(/Reactivar por WhatsApp/)).toBeNull();
  });

  it("recepción no ve dinero ni pide los reportes", async () => {
    loginAs("reception");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    expect(await screen.findByText("Clases hoy")).toBeInTheDocument();
    expect(screen.getByText("En lista de espera hoy")).toBeInTheDocument();
    expect(screen.queryByText(/Ingresos/)).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/reports/revenue");
    expect(mockApi.get).not.toHaveBeenCalledWith(expect.stringContaining("/reports/overview"));
  });

  it("cuando ya no hay clases, lo dice y anuncia la primera de mañana", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 0));
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    const hero = await screen.findByRole("region", { name: "Siguiente clase" });
    expect(within(hero).getByText("Ya no hay más clases hoy")).toBeInTheDocument();
    expect(await within(hero).findByText("Mañana abre Reformer Básico a las 07:00.")).toBeInTheDocument();
  });

  it("sin nada pendiente dice Todo al día", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({
      "/admin/stats": { classesToday: 1, activeMembers: 10, monthlyRevenue: 0, pendingAlerts: 0 },
      "/admin/today-roster": { data: [DIA[2]] },
      "/memberships?status=expiring": { data: [] },
      "/admin/orders?status=pending_verification": { data: [] },
      "/admin/birthdays": { data: [] },
    }));
    renderAdmin(<Dashboard />, { route: "/admin/dashboard" });
    const pendientes = await screen.findByRole("region", { name: "Por atender" });
    expect(await within(pendientes).findByText("Todo al día")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/Dashboard.test.tsx` → FAIL (no existe la región "Siguiente clase").

- [ ] **Step 4: Reescribir `src/pages/admin/Dashboard.tsx`**

Reemplazar el archivo completo:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Cake, CreditCard, Hourglass, ScanLine, type LucideIcon } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel, PanelHeader, PanelLink } from "@/components/admin/Panel";
import KpiStrip, { type Kpi } from "@/components/admin/KpiStrip";
import SeatMeter from "@/components/admin/SeatMeter";
import StatusDot, { type StatusTone } from "@/components/admin/StatusDot";
import { Avatar } from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { useCanSeeFinance } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { COLOR } from "@/design/tokens";
import { daySummary, durationMin, hhmm, minutesUntil, splitDay, summarize, type TodayClass } from "@/lib/today-roster";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  pending_activation: "Por activar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  active: "Activa",
  expired: "Expirada",
  frozen: "Congelada",
};
const STATUS_TONE: Record<string, StatusTone | "pending"> = {
  active: "success", approved: "success", expired: "muted", frozen: "muted",
  cancelled: "danger", rejected: "danger",
  pending_payment: "pending", pending_verification: "pending", pending_activation: "pending",
};

type Stats = { classesToday: number; activeMembers: number; monthlyRevenue: number | null; pendingAlerts: number };
type Birthday = { id: string; displayName: string; isToday: boolean };
type Order = { id: string; status: string; totalAmount?: number | string; total_amount?: number | string; amount?: number | string };
type RecentMembership = { id: string; userName?: string; planName?: string; status: string };
type TodoItem = { icon: LucideIcon; count: number; title: string; sub: string; to: string };

const TOOLTIP_STYLE = { background: COLOR.surface, border: `1px solid ${COLOR.line}`, borderRadius: 12, fontSize: 12, color: COLOR.ink };
const DORMANT = [
  { key: "active_7d", label: "≤ 7 días" },
  { key: "dormant_8_14d", label: "8–14 días" },
  { key: "dormant_15_30d", label: "15–30 días" },
  { key: "dormant_31_60d", label: "31–60 días" },
  { key: "lost_60d", label: "60+ días" },
] as const;

const LABEL = "text-[0.75rem] font-bold uppercase tracking-[0.12em]";

function MembershipStatus({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const label = STATUS_LABEL[status] ?? status;
  if (tone === "pending") return <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{label}</span>;
  return <StatusDot tone={tone}>{label}</StatusDot>;
}

/* Bloque negro "Siguiente clase" (préstamo de la dirección B, spec §5.1). */
function NextClassHero({ cls, clock, tomorrow }: { cls: TodayClass | null; clock: string; tomorrow: { name: string; time: string } | null }) {
  if (!cls) {
    return (
      <section aria-label="Siguiente clase" className="rounded-2xl bg-inverse px-7 py-6 text-inverse-foreground">
        <p className={cn(LABEL, "text-inverse-muted")}>Siguiente clase</p>
        <p className="mt-3 font-display text-xl font-semibold uppercase leading-tight">Ya no hay más clases hoy</p>
        {tomorrow && <p className="mt-2 text-sm text-inverse-muted">Mañana abre {tomorrow.name} a las {tomorrow.time}.</p>}
      </section>
    );
  }
  const s = summarize(cls);
  const mins = minutesUntil(hhmm(cls.start_time), clock);
  const people = cls.roster.filter((r) => r.status === "confirmed" || r.status === "checked_in").slice(0, 8);
  return (
    <section aria-label="Siguiente clase" className="grid items-center gap-6 rounded-2xl bg-inverse px-7 py-6 text-inverse-foreground lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-8">
      <div>
        <p className={cn(LABEL, "text-inverse-muted")}>{mins <= 0 ? "En curso" : `Siguiente · en ${mins} min`}</p>
        <p className="nums mt-2.5 font-display text-[3.5rem] font-extrabold leading-none">{hhmm(cls.start_time)}</p>
      </div>
      <div className="min-w-0 space-y-2.5">
        <p className="font-display text-xl font-semibold uppercase leading-tight">{cls.class_type_name}</p>
        <p className="text-sm text-inverse-muted">con {cls.instructor_name} · {durationMin(cls)} min</p>
        <div className="flex flex-wrap gap-2">
          {s.full ? (
            <Badge variant="attention">Llena · {s.booked}/{cls.max_capacity}</Badge>
          ) : (
            <span className="nums rounded-full bg-inverse-raised px-2.5 py-1 text-[0.75rem] font-extrabold">{s.booked}/{cls.max_capacity} reservadas</span>
          )}
          {s.waitlist > 0 && (
            <span className="rounded-full bg-inverse-raised px-2.5 py-1 text-[0.75rem] font-extrabold">{s.waitlist} en espera</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-3.5 lg:items-end">
        {people.length > 0 && (
          <div className="flex pl-2" aria-label={`${people.length} reservadas`}>
            {people.map((p) => (
              <Avatar key={p.booking_id} name={p.guest_name ?? p.display_name} size={36} className="-ml-2 border-2 border-inverse bg-inverse-raised text-inverse-foreground" />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Link to={`/admin/bookings?clase=${cls.id}`} className="inline-flex min-h-[44px] items-center rounded-full border border-inverse-muted px-5 text-sm font-bold text-inverse-foreground no-underline">
            Ver lista
          </Link>
          <Link to="/admin/pasar-lista" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-canvas px-5 text-sm font-bold text-ink no-underline">
            <ScanLine size={16} aria-hidden="true" />
            Pasar lista
          </Link>
        </div>
      </div>
    </section>
  );
}

function AgendaRow({ cls, past }: { cls: TodayClass; past: boolean }) {
  const s = summarize(cls);
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-5 py-3.5 first:border-t-0 lg:grid-cols-[60px_minmax(0,1fr)_190px_170px] lg:gap-4 lg:px-6">
      <span className={cn("nums text-[15px] font-extrabold", past ? "text-ink-muted" : "text-ink")}>{hhmm(cls.start_time)}</span>
      <span className="min-w-0">
        <span className={cn("block truncate text-[15px] font-bold", past ? "text-ink-muted" : "text-ink")}>{cls.class_type_name}</span>
        <span className="block truncate text-[13px] text-ink-muted">con {cls.instructor_name}</span>
      </span>
      <span className="hidden items-center gap-2.5 lg:flex">
        <SeatMeter booked={s.booked} capacity={cls.max_capacity} muted={past} />
        <span className={cn("nums text-sm font-bold", past && "text-ink-muted")}>{s.booked}/{cls.max_capacity}</span>
      </span>
      <span className="flex justify-end">
        {past ? (
          <span className="text-[13px] text-ink-muted">
            {s.attended} {s.attended === 1 ? "asistió" : "asistieron"}
            {s.noShow > 0 ? ` · ${s.noShow} ${s.noShow === 1 ? "falta" : "faltas"}` : ""}
          </span>
        ) : s.full ? (
          <Badge variant="attention">Llena</Badge>
        ) : (
          <span className="text-[13px] text-ink-muted">{cls.max_capacity - s.booked} lugares libres</span>
        )}
      </span>
    </li>
  );
}

function TodoRow({ item }: { item: TodoItem }) {
  const Icon = item.icon;
  return (
    <li className="flex items-center gap-3.5 border-t border-line py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-sm font-bold"><span className="nums">{item.count}</span> {item.title}</span>
        <span className="block truncate text-[13px] text-ink-muted">{item.sub}</span>
      </span>
      <PanelLink to={item.to}>Ver</PanelLink>
    </li>
  );
}

const Dashboard = () => {
  const showFinance = useCanSeeFinance();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const clock = format(now, "HH:mm");
  const from = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const to = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
  const month = now.getMonth() + 1;
  const monthName = MONTHS[now.getMonth()];

  const statsQ = useQuery<Stats>({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const todayQ = useQuery<{ data: TodayClass[] }>({
    queryKey: ["today-roster"],
    queryFn: async () => (await api.get("/admin/today-roster")).data,
    refetchInterval: 60_000,
  });
  const expiringQ = useQuery<{ data: unknown[] }>({
    queryKey: ["memberships", "expiring"],
    queryFn: async () => (await api.get("/memberships?status=expiring")).data,
  });
  const recentQ = useQuery<{ data: RecentMembership[] }>({
    queryKey: ["memberships-recent"],
    queryFn: async () => (await api.get("/memberships?limit=5")).data,
  });
  const ordersQ = useQuery<{ data: Order[] }>({
    queryKey: ["orders-pending"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        api.get("/admin/orders?status=pending_verification"),
        api.get("/admin/orders?status=pending_payment"),
      ]);
      const list = (r: { data?: { data?: Order[] } }) => (Array.isArray(r.data?.data) ? r.data!.data! : []);
      return { data: [...list(a), ...list(b)] };
    },
  });
  const birthdaysQ = useQuery<{ data: Birthday[] }>({
    queryKey: ["admin-birthdays", month],
    queryFn: async () => (await api.get(`/admin/birthdays?month=${month}`)).data,
  });
  const overviewQ = useQuery<{ data: { classOccupancyRate?: number; deltas?: { occupancy?: number } } }>({
    queryKey: ["reports-overview", from, to],
    queryFn: async () => (await api.get(`/reports/overview?from=${from}&to=${to}`)).data,
    enabled: showFinance,
  });
  const revenueQ = useQuery<{ data: { month: string; amount: number }[] }>({
    queryKey: ["dashboard-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
    enabled: showFinance,
  });
  const dormantQ = useQuery<{ data: Record<string, number> }>({
    queryKey: ["dashboard-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
    enabled: showFinance,
  });

  const classes = Array.isArray(todayQ.data?.data) ? todayQ.data!.data : [];
  const { past, next } = splitDay(classes, clock);
  const day = daySummary(classes);
  const rest = [...classes]
    .filter((c) => c.id !== next?.id)
    .sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  const pastIds = new Set(past.map((c) => c.id));

  const tomorrowQ = useQuery<{ data: { class_type_name?: string; start_time?: string }[] }>({
    queryKey: ["dashboard-tomorrow", tomorrow],
    queryFn: async () => (await api.get(`/classes?start=${tomorrow}&end=${tomorrow}`)).data,
    enabled: todayQ.isSuccess && !next,
  });
  const firstTomorrow = tomorrowQ.data?.data?.[0];

  const stats = statsQ.data;
  const pendingCount = stats?.pendingAlerts ?? 0;
  const orders = Array.isArray(ordersQ.data?.data) ? ordersQ.data!.data : [];
  const pendingAmount = orders
    .filter((o) => o.status === "pending_verification")
    .reduce((sum, o) => sum + Number(o.totalAmount ?? o.total_amount ?? o.amount ?? 0), 0);
  const expiringCount = Array.isArray(expiringQ.data?.data) ? expiringQ.data!.data.length : 0;
  const birthdays = Array.isArray(birthdaysQ.data?.data) ? birthdaysQ.data!.data : [];
  const todayBirthdays = birthdays.filter((b) => b.isToday);
  const recent = Array.isArray(recentQ.data?.data) ? recentQ.data!.data.slice(0, 5) : [];
  const occupancy = overviewQ.data?.data?.classOccupancyRate;
  const occDelta = overviewQ.data?.data?.deltas?.occupancy;

  const kpis: Kpi[] = [
    { label: "Reservas hoy", value: String(day.booked), hint: `de ${day.capacity} lugares en ${day.count} ${day.count === 1 ? "clase" : "clases"}` },
    ...(showFinance
      ? [
          {
            label: "Ocupación · semana",
            value: occupancy != null ? `${Math.round(occupancy)}%` : "—",
            hint: typeof occDelta === "number" ? `${occDelta >= 0 ? "+" : ""}${occDelta.toFixed(1)} pts vs. semana pasada` : "de los lugares de la semana",
          },
          { label: `Ingresos · ${monthName}`, value: stats?.monthlyRevenue != null ? formatMXN(stats.monthlyRevenue) : "—", hint: "órdenes aprobadas" },
        ]
      : [
          { label: "Clases hoy", value: String(stats?.classesToday ?? day.count), hint: "programadas en la agenda" },
          { label: "En lista de espera hoy", value: String(day.waitlist), hint: "en clases llenas" },
        ]),
    {
      label: "Membresías activas",
      value: stats?.activeMembers != null ? String(stats.activeMembers) : "—",
      hint: expiringCount ? `${expiringCount} vencen esta semana` : "clientas con paquete vigente",
    },
  ];

  const waitClasses = classes.filter((c) => summarize(c).waitlist > 0);
  const todos: TodoItem[] = [];
  if (day.waitlist > 0) {
    todos.push({
      icon: Hourglass, count: day.waitlist, title: "en lista de espera hoy",
      sub: waitClasses.map((c) => `${c.class_type_name} · ${hhmm(c.start_time)}`).join(", "),
      to: "/admin/bookings/waitlist",
    });
  }
  if (expiringCount > 0) {
    todos.push({
      icon: CreditCard, count: expiringCount, title: expiringCount === 1 ? "membresía por vencer" : "membresías por vencer",
      sub: "en los próximos 7 días", to: "/admin/memberships?tab=expiring",
    });
  }
  if (todayBirthdays.length > 0) {
    todos.push({
      icon: Cake, count: todayBirthdays.length, title: "cumpleaños hoy",
      sub: `${todayBirthdays.map((b) => b.displayName).join(", ")} · ${birthdays.length} en ${monthName}`,
      to: "/admin/clients?birthday=month",
    });
  }
  const nothingPending = !statsQ.isLoading && pendingCount === 0 && todos.length === 0;

  const revenueRows = (Array.isArray(revenueQ.data?.data) ? revenueQ.data!.data : [])
    .slice(-6)
    .map((r) => ({ month: new Date(r.month).toLocaleDateString("es-MX", { month: "short" }), amount: Number(r.amount) || 0 }));
  const dorm = dormantQ.data?.data ?? null;
  const dormMax = dorm ? Math.max(1, ...DORMANT.map((d) => Number(dorm[d.key]) || 0)) : 1;

  return (
    <AuthGuard requiredRoles={["admin", "super_admin", "reception", "instructor"]}>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker={format(now, "EEEE d 'de' MMMM", { locale: es })}
            title="Hoy en el estudio"
            actions={<span className="text-[13px] text-ink-muted">Actualizado {clock}</span>}
          />

          {statsQ.isError ? (
            <ErrorState title="No pudimos cargar los indicadores" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => statsQ.refetch()} />
          ) : (
            <KpiStrip items={kpis} />
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-6">
              {todayQ.isLoading ? (
                <SkeletonRow height={170} />
              ) : !todayQ.isError ? (
                <NextClassHero
                  cls={next}
                  clock={clock}
                  tomorrow={firstTomorrow ? { name: firstTomorrow.class_type_name ?? "la primera clase", time: hhmm(firstTomorrow.start_time) } : null}
                />
              ) : null}

              <Panel aria-label="Agenda de hoy" className="overflow-hidden">
                <PanelHeader title="Agenda de hoy" trailing={<PanelLink to="/admin/classes">Ver semana</PanelLink>} />
                {todayQ.isError ? (
                  <div className="px-6">
                    <ErrorState title="No pudimos cargar la agenda de hoy" onRetry={() => todayQ.refetch()} />
                  </div>
                ) : todayQ.isLoading ? (
                  <div className="space-y-2 px-6 pb-5"><SkeletonRow /><SkeletonRow /></div>
                ) : classes.length === 0 ? (
                  <p className="border-t border-line px-6 py-5 text-sm text-ink-muted">Hoy no hay clases programadas.</p>
                ) : rest.length === 0 ? (
                  <p className="border-t border-line px-6 py-5 text-sm text-ink-muted">Es la única clase de hoy.</p>
                ) : (
                  <ul className="border-t border-line">
                    {rest.map((c) => <AgendaRow key={c.id} cls={c} past={pastIds.has(c.id)} />)}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="flex flex-col gap-6">
              <Panel aria-label="Por atender">
                <PanelHeader title="Por atender" />
                <div className="px-5 pb-3 lg:px-6">
                  {pendingCount > 0 && (
                    <div className="mb-1.5 flex items-center gap-3.5 rounded-xl bg-accent-soft p-4">
                      <span className="nums font-display text-[2rem] font-semibold leading-none text-accent-strong">{pendingCount}</span>
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-extrabold">Pagos por verificar</span>
                        <span className="block text-[13px] text-ink-muted">{formatMXN(pendingAmount)} por confirmar</span>
                      </span>
                      <Link to="/admin/orders" className={cn(buttonVariants(), "no-underline")}>Revisar</Link>
                    </div>
                  )}
                  {todos.length > 0 && <ul>{todos.map((t) => <TodoRow key={t.to} item={t} />)}</ul>}
                  {nothingPending && <p className="py-3 text-sm font-bold text-success">Todo al día</p>}
                </div>
              </Panel>

              <Panel aria-label="Últimas membresías">
                <PanelHeader title="Últimas membresías" trailing={<PanelLink to="/admin/memberships">Todas</PanelLink>} />
                <div className="px-5 pb-3 lg:px-6">
                  {recentQ.isError ? (
                    <ErrorState title="No pudimos cargar las membresías" onRetry={() => recentQ.refetch()} />
                  ) : recent.length === 0 ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay membresías recientes. Cuando una clienta compre un paquete aparecerá aquí.</p>
                  ) : (
                    <ul>
                      {recent.map((m) => (
                        <li key={m.id} className="flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0">
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-sm font-bold">{m.userName ?? "Clienta"}</span>
                            <span className="block truncate text-xs text-ink-muted">{m.planName ?? "—"}</span>
                          </span>
                          <MembershipStatus status={m.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          </div>

          {showFinance && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel aria-label="Ingresos · últimos 6 meses">
                <PanelHeader title="Ingresos · últimos 6 meses" trailing={<PanelLink to="/admin/reports">Reportes</PanelLink>} />
                <div className="px-5 pb-5 lg:px-6">
                  {revenueQ.isError ? (
                    <ErrorState title="No pudimos cargar los ingresos" onRetry={() => revenueQ.refetch()} />
                  ) : revenueRows.length === 0 ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay ingresos registrados. Aquí verás la curva de los últimos meses.</p>
                  ) : (
                    <div role="img" aria-label={`Ingresos de los últimos ${revenueRows.length} meses; el último, ${formatMXN(revenueRows[revenueRows.length - 1].amount)}`}>
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={revenueRows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLOR.inkMuted }} />
                          <Tooltip cursor={{ fill: COLOR.sunken }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatMXN(v), "Ingresos"]} />
                          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={40}>
                            {revenueRows.map((_, i) => (
                              <Cell key={i} fill={i === revenueRows.length - 1 ? COLOR.ink : COLOR.lineStrong} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel aria-label="Clientas por última visita">
                <PanelHeader title="Clientas por última visita" trailing={<PanelLink to="/admin/reports">Ver en Reportes</PanelLink>} />
                <div className="px-5 pb-5 lg:px-6">
                  {dormantQ.isError ? (
                    <ErrorState title="No pudimos cargar esta gráfica" onRetry={() => dormantQ.refetch()} />
                  ) : !dorm ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay visitas registradas para esta gráfica.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {DORMANT.map((d) => {
                        const v = Number(dorm[d.key]) || 0;
                        return (
                          <li key={d.key} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3">
                            <span className="text-[13px] text-ink-muted">{d.label}</span>
                            <span aria-hidden="true" className="block h-2.5 rounded-r bg-ink" style={{ width: `${Math.max(2, Math.round((v / dormMax) * 100))}%` }} />
                            <span className="nums text-right text-[13px] font-extrabold">{v}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          )}
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Dashboard;
```

Notas:
- La cuadrícula de cumpleaños del mes sale; queda el renglón en "Por atender" que lleva a `/admin/clients?birthday=month` (Tarea 12 hace que ese filtro funcione).
- `CheckinScanner` sale de aquí; el siguiente paso lo lleva a Pasar lista.

- [ ] **Step 5: Llevar la cámara a Pasar lista**

En `src/pages/admin/attendance/TodayAttendance.tsx` (Tarea 6 rehace la pantalla; aquí sólo se muda el botón para no perderlo):
1. Importar `import CheckinScanner from "@/components/admin/CheckinScanner";` y `Camera` de `lucide-react`.
2. Dentro del componente, junto a los demás `useState`: `const [scanOpen, setScanOpen] = useState(false);` (agregar `useState` al import de React si falta).
3. En el encabezado (líneas 131-153), junto al botón "Actualizar", agregar:

```tsx
<Button onClick={() => setScanOpen(true)}>
  <Camera size={16} aria-hidden="true" />
  Escanear QR del pase
</Button>
```

4. Junto a `{dialog}` (línea 306): `<CheckinScanner open={scanOpen} onOpenChange={setScanOpen} />`.

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run src/lib/today-roster.test.ts src/pages/admin/Dashboard.test.tsx`
Expected: PASS.

- [ ] **Step 7: Comprobación estándar y commit**

```bash
git add src/lib/today-roster.ts src/lib/today-roster.test.ts src/pages/admin/Dashboard.tsx src/pages/admin/Dashboard.test.tsx src/pages/admin/attendance/TodayAttendance.tsx
git commit -m "feat(panel): Inicio con siguiente clase, por atender y agenda del día

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Reservas · Semana

**Files:**
- Create: `src/pages/admin/bookings/ReservasTabs.tsx`, `src/pages/admin/bookings/BookingsList.test.tsx`
- Modify: `src/pages/admin/bookings/BookingsList.tsx` — se reemplazan `ClassPicker` (L917-1067) y `BookingsList` (L1070-1101), y el JSX de encabezado y renglones de `ClassRoster` (L369-578). **Se conservan sin cambios** `CancelBookingDialog` (L61-150), todo el estado, las consultas, las mutaciones y los manejadores de `ClassRoster` (L153-367), el Sheet "Asignar reserva a socia" (L581-891, salvo la casilla de acompañante), `CancelBookingDialog` y `{dialog}` (L900-911).

**Interfaces:**
- Consumes: `useSearchParamState`, `AdminPage`, `AdminPageHeader`, `Panel`, `MasterDetail`, `WeekNav`, `DayStrip`, `Avatar`, `StatusDot`, `hhmm` (Task 4), `waitlist_count` (Task 3).
- Produces: `ReservasTabs()` (Semana · Hoy · pasar lista · Lista de espera, con el contador de espera de la semana) — la usan Pasar lista (Tarea 6) y Lista de espera (Tarea 7). La lista de una clase se abre con `/admin/bookings?clase=<id>` (la usan Inicio, Calendario y Lista de espera).

- [ ] **Step 1: Prueba que falla**

Crear `src/pages/admin/bookings/BookingsList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: 2 },
    { id: "c13", date: "2026-09-25", start_time: "2026-09-25T13:00:00", class_type_name: "Tower", instructor_name: "Sofía", max_capacity: 6, current_bookings: 3, waitlist_count: 0 },
  ],
};
const roster = (entries: object[]) => ({
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: entries,
  },
});
const r = (bookingId: string, status: string, displayName: string, classesRemaining: number | null = 3) =>
  ({ bookingId, status, checkedInAt: null, userId: bookingId, displayName, email: `${bookingId}@x.com`, phone: "5512345678", planName: "Paquete 8", classesRemaining });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/classes?start=": semana,
    "/classes/c11/roster": roster([r("b1", "confirmed", "Camila Torres"), r("b2", "checked_in", "Valeria Ruiz", 9999), r("b3", "waitlist", "Regina López")]),
    "/classes/c13/roster": { data: { class: { classTypeName: "Tower", startsAt: "2026-09-25T13:00:00", date: "2026-09-25", instructorName: "Sofía" }, roster: [] } },
    "/classes/zzz/roster": Object.assign(new Error("404"), { response: { status: 404, data: {} } }),
    "/loyalty/config": { data: { faltas_cancel_window_hours: 12 } },
    "/users?role=client": { data: [] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Reservas · Semana", () => {
  it("con ?clase= abre la lista de esa clase junto a la semana", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    expect(await within(lista).findByText("Reformer Intermedio")).toBeInTheDocument();
    expect(within(lista).getByText("Asistió")).toBeInTheDocument();
    expect(within(lista).getByText("Lista de espera")).toBeInTheDocument();
    expect(within(lista).getByText(/Ilimitado/)).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: "Check-in de Camila Torres" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/b1/check-in"));
    expect(screen.getByRole("region", { name: "Clases de la semana" })).toBeInTheDocument();
  });

  it("elegir otra clase la pone en la URL", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings", path: "/admin/bookings" });
    fireEvent.click(await screen.findByRole("button", { name: /Tower/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/bookings?clase=c13"));
  });

  it("con visitas apagadas no se ofrece visitante ni acompañante", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    await within(lista).findByText("Reformer Intermedio");
    expect(screen.queryByRole("button", { name: "Asignar visitante" })).toBeNull();
    fireEvent.click(within(lista).getByRole("button", { name: /Asignar socia/ }));
    expect(await screen.findByText("Asignar reserva a socia")).toBeInTheDocument();
    expect(screen.queryByText("Llevará acompañante")).toBeNull();
  });

  it("un enlace viejo muestra el error con salida", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=zzz", path: "/admin/bookings" });
    expect(await screen.findByText("No pudimos cargar la clase")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Elegir otra clase" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/bookings"));
  });

  it("la pestaña Lista de espera cuenta la espera de la semana", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings", path: "/admin/bookings" });
    const tab = await screen.findByRole("link", { name: /Lista de espera/ });
    await waitFor(() => expect(within(tab).getByText("2")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Semana" })).toHaveAttribute("aria-current", "page");
  });
});
```

Run: `npx vitest run src/pages/admin/bookings/BookingsList.test.tsx` → FAIL (no hay región "Lista de la clase").

- [ ] **Step 2: Crear `ReservasTabs`**

`src/pages/admin/bookings/ReservasTabs.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { endOfWeek, format, startOfWeek } from "date-fns";
import api from "@/lib/api";
import SectionTabs from "@/components/admin/SectionTabs";

/* Pestañas de Reservas (spec §5.2). El contador de Lista de espera suma la
   espera de las clases de esta semana (`waitlist_count`). Comparte llave con
   la lista de la semana, así que no duplica la petición. */
export default function ReservasTabs() {
  const now = new Date();
  const start = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const end = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const { data } = useQuery<{ data: { waitlist_count?: number }[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
    staleTime: 60_000,
  });
  const waiting = (Array.isArray(data?.data) ? data!.data : []).reduce((sum, c) => sum + (Number(c.waitlist_count) || 0), 0);
  return (
    <SectionTabs
      aria-label="Secciones de Reservas"
      tabs={[
        { label: "Semana", to: "/admin/bookings", exact: true },
        { label: "Hoy · pasar lista", to: "/admin/pasar-lista" },
        { label: "Lista de espera", to: "/admin/bookings/waitlist", count: waiting },
      ]}
    />
  );
}
```

- [ ] **Step 3: Reemplazar `ClassPicker` por `WeekClassList` y `BookingsList` por la vista lista + detalle**

En `BookingsList.tsx`, agregar a los imports:

```tsx
import { useCallback, useEffect, useState } from "react";
import { addDays, format, getISOWeek, parseISO, startOfWeek } from "date-fns";
import { Check, MoreHorizontal, UserPlus, UserX } from "lucide-react";
import { FEATURES } from "@/config/features";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import MasterDetail from "@/components/admin/MasterDetail";
import WeekNav from "@/components/admin/WeekNav";
import DayStrip from "@/components/admin/DayStrip";
import StatusDot from "@/components/admin/StatusDot";
import { Avatar } from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SkeletonRow } from "@/components/app/AppShell";
import { hhmm } from "@/lib/today-roster";
import ReservasTabs from "./ReservasTabs";
```

(Quitar de los imports lo que deje de usarse al terminar: `SectionTabs`, `ArrowLeft`, `ChevronLeft`, `ChevronRight`, `Calendar`, `endOfWeek`, `addWeeks`, `subWeeks`; `tsc` avisa.)

Borrar `ClassPicker` (L917-1067) y `BookingsList` (L1070-1101) y poner en su lugar:

```tsx
type WeekClass = {
  id: string;
  date?: string;
  start_time: string;
  end_time?: string;
  class_type_name?: string;
  className?: string;
  instructor_name?: string | null;
  max_capacity?: number;
  current_bookings?: number;
  waitlist_count?: number;
};

const dateOf = (c: WeekClass) => c.date ?? String(c.start_time).split("T")[0];
const weekDayLabel = (d: Date) => format(d, "EEE", { locale: es }).replace(".", "").toUpperCase();

function WeekClassList({ weekStart, day, onDayChange, selectedId, onSelect }: {
  weekStart: Date; day: string; onDayChange: (d: string) => void; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const { data, isLoading, isError, refetch } = useQuery<{ data: WeekClass[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
  });
  const classes = Array.isArray(data?.data) ? data!.data : [];
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const nowHHMM = format(new Date(), "HH:mm");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, "yyyy-MM-dd");
    return { date: key, label: weekDayLabel(d), day: d.getDate(), count: classes.filter((c) => dateOf(c) === key).length };
  });
  const dayClasses = classes
    .filter((c) => dateOf(c) === day)
    .sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  const booked = dayClasses.reduce((s, c) => s + (Number(c.current_bookings) || 0), 0);
  const capacity = dayClasses.reduce((s, c) => s + (Number(c.max_capacity) || 0), 0);
  const title = format(parseISO(day), "EEEE d", { locale: es });

  return (
    <Panel aria-label="Clases de la semana" className="p-4">
      <DayStrip days={days} value={day} onChange={onDayChange} today={todayKey} />
      <div className="mt-4 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-extrabold capitalize">{title}{day === todayKey ? " · hoy" : ""}</h2>
        <span className="nums text-[13px] text-ink-muted">{booked}/{capacity} lugares</span>
      </div>
      {isError ? (
        <ErrorState title="No pudimos cargar la semana" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="mt-3 space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
      ) : dayClasses.length === 0 ? (
        <p className="px-1 py-6 text-sm text-ink-muted">
          {classes.length === 0 ? "No hay clases programadas esta semana" : "No hay clases este día."}
        </p>
      ) : (
        <ul className="mt-2">
          {dayClasses.map((c, i) => {
            const cap = Number(c.max_capacity) || 0;
            const taken = Number(c.current_bookings) || 0;
            const full = cap > 0 && taken >= cap;
            const past = day < todayKey || (day === todayKey && hhmm(c.end_time ?? c.start_time) <= nowHHMM);
            const selected = c.id === selectedId;
            const name = c.class_type_name ?? c.className ?? "Clase";
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[50px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3 py-3 text-left",
                    selected ? "bg-canvas ring-2 ring-inset ring-ink" : i > 0 && "border-t border-line",
                  )}
                >
                  <span className={cn("nums text-sm font-extrabold", past ? "text-ink-muted" : "text-ink")}>{hhmm(c.start_time)}</span>
                  <span className="min-w-0 leading-tight">
                    <span className={cn("block truncate text-sm font-extrabold", past ? "text-ink-muted" : "text-ink")}>{name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      con {c.instructor_name ?? "—"}{past ? " · terminó" : ""}
                      {Number(c.waitlist_count) > 0 ? ` · ${c.waitlist_count} en espera` : ""}
                    </span>
                  </span>
                  {full && !past ? (
                    <Badge variant="attention">Llena</Badge>
                  ) : (
                    <span className="nums text-[13px] font-bold text-ink-muted">{taken}/{cap}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const BookingsList = () => {
  const [classId, setClassId] = useSearchParamState("clase");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Si la clase del enlace es de otra semana, la lista se va a esa semana y día.
  const onClassLoaded = useCallback((date: string) => {
    setWeekStart(startOfWeek(parseISO(date), { weekStartsOn: 1 }));
    setDay(date);
  }, []);

  const changeWeek = (w: Date) => {
    setWeekStart(w);
    const today = new Date();
    const inWeek = today >= w && today < addDays(w, 7);
    setDay(format(inWeek ? today : w, "yyyy-MM-dd"));
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader kicker={`Reservas · semana ${getISOWeek(weekStart)}`} title="Reservas" actions={<ReservasTabs />} />
          <WeekNav weekStart={weekStart} onChange={changeWeek} />
          <MasterDetail
            hasSelection={!!classId}
            onBack={() => setClassId(null)}
            backLabel="Volver a la semana"
            list={<WeekClassList weekStart={weekStart} day={day} onDayChange={setDay} selectedId={classId} onSelect={setClassId} />}
            detail={
              classId ? (
                <ClassRoster key={classId} classId={classId} onBack={() => setClassId(null)} onClassLoaded={onClassLoaded} />
              ) : (
                <Panel className="px-6 py-10">
                  <p className="text-sm text-ink-muted">Elige una clase para ver su lista de alumnas.</p>
                </Panel>
              )
            }
          />
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};
```

- [ ] **Step 4: Rehacer el encabezado y los renglones de `ClassRoster`**

1. Firma: `function ClassRoster({ classId, onBack, onClassLoaded }: { classId: string; onBack: () => void; onClassLoaded?: (date: string) => void })`.
2. Después de `const roster = …` (L227), agregar:

```tsx
useEffect(() => {
  const d = classInfo?.date ? String(classInfo.date).slice(0, 10) : null;
  if (d) onClassLoaded?.(d);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [classInfo?.date]);
```

3. Borrar `backButton` (L369-376). Cambiar el retorno de error (L378-388) por:

```tsx
if (isError) {
  return (
    <Panel className="p-6">
      <ErrorState title="No pudimos cargar la clase" description="Puede que la hayan borrado o que el enlace sea viejo." onRetry={() => refetch()} />
      <Button variant="outline" onClick={onBack}>Elegir otra clase</Button>
    </Panel>
  );
}
```

4. Reemplazar el bloque L392-578 (botón volver, tarjeta de encabezado, contadores y lista) por:

```tsx
<Panel aria-label="Lista de la clase" className="overflow-hidden">
  {isLoading ? (
    <div className="p-6"><SkeletonRow height={72} /></div>
  ) : (
    <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
      <div className="min-w-0">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
          {classInfo?.startsAt ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es }) : classInfo?.date ?? "—"}
        </p>
        <h2 className="mt-2 font-display text-[1.375rem] font-semibold leading-tight text-ink">{classInfo?.classTypeName ?? "Clase"}</h2>
        <p className="mt-1 text-[13px] text-ink-muted">con {classInfo?.instructorName ?? "—"} · se actualiza sola cada 15 s</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setAssignOpen(true)}>
          <UserPlus size={16} aria-hidden="true" />
          Asignar socia
        </Button>
        {FEATURES.visits && (
          <Button variant="outline" onClick={() => setVisitOpen(true)}>Asignar visitante</Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Más acciones de la clase"><MoreHorizontal size={18} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => refetch()}>Actualizar</DropdownMenuItem>
            {confirmed + waitlist > 0 && (
              <DropdownMenuItem className="text-danger" onClick={handleCancelClass}>Cancelar clase</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )}

  <dl className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
    {([["Confirmadas", confirmed], ["Asistieron", checkedIn], ["En espera", waitlist], ["Faltas", noShow]] as const).map(([label, value], i) => (
      <div key={label} className={cn("px-5 py-3.5", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line lg:border-t-0", i > 0 && "lg:border-l")}>
        <dt className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</dt>
        <dd className="nums mt-1.5 font-display text-[1.375rem] font-semibold">{value}</dd>
      </div>
    ))}
  </dl>

  {isLoading ? (
    <div className="space-y-2 border-t border-line p-5"><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
  ) : roster.length === 0 ? (
    <p className="border-t border-line px-6 py-8 text-sm text-ink-muted">No hay reservas para esta clase</p>
  ) : (
    <ul>
      {roster.map((entry: RosterEntry) => {
        const canCheckin = entry.status === "confirmed" || entry.status === "waitlist";
        const canNoShow = entry.status === "confirmed";
        const canCancel = entry.status === "confirmed" || entry.status === "waitlist";
        const unlimited = entry.classesRemaining == null || entry.classesRemaining >= 9999;
        const plan = entry.planName
          ? `${entry.planName} · ${unlimited ? "Ilimitado" : `${entry.classesRemaining} ${entry.classesRemaining === 1 ? "restante" : "restantes"}`}`
          : "Sin plan";
        return (
          <li key={entry.bookingId} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 border-t border-line px-5 py-3 lg:grid-cols-[40px_minmax(0,1fr)_150px_auto] lg:gap-4 lg:px-6">
            {entry.status === "checked_in" ? (
              <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-success text-canvas"><Check size={18} /></span>
            ) : (
              <Avatar name={entry.displayName} size={40} />
            )}
            <span className="min-w-0 leading-snug">
              <span className="block truncate text-sm font-extrabold">{entry.displayName}</span>
              <span className="block truncate text-xs text-ink-muted">{[plan, entry.phone].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="col-start-2 lg:col-start-auto"><RosterStatus status={entry.status} /></span>
            <span className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1">
              {canCheckin && (
                <Button variant="outline" aria-label={`Check-in de ${entry.displayName}`} onClick={() => checkinMutation.mutate(entry.bookingId)} disabled={checkinMutation.isPending}>
                  <Check size={16} aria-hidden="true" />
                  Check-in
                </Button>
              )}
              {canNoShow && (
                <Button variant="ghost" aria-label={`Marcar falta de ${entry.displayName}`} onClick={() => noShowMutation.mutate(entry.bookingId)} disabled={noShowMutation.isPending}>
                  <UserX size={16} aria-hidden="true" />
                  Falta
                </Button>
              )}
              {canCancel && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Más acciones para ${entry.displayName}`}><MoreHorizontal size={18} /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleCancelBooking(entry)}>Cancelar reserva (devuelve crédito)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  )}

  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 lg:px-6">
    <p className="text-[13px] text-ink-muted">Cancelar una reserva devuelve el crédito, salvo que elijas lo contrario.</p>
    {confirmed + waitlist > 0 && (
      <Button variant="outline" className="border-danger text-danger hover:bg-sunken" onClick={handleCancelClass}>Cancelar clase</Button>
    )}
  </div>
</Panel>
```

Y, fuera de `ClassRoster` (arriba de la función), el estado de cada renglón:

```tsx
function RosterStatus({ status }: { status: string }) {
  if (status === "checked_in") return <StatusDot tone="success">Asistió</StatusDot>;
  if (status === "no_show") return <StatusDot tone="danger">No asistió</StatusDot>;
  if (status === "cancelled") return <StatusDot tone="muted">Cancelada</StatusDot>;
  if (status === "waitlist") return <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">Lista de espera</span>;
  return <StatusDot tone="ink">Confirmada</StatusDot>;
}
```

`statusConfig` (L51-57) queda sin uso: borrarlo.

5. En el Sheet de asignar socia, envolver la casilla "Llevará acompañante" (L595-608) en `{FEATURES.visits && ( … )}`.
6. Envolver `<VisitAssignDialog … />` (L893-898) en `{FEATURES.visits && ( … )}`.

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run src/pages/admin/bookings/BookingsList.test.tsx`
Expected: PASS.

- [ ] **Step 6: Comprobación estándar y commit**

```bash
git add src/pages/admin/bookings
git commit -m "feat(panel): Reservas con la semana y la lista de la clase lado a lado

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Reservas · Pasar lista

**Files:**
- Modify: `src/pages/admin/attendance/TodayAttendance.tsx` — se reemplaza el JSX (L119-309). **Se conservan** los tipos (L19-41, que se sustituyen por los de `@/lib/today-roster`), la consulta `["today-roster"]` (L56-63), `checkinMutation`, `noShowMutation`, `labelOf`, `isGuest`, `handleNoShow` y el reloj (L49-54). El botón de la cámara ya llegó en la Tarea 4.
- Test: `src/pages/admin/attendance/TodayAttendance.test.tsx`

**Interfaces:**
- Consumes: `splitDay`, `summarize`, `hhmm`, `minutesUntil`, `type TodayClass`, `type TodayRosterEntry` (Task 4); `ReservasTabs` (Task 5); `AdminPage`, `AdminPageHeader`, `Panel`, `Avatar`.

- [ ] **Step 1: Prueba que falla**

Crear `src/pages/admin/attendance/TodayAttendance.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/admin/CheckinScanner", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Pasar lista (cámara)" /> : null),
}));
import api from "@/lib/api";
import TodayAttendance from "./TodayAttendance";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const e = (id: string, status: string, name: string) =>
  ({ booking_id: id, status, checked_in_at: null, user_id: id, display_name: name, guest_name: null, phone: "5512345678" });
const clase = (id: string, start: string, end: string, type: string, cap: number, roster: object[]) =>
  ({ id, start_time: `${start}:00`, end_time: `${end}:00`, max_capacity: cap, class_type_name: type, instructor_name: "Fer", roster });
const DIA = [
  clase("c07", "07:00", "07:50", "Reformer Básico", 8, [e("a", "checked_in", "Ana Pérez")]),
  clase("c11", "11:00", "11:50", "Reformer Intermedio", 8, [e("d", "confirmed", "Camila Torres"), e("v", "checked_in", "Valeria Ruiz"), e("w", "waitlist", "Regina López")]),
  clase("c13", "13:00", "13:50", "Tower", 6, [e("t", "confirmed", "Sofía Gómez")]),
];

function montar(dia: object[] = DIA) {
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/admin/today-roster": { data: dia }, "/classes?start=": { data: [] } });
  renderAdmin(<TodayAttendance />, { route: "/admin/pasar-lista" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("reception");
});
afterEach(() => vi.useRealTimers());

describe("Pasar lista", () => {
  it("abre la siguiente clase y marca check-in con un tap", async () => {
    montar();
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    expect(within(actual).getByText("Empieza en 20 min")).toBeInTheDocument();
    expect(within(actual).getByText("Asistió")).toBeInTheDocument();
    expect(within(actual).getByText("Lista de espera")).toBeInTheDocument();
    fireEvent.click(within(actual).getByRole("button", { name: "Check-in de Camila Torres" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/d/check-in"));
  });

  it("las clases siguientes van plegadas y se abren", async () => {
    montar();
    const tower = await screen.findByRole("region", { name: "Tower 13:00" });
    expect(within(tower).queryByRole("button", { name: "Check-in de Sofía Gómez" })).toBeNull();
    fireEvent.click(within(tower).getByRole("button", { name: "Abrir lista de Tower" }));
    expect(within(tower).getByRole("button", { name: "Check-in de Sofía Gómez" })).toBeInTheDocument();
  });

  it("las que ya terminaron van al final", async () => {
    montar();
    const hechas = await screen.findByRole("region", { name: "Ya terminaron" });
    expect(within(hechas).getByText("Reformer Básico")).toBeInTheDocument();
  });

  it("marcar falta pide confirmación", async () => {
    montar();
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    fireEvent.click(within(actual).getByRole("button", { name: "Marcar falta de Camila Torres" }));
    fireEvent.click(await screen.findByRole("button", { name: "Marcar falta" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/d/no-show"));
  });

  it("la cámara se abre desde aquí", async () => {
    montar();
    fireEvent.click(await screen.findByRole("button", { name: /Escanear QR del pase/ }));
    expect(screen.getByRole("dialog", { name: "Pasar lista (cámara)" })).toBeInTheDocument();
  });

  it("sin clases, o con todas terminadas, lo dice", async () => {
    montar([]);
    expect(await screen.findByText("Hoy no hay clases")).toBeInTheDocument();
  });

  it("con todas terminadas no deja un bloque vacío", async () => {
    vi.setSystemTime(new Date(2026, 8, 25, 14, 0));
    montar();
    expect(await screen.findByText("Ya terminaron las clases de hoy.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/attendance/TodayAttendance.test.tsx` → FAIL.

- [ ] **Step 2: Reescribir el JSX de `TodayAttendance`**

1. Tipos: borrar `RosterEntry` y `ClassRow` (L19-41) e importar `import { hhmm, minutesUntil, splitDay, summarize, type TodayClass, type TodayRosterEntry } from "@/lib/today-roster";`. En el resto del archivo, `ClassRow` → `TodayClass` y `RosterEntry` → `TodayRosterEntry`. `counts()` e `isLive()` se borran (los reemplazan `summarize` y `minutesUntil`).
2. Imports nuevos: `AdminPage`, `AdminPageHeader` (`@/components/admin/AdminPage`), `Panel` (`@/components/admin/Panel`), `Avatar` (`@/components/admin/PersonCell`), `Badge` (`@/components/ui/badge`), `ReservasTabs` (`@/pages/admin/bookings/ReservasTabs`), íconos `Camera, Check, ChevronDown, RotateCcw, UserX`. Quitar `SectionTabs`.
3. Estado nuevo junto a `scanOpen`: `const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());` y

```tsx
const toggle = (id: string) =>
  setOpenIds((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
const clock = format(now, "HH:mm");
const { past, next, later } = splitDay(classes, clock);
```

4. Arriba del componente, la tarjeta de cada clase:

```tsx
type ClassCardProps = {
  cls: TodayClass;
  clock: string;
  open: boolean;
  onToggle?: () => void;
  current?: boolean;
  past?: boolean;
  mutating: boolean;
  labelOf: (r: TodayRosterEntry) => string;
  isGuest: (r: TodayRosterEntry) => boolean;
  onCheckin: (bookingId: string) => void;
  onNoShow: (r: TodayRosterEntry) => void;
};

function ClassCard({ cls, clock, open, onToggle, current = false, past = false, mutating, labelOf, isGuest, onCheckin, onNoShow }: ClassCardProps) {
  const s = summarize(cls);
  const mins = minutesUntil(hhmm(cls.start_time), clock);
  const name = cls.class_type_name;
  return (
    <section
      aria-label={`${name} ${hhmm(cls.start_time)}`}
      className={cn("rounded-2xl bg-surface", current ? "border-2 border-ink" : "border border-line", past && "opacity-70")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 lg:px-6">
        <span className="nums w-[76px] font-display text-[1.5rem] font-semibold leading-none">{hhmm(cls.start_time)}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-extrabold">{name}</p>
          <p className="text-[13px] text-ink-muted">con {cls.instructor_name} · cupo {s.booked}/{cls.max_capacity}</p>
        </div>
        {current && (
          <span className="rounded-full bg-ink px-2.5 py-1 text-[0.75rem] font-extrabold text-canvas">
            {mins <= 0 ? "En curso" : `Empieza en ${mins} min`}
          </span>
        )}
        {!past && s.full && <Badge variant="attention">Llena</Badge>}
        <span className="nums text-sm font-extrabold">
          {s.attended} {s.attended === 1 ? "asistió" : "asistieron"}
          {past
            ? s.noShow > 0 ? ` · ${s.noShow} ${s.noShow === 1 ? "falta" : "faltas"}` : ""
            : <> · <span className={s.pending > 0 ? "text-accent-strong" : undefined}>{s.pending} {s.pending === 1 ? "pendiente" : "pendientes"}</span></>}
        </span>
        {onToggle && (
          <Button variant="outline" size="icon" aria-expanded={open} aria-label={open ? `Cerrar lista de ${name}` : `Abrir lista de ${name}`} onClick={onToggle}>
            <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>
      {open && (
        cls.roster.length === 0 ? (
          <p className="border-t border-line px-6 py-4 text-sm text-ink-muted">Sin reservas para esta clase.</p>
        ) : (
          <ul className="grid border-t border-line px-5 lg:grid-cols-2 lg:gap-x-8 lg:px-6">
            {cls.roster.map((r) => (
              <li key={r.booking_id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Avatar name={labelOf(r)} size={40} />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate text-[15px] font-extrabold">
                    {labelOf(r)}
                    {isGuest(r) && r.host_name ? <span className="font-normal text-ink-muted"> (invitada de {r.host_name})</span> : null}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {r.phone ?? "—"}
                    {r.status === "no_show" && <span className="text-danger"> · No asistió</span>}
                  </span>
                </span>
                {r.status === "checked_in" ? (
                  <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-success px-4 text-sm font-extrabold text-canvas">
                    <Check size={16} aria-hidden="true" />Asistió
                  </span>
                ) : r.status === "waitlist" ? (
                  <span className="text-[13px] text-ink-muted">Lista de espera</span>
                ) : (
                  <span className="flex gap-1.5">
                    {r.status !== "no_show" && (
                      <Button variant="ghost" size="icon" aria-label={`Marcar falta de ${labelOf(r)}`} onClick={() => onNoShow(r)} disabled={mutating}>
                        <UserX size={18} />
                      </Button>
                    )}
                    <Button aria-label={`Check-in de ${labelOf(r)}`} onClick={() => onCheckin(r.booking_id)} disabled={mutating}>
                      <Check size={16} aria-hidden="true" />Check-in
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}
```

5. El retorno del componente (reemplaza L119-309):

```tsx
const mutating = checkinMutation.isPending || noShowMutation.isPending;
const cardProps = {
  clock, mutating, labelOf, isGuest,
  onCheckin: (id: string) => checkinMutation.mutate(id),
  onNoShow: handleNoShow,
};

return (
  <AuthGuard>
    <AdminLayout>
      <AdminPage>
        <AdminPageHeader
          kicker="Reservas · hoy"
          title="Pasar lista"
          subtitle="Marca asistencia con un tap. Se actualiza cada 30 segundos."
          actions={<ReservasTabs />}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={() => setScanOpen(true)}>
            <Camera size={16} aria-hidden="true" />
            Escanear QR del pase
          </Button>
          <Button variant="ghost" onClick={() => refetch()}>
            <RotateCcw size={16} aria-hidden="true" />
            Actualizar
          </Button>
          <div className="ml-auto text-right leading-tight">
            <p className="nums font-display text-[1.75rem] font-semibold">{clock}</p>
            <p className="text-[0.75rem] text-ink-muted">{format(now, "EEEE d 'de' MMMM", { locale: es })}</p>
          </div>
        </div>

        {isError ? (
          <ErrorState title="No pudimos cargar las clases de hoy" onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : classes.length === 0 ? (
          <EmptyState
            title="Hoy no hay clases"
            description="Cuando haya clases programadas para hoy, aquí podrás pasar lista con un tap."
            ctaLabel="Ver calendario de clases"
            ctaTo="/admin/classes"
          />
        ) : (
          <>
            {next ? (
              <ClassCard cls={next} open current {...cardProps} />
            ) : (
              <Panel className="px-6 py-5"><p className="text-sm font-bold">Ya terminaron las clases de hoy.</p></Panel>
            )}
            {later.map((c) => (
              <ClassCard key={c.id} cls={c} open={openIds.has(c.id)} onToggle={() => toggle(c.id)} {...cardProps} />
            ))}
            {past.length > 0 && (
              <section aria-label="Ya terminaron" className="flex flex-col gap-2.5">
                <h2 className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Ya terminaron</h2>
                {past.map((c) => (
                  <ClassCard key={c.id} cls={c} past open={openIds.has(c.id)} onToggle={() => toggle(c.id)} {...cardProps} />
                ))}
              </section>
            )}
          </>
        )}
        <CheckinScanner open={scanOpen} onOpenChange={setScanOpen} />
        {dialog}
      </AdminPage>
    </AdminLayout>
  </AuthGuard>
);
```

(Si el `EmptyState` de hoy no usa exactamente esos textos, conservar los del archivo actual: "Hoy no hay clases" / "Cuando haya clases programadas para hoy, aquí podrás pasar lista con un tap." / "Ver calendario de clases".)

- [ ] **Step 3: Correr las pruebas**

Run: `npx vitest run src/pages/admin/attendance/TodayAttendance.test.tsx`
Expected: PASS.

- [ ] **Step 4: Comprobación estándar y commit**

```bash
git add src/pages/admin/attendance
git commit -m "feat(panel): Pasar lista con la clase actual abierta y la cámara a la mano

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Reservas · Lista de espera

**Files:**
- Modify: `src/pages/admin/bookings/Waitlist.tsx` (reescritura completa: hoy es un selector de clases y una vista de detalle alternas)
- Test: `src/pages/admin/bookings/Waitlist.test.tsx`

**Interfaces:**
- Consumes: `waitlist_count` (Task 3), `ReservasTabs` (Task 5), `useSearchParamState`, `MasterDetail`, `WeekNav`, `Panel`, `PersonCell`, `waLink`, `hhmm`.

- [ ] **Step 1: Prueba que falla**

Crear `src/pages/admin/bookings/Waitlist.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import Waitlist from "./Waitlist";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const clase = (id: string, time: string, name: string, waitlist: number) =>
  ({ id, date: "2026-09-25", start_time: `2026-09-25T${time}:00`, class_type_name: name, instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: waitlist });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
});
afterEach(() => vi.useRealTimers());

describe("Lista de espera", () => {
  it("sólo lista las clases con gente esperando y muestra el orden", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/classes?start=": { data: [clase("c07", "07:00", "Reformer Básico", 0), clase("c11", "11:00", "Reformer Intermedio", 2)] },
      "/classes/c11/roster": { data: {
        class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25" },
        roster: [
          { bookingId: "b1", status: "confirmed", displayName: "Camila Torres", email: "c@x.com", phone: null, planName: "Paquete 8", classesRemaining: 3 },
          { bookingId: "b2", status: "waitlist", displayName: "Regina López", email: "regi@x.com", phone: "5578901234", planName: "Paquete 8", classesRemaining: 4 },
          { bookingId: "b3", status: "waitlist", displayName: "Paula Herrera", email: "pau@x.com", phone: null, planName: "Paquete 4", classesRemaining: 1 },
        ] } },
    });
    renderAdmin(<Waitlist />, { route: "/admin/bookings/waitlist" });
    const lista = await screen.findByRole("region", { name: "Clases con lista de espera" });
    expect(within(lista).queryByText("Reformer Básico")).toBeNull();
    fireEvent.click(await within(lista).findByRole("button", { name: /Reformer Intermedio/ }));

    const detalle = await screen.findByRole("region", { name: "Quién espera" });
    expect(await within(detalle).findByText("Regina López")).toBeInTheDocument();
    expect(within(detalle).queryByText("Camila Torres")).toBeNull();
    expect(within(detalle).getByRole("link", { name: "WhatsApp a Regina López" })).toHaveAttribute("href", "https://wa.me/525578901234");
    expect(within(detalle).queryByRole("link", { name: "WhatsApp a Paula Herrera" })).toBeNull();
    expect(within(detalle).getByRole("link", { name: /Abrir en Reservas/ })).toHaveAttribute("href", "/admin/bookings?clase=c11");
    expect(screen.getByTestId("location").textContent).toBe("/admin/bookings/waitlist?clase=c11");
  });

  it("sin espera en la semana lo dice", async () => {
    routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/classes?start=": { data: [clase("c07", "07:00", "Reformer Básico", 0)] } });
    renderAdmin(<Waitlist />, { route: "/admin/bookings/waitlist" });
    expect(await screen.findByText("Nadie en lista de espera esta semana.")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/bookings/Waitlist.test.tsx` → FAIL.

- [ ] **Step 2: Reescribir `Waitlist.tsx`**

Reemplazar el archivo completo:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, getISOWeek, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import MasterDetail from "@/components/admin/MasterDetail";
import WeekNav from "@/components/admin/WeekNav";
import PersonCell from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { waLink } from "@/lib/phone";
import { hhmm } from "@/lib/today-roster";
import { cn } from "@/lib/utils";
import ReservasTabs from "./ReservasTabs";

type WeekClass = {
  id: string; date?: string; start_time: string; class_type_name?: string; className?: string;
  instructor_name?: string | null; waitlist_count?: number;
};
type WaitEntry = {
  bookingId: string; status: string; displayName: string; email?: string | null; phone?: string | null;
  planName?: string | null; classesRemaining?: number | null;
};

const dateOf = (c: WeekClass) => c.date ?? String(c.start_time).split("T")[0];

const Waitlist = () => {
  const [classId, setClassId] = useSearchParamState("clase");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const classesQ = useQuery<{ data: WeekClass[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
  });
  const waiting = (Array.isArray(classesQ.data?.data) ? classesQ.data!.data : [])
    .filter((c) => (Number(c.waitlist_count) || 0) > 0)
    .sort((a, b) => `${dateOf(a)} ${hhmm(a.start_time)}`.localeCompare(`${dateOf(b)} ${hhmm(b.start_time)}`));

  const rosterQ = useQuery<{ data: { class?: { classTypeName?: string; startsAt?: string; date?: string }; roster?: WaitEntry[] } }>({
    queryKey: ["waitlist-roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    enabled: !!classId,
    refetchInterval: 15_000,
  });
  const classInfo = rosterQ.data?.data?.class ?? null;
  const people = (rosterQ.data?.data?.roster ?? []).filter((r) => r.status === "waitlist");

  const list = (
    <Panel aria-label="Clases con lista de espera" className="p-2">
      {classesQ.isError ? (
        <div className="px-4"><ErrorState title="No pudimos cargar la semana" onRetry={() => classesQ.refetch()} /></div>
      ) : classesQ.isLoading ? (
        <div className="space-y-2 p-3"><SkeletonRow /><SkeletonRow /></div>
      ) : waiting.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted">Nadie en lista de espera esta semana.</p>
      ) : (
        <ul>
          {waiting.map((c, i) => {
            const selected = c.id === classId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setClassId(c.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3.5 py-3.5 text-left",
                    selected ? "bg-canvas ring-2 ring-inset ring-ink" : i > 0 && "border-t border-line",
                  )}
                >
                  <span className="min-w-0 leading-snug">
                    <span className="nums block text-[0.75rem] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
                      {format(parseISO(dateOf(c)), "EEE d", { locale: es }).replace(".", "")} · {hhmm(c.start_time)}
                    </span>
                    <span className="block truncate text-[15px] font-extrabold">{c.class_type_name ?? c.className ?? "Clase"}</span>
                    <span className="block truncate text-xs text-ink-muted">con {c.instructor_name ?? "—"} · llena</span>
                  </span>
                  <Badge variant="attention">{c.waitlist_count} en espera</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  const detail = classId ? (
    <Panel aria-label="Quién espera" className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
            {classInfo?.startsAt ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es }) : classInfo?.date ?? "—"}
          </p>
          <h2 className="mt-2 font-display text-[1.375rem] font-semibold leading-tight">{classInfo?.classTypeName ?? "Clase"}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Llena · se actualiza sola cada 15 s</p>
        </div>
        <Link to={`/admin/bookings?clase=${classId}`} className={cn(buttonVariants({ variant: "outline" }), "no-underline")}>
          Abrir en Reservas
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {rosterQ.isError ? (
        <div className="px-6"><ErrorState onRetry={() => rosterQ.refetch()} /></div>
      ) : rosterQ.isLoading ? (
        <div className="space-y-2 p-5"><SkeletonRow /><SkeletonRow /></div>
      ) : people.length === 0 ? (
        <p className="border-t border-line px-6 py-6 text-sm text-ink-muted">No hay clientas en lista de espera</p>
      ) : (
        <ol>
          {people.map((p, i) => {
            const wa = waLink(p.phone);
            const unlimited = p.classesRemaining == null || p.classesRemaining >= 9999;
            return (
              <li key={p.bookingId} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-t border-line px-5 py-4 lg:grid-cols-[56px_minmax(0,1fr)_200px_auto] lg:px-6">
                <span className="nums text-center font-display text-[1.75rem] font-semibold leading-none" aria-label={`Posición ${i + 1}`}>{i + 1}</span>
                <PersonCell name={p.displayName} sub={[p.email, p.phone].filter(Boolean).join(" · ")} size={40} />
                <span className="hidden text-[13px] text-ink-muted lg:block">
                  {p.planName ? `${p.planName} · ${unlimited ? "Ilimitado" : `${p.classesRemaining} clases`}` : "Sin plan"}
                </span>
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${p.displayName}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-ink">
                    <MessageCircle size={18} aria-hidden="true" />
                  </a>
                ) : <span className="w-11" />}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  ) : (
    <Panel className="px-6 py-10"><p className="text-sm text-ink-muted">Elige una clase para ver quién espera lugar.</p></Panel>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker={`Reservas · semana ${getISOWeek(weekStart)}`}
            title="Lista de espera"
            subtitle="Quién espera lugar en las clases llenas de la semana, en orden."
            actions={<ReservasTabs />}
          />
          <WeekNav weekStart={weekStart} onChange={(w) => { setWeekStart(w); setClassId(null); }} />
          <MasterDetail hasSelection={!!classId} onBack={() => setClassId(null)} list={list} detail={detail} />
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Waitlist;
```

- [ ] **Step 3: Correr las pruebas**

Run: `npx vitest run src/pages/admin/bookings/Waitlist.test.tsx`
Expected: PASS.

- [ ] **Step 4: Comprobación estándar y commit**

```bash
git add src/pages/admin/bookings/Waitlist.tsx src/pages/admin/bookings/Waitlist.test.tsx
git commit -m "feat(panel): Lista de espera de toda la semana como pestaña de Reservas

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Clases · Calendario por horas

**Files:**
- Create: `src/pages/admin/classes/WeekHourGrid.tsx`, `src/pages/admin/classes/WeekHourGrid.test.tsx`, `src/pages/admin/classes/ClassesCalendar.test.tsx`
- Modify: `src/pages/admin/classes/ClassesCalendar.tsx`:
  - encabezado del componente principal (L94-118);
  - navegación de semana (L404-426);
  - aviso de semana vacía (L429-446);
  - rama de escritorio de la cuadrícula (L555-629);
  - encabezado del Sheet (L692-716);
  - enlace "Gestionar en Reservas" (L818-823);
  - control de Wellhub (L827-831).
  
  **Se conservan** la rama de celular (L448-554), el diálogo de crear/editar (L632-687), las mutaciones, `openCreate`, `openEdit`, `shiftWeek`, los manejadores y el resto del Sheet (cupo −/+, Inscritas, acciones).

**Interfaces:**
- Consumes: `AdminPage`, `AdminPageHeader`, `SectionTabs` (con `aria-label`), `CLASSES_SECTION_TABS`, `resolveClassColor`, `Badge`, `FEATURES`.
- Produces (`WeekHourGrid.tsx`):
  - `type GridClass = { id: string; classTypeName?: string; classTypeColor?: string; instructorName?: string; startTime: string; endTime: string; maxCapacity: number; currentBookings?: number; bookedCount?: number; isCancelled: boolean; isClosed: boolean }` (compatible con `ClassInstance` del calendario)
  - `HOUR_PX = 52`
  - `hourRange(classes: GridClass[]): { from: number; to: number }`
  - `placeBlocks(classes: GridClass[], fromHour: number): { cls: GridClass; top: number; height: number; lane: number; lanes: number }[]`
  - `WeekHourGrid({ days: Date[], classes: GridClass[], now: Date, selectedId?: string | null, onSelect: (c: GridClass) => void, onCreate: (date: string) => void })`

- [ ] **Step 1: Pruebas de la cuadrícula**

Crear `src/pages/admin/classes/WeekHourGrid.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WeekHourGrid, { HOUR_PX, hourRange, placeBlocks, type GridClass } from "./WeekHourGrid";

const g = (id: string, start: string, end: string, extra: Partial<GridClass> = {}): GridClass => ({
  id, classTypeName: id, instructorName: "Fer", startTime: `2026-09-25T${start}:00`, endTime: `2026-09-25T${end}:00`,
  maxCapacity: 8, currentBookings: 3, isCancelled: false, isClosed: false, ...extra,
});

describe("hourRange", () => {
  it("de 7 a 21 por defecto y se abre si hay clases fuera", () => {
    expect(hourRange([])).toEqual({ from: 7, to: 21 });
    expect(hourRange([g("a", "06:00", "06:50")]).from).toBe(6);
    expect(hourRange([g("a", "21:30", "22:20")]).to).toBe(23);
  });
});

describe("placeBlocks", () => {
  it("posición y alto según la hora", () => {
    const [p] = placeBlocks([g("a", "11:00", "11:50")], 7);
    expect(p.top).toBe(4 * HOUR_PX + 2);
    expect(p.height).toBeCloseTo((50 / 60) * HOUR_PX - 4);
    expect(p.lanes).toBe(1);
  });
  it("dos clases a la misma hora van lado a lado", () => {
    const ps = placeBlocks([g("a", "11:00", "11:50"), g("b", "11:00", "11:50"), g("c", "13:00", "13:50")], 7);
    const byId = Object.fromEntries(ps.map((p) => [p.cls.id, p]));
    expect([byId.a.lane, byId.b.lane].sort()).toEqual([0, 1]);
    expect(byId.a.lanes).toBe(2);
    expect(byId.c.lanes).toBe(1);
  });
  it("una hora de fin inválida no rompe el acomodo", () => {
    const [p] = placeBlocks([g("a", "11:00", "11:50", { endTime: "" })], 7);
    expect(p.height).toBeGreaterThan(20);
  });
});

describe("WeekHourGrid", () => {
  const days = [new Date(2026, 8, 25)];
  it("sobrecupo: se marca llena sin tronar; cancelada lo dice", () => {
    const onSelect = vi.fn();
    render(
      <WeekHourGrid
        days={days}
        now={new Date(2026, 8, 25, 10, 40)}
        classes={[g("Reformer Intermedio", "11:00", "11:50", { currentBookings: 9 }), g("Mat", "20:00", "20:50", { isCancelled: true })]}
        onSelect={onSelect}
        onCreate={() => {}}
      />,
    );
    const llena = screen.getByRole("button", { name: /Reformer Intermedio.*9 de 8, llena/ });
    expect(llena).toHaveTextContent("11:00 · Llena");
    fireEvent.click(llena);
    expect(onSelect).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Mat.*cancelada/ })).toHaveTextContent("Cancelada");
  });
  it("el + del día crea una clase en esa fecha", () => {
    const onCreate = vi.fn();
    render(<WeekHourGrid days={days} now={new Date(2026, 8, 25, 10, 40)} classes={[]} onSelect={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /Nueva clase el viernes 25/ }));
    expect(onCreate).toHaveBeenCalledWith("2026-09-25");
  });
});
```

Run: `npx vitest run src/pages/admin/classes/WeekHourGrid.test.tsx` → FAIL (no existe el módulo).

- [ ] **Step 2: Escribir `WeekHourGrid.tsx`**

```tsx
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveClassColor } from "./palette";

export type GridClass = {
  id: string;
  classTypeName?: string;
  classTypeColor?: string;
  instructorName?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  currentBookings?: number;
  bookedCount?: number;
  isCancelled: boolean;
  isClosed: boolean;
};

export const HOUR_PX = 52;

const minutesOf = (iso: string): number => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NaN : d.getHours() * 60 + d.getMinutes();
};

/** De 7 a 21 por defecto; se abre si hay clases antes o después (entre 5 y 24). */
export function hourRange(classes: GridClass[]): { from: number; to: number } {
  let from = 7;
  let to = 21;
  for (const c of classes) {
    const s = minutesOf(c.startTime);
    const e = minutesOf(c.endTime);
    if (Number.isFinite(s)) from = Math.min(from, Math.floor(s / 60));
    if (Number.isFinite(e)) to = Math.max(to, Math.ceil(e / 60));
  }
  from = Math.max(5, from);
  return { from, to: Math.min(24, Math.max(to, from + 1)) };
}

type Placed = { cls: GridClass; top: number; height: number; lane: number; lanes: number };

/** Posiciona las clases de un día. Las que se enciman van en carriles lado a lado. */
export function placeBlocks(classes: GridClass[], fromHour: number): Placed[] {
  const sorted = [...classes]
    .filter((c) => Number.isFinite(minutesOf(c.startTime)))
    .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => { p.lanes = lanes; });
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const c of sorted) {
    const s = minutesOf(c.startTime);
    const rawEnd = minutesOf(c.endTime);
    const e = Number.isFinite(rawEnd) && rawEnd > s ? rawEnd : s + 50;
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else { laneEnds[lane] = e; }
    const p: Placed = {
      cls: c,
      top: ((s - fromHour * 60) / 60) * HOUR_PX + 2,
      height: Math.max(28, ((e - s) / 60) * HOUR_PX - 4),
      lane,
      lanes: 1,
    };
    placed.push(p);
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

function ClassBlock({ p, now, selected, onSelect }: { p: Placed; now: Date; selected: boolean; onSelect: (c: GridClass) => void }) {
  const c = p.cls;
  const cap = Math.max(0, Number(c.maxCapacity) || 0);
  const booked = c.currentBookings ?? c.bookedCount ?? 0;
  const full = !c.isCancelled && cap > 0 && booked >= cap;
  const endDate = new Date(c.endTime);
  const past = !Number.isNaN(endDate.getTime()) && endDate < now;
  const name = c.classTypeName ?? "Clase";
  const start = format(new Date(c.startTime), "HH:mm");
  const end = Number.isNaN(endDate.getTime()) ? "" : format(endDate, "HH:mm");
  const second = c.isCancelled ? "Cancelada" : c.isClosed ? `${start} · Cerrada` : full ? `${start} · Llena` : `${start} · ${c.instructorName ?? "—"}`;
  const label = [
    name,
    format(new Date(c.startTime), "EEEE d", { locale: es }),
    end ? `${start} a ${end}` : start,
    `${booked} de ${cap}`,
    full && "llena",
    c.isCancelled && "cancelada",
    c.isClosed && "cerrada",
  ].filter(Boolean).join(", ");
  const width = 100 / p.lanes;
  const tone = c.isCancelled
    ? "border border-dashed border-line-strong bg-surface text-ink-muted"
    : full
      ? "border border-accent bg-accent text-ink"
      : "border border-line bg-canvas text-ink";
  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      aria-label={label}
      aria-pressed={selected}
      className={cn("absolute overflow-hidden rounded-lg px-2 py-1 text-left leading-tight", tone, past && !selected && "opacity-60", selected && "z-10 ring-2 ring-ink")}
      style={{ top: p.top, height: p.height, left: `calc(${p.lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className={cn("truncate text-[0.75rem] font-extrabold", c.isCancelled && "line-through")}>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: resolveClassColor(c.classTypeColor) }} />
          {name}
        </span>
        {!c.isCancelled && <span className="nums shrink-0 text-[0.75rem] font-extrabold">{booked}/{cap}</span>}
      </span>
      <span className={cn("block truncate text-[0.75rem] font-semibold", full ? "text-ink" : "text-ink-muted")}>{second}</span>
      {!c.isCancelled && !full && cap > 0 && (
        <span aria-hidden="true" className="absolute bottom-1 left-2 right-2 h-[3px] rounded bg-line">
          <span className="block h-full rounded bg-ink" style={{ width: `${Math.min(100, Math.round((booked / cap) * 100))}%` }} />
        </span>
      )}
    </button>
  );
}

type WeekHourGridProps = {
  days: Date[];
  classes: GridClass[];
  now: Date;
  selectedId?: string | null;
  onSelect: (c: GridClass) => void;
  onCreate: (date: string) => void;
};

/* Calendario semanal por horas (spec §5.5). Cada clase es un bloque a la
   altura de su hora; llena = coral con la palabra "Llena"; la línea de la hora
   actual cruza la columna de hoy. */
export default function WeekHourGrid({ days, classes, now, selectedId, onSelect, onCreate }: WeekHourGridProps) {
  const { from, to } = hourRange(classes);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = (to - from) * HOUR_PX + 6;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMin - from * 60) / 60) * HOUR_PX;
  const nowVisible = nowMin >= from * 60 && nowMin <= to * 60 && days.some((d) => isSameDay(d, now));

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line">
          <div />
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const today = isSameDay(d, now);
            const count = classes.filter((c) => isSameDay(new Date(c.startTime), d) && !c.isCancelled).length;
            return (
              <div key={key} className="flex items-center gap-2 border-l border-line px-2.5 py-2">
                <span className={cn("nums grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-extrabold", today ? "bg-ink text-canvas" : "text-ink")}>
                  {d.getDate()}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn("block text-[0.75rem] font-extrabold uppercase tracking-[0.1em]", today ? "text-ink" : "text-ink-muted")}>
                    {format(d, "EEE", { locale: es }).replace(".", "")}{today ? " · hoy" : ""}
                  </span>
                  <span className="block text-[0.75rem] text-ink-muted">{count} {count === 1 ? "clase" : "clases"}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Nueva clase el ${format(d, "EEEE d", { locale: es })}`}
                  onClick={() => onCreate(key)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
                >
                  <Plus size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height }}>
          <div className="relative">
            {hours.slice(1).map((h) => (
              <span key={h} className="nums absolute right-2.5 text-[0.75rem] text-ink-muted" style={{ top: (h - from) * HOUR_PX - 8 }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {nowVisible && (
              <span className="nums absolute right-1 z-20 rounded-full bg-ink px-1.5 text-[0.75rem] font-extrabold text-canvas" style={{ top: nowTop - 10 }}>
                {format(now, "HH:mm")}
              </span>
            )}
          </div>
          {days.map((d) => {
            const placed = placeBlocks(classes.filter((c) => isSameDay(new Date(c.startTime), d)), from);
            const today = isSameDay(d, now);
            return (
              <div key={format(d, "yyyy-MM-dd")} className="relative border-l border-line">
                {placed.map((p) => (
                  <ClassBlock key={p.cls.id} p={p} now={now} selected={p.cls.id === selectedId} onSelect={onSelect} />
                ))}
                {today && nowVisible && (
                  <div aria-hidden="true" className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-ink" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-ink" />
                  </div>
                )}
              </div>
            );
          })}
          {hours.slice(1).map((h) => (
            <div key={h} aria-hidden="true" className="pointer-events-none absolute left-14 right-0 h-px bg-line" style={{ top: (h - from) * HOUR_PX }} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

Run: `npx vitest run src/pages/admin/classes/WeekHourGrid.test.tsx` → PASS.

- [ ] **Step 3: Prueba del calendario**

Crear `src/pages/admin/classes/ClassesCalendar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClassesCalendar from "./ClassesCalendar";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [] },
    "/instructors": { data: [] },
    "/classes?start=": { data: [{
      id: "c11", class_type_id: "t1", class_type_name: "Reformer Intermedio", instructor_id: "i1", instructor_name: "Fer",
      start_time: "2026-09-25T11:00:00", end_time: "2026-09-25T11:50:00", max_capacity: 8, current_bookings: 8, status: "scheduled",
    }] },
    "/classes/c11/roster": { data: { class: {}, roster: [{ status: "waitlist", displayName: "Regina López" }] } },
  });
});
afterEach(() => vi.useRealTimers());

describe("Clases · Calendario", () => {
  it("al tocar una clase abre su panel con el resumen, sin Wellhub y con enlace directo a Reservas", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    expect(await screen.findByRole("heading", { level: 1, name: "Clases" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Reformer Intermedio.*8 de 8, llena/ }));
    expect(await screen.findByText("Llena · 8/8")).toBeInTheDocument();
    expect(await screen.findByText("1 en espera")).toBeInTheDocument();
    expect(screen.queryByText("Wellhub")).toBeNull();
    expect(screen.getByText("Gestionar en Reservas").closest("a")).toHaveAttribute("href", "/admin/bookings?clase=c11");
  });

  it("muestra el resumen de la semana y las acciones", async () => {
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    // El resumen va en varios <span>: se compara el texto completo del contenedor.
    expect(await screen.findByText((_, el) => el?.textContent === "1 clases · 8 reservas · 100% ocupación")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Limpiar semana" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Generar semana" })).toHaveAttribute("href", "/admin/class-generator");
    expect(screen.getByRole("button", { name: /Nueva clase$/ })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/classes/ClassesCalendar.test.tsx` → FAIL.

- [ ] **Step 4: Cambios en `ClassesCalendar.tsx`**

1. Imports: agregar `startOfWeek` a `date-fns` si falta; `AdminPage`, `AdminPageHeader` (`@/components/admin/AdminPage`); `FEATURES` (`@/config/features`); `WeekHourGrid` (`./WeekHourGrid`).

2. Componente principal (L94-118): cambiar el contenedor `div.admin-page max-w-6xl`, `SectionTabs` y el `h1` por:

```tsx
<AdminPage>
  <AdminPageHeader
    kicker="Clases · calendario semanal"
    title="Clases"
    actions={<SectionTabs aria-label="Secciones de Clases" tabs={CLASSES_SECTION_TABS} />}
  />
  {/* ErrorState o <CalendarView …/>: igual que hoy */}
</AdminPage>
```

3. Navegación de semana (L404-426) → barra con resumen y acciones:

```tsx
{(() => {
  const active = classes.filter((c) => !c.isCancelled);
  const bookedTotal = active.reduce((s, c) => s + (c.currentBookings ?? c.bookedCount ?? 0), 0);
  const capTotal = active.reduce((s, c) => s + (c.maxCapacity ?? 0), 0);
  const occ = capTotal ? Math.round((bookedTotal / capTotal) * 100) : 0;
  const today = new Date();
  const todayInWeek = today >= weekStart && today < addDays(weekStart, 7);
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => shiftWeek(-7)}><ChevronLeft size={18} /></Button>
      <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => shiftWeek(7)}><ChevronRight size={18} /></Button>
      <span className="nums ml-1 text-base font-extrabold text-ink">{weekLabel}</span>
      <Button
        variant="ghost"
        className="underline"
        onClick={() => {
          setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
          if (isMobile) setMobileDay(format(today, "yyyy-MM-dd"));
        }}
      >
        Hoy
      </Button>
      <span className="text-[13px] text-ink-muted">
        <span className="nums">{active.length}</span> clases · <span className="nums">{bookedTotal}</span> reservas · <span className="nums">{occ}%</span> ocupación
      </span>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          variant="ghost"
          className="text-danger"
          onClick={handleClearWeek}
          disabled={clearWeekMutation.isPending || classes.length === 0}
        >
          {clearWeekMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
          Limpiar semana
        </Button>
        <Button asChild variant="outline"><Link to="/admin/class-generator">Generar semana</Link></Button>
        <Button onClick={() => openCreate(format(todayInWeek ? today : weekStart, "yyyy-MM-dd"))}>
          <Plus size={16} aria-hidden="true" />
          Nueva clase
        </Button>
      </div>
    </div>
  );
})()}
```

4. Aviso de semana vacía (L429-446): se queda en su lugar (arriba del calendario), con estas clases en el contenedor: `mb-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:justify-between`. Se borra el botón "Generar semana" de dentro del aviso, porque ya está en la barra. Queda el texto "Semana sin clases" / "Genera la semana con la plantilla del estudio o toca un día para crear una clase.". El calendario se sigue viendo debajo.

5. Rama de escritorio (el bloque `) : (` … `)}` de L555-629) → reemplazarla completa por:

```tsx
) : (
  isLoadingClasses ? (
    <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-[480px] w-full" /></div>
  ) : (
    <WeekHourGrid
      days={days}
      classes={classes}
      now={new Date()}
      selectedId={sheetOpen ? selectedClass?.id ?? null : null}
      onSelect={(c) => { setSelectedClass(c as ClassInstance); setSheetOpen(true); }}
      onCreate={openCreate}
    />
  )
)}
```

(`DAYS_ES` y `classTint` pueden quedar sin uso en escritorio; si `tsc`/ESLint marcan un import sin uso, quitarlo.)

6. Encabezado del Sheet (L692-716: `SheetHeader`, bloque de instructora con avatar y la línea "Inicio:") → reemplazar por:

```tsx
<SheetHeader>
  <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
    {selectedClass?.startTime
      ? `${format(new Date(selectedClass.startTime), "EEEE d · HH:mm", { locale: es })}${selectedClass.endTime ? `–${format(new Date(selectedClass.endTime), "HH:mm")}` : ""}`
      : "Sin hora"}
  </p>
  <SheetTitle className="font-display text-xl font-semibold">{selectedClass?.classTypeName ?? "Clase"}</SheetTitle>
</SheetHeader>
{selectedClass && (() => {
  const booked = selectedClass.currentBookings ?? selectedClass.bookedCount ?? 0;
  const cap = selectedClass.maxCapacity ?? selectedClass.capacity ?? 0;
  const full = cap > 0 && booked >= cap;
  const waiting = ((rosterData?.roster ?? []) as { status: string }[]).filter((r) => r.status === "waitlist").length;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink-muted">con {selectedClass.instructorName ?? "—"}</span>
      {full ? <Badge variant="attention">Llena · {booked}/{cap}</Badge> : <span className="nums text-sm font-bold">{booked}/{cap}</span>}
      {waiting > 0 && <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{waiting} en espera</span>}
    </div>
  );
})()}
```

(`rosterData` es el que ya calcula la L149 para "Inscritas"; si ahí se llama distinto, usar ese nombre. La lista de "Inscritas" sigue igual más abajo.)

7. Enlace (L818-823): `<Link to={`/admin/bookings?clase=${selectedClass.id}`}>`.
8. Wellhub (L827-831): la condición pasa a `{!selectedClass.isCancelled && FEATURES.partnerPlatforms && ( … )}`.

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run src/pages/admin/classes/`
Expected: PASS (WeekHourGrid y ClassesCalendar).

- [ ] **Step 6: Comprobación estándar y commit**

```bash
git add src/pages/admin/classes
git commit -m "feat(panel): calendario de clases por horas con resumen de la semana

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Clases · Tipos de clase y Generar

**Files:**
- Modify: `src/pages/admin/classes/ClassTypesList.tsx` (encabezado L167-179, tabla L235-287, diálogo L291-363); `src/pages/admin/classes/GenerateClasses.tsx` (JSX L174-502, más una validación)
- Create: `src/pages/admin/classes/generate-helpers.ts`
- Test: `src/pages/admin/classes/ClassTypesList.test.tsx`, `src/pages/admin/classes/generate-helpers.test.ts`, `src/pages/admin/classes/GenerateClasses.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminPageHeader`, `SectionTabs`, `CLASSES_SECTION_TABS`, `Panel`, `StatusDot`, `FEATURES`.
- Produces (`generate-helpers.ts`):
  - `validateGenerate(input: { startTime: string; endTime: string; maxCapacity: number | string }): { time: string | null; capacity: string | null }`
  - `previewMonths(dates: Date[]): { key: string; label: string; cells: (Date | null)[] }[]` — meses con celdas de lunes a domingo; `null` = hueco.

- [ ] **Step 1: Pruebas de los ayudantes de Generar**

Crear `src/pages/admin/classes/generate-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { previewMonths, validateGenerate } from "./generate-helpers";

describe("validateGenerate", () => {
  it("la hora de fin va después de la de inicio", () => {
    expect(validateGenerate({ startTime: "13:00", endTime: "13:00", maxCapacity: 6 }).time).toBe("La hora de fin debe ser después de la de inicio.");
    expect(validateGenerate({ startTime: "13:00", endTime: "12:00", maxCapacity: 6 }).time).not.toBeNull();
    expect(validateGenerate({ startTime: "13:00", endTime: "13:50", maxCapacity: 6 }).time).toBeNull();
  });
  it("el cupo es de al menos 1", () => {
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: 0 }).capacity).toBe("El cupo debe ser de al menos 1.");
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: "" }).capacity).not.toBeNull();
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: "6" }).capacity).toBeNull();
  });
});

describe("previewMonths", () => {
  it("arma cada mes de lunes a domingo con huecos al inicio", () => {
    const [sep] = previewMonths([new Date(2026, 8, 29), new Date(2026, 8, 30)]);
    expect(sep.label).toBe("septiembre 2026");
    // 1 de septiembre de 2026 es martes: un hueco (lunes) antes.
    expect(sep.cells[0]).toBeNull();
    expect(sep.cells[1]?.getDate()).toBe(1);
  });
  it("un rango que cruza meses da dos meses; sin fechas, ninguno", () => {
    expect(previewMonths([new Date(2026, 8, 30), new Date(2026, 9, 1)]).map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
    expect(previewMonths([])).toEqual([]);
  });
});
```

Run: `npx vitest run src/pages/admin/classes/generate-helpers.test.ts` → FAIL.

- [ ] **Step 2: Escribir `generate-helpers.ts`**

```ts
import { endOfMonth, format, getDay, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";

/** Reglas que hoy no se validan (spec §5.7): fin después de inicio y cupo ≥ 1. */
export function validateGenerate(input: { startTime: string; endTime: string; maxCapacity: number | string }) {
  const time = input.startTime && input.endTime && input.endTime <= input.startTime
    ? "La hora de fin debe ser después de la de inicio."
    : null;
  const cap = Number(input.maxCapacity);
  const capacity = input.maxCapacity === "" || !Number.isFinite(cap) || cap < 1 ? "El cupo debe ser de al menos 1." : null;
  return { time, capacity };
}

/** Meses que tocan las fechas, cada uno en celdas de lunes a domingo (null = hueco). */
export function previewMonths(dates: Date[]) {
  const keys = [...new Set(dates.map((d) => format(d, "yyyy-MM")))].sort();
  return keys.map((key) => {
    const [y, m] = key.split("-").map(Number);
    const first = startOfMonth(new Date(y, m - 1, 1));
    const last = endOfMonth(first);
    const lead = (getDay(first) + 6) % 7; // lunes = 0
    const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= last.getDate(); d++) cells.push(new Date(y, m - 1, d));
    return { key, label: format(first, "MMMM yyyy", { locale: es }), cells };
  });
}
```

Run: `npx vitest run src/pages/admin/classes/generate-helpers.test.ts` → PASS.

- [ ] **Step 3: Pruebas de las dos pantallas**

Crear `src/pages/admin/classes/ClassTypesList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClassTypesList from "./ClassTypesList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [
      { id: "t1", name: "Reformer Intermedio", color: "#111111", category: "reformer_tower", defaultDuration: 50, maxCapacity: 8, isActive: true },
      { id: "t2", name: "Barre", color: "#8A8A88", category: "studio", defaultDuration: 45, maxCapacity: 12, isActive: false },
    ] },
  });
});

describe("Tipos de clase", () => {
  it("la tabla muestra la muestra del bloque, la categoría y el estado", async () => {
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    expect(await screen.findByText("Reformer Intermedio")).toBeInTheDocument();
    expect(screen.getByText("Reformer/Tower")).toBeInTheDocument();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });

  it("en escritorio, Nuevo tipo abre el formulario a un lado de la tabla", async () => {
    renderAdmin(<ClassTypesList />, { route: "/admin/class-types" });
    fireEvent.click(await screen.findByRole("button", { name: /Nuevo tipo/ }));
    const panel = screen.getByRole("complementary", { name: "Nuevo tipo de clase" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Tower" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Crear" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/class-types", expect.objectContaining({ name: "Tower" })));
  });
});
```

(Los colores `#111111` y `#8A8A88` de arriba viven en un `.test.tsx`: la guardia de colores no revisa pruebas.)

Crear `src/pages/admin/classes/GenerateClasses.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import GenerateClasses from "./GenerateClasses";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/class-types": { data: [{ id: "t1", name: "Tower", color: "#111111" }] },
    "/instructors": { data: [{ id: "i1", displayName: "Sofía Ibarra" }] },
  });
});

describe("Generar clases", () => {
  it("muestra el horario oficial, la vista previa a un lado y esconde la plantilla sola", async () => {
    renderAdmin(<GenerateClasses />, { route: "/admin/class-generator" });
    expect(await screen.findByRole("heading", { name: "Horario oficial" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Vista previa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /plantilla/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Generar/ })).toBeDisabled();
  });
});
```

Run: `npx vitest run src/pages/admin/classes/ClassTypesList.test.tsx src/pages/admin/classes/GenerateClasses.test.tsx` → FAIL.

- [ ] **Step 4: Tipos de clase — panel lateral en escritorio**

En `ClassTypesList.tsx`:
1. Imports: `AdminPage`, `AdminPageHeader`, `Panel`, `StatusDot`.
2. Encabezado (L167-179): `admin-page max-w-4xl` → `<AdminPage>`; `SectionTabs` + `h1` + subtítulo + botón → 

```tsx
<AdminPageHeader
  kicker="Clases"
  title="Tipos de clase"
  subtitle={/* el mismo texto de conteo que hoy */}
  actions={<>
    <SectionTabs aria-label="Secciones de Clases" tabs={CLASSES_SECTION_TABS} />
    <Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo tipo</Button>
  </>}
/>
```

3. Mover el `<form>` que hoy está dentro del `DialogContent` (L300-360, desde el campo Nombre hasta el pie con Cancelar/Crear) a una constante antes del `return`: `const typeForm = ( <form …>…</form> );`. En el campo Nombre, asegurar `<Label htmlFor="type-name">Nombre</Label>` + `<Input id="type-name" …/>` (para `getByLabelText("Nombre")`).
4. Tabla de escritorio (L235-287):
   - Envolverla con el panel lateral: `<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"> <Panel className="overflow-hidden">…tabla…</Panel> {open && !isMobile && ( <aside aria-label={editing ? "Editar tipo" : "Nuevo tipo de clase"} className="rounded-2xl border border-line bg-surface p-6"> <h2 className="mb-4 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{editing ? "Editar tipo" : "Nuevo tipo de clase"}</h2> {typeForm} </aside> )} </div>`.
   - La primera columna pasa de "Color" a **"Tipo"**. Su celda es la muestra del bloque, y la columna "Nombre" se quita porque la muestra ya lo lleva:

```tsx
<TableCell>
  <span className="inline-flex items-center gap-2 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[0.75rem] font-extrabold">
    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: resolveClassColor(t.color) }} />
    {t.name}
  </span>
</TableCell>
```

   - Estado: `{t.isActive !== false ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>}` (reemplaza `renderStatusBadge`, que se borra).
   - Duración `N min` y Capacidad `N lugares`, con `nums`.
5. El `Dialog` (L291-363) queda **sólo para celular**: `<Dialog open={open && isMobile} onOpenChange={setOpen}> <DialogContent> <DialogHeader>…igual…</DialogHeader> {typeForm} </DialogContent> </Dialog>`.

- [ ] **Step 5: Generar — vista previa a la derecha y validación**

En `GenerateClasses.tsx`:
1. Imports: `AdminPage`, `AdminPageHeader`, `Panel`, `FEATURES`, `{ previewMonths, validateGenerate } from "./generate-helpers"`, `isSameDay`, `format` de `date-fns`.
2. Después de `canGenerate` (L164):

```tsx
const errors = validateGenerate({ startTime, endTime, maxCapacity });
const canSubmit = canGenerate && !errors.time && !errors.capacity;
const months = previewMonths(preview);
```

   y el botón principal usa `disabled={!canSubmit || generateMutation.isPending}`.
3. Encabezado: `admin-page max-w-3xl` → `<AdminPage>`. `SectionTabs` + `h1` + subtítulo → `<AdminPageHeader kicker="Clases" title="Generar clases" subtitle="Aplica el horario oficial del estudio o crea clases en bloque para un rango de fechas." actions={<SectionTabs aria-label="Secciones de Clases" tabs={CLASSES_SECTION_TABS} />} />`.
4. Acomodo: envolver el contenido (L201-495) en `<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"> <div className="flex flex-col gap-4"> …preset… …pasos 1-4… </div> <aside …>…vista previa…</aside> </div>`.
5. Preset (L203-271):
   - Envolver en `<Panel className="flex flex-col gap-4 p-6">`.
   - Título: `<p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Plantilla del estudio</p><h2 className="text-base font-extrabold">Horario oficial</h2>`.
   - Se conserva la línea de horarios.
   - El botón "Solo plantilla" se envuelve en `{FEATURES.scheduleTemplates && ( … )}`.
6. Pasos 1-4 (L274-416):
   - Agruparlos en un solo `<Panel className="p-6">` con el título "Crear clases en bloque".
   - Cada paso se separa con `border-t border-line pt-4`.
   - Debajo del paso 4 van los mensajes:

```tsx
{errors.time && <p className="text-[13px] font-bold text-danger">{errors.time}</p>}
{errors.capacity && <p className="text-[13px] font-bold text-danger">{errors.capacity}</p>}
```

7. Vista previa (reemplaza L419-494: la cuadrícula de mosaicos y el botón de ancho completo):

```tsx
<aside aria-label="Vista previa" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
  <div className="flex items-center justify-between">
    <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Vista previa</p>
    <span className="nums rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{preview.length} {preview.length === 1 ? "clase" : "clases"}</span>
  </div>
  {months.length === 0 ? (
    <p className="text-sm text-ink-muted">Elige un rango de fechas y días para ver las clases que se van a crear.</p>
  ) : (
    months.slice(0, 3).map((m) => (
      <div key={m.key}>
        <p className="mb-2 text-sm font-bold capitalize">{m.label}</p>
        <div className="grid grid-cols-7 gap-1 text-center">
          {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
            <span key={i} className="text-[0.75rem] font-extrabold text-ink-muted">{d}</span>
          ))}
          {m.cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const on = preview.some((p) => isSameDay(p, d));
            return (
              <span key={i} className={on ? "nums grid h-9 place-items-center rounded-lg bg-ink text-[13px] font-extrabold text-canvas" : "nums grid h-9 place-items-center text-[13px] text-ink-muted"}>
                {d.getDate()}
              </span>
            );
          })}
        </div>
      </div>
    ))
  )}
  {months.length > 3 && <p className="text-[13px] text-ink-muted">Y {months.length - 3} meses más.</p>}
  {preview.length > 0 && (
    <p className="text-[13px] text-ink-muted">
      {selectedType?.name ?? "—"} · {selectedInstructor?.displayName ?? "—"} · {startTime} a {endTime} · {maxCapacity} lugares
    </p>
  )}
  <Button size="lg" className="w-full" disabled={!canSubmit || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
    {generateMutation.isPending ? "Generando…" : preview.length > 0 ? `Generar ${preview.length} ${preview.length === 1 ? "clase" : "clases"}` : "Generar clases"}
  </Button>
  <p className="text-center text-[0.75rem] text-ink-muted">Las clases que ya existan en ese horario no se duplican.</p>
</aside>
```

(Usar los nombres reales de L98-99 para el tipo y la instructora elegidos; si `preview` son fechas en texto y no `Date`, convertirlas con `parseISO` antes de `previewMonths`.)

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run src/pages/admin/classes/`
Expected: PASS.

- [ ] **Step 7: Comprobación estándar y commit**

```bash
git add src/pages/admin/classes
git commit -m "feat(panel): tipos de clase con edición a un lado y Generar con vista previa fija

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 10: Cobros · Cobrar e Historial

**Files:**
- Create: `src/pages/admin/payments/CobrosTabs.tsx`, `src/pages/admin/payments/payments-summary.ts`, `src/pages/admin/payments/payments-summary.test.ts`, `src/pages/admin/payments/PaymentsHistory.tsx`, `src/pages/admin/payments/PaymentsPage.test.tsx`
- Modify:
  - `src/pages/admin/payments/PaymentsPage.tsx`: se reescriben `CashAssignment` (L92-387) y `PaymentsPage` (L453-490). `PaymentsHistory` (L390-450) se mueve a su propio archivo. **Se conservan** `PAYMENT_METHODS`, `GROUP_LABELS`, `groupPlans`, la consulta de planes y `assignMutation` (POST `/memberships`).
  - `src/App.tsx`: ruta nueva.

**Interfaces:**
- Consumes: `ClientSearch`, `type ClientHit` (Task 2), `useSearchParamState`, `useCanSeeFinance`, `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `SectionTabs`, llave `["admin-stats"]`, llave `["client", id]` (la misma de la ficha).
- Produces:
  - `CobrosTabs()` — Cobrar · Verificar (contador) · Historial (sólo dueña). La usa Verificar (Tarea 11).
  - `/admin/payments?clienta=<id>` deja a la clienta elegida (lo usa "Renovar" en la ficha, Tarea 13).
  - `summarizePayments(payments: PaymentRow[], now: Date): { week: { amount: number; count: number }; month: { amount: number; count: number }; byMethod: Record<string, number> }`, `type PaymentRow = { createdAt?: string; method?: string; total_amount?: number | string; amount?: number | string }`.
  - Ruta `/admin/payments/historial` → `PaymentsHistoryPage`.

- [ ] **Step 1: Pruebas del resumen de pagos**

Crear `src/pages/admin/payments/payments-summary.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { summarizePayments } from "./payments-summary";

const now = new Date(2026, 8, 25, 10, 40); // viernes
const p = (d: string, method: string, amount: number | string) => ({ createdAt: d, method, total_amount: amount });

describe("summarizePayments", () => {
  it("separa semana, mes y método; ignora otros meses", () => {
    const s = summarizePayments([
      p("2026-09-25T10:18:00", "transfer", 1450),
      p("2026-09-22T09:00:00", "cash", "780"),       // lunes: esta semana
      p("2026-09-15T12:00:00", "card", 2680),        // este mes, otra semana
      p("2026-08-30T12:00:00", "cash", 1000),        // otro mes
    ], now);
    expect(s.week).toEqual({ amount: 2230, count: 2 });
    expect(s.month).toEqual({ amount: 4910, count: 3 });
    expect(s.byMethod).toEqual({ transfer: 1450, cash: 780, card: 2680 });
  });
  it("sin fecha o sin monto no truena", () => {
    const s = summarizePayments([{ method: "cash" }, { createdAt: "x", total_amount: "abc" }], now);
    expect(s.month).toEqual({ amount: 0, count: 0 });
  });
});
```

Run: `npx vitest run src/pages/admin/payments/payments-summary.test.ts` → FAIL.

- [ ] **Step 2: Escribir `payments-summary.ts`**

```ts
import { isSameMonth, startOfWeek } from "date-fns";

export type PaymentRow = { createdAt?: string; method?: string; total_amount?: number | string; amount?: number | string };

/* Totales del Historial calculados con la misma lista de GET /payments. */
export function summarizePayments(payments: PaymentRow[], now: Date) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const week = { amount: 0, count: 0 };
  const month = { amount: 0, count: 0 };
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const d = p.createdAt ? new Date(p.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const amount = Number(p.total_amount ?? p.amount ?? 0) || 0;
    if (isSameMonth(d, now)) {
      month.amount += amount;
      month.count += 1;
      const key = p.method ?? "otro";
      byMethod[key] = (byMethod[key] ?? 0) + amount;
    }
    if (d >= weekStart && d <= now) {
      week.amount += amount;
      week.count += 1;
    }
  }
  return { week, month, byMethod };
}
```

Run: `npx vitest run src/pages/admin/payments/payments-summary.test.ts` → PASS.

- [ ] **Step 3: Prueba de la pantalla**

Crear `src/pages/admin/payments/PaymentsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PaymentsPage from "./PaymentsPage";
import PaymentsHistoryPage from "./PaymentsHistory";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678" };

function tabla() {
  return {
    "/admin/stats": { pendingAlerts: 3 },
    "/plans": { data: [
      { id: "p8", name: "Paquete 8 clases", price: 1450, classLimit: 8, durationDays: 30, classCategory: "studio", isActive: true },
      { id: "pu", name: "Ilimitado mensual", price: 2680, classLimit: null, durationDays: 30, classCategory: "reformer_tower", isActive: true },
    ] },
    "/users?role=client&search=cam": { data: [CAMILA] },
    "/users/u1": { data: CAMILA },
    "/users/zzz": Object.assign(new Error("404"), { response: { status: 404, data: {} } }),
    "/payments": { data: [
      { id: "y1", userName: "Camila Torres", createdAt: "2026-09-25T10:18:00", method: "transfer", total_amount: 1450 },
      { id: "y2", userName: "Isabel Rojas", createdAt: "2026-09-15T08:05:00", method: "cash", total_amount: 780 },
    ] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  routeApi(mockApi, tabla());
});
afterEach(() => vi.useRealTimers());

describe("Cobros · Cobrar", () => {
  it("clienta, plan y método en una sola pantalla con el resumen a un lado", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    const confirmar = within(resumen).getByRole("button", { name: "Confirmar y activar membresía" });
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Tarjeta/ }));

    expect(within(resumen).getByText("Camila Torres")).toBeInTheDocument();
    expect(within(resumen).getByText("$1,450")).toBeInTheDocument();
    expect(within(resumen).getByText("25 sep – 25 oct")).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", {
      userId: "u1", planId: "p8", paymentMethod: "card", startDate: "2026-09-25",
    }));
  });

  it("con ?clienta= llega con la clienta elegida", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=u1", path: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    expect(await within(resumen).findByText("Camila Torres")).toBeInTheDocument();
  });

  it("con un id que no existe lo dice y deja buscar", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments?clienta=zzz", path: "/admin/payments" });
    expect(await screen.findByText("No encontramos a esa clienta. Búscala abajo.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" })).toBeInTheDocument();
  });

  it("recepción no ve la pestaña Historial", async () => {
    loginAs("reception");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    expect(await screen.findByRole("link", { name: /Verificar/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Historial" })).toBeNull();
  });
});

describe("Cobros · Historial", () => {
  it("totales de la semana y del mes y la tabla", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    const semana = (await screen.findByText("Esta semana")).closest("div")!;
    expect(within(semana).getByText("$1,450")).toBeInTheDocument();
    const mes = screen.getByText("septiembre").closest("div")!;
    expect(within(mes).getByText("$2,230")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: /Isabel Rojas/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Historial" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cobrar" })).not.toHaveAttribute("aria-current");
  });
});
```

Run: `npx vitest run src/pages/admin/payments/PaymentsPage.test.tsx` → FAIL.

- [ ] **Step 4: Crear `CobrosTabs`**

`src/pages/admin/payments/CobrosTabs.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import SectionTabs from "@/components/admin/SectionTabs";
import { useCanSeeFinance } from "@/lib/roles";

/* Cobrar · Verificar · Historial (spec §5.8-5.10). Verificar lleva el
   contador de pagos por verificar; Historial sólo para la dueña. */
export default function CobrosTabs() {
  const showFinance = useCanSeeFinance();
  const { data } = useQuery<{ pendingAlerts?: number }>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
    staleTime: 60_000,
  });
  return (
    <SectionTabs
      aria-label="Secciones de Cobros"
      tabs={[
        { label: "Cobrar", to: "/admin/payments", exact: true },
        { label: "Verificar", to: "/admin/orders", count: data?.pendingAlerts ?? 0 },
        ...(showFinance ? [{ label: "Historial", to: "/admin/payments/historial" }] : []),
      ]}
    />
  );
}
```

- [ ] **Step 5: Reescribir `CashAssignment` y `PaymentsPage`**

En `PaymentsPage.tsx`:
1. Borrar `STEP_META` y `StepBar` (L26-30, L57-89) y el componente `PaymentsHistory` (L390-450; pasa al archivo nuevo del paso 6).
2. Imports: agregar `useEffect`, `format`, `addDays` de `date-fns`, `es` de `date-fns/locale`, `Check` de `lucide-react`, `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `ClientSearch`, `useSearchParamState`, `CobrosTabs`. Quitar `SectionTabs`, `Tabs*`, `useDebounce`, `Input`, `Label` y los íconos que queden sin uso.
3. Reemplazar `CashAssignment` completo por:

```tsx
type SelectedUser = { id: string; displayName: string; email?: string | null; phone?: string | null };
type SelectedPlan = { id: string; name: string; price: number; durationDays?: number | null };

function StepTitle({ n, done, children }: { n: number; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-canvas"><Check size={14} aria-hidden="true" /></span>
      ) : (
        <span className="nums grid h-7 w-7 place-items-center rounded-full border border-line-strong text-[13px] font-extrabold">{n}</span>
      )}
      <h2 className="text-base font-extrabold">{children}</h2>
    </div>
  );
}

function CashAssignment() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clientParam, setClientParam] = useSearchParamState("clienta");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // "Renovar" desde la ficha: /admin/payments?clienta=<id>. Misma llave que la ficha.
  const preselectQ = useQuery<Record<string, any>>({
    queryKey: ["client", clientParam],
    queryFn: async () => (await api.get(`/users/${clientParam}`)).data,
    enabled: !!clientParam && !selectedUser,
    retry: false,
  });
  useEffect(() => {
    const u = preselectQ.data?.data ?? preselectQ.data;
    if (u?.id && !selectedUser) {
      setSelectedUser({ id: u.id, displayName: u.displayName ?? u.display_name ?? "Clienta", email: u.email, phone: u.phone });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectQ.data]);

  // Consulta de planes: la misma de hoy (L111-114) y el mismo filtro de activos (L131-132).
  const { data: plansData, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery<{ data: any[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = (Array.isArray(plansData?.data) ? plansData!.data : []).filter((p) => p.isActive !== false && p.is_active !== false);
  const planGroups = groupPlans(plans);

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post("/memberships", {
        userId: selectedUser!.id,
        planId: selectedPlan!.id,
        paymentMethod,
        startDate: format(new Date(), "yyyy-MM-dd"),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Membresía activada" });
      setSelectedUser(null);
      setSelectedPlan(null);
      setPaymentMethod("cash");
      setClientParam(null);
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? "Error al asignar", variant: "destructive" }),
  });

  const today = new Date();
  const vigencia = selectedPlan?.durationDays
    ? `${format(today, "d MMM", { locale: es })} – ${format(addDays(today, selectedPlan.durationDays), "d MMM", { locale: es })}`
    : selectedPlan ? "Desde hoy" : "—";
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? "—";
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <dt className="text-sm text-ink-muted">{k}</dt>
      <dd className="nums text-right text-sm font-bold">{v}</dd>
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel aria-label="Clienta" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={1} done={!!selectedUser}>Clienta</StepTitle>
          {selectedUser ? (
            <div className="flex items-center gap-3.5 rounded-xl bg-canvas px-3.5 py-3">
              <PersonCell name={selectedUser.displayName} sub={[selectedUser.email, selectedUser.phone].filter(Boolean).join(" · ")} size={40} />
              <Button variant="ghost" className="ml-auto" onClick={() => { setSelectedUser(null); setClientParam(null); }}>Cambiar</Button>
            </div>
          ) : (
            <>
              {preselectQ.isError && <p className="text-[13px] font-bold text-danger">No encontramos a esa clienta. Búscala abajo.</p>}
              <ClientSearch
                label="Buscar clienta para cobrar"
                placeholder="Nombre, email o teléfono…"
                onSelect={(c) => setSelectedUser({ id: c.id, displayName: c.displayName, email: c.email, phone: c.phone })}
              />
            </>
          )}
        </Panel>

        <Panel aria-label="Plan" className="flex flex-col gap-4 p-5 lg:p-6">
          <StepTitle n={2} done={!!selectedPlan}>Plan</StepTitle>
          {plansLoading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : plansError ? (
            <ErrorState title="No pudimos cargar los planes" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetchPlans()} />
          ) : plans.length === 0 ? (
            <EmptyState
              title="Sin planes activos"
              description="Crea un plan en la sección de Planes para poder cobrarlo en mostrador."
              ctaLabel="Ir a Planes"
              ctaTo="/admin/plans"
            />
          ) : (
            Object.entries(planGroups)
              .filter(([, list]) => list.length > 0)
              .map(([key, list]) => (
                <div key={key} className="flex flex-col gap-2.5">
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{GROUP_LABELS[key]}</p>
                  <div role="radiogroup" aria-label={GROUP_LABELS[key]} className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((p: any) => {
                      const sel = selectedPlan?.id === p.id;
                      const limit = p.classLimit ?? p.class_limit;
                      const days = p.durationDays ?? p.duration_days;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => setSelectedPlan({ id: p.id, name: p.name, price: Number(p.price), durationDays: days })}
                          className={cn("flex min-h-[88px] items-start gap-3 rounded-xl bg-surface p-4 text-left", sel ? "border-2 border-ink" : "border border-line hover:border-line-strong")}
                        >
                          <span aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-full", sel ? "border-[6px] border-ink" : "border border-line-strong")} />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-extrabold">{p.name}</span>
                            <span className="text-[13px] text-ink-muted">
                              {limit == null ? "Ilimitado" : `${limit} ${Number(limit) === 1 ? "clase" : "clases"}`}
                              {days ? ` · ${days} días` : ""}
                            </span>
                            <span className="nums mt-1.5 text-base font-extrabold">{formatMXN(Number(p.price))}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
          )}
        </Panel>

        <Panel aria-label="Método de pago" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={3} done={false}>Método de pago</StepTitle>
          <div role="radiogroup" aria-label="Método de pago" className="grid gap-2.5 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => {
              const sel = paymentMethod === m.value;
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn("flex min-h-[56px] items-center gap-2.5 rounded-xl bg-surface px-4 text-sm font-bold", sel ? "border-2 border-ink" : "border border-line")}
                >
                  <Icon size={18} aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </Panel>
      </div>

      <aside aria-label="Resumen de la membresía" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Resumen de la membresía</p>
        <dl className="mt-2">
          {row("Clienta", selectedUser?.displayName ?? "—")}
          {row("Plan", selectedPlan?.name ?? "—")}
          {row("Vigencia", vigencia)}
          {row("Método", methodLabel)}
        </dl>
        <div className="flex items-baseline justify-between border-t-2 border-ink pb-2 pt-4">
          <span className="text-[15px] font-bold">Total</span>
          <span className="nums font-display text-[2rem] font-semibold">{selectedPlan ? formatMXN(selectedPlan.price) : "—"}</span>
        </div>
        <Button size="lg" className="w-full" disabled={!selectedUser || !selectedPlan || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
          {assignMutation.isPending ? "Activando…" : "Confirmar y activar membresía"}
        </Button>
        <p className="mt-1.5 text-center text-[0.75rem] text-ink-muted">La membresía se activa hoy y la clienta recibe su confirmación.</p>
      </aside>
    </div>
  );
}
```

(Si la etiqueta del método "Transferencia" usa el ícono `ArrowRight`, dejarlo así o cambiarlo por `Receipt`; es sólo un ícono. Con `startDate` en fecha local: antes era "hoy" con el mismo formato.)

4. Reemplazar `PaymentsPage` por:

```tsx
const PaymentsPage = () => (
  <AuthGuard>
    <AdminLayout>
      <AdminPage>
        <AdminPageHeader kicker="Cobros · mostrador" title="Cobrar" subtitle="Asigna una membresía y cóbrala en el momento." actions={<CobrosTabs />} />
        <CashAssignment />
      </AdminPage>
    </AdminLayout>
  </AuthGuard>
);
```

- [ ] **Step 6: Crear la pantalla de Historial**

`src/pages/admin/payments/PaymentsHistory.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import KpiStrip from "@/components/admin/KpiStrip";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDate, formatMXN } from "@/lib/format";
import CobrosTabs from "./CobrosTabs";
import { summarizePayments, type PaymentRow } from "./payments-summary";

const METHOD: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Payment = PaymentRow & { id: string; userName?: string; userId?: string };

/* Historial de cobros (spec §5.10): pasa de pestaña interna a ruta propia. */
export default function PaymentsHistoryPage() {
  const { data, isLoading, isError, refetch } = useQuery<{ data: Payment[] }>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });
  const payments = Array.isArray(data?.data) ? data!.data : [];
  const now = new Date();
  const s = summarizePayments(payments, now);
  const byMethod = Object.entries(s.byMethod)
    .map(([k, v]) => `${METHOD[k] ?? k} ${formatMXN(v)}`)
    .join(" · ") || "—";

  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader kicker="Cobros" title="Historial" subtitle="Órdenes aprobadas y membresías asignadas en mostrador." actions={<CobrosTabs />} />
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[56px] w-full rounded-xl" />)}</div>
          ) : isError ? (
            <ErrorState title="No pudimos cargar el historial" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetch()} />
          ) : payments.length === 0 ? (
            <EmptyState icon={<History size={20} strokeWidth={1.8} />} title="Sin pagos registrados aún" description="Cuando cobres una membresía en mostrador, aparecerá aquí." />
          ) : (
            <>
              <KpiStrip items={[
                { label: "Esta semana", value: formatMXN(s.week.amount), hint: `${s.week.count} ${s.week.count === 1 ? "pago" : "pagos"}` },
                { label: MONTHS[now.getMonth()], value: formatMXN(s.month.amount), hint: `${s.month.count} ${s.month.count === 1 ? "pago" : "pagos"}` },
                { label: "Por método · mes", value: <span className="block font-sans text-sm font-bold leading-relaxed">{byMethod}</span> },
              ]} />
              <Panel className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clienta</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell><PersonCell name={p.userName ?? p.userId ?? "—"} /></TableCell>
                        <TableCell className="nums text-ink-muted">{p.createdAt ? formatDate(p.createdAt) : "—"}</TableCell>
                        <TableCell>
                          <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{METHOD[p.method ?? ""] ?? p.method ?? "—"}</span>
                        </TableCell>
                        <TableCell className="nums text-right text-[15px] font-extrabold">{formatMXN(Number(p.total_amount ?? p.amount ?? 0))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Panel>
            </>
          )}
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
}
```

- [ ] **Step 7: Registrar la ruta**

En `src/App.tsx`, importar `import PaymentsHistoryPage from "./pages/admin/payments/PaymentsHistory";` y agregar junto a `/admin/payments`:

```tsx
<Route path="/admin/payments/historial" element={<PaymentsHistoryPage />} />
```

- [ ] **Step 8: Correr las pruebas**

Run: `npx vitest run src/pages/admin/payments/ src/test/paridad-velan.test.ts`
Expected: PASS (la paridad con Velan sigue en verde: la ruta nueva no está en la lista de apagadas).

- [ ] **Step 9: Comprobación estándar y commit**

```bash
git add src/pages/admin/payments src/App.tsx
git commit -m "feat(panel): Cobrar en una sola pantalla e Historial como pestaña propia

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Cobros · Verificar

**Files:**
- Modify: `src/pages/admin/orders/OrdersVerification.tsx`:
  - `STATUS_PILL` y `StatusPill` (L30-45);
  - `OrderDetail` (L128-250): sólo el acomodo, se conserva la lógica de notas y rechazo;
  - la cuadrícula y la tabla de `OrdersBoard` (L344-393);
  - el encabezado de la página (L414-424).
- Test: `src/pages/admin/orders/OrdersVerification.test.tsx`

**Interfaces:**
- Consumes: `CobrosTabs` (Task 10), `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `StatusDot`.

- [ ] **Step 1: Prueba que falla**

Crear `src/pages/admin/orders/OrdersVerification.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import OrdersVerification from "./OrdersVerification";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const orden = (id: string, userName: string, totalAmount: number, status: string, paymentMethod: string) =>
  ({ id, userName, userId: id, totalAmount, status, paymentMethod, createdAt: "2026-09-25T10:28:00", planName: "Paquete 8 clases", proofUrl: null });

beforeEach(() => {
  // Escritorio: el detalle vive a la derecha (useIsDesktop lee este media query).
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: /min-width/.test(q), media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  }));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 3 },
    "/admin/orders?status=pending_verification": { data: [orden("o1", "Camila Torres", 1450, "pending_verification", "transfer"), orden("o3", "Tarjeta Auto", 900, "pending_verification", "card")] },
    "/admin/orders?status=pending_payment": { data: [orden("o2", "Lucía Navarro", 780, "pending_payment", "cash")] },
  });
});

describe("Cobros · Verificar", () => {
  it("la primera orden se ve a la derecha con el monto a verificar y se aprueba con notas", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    const detalle = await screen.findByRole("complementary", { name: "Detalle de la orden" });
    expect(within(detalle).getByText("Monto a verificar")).toBeInTheDocument();
    expect(within(detalle).getByText("$1,450")).toBeInTheDocument();
    expect(screen.queryByText("Tarjeta Auto")).toBeNull(); // las de tarjeta no se verifican a mano
    fireEvent.change(within(detalle).getByLabelText("Notas internas (opcional)"), { target: { value: "ok" } });
    fireEvent.click(within(detalle).getByRole("button", { name: /Aprobar/ }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/orders/o1/verify", { notes: "ok" }));
  });

  it("rechazar pide el motivo", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    const detalle = await screen.findByRole("complementary", { name: "Detalle de la orden" });
    fireEvent.click(within(detalle).getByRole("button", { name: /Rechazar/ }));
    const confirmar = within(detalle).getByRole("button", { name: /Confirmar rechazo/ });
    expect(confirmar).toBeDisabled();
    fireEvent.change(within(detalle).getByLabelText(/Motivo del rechazo/), { target: { value: "El monto no coincide" } });
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/orders/o1/reject", { notes: "El monto no coincide", reason: "El monto no coincide" }));
  });

  it("elegir otra fila cambia el detalle y la pestaña Verificar lleva el contador", async () => {
    renderAdmin(<OrdersVerification />, { route: "/admin/orders" });
    fireEvent.click(await screen.findByText("Lucía Navarro"));
    const detalle = screen.getByRole("complementary", { name: "Detalle de la orden" });
    expect(within(detalle).getByText("$780")).toBeInTheDocument();
    const tab = screen.getByRole("link", { name: /Verificar/ });
    expect(within(tab).getByText("3")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/orders/OrdersVerification.test.tsx` → FAIL.

- [ ] **Step 2: Cambios**

1. Imports: `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `StatusDot`, `CobrosTabs` (`@/pages/admin/payments/CobrosTabs`), `Check`, `X` de `lucide-react`. Quitar `SectionTabs`.
2. `StatusPill` (reemplaza L30-45; `STATUS_LABEL` L22-28 se queda):

```tsx
const StatusPill = ({ status }: { status: string }) => {
  const label = STATUS_LABEL[status] ?? status;
  if (status === "pending_verification") return <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{label}</span>;
  if (status === "pending_payment") return <span className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[0.75rem] font-extrabold text-ink-muted">{label}</span>;
  if (status === "approved") return <StatusDot tone="success">{label}</StatusDot>;
  if (status === "rejected") return <StatusDot tone="danger">{label}</StatusDot>;
  return <StatusDot tone="muted">{label}</StatusDot>;
};
```

(`STATUS_PILL` se borra.)

3. `OrderDetail` — conservar el estado (`notes`, `rejectMode`, `reason`), la lógica y los textos; cambiar el acomodo del JSX (L133-249) por:

```tsx
<div className="flex flex-col gap-4">
  <div className="flex items-center justify-between">
    <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Orden #{order.id.slice(0, 8).toUpperCase()}</p>
    <StatusPill status={order.status} />
  </div>
  <PersonCell name={order.userName ?? order.userId} sub={METHOD_LABEL[order.paymentMethod ?? ""] ?? order.paymentMethod ?? undefined} size={44} />
  <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
    {/* Comprobante: el bloque actual L167-182 (aviso de tarjeta o ProofViewer), tal cual */}
    <div>{/* … */}</div>
    <div>
      <div className="rounded-xl bg-accent-soft p-3.5">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink">Monto a verificar</p>
        <p className="nums mt-1.5 font-display text-[1.75rem] font-semibold leading-none">{formatMXN(Number(order.totalAmount))}</p>
      </div>
      <dl className="mt-1.5">
        {[["Plan", order.planName ?? "—"], ["Método", METHOD_LABEL[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "—"], ["Fecha", formatDate(order.createdAt)]].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
            <dt className="text-[13px] text-ink-muted">{k}</dt>
            <dd className="nums text-sm font-bold">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  </div>
  {/* Acciones pendientes: igual que L184-247, con estos cambios de acomodo:
      - el campo de notas lleva <Label htmlFor="order-notes">Notas internas (opcional)</Label> + <Input id="order-notes" …/>
      - los dos botones van en <div className="grid grid-cols-2 gap-2.5">:
          <Button variant="outline" className="border-danger text-danger" onClick={() => setRejectMode(true)}><X size={16} aria-hidden="true" />Rechazar</Button>
          <Button onClick={() => onApprove(order.id, notes)} disabled={approving}><Check size={16} aria-hidden="true" />{approving ? "Aprobando…" : "Aprobar"}</Button>
      - debajo: <p className="text-[0.75rem] text-ink-muted">Si la rechazas, le avisamos a la clienta por email y WhatsApp con el motivo.</p>
      - en el modo de rechazo, el Textarea lleva id="reject-reason" y su <Label htmlFor="reject-reason">Motivo del rechazo *</Label>. */}
</div>
```

(El monto usa `formatMXN`, que para 1450 da "$1,450".)

4. `OrdersBoard`: la cuadrícula (L344) pasa a `lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-6`. El contenedor de la tabla (L346) pasa a `<Panel className="overflow-hidden">`. Celdas:
   - Clienta: `<PersonCell name={o.userName ?? o.userId} sub={METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "—"} />`.
   - Monto: `className="nums text-right text-[15px] font-extrabold whitespace-nowrap"`.
   - Fila activa: `active && "bg-canvas shadow-[inset_3px_0_0_theme(colors.ink.DEFAULT)]"`.
   
   El `<aside>` (L386) cambia a `<aside aria-label="Detalle de la orden" className="hidden lg:block sticky top-24 rounded-2xl border border-line bg-surface p-6">`.
5. Página (L414-424): `admin-page max-w-6xl` → `<AdminPage>`. `SectionTabs` + h1 + subtítulo → `<AdminPageHeader kicker="Cobros · transferencias y efectivo" title="Verificar" subtitle="Compara cada monto con su comprobante antes de aprobar." actions={<CobrosTabs />} />`. Las pestañas "Por verificar" / "Todas" (shadcn `Tabs`) se quedan.

- [ ] **Step 3: Correr las pruebas**

Run: `npx vitest run src/pages/admin/orders/OrdersVerification.test.tsx`
Expected: PASS.

- [ ] **Step 4: Comprobación estándar y commit**

```bash
git add src/pages/admin/orders
git commit -m "feat(panel): Verificar con el comprobante y el monto a la vista

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 12: Personas · Clientas y Coaches

**Files:**
- Create: `src/components/admin/ClientEditSheet.tsx`, `src/pages/admin/clients/PersonasTabs.tsx`, `src/pages/admin/clients/ClientsList.test.tsx`, `src/pages/admin/staff/InstructorsList.test.tsx`
- Modify:
  - `src/pages/admin/clients/ClientsList.tsx`: se mueven `editSchema`, `EditFormData`, `editForm`, `updateMutation`, `openEdit`, `onEditSubmit` y el Sheet "Editar clienta" (L31-40, L136-158, L342-407) a `ClientEditSheet`. Cambian el encabezado, la búsqueda, la tabla y los errores. **Se conservan** el Sheet "Nueva clienta" (L410-583), `manualSchema`, `manualMutation` (salvo su mensaje de error), `askDelete` y `{dialog}`.
  - `src/pages/admin/staff/InstructorsList.tsx`: la tabla (L273-329) pasa a tarjetas y cambia el encabezado. **Se conservan** el diálogo, las mutaciones, el menú y el aviso de magic link.

**Interfaces:**
- Consumes: `useSearchParamState`, `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `StatusDot`, `waLink`, llave `["admin-birthdays", month]` (Inicio).
- Produces:
  - `ClientEditSheet({ clientId: string | null; open: boolean; onOpenChange: (open: boolean) => void })` — carga la clienta completa con `GET /users/:id` (llave `["client", id]`), guarda con `PUT /users/:id` e invalida `["clients"]` y `["client", id]`. La usa la ficha (Tarea 13).
  - `toFormValues(user): EditFormData` — sin `null`, fecha en `YYYY-MM-DD`.
  - `PersonasTabs()` — Clientas · (Visitas si `FEATURES.visits`) · Coaches.

- [ ] **Step 1: Pruebas que fallan**

Crear `src/pages/admin/clients/ClientsList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import ClientsList from "./ClientsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock; delete: Mock };
const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678", role: "client", createdAt: "2026-03-10T00:00:00" };
const FER = { id: "u2", displayName: "Fernanda Ortiz", email: "fer@correo.com", phone: null, role: "client", createdAt: "2026-05-02T00:00:00" };

const abrirMenu = (nombre: string) => fireEvent.keyDown(screen.getByRole("button", { name: nombre }), { key: "Enter" });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  mockApi.delete.mockReset();
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/users?role=client&search=": { data: [CAMILA, FER] },
    "/users?role=client&search=%C3%B1%26": { data: [] },
    "/users/u1": { data: { ...CAMILA, dateOfBirth: "1996-03-18T00:00:00.000Z", emergencyContactName: null, healthNotes: "Hombro derecho" } },
    "/plans?active=true": { data: [] },
    "/admin/birthdays?month=9": { data: [{ id: "u9", displayName: "Andrea Martínez", email: "andrea@correo.com", phone: "5523456789", isToday: true, day: 25, month: 9 }] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Personas · Clientas", () => {
  it("lista con WhatsApp sólo para quien tiene teléfono", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    expect(await screen.findByText("Camila Torres")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "WhatsApp a Camila Torres" })).toHaveAttribute("href", "https://wa.me/525512345678");
    expect(screen.queryByRole("link", { name: "WhatsApp a Fernanda Ortiz" })).toBeNull();
    expect(screen.getByText((_, el) => el?.textContent === "2 clientas registradas")).toBeInTheDocument();
  });

  it("la búsqueda va codificada", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    fireEvent.change(await screen.findByLabelText("Buscar por nombre, email o teléfono"), { target: { value: "ñ&" } });
    await waitFor(() => expect(mockApi.get).toHaveBeenCalledWith("/users?role=client&search=%C3%B1%26"));
  });

  it("Editar abre la clienta completa, sin campos vacíos por null", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    const nombre = await screen.findByLabelText("Nombre completo");
    await waitFor(() => expect(nombre).toHaveValue("Camila Torres"));
    expect(screen.getByLabelText("Notas de salud")).toHaveValue("Hombro derecho");
    fireEvent.change(nombre, { target: { value: "Camila Torres Ruiz" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/users/u1", expect.objectContaining({
      displayName: "Camila Torres Ruiz", dateOfBirth: "1996-03-18", emergencyContactName: "", role: "client",
    })));
  });

  it("si no se puede eliminar, dice por qué", async () => {
    mockApi.delete.mockRejectedValue({ response: { data: { message: "Tiene membresías activas" } } });
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar clienta" }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ description: "Tiene membresías activas" })));
  });

  it("?birthday=month muestra a las cumpleañeras del mes y se puede quitar", async () => {
    renderAdmin(<ClientsList />, { route: "/admin/clients?birthday=month", path: "/admin/clients" });
    expect(await screen.findByText("Cumpleañeras de septiembre")).toBeInTheDocument();
    expect(await screen.findByText("Andrea Martínez")).toBeInTheDocument();
    expect(screen.queryByText("Camila Torres")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtro" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/clients"));
  });
});
```

Crear `src/pages/admin/staff/InstructorsList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import InstructorsList from "./InstructorsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/instructors": { data: [
      { id: "i1", displayName: "Fer Salinas", email: "fer@hive.mx", specialties: ["Reformer", "Tower"], isActive: true, photoUrl: null },
      { id: "i2", displayName: "Carla Méndez", email: null, specialties: "Mat", isActive: false, photoUrl: null },
    ] },
  });
});

describe("Personas · Coaches", () => {
  it("una tarjeta por coach con especialidades y estado", async () => {
    renderAdmin(<InstructorsList />, { route: "/admin/staff" });
    const fer = (await screen.findByRole("heading", { name: "Fer Salinas" })).closest("article")!;
    expect(within(fer).getByText("Reformer")).toBeInTheDocument();
    expect(within(fer).getByText("Activa")).toBeInTheDocument();
    const carla = screen.getByRole("heading", { name: "Carla Méndez" }).closest("article")!;
    expect(within(carla).getByText("Inactiva")).toBeInTheDocument();
    fireEvent.keyDown(within(fer).getByRole("button", { name: "Acciones de Fer Salinas" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(await screen.findByText("Editar instructora")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/clients/ClientsList.test.tsx src/pages/admin/staff/InstructorsList.test.tsx` → FAIL.

- [ ] **Step 2: Crear `ClientEditSheet`**

`src/components/admin/ClientEditSheet.tsx`:

```tsx
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { ErrorState } from "@/components/app/AppShell";

export const editSchema = z.object({
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  displayName: z.string().min(1, "Nombre requerido"),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  acceptsCommunications: z.boolean().default(true),
});
export type EditFormData = z.infer<typeof editSchema>;

/** Del objeto del servidor al formulario: sin null (zod los rechaza) y la fecha en YYYY-MM-DD. */
export function toFormValues(u: Record<string, any>): EditFormData {
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    email: s(u.email),
    phone: s(u.phone),
    displayName: s(u.displayName ?? u.display_name),
    dateOfBirth: s(u.dateOfBirth ?? u.date_of_birth).slice(0, 10),
    emergencyContactName: s(u.emergencyContactName ?? u.emergency_contact_name),
    emergencyContactPhone: s(u.emergencyContactPhone ?? u.emergency_contact_phone),
    healthNotes: s(u.healthNotes ?? u.health_notes),
    acceptsCommunications: (u.acceptsCommunications ?? u.accepts_communications) !== false,
  };
}

const LEGEND = "mb-3 text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted";

type ClientEditSheetProps = { clientId: string | null; open: boolean; onOpenChange: (open: boolean) => void };

/* "Editar clienta" (spec §5.11 y §5.13). Carga la clienta completa: la lista
   sólo trae nombre, email y teléfono, y antes el formulario abría vacío. */
export default function ClientEditSheet({ clientId, open, onOpenChange }: ClientEditSheetProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery<Record<string, any>>({
    queryKey: ["client", clientId],
    queryFn: async () => (await api.get(`/users/${clientId}`)).data,
    enabled: open && !!clientId,
  });
  const user = data?.data ?? data;
  const form = useForm<EditFormData>({ resolver: zodResolver(editSchema) });
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = form;

  useEffect(() => {
    if (open && user?.id) reset(toFormValues(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const mutation = useMutation({
    mutationFn: (d: EditFormData) => api.put(`/users/${clientId}`, { ...d, role: "client" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", clientId] });
      toast({ title: "Clienta actualizada" });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast({ title: "No se pudo actualizar", description: e?.response?.data?.message ?? "Revisa los datos e intenta de nuevo.", variant: "destructive" }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Editar clienta</SheetTitle>
          <SheetDescription>Actualiza los datos del expediente de {user?.displayName ?? user?.display_name ?? "la clienta"}.</SheetDescription>
        </SheetHeader>
        {isError ? (
          <ErrorState title="No pudimos cargar a la clienta" onRetry={() => refetch()} />
        ) : isLoading || !user ? (
          <div className="mt-6 space-y-3"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-24 w-full" /></div>
        ) : (
          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="mt-6 flex flex-col gap-6">
            <fieldset>
              <legend className={LEGEND}>Datos</legend>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-name">Nombre completo</Label>
                  <Input id="edit-name" {...register("displayName")} />
                  {errors.displayName && <p className="text-[13px] text-danger">{errors.displayName.message}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Fecha de nacimiento</Label>
                  <DatePicker value={watch("dateOfBirth") ?? ""} onChange={(v: string) => setValue("dateOfBirth", v, { shouldDirty: true })} />
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend className={LEGEND}>Contacto</legend>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" {...register("email")} readOnly aria-describedby="edit-email-help" className="bg-sunken" />
                  <p id="edit-email-help" className="text-[0.75rem] text-ink-muted">El correo no se puede cambiar desde aquí.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-phone">Teléfono</Label>
                  <Input id="edit-phone" {...register("phone")} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-em-name">Contacto de emergencia</Label>
                    <Input id="edit-em-name" placeholder="Nombre" {...register("emergencyContactName")} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-em-phone">Teléfono emergencia</Label>
                    <Input id="edit-em-phone" {...register("emergencyContactPhone")} />
                  </div>
                </div>
              </div>
            </fieldset>
            <fieldset>
              <legend className={LEGEND}>Salud</legend>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-health">Notas de salud</Label>
                <Textarea id="edit-health" rows={3} placeholder="Lesiones, condiciones..." {...register("healthNotes")} />
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : "Actualizar"}</Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

(El correo queda de sólo lectura porque el servidor ignora el cambio: antes el campo parecía editable y no pasaba nada.)

- [ ] **Step 3: Crear `PersonasTabs`**

`src/pages/admin/clients/PersonasTabs.tsx`:

```tsx
import SectionTabs from "@/components/admin/SectionTabs";
import { FEATURES } from "@/config/features";

export default function PersonasTabs() {
  return (
    <SectionTabs
      aria-label="Secciones de Personas"
      tabs={[
        { label: "Clientas", to: "/admin/clients" },
        ...(FEATURES.visits ? [{ label: "Visitas", to: "/admin/visitas" }] : []),
        { label: "Coaches", to: "/admin/staff" },
      ]}
    />
  );
}
```

- [ ] **Step 4: Clientas**

En `ClientsList.tsx`:
1. Borrar `editSchema`, `EditFormData`, `interface Client extends EditFormData` (dejar `type Client = { id: string; displayName: string; email?: string | null; phone?: string | null; role?: string; createdAt?: string }`), `editForm`, `updateMutation`, `openEdit`, `onEditSubmit` y el Sheet "Editar clienta" (L342-407). Estado nuevo: `const [editId, setEditId] = useState<string | null>(null);`. Al final del JSX, junto a `{dialog}`: `<ClientEditSheet clientId={editId} open={!!editId} onOpenChange={(o) => { if (!o) setEditId(null); }} />`.
2. Imports: `ClientEditSheet`, `PersonasTabs`, `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `useSearchParamState`, `waLink`, `MessageCircle`, `Cake` de `lucide-react`. Quitar `SectionTabs`.
3. Consulta de clientas (L119-122): la URL pasa a `` `/users?role=client&search=${encodeURIComponent(debouncedSearch)}` ``.
4. Filtro de cumpleaños:

```tsx
const [birthday, setBirthday] = useSearchParamState("birthday");
const month = new Date().getMonth() + 1;
const monthName = format(new Date(), "MMMM", { locale: es });
const birthdaysQ = useQuery<{ data: { id: string; displayName: string; email?: string | null; phone?: string | null; day: number; month: number }[] }>({
  queryKey: ["admin-birthdays", month],
  queryFn: async () => (await api.get(`/admin/birthdays?month=${month}`)).data,
  enabled: birthday === "month",
});
const rows: (Client & { sub?: string })[] = birthday === "month"
  ? (birthdaysQ.data?.data ?? []).map((b) => ({ id: b.id, displayName: b.displayName, email: b.email, phone: b.phone, sub: `Cumple el ${b.day} de ${monthName}` }))
  : filteredClients;
```

(importar `es` de `date-fns/locale`). La tabla recorre `rows` en vez de `filteredClients`.
5. Encabezado (L207-226) → `<AdminPage>` + `<AdminPageHeader kicker="Personas" title="Clientas" actions={<><PersonasTabs /><Button onClick={() => setManualOpen(true)}><UserPlus size={16} aria-hidden="true" />Nueva clienta</Button></>} />`.
6. Búsqueda (L229-237):

```tsx
<div className="flex flex-wrap items-center gap-4">
  <div className="relative w-full max-w-[480px]">
    <Label htmlFor="clients-search" className="sr-only">Buscar por nombre, email o teléfono</Label>
    <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
    <Input id="clients-search" type="search" className="h-12 pl-10" placeholder="Buscar por nombre, email o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
  </div>
  <span className="text-sm text-ink-muted"><span className="nums font-extrabold text-ink">{clients.length}</span> clientas registradas</span>
</div>
{birthday === "month" && (
  <Panel className="flex flex-wrap items-center gap-3 px-5 py-3">
    <Cake size={18} aria-hidden="true" />
    <span className="flex-1 text-sm font-bold">Cumpleañeras de {monthName}</span>
    <Button variant="ghost" onClick={() => setBirthday(null)}>Quitar filtro</Button>
  </Panel>
)}
```

7. Tabla (L240-338): contenedor → `<Panel className="overflow-hidden">`. Estados de error y vacío: iguales. Celdas:
   - Nombre: `<PersonCell name={c.displayName} sub={c.sub} />`.
   - Email: `hidden md:table-cell text-ink-muted`.
   - Teléfono: `nums`, con "—" si no hay.
   - Clienta desde: `hidden lg:table-cell text-ink-muted`.
   - Acciones: `<div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>`, que contiene:
     - WhatsApp, sólo si `waLink(c.phone)`: `<a href={waLink(c.phone)!} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${c.displayName}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"><MessageCircle size={18} /></a>`;
     - el `DropdownMenu` actual, con disparador `aria-label={`Acciones de ${c.displayName}`}`, "Editar" → `setEditId(c.id)` y "Eliminar" → `askDelete(c)`.
8. `deleteMutation` (L147-153) agrega:

```tsx
onError: (e: any) =>
  toast({ title: "No se pudo eliminar", description: e?.response?.data?.message ?? "Revisa si tiene membresías o reservas activas.", variant: "destructive" }),
```

9. `manualMutation` → en `onError`, la descripción pasa a `err?.response?.data?.message ?? err?.response?.data?.error ?? "Revisa los datos e intenta de nuevo"`.

- [ ] **Step 5: Coaches en tarjetas**

En `InstructorsList.tsx`:
1. Encabezado (L201-214) → `<AdminPage>` + `<AdminPageHeader kicker="Personas" title="Coaches" actions={<><PersonasTabs /><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nueva coach</Button></>} />`.
2. El aviso de magic link (L216-243) se queda. Su contenedor pasa a `rounded-2xl border border-line bg-surface px-5 py-3.5`.
3. La tabla (L273-329) se cambia por una cuadrícula de tarjetas:

```tsx
<div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
  {isLoading
    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[300px] rounded-2xl" />)
    : instructors.map((ins: Instructor) => {
        const specs = normalizeSpecialties(ins.specialties);
        return (
          <article key={ins.id} className={cn("overflow-hidden rounded-2xl border border-line bg-surface", ins.isActive === false && "opacity-70")}>
            <div className="relative h-[200px] bg-sunken">
              {ins.photoUrl ? (
                <img src={ins.photoUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${clampFocus(ins.photoFocusX)}% ${clampFocus(ins.photoFocusY)}%` }} />
              ) : (
                <span aria-hidden="true" className="grid h-full place-items-center font-display text-[2.75rem] font-extrabold text-line-strong">
                  {initials(ins.displayName)}
                </span>
              )}
              <div className="absolute right-2 top-2">
                {/* el DropdownMenu actual (L313-324), con el disparador así: */}
                {/* <Button variant="outline" size="icon" className="bg-surface" aria-label={`Acciones de ${ins.displayName}`}><MoreHorizontal size={18} /></Button> */}
              </div>
            </div>
            <div className="flex flex-col gap-2.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="truncate text-base font-extrabold">{ins.displayName}</h2>
                {ins.isActive === false ? <StatusDot tone="muted">Inactiva</StatusDot> : <StatusDot tone="success">Activa</StatusDot>}
              </div>
              <p className="truncate text-[13px] text-ink-muted">{ins.email || "Sin email"}</p>
              <div className="flex min-h-[24px] flex-wrap gap-1.5">
                {specs.map((s) => <span key={s} className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{s}</span>)}
              </div>
            </div>
          </article>
        );
      })}
</div>
```

(Imports: `initials` de `@/components/admin/PersonCell`, `StatusDot`, `cn`, `AdminPage`, `AdminPageHeader`, `PersonasTabs`. Quitar `Table*`, `Badge` y `SectionTabs` si quedan sin uso.)

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run src/pages/admin/clients/ClientsList.test.tsx src/pages/admin/staff/InstructorsList.test.tsx`
Expected: PASS.

- [ ] **Step 7: Comprobación estándar y commit**

```bash
git add src/components/admin/ClientEditSheet.tsx src/pages/admin/clients src/pages/admin/staff
git commit -m "feat(panel): Clientas con WhatsApp y cumpleañeras, Coaches en tarjetas y editar clienta completo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Personas · Ficha de clienta

**Files:**
- Modify: `src/pages/admin/clients/ClientDetail.tsx`:
  - contenedor y encabezado (L286-374);
  - lista de pestañas (L376-384) y pestaña Lealtad (L584-649);
  - consulta de pagos (L192-196);
  - columna derecha nueva.
  
  **Se conservan** todas las pestañas, sus tablas, la paginación, el diálogo "Editar membresía" (L719-813), la descarga del PDF de la responsiva, la foto y sus mutaciones.
- Test: `src/pages/admin/clients/ClientDetail.test.tsx`

**Interfaces:**
- Consumes: `ClientEditSheet` (Task 12), `useCanSeeFinance`, `FEATURES`, `AdminPage`, `Panel`, `PanelLink`, `StatusDot`, `Avatar`, `waLink`, `/admin/payments?clienta=` (Task 10).

- [ ] **Step 1: Prueba que falla**

Crear `src/pages/admin/clients/ClientDetail.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ClientDetail from "./ClientDetail";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const USER = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678", createdAt: "2026-03-10T00:00:00", onboardingCompleted: true };
const MEM = { id: "m1", planName: "Paquete 8 clases", status: "active", startDate: "2026-09-25", endDate: "2026-10-25", classesRemaining: 3, classLimit: 8 };
const booking = (id: string, start: string, status: string) => ({ id, className: `Clase ${id}`, startTime: start, status });

function tabla(over: Record<string, unknown> = {}) {
  return {
    "/admin/stats": { pendingAlerts: 0 },
    "/users/u1": { data: USER },
    "/bookings?userId=u1": { data: [
      booking("b0", "2026-09-20T07:00:00", "checked_in"),
      booking("b3", "2026-10-01T18:00:00", "confirmed"),
      booking("b1", "2026-09-26T11:00:00", "confirmed"),
      booking("b2", "2026-09-29T07:00:00", "waitlist"),
      booking("b4", "2026-10-03T09:00:00", "confirmed"),
      booking("b5", "2026-09-27T09:00:00", "cancelled"),
    ] },
    "/memberships?userId=u1": { data: [MEM] },
    "/payments?userId=u1": { data: [] },
    "/loyalty/points/u1": { data: { balance: 120 } },
    "/admin/users/u1/waiver": { data: { signed: true, signedAt: "2026-03-12T00:00:00", fullName: "Camila Torres" } },
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Ficha de clienta", () => {
  it("la dueña ve Editar, Pagos y la membresía con Renovar; Lealtad no aparece", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    expect(await screen.findByRole("heading", { level: 1, name: "Camila Torres" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editar datos/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Pagos/ })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Lealtad/ })).toBeNull();
    const mem = screen.getByRole("region", { name: "Membresía" });
    expect(within(mem).getByText("3")).toBeInTheDocument();
    expect(within(mem).getByRole("link", { name: "Renovar" })).toHaveAttribute("href", "/admin/payments?clienta=u1");
  });

  it("próximas clases: sólo futuras, confirmadas o en espera, en orden y hasta 3", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const prox = await screen.findByRole("region", { name: "Próximas clases" });
    const items = await within(prox).findAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining("Clase b1"),
      expect.stringContaining("Clase b2"),
      expect.stringContaining("Clase b3"),
    ]);
  });

  it("recepción no ve Pagos ni Editar, ni pide los pagos", async () => {
    loginAs("reception");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    await screen.findByRole("heading", { level: 1, name: "Camila Torres" });
    expect(screen.queryByRole("tab", { name: /Pagos/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Editar datos/ })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalledWith("/payments?userId=u1");
  });

  it("sin membresía activa lo dice y ofrece vender un plan", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/memberships?userId=u1": { data: [] } }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    expect(within(mem).getByText("Sin membresía activa")).toBeInTheDocument();
    expect(within(mem).getByRole("link", { name: "Vender plan" })).toHaveAttribute("href", "/admin/payments?clienta=u1");
  });

  it("Editar datos abre el panel de edición", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    fireEvent.click(await screen.findByRole("button", { name: /Editar datos/ }));
    expect(await screen.findByText("Editar clienta")).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/admin/clients/ClientDetail.test.tsx` → FAIL.

- [ ] **Step 2: Cambios en `ClientDetail.tsx`**

1. Imports: `useCanSeeFinance`, `FEATURES`, `ClientEditSheet`, `AdminPage`, `Panel`, `PanelLink`, `StatusDot`, `waLink`, `Pencil` (ya está), `Link`.
2. Arriba del componente: `const showFinance = useCanSeeFinance();` y `const [editOpen, setEditOpen] = useState(false);`.
3. Consulta de pagos (L192-196): `enabled: !!id && showFinance`.
4. Contenedor (L286): `div.admin-page max-w-5xl` → `<AdminPage>`.
5. Encabezado (L302-374). Se conserva el esqueleto de carga, el avatar con `ZoomableImage`, el botón de cámara y su input. Cambia el acomodo:

```tsx
<div className="flex flex-col gap-5 lg:flex-row lg:items-center">
  {/* avatar actual (L313-328), a 88 px: className de la caja "h-[88px] w-[88px]" */}
  <div className="min-w-0 flex-1">
    <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
      {u?.createdAt ? `Clienta desde ${format(new Date(u.createdAt), "MMMM yyyy", { locale: es })}` : "Clienta"}
    </p>
    <h1 className="mt-2 break-words font-display text-[1.5rem] font-extrabold uppercase leading-[1.05] lg:text-[1.75rem]">{u?.displayName ?? u?.display_name}</h1>
    <p className="mt-1.5 text-sm text-ink-muted">{[u?.email, u?.phone].filter(Boolean).join(" · ")}</p>
    {/* los badges actuales (L335-355), con Badge variant="secondary" en vez de las clases de color a mano */}
  </div>
  <div className="flex flex-wrap gap-2">
    {u?.phone && (
      <>
        <Button asChild variant="outline"><a href={`tel:${u.phone}`}><Phone size={16} aria-hidden="true" />Llamar</a></Button>
        {waLink(u.phone) && (
          <Button asChild variant="outline"><a href={waLink(u.phone)!} target="_blank" rel="noreferrer"><MessageCircle size={16} aria-hidden="true" />WhatsApp</a></Button>
        )}
      </>
    )}
    {showFinance && (
      <Button onClick={() => setEditOpen(true)}><Pencil size={16} aria-hidden="true" />Editar datos</Button>
    )}
  </div>
</div>
```

(Importar `format` de `date-fns` y `es` de `date-fns/locale` si faltan. `phoneDigits` y `waNumber` se borran: ahora es `waLink`.)

6. Debajo del encabezado, envolver `Tabs` en la cuadrícula de dos columnas y agregar la columna derecha:

```tsx
<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
  <Tabs defaultValue="profile" className="min-w-0">
    <TabsList>
      <TabsTrigger value="profile">Perfil</TabsTrigger>
      <TabsTrigger value="memberships">Membresías <span className="nums ml-1 text-ink-muted">{membershipRows.length}</span></TabsTrigger>
      <TabsTrigger value="bookings">Reservas <span className="nums ml-1 text-ink-muted">{bookingRows.length}</span></TabsTrigger>
      {showFinance && <TabsTrigger value="payments">Pagos <span className="nums ml-1 text-ink-muted">{paymentRows.length}</span></TabsTrigger>}
      {FEATURES.loyalty && <TabsTrigger value="loyalty">Lealtad</TabsTrigger>}
      <TabsTrigger value="waiver">Responsiva</TabsTrigger>
    </TabsList>
    {/* TabsContent de profile, memberships, bookings y waiver: iguales.
        TabsContent "payments": envolver en {showFinance && ( … )}.
        TabsContent "loyalty": envolver en {FEATURES.loyalty && ( … )}. */}
  </Tabs>

  <aside className="flex flex-col gap-4">
    <MembershipCard mem={activeMem} clientId={id!} showFinance={showFinance} onEdit={() => activeMem && openEditMem(activeMem)} />
    <UpcomingCard bookings={bookingRows} />
    <Panel aria-label="Responsiva" className="flex items-center justify-between px-5 py-4">
      <span className="text-sm font-bold">Responsiva</span>
      {waiver?.signed || waiver?.signedAt || waiver?.signed_at
        ? <StatusDot tone="success">Firmada{(waiver?.signedAt ?? waiver?.signed_at) ? ` ${format(new Date(waiver.signedAt ?? waiver.signed_at), "d MMM", { locale: es })}` : ""}</StatusDot>
        : <StatusDot tone="muted">Pendiente</StatusDot>}
    </Panel>
  </aside>
</div>
<ClientEditSheet clientId={id ?? null} open={editOpen} onOpenChange={setEditOpen} />
```

(Usar el mismo criterio que hoy usa la pestaña Responsiva (L655-660) para decidir si está firmada; si allí se llama distinto el campo, usar ese.)

7. Arriba de `ClientDetail`, los dos componentes de la columna:

```tsx
function MembershipCard({ mem, clientId, showFinance, onEdit }: { mem: any; clientId: string; showFinance: boolean; onEdit: () => void }) {
  if (!mem) {
    return (
      <Panel aria-label="Membresía" className="flex flex-col gap-3 p-5">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Membresía</p>
        <p className="text-sm font-bold">Sin membresía activa</p>
        {showFinance && (
          <Link to={`/admin/payments?clienta=${clientId}`} className={cn(buttonVariants(), "no-underline")}>Vender plan</Link>
        )}
      </Panel>
    );
  }
  const unlimited = isUnlimited(mem.classesRemaining);
  const limit = Number(mem.classLimit ?? mem.class_limit) || null;
  const left = Number(mem.classesRemaining) || 0;
  const end = mem.endDate ? new Date(mem.endDate) : null;
  const daysLeft = end ? Math.ceil((end.getTime() - Date.now()) / 86_400_000) : null;
  return (
    <Panel aria-label="Membresía" className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Membresía</p>
        <StatusDot tone="success">Activa</StatusDot>
      </div>
      <p className="text-base font-extrabold">{mem.planName}</p>
      {unlimited ? (
        <p className="font-display text-xl font-semibold">Clases ilimitadas</p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="nums font-display text-[2.5rem] font-semibold leading-none">{left}</span>
            <span className="text-sm text-ink-muted">{limit ? `de ${limit} clases restantes` : "clases restantes"}</span>
          </p>
          {limit && (
            <span role="img" aria-label={`Quedan ${left} de ${limit} clases`} className="block h-2 overflow-hidden rounded-full bg-line">
              <span className="block h-full rounded-full bg-ink" style={{ width: `${Math.min(100, Math.round((left / limit) * 100))}%` }} />
            </span>
          )}
        </>
      )}
      {end && (
        <p className="text-[13px] text-ink-muted">
          Vence el {format(end, "d 'de' MMMM", { locale: es })}
          {daysLeft != null && daysLeft >= 0 ? ` · en ${daysLeft} ${daysLeft === 1 ? "día" : "días"}` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onEdit}><Pencil size={16} aria-hidden="true" />Editar</Button>
        {showFinance && (
          <Link to={`/admin/payments?clienta=${clientId}`} className={cn(buttonVariants(), "no-underline")}>Renovar</Link>
        )}
      </div>
    </Panel>
  );
}

function UpcomingCard({ bookings }: { bookings: any[] }) {
  const now = Date.now();
  const next = bookings
    .filter((b) => (b.status === "confirmed" || b.status === "waitlist") && b.startTime && new Date(b.startTime).getTime() >= now)
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 3);
  return (
    <Panel aria-label="Próximas clases" className="px-5 py-4">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[15px] font-extrabold">Próximas clases</h2>
      </div>
      {next.length === 0 ? (
        <p className="py-2 text-[13px] text-ink-muted">No tiene clases próximas.</p>
      ) : (
        <ul>
          {next.map((b) => (
            <li key={b.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-2.5 first:border-t-0">
              <span className="nums w-[76px] text-[13px] font-extrabold">{format(new Date(b.startTime), "EEE HH:mm", { locale: es })}</span>
              <span className="truncate text-sm font-semibold">{b.className ?? "Clase"}</span>
              {b.status === "waitlist"
                ? <span className="rounded-full bg-sunken px-2 py-0.5 text-[0.75rem] font-extrabold">En espera</span>
                : <StatusDot tone="success">Confirmada</StatusDot>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
```

(Imports para estas funciones: `buttonVariants` de `@/components/ui/button`, `cn`. `isUnlimited` ya existe en el archivo, L44-45.)

8. **No** poner la palabra "Conexión" en ningún texto nuevo: `src/pages/client/Dashboard.rings.test.ts` revisa que este archivo no la tenga.

- [ ] **Step 3: Correr las pruebas**

Run: `npx vitest run src/pages/admin/clients/ src/pages/client/Dashboard.rings.test.ts`
Expected: PASS.

- [ ] **Step 4: Comprobación estándar y commit**

```bash
git add src/pages/admin/clients/ClientDetail.tsx src/pages/admin/clients/ClientDetail.test.tsx
git commit -m "feat(panel): ficha de clienta con membresía, próximas clases y editar datos

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 14: Membresías, Planes y Descuentos

**Files:**
- Create: `src/pages/admin/memberships/membership-helpers.ts`, `src/pages/admin/discount-codes/discount-helpers.ts`, `src/pages/admin/catalog-helpers.test.ts`, `src/pages/admin/memberships/MembershipsList.test.tsx`, `src/pages/admin/plans/PlansList.test.tsx`, `src/pages/admin/discount-codes/DiscountCodes.test.tsx`
- Modify:
  - `src/pages/admin/memberships/MembershipsList.tsx`: celdas de la tabla L225-288; `MembershipsList` L293-341.
  - `src/pages/admin/plans/PlansList.tsx`: la tabla L247-336 pasa a tarjetas.
  - `src/pages/admin/discount-codes/DiscountCodes.tsx`: encabezado L229-240; celdas L258-307.
  
  Se conservan todos los diálogos, menús y mutaciones.

**Interfaces:**
- Consumes: `useSearchParamState`, `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `StatusDot`, `Badge`.
- Produces:
  - `expiresSoon(endDate?: string | null, now?: Date, days?: number): boolean`
  - `usageInfo(usesCount: number, maxUses: number | null | undefined): { label: string; pct: number | null; exhausted: boolean }`
  - `/admin/memberships?tab=expiring` abre "Por vencer" (lo usa Inicio).

- [ ] **Step 1: Pruebas de los ayudantes**

Crear `src/pages/admin/catalog-helpers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { expiresSoon } from "./memberships/membership-helpers";
import { usageInfo } from "./discount-codes/discount-helpers";

describe("expiresSoon", () => {
  const now = new Date(2026, 8, 25, 10, 0);
  it("vence en 7 días o menos, sin haber vencido", () => {
    expect(expiresSoon("2026-09-28", now)).toBe(true);
    expect(expiresSoon("2026-09-25", now)).toBe(true);
    expect(expiresSoon("2026-10-02", now)).toBe(true);
    expect(expiresSoon("2026-10-03", now)).toBe(false);
    expect(expiresSoon("2026-09-24", now)).toBe(false);
    expect(expiresSoon(null, now)).toBe(false);
    expect(expiresSoon("no-es-fecha", now)).toBe(false);
  });
});

describe("usageInfo", () => {
  it("con tope: cifra, porcentaje y agotado", () => {
    expect(usageInfo(7, 50)).toEqual({ label: "7/50", pct: 14, exhausted: false });
    expect(usageInfo(50, 50)).toEqual({ label: "50/50 · agotado", pct: 100, exhausted: true });
  });
  it("sin tope: infinito", () => {
    expect(usageInfo(23, null)).toEqual({ label: "23/∞", pct: null, exhausted: false });
  });
});
```

Run: `npx vitest run src/pages/admin/catalog-helpers.test.ts` → FAIL.

- [ ] **Step 2: Escribir los ayudantes**

`src/pages/admin/memberships/membership-helpers.ts`:

```ts
import { addDays, parseISO, startOfDay } from "date-fns";

/** ¿Vence hoy o en los próximos `days` días? (spec §5.14: "· vence pronto"). */
export function expiresSoon(endDate?: string | null, now: Date = new Date(), days = 7): boolean {
  if (!endDate) return false;
  const end = startOfDay(parseISO(String(endDate).slice(0, 10)));
  if (Number.isNaN(end.getTime())) return false;
  const today = startOfDay(now);
  return end >= today && end <= addDays(today, days);
}
```

`src/pages/admin/discount-codes/discount-helpers.ts`:

```ts
/** Usos de un código: "7/50", "50/50 · agotado" o "23/∞". */
export function usageInfo(usesCount: number, maxUses: number | null | undefined) {
  const used = Math.max(0, Number(usesCount) || 0);
  if (!maxUses) return { label: `${used}/∞`, pct: null, exhausted: false };
  const exhausted = used >= maxUses;
  return {
    label: `${used}/${maxUses}${exhausted ? " · agotado" : ""}`,
    pct: Math.min(100, Math.round((used / maxUses) * 100)),
    exhausted,
  };
}
```

Run: `npx vitest run src/pages/admin/catalog-helpers.test.ts` → PASS.

- [ ] **Step 3: Pruebas de las tres pantallas**

`src/pages/admin/memberships/MembershipsList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import MembershipsList from "./MembershipsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const m = (id: string, userName: string, status: string, endDate: string | null, classesRemaining: number | null, classLimit: number | null) =>
  ({ id, userId: id, userName, planId: "p", planName: "Paquete 8 clases", classCategory: "studio", status, startDate: "2026-09-01", endDate, classesRemaining, classLimit });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/memberships?status=expiring": { data: [m("m2", "Daniela Pérez", "active", "2026-09-28", 2, 8)] },
    "/memberships?status=pending_payment": { data: [m("m3", "Sofía Gómez", "pending_payment", null, null, null), m("m4", "Lucía Navarro", "pending_payment", null, null, 12)] },
    "/memberships?status=active": { data: [] },
    "/memberships": { data: [m("m1", "Camila Torres", "active", "2026-10-25", 3, 8), m("m2", "Daniela Pérez", "active", "2026-09-28", 2, 8), m("m5", "Valeria Ruiz", "active", "2026-10-18", 9999, null)] },
  });
});
afterEach(() => vi.useRealTimers());

describe("Membresías", () => {
  it("cuenta por vencer y pendientes, y marca la que vence pronto", async () => {
    renderAdmin(<MembershipsList />, { route: "/admin/memberships" });
    expect(await screen.findByText("Camila Torres")).toBeInTheDocument();
    await waitFor(() => expect(within(screen.getByRole("tab", { name: /Pendientes/ })).getByText("2")).toBeInTheDocument());
    expect(within(screen.getByRole("tab", { name: /Por vencer/ })).getByText("1")).toBeInTheDocument();
    const daniela = screen.getByText("Daniela Pérez").closest("tr")!;
    expect(within(daniela).getByText("· vence pronto")).toBeInTheDocument();
    const valeria = screen.getByText("Valeria Ruiz").closest("tr")!;
    expect(within(valeria).getByText("Ilimitadas")).toBeInTheDocument();
  });

  it("?tab=expiring abre Por vencer y cambiar de pestaña cambia la URL", async () => {
    renderAdmin(<MembershipsList />, { route: "/admin/memberships?tab=expiring", path: "/admin/memberships" });
    expect(await screen.findByRole("tab", { name: /Por vencer/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Activas/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/memberships?tab=active"));
  });
});
```

`src/pages/admin/plans/PlansList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PlansList from "./PlansList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/plans": { data: [
      { id: "p8", name: "Paquete 8 clases", price: 1450, duration_days: 30, class_limit: 8, class_category: "studio", opening_price: 1250, is_active: true },
      { id: "pu", name: "Ilimitado mensual", price: 2680, duration_days: 30, class_limit: null, class_category: "reformer_tower", is_non_transferable: true, is_active: true },
      { id: "pm", name: "Muestra gratis", price: 0, duration_days: 7, class_limit: 1, class_category: "studio", is_non_repeatable: true, is_active: false },
    ] },
  });
});

describe("Planes", () => {
  it("tarjetas agrupadas por categoría con precio, reglas y estado", async () => {
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    expect(await screen.findByRole("heading", { name: "Studio" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reformer/Tower" })).toBeInTheDocument();
    const paquete = screen.getByRole("heading", { name: "Paquete 8 clases" }).closest("article")!;
    expect(within(paquete).getByText("$1,450")).toBeInTheDocument();
    expect(within(paquete).getByText("Apertura $1,250")).toBeInTheDocument();
    expect(within(paquete).getByText("8 clases · 30 días")).toBeInTheDocument();
    const ilimitado = screen.getByRole("heading", { name: "Ilimitado mensual" }).closest("article")!;
    expect(within(ilimitado).getByText("No transferible")).toBeInTheDocument();
    expect(within(ilimitado).getByText("Ilimitado · 30 días")).toBeInTheDocument();
    const muestra = screen.getByRole("heading", { name: "Muestra gratis" }).closest("article")!;
    expect(within(muestra).getByText("Inactivo")).toBeInTheDocument();
    fireEvent.keyDown(within(paquete).getByRole("button", { name: "Acciones de Paquete 8 clases" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar" }));
    expect(await screen.findByText("Editar plan")).toBeInTheDocument();
  });
});
```

`src/pages/admin/discount-codes/DiscountCodes.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import DiscountCodes from "./DiscountCodes";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/plans": { data: [] },
    "/discount-codes": { data: [
      { id: "d1", code: "HIVEAMIGA", discount_type: "fixed", discount_value: 150, uses_count: 50, max_uses: 50, channel: "membership", is_active: true },
      { id: "d2", code: "ONLINE75", discount_type: "fixed", discount_value: 75, uses_count: 23, max_uses: null, channel: "all", is_active: true },
    ] },
  });
});

describe("Descuentos", () => {
  it("muestra los usos, marca el agotado y copia el código", async () => {
    renderAdmin(<DiscountCodes />, { route: "/admin/discount-codes" });
    const amiga = (await screen.findByText("HIVEAMIGA")).closest("tr")!;
    expect(within(amiga).getByText("50/50 · agotado")).toBeInTheDocument();
    const online = screen.getByText("ONLINE75").closest("tr")!;
    expect(within(online).getByText("23/∞")).toBeInTheDocument();
    fireEvent.click(within(amiga).getByRole("button", { name: "Copiar HIVEAMIGA" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("HIVEAMIGA"));
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull(); // sin pestañas Reportes/Descuentos
  });
});
```

(Los nombres de campo del servidor de arriba — `uses_count`, `max_uses`, `discount_type`… — deben coincidir con lo que lee `normalizeCode` (L73-89). Si ahí se leen otros nombres, ajustar la simulación, no el componente.)

Run: `npx vitest run src/pages/admin/memberships src/pages/admin/plans src/pages/admin/discount-codes` → FAIL.

- [ ] **Step 4: Membresías**

En `MembershipsList.tsx`:
1. Imports: `AdminPage`, `AdminPageHeader`, `Panel`, `PersonCell`, `StatusDot`, `useSearchParamState`, `useQuery` (ya está), `{ expiresSoon } from "./membership-helpers"`.
2. Celdas de la tabla (L242-284). La tabla queda dentro de `<Panel className="overflow-hidden">` en vez de la tarjeta actual:
   - Cliente: `<PersonCell name={m.userName ?? m.userId} />`.
   - Plan: igual (nombre + categoría en gris).
   - Estado: reemplazar el `Badge` por `<MembershipState status={m.status} />`:

```tsx
function MembershipState({ status }: { status: string }) {
  const label = STATUS_LABELS[status as MembershipStatus] ?? status;
  if (status === "active") return <StatusDot tone="success">{label}</StatusDot>;
  if (status === "cancelled") return <StatusDot tone="danger">{label}</StatusDot>;
  if (status === "pending_payment" || status === "pending_activation") {
    return <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{label}</span>;
  }
  return <StatusDot tone="muted">{label}</StatusDot>;
}
```

   - Vigencia:

```tsx
<TableCell>
  {m.endDate ? (
    <span className="leading-tight">
      <span className="nums block text-sm font-bold">
        {formatDate(m.endDate)}
        {m.status === "active" && expiresSoon(m.endDate) && <span className="font-extrabold text-accent-strong"> · vence pronto</span>}
      </span>
      {m.startDate && <span className="block text-xs text-ink-muted">desde {formatDate(m.startDate)}</span>}
    </span>
  ) : <span className="text-sm text-ink-muted">Sin iniciar</span>}
</TableCell>
```

   - Clases (reemplaza `formatRemaining`, que se borra):

```tsx
<TableCell>
  {m.classesRemaining == null && !m.classLimit ? (
    <span className="text-sm text-ink-muted">—</span>
  ) : m.classesRemaining == null || m.classesRemaining >= 9999 ? (
    <span className="text-sm font-extrabold">Ilimitadas</span>
  ) : (
    <span className="flex items-center gap-2">
      {m.classLimit ? (
        <span aria-hidden="true" className="block h-1.5 w-14 overflow-hidden rounded-full bg-line">
          <span className="block h-full bg-ink" style={{ width: `${Math.min(100, Math.round((m.classesRemaining / m.classLimit) * 100))}%` }} />
        </span>
      ) : null}
      <span className="nums text-sm font-extrabold">{m.classesRemaining}{m.classLimit ? `/${m.classLimit}` : ""}</span>
    </span>
  )}
</TableCell>
```

   - Menú: igual. El disparador lleva `aria-label={`Acciones de la membresía de ${m.userName ?? "la clienta"}`}`.
3. `MembershipsList` (L293-341):

```tsx
const TABS = ["all", "active", "expiring", "pending"] as const;

const MembershipsList = () => {
  const [tabParam, setTab] = useSearchParamState("tab");
  const tab = (TABS as readonly string[]).includes(tabParam ?? "") ? tabParam! : "all";
  // Misma llave que MembershipTable (["memberships", status]): no duplica peticiones.
  const expiringQ = useQuery<{ data: unknown[] }>({
    queryKey: ["memberships", "expiring"],
    queryFn: async () => (await api.get("/memberships?status=expiring")).data,
  });
  const pendingQ = useQuery<{ data: unknown[] }>({
    queryKey: ["memberships", "pending_payment"],
    queryFn: async () => (await api.get("/memberships?status=pending_payment")).data,
  });
  const expiring = expiringQ.data?.data?.length ?? 0;
  const pending = pendingQ.data?.data?.length ?? 0;
  const Count = ({ n }: { n: number }) =>
    n > 0 ? <span className="nums ml-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.75rem] font-extrabold leading-none text-ink">{n}</span> : null;

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader kicker="Más" title="Membresías" subtitle="Activa, cancela o ajusta la vigencia de las membresías de tus clientas." />
          <Tabs value={tab} onValueChange={(v) => setTab(v === "all" ? null : v)}>
            <TabsList>
              <TabsTrigger value="all">Todas</TabsTrigger>
              <TabsTrigger value="active">Activas</TabsTrigger>
              <TabsTrigger value="expiring">Por vencer<Count n={expiring} /></TabsTrigger>
              <TabsTrigger value="pending">Pendientes<Count n={pending} /></TabsTrigger>
            </TabsList>
            {/* Los cuatro TabsContent con <MembershipTable …/>: iguales que hoy (L309-335). */}
          </Tabs>
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};
```



- [ ] **Step 5: Planes en tarjetas**

En `PlansList.tsx`:
1. Encabezado (L247-251): `<AdminPage>` + `<AdminPageHeader kicker="Más" title="Planes" subtitle="Los paquetes que vendes. Los cambios aplican a ventas nuevas; lo ya vendido no se toca." actions={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo plan</Button>} />`.
2. La tabla (L269-334) se cambia por grupos de tarjetas:

```tsx
{isLoading ? (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
) : (
  CATEGORIES.map((cat) => {
    const list = plans.filter((p) => (p.classCategory ?? "studio") === cat.value);
    if (!list.length) return null;
    return (
      <section key={cat.value} className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-base font-extrabold">{cat.label}</h2>
          <span className="text-[13px] text-ink-muted">{list.length} {list.length === 1 ? "plan" : "planes"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {list.map((p) => {
            const rules = [
              p.isNonTransferable && "No transferible",
              p.isNonRepeatable && "No repetible",
              p.morningOnly && "Sólo mañanas",
              p.isVisitPack && "Paquete de visitas",
            ].filter(Boolean) as string[];
            return (
              <article key={p.id} className={cn("flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5", !p.isActive && "opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-extrabold leading-snug">{p.name}</h3>
                  {/* el DropdownMenu actual (L309-329), con el disparador:
                      <Button variant="ghost" size="icon" aria-label={`Acciones de ${p.name}`}><MoreHorizontal size={18} /></Button> */}
                </div>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <span className="nums font-display text-[1.625rem] font-semibold leading-none">{formatMXN(Number(p.price))}</span>
                  {p.openingPrice != null && <span className="nums text-[0.75rem] font-bold text-ink-muted">Apertura {formatMXN(Number(p.openingPrice))}</span>}
                </div>
                <p className="text-[13px] text-ink-muted">
                  {p.classLimit == null ? "Ilimitado" : `${p.classLimit} ${p.classLimit === 1 ? "clase" : "clases"}`} · {p.durationDays} días
                </p>
                <div className="flex min-h-[24px] flex-wrap gap-1.5">
                  {rules.map((r) => <span key={r} className="rounded-full border border-line px-2.5 py-0.5 text-[0.75rem] font-bold text-ink-muted">{r}</span>)}
                </div>
                <div className="border-t border-line pt-2.5">
                  {p.isActive ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  })
)}
```

(`normalizePlanRow` ya da `classCategory`, `openingPrice`, `morningOnly`, `isVisitPack`, `isNonTransferable`, `isNonRepeatable`, `isActive`, `classLimit`, `durationDays`. Imports: `StatusDot`, `cn`, `AdminPage`, `AdminPageHeader`; quitar `Table*` y `CategoryPill` si quedan sin uso.)

- [ ] **Step 6: Descuentos**

En `DiscountCodes.tsx`:
1. Encabezado (L229-240): quitar `SectionTabs` (Reportes · Lealtad · Descuentos: las dos pantallas ya están en el menú) y poner `<AdminPage>` + `<AdminPageHeader kicker="Más" title="Descuentos" subtitle="Cupones que las clientas escriben al pagar: porcentaje o monto fijo, con límites por plan, canal, usos o fecha." actions={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo código</Button>} />`.
2. Tabla dentro de `<Panel className="overflow-hidden">`. Celdas:
   - Código:

```tsx
<TableCell>
  <span className="inline-flex items-center gap-1.5">
    <span className="rounded-lg border border-dashed border-line-strong bg-canvas px-2.5 py-1 font-mono text-sm font-extrabold tracking-[0.04em]">{c.code}</span>
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Copiar ${c.code}`}
      onClick={async () => {
        try { await navigator.clipboard.writeText(c.code); toast({ title: "Código copiado" }); }
        catch { toast({ title: "No se pudo copiar", variant: "destructive" }); }
      }}
    >
      <Copy size={16} />
    </Button>
  </span>
</TableCell>
```

   - Usos:

```tsx
<TableCell>
  {(() => {
    const u = usageInfo(c.usesCount, c.maxUses);
    return (
      <span className="flex w-[120px] flex-col gap-1">
        <span className="nums text-[13px] font-extrabold">{u.label}</span>
        {u.pct != null && (
          <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-line">
            <span className={u.exhausted ? "block h-full bg-accent" : "block h-full bg-ink"} style={{ width: `${u.pct}%` }} />
          </span>
        )}
      </span>
    );
  })()}
</TableCell>
```

   - Estado: `c.isActive ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>`.
   - Menú: disparador `aria-label={`Acciones de ${c.code}`}`.
   - El resto de las celdas (Descuento, Canal, Aplica a, Vence) no cambia.
   
   Imports: `Copy` de `lucide-react`, `usageInfo`, `StatusDot`, `Panel`, `AdminPage`, `AdminPageHeader`. Quitar `SectionTabs` y `FEATURES` si quedan sin uso.

- [ ] **Step 7: Correr las pruebas**

Run: `npx vitest run src/pages/admin/catalog-helpers.test.ts src/pages/admin/memberships src/pages/admin/plans src/pages/admin/discount-codes`
Expected: PASS.

- [ ] **Step 8: Comprobación estándar y commit**

```bash
git add src/pages/admin/catalog-helpers.test.ts src/pages/admin/memberships src/pages/admin/plans src/pages/admin/discount-codes
git commit -m "feat(panel): membresías con avisos de vencimiento, planes en tarjetas y descuentos con usos

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Reportes y Configuración

**Files:**
- Modify:
  - `src/pages/admin/reports/ReportsPage.tsx`:
    - encabezado L385-421;
    - `ActionPanel` L187-243;
    - contenedores de KPI L108-184;
    - nota del detalle L575-603.
  - `src/pages/admin/settings/SettingsPage.tsx`:
    - `SettingsSection` L78-152;
    - aviso de Notificaciones L508-519;
    - `SettingsPage` L904-984.
- Test: `src/pages/admin/reports/ReportsPage.test.tsx`, `src/pages/admin/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `AdminPage`, `AdminPageHeader`, `Panel`, `SaveBar`, `useSearchParamState`.
- `/admin/settings?tab=<general|payments|notifications|policies|whatsapp|security>` abre esa sección y se actualiza al cambiar.

- [ ] **Step 1: Pruebas que fallan**

`src/pages/admin/reports/ReportsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import ReportsPage from "./ReportsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };

beforeEach(() => {
  mockApi.get.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/reports/overview": { data: { monthlyRevenue: 86400, activeMembers: 112, classOccupancyRate: 72, churnRate: 4.1, monthlyBookings: 1084, cancelledBookings: 62, cancelRate: 30, newMembersThisMonth: 9, reviewsTotal: 14, reviewsAverage: 4.8, deltas: { revenue: 12.2, occupancy: 6 } } },
    "/reports/revenue-sparkline": { data: [] },
    "/reports/revenue": { data: [{ month: "2026-09-01", amount: 86400 }] },
    "/reports/classes": { data: [] },
    "/reports/retention": { data: [] },
    "/reports/instructors": { data: [] },
    "/reports/top-attendance": { data: [] },
    "/reports/conversion": { data: { conversion_rate: 10, converted_total: 1, muestras_total: 10 } },
    "/reports/dormant": { data: { active_7d: 142, dormant_8_14d: 38, dormant_15_30d: 21, dormant_31_60d: 17, lost_60d: 29 } },
  });
});

describe("Reportes", () => {
  it("sólo sugiere lo que lleva a una pantalla que existe", async () => {
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    expect(await screen.findByText("29 alumnas llevan más de 60 días sin venir")).toBeInTheDocument();
    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links.filter((h) => h.includes("whatsapp-templates"))).toEqual([]);
    expect(screen.queryByText(/Revisar política/)).toBeNull();
    expect(screen.queryByText(/follow-up/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Crear código de regreso" }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/discount-codes"));
  });

  it("aclara que las gráficas no dependen del periodo y no trae pestañas duplicadas", async () => {
    renderAdmin(<ReportsPage />, { route: "/admin/reports" });
    expect(await screen.findByText("No depende del periodo elegido arriba.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secciones" })).toBeNull();
  });
});
```

`src/pages/admin/settings/SettingsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import SettingsPage from "./SettingsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
let general: Record<string, unknown>;

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: {} });
  loginAs("admin");
  general = { studio_name: "HIVE Pilates Studio", instagram: "@hive.pilates", opening_pricing_active: true, maintenance_mode: false, venue_media_url: "" };
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/admin/bank-info": { data: {} },
    "/evolution/status": { data: { state: "close" } },
    "/settings/notification_templates": { data: {} },
    "/settings/notification_settings": { data: {} },
    "/admin/wallet/notifications": { data: [] },
    "/settings/policies_settings": { data: {} },
  });
  // general_settings devuelve siempre lo último guardado (la media puede cambiar entre lectura y guardado).
  const base = mockApi.get.getMockImplementation()!;
  mockApi.get.mockImplementation((url: string) =>
    url === "/settings/general_settings" ? Promise.resolve({ data: { data: { ...general } } }) : base(url));
});

describe("Configuración", () => {
  it("guardar General no deshace la media subida después de cargar el formulario", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));
    general = { ...general, venue_media_url: "https://archivos/estudio.jpg", venue_media_type: "image" }; // otra parte guardó media
    fireEvent.change(nombre, { target: { value: "HIVE Coyoacán" } });
    fireEvent.click(await screen.findByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/settings/general_settings", {
      value: expect.objectContaining({ studio_name: "HIVE Coyoacán", venue_media_url: "https://archivos/estudio.jpg" }),
    }));
  });

  it("la barra de cambios sólo aparece al editar y Descartar regresa los valores", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings" });
    const nombre = await screen.findByLabelText("Nombre del estudio");
    await waitFor(() => expect(nombre).toHaveValue("HIVE Pilates Studio"));
    expect(screen.queryByText("Tienes cambios sin guardar")).toBeNull();
    fireEvent.change(nombre, { target: { value: "Otro" } });
    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));
    expect(nombre).toHaveValue("HIVE Pilates Studio");
  });

  it("?tab= abre la sección y cambiar de sección cambia la URL", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=security", path: "/admin/settings" });
    expect(await screen.findByRole("tab", { name: /Seguridad/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Pagos/ }));
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/admin/settings?tab=payments"));
  });

  it("Notificaciones ya no enlaza a plantillas apagadas", async () => {
    renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=notifications", path: "/admin/settings" });
    await screen.findByRole("tab", { name: /Notificaciones/ });
    const links = screen.queryAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(links.filter((h) => h.includes("whatsapp-templates"))).toEqual([]);
  });
});
```

Run: `npx vitest run src/pages/admin/reports src/pages/admin/settings` → FAIL.

- [ ] **Step 2: Reportes**

En `ReportsPage.tsx`:
1. `ActionPanel` (L187-243) se reescribe. Quedan sólo las reglas con destino vivo (spec §7.7):

```tsx
function ActionPanel({ dorm, navigate }: { dorm: any; navigate: (to: string) => void }) {
  const lost = Number(dorm?.lost_60d ?? 0);
  if (lost < 3) return null;
  return (
    <section aria-label="Sugerencia" className="flex flex-wrap items-center gap-3.5 rounded-2xl bg-accent-soft px-5 py-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface"><Sparkles size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-sm font-extrabold">{lost} alumnas llevan más de 60 días sin venir</p>
        <p className="text-[13px] text-ink-muted">Un código de regreso suele ser el empujón que falta.</p>
      </div>
      <Button onClick={() => navigate("/admin/discount-codes")}>Crear código de regreso</Button>
    </section>
  );
}
```

   La llamada (L424-430) queda `<ActionPanel dorm={dorm} navigate={navigate} />`.
2. Encabezado (L385-421):
   - `max-w-6xl` pasa a `<AdminPage>`;
   - se borra `SectionTabs` (L386-392);
   - h1 y "Última actualización" pasan a `<AdminPageHeader kicker={`Análisis · actualizado ${format(new Date(), "HH:mm")}`} title="Reportes" actions={<>{/* el Tabs de periodo actual (L404-410) */}{/* el botón Imprimir actual (L411-419) */}</>} />`.
   
   Importar `format` de `date-fns`.
3. KPI: en `HeroKPI`, `SecondaryKPI` (L108-174), cambiar el contenedor de cada uno a `rounded-2xl border border-line bg-surface p-6`. Las cifras llevan `nums font-display font-semibold`. El resto de su lógica (delta, sparkline, carga) no cambia. La tira (L483-500) va en `flex border-y border-line py-3.5`.
4. Detalle (L575-603): justo encima de la gráfica (dentro de la tarjeta de contenido, L603), agregar `<p className="mb-3 text-[13px] text-ink-muted">No depende del periodo elegido arriba.</p>`.
5. Importar `AdminPage`, `AdminPageHeader`, `Button` si falta. Quitar `SectionTabs`, `FEATURES` y `AlertTriangle` si quedan sin uso.

- [ ] **Step 3: Configuración — fuente única al guardar y barra de cambios**

En `SettingsPage.tsx`:
1. `SettingsSection` recibe campos con ayuda opcional y grupos:

```tsx
type SettingField = { key: string; label: string; type?: string; multiline?: boolean; help?: string };
type SettingGroup = { title: string; keys: string[] };

function SettingsSection({ settingKey, fields, groups }: { settingKey: string; fields: SettingField[]; groups?: SettingGroup[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, any>>({});
  const [original, setOriginal] = useState<Record<string, any>>({});
  const [loaded, setLoaded] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["settings", settingKey],
    queryFn: async () => (await api.get(`/settings/${settingKey}`)).data,
    staleTime: Infinity,
  });
  const unwrap = (d: any) => d?.data ?? d?.value ?? d?.data?.value;
  useEffect(() => {
    const raw = unwrap(data);
    if (raw && typeof raw === "object" && !loaded) {
      setValues(raw);
      setOriginal(raw);
      setLoaded(true);
    }
  }, [data, loaded]);

  const keys = fields.map((f) => f.key);
  const dirty = keys.some((k) => (values[k] ?? "") !== (original[k] ?? ""));

  const updateMutation = useMutation({
    // Relee lo guardado y sólo pisa los campos de este formulario: así no se
    // deshace lo que otra parte de la pantalla (la media del lugar) guardó
    // después de abrirlo. El servidor reemplaza el objeto completo.
    mutationFn: async () => {
      const latest = unwrap((await api.get(`/settings/${settingKey}`)).data);
      const base = latest && typeof latest === "object" ? latest : {};
      const patch = Object.fromEntries(keys.map((k) => [k, values[k]]));
      return api.put(`/settings/${settingKey}`, { value: { ...base, ...patch } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", settingKey] });
      setLoaded(false);
      toast({ title: "Configuración guardada" });
    },
    onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
  });

  // Estados de error y carga: iguales que hoy (L109-131).

  const renderField = (f: SettingField) =>
    f.type === "boolean" ? (
      <div key={f.key} className="flex items-start justify-between gap-4 border-t border-line py-3.5 first:border-t-0 sm:col-span-2">
        <Label htmlFor={`s-${f.key}`} className="leading-snug">
          <span className="block text-sm font-bold">{f.label}</span>
          {f.help && <span className="mt-0.5 block text-[13px] font-normal text-ink-muted">{f.help}</span>}
        </Label>
        <Switch id={`s-${f.key}`} checked={!!values[f.key]} onCheckedChange={(v) => setValues((p) => ({ ...p, [f.key]: v }))} />
      </div>
    ) : (
      <div key={f.key} className={cn("flex flex-col gap-1.5", f.multiline && "sm:col-span-2")}>
        <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
        {f.multiline ? (
          <Textarea id={`s-${f.key}`} rows={5} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
        ) : (
          <Input id={`s-${f.key}`} value={values[f.key] ?? ""} onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))} />
        )}
      </div>
    );

  const sections = groups ?? [{ title: "", keys }];
  return (
    <div className="flex flex-col gap-4">
      {sections.map((g) => (
        <Panel key={g.title || "campos"} className="p-6">
          {g.title && <h2 className="mb-4 text-base font-extrabold">{g.title}</h2>}
          <div className="grid gap-4 sm:grid-cols-2">{fields.filter((f) => g.keys.includes(f.key)).map(renderField)}</div>
        </Panel>
      ))}
      <SaveBar dirty={dirty} saving={updateMutation.isPending} onSave={() => updateMutation.mutate()} onDiscard={() => setValues(original)} />
    </div>
  );
}
```

   Se borra el botón "Guardar cambios" suelto (L146-149): ahora vive en `SaveBar`.
2. Uso en la pestaña General (L929-942), con grupos y ayudas **verificadas**. El precio de apertura sí cambia lo que se cobra (`resolveEffectivePrice` en el servidor). El modo mantenimiento sólo se guarda: ningún código lo lee.

```tsx
<SettingsSection
  settingKey="general_settings"
  fields={[
    { key: "studio_name", label: "Nombre del estudio" },
    { key: "phone", label: "Teléfono de contacto" },
    { key: "address", label: "Dirección" },
    { key: "instagram", label: "Instagram (@usuario)" },
    { key: "facebook", label: "Facebook (URL o usuario)" },
    { key: "timezone", label: "Zona horaria (ej: America/Mexico_City)" },
    { key: "currency", label: "Moneda (ej: MXN)" },
    { key: "opening_pricing_active", label: "Precios de apertura activos", type: "boolean", help: "Si está activo, los planes con precio de apertura se cobran a ese precio." },
    { key: "maintenance_mode", label: "Modo mantenimiento", type: "boolean", help: "Por ahora sólo se guarda: todavía no cambia nada en la app." },
  ]}
  groups={[
    { title: "Datos del estudio", keys: ["studio_name", "phone", "address", "instagram", "facebook"] },
    { title: "Región", keys: ["timezone", "currency"] },
    { title: "Interruptores", keys: ["opening_pricing_active", "maintenance_mode"] },
  ]}
/>
```

   Políticas (L955-964) usa el mismo `SettingsSection`, sin grupos. Queda en una sola tarjeta con sus tres textos largos.
3. Aviso de Notificaciones (L508-519): quitar el `<Link to="/admin/whatsapp-templates">`. El texto queda: "Estos son los mensajes del sistema."
4. `SettingsPage` (L904-984):

```tsx
const SETTINGS_TABS = [
  { value: "general", label: "General", icon: Store },
  { value: "payments", label: "Pagos", icon: CreditCard },
  { value: "notifications", label: "Notificaciones", icon: Bell },
  { value: "policies", label: "Políticas", icon: FileText },
  { value: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { value: "security", label: "Seguridad", icon: Shield },
] as const;

const SettingsPage = () => {
  const [tabParam, setTab] = useSearchParamState("tab");
  const tab = SETTINGS_TABS.some((t) => t.value === tabParam) ? tabParam! : "general";
  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Sistema"
            title="Configuración"
            actions={FEATURES.whatsappTemplates ? <SectionTabs tabs={[{ label: "Ajustes", to: "/admin/settings" }, { label: "Templates WA", to: "/admin/whatsapp-templates" }]} /> : undefined}
          />
          <Tabs value={tab} onValueChange={(v) => setTab(v === "general" ? null : v)} orientation="vertical" className="grid items-start gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
            <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0 lg:flex-col lg:items-stretch">
              {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="justify-start gap-3 rounded-xl px-3.5 data-[state=active]:border data-[state=active]:border-line data-[state=active]:bg-surface">
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="min-w-0 max-w-[760px]">
              {/* Los seis TabsContent de hoy (L927-978), con el General de arriba. */}
            </div>
          </Tabs>
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};
```

   (Los íconos `Store`, `CreditCard`, `Bell`, `FileText`, `MessageCircle` y `Shield` vienen de `lucide-react`. Borrar la lectura única de `window.location.search` de L905. Importar `useSearchParamState`, `AdminPage`, `AdminPageHeader`, `Panel`, `SaveBar` y `cn`.)

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run src/pages/admin/reports src/pages/admin/settings`
Expected: PASS.

- [ ] **Step 5: Comprobación estándar y commit**

```bash
git add src/pages/admin/reports src/pages/admin/settings
git commit -m "feat(panel): reportes sin enlaces muertos y configuración con barra de cambios que no pisa la media

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Celular, verificación completa y fusión a `hive`

**Files:**
- Ninguno nuevo. La evidencia va en `auditoria-estudio/hive-panel/`, que git ignora (confirmar con `git check-ignore auditoria-estudio/hive-panel/x.png`; si no está ignorada, agregar `auditoria-estudio/hive-panel/` a `.gitignore` en el commit de esta tarea).

- [ ] **Step 1: Suites del repo y guardias**

Run:

```bash
npm test 2>&1 | grep -E "Test Files|Tests |ℹ (tests|pass|fail)"
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
npm run lint 2>&1 | tail -3
```

Expected:
- frontend, servidor y scripts en verde, con `guards.test.ts`, `panel.test.tsx` y `paridad-velan.test.ts` incluidos;
- `tsc` sin salida;
- lint sin errores nuevos respecto a la línea base.

- [ ] **Step 2: Regresión del servidor sobre base desechable**

Levantar la base y la API igual que en la Tarea 3, Paso 2 (puerto de API 8131, Postgres 5531). Luego:

```bash
API_URL=http://127.0.0.1:8131 DATABASE_URL=postgres://alma:alma@127.0.0.1:5531/hive \
  node --test --test-concurrency=1 "server/tests/*.test.mjs" 2>&1 | grep -E "ℹ (tests|pass|fail)"
```

Expected: `fail 0`.

- [ ] **Step 3: Barrido en navegador (escritorio y celular, dueña y recepción)**

1. Compilar: `VITE_API_URL=/api npx vite build`, y reiniciar la API del paso 2 para que sirva `dist/`.
2. Sembrar datos con la API: una admin, una recepción, dos coaches, tres tipos de clase y una semana generada. Además, una clase llena con dos en espera, una orden por verificar, tres clientas y una membresía por vencer.
3. Recorrer con Playwright MCP estas 18 rutas:
   - `/admin/dashboard`, `/admin/bookings`, `/admin/bookings?clase=<id>`, `/admin/pasar-lista`, `/admin/bookings/waitlist`;
   - `/admin/classes`, `/admin/class-types`, `/admin/class-generator`;
   - `/admin/payments`, `/admin/orders`, `/admin/payments/historial`;
   - `/admin/clients`, `/admin/staff`, `/admin/clients/<id>`;
   - `/admin/memberships`, `/admin/plans`, `/admin/discount-codes`, `/admin/reports`, `/admin/settings`.
4. Hacer el recorrido completo como dueña a 1440×900 y a 390×844. Como recepción, repetir a 1440×900 las rutas que ve.
5. En cada ruta registrar:
   - errores de consola;
   - respuestas de `/api` con código ≥ 400;
   - texto `undefined`, `NaN` o `Invalid Date`;
   - pantalla en blanco;
   - scroll horizontal (`document.documentElement.scrollWidth > document.documentElement.clientWidth`).
6. Guardar una captura por ruta en `auditoria-estudio/hive-panel/` y compararla con el artboard del lienzo (https://claude.ai/artifact/ACA2tnwBbjzpLiJi2S7iVt, página "Panel · dirección A").
7. **Celular (390 px):**
   - la barra inferior marca la sección activa sobre coral y Cobros lleva su contador;
   - el buscador se abre desde la barra superior;
   - Reservas y Lista de espera muestran lista o detalle con "Volver";
   - Pasar lista deja los botones de Check-in de 44 px;
   - la ficha de clienta usa la flecha para volver.
8. **Recepción:**
   - no ve Cobros ni "Cobrar", ni ingresos o gráficas en Inicio;
   - en la ficha no ve la pestaña Pagos ni "Editar datos";
   - no aparece ninguna respuesta 403 en la consola.
9. **Movimiento reducido:** con `browser_emulate_media` en `prefers-reduced-motion: reduce`, abrir `/admin/dashboard` y `/admin/classes`. En consola no debe animarse nada, salvo los spinners `animate-spin`:

```js
[...document.querySelectorAll("*")].filter((el) => {
  const cs = getComputedStyle(el);
  return cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.01 && !el.className.toString().includes("animate-spin");
}).length   // esperado: 0
```

Expected: cero hallazgos. Cada hallazgo se corrige primero con una prueba en rojo; después, commit con `fix(panel): …`.

Apagar al terminar: `pkill -f "PORT=8131"; pg_ctl -D "$SP/pg" stop -m fast; rm -rf "$SP"`.

- [ ] **Step 4: Revisión adversarial del diff**

Invocar la skill `code-review` con nivel `high` sobre la rama `hive-panel` contra `hive`. Reproducir cada hallazgo antes de aceptarlo y corregir los confirmados con su prueba en rojo.

- [ ] **Step 5: Fusionar a `hive`**

```bash
cd "/Users/saidromero/Alma Studio/alma-hive"
git merge --no-ff hive-panel -m "merge: panel HIVE (sub-proyecto 3 de 4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
npx vitest run 2>&1 | grep -E "Test Files|Tests "
```

Expected: fusión limpia y suite en verde. **No empujar a `main` ni publicar en producción**: se pregunta primero al dueño.
