# Catálogo Alma Movement (Fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el catálogo heredado (Ophelia/Kala) por el catálogo real de Alma Movement: 5 disciplinas en 2 áreas, horarios 6–11am / 5–8pm, los 17 paquetes con precios correctos, modo apertura (switch global), gating por categoría y AM Club matutino — y dejar de mostrar/cobrar datos viejos.

**Architecture:** El server Express (ESM, `server/index.js`) siembra el esquema y los datos en `ensureSchema()` al arrancar contra Postgres. La verdad de compra es la tabla `plans`; la tabla legacy `packages` solo se mostraba en la landing y se desactiva. La nueva lógica pura (precio efectivo, ventana matutina, compatibilidad de categoría) se extrae a módulos `server/lib/*.js` con tests unitarios reales (`node --test`). El frontend (React + Vite + react-query, `src/`) muestra el catálogo desde `/api/plans` usando el `effective_price` que calcula el server.

**Tech Stack:** Node 25 (ESM), Express, PostgreSQL (`pg`), embedded-postgres para dev/test, React 18 + TypeScript + Vite, react-query, axios, zod, react-hook-form, Vitest (jsdom) + `node --test`.

---

## Cómo se prueba en ESTE repo (leer antes de empezar)

No hay framework de tests de integración para el server. Las formas reales de verificar:

- **Lógica pura nueva** (`server/lib/*.js`): tests con el runner nativo de Node.
  `node --test server/lib/<archivo>.test.js` (sin DB, sin env).
- **Frontend**: Vitest en jsdom. `npm test` corre `vitest run` sobre
  `src/**/*.{test,spec}.{ts,tsx}`. El estilo existente del repo (ver
  `src/pages/Index.client-copy.test.ts`) hace **aserciones sobre el código
  fuente** (lee el `.tsx` y verifica que contiene/no contiene strings). Lo
  usamos para verificar copys/estructura sin montar DOM completo.
- **Seeds / endpoints contra DB real**: levantar Postgres embebido y aplicar
  esquema:
  ```bash
  # terminal 1 (queda corriendo):
  npm run db:local
  # terminal 2:
  npm run db:schema
  DATABASE_URL=postgres://alma:alma@127.0.0.1:5433/alma npm start
  # luego curl a http://localhost:8080/api/...
  ```
  `ensureSchema()` corre solo al arrancar `npm start`. Para re-sembrar desde
  cero: `Ctrl+C` en `db:local`, borrar `.pgdata/`, repetir.
- **Build / typecheck**: `npm run build` (Vite + tsc) y `npm run lint`.

> Convención de commits: el repo trabaja en la rama `feature/alma-catalogo`.
> Commit pequeño por tarea. Mensajes en español, imperativo.

---

## Estructura de archivos

**Crear:**
- `server/lib/pricing.js` — `resolveEffectivePrice(plan, openingActive)`.
- `server/lib/pricing.test.js` — tests unitarios (`node --test`).
- `server/lib/bookingRules.js` — `normalizeClassCategory`, `isMembershipCategoryCompatible`, `isWithinMorningWindow`, `categoryLabel`.
- `server/lib/bookingRules.test.js` — tests unitarios.
- `server/lib/almaCatalog.js` — datos canónicos: `ALMA_CLASS_TYPES`, `ALMA_SCHEDULE_SLOTS`, `ALMA_PLANS` (las 17) + helpers de seed (SQL-agnósticos).
- `server/lib/almaCatalog.test.js` — valida invariantes del catálogo (17 planes, categorías válidas, ilimitados con opening_price).
- `src/pages/Index.catalog.test.ts` — aserciones de fuente sobre la landing.

**Modificar:**
- `server/index.js` — columnas nuevas en `plans`; reseed `class_types`, `schedule_slots`, `plans`; desactivar `packages` legacy; nuevo setting `opening_pricing_active`; wiring de precio efectivo en `/plans`, órdenes y POS; gating + ventana matutina en `/api/bookings`; aceptar `opening_price`/`morning_only` en admin plans CRUD; importar los módulos `server/lib/*`.
- `src/pages/Index.tsx` — mostrar catálogo desde `/plans`; ocultar sección online y render de anillos.
- `src/pages/admin/settings/SettingsPage.tsx` — toggle "Precios de apertura".
- `src/pages/admin/plans/PlansList.tsx` — campos `openingPrice` + `morningOnly`, enum de categoría nuevo, quitar campos de anillos.

---

## Datos canónicos (referencia única — usados en varias tareas)

**5 disciplinas (`class_types`)** — `category` = área:

| name | category | capacity | duration_min |
|---|---|---|---|
| Pilates Reformer | reformer_tower | 4 | 50 |
| Pilates Tower | reformer_tower | 4 | 50 |
| Pilates Mat | studio | 8 | 50 |
| Barre | studio | 8 | 50 |
| Sculpt | studio | 8 | 50 |

**Horarios (`schedule_slots`)** — lun(1)–sáb(6), sin domingo:
`['6:00 am','7:00 am','8:00 am','9:00 am','10:00 am','11:00 am','5:00 pm','6:00 pm','7:00 pm','8:00 pm']`

**Los 17 paquetes (`plans`)** — `price` = regular, `opening_price` = apertura (solo ilimitados):

| name | price | opening_price | class_limit | duration_days | class_category | morning_only | is_non_repeatable / repeat_key | sort_order |
|---|---|---|---|---|---|---|---|---|
| Alma Studio Intro | 150 | null | 1 | 7 | studio | false | true / alma_studio_intro | 1 |
| Clase Única Studio | 240 | null | 1 | 30 | studio | false | — | 2 |
| 4 Sesiones Studio | 900 | null | 4 | 30 | studio | false | — | 3 |
| 8 Sesiones Studio | 1700 | null | 8 | 30 | studio | false | — | 4 |
| 12 Sesiones Studio | 2150 | null | 12 | 45 | studio | false | — | 5 |
| Studio Ilimitado | 2700 | 2300 | null | 30 | studio | false | — | 6 |
| Clase Única Reformer/Tower | 270 | null | 1 | 30 | reformer_tower | false | — | 7 |
| 4 Sesiones Reformer/Tower | 920 | null | 4 | 30 | reformer_tower | false | — | 8 |
| 8 Sesiones Reformer/Tower | 1760 | null | 8 | 30 | reformer_tower | false | — | 9 |
| 12 Sesiones Reformer/Tower | 2280 | null | 12 | 45 | reformer_tower | false | — | 10 |
| Reformer/Tower Ilimitado | 2900 | 2500 | null | 30 | reformer_tower | false | — | 11 |
| Alma Balance | 1500 | null | 8 | 30 | mixto | false | — | 12 |
| Alma Fusion | 2200 | null | 12 | 30 | mixto | false | — | 13 |
| Alma Experience | 2800 | null | 16 | 45 | mixto | false | — | 14 |
| AM Club | 1300 | null | 8 | 30 | studio | true | — | 15 |
| AM Club Reformer & Tower | 1600 | null | 8 | 30 | reformer_tower | true | — | 16 |
| Alma Unlimited | 3900 | 3500 | null | 30 | all | false | — | 17 |

