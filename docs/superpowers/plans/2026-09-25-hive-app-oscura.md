# HIVE · Paleta v2 y app oscura — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La app de clienta, el acceso y la 404 pasan a un tema oscuro con terracota; el panel se queda claro con la paleta nueva del estudio (Ivory Silk, Smoked Taupe, terracota), sin que ninguna pantalla pierda funciones.

**Architecture:** Dos tablas de tokens (`LIGHT`, `DARK`) en `src/design/tokens.ts` alimentan variables CSS por tema en `src/index.css`. Tailwind lee esas variables, así que `bg-surface` o `text-ink` cambian solos cuando `<html data-theme>` cambia. Qué tema se aplica lo decide la ruta. La zona de la app lleva el color en clases (nunca en `style`), porque jsdom descarta `var()` en estilos en línea. Lo exclusivo de la app (degradado, resplandor, translucidez) va con la variante `dark:`. `COLOR` sigue siendo el hex del tema claro para el panel.

**Tech Stack:** React 18 + Vite 5 + TypeScript 5.8 · Tailwind 3.4 + shadcn/ui · Vitest 3 + Testing Library (jsdom) · `node:test` para scripts · `sharp`.

**Spec:** [`docs/superpowers/specs/2026-09-25-hive-app-oscura-design.md`](../specs/2026-09-25-hive-app-oscura-design.md) (y, para lo que no cambia, `2026-09-24-hive-sistema-visual-design.md`).

## Global Constraints

- **Tokens (valores exactos, spec §3.1).** Mismas claves en los dos temas.
  - `LIGHT`: canvas #F2EFEA · surface #FFFFFF · sunken #E8E3DC · line #DDD6CD · lineStrong #8A7F73 · ink #1A1714 · inkMuted #6B6259 · inkFaint #8A7F73 · accent #CF8A6B · accentDeep #A9603F · onAccent #1A1714 · accentSoft #F3DED3 · accentStrong #9A5236 · success #2E6B50 · danger #A3243B · inverse #1A1714 · inverseRaised #26221E · onInverse #F2EFEA · onInverseMuted #A69C91.
  - `DARK`: canvas #141210 · surface #1E1B18 · sunken #171412 · line #2E2A26 · lineStrong #6F665D · ink #F2EFEA · inkMuted #A69C91 · inkFaint #8A7F73 · accent #CF8A6B · accentDeep #A9603F · onAccent #141210 · accentSoft #3A2A22 · accentStrong #DDA084 · success #8FCBA8 · danger #F0A39B · inverse #F2EFEA · inverseRaised #FFFFFF · onInverse #141210 · onInverseMuted #6B6259.
  - Todo hex en formato `#RRGGBB` en mayúsculas.
- **Reglas de color (spec §3.3):**
  1. Nunca texto claro sobre terracota: sobre `accent` y sobre el degradado el texto es `text-accent-foreground`. En oscuro `text-ink` es **claro**, así que nunca va junto a un fondo terracota.
  2. En oscuro la terracota puede ser texto: `text-accent` en tamaño grande, `text-accent-strong` en chico. En claro sólo `text-accent-strong`.
  3. En el panel la terracota es atención y va plana; no hay botón terracota en el panel.
  4. El degradado (`bg-accent-gradient`) y el resplandor (`shadow-accent-glow`) son sólo de la app y van detrás de `dark:` en las piezas compartidas.
  5. Los resplandores del fondo son estáticos (`bg-app-glow`, `bg-pedestal-glow`).
  6. El coral #FA936A no existe.
  7. Ningún color escrito a mano fuera de `src/design/` (hex, `#RRGGBBAA`, `rgb(a)(` con números).
- **Mínimos:** texto de 12 px (`text-[0.75rem]`), controles de 44 px.
- **Piezas:** conservan nombre y props; sólo se agregan props opcionales.
- **Temas:** oscuro en `/app/*`, `/auth/*` y la 404; claro en todo lo demás (panel, landing, legales, `/sistema`). Lo decide `RouteTheme` por la ruta, más un script en `index.html` para la primera pintada.
- **Zona de la app:**
  - Archivos: `src/pages/client/*`, `src/pages/auth/*`, `src/pages/NotFound.tsx`, `src/components/app/*`, `src/components/auth/*`, `src/components/brand/HexPedestal.tsx`, `src/components/account/ChangePassword.tsx` y `src/components/ui/toaster.tsx`.
  - Sin `COLOR`, sin `resolveTone`/`TONE_STYLE` (en su lugar `resolveToneClass`/`TONE_CLASS`) y sin colores de color en `style={{…}}`. `style` se admite sólo para medidas y posiciones.
  - El único color en línea permitido es `cssColor(token, alfa?)` (anillos SVG, degradados cónicos), y `DARK`/`LIGHT` sólo donde una librería exige hex, como el QR.
  - La guardia `describeZone([...])` de `src/design/zoneGuard.ts` lo exige. Cada tarea la llama desde su propia prueba con sus archivos, y la Tarea 12 la aplica a la zona entera en `src/design/app-zone.test.ts`.
- **Tabla de conversión (estilo en línea de hoy → clase en la zona de la app):**

  | Hoy | Ahora |
  |---|---|
  | `backgroundColor: COLOR.canvas` | `bg-canvas` (o nada: el marco ya lo pone) |
  | `COLOR.surface` de tarjeta | `bg-surface dark:bg-surface/70 border border-line rounded-[20px]` |
  | `COLOR.sunken` | `bg-sunken` |
  | `COLOR.line` como fondo | `bg-line` |
  | `COLOR.accent` como relleno de la acción principal | `PrimaryButton`, o `bg-accent-gradient text-accent-foreground shadow-accent-glow` |
  | `COLOR.accent` como relleno pequeño (punto, barra de progreso) | `bg-accent` |
  | `COLOR.accentSoft` | `bg-accent-soft` |
  | `COLOR.inverse` / `inverseRaised` como bloque oscuro | `bg-surface/70` o `bg-canvas`: **en oscuro `inverse` es claro** |
  | `COLOR.inverse` como baldosa clara (QR, firma, avatar) | `bg-inverse text-inverse-foreground` |
  | `color: COLOR.ink` | `text-ink` |
  | `COLOR.inkMuted`, o `ink` con `opacity` para texto secundario | `text-ink-muted` (la opacidad no sirve para texto secundario) |
  | `COLOR.accentStrong` | `text-accent-strong` (chico), `text-accent` (titular o cifra grande, sólo en oscuro) |
  | `COLOR.onAccent` | `text-accent-foreground` |
  | `COLOR.success` / `COLOR.danger` | `text-success` / `text-danger` (fondos: `bg-success/10`, `bg-danger/10`) |
  | `COLOR.canvas` / `onInverse` como texto claro sobre bloque oscuro | `text-ink` |
  | `border: 1px solid ${COLOR.line}` | `border border-line` |
  | `border: 1.5px solid ${COLOR.lineStrong}` | `border-[1.5px] border-line-strong` |
  | `boxShadow: inset 0 0 0 1px ${COLOR.line}` | `ring-1 ring-inset ring-line` |
  | `` `${COLOR.x}NN` `` | `bg-x/NN %` · `1a`→`/10` · `14`→`/8` · `26`→`/15` · `33`→`/20` · `40`→`/25` · `59`→`/35` · `73`→`/45` · `8c`→`/55` |
  | `stroke`/`fill` de SVG | `stroke="currentColor"` más la clase `text-*` |
  | Íconos inactivos, marcadores de posición, deshabilitado | `text-ink-faint` |

- **Procedimiento de pantalla** (tareas 6 a 12):
  1. En la prueba de la tarea, llamar `describeZone([...archivos de la tarea])` (import de `@/design/zoneGuard`) y correrla: **RED**, listando lo que falta.
  2. Convertir con la tabla y rehacer según el "Diseño" de la tarea.
  3. Cambiar los textos "Alma" que la tarea lista.
  3b. La guardia revisa **por línea** que un fondo terracota no comparta línea con `text-ink`. Si un ternario junta la rama activa (terracota) con la inactiva (`hover:text-ink`), las ramas van en líneas separadas.
  4. Guardia en **GREEN**, pruebas existentes de la pantalla, `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase` vacío y `VITE_API_URL=/api npx vite build`.
  5. Commit.
- **Fuera de alcance (lo hace A):**
  - Landing, legales, correos, WhatsApp, diseño del pase del servidor, metadatos, fotos, archivos con "alma" en el nombre (incluido `alma-pass.pkpass`).
  - El subtítulo legal de la responsiva ("… firmado con Alma Movement").
- **No tocar:** las pantallas del panel (las rediseña otra sesión en `hive-panel`). La única excepción es la 404.
- **Entorno:**
  - Worktree `/Users/saidromero/Alma Studio/alma-hive-app` (rama `hive-app`). `node_modules` es un symlink compartido: **nunca instalar dependencias**.
  - `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase` debe salir vacío (hay un error preexistente de supabase que se filtra).
  - Commits en español, terminando exactamente con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Nunca push, nunca merge, nunca otra rama.

## Review Focus

1. **Parpadeo y portales:**
   - Al recargar en `/app` no debe verse un fotograma claro.
   - Los toasts, diálogos y menús abiertos en la app deben salir oscuros; en el panel, claros.
   - → Pruebas en la Tarea 2 (script de `index.html`, `RouteTheme`) y barrido en la Tarea 14.
2. **El panel sigue claro:**
   - Navegar de `/app` a `/admin` en la misma sesión debe volver el tema a claro.
   - `ErrorState`, `EmptyState`, `PrimaryButton` y los campos, que el panel usa, se ven como en el panel (botón en tinta, sin degradado).
   - → Pruebas en las Tareas 2, 3 y 5.
3. **Texto claro sobre terracota:**
   - En oscuro `text-ink` es claro. Un `bg-accent`/`bg-accent-gradient` con `text-ink` rompe la regla 1.
   - → Guardia por línea en la Tarea 3, aplicada a toda la zona en la Tarea 12.
4. **Cristal sobre resplandor:** el texto sobre tarjetas `bg-surface/70` encima del resplandor más fuerte debe seguir en ≥4.5:1. → Prueba en la Tarea 1.
5. **Colores que sobreviven en línea:**
   - Un `style={{ color: … }}` o `COLOR.x` que quede en una pantalla de la app se vería claro sobre negro, y ninguna prueba de estilos lo vería en jsdom.
   - → Guardia `describeZone` en la prueba de cada tarea, con la zona completa exigida en la Tarea 12.

---

## Preparación del entorno

El worktree ya existe:

```bash
cd "/Users/saidromero/Alma Studio/alma-hive-app"
git log --oneline -1                      # 7367b46 o posterior en hive-app
npx vitest run 2>&1 | grep -E "Test Files|Tests "   # esperado: 20 files / 156 tests
```

## Ejecución en paralelo (pedido del usuario: varios subagentes)

Olas, cada una sobre la anterior ya fusionada en `hive-app`:

| Ola | Tareas | En paralelo | Archivos que tocan (disjuntos dentro de la ola) |
|---|---|---|---|
| 1 | 1 | — | tokens, index.css (HSL claras), scripts, public |
| 2 | 2 | — | index.css, tailwind, theme, zoneGuard, App, NotFound, index.html, manifest |
| 3 | 3 · 4 · 5 | sí | 3: AppShell, HexPedestal, pieces/tones tests · 4: widgets · 5: fields, ChangePassword, ui/toaster, toast, switch, input, select |
| 4 | 6 · 7 · 8 · 9 · 10 · 11 | sí | 6: auth · 7: Dashboard · 8: BookClasses, BookClassConfirm · 9: MyBookings, Orders, Notifications · 10: Wallet*, index.css (una utilidad) · 11: Checkout, UploadDropzone |
| 5 | 12 | — | perfil, responsiva, 404, ocultas y `app-zone.test.ts` (zona completa) |
| 6 | 13 | — | /sistema, DESIGN.md |
| 7 | 14 | — | verificación |

- Cada tarea paralela trabaja en su propio worktree, que sale del `hive-app` del momento. Al aprobarse su revisión, su rama se rebasa sobre `hive-app` y se fusiona con avance rápido.
- Como ninguna tarea de la misma ola comparte archivo, los rebases son limpios.
- Ninguna tarea de las olas 3 y 4 edita un archivo común de pruebas: cada una declara su guardia con `describeZone` en su propia prueba.

---

### Task 1: Tokens v2 en dos temas, contraste e imágenes generadas

**Files:**
- Modify: `src/design/tokens.ts` (archivo completo)
- Modify: `src/design/tokens.test.ts` (archivo completo)
- Modify: `src/index.css` (sólo las variables HSL de `:root`, a los valores claros nuevos)
- Modify: `scripts/brand-assets.mjs` (import y `TARGETS`)
- Modify: `scripts/brand-assets.test.mjs`
- Modify: `src/design/guards.test.ts` (una guardia nueva)
- Modify (regeneradas): las 26 imágenes de `public/` que lista `TARGETS`

**Interfaces:**
- Produces:
  - `LIGHT`, `DARK` (`Record<ColorToken, "#RRGGBB">`), `ColorToken`, `Theme = "light" | "dark"`, `THEMES`, `COLOR` (= `LIGHT`), `cssVarName(token): string` (`inkMuted` → `--c-ink-muted`) y `cssColor(token, alpha?): string` (`rgb(var(--c-x))` o `rgb(var(--c-x) / a)`).
  - Sin cambios: `FONT`, `TONES`, `Tone`, `ToneStyle`, `TONE_STYLE` y `resolveTone` (hex, tema claro).
  - Nuevos: `ToneClass = { fg, softBg, softFg, ring, solidBg, solidFg }`, `TONE_CLASS: Record<Tone, ToneClass>` y `resolveToneClass(tone, fallback = "muted"): ToneClass`.

- [ ] **Step 1: Escribir la prueba**

`src/design/tokens.test.ts` (reemplaza el archivo):

