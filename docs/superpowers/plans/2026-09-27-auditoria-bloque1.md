# Auditoría de producción, Bloque 1 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corregir los 9 defectos técnicos del Bloque 1 de la auditoría de producción sin cambiar datos existentes.

**Architecture:**
- **Lógica pura en módulos nuevos:** `server/lib/validate.js` (UUID, firma, enmascarado), `server/lib/checkin.js` (regla de check-in), `server/lib/whatsappState.js` (estado del canal con caché), cada uno con pruebas `node:test`.
- **Rutas:** se editan en `server/index.js` por región.
- **Panel:** se ajusta en sus pantallas.
- **Rutas probadas con base desechable:** se agregan casos a `server/tests/`.

**Tech Stack:** Node 20 ESM + Express + pg (`server/index.js`), node:test; React 18 + react-query + zustand + vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-auditoria-bloque1-design.md`

## Global Constraints

- **Worktree base:** `/Users/saidromero/Alma Studio/alma-hive-auditoria`, rama `hive-auditoria-b1`, base b5297aa. Cada tarea trabaja en su propio worktree (lo crea el controlador).
- `node_modules` es un enlace compartido: **nunca** `npm install`.
- Nada de push, merge ni producción.
- **Bases de datos:** sólo desechables, en 127.0.0.1, con `DATABASE_URL` explícito y sin `.env`; se desmontan al terminar.
- **Sin migrar datos:** no se cambia ningún dato existente. Columnas nuevas sólo con `ALTER TABLE … ADD COLUMN IF NOT EXISTS` dentro de `ensureSchema()`.
- **Commits:** en español (`fix(hive): …`), terminando con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Pruebas unitarias del servidor:** `server/lib/<nombre>.test.js` (glob de `npm run test:server`).
- **Pruebas de rutas:** `server/tests/<nombre>.test.mjs` (glob de `npm run test:regression`), con los helpers de `server/tests/helpers.mjs`: `api`, `login`, `sql`, `makeClient(prefix, key, {role, waiver})`, `studioFixtures`, `makeClass`, `giveMembership`, `ventanaAhora`, `cleanup`, `closeDb`, `day`, `ADMIN`.
- **Base desechable para pruebas de rutas:** `docs/superpowers/plans/2026-09-24-hive-sistema-visual.md`, Task 13 Step 2, con los puertos de tu tarea. Correr sólo tus archivos de `server/tests` más los que ya existían del área, apuntando `API_URL` y `DATABASE_URL` a tu base.
- **Comandos:**
  - `npx vitest run <archivo>`.
  - `npm run test:server`.
  - `npx tsc --noEmit -p tsconfig.app.json`: ignora los errores preexistentes de `AdminLayout.tsx:202` `aliases` y supabase.
  - `VITE_API_URL=/api npx vite build`.
- **Panel en claro:** colores por clases del tema (`text-ink`, `bg-danger/10`, `border-line`…); nada de hex en componentes.
- **Textos de la interfaz en español**, tal como los fija el spec.

## Review Focus

1. **Evolution sin configurar** (`EVOLUTION_API_URL` vacío, caso de las bases de prueba y de producción hoy): `whatsappChannelState()` debe devolver `connected:false` sin lanzar ni tardar más de ~5 s. Prueba en Task 3.
2. **Check-in de una clase que empezó ayer a las 23:30 y se marca a las 00:10 de hoy (zona del estudio):** es "otro día" → `NOT_TODAY`, calculado en la zona del estudio y no en UTC. Prueba en Task 4.
3. **`checkAuth` con token válido y el servidor caído en la primera carga** (sin usuaria guardada): no borra el token y los guardias muestran "No pudimos verificar tu sesión" con "Reintentar", no el login. Prueba en Task 6.
4. **Firma de responsiva como `data:image/png;base64,` con contenido que no es PNG**, o con cabecera IHDR truncada: se rechaza con 400, nunca con 500. Prueba en Task 1.
5. **PUT de Wellhub desde la pantalla vieja**, que manda el secreto enmascarado `"••••a1b2"` de vuelta: no debe sobrescribir el secreto real. Prueba en Task 2.

---

## Ejecución en paralelo

| Ola | Tareas | Nota |
|---|---|---|
| 1 | 1 · 2 · 6 · 7 | archivos casi disjuntos (en `server/index.js`, regiones distintas) |
| 2 | 3 · 4 · 5 · 8 | usan `server/lib/validate.js` (Task 1). Las cuatro tocan `BookingsList.tsx` en regiones distintas; el controlador rebasa en orden |
| 3 | 9 | verificación |

Puertos de base desechable por tarea: T1 5541/8141 · T2 5542/8142 · T3 5543/8143 · T4 5544/8144 · T5 5545/8145 · T6 5546/8146 · T7 5547/8147 · T8 5548/8148 · T9 5521/8121 y 5522/8122.

---

### Task 1: Validadores compartidos: UUID, firma de responsiva, enmascarado

**Files:**
- Create: `server/lib/validate.js`, `server/lib/validate.test.js`
- Modify: `server/index.js`:
  - `UUID_RE` y `app.param`, ~2121–2135.
  - `POST /api/me/waiver`, ~3182–3200.
  - `POST /api/bookings`, ~3721–3723.

**Interfaces (produce):**

```js
export function isUuid(value) // boolean
export function signatureProblem(dataUrl) // null si la firma es aceptable; si no, string con el motivo
export function maskSecret(value) // null si vacío; "••••" + últimos 4 caracteres
export function isMaskedSecret(value) // true si value empieza con "••••"
```

- [ ] **Step 1: Prueba en rojo**: `server/lib/validate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isUuid, signatureProblem, maskSecret, isMaskedSecret } from "./validate.js";

const png = (w, h, extraBytes = 2000) => {
  const b = Buffer.alloc(33 + extraBytes);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

test("isUuid", () => {
  assert.equal(isUuid("3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f"), true);
  for (const bad of [null, undefined, "", "no-es-uuid", "3f1b2c4d1a2b4c3d8e9f0a1b2c3d4e5f", 123, {}]) assert.equal(isUuid(bad), false);
});

test("signatureProblem acepta una firma PNG razonable", () => {
  assert.equal(signatureProblem(png(600, 200)), null);
});

test("signatureProblem rechaza firmas vacías, diminutas o que no son PNG", () => {
  assert.ok(signatureProblem(""));
  assert.ok(signatureProblem("hola"));
  assert.ok(signatureProblem("data:image/jpeg;base64,AAAA"));
  assert.ok(signatureProblem(png(1, 1)), "1×1 px");
  assert.ok(signatureProblem(png(600, 200, 10)), "muy poco contenido");
  assert.ok(signatureProblem("data:image/png;base64," + Buffer.from("no soy png".repeat(200)).toString("base64")), "no es PNG");
  assert.ok(signatureProblem("data:image/png;base64,iVBORw0KGgo="), "cabecera truncada");
});

test("maskSecret e isMaskedSecret", () => {
  assert.equal(maskSecret(null), null);
  assert.equal(maskSecret(""), null);
  assert.equal(maskSecret("abcdefgh1234"), "••••1234");
  assert.equal(maskSecret("abc"), "••••");
  assert.equal(isMaskedSecret("••••1234"), true);
  assert.equal(isMaskedSecret("nuevo-secreto"), false);
  assert.equal(isMaskedSecret(undefined), false);
});
```

- [ ] **Step 2: Correr y ver que falla**: `node --test server/lib/validate.test.js` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**: `server/lib/validate.js`:

```js
// Validadores compartidos por las rutas (auditoría de producción 2026-09-27, bloque 1).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === "string" && UUID_RE.test(value);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BASE64 = 1000;
const MIN_W = 50;
const MIN_H = 20;

/** null si la firma es una PNG razonable; si no, el motivo (texto para el usuario). */
export function signatureProblem(dataUrl) {
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) return "La firma debe ser una imagen PNG.";
  const b64 = dataUrl.slice(prefix.length);
  if (b64.length < MIN_BASE64) return "La firma está vacía o es demasiado pequeña.";
  let buf;
  try { buf = Buffer.from(b64, "base64"); } catch { return "La firma no es válida."; }
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_MAGIC) || buf.toString("ascii", 12, 16) !== "IHDR") {
    return "La firma no es una imagen PNG válida.";
  }
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w < MIN_W || h < MIN_H) return "La firma es demasiado pequeña.";
  return null;
}