`class_limit = null` ⇒ ilimitado. `descriptions`: cada plan lleva un texto corto (Balance="4 Studio + 4 Reformer/Tower", etc.) definido en `ALMA_PLANS`.

---

### Task 1: Módulo de precio efectivo (modo apertura)

**Files:**
- Create: `server/lib/pricing.js`
- Test: `server/lib/pricing.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// server/lib/pricing.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveEffectivePrice } from "./pricing.js";

test("usa opening_price cuando el modo apertura está activo", () => {
  const plan = { price: 2700, opening_price: 2300 };
  assert.equal(resolveEffectivePrice(plan, true), 2300);
});

test("usa price regular cuando el modo apertura está apagado", () => {
  const plan = { price: 2700, opening_price: 2300 };
  assert.equal(resolveEffectivePrice(plan, false), 2700);
});

test("usa price regular si no hay opening_price aunque apertura esté activa", () => {
  const plan = { price: 900, opening_price: null };
  assert.equal(resolveEffectivePrice(plan, true), 900);
});

test("ignora opening_price inválido", () => {
  const plan = { price: 900, opening_price: "x" };
  assert.equal(resolveEffectivePrice(plan, true), 900);
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test server/lib/pricing.test.js`
Expected: FAIL con `Cannot find module './pricing.js'`.

- [ ] **Step 3: Implementar el módulo**

```js
// server/lib/pricing.js
// Resuelve el precio que se muestra/cobra según el modo apertura.
// opening_price solo está poblado en los paquetes ilimitados.
export function resolveEffectivePrice(plan, openingActive) {
  const base = Number(plan?.price);
  const openingRaw = plan?.opening_price ?? plan?.openingPrice;
  const opening = openingRaw == null ? null : Number(openingRaw);
  if (openingActive && opening != null && Number.isFinite(opening) && opening > 0) {
    return opening;
  }
  return base;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test server/lib/pricing.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/pricing.js server/lib/pricing.test.js
git commit -m "feat(catalogo): helper resolveEffectivePrice para modo apertura"
```

---

### Task 2: Módulo de reglas de reserva (categoría + ventana matutina)

**Files:**
- Create: `server/lib/bookingRules.js`
- Test: `server/lib/bookingRules.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// server/lib/bookingRules.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeClassCategory,
  isMembershipCategoryCompatible,
  isWithinMorningWindow,
  categoryLabel,
} from "./bookingRules.js";

test("normaliza categorías nuevas y desconocidas", () => {
  assert.equal(normalizeClassCategory("studio"), "studio");
  assert.equal(normalizeClassCategory("reformer_tower"), "reformer_tower");
  assert.equal(normalizeClassCategory("MIXTO"), "mixto");
  assert.equal(normalizeClassCategory("nope"), "all");
});

test("studio no puede reservar reformer_tower y viceversa", () => {
  assert.equal(isMembershipCategoryCompatible("studio", "reformer_tower"), false);
  assert.equal(isMembershipCategoryCompatible("reformer_tower", "studio"), false);
  assert.equal(isMembershipCategoryCompatible("studio", "studio"), true);
});

test("mixto y all reservan cualquier área", () => {
  assert.equal(isMembershipCategoryCompatible("mixto", "studio"), true);
  assert.equal(isMembershipCategoryCompatible("mixto", "reformer_tower"), true);
  assert.equal(isMembershipCategoryCompatible("all", "reformer_tower"), true);
});

test("ventana matutina: permite <=10am, bloquea tarde (hora Mexico City)", () => {
  // 2026-06-08 09:00 America/Mexico_City == 15:00Z (UTC-6)
  assert.equal(isWithinMorningWindow("2026-06-08T15:00:00.000Z"), true);
  // 2026-06-08 18:00 local == 00:00Z del día siguiente
  assert.equal(isWithinMorningWindow("2026-06-09T00:00:00.000Z"), false);
});

test("categoryLabel para mensajes", () => {
  assert.equal(categoryLabel("studio"), "Studio");
  assert.equal(categoryLabel("reformer_tower"), "Reformer/Tower");
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test server/lib/bookingRules.test.js`
Expected: FAIL con `Cannot find module './bookingRules.js'`.

- [ ] **Step 3: Implementar el módulo**

```js
// server/lib/bookingRules.js
const VALID_CATEGORIES = ["studio", "reformer_tower", "mixto", "all"];

export function normalizeClassCategory(value, fallback = "all") {
  const raw = String(value ?? "").trim().toLowerCase();
  return VALID_CATEGORIES.includes(raw) ? raw : fallback;
}

export function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  const memCat = normalizeClassCategory(membershipCategory, "all");
  const clsCat = normalizeClassCategory(classCategory, "all");
  if (clsCat === "all") return true;
  if (memCat === "all" || memCat === "mixto") return true;
  return memCat === clsCat;
}

export function categoryLabel(category) {
  switch (normalizeClassCategory(category)) {
    case "studio": return "Studio";
    case "reformer_tower": return "Reformer/Tower";
    case "mixto": return "Mixto";
    default: return "Alma";
  }
}

// AM Club: solo clases que empiezan a las 10:00am o antes, hora del studio.
// Usamos Intl para obtener la hora local sin dependencias.
export function isWithinMorningWindow(startsAt, timeZone = "America/Mexico_City", lastHour = 10) {
  if (!startsAt) return false;
  const d = new Date(startsAt);
  if (Number.isNaN(d.getTime())) return false;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone, hour: "2-digit", hour12: false,
    }).format(d)
  );
  // 24:00 se normaliza a 0; tratamos 0..lastHour como mañana válida.
  return hour <= lastHour;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test server/lib/bookingRules.test.js`
Expected: PASS (5 tests).

> Si el test de ventana matutina falla por DST/offset, ajustar las horas UTC
> del test a la fecha usada (México no usa DST desde 2023; UTC-6 fijo).

- [ ] **Step 5: Commit**

```bash
git add server/lib/bookingRules.js server/lib/bookingRules.test.js
git commit -m "feat(catalogo): reglas de reserva (categoria + ventana matutina)"
```

---

### Task 3: Catálogo canónico (datos + invariantes)

**Files:**
- Create: `server/lib/almaCatalog.js`
- Test: `server/lib/almaCatalog.test.js`

- [ ] **Step 1: Escribir el test que falla**