```ts
import { describe, it, expect } from "vitest";
import { contrast, luminance } from "./contrast";
import {
  COLOR, LIGHT, DARK, THEMES, TONES, TONE_STYLE, TONE_CLASS, resolveTone, resolveToneClass,
  cssVarName, cssColor, type ColorToken, type Theme,
} from "./tokens";

const TEXT = 4.5;
const CONTROL = 3;

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
/** `a` al `t` (0–1) sobre `b`. */
const mix = (a: string, b: string, t: number) => hex(rgb(a).map((v, i) => v * t + rgb(b)[i] * (1 - t)));

describe("contraste", () => {
  it("reproduce los valores de referencia de WCAG", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });
  it("rechaza lo que no sea #RRGGBB", () => {
    expect(() => luminance("#FFF")).toThrow();
  });
});

describe("tablas", () => {
  it("LIGHT y DARK tienen exactamente las mismas claves", () => {
    expect(Object.keys(DARK).sort()).toEqual(Object.keys(LIGHT).sort());
  });
  it.each(["light", "dark"] as Theme[])("todo valor de %s es #RRGGBB en mayúsculas", (t) => {
    for (const [k, v] of Object.entries(THEMES[t])) expect(v, k).toMatch(/^#[0-9A-F]{6}$/);
  });
  it("COLOR es el tema claro (lo usan los estilos en línea del panel)", () => {
    expect(COLOR).toBe(LIGHT);
  });
  it("el coral #FA936A ya no existe", () => {
    for (const t of Object.values(THEMES)) expect(Object.values(t)).not.toContain("#FA936A");
  });
});

// spec §3.2 — permitidas y prohibidas, por tema
const PERMITIDAS: Record<Theme, [ColorToken, ColorToken, number][]> = {
  dark: [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT],
    ["accent", "canvas", TEXT], ["accentStrong", "surface", TEXT], ["accentStrong", "canvas", TEXT],
    ["onAccent", "accent", TEXT], ["onAccent", "accentDeep", CONTROL], ["ink", "accentSoft", TEXT],
    ["accentStrong", "accentSoft", TEXT], ["success", "surface", TEXT], ["danger", "surface", TEXT],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL], ["onInverse", "inverse", TEXT],
    ["inkFaint", "canvas", TEXT], ["inkFaint", "surface", CONTROL],
  ],
  light: [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT],
    ["inkMuted", "sunken", TEXT], ["accentStrong", "canvas", TEXT], ["accentStrong", "surface", TEXT],
    ["onAccent", "accent", TEXT], ["ink", "accentSoft", TEXT], ["success", "surface", TEXT], ["danger", "surface", TEXT],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL], ["onInverse", "inverse", TEXT],
    ["inkFaint", "canvas", CONTROL], ["inkFaint", "surface", CONTROL],
  ],
};
const PROHIBIDAS: Record<Theme, [ColorToken, ColorToken][]> = {
  dark: [["ink", "accent"]],
  light: [["accent", "canvas"], ["onInverse", "accent"], ["accentStrong", "accentSoft"]],
};

describe.each(["dark", "light"] as Theme[])("tema %s", (theme) => {
  const T = THEMES[theme];
  it.each(PERMITIDAS[theme])("%s sobre %s alcanza %s:1", (fg, bg, min) => {
    expect(contrast(T[fg], T[bg])).toBeGreaterThanOrEqual(min);
  });
  it.each(PROHIBIDAS[theme])("%s sobre %s no llega a 4.5:1 (prohibida)", (fg, bg) => {
    expect(contrast(T[fg], T[bg])).toBeLessThan(TEXT);
  });
  it("el texto sobre el punto medio del degradado terracota pasa AA", () => {
    expect(contrast(T.onAccent, mix(T.accent, T.accentDeep, 0.5))).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("cristal sobre resplandor (oscuro)", () => {
  // Resplandor más fuerte: accentDeep al 24 % sobre canvas; tarjeta: surface al 70 % encima.
  const glow = mix(DARK.accentDeep, DARK.canvas, 0.24);
  const card = mix(DARK.surface, glow, 0.7);
  it.each(["ink", "inkMuted", "accent", "accentStrong", "success", "danger"] as ColorToken[])(
    "%s se lee sobre la tarjeta translúcida",
    (t) => expect(contrast(DARK[t], card)).toBeGreaterThanOrEqual(TEXT),
  );
  it("inkFaint (íconos) pasa 3:1 sobre la tarjeta translúcida", () => {
    expect(contrast(DARK.inkFaint, card)).toBeGreaterThanOrEqual(CONTROL);
  });
});

// Clases de tono → color del tema, para medir contraste de TONE_CLASS.
const CLASS_TOKEN: Record<string, ColorToken> = {
  canvas: "canvas", surface: "surface", sunken: "sunken", line: "line", "line-strong": "lineStrong",
  ink: "ink", "ink-muted": "inkMuted", "ink-faint": "inkFaint", accent: "accent", "accent-deep": "accentDeep",
  "accent-foreground": "onAccent", "accent-soft": "accentSoft", "accent-strong": "accentStrong",
  success: "success", danger: "danger", inverse: "inverse", "inverse-foreground": "onInverse",
};
function colorOf(cls: string, theme: Theme, under: string): string {
  const m = /^(?:text|bg|ring)-([a-z-]+?)(?:\/(\d+))?$/.exec(cls);
  if (!m || !CLASS_TOKEN[m[1]]) throw new Error(`clase de tono desconocida: ${cls}`);
  const h = THEMES[theme][CLASS_TOKEN[m[1]]];
  return m[2] ? mix(h, under, Number(m[2]) / 100) : h;
}

describe.each(["dark", "light"] as Theme[])("tonos en clases, tema %s", (theme) => {
  const T = THEMES[theme];
  it.each(TONES)("%s es legible en todas sus formas", (tone) => {
    const c = TONE_CLASS[tone];
    expect(contrast(colorOf(c.fg, theme, T.surface), T.canvas)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(colorOf(c.fg, theme, T.surface), T.surface)).toBeGreaterThanOrEqual(TEXT);
    const softBg = colorOf(c.softBg, theme, T.surface);
    expect(contrast(colorOf(c.softFg, theme, softBg), softBg)).toBeGreaterThanOrEqual(TEXT);
    const solidBg = colorOf(c.solidBg, theme, T.surface);
    expect(contrast(colorOf(c.solidFg, theme, solidBg), solidBg)).toBeGreaterThanOrEqual(TEXT);
  });
});

describe("resolución de tonos", () => {
  it("resuelve hex (panel) y clases (dos temas)", () => {
    expect(resolveTone("success")).toBe(TONE_STYLE.success);
    expect(resolveToneClass("success")).toBe(TONE_CLASS.success);
  });
  it("un tono desconocido cae al neutro en vez de romper la pantalla", () => {
    expect(resolveToneClass("violeta")).toBe(TONE_CLASS.muted);
    expect(resolveToneClass(undefined)).toBe(TONE_CLASS.muted);
    expect(resolveToneClass("violeta", "ink")).toBe(TONE_CLASS.ink);
    expect(resolveTone("violeta")).toBe(TONE_STYLE.muted);
  });
});

describe("referencias CSS", () => {
  it("nombra la variable de cada token en kebab-case", () => {
    expect(cssVarName("inkMuted")).toBe("--c-ink-muted");
    expect(cssVarName("onInverseMuted")).toBe("--c-on-inverse-muted");
  });
  it("arma el color por tema, con y sin transparencia", () => {
    expect(cssColor("accent")).toBe("rgb(var(--c-accent))");
    expect(cssColor("accent", 0.3)).toBe("rgb(var(--c-accent) / 0.3)");
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/design/tokens.test.ts`
Expected: FAIL. No existen `LIGHT`, `DARK`, `THEMES`, `TONE_CLASS`, `resolveToneClass`, `cssVarName` ni `cssColor`.

- [ ] **Step 3: Implementar `src/design/tokens.ts`**

Reemplazar el archivo completo:

```ts
/**
 * Tokens de color de HIVE — única fuente de verdad, en dos temas.
 *
 * Nombran para qué sirve cada color, no a qué marca pertenece. `LIGHT` es el
 * panel (y la landing/legales hasta el sub-proyecto A); `DARK` es la app de
 * clienta, el acceso y la 404. src/index.css copia estas tablas como variables
 * CSS por tema y Tailwind las lee por variable: `bg-surface` cambia solo
 * cuando `<html data-theme>` cambia.
 *
 * `COLOR` = `LIGHT` en hex: lo usan los estilos en línea del panel. La zona de
 * la app no lo usa (guardia src/design/app-zone.test.ts): ahí el color va en
 * clases, porque jsdom descarta var() en estilos en línea.
 * Spec: docs/superpowers/specs/2026-09-25-hive-app-oscura-design.md §3
 */
export const LIGHT = {
  canvas: "#F2EFEA",
  surface: "#FFFFFF",
  sunken: "#E8E3DC",
  line: "#DDD6CD",
  lineStrong: "#8A7F73",
  ink: "#1A1714",
  inkMuted: "#6B6259",
  inkFaint: "#8A7F73",
  accent: "#CF8A6B",
  accentDeep: "#A9603F",
  onAccent: "#1A1714",
  accentSoft: "#F3DED3",
  accentStrong: "#9A5236",
  success: "#2E6B50",
  danger: "#A3243B",
  inverse: "#1A1714",
  inverseRaised: "#26221E",
  onInverse: "#F2EFEA",
  onInverseMuted: "#A69C91",
} as const;

export type ColorToken = keyof typeof LIGHT;

export const DARK: Record<ColorToken, string> = {
  canvas: "#141210",
  surface: "#1E1B18",
  sunken: "#171412",
  line: "#2E2A26",
  lineStrong: "#6F665D",
  ink: "#F2EFEA",
  inkMuted: "#A69C91",
  inkFaint: "#8A7F73",
  accent: "#CF8A6B",
  accentDeep: "#A9603F",
  onAccent: "#141210",
  accentSoft: "#3A2A22",
  accentStrong: "#DDA084",
  success: "#8FCBA8",
  danger: "#F0A39B",
  inverse: "#F2EFEA",
  inverseRaised: "#FFFFFF",
  onInverse: "#141210",
  onInverseMuted: "#6B6259",
};

export type Theme = "light" | "dark";
export const THEMES: Record<Theme, Record<ColorToken, string>> = { light: LIGHT, dark: DARK };

/** Hex del tema claro: estilos en línea del panel y de las zonas claras. */
export const COLOR = LIGHT;

/** Variable CSS de un token: inkMuted → --c-ink-muted. */
export const cssVarName = (t: ColorToken) => `--c-${t.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase())}`;

/** Color que sigue al tema, para los pocos estilos en línea de la app (anillos SVG, degradados). */
export const cssColor = (t: ColorToken, alpha?: number) =>
  alpha === undefined ? `rgb(var(${cssVarName(t)}))` : `rgb(var(${cssVarName(t)}) / ${alpha})`;

export const FONT = {
  display: '"Unbounded", system-ui, sans-serif',
  body: '"Manrope", system-ui, sans-serif',
} as const;

export const TONES = ["ink", "muted", "accent", "success", "danger"] as const;
export type Tone = (typeof TONES)[number];

export type ToneStyle = {
  /** Texto o ícono sobre canvas o surface. */
  fg: string;
  /** Pill o banner suave. */
  softBg: string;
  softFg: string;
  /** Pill sólida. */
  solidBg: string;
  solidFg: string;
};

/** Tonos en hex del tema claro (panel). */
export const TONE_STYLE: Record<Tone, ToneStyle> = {
  ink: { fg: COLOR.ink, softBg: COLOR.sunken, softFg: COLOR.ink, solidBg: COLOR.ink, solidFg: COLOR.canvas },
  muted: { fg: COLOR.inkMuted, softBg: COLOR.sunken, softFg: COLOR.inkMuted, solidBg: COLOR.inkMuted, solidFg: COLOR.canvas },
  // Terracota suave lleva texto ink: accentStrong sobre accentSoft no llega a AA en claro.
  accent: { fg: COLOR.accentStrong, softBg: COLOR.accentSoft, softFg: COLOR.ink, solidBg: COLOR.accent, solidFg: COLOR.onAccent },
  success: { fg: COLOR.success, softBg: COLOR.surface, softFg: COLOR.success, solidBg: COLOR.success, solidFg: COLOR.canvas },
  danger: { fg: COLOR.danger, softBg: COLOR.surface, softFg: COLOR.danger, solidBg: COLOR.danger, solidFg: COLOR.canvas },
};

export type ToneClass = {
  fg: string;
  softBg: string;
  softFg: string;
  /** Contorno de la pill suave. */
  ring: string;
  solidBg: string;
  solidFg: string;
};

/** Tonos en clases: siguen al tema (piezas que viven en la app y en el panel). */
export const TONE_CLASS: Record<Tone, ToneClass> = {
  ink: { fg: "text-ink", softBg: "bg-sunken", softFg: "text-ink", ring: "ring-line", solidBg: "bg-ink", solidFg: "text-canvas" },
  muted: { fg: "text-ink-muted", softBg: "bg-sunken", softFg: "text-ink-muted", ring: "ring-line", solidBg: "bg-ink-muted", solidFg: "text-canvas" },
  accent: { fg: "text-accent-strong", softBg: "bg-accent-soft", softFg: "text-ink", ring: "ring-accent/30", solidBg: "bg-accent", solidFg: "text-accent-foreground" },
  success: { fg: "text-success", softBg: "bg-success/10", softFg: "text-success", ring: "ring-success/25", solidBg: "bg-success", solidFg: "text-canvas" },
  danger: { fg: "text-danger", softBg: "bg-danger/10", softFg: "text-danger", ring: "ring-danger/25", solidBg: "bg-danger", solidFg: "text-canvas" },
};

const isTone = (t: string): t is Tone => (TONES as readonly string[]).includes(t);

/** Estilo hex de un tono (panel). Un valor desconocido cae a `fallback`. */
export function resolveTone(tone: string | undefined, fallback: Tone = "muted"): ToneStyle {
  return tone && isTone(tone) ? TONE_STYLE[tone] : TONE_STYLE[fallback];
}

/** Clases de un tono (dos temas). Un valor desconocido cae a `fallback`. */
export function resolveToneClass(tone: string | undefined, fallback: Tone = "muted"): ToneClass {
  return tone && isTone(tone) ? TONE_CLASS[tone] : TONE_CLASS[fallback];
}
```

- [ ] **Step 4: Variables HSL claras en `src/index.css`**

En el bloque `:root` de `@layer base`, reemplazar desde `--background:` hasta `--ring:` (inclusive) por:

```css
    --background: 38 24% 93%;            /* canvas #F2EFEA */
    --foreground: 30 13% 9%;             /* ink #1A1714 */

    --card: 0 0% 100%;                   /* surface #FFFFFF */
    --card-foreground: 30 13% 9%;

    --popover: 0 0% 100%;
    --popover-foreground: 30 13% 9%;

    --primary: 30 13% 9%;                /* ink */
    --primary-foreground: 38 24% 93%;    /* canvas */

    --secondary: 35 21% 89%;             /* sunken #E8E3DC */
    --secondary-foreground: 30 13% 9%;

    --muted: 35 21% 89%;                 /* sunken */
    --muted-foreground: 30 9% 38%;       /* inkMuted #6B6259 */

    /* shadcn ya no define la variable de acento: en HIVE ese nombre es la terracota (tailwind.config.ts). */

    --destructive: 349 64% 39%;          /* danger #A3243B */
    --destructive-foreground: 38 24% 93%;

    --border: 34 19% 84%;                /* line #DDD6CD */
    --input: 31 9% 50%;                  /* lineStrong #8A7F73 (3:1) */
    --ring: 30 13% 9%;                   /* ink */
```

- [ ] **Step 5: Imágenes generadas (spec §8)**

En `scripts/brand-assets.mjs`, cambiar `import { COLOR } from "../src/design/tokens.ts";` por `import { DARK, LIGHT } from "../src/design/tokens.ts";` y reemplazar `TARGETS` completo por:

```js
/** fg: color del símbolo · bg: fondo (null = transparente) · pad: margen relativo.
 *  Spec 2026-09-25 §8: ícono y favicon = hexágono terracota sobre el carbón de la app. */
export const TARGETS = [
  { file: "favicon-16.png", size: 16, fg: DARK.accent, bg: DARK.canvas, pad: 0.1 },
  { file: "favicon-32.png", size: 32, fg: DARK.accent, bg: DARK.canvas, pad: 0.12 },
  { file: "apple-touch-icon.png", size: 180, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-192.png", size: 192, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-512.png", size: 512, fg: DARK.accent, bg: DARK.canvas, pad: 0.18 },
  { file: "icon-maskable-512.png", size: 512, fg: DARK.accent, bg: DARK.canvas, pad: 0.28 },
  // Círculo terracota opaco: se ve en correo claro y oscuro (el correo lo recorta en círculo).
  { file: "email-logo.png", size: 240, fg: DARK.onAccent, bg: DARK.accent, pad: 0.18 },
  { file: "alma-mark-light.png", size: 512, fg: DARK.accent, bg: null, pad: 0.06 }, // "light" = para fondos oscuros
  ...[1, 2, 3].flatMap((k) => [
    { file: `wallet-logo${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: LIGHT.ink, bg: LIGHT.canvas, pad: 0.14 },
    { file: `wallet-logo-black${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: DARK.accent, bg: DARK.canvas, pad: 0.14 },
    ...["pilates", "jumping", "mixto", "event"].map((cat) => ({
      file: `wallet-icon-${cat}${k > 1 ? `@${k}x` : ""}.png`, size: 29 * k, fg: DARK.onAccent, bg: DARK.accent, pad: 0.12,
    })),
  ]),
];
```

En `scripts/brand-assets.test.mjs`:

- Debajo de los imports, agregar:

```js
import { DARK } from "../src/design/tokens.ts";
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
```

- En la prueba del ícono, renombrarla a `"el ícono de la app es carbón en la esquina y terracota en el hexágono"` y reemplazar sus dos aserciones por:

```js
  assert.deepEqual(px(4, 4), rgbOf(DARK.canvas));
  const hx = px(286, 150);
  assert.ok(near(hx, rgbOf(DARK.accent)), `el hexágono no es terracota: ${hx}`);
```

- En la prueba de `email-logo.png`, renombrarla a `"email-logo.png tiene la esquina en terracota opaca (se ve también en modo oscuro)"` y reemplazar `assert.deepEqual([r, g, b], [0xfa, 0x93, 0x6a], "esquina coral (accent)");` por `assert.deepEqual([r, g, b], rgbOf(DARK.accent), "esquina terracota (accent)");`.

- [ ] **Step 6: Guardia contra el coral**

Al final del `describe` de `src/design/guards.test.ts`:

```ts
  it("el coral #FA936A no aparece en el código, los scripts ni el HTML (spec 2026-09-25 regla 6)", () => {
    const extra = ["index.html", "public/site.webmanifest", "src/index.css",
      ...fs.readdirSync(path.join(root, "scripts")).filter((f) => /\.m?js$/.test(f)).map((f) => `scripts/${f}`)];
    const archivos = [...sourceFiles().map(rel), ...extra];
    const malos = archivos.filter((f) => /fa936a/i.test(fs.readFileSync(path.join(root, f), "utf8")));
    expect(malos).toEqual([]);
  });
```

- [ ] **Step 7: Regenerar y verificar**

Run:

```bash
npx vitest run src/design/tokens.test.ts src/design/guards.test.ts src/design/wiring.test.ts
npm run brand:assets && node --test "scripts/*.test.mjs"
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
grep -rni "fa936a" src scripts index.html public/site.webmanifest || echo "✓ sin coral"
```

Expected:
- Las pruebas en verde; el generador escribe 26 imágenes; las pruebas de scripts pasan 3/3.
- La suite completa en verde: las pruebas del panel comparan contra `COLOR` y siguen valiendo.
- `tsc` sin salida, y `✓ sin coral`.
- Abrir `public/icon-512.png` y `public/email-logo.png`: carbón con hexágono terracota, y círculo terracota con el símbolo oscuro.

- [ ] **Step 8: Commit**

```bash
git add -A src/design src/index.css scripts public
git commit -m "feat(hive): paleta v2 en dos temas con contraste medido

LIGHT (panel) y DARK (app) con las mismas claves: Ivory Silk, Smoked Taupe
y terracota; el coral #FA936A desaparece. COLOR sigue siendo el hex claro
del panel. Tonos también en clases (TONE_CLASS) para las piezas de los dos
temas. Contraste medido en ambos, incluido el degradado y el cristal sobre
el resplandor. Ícono, favicon y logo de correo en carbón y terracota.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Maquinaria de temas (variables CSS, Tailwind, `RouteTheme`)

**Files:**
- Modify: `src/index.css` (el bloque `@layer base { :root { … } }` de variables y utilidades nuevas)
- Modify: `tailwind.config.ts` (colores por variable, `darkMode`)
- Create: `src/design/theme.ts`
- Test: `src/design/theme.test.tsx`
- Modify: `src/App.tsx` (monta `RouteTheme`)
- Modify: `src/pages/NotFound.tsx` (sólo el hook de tema)
- Modify: `index.html`, `public/site.webmanifest`
- Modify: `src/design/wiring.test.ts` (archivo completo)
- Create: `src/design/zoneGuard.ts`
- Test: `src/design/zoneGuard.test.ts`

**Interfaces:**
- Consumes: `LIGHT`, `DARK`, `THEMES`, `Theme`, `cssVarName` (Tarea 1).
- Produces:
  - Clases de Tailwind por variable para todos los tokens: `bg-canvas`, `bg-surface/70`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `bg-accent`, `bg-accent-soft`, `text-accent-strong`, `text-accent-foreground`, `bg-accent-deep`, `bg-inverse`, `text-inverse-foreground`, etc.
  - La variante `dark:`, activa bajo `[data-theme="dark"]`.
  - Utilidades nuevas: `bg-accent-gradient`, `shadow-accent-glow`, `bg-app-glow`, `bg-pedestal-glow`, `bg-pedestal-base`, `clip-hex` y `shadow-float`.
  - En `theme.ts`: `applyTheme(theme)`, `useTheme(theme, key?)`, `themeForPath(path): Theme`, `RouteTheme()` y `THEME_COLOR: Record<Theme, string>`.
  - En `zoneGuard.ts`: `describeZone(files: string[], opciones?: { permitir?: RegExp })`. Lo usan las pruebas de las tareas 3 a 12. `permitir` salta las líneas que coinciden, como los botones oficiales de wallet.

- [ ] **Step 1: Escribir las pruebas**

`src/design/theme.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { applyTheme, themeForPath, RouteTheme, THEME_COLOR } from "./theme";
import { DARK } from "./tokens";
import NotFound from "@/pages/NotFound";

const meta = () => document.querySelector('meta[name="theme-color"]')?.getAttribute("content");

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#FFFFFF" />';
  delete document.documentElement.dataset.theme;
});