export const maskSecret = (value) => {
  if (!value) return null;
  const s = String(value);
  return "••••" + (s.length > 4 ? s.slice(-4) : "");
};
export const isMaskedSecret = (value) => typeof value === "string" && value.startsWith("••••");
```

En `server/index.js`:
- **Import:** `import { isUuid, signatureProblem } from "./lib/validate.js";` junto a los demás imports de `./lib/`.
- **Validación de parámetros (~2121–2135):** reemplazar `const UUID_RE = …` y el `if (!UUID_RE.test(...))` por `if (!isUuid(String(value || "")))`. Conserva el comentario.
- **`POST /api/bookings` (~3723):** tras `if (!classId) …`, agregar:

```js
  if (!isUuid(classId)) return res.status(400).json({ message: "Identificador inválido" });
```

- **`POST /api/me/waiver`:** tras la validación de nombre y firma, agregar:

```js
  const firmaMala = signatureProblem(signature_data);
  if (firmaMala) return res.status(400).json({ message: firmaMala });
```

- [ ] **Step 4: Rutas.** Agregar `server/tests/validacion.test.mjs`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, makeClient, cleanup, closeDb } from "./helpers.mjs";

const PFX = "rgvalid";
let c;
before(async () => { c = await makeClient(PFX, "a"); });
after(async () => { await cleanup(PFX); await closeDb(); });

test("POST /api/bookings con classId que no es UUID → 400, no 500", async () => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId: "no-es-uuid" } });
  assert.equal(r.status, 400);
});

test("POST /api/me/waiver con firma de 1×1 px → 400", async () => {
  const tiny = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "Prueba", signature_data: tiny } });
  assert.equal(r.status, 400);
});
```

Levanta tu base desechable (puertos de la tabla) y corre `node --test --test-concurrency=1 server/tests/validacion.test.mjs` → PASS. Revisa que `makeClient(..., {waiver: true})` (por defecto) no use una firma que ahora se rechace. Si falla por eso, ajusta el helper a una PNG válida de ≥ 50×20 px generada en código y dilo en el reporte.

- [ ] **Step 5: Verde**: `npm run test:server` y `npx vitest run` → PASS; tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add server/lib/validate.js server/lib/validate.test.js server/index.js server/tests/validacion.test.mjs
git commit -m "fix(hive): validadores compartidos; id inválido → 400 y firmas de responsiva diminutas rechazadas"
```

---

### Task 2: Claves de Wellhub fuera del navegador

**Files:**
- Modify: `server/index.js`:
  - `GET` y `PUT /api/partners/settings` (~2199–2225).
  - `wellhubWebhookHandler` (~2148–2151).
- Modify: `src/pages/admin/settings/PartnerPlatforms.tsx` (~13–24, 31–50, 89–98).
- Create: `server/lib/partnerSettings.js`, `server/lib/partnerSettings.test.js`, `server/tests/wellhub-ajustes.test.mjs`, `src/pages/admin/settings/PartnerPlatforms.test.tsx`

**Interfaces:**
- Produces:

```js
export function publicPartnerSettings(row) // copia sin secretos: webhook_secret/access_token enmascarados + has_* booleanos
export function mergeSecret(incoming, current) // valor a guardar: current si incoming vacío/ausente/enmascarado; si no, incoming
```

(Autocontenidas; no dependen de Task 1: incluyen su propio enmascarado.)

- [ ] **Step 1: Prueba en rojo** (`server/lib/partnerSettings.test.js`):

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { publicPartnerSettings, mergeSecret } from "./partnerSettings.js";

test("publicPartnerSettings nunca devuelve los secretos", () => {
  const row = { channel: "wellhub", is_enabled: true, webhook_secret: "s3cr3t-webhook-abcd", access_token: "eyJ.token.wxyz", gym_id: "g1" };
  const out = publicPartnerSettings(row);
  assert.equal(out.webhook_secret, "••••abcd");
  assert.equal(out.access_token, "••••wxyz");
  assert.equal(out.has_webhook_secret, true);
  assert.equal(out.has_access_token, true);
  assert.equal(out.gym_id, "g1");
  assert.ok(!JSON.stringify(out).includes("s3cr3t"));
  assert.equal(publicPartnerSettings(null), null);
  const vacio = publicPartnerSettings({ channel: "wellhub", webhook_secret: null, access_token: "" });
  assert.equal(vacio.webhook_secret, null);
  assert.equal(vacio.has_access_token, false);
});

test("mergeSecret conserva el valor guardado salvo que llegue uno nuevo", () => {
  assert.equal(mergeSecret(undefined, "viejo"), "viejo");
  assert.equal(mergeSecret("", "viejo"), "viejo");
  assert.equal(mergeSecret(null, "viejo"), "viejo");
  assert.equal(mergeSecret("••••ejo1", "viejo"), "viejo");
  assert.equal(mergeSecret("nuevo", "viejo"), "nuevo");
  assert.equal(mergeSecret("nuevo", null), "nuevo");
  assert.equal(mergeSecret(undefined, null), null);
});
```

- [ ] **Step 2: Correr y ver que falla**: `node --test server/lib/partnerSettings.test.js` → FAIL.

- [ ] **Step 3: Implementar.** `server/lib/partnerSettings.js`:

```js
// Ajustes de partners (Wellhub): el navegador nunca recibe los secretos
// (auditoría de producción 2026-09-27, P0-2 / L8).
const SECRETS = ["webhook_secret", "access_token"];
const mask = (v) => (v ? "••••" + (String(v).length > 4 ? String(v).slice(-4) : "") : null);
const isMasked = (v) => typeof v === "string" && v.startsWith("••••");

export function publicPartnerSettings(row) {
  if (!row) return null;
  const out = { ...row };
  for (const k of SECRETS) {
    out[`has_${k}`] = Boolean(row[k]);
    out[k] = mask(row[k]);
  }
  return out;
}

export function mergeSecret(incoming, current) {
  if (incoming === undefined || incoming === null || incoming === "" || isMasked(incoming)) return current ?? null;
  return incoming;
}
```

En `server/index.js`:
- Importar `publicPartnerSettings, mergeSecret` desde `./lib/partnerSettings.js`.
- **GET:**

```js
app.get("/api/partners/settings", ownerMiddleware, async (_req, res) => {
  try {
    const r = await pool.query("SELECT * FROM platform_credentials WHERE channel='wellhub'");
    return res.json({ data: publicPartnerSettings(r.rows[0] || null) });
  } catch (err) { console.error("[partners settings GET]", err.message); return res.status(500).json({ message: "Error interno" }); }
});
```

- **PUT:** cambiar `adminMiddleware` → `ownerMiddleware`. Antes del `INSERT`, leer la fila actual:

```js
    const cur = (await pool.query("SELECT webhook_secret, access_token FROM platform_credentials WHERE channel='wellhub'")).rows[0] || {};
    const webhookSecret = mergeSecret(b.webhook_secret, cur.webhook_secret);
    const accessToken = mergeSecret(b.access_token, cur.access_token);
```

  - En los parámetros del `INSERT`, usa `webhookSecret` y `accessToken` en lugar de `b.webhook_secret || null` y `b.access_token || null`.
  - La respuesta: `return res.json({ data: publicPartnerSettings(r.rows[0]) });`.

- **Webhook (~2150–2151):** reemplazar la línea del `console.warn` por:

```js
  if (verdict === null) {
    console.warn("[wellhub] webhook rechazado: la integración está encendida sin webhook_secret");
    return res.status(401).json({ message: "Wellhub sin secreto configurado" });
  }
```

`PartnerPlatforms.tsx`:
- **Tipo:** agregar `has_webhook_secret?: boolean; has_access_token?: boolean` a `WellhubSettings`.
- **Al cargar** (`useEffect` que hace `setForm`): guardar la fila sin los secretos:

```tsx
    if (row) {
      const { webhook_secret, access_token, ...rest } = row;
      setMasks({ webhook_secret: webhook_secret ?? null, access_token: access_token ?? null });
      setForm({ ...rest, extra_config: row.extra_config || {} });
    }
```

  con `const [masks, setMasks] = useState<{ webhook_secret: string | null; access_token: string | null }>({ webhook_secret: null, access_token: null });`.