```js
// server/lib/almaCatalog.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALMA_CLASS_TYPES, ALMA_SCHEDULE_SLOTS, ALMA_PLANS } from "./almaCatalog.js";

test("5 disciplinas en 2 areas con cupos correctos", () => {
  assert.equal(ALMA_CLASS_TYPES.length, 5);
  const byName = Object.fromEntries(ALMA_CLASS_TYPES.map((c) => [c.name, c]));
  assert.equal(byName["Pilates Reformer"].category, "reformer_tower");
  assert.equal(byName["Pilates Reformer"].capacity, 4);
  assert.equal(byName["Barre"].category, "studio");
  assert.equal(byName["Barre"].capacity, 8);
});

test("horarios cubren mañana y tarde", () => {
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("6:00 am"));
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("11:00 am"));
  assert.ok(ALMA_SCHEDULE_SLOTS.includes("8:00 pm"));
  assert.ok(!ALMA_SCHEDULE_SLOTS.includes("9:00 pm"));
});

test("17 planes con categorias validas", () => {
  assert.equal(ALMA_PLANS.length, 17);
  const cats = new Set(["studio", "reformer_tower", "mixto", "all"]);
  for (const p of ALMA_PLANS) assert.ok(cats.has(p.class_category), p.name);
});

test("solo los 3 ilimitados tienen opening_price y class_limit null", () => {
  const withOpening = ALMA_PLANS.filter((p) => p.opening_price != null);
  assert.equal(withOpening.length, 3);
  for (const p of withOpening) assert.equal(p.class_limit, null);
  assert.deepEqual(
    withOpening.map((p) => [p.price, p.opening_price]).sort((a, b) => a[0] - b[0]),
    [[2700, 2300], [2900, 2500], [3900, 3500]]
  );
});

test("Alma Studio Intro es trial no repetible", () => {
  const intro = ALMA_PLANS.find((p) => p.name === "Alma Studio Intro");
  assert.equal(intro.is_non_repeatable, true);
  assert.equal(intro.repeat_key, "alma_studio_intro");
});

test("AM Club marca morning_only", () => {
  assert.equal(ALMA_PLANS.find((p) => p.name === "AM Club").morning_only, true);
  assert.equal(ALMA_PLANS.find((p) => p.name === "AM Club Reformer & Tower").morning_only, true);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test server/lib/almaCatalog.test.js`
Expected: FAIL con `Cannot find module './almaCatalog.js'`.

- [ ] **Step 3: Implementar el catálogo**

```js
// server/lib/almaCatalog.js
// Fuente única de la verdad del catálogo de Alma Movement (Fase 1).

export const ALMA_CLASS_TYPES = [
  { name: "Pilates Reformer", category: "reformer_tower", capacity: 4, duration_min: 50, color: "#76214D", sort_order: 1 },
  { name: "Pilates Tower",    category: "reformer_tower", capacity: 4, duration_min: 50, color: "#8A4A6B", sort_order: 2 },
  { name: "Pilates Mat",      category: "studio",         capacity: 8, duration_min: 50, color: "#A48D78", sort_order: 3 },
  { name: "Barre",            category: "studio",         capacity: 8, duration_min: 50, color: "#9C8E72", sort_order: 4 },
  { name: "Sculpt",           category: "studio",         capacity: 8, duration_min: 50, color: "#C0A688", sort_order: 5 },
];

export const ALMA_SCHEDULE_SLOTS = [
  "6:00 am", "7:00 am", "8:00 am", "9:00 am", "10:00 am", "11:00 am",
  "5:00 pm", "6:00 pm", "7:00 pm", "8:00 pm",
];
export const ALMA_SCHEDULE_DAYS = [1, 2, 3, 4, 5, 6]; // lun..sáb

// price = regular; opening_price = apertura (solo ilimitados). class_limit null = ilimitado.
export const ALMA_PLANS = [
  { name: "Alma Studio Intro", description: "1 clase muestra Studio, solo para nuevas alumnas.", price: 150, opening_price: null, class_limit: 1, duration_days: 7, class_category: "studio", morning_only: false, is_non_repeatable: true, repeat_key: "alma_studio_intro", sort_order: 1 },
  { name: "Clase Única Studio", description: "1 sesión Studio (Mat, Barre o Sculpt).", price: 240, opening_price: null, class_limit: 1, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 2 },
  { name: "4 Sesiones Studio", description: "4 sesiones Studio.", price: 900, opening_price: null, class_limit: 4, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 3 },
  { name: "8 Sesiones Studio", description: "8 sesiones Studio.", price: 1700, opening_price: null, class_limit: 8, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 4 },
  { name: "12 Sesiones Studio", description: "12 sesiones Studio.", price: 2150, opening_price: null, class_limit: 12, duration_days: 45, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 5 },
  { name: "Studio Ilimitado", description: "Sesiones ilimitadas Studio (Mat + Barre + Sculpt).", price: 2700, opening_price: 2300, class_limit: null, duration_days: 30, class_category: "studio", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 6 },
  { name: "Clase Única Reformer/Tower", description: "1 sesión en Reformer o Tower.", price: 270, opening_price: null, class_limit: 1, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 7 },
  { name: "4 Sesiones Reformer/Tower", description: "4 sesiones Reformer/Tower.", price: 920, opening_price: null, class_limit: 4, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 8 },
  { name: "8 Sesiones Reformer/Tower", description: "8 sesiones Reformer/Tower.", price: 1760, opening_price: null, class_limit: 8, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 9 },
  { name: "12 Sesiones Reformer/Tower", description: "12 sesiones Reformer/Tower.", price: 2280, opening_price: null, class_limit: 12, duration_days: 45, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 10 },
  { name: "Reformer/Tower Ilimitado", description: "Sesiones ilimitadas en Reformer y Tower.", price: 2900, opening_price: 2500, class_limit: null, duration_days: 30, class_category: "reformer_tower", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 11 },
  { name: "Alma Balance", description: "8 sesiones: 4 Studio + 4 Reformer/Tower.", price: 1500, opening_price: null, class_limit: 8, duration_days: 30, class_category: "mixto", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 12 },
  { name: "Alma Fusion", description: "12 sesiones: 6 Studio + 6 Reformer/Tower.", price: 2200, opening_price: null, class_limit: 12, duration_days: 30, class_category: "mixto", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 13 },
  { name: "Alma Experience", description: "16 sesiones: 8 Studio + 8 Reformer/Tower.", price: 2800, opening_price: null, class_limit: 16, duration_days: 45, class_category: "mixto", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 14 },
  { name: "AM Club", description: "8 sesiones Studio, solo horario matutino (7–10am).", price: 1300, opening_price: null, class_limit: 8, duration_days: 30, class_category: "studio", morning_only: true, is_non_repeatable: false, repeat_key: null, sort_order: 15 },
  { name: "AM Club Reformer & Tower", description: "8 sesiones Reformer/Tower, solo matutino (7–10am).", price: 1600, opening_price: null, class_limit: 8, duration_days: 30, class_category: "reformer_tower", morning_only: true, is_non_repeatable: false, repeat_key: null, sort_order: 16 },
  { name: "Alma Unlimited", description: "Acceso ilimitado a las 5 disciplinas: Reformer, Tower, Mat, Barre y Sculpt.", price: 3900, opening_price: 3500, class_limit: null, duration_days: 30, class_category: "all", morning_only: false, is_non_repeatable: false, repeat_key: null, sort_order: 17 },
];

export const ALMA_PLAN_NAMES = ALMA_PLANS.map((p) => p.name);
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test server/lib/almaCatalog.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/lib/almaCatalog.js server/lib/almaCatalog.test.js
git commit -m "feat(catalogo): datos canonicos Alma (5 disciplinas, horarios, 17 planes)"
```

---

### Task 4: Columnas nuevas en `plans` (opening_price, morning_only)

**Files:**
- Modify: `server/index.js:840` (junto a las otras `ALTER TABLE plans ADD COLUMN`)

- [ ] **Step 1: Añadir las columnas en ensureSchema**

Localizar la línea (≈840):
```javascript
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_visit_pack BOOLEAN DEFAULT false`).catch(() => { });
```
Insertar inmediatamente después:
```javascript
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS opening_price DECIMAL(10,2)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS morning_only BOOLEAN DEFAULT false`).catch(() => { });
```