describe("tema", () => {
  it("la ruta decide el tema: app y acceso oscuros, lo demás claro", () => {
    expect(themeForPath("/app")).toBe("dark");
    expect(themeForPath("/app/wallet")).toBe("dark");
    expect(themeForPath("/auth/login")).toBe("dark");
    expect(themeForPath("/admin/dashboard")).toBe("light");
    expect(themeForPath("/")).toBe("light");
    expect(themeForPath("/application")).toBe("light");
  });
  it("applyTheme fija <html data-theme> y la barra de estado", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(meta()).toBe(DARK.canvas);
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(meta()).toBe(THEME_COLOR.light);
  });
  it("RouteTheme pone oscuro en /app y vuelve a claro al ir al panel", () => {
    const { unmount } = render(<MemoryRouter initialEntries={["/app"]}><RouteTheme /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe("dark");
    unmount();
    render(<MemoryRouter initialEntries={["/admin/dashboard"]}><RouteTheme /></MemoryRouter>);
    expect(document.documentElement.dataset.theme).toBe("light");
  });
  it("la 404 es oscura aunque la ruta sea de la zona clara", () => {
    render(
      <MemoryRouter initialEntries={["/no-existe"]}>
        <RouteTheme />
        <Routes><Route path="*" element={<NotFound />} /></Routes>
      </MemoryRouter>,
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

Reemplazar `src/design/wiring.test.ts` completo:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { LIGHT, DARK, THEMES, cssVarName, type ColorToken, type Theme } from "./tokens";

const root = path.resolve(__dirname, "..", "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const tw = fs.readFileSync(path.join(root, "tailwind.config.ts"), "utf8");

/** Cuerpo del bloque de variables de un tema. */
function block(theme: Theme): string {
  // index.css tiene otro `:root {` antes (curvas de movimiento): se busca el selector del tema.
  const sel = theme === "light" ? '[data-theme="light"]' : '[data-theme="dark"]';
  const i = css.indexOf(`${sel} {`);
  if (i < 0) throw new Error(`falta el bloque ${sel} en index.css`);
  return css.slice(i, css.indexOf("}", i));
}
const varIn = (b: string, name: string) => {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(b);
  if (!m) throw new Error(`falta ${name}`);
  return m[1].replace(/\/\*.*?\*\//g, "").trim();
};
const rgbTriplet = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
function hslToHex(t: string): string {
  const [h, s, l] = t.trim().split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100, L = l / 100, k = (n: number) => (n + h / 30) % 12, a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
const cercano = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);

describe.each(["light", "dark"] as Theme[])("variables del tema %s", (theme) => {
  const b = block(theme);
  const T = THEMES[theme];
  it.each(Object.keys(LIGHT) as ColorToken[])("%s coincide con su tabla", (t) => {
    expect(varIn(b, cssVarName(t))).toBe(rgbTriplet(T[t]));
  });
  const shadcn: Record<string, ColorToken> = {
    "--background": "canvas", "--foreground": "ink", "--card": "surface", "--card-foreground": "ink",
    "--popover": "surface", "--popover-foreground": "ink", "--primary": "ink", "--primary-foreground": "canvas",
    "--secondary": "sunken", "--secondary-foreground": "ink", "--muted": "sunken", "--muted-foreground": "inkMuted",
    "--destructive": "danger", "--destructive-foreground": "canvas", "--border": "line", "--input": "lineStrong", "--ring": "ink",
  };
  it.each(Object.entries(shadcn))("shadcn %s = %s", (v, t) => {
    expect(cercano(hslToHex(varIn(b, v)), T[t]), `${v}`).toBe(true);
  });
  it(`color-scheme es ${theme}`, () => {
    expect(varIn(b, "color-scheme")).toBe(theme);
  });
});

describe("cableado", () => {
  it("shadcn no define --accent: ese nombre es la terracota", () => {
    expect(css).not.toMatch(/--accent(-foreground)?:/);
  });
  it("Tailwind lee cada color por variable y activa dark: con data-theme", () => {
    expect(tw).toMatch(/darkMode:\s*\["selector",\s*'\[data-theme="dark"\]'\]/);
    expect(tw).not.toMatch(/#[0-9A-Fa-f]{6}/);
    for (const t of Object.keys(LIGHT) as ColorToken[]) {
      const name = cssVarName(t).slice(4); // sin "--c-"
      expect(tw, name).toContain(`v("${name}")`);
    }
  });
  it("los componentes shadcn no usan accent para hover, foco ni selección", () => {
    const dir = path.join(root, "src/components/ui");
    const mal = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx")).filter((f) => {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      return /:bg-accent(\/\d+)?(?![\w-])/.test(src) || /\btext-accent-foreground\b/.test(src);
    });
    expect(mal).toEqual([]);
  });
  it("index.html fija el tema por ruta antes de que cargue React", () => {
    const i = html.indexOf('name="theme-color"');
    const s = html.indexOf("<script>");
    expect(i).toBeGreaterThan(0);
    expect(s).toBeGreaterThan(i);
    const script = html.slice(s, html.indexOf("</script>", s));
    expect(script).toContain("/^\\/(app|auth)(\\/|$)/");
    expect(script).toContain("dataset.theme");
    expect(script).toContain(DARK.canvas);
  });
  it("fuentes, barra de estado y manifest", () => {
    expect(html).toMatch(/family=Unbounded/);
    expect(html).toMatch(/family=Manrope/);
    expect(html).toMatch(/name="theme-color" content="#FFFFFF"/);
    expect(html).toMatch(/name="msapplication-TileColor" content="#F2EFEA"/);
    expect(html).toMatch(/name="apple-mobile-web-app-status-bar-style" content="black"/);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "public/site.webmanifest"), "utf8"));
    expect(manifest.theme_color).toBe(DARK.canvas);
    expect(manifest.background_color).toBe(DARK.canvas);
  });
  it("el cuerpo usa Manrope y los titulares Unbounded", () => {
    expect(css).toMatch(/body\s*\{[^}]*'Manrope'/);
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*'Unbounded'/);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/design/theme.test.tsx src/design/wiring.test.ts`
Expected: FAIL. `./theme` no existe, `index.css` no tiene `--c-*` ni el bloque oscuro, y Tailwind usa hex.

- [ ] **Step 3: Variables por tema y utilidades en `src/index.css`**

Reemplazar el bloque `@layer base { :root { … } }` de variables (el segundo `:root {` del archivo, el que empieza con `color-scheme: light;`; el primero es el de las curvas de movimiento y no se toca) por:

```css
@layer base {
  /* HIVE — copia de src/design/tokens.ts (LIGHT / DARK). Tripletas RGB para
     Tailwind (rgb(var(--c-x) / a)) y HSL para shadcn. El tema lo fija
     <html data-theme> (src/design/theme.ts e index.html). El selector del tema
     claro también vale en una sección anidada (p. ej. /sistema). */
  :root,
  [data-theme="light"] {
    color-scheme: light;
    --c-canvas: 242 239 234;
    --c-surface: 255 255 255;
    --c-sunken: 232 227 220;
    --c-line: 221 214 205;
    --c-line-strong: 138 127 115;
    --c-ink: 26 23 20;
    --c-ink-muted: 107 98 89;
    --c-ink-faint: 138 127 115;
    --c-accent: 207 138 107;
    --c-accent-deep: 169 96 63;
    --c-on-accent: 26 23 20;
    --c-accent-soft: 243 222 211;
    --c-accent-strong: 154 82 54;
    --c-success: 46 107 80;
    --c-danger: 163 36 59;
    --c-inverse: 26 23 20;
    --c-inverse-raised: 38 34 30;
    --c-on-inverse: 242 239 234;
    --c-on-inverse-muted: 166 156 145;
    --c-shadow: 26 23 20;
    --shadow-alpha: 0.08;

    --background: 38 24% 93%;            /* canvas #F2EFEA */
    --foreground: 30 13% 9%;             /* ink #1A1714 */
    --card: 0 0% 100%;                   /* surface #FFFFFF */
    --card-foreground: 30 13% 9%;
    --popover: 0 0% 100%;
    --popover-foreground: 30 13% 9%;
    --primary: 30 13% 9%;                /* ink */
    --primary-foreground: 38 24% 93%;    /* canvas */
    --secondary: 35 21% 89%;             /* sunken #E8E3DC */
    --secondary-foreground: 30 13% 9%;
    --muted: 35 21% 89%;
    --muted-foreground: 30 9% 38%;       /* inkMuted #6B6259 */
    /* shadcn ya no define la variable de acento: en HIVE ese nombre es la terracota. */
    --destructive: 349 64% 39%;          /* danger #A3243B */
    --destructive-foreground: 38 24% 93%;
    --border: 34 19% 84%;                /* line #DDD6CD */
    --input: 31 9% 50%;                  /* lineStrong #8A7F73 (3:1) */
    --ring: 30 13% 9%;                   /* ink */

    --radius: 0.75rem;
  }

  [data-theme="dark"] {
    color-scheme: dark;
    --c-canvas: 20 18 16;
    --c-surface: 30 27 24;
    --c-sunken: 23 20 18;
    --c-line: 46 42 38;
    --c-line-strong: 111 102 93;
    --c-ink: 242 239 234;
    --c-ink-muted: 166 156 145;
    --c-ink-faint: 138 127 115;
    --c-accent: 207 138 107;
    --c-accent-deep: 169 96 63;
    --c-on-accent: 20 18 16;
    --c-accent-soft: 58 42 34;
    --c-accent-strong: 221 160 132;
    --c-success: 143 203 168;
    --c-danger: 240 163 155;
    --c-inverse: 242 239 234;
    --c-inverse-raised: 255 255 255;
    --c-on-inverse: 20 18 16;
    --c-on-inverse-muted: 107 98 89;
    --c-shadow: 0 0 0;
    --shadow-alpha: 0.45;

    --background: 30 11% 7%;             /* canvas #141210 */
    --foreground: 38 24% 93%;            /* ink #F2EFEA */
    --card: 30 11% 11%;                  /* surface #1E1B18 */
    --card-foreground: 38 24% 93%;
    --popover: 30 11% 11%;
    --popover-foreground: 38 24% 93%;
    --primary: 38 24% 93%;               /* ink */
    --primary-foreground: 30 11% 7%;     /* canvas */
    --secondary: 24 12% 8%;              /* sunken #171412 */
    --secondary-foreground: 38 24% 93%;
    --muted: 24 12% 8%;
    --muted-foreground: 31 11% 61%;      /* inkMuted #A69C91 */
    --destructive: 6 74% 77%;            /* danger #F0A39B */
    --destructive-foreground: 30 11% 7%;
    --border: 30 10% 16%;                /* line #2E2A26 */
    --input: 30 9% 40%;                  /* lineStrong #6F665D (3:1) */
    --ring: 38 24% 93%;                  /* ink */
  }
}

/* Tratamientos de la app oscura (spec 2026-09-25 §3.3 reglas 4 y 5). Hechos con
   las variables del tema: nada de color escrito a mano. */
@layer utilities {
  .bg-accent-gradient { background-image: linear-gradient(135deg, rgb(var(--c-accent)), rgb(var(--c-accent-deep))); }
  .shadow-accent-glow { box-shadow: 0 0 22px rgb(var(--c-accent) / 0.3); }
  .shadow-float { box-shadow: 0 8px 24px rgb(var(--c-shadow) / var(--shadow-alpha)); }
  .bg-app-glow {
    background-image:
      radial-gradient(110% 55% at 0% 0%, rgb(var(--c-accent-deep) / 0.24), transparent 62%),
      radial-gradient(80% 40% at 100% 70%, rgb(var(--c-accent-deep) / 0.1), transparent 70%);
  }
  .bg-pedestal-glow { background-image: radial-gradient(circle, rgb(var(--c-accent) / 0.38), transparent 65%); }
  .bg-pedestal-base {
    background-image: radial-gradient(ellipse at 50% 30%, rgb(var(--c-surface)), rgb(var(--c-canvas)) 70%);
    box-shadow: inset 0 -1px 0 rgb(var(--c-accent) / 0.55);
  }
  .clip-hex { clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
}
```

- [ ] **Step 4: `tailwind.config.ts`**

Reemplazar `import { COLOR } from "./src/design/tokens";` por:

```ts
/** Color por variable del tema (src/index.css): rgb(var(--c-x) / alfa). */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;
```

Cambiar `darkMode: ["class"],` por `darkMode: ["selector", '[data-theme="dark"]'],`.

Reemplazar el grupo de colores HIVE (de `canvas: COLOR.canvas,` al cierre de `inverse: { … },`) por:

```ts
        /* HIVE — tokens por función; el valor sale del tema (src/design/tokens.ts). */
        canvas: v("canvas"),
        surface: v("surface"),
        sunken: v("sunken"),
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        ink: { DEFAULT: v("ink"), muted: v("ink-muted"), faint: v("ink-faint") },
        accent: {
          DEFAULT: v("accent"),
          deep: v("accent-deep"),
          soft: v("accent-soft"),
          strong: v("accent-strong"),
          foreground: v("on-accent"),
        },
        success: v("success"),
        danger: v("danger"),
        inverse: {
          DEFAULT: v("inverse"),
          raised: v("inverse-raised"),
          foreground: v("on-inverse"),
          muted: v("on-inverse-muted"),
        },
```

- [ ] **Step 5: `src/design/theme.ts`**

```ts
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
```

- [ ] **Step 5b: Ayudante de la guardia de zona**

Primero la prueba, `src/design/zoneGuard.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FONDO_TERRACOTA, TINTA, FIJOS, COLOR_EN_LINEA } from "./zoneGuard";

const terracotaConTinta = (l: string) => FONDO_TERRACOTA.test(l) && TINTA.test(l);

describe("reglas de la guardia de zona", () => {
  it("marca text-ink junto a un fondo terracota (en oscuro ink es claro)", () => {
    expect(terracotaConTinta('className="bg-accent-gradient text-ink"')).toBe(true);
    expect(terracotaConTinta('className="bg-accent text-ink font-bold"')).toBe(true);
    expect(terracotaConTinta('className="bg-accent-gradient text-accent-foreground"')).toBe(false);
    expect(terracotaConTinta('className="bg-accent-soft text-ink"')).toBe(false);
    expect(terracotaConTinta('className="bg-accent text-ink-muted"')).toBe(false);
  });
  it("marca blancos y negros fijos", () => {
    expect(FIJOS.test('className="bg-white"')).toBe(true);
    expect(FIJOS.test('fill="#fff"')).toBe(true);
    expect(FIJOS.test('className="bg-surface text-ink"')).toBe(false);
  });
  it("marca color en estilos en línea", () => {
    expect(COLOR_EN_LINEA.test("style={{ color: x }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ backgroundColor: y, height: 4 }}")).toBe(true);
    expect(COLOR_EN_LINEA.test("style={{ height: 4 }}")).toBe(false);
  });
});
```

Run: `npx vitest run src/design/zoneGuard.test.ts`. Expected: FAIL, porque el módulo no existe.

Después, `src/design/zoneGuard.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Guardia de la zona de la app (spec 2026-09-25 §9): el color va en clases por
 * tema. Cada prueba de pieza o pantalla llama `describeZone([...sus archivos])`;
 * la Tarea 12 la aplica a la zona entera (src/design/app-zone.test.ts).
 */
const root = path.resolve(__dirname, "..", "..");
export const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

/** Fondo terracota en la misma línea que text-ink: en oscuro ink es claro (regla 1). */
export const FONDO_TERRACOTA = /\b(?:bg-accent(?![\w-])|bg-accent-gradient|from-accent(?![\w-]))/;
export const TINTA = /\btext-ink(?![\w-])/;
/** Blancos y negros fijos que ignoran el tema. */
export const FIJOS = /\b(?:bg|text|border|ring|from|to|via)-(?:white|black)\b|#(?:fff|000)\b/i;
/** Color en estilo en línea: jsdom no lo ve y no sigue al tema. */
export const COLOR_EN_LINEA = /style=\{\{[^}]*\b(?:color|backgroundColor|background|borderColor|border|boxShadow|fill|stroke)\s*:/;

export const lineasCon = (src: string, pred: (l: string) => boolean) =>
  src.split("\n").map((l, i) => [l, i + 1] as const).filter(([l]) => pred(l)).map(([, n]) => n);

export function describeZone(files: string[], opciones: { permitir?: RegExp } = {}) {
  const libre = (l: string) => !(opciones.permitir && opciones.permitir.test(l));
  describe.each(files)("zona de la app: %s", (f) => {
    const src = read(f);
    it("no usa COLOR ni los tonos en hex", () => {
      expect(src).not.toMatch(/\bCOLOR\b/);
      expect(src).not.toMatch(/\bresolveTone\(|\bTONE_STYLE\b/);
    });
    it("no pone colores en estilos en línea", () => {
      expect(lineasCon(src, (l) => libre(l) && COLOR_EN_LINEA.test(l) && !/cssColor\(/.test(l))).toEqual([]);
    });
    it("no usa blancos ni negros fijos", () => {
      expect(lineasCon(src, (l) => libre(l) && FIJOS.test(l))).toEqual([]);
    });
    it("nunca pone text-ink sobre un fondo terracota", () => {
      expect(lineasCon(src, (l) => FONDO_TERRACOTA.test(l) && TINTA.test(l))).toEqual([]);
    });
  });
}
```

Run: `npx vitest run src/design/zoneGuard.test.ts`. Expected: PASS.

- [ ] **Step 6: Montar el tema**

- En `src/App.tsx`, agregar `import { RouteTheme } from "@/design/theme";` y, dentro de `<BrowserRouter>`, justo antes de `<Routes>`, `<RouteTheme />`.
- En `src/pages/NotFound.tsx`, agregar `import { useTheme } from "@/design/theme";` y, como primera línea del componente, después de `const location = useLocation();`, poner `useTheme("dark", location.pathname);`. React corre los efectos de los hermanos en orden, así que `RouteTheme` va primero y la 404 queda oscura.

- [ ] **Step 7: `index.html` y manifest**

En `index.html`:
- Justo después de `<meta name="theme-color" content="#FFFFFF" />`, insertar:

```html
    <script>
      /* Tema por ruta antes de que cargue React (src/design/theme.ts): sin parpadeo claro en la app. */
      (function () {
        var dark = /^\/(app|auth)(\/|$)/.test(location.pathname);
        document.documentElement.dataset.theme = dark ? "dark" : "light";
        if (dark) document.querySelector('meta[name="theme-color"]').setAttribute("content", "#141210");
      })();
    </script>
```

- Cambiar `content="#F4F4F3"` de `msapplication-TileColor` por `content="#F2EFEA"`.
- Cambiar el `content` de `apple-mobile-web-app-status-bar-style` a `"black"`.

En `public/site.webmanifest`: `"background_color": "#141210"` y `"theme_color": "#141210"`.

- [ ] **Step 8: Pruebas, tipos y build**

Run:

```bash
npx vitest run src/design 2>&1 | tail -3
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
VITE_API_URL=/api npx vite build 2>&1 | tail -2
grep -c "rgb(var(--c-accent) / 0.3)" dist/assets/*.css
```

Expected:
- Todo en verde, `tsc` vacío y el build bien.
- La última línea da `1` o más: las utilidades nuevas llegaron al CSS.
- Si una prueba de pieza de la app falla porque espera un color hex que ahora sale de una clase, **no** se corrige aquí. Anotarla en el reporte: la reescriben las tareas 3 a 5.

- [ ] **Step 9: Commit**

```bash
git add -A src/index.css tailwind.config.ts src/design src/App.tsx src/pages/NotFound.tsx index.html public/site.webmanifest
git commit -m "feat(hive): temas claro y oscuro por variables CSS, con el tema por ruta

Las clases de Tailwind leen variables por tema; <html data-theme> lo fija
RouteTheme según la ruta (app y acceso oscuros; panel y lo demás claro) y
un script en index.html evita el parpadeo al recargar. dark: activa los
tratamientos propios de la app. Utilidades de degradado, resplandor y
pedestal hechas con las variables.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `AppShell` y sus piezas en clases por tema

**Files:**
- Modify: `src/components/app/AppShell.tsx` (archivo completo)
- Create: `src/components/brand/HexPedestal.tsx`
- Modify: `src/components/app/pieces.test.tsx` y `src/components/app/tones.test.tsx` (archivos completos)

**Interfaces:**
- Consumes: `resolveToneClass`, `TONE_CLASS`, `Tone` (Tarea 1); clases, utilidades y `describeZone` (Tarea 2).
- Produces:
  - Las mismas exportaciones de `AppShell.tsx` con las mismas props.
  - `GhostButton` gana la prop opcional `tone?: "default" | "danger"`.
  - `HexPedestal({ size?: "sm" | "lg"; icon?: ReactNode; tone?: "accent" | "danger" })`.

- [ ] **Step 1: Escribir las pruebas de las piezas**

`src/components/app/pieces.test.tsx` (reemplaza el archivo):

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AppShell, PageHeader, PrimaryButton, GhostButton, EmptyState, ErrorState, ListGroup, ListRow, ActionRow, SkeletonRow,
} from "./AppShell";
import { describeZone } from "@/design/zoneGuard";

describeZone(["src/components/app/AppShell.tsx", "src/components/brand/HexPedestal.tsx"]);

const wrap = (ui: React.ReactNode, route = "/app") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

/** Ningún elemento lleva color en `style`: todo sale de clases por tema. */
const sinColorEnLinea = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);

describe("AppShell (oscuro)", () => {
  it("barra inferior: las cinco pestañas reales con etiqueta", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>, "/app/classes");
    const nav = document.querySelector("nav[data-bottom-nav]")!;
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Inicio", "Reservar", "Mis clases", "Wallet", "Perfil"]);
  });
  it("la pestaña activa va en degradado terracota con ícono oscuro; las demás en taupe", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>, "/app/classes");
    const nav = document.querySelector("nav[data-bottom-nav]")!;
    const activa = nav.querySelector('a[aria-current="page"] [data-nav-icon]')!;
    expect(activa.className).toMatch(/\bbg-accent-gradient\b/);
    expect(activa.className).toMatch(/\btext-accent-foreground\b/);
    const otra = nav.querySelector('a:not([aria-current]) [data-nav-icon]')!;
    expect(otra.className).toMatch(/\btext-ink-faint\b/);
  });
  it("las etiquetas de la barra miden 12 px y los destinos 44 px", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>);
    for (const a of document.querySelectorAll("nav[data-bottom-nav] a")) {
      expect(a.className).toMatch(/min-h-\[44px\]/);
      expect(a.querySelector("span:last-child")!.className).toMatch(/text-\[0\.75rem\]/);
    }
  });
  it("tiene el resplandor del fondo, sólo en oscuro", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>);
    const glow = document.querySelector("[data-app-glow]")!;
    expect(glow.className).toMatch(/\bhidden\b/);
    expect(glow.className).toMatch(/\bdark:block\b/);
    expect(glow.className).toMatch(/\bbg-app-glow\b/);
  });
  it("no pone colores en línea", () => {
    const { container } = wrap(<AppShell><p>x</p></AppShell>);
    expect(sinColorEnLinea(container)).toEqual([]);
  });
});

describe("PageHeader", () => {
  it("ya no es un bloque coral: título en tinta y segunda línea terracota", () => {
    wrap(<PageHeader title="Tus clases" titleAccent="en HIVE." />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.closest("header")!.className).not.toMatch(/bg-accent/);
    expect(h1.className).toMatch(/\btext-ink\b/);
    const acento = screen.getByText("en HIVE.");
    expect(acento.className).toMatch(/\btext-accent-strong\b/);
    expect(acento.className).toMatch(/\bdark:text-accent\b/);
  });
  it("el titular escala y puede partir línea a 390 px", () => {
    wrap(<PageHeader title="Notificaciones" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/text-\[length:clamp\(/);
    expect(h1.className).toMatch(/break-words/);
  });
});

describe("botones", () => {
  it("primary: tinta en el panel, degradado terracota con texto oscuro en la app", () => {
    wrap(<PrimaryButton>Reservar</PrimaryButton>);
    const b = screen.getByRole("button", { name: /Reservar/ });
    expect(b.className).toMatch(/\bbg-ink\b.*\btext-canvas\b/);
    expect(b.className).toMatch(/\bdark:bg-accent-gradient\b/);
    expect(b.className).toMatch(/\bdark:text-accent-foreground\b/);
  });
  it("accent: terracota con texto oscuro", () => {
    wrap(<PrimaryButton variant="accent">Comprar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Comprar/ }).className).toMatch(/\bbg-accent\b.*\btext-accent-foreground\b/);
  });
  it("deshabilitado: fondo sunken y texto tenue", () => {
    wrap(<PrimaryButton disabled>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ }).className).toMatch(/\bbg-sunken\b.*\btext-ink-faint\b/);
  });
  it("GhostButton destructivo: contorno y texto danger", () => {
    wrap(<GhostButton tone="danger">Cancelar reserva</GhostButton>);
    expect(screen.getByRole("button", { name: "Cancelar reserva" }).className).toMatch(/\btext-danger\b.*\bring-danger\/60\b/);
  });
  it("todos miden al menos 44 px", () => {
    wrap(<><PrimaryButton size="sm">A</PrimaryButton><GhostButton>B</GhostButton></>);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });
});