- **Al guardar:** `mutationFn: () => api.put("/partners/settings", form)`. `form` sólo trae los secretos si el usuario escribió algo; los inputs empiezan vacíos.
- **Los dos inputs de secreto:**

```tsx
                  <Input
                    type="password"
                    autoComplete="off"
                    value={(form as any)[k] || ""}
                    placeholder={masks[k as "webhook_secret" | "access_token"] ? `${masks[k as "webhook_secret" | "access_token"]} · déjalo vacío para no cambiarlo` : "Sin configurar"}
                    onChange={(e) => set(k, e.target.value)}
                  />
```

  Aplica sólo a los dos secretos; el resto de campos del arreglo sigue igual.
- **Tras guardar con éxito:** limpiar los dos campos del form y actualizar `masks` con la respuesta.

- [ ] **Step 4: Pruebas de panel y rutas.**

`src/pages/admin/settings/PartnerPlatforms.test.tsx`: sigue el patrón de `vi.mock("@/lib/api")` y `renderPage` de `src/test/renderPage.tsx`.
- GET devuelve `{ data: { webhook_secret: "••••abcd", has_webhook_secret: true, access_token: null, is_enabled: true } }`.
- **Inputs:** los dos secretos son `type="password"`, con valor vacío y el marcador que contiene "••••abcd".
- **Guardar sin tocar nada:** `api.put` recibe un cuerpo **sin** `webhook_secret` ni `access_token`.
- **Guardar tras escribir "nuevo"** en el webhook secret: el cuerpo lleva `webhook_secret: "nuevo"`.

`server/tests/wellhub-ajustes.test.mjs` (base desechable):
- **Admin:** PUT con `webhook_secret: "s3cr3t-webhook-abcd"`. Luego GET: la respuesta no contiene `s3cr3t` y trae `has_webhook_secret: true`.
- **PUT enmascarado:** otro PUT con `webhook_secret: "••••abcd"`; en la base, `SELECT webhook_secret` sigue siendo `s3cr3t-webhook-abcd`.
- **Recepción** (`makeClient(PFX, "r", { role: "reception" })`): GET → 403.
- **Webhook sin secreto:** PUT con `is_enabled: true` y sin secreto (en una base donde el secreto no existe). `POST /webhooks/wellhub/checkin` con un JSON válido → 401. Cierra con PUT `is_enabled: false` para dejar la base como estaba.

- [ ] **Step 5: Verde**: `npm run test:server`, `npx vitest run src/pages/admin/settings`, tus pruebas de rutas en tu base (puertos 5542/8142) → PASS; tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add server/lib/partnerSettings.js server/lib/partnerSettings.test.js server/index.js src/pages/admin/settings/PartnerPlatforms.tsx src/pages/admin/settings/PartnerPlatforms.test.tsx server/tests/wellhub-ajustes.test.mjs
git commit -m "fix(hive): claves de Wellhub enmascaradas, sólo para la dueña, y webhook sin secreto rechazado"
```

---

### Task 3: WhatsApp honesto

**Files:**
- Create: `server/lib/whatsappState.js`, `server/lib/whatsappState.test.js`, `src/components/admin/WhatsAppBanner.tsx`, `src/components/admin/WhatsAppBanner.test.tsx`, `server/tests/whatsapp-honesto.test.mjs`
- Modify: `server/index.js`:
  - `GET /api/evolution/status` (~12327–12371).
  - `PUT /api/classes/:id/cancel`, bucle de avisos (~9305–9345).
  - `runClassReminderCron` (~16312–16377).
- Modify: `src/pages/admin/bookings/BookingsList.tsx`, `onSuccess` de `cancelClassMutation` (~296–312); `src/components/admin/AdminLayout.tsx` (montar el banner arriba de `<main>`, ~279).

**Interfaces:**
- Produces:

```js
export function createChannelState({ probe, ttlMs = 60_000, now = () => Date.now() })
// devuelve async () => { connected: boolean, state: string }; cachea ttlMs; si probe lanza → { connected:false, state:"disconnected" }
```

- Response de cancelar clase:

```
{ …, wa_queued: number, wa_failed: number, wa_unreached: Array<{ user_id, display_name, phone }> }   // sin wa_sent
```

- [ ] **Step 1: Prueba en rojo**, `server/lib/whatsappState.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createChannelState } from "./whatsappState.js";

test("cachea el estado durante el TTL", async () => {
  let calls = 0, t = 0;
  const get = createChannelState({ probe: async () => { calls++; return { connected: true, state: "connected" }; }, ttlMs: 1000, now: () => t });
  assert.deepEqual(await get(), { connected: true, state: "connected" });
  await get();
  assert.equal(calls, 1);
  t = 1500;
  await get();
  assert.equal(calls, 2);
});

test("si la sonda falla, el canal cuenta como desconectado", async () => {
  const get = createChannelState({ probe: async () => { throw new Error("ECONNREFUSED"); } });
  assert.deepEqual(await get(), { connected: false, state: "disconnected" });
});