- [ ] **Step 2: Verificar arranque + columnas (DB embebida)**

```bash
npm run db:local   # terminal 1, dejar corriendo
npm run db:schema  # terminal 2
DATABASE_URL=postgres://alma:alma@127.0.0.1:5433/alma npm start  # terminal 2
```
En otra terminal:
```bash
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "\d plans" | grep -E "opening_price|morning_only"
```
Expected: aparecen `opening_price | numeric(10,2)` y `morning_only | boolean`. Detener el server (`Ctrl+C`).

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(catalogo): columnas opening_price y morning_only en plans"
```

---

### Task 5: Reseed de `class_types` (5 disciplinas + categorías nuevas)

**Files:**
- Modify: `server/index.js:662-773` (CREATE + CHECK + seed de class_types)

- [ ] **Step 1: Importar el catálogo (una sola vez, arriba del archivo)**

Debajo de la línea 26 (`} from "./emailService.js";`) añadir:
```javascript
import { ALMA_CLASS_TYPES, ALMA_SCHEDULE_SLOTS, ALMA_SCHEDULE_DAYS, ALMA_PLANS, ALMA_PLAN_NAMES } from "./lib/almaCatalog.js";
import { resolveEffectivePrice } from "./lib/pricing.js";
import { isMembershipCategoryCompatible as ruleCategoryCompatible, normalizeClassCategory as ruleNormalizeCategory, isWithinMorningWindow, categoryLabel } from "./lib/bookingRules.js";
```

- [ ] **Step 2: Actualizar el CHECK de categoría de class_types**

Reemplazar (≈763-764):
```javascript
    await pool.query(`ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_category_check`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD CONSTRAINT class_types_category_check CHECK (category IN ('barre','jumping','pilates','mixto'))`).catch(() => { });
```
por:
```javascript
    await pool.query(`ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_category_check`).catch(() => { });
    await pool.query(`ALTER TABLE class_types ADD CONSTRAINT class_types_category_check CHECK (category IN ('studio','reformer_tower'))`).catch(() => { });
```

- [ ] **Step 3: Reemplazar el seed de "Barre" por las 5 disciplinas**

Reemplazar el bloque (≈768-773):
```javascript
      await pool.query(`
        INSERT INTO class_types (name, subtitle, description, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active) VALUES
          ('Barre', 'Fuerza, postura y comunidad', 'Clase cercana, energetica y personalizada para todos los niveles. Cada sesion cambia para que avances con compromiso y disfrutes el proceso.', 'barre', 'Media', 'all', 50, 5, '#76214D', 'sparkles', 1, true)
        ON CONFLICT DO NOTHING;
      `);
```
por (upsert idempotente por nombre + desactivar tipos fuera del catálogo):
```javascript
      // Desactivar tipos heredados que no son disciplinas Alma.
      await pool.query(
        `UPDATE class_types SET is_active = false WHERE name <> ALL($1::text[])`,
        [ALMA_CLASS_TYPES.map((c) => c.name)]
      );
      for (const c of ALMA_CLASS_TYPES) {
        const upd = await pool.query(
          `UPDATE class_types SET category=$2, capacity=$3, duration_min=$4, color=$5, sort_order=$6, is_active=true, updated_at=NOW() WHERE name=$1`,
          [c.name, c.category, c.capacity, c.duration_min, c.color, c.sort_order]
        );
        if (upd.rowCount === 0) {
          await pool.query(
            `INSERT INTO class_types (name, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active)
             VALUES ($1,$2,'media','Todos los niveles',$3,$4,$5,'sparkles',$6,true)`,
            [c.name, c.category, c.duration_min, c.capacity, c.color, c.sort_order]
          );
        }
      }
```

> Nota: el `INSERT ... ON CONFLICT DO NOTHING` original asume un índice único
> que puede no existir; el patrón UPDATE-then-INSERT evita depender de él y es
> idempotente.

- [ ] **Step 4: Verificar (DB embebida limpia)**

Borrar `.pgdata/` para sembrar desde cero, relevantar db:local + db:schema + start (ver preámbulo), luego:
```bash
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT name, category, capacity FROM class_types WHERE is_active ORDER BY sort_order;"
```
Expected: 5 filas — Reformer/Tower cap 4, Mat/Barre/Sculpt cap 8.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat(catalogo): 5 disciplinas Alma en class_types (areas studio/reformer_tower)"
```

---

### Task 6: Reseed de `schedule_slots` (6–11am, 5–8pm, lun–sáb)

**Files:**
- Modify: `server/index.js:779-788` (seed de schedule_slots)

- [ ] **Step 1: Reemplazar el seed de horarios**

Reemplazar (≈778-788):
```javascript
      await pool.query(`
        INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name) VALUES
          ('7:00 am', 1, 'Barre'), ('8:00 am', 1, 'Barre'), ('7:00 pm', 1, 'Barre'), ('8:00 pm', 1, 'Barre'),
          ('7:00 am', 2, 'Barre'), ('8:00 am', 2, 'Barre'), ('7:00 pm', 2, 'Barre'), ('8:00 pm', 2, 'Barre'),
          ('7:00 am', 3, 'Barre'), ('8:00 am', 3, 'Barre'), ('7:00 pm', 3, 'Barre'), ('8:00 pm', 3, 'Barre'),
          ('7:00 am', 4, 'Barre'), ('8:00 am', 4, 'Barre'), ('7:00 pm', 4, 'Barre'), ('8:00 pm', 4, 'Barre'),
          ('7:00 am', 5, 'Barre'), ('8:00 am', 5, 'Barre'), ('7:00 pm', 5, 'Barre'), ('8:00 pm', 5, 'Barre'),
          ('7:00 am', 6, 'Barre'), ('8:00 am', 6, 'Barre'), ('9:00 am', 6, 'Barre')
        ON CONFLICT DO NOTHING;
      `);
```
por (siembra solo si la tabla está vacía, para no pisar lo que la dueña edite):
```javascript
      const existingSlots = await pool.query(`SELECT COUNT(*)::int AS n FROM schedule_slots`);
      if (existingSlots.rows[0].n === 0) {
        const values = [];
        const params = [];
        let i = 1;
        for (const day of ALMA_SCHEDULE_DAYS) {
          for (const slot of ALMA_SCHEDULE_SLOTS) {
            values.push(`($${i++}, $${i++}, NULL)`);
            params.push(slot, day);
          }
        }
        await pool.query(
          `INSERT INTO schedule_slots (time_slot, day_of_week, class_type_name) VALUES ${values.join(", ")}`,
          params
        );
      }
```

> `class_type_name` queda NULL: la dueña asigna la disciplina por slot desde el
> admin. Los slots cubren el rango horario; no fuerzan disciplina.

- [ ] **Step 2: Verificar (DB limpia)**

Tras relevantar con `.pgdata/` borrado:
```bash
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT DISTINCT time_slot FROM schedule_slots ORDER BY 1;"
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT COUNT(*) FROM schedule_slots;"
```
Expected: 10 horarios distintos (6–11am, 5–8pm); total 60 (10 × 6 días).

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(catalogo): horarios 6-11am y 5-8pm lun-sab en schedule_slots"
```

---

### Task 7: Reseed de `plans` (17 paquetes) + desactivar `packages` legacy

**Files:**
- Modify: `server/index.js:902-914` (seed de plans) y el seed de `packages` (≈745-761)

- [ ] **Step 1: Reemplazar el seed de plans por upsert del catálogo Alma**

Reemplazar el bloque (≈901-914) que inserta los "Barre — N Clases" por:
```javascript
      // Upsert idempotente de los 17 paquetes Alma + desactivar lo heredado.
      await pool.query(
        `UPDATE plans SET is_active = false, updated_at = NOW() WHERE name <> ALL($1::text[])`,
        [ALMA_PLAN_NAMES]
      );
      for (const p of ALMA_PLANS) {
        const upd = await pool.query(
          `UPDATE plans SET
             description=$2, price=$3, opening_price=$4, currency='MXN',
             duration_days=$5, class_limit=$6, class_category=$7, morning_only=$8,
             is_non_repeatable=$9, repeat_key=$10, is_non_transferable=false,
             includes_video_library=false, is_active=true, sort_order=$11, updated_at=NOW()
           WHERE name=$1`,
          [p.name, p.description, p.price, p.opening_price, p.duration_days,
           p.class_limit, p.class_category, p.morning_only, p.is_non_repeatable,
           p.repeat_key, p.sort_order]
        );
        if (upd.rowCount === 0) {
          await pool.query(
            `INSERT INTO plans
               (name, description, price, opening_price, currency, duration_days, class_limit,
                class_category, morning_only, is_non_repeatable, repeat_key, is_non_transferable,
                includes_video_library, is_active, sort_order)
             VALUES ($1,$2,$3,$4,'MXN',$5,$6,$7,$8,$9,$10,false,false,true,$11)`,
            [p.name, p.description, p.price, p.opening_price, p.duration_days,
             p.class_limit, p.class_category, p.morning_only, p.is_non_repeatable,
             p.repeat_key, p.sort_order]
          );
        }
      }
```

> Esto corre incondicionalmente en cada arranque (idempotente), no solo si la
> tabla está vacía, para corregir DBs ya sembradas con datos viejos.

- [ ] **Step 2: Desactivar la tabla legacy `packages`**

Localizar el seed de `packages` (≈745-761, los INSERT de '2 Clases al mes' etc.) y reemplazar ese bloque de INSERT por:
```javascript
      // La tabla `packages` es legacy (solo display). La landing ahora lee de
      // `plans`. Desactivamos cualquier fila para no mostrar precios viejos.
      await pool.query(`UPDATE packages SET is_active = false`).catch(() => { });
```

- [ ] **Step 3: Verificar (DB limpia) — 17 planes correctos, packages vacío**

```bash
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT COUNT(*) FROM plans WHERE is_active;"
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT name, price, opening_price, class_limit, class_category, morning_only FROM plans WHERE is_active ORDER BY sort_order;"
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT COUNT(*) FROM packages WHERE is_active;"
```
Expected: 17 planes activos con los valores de la tabla canónica; 0 packages activos.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(catalogo): sembrar 17 paquetes Alma y desactivar packages legacy"
```

---

### Task 8: Wiring server — categoría, ventana matutina, precio efectivo, setting

**Files:**
- Modify: `server/index.js` — funciones `normalizeClassCategory`/`isMembershipCategoryCompatible` (≈2237-2259), booking (≈3559-3615), GET `/api/plans` público, POST `/api/orders` (≈4097-4206), `DEFAULT_GENERAL_SETTINGS` (≈59-73)

- [ ] **Step 1: Reemplazar las funciones inline por las del módulo**

Reemplazar la función local `normalizeClassCategory` (≈2237-2240) por una redirección al módulo (mantiene el nombre usado en todo el archivo):
```javascript
function normalizeClassCategory(value, fallback = "all") {
  return ruleNormalizeCategory(value, fallback);
}
```
Reemplazar la función local `isMembershipCategoryCompatible` (≈2253-2259) por:
```javascript
function isMembershipCategoryCompatible(membershipCategory, classCategory) {
  return ruleCategoryCompatible(membershipCategory, classCategory);
}
```

> No tocar `selectMembershipForClass`: ya filtra por `$2 = clsCat` y rankea
> match exacto → mixto → all, lo cual funciona con las categorías nuevas.

- [ ] **Step 2: Corregir el mensaje de error de categoría en booking**

Reemplazar (≈3609-3615):
```javascript
    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = clsCategory === "jumping" ? "Jumping" : "Pilates";
      return res.status(403).json({
        message: `Tu membresía no incluye clases de ${label}. Necesitas una membresía ${label} o Mixta.`,
      });
    }