describe("otras piezas", () => {
  it("ListGroup: tarjeta con borde, translúcida en oscuro", () => {
    const { container } = wrap(<ListGroup><ListRow title="Uno" /></ListGroup>);
    const c = container.firstElementChild as HTMLElement;
    expect(c.className).toMatch(/\bborder-line\b/);
    expect(c.className).toMatch(/\bbg-surface\b/);
    expect(c.className).toMatch(/\bdark:bg-surface\/70\b/);
  });
  it("ActionRow: la flecha es terracota con ícono oscuro", () => {
    wrap(<ActionRow title="Tu próxima clase" to="/app/bookings" />);
    const f = screen.getByTestId("action-row-arrow");
    expect(f.className).toMatch(/\bbg-accent\b/);
    expect(f.className).toMatch(/\bdark:bg-accent-gradient\b/);
    expect(f.className).toMatch(/\btext-accent-foreground\b/);
  });
  it("EmptyState: hexágono en pedestal y su acción", () => {
    wrap(<EmptyState title="Aún no tienes clases" ctaLabel="Reservar" ctaTo="/app/classes" />);
    expect(document.querySelector("[data-hex-pedestal]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/app/classes");
  });
  it("ErrorState: alerta con reintento", () => {
    const retry = vi.fn();
    wrap(<ErrorState onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalled();
  });
  it("ninguna pieza pone colores en línea", () => {
    const { container } = wrap(
      <>
        <PageHeader title="T" titleAccent="a" subtitle="s" />
        <ListGroup><ListRow title="Uno" icon={<i>i</i>} onClick={() => {}} /><ListRow title="Salir" destructive onClick={() => {}} /></ListGroup>
        <ActionRow title="x" to="/app" eyebrow="e" meta="m" />
        <EmptyState title="v" /><ErrorState /><SkeletonRow />
        <PrimaryButton>p</PrimaryButton><GhostButton>g</GhostButton>
      </>,
    );
    expect(sinColorEnLinea(container)).toEqual([]);
  });
});
```

`src/components/app/tones.test.tsx` (reemplaza el archivo):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Tag, Stat, ListRow } from "./AppShell";
import { TONE_CLASS } from "@/design/tokens";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("piezas con tono (clases por tema)", () => {
  it("Tag suave terracota: fondo accent-soft, texto ink y contorno", () => {
    wrap(<Tag tint="accent">Últimos 2</Tag>);
    const el = screen.getByText("Últimos 2");
    has(el, TONE_CLASS.accent.softBg); has(el, TONE_CLASS.accent.softFg); has(el, "ring-1");
  });
  it("Tag sólido terracota: nunca texto claro", () => {
    wrap(<Tag tint="accent" variant="solid">4 lugares</Tag>);
    const el = screen.getByText("4 lugares");
    has(el, "bg-accent"); has(el, "text-accent-foreground"); has(el, "dark:bg-accent-gradient");
  });
  it("un tono desconocido no rompe la pantalla: cae al neutro", () => {
    wrap(<Tag tint={"violeta" as never}>Raro</Tag>);
    has(screen.getByText("Raro"), TONE_CLASS.muted.softFg);
  });
  it("Stat pinta la cifra con el color del tono", () => {
    wrap(<Stat value="12" label="Clases" tint="accent" />);
    has(screen.getByText("12"), "text-accent-strong");
  });
  it("ListRow destructiva usa danger en el título; el chip lleva contorno", () => {
    wrap(<ListRow title="Cerrar sesión" destructive icon={<span>i</span>} onClick={() => {}} />);
    has(screen.getByText("Cerrar sesión"), "text-danger");
    const chip = document.querySelector("[data-row-icon]")!;
    has(chip, "ring-1"); has(chip, TONE_CLASS.danger.softBg);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/components/app`
Expected: FAIL. `GhostButton` no acepta `tone`, no existe `[data-app-glow]`, `PageHeader` sigue siendo un bloque coral y la guardia de zona marca `COLOR` (y `HexPedestal.tsx` no existe).

- [ ] **Step 3: `src/components/brand/HexPedestal.tsx`**

```tsx
import type { ReactNode } from "react";

/*
 * Hexágono HIVE sobre un pedestal iluminado: momento de marca (spec 2026-09-25 §5).
 * Estados vacío y error, acceso, confirmación de clase, 404. Decorativo.
 * En claro (panel) conserva el hexágono pequeño de siempre; el pedestal y su
 * resplandor sólo aparecen en oscuro.
 */
type HexPedestalProps = {
  size?: "sm" | "lg";
  icon?: ReactNode;
  tone?: "accent" | "danger";
};

export function HexPedestal({ size = "sm", icon, tone = "accent" }: HexPedestalProps) {
  const lg = size === "lg";
  const small = tone === "danger" ? "bg-sunken text-danger" : "bg-accent-soft text-accent-strong";
  const core = tone === "danger" ? "bg-danger text-canvas" : "bg-accent-gradient text-accent-foreground";
  return (
    <span aria-hidden="true" data-hex-pedestal className="inline-grid">
      <span className={`grid h-12 w-[52px] place-items-center clip-hex dark:hidden ${small}`}>{icon}</span>
      <span className={`relative hidden dark:grid place-items-center ${lg ? "h-[190px] w-[200px]" : "h-[120px] w-[150px]"}`}>
        <span className={`absolute rounded-full blur-[6px] bg-pedestal-glow ${lg ? "h-[180px] w-[180px]" : "h-[110px] w-[110px]"}`} />
        <span className={`absolute bottom-2 rounded-[50%] bg-pedestal-base ${lg ? "h-[26px] w-[150px]" : "h-[18px] w-[110px]"}`} />
        <span className={`relative grid place-items-center clip-hex bg-surface ${lg ? "h-[108px] w-[96px]" : "h-[70px] w-[62px]"}`}>
          <span className={`grid place-items-center clip-hex ${core} ${lg ? "h-[65px] w-[58px]" : "h-[42px] w-[37px]"}`}>{icon}</span>
        </span>
      </span>
    </span>
  );
}
```

- [ ] **Step 4: Reescribir `src/components/app/AppShell.tsx`**

Reemplazar el archivo completo:

```tsx
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import {
  Home,
  CalendarDays,
  ClipboardList,
  Wallet as WalletIcon,
  User as UserIcon,
  Bell,
  ChevronRight,
  LogOut,
  ArrowRight,
  ArrowUpRight,
  AlertCircle,
} from "lucide-react";

import { resolveToneClass, type Tone } from "@/design/tokens";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HexPedestal } from "@/components/brand/HexPedestal";

/* ═══════════════════════════════════════════════════════════
   AppShell — /app en oscuro (spec 2026-09-25 §5).
   El color viaja en clases por función (bg-canvas, text-ink…) que leen las
   variables del tema; nada de color en línea (guardia describeZone, src/design/zoneGuard.ts).
   ═══════════════════════════════════════════════════════════ */

type NavItem = {
  to: string;
  label: string;
  icon: typeof Home;
  exact?: boolean;
};
const NAV: readonly NavItem[] = [
  { to: "/app", label: "Inicio", icon: Home, exact: true },
  { to: "/app/classes", label: "Reservar", icon: CalendarDays },
  { to: "/app/bookings", label: "Mis clases", icon: ClipboardList },
  { to: "/app/wallet", label: "Wallet", icon: WalletIcon },
  { to: "/app/profile", label: "Perfil", icon: UserIcon },
];

const isActive = (pathname: string, to: string, exact?: boolean) =>
  exact ? pathname === to : pathname === to || pathname.startsWith(to + "/");

const greetByHour = (now = new Date()) => {
  const h = now.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
};

type AppShellProps = {
  children: ReactNode;
  /** When true, hide the top greeting strip (page provides its own header). */
  hideGreeting?: boolean;
};

export const AppShell = ({ children, hideGreeting = false }: AppShellProps) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const firstName = (user?.displayName ?? user?.display_name ?? "").split(" ")[0]
    || user?.email?.split("@")[0]
    || "Tú";
  const initials = (user?.displayName ?? user?.display_name ?? user?.email ?? "U")
    .split(" ")
    .filter(Boolean)
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatarUrl = user?.photoUrl ?? user?.photo_url ?? null;
  const avatar = avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials;

  const handleLogout = () => {
    logout();
    navigate("/auth/login");
  };

  // Unread badge count para el bell icon
  const { data: unreadData } = useQuery<{ data: { unread_count: number } }>({
    queryKey: ["notifications-unread-count"],
    queryFn: async () => (await api.get("/me/notifications/unread-count")).data,
    refetchInterval: 60_000,
    enabled: !!user?.id,
  });
  const unreadCount = unreadData?.data?.unread_count ?? 0;
  const badge = unreadCount > 9 ? "9+" : String(unreadCount);
  const notifActive = pathname.startsWith("/app/notifications");

  return (
    <div className="relative isolate min-h-screen bg-canvas text-ink lg:grid lg:grid-cols-[260px_1fr]">
      {/* Resplandor cálido del fondo: sólo en oscuro, fijo detrás de todo (regla 5). */}
      <div aria-hidden="true" data-app-glow className="pointer-events-none fixed inset-0 -z-10 hidden dark:block bg-app-glow" />

      {/* ───────────── Sidebar (desktop) ───────────── */}
      <aside className="hidden lg:flex sticky top-0 self-start h-screen flex-col px-6 py-7 border-r border-line bg-canvas/80">
        <Link to="/" className="flex items-center no-underline mb-10 text-accent">
          <BrandLogo variant="lockup" size={40} />
        </Link>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={
                  "group grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.92rem] no-underline transition-colors " +
                  (active ? "bg-accent-soft text-accent-strong font-bold" : "text-ink-muted font-medium hover:bg-surface/70 hover:text-ink")
                }
              >
                <Icon size={17} strokeWidth={active ? 2.2 : 1.8} />
                <span>{item.label}</span>
                {active && <ChevronRight size={14} />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 pt-6 flex flex-col gap-1 border-t border-line">
          <Link
            to="/app/notifications"
            aria-current={notifActive ? "page" : undefined}
            className={
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.88rem] no-underline transition-colors " +
              (notifActive ? "bg-accent-soft text-accent-strong font-bold" : "text-ink-muted hover:bg-surface/70 hover:text-ink")
            }
          >
            <span className="relative inline-flex">
              <Bell size={16} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span data-unread className="nums absolute -top-1.5 -right-1.5 grid place-items-center rounded-full bg-accent-gradient text-accent-foreground text-[0.75rem] font-bold leading-none px-1 min-w-[16px] h-[16px]">
                  {badge}
                </span>
              )}
            </span>
            <span>Notificaciones</span>
            <span aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-auto pt-6 border-t border-line">
          <Link to="/app/profile" className="flex items-center gap-3 no-underline text-ink">
            <span className="grid h-10 w-10 place-items-center rounded-full overflow-hidden bg-inverse text-inverse-foreground text-[0.78rem] font-bold">
              {avatar}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.86rem] font-semibold truncate leading-tight">{firstName}</p>
              <p className="text-[0.75rem] truncate text-ink-muted">{user?.email}</p>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            className="mt-3 w-full grid grid-cols-[auto_1fr] items-center gap-3 rounded-2xl px-3.5 min-h-[44px] text-[0.84rem] cursor-pointer bg-transparent border-0 text-ink-muted transition-colors hover:text-ink"
          >
            <LogOut size={15} strokeWidth={1.8} />
            <span className="text-left">Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* ───────────── Main column ───────────── */}
      <div className="flex flex-col min-w-0">
        {/* Mobile top bar: logo · campana · avatar */}
        <header className="lg:hidden sticky top-0 z-30 flex h-16 items-center justify-between px-5 border-b border-line bg-canvas/85 backdrop-blur">
          <Link to="/app" aria-label="Inicio" className="flex items-center no-underline text-accent">
            <BrandLogo size={30} />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/app/notifications"
              aria-label={unreadCount > 0 ? `Notificaciones (${unreadCount} sin leer)` : "Notificaciones"}
              className={"relative grid h-11 w-11 place-items-center rounded-full no-underline text-ink transition-colors " + (notifActive ? "bg-surface/70" : "hover:bg-surface/70")}
            >
              <Bell size={18} strokeWidth={1.8} />
              {unreadCount > 0 && (
                <span data-unread className="nums absolute top-1 right-1 grid place-items-center rounded-full bg-accent-gradient text-accent-foreground text-[0.75rem] font-bold leading-none px-1 min-w-[18px] h-[18px]">
                  {badge}
                </span>
              )}
            </Link>
            <Link
              to="/app/profile"
              aria-label="Perfil"
              className="grid h-10 w-10 place-items-center rounded-full overflow-hidden bg-inverse text-inverse-foreground text-[0.75rem] font-bold no-underline"
            >
              {avatar}
            </Link>
          </div>
        </header>

        {/* Greeting strip (hideable per page) */}
        {!hideGreeting && (
          <div className="px-5 sm:px-7 lg:px-12 pt-6 lg:pt-12 pb-1">
            <p className="text-[0.75rem] font-bold uppercase tracking-[0.2em] text-ink-muted">
              {greetByHour(today)}, {firstName}
            </p>
          </div>
        )}

        <main className="flex-1 px-5 sm:px-7 lg:px-12 pt-4 lg:pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-16">
          {children}
        </main>

        {/* Mobile bottom nav: las cinco pestañas reales */}
        <nav
          data-bottom-nav
          className="lg:hidden fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-canvas/90 backdrop-blur pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          {NAV.map((item) => {
            const active = isActive(pathname, item.to, item.exact);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                data-press
                aria-current={active ? "page" : undefined}
                className="flex min-h-[44px] flex-col items-center justify-center gap-1 py-1 no-underline"
              >
                <span
                  data-nav-icon
                  className={"grid h-8 w-11 place-items-center rounded-2xl transition-colors " + (active ? "bg-accent-gradient text-accent-foreground shadow-accent-glow" : "text-ink-faint")}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className={"text-[0.75rem] " + (active ? "text-ink font-bold" : "text-ink-faint font-medium")}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   Primitives — funcionan en los dos temas (el panel usa algunas).
   ═══════════════════════════════════════════════════════════ */

/* ── PageHeader ── encabezado de la app: etiqueta, título en mayúsculas y
   segunda línea terracota sobre el resplandor (spec 2026-09-25 §5). */
type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  titleAccent?: string;
  subtitle?: string;
  actions?: ReactNode;
};
export const PageHeader = ({ eyebrow, title, titleAccent, subtitle, actions }: PageHeaderProps) => (
  <header className="mb-7 lg:mb-10">
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[0.75rem] font-bold uppercase tracking-[0.16em] text-ink-muted">{eyebrow}</p>}
        <h1
          lang="es"
          className={"font-display font-extrabold uppercase leading-[1.02] tracking-[-0.01em] break-words hyphens-auto text-ink text-[length:clamp(1.5rem,7.2vw,1.75rem)] " + (eyebrow ? "mt-2" : "")}
          /* display-l: 28 px desde 390 px */
        >
          {title}
          {titleAccent && (
            <span className="block mt-1 font-semibold normal-case tracking-normal text-[0.62em] text-accent-strong dark:text-accent">
              {titleAccent}
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-2 text-[0.95rem] leading-[1.5] text-ink-muted max-w-[60ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  </header>
);

/* ── Section ── */
type SectionProps = {
  title?: string;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
};
export const Section = ({ title, trailing, children, className }: SectionProps) => (
  <section className={"mt-8 lg:mt-10 " + (className ?? "")}>
    {(title || trailing) && (
      <div className="flex items-end justify-between gap-3 pb-3 mb-4 border-b border-line">
        {title && <h2 className="font-sans text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{title}</h2>}
        {trailing && <div className="text-[0.8125rem]">{trailing}</div>}
      </div>
    )}
    {children}
  </section>
);

/* ── ListRow ── fila con divisor; interactiva si recibe `to` u `onClick` */
type ListRowProps = {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  iconTint?: Tone;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  asButton?: boolean;
};
export const ListRow = ({ to, onClick, icon, iconTint = "accent", title, description, trailing, destructive, asButton }: ListRowProps) => {
  const t = resolveToneClass(destructive ? "danger" : iconTint);
  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      {icon ? (
        <span data-row-icon className={`grid h-10 w-10 place-items-center rounded-xl shrink-0 ring-1 ring-inset ring-line ${t.softBg} ${t.fg}`}>
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="min-w-0">
        <div className={"text-[0.95rem] font-semibold leading-tight truncate " + (destructive ? "text-danger" : "text-ink")}>{title}</div>
        {description && <div className="text-[0.8125rem] mt-0.5 truncate text-ink-muted">{description}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-ink-muted">
        {trailing}
        {(to || onClick) && <ChevronRight size={15} className="text-ink-faint" />}
      </div>
    </div>
  );

  const sharedClass = "block w-full text-left no-underline transition-colors text-ink border-t border-line px-4";
  const interactiveClass = sharedClass + " hover:bg-ink/5";

  if (asButton || (onClick && !to)) {
    return (
      <button onClick={onClick} className={interactiveClass + " bg-transparent border-x-0 border-b-0 cursor-pointer"}>
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={interactiveClass}>
        {inner}
      </Link>
    );
  }
  return <div className={sharedClass}>{inner}</div>;
};

/* ── ListGroup ── tarjeta que agrupa ListRows; translúcida en oscuro */
export const ListGroup = ({ children }: { children: ReactNode }) => (
  <div className="rounded-[20px] overflow-hidden border border-line bg-surface dark:bg-surface/70 [&>*:first-child]:!border-t-0">
    {children}
  </div>
);

/* ── Stat ── cifra + etiqueta */
type StatProps = {
  value: ReactNode;
  label: string;
  tint?: Tone;
};
export const Stat = ({ value, label, tint = "ink" }: StatProps) => (
  <div className="pt-3 border-t border-line">
    <div className={`font-display font-semibold text-2xl leading-none ${resolveToneClass(tint).fg}`}>{value}</div>
    <div className="text-[0.75rem] font-bold uppercase tracking-[0.12em] mt-1.5 text-ink-muted">{label}</div>
  </div>
);

/* ── Tag ── pill; sólida para disponibilidad (terracota = hay lugar) */
type TagProps = {
  children: ReactNode;
  tint?: Tone;
  variant?: "soft" | "solid";
};
export const Tag = ({ children, tint = "accent", variant = "soft" }: TagProps) => {
  const t = resolveToneClass(tint);
  const tone = variant === "soft"
    ? `${t.softBg} ${t.softFg} ring-1 ring-inset ${t.ring}`
    : `${t.solidBg} ${t.solidFg}` + (tint === "accent" ? " dark:bg-accent-gradient" : "");
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold leading-none " + tone}>
      {children}
    </span>
  );
};

/* ── EmptyState ── */
type EmptyStateProps = {
  title: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
  onCta?: () => void;
  icon?: ReactNode;
};
export const EmptyState = ({ title, description, ctaLabel, ctaTo, onCta, icon }: EmptyStateProps) => (
  <div className="flex flex-col items-start gap-4 py-10">
    <HexPedestal icon={icon} />
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight text-ink">{title}</h3>
      {description && <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch] text-ink-muted">{description}</p>}
    </div>
    {ctaLabel && (ctaTo ? <PrimaryButton to={ctaTo}>{ctaLabel}</PrimaryButton> : <PrimaryButton onClick={onCta}>{ctaLabel}</PrimaryButton>)}
  </div>
);

/* ── Botones ── primary en tinta en el panel y en degradado terracota en la
   app (spec 2026-09-25 §5). Todos ≥44 px. */
type CommonBtnProps = {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  size?: "sm" | "md";
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  className?: string;
  variant?: "primary" | "accent";
};

export const PrimaryButton = ({ children, loading, loadingLabel, size = "md", to, onClick, disabled, type = "button", className: extra, variant = "primary" }: CommonBtnProps) => {
  const sizeClass = size === "sm" ? "min-h-[44px] px-5 text-[0.85rem]" : "min-h-[48px] px-6 text-[0.9rem]";
  // Deshabilitado: fondo sunken y tinta tenue. Cargando conserva su color.
  const tone = disabled && !loading
    ? "bg-sunken text-ink-faint"
    : variant === "accent"
      ? "bg-accent text-accent-foreground dark:bg-accent-gradient dark:shadow-accent-glow"
      : "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground dark:shadow-accent-glow";
  const className = `group inline-flex items-center justify-center gap-2 rounded-full font-bold no-underline transition-transform motion-safe:hover:-translate-y-px disabled:translate-y-0 ${sizeClass} ${tone} ${extra ?? ""}`;
  const inner = loading ? <>{loadingLabel ?? "Cargando…"}</> : (
    <>
      {children}
      <ArrowRight size={15} className="transition-transform motion-safe:group-hover:translate-x-0.5" />
    </>
  );
  if (to) return <Link to={to} data-press className={className} onClick={onClick}>{inner}</Link>;
  return (
    <button type={type} data-press className={className} onClick={onClick} disabled={disabled || loading}>
      {inner}
    </button>
  );
};

type GhostButtonProps = CommonBtnProps & { tone?: "default" | "danger" };

export const GhostButton = ({ children, to, onClick, disabled, type = "button", className: extra, tone = "default" }: GhostButtonProps) => {
  const toneClass = tone === "danger" ? "text-danger ring-danger/60" : "text-ink ring-line-strong";
  const className = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-surface dark:bg-surface/70 px-5 text-[0.85rem] font-bold no-underline ring-[1.5px] ring-inset transition-colors hover:bg-sunken ${toneClass} ${extra ?? ""}`;
  if (to) return <Link to={to} data-press className={className} onClick={onClick}>{children}</Link>;
  return <button type={type} data-press className={className} onClick={onClick} disabled={disabled}>{children}</button>;
};

/* ── ActionRow ── tarjeta de acción amplia (p. ej. "tu próxima clase") */
type ActionRowProps = {
  to?: string;
  onClick?: () => void;
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  rightLabel?: string;
  tint?: Tone;
};
export const ActionRow = ({ to, onClick, eyebrow, title, meta, rightLabel, tint = "accent" }: ActionRowProps) => {
  const t = resolveToneClass(tint);
  const arrow = tint === "accent"
    ? "bg-accent text-accent-foreground dark:bg-accent-gradient dark:shadow-accent-glow"
    : `${t.solidBg} ${t.solidFg}`;
  const inner = (
    <div className="grid grid-cols-[1fr_auto] items-center gap-5 px-5 py-5 sm:px-6 sm:py-6 rounded-[20px] border border-line bg-surface dark:bg-surface/70 transition-transform motion-safe:hover:-translate-y-px">
      <div className="min-w-0">
        {eyebrow && <p className={`text-[0.75rem] font-bold uppercase tracking-[0.12em] ${t.fg}`}>{eyebrow}</p>}
        <div className="font-display font-semibold text-[1.25rem] sm:text-[1.5rem] leading-tight mt-1 text-ink">{title}</div>
        {meta && <p className="text-[0.875rem] mt-1 text-ink-muted">{meta}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {rightLabel && <span className={`hidden sm:inline-block text-[0.75rem] font-bold uppercase tracking-[0.12em] ${t.fg}`}>{rightLabel}</span>}
        <span data-testid="action-row-arrow" className={`grid h-11 w-11 place-items-center rounded-full ${arrow}`}>
          <ArrowUpRight size={16} />
        </span>
      </div>
    </div>
  );
  if (to) {
    return <Link to={to} className="block no-underline">{inner}</Link>;
  }
  return (
    <button onClick={onClick} className="block w-full text-left bg-transparent border-0 p-0 cursor-pointer">
      {inner}
    </button>
  );
};

/* ── SkeletonRow ── visible sobre canvas y sobre surface en los dos temas */
export const SkeletonRow = ({ height = 64 }: { height?: number }) => (
  <div aria-hidden="true" className="rounded-2xl overflow-hidden relative bg-line" style={{ height }}>
    <span className="absolute inset-0 motion-safe:animate-pulse bg-sunken" />
  </div>
);

/* ── ErrorState ── honesto, con reintento */
type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
};
export const ErrorState = ({
  title = "Algo no salió bien",
  description = "No pudimos cargar esta información. Revisa tu conexión y vuelve a intentarlo.",
  onRetry,
  retryLabel = "Reintentar",
}: ErrorStateProps) => (
  <div role="alert" className="flex flex-col items-start gap-4 py-10">
    <HexPedestal tone="danger" icon={<AlertCircle size={20} strokeWidth={1.8} />} />
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight text-ink">{title}</h3>
      <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch] text-ink-muted">{description}</p>
    </div>
    {onRetry && <GhostButton onClick={onRetry}>{retryLabel}</GhostButton>}
  </div>
);
```

- [ ] **Step 5: Pruebas, tipos y build**

Run:

```bash
npx vitest run src/components/app src/design 2>&1 | tail -3
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
VITE_API_URL=/api npx vite build 2>&1 | tail -2
```

Expected:
- Todo en verde, incluidas `pieces`, `tones` y la guardia de zona de los dos archivos; `tsc` vacío y el build bien.
- La guardia existente "ninguna pieza compartida pone texto claro sobre coral" sigue en verde. Las líneas con `bg-accent` llevan `text-accent-foreground`; `dark:bg-accent-gradient` no cuenta como `bg-accent`.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/app src/components/brand src/design
git commit -m "feat(hive): AppShell y sus piezas en clases por tema

Barra superior (logo terracota, campana, avatar), barra inferior con las
cinco pestañas reales y la activa en degradado, resplandor de fondo sólo en
oscuro, encabezado sin bloque coral con la segunda línea terracota. Las
piezas que usa el panel siguen claras allí: el degradado va detrás de
dark:. Hexágono en pedestal para estados vacío y error. Guardia de la zona
de la app archivo por archivo.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `widgets.tsx` en clases por tema

**Files:**
- Modify: `src/components/app/widgets.tsx` (archivo completo)
- Test: `src/components/app/widgets.test.tsx`

**Interfaces:**
- Consumes: `resolveToneClass`, `Tone` (Tarea 1).
- Produces: las mismas exportaciones y props: `formatMoneyMX`, `SegmentedTabs`, `BackLink`, `DataRow`, `Stepper`, `StickyCta`, `StatusPill` e `InfoBanner`.

- [ ] **Step 1: Escribir la prueba**

Crear `src/components/app/widgets.test.tsx`, que declara su guardia de zona:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SegmentedTabs, StatusPill, InfoBanner, Stepper, DataRow, StickyCta } from "./widgets";
import { TONE_CLASS } from "@/design/tokens";
import { describeZone } from "@/design/zoneGuard";

describeZone(["src/components/app/widgets.tsx"]);

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("widgets (clases por tema)", () => {
  it("SegmentedTabs: la activa en tinta (panel) y en degradado con texto oscuro (app)", () => {
    wrap(<SegmentedTabs options={[{ value: "a", label: "Próximas", count: 1 }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />);
    const activa = screen.getByRole("tab", { selected: true });
    has(activa, "bg-ink"); has(activa, "text-canvas"); has(activa, "dark:bg-accent-gradient"); has(activa, "dark:text-accent-foreground");
    expect(activa.className).toMatch(/min-h-\[44px\]/);
  });
  it("StatusPill suave: tinte, contorno y punto del tono", () => {
    wrap(<StatusPill label="Confirmada" tone="success" />);
    const el = screen.getByText("Confirmada");
    has(el, TONE_CLASS.success.softBg); has(el, TONE_CLASS.success.softFg); has(el, TONE_CLASS.success.ring);
  });
  it("StatusPill con tono desconocido cae al neutro", () => {
    wrap(<StatusPill label="Raro" tone={"violeta" as never} />);
    has(screen.getByText("Raro"), TONE_CLASS.muted.softFg);
  });
  it("InfoBanner usa terracota suave por defecto", () => {
    wrap(<InfoBanner title="Aviso" />);
    has(screen.getByText("Aviso").closest("div[class*='rounded-2xl']")!, "bg-accent-soft");
  });
  it("Stepper: el paso actual en tinta/degradado", () => {
    wrap(<Stepper steps={[{ id: "a", label: "Paquete" }, { id: "b", label: "Pago" }]} current="a" />);
    const actual = screen.getByText("1");
    has(actual, "bg-ink"); has(actual, "dark:bg-accent-gradient");
  });
  it("ningún widget pone color en línea", () => {
    const { container } = wrap(
      <>
        <SegmentedTabs options={[{ value: "a", label: "A" }]} value="a" onChange={() => {}} />
        <StatusPill label="x" tone="accent" variant="solid" /><InfoBanner title="t" description="d" />
        <Stepper steps={[{ id: "a", label: "A" }]} current="a" /><DataRow label="L" value="V" copyable="V" />
        <StickyCta><span>cta</span></StickyCta>
      </>,
    );
    const conColor = [...container.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);
    expect(conColor).toEqual([]);
  });
});
```