test("sonda lenta: se corta a los 5 s y cuenta como desconectado", async () => {
  const get = createChannelState({ probe: () => new Promise(() => {}), timeoutMs: 50 });
  assert.deepEqual(await get(), { connected: false, state: "disconnected" });
});
```

- [ ] **Step 2: Correr y ver que falla**: `node --test server/lib/whatsappState.test.js` → FAIL.

- [ ] **Step 3: Implementar.** `server/lib/whatsappState.js`:

```js
// Estado del canal de WhatsApp (Evolution) con caché corta, para no intentar
// envíos con el canal caído y avisarlo en el panel (auditoría 2026-09-27, P0-1).
export function createChannelState({ probe, ttlMs = 60_000, timeoutMs = 5_000, now = () => Date.now() }) {
  let cached = null;
  let expires = 0;
  return async function channelState() {
    if (cached && now() < expires) return cached;
    let result;
    try {
      result = await Promise.race([
        probe(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
      ]);
    } catch {
      result = { connected: false, state: "disconnected" };
    }
    cached = { connected: Boolean(result?.connected), state: String(result?.state || (result?.connected ? "connected" : "disconnected")) };
    expires = now() + ttlMs;
    return cached;
  };
}
```

En `server/index.js`:

1. **Extraer la sonda.** Extrae el cuerpo de `GET /api/evolution/status`, hasta el cálculo de `state`, a `async function probeEvolution()` que devuelve `{ connected, state, number, instanceExists, qrCode }`.
   - Si `EVOLUTION_API_URL` está vacío, devuelve `{ connected:false, state:"disconnected", instanceExists:false }` sin llamar a la red.
   - La ruta queda como `res.json({ data: await probeEvolution() })`, con su `catch` actual.
2. **Crear el estado del canal:**

```js
const whatsappChannelState = createChannelState({ probe: probeEvolution });
```

3. **`PUT /api/classes/:id/cancel`.** Reemplazar el bucle de avisos (desde `let waSent = 0;` hasta el cierre del `for`) y el campo `wa_sent` de la respuesta:

```js
    const notifSettings = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    const waOn = notifSettings?.whatsapp_reminders !== false;
    const channel = waOn ? await whatsappChannelState() : { connected: false, state: "disabled" };
    let waQueued = 0;
    const waUnreached = [];
    for (const b of activeBookings) {
      if (!b.user_id) continue;
      triggerWalletPassSync(b.user_id, "admin_class_cancelled");
      if (!channel.connected) {
        waUnreached.push({ user_id: b.user_id, display_name: b.display_name, phone: b.phone });
        continue;
      }
      const className = b.class_name || "tu clase";
      const cancelReason = reason ? ` (motivo: ${reason})` : "";
      notifyByTemplate(
        b.user_id,
        "booking_cancelled",
        { class: className, date: dateStr, time: timeStr, creditRestored: "Sí" },
        ({ firstName }) =>
          `${firstName}, tuvimos que cancelar la clase de ${className}${dateStr ? ` del ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""}.${cancelReason} Tu clase regresó a tu paquete.`,
      ).catch(() => {});
      waQueued++;
    }
```

   En la respuesta: `wa_queued: waQueued, wa_failed: waUnreached.length, wa_unreached: waUnreached,` en lugar de `wa_sent: waSent,`.

4. **`runClassReminderCron`:**
   - Antes del `for`: `const channel = await whatsappChannelState();`.
   - La consulta de deduplicación pasa a `… AND status = 'ok' LIMIT 1`.
   - Si `!channel.connected`: registrar `status='skipped_disconnected'` y `continue` (sin llamar a `notifyByTemplate`).
   - Si está conectado: `const r = await notifyByTemplate(...).catch((e) => ({ sent: false, reason: "exception", error: e?.message }));`, y registrar `status = r?.sent ? 'ok' : 'failed'` con `detail` = `{"source":"class_reminder_cron","reason": r?.reason ?? null}`.
   - El registro usa `JSON.stringify({ source: "class_reminder_cron", reason: r?.reason ?? null })` como `detail::jsonb`.

5. **`WhatsAppBanner.tsx`:**

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import { useCanSeeFinance } from "@/lib/roles";

/** Aviso de canal caído: los avisos por WhatsApp no están saliendo (auditoría 2026-09-27, P0-1). */
export default function WhatsAppBanner() {
  const isOwner = useCanSeeFinance();
  const { data } = useQuery({
    queryKey: ["evolution-status-banner"],
    queryFn: async () => {
      const [st, ns] = await Promise.all([
        api.get("/evolution/status"),
        api.get("/settings/notification_settings").catch(() => ({ data: { data: {} } })),
      ]);
      return { connected: Boolean(st.data?.data?.connected), whatsappOn: ns.data?.data?.whatsapp_reminders !== false };
    },
    enabled: isOwner,
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
  });
  if (!isOwner || !data || data.connected || !data.whatsappOn) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-danger/25 bg-danger/10 px-5 py-3 text-[0.85rem] text-ink lg:px-8">
      <AlertTriangle size={16} className="shrink-0 text-danger" aria-hidden="true" />
      <span className="min-w-0 flex-1">WhatsApp desconectado: los avisos y recordatorios no están saliendo.</span>
      <Link to="/admin/settings?tab=whatsapp" className="shrink-0 font-bold text-ink underline underline-offset-2">Reconectar</Link>
    </div>
  );
}
```

   - Revisa que `GET /api/settings/notification_settings` exista y lo pueda leer la dueña (`/api/settings/:key` con `adminMiddleware`). Si la ruta es otra, usa la que el panel ya usa para esos ajustes (`grep -n "notification_settings" src`).
   - Móntalo en `AdminLayout.tsx` justo antes de `<main …>`, visible en celular y escritorio.

6. **`BookingsList.tsx`,** `onSuccess` de `cancelClassMutation`:

```tsx
      const d = res?.data?.data ?? {};
      if ((d.wa_failed ?? 0) > 0) {
        setUnreached(d.wa_unreached ?? []);
        toast({ title: "Clase cancelada", description: `No se pudo avisar a ${d.wa_failed} ${d.wa_failed === 1 ? "alumna" : "alumnas"} (WhatsApp desconectado).`, variant: "destructive" });
      } else {
        toast({ title: "Clase cancelada", description: `${d.bookings_cancelled ?? 0} reservas canceladas · ${d.credits_restored ?? 0} créditos devueltos · aviso por WhatsApp en cola para ${d.wa_queued ?? 0}` });
      }
```

   - Más un diálogo `open={unreached.length > 0}` con el título "Avisa a mano a estas alumnas" y la lista (nombre, y teléfono como `tel:` link).
   - Un botón "Listo" que hace `setUnreached([])`.
   - Usa `const [unreached, setUnreached] = useState<{ user_id: string; display_name: string | null; phone: string | null }[]>([])`.
   - Conserva las invalidaciones de consultas existentes del `onSuccess`.

- [ ] **Step 4: Pruebas.**
  - **`WhatsAppBanner.test.tsx`:** con dueña (`useAuthStore.setState` rol admin antes de montar), `/evolution/status` → `{ connected: false }` y ajustes `{ whatsapp_reminders: true }` → aparece el texto. Con `connected: true` no aparece. Con rol `reception` no aparece.
  - **Prueba de `BookingsList`:** en el archivo de prueba existente de `BookingsList` (o uno nuevo `BookingsList.cancelar.test.tsx`), `PUT /classes/:id/cancel` responde `{ data: { bookings_cancelled: 2, credits_restored: 2, wa_queued: 0, wa_failed: 2, wa_unreached: [{ user_id: "u1", display_name: "Ana", phone: "5512345678" }, …] } }` → aparece el diálogo con "Ana" y su teléfono.
  - **`server/tests/whatsapp-honesto.test.mjs`** (base desechable, sin Evolution configurado): clase con 2 reservas; `PUT /api/classes/:id/cancel` → `wa_queued: 0`, `wa_failed: 2`, `wa_unreached` con 2 elementos y **sin** `wa_sent`.

- [ ] **Step 5: Verde**: `npm run test:server`, `npx vitest run src/components/admin src/pages/admin/bookings`, tus pruebas de rutas (5543/8143) → PASS; tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add server/lib/whatsappState.js server/lib/whatsappState.test.js server/index.js src/components/admin/WhatsAppBanner.tsx src/components/admin/WhatsAppBanner.test.tsx src/components/admin/AdminLayout.tsx src/pages/admin/bookings/BookingsList.tsx src/pages/admin/bookings/*.test.tsx server/tests/whatsapp-honesto.test.mjs
git commit -m "fix(hive): WhatsApp honesto — no se cuentan como enviados avisos con el canal caído, lista para avisar a mano y banner en el panel"
```

---

### Task 4: Check-in con una sola regla

**Files:**
- Create: `server/lib/checkin.js`, `server/lib/checkin.test.js`, `server/tests/checkin-regla.test.mjs`
- Modify: `server/index.js`:
  - `PUT /api/bookings/:id/check-in` (~13913–13994).
  - `POST /api/admin/checkin/scan` (~13999–14080).
- Modify:
  - `src/components/admin/CheckinScanner.tsx`: tipo `ScanResult.status`, ~15; `styleFor`, ~224.
  - `src/pages/admin/attendance/TodayAttendance.tsx`: `onError`, ~155–162.
  - `src/pages/admin/bookings/BookingsList.tsx`: `onError` del check-in, ~256–262.

**Interfaces:**
- Consumes (Task 1): `isUuid` de `./lib/validate.js`.
- Produces:

```js
export const CHECKIN_OPENS_MIN_BEFORE = 90;
export function checkinRule({ bookingStatus, classStatus, classDate, startTime, nowDate, nowMinutes })
// classDate y nowDate como "YYYY-MM-DD" (zona del estudio); startTime "HH:MM[:SS]"; nowMinutes minutos desde medianoche (zona del estudio)
// → { ok: true } | { ok: false, code: "BOOKING_NOT_ACTIVE"|"CLASS_CANCELLED"|"NOT_TODAY"|"TOO_EARLY", message }
```

- [ ] **Step 1: Prueba en rojo**, `server/lib/checkin.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkinRule } from "./checkin.js";

const base = { bookingStatus: "confirmed", classStatus: "scheduled", classDate: "2026-09-27", startTime: "08:00:00", nowDate: "2026-09-27", nowMinutes: 7 * 60 + 45 };

test("reserva confirmada de hoy dentro de la ventana → ok", () => {
  assert.deepEqual(checkinRule(base), { ok: true });
  assert.deepEqual(checkinRule({ ...base, bookingStatus: "checked_in" }), { ok: true });
  assert.deepEqual(checkinRule({ ...base, nowMinutes: 22 * 60 }), { ok: true }, "después de la clase, mismo día");
});

test("reservas no activas", () => {
  for (const s of ["cancelled", "waitlist", "no_show"]) {
    assert.equal(checkinRule({ ...base, bookingStatus: s }).code, "BOOKING_NOT_ACTIVE");
  }
});

test("clase cancelada", () => {
  assert.equal(checkinRule({ ...base, classStatus: "cancelled" }).code, "CLASS_CANCELLED");
});

test("otro día (futuro o pasado), comparando fechas de la zona del estudio", () => {
  const f = checkinRule({ ...base, classDate: "2026-12-15" });
  assert.equal(f.code, "NOT_TODAY");
  assert.match(f.message, /otro día/);
  assert.equal(checkinRule({ ...base, classDate: "2026-09-26", startTime: "23:30:00", nowDate: "2026-09-27", nowMinutes: 10 }).code, "NOT_TODAY");
});

test("demasiado temprano: abre 90 min antes", () => {
  const r = checkinRule({ ...base, nowMinutes: 6 * 60 + 29 });
  assert.equal(r.code, "TOO_EARLY");
  assert.match(r.message, /06:30/);
  assert.deepEqual(checkinRule({ ...base, nowMinutes: 6 * 60 + 30 }), { ok: true });
});
```

- [ ] **Step 2: Correr y ver que falla**: `node --test server/lib/checkin.test.js` → FAIL.

- [ ] **Step 3: Implementar.** `server/lib/checkin.js`:

```js
// Regla única de check-in para QR, lista y coach (auditoría 2026-09-27, P0-5).
export const CHECKIN_OPENS_MIN_BEFORE = 90;

const toMin = (hhmm) => {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmt = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function checkinRule({ bookingStatus, classStatus, classDate, startTime, nowDate, nowMinutes }) {
  if (!["confirmed", "checked_in"].includes(bookingStatus)) {
    return { ok: false, code: "BOOKING_NOT_ACTIVE", message: "La reserva no está activa." };
  }
  if (classStatus === "cancelled") {
    return { ok: false, code: "CLASS_CANCELLED", message: "La clase fue cancelada." };
  }
  if (classDate !== nowDate) {
    return { ok: false, code: "NOT_TODAY", message: `La clase es de otro día (${classDate}).` };
  }
  const opens = Math.max(0, toMin(startTime) - CHECKIN_OPENS_MIN_BEFORE);
  if (nowMinutes < opens) {
    return { ok: false, code: "TOO_EARLY", message: `El check-in abre a las ${fmt(opens)}.` };
  }
  return { ok: true };
}
```

En `server/index.js`:
- **Import:** `import { checkinRule } from "./lib/checkin.js";` y `isUuid` de `./lib/validate.js`.
- **Helper junto a las rutas de check-in:**

```js
// Fecha y minuto actuales en la zona del estudio, para la regla de check-in.
async function studioNow(client = pool) {
  const r = await client.query(
    `SELECT to_char((NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date, 'YYYY-MM-DD') AS d,
            EXTRACT(HOUR FROM (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}'))::int * 60
              + EXTRACT(MINUTE FROM (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}'))::int AS m`,
  );
  return { nowDate: r.rows[0].d, nowMinutes: Number(r.rows[0].m) };
}

// +puntos por asistir (una sola vez por reserva): compartido por lista y QR.
async function awardCheckinPoints(userId) {
  try {
    const cfg = await getLoyaltyConfig();
    const pts = cfg.points_per_class;
    if (cfg.enabled !== false && pts > 0) {
      await pool.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Clase asistida')",
        [userId, pts],
      );
    }
  } catch (e) { console.warn("[check-in] loyalty insert failed:", e?.message); }
}
```

- **Check-in manual:**
  - Quita el `UUID_RE` local y usa `isUuid(req.params.id)`.
  - La consulta `before` trae también la clase:

```js
    const before = await pool.query(
      `SELECT b.user_id, b.status, b.checked_in_at, b.class_id, c.status AS class_status,
              to_char(c.date, 'YYYY-MM-DD') AS class_date, c.start_time
         FROM bookings b JOIN classes c ON c.id = b.class_id
        WHERE b.id = $1`,
      [req.params.id],
    );
```

  - Tras el 404, antes del UPDATE:

```js
    const bk = before.rows[0];
    const rule = checkinRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, startTime: String(bk.start_time), ...(await studioNow()) });
    if (!rule.ok) return res.status(409).json({ code: rule.code, message: rule.message });
