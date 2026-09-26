# Landing de HIVE — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la landing de Alma en `/` por una landing oscura de HIVE Pilates Studio, sin fotos ni Alma, con horario, paquetes, clases, coaches y contacto reales.

**Architecture:**
- **Página:** `src/pages/landing/Landing.tsx` hace las consultas (react-query) y compone secciones sin estado de datos propio.
- **Secciones:** viven en `src/components/landing/` y reciben props.
- **Lógica pura:** normalizar clases, semana, lugares, paquetes y destinos de botones; vive en `landingData.ts`, con pruebas unitarias.
- **Tema y colores:** la ruta `/` pasa al tema oscuro; todo el color va en clases por tema (spec 2026-09-25), bajo la guardia de zona.

**Tech Stack:** React 18, React Router 6, @tanstack/react-query 5, Tailwind 3.4, date-fns, lucide-react, vitest + Testing Library (jsdom), sharp (script de marca).

**Spec:** `docs/superpowers/specs/2026-09-26-hive-landing-design.md` (maqueta en `docs/superpowers/specs/assets/hive-landing/mockup-landing.html`).

## Global Constraints

- **Worktree:** `/Users/saidromero/Alma Studio/alma-hive-landing`, rama `hive-landing`, base 3ea261b. `node_modules` es un enlace compartido: **nunca** `npm install`.
- Nada de push, merge, producción ni bases de datos reales. Las bases desechables van siempre con `DATABASE_URL` explícito a 127.0.0.1.
- Commits en español (`feat(hive): …`, `fix(hive): …`) que terminan con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Color:** sólo en clases por tema, nunca hex ni `COLOR` en la zona.
  - Texto claro nunca sobre terracota: sobre `bg-accent`/`bg-accent-gradient` va `text-accent-foreground`.
  - Terracota como texto (`text-accent`) está permitida porque la landing es oscura.
  - Opacidades sólo en pasos de 5 o `/8`.
  - Texto de 12 px o más (`text-[0.75rem]` mínimo).
  - Controles de 44 px (`min-h-[44px]`, `h-11 w-11`).
- **Tarjetas:** `rounded-[18px] border border-line bg-surface/70`. Botón principal: `PrimaryButton` (degradado en oscuro).
- **Textos aprobados:**
  - Eyebrow: "Pilates Reformer · Coyoacán". Titular: "Entra. Muévete." / "Sal más fuerte.".
  - Frase: "Grupos de 6 en un espacio urbano con carácter. Una colmena que se mueve junta, desde las 6 de la mañana."
  - Lema: "MOVIMIENTO · BIENESTAR · COMUNIDAD".
- **Nunca en la landing:** "Alma", "Juriquilla", "Querétaro", testimonios, precios escritos en código, imports de `src/assets/alma`.
- **Pruebas:**
  - Enfocada: `npx vitest run <archivo>`.
  - Suite: `npx vitest run`.
  - Tipos: `npx tsc --noEmit -p tsconfig.app.json` (el error preexistente de `AdminLayout.tsx:202` `aliases` y el de supabase se ignoran; cualquier otro es tuyo).
  - Build: `VITE_API_URL=/api npx vite build`.

## Review Focus

1. **Fechas del servidor en ISO con zona (`start_time: "2026-09-28T06:00:00.000Z"`) o sólo hora (`"06:00:00"`):** la clase debe caer en el día de `date`/`class_date`, no correrse de día. `normalizeClasses` usa primero `date`/`class_date` (prueba en Tarea 4).
2. **Precios de Postgres como texto (`"1080.00"`) y `effectivePrice` ausente:** se leen como números; sin apertura no hay tachado (prueba en Tarea 4).
3. **Capacidad 0 o `current_bookings` ausente:** nunca "−1 lugares"; capacidad 0 cuenta como llena (prueba en Tarea 4).
4. **Staff con sesión en la landing:** el menú dice "Panel" y el botón de la portada lleva al panel, no a la compra de la clienta (prueba en Tarea 4).
5. **`returnUrl` externo o raro (`https://…`, `//evil.com`, `/admin`):** se ignora y se va a `/app` (prueba en Tarea 2).

---

## Ejecución en paralelo

| Ola | Tareas | Archivos disjuntos |
|---|---|---|
| 1 | 1 · 2 · 3 · 4 | sí |
| 2 | 5 · 6 · 7 | sí (consumen `landingData.ts` de la Tarea 4 y `STUDIO` de la Tarea 1) |
| 3 | 8 | página, ruta, borrados y guardia de zona |
| 4 | 9 | verificación |

---

### Task 1: Datos de contacto de HIVE y WhatsApp condicional

**Files:**
- Modify: `src/lib/studio.ts`
- Modify: `src/pages/client/Profile.tsx` (~146–160, fila "Escríbenos por WhatsApp")
- Modify: `src/pages/legal/LegalLayout.tsx` (~98–124, lista de contacto)
- Test: `src/lib/studio.test.ts` (nuevo)

**Interfaces:**
- Produces: `STUDIO` con `name: string`, `address: string`, `mapsUrl: string`, `instagram: string` (sin @), `whatsapp: string | null`, `phone: string | null`, `hours: string`; y `whatsappUrl(text?: string): string | null`, `instagramUrl: string`.

- [ ] **Step 1: Prueba en rojo** — crear `src/lib/studio.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { STUDIO, whatsappUrl, instagramUrl } from "./studio";

const root = path.resolve(__dirname, "..", "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

describe("datos del estudio (HIVE)", () => {
  it("son los de HIVE en Coyoacán", () => {
    expect(STUDIO.name).toBe("HIVE Pilates Studio");
    expect(STUDIO.address).toBe("Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX");
    expect(STUDIO.mapsUrl).toBe("https://maps.app.goo.gl/6KvMNWPZk35siB4fA");
    expect(STUDIO.instagram).toBe("hive.pilates");
    expect(STUDIO.hours).toBe("6 AM a 9 PM");
    expect(instagramUrl).toBe("https://www.instagram.com/hive.pilates");
  });
  it("sin número de WhatsApp no hay liga", () => {
    expect(STUDIO.whatsapp).toBeNull();
    expect(whatsappUrl("Hola")).toBeNull();
  });
  it("no quedan datos de Alma", () => {
    const src = read("src/lib/studio.ts");
    expect(src).not.toMatch(/Alma|Juriquilla|Querétaro|movementalma|7721119216/);
  });
  it("perfil y legales sólo muestran WhatsApp si hay número", () => {
    expect(read("src/pages/client/Profile.tsx")).not.toMatch(/wa\.me\/\$\{STUDIO\.whatsapp\}/);
    expect(read("src/pages/legal/LegalLayout.tsx")).not.toMatch(/wa\.me\/\$\{STUDIO\.whatsapp\}/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run src/lib/studio.test.ts`
Expected: FAIL (dirección de Juriquilla; `whatsappUrl` no existe).

- [ ] **Step 3: Implementar** — reemplazar `src/lib/studio.ts` completo:

```ts
// Datos públicos de HIVE Pilates Studio: única fuente de verdad para contacto
// y dirección en landing, app y legales. Importar desde aquí, nunca hardcodear.
// Fuente: cuestionario del estudio (2026-09-25). WhatsApp y teléfono: pendientes.
export const STUDIO = {
  name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  mapsUrl: "https://maps.app.goo.gl/6KvMNWPZk35siB4fA",
  instagram: "hive.pilates",
  whatsapp: null as string | null,
  phone: null as string | null,
  hours: "6 AM a 9 PM",
} as const;

export const instagramUrl = `https://www.instagram.com/${STUDIO.instagram}`;

/** Liga de WhatsApp, o null mientras el estudio no comparta número. */
export const whatsappUrl = (text?: string): string | null =>
  STUDIO.whatsapp ? `https://wa.me/${STUDIO.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
```

En `src/pages/client/Profile.tsx`:
- Cambiar el import a `import { STUDIO, whatsappUrl } from "@/lib/studio";`, o sólo `whatsappUrl` si `STUDIO` queda sin uso. Revisa el resto del archivo antes de quitarlo.
- Envolver la fila de WhatsApp para que sólo exista con número:

```tsx
            {whatsappUrl() && (
              <ListRow
                onClick={() => window.open(whatsappUrl()!, "_blank", "noopener")}
                asButton
                icon={<MessageCircle size={17} strokeWidth={1.7} />}
                iconTint="success"
                title="Escríbenos por WhatsApp"
                /* …resto de props de la fila tal como están… */
              />
            )}
```

En `src/pages/legal/LegalLayout.tsx`, importar `whatsappUrl` junto a `STUDIO` y envolver el `<li>` de WhatsApp:

```tsx
    {whatsappUrl() && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>WhatsApp:</strong>{" "}
        <a
          href={whatsappUrl()!}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: COLOR.accentStrong }}
        >
          escríbenos por WhatsApp
        </a>
      </li>
    )}
```

(Las legales siguen claras con su `COLOR` en línea: están fuera de la zona hasta el sub-proyecto A.)

- Si algún otro archivo usa `STUDIO.facebook`: `grep -rn "STUDIO.facebook" src`. Si sólo aparece en `src/pages/Index.tsx` (que la Tarea 8 borra) o en ninguno, no lo agregues.
- `src/components/Schedule.tsx` e `Index.tsx` usan `STUDIO.whatsapp` en ligas, pero la Tarea 8 los borra. **No los toques aquí.**

- [ ] **Step 4: Verde** — `npx vitest run src/lib/studio.test.ts src/pages/client` → PASS. `npx tsc --noEmit -p tsconfig.app.json` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/studio.ts src/lib/studio.test.ts src/pages/client/Profile.tsx src/pages/legal/LegalLayout.tsx
git commit -m "feat(hive): datos de contacto de HIVE en Coyoacán; WhatsApp sólo con número

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: El registro y la bienvenida regresan a la clase elegida

**Files:**
- Create: `src/lib/returnUrl.ts`, `src/lib/returnUrl.test.ts`
- Modify: `src/pages/auth/Register.tsx` (~66–100), `src/pages/auth/Onboarding.tsx` (~74, ~109), `src/pages/auth/Login.tsx` (~124, liga "Crear cuenta nueva")