```
por:
```javascript
    if (!isMembershipCategoryCompatible(membership.class_category, clsCategory)) {
      await client.query("ROLLBACK");
      const label = categoryLabel(clsCategory);
      return res.status(403).json({
        message: `Tu membresía no incluye clases de ${label}. Necesitas una membresía ${label}, Mixta o Unlimited.`,
      });
    }
```

- [ ] **Step 3: Enforcement de AM Club (morning_only) en booking**

`selectMembershipForClass` no devuelve `morning_only`. Tras el chequeo de
categoría (paso 2), añadir una verificación. Primero, ampliar el SELECT de
`selectMembershipForClass` (≈2265) para incluir el flag:
```javascript
            COALESCE(p.class_category, 'all') AS class_category,
            COALESCE(p.morning_only, false) AS morning_only,
```
(añadir la línea `morning_only` junto a `class_category` en el SELECT).
Luego, justo después del bloque de categoría en booking, insertar:
```javascript
    if (membership.morning_only && !isWithinMorningWindow(cls.starts_at)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        message: "Tu paquete AM Club solo permite reservar clases matutinas (hasta las 10:00 am).",
      });
    }
```

> `cls.starts_at` ya está disponible en ese scope (se usa en el chequeo de la
> ventana de 2h, ≈3559). Si `membership` no expone `morning_only` aquí, leerlo
> del objeto devuelto por `selectMembershipForClass`.

- [ ] **Step 4: Añadir el setting `opening_pricing_active`**

En `DEFAULT_GENERAL_SETTINGS` (≈59-73), añadir antes del cierre `}`:
```javascript
  opening_pricing_active: true,
```

- [ ] **Step 5: Exponer precio efectivo en GET `/api/plans` público**

Localizar el handler `GET /api/plans` (público, el que usa la landing — busca `queryKey: ["plans-public"]` en el front → endpoint `/plans`). Tras obtener las filas, mapear el precio efectivo. Reemplazar el `return res.json(...)` de ese handler por:
```javascript
    const general = await getSettingValueWithDefaults("general_settings");
    const openingActive = general?.opening_pricing_active !== false;
    const data = rows.map((p) => ({
      ...p,
      effective_price: resolveEffectivePrice(p, openingActive),
      opening_active: openingActive && p.opening_price != null,
    }));
    return res.json({ data });
```
(Adaptar `rows` al nombre real de la variable del handler.)

- [ ] **Step 6: Cobrar el precio efectivo en POST `/api/orders`**

En `POST /api/orders` (≈4104, tras `SELECT * FROM plans WHERE id=$1` → `plan`), calcular el monto efectivo y usarlo donde se calcula/inserta el total de la orden:
```javascript
    const general = await getSettingValueWithDefaults("general_settings");
    const effectivePrice = resolveEffectivePrice(plan, general?.opening_pricing_active !== false);