```

  - El UPDATE pasa a `"UPDATE bookings SET status = 'checked_in', checked_in_at = COALESCE(checked_in_at, NOW()), checked_in_by = COALESCE(checked_in_by, $2) WHERE id = $1 RETURNING *"` con `[req.params.id, req.userId]`.
  - El bloque de puntos se reemplaza por `if (booking.user_id && !wasAlreadyCheckedIn) await awardCheckinPoints(booking.user_id);`.

- **QR:**
  - Quita el `isUuid` local (usa el importado).
  - La consulta `bookingRes` hoy sólo busca reservas de hoy confirmadas. Déjala así, y agrega `c.status AS class_status, to_char(c.date,'YYYY-MM-DD') AS class_date` al SELECT.
  - Tras encontrar `bk` y antes del caso `already`:

```js
    const rule = checkinRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, startTime: String(bk.start_time), ...(await studioNow()) });
    if (!rule.ok) return res.status(409).json({ status: "rejected", code: rule.code, name, message: `${name}: ${rule.message}` });
```

  - El UPDATE pasa a `"UPDATE bookings SET status = 'checked_in', checked_in_at = NOW(), checked_in_by = $2 WHERE id = $1"` con `[bk.id, req.userId]`.
  - Los puntos se reemplazan por `await awardCheckinPoints(userId);`.

- **Panel:**
  - **`CheckinScanner.tsx`:** agregar `"rejected"` al tipo de `status` y, en `styleFor`, `if (status === "rejected") return "bg-danger/10 text-danger border-danger/25";`, antes del caso por defecto.
  - **`TodayAttendance.tsx` y `BookingsList.tsx`:** el `onError` del check-in muestra el motivo:

```tsx
    onError: (e: any) => toast({ title: "No se pudo hacer check-in", description: e?.response?.data?.message ?? "Intenta de nuevo.", variant: "destructive" }),
```

- [ ] **Step 4: Rutas.** `server/tests/checkin-regla.test.mjs` (base desechable), con `ventanaAhora()` de helpers para una clase que empieza en ~30 min.
  - **Manual de hoy:** 200, y `SELECT checked_in_by` = id de la admin.
  - **Manual de una clase en `day(80)`:** 409 `NOT_TODAY`.
  - **Manual de una reserva cancelada:** 409 `BOOKING_NOT_ACTIVE`.
  - **QR de una clase que empieza en ~3 h:** 409 `TOO_EARLY`, con `status: "rejected"`.
  - **Puntos:** check-in manual dos veces → una sola fila en `loyalty_transactions` con `description = 'Clase asistida'` para esa usuaria después de la prueba.

- [ ] **Step 5: Verde**: `npm run test:server`, `npx vitest run src/components/admin src/pages/admin`, tus rutas (5544/8144) más `server/tests/robustez.test.mjs` y `creditos.test.mjs` (tocan check-in) → PASS. Si alguna prueba vieja marcaba check-in de otro día como válido, ajústala a la regla nueva y dilo en el reporte.

- [ ] **Step 6: Commit**

```bash
git add server/lib/checkin.js server/lib/checkin.test.js server/index.js src/components/admin/CheckinScanner.tsx src/pages/admin/attendance/TodayAttendance.tsx src/pages/admin/bookings/BookingsList.tsx server/tests/checkin-regla.test.mjs
git commit -m "fix(hive): check-in con una sola regla para lista y QR (hoy, desde 90 min antes, reserva activa) y con quién lo hizo"
```

---

### Task 5: Responsiva en todas las vías, con "Firmará en recepción"

**Files:**
- Modify: `server/index.js`:
  - `ensureSchema()`: tres columnas nuevas en `bookings`.
  - `POST /api/bookings/with-guest` (~10079).
  - `POST /api/admin/bookings/assign` (~13572–13670).
- Modify: `src/pages/admin/bookings/BookingsList.tsx`: `assignMutation` (~318–345) y diálogo de asignar (~513+).
- Create: `server/tests/responsiva-vias.test.mjs`, `src/pages/admin/bookings/BookingsList.responsiva.test.tsx`

**Interfaces:**
- Consumes (Task 1): `isUuid`.
- **Body de assign acepta:** `waiverOverride?: { reason: string }`.
- **Assign sin responsiva y sin override:** 403 `{ code: "WAIVER_REQUIRED", message }`.
- **Columnas nuevas en `bookings`:** `waiver_override_reason TEXT`, `waiver_override_by UUID`, `waiver_override_at TIMESTAMPTZ`.

- [ ] **Step 1: Pruebas en rojo.**
  - **`server/tests/responsiva-vias.test.mjs`:** clientas con `makeClient(PFX, "x", { waiver: false })` y membresía.
    - (a) Assign de admin a una clase → 403 `WAIVER_REQUIRED`.
    - (b) Assign con `waiverOverride: { reason: "Firmará en recepción hoy" }` → 2xx, y la reserva tiene `waiver_override_reason` igual, `waiver_override_by` = id de la admin y `waiver_override_at` no nulo.
    - (c) Assign con `waiverOverride: { reason: "ok" }` (menos de 5 caracteres) → 400.
    - (d) `POST /api/bookings/with-guest` de la clienta sin responsiva → 403 `WAIVER_REQUIRED`.
    - (e) Assign con `classId: "basura"` → 400.
    - (f) Con responsiva firmada, assign sin override → 2xx y columnas nulas.
  - **`BookingsList.responsiva.test.tsx`:**
    - Al asignar, `api.post("/admin/bookings/assign")` rechaza con `{ response: { status: 403, data: { code: "WAIVER_REQUIRED", message: "…" } } }` → aparece "Esta clienta no ha firmado su responsiva" y la casilla "Firmará en recepción".
    - Marcarla y escribir el motivo "Firmará hoy en mostrador" → el botón "Asignar de todos modos" llama a `api.post` con `waiverOverride: { reason: "Firmará hoy en mostrador" }`.
    - Con motivo de menos de 5 caracteres, el botón está deshabilitado.

- [ ] **Step 2: Correr y ver que fallan**:
  - Rutas: 403 no llega (hoy asigna sin revisar).
  - Panel: no hay diálogo.

- [ ] **Step 3: Implementar** en `server/index.js`:
  - **`ensureSchema()`,** junto a los demás `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS`:

```js
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS waiver_override_at TIMESTAMPTZ`).catch(() => { });
```

  - **Helper:**

