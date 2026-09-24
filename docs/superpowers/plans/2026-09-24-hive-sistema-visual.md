# HIVE · Sistema visual — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el sistema visual de Alma por el de HIVE (tokens, tipografía, piezas compartidas y logo provisional) sin romper ninguna pantalla.

**Architecture:** Un módulo de tokens por función (`src/design/tokens.ts`) es la única fuente de verdad; de él leen Tailwind, las variables CSS de shadcn y los estilos en línea. Un puente temporal hace que los nombres de Alma apunten a valores HIVE mientras un script migra los ~2,600 usos a los nombres nuevos; después se borra el puente. Las piezas compartidas se reescriben por dentro conservando nombre y props.

**Tech Stack:** React 18 + Vite 5 + TypeScript 5.8 · Tailwind 3.4 + shadcn/ui · Vitest 3 + Testing Library (jsdom) · `node:test` para scripts · `sharp` para generar imágenes.

**Spec:** [`docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md`](../specs/2026-09-24-hive-sistema-visual-design.md)

## Global Constraints

- **Tokens de color (valores exactos):** canvas `#F4F4F3` · surface `#FFFFFF` · sunken `#EAEAE9` · line `#DEDEDC` · lineStrong `#8A8A88` · ink `#111111` · inkMuted `#5B5B59` · accent `#FA936A` · onAccent `#111111` · accentSoft `#FEE4D8` · accentStrong `#B94A26` · success `#2E6B50` · danger `#A3243B` · inverse `#111111` · inverseRaised `#1E1E1E` · onInverse `#F4F4F3` · onInverseMuted `#A3A3A1`.
- **Todo token es hex `#RRGGBB` en mayúsculas.** Hay 44 lugares que le pegan transparencia (`${COLOR.ink}8c`).
- **Tipografía:** Unbounded (600, 800) para titulares y cifras sueltas; Manrope (400–800) para todo lo que se lee. Mínimo 12 px. Titulares grandes en mayúsculas.
- **Regla 1:** nunca texto claro sobre `accent` — sobre coral el texto es `onAccent`.
- **Regla 2:** el coral no es texto — para número, ícono o enlace coral se usa `accentStrong`.
- **Regla 3:** en el panel, coral = atención (sección activa, pendiente, lleno), siempre con texto o número; nunca el color solo.
- **Regla 4:** nunca coral sobre coral — dentro de un bloque `accent` el botón es `ink`.
- **Regla 5:** `success` y `danger` son funcionales, nunca decorativos.
- **Regla 6:** ningún color escrito a mano fuera de `src/design/`.
- **Botones:** alto mínimo 44 px. La variante coral existe sólo en la app (`PrimaryButton variant="accent"`), una por pantalla; el panel no tiene botón coral.
- **Piezas:** conservan nombre y props (sólo se agregan props opcionales).
- **Fuera de alcance:** backend; el texto "Alma" en pantallas, correos y WhatsApp; fotos del estudio; renombrar archivos de `public/` que el servidor lee por nombre.
- **Ramas:** trabajar en `hive-sistema` (sale de `hive`); al terminar se fusiona a `hive`. **Nada va a `main` ni a producción.**
- El logo es **provisional**: marcarlo así en el SVG y en el componente.
- Movimiento: sólo `transform` y `opacity`; respetar `prefers-reduced-motion`.

## Review Focus

1. **Un tono desconocido llegando desde datos** (`tone={status.tone}` con un valor que no existe) — la pantalla no debe romperse; la pill cae al tono neutro. → prueba en Tarea 3.
2. **Un token que no sea hex de 6 dígitos** — los 44 `${COLOR.x}8c` generarían un color inválido y el texto perdería su color sin ningún error. → prueba en Tarea 1.
3. **Titulares en Unbounded mayúsculas a 390 px** ("NOTIFICACIONES", "PREFERENCIAS") — no deben desbordar ni crear scroll horizontal. → prueba en Tarea 8 y barrido en Tarea 13.
4. **Hover de menús, selects y diálogos del panel volviéndose coral** por la colisión del nombre `accent` con shadcn. → prueba en Tarea 2.
5. **Referencias a `ALMA` que sobreviven** por imports de varias líneas o por las reexportaciones de `AppShell`/`AuthShell` — romperían la app en producción con `ALMA is not defined`. → pruebas en Tareas 4 y 5.

---

## Preparación del entorno

Ejecutar una vez antes de la Tarea 1:

```bash
cd "/Users/saidromero/Alma Studio/alma-hive"
git worktree add -b hive-sistema "/Users/saidromero/Alma Studio/alma-hive-sistema" hive
cd "/Users/saidromero/Alma Studio/alma-hive-sistema"
ln -s "/Users/saidromero/Alma Studio/alma-Studio/node_modules" node_modules
npx vitest run 2>&1 | grep "Test Files"   # esperado: 24 passed
```

Notas del entorno:
- `npx tsc --noEmit -p tsconfig.app.json` tiene **un error preexistente** en `src/integrations/supabase/client.ts` (falta `@supabase/supabase-js`). Siempre filtrarlo: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase` debe salir vacío.
- Build: `VITE_API_URL=/api npx vite build`.

---

### Task 1: Tokens y contraste

**Files:**
- Create: `src/design/contrast.ts`
- Create: `src/design/tokens.ts`
- Test: `src/design/tokens.test.ts`

**Interfaces:**
- Produces: `COLOR` (objeto de 17 tokens hex), `ColorToken`, `FONT`, `TONES`, `Tone = "ink" | "muted" | "accent" | "success" | "danger"`, `ToneStyle = { fg, softBg, softFg, solidBg, solidFg }`, `TONE_STYLE: Record<Tone, ToneStyle>`, `LEGACY_TONE`, `LegacyTone`, `ToneInput = Tone | LegacyTone`, `resolveTone(tone: string | undefined, fallback?: Tone): ToneStyle`, `luminance(hex): number`, `contrast(a, b): number`.

- [ ] **Step 1: Escribir la prueba**

`src/design/tokens.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { contrast, luminance } from "./contrast";
import { COLOR, TONES, TONE_STYLE, resolveTone, type ColorToken } from "./tokens";

const TEXT = 4.5;
const CONTROL = 3;