```
Usar `effectivePrice` en lugar de `plan.price` al construir el monto de la orden (buscar dónde se usa `plan.price` en ese handler y sustituir). Si el POS tiene su propio cálculo, aplicar el mismo helper.

- [ ] **Step 7: Verificar (DB limpia + curl)**

Relevantar server limpio. Luego:
```bash
curl -s http://localhost:8080/api/plans | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(len(d)); [print(p['name'], p['price'], p.get('effective_price'), p.get('opening_active')) for p in d if p.get('opening_price') is not None]"
```
Expected: 17 planes; los 3 ilimitados muestran `effective_price` = apertura (2300/2500/3500) y `opening_active=True`.

Apagar el modo apertura y re-verificar:
```bash
# obtener token admin: login del seed admin (ver docs/DEPLOY.md)
curl -s -X PUT http://localhost:8080/api/settings/general_settings \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"value":{"opening_pricing_active":false}}'
curl -s http://localhost:8080/api/plans | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; [print(p['name'], p.get('effective_price')) for p in d if p.get('opening_price') is not None]"
```
Expected: ahora `effective_price` = regular (2700/2900/3900). Volver a `true`.

- [ ] **Step 8: Correr tests de los módulos puros (regresión)**

Run: `node --test server/lib/`
Expected: PASS (todos).

- [ ] **Step 9: Commit**

```bash
git add server/index.js
git commit -m "feat(catalogo): gating por area, AM Club matutino y precio efectivo (modo apertura)"
```

---

### Task 9: Landing — catálogo real desde `/plans`, ocultar online y anillos

**Files:**
- Modify: `src/pages/Index.tsx`
- Test: `src/pages/Index.catalog.test.ts`

- [ ] **Step 1: Escribir el test de fuente que falla**

```ts
// src/pages/Index.catalog.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "Index.tsx"), "utf8");