```js
const hasSignedWaiver = async (db, userId) =>
  (await db.query("SELECT 1 FROM waivers WHERE user_id = $1 LIMIT 1", [userId]).catch(() => ({ rows: [] }))).rows.length > 0;
const WAIVER_REQUIRED_MSG = "Antes de tu primera reserva necesitas leer y firmar la responsiva y consentimiento informado.";
```

  - **`POST /api/bookings`:** usa el helper en su compuerta actual (mismo comportamiento).
  - **`with-guest`:** tras validar `classId`, `if (!isUuid(classId)) return res.status(400).json({ message: "Identificador inválido" });` y `if (!(await hasSignedWaiver(pool, req.userId))) return res.status(403).json({ code: "WAIVER_REQUIRED", message: WAIVER_REQUIRED_MSG });`.
  - **`assign`,** tras `if (!classId || !userId) …`:

```js
  if (!isUuid(classId) || !isUuid(userId)) return res.status(400).json({ message: "Identificador inválido" });
  const override = req.body?.waiverOverride;
  const overrideReason = typeof override?.reason === "string" ? override.reason.trim() : "";
  if (override && overrideReason.length < 5) return res.status(400).json({ message: "Escribe el motivo (mínimo 5 caracteres)." });
  const signed = await hasSignedWaiver(pool, userId);
  if (!signed && !override) {
    return res.status(403).json({ code: "WAIVER_REQUIRED", message: "Esta clienta no ha firmado su responsiva." });
  }
```

    El `INSERT INTO bookings` de la clienta principal (no el de la invitada) pasa a:

```js
      `INSERT INTO bookings (class_id, user_id, membership_id, status, waiver_override_reason, waiver_override_by, waiver_override_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [classId, userId, membership.id, bookingStatus,
       !signed ? overrideReason : null, !signed ? req.userId : null, !signed ? new Date() : null]
```

- **Panel (`BookingsList.tsx`):**
  - Estado nuevo: `waiverBlocked: boolean`, `waiverSignsAtDesk: boolean`, `waiverReason: string`.
  - En el `onError` de `assignMutation`: si `e?.response?.data?.code === "WAIVER_REQUIRED"` → `setWaiverBlocked(true)`, sin toast de error genérico.
  - `assignMutation` acepta un argumento opcional `{ waiverOverride }` y lo agrega al body.
  - Dentro del diálogo de asignar, cuando `waiverBlocked`:

```tsx
            {waiverBlocked && (
              <div className="space-y-2 rounded-xl border border-danger/25 bg-danger/10 p-3">
                <p className="text-sm font-bold text-ink">Esta clienta no ha firmado su responsiva</p>
                <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={waiverSignsAtDesk} onChange={(e) => setWaiverSignsAtDesk(e.target.checked)} />
                  Firmará en recepción
                </label>
                {waiverSignsAtDesk && (
                  <Input placeholder="Motivo (obligatorio)" value={waiverReason} onChange={(e) => setWaiverReason(e.target.value)} />
                )}
                <Button
                  disabled={!waiverSignsAtDesk || waiverReason.trim().length < 5 || assignMutation.isPending}
                  onClick={() => assignMutation.mutate({ waiverOverride: { reason: waiverReason.trim() } })}
                >
                  Asignar de todos modos
                </Button>
              </div>
            )}
```

  - Al cerrar el diálogo o cambiar de clienta, reinicia los tres estados.

- [ ] **Step 4: Verde**: `npx vitest run src/pages/admin/bookings`, `npm run test:server`, tus rutas (5545/8145) más `permisos.test.mjs` y `creditos.test.mjs` → PASS; tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/pages/admin/bookings/BookingsList.tsx src/pages/admin/bookings/BookingsList.responsiva.test.tsx server/tests/responsiva-vias.test.mjs
git commit -m "fix(hive): responsiva exigida también al asignar y al reservar con invitada; recepción puede asignar con motivo"
```

---

### Task 6: No cerrar sesión por límite de velocidad

**Files:**
- Modify:
  - `src/stores/authStore.ts`: `checkAuth`, ~115–133, y el tipo del estado.
  - `src/components/admin/AuthGuard.tsx`.
  - `src/components/layout/ClientAuthGuard.tsx`.
  - `server/index.js`: `createSimpleRateLimiter` y el limitador de `/api`, ~2053–2095.
- Create: `src/stores/authStore.checkAuth.test.ts`, `server/lib/rateKey.js`, `server/lib/rateKey.test.js`

**Interfaces:**
- **Estado nuevo:** `sessionCheck: "idle" | "ok" | "unauthorized" | "unavailable"`.
- Produces:

```js
export function rateKey(req, verify) // "user:<id>" si Authorization trae un JWT válido (verify devuelve {userId|id|sub}); si no, "ip:<ip>"
```

- [ ] **Step 1: Pruebas en rojo.**

`src/stores/authStore.checkAuth.test.ts`: `vi.mock("@/lib/api")`. Antes de cada prueba, `localStorage.setItem("auth_token", "tok")` y `useAuthStore.setState({ user: null, token: null, isAuthenticated: false, sessionCheck: "idle" })`.
- **401:** `api.get` rechaza con `{ response: { status: 401 } }` → `checkAuth()`; token borrado, `isAuthenticated: false`, `sessionCheck: "unauthorized"`.
- **429:** rechaza con `{ response: { status: 429, headers: { "retry-after": "0" } } }` en las 3 llamadas (usa `vi.useFakeTimers()` y avanza los tiempos) → token **conservado**, `sessionCheck: "unavailable"`, sin llamar a `/auth/login`.
- **429 una vez y luego 200** con `{ user: { id: "u", role: "admin" } }` → `isAuthenticated: true`, `sessionCheck: "ok"`.
- **Error de red** (sin `response`) → como 429.

`src/components/admin/AuthGuard.test.tsx`: con token en `localStorage`, `useAuthStore.setState({ user: null, isAuthenticated: false })`, y `api.get("/auth/me")` que rechaza con 503 las 3 veces (timers falsos) → se ve "No pudimos verificar tu sesión" y un botón "Reintentar". **No** navega a `/auth/login` (monta la ruta con `MemoryRouter` y una ruta `/auth/login` que pinte "LOGIN", y verifica que no aparezca).

`server/lib/rateKey.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { rateKey } from "./rateKey.js";

const req = (auth, ip = "1.2.3.4") => ({ headers: { authorization: auth, "x-forwarded-for": ip }, ip });
const verify = (t) => { if (t === "bueno") return { userId: "u-1" }; throw new Error("jwt"); };

test("JWT válido → llave por usuaria", () => assert.equal(rateKey(req("Bearer bueno"), verify), "user:u-1"));
test("sin JWT o inválido → llave por IP", () => {
  assert.equal(rateKey(req(undefined), verify), "ip:1.2.3.4");
  assert.equal(rateKey(req("Bearer malo"), verify), "ip:1.2.3.4");
});
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**

`server/lib/rateKey.js`:

```js
// Llave del limitador: por usuaria si trae sesión válida, por IP si no
// (auditoría 2026-09-27, P1-4: todo el estudio en el mismo Wi-Fi compartía la cuota).
export function rateKey(req, verify) {
  const h = String(req.headers?.authorization || "");
  if (h.startsWith("Bearer ")) {
    try {
      const p = verify(h.slice(7));
      const id = p?.userId ?? p?.id ?? p?.sub;
      if (id) return `user:${id}`;
    } catch { /* token inválido: cae a IP */ }
  }
  const fwd = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return `ip:${fwd || req.ip || req.socket?.remoteAddress || "unknown"}`;
}
```

En `server/index.js`:
- **`createSimpleRateLimiter`:** acepta `max` como número o como función `(key) => number`, y `keyFn` opcional (por defecto la IP actual):

```js
function createSimpleRateLimiter({ windowMs, max, keyPrefix, shouldApply, keyFn }) {
  return (req, res, next) => {
    if (!shouldApply(req)) return next();
    const id = keyFn ? keyFn(req) : getRateLimitIp(req);
    const key = `${keyPrefix}:${id}`;
    const limit = typeof max === "function" ? max(id) : max;
    const now = Date.now();
    const current = rateLimitBuckets.get(key);
    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (current.count >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ message: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." });
    }
    current.count += 1;
    return next();
  };
}
```

  Importa `rateKey` desde `./lib/rateKey.js`.
- **El limitador `api`:**

```js
const SECURITY_RATE_LIMIT_USER_MAX = Math.max(60, Number(process.env.API_RATE_LIMIT_USER_MAX || 600));
app.use(createSimpleRateLimiter({
  windowMs: SECURITY_RATE_LIMIT_WINDOW_MS,
  keyPrefix: "api",
  keyFn: (req) => rateKey(req, (t) => jwt.verify(t, JWT_SECRET)),
  max: (key) => (key.startsWith("user:") ? SECURITY_RATE_LIMIT_USER_MAX : SECURITY_RATE_LIMIT_MAX),
  shouldApply: (req) =>
    req.path.startsWith("/api/") &&
    !req.path.startsWith("/api/wallet/v1/") &&
    req.path !== "/api/webhook/evolution",
}));
```

  - Revisa qué campo trae el JWT (`authMiddleware`, ~2997, lee `payload.userId` o similar) y usa ése en `rateKey`.
  - El limitador `auth` no cambia.

`src/stores/authStore.ts`, `checkAuth`:

```ts
      checkAuth: async () => {
        const token = localStorage.getItem("auth_token");
        if (!token) { set({ isLoading: false, sessionCheck: "unauthorized" }); return; }
        if (import.meta.env.DEV && isDevDemoToken(token)) {
          set({ user: buildDemoUser(), token, isAuthenticated: true, isLoading: false, sessionCheck: "ok" });
          return;
        }
        set({ isLoading: true });
        const waits = [1000, 2000, 4000];
        for (let attempt = 0; ; attempt++) {
          try {
            const res = await api.get<{ user: User }>("/auth/me");
            set({ user: res.data.user, token, isAuthenticated: true, isLoading: false, sessionCheck: "ok" });
            return;
          } catch (err: any) {
            const status = err?.response?.status;
            if (status === 401) {
              localStorage.removeItem("auth_token");
              set({ user: null, token: null, isAuthenticated: false, isLoading: false, sessionCheck: "unauthorized" });
              return;
            }
            if (attempt >= waits.length - 1) {
              // 429, 5xx o red: la sesión NO se cierra; se conserva lo que había.
              set((s) => ({ token, isLoading: false, sessionCheck: "unavailable", isAuthenticated: Boolean(s.user) }));
              return;
            }
            const ra = Number(err?.response?.headers?.["retry-after"]);
            await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : waits[attempt]));
          }
        }
      },