describe("contraste", () => {
  it("reproduce los valores de referencia de WCAG", () => {
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
  it("rechaza lo que no sea #RRGGBB", () => {
    expect(() => luminance("#FFF")).toThrow();
    expect(() => luminance("hsl(0 0% 0%)")).toThrow();
  });
});

describe("tokens", () => {
  it("todos son hex #RRGGBB en mayúsculas (el código les pega transparencia: `${COLOR.ink}8c`)", () => {
    for (const [nombre, valor] of Object.entries(COLOR)) {
      expect(valor, nombre).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  const permitidos: [ColorToken, ColorToken, number][] = [
    ["ink", "canvas", TEXT], ["ink", "surface", TEXT], ["ink", "sunken", TEXT],
    ["inkMuted", "canvas", TEXT], ["inkMuted", "surface", TEXT], ["inkMuted", "sunken", TEXT],
    ["onAccent", "accent", TEXT], ["ink", "accentSoft", TEXT],
    ["accentStrong", "canvas", TEXT], ["accentStrong", "surface", TEXT],
    ["success", "canvas", TEXT], ["success", "surface", TEXT],
    ["danger", "canvas", TEXT], ["danger", "surface", TEXT],
    ["onInverse", "inverse", TEXT], ["onInverseMuted", "inverse", TEXT], ["onInverse", "inverseRaised", TEXT],
    ["canvas", "ink", TEXT], ["canvas", "success", TEXT], ["canvas", "danger", TEXT],
    ["canvas", "inkMuted", TEXT], ["canvas", "accentStrong", TEXT],
    ["accent", "inverse", CONTROL],
    ["lineStrong", "canvas", CONTROL], ["lineStrong", "surface", CONTROL],
  ];
  it.each(permitidos)("%s sobre %s alcanza %s:1", (fg, bg, minimo) => {
    expect(contrast(COLOR[fg], COLOR[bg])).toBeGreaterThanOrEqual(minimo);
  });

  // Prohibidas por regla (spec §3.2). Ninguna pieza puede usarlas.
  const prohibidos: [ColorToken, ColorToken][] = [
    ["onInverse", "accent"],        // texto claro sobre coral
    ["accent", "canvas"],           // coral como texto
    ["accentStrong", "accentSoft"], // coral profundo sobre coral suave: 4.25:1
  ];
  it.each(prohibidos)("%s sobre %s no llega a 4.5:1 y está prohibido", (fg, bg) => {
    expect(contrast(COLOR[fg], COLOR[bg])).toBeLessThan(TEXT);
  });
});

describe("tonos", () => {
  it.each(TONES)("el tono %s es legible en todas sus formas", (t) => {
    const s = TONE_STYLE[t];
    expect(contrast(s.fg, COLOR.canvas)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.fg, COLOR.surface)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.softFg, s.softBg)).toBeGreaterThanOrEqual(TEXT);
    expect(contrast(s.solidFg, s.solidBg)).toBeGreaterThanOrEqual(TEXT);
  });

  it("resuelve los tonos nuevos", () => {
    expect(resolveTone("success")).toBe(TONE_STYLE.success);
    expect(resolveTone("accent")).toBe(TONE_STYLE.accent);
  });

  it("acepta los nombres de Alma mientras dura la migración", () => {
    expect(resolveTone("olive")).toBe(TONE_STYLE.success);
    expect(resolveTone("berry")).toBe(TONE_STYLE.accent);
    expect(resolveTone("destructive")).toBe(TONE_STYLE.danger);
    expect(resolveTone("stone")).toBe(TONE_STYLE.muted);
  });

  it("un tono desconocido cae al neutro en vez de romper la pantalla", () => {
    expect(resolveTone("violeta")).toBe(TONE_STYLE.muted);
    expect(resolveTone(undefined)).toBe(TONE_STYLE.muted);
    expect(resolveTone("violeta", "ink")).toBe(TONE_STYLE.ink);
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/design/tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implementar**

`src/design/contrast.ts`:

```ts
/** Luminancia relativa WCAG 2.x de un color #RRGGBB. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`Color inválido (se espera #RRGGBB): ${hex}`);
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores #RRGGBB (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

`src/design/tokens.ts`:

```ts
/**
 * Tokens de color de HIVE — única fuente de verdad.
 *
 * Nombran para qué sirve cada color, no a qué marca pertenece: si la marca
 * vuelve a cambiar, cambian los valores, no los nombres. Los leen Tailwind
 * (tailwind.config.ts), las variables de shadcn (src/index.css) y los estilos
 * en línea de la app.
 *
 * Siempre hex #RRGGBB: hay código que les pega transparencia (`${COLOR.ink}8c`).
 * Spec: docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md §3
 */
export const COLOR = {
  canvas: "#F4F4F3",
  surface: "#FFFFFF",
  sunken: "#EAEAE9",
  line: "#DEDEDC",
  lineStrong: "#8A8A88",
  ink: "#111111",
  inkMuted: "#5B5B59",
  accent: "#FA936A",
  onAccent: "#111111",
  accentSoft: "#FEE4D8",
  accentStrong: "#B94A26",
  success: "#2E6B50",
  danger: "#A3243B",
  inverse: "#111111",
  inverseRaised: "#1E1E1E",
  onInverse: "#F4F4F3",
  onInverseMuted: "#A3A3A1",
} as const;

export type ColorToken = keyof typeof COLOR;

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

export const TONE_STYLE: Record<Tone, ToneStyle> = {
  ink: { fg: COLOR.ink, softBg: COLOR.sunken, softFg: COLOR.ink, solidBg: COLOR.ink, solidFg: COLOR.canvas },
  muted: { fg: COLOR.inkMuted, softBg: COLOR.sunken, softFg: COLOR.inkMuted, solidBg: COLOR.inkMuted, solidFg: COLOR.canvas },
  // Coral suave lleva texto ink: coral profundo sobre coral suave da 4.25:1.
  accent: { fg: COLOR.accentStrong, softBg: COLOR.accentSoft, softFg: COLOR.ink, solidBg: COLOR.accent, solidFg: COLOR.onAccent },
  // Éxito y error van sobre blanco (spec §4.2): funcionales, no decorativos.
  success: { fg: COLOR.success, softBg: COLOR.surface, softFg: COLOR.success, solidBg: COLOR.success, solidFg: COLOR.canvas },
  danger: { fg: COLOR.danger, softBg: COLOR.surface, softFg: COLOR.danger, solidBg: COLOR.danger, solidFg: COLOR.canvas },
};

/**
 * Nombres de color de Alma que las pantallas todavía pasan como tono.
 * TEMPORAL: la Tarea 5 migra las llamadas y borra este mapa.
 */
export const LEGACY_TONE = {
  berry: "accent",
  olive: "success",
  destructive: "danger",
  stone: "muted",
  coral: "muted",
  sandstone: "muted",
  blush: "muted",
  mist: "muted",
  cream: "muted",
  border: "muted",
  ink: "ink",
  inkDeep: "ink",
} as const satisfies Record<string, Tone>;

export type LegacyTone = keyof typeof LEGACY_TONE;
export type ToneInput = Tone | LegacyTone;

const isTone = (t: string): t is Tone => (TONES as readonly string[]).includes(t);

/** Estilo de un tono. Un valor desconocido cae a `fallback` en vez de romper la pantalla. */
export function resolveTone(tone: string | undefined, fallback: Tone = "muted"): ToneStyle {
  if (tone && isTone(tone)) return TONE_STYLE[tone];
  if (tone && tone in LEGACY_TONE) return TONE_STYLE[LEGACY_TONE[tone as LegacyTone]];
  return TONE_STYLE[fallback];
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `npx vitest run src/design/tokens.test.ts`
Expected: PASS (todas las pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/design/
git commit -m "feat(hive): tokens de color por función con contraste verificado

Única fuente de verdad del sistema HIVE. Cada combinación permitida se mide
contra su mínimo WCAG; las tres prohibidas quedan documentadas en la prueba.
Coral profundo sobre coral suave da 4.25:1, por eso la pill suave coral
lleva texto negro.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Conectar los tokens (Tailwind, CSS, fuentes, shadcn) y puente

**Files:**
- Modify: `tailwind.config.ts` (archivo completo)
- Modify: `src/index.css:173-213` (bloque `:root` de shadcn) y `:215-282` (body, titulares, utilidades de fuente)
- Modify: `index.html:13,18`
- Modify: `public/site.webmanifest` (`background_color`, `theme_color`)
- Modify: `src/components/app/tokens.ts` (archivo completo, puente)
- Modify: los 10 archivos de `src/components/ui/` que usan `accent` como hover
- Test: `src/design/wiring.test.ts`

**Interfaces:**
- Consumes: `COLOR` (Tarea 1).
- Produces: clases de Tailwind `bg-canvas`, `bg-surface`, `bg-sunken`, `border-line`, `border-line-strong`, `text-ink`, `text-ink-muted`, `bg-accent`, `bg-accent-soft`, `text-accent-strong`, `text-accent-foreground`, `text-success`, `text-danger`, `bg-inverse`, `bg-inverse-raised`, `text-inverse-foreground`, `text-inverse-muted`; `font-sans` = Manrope, `font-display` = Unbounded. El objeto `ALMA` sigue existiendo con valores HIVE.

- [ ] **Step 1: Escribir la prueba**

`src/design/wiring.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { COLOR } from "./tokens";

const root = path.resolve(__dirname, "..", "..");
const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

/** "60 4% 95%" → #RRGGBB */
function hslToHex(triplet: string): string {
  const [h, s, l] = triplet.trim().split(/\s+/).map((v) => parseFloat(v));
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function cssVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(css);
  if (!m) throw new Error(`Falta --${name} en index.css`);
  return m[1].replace(/\/\*.*?\*\//g, "").trim();
}
const cercano = (a: string, b: string) =>
  [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);

describe("cableado de tokens", () => {
  const esperado: Record<string, string> = {
    background: COLOR.canvas, foreground: COLOR.ink,
    card: COLOR.surface, "card-foreground": COLOR.ink,
    popover: COLOR.surface, "popover-foreground": COLOR.ink,
    primary: COLOR.ink, "primary-foreground": COLOR.canvas,
    secondary: COLOR.sunken, "secondary-foreground": COLOR.ink,
    muted: COLOR.sunken, "muted-foreground": COLOR.inkMuted,
    destructive: COLOR.danger, "destructive-foreground": COLOR.canvas,
    border: COLOR.line, input: COLOR.lineStrong, ring: COLOR.ink,
  };
  it.each(Object.entries(esperado))("--%s coincide con su token", (variable, hex) => {
    expect(cercano(hslToHex(cssVar(variable)), hex), `--${variable}`).toBe(true);
  });

  it("shadcn ya no define --accent: ese nombre ahora es el coral", () => {
    expect(css).not.toMatch(/--accent(-foreground)?:/);
  });

  it("los componentes shadcn no usan accent para hover, foco ni selección", () => {
    const dir = path.join(root, "src/components/ui");
    const conProblema = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => {
        const src = fs.readFileSync(path.join(dir, f), "utf8");
        return /\b[\w-]+(\[[^\]]*\])?:bg-accent(\/\d+)?\b/.test(src) || /\btext-accent-foreground\b/.test(src);
      });
    expect(conProblema).toEqual([]);
  });

  it("index.html carga Unbounded y Manrope, y ya no Fraunces ni Jost", () => {
    expect(html).toMatch(/family=Unbounded/);
    expect(html).toMatch(/family=Manrope/);
    expect(html).not.toMatch(/Fraunces|Jost/);
    expect(html).toContain('content="#F4F4F3"');
  });

  it("el cuerpo usa Manrope y los titulares Unbounded", () => {
    expect(css).toMatch(/body\s*\{[^}]*'Manrope'/);
    expect(css).toMatch(/h1, h2, h3, h4, h5, h6\s*\{[^}]*'Unbounded'/);
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/design/wiring.test.ts`
Expected: FAIL — `--background` no coincide con `#F4F4F3`, `--accent:` existe, varios archivos de `ui/` usan `hover:bg-accent`, `index.html` carga Fraunces.

- [ ] **Step 3: Reasignar el hover de shadcn a `sunken` (antes de que `accent` sea coral)**

Run:

```bash
python3 - <<'PY'
import re, pathlib
n = 0
for f in sorted(pathlib.Path("src/components/ui").glob("*.tsx")):
    s = f.read_text(); o = s
    # Estado + bg-accent (hover:, focus:, aria-selected:, data-[state=open]:, ...) → bg-sunken
    s = re.sub(r'\b([\w-]+(?:\[[^\]]*\])?):bg-accent(/\d+)?\b', r'\1:bg-sunken\2', s)
    # "Hoy" en el calendario: coral suave con texto negro
    s = s.replace("bg-accent text-accent-foreground", "bg-accent-soft text-ink")
    # Texto sobre el antiguo hover
    s = re.sub(r'\b([\w-]+(?:\[[^\]]*\])?):text-accent-foreground\b', r'\1:text-ink', s)
    s = re.sub(r'\btext-accent-foreground\b', 'text-ink', s)
    if s != o:
        f.write_text(s); n += 1; print("  ", f.name)
print("archivos:", n)
PY
```

Expected: lista 10 archivos (`button`, `calendar`, `command`, `context-menu`, `dialog`, `dropdown-menu`, `menubar`, `navigation-menu`, `select`, `toggle`).

- [ ] **Step 4: Reemplazar `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";
import { COLOR } from "./src/design/tokens";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        /* shadcn: leen las variables de src/index.css (valores HIVE). */
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },

        /* HIVE — tokens por función (src/design/tokens.ts). */
        canvas: COLOR.canvas,
        surface: COLOR.surface,
        sunken: COLOR.sunken,
        line: { DEFAULT: COLOR.line, strong: COLOR.lineStrong },
        ink: { DEFAULT: COLOR.ink, muted: COLOR.inkMuted },
        accent: {
          DEFAULT: COLOR.accent,
          soft: COLOR.accentSoft,
          strong: COLOR.accentStrong,
          foreground: COLOR.onAccent,
        },
        success: COLOR.success,
        danger: COLOR.danger,
        inverse: {
          DEFAULT: COLOR.inverse,
          raised: COLOR.inverseRaised,
          foreground: COLOR.onInverse,
          muted: COLOR.onInverseMuted,
        },

        /* PUENTE TEMPORAL (spec §6.2): nombres de Alma → valores HIVE.
           La Tarea 5 lo borra. */
        alma: {
          canvas: COLOR.canvas,
          mist: COLOR.sunken,
          oat: COLOR.sunken,
          sandstone: COLOR.line,
          stone: COLOR.inkMuted,
          berry: COLOR.accentStrong,
          ink: COLOR.ink,
          "ink-deep": COLOR.inverse,
          hairline: COLOR.line,
          olive: COLOR.success,
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        display: ['"Unbounded"', "system-ui", "sans-serif"],
        /* Alias legacy hasta la Tarea 12 (la Tarea 5 migra sus usos). */
        alilato: ['"Manrope"', "system-ui", "sans-serif"],
        gulfs: ['"Unbounded"', "system-ui", "sans-serif"],
        bebas: ['"Unbounded"', "system-ui", "sans-serif"],
        syne: ['"Manrope"', "system-ui", "sans-serif"],
        dm: ['"Manrope"', "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

- [ ] **Step 5: Reemplazar el bloque `:root` de shadcn en `src/index.css`**

Sustituir desde la línea `/* Paleta canónica: brand kit greige cálido + espresso */` hasta `--radius: 0.75rem;` (dentro del primer `@layer base`) por:

```css
    /* HIVE — valores de src/design/tokens.ts en HSL (los lee shadcn). */
    --background: 60 4% 95%;             /* canvas #F4F4F3 */
    --foreground: 0 0% 7%;               /* ink #111111 */

    --card: 0 0% 100%;                   /* surface #FFFFFF */
    --card-foreground: 0 0% 7%;

    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 7%;

    --primary: 0 0% 7%;                  /* ink */
    --primary-foreground: 60 4% 95%;     /* canvas */

    --secondary: 60 2% 92%;              /* sunken #EAEAE9 */
    --secondary-foreground: 0 0% 7%;

    --muted: 60 2% 92%;                  /* sunken */
    --muted-foreground: 60 1% 35%;       /* inkMuted #5B5B59 */

    /* shadcn ya no define la variable de acento: en HIVE ese nombre es el coral (tailwind.config.ts). */

    --destructive: 349 64% 39%;          /* danger #A3243B */
    --destructive-foreground: 60 4% 95%;

    --border: 60 3% 87%;                 /* line #DEDEDC */
    --input: 60 1% 54%;                  /* lineStrong #8A8A88 (3:1) */
    --ring: 0 0% 7%;                     /* ink */

    --radius: 0.75rem;
```

- [ ] **Step 6: Fuentes en `src/index.css`**

En el segundo `@layer base`, el `body` usa Jost y del comentario `/* Serif protagonista… */` hasta el cierre de `.font-display-italic` hay titulares y clases de fuente con Fraunces, Jost y Alilato. Run:

```bash
python3 - <<'PY'
import re
p = "src/index.css"; s = open(p).read()
old = "    font-family: 'Jost', system-ui, sans-serif;\n    overflow-x: hidden;"
assert old in s, "no se encontró el font-family del body"
s = s.replace(old, "    font-family: 'Manrope', system-ui, sans-serif;\n    overflow-x: hidden;", 1)
NEW = """  /* Titulares: Unbounded. Los grandes van en mayúsculas desde cada pieza. */
  h1, h2, h3, h4, h5, h6 {
    font-family: 'Unbounded', system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  /* PUENTE hasta la Tarea 12: clases de fuente de Alma → HIVE. */
  .font-display,
  .font-display-italic,
  .font-bebas,
  .font-gulfs {
    font-family: 'Unbounded', system-ui, sans-serif;
    font-style: normal;
    letter-spacing: -0.01em;
  }
  .font-alilato,
  .font-syne,
  .font-dm {
    font-family: 'Manrope', system-ui, sans-serif;
  }
"""
s, n = re.subn(r"  /\* Serif protagonista.*?\n  \.font-display-italic \{.*?\}\n", NEW, s, count=1, flags=re.S)
assert n == 1, "no se encontró el bloque de titulares y clases de fuente"
open(p, "w").write(s)
print("ok")
PY
```

Expected: `ok`. La clase `.nums` que sigue al bloque no se toca.

- [ ] **Step 7: `index.html` y manifiesto**

Run:

```bash
python3 - <<'PY'
import re
p = "index.html"; s = open(p).read()
s = re.sub(r'https://fonts\.googleapis\.com/css2\?family=Fraunces[^"]+',
           'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@600;700;800&display=swap', s)
s = s.replace('<meta name="theme-color" content="#FAF9F6" />', '<meta name="theme-color" content="#F4F4F3" />')
open(p, "w").write(s)
p = "public/site.webmanifest"; s = open(p).read()
s = s.replace('"background_color": "#FAF9F6"', '"background_color": "#F4F4F3"')
s = s.replace('"theme_color": "#A48D78"', '"theme_color": "#F4F4F3"')
open(p, "w").write(s)
print("ok")
PY
```

- [ ] **Step 8: Puente del objeto `ALMA`**

Reemplazar `src/components/app/tokens.ts` completo:

```ts
// PUENTE TEMPORAL — Alma → HIVE (spec §6.2). La Tarea 5 borra este archivo.
// Los nombres viejos apuntan a los valores nuevos por función, para que toda
// la app cambie de color sin tocar ninguna pantalla todavía.
import { COLOR } from "@/design/tokens";

export const ALMA = {
  cream: COLOR.canvas,
  mist: COLOR.sunken,
  blush: COLOR.sunken,
  sandstone: COLOR.line,
  stone: COLOR.inkMuted,
  coral: COLOR.inkMuted, // alias viejo de "stone": era beige, NO el coral de HIVE
  berry: COLOR.accentStrong,
  ink: COLOR.ink,
  inkDeep: COLOR.inverse,
  border: COLOR.line,
  olive: COLOR.success,
  destructive: COLOR.danger,
} as const;

export type AlmaTone = keyof typeof ALMA;
```

- [ ] **Step 9: Correr la prueba, la suite y el build**

Run: `npx vitest run src/design/wiring.test.ts && npx vitest run 2>&1 | tail -3 && VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: wiring PASS; suite completa en verde; build `✓ built`.

- [ ] **Step 10: Commit**

```bash
git add tailwind.config.ts src/index.css index.html public/site.webmanifest src/components/app/tokens.ts src/components/ui/ src/design/wiring.test.ts
git commit -m "feat(hive): conectar tokens a Tailwind, shadcn y fuentes, con puente

La app entera cambia a los valores HIVE sin tocar pantallas: los nombres de
Alma apuntan por función a los tokens nuevos. Antes de que 'accent' pase a
ser coral, el hover de 10 componentes shadcn se reasigna a 'sunken'; si no,
cada hover del panel se volvería coral. Fuentes: Unbounded + Manrope.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Piezas con tono

**Files:**
- Modify: `src/components/app/widgets.tsx` — `StatusPill`, `InfoBanner`
- Modify: `src/components/app/AppShell.tsx` — `ListRow`, `Stat`, `Tag`, `ActionRow`
- Test: `src/components/app/tones.test.tsx`

**Interfaces:**
- Consumes: `COLOR`, `resolveTone`, `ToneInput` (Tarea 1).
- Produces: `StatusPill({ label, tone: ToneInput, variant?: "soft" | "solid" })`, `InfoBanner({ tone?: ToneInput = "accent", title, description?, action? })`, `ListRow({ ..., iconTint?: ToneInput = "accent" })`, `Stat({ value, label, tint?: ToneInput = "ink" })`, `Tag({ children, tint?: ToneInput = "accent", variant? })`, `ActionRow({ ..., tint?: ToneInput = "accent" })`. Ninguna usa `ALMA[...]`.

- [ ] **Step 1: Escribir la prueba**

`src/components/app/tones.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StatusPill, InfoBanner } from "./widgets";
import { Tag, Stat, ListRow, ActionRow } from "./AppShell";
import { COLOR } from "@/design/tokens";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("piezas con tono", () => {
  it("la pill suave coral lleva texto negro (coral profundo sobre coral suave no pasa)", () => {
    wrap(<StatusPill label="Por verificar" tone="accent" />);
    expect(screen.getByText("Por verificar")).toHaveStyle({ backgroundColor: COLOR.accentSoft, color: COLOR.ink });
  });

  it("acepta todavía nombres de Alma", () => {
    wrap(<StatusPill label="Pagado" tone="olive" />);
    expect(screen.getByText("Pagado")).toHaveStyle({ color: COLOR.success });
  });

  it("un tono desconocido no rompe la pantalla: cae al neutro", () => {
    wrap(<StatusPill label="Raro" tone={"violeta" as never} />);
    expect(screen.getByText("Raro")).toHaveStyle({ color: COLOR.inkMuted });
  });

  it("la pill sólida coral nunca lleva texto claro", () => {
    wrap(<Tag tint="accent" variant="solid">4 lugares</Tag>);
    expect(screen.getByText("4 lugares")).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });

  it("InfoBanner usa coral suave por defecto", () => {
    wrap(<InfoBanner title="Aviso" />);
    expect(screen.getByText("Aviso").closest("div[class*='rounded-2xl']")).toHaveStyle({ backgroundColor: COLOR.accentSoft });
  });

  it("Stat pinta la cifra con el color del tono", () => {
    wrap(<Stat value="12" label="Clases" tint="accent" />);
    expect(screen.getByText("12")).toHaveStyle({ color: COLOR.accentStrong });
  });

  it("ListRow destructiva usa danger en el título", () => {
    wrap(<ListRow title="Cerrar sesión" destructive onClick={() => {}} />);
    expect(screen.getByText("Cerrar sesión")).toHaveStyle({ color: COLOR.danger });
  });

  it("ActionRow: el círculo coral lleva la flecha en negro", () => {
    wrap(<ActionRow title="Tu próxima clase" to="/app/bookings" />);
    const circulo = screen.getByTestId("action-row-arrow");
    expect(circulo).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run src/components/app/tones.test.tsx`
Expected: FAIL — `StatusPill` pinta `${c}1a`, no `accentSoft`; `Tag` sólido usa texto `cream`; falta `data-testid="action-row-arrow"`.

- [ ] **Step 3: Reescribir `StatusPill` e `InfoBanner` en `src/components/app/widgets.tsx`**

Cambiar la línea de import `import { ALMA, type AlmaTone } from "@/components/app/tokens";` por:

```ts
import { ALMA } from "@/components/app/tokens";
import { COLOR, resolveTone, type ToneInput } from "@/design/tokens";
```

Reemplazar los bloques completos de `StatusPill` e `InfoBanner` (desde `/* ════ StatusPill` hasta el final del archivo) por:

```tsx
/* ═══════════════════════════════════════════════════════════
   StatusPill — estado semántico (reserva, orden, pago…)
   El color nunca va solo: siempre con la palabra y un punto.
   ═══════════════════════════════════════════════════════════ */
type StatusPillProps = {
  label: string;
  tone: ToneInput;
  variant?: "soft" | "solid";
};
export const StatusPill = ({ label, tone, variant = "soft" }: StatusPillProps) => {
  const t = resolveTone(tone);
  const soft = variant === "soft";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold leading-none"
      style={
        soft
          ? { backgroundColor: t.softBg, color: t.softFg, boxShadow: `inset 0 0 0 1px ${COLOR.line}` }
          : { backgroundColor: t.solidBg, color: t.solidFg }
      }
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
      {label}
    </span>
  );
};

/* ═══════════════════════════════════════════════════════════
   InfoBanner — aviso en línea (no toast)
   ═══════════════════════════════════════════════════════════ */
type InfoBannerProps = {
  tone?: ToneInput;
  title: string;
  description?: string;
  action?: ReactNode;
};
export const InfoBanner = ({ tone = "accent", title, description, action }: InfoBannerProps) => {
  const t = resolveTone(tone);
  return (
    <div
      className="flex items-start gap-4 rounded-2xl p-4"
      style={{ backgroundColor: t.softBg, border: `1px solid ${COLOR.line}`, color: COLOR.ink }}
    >
      <span aria-hidden="true" className="mt-1.5 inline-block h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.fg }} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-semibold leading-snug" style={{ color: COLOR.ink }}>{title}</p>
        {description && (
          <p className="mt-1 text-[0.875rem] leading-[1.5]" style={{ color: COLOR.inkMuted }}>
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
```

- [ ] **Step 4: Reescribir `ListRow`, `Stat`, `Tag` y `ActionRow` en `src/components/app/AppShell.tsx`**

Agregar debajo de `import { ALMA } from "@/components/app/tokens";`:

```ts
import { COLOR, resolveTone, type ToneInput } from "@/design/tokens";
```

Reemplazar el bloque completo de `ListRow` (desde `/* ── ListRow ──` hasta el cierre de la función, antes de `/* ── ListGroup ──`) por:

```tsx
/* ── ListRow ── fila con divisor; interactiva si recibe `to` u `onClick` */
type ListRowProps = {
  to?: string;
  onClick?: () => void;
  icon?: ReactNode;
  iconTint?: ToneInput;
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  destructive?: boolean;
  asButton?: boolean;
};
export const ListRow = ({ to, onClick, icon, iconTint = "accent", title, description, trailing, destructive, asButton }: ListRowProps) => {
  const t = resolveTone(destructive ? "danger" : iconTint);
  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      {icon ? (
        <span className="grid h-10 w-10 place-items-center rounded-xl shrink-0" style={{ backgroundColor: t.softBg, color: t.fg }}>
          {icon}
        </span>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="min-w-0">
        <div className="text-[0.95rem] font-semibold leading-tight truncate" style={{ color: destructive ? COLOR.danger : COLOR.ink }}>
          {title}
        </div>
        {description && (
          <div className="text-[0.8125rem] mt-0.5 truncate" style={{ color: COLOR.inkMuted }}>
            {description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0" style={{ color: COLOR.inkMuted }}>
        {trailing}
        {(to || onClick) && <ChevronRight size={15} />}
      </div>
    </div>
  );

  const sharedClass = "block w-full text-left no-underline transition-colors";
  const interactiveClass = sharedClass + " hover:bg-canvas";
  const sharedStyle = { color: COLOR.ink, borderTop: `1px solid ${COLOR.line}` };

  if (asButton || (onClick && !to)) {
    return (
      <button onClick={onClick} className={interactiveClass + " bg-transparent border-0 cursor-pointer px-4"} style={sharedStyle}>
        {inner}
      </button>
    );
  }
  if (to) {
    return (
      <Link to={to} onClick={onClick} className={interactiveClass + " px-4"} style={sharedStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={sharedClass + " px-4"} style={sharedStyle}>
      {inner}
    </div>
  );
};
```

Reemplazar `Stat` y `Tag` completos por:

```tsx
/* ── Stat ── cifra + etiqueta */
type StatProps = {
  value: ReactNode;
  label: string;
  tint?: ToneInput;
};
export const Stat = ({ value, label, tint = "ink" }: StatProps) => (
  <div className="pt-3" style={{ borderTop: `1px solid ${COLOR.line}` }}>
    <div className="font-display font-semibold text-2xl leading-none" style={{ color: resolveTone(tint).fg }}>
      {value}
    </div>
    <div className="text-[0.75rem] font-bold uppercase tracking-[0.12em] mt-1.5" style={{ color: COLOR.inkMuted }}>
      {label}
    </div>
  </div>
);

/* ── Tag ── pill; sólida para disponibilidad (coral = hay lugar) */
type TagProps = {
  children: ReactNode;
  tint?: ToneInput;
  variant?: "soft" | "solid";
};
export const Tag = ({ children, tint = "accent", variant = "soft" }: TagProps) => {
  const t = resolveTone(tint);
  const soft = variant === "soft";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold leading-none"
      style={soft ? { backgroundColor: t.softBg, color: t.softFg } : { backgroundColor: t.solidBg, color: t.solidFg }}
    >
      {children}
    </span>
  );
};
```

Reemplazar `ActionRow` completo por:

```tsx
/* ── ActionRow ── tarjeta de acción amplia (p. ej. "tu próxima clase") */
type ActionRowProps = {
  to?: string;
  onClick?: () => void;
  eyebrow?: string;
  title: ReactNode;
  meta?: ReactNode;
  rightLabel?: string;
  tint?: ToneInput;
};
export const ActionRow = ({ to, onClick, eyebrow, title, meta, rightLabel, tint = "accent" }: ActionRowProps) => {
  const t = resolveTone(tint);
  const inner = (
    <div
      className="grid grid-cols-[1fr_auto] items-center gap-5 px-5 py-5 sm:px-6 sm:py-6 rounded-2xl transition-transform motion-safe:hover:-translate-y-px"
      style={{ backgroundColor: COLOR.surface, boxShadow: `inset 0 0 0 1px ${COLOR.line}` }}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: t.fg }}>
            {eyebrow}
          </p>
        )}
        <div className="font-display font-semibold text-[1.25rem] sm:text-[1.5rem] leading-tight mt-1" style={{ color: COLOR.ink }}>
          {title}
        </div>
        {meta && (
          <p className="text-[0.875rem] mt-1" style={{ color: COLOR.inkMuted }}>
            {meta}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {rightLabel && (
          <span className="hidden sm:inline-block text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: t.fg }}>
            {rightLabel}
          </span>
        )}
        <span
          data-testid="action-row-arrow"
          className="grid h-11 w-11 place-items-center rounded-full"
          style={{ backgroundColor: t.solidBg, color: t.solidFg }}
        >
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
```

- [ ] **Step 5: Correr la prueba y la suite**

Run: `npx vitest run src/components/app/tones.test.tsx && npx vitest run 2>&1 | tail -3 && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase`
Expected: tones PASS; suite en verde; `tsc` sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/components/app/widgets.tsx src/components/app/AppShell.tsx src/components/app/tones.test.tsx
git commit -m "feat(hive): piezas con tono resueltas por función, sin ALMA[...]

StatusPill, InfoBanner, ListRow, Stat, Tag y ActionRow reciben un tono
(ink, muted, accent, success, danger) y lo resuelven con resolveTone. Aceptan
todavía los nombres de Alma durante la migración, y un tono desconocido que
llegue desde datos cae al neutro en vez de romper la pantalla.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Script de migración de nombres

**Files:**
- Create: `scripts/codemod/hive-tokens.mjs`
- Test: `scripts/codemod/hive-tokens.test.mjs`

**Interfaces:**
- Produces: `zoneOf(file)`, `mapClassColor(prefix, color, zone)`, `transformClasses(src, zone)`, `roleAt(line, index)`, `mapRef(key, role, zone)`, `transformRefs(src, zone)`, `transformToneTypes(src)`, `transformTones(src)`, `transformFonts(src)`, `transformMotion(src)`, `transformImports(src)`, `transform(src, file)`; CLI `node scripts/codemod/hive-tokens.mjs [--dry]`.

- [ ] **Step 1: Escribir la prueba**

`scripts/codemod/hive-tokens.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  zoneOf, mapClassColor, transformClasses, roleAt, transformRefs, transformToneTypes,
  transformTones, transformFonts, transformMotion, transformImports, transform,
} from "./hive-tokens.mjs";

test("zona por ruta", () => {
  assert.equal(zoneOf("src/pages/admin/Dashboard.tsx"), "admin");
  assert.equal(zoneOf("src/components/admin/AdminLayout.tsx"), "admin");
  assert.equal(zoneOf("src/pages/client/Wallet.tsx"), "app");
  assert.equal(zoneOf("src/pages/Index.tsx"), "app");
});

test("sandstone según el prefijo", () => {
  assert.equal(mapClassColor("border", "sandstone", "app"), "line-strong");
  assert.equal(mapClassColor("ring", "sandstone", "app"), "line-strong");
  assert.equal(mapClassColor("text", "sandstone", "app"), "ink-muted");
  assert.equal(mapClassColor("bg", "sandstone", "app"), "line");
  assert.equal(mapClassColor("divide", "sandstone", "app"), "line");
});

test("berry: relleno negro; texto coral profundo en la app y negro en el panel", () => {
  assert.equal(mapClassColor("bg", "berry", "app"), "ink");
  assert.equal(mapClassColor("text", "berry", "app"), "accent-strong");
  assert.equal(mapClassColor("text", "berry", "admin"), "ink");
});

test("un color sin mapeo detiene la migración", () => {
  assert.throws(() => mapClassColor("bg", "lavanda", "app"));
});

test("clases con variantes y opacidad", () => {
  const src = 'className="bg-alma-oat hover:bg-alma-oat/40 text-alma-ink/45 border-alma-hairline bg-alma-ink-deep focus-visible:ring-offset-alma-canvas"';
  assert.equal(
    transformClasses(src, "admin"),
    'className="bg-sunken hover:bg-sunken/40 text-ink/45 border-line bg-inverse focus-visible:ring-offset-canvas"',
  );
});

test("rol por la propiedad CSS, incluidos ternarios y plantillas", () => {
  const l1 = "style={{ backgroundColor: active ? ALMA.berry : \"transparent\", color: active ? ALMA.cream : ALMA.ink }}";
  assert.equal(roleAt(l1, l1.indexOf("ALMA.berry")), "fill");
  assert.equal(roleAt(l1, l1.lastIndexOf("ALMA.ink")), "text");
  const l2 = "style={{ border: `1px solid ${ALMA.sandstone}` }}";
  assert.equal(roleAt(l2, l2.indexOf("ALMA.sandstone")), "control");
  const l3 = "<Check color={ALMA.berry} />";
  assert.equal(roleAt(l3, l3.indexOf("ALMA.berry")), "text");
});

test("referencias ALMA.* según rol y zona", () => {
  const src = "style={{ backgroundColor: ALMA.berry, color: ALMA.cream, borderTop: `1px solid ${ALMA.border}` }}";
  assert.equal(
    transformRefs(src, "app"),
    "style={{ backgroundColor: COLOR.ink, color: COLOR.canvas, borderTop: `1px solid ${COLOR.line}` }}",
  );
  assert.equal(transformRefs("color: ALMA.berry", "app"), "color: COLOR.accentStrong");
  assert.equal(transformRefs("color: ALMA.berry", "admin"), "color: COLOR.ink");
  assert.equal(transformRefs("color: `${ALMA.ink}8c`", "app"), "color: `${COLOR.ink}8c`");
  assert.equal(transformRefs("color: ALMA.coral", "app"), "color: COLOR.inkMuted"); // era beige
});

test("tonos con nombres de Alma", () => {
  assert.equal(transformTones('<StatusPill tone="olive" />'), '<StatusPill tone="success" />');
  assert.equal(transformTones('{ label: "x", tone: "destructive" }'), '{ label: "x", tone: "danger" }');
  assert.equal(transformTones('<ListRow iconTint="berry" />'), '<ListRow iconTint="accent" />');
  assert.equal(transformTones('<Tag tint="stone">'), '<Tag tint="muted">');
  assert.equal(transformTones('<Tag tint="ink">'), '<Tag tint="ink">');
  // Ternarios y valores por defecto dentro de una expresión
  assert.equal(
    transformTones('<StatusPill tone={m.status === "active" ? "destructive" : "berry"} />'),
    '<StatusPill tone={m.status === "active" ? "danger" : "accent"} />',
  );
  assert.equal(transformTones('<Tag tint={MAP[b.status] ?? "berry"}>'), '<Tag tint={MAP[b.status] ?? "accent"}>');
});

test("tipos y mapas de tono declarados con el objeto ALMA", () => {
  // MyBookings: los valores de un Record<…, keyof typeof ALMA> también son tonos.
  const src = 'const T: Record<string, keyof typeof ALMA> = {\n  confirmed: "olive",\n  cancelled: "ink",\n};\nconst S: Record<string, { tone: keyof typeof ALMA }> = {};\n';
  assert.equal(
    transformToneTypes(src),
    'const T: Record<string, ToneInput> = {\n  confirmed: "success",\n  cancelled: "ink",\n};\nconst S: Record<string, { tone: ToneInput }> = {};\n',
  );
});

test("fuentes y curvas de movimiento", () => {
  assert.equal(transformFonts("font-display-italic font-bebas font-alilato font-display"), "font-display font-display font-sans font-display");
  assert.equal(transformMotion("ease-[var(--ease-alma-out)] var(--ease-alma-drawer)"), "ease-[var(--ease-out)] var(--ease-drawer)");
});

test("imports: de una línea, de varias líneas y reexportación", () => {
  const una = 'import { ALMA } from "@/components/app/tokens";\nconst x = COLOR.ink;\n';
  assert.equal(transformImports(una), '\nimport { COLOR } from "@/design/tokens";\nconst x = COLOR.ink;\n'.replace(/^\n/, ""));

  const varias = 'import {\n  AppShell,\n  ALMA,\n  PageHeader,\n} from "@/components/app/AppShell";\nconst c = COLOR.ink;\n';
  const out = transformImports(varias);
  assert.match(out, /import \{\n  AppShell,\n  PageHeader,\n\} from "@\/components\/app\/AppShell";/);
  assert.match(out, /import \{ COLOR \} from "@\/design\/tokens";/);
  assert.doesNotMatch(out, /\bALMA\b/);

  // AuthShell: la reexportación lleva un comentario encima que también debe irse.
  const reexp = 'import { ALMA } from "@/components/app/tokens";\n\n/* Paleta canónica re-exportada: las páginas\n   importan ALMA desde aquí. */\nexport { ALMA };\nconst c = COLOR.ink;\n';
  const sinReexp = transformImports(reexp);
  assert.doesNotMatch(sinReexp, /export \{ ALMA \}/);
  assert.doesNotMatch(sinReexp, /\bALMA\b/);
});

test("imports: un tipo de tono agrega `type ToneInput`", () => {
  const src = 'import { AppShell, ALMA } from "@/components/app/AppShell";\nconst S: Record<string, { tone: ToneInput }> = {};\n';
  assert.match(transformImports(src), /import \{ type ToneInput \} from "@\/design\/tokens";/);
});

test("imports: se suma a un import existente de @/design/tokens", () => {
  const src = 'import { ALMA } from "@/components/app/tokens";\nimport { resolveTone } from "@/design/tokens";\nconst c = COLOR.ink;\n';
  const out = transformImports(src);
  assert.match(out, /import \{ resolveTone, COLOR \} from "@\/design\/tokens";/);
  assert.equal((out.match(/@\/design\/tokens/g) ?? []).length, 1);
});

test("transform completo es idempotente", () => {
  const src = 'import { ALMA } from "@/components/app/tokens";\nconst A = () => <p className="text-alma-berry" style={{ color: ALMA.ink }} />;\n';
  const una = transform(src, "src/pages/client/X.tsx");
  assert.equal(transform(una, "src/pages/client/X.tsx"), una);
  assert.doesNotMatch(una, /ALMA|alma-/);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `node --test scripts/codemod/hive-tokens.test.mjs`
Expected: FAIL — `Cannot find module './hive-tokens.mjs'`.

- [ ] **Step 3: Implementar**

`scripts/codemod/hive-tokens.mjs`:

```js
// Migración de nombres Alma → tokens HIVE (spec §6.2–6.3).
// Uso: node scripts/codemod/hive-tokens.mjs [--dry]
// Se borra en la Tarea 12, cuando las guardias impiden volver atrás.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const zoneOf = (file) => (/(^|\/)src\/(pages|components)\/admin\//.test(file) ? "admin" : "app");

/* ── Clases de Tailwind ─────────────────────────────────────────────── */
const CLASS_BASE = {
  canvas: "canvas", mist: "sunken", oat: "sunken", stone: "ink-muted",
  ink: "ink", "ink-deep": "inverse", hairline: "line", olive: "success",
};
const FILL = new Set(["bg", "from", "via", "to"]);
const CONTROL = new Set(["border", "ring", "outline"]);
const TEXTISH = new Set(["text", "placeholder"]);

export function mapClassColor(prefix, color, zone) {
  if (color === "sandstone") return CONTROL.has(prefix) ? "line-strong" : TEXTISH.has(prefix) ? "ink-muted" : "line";
  if (color === "berry") return FILL.has(prefix) || zone === "admin" ? "ink" : "accent-strong";
  const out = CLASS_BASE[color];
  if (!out) throw new Error(`Color de Alma sin mapeo: ${color}`);
  return out;
}

const CLASS_RE =
  /\b(bg|text|border|ring-offset|ring|outline|divide|from|via|to|fill|stroke|placeholder|shadow|decoration|caret|accent)-alma-(ink-deep|canvas|mist|oat|sandstone|stone|berry|ink|hairline|olive)(?![\w-])/g;

export const transformClasses = (src, zone) =>
  src.replace(CLASS_RE, (_, prefix, color) => `${prefix}-${mapClassColor(prefix, color, zone)}`);

/* ── Referencias ALMA.* en estilos en línea ─────────────────────────── */
const REF_BASE = {
  cream: "canvas", mist: "sunken", blush: "sunken", stone: "inkMuted", coral: "inkMuted",
  ink: "ink", inkDeep: "inverse", border: "line", olive: "success", destructive: "danger",
};

/** Rol del color según la propiedad CSS que lo recibe (mirando hacia atrás en la línea). */
export function roleAt(line, index) {
  const before = line.slice(0, index).replace(/\$\{/g, "  ");
  const cut = Math.max(before.lastIndexOf(","), before.lastIndexOf("{"));
  const m = /^\s*([A-Za-z]+)\s*:/.exec(before.slice(cut + 1));
  const prop = m ? m[1] : "";
  if (/^(background|backgroundColor)$/.test(prop)) return "fill";
  if (/^(border|outline)/.test(prop)) return "control";
  return "text";
}

export function mapRef(key, role, zone) {
  if (key === "berry") return role === "fill" || zone === "admin" ? "ink" : "accentStrong";
  if (key === "sandstone") return role === "fill" ? "line" : role === "control" ? "lineStrong" : "inkMuted";
  const out = REF_BASE[key];
  if (!out) throw new Error(`Clave de ALMA sin mapeo: ${key}`);
  return out;
}

export const transformRefs = (src, zone) =>
  src
    .split("\n")
    .map((line) => line.replace(/\bALMA\.([A-Za-z]+)\b/g, (_, key, idx) => `COLOR.${mapRef(key, roleAt(line, idx), zone)}`))
    .join("\n");

/* ── Tonos pasados por nombre de color ──────────────────────────────── */
const LEGACY_TONE = {
  berry: "accent", olive: "success", destructive: "danger", stone: "muted", coral: "muted",
  sandstone: "muted", blush: "muted", mist: "muted", cream: "muted", border: "muted", ink: "ink", inkDeep: "ink",
};
const toTone = (val) => (LEGACY_TONE[val] && LEGACY_TONE[val] !== val ? LEGACY_TONE[val] : val);

export const transformTones = (src) =>
  src
    .replace(/\b(tone|tint|iconTint)(=|:\s?)"([A-Za-z]+)"/g, (_, attr, sep, val) => `${attr}${sep}"${toTone(val)}"`)
    // Expresiones: tone={cond ? "destructive" : "berry"}, tint={MAP[x] ?? "berry"}
    .replace(/\b(tone|tint|iconTint)=\{([^{}]*)\}/g, (_, attr, expr) =>
      `${attr}={${expr.replace(/"([A-Za-z]+)"/g, (__, val) => `"${toTone(val)}"`)}}`);

/** `keyof typeof ALMA` → `ToneInput`; en un Record<…, keyof typeof ALMA> los valores también son tonos. */
export const transformToneTypes = (src) =>
  src
    .replace(/(Record<string,\s*keyof typeof ALMA>\s*=\s*\{)([^}]*)\}/g, (_, head, body) =>
      `${head}${body.replace(/:\s?"([A-Za-z]+)"/g, (full, val) => full.replace(`"${val}"`, `"${toTone(val)}"`))}}`)
    .replace(/\bkeyof typeof ALMA\b/g, "ToneInput");

/* ── Fuentes y movimiento ───────────────────────────────────────────── */
export const transformFonts = (src) =>
  src
    .replace(/\bfont-display-italic\b/g, "font-display")
    .replace(/\bfont-(bebas|gulfs)\b/g, "font-display")
    .replace(/\bfont-(syne|dm|alilato)\b/g, "font-sans");

export const transformMotion = (src) => src.replace(/--ease-alma-(out|in-out|drawer)\b/g, "--ease-$1");

/* ── Imports ────────────────────────────────────────────────────────── */
const SOURCES = new Set(["@/components/app/tokens", "@/components/app/AppShell", "@/components/auth/AuthShell"]);
const IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*"([^"]+)";?/g;
const DESIGN_IMPORT_RE = /import\s*\{([^}]*)\}\s*from\s*"@\/design\/tokens";?/;

export function transformImports(src) {
  let out = src.replace(IMPORT_RE, (full, names, from) => {
    if (!SOURCES.has(from)) return full;
    const kept = names.split(",").map((n) => n.trim()).filter(Boolean)
      .filter((n) => n !== "ALMA" && n !== "type AlmaTone" && n !== "AlmaTone");
    if (kept.length === names.split(",").map((n) => n.trim()).filter(Boolean).length) return full;
    if (kept.length === 0) return "";
    return names.includes("\n")
      ? `import {\n  ${kept.join(",\n  ")},\n} from "${from}";`
      : `import { ${kept.join(", ")} } from "${from}";`;
  });
  // La reexportación de AppShell/AuthShell, con el comentario que la documenta.
  out = out.replace(/(?:\/\*(?:[^*]|\*(?!\/))*\*\/\n)?[ \t]*export \{ ALMA \};[ \t]*\n/, "");
  out = out.replace(/^\n+/, "");
  out = out.replace(/\bAlmaTone\b/g, "ToneInput");

  const wanted = [];
  if (/\bCOLOR\./.test(out)) wanted.push("COLOR");
  if (/\bToneInput\b/.test(out)) wanted.push("type ToneInput");
  if (wanted.length === 0) return out;

  const existing = DESIGN_IMPORT_RE.exec(out);
  if (existing) {
    const have = existing[1].split(",").map((n) => n.trim()).filter(Boolean);
    const missing = wanted.filter((w) => !have.includes(w));
    if (missing.length === 0) return out;
    return out.replace(DESIGN_IMPORT_RE, `import { ${[...have, ...missing].join(", ")} } from "@/design/tokens";`);
  }
  const imports = [...out.matchAll(/^import\s[\s\S]*?from\s+"[^"]+";?[ \t]*$|^import\s+"[^"]+";?[ \t]*$/gm)];
  const line = `import { ${wanted.join(", ")} } from "@/design/tokens";`;
  if (imports.length === 0) return `${line}\n${out}`;
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  return `${out.slice(0, at)}\n${line}${out.slice(at)}`;
}

/* ── Orquestación ───────────────────────────────────────────────────── */
export function transform(src, file) {
  const zone = zoneOf(file);
  let out = transformToneTypes(src);
  out = transformTones(out);
  out = transformRefs(out, zone);
  out = transformClasses(out, zone);
  out = transformFonts(out);
  out = transformMotion(out);
  out = transformImports(out);
  return out;
}

function main() {
  const dry = process.argv.includes("--dry");
  const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { encoding: "utf8" })
    .split("\n").filter(Boolean)
    .filter((f) => !/\.test\.(ts|tsx)$/.test(f))
    .filter((f) => !f.startsWith("src/design/"))
    .filter((f) => f !== "src/components/app/tokens.ts");
  let changed = 0;
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    const out = transform(src, f);
    if (out !== src) {
      changed++;
      if (!dry) fs.writeFileSync(f, out);
      console.log(`  ${dry ? "(dry) " : ""}${f}`);
    }
  }
  // index.css sólo necesita el cambio de curvas de movimiento.
  const css = fs.readFileSync("src/index.css", "utf8");
  const cssOut = transformMotion(css);
  if (cssOut !== css && !dry) fs.writeFileSync("src/index.css", cssOut);
  console.log(`archivos modificados: ${changed}${cssOut !== css ? " + src/index.css" : ""}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `node --test scripts/codemod/hive-tokens.test.mjs`
Expected: PASS (14 pruebas).

- [ ] **Step 5: Probar en seco sobre el repo**

Run: `node scripts/codemod/hive-tokens.mjs --dry | tail -3`
Expected: sin excepciones; `archivos modificados: N + src/index.css` con N ≈ 67.

- [ ] **Step 6: Commit**

```bash
git add scripts/codemod/
git commit -m "chore(hive): script de migración de nombres Alma → tokens

Funciones puras y probadas: clases alma-* por prefijo (sandstone y berry
dependen de si es relleno, borde o texto, y de si es panel o app), ALMA.*
según la propiedad CSS que lo recibe, tonos por nombre, fuentes, curvas de
movimiento, e imports de una o varias líneas incluidas las reexportaciones
de AppShell y AuthShell. Un color sin mapeo detiene la migración.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Aplicar la migración y borrar el puente

**Files:**
- Modify: todos los que liste el script (≈67 archivos de `src/`), `src/index.css`
- Delete: `src/components/app/tokens.ts`
- Modify: `tailwind.config.ts` (quitar `alma:`), `src/design/tokens.ts` (quitar `LEGACY_TONE`), `src/design/tokens.test.ts`
- Test: `src/design/guards.test.ts`

**Interfaces:**
- Consumes: `transform` (Tarea 4).
- Produces: cero referencias a `ALMA`, `AlmaTone`, clases `alma-*`, fuentes legacy y `--ease-alma-*` en `src/`. `ToneInput` deja de existir: las piezas reciben `Tone`.

- [ ] **Step 1: Escribir las guardias**

`src/design/guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const root = path.resolve(__dirname, "..", "..");

/** Archivos de código de src/, sin pruebas ni el propio módulo de diseño. */
export function sourceFiles(dir = path.join(root, "src")): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p === path.join(root, "src/design")) continue;
      out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.(ts|tsx)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}
const rel = (p: string) => path.relative(root, p);
const offenders = (re: RegExp, files = sourceFiles()) =>
  files.filter((f) => re.test(fs.readFileSync(f, "utf8"))).map(rel);

describe("guardias contra volver a Alma", () => {
  it("no quedan clases de color alma-*", () => {
    expect(offenders(/\b[\w:-]*-alma-(canvas|mist|oat|sandstone|stone|berry|ink|ink-deep|hairline|olive)\b/)).toEqual([]);
  });
  it("no queda el objeto ALMA ni el tipo AlmaTone", () => {
    expect(offenders(/\bALMA\b|\bAlmaTone\b/)).toEqual([]);
  });
  it("no quedan clases de fuentes de Alma", () => {
    expect(offenders(/\bfont-(bebas|gulfs|syne|dm|alilato|display-italic)\b/)).toEqual([]);
  });
  it("no quedan curvas --ease-alma", () => {
    expect(offenders(/--ease-alma-/)).toEqual([]);
    expect(fs.readFileSync(path.join(root, "src/index.css"), "utf8")).not.toMatch(/--ease-alma-/);
  });
  it("el archivo puente ya no existe", () => {
    expect(fs.existsSync(path.join(root, "src/components/app/tokens.ts"))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/design/guards.test.ts`
Expected: FAIL en las cinco pruebas.

- [ ] **Step 3: Correr la migración**

Run: `node scripts/codemod/hive-tokens.mjs | tail -3`
Expected: `archivos modificados: N + src/index.css`.

- [ ] **Step 4: Borrar el puente y los nombres legacy**

Run:

```bash
git rm -q src/components/app/tokens.ts
python3 - <<'PY'
import re
# 1) Tailwind: quitar el bloque alma: { ... }
p = "tailwind.config.ts"; s = open(p).read()
s = re.sub(r'\n\s*/\* PUENTE TEMPORAL.*?\*/\n\s*alma: \{.*?\n\s*\},\n', "\n", s, flags=re.S)
open(p, "w").write(s)
# 2) Tokens: quitar LEGACY_TONE y ToneInput
p = "src/design/tokens.ts"; s = open(p).read()
s = re.sub(r'\n/\*\*\n \* Nombres de color de Alma.*?export type ToneInput = Tone \| LegacyTone;\n', "\n", s, flags=re.S)
s = s.replace("  if (tone && tone in LEGACY_TONE) return TONE_STYLE[LEGACY_TONE[tone as LegacyTone]];\n", "")
open(p, "w").write(s)
PY
# 3) ToneInput → Tone en los consumidores (perl: el sed de macOS no entiende \b)
grep -rl "ToneInput" src | xargs perl -pi -e 's/\bToneInput\b/Tone/g'
# 4) El único comentario que el script no toca
perl -pi -e 's/desde la paleta canónica ALMA/desde los tokens de src\/design\/tokens.ts/' src/pages/legal/LegalLayout.tsx
grep -rnE "LEGACY_TONE|LegacyTone|ToneInput|alma:|(^|[^A-Za-z_])ALMA([^A-Za-z_]|$)" src tailwind.config.ts || echo "✓ sin restos"
```

- [ ] **Step 5: Actualizar la prueba de tonos**

En `src/design/tokens.test.ts`, reemplazar la prueba `"acepta los nombres de Alma mientras dura la migración"` por:

```ts
  it("ya no acepta nombres de Alma: caen al neutro", () => {
    expect(resolveTone("olive")).toBe(TONE_STYLE.muted);
    expect(resolveTone("berry")).toBe(TONE_STYLE.muted);
  });
```

En `src/components/app/tones.test.tsx`, reemplazar la prueba `"acepta todavía nombres de Alma"` por:

```tsx
  it("el tono success pinta el texto en verde", () => {
    wrap(<StatusPill label="Pagado" tone="success" />);
    expect(screen.getByText("Pagado")).toHaveStyle({ color: COLOR.success });
  });
```

- [ ] **Step 6: Tipos, pruebas y build**

Run:

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase
npx vitest run 2>&1 | tail -3
VITE_API_URL=/api npx vite build 2>&1 | tail -2
```

Expected: `tsc` sin salida; todas las pruebas en verde (incluidas las guardias); build `✓ built`. Si `tsc` marca un `ALMA` o un `COLOR` sin importar, el archivo tenía un patrón que el script no cubrió: corregir a mano con la tabla del spec §6.2 y agregar el caso como prueba en `hive-tokens.test.mjs`.

- [ ] **Step 7: Revisar a mano el reparto de `berry` en la app**

Run:

```bash
git diff -U0 -- 'src/pages/client' 'src/components/app' 'src/components/auth' 'src/pages/auth' 'src/pages/legal' 'src/pages/Index.tsx' 'src/components/Schedule.tsx' \
  | grep -E '^\+.*(COLOR\.accentStrong|accent-strong)' | head -80
```

Expected: cada línea es un texto, un ícono, un borde o un enlace. Si alguna es un **relleno grande** (fondo de tarjeta, botón), cambiarla a `COLOR.ink` / `bg-ink` y dejar nota en el commit.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(hive): migrar ~2,600 usos de Alma a tokens y borrar el puente

Aplica el script de la tarea anterior: clases alma-*, ALMA.*, tonos por
nombre, fuentes y curvas de movimiento. Se borra el archivo puente, el
bloque alma: de Tailwind y el mapa de tonos legacy. Las guardias fallan si
cualquiera de esos nombres vuelve a aparecer.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Auditoría de colores escritos a mano

**Files:**
- Create: `src/design/classPalette.ts`
- Modify: `src/pages/admin/classes/palette.ts`
- Modify (hex → token): `src/components/Schedule.tsx`, `src/components/UpdateBanner.tsx`, `src/components/app/AppShell.tsx`, `src/components/app/ResponsivaDialog.tsx`, `src/components/app/SignaturePad.tsx`, `src/components/ui/date-picker.tsx`, `src/components/ui/time-picker.tsx`, `src/components/ui/toast.tsx`, `src/components/ui/toaster.tsx`, `src/pages/Index.tsx`, `src/pages/admin/Dashboard.tsx`, `src/pages/admin/attendance/TodayAttendance.tsx`, `src/pages/admin/bookings/BookingsList.tsx`, `src/pages/admin/memberships/MembershipsList.tsx`, `src/pages/admin/reports/ReportsPage.tsx`, `src/pages/admin/reviews/AdminReviewsDashboard.tsx`, `src/pages/client/BookClasses.tsx`, `src/pages/client/Checkout.tsx`, `src/pages/client/ProfilePreferences.tsx`
- Test: `src/design/guards.test.ts` (agregar guardia)

**Interfaces:**
- Consumes: `COLOR` (Tarea 1).
- Produces: `CLASS_PALETTE`, `DEFAULT_CLASS_COLOR`, `resolveClassColor(raw)` en `src/design/classPalette.ts`; `palette.ts` los reexporta.

**Decisión fuera del spec (a validar en la revisión del plan):** los colores de tipo de clase del calendario se guardan en la base y hoy son tonos terrosos de Alma. Con las reglas aprobadas no pueden ser coral (choca con "coral = atención") ni verde (`success` es sólo confirmación). El plan los deja en **tres neutros** —Tinta, Grafito, Concreto— y todos los colores guardados antes caen a uno de ellos. Los tipos de clase se distinguen además por su nombre, que el calendario ya muestra.

- [ ] **Step 1: Agregar la guardia**

Al final del `describe` de `src/design/guards.test.ts`:

```ts
  it("no hay colores escritos a mano fuera de src/design (spec §3.2 regla 6)", () => {
    // Excepciones justificadas: colores de marcas ajenas que no pueden cambiar.
    const PERMITIDOS: Record<string, "*" | string[]> = {
      "src/lib/wellhubBrand.ts": "*", // identidad oficial de Wellhub
      // Botones oficiales "Add to Apple/Google Wallet": sus colores son de la marca.
      "src/pages/client/Wallet.tsx": ["#000000", "#FFFFFF", "#4285F4", "#EA4335", "#FBBC05", "#34A853"],
    };
    const malos: string[] = [];
    for (const f of sourceFiles()) {
      const r = rel(f);
      const permitido = PERMITIDOS[r];
      if (permitido === "*") continue;
      const hexes = (fs.readFileSync(f, "utf8").match(/#[0-9A-Fa-f]{6}\b/g) ?? []).map((h) => h.toUpperCase());
      const sobran = hexes.filter((h) => !(permitido ?? []).includes(h));
      if (sobran.length) malos.push(`${r}: ${[...new Set(sobran)].join(" ")}`);
    }
    expect(malos).toEqual([]);
  });
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/design/guards.test.ts -t "colores escritos a mano"`
Expected: FAIL, con la lista de ~19 archivos.

- [ ] **Step 3: Paleta de tipos de clase**

`src/design/classPalette.ts`:

```ts
// Colores de tipo de clase del calendario del panel. Se guardan en la base
// (class_types.color). Neutros a propósito: coral es "atención" en el panel y
// verde es sólo "confirmación" (spec §3.2). El nombre del tipo ya lo distingue.
import { COLOR } from "./tokens";

export const CLASS_PALETTE = [
  { label: "Tinta", value: COLOR.ink },
  { label: "Grafito", value: COLOR.inkMuted },
  { label: "Concreto", value: COLOR.lineStrong },
] as const;

export const DEFAULT_CLASS_COLOR = COLOR.inkMuted;

/* Colores guardados por versiones anteriores (Alma y el negocio previo). */
const LEGACY_COLOR_MAP: Record<string, string> = {
  "#cbb9a4": COLOR.lineStrong, // Arena
  "#a48d78": COLOR.lineStrong, // Taupe
  "#6e5a46": COLOR.inkMuted,   // Espresso
  "#5f6b4a": COLOR.inkMuted,   // Oliva
  "#43392f": COLOR.ink,        // Tinta
  "#e6dac8": COLOR.lineStrong, // Avena
  "#8a6e60": COLOR.inkMuted,
  "#c7a892": COLOR.lineStrong,
  "#8b5cf6": COLOR.inkMuted,
  "#c026d3": COLOR.inkMuted,
  "#3b82f6": COLOR.ink,
  "#10b981": COLOR.inkMuted,
  "#f97316": COLOR.lineStrong,
};

export function resolveClassColor(raw?: string | null): string {
  if (!raw) return DEFAULT_CLASS_COLOR;
  const key = raw.trim().toLowerCase();
  const inSet = CLASS_PALETTE.find((c) => c.value.toLowerCase() === key);
  if (inSet) return inSet.value;
  if (LEGACY_COLOR_MAP[key]) return LEGACY_COLOR_MAP[key];
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return CLASS_PALETTE[Math.abs(hash) % CLASS_PALETTE.length].value;
}
```

En `src/pages/admin/classes/palette.ts`, reemplazar desde el comentario inicial hasta el final de `resolveClassColor` (incluido `LEGACY_COLOR_MAP`) por:

```ts
// La paleta vive en src/design/classPalette.ts (spec §3.2 regla 6).
export { CLASS_PALETTE, DEFAULT_CLASS_COLOR, resolveClassColor } from "@/design/classPalette";
```

- [ ] **Step 4: Reemplazar el resto con la tabla**

En cada archivo de la lista, sustituir cada hex según su **uso**:

| Hex | Relleno de fondo | Borde | Texto o ícono |
|---|---|---|---|
| `#FAF9F6` `#FAF7F1` | `COLOR.canvas` | `COLOR.line` | `COLOR.canvas` |
| `#F4F1EA` `#F6EDDF` `#E6DAC8` | `COLOR.sunken` | `COLOR.line` | `COLOR.inkMuted` |
| `#E0D5C6` `#CBB9A4` | `COLOR.line` | `COLOR.line` (decorativo) / `COLOR.lineStrong` (campo) | `COLOR.inkMuted` |
| `#C0A688` `#A48D78` `#9C8E72` | `COLOR.ink` (seleccionado) / `COLOR.sunken` (hover) | `COLOR.lineStrong` | `COLOR.inkMuted` |
| `#6E5A46` | `COLOR.ink` | `COLOR.lineStrong` | panel: `COLOR.ink` · app: `COLOR.accentStrong` |
| `#43392F` `#1A1A1A` `#0F0518` `#241B1A` `#1A1410` `#1A1525` | `COLOR.inverse` | `COLOR.ink` | `COLOR.ink` |
| `#5F6B4A` `#5E643E` | `COLOR.success` | `COLOR.success` | `COLOR.success` |
| `#B23A48` | `COLOR.danger` | `COLOR.danger` | `COLOR.danger` |
| `#C9A227` `#A07A10` (avisos) | `COLOR.accent` con texto `COLOR.onAccent` | `COLOR.accent` | `COLOR.accentStrong` |
| `#FFFFFF` (firma y responsiva) | `COLOR.surface` | — | — |

En archivos `.ts`/`.tsx` usar `COLOR.x` (importar `import { COLOR } from "@/design/tokens";` si falta). Dentro de un `className` de Tailwind usar la clase del token (`bg-sunken`, `border-line`, …) en lugar de `bg-[#…]`.

Run para verificar lo que falta: `npx vitest run src/design/guards.test.ts -t "colores escritos a mano"` — repetir hasta que pase.

- [ ] **Step 5: Tipos, pruebas y build**

Run: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; npx vitest run 2>&1 | tail -3; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: `tsc` vacío, todo en verde, build ok.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(hive): cero colores escritos a mano fuera de src/design

Los 108 hex sueltos pasan a tokens según su uso (relleno, borde o texto).
Sólo quedan permitidos los colores de marcas ajenas: Wellhub y los botones
oficiales de Apple y Google Wallet. La paleta de tipos de clase pasa a tres
neutros: coral es atención en el panel y verde sólo confirmación.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Logo provisional e imágenes generadas

**Files:**
- Create: `src/assets/brand/hive-mark.svg`
- Create: `src/components/brand/BrandLogo.tsx`
- Test: `src/components/brand/BrandLogo.test.tsx`
- Create: `scripts/brand-assets.mjs`
- Test: `scripts/brand-assets.test.mjs`
- Modify (regeneradas): `public/favicon-16.png`, `public/favicon-32.png`, `public/apple-touch-icon.png`, `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `public/email-logo.png`, `public/alma-mark-light.png`, `public/wallet-logo{,@2x,@3x}.png`, `public/wallet-logo-black{,@2x,@3x}.png`, `public/wallet-icon-{pilates,jumping,mixto,event}{,@2x,@3x}.png`
- Modify: `package.json` (script `brand:assets`)
- Modify: `src/components/app/AppShell.tsx`, `src/components/admin/AdminLayout.tsx`, `src/components/auth/AuthShell.tsx` (logo)

**Interfaces:**
- Consumes: `COLOR` (Tarea 1).
- Produces: `BrandLogo({ variant?: "mark" | "lockup"; className?: string; title?: string; size?: number })`; `generate(outDir: string): Promise<string[]>` en `scripts/brand-assets.mjs`; `npm run brand:assets`.

Los archivos de `public/` **conservan su nombre**: el servidor los lee por nombre y el backend está fuera de alcance (renombrarlos es del sub-proyecto 4).

- [ ] **Step 1: Escribir las pruebas**

`src/components/brand/BrandLogo.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("el símbolo tiene nombre accesible", () => {
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "HIVE Pilates Studio" })).toBeInTheDocument();
  });
  it("hereda el color del texto (un solo color, siempre)", () => {
    const { container } = render(<BrandLogo />);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("currentColor");
  });
  it("dos logos en la misma pantalla no comparten máscara", () => {
    const { container } = render(<><BrandLogo /><BrandLogo /></>);
    const ids = [...container.querySelectorAll("mask")].map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("el logo completo dice HIVE y PILATES STUDIO", () => {
    render(<BrandLogo variant="lockup" />);
    expect(screen.getByText("HIVE")).toBeInTheDocument();
    expect(screen.getByText("PILATES STUDIO")).toBeInTheDocument();
  });
});
```

`scripts/brand-assets.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { generate, TARGETS } from "./brand-assets.mjs";

test("genera cada imagen con su nombre y su tamaño", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  const escritos = await generate(dir);
  assert.equal(escritos.length, TARGETS.length);
  for (const t of TARGETS) {
    const meta = await sharp(path.join(dir, t.file)).metadata();
    assert.equal(meta.width, t.size, t.file);
    assert.equal(meta.height, t.size, t.file);
  }
});

test("el ícono de la app es coral en la esquina y negro en el centro", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  await generate(dir);
  const { data, info } = await sharp(path.join(dir, "icon-512.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  assert.deepEqual(px(4, 4), [0xfa, 0x93, 0x6a]);   // coral
  // Parte alta del hexágono, a la derecha del eje (el eje central es un corte).
  const [r, g, b] = px(286, 150);
  assert.ok(r < 40 && g < 40 && b < 40, `el hexágono no es negro: ${[r, g, b]}`);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run src/components/brand/BrandLogo.test.tsx; node --test scripts/brand-assets.test.mjs`
Expected: ambos FAIL por módulos inexistentes.

- [ ] **Step 3: El SVG**

`src/assets/brand/hive-mark.svg` — copiar `docs/superpowers/specs/assets/hive-mark-provisional.svg` tal cual:

```bash
mkdir -p src/assets/brand
cp docs/superpowers/specs/assets/hive-mark-provisional.svg src/assets/brand/hive-mark.svg
```

- [ ] **Step 4: El componente**

`src/components/brand/BrandLogo.tsx`:

```tsx
import { useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Símbolo de HIVE — PROVISIONAL (spec §5).
 * Trazado a partir del Instagram @hive.pilates (sep 2026). Cuando llegue el
 * logo oficial, reemplazar estos trazos y src/assets/brand/hive-mark.svg,
 * y correr `npm run brand:assets` para regenerar favicon, íconos y pase.
 */
const HEX = "50,0 100,28.87 100,86.6 50,115.47 0,86.6 0,28.87";
const SPOKES: [number, number, number, number][] = [
  [50, -2, 50, 23.8], [50, 117.5, 50, 91.6],
  [-2, 27.7, 18.5, 39.55], [102, 27.7, 81.5, 39.55],
  [-2, 87.8, 29.4, 70.9], [102, 87.8, 70.6, 70.9],
];
const CUTS = [
  "M34.5,37 C34.5,29 41.5,23.8 50,23.8 C58.5,23.8 65.5,29 65.5,37 Z",
  "M47.5,41.6 L27,41.6 C20.5,41.6 16.6,46.6 16.9,52.6 C17.2,59.4 22.2,65 29,65.2 C34.4,64.9 39.8,61.6 43.6,56.6 C45.9,53.6 47.5,50.4 47.5,47 Z",
  "M52.5,41.6 L73,41.6 C79.5,41.6 83.4,46.6 83.1,52.6 C82.8,59.4 77.8,65 71,65.2 C65.6,64.9 60.2,61.6 56.4,56.6 C54.1,53.6 52.5,50.4 52.5,47 Z",
  "M50,55.3 C52.5,59.5 57,63.2 62.6,65.7 C66.4,67.4 68.4,70.2 68.2,73.4 C68,75.2 67.6,76.8 67,78 L33,78 C32.4,76.8 32,75.2 31.8,73.4 C31.6,70.2 33.6,67.4 37.4,65.7 C43,63.2 47.5,59.5 50,55.3 Z",
  "M34,81.6 L66,81.6 C66,87.2 58.8,91.8 50,91.8 C41.2,91.8 34,87.2 34,81.6 Z",
];

type BrandLogoProps = {
  variant?: "mark" | "lockup";
  className?: string;
  title?: string;
  /** Alto del símbolo en px (el ancho se ajusta solo). */
  size?: number;
};

export function BrandLogo({ variant = "mark", className, title = "HIVE Pilates Studio", size = 40 }: BrandLogoProps) {
  const maskId = `hive-mark-${useId().replace(/[:]/g, "")}`;
  const mark = (
    <svg
      viewBox="-1 -1 102 117.47"
      height={size}
      width={Math.round(size * (102 / 117.47))}
      role={variant === "mark" ? "img" : undefined}
      aria-label={variant === "mark" ? title : undefined}
      aria-hidden={variant === "lockup" ? true : undefined}
      className="shrink-0"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-1" y="-1" width="102" height="117.47">
          <polygon points={HEX} fill="#fff" />
          <g stroke="#000" strokeWidth={3.2}>
            {SPOKES.map(([x1, y1, x2, y2]) => <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
          </g>
          <g fill="#000">{CUTS.map((d) => <path key={d.slice(0, 12)} d={d} />)}</g>
        </mask>
      </defs>
      <rect x="-1" y="-1" width="102" height="117.47" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );

  if (variant === "mark") return <span className={cn("inline-flex", className)}>{mark}</span>;

  return (
    <span role="img" aria-label={title} className={cn("inline-flex items-center gap-3", className)}>
      {mark}
      <span className="flex flex-col leading-none">
        <span className="font-display font-extrabold tracking-[0.04em]" style={{ fontSize: size * 0.62 }}>HIVE</span>
        <span className="font-bold tracking-[0.42em] mt-1.5" style={{ fontSize: Math.max(9, size * 0.17) }}>PILATES STUDIO</span>
      </span>
    </span>
  );
}
```

- [ ] **Step 5: El generador**

`scripts/brand-assets.mjs`:

```js
// Genera favicon, íconos de la app, logo de correo y logos del pase de wallet
// desde el SVG provisional (spec §5). Uso: npm run brand:assets
// Los nombres de archivo se conservan: el servidor los lee por nombre.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { COLOR } from "../src/design/tokens.ts";

const svgPath = new URL("../src/assets/brand/hive-mark.svg", import.meta.url);

/** fg: color del símbolo · bg: fondo (null = transparente) · pad: margen relativo. */
export const TARGETS = [
  { file: "favicon-16.png", size: 16, fg: COLOR.ink, bg: COLOR.accent, pad: 0.1 },
  { file: "favicon-32.png", size: 32, fg: COLOR.ink, bg: COLOR.accent, pad: 0.12 },
  { file: "apple-touch-icon.png", size: 180, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-192.png", size: 192, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-512.png", size: 512, fg: COLOR.ink, bg: COLOR.accent, pad: 0.18 },
  { file: "icon-maskable-512.png", size: 512, fg: COLOR.ink, bg: COLOR.accent, pad: 0.28 },
  { file: "email-logo.png", size: 240, fg: COLOR.ink, bg: null, pad: 0.06 },
  { file: "alma-mark-light.png", size: 512, fg: COLOR.accent, bg: null, pad: 0.06 }, // "light" = para fondos oscuros
  ...[1, 2, 3].flatMap((k) => [
    { file: `wallet-logo${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: COLOR.ink, bg: COLOR.canvas, pad: 0.14 },
    { file: `wallet-logo-black${k > 1 ? `@${k}x` : ""}.png`, size: 220 * k, fg: COLOR.accent, bg: COLOR.inverse, pad: 0.14 },
    ...["pilates", "jumping", "mixto", "event"].map((cat) => ({
      file: `wallet-icon-${cat}${k > 1 ? `@${k}x` : ""}.png`, size: 29 * k, fg: COLOR.ink, bg: COLOR.accent, pad: 0.12,
    })),
  ]),
];

async function render({ size, fg, bg, pad }) {
  const svg = fs.readFileSync(svgPath, "utf8").replace(/currentColor/g, fg);
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(Buffer.from(svg), { density: 384 })
    .resize({ height: inner, width: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const base = sharp({
    create: {
      width: size, height: size, channels: 4,
      background: bg ? { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return base.composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}

export async function generate(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const t of TARGETS) {
    fs.writeFileSync(path.join(outDir, t.file), await render(t));
    written.push(t.file);
  }
  return written;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = path.resolve(new URL("..", import.meta.url).pathname, "public");
  generate(out).then((f) => console.log(`✓ ${f.length} imágenes en public/`));
}
```

En `package.json`, dentro de `"scripts"`:
- agregar `"brand:assets": "node scripts/brand-assets.mjs"`;
- agregar `"test:scripts": "node --test \"scripts/*.test.mjs\""`;
- cambiar `"test"` a `"vitest run && npm run test:server && npm run test:scripts"`, para que la prueba del generador corra con el resto.

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run src/components/brand/BrandLogo.test.tsx && node --test scripts/brand-assets.test.mjs`
Expected: ambos PASS. (Node 22.6+ importa `tokens.ts` directamente; el entorno usa Node 25.)

- [ ] **Step 7: Regenerar `public/` y verlas**

Run: `npm run brand:assets`
Expected: `✓ 26 imágenes en public/`. Abrir `public/icon-512.png`, `public/wallet-logo-black@2x.png` y `public/email-logo.png` y confirmar que se ve el hexágono con la abeja, nítido, sin recortes.

- [ ] **Step 8: Poner el logo en la app y el panel**

En `src/components/app/AppShell.tsx`:
- Quitar `import almaMark from "@/assets/alma/alma-mark.png";` y agregar `import { BrandLogo } from "@/components/brand/BrandLogo";`.
- Sidebar: reemplazar `<img src={almaMark} alt="Alma Movement" className="h-12 w-auto object-contain" />` por `<BrandLogo variant="lockup" size={40} />`.
- Barra superior móvil: reemplazar `<img src={almaMark} alt="Alma Movement" className="h-10 w-auto object-contain" />` por `<BrandLogo size={34} />`.

En `src/components/admin/AdminLayout.tsx`:
- Quitar `import almaMark from "@/assets/alma/alma-mark-ink.png";` y agregar `import { BrandLogo } from "@/components/brand/BrandLogo";`.
- Reemplazar `<img src={almaMark} alt="Alma Movement" className="h-12 w-auto object-contain" />` por `<BrandLogo variant="lockup" size={36} />`.

En `src/components/auth/AuthShell.tsx` (acceso: login, registro, recuperar contraseña; el bloque de marca va sobre `inverse`):
- Quitar `import almaMarkLight from "@/assets/alma/alma-mark-light.png";` y agregar `import { BrandLogo } from "@/components/brand/BrandLogo";`.
- La marca de agua: reemplazar `<img src={almaMarkLight} alt="" aria-hidden className="pointer-events-none absolute -right-24 -bottom-24 w-[78%] max-w-[480px] opacity-[0.08]" />` por:

```tsx
<span aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 opacity-[0.08] text-inverse-foreground">
  <BrandLogo size={480} />
</span>
```

- El logo del enlace: reemplazar `<img src={almaMarkLight} alt="Alma Movement" className="h-16 sm:h-20 w-auto object-contain" />` por `<BrandLogo variant="lockup" size={56} className="text-inverse-foreground" />`.

`src/pages/Index.tsx` (la landing) sigue con las imágenes de `src/assets/alma/`: la landing es del sub-proyecto 4.

Run: `grep -rn "almaMark" src/components || echo "✓"; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; npx vitest run 2>&1 | tail -3`
Expected: `✓`, `tsc` vacío, todo en verde.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(hive): logo provisional en SVG e imágenes generadas desde él

BrandLogo dibuja el hexágono con abeja en un solo color (currentColor), con
máscara única por instancia. Un script genera desde el mismo SVG favicon,
íconos de la app, logo de correo y logos del pase; los archivos conservan su
nombre porque el servidor los lee así. Marcado como provisional en el SVG y
en el componente.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Piezas de la app de clienta

**Files:**
- Modify: `src/components/app/AppShell.tsx` — `AppShell` (navegación), `PageHeader`, `Section`, `ListGroup`, `EmptyState`, `PrimaryButton`, `GhostButton`, `SkeletonRow`, `ErrorState`
- Modify: `src/components/app/widgets.tsx` — `SegmentedTabs`, `BackLink`, `DataRow`, `Stepper`, `StickyCta`
- Test: `src/components/app/pieces.test.tsx`

**Interfaces:**
- Consumes: `COLOR`, `BrandLogo`.
- Produces: `PrimaryButton` gana la prop opcional `variant?: "primary" | "accent"` (default `"primary"`). El resto de las props no cambia.

- [ ] **Step 1: Escribir la prueba**

`src/components/app/pieces.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, PageHeader, PrimaryButton, GhostButton, EmptyState, ErrorState, ListGroup, ListRow } from "./AppShell";
import { SegmentedTabs } from "./widgets";
import { COLOR } from "@/design/tokens";

const wrap = (ui: React.ReactNode, route = "/app") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("PageHeader", () => {
  it("es un bloque coral con texto negro (nunca claro sobre coral)", () => {
    wrap(<PageHeader title="Reserva tu clase" />);
    const bloque = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(bloque).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
  it("el titular escala y puede partir línea a 390 px", () => {
    wrap(<PageHeader title="Notificaciones" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.style.fontSize).toMatch(/^clamp\(/);
    expect(h1.className).toMatch(/break-words/);
  });
});

describe("botones", () => {
  it("primary: negro con texto claro", () => {
    wrap(<PrimaryButton>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ })).toHaveStyle({ backgroundColor: COLOR.ink, color: COLOR.canvas });
  });
  it("accent: coral con texto negro", () => {
    wrap(<PrimaryButton variant="accent">Comprar paquete</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Comprar/ })).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
  it("deshabilitado: fondo sunken y texto lineStrong (spec §4.1)", () => {
    wrap(<PrimaryButton disabled>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ })).toHaveStyle({ backgroundColor: COLOR.sunken, color: COLOR.lineStrong });
  });
  it("todos miden al menos 44 px de alto", () => {
    wrap(<><PrimaryButton size="sm">A</PrimaryButton><GhostButton>B</GhostButton></>);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });
});

describe("otras piezas", () => {
  it("SegmentedTabs: la pestaña activa va en negro", () => {
    wrap(<SegmentedTabs options={[{ value: "a", label: "Próximas" }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />);
    const activa = screen.getByRole("tab", { selected: true });
    expect(activa).toHaveStyle({ backgroundColor: COLOR.ink, color: COLOR.canvas });
  });
  it("ListGroup es una tarjeta blanca", () => {
    const { container } = wrap(<ListGroup><ListRow title="Uno" /></ListGroup>);
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: COLOR.surface });
  });
  it("EmptyState muestra su acción", () => {
    wrap(<EmptyState title="Aún no tienes clases" ctaLabel="Reservar" ctaTo="/app/classes" />);
    expect(screen.getByText("Aún no tienes clases")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/app/classes");
  });
  it("ErrorState es un alert y reintenta", () => {
    const retry = vi.fn();
    wrap(<ErrorState onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("AppShell", () => {
  it("la pestaña activa de la barra inferior lleva el ícono sobre coral", () => {
    wrap(<AppShell hideGreeting><p>contenido</p></AppShell>, "/app/classes");
    const activa = screen.getAllByRole("link", { current: "page" }).find((a) => a.textContent?.includes("Reservar") && a.closest("nav[data-bottom-nav]"))!;
    expect(activa.querySelector("[data-nav-icon]")).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/components/app/pieces.test.tsx`
Expected: FAIL — `PageHeader` no es un `<header>` coral, `PrimaryButton` no tiene `variant`, falta `data-bottom-nav`.

- [ ] **Step 3: `PageHeader`, `Section`, `ListGroup`**

En `src/components/app/AppShell.tsx`, reemplazar los tres bloques completos por:

```tsx
/* ── PageHeader ── la firma de la app: un bloque coral por pantalla (spec §4.3).
   En móvil llega a los bordes (cancela el padding de <main>) con las esquinas
   inferiores redondeadas; en escritorio es una tarjeta. */
type PageHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  titleAccent?: string;
  subtitle?: string;
  actions?: ReactNode;
};
export const PageHeader = ({ eyebrow, title, titleAccent, subtitle, actions }: PageHeaderProps) => (
  <header
    className="-mx-5 sm:-mx-7 -mt-4 lg:mx-0 lg:mt-0 mb-7 lg:mb-10 rounded-b-[22px] lg:rounded-[22px] px-5 sm:px-7 lg:px-8 py-6 lg:py-8"
    style={{ backgroundColor: COLOR.accent, color: COLOR.onAccent }}
  >
    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="text-[0.75rem] font-bold uppercase tracking-[0.14em]">{eyebrow}</p>}
        <h1
          lang="es"
          className={"font-display font-extrabold uppercase leading-[1.02] tracking-[-0.01em] break-words hyphens-auto " + (eyebrow ? "mt-2" : "")}
          style={{ fontSize: "clamp(1.5rem, 7.2vw, 1.75rem)" /* display-l: 28 px desde 390 px */ }}
        >
          {title}
          {titleAccent && (
            <span className="block mt-1 font-semibold normal-case tracking-normal" style={{ fontSize: "0.62em" }}>
              {titleAccent}
            </span>
          )}
        </h1>
        {subtitle && <p className="mt-2 text-[0.95rem] font-semibold leading-[1.5] max-w-[60ch]">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
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
      <div className="flex items-end justify-between gap-3 pb-3 mb-4" style={{ borderBottom: `1px solid ${COLOR.line}` }}>
        {title && (
          <h2 className="font-sans text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: COLOR.inkMuted }}>
            {title}
          </h2>
        )}
        {trailing && <div className="text-[0.8125rem]">{trailing}</div>}
      </div>
    )}
    {children}
  </section>
);
```

```tsx
/* ── ListGroup ── tarjeta blanca que agrupa ListRows */
export const ListGroup = ({ children }: { children: ReactNode }) => (
  <div
    className="rounded-2xl overflow-hidden [&>*:first-child]:!border-t-0"
    style={{ backgroundColor: COLOR.surface, boxShadow: `inset 0 0 0 1px ${COLOR.line}` }}
  >
    {children}
  </div>
);
```

- [ ] **Step 4: `EmptyState`, botones, `SkeletonRow`, `ErrorState`**

Reemplazar los bloques completos por:

```tsx
/* ── Hexágono de marca para estados (spec §4.6) ── */
const HEX_CLIP = "polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)";

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
    <span
      aria-hidden="true"
      className="grid h-12 w-[52px] place-items-center"
      style={{ backgroundColor: COLOR.accentSoft, color: COLOR.accentStrong, clipPath: HEX_CLIP }}
    >
      {icon}
    </span>
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight" style={{ color: COLOR.ink }}>{title}</h3>
      {description && (
        <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch]" style={{ color: COLOR.inkMuted }}>
          {description}
        </p>
      )}
    </div>
    {ctaLabel && (ctaTo ? <PrimaryButton to={ctaTo}>{ctaLabel}</PrimaryButton> : <PrimaryButton onClick={onCta}>{ctaLabel}</PrimaryButton>)}
  </div>
);

/* ── Botones ── primary negro en todas partes; accent coral sólo para la
   acción que genera ingreso, una por pantalla y nunca dentro de un bloque
   coral (spec §4.1). Todos ≥44 px. */
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
  const className = `group inline-flex items-center justify-center gap-2 rounded-full font-bold no-underline transition-transform motion-safe:hover:-translate-y-px disabled:translate-y-0 ${sizeClass} ${extra ?? ""}`;
  // Deshabilitado (spec §4.1): fondo sunken, texto lineStrong. Cargando conserva su color.
  const style = disabled && !loading
    ? { backgroundColor: COLOR.sunken, color: COLOR.lineStrong }
    : variant === "accent"
      ? { backgroundColor: COLOR.accent, color: COLOR.onAccent }
      : { backgroundColor: COLOR.ink, color: COLOR.canvas };
  const inner = loading ? <>{loadingLabel ?? "Cargando…"}</> : (
    <>
      {children}
      <ArrowRight size={15} className="transition-transform motion-safe:group-hover:translate-x-0.5" />
    </>
  );
  if (to) return <Link to={to} data-press className={className} style={style} onClick={onClick}>{inner}</Link>;
  return (
    <button type={type} data-press className={className} style={style} onClick={onClick} disabled={disabled || loading}>
      {inner}
    </button>
  );
};

export const GhostButton = ({ children, to, onClick, disabled, type = "button", className: extra }: CommonBtnProps) => {
  const className = `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-[0.85rem] font-bold no-underline transition-colors hover:bg-sunken ${extra ?? ""}`;
  const style = { boxShadow: `inset 0 0 0 1.5px ${COLOR.lineStrong}`, color: COLOR.ink, backgroundColor: COLOR.surface };
  if (to) return <Link to={to} data-press className={className} style={style} onClick={onClick}>{children}</Link>;
  return <button type={type} data-press className={className} style={style} onClick={onClick} disabled={disabled}>{children}</button>;
};
```

```tsx
/* ── SkeletonRow ── visible sobre canvas y sobre surface */
export const SkeletonRow = ({ height = 64 }: { height?: number }) => (
  <div aria-hidden="true" className="rounded-2xl overflow-hidden relative" style={{ backgroundColor: COLOR.line, height }}>
    <span className="absolute inset-0 motion-safe:animate-pulse" style={{ backgroundColor: COLOR.sunken }} />
  </div>
);

/* ── ErrorState ── honesto, con reintento (spec §4.6) */
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
    <span aria-hidden="true" className="grid h-12 w-[52px] place-items-center" style={{ backgroundColor: COLOR.sunken, color: COLOR.danger, clipPath: HEX_CLIP }}>
      <AlertCircle size={20} strokeWidth={1.8} />
    </span>
    <div>
      <h3 className="font-display font-extrabold uppercase text-[1.25rem] leading-tight" style={{ color: COLOR.ink }}>{title}</h3>
      <p className="mt-2 text-[0.95rem] leading-[1.6] max-w-[44ch]" style={{ color: COLOR.inkMuted }}>{description}</p>
    </div>
    {onRetry && <GhostButton onClick={onRetry}>{retryLabel}</GhostButton>}
  </div>
);
```

- [ ] **Step 5: Navegación del `AppShell`**

En `src/components/app/AppShell.tsx`, dentro de `AppShell`:

1. El `<aside>` del escritorio: `style={{ borderRight: \`1px solid ${COLOR.line}\`, backgroundColor: COLOR.surface }}`.
2. Cada `Link` del `NAV` de escritorio: `style={{ backgroundColor: active ? COLOR.accentSoft : "transparent", color: COLOR.ink, fontWeight: active ? 700 : 500 }}` y el `ChevronRight` activo con `style={{ color: COLOR.accentStrong }}`.
3. Las dos burbujas de no leídas (escritorio y móvil): `style={{ backgroundColor: COLOR.accent, color: COLOR.onAccent }}`.
4. Los dos avatares con iniciales: `style={{ backgroundColor: COLOR.ink, color: COLOR.canvas }}`.
5. La barra superior móvil: `style={{ backgroundColor: COLOR.surface, borderBottom: \`1px solid ${COLOR.line}\` }}`.
6. La barra inferior: agregar `data-bottom-nav` al `<nav>` y `style={{ backgroundColor: COLOR.surface, borderTop: \`1px solid ${COLOR.line}\`, paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))", paddingTop: "0.5rem" }}`. En cada ítem, el `<span>` del ícono:

```tsx
<span
  data-nav-icon
  className="grid h-9 w-11 place-items-center rounded-full transition-colors"
  style={{ backgroundColor: active ? COLOR.accent : "transparent", color: active ? COLOR.onAccent : COLOR.inkMuted }}
>
  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
</span>
<span className="text-[0.75rem]" style={{ color: active ? COLOR.ink : COLOR.inkMuted, fontWeight: active ? 700 : 500 }}>
  {item.label}
</span>
```

- [ ] **Step 6: Piezas de `widgets.tsx`**

Reemplazar `SegmentedTabs`, `BackLink`, `DataRow` (sólo su JSX de retorno), `Stepper` y `StickyCta` por:

```tsx
export function SegmentedTabs<T extends string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" className="inline-flex gap-1 p-1 rounded-full" style={{ backgroundColor: COLOR.surface, boxShadow: `inset 0 0 0 1px ${COLOR.line}` }}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[0.85rem] font-bold transition-colors"
            style={{ backgroundColor: active ? COLOR.ink : "transparent", color: active ? COLOR.canvas : COLOR.inkMuted }}
          >
            {opt.label}
            {typeof opt.count === "number" && <span className="nums text-[0.75rem]">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export const BackLink = ({ to, label }: BackLinkProps) => (
  <Link to={to} className="inline-flex min-h-[44px] items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] no-underline mb-4" style={{ color: COLOR.inkMuted }}>
    <ArrowLeft size={14} />
    {label}
  </Link>
);
```

En `DataRow`, cambiar el `return` por:

```tsx
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3" style={{ borderTop: `1px solid ${COLOR.line}` }}>
      <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: COLOR.inkMuted }}>{label}</span>
      <div className="flex items-center gap-2 justify-end">
        <span className={"text-right " + (mono ? "font-mono text-[0.92rem]" : "nums text-[0.95rem] font-semibold")} style={{ color: COLOR.ink }}>
          {value}
        </span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copiado" : "Copiar"}
            className="grid h-11 w-11 place-items-center rounded-full bg-transparent border-0 cursor-pointer"
            style={{ color: copied ? COLOR.success : COLOR.accentStrong }}
          >
            {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
```

```tsx
export function Stepper<T extends string>({ steps, current }: StepperProps<T>) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <ol className="flex items-center gap-2 list-none m-0 p-0 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span
              className="grid h-7 w-7 place-items-center rounded-full text-[0.75rem] font-bold nums"
              style={{
                backgroundColor: active ? COLOR.ink : done ? COLOR.surface : "transparent",
                color: active ? COLOR.canvas : done ? COLOR.success : COLOR.inkMuted,
                boxShadow: active ? "none" : `inset 0 0 0 1px ${COLOR.line}`,
              }}
            >
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: active ? COLOR.ink : COLOR.inkMuted }}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="hidden sm:inline-block h-px w-6 ml-1" style={{ backgroundColor: done ? COLOR.success : COLOR.line }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

En `StickyCta`, cambiar el `style` del contenedor interior por:

```tsx
        style={{
          backgroundColor: stuck ? COLOR.surface : "transparent",
          border: stuck ? `1px solid ${COLOR.line}` : "0",
          boxShadow: stuck ? "0 8px 24px rgba(17,17,17,0.08)" : "none",
        }}
```

- [ ] **Step 7: Pruebas, tipos y build**

Run: `npx vitest run 2>&1 | tail -3; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde (incluidas `pieces` y `tones`), `tsc` vacío, build ok.

- [ ] **Step 8: Commit**

```bash
git add src/components/app/
git commit -m "feat(hive): piezas de la app de clienta con el sistema HIVE

PageHeader pasa a ser el bloque coral firma de la app, con titular que
escala y parte línea a 390 px. Botón principal negro y variante coral sólo
para la acción que genera ingreso; todos ≥44 px. Barra inferior blanca con
la pestaña activa sobre coral; días y pestañas activas en negro. Estados
vacío y error con el hexágono de marca.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Campos de formulario

**Files:**
- Modify: `src/components/app/fields.tsx` — `CONTROL`, `controlStyle`, `FieldError`, `FieldShell`
- Test: `src/components/app/fields.test.tsx`

**Interfaces:**
- Consumes: `COLOR`.
- Produces: mismas exportaciones y props (`Field`, `SelectField`, `TextAreaField`, `PasswordField`, `PasswordRules`, `FieldError`).

- [ ] **Step 1: Escribir la prueba**

`src/components/app/fields.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "./fields";
import { COLOR } from "@/design/tokens";

describe("campos", () => {
  it("fondo blanco, borde que pasa 3:1 y alto de 48 px", () => {
    render(<Field label="Nombre" />);
    const input = screen.getByLabelText("Nombre");
    expect(input).toHaveStyle({ backgroundColor: COLOR.surface, minHeight: "48px" });
    expect(input.style.border).toContain("1.5px");
    expect(input).toHaveStyle({ borderColor: COLOR.lineStrong });
  });
  it("con error: borde y mensaje en danger", () => {
    render(<Field label="Correo" error="Falta el dominio del correo." />);
    expect(screen.getByLabelText("Correo")).toHaveStyle({ borderColor: COLOR.danger });
    expect(screen.getByText("Falta el dominio del correo.")).toHaveStyle({ color: COLOR.danger });
  });
  it("el foco es negro con halo coral suave", () => {
    render(<Field label="Teléfono" />);
    expect(screen.getByLabelText("Teléfono").className).toMatch(/focus-visible:ring-ink/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/components/app/fields.test.tsx`
Expected: FAIL — el fondo es `canvas` y el borde de 1 px en `line`.

- [ ] **Step 3: Implementar**

En `src/components/app/fields.tsx`, reemplazar todo lo que va desde `const CONTROL =` hasta el cierre de `FieldShell` (incluye `controlStyle`, `idFromLabel`, `FieldError` y `FieldShellProps`) por:

```tsx
/* Campos: fondo blanco, borde lineStrong (3:1), foco negro con halo coral
   suave y error en danger que dice qué pasa (spec §4.4). */
const CONTROL =
  "w-full rounded-xl px-4 py-3 text-[0.95rem] outline-none transition-shadow " +
  "focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 " +
  "focus-visible:shadow-[0_0_0_5px_theme(colors.accent.soft)] " +
  "placeholder:text-ink-muted disabled:opacity-60";

const controlStyle = (hasError?: boolean): CSSProperties => ({
  backgroundColor: COLOR.surface,
  color: COLOR.ink,
  border: `1.5px solid ${hasError ? COLOR.danger : COLOR.lineStrong}`,
  minHeight: 48,
});

const idFromLabel = (label: string) =>
  "field-" + label.toLowerCase().replace(/[^a-z0-9]+/g, "-");

export const FieldError = ({ msg }: { msg?: string }) =>
  msg ? (
    <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold" style={{ color: COLOR.danger }}>
      <AlertCircle size={14} />
      {msg}
    </p>
  ) : null;

type FieldShellProps = {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
};

/* Etiqueta con el rol "label" del spec §3.3: 12 px, mayúsculas, +0.12em. */
const FieldShell = ({ label, htmlFor, error, hint, children }: FieldShellProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: COLOR.inkMuted }}>
      {label}
    </label>
    {children}
    {error ? (
      <FieldError msg={error} />
    ) : hint ? (
      <p className="text-[0.8125rem]" style={{ color: COLOR.inkMuted }}>
        {hint}
      </p>
    ) : null}
  </div>
);
```

- [ ] **Step 4: Pruebas, tipos y build**

Run: `npx vitest run 2>&1 | tail -3; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase`
Expected: todo en verde (incluida la guardia de hex); `tsc` vacío.

- [ ] **Step 5: Commit**

```bash
git add src/components/app/fields.tsx src/components/app/fields.test.tsx
git commit -m "feat(hive): campos con borde que pasa 3:1 y foco visible

Fondo blanco, borde lineStrong de 1.5 px, foco negro con halo coral suave y
mensaje de error en danger. Mismas exportaciones y props.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Panel — barra lateral, tarjeta de cifra y componentes shadcn

**Files:**
- Modify: `src/components/admin/AdminLayout.tsx`
- Modify: `src/components/admin/SectionTabs.tsx`
- Create: `src/components/admin/FigureCard.tsx`
- Modify: `src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/input.tsx`, `src/components/ui/select.tsx:20`, `src/components/ui/table.tsx:37,49`, `src/components/ui/tabs.tsx:15,30`
- Test: `src/components/admin/panel.test.tsx`

**Interfaces:**
- Consumes: clases de Tailwind de la Tarea 2, `BrandLogo`.
- Produces: `adminNavItemClass(active: boolean, compact: boolean): string` exportada desde `AdminLayout.tsx`; `FigureCard({ label: string; value: ReactNode; hint?: ReactNode; attention?: boolean })` (default export de `FigureCard.tsx`); `badgeVariants` gana `attention` y `success`. `Button` **no** tiene variante coral. La adopción de `FigureCard` en el Dashboard es del sub-proyecto 3.

- [ ] **Step 1: Escribir la prueba**

`src/components/admin/panel.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buttonVariants } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { adminNavItemClass } from "./AdminLayout";
import FigureCard from "./FigureCard";
import SectionTabs from "./SectionTabs";
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
    const archivos = ["src/pages/admin", "src/components/admin"].flatMap((d) =>
      (fs.readdirSync(path.join(root, d), { recursive: true }) as string[])
        .filter((f) => f.endsWith(".tsx"))
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
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/components/admin/panel.test.tsx`
Expected: FAIL — `adminNavItemClass` y `FigureCard` no existen; `h-10`; falta la variante `attention`.

- [ ] **Step 3: `button.tsx`**

Reemplazar el `cva` de `buttonVariants` por:

```ts
const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 whitespace-normal break-words text-center leading-tight sm:whitespace-nowrap rounded-full text-sm font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:bg-sunken disabled:text-line-strong disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // primary: negro. No existe variante coral en el panel (spec §4.1).
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-surface text-danger shadow-[inset_0_0_0_1.5px_theme(colors.danger)] hover:bg-sunken",
        outline: "bg-surface text-ink shadow-[inset_0_0_0_1.5px_theme(colors.line.strong)] hover:bg-sunken",
        secondary: "bg-sunken text-ink hover:bg-line",
        ghost: "text-ink hover:bg-sunken",
        link: "text-accent-strong underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-11 px-4",
        lg: "h-12 px-8",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
```

- [ ] **Step 4: `badge.tsx`**

Reemplazar el `cva` de `badgeVariants` por:

```ts
const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-ink text-canvas",
        secondary: "bg-sunken text-ink",
        destructive: "bg-surface text-danger shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
        outline: "text-ink shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
        // Coral = atención: lo pendiente, lo lleno (spec §3.2 regla 3).
        attention: "bg-accent text-ink",
        success: "bg-surface text-success shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

- [ ] **Step 5: `input.tsx`, `select.tsx`, `table.tsx`, `tabs.tsx`**

Run:

```bash
python3 - <<'PY'
import re
def rep(p, old, new):
    s = open(p).read(); assert old in s, f"{p}: no encontrado: {old[:50]}"
    open(p, "w").write(s.replace(old, new, 1))
rep("src/components/ui/input.tsx",
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2",
    "flex h-11 w-full rounded-xl border-[1.5px] border-input bg-surface px-3.5 py-2")
rep("src/components/ui/input.tsx",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-0 focus-visible:shadow-[0_0_0_5px_theme(colors.accent.soft)]")
rep("src/components/ui/select.tsx",
    "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2",
    "flex h-11 w-full items-center justify-between rounded-xl border-[1.5px] border-input bg-surface px-3.5 py-2")
rep("src/components/ui/table.tsx",
    '"border-b transition-colors data-[state=selected]:bg-muted hover:bg-muted/50"',
    '"border-b border-line transition-colors data-[state=selected]:bg-sunken hover:bg-canvas"')
rep("src/components/ui/table.tsx",
    '"h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0"',
    '"h-11 px-4 text-left align-middle bg-canvas text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted [&:has([role=checkbox])]:pr-0"')
rep("src/components/ui/tabs.tsx",
    "inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground",
    "inline-flex h-12 items-center justify-start rounded-full bg-surface p-1 text-ink-muted shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]")
rep("src/components/ui/tabs.tsx",
    "rounded-sm px-3 py-1.5 text-sm font-medium",
    "rounded-full px-4 py-2 text-sm font-bold")
rep("src/components/ui/tabs.tsx",
    "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
    "data-[state=active]:bg-ink data-[state=active]:text-canvas")
print("ok")
PY
```

- [ ] **Step 6: `AdminLayout.tsx`**

Exportar el helper arriba del componente `AdminLayout`:

```tsx
/* Ítem del menú del panel. La sección activa: línea coral a la izquierda
   sobre canvas (spec §4.5). Coral sólo marca "estás aquí". */
export function adminNavItemClass(active: boolean, compact: boolean): string {
  return cn(
    "flex items-center gap-3 mx-2 my-0.5 rounded-xl transition-colors duration-200 no-underline min-h-[44px]",
    compact ? "px-0 justify-center py-2.5" : "px-3 py-2.5",
    active
      ? "bg-canvas font-semibold text-ink shadow-[inset_3px_0_0_theme(colors.accent.DEFAULT)]"
      : "text-ink-muted hover:text-ink hover:bg-sunken",
  );
}
```

Después, sobre las clases que dejó la migración de la Tarea 5, run:

```bash
python3 - <<'PY2'
import re
p = "src/components/admin/AdminLayout.tsx"; s = open(p).read()
# 1) El className del Link de cada ítem → helper
s, n = re.subn(
    r'className=\{cn\(\n\s*"flex items-center gap-3 mx-2 my-0\.5 rounded-xl transition-colors duration-200 no-underline",.*?\n\s*\)\}',
    "className={adminNavItemClass(active, isCompact)}", s, count=1, flags=re.S)
assert n == 1, "no se encontró el className del ítem del menú"
def rep(old, new):
    global s
    assert old in s, f"no encontrado: {old}"
    s = s.replace(old, new, 1)
# 2) Barra lateral blanca
rep('"border-r border-line bg-sunken"', '"border-r border-line bg-surface"')
# 3) Contador de no leídos: coral con número negro
rep("rounded-full bg-inverse px-1 text-[0.7rem] font-semibold leading-none text-canvas",
    "rounded-full bg-accent px-1 text-[0.7rem] font-bold leading-none text-ink")
# 4) Clase sin reglas en CSS, resto de Alma
rep('"alma-admin flex min-h-screen', '"flex min-h-screen')
open(p, "w").write(s); print("ok")
PY2
grep -n "alma" src/components/admin/AdminLayout.tsx || echo "✓ sin alma"
```

Expected: `ok` y `✓ sin alma`. Si un `rep` falla, la migración dejó otra clase en ese lugar: abrir el archivo, ubicar el mismo elemento y aplicar el cambio a mano.

- [ ] **Step 7: `FigureCard.tsx` y `SectionTabs.tsx`**

`src/components/admin/FigureCard.tsx`:

```tsx
import type { ReactNode } from "react";
import { COLOR } from "@/design/tokens";

/* Tarjeta de cifra del panel (spec §4.5). Variante atención: borde coral y
   número en coral profundo — el único número coral de la pantalla, siempre
   con su etiqueta (coral nunca es la única señal). */
type FigureCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  attention?: boolean;
};

export default function FigureCard({ label, value, hint, attention = false }: FigureCardProps) {
  return (
    <div
      data-figure-card
      className="rounded-xl p-4 lg:p-5"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: attention ? 2 : 1,
        borderStyle: "solid",
        borderColor: attention ? COLOR.accent : COLOR.line,
      }}
    >
      <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: COLOR.inkMuted }}>{label}</p>
      <p
        className="nums mt-2 font-display font-semibold text-[1.75rem] leading-none"
        style={{ color: attention ? COLOR.accentStrong : COLOR.ink }}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-[0.8125rem]" style={{ color: COLOR.inkMuted }}>{hint}</p>}
    </div>
  );
}
```

En `src/components/admin/SectionTabs.tsx`, sobre las clases que dejó la migración, run:

```bash
python3 - <<'PY2'
p = "src/components/admin/SectionTabs.tsx"; s = open(p).read()
def rep(old, new):
    global s
    assert old in s, f"no encontrado: {old}"
    s = s.replace(old, new, 1)
rep('"mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-sunken p-1 w-fit max-w-full"',
    '"mb-6 flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1 w-fit max-w-full"')
rep('"rounded-xl px-4 py-2 text-[13px] font-semibold no-underline transition-colors duration-200"',
    '"inline-flex min-h-[44px] items-center rounded-full px-4 text-[13px] font-bold no-underline transition-colors duration-200"')
rep('"bg-sunken text-ink ring-1 ring-inset ring-line-strong"', '"bg-ink text-canvas"')
rep('"text-ink/70 hover:text-ink hover:bg-sunken/40"', '"text-ink-muted hover:text-ink hover:bg-sunken"')
open(p, "w").write(s); print("ok")
PY2
```

Expected: `ok`. La pestaña activa va en negro, como `SegmentedTabs` y las pestañas de shadcn: el coral del panel queda sólo para la sección activa del menú y lo pendiente.

- [ ] **Step 8: Pruebas, tipos y build**

Run: `npx vitest run 2>&1 | tail -3; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde, `tsc` vacío, build ok.

- [ ] **Step 9: Commit**

```bash
git add src/components/admin/ src/components/ui/
git commit -m "feat(hive): panel con coral sólo para atención

Barra lateral blanca con la sección activa marcada por una línea coral;
contador de pendientes sobre coral. Tarjeta de cifra con variante atención.
Botones shadcn: negro por defecto, sin variante coral, todos ≥44 px, y
deshabilitado en gris. Pill 'attention' para lo pendiente o lleno. Campos,
selects, tablas y pestañas con los tokens nuevos.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Página del sistema (sólo desarrollo)

**Files:**
- Create: `src/pages/dev/SistemaPage.tsx`
- Modify: `src/App.tsx` (import perezoso + ruta condicionada)
- Test: `src/pages/dev/SistemaPage.test.tsx`

**Interfaces:**
- Consumes: `COLOR`, `TONES`, `contrast`, piezas de las Tareas 3, 7, 8, 9, 10.
- Produces: ruta `/sistema`, registrada sólo cuando `import.meta.env.DEV`.

- [ ] **Step 1: Escribir la prueba**

`src/pages/dev/SistemaPage.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SistemaPage from "./SistemaPage";
import { COLOR } from "@/design/tokens";

describe("página del sistema", () => {
  it("muestra cada token con su valor", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><SistemaPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    for (const [nombre, valor] of Object.entries(COLOR)) {
      expect(screen.getByText(nombre)).toBeInTheDocument();
      expect(screen.getAllByText(valor).length).toBeGreaterThan(0);
    }
  });
  it("la ruta sólo existe en desarrollo", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "..", "..", "App.tsx"), "utf8");
    expect(app).toMatch(/const SistemaPage = import\.meta\.env\.DEV\s*\?\s*lazy\(/);
    expect(app).toMatch(/\{SistemaPage && \(\s*<Route path="\/sistema"/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/pages/dev/SistemaPage.test.tsx`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: La página**

`src/pages/dev/SistemaPage.tsx`:

```tsx
// Referencia viva del sistema HIVE. Sólo existe en desarrollo (spec §7).
import { COLOR, TONES } from "@/design/tokens";
import { contrast } from "@/design/contrast";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageHeader, Section, ListGroup, ListRow, Tag, Stat, EmptyState, ErrorState, SkeletonRow, PrimaryButton, GhostButton } from "@/components/app/AppShell";
import { StatusPill, InfoBanner, SegmentedTabs } from "@/components/app/widgets";
import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import FigureCard from "@/components/admin/FigureCard";
import { CalendarDays } from "lucide-react";

export default function SistemaPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink px-5 py-8 lg:px-12 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <BrandLogo variant="lockup" size={44} />
        <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Sistema · sólo desarrollo</span>
      </div>

      <PageHeader eyebrow="Sistema HIVE" title="Tokens y piezas" subtitle="Referencia viva: lo que ves aquí es lo que usan las pantallas." />

      <Section title="Color">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(COLOR).map(([nombre, valor]) => (
            <div key={nombre} className="rounded-xl overflow-hidden bg-surface shadow-[inset_0_0_0_1px_theme(colors.line.DEFAULT)]">
              <div className="h-14" style={{ backgroundColor: valor }} />
              <div className="p-2.5">
                <p className="text-[0.8125rem] font-bold">{nombre}</p>
                <p className="font-mono text-[0.75rem] text-ink-muted">{valor}</p>
                <p className="nums text-[0.75rem] text-ink-muted">sobre canvas {contrast(valor, COLOR.canvas).toFixed(2)}:1</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía">
        <p className="font-display font-extrabold uppercase text-[2.5rem] leading-none">Clase reservada</p>
        <p className="font-display font-extrabold uppercase text-[1.75rem] mt-3">Reserva tu clase</p>
        <p className="font-display font-semibold text-[1.25rem] mt-3">Martes 24 · 18:00</p>
        <p className="text-[1.0625rem] mt-3">Te quedan 5 clases en tu paquete, vence el 18 de octubre.</p>
        <p className="text-[0.9375rem] mt-2">Puedes cancelar sin costo hasta 12 horas antes de tu clase.</p>
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted mt-2">Por verificar</p>
        <p className="nums text-[0.9375rem] font-semibold mt-2">07:00 · 08:00 · 18:00 · $1,760 · $920</p>
      </Section>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3">
          <PrimaryButton>Reservar</PrimaryButton>
          <PrimaryButton variant="accent">Comprar paquete</PrimaryButton>
          <GhostButton>Ver mis clases</GhostButton>
          <PrimaryButton disabled>Sin lugares</PrimaryButton>
          <Button>Panel · primary</Button>
          <Button disabled>Panel · deshabilitado</Button>
          <Button variant="outline">Panel · outline</Button>
          <Button variant="destructive">Panel · destructive</Button>
        </div>
      </Section>

      <Section title="Pills y estados">
        <div className="flex flex-wrap gap-2">
          <Tag tint="accent" variant="solid">4 lugares</Tag>
          <Tag tint="accent">Últimos 2</Tag>
          <Tag tint="ink" variant="solid">Llena</Tag>
          {TONES.map((t) => <StatusPill key={t} label={t} tone={t} />)}
          <Badge variant="attention">3 por verificar</Badge>
          <Badge variant="success">Pagado</Badge>
        </div>
        <div className="mt-4"><InfoBanner title="Tu paquete vence en 3 días" description="Renueva para no perder tu lugar." /></div>
      </Section>

      <Section title="Listas y cifras">
        <SegmentedTabs options={[{ value: "a", label: "Próximas" }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />
        <div className="mt-4"><ListGroup>
          <ListRow title="Reformer · Ana" description="Martes 24 · 07:00" icon={<CalendarDays size={17} />} to="/sistema" />
          <ListRow title="Cerrar sesión" destructive onClick={() => {}} />
        </ListGroup></div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Stat value="12" label="Clases hoy" />
          <Stat value="3" label="Por verificar" tint="accent" />
          <Stat value="87%" label="Ocupación" />
        </div>
      </Section>

      <Section title="Panel · tarjetas de cifra">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FigureCard label="Clases hoy" value="12" />
          <FigureCard label="Por verificar" value="3" hint="Transferencias sin revisar" attention />
          <FigureCard label="Ocupación" value="87%" />
          <FigureCard label="Ingresos del mes" value="$48,200" />
        </div>
      </Section>

      <Section title="Campos">
        <div className="grid gap-3 max-w-md">
          <Field label="Nombre" defaultValue="Mariana Ruiz" />
          <Field label="Correo" defaultValue="mariana@" error="Falta el dominio del correo." />
        </div>
      </Section>

      <Section title="Estados">
        <EmptyState title="Aún no tienes clases" description="Cuando reserves, aparecen aquí." ctaLabel="Reservar" ctaTo="/sistema" />
        <ErrorState onRetry={() => {}} />
        <div className="grid gap-2"><SkeletonRow /><SkeletonRow height={40} /></div>
      </Section>
    </div>
  );
}
```

- [ ] **Step 4: La ruta**

`src/App.tsx` importa todo de forma estática y no usa `Suspense`. Para que la página no llegue a producción, se carga perezosamente **sólo** en desarrollo: en el build de producción `import.meta.env.DEV` vale `false`, el `import()` queda en código muerto y Vite no genera su chunk.

1. Cambiar `import { useEffect } from "react";` por `import { lazy, Suspense, useEffect } from "react";`.
2. Debajo de los imports de páginas, agregar:

```tsx
// Referencia viva del sistema HIVE (spec §7). Sólo en desarrollo.
const SistemaPage = import.meta.env.DEV ? lazy(() => import("./pages/dev/SistemaPage")) : null;
```

3. Dentro de `<Routes>`, justo antes de `{/* 404 */}`:

```tsx
          {SistemaPage && (
            <Route path="/sistema" element={<Suspense fallback={null}><SistemaPage /></Suspense>} />
          )}
```

- [ ] **Step 5: Pruebas y build**

Run: `npx vitest run 2>&1 | tail -3; VITE_API_URL=/api npx vite build 2>&1 | tail -2; grep -l "Tokens y piezas" dist/assets/*.js || echo "✓ no está en el build de producción"`
Expected: todo en verde; build ok; `✓ no está en el build de producción`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/dev/ src/App.tsx
git commit -m "feat(hive): página del sistema en /sistema, sólo en desarrollo

Tokens con su contraste, tipografía, botones, pills, listas, campos y
estados. No llega al build de producción.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Limpieza y DESIGN.md

**Files:**
- Modify: `src/index.css` (encabezado, `@font-face` Alilato, clases de fuente puente, `.alma-photo*`, keyframes `alma-*`)
- Modify: `tailwind.config.ts` (quitar alias de fuentes)
- Delete: `public/fonts/Alilato-ExtraLight.ttf`, `scripts/codemod/`
- Modify: `docs/DESIGN.md` (reescrito para HIVE)
- Test: `src/design/guards.test.ts` (guardias finales)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: `src/index.css` y `tailwind.config.ts` sin referencias a Alma; guardias finales.

- [ ] **Step 1: Agregar las guardias finales**

Al final del `describe` de `src/design/guards.test.ts`:

```ts
  it("CSS, HTML y Tailwind no tienen nada de Alma", () => {
    const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
    const tw = fs.readFileSync(path.join(root, "tailwind.config.ts"), "utf8");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    for (const [nombre, txt] of [["index.css", css], ["tailwind.config.ts", tw]] as const) {
      expect(txt, nombre).not.toMatch(/Fraunces|Jost|Alilato|\balma\b|alma-/i);
    }
    expect(html).not.toMatch(/Fraunces|Jost/);
    expect(tw).not.toMatch(/\b(gulfs|bebas|syne|dm|alilato):/);
  });

  it("ninguna pieza compartida pone texto claro sobre coral", () => {
    const dirs = ["src/components/app", "src/components/ui", "src/components/admin", "src/components/brand"];
    const claros = /COLOR\.(canvas|surface|onInverse)|text-(canvas|surface|white|inverse-foreground)/;
    const malos: string[] = [];
    for (const d of dirs) {
      for (const f of fs.readdirSync(path.join(root, d)).filter((x) => /\.tsx$/.test(x) && !/\.test\./.test(x))) {
        fs.readFileSync(path.join(root, d, f), "utf8").split("\n").forEach((line, i) => {
          const coral = /COLOR\.accent\b(?!Soft|Strong)|\bbg-accent\b(?!-)/.test(line);
          if (coral && claros.test(line)) malos.push(`${d}/${f}:${i + 1}`);
        });
      }
    }
    expect(malos).toEqual([]);
  });
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/design/guards.test.ts`
Expected: FAIL en "CSS, HTML y Tailwind no tienen nada de Alma".

- [ ] **Step 3: Limpiar `src/index.css`**

Run:

```bash
python3 - <<'PY'
import re
p = "src/index.css"; s = open(p).read()
def sub(pat, new, what, flags=re.S):
    global s
    s, n = re.subn(pat, new, s, count=1, flags=flags)
    assert n == 1, f"no se encontró: {what}"
sub(r'\A/\* ─+\n   ALMA MOVEMENT — TIPOGRAFÍAS BASE.*?─+ \*/\n',
    '/* HIVE — base. Tokens: src/design/tokens.ts · Spec: docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md */\n',
    "encabezado")
sub(r'/\* ── font-face: fuente propietaria desde public/fonts/ ── \*/\n@font-face \{.*?\}\n\n?', '', "@font-face de Alilato")
sub(r'/\* ─+\n   PALETA ALMA MOVEMENT.*?─+ \*/\n\n?', '', "comentario con la paleta de Alma")
sub(r'/\* Tratamiento fotográfico editorial.*?\.alma-photo-vignette::before \{.*?\}\n\n?', '', "tratamiento fotográfico sin usos")
sub(r'  /\* PUENTE hasta la Tarea 12.*?\*/\n  \.font-display,\n  \.font-display-italic,\n  \.font-bebas,\n  \.font-gulfs \{',
    '  .font-display {', "clases de fuente puente (display)")
sub(r'  \.font-alilato,\n  \.font-syne,\n  \.font-dm \{\n.*?\}\n', '', "clases de fuente puente (cuerpo)")
s = re.sub(r'\balma-(fade-up|scale-in|slide-up|fade-in)\b', r'\1', s)   # keyframes, todas sus apariciones
open(p, "w").write(s)
print("ok")
PY
grep -n -i "alma\|Fraunces\|Jost\|Alilato" src/index.css || echo "✓ index.css limpio"
```

Expected: `ok` y `✓ index.css limpio`.

- [ ] **Step 4: Limpiar Tailwind y borrar restos**

En `tailwind.config.ts`, dejar `fontFamily` sólo con:

```ts
      fontFamily: {
        sans: ['"Manrope"', "system-ui", "sans-serif"],
        display: ['"Unbounded"', "system-ui", "sans-serif"],
      },
```

Run:

```bash
git rm -q public/fonts/Alilato-ExtraLight.ttf
git rm -rq scripts/codemod
grep -rn "Alilato-ExtraLight\|codemod/hive-tokens" src scripts package.json || echo "✓ sin referencias"
```

- [ ] **Step 5: Reescribir `docs/DESIGN.md`**

Reemplazar el archivo completo por:

```markdown
# HIVE — Contexto de diseño

Sistema visual de HIVE Pilates Studio (Coyoacán, CDMX). Fuente de verdad en
código: `src/design/tokens.ts`. Diseño completo y razones:
`docs/superpowers/specs/2026-09-24-hive-sistema-visual-design.md`.
Referencia viva en desarrollo: `/sistema`.

## Dirección

Coral Bold: base neutra de concreto, coral `#FA936A` en bloques, negro. Premium
y energética, urbana/industrial; se aparta a propósito de los colores cálidos
asociados a calma. El coral es la única calidez del sistema.

## Color

Tokens por función (canvas, surface, sunken, line, line-strong, ink, ink-muted,
accent, accent-soft, accent-strong, on-accent, success, danger, inverse,
inverse-raised). Valores y contrastes: `src/design/tokens.ts` y su prueba.

Reglas:
1. Nunca texto claro sobre coral: sobre `accent` el texto es `on-accent`.
2. El coral no es texto: número, ícono o enlace coral → `accent-strong`.
3. En el panel, coral = atención (activo, pendiente, lleno), siempre con texto.
4. Nunca coral sobre coral.
5. `success` y `danger` son funcionales, nunca decorativos.
6. Ningún color escrito a mano fuera de `src/design/`.

## Tipografía

Unbounded (600/800) para titulares —los grandes en mayúsculas— y cifras
sueltas; Manrope para todo lo que se lee. Cifras tabulares (`.nums`) en listas
de horas y montos. Mínimo 12 px.

## Piezas

`src/components/app/` (app de clienta) y `src/components/ui/` (shadcn, panel).
Extender estas piezas; no crear paralelas. Botones ≥44 px. `PageHeader` es el
bloque coral firma: uno por pantalla. Botón coral sólo en la app, para la
acción que genera ingreso.

## Logo

`BrandLogo` (`src/components/brand/`) — **provisional**. Un solo color
(`currentColor`). Para reemplazarlo por el oficial: cambiar
`src/assets/brand/hive-mark.svg` y los trazos de `BrandLogo.tsx`, y correr
`npm run brand:assets`.

## Movimiento y estados

Sólo `transform` y `opacity`, salida suave, sin rebotes; respetar
`prefers-reduced-motion`. Toda pantalla maneja cargando, vacío y error; un
fallo de red nunca se disfraza de vacío.
```

- [ ] **Step 6: Pruebas, tipos y build**

Run: `npx vitest run 2>&1 | tail -3; npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -v supabase; VITE_API_URL=/api npx vite build 2>&1 | tail -2`
Expected: todo en verde (incluidas todas las guardias), `tsc` vacío, build ok.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(hive): quitar los últimos restos de Alma del sistema

Sale Alilato, las clases de fuente legacy, el tratamiento fotográfico sin
usos y los nombres alma-* de keyframes. Se borra el script de migración: las
guardias ya impiden volver atrás. DESIGN.md reescrito para HIVE.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Verificación completa y fusión a `hive`

**Files:**
- Ninguno nuevo (sólo evidencia en `auditoria-estudio/hive-sistema/`, ignorada por git).

- [ ] **Step 1: Suites del repo**

Run: `npm test 2>&1 | grep -E "Test Files|Tests |ℹ (tests|pass|fail)"`
Expected: frontend y servidor en verde, sin fallas.

- [ ] **Step 2: Regresión contra una base desechable**

```bash
SP=$(mktemp -d)
initdb -D "$SP/pg" -U alma --auth=trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$SP/pg" -o "-p 5521 -c unix_socket_directories= -c listen_addresses=127.0.0.1" -l "$SP/pg.log" start >/dev/null; sleep 2
psql -h 127.0.0.1 -p 5521 -U alma -d postgres -qc "CREATE DATABASE hive;"
psql -h 127.0.0.1 -p 5521 -U alma -d hive -q -f supabase/migrations/schema_complete.sql
psql -h 127.0.0.1 -p 5521 -U alma -d hive -q -f supabase/migrations/20260908_fix_doble_descuento_y_contador.sql
(DATABASE_URL=postgres://alma:alma@127.0.0.1:5521/hive JWT_SECRET=hive_qa_secret_pruebas PORT=8121 \
  API_RATE_LIMIT_MAX=100000 AUTH_RATE_LIMIT_MAX=100000 nohup node server/index.js > "$SP/api.log" 2>&1 &)
for i in $(seq 1 30); do curl -sf http://127.0.0.1:8121/api/health >/dev/null && break; sleep 1; done
API_URL=http://127.0.0.1:8121 DATABASE_URL=postgres://alma:alma@127.0.0.1:5521/hive \
  node --test --test-concurrency=1 "server/tests/*.test.mjs" 2>&1 | grep -E "ℹ (tests|pass|fail)"
```

Expected: `fail 0`. (El backend no cambió; esto confirma que el frontend nuevo no rompió nada que las pruebas cubran.)

- [ ] **Step 3: Barrido en navegador**

Con el servidor del paso anterior sirviendo `dist/` (`VITE_API_URL=/api npx vite build` antes de arrancarlo), crear una admin y una clienta de prueba y recorrer con las herramientas de navegador (Playwright MCP):

- **Panel** (1280 px, como admin): `/admin/dashboard`, `/admin/bookings`, `/admin/bookings/waitlist`, `/admin/classes`, `/admin/class-generator`, `/admin/class-types`, `/admin/clients`, `/admin/memberships`, `/admin/orders`, `/admin/payments`, `/admin/plans`, `/admin/reports`, `/admin/discount-codes`, `/admin/staff`, `/admin/pasar-lista`, `/admin/settings`.
- **App** (390 × 844 y 1280 px, como clienta): `/app`, `/app/classes`, `/app/bookings`, `/app/wallet`, `/app/profile`, `/app/profile/edit`, `/app/profile/preferences`, `/app/profile/responsiva`, `/app/orders`, `/app/checkout`, `/app/notifications`.

En cada ruta registrar: errores de consola, respuestas de `/api` ≥ 400, texto `undefined` / `NaN` / `Invalid Date`, pantalla en blanco, y scroll horizontal (`document.documentElement.scrollWidth > clientWidth`). Guardar una captura por ruta en `auditoria-estudio/hive-sistema/`.

**Movimiento reducido:** con `prefers-reduced-motion: reduce` emulado (`browser_emulate_media`), abrir `/app` y `/app/classes` y comprobar en consola que ningún elemento anima:

```js
[...document.querySelectorAll("*")].filter((el) => {
  const cs = getComputedStyle(el);
  return (cs.animationName !== "none" && parseFloat(cs.animationDuration) > 0.01)
      || (parseFloat(cs.transitionDuration) > 0.01 && /transform|all/.test(cs.transitionProperty) && el.matches(":hover"));
}).map((el) => el.className.toString().slice(0, 60))   // esperado: [] (se aceptan spinners animate-spin)
```

El bloque `@media (prefers-reduced-motion: reduce)` de `src/index.css` ya apaga los atributos `data-*`; si aparece otro elemento, agregar su selector a ese bloque con su prueba.
Expected: cero hallazgos. Cualquier hallazgo se corrige con su prueba en rojo antes de seguir.

Apagar al terminar: `pkill -f "PORT=8121"; pg_ctl -D "$SP/pg" stop -m fast; rm -rf "$SP"`.

- [ ] **Step 4: Revisión adversarial del diff**

Invocar la skill `code-review` con nivel `high` sobre la rama `hive-sistema` contra `hive`. Verificar cada hallazgo reproduciéndolo antes de aceptarlo; corregir los confirmados con su prueba en rojo.

- [ ] **Step 5: Fusionar a `hive`**

```bash
cd "/Users/saidromero/Alma Studio/alma-hive"
git merge --no-ff hive-sistema -m "merge: sistema visual HIVE (sub-proyecto 1 de 4)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
npx vitest run 2>&1 | tail -3
```

Expected: fusión limpia y suite en verde. **No empujar a `main` ni a producción**: faltan los sub-proyectos 2, 3 y 4.