Run: `npx vitest run src/components/app/widgets.test.tsx`
Expected: FAIL. `widgets.tsx` usa `COLOR` y estilos en línea.

- [ ] **Step 2: Reescribir `src/components/app/widgets.tsx`**

Reemplazar el archivo completo:

```tsx
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ArrowLeft } from "lucide-react";

import { resolveToneClass, type Tone } from "@/design/tokens";

/* Widgets de la app: color en clases por tema (spec 2026-09-25 §5). */

/* ═══ formatMoneyMX ═══ */
export const formatMoneyMX = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
};

/* ═══ SegmentedTabs ═══ activa en tinta (panel) o degradado (app) */
type SegmentedTabsProps<T extends string> = {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
};
export function SegmentedTabs<T extends string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" className="inline-flex gap-1 p-1 rounded-full border border-line bg-surface dark:bg-surface/70">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={
              "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[0.85rem] font-bold transition-colors " +
              (active
                ? "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground"
                : "text-ink-muted hover:text-ink")
            }
          >
            {opt.label}
            {typeof opt.count === "number" && <span className="nums text-[0.75rem]">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ═══ BackLink ═══ */
type BackLinkProps = { to: string; label: string };
export const BackLink = ({ to, label }: BackLinkProps) => (
  <Link to={to} className="inline-flex min-h-[44px] items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] no-underline mb-4 text-ink-muted hover:text-ink">
    <ArrowLeft size={14} />
    {label}
  </Link>
);

/* ═══ DataRow — key-value ═══ */
type DataRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copyable?: string;
};
export const DataRow = ({ label, value, mono, copyable }: DataRowProps) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(copyable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3 border-t border-line">
      <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      <div className="flex items-center gap-2 justify-end">
        <span className={"text-right text-ink " + (mono ? "font-mono text-[0.92rem]" : "nums text-[0.95rem] font-semibold")}>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copiado" : "Copiar"}
            className={"grid h-11 w-11 place-items-center rounded-full bg-transparent border-0 cursor-pointer " + (copied ? "text-success" : "text-accent-strong")}
          >
            {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══ Stepper — progreso de flujos de varios pasos ═══ */
type StepperProps<T extends string> = {
  steps: { id: T; label: string }[];
  current: T;
};
export function Stepper<T extends string>({ steps, current }: StepperProps<T>) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <ol className="flex items-center gap-2 list-none m-0 p-0 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const dot = active
          ? "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground"
          : done
            ? "bg-surface text-success ring-1 ring-inset ring-line"
            : "text-ink-muted ring-1 ring-inset ring-line";
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[0.75rem] font-bold nums ${dot}`}>
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={"text-[0.75rem] font-bold uppercase tracking-[0.12em] " + (active ? "text-ink" : "text-ink-muted")}>{s.label}</span>
            {i < steps.length - 1 && <span className={"hidden sm:inline-block h-px w-6 ml-1 " + (done ? "bg-success" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ═══ StickyCta — acción fija al fondo en flujos de confirmación ═══ */
type StickyCtaProps = {
  children: ReactNode;
};
export const StickyCta = ({ children }: StickyCtaProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sentinel = document.createElement("div");
    el.parentElement?.insertBefore(sentinel, el);
    const obs = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting);
    }, { rootMargin: "-1px 0px 0px 0px", threshold: [1] });
    obs.observe(sentinel);
    return () => {
      obs.disconnect();
      sentinel.remove();
    };
  }, []);
  return (
    <div ref={ref} className="sticky bottom-20 lg:bottom-6 z-20 mt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className={"rounded-3xl p-3 transition-shadow border " + (stuck ? "bg-surface/95 border-line shadow-float backdrop-blur" : "bg-transparent border-transparent")}>
        {children}
      </div>
    </div>
  );
};