```

- **Estado inicial:** `sessionCheck: "idle"`, y el tipo en `AuthState`.
- **Guardias** (`AuthGuard.tsx`, `ClientAuthGuard.tsx`): tras `checked`, si `sessionCheck === "unavailable"` y `!user` (no hay usuaria guardada), muestra:

```tsx
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 text-foreground p-6 text-center">
        <p>No pudimos verificar tu sesión. El servidor está ocupado.</p>
        <button type="button" className="min-h-[44px] rounded-full border px-5 font-bold" onClick={() => { setChecked(false); checkAuth().then(() => setChecked(true)); }}>
          Reintentar
        </button>
      </div>
```

  en vez de redirigir al login. Con usuaria guardada, siguen como hoy.
- Revisa que `ClientAuthGuard` use el mismo patrón y adáptalo con su propio estado.

- [ ] **Step 4: Verde**: `npx vitest run src/stores src/components`, `npm run test:server` → PASS; tsc limpio. Corre también `server/tests/seguridad.test.mjs` en tu base (5546/8146): el limitador de login sigue funcionando.

- [ ] **Step 5: Commit**

```bash
git add src/stores/authStore.ts src/stores/authStore.checkAuth.test.ts src/components/admin/AuthGuard.tsx src/components/admin/AuthGuard.test.tsx src/components/layout/ClientAuthGuard.tsx server/lib/rateKey.js server/lib/rateKey.test.js server/index.js
git commit -m "fix(hive): un límite de velocidad ya no cierra la sesión; el límite de /api es por usuaria con sesión"
```

---

### Task 7: Membresías vencidas fuera de los conteos y pagos sin duplicar

**Files:**
- Modify: `server/index.js`:
  - Conteo de activas en reportes, ~11278.
  - Conteo en `GET /api/admin/stats`, ~12854.
  - `GET /api/memberships/my`, ~3407–3455.
  - Subconsulta `mq` de `GET /api/payments`, ~14584–14598.
  - Filtro "activas" de la lista de membresías del panel, si existe (`grep -n "status = 'active'" server/index.js` en la ruta de listado admin de membresías).
- Modify: `src/pages/client/Dashboard.tsx` (etiqueta "Activa", ~263).
- Create: `server/tests/vencidas-pagos.test.mjs`, `src/pages/client/Dashboard.vencida.test.tsx`

**Interfaces:** `GET /api/memberships/my` agrega `isExpired: boolean` al objeto (camelCase como el resto).

- [ ] **Step 1: Pruebas en rojo.**

`server/tests/vencidas-pagos.test.mjs` (base desechable):
- **Clienta con membresía vencida** (insertada con `sql`, `status='active'`, `end_date = CURRENT_DATE - 10`):
  - `GET /api/admin/stats` → el conteo de activas no la incluye. Compara el antes y el después de insertarla.
  - Mismo chequeo con el conteo del reporte (`activeMembers`).
  - `GET /api/memberships/my` de esa clienta → `isExpired: true`.
- **Clienta con orden aprobada y membresía con `order_id` a esa orden:** `GET /api/payments?userId=<id>` → una sola fila por la compra, y `total` igual a `total_amount` de la orden.

`src/pages/client/Dashboard.vencida.test.tsx`: con `/memberships/my` → `{ data: { planName: "Mes", classLimit: 8, classesRemaining: 3, isExpired: true } }` → aparece "Vencida" y no "Activa". Sigue el patrón de `Dashboard.render.test.tsx`: `renderPage` con `api` simulado.

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**
- **Los dos conteos:** `"SELECT COUNT(*) FROM memberships WHERE status = 'active' AND (end_date IS NULL OR end_date >= (NOW() AT TIME ZONE '" + STUDIO_TIMEZONE + "')::date)"`. Usa template literal como el resto del archivo.
- **`/memberships/my`:** en el `ORDER BY`, antes del `CASE m.status`, agregar `CASE WHEN m.end_date IS NOT NULL AND m.end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date THEN 1 ELSE 0 END ASC,`. En el SELECT, agregar `(m.end_date IS NOT NULL AND m.end_date < (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) AS is_expired`.
- **`mq` de payments:** `WHERE m.status = 'active' AND m.order_id IS NULL`.
- **Filtro "activas" de la lista admin de membresías,** si filtra sólo por `status='active'`: agrega la misma condición de fecha a ese filtro. No cambies otros filtros.
- **`Dashboard.tsx`:** donde está `<Tag tint="success">Activa</Tag>`:

```tsx
                  {membership.isExpired ? <Tag tint="danger">Vencida</Tag> : <Tag tint="success">Activa</Tag>}
```

  Agrega `isExpired?: boolean` al tipo de la membresía si lo tiene.

- [ ] **Step 4: Verde**: `npx vitest run src/pages/client`, `npm run test:server`, tus rutas (5547/8147) más `reportes.test.mjs` → PASS; tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/pages/client/Dashboard.tsx src/pages/client/Dashboard.vencida.test.tsx server/tests/vencidas-pagos.test.mjs
git commit -m "fix(hive): membresías vencidas fuera de los conteos de activas y pagos sin contar doble"
```

---

### Task 8: Alerta de salud y "primera vez" en las listas de clase

**Files:**
- Modify: `server/index.js`:
  - `GET /api/admin/today-roster`, consulta de `rosters`, ~9760–9779.
  - `GET /api/classes/:id/roster`, ~14104–14140.
- Modify:
  - `src/lib/today-roster.ts`: `TodayRosterEntry`.
  - `src/pages/admin/attendance/TodayAttendance.tsx`: fila de la lista, ~84 y ~180.
  - `src/pages/admin/bookings/BookingsList.tsx`: fila de la lista, ~453–480, y el tipo `RosterEntry`, ~43–52.
- Create: `src/components/admin/HealthBadges.tsx`, `src/components/admin/HealthBadges.test.tsx`, `server/tests/roster-salud.test.mjs`

**Interfaces:**
- `today-roster`, por fila (snake_case): `has_injury: boolean`, `injury_details: string | null`, `health_notes: string | null`, `first_visit: boolean`.
- `classes/:id/roster`, por fila (camelCase, pasa por `camelRow`): `hasInjury`, `injuryDetails`, `healthNotes`, `firstVisit`.
- Produces:

```tsx
export function HealthBadges(props: { hasInjury?: boolean | null; injuryDetails?: string | null; healthNotes?: string | null; firstVisit?: boolean | null })
```

- [ ] **Step 1: Pruebas en rojo.**

`HealthBadges.test.tsx`:
- Sin datos → no renderiza nada.
- `hasInjury` con detalle "Rodilla derecha" → botón "Lesión"; al tocarlo aparece "Rodilla derecha".
- Sólo `healthNotes` → también "Lesión", y el detalle muestra las notas.
- `firstVisit` → etiqueta "Primera vez".

`server/tests/roster-salud.test.mjs` (base desechable):
- **Clienta con lesión:** `UPDATE users SET has_injury = true, injury_details = 'Rodilla' …` vía `sql`, reservada en una clase de hoy (`ventanaAhora`). `GET /api/admin/today-roster` → su fila con `has_injury: true`, `injury_details: 'Rodilla'`, `first_visit: true`.
- **Tras marcarle un check-in anterior** (otra reserva con `checked_in_at` en una clase pasada, insertada vía `sql`): `first_visit: false`.
- **`GET /api/classes/:id/roster`:** `hasInjury: true`.

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**

**`today-roster`,** agregar al SELECT:

```sql
              COALESCE(gp.has_injury, u.has_injury, false) AS has_injury,
              COALESCE(gp.injury_details, u.injury_details) AS injury_details,
              u.health_notes,
              NOT EXISTS (
                SELECT 1 FROM bookings pb
                 WHERE pb.checked_in_at IS NOT NULL AND pb.id <> b.id
                   AND ((b.user_id IS NOT NULL AND pb.user_id = b.user_id)
                     OR (b.guest_profile_id IS NOT NULL AND pb.guest_profile_id = b.guest_profile_id))
              ) AS first_visit
```

**`classes/:id/roster`,** agregar al SELECT:

```sql
              COALESCE(u.has_injury, false) AS has_injury, u.injury_details, u.health_notes,
              NOT EXISTS (SELECT 1 FROM bookings pb WHERE pb.user_id = b.user_id AND pb.checked_in_at IS NOT NULL AND pb.id <> b.id) AS first_visit
```

**`HealthBadges.tsx`:**

```tsx
import { useState } from "react";
import { HeartPulse } from "lucide-react";

type Props = { hasInjury?: boolean | null; injuryDetails?: string | null; healthNotes?: string | null; firstVisit?: boolean | null };

/** Alertas para la coach y recepción: lesión o notas de salud, y primera visita (auditoría 2026-09-27, P1-8). */
export function HealthBadges({ hasInjury, injuryDetails, healthNotes, firstVisit }: Props) {
  const [open, setOpen] = useState(false);
  const notes = [injuryDetails, healthNotes].map((s) => (s ?? "").trim()).filter(Boolean);
  const injury = Boolean(hasInjury) || notes.length > 0;
  if (!injury && !firstVisit) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {injury && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-danger/25 bg-danger/10 px-2 text-[0.75rem] font-bold text-danger"
          >
            <HeartPulse size={12} aria-hidden="true" /> Lesión
          </button>
          {open && (
            <span role="note" className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-xl border border-line bg-surface p-3 text-[0.8rem] text-ink shadow-float">
              {notes.length ? notes.map((n) => <span key={n} className="block">{n}</span>) : "Reportó una lesión sin detalle."}
            </span>
          )}
        </span>
      )}
      {firstVisit && (
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold text-accent-strong">
          Primera vez
        </span>
      )}
    </span>
  );
}
```

- **`today-roster.ts`:** agregar `has_injury?: boolean; injury_details?: string | null; health_notes?: string | null; first_visit?: boolean;` a `TodayRosterEntry`.
- **`TodayAttendance.tsx`:** en la fila, junto al nombre, `<HealthBadges hasInjury={r.has_injury} injuryDetails={r.injury_details} healthNotes={r.health_notes} firstVisit={r.first_visit} />`.
- **`BookingsList.tsx`:** agregar `hasInjury?`, `injuryDetails?`, `healthNotes?` y `firstVisit?` al tipo `RosterEntry`, y `<HealthBadges … />` bajo el nombre de cada fila.
- El botón "Lesión" mide 28 px de alto: está dentro de una fila que ya es el objetivo táctil principal. Si el revisor lo pide, se sube a 44 px.

- [ ] **Step 4: Verde**: `npx vitest run src/components/admin src/pages/admin`, `npm run test:server`, tus rutas (5548/8148) → PASS; tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/index.js src/lib/today-roster.ts src/components/admin/HealthBadges.tsx src/components/admin/HealthBadges.test.tsx src/pages/admin/attendance/TodayAttendance.tsx src/pages/admin/bookings/BookingsList.tsx server/tests/roster-salud.test.mjs
git commit -m "fix(hive): alerta de lesión y primera vez en Pasar lista y en la lista de cada clase"
```

---

### Task 9: Verificación

**Files:** ninguno nuevo. La evidencia va a `.superpowers/sdd/<plan>/verificacion/` (ignorado).

- [ ] **Step 1: Suites.** `npm test` (frontend, `test:server` y scripts) → todo en verde. Si hay esperas agotadas del panel por carga de la máquina, re-correr esos archivos solos y reportar ambos resultados.
- [ ] **Step 2: Build con Node 20.** `rm -rf dist && VITE_API_URL=/api npx -y node@20 node_modules/vite/bin/vite.js build` → `✓ built`.
- [ ] **Step 3: Regresión completa del servidor** en base desechable (5521/8121): `API_URL=… DATABASE_URL=… node --test --test-concurrency=1 "server/tests/*.test.mjs"` → todo en verde (las 65 de antes más las nuevas de este bloque).
- [ ] **Step 4: Barrido en navegador del panel** (base desechable 5522/8122, `dist/` servido por el servidor), con Playwright de Python en navegador propio (no el MCP compartido). Como admin, a 1280 y 390:
  - **Configuración → Wellhub:** los campos de secreto son de contraseña y la respuesta de red no contiene el secreto.
  - **Cancelar una clase con 2 reservas sin Evolution:** diálogo "Avisa a mano a estas alumnas" con las 2, y el banner "WhatsApp desconectado" visible.
  - **Pasar lista:** una clienta con lesión muestra "Lesión" y "Primera vez"; el check-in de una clase de otro día muestra el motivo.
  - **Asignar a una clienta sin responsiva:** aparece "Firmará en recepción"; con motivo, asigna.
  - **Recargar 50 veces seguidas `/admin/dashboard`:** no expulsa al login.
- [ ] **Step 5: Reporte.** Salidas de suites, regresión y barrido con capturas; desmontaje confirmado (puertos libres).