**Interfaces:**
- Produces: `safeReturnUrl(raw: string | null | undefined): string | null`. Devuelve la ruta sólo si empieza con `/app` (exacto o `/app/…` o `/app?…`) y no contiene `//` ni `\`; si no, `null`. También `withReturnUrl(path: string, returnUrl: string | null): string`.

- [ ] **Step 1: Prueba en rojo** — `src/lib/returnUrl.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { safeReturnUrl, withReturnUrl } from "./returnUrl";

describe("returnUrl seguro", () => {
  it("acepta rutas internas de la app", () => {
    expect(safeReturnUrl("/app")).toBe("/app");
    expect(safeReturnUrl("/app/classes/abc-123")).toBe("/app/classes/abc-123");
    expect(safeReturnUrl("/app/checkout?plan=1")).toBe("/app/checkout?plan=1");
  });
  it("ignora externas, raras o fuera de la app", () => {
    for (const bad of [null, undefined, "", "https://evil.com", "//evil.com", "/\\evil.com", "/admin", "/application", "app/classes", "/app//evil.com"]) {
      expect(safeReturnUrl(bad as string | null)).toBeNull();
    }
  });
  it("agrega el regreso a una ruta", () => {
    expect(withReturnUrl("/auth/onboarding", "/app/classes/1")).toBe("/auth/onboarding?returnUrl=%2Fapp%2Fclasses%2F1");
    expect(withReturnUrl("/auth/onboarding", null)).toBe("/auth/onboarding");
  });
});
```

Y una prueba de fuente de los tres archivos en el mismo archivo:

```ts
import fs from "fs";
import path from "path";
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, "..", "..", f), "utf8");