describe("Landing catálogo Alma", () => {
  it("ya no contiene precios viejos de barre", () => {
    expect(src).not.toContain("Clase muestra Barre");
    expect(src).not.toMatch(/price:\s*230/);
    expect(src).not.toMatch(/price:\s*585/);
  });
  it("usa effective_price del backend", () => {
    expect(src).toContain("effective_price");
  });
  it("no renderiza la sección de planes online ni los anillos de marketing", () => {
    expect(src).not.toContain("<ProgresoSection");
    expect(src).not.toContain("ONLINE_PLANS.map");
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- Index.catalog`
Expected: FAIL (aún contiene los strings viejos / referencias).

- [ ] **Step 3: Reemplazar fallbacks y fuente de datos**

En `src/pages/Index.tsx`:
1. Borrar `FALLBACK_PACKAGES` (líneas ≈119-129), `FALLBACK_TRIAL_PLANS` (≈131-133) y reescribir el render de paquetes para usar `plansData.data` (que ya viene de `/plans`) agrupado por `class_category`. El mapeo por paquete usa: `p.name`, `p.class_limit` (sesiones; null = "Ilimitado"), `p.effective_price`, `p.duration_days`, `p.class_category`.
2. Sustituir la query de packages (`api.get("/packages")`, ≈405-408) por el uso directo de `plansData` ya existente (la query `plans-public` ≈354-358). Eliminar el estado `packages`/`setPackages` y su efecto.
3. En el render del listado de precios (≈1636-1691), reemplazar `monthlyPackages` por los planes agrupados; mostrar `Number(p.effective_price ?? p.price)`.

Bloque sugerido para derivar grupos (colocar junto a los `useMemo` existentes):
```tsx
type PlanRow = { id: string; name: string; description?: string; price: number; effective_price?: number; opening_active?: boolean; class_limit: number | null; duration_days: number; class_category: string; sort_order?: number };
const planRows: PlanRow[] = Array.isArray(plansData?.data) ? plansData.data : [];
const CATALOG_GROUPS: { key: string; title: string }[] = [
  { key: "studio", title: "Studio · Mat · Barre · Sculpt" },
  { key: "reformer_tower", title: "Reformer & Tower" },
  { key: "mixto", title: "Paquetes mixtos" },
  { key: "all", title: "Premium" },
];
const groupedPlans = CATALOG_GROUPS.map((g) => ({
  ...g,
  items: planRows
    .filter((p) => p.class_category === g.key)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
})).filter((g) => g.items.length > 0);
```
Y en el JSX, mapear `groupedPlans` → por grupo, listar `items` con
`item.effective_price ?? item.price`, sesiones = `item.class_limit ?? "Ilimitado"`,
vigencia = `item.duration_days`. (AM Club: mostrar nota "solo matutino" si el
nombre incluye "AM Club".)

- [ ] **Step 4: Ocultar sección online y anillos de marketing**

- Quitar el render `<ProgresoSection ... />` (≈1049). Dejar la definición del
  componente si se desea, pero NO renderizarlo (más simple: borrar también la
  definición ≈1256-1380 y el import de RingsTriple en línea 7).
- Quitar el bloque que hace `ONLINE_PLANS.map(...)` (≈1092-1154) y la constante
  `ONLINE_PLANS` (≈241-246).

- [ ] **Step 5: Correr el test y build**

Run: `npm test -- Index.catalog`
Expected: PASS.
Run: `npm run build`
Expected: build OK sin errores de tipos (si TS se queja por imports sin usar, eliminarlos).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Index.tsx src/pages/Index.catalog.test.ts
git commit -m "feat(catalogo): landing muestra catalogo real desde /plans; oculta online y anillos"
```

---

### Task 10: Admin — campos opening_price/morning_only, categorías nuevas, quitar anillos del form

**Files:**
- Modify: `src/pages/admin/plans/PlansList.tsx`, `src/pages/admin/settings/SettingsPage.tsx`, `server/index.js` (admin plans CRUD ≈9148-9236)

- [ ] **Step 1: Backend admin plans CRUD acepta opening_price + morning_only**

En `POST /api/admin/plans` (≈9148): añadir `opening_price, morning_only` al destructuring del body; cambiar `validCats` a `["studio","reformer_tower","mixto","all"]`; añadir las columnas al INSERT y a los params:
```javascript
    const { name, description, price, currency, duration_days, class_limit, class_category,
      features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key,
      opening_price, morning_only } = req.body;
    const validCats = ["studio", "reformer_tower", "mixto", "all"];
    const cat = validCats.includes(class_category) ? class_category : "all";
    const openingPrice = opening_price === "" || opening_price == null ? null : Number(opening_price);
    const morningOnly = parseBooleanFlag(morning_only);
```
INSERT (añadir columnas `opening_price, morning_only` y sus `$`):
```javascript
      `INSERT INTO plans
        (name, description, price, opening_price, currency, duration_days, class_limit, class_category, morning_only, features, is_active, sort_order, is_non_transferable, is_non_repeatable, repeat_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name.trim(), description || null, price, openingPrice, currency || "MXN",
       duration_days || 30, class_limit || null, cat, morningOnly,
       JSON.stringify(features || []), is_active ?? true, sort_order ?? 0,
       parseBooleanFlag(is_non_transferable), parseBooleanFlag(is_non_repeatable),
       (parseBooleanFlag(is_non_repeatable) ? String(repeat_key ?? "").trim() || null : null)]
```
(Se eliminan del INSERT los `ring_*_goal`, `reward_description`, `includes_video_library`; el server ya tiene defaults para esas columnas.)

Hacer el cambio análogo en `PUT /api/admin/plans/:id` (≈9183): `validCats` nuevo, añadir `opening_price = COALESCE($N, opening_price)` y `morning_only = COALESCE($N, morning_only)` al UPDATE, quitar los `ring_*`.

- [ ] **Step 2: Zod schema + parsing + form en PlansList.tsx**

`planSchema` (≈40-60): cambiar `classCategory` y añadir campos; quitar ring/reward:
```tsx
  classCategory: z.enum(["studio", "reformer_tower", "mixto", "all"]).default("studio"),
  openingPrice: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nullable()),
  morningOnly: z.boolean().default(false),
```
(borrar `ringConstanciaGoal`, `ringEsfuerzoGoal`, `ringConexionGoal`, `rewardDescription`.)

`normalizePlanRow` (≈68-108): añadir
```tsx
    openingPrice: (() => { const r = row?.openingPrice ?? row?.opening_price; return r == null || r === "" ? null : Number(r); })(),
    morningOnly: Boolean(row?.morningOnly ?? row?.morning_only ?? false),
```
y borrar las líneas `ring*`/`rewardDescription`.

Quitar el bloque JSX de "Metas de anillos por semana" (≈347-370 completo).
Añadir, junto a price/category, los inputs:
```tsx
<div className="space-y-1">
  <Label>Precio de apertura (opcional)</Label>
  <Input type="number" min={0} {...form.register("openingPrice")} />
</div>
<label className="flex items-center gap-2">
  <input type="checkbox" {...form.register("morningOnly")} />
  <span>Solo horario matutino (AM Club)</span>
</label>
```
Asegurar que el submit envía `opening_price: values.openingPrice` y
`morning_only: values.morningOnly` (mapear camelCase→snake_case como ya se hace
para los otros campos en el `onSubmit`/mutation).

- [ ] **Step 3: Toggle de modo apertura en Settings**

En `SettingsPage.tsx`, dentro del `SettingsSection settingKey="general_settings"` (≈727-739), añadir al array `fields`:
```tsx
    { key: "opening_pricing_active", label: "Precios de apertura activos", type: "boolean" },
```

- [ ] **Step 4: Build + lint**

Run: `npm run build && npm run lint`
Expected: OK. Corregir cualquier referencia restante a campos de anillos en PlansList.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/plans/PlansList.tsx src/pages/admin/settings/SettingsPage.tsx server/index.js
git commit -m "feat(catalogo): admin gestiona opening_price/morning_only y categorias nuevas; quita anillos del form"
```

---

### Task 11: Verificación integral end-to-end

**Files:** (sin cambios de código; solo verificación)

- [ ] **Step 1: Arranque limpio**

Borrar `.pgdata/`, luego `npm run db:local` (term 1) + `npm run db:schema` + `DATABASE_URL=... npm start` (term 2).
Expected: arranca sin errores; consola muestra `🚀 Alma API + Frontend`.

- [ ] **Step 2: Catálogo correcto vía API**

```bash
curl -s http://localhost:8080/api/plans | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('planes', len([p for p in d]))"
curl -s http://localhost:8080/api/class-types | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print('disciplinas', len(d), sorted(c['name'] for c in d))"
curl -s http://localhost:8080/api/packages | python3 -c "import sys,json; print('packages', len(json.load(sys.stdin)['data']))"
```
Expected: 17 planes; 5 disciplinas (Barre, Pilates Mat, Pilates Reformer, Pilates Tower, Sculpt); 0 packages.

- [ ] **Step 3: Frontend**

Abrir `http://localhost:8080/` (la landing). Verificar visualmente: la sección de precios muestra Studio / Reformer&Tower / Mixtos / Premium con los precios correctos (ilimitados en precio de apertura); NO aparece la sección de planes online ni el bloque de anillos. Tomar screenshot.

- [ ] **Step 4: Suite de tests**

Run: `node --test server/lib/ && npm test && npm run build`
Expected: todos PASS; build OK.

- [ ] **Step 5: Commit del checkpoint de catálogo**

```bash
git add -A && git commit -m "test(catalogo): verificacion integral del catalogo" --allow-empty
```

> NO cerrar la rama todavía: continúan las Tasks 12–15 (anillos). El cierre
> (`superpowers:finishing-a-development-branch`) va tras la verificación final
> de la Task 15.

---

### Task 12: Frontend — quitar anillos de Dashboard, Wallet y ClientDetail; borrar RingsTriple

**Files:**
- Modify: `src/pages/client/Dashboard.tsx` (import ≈10, sección ≈204-230, cómputo ≈104-154)
- Modify: `src/pages/client/Wallet.tsx` (import ≈19, sección ≈268-309, cómputo ≈128-291)
- Modify: `src/pages/admin/clients/ClientDetail.tsx` (tab "rings" + form ≈411-467)
- Delete: `src/components/alma/RingsTriple.tsx`
- Test: `src/pages/client/Dashboard.rings.test.ts`

- [ ] **Step 1: Test de fuente que falla**

```ts
// src/pages/client/Dashboard.rings.test.ts
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(resolve(here, p), "utf8");

describe("anillos eliminados del producto", () => {
  it("Dashboard y Wallet no importan RingsTriple", () => {
    expect(read("Dashboard.tsx")).not.toContain("RingsTriple");
    expect(read("Wallet.tsx")).not.toContain("RingsTriple");
  });
  it("ClientDetail no tiene tab de anillos", () => {
    expect(read("../admin/clients/ClientDetail.tsx")).not.toContain("Conexión");
  });
  it("el componente RingsTriple ya no existe", () => {
    expect(existsSync(resolve(here, "../../components/alma/RingsTriple.tsx"))).toBe(false);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npm test -- Dashboard.rings`
Expected: FAIL.

- [ ] **Step 3: Quitar los anillos de cada archivo**

Leer cada archivo y eliminar: el import de `RingsTriple`/`ALMA_RING_COLORS`/`AlmaRing`, el bloque JSX que renderiza `<RingsTriple .../>` con su `Section`/contenedor, y la lógica (`useMemo`/cálculos) que solo alimenta a los anillos. En `Dashboard.tsx` quitar la `<Section title="Tres anillos">…</Section>` completa y el `useMemo` de `rings`. En `Wallet.tsx` quitar el contenedor del `RingsTriple` y el cómputo `ringsState`. En `ClientDetail.tsx` quitar el `<TabsTrigger>`/`<TabsContent>` de "rings" y el form "Sumar puntos de Conexión" (incluida la llamada a `/api/admin/rings/community-events`).

- [ ] **Step 4: Borrar el componente**

```bash
git rm src/components/alma/RingsTriple.tsx
```

- [ ] **Step 5: Test + build**

Run: `npm test -- Dashboard.rings && npm run build`
Expected: PASS y build OK (no quedan importadores de RingsTriple).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(anillos): eliminar anillos de dashboard, wallet y client detail"
```

---

### Task 13: Server — eliminar endpoints, lógica y notificaciones de anillos

**Files:**
- Modify: `server/index.js` — endpoints `/api/me/rings` (≈4418-4474), `/api/admin/rings/users/:id` (≈4940-4981), `/api/admin/rings/community-events` (≈4984-5002); funciones `getAlmaWeeklyRingState` (≈5901-5940), `getAlmaWeeklyRingStateForUser` (≈5942-5993), `notifyWeekReset` (≈6918-6920); `runWeekResetCron` (≈17008-17026) y su registro en `scheduleEmailCrons` (≈17059); plantillas `rings_closed` y `motivation_*` (≈237-268)

- [ ] **Step 1: Eliminar los 3 endpoints de anillos**

Leer cada handler y borrar el bloque `app.get/post(...)` completo de los 3 endpoints de rings. Cualquier referencia en el frontend ya fue eliminada en Task 12.

- [ ] **Step 2: Eliminar funciones de cómputo de anillos**

Borrar `getAlmaWeeklyRingState`, `getAlmaWeeklyRingStateForUser` y `notifyWeekReset`. Buscar (`grep -n "getAlmaWeeklyRingState\|notifyWeekReset\|runWeekResetCron" server/index.js`) y eliminar todos los llamadores (en snapshots de wallet/check-in, usar el dato de membresía sin anillos).

- [ ] **Step 3: Desactivar el cron de reset semanal de anillos**

Quitar `runWeekResetCron` y su llamada dentro de `scheduleEmailCrons` (la rama "lunes 00:00").

- [ ] **Step 4: Reescribir/eliminar plantillas con "anillos"**

En las plantillas de notificación (≈172-300), reescribir `class_attended`, `motivation_*` para no mencionar anillos, y eliminar `rings_closed`. Quitar referencias a `rings_closed` donde se dispare.

- [ ] **Step 5: Verificar arranque limpio**

```bash
DATABASE_URL=postgres://alma:alma@127.0.0.1:5433/alma npm start
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/me/rings   # esperado 404
```
Expected: server arranca sin errores; `/api/me/rings` ya no existe (404).

- [ ] **Step 6: Commit**

```bash
git add server/index.js
git commit -m "feat(anillos): eliminar endpoints, computo y notificaciones de anillos del server"
```

---

### Task 14: Server — neutralizar el strip del pase de Apple Wallet (sin anillos)

**Files:**
- Modify: `server/index.js` — `arcPath`/`buildAlmaStripSvg` (≈6987-7100+), bloques de anillos en pase email/QR (≈5370-5382, ≈7408-7420, ≈7491-7503, ≈8073-8075)

- [ ] **Step 1: Reemplazar el contenido del strip por marca + clases restantes**

Leer `buildAlmaStripSvg(ringState, scale, opts)` y reemplazar su cuerpo por un strip simple: fondo de marca + nombre del plan + "clases restantes" (o "Ilimitado") + logo, sin arcos de anillos. Mantener la firma para no romper llamadores; ignorar `ringState`. Borrar `arcPath` si queda sin uso.

- [ ] **Step 2: Quitar campos de anillos del pase email/QR**

En los bloques que renderizan `ring_constancia/esfuerzo/conexion` (≈5370-5382, ≈8073-8075, etc.), eliminar esos campos del HTML/JSON del pase.

- [ ] **Step 3: Verificar que el pase aún se genera**

Levantar server, autenticarse como alumna de prueba y pedir el pase (endpoint del pkpass/wallet, p.ej. el que usa la página Wallet). Verificar respuesta 200 y que el archivo se construye sin error en consola.

```bash
# revisar logs del server: no debe haber excepción al construir el strip
```
Expected: pase generado, sin anillos, sin errores.

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(anillos): strip del pase de wallet sin anillos (marca + clases restantes)"
```

---

### Task 15: DB — migración para eliminar tablas, columnas y triggers de anillos

**Files:**
- Create: `supabase/migrations/2026-06-07_drop_rings.sql`
- Modify: `server/index.js` — quitar de `ensureSchema` el CREATE de `ring_states`/triggers/funciones (≈1361-1612) y los `ALTER TABLE plans ADD COLUMN ring_*_goal`/`reward_description` (≈868-871)

- [ ] **Step 1: Escribir la migración de drop (idempotente)**

```sql
-- supabase/migrations/2026-06-07_drop_rings.sql
-- Elimina la feature de anillos (gamificación) por completo.
DROP TRIGGER IF EXISTS trg_bookings_recalculate_alma_rings ON bookings;
DROP TRIGGER IF EXISTS trg_community_events_recalculate_alma_rings ON community_events;
DROP TRIGGER IF EXISTS trg_ring_states_wallet_queue ON ring_states;
DROP TRIGGER IF EXISTS trg_ring_states_updated_at ON ring_states;
DROP FUNCTION IF EXISTS recalculate_alma_rings_on_checkin() CASCADE;
DROP FUNCTION IF EXISTS recalculate_alma_rings_on_community_event() CASCADE;
DROP FUNCTION IF EXISTS enqueue_wallet_update_from_ring_state() CASCADE;
DROP FUNCTION IF EXISTS update_ring_states_updated_at() CASCADE;
DROP TABLE IF EXISTS ring_states CASCADE;
DROP TABLE IF EXISTS community_events CASCADE;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_constancia_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_esfuerzo_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS ring_conexion_goal;
ALTER TABLE plans DROP COLUMN IF EXISTS reward_description;
```

> Aplicar también el archivo a la lista de migraciones idempotentes en
> `scripts/db-apply-schema.cjs` si lleva un registro explícito.

- [ ] **Step 2: Quitar la creación de anillos de ensureSchema**

Borrar de `server/index.js` el bloque que crea `ring_states` + sus índices + triggers + funciones (≈1361-1612) y los 4 `ALTER TABLE plans ADD COLUMN ring_*` / `reward_description` (≈868-871). Borrar también la migración vieja del repo `supabase/migrations/20260506_alma_progress_rings.sql` (o dejarla pero asegurar que el drop corre después).

- [ ] **Step 3: Verificar arranque limpio y tablas eliminadas**

Borrar `.pgdata/`, relevantar db:local + db:schema + start. Luego:
```bash
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "SELECT to_regclass('public.ring_states'), to_regclass('public.community_events');"
PGPASSWORD=alma psql -h 127.0.0.1 -p 5433 -U alma -d alma -c "\d plans" | grep -i ring || echo "sin columnas ring"
```
Expected: ambas `regclass` = NULL; "sin columnas ring".

- [ ] **Step 4: Commit**

```bash
git add server/index.js supabase/migrations/2026-06-07_drop_rings.sql scripts/db-apply-schema.cjs
git commit -m "feat(anillos): migracion drop de tablas/columnas/triggers de anillos"
```

---

## Fuera de este plan (planes siguientes)

- **Fase 2 — Limpieza de marca**: tokens `ophelia-*`, README, `index.html`,
  CSS `prose-ophelia`, `.lovable/plan.md`, footer email, placeholder POS,
  dirección y datos bancarios reales (requiere input de la dueña).
- **Fase 3 — Rediseño visual** premium/luxury (brainstorm aparte con mockups).
```