/* ═══ StatusPill — estado semántico; el color nunca va solo ═══ */
type StatusPillProps = {
  label: string;
  tone: Tone;
  variant?: "soft" | "solid";
};
export const StatusPill = ({ label, tone, variant = "soft" }: StatusPillProps) => {
  const t = resolveToneClass(tone);
  const cls = variant === "soft" ? `${t.softBg} ${t.softFg} ring-1 ring-inset ${t.ring}` : `${t.solidBg} ${t.solidFg}`;
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold leading-none " + cls}>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

/* ═══ InfoBanner — aviso en línea (no toast) ═══ */
type InfoBannerProps = {
  tone?: Tone;
  title: string;
  description?: string;
  action?: ReactNode;
};
export const InfoBanner = ({ tone = "accent", title, description, action }: InfoBannerProps) => {
  const t = resolveToneClass(tone);
  return (
    <div className={`flex items-start gap-4 rounded-2xl p-4 border border-line text-ink ${t.softBg}`}>
      <span aria-hidden="true" className={`mt-1.5 inline-block h-2 w-2 rounded-full shrink-0 bg-current ${t.fg}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-semibold leading-snug text-ink">{title}</p>
        {description && <p className="mt-1 text-[0.875rem] leading-[1.5] text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
```

- [ ] **Step 3: Pruebas, tipos y build**

Run: `npx vitest run src/components/app src/design 2>&1 | tail -3; npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, `tsc` vacío, build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/app src/design
git commit -m "feat(hive): widgets de la app en clases por tema

Pestañas y pasos activos en tinta en el panel y en degradado en la app;
pills y avisos con el tinte, el contorno y el punto de su tono; CTA fijo
con sombra por tema. Mismas exportaciones y props.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Campos, cambio de contraseña, toasts e interruptor en los dos temas

**Files:**
- Modify: `src/components/app/fields.tsx`
- Modify: `src/components/account/ChangePassword.tsx`
- Modify: `src/components/ui/toaster.tsx`, `src/components/ui/toast.tsx` (sombra), `src/components/ui/switch.tsx`, `src/components/ui/input.tsx`, `src/components/ui/select.tsx`
- Modify: `src/components/app/fields.test.tsx`, `src/components/ui/toaster.test.tsx`, `src/components/ui/toast.test.tsx`
- Test: `src/components/ui/switch.test.tsx`

**Interfaces:**
- Consumes: clases y utilidades (Tareas 1 y 2).
- Produces:
  - `controlClass(hasError?: boolean): string`, exportada desde `fields.tsx`; la reutiliza `AuthShell` en la Tarea 6.
  - Las demás exportaciones y props sin cambios.

- [ ] **Step 1: Escribir las pruebas**

Reemplazar `src/components/app/fields.test.tsx` (declara la guardia de zona de los tres archivos que migra la tarea):

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, PasswordField, PasswordRules } from "./fields";
import { describeZone } from "@/design/zoneGuard";

describeZone(["src/components/app/fields.tsx", "src/components/account/ChangePassword.tsx", "src/components/ui/toaster.tsx"]);

const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("campos (dos temas)", () => {
  it("fondo surface en claro y hundido en oscuro, borde 1.5 px que pasa 3:1, 48 px", () => {
    render(<Field label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    has(input, "bg-surface"); has(input, "dark:bg-sunken"); has(input, "border-[1.5px]");
    has(input, "border-line-strong"); has(input, "min-h-[48px]");
  });
  it("con error: borde y mensaje en danger", () => {
    render(<Field label="Correo" error="Falta el dominio del correo." />);
    has(screen.getByLabelText("Correo"), "border-danger");
    has(screen.getByText("Falta el dominio del correo."), "text-danger");
  });
  it("foco en tinta con halo terracota suave; marcador de posición tenue", () => {
    render(<Field label="Teléfono" />);
    const c = screen.getByLabelText("Teléfono").className;
    expect(c).toMatch(/focus-visible:ring-ink/);
    expect(c).toMatch(/focus-visible:shadow-\[0_0_0_5px_theme\(colors\.accent\.soft\)\]/);
    expect(c).toMatch(/placeholder:text-ink-faint/);
  });
  it("sin colores en línea (campos, contraseña y reglas)", () => {
    const { container } = render(<><Field label="A" /><PasswordField label="B" /><PasswordRules password="Abc12345" /></>);
    const conColor = [...container.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);
    expect(conColor).toEqual([]);
  });
});
```

Crear `src/components/ui/switch.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "./switch";

describe("Switch (dos temas)", () => {
  it("encendido: tinta en el panel y degradado terracota en la app; perilla clara en oscuro", () => {
    render(<Switch aria-label="Recordatorios" defaultChecked />);
    const sw = screen.getByRole("switch", { name: "Recordatorios" });
    expect(sw.className).toMatch(/data-\[state=checked\]:bg-primary/);
    expect(sw.className).toMatch(/dark:data-\[state=checked\]:bg-accent-gradient/);
    expect(sw.querySelector("span")!.className).toMatch(/dark:bg-inverse/);
  });
});
```

En `src/components/ui/toaster.test.tsx` y `src/components/ui/toast.test.tsx`, cambiar toda aserción de color por valor (`toHaveStyle` con `COLOR.x`) por su clase:
- Título de error: `text-danger`. Por defecto: `text-ink`.
- Contenedor: `bg-surface`, `border-line` y `shadow-float`.
- Botón de cerrar: `text-ink-muted`.
- Ninguna variante contiene `accent`.

Conservar lo que cada prueba verifica.

Run: `npx vitest run src/components/app/fields.test.tsx src/components/ui`
Expected: FAIL. `controlStyle` sigue en línea, el switch no tiene la variante `dark:` y `toaster` usa `COLOR`.

- [ ] **Step 2: `src/components/app/fields.tsx`**

- Quitar `type CSSProperties` del import de `react` y la línea `import { COLOR } from "@/design/tokens";`.
- Reemplazar `CONTROL` y `controlStyle` por:

```ts
/* Campos (spec 2026-09-25 §5): surface en claro y hundido en oscuro, borde
   1.5 px lineStrong (3:1), foco en tinta con halo terracota suave, error en
   danger que dice qué pasa. Todo en clases por tema. */
const CONTROL =
  "w-full min-h-[48px] rounded-xl px-4 py-3 text-[0.95rem] outline-none transition-shadow " +
  "bg-surface dark:bg-sunken text-ink border-[1.5px] " +
  "focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 " +
  "focus-visible:shadow-[0_0_0_5px_theme(colors.accent.soft)] " +
  "placeholder:text-ink-faint disabled:opacity-60";

/** Clases de un campo; lo reutiliza AuthShell. */
export const controlClass = (hasError?: boolean) => `${CONTROL} ${hasError ? "border-danger" : "border-line-strong"}`;
```

- En `Field`, `SelectField`, `TextAreaField` y `PasswordField`, quitar `style={controlStyle(!!error)}` y usar `className={controlClass(!!error) + " …extra… " + (className ?? "")}`. Conservar el extra de cada uno: `min-h-[110px] resize-y` en el textarea y `pr-14` en la contraseña.
- `FieldError`: `className="flex items-center gap-1.5 text-[0.8125rem] font-semibold text-danger"`, sin `style`.
- `FieldShell`: etiqueta `className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted"`, pista `className="text-[0.8125rem] text-ink-muted"`, sin `style`.
- Botón de mostrar contraseña: quitar `style` y agregar `text-ink-muted hover:text-ink`; `focus-visible:ring-accent-strong` pasa a `focus-visible:ring-ink`.
- `PasswordRules`, cada `li`: `className={"flex items-center gap-2 text-[0.75rem] " + (r.ok ? "text-success" : "text-ink-muted")}`. El círculo: `className={"grid h-4 w-4 place-items-center rounded-full border text-canvas transition-colors " + (r.ok ? "bg-success border-success" : "bg-transparent border-line")}`. Sin `style`.

- [ ] **Step 3: `ChangePassword.tsx`, toasts, interruptor y shadcn**

- `src/components/account/ChangePassword.tsx`: convertir sus 7 usos de `COLOR` con la tabla de conversión. Quitar el import de `COLOR`. Lo usan el panel y la app: sólo clases por tema.
- `src/components/ui/toaster.tsx`: quitar `COLOR` y usar un mapa de clases por variante:

```tsx
const TONO = {
  error: { text: "text-danger", bar: "bg-danger", chip: "bg-danger/10 text-danger" },
  success: { text: "text-success", bar: "bg-success", chip: "bg-success/10 text-success" },
  info: { text: "text-ink", bar: "bg-ink", chip: "bg-ink/10 text-ink" },
} as const;
```

  - Con `const t = TONO[isError ? "error" : isSuccess ? "success" : "info"];`: franja `className={"absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl " + t.bar}`, chip `className={"shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base ml-2 " + t.chip}` y título `className={"text-[13px] font-semibold leading-tight " + t.text}`.
  - Ningún `style`.
- `src/components/ui/toast.tsx`: en `toastVariants`, `shadow-[0_8px_24px_theme(colors.ink.DEFAULT/8%)]` pasa a `shadow-float`. En oscuro, `ink` es claro y daría un halo claro.
- `src/components/ui/switch.tsx`:
  - En la raíz, agregar `dark:data-[state=checked]:bg-accent-gradient` después de `data-[state=checked]:bg-primary`.
  - En la perilla, agregar `dark:bg-inverse` después de `bg-background`.
- `src/components/ui/input.tsx` y el disparador de `src/components/ui/select.tsx`: agregar `dark:bg-sunken` junto a `bg-surface`.

- [ ] **Step 4: Pruebas, tipos y build**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, incluidas las pruebas del panel (`panel.test.tsx` y `select.test.tsx`); `tsc` vacío; build bien.

- [ ] **Step 5: Commit**

```bash
git add -A src/components src/design
git commit -m "feat(hive): campos, toasts e interruptor en los dos temas

Campos hundidos en oscuro y blancos en el panel, con el mismo borde de 3:1
y foco visible; toasts, cambio de contraseña e interruptor sin colores en
línea y con su tratamiento de la app detrás de dark:.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Acceso oscuro (`AuthShell` y pantallas de acceso)

**Files:**
- Modify: `src/components/auth/AuthShell.tsx`
- Modify: `src/pages/auth/Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `ResetPassword.tsx`, `Onboarding.tsx`
- Modify: `src/components/auth/AuthShell.test.tsx` (aserciones a clases)

**Interfaces:**
- Consumes: `controlClass` (Tarea 5), `HexPedestal` y `PrimaryButton` (Tarea 3), `BrandLogo`.
- Produces: `AuthShell` y sus campos con las mismas exportaciones y props.

**Diseño (spec §6.10):**
- Toda la pantalla sobre `bg-canvas` con el resplandor (`bg-app-glow` en una capa fija, como en `AppShell`).
- El panel de marca deja de ser `bg-inverse`: en oscuro `inverse` es claro. Pasa a `bg-surface/40` con borde `border-line`, o transparente sobre el resplandor.
- Arriba, el lockup HIVE en `text-accent`. En el centro, `<HexPedestal size="lg" />`. El titular y la etiqueta en `text-ink` / `text-ink-muted`.
- La marca de agua gigante del símbolo se conserva en `text-accent` con `opacity-[0.06]`, oculta a lectores de pantalla.
- Campos: `controlClass(!!error)` en lugar de `INPUT_CLASS` + `inputStyle`. Etiqueta como `FieldShell`.
- Botón principal: `PrimaryButton` (degradado en oscuro), o la misma cadena de clases si el botón propio del archivo no puede cambiarse por `PrimaryButton` sin perder props.
- Pie: "© año HIVE Pilates Studio".
- `brandTint` / `Tint` se quedan en la API tal cual (props sin cambios); siguen sin usarse.

**Textos "Alma" que cambian:**
- `AuthShell.tsx`: `aria-label="Inicio Alma Movement"` → `aria-label="Inicio HIVE Pilates Studio"`; pie "Alma Movement" → "HIVE Pilates Studio".
- `Register.tsx`: `brandEyebrow="Nueva en Alma"` → `"Nueva en HIVE"`; `formHeadlineItalic="Alma."` → `"HIVE."`.
- `ForgotPassword.tsx`: "Abre el correo de Alma Movement." → "Abre el correo de HIVE Pilates Studio.".
- `Onboarding.tsx`: "Entrar a Alma" → "Entrar a HIVE".

- [ ] **Step 1: Pruebas en rojo**

En `AuthShell.test.tsx`, llamar `describeZone(["src/components/auth/AuthShell.tsx", "src/pages/auth/Login.tsx", "src/pages/auth/Register.tsx", "src/pages/auth/ForgotPassword.tsx", "src/pages/auth/ResetPassword.tsx", "src/pages/auth/Onboarding.tsx"])` (import de `@/design/zoneGuard`). Después, reescribir las aserciones de color por valor a clases, sin cambiar lo que verifican:
- El lockup del enlace lleva `text-accent`.
- La marca de agua lleva `text-accent` y está oculta a lectores de pantalla.
- El campo lleva `bg-surface` `dark:bg-sunken` `border-line-strong` `border-[1.5px]`.
- El foco es `focus-visible:ring-ink` con halo `accent.soft`.
- Con error, `border-danger`.
- La etiqueta mide `text-[0.75rem]` y es `text-ink-muted`.

Agregar además:

```tsx
  it("el panel de marca ya no es inverse (en oscuro inverse es claro)", () => {
    const { container } = renderShell();
    expect(container.innerHTML).not.toMatch(/\bbg-inverse\b/);
  });
```

`renderShell` es el helper de render que ya use el archivo; si no existe, crearlo con las 5 props obligatorias.

Run: `npx vitest run src/components/auth`
Expected: FAIL.

- [ ] **Step 2: Implementar el diseño y los textos**

Seguir el Procedimiento de pantalla (Global Constraints). En las pantallas de acceso, convertir sus usos propios de `COLOR`: ForgotPassword 12, ResetPassword 12, Register 7, Onboarding 3.

- [ ] **Step 3: Verificar**

Run:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
VITE_API_URL=/api npx vite build 2>&1 | tail -2
grep -n "Alma" src/components/auth/AuthShell.tsx src/pages/auth/*.tsx || echo "✓ sin Alma en el acceso"
```

Expected: todo en verde, `tsc` vacío, build bien, `✓ sin Alma en el acceso`.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/auth src/pages/auth src/design
git commit -m "feat(hive): acceso en oscuro con el hexágono iluminado

Entrar, registro, recuperar y restablecer contraseña sobre carbón con el
resplandor, lockup HIVE en terracota, campos hundidos y botón en degradado.
El panel de marca deja de usar inverse (en oscuro es claro). Textos Alma
del acceso pasan a HIVE.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Inicio (`/app`)

**Files:**
- Modify: `src/pages/client/Dashboard.tsx`
- Test: `src/pages/client/Dashboard.dark.test.ts`

**Diseño (spec §6.1):**
- Saludo, que ya pone `AppShell`.
- `PageHeader` con la fecha como `eyebrow`, `title="Tu semana"` y `titleAccent="en HIVE."`.
- "Tu próxima clase" con `ActionRow`, como ya está.
- "Tu próximo logro": los anillos en SVG con `stroke="currentColor"`. El progreso en `text-accent` y la pista en `text-line`.
- "Tu cuenta": la tarjeta de membresía con `bg-surface dark:bg-surface/70 border border-line rounded-[20px]`, `StatusPill`/`Tag` "Activa", el plan, "Clases por usar" en `font-display text-[2rem] text-accent` y el vencimiento.
- Sin membresía, el botón de comprar es `PrimaryButton` (degradado en oscuro).
- Las demás secciones ("También en tu agenda", "Tu agenda", "Atajos") conservan su contenido y usan las piezas.

**Texto:** `titleAccent="Alma."` → la pareja `title="Tu semana"` / `titleAccent="en HIVE."`.

- [ ] **Step 1: Prueba en rojo**

Crear `src/pages/client/Dashboard.dark.test.ts`, que declara su guardia de zona:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Dashboard.tsx"), "utf8");

describeZone(["src/pages/client/Dashboard.tsx"]);

describe("Inicio en oscuro (spec 2026-09-25 §6.1)", () => {
  it("encabezado Tu semana / en HIVE.", () => {
    expect(src).toMatch(/title="Tu semana"/);
    expect(src).toMatch(/titleAccent="en HIVE\."/);
    expect(src).not.toMatch(/\bAlma\b/);
  });
  it("la próxima clase va en ActionRow y las clases por usar en cifra terracota", () => {
    expect(src).toContain("<ActionRow");
    expect(src).toMatch(/font-display[^"]*text-accent\b|text-accent\b[^"]*font-display/);
  });
  it("los anillos siguen al tema (currentColor), sin colores en línea", () => {
    expect(src).toMatch(/stroke="currentColor"/);
  });
});
```

Run: `npx vitest run src/pages/client/Dashboard.dark.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla. `Dashboard.rings.test.ts` debe seguir en verde.

- [ ] **Step 3: Verificar**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, `tsc` vacío, build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/client src/design
git commit -m "feat(hive): Inicio en oscuro con terracota

Tu semana en HIVE, próxima clase con la flecha en degradado, anillos y
clases por usar en terracota sobre tarjetas translúcidas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Reservar y confirmar clase

**Files:**
- Modify: `src/pages/client/BookClasses.tsx`, `src/pages/client/BookClassConfirm.tsx`
- Test: `src/pages/client/BookClasses.dark.test.ts`

**Diseño (spec §6.2 y §6.3):**
- **Reservar:**
  - `PageHeader` con `title="Reserva tu"` / `titleAccent="próxima clase."` y la semana en `eyebrow`. `SegmentedTabs` Anterior / Actual / Siguiente como `actions` del encabezado.
  - La tira de días fija (`sticky top-16`, fondo `bg-canvas/90 backdrop-blur`, borde `border-line`): día activo `bg-accent-gradient text-accent-foreground`; día con clases, punto `bg-accent`; resto `text-ink-muted` con el número en `text-ink`.
  - Filas de clase como tarjeta (`bg-surface dark:bg-surface/70 border border-line rounded-[18px]`): hora en `font-display nums`, clase en `text-ink`, "coach · duración" en `text-ink-muted`, lugares en `text-accent-strong`.
  - Botón `PrimaryButton size="sm"` "Reservar".
  - Clase llena: la fila con `opacity-50`, "Llena" y `GhostButton` "Lista de espera".
- **Confirmar:**
  - `BackLink`, `PageHeader` con la coach en `eyebrow` y la clase como título.
  - Hora y duración en `text-ink-muted`.
  - `<HexPedestal size="lg" />`.
  - Tarjeta del paquete ("N clases · Activo" con `StatusPill` success).
  - La nota de cancelar con 12 h en `InfoBanner`.
  - `StickyCta` con `PrimaryButton` "Reservar".

**Se conservan** (`BookClasses.redesign.test.ts` los verifica en el código fuente):
- `weekStartsOn: 1`, `DAY_LABELS`.
- `role="tablist"`, `role="tab"`, `aria-selected`, `role="tabpanel"`.
- `sticky top-16`, `scrollTo`.
- "lugares", "Lista de espera", `/app/classes/`, `nums`, `font-display`, `CAT_LABEL`.
- `ErrorState`, `onRetry`, `SkeletonRow`, `EmptyState`.
- "Este día el estudio descansa.".
- `SegmentedTabs`, "Anterior", "Siguiente", y el contexto de membresía con su enlace.

- [ ] **Step 1: Prueba en rojo**

Crear `src/pages/client/BookClasses.dark.test.ts`, que declara su guardia de zona:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const book = fs.readFileSync(path.resolve(__dirname, "BookClasses.tsx"), "utf8");
const confirm = fs.readFileSync(path.resolve(__dirname, "BookClassConfirm.tsx"), "utf8");

describeZone(["src/pages/client/BookClasses.tsx", "src/pages/client/BookClassConfirm.tsx"]);

describe("Reservar en oscuro (spec 2026-09-25 §6.2)", () => {
  it("encabezado Reserva tu / próxima clase.", () => {
    expect(book).toMatch(/titleAccent="próxima clase\."/);
  });
  it("día activo en degradado y punto terracota en días con clases", () => {
    expect(book).toContain("bg-accent-gradient");
    expect(book).toMatch(/\bbg-accent\b/);
  });
});

describe("Confirmar clase (spec 2026-09-25 §6.3)", () => {
  it("hexágono iluminado y acción fija", () => {
    expect(confirm).toContain('<HexPedestal size="lg"');
    expect(confirm).toContain("<StickyCta");
  });
});
```

Run: `npx vitest run src/pages/client`
Expected: FAIL (pruebas nuevas y guardia).

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla (BookClasses 50 usos de `COLOR`; BookClassConfirm 21).

- [ ] **Step 3: Verificar**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, incluido `BookClasses.redesign.test.ts`; `tsc` vacío; build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/client src/design
git commit -m "feat(hive): Reservar y confirmar clase en oscuro

Selector de semana en el encabezado, tira de días con el activo en
degradado y puntos terracota, filas translúcidas con lugares en terracota y
Reservar en degradado. Confirmación con el hexágono iluminado y la acción
fija.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Mis clases, órdenes y notificaciones

**Files:**
- Modify: `src/pages/client/MyBookings.tsx`, `src/pages/client/Orders.tsx`, `src/pages/client/Notifications.tsx`
- Test: `src/pages/client/MyBookings.dark.test.ts`

**Diseño (spec §6.4, §6.7 y §6.9):**
- **Mis clases:**
  - `PageHeader` con `title="Tus clases"` / `titleAccent="en HIVE."` y `eyebrow="Mis reservas"`.
  - `SegmentedTabs` Próximas / Pasadas con contadores.
  - Cada reserva en `ListGroup`/tarjeta, con `StatusPill` del estado, "fecha · hora · coach" en `text-ink-muted` y `GhostButton tone="danger"` "Cancelar reserva".
  - Los diálogos de cancelar (`AlertDialog`, `Dialog`) siguen como están: heredan el tema.
  - La penalización por cancelar tarde se muestra en el diálogo antes de confirmar, como hoy.
  - Pasadas con `opacity-60`.
- **Órdenes:** la lista con `StatusPill`: pendiente → `accent`, en verificación → `accent`, aprobada → `success`, rechazada → `danger`.
- **Notificaciones:** `ListGroup` y punto `bg-accent` en las no leídas, con "no leída" para lectores de pantalla.

**Texto:** `titleAccent="en Alma."` → `"en HIVE."`.

- [ ] **Step 1: Prueba en rojo**

Crear `src/pages/client/MyBookings.dark.test.ts`, que declara su guardia de zona:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const r = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");

describeZone(["src/pages/client/MyBookings.tsx", "src/pages/client/Orders.tsx", "src/pages/client/Notifications.tsx"]);

describe("Mis clases, órdenes y notificaciones (spec 2026-09-25 §6.4, 6.7, 6.9)", () => {
  it("Tus clases / en HIVE.", () => {
    expect(r("MyBookings.tsx")).toMatch(/titleAccent="en HIVE\."/);
    expect(r("MyBookings.tsx")).not.toMatch(/\bAlma\b/);
  });
  it("Cancelar reserva es un botón destructivo", () => {
    expect(r("MyBookings.tsx")).toMatch(/<GhostButton[^>]*tone="danger"/);
  });
  it("las no leídas llevan punto terracota", () => {
    expect(r("Notifications.tsx")).toMatch(/\bbg-accent\b/);
  });
});
```

Run: `npx vitest run src/pages/client`
Expected: FAIL.

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla (MyBookings 33 usos de `COLOR`; Notifications 3; Orders 0, pero revisar sus estilos).

- [ ] **Step 3: Verificar**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, `tsc` vacío, build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/client src/design
git commit -m "feat(hive): Mis clases, órdenes y notificaciones en oscuro

Tus clases en HIVE con Próximas/Pasadas, estados en pills y Cancelar
reserva destructivo; órdenes con su estado y notificaciones con punto
terracota en las no leídas.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Wallet

**Files:**
- Modify: `src/pages/client/Wallet.tsx`, `src/pages/client/WalletHistory.tsx`, `src/pages/client/WalletRewards.tsx`
- Modify: `src/index.css` (una utilidad `bg-pass-glow` en `@layer utilities`)
- Test: `src/pages/client/Wallet.dark.test.ts`

**Diseño (spec §6.5):**
- `PageHeader` con `title="Tu pase"` / `titleAccent="del estudio."`.
- **El pase:**
  - Tarjeta `rounded-[22px] border border-line bg-surface/70 bg-pass-glow overflow-hidden`.
  - Arriba, `<BrandLogo variant="lockup" size={28} className="text-accent" />` (lockup HIVE / PILATES STUDIO) en lugar del texto "Alma Movement", y "● ACTIVO" en `text-success`.
  - Titular y plan.
  - Rejilla por usar / vence / puntos: cifras en `font-display nums`, "por usar" en `text-accent`, separadores `border-line`.
  - Próxima clase.
  - QR sobre baldosa `bg-inverse p-2 rounded-xl`. El QR usa colores fijos de la tabla oscura: `fgColor={DARK.onInverse}` y `bgColor={DARK.inverse}` importados de `@/design/tokens`. Es la única excepción permitida: una librería que exige hex.
- Los botones oficiales de Apple y Google Wallet **no cambian**: sus hex siguen en la lista de permitidos de `guards.test.ts`. Si usan clases `bg-black`/`text-white`, pasarlas a sus hex permitidos, porque la guardia `app-zone` prohíbe esas clases.
- "Tus puntos y reservas" usa las piezas.
- `WalletHistory` y `WalletRewards` (ocultas) se convierten con la tabla, sin diseño propio.

**Texto:** el título del pase "Alma Movement" → el lockup HIVE. `a.download = "alma-pass.pkpass"` **no se toca** (nombre de archivo, lo hace A).

- [ ] **Step 1: Utilidad y prueba en rojo**

En `src/index.css`, dentro de `@layer utilities`:

```css
  .bg-pass-glow { background-image: radial-gradient(120% 80% at 100% 0%, rgb(var(--c-accent-deep) / 0.3), transparent 60%); }
```

Crear `src/pages/client/Wallet.dark.test.ts`, que declara su guardia de zona:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Wallet.tsx"), "utf8");

describeZone(["src/pages/client/Wallet.tsx", "src/pages/client/WalletHistory.tsx", "src/pages/client/WalletRewards.tsx"], {
  // Botones oficiales de Apple/Google Wallet: sus colores son de la marca (lista de permitidos en guards.test.ts).
  permitir: /#(?:000000|FFFFFF|4285F4|EA4335|FBBC05|34A853)/i,
});

describe("Wallet en oscuro (spec 2026-09-25 §6.5)", () => {
  it("el pase lleva el lockup HIVE y el resplandor", () => {
    expect(src).toMatch(/<BrandLogo[^>]*variant="lockup"/);
    expect(src).toContain("bg-pass-glow");
    expect(src).not.toMatch(/Alma <span/);
  });
  it("el QR va sobre baldosa clara con colores fijos de la tabla oscura", () => {
    expect(src).toContain("bg-inverse");
    expect(src).toMatch(/fgColor=\{DARK\.onInverse\}/);
    expect(src).toMatch(/bgColor=\{DARK\.inverse\}/);
  });
  it("el archivo del pase conserva su nombre (lo cambia el sub-proyecto A)", () => {
    expect(src).toContain('a.download = "alma-pass.pkpass"');
  });
});
```

Run: `npx vitest run src/pages/client/Wallet.dark.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla (Wallet 30 usos de `COLOR`; WalletRewards 26; WalletHistory 9).

- [ ] **Step 3: Verificar**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, incluida la guardia de hex con la lista de permitidos de Wallet; `tsc` vacío; build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/client src/index.css src/design
git commit -m "feat(hive): Wallet en oscuro con el pase HIVE

Pase translúcido con resplandor, lockup HIVE, cifras en Unbounded y el QR
sobre baldosa clara para que se lea. Los botones oficiales de wallet no
cambian; el nombre del archivo del pase queda para el sub-proyecto A.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Checkout

**Files:**
- Modify: `src/pages/client/Checkout.tsx`, `src/components/app/UploadDropzone.tsx`
- Test: `src/pages/client/Checkout.dark.test.ts`

**Diseño (spec §6.6):**
- `PageHeader` y el `Stepper` (Tarea 4) como están.
- Planes: tarjeta `bg-surface dark:bg-surface/70 border border-line rounded-[20px]`, con el precio en `font-display nums text-ink`. El elegido lleva `border-accent bg-accent-soft` y `aria-pressed`/`aria-checked` según el control actual.
- Los `Tag` de las líneas 129–130 usan las piezas.
- Método de pago con el mismo tratamiento de elegido.
- Resumen con `DataRow`.
- Todos los `StickyCta` con `PrimaryButton` ("Pagar" y demás, en degradado en la app).
- Datos de transferencia con `DataRow copyable`.
- `UploadDropzone`: zona `border-[1.5px] border-dashed border-line-strong bg-surface dark:bg-surface/40`; en arrastre, `border-accent bg-accent-soft`.

- [ ] **Step 1: Prueba en rojo**

Crear `src/pages/client/Checkout.dark.test.ts`, que declara su guardia de zona:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const src = fs.readFileSync(path.resolve(__dirname, "Checkout.tsx"), "utf8");

describeZone(["src/pages/client/Checkout.tsx", "src/components/app/UploadDropzone.tsx"]);

describe("Checkout en oscuro (spec 2026-09-25 §6.6)", () => {
  it("el plan elegido lleva borde terracota y fondo terracota suave", () => {
    expect(src).toMatch(/border-accent\b/);
    expect(src).toContain("bg-accent-soft");
  });
  it("los precios van en Unbounded con cifras tabulares", () => {
    expect(src).toMatch(/font-display[^"]*nums|nums[^"]*font-display/);
  });
});
```

Run: `npx vitest run src/pages/client/Checkout.dark.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla (Checkout 87 usos de `COLOR`; UploadDropzone 12). Es la pantalla más grande: convertir sección por sección y correr la guardia entre cada una.

- [ ] **Step 3: Verificar**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, `tsc` vacío, build bien.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/client src/components/app src/design
git commit -m "feat(hive): Checkout en oscuro

Planes y métodos de pago como tarjetas translúcidas con el elegido en
terracota, precios en Unbounded, pagar en degradado y la zona de
comprobante con su estado de arrastre.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Perfil, responsiva, 404 y pantallas ocultas — la zona completa

**Files:**
- Modify: `src/pages/client/Profile.tsx`, `ProfileEdit.tsx`, `ProfilePreferences.tsx`, `Responsiva.tsx`, `ProfileMembership.tsx`, `ProfileSecurity.tsx`, `OrderDetail.tsx`
- Modify: `src/components/app/ResponsivaDialog.tsx`, `src/components/app/SignaturePad.tsx`, `src/components/app/Lightbox.tsx` (revisión)
- Modify: `src/pages/NotFound.tsx`
- Create: `src/design/app-zone.test.ts` (la guardia sobre la zona entera y los textos Alma)

**Diseño:**
- **Perfil (spec §6.8):**
  - Arriba, avatar grande (`bg-inverse text-inverse-foreground`) y nombre.
  - `ListGroup` de opciones y "Cerrar sesión" `destructive`.
  - "Versión Alma · año" → "HIVE Pilates Studio · año".
- **Editar perfil:** campos (Tarea 5) y `StickyCta`.
- **Preferencias:** `Switch` (Tarea 5).
- **Responsiva y `ResponsivaDialog`:**
  - Datos en `DataRow`.
  - El panel de firma (`SignaturePad`) se queda como baldosa `bg-inverse` con trazo oscuro, para que se vea en oscuro. Si el lienzo pinta con un color fijo, usar `DARK.onInverse` de `@/design/tokens` (excepción de librería, como el QR).
  - El subtítulo legal "Responsiva y consentimiento informado firmado con Alma Movement." **no se toca** (lo decide A).
  - El toast "¡Bienvenida a Alma Movement!" → "¡Bienvenida a HIVE!".
- **404 (spec §6.11):**
  - Oscura (el tema ya lo fija la Tarea 2).
  - Arriba, el símbolo HIVE en `text-accent` en lugar de "Alma Movement".
  - "404" en `font-display text-ink`.
  - `<HexPedestal size="lg" />`.
  - El texto de apoyo en `text-ink-muted` (no en `text-accent-strong`).
  - El botón de volver es `PrimaryButton`.
  - "Estudio de Pilates · Juriquilla" → "HIVE Pilates Studio".
- **Ocultas** (`ProfileMembership`, `ProfileSecurity`, `OrderDetail`): convertir con la tabla, sin diseño propio.

- [ ] **Step 1: Guardia de zona completa, en rojo**

Crear `src/design/app-zone.test.ts`, que aplica la guardia a **toda** la zona (las pruebas de las tareas 3 a 11 ya cubren sus archivos; ésta además atrapa lo que ninguna tarea declaró):

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone, read } from "./zoneGuard";

const root = path.resolve(__dirname, "..", "..");
const listar = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return listar(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

/** Zona de la app (spec 2026-09-25 §9): todo lo que se ve en oscuro. */
export const ZONA = [
  ...listar("src/pages/client"), ...listar("src/pages/auth"), ...listar("src/components/app"), ...listar("src/components/auth"),
  "src/pages/NotFound.tsx", "src/components/brand/HexPedestal.tsx", "src/components/account/ChangePassword.tsx", "src/components/ui/toaster.tsx",
].sort();

describeZone(ZONA, {
  // Botones oficiales de Apple/Google Wallet: sus colores son de la marca (lista de permitidos en guards.test.ts).
  permitir: /#(?:000000|FFFFFF|4285F4|EA4335|FBBC05|34A853)/i,
});

describe("textos de la zona", () => {
  it("no quedan textos Alma, salvo los que decide el sub-proyecto A", () => {
    const PERMITIDOS = [/Responsiva y consentimiento informado firmado con Alma Movement/, /alma-pass\.pkpass/, /paleta Alma/];
    const malos = ZONA.flatMap((f) =>
      read(f).split("\n").map((l, i) => [l, i + 1] as const)
        .filter(([l]) => /\bAlma\b/.test(l) && !PERMITIDOS.some((re) => re.test(l)))
        .map(([, n]) => `${f}:${n}`));
    expect(malos).toEqual([]);
  });
});
```

Run: `npx vitest run src/design/app-zone.test.ts`
Expected: FAIL. Salen los archivos de esta tarea que aún usan `COLOR` y los textos "Alma".

- [ ] **Step 2: Implementar** siguiendo el Procedimiento de pantalla, archivo por archivo: ResponsivaDialog 33 usos de `COLOR`, ProfileMembership 27, Responsiva 12, NotFound 10, SignaturePad 9, OrderDetail 8, Profile 7, ProfilePreferences 5; los demás, revisión.

- [ ] **Step 3: Verificar**

Run:

```bash
npx vitest run 2>&1 | grep -E "Test Files|Tests "
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
VITE_API_URL=/api npx vite build 2>&1 | tail -2
grep -rn "COLOR" src/pages/client src/pages/auth src/components/app src/components/auth src/pages/NotFound.tsx --include='*.tsx' | grep -v "\.test\." || echo "✓ zona sin COLOR"
```

Expected: todo en verde, incluida la guardia de la zona entera; `tsc` vacío; build bien; `✓ zona sin COLOR`.

- [ ] **Step 4: Commit**

```bash
git add -A src
git commit -m "feat(hive): perfil, responsiva, 404 y pantallas ocultas en oscuro

Toda la zona de la app lleva el color en clases por tema; la guardia se
aplica a la zona entera y no deja ningún texto Alma salvo los que decide el sub-proyecto A
(subtítulo legal de la responsiva y el nombre del archivo del pase).

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `/sistema` con los dos temas y `DESIGN.md`

**Files:**
- Modify: `src/pages/dev/SistemaPage.tsx`, `src/pages/dev/SistemaPage.test.tsx`
- Modify: `docs/DESIGN.md`

**Interfaces:**
- Consumes: `LIGHT`, `DARK`, `THEMES`, `contrast`, piezas.

- [ ] **Step 1: Prueba en rojo**

En `SistemaPage.test.tsx`, agregar:

```tsx
  it("muestra los dos temas lado a lado", () => {
    renderPage(); // el helper de render que ya use el archivo
    expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
    expect(document.querySelector('[data-theme="dark"]')).not.toBeNull();
    for (const v of Object.values(DARK)) expect(screen.getAllByText(v).length).toBeGreaterThan(0);
  });
```

Importar `DARK` de `@/design/tokens`.

Run: `npx vitest run src/pages/dev`
Expected: FAIL.

- [ ] **Step 2: Implementar**

- La página muestra dos columnas: `<section data-theme="light" className="bg-canvas text-ink">` y `<section data-theme="dark" className="bg-canvas text-ink bg-app-glow">`. Las variables CSS y la variante `dark:` funcionan en cualquier elemento con `data-theme`.
- En cada columna: las muestras de la tabla de su tema (nombre, hex, contraste sobre su `canvas`) y las mismas piezas de hoy (botones, pills, listas, campos, estados), más `HexPedestal`.
- Quitar `COLOR` de la página: las muestras leen `THEMES[tema]`.

En `docs/DESIGN.md`:
- Reemplazar la sección de color por los dos temas.
- Explicar que el color de la app va en clases por tema y por qué (jsdom y `var()`).
- Agregar `cssColor` para los casos en línea, las reglas 1 a 7 del spec 2026-09-25 §3.3, y que el tema lo decide la ruta.

- [ ] **Step 3: Verificar y commit**

Run: `npx vitest run 2>&1 | grep -E "Test Files|Tests "; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2; grep -l "Tokens y piezas" dist/assets/*.js || echo "✓ /sistema fuera de producción"`
Expected: todo en verde; `✓ /sistema fuera de producción`.

```bash
git add -A src/pages/dev docs/DESIGN.md
git commit -m "docs(hive): /sistema con los dos temas y DESIGN.md de la paleta v2

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Verificación completa

**Files:** ninguno nuevo. La evidencia va a `.superpowers/sdd/<plan>/sweep-v2/` (ignorado por git).

- [ ] **Step 1: Suites**

Run: `npm test 2>&1 | grep -E "Test Files|Tests |ℹ (tests|pass|fail)"`
Expected: frontend, servidor (54) y scripts (3) en verde.

- [ ] **Step 2: Build con Node 20 (el de Railway)**

Run: `rm -rf dist && VITE_API_URL=/api npx -y node@20 node_modules/vite/bin/vite.js build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 3: Regresión del servidor sobre una base desechable**

El mismo procedimiento de la Tarea 13 del plan anterior (`docs/superpowers/plans/2026-09-24-hive-sistema-visual.md`):
- Postgres en 127.0.0.1:5521 y servidor en 8121, siempre con `DATABASE_URL` explícito.
- Sin `.env` y con datos falsos.
- Desmontar al final y confirmar que los puertos quedan libres.

Expected: `server/tests` 63/63.

- [ ] **Step 4: Barrido en navegador**

Con el servidor sirviendo `dist/` y las herramientas de Playwright. Capturas en `sweep-v2/`.

- **App** a 390 × 844 y a 1280: `/app`, `/app/classes`, confirmar una clase, `/app/bookings` (con el diálogo de cancelar abierto), `/app/wallet`, `/app/checkout` (con un plan elegido), `/app/orders`, `/app/profile`, `/app/profile/edit`, `/app/profile/preferences`, `/app/profile/responsiva` y `/app/notifications`.
- **Acceso** a 390 y 1280: `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password?token=x`.
- **404** a 390 y 1280.
- **Ocultas:** encender sus banderas **sólo** en una compilación local, sin commitear, y revisar a 390 que no se vean rotas.
- **Panel en claro,** a 1280: `/admin/dashboard`, `/admin/bookings`, `/admin/payments` y `/admin/settings` (usa `ChangePassword` y los campos). Confirmar que `<html data-theme="light">` y que ningún botón del panel es terracota.
- **Temas en la misma sesión:** navegar de `/app` a `/admin/dashboard` (debe quedar claro) y de vuelta (oscuro).
- **Portales:** en la app, abrir un toast, un diálogo y un menú o select: los tres oscuros. En el panel, los tres claros.
- **Primera pintada:** recargar en `/app/wallet` y confirmar con una captura temprana que no hay un fotograma claro.

En cada captura se revisa:
- Errores de consola y `/api` ≥ 400.
- `undefined`, `NaN` o `Invalid Date` en pantalla, y pantallas en blanco.
- Scroll horizontal.
- Texto claro sobre terracota, o texto que no se lea sobre las tarjetas.

**Movimiento reducido:** con `prefers-reduced-motion: reduce`, el fragmento de la Tarea 14 del plan anterior en `/app` y `/app/classes` debe dar `[]`.

Expected: sin hallazgos causados por la rama. Si un hallazgo sí lo es, se corrige con su prueba en rojo y va en un commit propio.

- [ ] **Step 5: Reporte**

El reporte lleva:
- Las salidas de las suites.
- Una tabla ruta × tamaño con su estado.
- El resultado de temas, portales, primera pintada y movimiento reducido.
- Cada hallazgo con su evidencia y clasificación.
- La confirmación de que todo quedó desmontado.

La revisión adversarial de la rama y la fusión a `hive` las hace el controlador después.