describe("registro, bienvenida y login respetan returnUrl", () => {
  it("Register lee returnUrl y lo pasa a la bienvenida o navega a él", () => {
    const src = read("src/pages/auth/Register.tsx");
    expect(src).toContain("safeReturnUrl(params.get(\"returnUrl\"))");
    expect(src).toMatch(/withReturnUrl\("\/auth\/onboarding", returnUrl\)/);
  });
  it("Onboarding navega a returnUrl al terminar", () => {
    expect(read("src/pages/auth/Onboarding.tsx")).toMatch(/navigate\(returnUrl \?\? "\/app"\)/);
  });
  it("Login conserva returnUrl en la liga de crear cuenta", () => {
    expect(read("src/pages/auth/Login.tsx")).toMatch(/withReturnUrl\("\/auth\/register", safeReturnUrl\(params\.get\("returnUrl"\)\)\)/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/lib/returnUrl.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — `src/lib/returnUrl.ts`:

```ts
/** Sólo rutas internas de la app de clienta: evita redirecciones abiertas. */
export function safeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!/^\/app(?:[/?#]|$)/.test(raw)) return null;
  if (raw.includes("//") || raw.includes("\\")) return null;
  return raw;
}

export const withReturnUrl = (path: string, returnUrl: string | null) =>
  returnUrl ? `${path}?returnUrl=${encodeURIComponent(returnUrl)}` : path;
```

`src/pages/auth/Register.tsx`:
- Importar `import { safeReturnUrl, withReturnUrl } from "@/lib/returnUrl";`.
- Junto a `const [params] = useSearchParams();`, agregar `const returnUrl = safeReturnUrl(params.get("returnUrl"));`.
- Reemplazar la navegación tras registrar:

```tsx
      // Con el cuestionario apagado (paridad con Velan) se entra directo a la app.
      navigate(FEATURES.onboarding ? withReturnUrl("/auth/onboarding", returnUrl) : (returnUrl ?? "/app"));
```

`src/pages/auth/Onboarding.tsx`:
- Importar `useSearchParams` y `safeReturnUrl`.
- Junto a `const navigate = useNavigate();`: `const [params] = useSearchParams(); const returnUrl = safeReturnUrl(params.get("returnUrl"));`.
- Cambiar `navigate("/app");` (~109) por `navigate(returnUrl ?? "/app");`.

`src/pages/auth/Login.tsx`: importar `safeReturnUrl, withReturnUrl` y cambiar la liga de ~124:

```tsx
        <AuthSecondaryLink to={withReturnUrl("/auth/register", safeReturnUrl(params.get("returnUrl")))}>Crear cuenta nueva</AuthSecondaryLink>
```

(`params` ya existe en `Login.tsx`.)

- [ ] **Step 4: Verde** — `npx vitest run src/lib/returnUrl.test.ts src/pages/auth src/components/auth` → PASS; `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/returnUrl.ts src/lib/returnUrl.test.ts src/pages/auth/Register.tsx src/pages/auth/Onboarding.tsx src/pages/auth/Login.tsx
git commit -m "feat(hive): registro y bienvenida regresan a la clase elegida (returnUrl seguro)

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `/` en oscuro, metadatos de HIVE e imagen para compartir

**Files:**
- Modify: `src/design/theme.ts:15`, `src/design/theme.test.tsx:16-23`, `src/design/wiring.test.ts:80`
- Modify: `index.html` (script de tema ~17, `<title>` ~34, `description`, `og:*`, `twitter:*` ~35–49)
- Modify: `scripts/brand-assets.mjs` (objetivo `og-image.png` rectangular), `scripts/brand-assets.test.mjs`
- Regenerate: `public/og-image.png`

**Interfaces:**
- Produces: `themeForPath("/") === "dark"`. La regla de tema es `/^\/(?:(?:app|auth)(?:\/|$)|$)/`, igual en `theme.ts` y en `index.html`.

- [ ] **Step 1: Pruebas en rojo**
  - `theme.test.tsx`: cambiar el nombre y el caso del `it` de rutas:

```ts
  it("la ruta decide el tema: landing, app y acceso oscuros; lo demás claro", () => {
    expect(themeForPath("/")).toBe("dark");
    expect(themeForPath("/app")).toBe("dark");
    expect(themeForPath("/app/wallet")).toBe("dark");
    expect(themeForPath("/auth/login")).toBe("dark");
    expect(themeForPath("/admin/dashboard")).toBe("light");
    expect(themeForPath("/legal/privacidad")).toBe("light");
    expect(themeForPath("/application")).toBe("light");
  });
```

  - `wiring.test.ts:80`: `expect(script).toContain("/^\\/(?:(?:app|auth)(?:\\/|$)|$)/");`. En el mismo archivo, agregar:

```ts
  it("metadatos de la landing son de HIVE", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain("<title>HIVE Pilates Studio · Pilates Reformer en Coyoacán</title>");
    expect(head).toContain('content="Pilates Reformer en grupos de 6 en Coyoacán, CDMX. Reserva tu clase muestra."');
    expect(head).not.toMatch(/Alma|Juriquilla|Querétaro/);
  });
```

  - `brand-assets.test.mjs`: en la primera prueba, comparar con `t.width ?? t.size` y `t.height ?? t.size`, y agregar:

```js
test("og-image.png es 1200×630, carbón con el hexágono terracota al centro", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hive-assets-"));
  await generate(dir);
  const { data, info } = await sharp(path.join(dir, "og-image.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  const px = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]]; };
  assert.deepEqual(px(8, 8), rgbOf(DARK.canvas));
  // Mismo punto relativo del hexágono que la prueba del ícono (a la derecha del rayo y sobre la corona).
  assert.ok(near(px(632, 201), rgbOf(DARK.accent)), `el hexágono no es terracota: ${px(632, 201)}`);
});
```

- [ ] **Step 2: Correr y ver que fallan**
  - Run: `npx vitest run src/design/theme.test.tsx src/design/wiring.test.ts` → FAIL.
  - Run: `node --test scripts/brand-assets.test.mjs` → FAIL (no hay `og-image.png`).

- [ ] **Step 3: Implementar**
  - `theme.ts:15`:

```ts
/** Landing (`/` exacto), app y acceso van en oscuro; panel y legales en claro. */
export const themeForPath = (path: string): Theme => (/^\/(?:(?:app|auth)(?:\/|$)|$)/.test(path) ? "dark" : "light");
```

  - `index.html`, en el script de primera pintada: `var dark = /^\/(?:(?:app|auth)(?:\/|$)|$)/.test(location.pathname);`.
  - Metadatos:

```html
    <title>HIVE Pilates Studio · Pilates Reformer en Coyoacán</title>
    <meta name="description" content="Pilates Reformer en grupos de 6 en Coyoacán, CDMX. Reserva tu clase muestra." />
    <meta property="og:title" content="HIVE Pilates Studio" />
    <meta property="og:description" content="Pilates Reformer en grupos de 6 en Coyoacán, CDMX. Reserva tu clase muestra." />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:title" content="HIVE Pilates Studio" />
    <meta name="twitter:description" content="Pilates Reformer en grupos de 6 en Coyoacán, CDMX." />
```

  Reemplaza las líneas equivalentes existentes, sin duplicarlas. Si alguna otra etiqueta del `<head>` dice "Alma", cámbiala a "HIVE Pilates Studio" (el manifiesto y los archivos `alma-*` no se tocan).

  - `scripts/brand-assets.mjs`:
    - Agregar al final de `TARGETS`: `{ file: "og-image.png", width: 1200, height: 630, fg: DARK.accent, bg: DARK.canvas, pad: 0.22 },`.
    - Adaptar `render` a objetivos rectangulares:

```js
async function render({ size, width = size, height = size, fg, bg, pad }) {
  const svg = fs.readFileSync(svgPath, "utf8").replace(/currentColor/g, fg);
  const inner = Math.round(Math.min(width, height) * (1 - pad * 2));
  const mark = await sharp(Buffer.from(svg), { density: 384 })
    .resize({ height: inner, width: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const base = sharp({
    create: {
      width, height, channels: 4,
      background: bg ? { r: parseInt(bg.slice(1, 3), 16), g: parseInt(bg.slice(3, 5), 16), b: parseInt(bg.slice(5, 7), 16), alpha: 1 } : { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  return base.composite([{ input: mark, gravity: "center" }]).png().toBuffer();
}
```

  - Regenerar: `node scripts/brand-assets.mjs`. Reescribe `public/`, incluida `og-image.png`. Luego revisa `git status public/`: sólo debe cambiar `og-image.png`. Si cambian otras imágenes, es ruido de compresión: restáuralas con `git checkout -- public/<archivo>`.

- [ ] **Step 4: Verde** — `npx vitest run src/design` → PASS; `node --test scripts/brand-assets.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/design/theme.ts src/design/theme.test.tsx src/design/wiring.test.ts index.html scripts/brand-assets.mjs scripts/brand-assets.test.mjs public/og-image.png
git commit -m "feat(hive): la landing va en oscuro; título, descripción e imagen para compartir de HIVE

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Lógica pura de la landing (`landingData.ts`)

**Files:**
- Create: `src/components/landing/landingData.ts`, `src/components/landing/landingData.test.ts`

**Interfaces (produce; las Tareas 5–8 las consumen tal cual):**

```ts
export const STAFF_ROLES: readonly string[];            // ["admin","super_admin","instructor","reception"]
type SessionUser = { role: string } | null;
export function accountLink(user: SessionUser, isAuthenticated: boolean): { to: string; label: "Entrar" | "Mi cuenta" | "Panel" };
export function heroCta(user: SessionUser, isAuthenticated: boolean): { to: string; label: string };

export type ApiClass = { id: string; date?: string; class_date?: string; start_time?: string; end_time?: string;
  class_type_name?: string; instructor_name?: string; capacity?: number; max_capacity?: number;
  current_bookings?: number; status?: string };
export type LandingClass = { id: string; day: string; start: string; end: string; name: string; coach: string;
  durationMin: number | null; capacity: number; remaining: number };
export function normalizeClasses(raw: ApiClass[], now: Date): LandingClass[];
export function weekStartFor(now: Date): Date;                       // lunes 00:00; domingo ≥ 12:00 → lunes siguiente
export type WeekDay = { iso: string; weekday: string; dayNum: string };
export function weekDays(start: Date): WeekDay[];                    // 7 días, weekday "LUN".."DOM"
export function groupByDay(classes: LandingClass[]): Record<string, LandingClass[]>;
export function defaultDay(days: WeekDay[], byDay: Record<string, LandingClass[]>, todayIso: string): string;
export type Availability = { label: string; full: boolean; scarce: boolean };
export function availability(c: LandingClass): Availability;

export type PlanRow = { id: string; name: string; description?: string | null; price: number | string;
  effectivePrice?: number | string; effective_price?: number | string; openingActive?: boolean; opening_active?: boolean;
  classLimit?: number | null; class_limit?: number | null; durationDays?: number | null; duration_days?: number | null;
  isNonRepeatable?: boolean; is_non_repeatable?: boolean; sortOrder?: number | null; sort_order?: number | null };
export type LandingPlan = { id: string; name: string; description: string | null; price: number; finalPrice: number;
  opening: boolean; classLimit: number | null; perClass: number | null; durationDays: number | null; nonRepeatable: boolean };
export function toLandingPlan(p: PlanRow): LandingPlan;
export function splitPlans(raw: PlanRow[]): { trial: LandingPlan | null; rest: LandingPlan[] };

export type ClassTypeRow = { id: string; name: string; subtitle?: string | null; description?: string | null;
  durationMin?: number | null; durationMinutes?: number | null };
export type CoachRow = { id: string; displayName: string; specialties?: unknown; photoUrl?: string | null };
export function specialtiesText(s: unknown): string;
export function classTypeDuration(t: ClassTypeRow): number | null;
```

- [ ] **Step 1: Prueba en rojo** — `src/components/landing/landingData.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  accountLink, heroCta, normalizeClasses, weekStartFor, weekDays, groupByDay, defaultDay,
  availability, toLandingPlan, splitPlans, specialtiesText, classTypeDuration, type ApiClass, type LandingClass,
} from "./landingData";

const client = { role: "client" };
const staff = { role: "reception" };

describe("destinos según la sesión", () => {
  it("menú: Entrar, Mi cuenta o Panel", () => {
    expect(accountLink(null, false)).toEqual({ to: "/auth/login", label: "Entrar" });
    expect(accountLink(client, true)).toEqual({ to: "/app", label: "Mi cuenta" });
    expect(accountLink(staff, true)).toEqual({ to: "/admin/dashboard", label: "Panel" });
    expect(accountLink(client, false)).toEqual({ to: "/auth/login", label: "Entrar" });
  });
  it("portada: registro con regreso a comprar; clienta a comprar; staff al panel", () => {
    expect(heroCta(null, false)).toEqual({ to: "/auth/register?returnUrl=%2Fapp%2Fcheckout", label: "Reserva tu clase muestra" });
    expect(heroCta(client, true)).toEqual({ to: "/app/checkout", label: "Reserva tu clase muestra" });
    expect(heroCta(staff, true)).toEqual({ to: "/admin/dashboard", label: "Ir al panel" });
  });
});

const now = new Date(2026, 8, 23, 7, 30); // mié 23 sep 2026 07:30 (hora local)
const raw: ApiClass[] = [
  { id: "a", date: "2026-09-23", start_time: "06:00:00", end_time: "06:50:00", class_type_name: "Reformer", instructor_name: "Ana", capacity: 6, current_bookings: 2, status: "scheduled" },
  { id: "b", class_date: "2026-09-23", start_time: "2026-09-23T09:00:00.000Z", end_time: "2026-09-23T09:50:00.000Z", class_type_name: "Reformer", instructor_name: "Diego", max_capacity: 6, current_bookings: 5 },
  { id: "c", date: "2026-09-24T00:00:00.000Z", start_time: "07:00", end_time: "07:50", class_type_name: "Reformer", capacity: 6 },
  { id: "d", date: "2026-09-24", start_time: "08:00", end_time: "08:50", class_type_name: "Reformer", capacity: 6, current_bookings: 6, status: "cancelled" },
  { id: "e", date: "2026-09-25", start_time: "17:00", end_time: "17:50", capacity: 0 },
];

describe("clases de la semana", () => {
  it("normaliza, quita canceladas y pasadas, y ordena", () => {
    const cs = normalizeClasses(raw, now);
    expect(cs.map((c) => c.id)).toEqual(["b", "c", "e"]); // a ya pasó (06:00 < 07:30), d cancelada
    expect(cs[0]).toMatchObject({ day: "2026-09-23", start: "09:00", end: "09:50", coach: "Diego", capacity: 6, remaining: 1, durationMin: 50 });
    expect(cs[1]).toMatchObject({ day: "2026-09-24", start: "07:00", coach: "Por confirmar", remaining: 6 });
    expect(cs[2]).toMatchObject({ name: "Clase", capacity: 0, remaining: 0 });
  });
  it("la semana empieza en lunes; domingo desde mediodía muestra la siguiente", () => {
    expect(weekStartFor(new Date(2026, 8, 23, 7)).getDate()).toBe(21);
    expect(weekStartFor(new Date(2026, 8, 27, 11)).getDate()).toBe(21);
    expect(weekStartFor(new Date(2026, 8, 27, 12)).getDate()).toBe(28);
    const d = weekDays(new Date(2026, 8, 21));
    expect(d.map((x) => x.weekday)).toEqual(["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"]);
    expect(d[0]).toEqual({ iso: "2026-09-21", weekday: "LUN", dayNum: "21" });
  });
  it("día inicial: hoy si tiene clases; si no, el primero con clases; si ninguno, hoy", () => {
    const days = weekDays(new Date(2026, 8, 21));
    const by = groupByDay(normalizeClasses(raw, now));
    expect(defaultDay(days, by, "2026-09-23")).toBe("2026-09-23");
    expect(defaultDay(days, by, "2026-09-22")).toBe("2026-09-23");
    expect(defaultDay(days, {}, "2026-09-22")).toBe("2026-09-22");
  });
  it("lugares: N de M, último, pocos, llena (capacidad 0 cuenta como llena)", () => {
    const c = (remaining: number, capacity = 6) => ({ remaining, capacity } as LandingClass);
    expect(availability(c(4))).toEqual({ label: "4 de 6 lugares", full: false, scarce: false });
    expect(availability(c(2))).toEqual({ label: "Pocos lugares", full: false, scarce: true });
    expect(availability(c(1))).toEqual({ label: "Último lugar", full: false, scarce: true });
    expect(availability(c(0))).toEqual({ label: "Llena", full: true, scarce: false });
    expect(availability(c(0, 0))).toEqual({ label: "Llena", full: true, scarce: false });
  });
});

describe("paquetes", () => {
  it("precios como texto; apertura sólo si es menor", () => {
    expect(toLandingPlan({ id: "1", name: "4 clases", price: "1140.00", effectivePrice: "1080.00", openingActive: true, classLimit: 4 }))
      .toMatchObject({ price: 1140, finalPrice: 1080, opening: true, perClass: 270 });
    expect(toLandingPlan({ id: "2", name: "1 clase", price: "300.00", classLimit: 1 }))
      .toMatchObject({ price: 300, finalPrice: 300, opening: false, perClass: null });
    expect(toLandingPlan({ id: "3", name: "Mes", price: 4200, effective_price: 4200, opening_active: true, class_limit: null }))
      .toMatchObject({ finalPrice: 4200, opening: false, perClass: null });
  });
  it("clase muestra: bandera + 1 clase; si no, por nombre; si no, ninguna", () => {
    const base = { price: 200, classLimit: 1 };
    expect(splitPlans([{ id: "t", name: "Prueba", isNonRepeatable: true, ...base }, { id: "x", name: "1 clase", price: 300, classLimit: 1 }]).trial?.id).toBe("t");
    expect(splitPlans([{ id: "m", name: "Clase muestra", ...base }]).trial?.id).toBe("m");
    const s = splitPlans([{ id: "x", name: "1 clase", price: 300, classLimit: 1, sortOrder: 2 }, { id: "y", name: "4 clases", price: 1140, classLimit: 4, sortOrder: 1 }]);
    expect(s.trial).toBeNull();
    expect(s.rest.map((p) => p.id)).toEqual(["y", "x"]);
  });
});

describe("clases y coaches", () => {
  it("especialidades en lista, texto o JSON", () => {
    expect(specialtiesText(["Reformer", "Fuerza"])).toBe("Reformer · Fuerza");
    expect(specialtiesText('["Reformer"]')).toBe("Reformer");
    expect(specialtiesText("Reformer")).toBe("Reformer");
    expect(specialtiesText(null)).toBe("");
  });
  it("duración del tipo de clase", () => {
    expect(classTypeDuration({ id: "1", name: "R", durationMin: 50 })).toBe(50);
    expect(classTypeDuration({ id: "1", name: "R", durationMinutes: 60 })).toBe(60);
    expect(classTypeDuration({ id: "1", name: "R" })).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/components/landing/landingData.test.ts` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar** — `src/components/landing/landingData.ts`:

```ts
import { addDays, format, startOfWeek } from "date-fns";

/* ── Sesión ─────────────────────────────────────────────────────────── */
export const STAFF_ROLES: readonly string[] = ["admin", "super_admin", "instructor", "reception"];
type SessionUser = { role: string } | null;
const isStaff = (u: SessionUser) => !!u && STAFF_ROLES.includes(u.role);

export function accountLink(user: SessionUser, isAuthenticated: boolean): { to: string; label: "Entrar" | "Mi cuenta" | "Panel" } {
  if (!isAuthenticated || !user) return { to: "/auth/login", label: "Entrar" };
  return isStaff(user) ? { to: "/admin/dashboard", label: "Panel" } : { to: "/app", label: "Mi cuenta" };
}

export function heroCta(user: SessionUser, isAuthenticated: boolean): { to: string; label: string } {
  if (!isAuthenticated || !user) return { to: `/auth/register?returnUrl=${encodeURIComponent("/app/checkout")}`, label: "Reserva tu clase muestra" };
  if (isStaff(user)) return { to: "/admin/dashboard", label: "Ir al panel" };
  return { to: "/app/checkout", label: "Reserva tu clase muestra" };
}

/* ── Clases ─────────────────────────────────────────────────────────── */
export type ApiClass = {
  id: string; date?: string; class_date?: string; start_time?: string; end_time?: string;
  class_type_name?: string; instructor_name?: string; capacity?: number; max_capacity?: number;
  current_bookings?: number; status?: string;
};
export type LandingClass = {
  id: string; day: string; start: string; end: string; name: string; coach: string;
  durationMin: number | null; capacity: number; remaining: number;
};

const hhmm = (t?: string) => {
  if (!t) return "";
  const part = t.includes("T") ? t.split("T")[1] : t;
  return part.slice(0, 5);
};
const minutes = (h: string) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : NaN);

export function normalizeClasses(raw: ApiClass[], now: Date): LandingClass[] {
  const nowIso = format(now, "yyyy-MM-dd");
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return raw
    .filter((c) => c.status !== "cancelled")
    .map((c) => {
      const day = (c.date || c.class_date || c.start_time?.split("T")[0] || "").split("T")[0];
      const start = hhmm(c.start_time);
      const end = hhmm(c.end_time);
      const dur = minutes(end) - minutes(start);
      const capacity = Math.max(0, c.capacity ?? c.max_capacity ?? 0);
      return {
        id: c.id, day, start, end,
        name: c.class_type_name || "Clase",
        coach: c.instructor_name || "Por confirmar",
        durationMin: Number.isFinite(dur) && dur > 0 ? dur : null,
        capacity,
        remaining: Math.max(0, capacity - (c.current_bookings ?? 0)),
      };
    })
    .filter((c) => c.day > nowIso || (c.day === nowIso && minutes(c.start) > nowMin))
    .sort((a, b) => (a.day + a.start).localeCompare(b.day + b.start));
}

export function weekStartFor(now: Date): Date {
  const monday = startOfWeek(now, { weekStartsOn: 1 });
  return now.getDay() === 0 && now.getHours() >= 12 ? addDays(monday, 7) : monday;
}

export type WeekDay = { iso: string; weekday: string; dayNum: string };
const WEEKDAYS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];
export function weekDays(start: Date): WeekDay[] {
  return WEEKDAYS.map((weekday, i) => {
    const d = addDays(start, i);
    return { iso: format(d, "yyyy-MM-dd"), weekday, dayNum: format(d, "d") };
  });
}

export function groupByDay(classes: LandingClass[]): Record<string, LandingClass[]> {
  return classes.reduce<Record<string, LandingClass[]>>((acc, c) => {
    (acc[c.day] ??= []).push(c);
    return acc;
  }, {});
}

export function defaultDay(days: WeekDay[], byDay: Record<string, LandingClass[]>, todayIso: string): string {
  if (byDay[todayIso]?.length) return todayIso;
  return days.find((d) => d.iso >= todayIso && byDay[d.iso]?.length)?.iso
    ?? days.find((d) => byDay[d.iso]?.length)?.iso
    ?? (days.some((d) => d.iso === todayIso) ? todayIso : days[0].iso);
}

export type Availability = { label: string; full: boolean; scarce: boolean };
export function availability(c: Pick<LandingClass, "remaining" | "capacity">): Availability {
  if (c.capacity <= 0 || c.remaining <= 0) return { label: "Llena", full: true, scarce: false };
  if (c.remaining === 1) return { label: "Último lugar", full: false, scarce: true };
  if (c.remaining === 2) return { label: "Pocos lugares", full: false, scarce: true };
  return { label: `${c.remaining} de ${c.capacity} lugares`, full: false, scarce: false };
}

/* ── Paquetes ───────────────────────────────────────────────────────── */
export type PlanRow = {
  id: string; name: string; description?: string | null; price: number | string;
  effectivePrice?: number | string; effective_price?: number | string; openingActive?: boolean; opening_active?: boolean;
  classLimit?: number | null; class_limit?: number | null; durationDays?: number | null; duration_days?: number | null;
  isNonRepeatable?: boolean; is_non_repeatable?: boolean; sortOrder?: number | null; sort_order?: number | null;
};
export type LandingPlan = {
  id: string; name: string; description: string | null; price: number; finalPrice: number; opening: boolean;
  classLimit: number | null; perClass: number | null; durationDays: number | null; nonRepeatable: boolean;
};

export function toLandingPlan(p: PlanRow): LandingPlan {
  const price = Number(p.price) || 0;
  const eff = Number(p.effectivePrice ?? p.effective_price ?? price) || price;
  const opening = Boolean(p.openingActive ?? p.opening_active) && eff > 0 && eff < price;
  const finalPrice = opening ? eff : price;
  const classLimit = p.classLimit ?? p.class_limit ?? null;
  return {
    id: p.id, name: p.name, description: p.description ?? null, price, finalPrice, opening, classLimit,
    perClass: classLimit && classLimit > 1 ? Math.round(finalPrice / classLimit) : null,
    durationDays: p.durationDays ?? p.duration_days ?? null,
    nonRepeatable: Boolean(p.isNonRepeatable ?? p.is_non_repeatable),
  };
}

const order = (p: PlanRow) => p.sortOrder ?? p.sort_order ?? 0;
export function splitPlans(raw: PlanRow[]): { trial: LandingPlan | null; rest: LandingPlan[] } {
  const sorted = [...raw].sort((a, b) => order(a) - order(b) || (Number(a.price) || 0) - (Number(b.price) || 0)).map(toLandingPlan);
  const trial = sorted.find((p) => p.nonRepeatable && p.classLimit === 1) ?? sorted.find((p) => /muestra/i.test(p.name)) ?? null;
  return { trial, rest: sorted.filter((p) => p !== trial) };
}

/* ── Clases y coaches ───────────────────────────────────────────────── */
export type ClassTypeRow = {
  id: string; name: string; subtitle?: string | null; description?: string | null;
  durationMin?: number | null; durationMinutes?: number | null;
};
export type CoachRow = { id: string; displayName: string; specialties?: unknown; photoUrl?: string | null };

export function specialtiesText(s: unknown): string {
  if (Array.isArray(s)) return s.filter(Boolean).join(" · ");
  if (typeof s === "string" && s.trim()) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).join(" · ");
    } catch { /* texto plano */ }
    return s.trim();
  }
  return "";
}

export const classTypeDuration = (t: ClassTypeRow): number | null => t.durationMin ?? t.durationMinutes ?? null;
```

- [ ] **Step 4: Verde** — `npx vitest run src/components/landing/landingData.test.ts` → PASS; `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/landingData.ts src/components/landing/landingData.test.ts
git commit -m "feat(hive): lógica de la landing — semana, lugares, paquetes y destinos

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Menú, portada y pie

**Files:**
- Create: `src/components/landing/LandingNav.tsx`, `LandingHero.tsx`, `LandingFooter.tsx`
- Test: `src/components/landing/LandingChrome.test.tsx`

**Interfaces:**
- Consumes (Tarea 4): `accountLink`, `heroCta`. Consumes (existentes): `BrandLogo` (`@/components/brand/BrandLogo`), `HexPedestal` (`@/components/brand/HexPedestal`), `PrimaryButton` (`@/components/app/AppShell`), `useAuthStore` (`@/stores/authStore`).
- Produces:
  - `LandingNav({ links }: { links: { href: string; label: string }[] })`.
  - `LandingHero()`.
  - `LandingFooter()`.

- [ ] **Step 1: Prueba en rojo** — `src/components/landing/LandingChrome.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { useAuthStore } from "@/stores/authStore";
import { LandingNav } from "./LandingNav";
import { LandingHero } from "./LandingHero";
import { LandingFooter } from "./LandingFooter";

describeZone(["src/components/landing/LandingNav.tsx", "src/components/landing/LandingHero.tsx", "src/components/landing/LandingFooter.tsx"]);

const LINKS = [{ href: "#clases", label: "Clases" }, { href: "#horario", label: "Horario" }];
const login = (role: string) => useAuthStore.setState({ isAuthenticated: true, user: { id: "u", role, displayName: "Ana" } as never });

afterEach(() => useAuthStore.setState({ isAuthenticated: false, user: null }));

describe("menú de la landing", () => {
  it("sin sesión: Entrar; con clienta: Mi cuenta; con staff: Panel", () => {
    const { unmount } = renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth/login");
    unmount();
    login("client");
    const r2 = renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/app");
    r2.unmount();
    login("admin");
    renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/admin/dashboard");
  });
  it("el menú móvil abre, muestra las ligas y cierra con Escape", () => {
    renderPage(<LandingNav links={LINKS} />, "/");
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("landing-menu")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.getElementById("landing-menu")).toBeNull();
  });
});

describe("portada", () => {
  it("titular, un solo h1 y botón a registro con regreso a comprar", () => {
    renderPage(<LandingHero />, "/");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Pilates Reformer · Coyoacán")).toBeInTheDocument();
    expect(screen.getByText("Sal más fuerte.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reserva tu clase muestra/ })).toHaveAttribute("href", "/auth/register?returnUrl=%2Fapp%2Fcheckout");
    expect(screen.getByRole("link", { name: "Ver horario" })).toHaveAttribute("href", "#horario");
  });
  it("staff: el botón lleva al panel", () => {
    login("reception");
    renderPage(<LandingHero />, "/");
    expect(screen.getByRole("link", { name: /Ir al panel/ })).toHaveAttribute("href", "/admin/dashboard");
  });
});

describe("pie", () => {
  it("lema, ligas legales y © HIVE", () => {
    renderPage(<LandingFooter />, "/");
    expect(screen.getByText("MOVIMIENTO · BIENESTAR · COMUNIDAD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/legal/privacidad");
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/legal/terminos");
    expect(screen.getByRole("link", { name: "Cancelación" })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.getByText(/© \d{4} HIVE Pilates Studio/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/components/landing/LandingChrome.test.tsx` → FAIL (módulos no existen).

- [ ] **Step 3: Implementar**

`src/components/landing/LandingNav.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useAuthStore } from "@/stores/authStore";
import { accountLink } from "./landingData";

type NavLinkItem = { href: string; label: string };

export function LandingNav({ links }: { links: NavLinkItem[] }) {
  const { isAuthenticated, user } = useAuthStore();
  const account = accountLink(user, isAuthenticated);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-3 px-5 sm:px-8">
        <Link to="/" aria-label="HIVE Pilates Studio" className="text-ink no-underline [&_svg]:text-accent">
          <BrandLogo variant="lockup" size={30} />
        </Link>
        <nav aria-label="Secciones" className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-[0.85rem] font-bold text-ink-muted no-underline transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to={account.to}
            className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong px-4 text-[0.8rem] font-extrabold text-ink no-underline"
          >
            {account.label}
          </Link>
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full border border-line-strong text-ink-muted lg:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            aria-controls="landing-menu"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="landing-menu" aria-label="Secciones" className="border-t border-line px-5 pb-3 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex min-h-[44px] items-center text-[0.95rem] font-bold text-ink no-underline">
              {l.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
```

`src/components/landing/LandingHero.tsx`:

```tsx
import { PrimaryButton } from "@/components/app/AppShell";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { useAuthStore } from "@/stores/authStore";
import { heroCta } from "./landingData";

const FACTS: [string, string][] = [["6", "reformers por clase"], ["L–D", "desde las 6 AM"], ["CDMX", "Coyoacán"]];

export function LandingHero() {
  const { isAuthenticated, user } = useAuthStore();
  const cta = heroCta(user, isAuthenticated);
  return (
    <section aria-labelledby="hero-titulo" className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-20">
      <div>
        <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.22em] text-accent">Pilates Reformer · Coyoacán</p>
        <h1 id="hero-titulo" className="mt-4 font-display text-[2.2rem] font-extrabold uppercase leading-none tracking-[-0.01em] text-ink sm:text-[3.2rem]">
          Entra.<br />Muévete.
        </h1>
        <p className="mt-2 font-display text-[1.25rem] font-bold text-accent sm:text-[1.6rem]">Sal más fuerte.</p>
        <p className="mt-4 max-w-[34rem] text-[0.95rem] leading-[1.6] text-ink-muted">
          Grupos de 6 en un espacio urbano con carácter. Una colmena que se mueve junta, desde las 6 de la mañana.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton to={cta.to}>{cta.label}</PrimaryButton>
          <a href="#horario" className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong px-5 text-[0.85rem] font-bold text-ink no-underline">
            Ver horario
          </a>
        </div>
        <div className="mt-8 grid grid-cols-3 border-t border-line">
          {FACTS.map(([value, label]) => (
            <div key={label} className="pr-2 pt-3">
              <p className="font-display text-[1rem] font-bold text-ink">{value}</p>
              <p className="text-[0.75rem] leading-[1.35] text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden justify-center lg:flex" aria-hidden="true">
        <HexPedestal size="lg" />
      </div>
    </section>
  );
}
```

`src/components/landing/LandingFooter.tsx`:

```tsx
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";

const LEGAL = [["/legal/privacidad", "Privacidad"], ["/legal/terminos", "Términos"], ["/legal/cancelacion", "Cancelación"]] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-line px-5 py-10 text-center">
      <div className="flex justify-center text-accent">
        <BrandLogo variant="mark" size={34} title="HIVE" />
      </div>
      <p className="mt-4 text-[0.75rem] font-extrabold tracking-[0.3em] text-accent">MOVIMIENTO · BIENESTAR · COMUNIDAD</p>
      <nav aria-label="Legales" className="mt-3 flex flex-wrap justify-center gap-x-5">
        {LEGAL.map(([to, label]) => (
          <Link key={to} to={to} className="inline-flex min-h-[44px] items-center text-[0.8rem] text-ink-muted no-underline hover:text-ink">
            {label}
          </Link>
        ))}
      </nav>
      <p className="text-[0.75rem] text-ink-faint">© {new Date().getFullYear()} HIVE Pilates Studio</p>
    </footer>
  );
}
```

- [ ] **Step 4: Verde** — `npx vitest run src/components/landing/LandingChrome.test.tsx` → PASS (incluida su guardia de zona); `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/LandingNav.tsx src/components/landing/LandingHero.tsx src/components/landing/LandingFooter.tsx src/components/landing/LandingChrome.test.tsx
git commit -m "feat(hive): menú, portada y pie de la landing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Clases y coaches, y contacto

**Files:**
- Create: `src/components/landing/ClassesCoaches.tsx`, `src/components/landing/Contact.tsx`
- Test: `src/components/landing/ClassesContact.test.tsx`

**Interfaces:**
- Consumes (Tarea 4): `ClassTypeRow`, `CoachRow`, `specialtiesText`, `classTypeDuration`. Consumes (Tarea 1): `STUDIO`, `instagramUrl`, `whatsappUrl` de `@/lib/studio`.
- Produces:
  - `ClassesCoaches({ classTypes, coaches, loading, error, onRetry }: { classTypes: ClassTypeRow[]; coaches: CoachRow[]; loading: boolean; error: boolean; onRetry: () => void })`.
  - `Contact()`.
  - Ambas son `<section>` con `id="clases"` y `id="contacto"`, y `scroll-mt-20`.

- [ ] **Step 1: Prueba en rojo** — `src/components/landing/ClassesContact.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { ClassesCoaches } from "./ClassesCoaches";
import { Contact } from "./Contact";

describeZone(["src/components/landing/ClassesCoaches.tsx", "src/components/landing/Contact.tsx"]);

const TIPOS = [{ id: "t1", name: "Reformer", description: "Fuerza y control en grupo pequeño.", durationMin: 50 }];
const COACHES = [
  { id: "c1", displayName: "Ana López", specialties: ["Reformer", "Fuerza"], photoUrl: null },
  { id: "c2", displayName: "Diego", specialties: "Particular", photoUrl: "https://example.com/d.jpg" },
];
const props = { classTypes: TIPOS, coaches: COACHES, loading: false, error: false, onRetry: () => {} };

describe("clases y coaches", () => {
  it("tipos de clase con duración, y lo que distingue a HIVE", () => {
    renderPage(<ClassesCoaches {...props} />, "/");
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByText("Reformer", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("50 min")).toBeInTheDocument();
    expect(screen.getByText("Pilates · Café · Wellness.")).toBeInTheDocument();
  });
  it("coach sin foto: monograma; con foto: la foto", () => {
    renderPage(<ClassesCoaches {...props} />, "/");
    expect(screen.getByText("A", { selector: "[data-monograma]" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Diego" })).toHaveAttribute("src", "https://example.com/d.jpg");
    expect(screen.getByText("Reformer · Fuerza")).toBeInTheDocument();
  });
  it("error: aviso con reintento", () => {
    const onRetry = vi.fn();
    renderPage(<ClassesCoaches {...props} classTypes={[]} coaches={[]} error onRetry={onRetry} />, "/");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("contacto", () => {
  it("dirección con Cómo llegar, horario, Instagram y política; sin WhatsApp sin número", () => {
    renderPage(<Contact />, "/");
    expect(screen.getByText("Cuauhtémoc #68, Del Carmen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cómo llegar/ })).toHaveAttribute("href", "https://maps.app.goo.gl/6KvMNWPZk35siB4fA");
    expect(screen.getByText("6 AM a 9 PM")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /@hive\.pilates/ })).toHaveAttribute("href", "https://www.instagram.com/hive.pilates");
    expect(screen.getByRole("link", { name: /Ver política/ })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.queryByText(/WhatsApp/)).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/components/landing/ClassesContact.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`src/components/landing/SectionTitle.tsx` (pieza compartida por las secciones; créala aquí):

```tsx
export function SectionTitle({ id, eyebrow, title, accent }: { id: string; eyebrow: string; title: string; accent: string }) {
  return (
    <div className="mb-6">
      <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.22em] text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-[1.5rem] font-extrabold uppercase leading-[1.05] text-ink sm:text-[2rem]">{title}</h2>
      <p className="mt-1 font-display text-[1rem] font-bold text-accent sm:text-[1.2rem]">{accent}</p>
    </div>
  );
}
```

(Agrega `"src/components/landing/SectionTitle.tsx"` a la lista de `describeZone` de esta prueba.)

`src/components/landing/ClassesCoaches.tsx`:

```tsx
import { SectionTitle } from "./SectionTitle";
import { classTypeDuration, specialtiesText, type ClassTypeRow, type CoachRow } from "./landingData";

const DIFF = ["Grupos pequeños: atención de verdad.", "Comunidad que te empuja a volver.", "Pilates · Café · Wellness."];

type Props = { classTypes: ClassTypeRow[]; coaches: CoachRow[]; loading: boolean; error: boolean; onRetry: () => void };

export function ClassesCoaches({ classTypes, coaches, loading, error, onRetry }: Props) {
  return (
    <section id="clases" aria-labelledby="clases-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="clases-titulo" eyebrow="Clases y coaches" title="Reformer," accent="a tu ritmo y al nuestro." />

        {error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/70 p-4">
            <p className="text-[0.9rem] text-ink-muted">No pudimos cargar las clases.</p>
            <button type="button" onClick={onRetry} className="min-h-[44px] rounded-full border border-line-strong px-4 text-[0.85rem] font-bold text-ink">
              Reintentar
            </button>
          </div>
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[18px] border border-line bg-surface/70" />)}
          </div>
        ) : (
          <>
            {classTypes.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {classTypes.map((t) => {
                  const dur = classTypeDuration(t);
                  return (
                    <li key={t.id} className="rounded-[18px] border border-line bg-surface/70 p-4">
                      <h3 className="font-display text-[1rem] font-bold text-ink">{t.name}</h3>
                      {(t.description || t.subtitle) && (
                        <p className="mt-1 text-[0.85rem] leading-[1.5] text-ink-muted">{t.description || t.subtitle}</p>
                      )}
                      {dur && <span className="mt-3 inline-block rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-accent">{dur} min</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {coaches.length > 0 && (
              <ul aria-label="Coaches" className="mt-8 flex gap-4 overflow-x-auto pb-2">
                {coaches.map((c) => (
                  <li key={c.id} className="w-24 shrink-0 text-center">
                    {c.photoUrl ? (
                      <img src={c.photoUrl} alt={c.displayName} loading="lazy" className="clip-hex mx-auto h-[74px] w-16 object-cover" />
                    ) : (
                      <span data-monograma aria-hidden="true" className="clip-hex mx-auto grid h-[74px] w-16 place-items-center bg-accent-soft font-display text-[1.25rem] font-extrabold text-accent">
                        {c.displayName.trim().charAt(0).toUpperCase()}
                      </span>
                    )}
                    <p className="mt-2 truncate text-[0.8rem] font-bold text-ink">{c.displayName}</p>
                    {specialtiesText(c.specialties) && <p className="truncate text-[0.75rem] text-ink-muted">{specialtiesText(c.specialties)}</p>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        <ul className="mt-8 grid gap-2">
          {DIFF.map((d) => (
            <li key={d} className="flex items-center gap-2 text-[0.9rem] text-ink">
              <span aria-hidden="true" className="text-accent">⬡</span>
              {d}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
```

`src/components/landing/Contact.tsx`:

```tsx
import { Link } from "react-router-dom";
import { AtSign, Clock, MapPin, MessageCircle, RotateCcw } from "lucide-react";
import { STUDIO, instagramUrl, whatsappUrl } from "@/lib/studio";
import { SectionTitle } from "./SectionTitle";

const parts = STUDIO.address.split(", ");
const street = parts.slice(0, 2).join(", "); // "Cuauhtémoc #68, Del Carmen"
const rest = parts.slice(2);                   // ["Coyoacán", "C.P. 04100", "CDMX"]
const ICON = "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent";
const CARD = "flex items-start gap-3 rounded-[18px] border border-line bg-surface/70 p-4";
const LINK = "inline-flex min-h-[44px] items-center text-[0.85rem] font-bold text-accent no-underline";

export function Contact() {
  const wa = whatsappUrl("Hola, quiero conocer HIVE.");
  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="contacto-titulo" eyebrow="Contacto" title="Te esperamos" accent="en Coyoacán." />
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><MapPin size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">{street}</p>
              <p className="text-[0.85rem] text-ink-muted">{rest.join(", ")}</p>
              <a href={STUDIO.mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>Cómo llegar →</a>
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><Clock size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">{STUDIO.hours}</p>
              <p className="text-[0.85rem] text-ink-muted">Clases L–V mañana y tarde; sábado y domingo por la mañana.</p>
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><AtSign size={18} /></span>
            <div>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={LINK}>@{STUDIO.instagram}</a>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`${LINK} ml-4 gap-1`}>
                  <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                </a>
              )}
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><RotateCcw size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">Cancela con 12 h</p>
              <p className="text-[0.85rem] text-ink-muted">Después, la clase cuenta como tomada.</p>
              <Link to="/legal/cancelacion" className={LINK}>Ver política →</Link>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
```

Nota de la guardia: el `⬡` decorativo de `ClassesCoaches` no está sobre fondo terracota, y la etiqueta `bg-accent-soft` lleva `text-accent`, que no es un relleno terracota. Si la guardia de regla 1 (invertida) marca alguna línea, revisa que sólo `bg-accent`, `bg-accent-gradient` y `from-accent` cuentan como relleno.

- [ ] **Step 4: Verde** — `npx vitest run src/components/landing/ClassesContact.test.tsx` → PASS; `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/SectionTitle.tsx src/components/landing/ClassesCoaches.tsx src/components/landing/Contact.tsx src/components/landing/ClassesContact.test.tsx
git commit -m "feat(hive): clases, coaches y contacto de la landing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Horario de la semana y paquetes

**Files:**
- Create: `src/components/landing/WeekSchedule.tsx`, `src/components/landing/Plans.tsx`
- Test: `src/components/landing/SchedulePlans.test.tsx`

**Interfaces:**
- Consumes (Tarea 4): `LandingClass`, `WeekDay`, `availability`, `groupByDay`, `defaultDay`, `LandingPlan`. Consumes (Tarea 6): `SectionTitle` de `./SectionTitle`. Consumes: `formatMoneyMX` de `@/components/app/widgets`, `PrimaryButton`/`GhostButton` de `@/components/app/AppShell`, `instagramUrl` de `@/lib/studio`.
- Produces:
  - `WeekSchedule({ days, classes, todayIso, loading, error, onRetry }: { days: WeekDay[]; classes: LandingClass[]; todayIso: string; loading: boolean; error: boolean; onRetry: () => void })`, con `id="horario"`.
  - `Plans({ trial, plans }: { trial: LandingPlan | null; plans: LandingPlan[] })`, con `id="paquetes"`. La página no lo monta si no hay planes.

> Si la Tarea 6 aún no se fusionó cuando empieces, crea `SectionTitle.tsx` con el código exacto de la Tarea 6 (mismo archivo, mismo contenido); el controlador resuelve el duplicado al fusionar.

- [ ] **Step 1: Prueba en rojo** — `src/components/landing/SchedulePlans.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderPage, atenuadoPor } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { WeekSchedule } from "./WeekSchedule";
import { Plans } from "./Plans";
import { weekDays, type LandingClass, type LandingPlan } from "./landingData";

describeZone(["src/components/landing/WeekSchedule.tsx", "src/components/landing/Plans.tsx"]);

const days = weekDays(new Date(2026, 8, 21));
const cls = (id: string, day: string, start: string, remaining: number): LandingClass =>
  ({ id, day, start, end: "", name: "Reformer", coach: "Ana", durationMin: 50, capacity: 6, remaining });
const CLASES = [cls("a", "2026-09-23", "06:00", 4), cls("b", "2026-09-23", "07:00", 1), cls("c", "2026-09-23", "08:00", 0), cls("d", "2026-09-24", "17:00", 6)];
const base = { days, todayIso: "2026-09-23", loading: false, error: false, onRetry: () => {} };

describe("horario", () => {
  it("tira de 7 días con el de hoy elegido y sus clases", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    const tira = screen.getByRole("tablist", { name: "Días de la semana" });
    expect(within(tira).getAllByRole("tab")).toHaveLength(7);
    expect(within(tira).getByRole("tab", { selected: true })).toHaveTextContent("MIÉ23");
    expect(screen.getByText("4 de 6 lugares")).toBeInTheDocument();
    expect(screen.getByText("Último lugar")).toBeInTheDocument();
  });
  it("reservar lleva a la clase en la app, con contexto para lector", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    const link = screen.getByRole("link", { name: /Reformer, 06:00: Reservar/ });
    expect(link).toHaveAttribute("href", "/app/classes/a");
  });
  it("clase llena: Llena y Lista de espera a opacidad completa", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    expect(screen.getByText("Llena")).toBeInTheDocument();
    const espera = screen.getByRole("link", { name: /Lista de espera/ });
    expect(espera).toHaveAttribute("href", "/app/classes/c");
    expect(atenuadoPor(espera)).toEqual([]);
  });
  it("cambiar de día muestra sus clases", () => {
    renderPage(<WeekSchedule {...base} classes={CLASES} />, "/");
    fireEvent.click(screen.getByRole("tab", { name: /JUE/ }));
    expect(screen.getByText("17:00")).toBeInTheDocument();
    expect(screen.queryByText("06:00")).toBeNull();
  });
  it("semana vacía: mensaje con Instagram; error: reintento", () => {
    const onRetry = vi.fn();
    const r = renderPage(<WeekSchedule {...base} classes={[]} />, "/");
    expect(screen.getByText("Pronto publicamos el horario de la semana.")).toBeInTheDocument();
    r.unmount();
    renderPage(<WeekSchedule {...base} classes={[]} error onRetry={onRetry} />, "/");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

const plan = (o: Partial<LandingPlan>): LandingPlan =>
  ({ id: "p", name: "4 clases", description: null, price: 1140, finalPrice: 1140, opening: false, classLimit: 4, perClass: 285, durationDays: 30, nonRepeatable: false, ...o });

describe("paquetes", () => {
  it("clase muestra destacada; apertura con precio normal tachado y etiqueta", () => {
    renderPage(<Plans trial={plan({ id: "t", name: "Clase muestra", price: 200, finalPrice: 200, classLimit: 1, perClass: null })}
      plans={[plan({ id: "4", finalPrice: 1080, opening: true, perClass: 270 })]} />, "/");
    expect(screen.getByText("Clase muestra")).toBeInTheDocument();
    expect(screen.getByText("Precio de apertura")).toBeInTheDocument();
    const tachado = screen.getByText("$1,140");
    expect(tachado.tagName).toBe("S");
    expect(screen.getByText("$1,080")).toBeInTheDocument();
    expect(screen.getByText("$270 por clase")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Comprar paquete/ })).toHaveAttribute("href", "/app/checkout");
  });
  it("sin apertura: un solo precio y sin etiqueta", () => {
    renderPage(<Plans trial={null} plans={[plan({})]} />, "/");
    expect(screen.queryByText("Precio de apertura")).toBeNull();
    expect(screen.queryByText((_, el) => el?.tagName === "S")).toBeNull();
  });
});
```

(`formatMoneyMX(1140)` devuelve `"1,140"`: confírmalo en `src/components/app/widgets.tsx`; si el formato difiere, ajusta el texto esperado al formato real, sin cambiar `formatMoneyMX`.)

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/components/landing/SchedulePlans.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`src/components/landing/WeekSchedule.tsx`:

```tsx
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { instagramUrl } from "@/lib/studio";
import { SectionTitle } from "./SectionTitle";
import { availability, defaultDay, groupByDay, type LandingClass, type WeekDay } from "./landingData";

type Props = { days: WeekDay[]; classes: LandingClass[]; todayIso: string; loading: boolean; error: boolean; onRetry: () => void };

const CTA = "inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[0.8rem] font-extrabold no-underline";

export function WeekSchedule({ days, classes, todayIso, loading, error, onRetry }: Props) {
  const byDay = useMemo(() => groupByDay(classes), [classes]);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? defaultDay(days, byDay, todayIso);
  const list = byDay[selected] ?? [];

  return (
    <section id="horario" aria-labelledby="horario-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-[1120px] gap-6 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <SectionTitle id="horario-titulo" eyebrow="Horario" title="Esta semana" accent="en HIVE." />
          <div role="tablist" aria-label="Días de la semana" className="flex justify-between gap-1">
            {days.map((d) => {
              const on = d.iso === selected;
              const has = (byDay[d.iso]?.length ?? 0) > 0;
              return (
                <button
                  key={d.iso}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setChosen(d.iso)}
                  className={
                    "flex min-h-[44px] w-11 flex-col items-center justify-center rounded-xl text-[0.75rem] font-bold " +
                    (on
                      ? "bg-accent-gradient text-accent-foreground"
                      : "text-ink-muted")
                  }
                >
                  {d.weekday}
                  <span className="font-display text-[0.95rem]">{d.dayNum}</span>
                  <span
                    aria-hidden="true"
                    className={
                      "mt-0.5 h-1 w-1 rounded-full " +
                      (on
                        ? "bg-accent-foreground"
                        : "bg-accent") /* decorativo */ +
                      (has ? "" : " opacity-0")
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div role="tabpanel" aria-label="Clases del día">
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/70 p-4">
              <p className="text-[0.9rem] text-ink-muted">No pudimos cargar el horario.</p>
              <button type="button" onClick={onRetry} className="min-h-[44px] rounded-full border border-line-strong px-4 text-[0.85rem] font-bold text-ink">
                Reintentar
              </button>
            </div>
          ) : loading ? (
            <div className="grid gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-[18px] border border-line bg-surface/70" />)}
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-surface/70 p-5">
              <p className="text-[0.95rem] font-bold text-ink">Pronto publicamos el horario de la semana.</p>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[0.85rem] font-bold text-accent no-underline">
                Síguenos en Instagram →
              </a>
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-[18px] border border-line bg-surface/70 p-5 text-[0.9rem] text-ink-muted">No hay clases este día.</p>
          ) : (
            <ul className="grid gap-2">
              {list.map((c) => {
                const a = availability(c);
                return (
                  <li key={c.id} className="grid grid-cols-[3.2rem_1fr_auto] items-center gap-3 rounded-[18px] border border-line bg-surface/70 p-3.5">
                    <div className={a.full ? "opacity-60" : ""}>
                      <p className="font-display text-[1rem] font-bold text-ink">{c.start}</p>
                    </div>
                    <div className={"min-w-0 " + (a.full ? "opacity-60" : "")}>
                      <p className="truncate text-[0.9rem] font-bold text-ink">{c.name}</p>
                      <p className="truncate text-[0.8rem] text-ink-muted">{c.coach}{c.durationMin ? ` · ${c.durationMin} min` : ""}</p>
                      <p className={"text-[0.75rem] font-bold " + (a.full ? "text-ink-muted" : "text-accent")}>{a.label}</p>
                    </div>
                    {a.full ? (
                      <Link to={`/app/classes/${c.id}`} className={`${CTA} border border-line-strong text-ink`}>
                        <span className="sr-only">{c.name}, {c.start}: </span>Lista de espera
                      </Link>
                    ) : (
                      <Link to={`/app/classes/${c.id}`} className={`${CTA} bg-accent-gradient text-accent-foreground shadow-accent-glow`}>
                        <span className="sr-only">{c.name}, {c.start}: </span>Reservar
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
```

`src/components/landing/Plans.tsx`:

```tsx
import { PrimaryButton } from "@/components/app/AppShell";
import { formatMoneyMX } from "@/components/app/widgets";
import { SectionTitle } from "./SectionTitle";
import type { LandingPlan } from "./landingData";

const money = (n: number) => `$${formatMoneyMX(n)}`;

function Price({ p, big }: { p: LandingPlan; big?: boolean }) {
  return (
    <div className="text-right">
      {p.opening && <s className="block text-[0.75rem] text-ink-faint">{money(p.price)}</s>}
      <span className={"font-display font-extrabold text-ink " + (big ? "text-[1.4rem]" : "text-[1.1rem]")}>{money(p.finalPrice)}</span>
    </div>
  );
}

export function Plans({ trial, plans }: { trial: LandingPlan | null; plans: LandingPlan[] }) {
  const anyOpening = [trial, ...plans].some((p) => p?.opening);
  return (
    <section id="paquetes" aria-labelledby="paquetes-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[720px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="paquetes-titulo" eyebrow="Paquetes" title="Elige cómo" accent="entrar a la colmena." />
        {trial && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-accent-deep bg-surface/70 p-4">
            <div>
              <p className="text-[0.95rem] font-bold text-ink">{trial.name}</p>
              <p className="text-[0.8rem] text-ink-muted">Tu primera vez en HIVE</p>
            </div>
            <Price p={trial} big />
          </div>
        )}
        {anyOpening && <p className="mb-2 text-[0.75rem] font-extrabold uppercase tracking-[0.12em] text-accent">Precio de apertura</p>}
        <ul>
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-3">
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-bold text-ink">{p.name}</p>
                {p.perClass && <p className="text-[0.8rem] text-ink-muted">{money(p.perClass)} por clase</p>}
              </div>
              <Price p={p} />
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <PrimaryButton to="/app/checkout" className="w-full">Comprar paquete</PrimaryButton>
        </div>
      </div>
    </section>
  );
}
```

Nota de la guardia: la línea del punto del día lleva `/* decorativo */` porque su rama `bg-accent` no lleva texto. Las ligas "Reservar" llevan `bg-accent-gradient text-accent-foreground` en la misma línea.

- [ ] **Step 4: Verde** — `npx vitest run src/components/landing/SchedulePlans.test.tsx` → PASS; `tsc` sin errores nuevos.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/WeekSchedule.tsx src/components/landing/Plans.tsx src/components/landing/SchedulePlans.test.tsx
git commit -m "feat(hive): horario de la semana y paquetes con precio de apertura en la landing

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: La página, la ruta y la limpieza de la landing de Alma

**Files:**
- Create: `src/pages/landing/Landing.tsx`, `src/pages/landing/Landing.test.tsx`
- Modify: `src/App.tsx:10,96` (import y ruta `/`), `src/design/app-zone.test.ts` (`ZONA`)
- Delete: `src/pages/Index.tsx`, `src/pages/Index.catalog.test.ts`, `src/pages/Index.client-copy.test.ts`, `src/components/Schedule.tsx` (si nadie más lo importa), `src/assets/alma/alma-class-photo-01.jpg`, `-02.jpg`, `-03.jpg`, `src/assets/alma/alma-mark.png`, `src/assets/alma/alma-mark-light.png` (cada una sólo si `grep -rn "<nombre>" src index.html` no da otro uso)

**Interfaces:**
- Consumes todas las secciones (Tareas 5–7) y `landingData` (Tarea 4).
- Produces: `export default function Landing()`.

- [ ] **Step 1: Prueba en rojo** — `src/pages/landing/Landing.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import fs from "fs";
import path from "path";
import api from "@/lib/api";
import { renderPage, respuestas } from "@/test/renderPage";
import Landing from "./Landing";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));

const PLANES = [
  { id: "t", name: "Clase muestra", price: "300.00", effectivePrice: "200.00", openingActive: true, classLimit: 1, isNonRepeatable: true, sortOrder: 0 },
  { id: "4", name: "4 clases", price: "1140.00", effectivePrice: "1080.00", openingActive: true, classLimit: 4, sortOrder: 1 },
];

afterEach(() => vi.clearAllMocks());

describe("landing de HIVE", () => {
  it("pide horario, paquetes, clases y coaches, y pinta todas las secciones", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({
      "/plans": { data: PLANES },
      "/class-types": { data: [{ id: "r", name: "Reformer", durationMin: 50 }] },
      "/public/instructors": { data: [{ id: "c", displayName: "Ana" }] },
      "/classes": { data: [] },
    }) as never);
    renderPage(<Landing />, "/");
    expect(await screen.findByText("4 clases")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    for (const id of ["clases", "horario", "paquetes", "contacto"]) expect(document.getElementById(id)).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "Paquetes" }).length).toBeGreaterThan(0);
    expect(vi.mocked(api.get).mock.calls.map(([u]) => String(u).split("?")[0]).sort())
      .toEqual(["/class-types", "/classes", "/plans", "/public/instructors"]);
  });
  it("sin paquetes activos: no hay sección ni liga de Paquetes", async () => {
    vi.mocked(api.get).mockImplementation(respuestas({ "/plans": { data: [] } }) as never);
    renderPage(<Landing />, "/");
    await screen.findByText("Pronto publicamos el horario de la semana.");
    expect(document.getElementById("paquetes")).toBeNull();
    expect(screen.queryByRole("link", { name: "Paquetes" })).toBeNull();
  });
});

const root = path.resolve(__dirname, "..", "..", "..");
const listar = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listar(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [`${dir}/${e.name}`] : []);

describe("contenido de la landing (hereda las pruebas de la landing vieja)", () => {
  const archivos = [...listar("src/pages/landing"), ...listar("src/components/landing"), "src/lib/studio.ts"];
  const src = archivos.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
  it("sin Alma, Juriquilla ni Querétaro", () => expect(src).not.toMatch(/\bAlma\b|Juriquilla|Querétaro/));
  it("sin testimonios ni fotos de Alma", () => {
    expect(src).not.toMatch(/testimoni/i);
    expect(src).not.toContain("assets/alma");
  });
  it("sin precios escritos a mano", () => expect(src).not.toMatch(/\$\s?\d{2,}|\bprice:\s*\d/));
  it("la landing vieja ya no existe", () => {
    expect(fs.existsSync(path.join(root, "src/pages/Index.tsx"))).toBe(false);
    expect(fs.readFileSync(path.join(root, "src/App.tsx"), "utf8")).toMatch(/path="\/" element=\{<Landing \/>\}/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run src/pages/landing/Landing.test.tsx` → FAIL.

- [ ] **Step 3: Implementar** — `src/pages/landing/Landing.tsx`:

```tsx
import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { ClassesCoaches } from "@/components/landing/ClassesCoaches";
import { WeekSchedule } from "@/components/landing/WeekSchedule";
import { Plans } from "@/components/landing/Plans";
import { Contact } from "@/components/landing/Contact";
import { LandingFooter } from "@/components/landing/LandingFooter";
import {
  normalizeClasses, splitPlans, weekDays, weekStartFor,
  type ApiClass, type ClassTypeRow, type CoachRow, type PlanRow,
} from "@/components/landing/landingData";

const lista = <T,>(data: unknown): T[] => (Array.isArray(data) ? data : ((data as { data?: T[] })?.data ?? []));

/** Aparición suave de las secciones; sin IntersectionObserver (o en pruebas) todo queda visible. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll("[data-reveal]");
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export default function Landing() {
  const now = useMemo(() => new Date(), []);
  const start = weekStartFor(now);
  const days = weekDays(start);
  const from = days[0].iso;
  const to = days[6].iso;

  const classesQ = useQuery({
    queryKey: ["public-classes", from, to],
    queryFn: async () => lista<ApiClass>((await api.get(`/classes?start=${from}&end=${to}`)).data),
    staleTime: 1000 * 60 * 2,
  });
  const plansQ = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => lista<PlanRow>((await api.get("/plans?active=true")).data),
  });
  const typesQ = useQuery({
    queryKey: ["class-types-public"],
    queryFn: async () => lista<ClassTypeRow>((await api.get("/class-types")).data),
  });
  const coachesQ = useQuery({
    queryKey: ["public-instructors"],
    queryFn: async () => lista<CoachRow>((await api.get("/public/instructors")).data),
  });

  const classes = useMemo(() => normalizeClasses(classesQ.data ?? [], now), [classesQ.data, now]);
  const { trial, rest } = useMemo(() => splitPlans(plansQ.data ?? []), [plansQ.data]);
  const hasPlans = !!trial || rest.length > 0;

  const links = [
    { href: "#clases", label: "Clases" },
    { href: "#horario", label: "Horario" },
    ...(hasPlans ? [{ href: "#paquetes", label: "Paquetes" }] : []),
    { href: "#contacto", label: "Contacto" },
  ];

  const ref = useReveal();
  return (
    <div ref={ref} className="min-h-screen bg-canvas bg-app-glow text-ink">
      <LandingNav links={links} />
      <main>
        <LandingHero />
        <div data-reveal>
          <ClassesCoaches
            classTypes={typesQ.data ?? []}
            coaches={coachesQ.data ?? []}
            loading={typesQ.isLoading || coachesQ.isLoading}
            error={typesQ.isError && coachesQ.isError}
            onRetry={() => { typesQ.refetch(); coachesQ.refetch(); }}
          />
        </div>
        <div data-reveal>
          <WeekSchedule
            days={days}
            classes={classes}
            todayIso={format(now, "yyyy-MM-dd")}
            loading={classesQ.isLoading}
            error={classesQ.isError}
            onRetry={() => classesQ.refetch()}
          />
        </div>
        {hasPlans && (
          <div data-reveal>
            <Plans trial={trial} plans={rest} />
          </div>
        )}
        <div data-reveal>
          <Contact />
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
```

`src/App.tsx`:
- Cambiar `import Index from "./pages/Index";` por `import Landing from "./pages/landing/Landing";`.
- Cambiar `<Route path="/" element={<Index />} />` por `<Route path="/" element={<Landing />} />`.

`src/design/app-zone.test.ts`: agregar a `ZONA` las dos carpetas nuevas:

```ts
export const ZONA = [
  ...listar("src/pages/client"), ...listar("src/pages/auth"), ...listar("src/components/app"), ...listar("src/components/auth"),
  ...listar("src/pages/landing"), ...listar("src/components/landing"),
  "src/pages/NotFound.tsx", "src/components/brand/HexPedestal.tsx", "src/components/account/ChangePassword.tsx", "src/components/ui/toaster.tsx",
].sort();
```

Borrados:

```bash
git rm src/pages/Index.tsx src/pages/Index.catalog.test.ts src/pages/Index.client-copy.test.ts
grep -rn "components/Schedule\"" src || git rm src/components/Schedule.tsx
for f in alma-class-photo-01.jpg alma-class-photo-02.jpg alma-class-photo-03.jpg alma-mark.png alma-mark-light.png; do
  grep -rn "assets/alma/$f" src index.html >/dev/null || git rm "src/assets/alma/$f"
done
```

Si `Schedule.tsx` tenía una prueba propia (`src/components/Schedule*.test.*`), bórrala con él.

- [ ] **Step 4: Verde**
  - `npx vitest run src/pages/landing src/design` → PASS (incluida la zona entera con la landing).
  - `npx vitest run` → toda la suite en verde.
  - `tsc` sin errores nuevos.
  - `VITE_API_URL=/api npx vite build` → `✓ built`.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat(hive): landing nueva de HIVE en / y adiós a la landing de Alma

Horario, paquetes, clases y coaches reales; sin fotos ni textos de Alma.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verificación

**Files:** ninguno nuevo. La evidencia va a `.superpowers/sdd/<plan>/sweep-landing/` (ignorado por git).

- [ ] **Step 1: Suites**

Run: `npm test 2>&1 | grep -E "Test Files|Tests |ℹ (tests|pass|fail)"`
Expected: frontend, servidor (54) y scripts en verde.

- [ ] **Step 2: Build con Node 20**

Run: `rm -rf dist && VITE_API_URL=/api npx -y node@20 node_modules/vite/bin/vite.js build 2>&1 | tail -2`
Expected: `✓ built`.

- [ ] **Step 3: Regresión del servidor en base desechable**

Procedimiento de `docs/superpowers/plans/2026-09-24-hive-sistema-visual.md`, Task 13 Step 2:
- Postgres en 127.0.0.1:5521 y servidor en 8121, siempre con `DATABASE_URL` explícito, sin `.env`.
- Desmontar al final y confirmar que los puertos quedan libres.

Expected: `server/tests` 63/63.

- [ ] **Step 4: Barrido en navegador con datos de HIVE**

Con el servidor sirviendo `dist/` y la base desechable sembrada con:
- Los paquetes de `docs/superpowers/specs/assets/hive-landing/precios-estudio.png`: precio normal en `price` y el de apertura en `opening_price`, apertura encendida. La clase muestra con `is_non_repeatable = true` y `class_limit = 1`.
- Clases de L–D en los horarios del estudio de la semana actual (una llena, una con 1 lugar).
- Un tipo de clase "Reformer" de 50 min.
- Dos coaches: uno sin foto y otro con `photo_url`.

Con Playwright, `/` a 390 × 844 y a 1280. Capturas en `sweep-landing/`. Revisar:
- Errores de consola y `/api` ≥ 400.
- `undefined`, `NaN` o `Invalid Date` en pantalla.
- Scroll horizontal.
- Texto claro sobre terracota.
- `<html data-theme="dark">` y primera pintada oscura (recargar y captura temprana).
- Menú móvil (abre, liga, cierra).
- Anclas (el título de la sección no queda bajo el menú fijo).
- Precio normal tachado junto al de apertura.
- "Llena" + "Lista de espera".
- Movimiento reducido: el fragmento de la Task 14 del plan anterior en `/` debe dar `[]`.

**Flujo completo:**
- Sin sesión: "Reservar" en una clase → login → "Crear cuenta nueva" (conserva `returnUrl`) → registro → bienvenida (si está encendida) → termina en `/app/classes/<id>`.
- Con sesión: el menú dice "Mi cuenta".

Expected: sin hallazgos causados por la rama. Si un hallazgo sí lo es, se corrige con su prueba en rojo y va en un commit propio.

- [ ] **Step 5: Reporte**

El reporte lleva:
- Las salidas de las suites.
- Una tabla tamaño × revisión.
- El resultado del flujo completo.
- Cada hallazgo con su evidencia y clasificación.
- La confirmación de que todo quedó desmontado.
