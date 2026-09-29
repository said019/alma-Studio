# Auditoría de producción, Bloque 2 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bitácora de acciones del personal con actor, motivo y antes/después; motivo obligatorio en ventas a precio distinto o $0, ajustes y cancelaciones del estudio; corrección de falta el mismo día; "Limpiar semana", borrar clase y borrar clienta sin llevarse historial. Todo sin cambiar datos existentes.

**Architecture:**
- **Lógica pura en módulos nuevos**, cada uno con pruebas `node:test`:
  - `server/lib/audit.js`: bitácora, motivo y consulta.
  - `server/lib/membershipAdmin.js`: venta y ajuste.
  - `server/lib/weekClear.js`: clasificación de la semana.
  - `server/lib/anonymize.js` y `server/lib/accountGate.js`: baja y acceso.
  - Ampliaciones de `server/lib/checkin.js`, `server/lib/faltas.js` y `server/lib/validate.js`.
- **Rutas:** se editan en `server/index.js` por región (tabla abajo). El esquema nuevo lo agrega sólo la Tarea 1.
- **Panel:** una pantalla nueva `/admin/bitacora` y ajustes en sus pantallas; `promptText` gana `minLength`.
- **Rutas probadas con base desechable** en `server/tests/`.

**Tech Stack:** Node 20 ESM + Express + pg (`server/index.js`), node:test; React 18 + react-query 5 + zustand + vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-auditoria-bloque2-design.md`

## Global Constraints

- **Worktree base:** `/Users/saidromero/Alma Studio/alma-hive-auditoria-b2`, rama `hive-auditoria-b2`, base d1a974c. Cada tarea trabaja en su propio worktree (lo crea el controlador).
- `node_modules` es un enlace compartido: **nunca** `npm install`.
- Nada de push, merge ni producción.
- **Sin migrar datos:** tablas y columnas nuevas sólo con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` en `ensureSchema()`, y **sólo en la Tarea 1**. Nada de `UPDATE`/`DELETE` de migración.
- **Sin borrados de historial:** ningún flujo nuevo borra reservas, órdenes, pagos ni membresías.
- **Errores:**
  - Una entrada mala da 4xx con mensaje claro en español, nunca 500.
  - Los errores de base inesperados siguen como 500 "Error interno", sin detalle.
  - Motivo faltante → 400 `{ code: "REASON_REQUIRED", message }` con el texto de `reasonProblem()`.
- **Datos personales y de salud:**
  - Sólo salen por rutas de staff.
  - La bitácora sólo la lee la dueña (`ownerMiddleware`).
  - Una fila de bitácora nunca guarda los datos personales que se están borrando.
- **Bitácora dentro de la transacción** en ventas, ajustes, cancelaciones, limpieza, bajas y corrección. `recordAuditBestEffort` (que nunca lanza) en check-in, QR y marcar falta.
- **Commits:** en español (`fix(hive): …`), terminando con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Pruebas unitarias del servidor:** `server/lib/<nombre>.test.js` (glob de `npm run test:server`).
- **Pruebas de rutas:** `server/tests/<nombre>.test.mjs` (glob de `npm run test:regression`), con los helpers de `server/tests/helpers.mjs`: `api`, `login`, `sql`, `makeClient(prefix, key, {role, waiver})`, `studioFixtures`, `makeClass`, `giveMembership`, `credits`, `ventanaAhora`, `cleanup`, `closeDb`, `day`, `ADMIN`.
- **Base desechable para pruebas de rutas:** el procedimiento de `docs/superpowers/plans/2026-09-24-hive-sistema-visual.md`, Task 13 Step 2, con los puertos de tu tarea (`<PG>`/`<API>`):
  - Agrega `API_RATE_LIMIT_USER_MAX=100000` a las variables del servidor (el límite por usuaria del bloque 1).
  - Corre sólo tus archivos de `server/tests` más los que ya existían del área, apuntando `API_URL=http://127.0.0.1:<API>` y `DATABASE_URL=postgres://alma:alma@127.0.0.1:<PG>/hive`.
  - Al terminar: `lsof -ti tcp:<API> | xargs kill; pg_ctl -D "$SP/pg" stop -m fast; rm -rf "$SP"`.
- **Comandos:**
  - `npx vitest run <archivo>`.
  - `npm run test:server`.
  - `npx tsc --noEmit -p tsconfig.app.json`: ignora los errores preexistentes de `aliases` en `AdminLayout.tsx` y los de supabase.
  - `VITE_API_URL=/api npx vite build`.
- **Panel:** colores por clases del tema (`text-ink`, `text-ink-muted`, `bg-danger/10`, `border-line`, `bg-accent-soft`…); nada de hex; texto de al menos 12 px (`text-[0.75rem]` es el mínimo).
- **Textos de la interfaz en español**, tal como los fija el spec.
- No revertir la marca HIVE.

## Review Focus

1. **`PUT /memberships/:id` desde la ficha**, que manda estado, saldo (9999 para ilimitado) y fechas aunque no cambien: el motivo se pide sólo si algo cambia de verdad, y un cambio real nunca pasa sin motivo. Pruebas en Task 3 ("guardar sin cambios", 9999 ≡ ilimitado).
2. **Venta de un plan con precio de apertura:** el panel debe mostrar y mandar `effectivePrice`. Si manda `price`, cada venta de un ilimitado pide motivo o registra un descuento falso. Prueba en Task 3.
3. **Corregir una falta que completó el umbral** (4 → 5 con penalización):
   - Baja a 4 y devuelve los 50 puntos una vez; repetir → 409 sin puntos nuevos.
   - Una reserva que ya tenía check-in no vuelve a recibir puntos.
   - Una falta sin `falta_recorded_at` no toca el contador.
   - Prueba en Task 4.
4. **"Limpiar semana" con una clase que ya ocurrió dentro del rango:** no se cancela ni se devuelve crédito (el `force` de hoy lo hacía). Una clase "vacía" que recibe una reserva entre el conteo y el `DELETE` no se borra (`NOT EXISTS`). Prueba en Task 5.
5. **Baja de clienta:**
   - La fila de bitácora no guarda el correo, el teléfono ni la lesión borrados.
   - El token viejo da 401 al instante (el caché se limpia).
   - Una base sin alguna columna de `schema_complete.sql` no da 500 (sólo columnas existentes).
   - Prueba en Task 6.

---

## Ejecución en paralelo

| Ola | Tareas | Nota |
|---|---|---|
| 1 | 1 · 2 | T1 es servidor (esquema, `lib/audit.js`, rutas de lectura). T2 es sólo panel (pantalla, menú, `minLength`). Sin archivos en común |
| 2 | 3 · 4 · 5 · 6 | Consumen T1 (y T2 en el panel). Regiones de `server/index.js` disjuntas (tabla). Archivos del panel disjuntos |
| 3 | 7 | Verificación |

**Regiones de `server/index.js`** (números de línea en d1a974c; ancla siempre por contenido):

| Tarea | Imports | Regiones |
|---|---|---|
| 1 | nueva línea tras `import { createChannelState } …` (L74) | fin de `ensureSchema()` antes de `console.log("✅ Schema ensured")` (~L1869); sección nueva antes de `// ─── Healthcheck (Railway, uptime monitors)` (~L16170) |
| 3 | nueva línea tras `import { resolveEffectivePrice } …` (L60) | `POST /api/memberships` (~13097–13209); `PUT /api/memberships/:id` (~13363–13419); `POST /api/admin/clients/manual` (~14250–14377) |
| 4 | edita `…/lib/faltas.js` (L63) y `…/lib/checkin.js` (L72) | `studioNow`/`awardCheckinPoints` y `PUT /api/bookings/:id/check-in` (~14004–14106); `POST /api/admin/checkin/scan` (~14108–14186); `PUT /api/bookings/:id/no-show` (~14188–14207) + ruta nueva justo después |
| 5 | nueva línea tras `import { extractGymId, computeEventId } …` (L66) | helpers nuevos antes de `// PUT /api/classes/:id/cancel — admin cancela clase completa.` (~9281); `PUT /api/classes/:id/cancel` (~9287–9397); `DELETE /api/admin/bookings/:id` (~9439–9518); `DELETE /api/classes/week` (~10296–10365); `DELETE /api/admin/classes/:id` (~15312–15320) |
| 6 | nuevas líneas tras `import { publicPartnerSettings, mergeSecret } …` (L68) | `authMiddleware` (~3012–3022); `GET /api/users` (~12951–12977); `DELETE /api/users/:id` (~13001–13034) |

Si al rebasar aparece un conflicto en el bloque de imports, son líneas aditivas: conserva ambas.

**Panel por tarea:**

| Tarea | Archivos |
|---|---|
| 2 | `ConfirmDialog.tsx`, `AdminLayout.tsx`, `features.ts`, `App.tsx`, `paridad-velan.test.ts`, `lib/audit-log.ts`, `pages/admin/audit/*` |
| 3 | `PaymentsPage.tsx`, `MembershipsList.tsx`, `ClientDetail.tsx` (y sus pruebas) |
| 4 | `TodayAttendance.tsx` (y su prueba) |
| 5 | `UnreachedDialog.tsx` (nuevo), `BookingsList.tsx`, `ClassesCalendar.tsx` (y pruebas) |
| 6 | `ClientsList.tsx` (y su prueba) |

**Puertos de base desechable:** T1 5571/8171 · T2 5572/8172 (reservado; sólo vitest) · T3 5573/8173 · T4 5574/8174 · T5 5575/8175 · T6 5576/8176 · T7 5581/8181 y 5582/8182.

---

### Task 1: Bitácora en el servidor (tabla, helper y lectura)

**Files:**
- Create: `server/lib/audit.js`, `server/lib/audit.test.js`, `server/tests/bitacora.test.mjs`
- Modify: `server/lib/validate.js` (agregar `isDay`), `server/lib/validate.test.js`
- Modify: `server/index.js`:
  - Import de `./lib/audit.js` tras la línea de `whatsappState.js`.
  - Fin de `ensureSchema()`.
  - Sección nueva antes de `// ─── Healthcheck`.

**Interfaces (produce):**

```js
// server/lib/validate.js
export function isDay(value) // true si es "AAAA-MM-DD" de un día que existe

// server/lib/audit.js
export const REASON_MIN = 5, REASON_MAX = 500;
export const AUDIT_ACTIONS;       // "membership.sale" | "membership.adjust" | "booking.checkin" | "booking.no_show" |
                                  // "booking.no_show_corrected" | "booking.cancel" | "class.cancel" | "class.delete" |
                                  // "class.week_clear" | "user.anonymize"
export const AUDIT_ENTITY_TYPES;  // "membership" | "booking" | "class" | "class_week" | "user"
export function reasonProblem(reason, min = 5) // null | "Escribe el motivo (mínimo 5 caracteres)." | "…máximo 500…"
export function cleanReason(reason)            // string recortada | null
export function changedFields(before, next, keys, normalize?) // { changed: string[], before: {}, after: {} }
export async function recordAudit(db, { actorId, action, entityType, entityId?, subjectUserId?, reason?, before?, after?, meta? })
export function recordAuditBestEffort(db, entry) // Promise<void>, nunca rechaza
export function buildAuditQuery(query, { timezone }) // { ok:false, message } | { ok:true, sql, params, countSql, countParams, page, limit }
export function auditRowOut(row) // camelCase: { id, createdAt, actorId, actorName, actorRole, action, entityType, entityId, subjectUserId, subjectName, reason, before, after, meta }
```

- **Tabla `audit_log` y columnas** (ver spec §3.1): `memberships.activated_by/activated_at/payment_reference`, `bookings.cancellation_reason/cancelled_by/falta_recorded_at`, `classes.cancellation_reason/cancelled_by/cancelled_at`, `users.anonymized_at/anonymized_by`.
- **`GET /api/admin/audit`** → `{ data: AuditEntry[], page, limit, total }`.
- **`GET /api/admin/audit/actors`** → `{ data: [{ id, name, role }] }`.
- **Import en `server/index.js`** (lo usan también las tareas 3–6): `import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";`

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/validate.test.js`: cambia el import a `import { isUuid, signatureProblem, maskSecret, isMaskedSecret, isDay } from "./validate.js";` y agrega:

```js
test("isDay: AAAA-MM-DD de un día que existe", () => {
  assert.equal(isDay("2026-09-28"), true);
  assert.equal(isDay("2024-02-29"), true);
  for (const bad of ["2026-02-30", "2026-13-45", "28/09/2026", "2026-9-28", "", null, undefined, 20260928]) {
    assert.equal(isDay(bad), false, String(bad));
  }
});
```

`server/lib/audit.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonProblem, cleanReason, changedFields, recordAudit, recordAuditBestEffort, buildAuditQuery, auditRowOut, AUDIT_ACTIONS } from "./audit.js";

const U = "3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const V = "4f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("reasonProblem: mínimo 5 caracteres sin contar espacios, máximo 500", () => {
  assert.match(reasonProblem(undefined), /mínimo 5/);
  assert.match(reasonProblem("   ok   "), /mínimo 5/);
  assert.match(reasonProblem(12345), /mínimo 5/);
  assert.equal(reasonProblem("Cortesía por evento"), null);
  assert.match(reasonProblem("x".repeat(501)), /máximo 500/);
});

test("cleanReason recorta y deja null si no hay", () => {
  assert.equal(cleanReason("  hola mundo  "), "hola mundo");
  assert.equal(cleanReason(""), null);
  assert.equal(cleanReason(null), null);
  assert.equal(cleanReason("x".repeat(600)).length, 500);
});

test("changedFields sólo devuelve lo que cambia, con normalización", () => {
  const before = { classes_remaining: null, end_date: "2026-10-01", status: "active" };
  const norm = (k, v) => (k === "classes_remaining" && (v == null || Number(v) >= 9999) ? "ilimitado" : v);
  const keys = ["classes_remaining", "status", "end_date"];
  assert.deepEqual(changedFields(before, { classes_remaining: 9999, status: "active" }, keys, norm).changed, []);
  assert.deepEqual(changedFields(before, { end_date: "2026-12-31", status: "active" }, keys, norm), {
    changed: ["end_date"], before: { end_date: "2026-10-01" }, after: { end_date: "2026-12-31" },
  });
});

test("recordAudit escribe una fila con actor, motivo limpio y JSON", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  await recordAudit(db, {
    actorId: U, action: "membership.adjust", entityType: "membership", entityId: V, subjectUserId: U,
    reason: "  Compensación  ", before: { classes_remaining: 1 }, after: { classes_remaining: 3 }, meta: { above_plan: false },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO audit_log/);
  const [actor, action, type, entity, subject, reason, before, after, meta] = calls[0].params;
  assert.equal(actor, U);
  assert.equal(action, "membership.adjust");
  assert.equal(type, "membership");
  assert.equal(entity, V);
  assert.equal(subject, U);
  assert.equal(reason, "Compensación");
  assert.deepEqual(JSON.parse(before), { classes_remaining: 1 });
  assert.deepEqual(JSON.parse(after), { classes_remaining: 3 });
  assert.deepEqual(JSON.parse(meta), { above_plan: false });
});

test("recordAudit: ids que no son UUID quedan en null; acción o entidad desconocidas lanzan", async () => {
  const calls = [];
  const db = { query: async (_s, p) => { calls.push(p); return { rows: [] }; } };
  await recordAudit(db, { actorId: "no-uuid", action: "class.week_clear", entityType: "class_week" });
  assert.equal(calls[0][0], null);
  assert.equal(calls[0][3], null);
  assert.equal(calls[0][6], null);
  await assert.rejects(recordAudit(db, { action: "otra.cosa", entityType: "booking" }), /desconocida/);
  await assert.rejects(recordAudit(db, { action: "booking.cancel", entityType: "planeta" }), /desconocida/);
});

test("recordAuditBestEffort nunca lanza", async () => {
  const db = { query: async () => { throw new Error("base caída"); } };
  await recordAuditBestEffort(db, { action: "booking.checkin", entityType: "booking" });
});

test("buildAuditQuery: valores por defecto y paginación", () => {
  const q = buildAuditQuery({});
  assert.equal(q.ok, true);
  assert.equal(q.page, 1);
  assert.equal(q.limit, 50);
  assert.deepEqual(q.params, [50, 0]);
  assert.match(q.sql, /ORDER BY a\.created_at DESC/);
  assert.match(q.sql, /LIMIT \$1 OFFSET \$2/);
  assert.deepEqual(buildAuditQuery({ page: "3", limit: "20" }).params, [20, 40]);
});

test("buildAuditQuery: entidad (también la clienta), actor y fechas en la zona del estudio", () => {
  const q = buildAuditQuery(
    { entityType: "membership", entityId: U, actorId: V, from: "2026-09-01", to: "2026-09-30" },
    { timezone: "America/Mexico_City" },
  );
  assert.equal(q.ok, true);
  assert.deepEqual(q.countParams, ["membership", U, V, "2026-09-01", "2026-09-30"]);
  assert.match(q.countSql, /a\.entity_id = \$2::uuid OR a\.subject_user_id = \$2::uuid/);
  assert.match(q.countSql, /AT TIME ZONE 'America\/Mexico_City'/);
  assert.deepEqual(q.params.slice(-2), [50, 0]);
});

test("buildAuditQuery: entradas malas → ok:false con mensaje, nunca lanza", () => {
  for (const bad of [
    { entityType: "planeta" }, { action: "borrar.todo" }, { entityId: "basura" }, { actorId: "1" },
    { from: "2026-13-40" }, { to: "28/09/2026" }, { from: "2026-09-30", to: "2026-09-01" },
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { limit: "0" }, { limit: "101" }, { limit: "abc" },
  ]) {
    const r = buildAuditQuery(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.message, "string");
  }
});

test("auditRowOut pasa a camelCase", () => {
  const out = auditRowOut({
    id: "x", created_at: "t", actor_id: U, actor_name: "Dueña", actor_role: "admin", action: "booking.cancel",
    entity_type: "booking", entity_id: V, subject_user_id: U, subject_name: "Ana", reason: "r", before: {}, after: {}, meta: null,
  });
  assert.equal(out.actorName, "Dueña");
  assert.equal(out.subjectName, "Ana");
  assert.deepEqual(out.meta, {});
});

test("acciones conocidas", () => {
  assert.ok(AUDIT_ACTIONS.includes("booking.no_show_corrected"));
  assert.ok(AUDIT_ACTIONS.includes("user.anonymize"));
});
```

`server/tests/bitacora.test.mjs`:

```js
// Tarea 1 · auditoría 2026-09-27, bloque 2. Bitácora: sólo la dueña la lee, con
// filtros por entidad (o clienta), actor y fechas, paginada; entrada mala → 400.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { api, login, sql, makeClient, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgbitacora";
const ENT = randomUUID();
let A, adminId, recep;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  recep = await makeClient(PFX, "recep", { role: "reception" });
  await sql(
    `INSERT INTO audit_log (created_at, actor_id, actor_role, actor_name, action, entity_type, entity_id, reason, before, after, meta)
     VALUES (NOW() - INTERVAL '2 days', $1, 'admin', 'QA Admin', 'membership.adjust', 'membership', $2, 'Compensación por clase cancelada',
             '{"classes_remaining":1}', '{"classes_remaining":3}', '{"above_plan":false}'),
            (NOW(), $1, 'admin', 'QA Admin', 'booking.checkin', 'booking', $2, NULL,
             '{"status":"confirmed"}', '{"status":"checked_in"}', '{"method":"manual"}')`,
    [adminId, ENT],
  );
});
after(async () => {
  await sql(`DELETE FROM audit_log WHERE entity_id = $1`, [ENT]);
  await cleanup(PFX);
  await closeDb();
});

test("la tabla audit_log existe (ensureSchema)", async () => {
  const [r] = await sql(`SELECT to_regclass('audit_log') AS t`);
  assert.ok(r.t, "audit_log debe existir");
});

test("la dueña lee la bitácora de un registro, lo más nuevo primero, con motivo y antes/después", async () => {
  const r = await api("GET", `/api/admin/audit?entityId=${ENT}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.total, 2);
  assert.deepEqual(r.body.data.map((e) => e.action), ["booking.checkin", "membership.adjust"]);
  const ajuste = r.body.data[1];
  assert.equal(ajuste.actorName, "QA Admin");
  assert.equal(ajuste.reason, "Compensación por clase cancelada");
  assert.deepEqual(ajuste.before, { classes_remaining: 1 });
  assert.deepEqual(ajuste.after, { classes_remaining: 3 });
});

test("filtros: fechas en la zona del estudio, actor y tipo", async () => {
  const hoy = await api("GET", `/api/admin/audit?entityId=${ENT}&from=${day(0)}&to=${day(0)}`, { token: A });
  assert.equal(hoy.body.total, 1);
  assert.equal(hoy.body.data[0].action, "booking.checkin");
  const antes = await api("GET", `/api/admin/audit?entityId=${ENT}&to=${day(-1)}`, { token: A });
  assert.equal(antes.body.total, 1);
  assert.equal(antes.body.data[0].action, "membership.adjust");
  const actor = await api("GET", `/api/admin/audit?entityId=${ENT}&actorId=${adminId}`, { token: A });
  assert.equal(actor.body.total, 2);
  const tipo = await api("GET", `/api/admin/audit?entityId=${ENT}&entityType=booking`, { token: A });
  assert.equal(tipo.body.total, 1);
});

test("paginación", async () => {
  const r = await api("GET", `/api/admin/audit?entityId=${ENT}&limit=1&page=2`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.page, 2);
  assert.equal(r.body.limit, 1);
  assert.equal(r.body.total, 2);
  assert.equal(r.body.data.length, 1);
  assert.equal(r.body.data[0].action, "membership.adjust");
});

test("recepción no puede leer la bitácora (403)", async () => {
  for (const ruta of ["/api/admin/audit", "/api/admin/audit/actors"]) {
    const r = await api("GET", ruta, { token: recep.token });
    assert.equal(r.status, 403, ruta);
  }
});

test("filtros inválidos → 400 con mensaje, nunca 500", async () => {
  for (const q of ["entityId=basura", "actorId=1", "from=2026-13-40", `from=${day(1)}&to=${day(0)}`, "limit=0", "limit=500", "page=-1", "entityType=planetas", "action=borrar.todo"]) {
    const r = await api("GET", `/api/admin/audit?${q}`, { token: A });
    assert.equal(r.status, 400, q);
    assert.equal(typeof r.body.message, "string", q);
  }
});

test("actores de la bitácora para el filtro Quién", async () => {
  const r = await api("GET", "/api/admin/audit/actors", { token: A });
  assert.equal(r.status, 200);
  const yo = r.body.data.find((a) => a.id === adminId);
  assert.ok(yo, "la admin aparece como actora");
  assert.equal(yo.name, "QA Admin");
});
```

- [ ] **Step 2: Correr y ver que fallan**: `node --test server/lib/audit.test.js server/lib/validate.test.js` → FAIL (módulo e `isDay` no existen).

- [ ] **Step 3: Implementar.**

`server/lib/validate.js`, al final:

```js
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** "AAAA-MM-DD" de un día que existe en el calendario (bloque 2). */
export function isDay(value) {
  if (typeof value !== "string" || !DAY_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
```

`server/lib/audit.js`:

```js
// Bitácora de acciones del personal: quién, cuándo, qué, por qué y el antes y
// después (auditoría de producción 2026-09-27, bloque 2: P0-3 · I8 y P1-5).
import { isUuid, isDay } from "./validate.js";

export const REASON_MIN = 5;
export const REASON_MAX = 500;

export const AUDIT_ACTIONS = Object.freeze([
  "membership.sale",
  "membership.adjust",
  "booking.checkin",
  "booking.no_show",
  "booking.no_show_corrected",
  "booking.cancel",
  "class.cancel",
  "class.delete",
  "class.week_clear",
  "user.anonymize",
]);

export const AUDIT_ENTITY_TYPES = Object.freeze(["membership", "booking", "class", "class_week", "user"]);

/** null si el motivo sirve; si no, el texto del 400. */
export function reasonProblem(reason, min = REASON_MIN) {
  const s = typeof reason === "string" ? reason.trim() : "";
  if (s.length < min) return `Escribe el motivo (mínimo ${min} caracteres).`;
  if (s.length > REASON_MAX) return `El motivo es demasiado largo (máximo ${REASON_MAX} caracteres).`;
  return null;
}

/** Motivo listo para guardar: sin espacios en los extremos y recortado, o null. */
export function cleanReason(reason) {
  const s = typeof reason === "string" ? reason.trim() : "";
  return s ? s.slice(0, REASON_MAX) : null;
}

/**
 * Campos que cambian entre la fila actual (`before`) y lo que se va a guardar
 * (`next`). Sólo mira las llaves presentes en `next`. `normalize(llave, valor)`
 * iguala representaciones del mismo valor (p. ej. 9999 e ilimitado).
 */
export function changedFields(before, next, keys, normalize = (_k, v) => v) {
  const b = {};
  const a = {};
  for (const k of keys) {
    if (!next || !(k in next)) continue;
    const prev = before?.[k] ?? null;
    const val = next[k] ?? null;
    if (JSON.stringify(normalize(k, prev)) !== JSON.stringify(normalize(k, val))) {
      b[k] = prev;
      a[k] = val;
    }
  }
  return { changed: Object.keys(a), before: b, after: a };
}

const toJson = (v) => (v === undefined || v === null ? null : JSON.stringify(v));

/**
 * Escribe una fila en audit_log. `db` es el pool o el cliente de la transacción
 * en curso: dentro de una transacción, la bitácora se confirma o se revierte con
 * la acción. Lanza si la acción o la entidad no son conocidas, o si la base falla.
 */
export async function recordAudit(db, entry) {
  const {
    actorId = null, action, entityType, entityId = null, subjectUserId = null,
    reason = null, before = null, after = null, meta = {},
  } = entry || {};
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`Acción de bitácora desconocida: ${action}`);
  if (!AUDIT_ENTITY_TYPES.includes(entityType)) throw new Error(`Entidad de bitácora desconocida: ${entityType}`);
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, actor_name, action, entity_type, entity_id,
                            subject_user_id, reason, before, after, meta)
     VALUES ($1::uuid,
             (SELECT role::text FROM users WHERE id = $1::uuid),
             (SELECT display_name FROM users WHERE id = $1::uuid),
             $2, $3, $4::uuid, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      isUuid(actorId) ? actorId : null, action, entityType,
      isUuid(entityId) ? entityId : null, isUuid(subjectUserId) ? subjectUserId : null,
      cleanReason(reason), toJson(before), toJson(after), JSON.stringify(meta ?? {}),
    ],
  );
}

/** Para rutas sin transacción (check-in, QR, falta): nunca convierte un éxito en 500. */
export function recordAuditBestEffort(db, entry) {
  return recordAudit(db, entry).catch((e) => {
    console.error("[audit] no se pudo registrar", entry?.action, e?.message);
  });
}

/**
 * Consulta de GET /api/admin/audit a partir del querystring.
 * { ok:false, message } → 400; { ok:true, sql, params, countSql, countParams, page, limit }.
 * `entityId` busca en entity_id O subject_user_id: con el id de una clienta trae todo lo suyo.
 * `from`/`to` son días de la zona del estudio, inclusive.
 */
export function buildAuditQuery(query = {}, { timezone = "America/Mexico_City" } = {}) {
  const s = (v) => (typeof v === "string" ? v.trim() : "");
  const where = [];
  const params = [];
  const add = (frag, value) => {
    params.push(value);
    const n = `$${params.length}`;
    where.push(frag.replaceAll("?", () => n));
  };

  const entityType = s(query.entityType);
  if (entityType) {
    if (!AUDIT_ENTITY_TYPES.includes(entityType)) return { ok: false, message: "Tipo de registro inválido." };
    add("a.entity_type = ?", entityType);
  }
  const action = s(query.action);
  if (action) {
    if (!AUDIT_ACTIONS.includes(action)) return { ok: false, message: "Acción inválida." };
    add("a.action = ?", action);
  }
  const entityId = s(query.entityId);
  if (entityId) {
    if (!isUuid(entityId)) return { ok: false, message: "Identificador inválido" };
    add("(a.entity_id = ?::uuid OR a.subject_user_id = ?::uuid)", entityId);
  }
  const actorId = s(query.actorId);
  if (actorId) {
    if (!isUuid(actorId)) return { ok: false, message: "Identificador inválido" };
    add("a.actor_id = ?::uuid", actorId);
  }
  const from = s(query.from);
  const to = s(query.to);
  if (from && !isDay(from)) return { ok: false, message: "Fecha 'desde' inválida (usa AAAA-MM-DD)." };
  if (to && !isDay(to)) return { ok: false, message: "Fecha 'hasta' inválida (usa AAAA-MM-DD)." };
  if (from && to && from > to) return { ok: false, message: "La fecha 'desde' es posterior a 'hasta'." };
  const tz = String(timezone).replace(/'/g, "");
  if (from) add(`a.created_at >= (?::date::timestamp AT TIME ZONE '${tz}')`, from);
  if (to) add(`a.created_at < ((?::date + 1)::timestamp AT TIME ZONE '${tz}')`, to);

  const num = (v, dflt) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? dflt : Number(v));
  const page = num(query.page, 1);
  const limit = num(query.limit, 50);
  if (!Number.isInteger(page) || page < 1 || page > 100000) return { ok: false, message: "Página inválida." };
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) return { ok: false, message: "El límite debe estar entre 1 y 100." };

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(*)::int AS n FROM audit_log a ${whereSql}`;
  const countParams = [...params];
  const sql = `SELECT a.*, su.display_name AS subject_name
                 FROM audit_log a
                 LEFT JOIN users su ON su.id = a.subject_user_id
                 ${whereSql}
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  return { ok: true, sql, params: [...params, limit, (page - 1) * limit], countSql, countParams, page, limit };
}

/** Fila de audit_log → JSON del API (camelCase, como el resto del panel). */
export function auditRowOut(r) {
  return {
    id: r.id,
    createdAt: r.created_at,
    actorId: r.actor_id ?? null,
    actorName: r.actor_name ?? null,
    actorRole: r.actor_role ?? null,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id ?? null,
    subjectUserId: r.subject_user_id ?? null,
    subjectName: r.subject_name ?? null,
    reason: r.reason ?? null,
    before: r.before ?? null,
    after: r.after ?? null,
    meta: r.meta ?? {},
  };
}
```

En `server/index.js`:

**Import**, tras `import { createChannelState } from "./lib/whatsappState.js";`:

```js
import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";
```

**`ensureSchema()`**, justo antes de `console.log("✅ Schema ensured");`:

```js
    // ── Bitácora de acciones del personal (auditoría 2026-09-27, bloque 2) ──
    // Sin llaves foráneas a propósito: la bitácora sobrevive a la persona y a la
    // fila que describe. Nada de esto cambia datos existentes.
    await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
      id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor_id        UUID,
      actor_role      VARCHAR(30),
      actor_name      TEXT,
      action          VARCHAR(60) NOT NULL,
      entity_type     VARCHAR(30) NOT NULL,
      entity_id       UUID,
      subject_user_id UUID,
      reason          TEXT,
      before          JSONB,
      after           JSONB,
      meta            JSONB NOT NULL DEFAULT '{}'::jsonb
    )`).catch((e) => console.warn("[schema] audit_log:", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_id, created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_log_subject ON audit_log(subject_user_id, created_at DESC)`).catch(() => { });
    // Columnas que escribe el bloque 2. Algunas existen en schema_complete.sql,
    // pero no hay garantía de que producción las tenga.
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS activated_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE memberships ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(255)`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_by UUID`).catch(() => { });
    // La falta que registró ESTA reserva (para poder corregirla el mismo día).
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS falta_recorded_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancellation_reason TEXT`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancelled_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_by UUID`).catch(() => { });
```

**Sección nueva**, justo antes de `// ─── Healthcheck (Railway, uptime monitors)`:

```js
// ─── Bitácora (audit_log) ────────────────────────────────────────────────────
// Sólo la dueña (admin, super_admin): quién cobró, ajustó, canceló, corrigió o
// dio de baja, cuándo, por qué y el antes/después. Auditoría 2026-09-27, P0-3.
app.get("/api/admin/audit", ownerMiddleware, async (req, res) => {
  const q = buildAuditQuery(req.query, { timezone: STUDIO_TIMEZONE });
  if (!q.ok) return res.status(400).json({ message: q.message });
  try {
    const [rows, count] = await Promise.all([pool.query(q.sql, q.params), pool.query(q.countSql, q.countParams)]);
    return res.json({ data: rows.rows.map(auditRowOut), page: q.page, limit: q.limit, total: Number(count.rows[0]?.n ?? 0) });
  } catch (err) {
    console.error("[GET /admin/audit]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// Personas del equipo que aparecen en la bitácora (filtro "Quién").
app.get("/api/admin/audit/actors", ownerMiddleware, async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT ON (a.actor_id) a.actor_id AS id,
              COALESCE(u.display_name, a.actor_name) AS name,
              COALESCE(u.role::text, a.actor_role) AS role
         FROM audit_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.actor_id IS NOT NULL
        ORDER BY a.actor_id, a.created_at DESC`,
    );
    const data = r.rows.sort((x, y) => String(x.name ?? "").localeCompare(String(y.name ?? ""), "es"));
    return res.json({ data });
  } catch (err) {
    console.error("[GET /admin/audit/actors]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - En tu base desechable (5571/8171): `node --test --test-concurrency=1 server/tests/bitacora.test.mjs server/tests/validacion.test.mjs server/tests/robustez.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/audit.js server/lib/audit.test.js server/lib/validate.js server/lib/validate.test.js server/index.js server/tests/bitacora.test.mjs
git commit -m "fix(hive): bitácora audit_log con actor, motivo y antes/después, y su lectura sólo para la dueña"
```

---

### Task 2: Panel — pantalla "Bitácora", menú y `promptText` con mínimo

**Files:**
- Modify:
  - `src/components/admin/ConfirmDialog.tsx`.
  - `src/components/admin/AdminLayout.tsx` (grupo "Sistema" de `NAV_GROUPS` e import del ícono).
  - `src/config/features.ts`.
  - `src/App.tsx`.
  - `src/test/paridad-velan.test.ts`.
- Create:
  - `src/lib/audit-log.ts`, `src/lib/audit-log.test.ts`.
  - `src/pages/admin/audit/AuditLogPage.tsx`, `src/pages/admin/audit/AuditLogPage.test.tsx`.
  - `src/components/admin/ConfirmDialog.test.tsx`, `src/components/admin/AdminLayout.bitacora.test.tsx`.

**Interfaces:**
- Consumes (contrato de Task 1, simulado en vitest): `GET /admin/audit?...` → `{ data: AuditEntry[], page, limit, total }`; `GET /admin/audit/actors` → `{ data: [{ id, name, role }] }`.
- Produces:
  - `promptText({ ..., minLength?: number })`: el botón de confirmar se deshabilita hasta tener `minLength` caracteres sin contar espacios de los extremos, y muestra "Mínimo N caracteres."
  - Ruta `/admin/bitacora` y bandera `FEATURES.auditLog`.
  - `src/lib/audit-log.ts`: `AuditEntry`, `AuditPage`, `AUDIT_ENTITY_OPTIONS`, `actionLabel`, `auditChanges`, `auditSubject`, `formatAuditValue`.

- [ ] **Step 1: Pruebas en rojo.**

`src/components/admin/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useConfirm } from "./ConfirmDialog";

function Probe({ minLength }: { minLength?: number }) {
  const { promptText, dialog } = useConfirm();
  const [res, setRes] = useState<string | null | undefined>(undefined);
  return (
    <>
      <button onClick={async () => setRes(await promptText({ title: "Motivo", confirmLabel: "Guardar", minLength }))}>abrir</button>
      <output data-testid="res">{res === undefined ? "—" : res === null ? "cancelado" : res}</output>
      {dialog}
    </>
  );
}

describe("promptText con minLength", () => {
  it("no deja confirmar hasta tener el mínimo (sin contar espacios) y lo avisa", async () => {
    render(<Probe minLength={5} />);
    fireEvent.click(screen.getByText("abrir"));
    const guardar = await screen.findByRole("button", { name: "Guardar" });
    expect(screen.getByText("Mínimo 5 caracteres.")).toBeInTheDocument();
    const caja = screen.getByRole("textbox");
    fireEvent.change(caja, { target: { value: "  hola  " } });
    expect(guardar).toBeDisabled();
    fireEvent.change(caja, { target: { value: "  hola!  " } });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe("hola!"));
  });

  it("sin minLength se comporta como antes", async () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("abrir"));
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByText(/Mínimo/)).toBeNull();
  });
});
```

`src/lib/audit-log.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { actionLabel, auditChanges, auditSubject, formatAuditValue, type AuditEntry } from "./audit-log";

const base: AuditEntry = {
  id: "e1", createdAt: "2026-09-28T16:00:00Z", actorId: "a1", actorName: "Dueña HIVE", actorRole: "admin",
  action: "membership.adjust", entityType: "membership", entityId: "m1", subjectUserId: "u1", subjectName: "Ana Pérez",
  reason: "Compensación", before: { classes_remaining: 1, end_date: "2026-10-01" }, after: { classes_remaining: 3, end_date: "2026-12-31" }, meta: {},
};

describe("bitácora · textos", () => {
  it("nombra cada acción en español", () => {
    expect(actionLabel(base)).toBe("Ajuste de membresía");
    expect(actionLabel({ ...base, action: "membership.sale", meta: { courtesy: true } })).toBe("Cortesía en mostrador ($0)");
    expect(actionLabel({ ...base, action: "membership.sale", meta: { price_differs: true } })).toBe("Venta en mostrador con precio distinto");
    expect(actionLabel({ ...base, action: "membership.sale", meta: {} })).toBe("Venta en mostrador");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "qr" } })).toBe("Check-in (QR)");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "manual" } })).toBe("Check-in (lista)");
    expect(actionLabel({ ...base, action: "booking.no_show_corrected" })).toBe("Falta corregida a asistencia");
    expect(actionLabel({ ...base, action: "algo.nuevo" })).toBe("algo.nuevo");
  });

  it("antes → después con etiquetas y formato", () => {
    expect(auditChanges(base)).toEqual([
      { key: "classes_remaining", label: "Clases", before: "1", after: "3" },
      { key: "end_date", label: "Vence", before: "2026-10-01", after: "2026-12-31" },
    ]);
  });

  it("una venta muestra sólo el después y el dinero en pesos; los ids no se muestran", () => {
    const sale = { ...base, action: "membership.sale", before: null, after: { plan_name: "Paquete 8", amount: 0, list_price: 1700, payment_method: "cash", payment_reference: "ORD-000001", order_id: "o1" } };
    expect(auditChanges(sale)).toEqual([
      { key: "plan_name", label: "Plan", before: null, after: "Paquete 8" },
      { key: "amount", label: "Cobrado", before: null, after: "$0" },
      { key: "list_price", label: "Precio del plan", before: null, after: "$1,700" },
      { key: "payment_method", label: "Método", before: null, after: "Efectivo" },
      { key: "payment_reference", label: "Referencia", before: null, after: "ORD-000001" },
    ]);
  });

  it("sobre quién: clienta, clase o semana", () => {
    expect(auditSubject(base)).toBe("Ana Pérez");
    expect(auditSubject({ ...base, subjectName: null, entityType: "class", meta: { day: "2026-10-01", start_time: "09:00" } })).toBe("la clase del 2026-10-01 09:00");
    expect(auditSubject({ ...base, subjectName: null, entityType: "class_week", meta: { start: "2026-09-21", end: "2026-09-27" } })).toBe("la semana del 2026-09-21 al 2026-09-27");
  });

  it("valores especiales", () => {
    expect(formatAuditValue("classes_remaining", null)).toBe("Ilimitadas");
    expect(formatAuditValue("classes_remaining", 9999)).toBe("Ilimitadas");
    expect(formatAuditValue("status", "no_show")).toBe("Falta");
    expect(formatAuditValue("end_date", null)).toBe("—");
    expect(formatAuditValue("is_active", false)).toBe("Cerrado");
  });
});
```

`src/pages/admin/audit/AuditLogPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AuditLogPage from "./AuditLogPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
const venta = {
  id: "e1", createdAt: "2026-09-28T16:05:00Z", actorId: "a1", actorName: "Dueña HIVE", actorRole: "admin",
  action: "membership.sale", entityType: "membership", entityId: "m1", subjectUserId: "u1", subjectName: "Ana Pérez",
  reason: "Cortesía por evento", before: null,
  after: { plan_name: "Paquete 8", amount: 0, list_price: 1700, payment_method: "cash", payment_reference: "ORD-000001" },
  meta: { courtesy: true },
};
const ajuste = {
  ...venta, id: "e2", actorId: "a2", actorName: "Recepción Uno", actorRole: "reception", action: "membership.adjust",
  reason: "Compensación por clase cancelada", before: { classes_remaining: 1 }, after: { classes_remaining: 3 }, meta: {},
};
const ACTORES = { data: [{ id: "a1", name: "Dueña HIVE", role: "admin" }, { id: "a2", name: "Recepción Uno", role: "reception" }] };

function montar(pagina: unknown = { data: [venta, ajuste], page: 1, limit: 50, total: 2 }, route = "/admin/bitacora") {
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/admin/audit?": pagina, "/admin/audit/actors": ACTORES });
  renderAdmin(<AuditLogPage />, { route, path: "/admin/bitacora" });
}
const pedidas = () => mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/admin/audit?"));

beforeEach(() => { mockApi.get.mockReset(); });

describe("Bitácora", () => {
  it("la dueña ve qué pasó, quién, sobre quién, el motivo y el antes → después", async () => {
    loginAs("admin");
    montar();
    const lista = await screen.findByRole("list", { name: "Movimientos" });
    expect(within(lista).getByText("Cortesía en mostrador ($0)")).toBeInTheDocument();
    expect(within(lista).getByText("Ajuste de membresía")).toBeInTheDocument();
    expect(within(lista).getByText("Dueña HIVE")).toBeInTheDocument();
    expect(within(lista).getAllByText("Ana Pérez")).toHaveLength(2);
    expect(within(lista).getByText("Cortesía por evento")).toBeInTheDocument();
    expect(within(lista).getByText("$0")).toBeInTheDocument();
    expect(within(lista).getByText("$1,700")).toBeInTheDocument();
    expect(within(lista).getByText("1 → 3")).toBeInTheDocument();
    expect(pedidas()[0]).toBe("/admin/audit?page=1&limit=50");
  });

  it("los filtros van a la URL y a la consulta, y vuelven a la página 1", async () => {
    loginAs("admin");
    montar(undefined, "/admin/bitacora?pagina=2");
    await screen.findByRole("list", { name: "Movimientos" });
    fireEvent.change(screen.getByLabelText("Qué"), { target: { value: "membership" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("entityType=membership"));
    expect(pedidas().at(-1)).toContain("page=1");
    expect(screen.getByTestId("location").textContent).toContain("que=membership");
    await screen.findByRole("option", { name: "Recepción Uno · Recepción" });
    fireEvent.change(screen.getByLabelText("Quién"), { target: { value: "a2" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("actorId=a2"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    await waitFor(() => expect(pedidas().at(-1)).toContain("from=2026-09-01"));
    fireEvent.click(screen.getByRole("button", { name: "Quitar filtros" }));
    await waitFor(() => expect(pedidas().at(-1)).toBe("/admin/audit?page=1&limit=50"));
  });

  it("?id= filtra por un registro o una clienta", async () => {
    loginAs("admin");
    montar(undefined, "/admin/bitacora?id=u1");
    await screen.findByRole("list", { name: "Movimientos" });
    expect(pedidas()[0]).toContain("entityId=u1");
    expect(screen.getByText(/Mostrando sólo lo relacionado con un registro/)).toBeInTheDocument();
  });

  it("paginación", async () => {
    loginAs("admin");
    montar({ data: [venta], page: 1, limit: 50, total: 120 });
    expect(await screen.findByText("Página 1 de 3 · 120 registros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(pedidas().at(-1)).toContain("page=2"));
  });

  it("sin movimientos lo dice", async () => {
    loginAs("admin");
    montar({ data: [], page: 1, limit: 50, total: 0 });
    expect(await screen.findByText("Sin movimientos")).toBeInTheDocument();
  });

  it("un filtro que el servidor rechaza muestra su mensaje", async () => {
    loginAs("admin");
    montar(Object.assign(new Error("400"), { response: { status: 400, data: { message: "Fecha 'desde' inválida (usa AAAA-MM-DD)." } } }));
    expect(await screen.findByText("Fecha 'desde' inválida (usa AAAA-MM-DD).")).toBeInTheDocument();
  });

  it("recepción no entra ni pide la bitácora", async () => {
    loginAs("reception");
    montar();
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/admin/audit"))).toEqual([]);
  });
});
```

`src/components/admin/AdminLayout.bitacora.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import AdminLayout from "./AdminLayout";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock };
beforeEach(() => {
  mockApi.get.mockReset();
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 } });
});

describe("AdminLayout · Bitácora", () => {
  it("la dueña la ve en Sistema y se ilumina en su ruta", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/bitacora", path: "/admin/bitacora" });
    const link = await screen.findByRole("link", { name: /Bitácora/ });
    expect(link).toHaveAttribute("href", "/admin/bitacora");
    expect(link).toHaveAttribute("aria-current", "page");
  });

  it("recepción no la ve", async () => {
    loginAs("reception");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    await screen.findByRole("link", { name: /Reservas/ });
    expect(screen.queryByRole("link", { name: /Bitácora/ })).toBeNull();
  });
});
```

`src/test/paridad-velan.test.ts`: en `EXCEPCIONES` agrega:

```ts
  "/admin/bitacora": "bitácora de la dueña pedida por la auditoría de producción (2026-09-27, P0-3)",
```

- [ ] **Step 2: Correr y ver que fallan**: `npx vitest run src/components/admin src/lib/audit-log.test.ts src/pages/admin/audit src/test/paridad-velan.test.ts` → FAIL.

- [ ] **Step 3: Implementar.**

**`src/components/admin/ConfirmDialog.tsx`:**
- En `PromptOptions` agrega:

```ts
  /** Mínimo de caracteres (sin espacios en los extremos) para poder confirmar. */
  minLength?: number;
```

- Reemplaza `const confirmDisabled = isPrompt && promptOpts?.required ? text.trim().length === 0 : false;` por:

```ts
  const minChars = isPrompt ? Math.max(promptOpts?.minLength ?? 0, promptOpts?.required ? 1 : 0) : 0;
  const confirmDisabled = isPrompt && text.trim().length < minChars;
```

- Justo después del bloque `{isPrompt ? (<Textarea … />) : null}`:

```tsx
        {isPrompt && promptOpts?.minLength ? (
          <p className="text-[0.75rem] text-ink-muted">Mínimo {promptOpts.minLength} caracteres.</p>
        ) : null}
```

- Actualiza el comentario de uso del encabezado con `promptText({ …, minLength: 5 })`.

**`src/lib/audit-log.ts`:**

```ts
// Textos de la bitácora del panel (GET /api/admin/audit). Auditoría 2026-09-27, bloque 2.
import { formatMXN } from "@/lib/format";

export type AuditEntry = {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  subjectUserId: string | null;
  subjectName: string | null;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown>;
};

export type AuditPage = { data: AuditEntry[]; page: number; limit: number; total: number };

export const AUDIT_ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Todo" },
  { value: "membership", label: "Ventas y membresías" },
  { value: "booking", label: "Reservas y asistencia" },
  { value: "class", label: "Clases" },
  { value: "class_week", label: "Limpiezas de semana" },
  { value: "user", label: "Bajas de clientas" },
];

const ACTION_LABEL: Record<string, string> = {
  "membership.sale": "Venta en mostrador",
  "membership.adjust": "Ajuste de membresía",
  "booking.checkin": "Check-in",
  "booking.no_show": "Falta marcada",
  "booking.no_show_corrected": "Falta corregida a asistencia",
  "booking.cancel": "Reserva cancelada por el estudio",
  "class.cancel": "Clase cancelada",
  "class.delete": "Clase borrada (sin reservas)",
  "class.week_clear": "Limpieza de semana",
  "user.anonymize": "Clienta dada de baja (anonimizada)",
};

export function actionLabel(e: Pick<AuditEntry, "action" | "meta">): string {
  const m = e.meta ?? {};
  if (e.action === "membership.sale" && m.courtesy) return "Cortesía en mostrador ($0)";
  if (e.action === "membership.sale" && m.price_differs) return "Venta en mostrador con precio distinto";
  if (e.action === "booking.checkin") return m.method === "qr" ? "Check-in (QR)" : "Check-in (lista)";
  return ACTION_LABEL[e.action] ?? e.action;
}

const FIELD_LABEL: Record<string, string> = {
  plan_name: "Plan",
  amount: "Cobrado",
  list_price: "Precio del plan",
  payment_method: "Método",
  payment_reference: "Referencia",
  classes_remaining: "Clases",
  start_date: "Inicio",
  end_date: "Vence",
  status: "Estado",
  faltas_count: "Faltas",
  is_active: "Acceso",
  deleted: "Borradas",
  cancelled: "Canceladas",
  kept: "Sin tocar",
};
const MONEY = new Set(["amount", "list_price"]);
const STATUS_LABEL: Record<string, string> = {
  active: "Activa", expired: "Vencida", cancelled: "Cancelada", paused: "Pausada",
  pending_payment: "Pendiente de pago", pending_activation: "Pendiente de activar",
  confirmed: "Confirmada", checked_in: "Asistió", no_show: "Falta", waitlist: "Lista de espera",
  scheduled: "Programada", closed: "Cerrada",
};
const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", online: "En línea" };
// En un borrado no hay "después": se muestra la clase en "sobre quién".
const NO_CHANGES = new Set(["class.delete"]);

export function formatAuditValue(key: string, v: unknown): string {
  if (key === "classes_remaining") return v === null || v === undefined || Number(v) >= 9999 ? "Ilimitadas" : String(v);
  if (v === null || v === undefined || v === "") return "—";
  if (MONEY.has(key)) return formatMXN(Number(v));
  if (key === "status") return STATUS_LABEL[String(v)] ?? String(v);
  if (key === "payment_method") return METHOD_LABEL[String(v)] ?? String(v);
  if (key === "is_active") return v ? "Activo" : "Cerrado";
  return String(v);
}

export function auditChanges(e: AuditEntry): { key: string; label: string; before: string | null; after: string }[] {
  if (NO_CHANGES.has(e.action)) return [];
  const b = e.before ?? {};
  const a = e.after ?? {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => FIELD_LABEL[k]);
  return keys.map((k) => ({
    key: k,
    label: FIELD_LABEL[k],
    before: k in b ? formatAuditValue(k, b[k]) : null,
    after: formatAuditValue(k, a[k]),
  }));
}

export function auditSubject(e: AuditEntry): string | null {
  if (e.subjectName) return e.subjectName;
  const m = e.meta ?? {};
  const b = (e.before ?? {}) as Record<string, unknown>;
  const day = (m.day ?? b.day) as string | undefined;
  if (e.entityType === "class" && day) {
    const hora = (m.start_time ?? b.start_time) as string | undefined;
    return `la clase del ${day}${hora ? ` ${hora}` : ""}`;
  }
  if (e.entityType === "class_week" && m.start) return `la semana del ${String(m.start)} al ${String(m.end)}`;
  return null;
}
```

**`src/pages/admin/audit/AuditLogPage.tsx`:**

```tsx
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ScrollText } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDateTime } from "@/lib/format";
import { roleLabel } from "@/lib/roles";
import { AUDIT_ENTITY_OPTIONS, actionLabel, auditChanges, auditSubject, type AuditEntry, type AuditPage } from "@/lib/audit-log";

const LIMIT = 50;
const SELECT_CLS = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-2 focus:border-ink focus:outline-none";

type Actor = { id: string; name: string | null; role: string | null };

/* Bitácora (auditoría 2026-09-27, P0-3): sólo la dueña. El guardia va por
   fuera para que recepción no dispare /admin/audit (403). */
export default function AuditLogPage() {
  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <AuditLogContent />
      </AdminLayout>
    </AuthGuard>
  );
}

function AuditLogContent() {
  const [sp, setSp] = useSearchParams();
  const que = sp.get("que") ?? "";
  const quien = sp.get("quien") ?? "";
  const desde = sp.get("desde") ?? "";
  const hasta = sp.get("hasta") ?? "";
  const entidad = sp.get("id") ?? "";
  const page = Math.max(1, Number(sp.get("pagina")) || 1);

  // Un solo cambio de URL por acción: varios setSearchParams seguidos se pisan.
  const update = (patch: Record<string, string | null>) =>
    setSp((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      return p;
    }, { replace: true });

  const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
  if (que) qs.set("entityType", que);
  if (quien) qs.set("actorId", quien);
  if (desde) qs.set("from", desde);
  if (hasta) qs.set("to", hasta);
  if (entidad) qs.set("entityId", entidad);
  const url = `/admin/audit?${qs.toString()}`;

  const list = useQuery<AuditPage>({
    queryKey: ["audit-log", url],
    queryFn: async () => (await api.get(url)).data,
    placeholderData: keepPreviousData,
  });
  const actorsQ = useQuery<{ data: Actor[] }>({
    queryKey: ["audit-actors"],
    queryFn: async () => (await api.get("/admin/audit/actors")).data,
    staleTime: 60_000,
  });
  const actors = Array.isArray(actorsQ.data?.data) ? actorsQ.data!.data : [];
  const rows = Array.isArray(list.data?.data) ? list.data!.data : [];
  const total = Number(list.data?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const hasFilters = Boolean(que || quien || desde || hasta || entidad);
  const errorMsg = (list.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sistema · sólo dueña"
        title="Bitácora"
        subtitle="Quién cobró, ajustó, canceló, corrigió o dio de baja, cuándo, por qué y qué cambió."
      />

      <Panel aria-label="Filtros de la bitácora" className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end lg:p-6">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-que">Qué</Label>
          <select id="bit-que" className={SELECT_CLS} value={que} onChange={(e) => update({ que: e.target.value || null, pagina: null })}>
            {AUDIT_ENTITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-quien">Quién</Label>
          <select id="bit-quien" className={SELECT_CLS} value={quien} onChange={(e) => update({ quien: e.target.value || null, pagina: null })}>
            <option value="">Todo el equipo</option>
            {actors.map((a) => (
              <option key={a.id} value={a.id}>{`${a.name ?? "Sin nombre"} · ${roleLabel(a.role)}`}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-desde">Desde</Label>
          <Input id="bit-desde" type="date" value={desde} onChange={(e) => update({ desde: e.target.value || null, pagina: null })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bit-hasta">Hasta</Label>
          <Input id="bit-hasta" type="date" value={hasta} onChange={(e) => update({ hasta: e.target.value || null, pagina: null })} />
        </div>
        <Button variant="ghost" disabled={!hasFilters} onClick={() => update({ que: null, quien: null, desde: null, hasta: null, id: null, pagina: null })}>
          Quitar filtros
        </Button>
      </Panel>

      {entidad && (
        <p className="text-sm text-ink-muted">
          Mostrando sólo lo relacionado con un registro.{" "}
          <button type="button" className="min-h-[44px] font-bold text-ink underline underline-offset-2" onClick={() => update({ id: null, pagina: null })}>
            Ver todo
          </button>
        </p>
      )}

      {list.isError ? (
        <ErrorState title="No pudimos cargar la bitácora" description={errorMsg ?? "Revisa tu conexión y vuelve a intentarlo."} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={20} strokeWidth={1.8} />}
          title="Sin movimientos"
          description={hasFilters ? "No hay registros con estos filtros." : "Cuando alguien del equipo cobre, ajuste, cancele, corrija una falta o dé de baja a una clienta, aparecerá aquí."}
        />
      ) : (
        <>
          <Panel className="overflow-hidden">
            <ol aria-label="Movimientos" className="divide-y divide-line">
              {rows.map((e) => <AuditRow key={e.id} entry={e} />)}
            </ol>
          </Panel>
          <nav aria-label="Páginas de la bitácora" className="flex flex-wrap items-center justify-between gap-3">
            <p className="nums text-sm text-ink-muted">Página {page} de {pages} · {total} {total === 1 ? "registro" : "registros"}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => update({ pagina: page - 1 > 1 ? String(page - 1) : null })}>Anterior</Button>
              <Button variant="outline" disabled={page >= pages} onClick={() => update({ pagina: String(page + 1) })}>Siguiente</Button>
            </div>
          </nav>
        </>
      )}
    </AdminPage>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const changes = auditChanges(entry);
  const subject = auditSubject(entry);
  return (
    <li className="flex flex-col gap-2 px-5 py-4 lg:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] font-extrabold text-ink">{actionLabel(entry)}</p>
        <time dateTime={entry.createdAt} className="nums text-[13px] text-ink-muted">{formatDateTime(entry.createdAt)}</time>
      </div>
      <p className="text-sm text-ink-muted">
        <span className="font-bold text-ink">{entry.actorName ?? "Sistema"}</span>
        {entry.actorRole ? ` · ${roleLabel(entry.actorRole)}` : ""}
        {subject ? <> · sobre <span className="font-bold text-ink">{subject}</span></> : null}
      </p>
      {entry.reason && (
        <p className="text-sm text-ink"><span className="font-bold">Motivo:</span> {entry.reason}</p>
      )}
      {changes.length > 0 && (
        <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
          {changes.map((c) => (
            <div key={c.key} className="flex gap-2">
              <dt className="text-ink-muted">{c.label}:</dt>
              <dd className="nums font-bold text-ink">{c.before !== null ? `${c.before} → ${c.after}` : c.after}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
```

**`src/config/features.ts`:**
- En la sección "Panel":

```ts
  /** Bitácora de la dueña: quién cobró, ajustó, canceló o dio de baja. `/admin/bitacora` */
  auditLog: true,
```

- En el comentario de cabecera, bajo "Lo que se dejó encendido a propósito", agrega: `` - `/admin/bitacora`: la pidió la auditoría de producción (2026-09-27, P0-3). ``

**`src/App.tsx`:**
- `import AuditLogPage from "./pages/admin/audit/AuditLogPage";` junto a los imports del panel.
- Tras la ruta de `/admin/settings`:

```tsx
          {FEATURES.auditLog && (
            <Route path="/admin/bitacora" element={<AuditLogPage />} />
          )}
```

**`src/components/admin/AdminLayout.tsx`:**
- Agrega `ScrollText` al import de `lucide-react`.
- En el grupo "Sistema" de `NAV_GROUPS`, tras "Configuración":

```ts
      { path: "/admin/bitacora", label: "Bitácora", icon: ScrollText, ownerOnly: true, feature: "auditLog" },
```

- [ ] **Step 4: Verde**:
  - `npx vitest run src/components/admin src/lib src/pages/admin/audit src/test` → PASS.
  - tsc limpio (salvo preexistentes).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/ConfirmDialog.tsx src/components/admin/ConfirmDialog.test.tsx src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.bitacora.test.tsx src/config/features.ts src/App.tsx src/test/paridad-velan.test.ts src/lib/audit-log.ts src/lib/audit-log.test.ts src/pages/admin/audit
git commit -m "fix(hive): pantalla Bitácora sólo para la dueña y diálogo de motivo con mínimo de caracteres"
```

---

### Task 3: Venta en mostrador y ajustes de membresía con motivo

**Files:**
- Create: `server/lib/membershipAdmin.js`, `server/lib/membershipAdmin.test.js`, `server/tests/ventas-ajustes.test.mjs`
- Modify: `server/index.js`:
  - Import tras `import { resolveEffectivePrice } …`.
  - `POST /api/memberships` (~13097–13209).
  - `PUT /api/memberships/:id` (~13363–13419).
  - `POST /api/admin/clients/manual` (~14250–14377).
- Modify: `src/pages/admin/payments/PaymentsPage.tsx`, `src/pages/admin/memberships/MembershipsList.tsx`, `src/pages/admin/clients/ClientDetail.tsx` y sus `.test.tsx`.

**Interfaces:**
- Consumes (Task 1):
  - `reasonProblem`, `cleanReason`, `changedFields`, `recordAudit` e `isDay`.
  - Columnas `memberships.activated_by/activated_at/payment_reference`.
- Produces:

```js
// server/lib/membershipAdmin.js
export const MEMBERSHIP_STATUS, PAYMENT_METHODS, REASON_FIELDS;
export const creditsKey = (v) => "ilimitado" | number;     // null o ≥9999 → "ilimitado"
export function addDaysYmd(ymd, days)                       // "AAAA-MM-DD"
export function saleAmountPlan({ listPrice, amount, reason }) // { ok:false, code?, message } | { ok:true, amount, listPrice, courtesy, priceDiffers, discount, subtotal }
export function cleanPaymentReference(value)                // { ok:true, value: string|null } | { ok:false, message }
export function planMembershipAdjust({ before, input })     // { ok:false, message } | { ok:true, next, changes, needsReason, abovePlan }
```

- `POST /api/memberships`:
  - Cuerpo nuevo opcional: `amount`, `paymentReference`, `reason`.
  - 400 `REASON_REQUIRED` si es $0 o distinto al plan sin motivo.
  - Respuesta con `activated_by`, `payment_reference`, `order_id`.
- `PUT /api/memberships/:id`:
  - Cuerpo nuevo opcional: `reason`.
  - 400 `REASON_REQUIRED` si cambia saldo, vigencia o estado sin motivo.
  - Sin cambios → `{ data, unchanged: true }`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/membershipAdmin.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { saleAmountPlan, cleanPaymentReference, planMembershipAdjust, creditsKey, addDaysYmd } from "./membershipAdmin.js";

test("venta al precio del plan: sin motivo", () => {
  assert.deepEqual(saleAmountPlan({ listPrice: 1700 }), { ok: true, amount: 1700, listPrice: 1700, courtesy: false, priceDiffers: false, discount: 0, subtotal: 1700 });
  assert.equal(saleAmountPlan({ listPrice: 1700, amount: "1700" }).ok, true);
});

test("cortesía $0 o precio distinto: exige motivo", () => {
  const c = saleAmountPlan({ listPrice: 1700, amount: 0 });
  assert.equal(c.ok, false);
  assert.equal(c.code, "REASON_REQUIRED");
  assert.match(c.message, /cortesía/);
  const d = saleAmountPlan({ listPrice: 1700, amount: 1200, reason: "ok" });
  assert.equal(d.ok, false);
  assert.match(d.message, /distinto/);
  const ok = saleAmountPlan({ listPrice: 1700, amount: 1200, reason: "Descuento de amiga" });
  assert.equal(ok.ok, true);
  assert.equal(ok.discount, 500);
  assert.equal(ok.priceDiffers, true);
  assert.equal(saleAmountPlan({ listPrice: 0 }).ok, false, "un plan de $0 también es cortesía");
});

test("cobrar de más: precio distinto, subtotal = lo cobrado, sin descuento", () => {
  const r = saleAmountPlan({ listPrice: 1700, amount: 1800, reason: "Incluye tapete" });
  assert.equal(r.ok, true);
  assert.equal(r.discount, 0);
  assert.equal(r.subtotal, 1800);
});

test("monto inválido → mensaje; coma decimal aceptada", () => {
  for (const bad of ["abc", -1, "1e9", Infinity]) assert.equal(saleAmountPlan({ listPrice: 100, amount: bad }).ok, false, String(bad));
  assert.equal(saleAmountPlan({ listPrice: 100, amount: "99,50", reason: "Redondeo acordado" }).amount, 99.5);
});

test("referencia de pago", () => {
  assert.deepEqual(cleanPaymentReference(undefined), { ok: true, value: null });
  assert.deepEqual(cleanPaymentReference("  SPEI 123  "), { ok: true, value: "SPEI 123" });
  assert.equal(cleanPaymentReference("x".repeat(101)).ok, false);
  assert.equal(cleanPaymentReference(123).ok, false);
});

const before = { status: "active", classes_remaining: 1, start_date: "2026-09-01", end_date: "2026-10-01", payment_method: "cash", duration_days: 30, plan_class_limit: 1 };

test("ajuste de saldo: exige motivo y marca que queda por encima del plan", () => {
  const r = planMembershipAdjust({ before, input: { classesRemaining: 3 } });
  assert.equal(r.ok, true);
  assert.equal(r.needsReason, true);
  assert.equal(r.abovePlan, true);
  assert.deepEqual(r.changes, { changed: ["classes_remaining"], before: { classes_remaining: 1 }, after: { classes_remaining: 3 } });
});

test("el panel manda todo aunque no cambie: sin cambios no pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { status: "active", classesRemaining: 1, startDate: "2026-09-01", endDate: "2026-10-01" } });
  assert.deepEqual(r.changes.changed, []);
  assert.equal(r.needsReason, false);
  const unl = planMembershipAdjust({ before: { ...before, classes_remaining: null, plan_class_limit: null }, input: { classesRemaining: 9999 } });
  assert.deepEqual(unl.changes.changed, [], "9999 e ilimitado son lo mismo");
});

test("sólo inicio: el fin se recalcula con la duración; cambiar vigencia pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { startDate: "2026-10-15" } });
  assert.equal(r.next.end_date, "2026-11-14");
  assert.equal(r.needsReason, true);
  assert.deepEqual(r.changes.changed, ["start_date", "end_date"]);
});

test("cambiar sólo el método de pago no pide motivo", () => {
  const r = planMembershipAdjust({ before, input: { paymentMethod: "transfer" } });
  assert.deepEqual(r.changes.changed, ["payment_method"]);
  assert.equal(r.needsReason, false);
});

test("entradas malas → ok:false", () => {
  for (const input of [
    { status: "regalada" }, { classesRemaining: -1 }, { classesRemaining: 2.5 }, { classesRemaining: "x" },
    { startDate: "2026-13-45" }, { endDate: "31/12/2026" }, { paymentMethod: "efectivo" }, { endDate: "2026-08-01" },
  ]) {
    assert.equal(planMembershipAdjust({ before, input }).ok, false, JSON.stringify(input));
  }
});

test("utilidades", () => {
  assert.equal(creditsKey(null), "ilimitado");
  assert.equal(creditsKey(9999), "ilimitado");
  assert.equal(creditsKey("3"), 3);
  assert.equal(addDaysYmd("2026-12-20", 30), "2027-01-19");
});
```

`server/tests/ventas-ajustes.test.mjs`:

```js
// Tarea 3 · auditoría 2026-09-27, bloque 2 (P0-3 · E2 · D12 · I5). Venta en
// mostrador con quién, referencia y motivo si es $0 o distinto al plan; ajustes
// de saldo/vigencia/estado con motivo; todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgventas";
let A, adminId, f, listPrice;
const venta = (body) => api("POST", "/api/memberships", { token: A, body: { paymentMethod: "cash", startDate: day(0), ...body } });
const auditOf = (entityId, action) => sql(`SELECT * FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at`, [entityId, action]);
const membresiaDe = async (userId) => (await sql(
  `SELECT m.id, m.activated_by, m.activated_at, m.payment_reference, m.classes_remaining,
          o.id AS oid, o.order_number, o.total_amount, o.discount_amount
     FROM memberships m LEFT JOIN orders o ON o.id = m.order_id
    WHERE m.user_id = $1 ORDER BY m.created_at DESC LIMIT 1`, [userId]))[0];

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
  const planes = await api("GET", "/api/plans", { token: A });
  listPrice = Number(planes.body.data.find((p) => p.id === f.plan.id).effectivePrice);
});
after(async () => {
  await cleanup(PFX);
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

test("venta al precio del plan: activated_by, referencia y bitácora sin motivo", async () => {
  const c = await makeClient(PFX, "lista");
  const r = await venta({ userId: c.id, planId: f.plan.id });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(m.activated_by, adminId);
  assert.ok(m.activated_at);
  assert.ok([m.order_number, m.oid].includes(m.payment_reference), `payment_reference=${m.payment_reference}`);
  assert.equal(Number(m.total_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.subject_user_id, c.id);
  assert.equal(log.reason, null);
  assert.equal(Number(log.after.amount), listPrice);
  assert.equal(log.meta.courtesy, false);
});

test("cortesía $0: sin motivo → 400 y no crea nada; con motivo → orden en $0 y sin puntos de compra", async () => {
  const c = await makeClient(PFX, "cortesia");
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: 0 });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM memberships WHERE user_id=$1`, [c.id]))[0].n, 0);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: 0, reason: "Cortesía por evento de apertura" });
  assert.equal(con.status, 201, JSON.stringify(con.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), 0);
  assert.equal(Number(m.discount_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.reason, "Cortesía por evento de apertura");
  assert.equal(log.meta.courtesy, true);
  const pts = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND description LIKE 'Membresía asignada%'`, [c.id]);
  assert.equal(pts[0].n, 0, "una cortesía no da puntos de compra");
});

test("precio distinto al plan: sin motivo → 400; con motivo → 201 con descuento", async () => {
  const c = await makeClient(PFX, "descuento");
  const cobrado = listPrice - 200;
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado });
  assert.equal(sin.status, 400);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado, reason: "Descuento de amiga de la dueña" });
  assert.equal(con.status, 201);
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), cobrado);
  assert.equal(Number(m.discount_amount), 200);
});

test("la referencia escrita por la admin se guarda tal cual", async () => {
  const c = await makeClient(PFX, "referencia");
  const r = await venta({ userId: c.id, planId: f.plan.id, paymentMethod: "transfer", paymentReference: "SPEI 998877" });
  assert.equal(r.status, 201);
  assert.equal((await membresiaDe(c.id)).payment_reference, "SPEI 998877");
});

test("entradas malas en la venta → 400, nunca 500", async () => {
  const c = await makeClient(PFX, "malas");
  for (const body of [
    { userId: c.id, planId: f.plan.id, amount: "abc" },
    { userId: "basura", planId: f.plan.id },
    { userId: c.id, planId: f.plan.id, paymentReference: "x".repeat(101) },
    { userId: c.id, planId: f.plan.id, startDate: "no-es-fecha" },
  ]) {
    const r = await venta(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
  }
});

test("ajuste de saldo: sin motivo → 400 y no cambia; con motivo → 200 y bitácora antes/después", async () => {
  const c = await makeClient(PFX, "ajuste");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  await sql(`UPDATE memberships SET classes_remaining = 1 WHERE id = $1`, [m.id]);
  const sin = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3 } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await membresiaDe(c.id)).classes_remaining, 1);
  const con = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3, reason: "Compensación por clase cancelada" } });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal((await membresiaDe(c.id)).classes_remaining, 3);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.reason, "Compensación por clase cancelada");
  assert.deepEqual(log.before, { classes_remaining: 1 });
  assert.deepEqual(log.after, { classes_remaining: 3 });
});

test("guardar sin cambios (como el panel) no pide motivo ni escribe bitácora", async () => {
  const c = await makeClient(PFX, "igual");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const [cur] = await sql(`SELECT status::text AS status, classes_remaining, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM memberships WHERE id=$1`, [m.id]);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { status: cur.status, classesRemaining: cur.classes_remaining, startDate: cur.s, endDate: cur.e } });
  assert.equal(r.status, 200);
  assert.equal(r.body.unchanged, true);
  assert.equal((await auditOf(m.id, "membership.adjust")).length, 0);
});

test("cambiar sólo el método: sin motivo y queda en la bitácora", async () => {
  const c = await makeClient(PFX, "metodo");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { paymentMethod: "transfer" } });
  assert.equal(r.status, 200);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.deepEqual(log.after, { payment_method: "transfer" });
});

test("fechas inválidas o fin antes del inicio → 400", async () => {
  const c = await makeClient(PFX, "fechas");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  for (const body of [{ endDate: "2026-13-45", reason: "Motivo válido" }, { startDate: day(10), endDate: day(1), reason: "Motivo válido" }, { classesRemaining: 2.5, reason: "Motivo válido" }]) {
    const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("alta manual con paquete: activated_by, referencia y bitácora; en $0 exige motivo en Notas", async () => {
  const email = `${PFX}_alta@qa.local`;
  const r = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta", email, planId: f.plan.id, paymentMethod: "cash" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [u] = await sql(`SELECT id FROM users WHERE email=$1`, [email]);
  const m = await membresiaDe(u.id);
  assert.equal(m.activated_by, adminId);
  assert.ok(m.payment_reference);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.meta.source, "alta_manual");

  const [p0] = await sql(`INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                          VALUES ($1, 'QA cortesía', 0, 'MXN', 30, 1, $2, true, 999) RETURNING id`, [`${PFX} cortesía`, f.category]);
  const email0 = `${PFX}_alta0@qa.local`;
  const sin = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta 0", email: email0, planId: p0.id, paymentMethod: "cash" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM users WHERE email=$1`, [email0]))[0].n, 0, "se revirtió todo");
  const con = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: "QA alta 0", email: email0, planId: p0.id, paymentMethod: "cash", notes: "Cortesía por evento de apertura" } });
  assert.equal(con.status, 201, JSON.stringify(con.body).slice(0, 200));
});
```

Pruebas del panel:

`src/pages/admin/payments/PaymentsPage.test.tsx`:
- En la primera prueba, el cuerpo esperado pasa a `{ userId: "u1", planId: "p8", paymentMethod: "card", startDate: "2026-09-25", amount: 1450 }`.
- Agrega:

```tsx
  it("cobrar distinto al plan pide motivo y lo manda", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Precio cobrado"), { target: { value: "1200" } });
    const confirmar = within(resumen).getByRole("button", { name: "Confirmar y activar membresía" });
    expect(screen.getByText("Lo cobrado es distinto al precio del plan.", { exact: false })).toBeInTheDocument();
    expect(confirmar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo (obligatorio)"), { target: { value: "Descuento de amiga" } });
    expect(confirmar).toBeEnabled();
    expect(within(resumen).getByText("$1,200")).toBeInTheDocument();
    fireEvent.click(confirmar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", {
      userId: "u1", planId: "p8", paymentMethod: "cash", startDate: "2026-09-25", amount: 1200, reason: "Descuento de amiga",
    }));
  });

  it("una cortesía en $0 se marca y pide motivo", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Precio cobrado"), { target: { value: "0" } });
    expect(within(resumen).getByText("Cortesía")).toBeInTheDocument();
    expect(screen.getByText("Es una cortesía ($0).", { exact: false })).toBeInTheDocument();
    expect(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" })).toBeDisabled();
  });

  it("la referencia de pago viaja con la venta y sin motivo si el precio es el del plan", async () => {
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Paquete 8 clases/ }));
    fireEvent.change(screen.getByLabelText("Referencia de pago (opcional)"), { target: { value: "SPEI 998877" } });
    fireEvent.click(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", expect.objectContaining({ amount: 1450, paymentReference: "SPEI 998877" })));
    expect(mockApi.post.mock.calls[0][1]).not.toHaveProperty("reason");
  });

  it("un plan con precio de apertura cobra el precio efectivo sin pedir motivo", async () => {
    routeApi(mockApi, { ...tabla(), "/plans": { data: [{ id: "pa", name: "Ilimitado apertura", price: 2700, effectivePrice: 2300, classLimit: null, durationDays: 30, classCategory: "studio", isActive: true }] } });
    loginAs("admin");
    renderAdmin(<PaymentsPage />, { route: "/admin/payments" });
    const resumen = await screen.findByRole("complementary", { name: "Resumen de la membresía" });
    fireEvent.change(screen.getByRole("combobox", { name: "Buscar clienta para cobrar" }), { target: { value: "cam" } });
    fireEvent.click(await screen.findByRole("option", { name: /Camila Torres/ }));
    fireEvent.click(await screen.findByRole("radio", { name: /Ilimitado apertura/ }));
    expect(screen.getByLabelText("Precio cobrado")).toHaveValue(2300);
    expect(screen.queryByLabelText("Motivo (obligatorio)")).toBeNull();
    fireEvent.click(within(resumen).getByRole("button", { name: "Confirmar y activar membresía" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/memberships", expect.objectContaining({ planId: "pa", amount: 2300 })));
  });
```

`src/pages/admin/memberships/MembershipsList.test.tsx`:
- Cambia `mockApi` a `{ get: Mock; put: Mock }` y en `beforeEach` agrega `mockApi.put.mockReset().mockResolvedValue({ data: {} });`.
- Agrega:

```tsx
  it("editar vigencia pide motivo y lo manda", async () => {
    renderAdmin(<MembershipsList />, { route: "/admin/memberships" });
    await screen.findByText("Camila Torres");
    fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la membresía de Camila Torres" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Editar vigencia" }));
    const guardar = await screen.findByRole("button", { name: "Guardar vigencia" });
    fireEvent.change(screen.getByLabelText("Fecha de inicio"), { target: { value: "2026-10-01" } });
    expect(guardar).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo del ajuste"), { target: { value: "Preventa acordada con la clienta" } });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/memberships/m1", { startDate: "2026-10-01", reason: "Preventa acordada con la clienta" }));
  });
```

`src/pages/admin/clients/ClientDetail.test.tsx`:
- Agrega `waitFor` al import de testing-library.
- Agrega:

```tsx
  it("editar la membresía pide motivo, avisa si queda por encima del plan y lo manda", async () => {
    const mockPut = (api as unknown as { put: Mock }).put;
    mockPut.mockReset().mockResolvedValue({ data: {} });
    loginAs("admin");
    routeApi(mockApi, tabla());
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    fireEvent.click(within(mem).getByRole("button", { name: /Editar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Editar membresía" });
    fireEvent.change(within(dlg).getByLabelText("Clases restantes"), { target: { value: "10" } });
    expect(within(dlg).getByText("Queda por encima del plan (8 clases).")).toBeInTheDocument();
    const guardar = within(dlg).getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText("Motivo del ajuste"), { target: { value: "Compensación por clase cancelada" } });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/memberships/m1", expect.objectContaining({ classesRemaining: 10, reason: "Compensación por clase cancelada" })));
  });
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/membershipAdmin.test.js` → FAIL.
  - Rutas: 201 donde se espera 400.
  - Panel: no hay campos.

- [ ] **Step 3: Implementar.**

`server/lib/membershipAdmin.js`:

```js
// Reglas de la venta en mostrador y de los ajustes de membresía
// (auditoría 2026-09-27, bloque 2: P0-3 · E2 · D12 · I5).
import { isDay } from "./validate.js";
import { reasonProblem, changedFields } from "./audit.js";

export const MEMBERSHIP_STATUS = Object.freeze(["pending_payment", "pending_activation", "active", "expired", "paused", "cancelled"]);
export const PAYMENT_METHODS = Object.freeze(["cash", "transfer", "card", "online"]);
/** Cambiar alguno de estos exige motivo. Cambiar sólo el método, no. */
export const REASON_FIELDS = Object.freeze(["classes_remaining", "start_date", "end_date", "status"]);
const ADJUST_FIELDS = ["status", "classes_remaining", "start_date", "end_date", "payment_method"];

const given = (v) => v !== undefined && v !== null && v !== "";
const round2 = (n) => Math.round(n * 100) / 100;

/** 9999 o más es el viejo centinela de "ilimitado"; null también lo es. */
export const creditsKey = (v) => (v === null || v === undefined || Number(v) >= 9999 ? "ilimitado" : Number(v));

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString().slice(0, 10);
}

/**
 * Monto de una venta manual. `listPrice` es el precio efectivo del plan (con
 * precio de apertura si aplica). Si lo cobrado es $0 (cortesía) o distinto al
 * plan, exige motivo.
 */
export function saleAmountPlan({ listPrice, amount, reason }) {
  const list = round2(Number(listPrice) || 0);
  let charged = list;
  if (given(amount)) {
    const n = typeof amount === "number" ? amount : Number(String(amount).trim().replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return { ok: false, message: "El monto cobrado debe ser un número de 0 en adelante." };
    }
    charged = round2(n);
  }
  const courtesy = charged === 0;
  const priceDiffers = Math.abs(charged - list) >= 0.01;
  if (courtesy || priceDiffers) {
    const p = reasonProblem(reason);
    if (p) {
      return {
        ok: false,
        code: "REASON_REQUIRED",
        message: courtesy ? `Es una cortesía ($0). ${p}` : `Lo cobrado es distinto al precio del plan. ${p}`,
      };
    }
  }
  return {
    ok: true, amount: charged, listPrice: list, courtesy, priceDiffers,
    discount: round2(Math.max(0, list - charged)), subtotal: Math.max(list, charged),
  };
}

/** Referencia de pago opcional (folio de transferencia, voucher). */
export function cleanPaymentReference(value) {
  if (!given(value)) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, message: "La referencia de pago debe ser texto." };
  const s = value.trim();
  if (s.length > 100) return { ok: false, message: "La referencia de pago es demasiado larga (máximo 100 caracteres)." };
  return { ok: true, value: s || null };
}

/**
 * Qué cambia un PUT /memberships/:id. `before` trae la fila actual con fechas
 * "AAAA-MM-DD", `duration_days` y `plan_class_limit` del plan.
 */
export function planMembershipAdjust({ before, input }) {
  const { status, classesRemaining, startDate, endDate, paymentMethod } = input || {};
  if (given(status) && !MEMBERSHIP_STATUS.includes(status)) {
    return { ok: false, message: `status inválido. Debe ser uno de: ${MEMBERSHIP_STATUS.join(", ")}` };
  }
  if (given(classesRemaining)) {
    const n = Number(classesRemaining);
    if (!Number.isInteger(n) || n < 0) return { ok: false, message: "Las clases restantes deben ser un número entero de 0 en adelante." };
  }
  if (given(startDate) && !isDay(startDate)) return { ok: false, message: "Fecha de inicio inválida (usa AAAA-MM-DD)." };
  if (given(endDate) && !isDay(endDate)) return { ok: false, message: "Fecha de fin inválida (usa AAAA-MM-DD)." };
  if (given(paymentMethod) && !PAYMENT_METHODS.includes(paymentMethod)) {
    return { ok: false, message: `Método de pago inválido. Opciones: ${PAYMENT_METHODS.join(", ")}.` };
  }
  const next = {};
  if (given(status)) next.status = status;
  if (given(classesRemaining)) next.classes_remaining = Number(classesRemaining);
  if (given(startDate)) next.start_date = startDate;
  // Igual que antes: si llega sólo el inicio, el fin se recalcula con la duración del plan.
  if (given(endDate)) next.end_date = endDate;
  else if (given(startDate) && before?.duration_days) next.end_date = addDaysYmd(startDate, before.duration_days);
  if (given(paymentMethod)) next.payment_method = paymentMethod;

  const start = next.start_date ?? before?.start_date ?? null;
  const end = next.end_date ?? before?.end_date ?? null;
  if (start && end && end < start) return { ok: false, message: "La fecha de fin no puede ser anterior a la de inicio." };

  const changes = changedFields(before, next, ADJUST_FIELDS, (k, v) => (k === "classes_remaining" ? creditsKey(v) : v));
  const needsReason = changes.changed.some((k) => REASON_FIELDS.includes(k));
  const limit = before?.plan_class_limit;
  const newCredits = changes.after.classes_remaining;
  const abovePlan = newCredits !== undefined && creditsKey(newCredits) !== "ilimitado" && limit != null && Number(newCredits) > Number(limit);
  return { ok: true, next, changes, needsReason, abovePlan };
}
```

En `server/index.js`:

**Import**, tras `import { resolveEffectivePrice } from "./lib/pricing.js";`:

```js
import { saleAmountPlan, planMembershipAdjust, cleanPaymentReference } from "./lib/membershipAdmin.js";
```

**`POST /api/memberships`:** reemplaza la ruta completa (desde `// POST /api/memberships — admin assigns membership to a user` hasta su `});`) por:

```js
// POST /api/memberships — venta en mostrador: activa la membresía y su orden
// aprobada en una transacción. Guarda quién vendió (activated_by), la
// referencia del pago y, si lo cobrado es $0 o distinto al plan, el motivo
// obligatorio; todo en la bitácora (auditoría 2026-09-27, P0-3 · E2).
app.post("/api/memberships", adminMiddleware, async (req, res) => {
  try {
    const { userId, planId, startDate } = req.body || {};
    if (!userId || !planId) return res.status(400).json({ message: "userId y planId requeridos" });
    if (!isUuid(userId) || !isUuid(planId)) return res.status(400).json({ message: "Identificador inválido" });
    // El método de pago se exige explícito: el default anterior ("efectivo") ni
    // siquiera era un valor del enum payment_method y reventaba con 500, además
    // de registrar como efectivo lo que quizá fue transferencia.
    // Auditoría 2026-09-08, P0-3 / P2.
    const paymentMethod = String(req.body.paymentMethod || "").trim();
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        message: `Método de pago requerido. Opciones: ${PAYMENT_METHODS.join(", ")}.`,
      });
    }
    const start = startDate ? new Date(startDate) : new Date();
    if (Number.isNaN(start.getTime())) return res.status(400).json({ message: "Fecha de inicio inválida (usa AAAA-MM-DD)." });
    const ref = cleanPaymentReference(req.body.paymentReference);
    if (!ref.ok) return res.status(400).json({ message: ref.message });

    const planRes = await pool.query("SELECT * FROM plans WHERE id = $1 AND is_active = true", [planId]);
    if (!planRes.rows.length) return res.status(404).json({ message: "Plan no encontrado" });
    const plan = planRes.rows[0];
    const _gen = await getSettingValueWithDefaults("general_settings");
    const _eff = resolveEffectivePrice(plan, _gen?.opening_pricing_active !== false);
    const sale = saleAmountPlan({ listPrice: _eff ?? 0, amount: req.body.amount, reason: req.body.reason });
    if (!sale.ok) return res.status(400).json({ ...(sale.code ? { code: sale.code } : {}), message: sale.message });
    const nonRepeatableConflict = await findNonRepeatablePlanConflict({ userId, plan });
    if (nonRepeatableConflict) {
      return res.status(409).json({ message: nonRepeatableConflict.message });
    }
    const end = new Date(start);
    end.setDate(end.getDate() + (plan.duration_days || 30));

    // Membresía, orden, referencia y bitácora en la misma transacción: los
    // ingresos se calculan sobre `orders` (auditoría 2026-09-08, P0-3).
    const saleClient = await pool.connect();
    let r;
    try {
      await saleClient.query("BEGIN");
      r = await saleClient.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, activated_by, activated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,NOW())
         RETURNING *, to_char(start_date, 'YYYY-MM-DD') AS start_ymd, to_char(end_date, 'YYYY-MM-DD') AS end_ymd`,
        [userId, planId, paymentMethod, start.toISOString(), end.toISOString(), plan.class_limit ?? null, req.userId || null]
      );
      const orderRes = await saleClient.query(
        `INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, tax_amount, total_amount, discount_amount,
                             channel, verified_at, verified_by, approved_at, approved_by, paid_at)
         VALUES ($1,$2,'approved',$3,$4,0,$5,$6,'counter',NOW(),$7,NOW(),$7,NOW())
         RETURNING id, order_number`,
        [userId, planId, paymentMethod, sale.subtotal, sale.amount, sale.discount, req.userId || null]
      );
      const order = orderRes.rows[0];
      const paymentReference = ref.value || order.order_number || order.id;
      await saleClient.query(`UPDATE memberships SET order_id = $2, payment_reference = $3 WHERE id = $1`,
        [r.rows[0].id, order.id, paymentReference]);
      r.rows[0].order_id = order.id;
      r.rows[0].payment_reference = paymentReference;
      await recordAudit(saleClient, {
        actorId: req.userId, action: "membership.sale", entityType: "membership", entityId: r.rows[0].id,
        subjectUserId: userId, reason: sale.courtesy || sale.priceDiffers ? req.body.reason : null,
        after: {
          plan_id: plan.id, plan_name: plan.name, list_price: sale.listPrice, amount: sale.amount,
          payment_method: paymentMethod, payment_reference: paymentReference, order_id: order.id,
          start_date: r.rows[0].start_ymd, end_date: r.rows[0].end_ymd, classes_remaining: plan.class_limit ?? null,
        },
        meta: { source: "mostrador", courtesy: sale.courtesy, price_differs: sale.priceDiffers },
      });
      await saleClient.query("COMMIT");
    } catch (saleErr) {
      await saleClient.query("ROLLBACK").catch(() => { });
      throw saleErr;
    } finally {
      saleClient.release();
    }

    // ── Email: membership activated ──────────────────────────────────────
    // (copia SIN CAMBIOS el bloque actual de correo y WhatsApp de esta ruta)

    // ── Puntos por compra: sobre lo cobrado (una cortesía no da puntos) ──
    if (userId && sale.amount > 0) {
      try {
        const cfg = await getLoyaltyConfig();
        const pts = Math.floor(sale.amount * cfg.points_per_peso);
        if (cfg.enabled !== false && pts > 0) {
          await pool.query(
            "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, $3)",
            [userId, pts, `Membresía asignada — ${plan.name} ($${sale.amount})`]
          );
        }
      } catch (e) { /* loyalty error shouldn't fail membership creation */ }
    }

    triggerWalletPassSync(userId, "membership_created");
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST /memberships error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

El bloque "Email: membership activated" (desde `// ── Email: membership activated` hasta el `catch (emailErr)` que lo cierra) se conserva **idéntico** al actual; sólo se mueve dentro de la ruta nueva.

**`PUT /api/memberships/:id`:** reemplaza la ruta completa por:

```js
// PUT /api/memberships/:id — ajuste de saldo, vigencia, estado o método.
// Cambiar saldo, vigencia o estado exige motivo; todo cambio queda en la
// bitácora con el antes y el después (auditoría 2026-09-27, P0-3 · D12 · I5).
// El panel manda todos los campos aunque no cambien: sólo cuenta lo que cambia
// de verdad (9999 e ilimitado son lo mismo).
app.put("/api/memberships/:id", adminMiddleware, async (req, res) => {
  const { status, classesRemaining, endDate, startDate, paymentMethod, reason } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT m.id, m.user_id, m.status::text AS status, m.classes_remaining, m.payment_method::text AS payment_method,
              to_char(m.start_date, 'YYYY-MM-DD') AS start_date, to_char(m.end_date, 'YYYY-MM-DD') AS end_date,
              p.duration_days, p.class_limit AS plan_class_limit, p.name AS plan_name
         FROM memberships m
         LEFT JOIN plans p ON p.id = m.plan_id
        WHERE m.id = $1
        FOR UPDATE OF m`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Membresía no encontrada" });
    }
    const before = cur.rows[0];
    const plan = planMembershipAdjust({ before, input: { status, classesRemaining, startDate, endDate, paymentMethod } });
    if (!plan.ok) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: plan.message });
    }
    if (!plan.changes.changed.length) {
      const same = await client.query("SELECT * FROM memberships WHERE id = $1", [req.params.id]);
      await client.query("ROLLBACK");
      return res.json({ data: same.rows[0], unchanged: true });
    }
    if (plan.needsReason) {
      const problem = reasonProblem(reason);
      if (problem) {
        await client.query("ROLLBACK");
        return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
      }
    }
    const n = plan.next;
    const r = await client.query(
      `UPDATE memberships SET
         status = COALESCE($1, status),
         classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date),
         start_date = COALESCE($4, start_date),
         payment_method = COALESCE($5, payment_method),
         updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [n.status ?? null, n.classes_remaining ?? null, n.end_date ?? null, n.start_date ?? null, n.payment_method ?? null, req.params.id],
    );
    // Si cambió el total de una membresía mixta, re-reparte los buckets.
    if (plan.changes.changed.includes("classes_remaining")) await resyncMixtoBuckets(client, req.params.id);
    await recordAudit(client, {
      actorId: req.userId, action: "membership.adjust", entityType: "membership", entityId: req.params.id,
      subjectUserId: before.user_id, reason: cleanReason(reason),
      before: plan.changes.before, after: plan.changes.after,
      meta: { plan_name: before.plan_name ?? null, plan_class_limit: before.plan_class_limit ?? null, above_plan: plan.abovePlan },
    });
    await client.query("COMMIT");
    triggerWalletPassSync(r.rows[0].user_id, "membership_updated");
    return res.json({ data: r.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PUT /memberships/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`POST /api/admin/clients/manual`**, dentro de `if (planId) { … }`:

1. Justo antes de `const memRes = await client.query(`:

```js
      // Cortesía en el alta manual (sale en $0): exige motivo, en `reason` o en
      // Notas del formulario (auditoría 2026-09-27, P0-3).
      const finalPrice = Math.max(0, (Number(_eff) || 0) - orderDiscount);
      const saleReason = typeof req.body.reason === "string" && req.body.reason.trim() ? req.body.reason : notes;
      if (finalPrice === 0) {
        const p = reasonProblem(saleReason);
        if (p) {
          await client.query("ROLLBACK");
          return res.status(400).json({ code: "REASON_REQUIRED", message: `Es una cortesía ($0): escribe el motivo en Notas. ${p}` });
        }
      }
```

2. El INSERT de la membresía pasa a:

```js
      const memRes = await client.query(
        `INSERT INTO memberships (user_id, plan_id, status, payment_method, start_date, end_date,
          classes_remaining, notes, activated_by, activated_at)
         VALUES ($1,$2,'active',$3,$4,$5,$6,$7,$8,NOW()) RETURNING *`,
        [user.id, plan.id, paymentMethod, start.toISOString().split("T")[0],
        end.toISOString().split("T")[0],
        plan.class_limit === 0 ? null : plan.class_limit,
        (notes || `Alta manual por admin`) + priceNote, req.userId || null]
      );
```

3. El INSERT de la orden termina en `RETURNING id, order_number` (en lugar de `RETURNING id`).

4. Reemplaza `await client.query(\`UPDATE memberships SET order_id = $2 WHERE id = $1\`, …); membership.orderId = …;` por:

```js
      const paymentReference = ordRes.rows[0].order_number || ordRes.rows[0].id;
      await client.query(`UPDATE memberships SET order_id = $2, payment_reference = $3 WHERE id = $1`,
        [memRes.rows[0].id, ordRes.rows[0].id, paymentReference]);
      membership.orderId = ordRes.rows[0].id;
      membership.paymentReference = paymentReference;
      await recordAudit(client, {
        actorId: req.userId, action: "membership.sale", entityType: "membership", entityId: memRes.rows[0].id,
        subjectUserId: user.id, reason: finalPrice === 0 ? saleReason : null,
        after: {
          plan_id: plan.id, plan_name: plan.name, list_price: Number(_eff) || 0, amount: finalPrice,
          payment_method: paymentMethod, payment_reference: paymentReference, order_id: ordRes.rows[0].id,
          start_date: start.toISOString().split("T")[0], end_date: end.toISOString().split("T")[0],
          classes_remaining: plan.class_limit === 0 ? null : plan.class_limit,
        },
        meta: { source: "alta_manual", courtesy: finalPrice === 0, price_differs: orderDiscount > 0, discount_code: discountCode || null },
      });
```

**`src/pages/admin/payments/PaymentsPage.tsx`:**
- **Imports:** `import { Input } from "@/components/ui/input";`, `import { Label } from "@/components/ui/label";`, `import { Textarea } from "@/components/ui/textarea";`.
- **Antes de `CashAssignment`:**

```tsx
// Precio que el servidor cobra: el efectivo (con precio de apertura si aplica).
const planPrice = (p: any) => Number(p.effectivePrice ?? p.effective_price ?? p.price ?? 0);
```

- **Estado** (tras `paymentMethod`):

```tsx
  // Precio cobrado, referencia y motivo (auditoría 2026-09-27, P0-3).
  const [amountStr, setAmountStr] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [reason, setReason] = useState("");
```

- **Derivados** (antes de `assignMutation`):

```tsx
  const listPrice = selectedPlan?.price ?? 0;
  const amount = amountStr.trim() === "" ? NaN : Number(amountStr.trim().replace(",", "."));
  const amountValid = Number.isFinite(amount) && amount >= 0;
  const courtesy = amountValid && amount === 0;
  const differs = amountValid && Math.abs(amount - listPrice) >= 0.01;
  const needsReason = !!selectedPlan && (courtesy || differs);
  const reasonOk = reason.trim().length >= 5;
```

- **`mutationFn`:**

```tsx
      api.post("/memberships", {
        userId: selectedUser!.id,
        planId: selectedPlan!.id,
        paymentMethod,
        startDate: format(new Date(), "yyyy-MM-dd"),
        amount,
        ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(needsReason ? { reason: reason.trim() } : {}),
      }),
```

- **En `onSuccess`:** además `setAmountStr(""); setPaymentReference(""); setReason("");`.
- **Botón del plan:** `onClick={() => { const price = planPrice(p); setSelectedPlan({ id: p.id, name: p.name, price, durationDays: days }); setAmountStr(String(price)); setReason(""); }}` y muestra `{formatMXN(planPrice(p))}` en lugar de `formatMXN(Number(p.price))`.
- **Panel nuevo**, tras el de "Método de pago":

```tsx
        <Panel aria-label="Cobro" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={4} done={false}>Cobro</StepTitle>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cobro-monto">Precio cobrado</Label>
              <Input id="cobro-monto" type="number" inputMode="decimal" min={0} step="1" className="nums" disabled={!selectedPlan}
                value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
              <p className="text-[0.75rem] text-ink-muted">
                {selectedPlan ? `Precio del plan: ${formatMXN(listPrice)}.` : "Elige un plan primero."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cobro-ref">Referencia de pago (opcional)</Label>
              <Input id="cobro-ref" maxLength={100} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Folio de la transferencia o del voucher" />
            </div>
          </div>
          {needsReason && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-accent/30 bg-accent-soft p-3.5">
              <Label htmlFor="cobro-motivo">Motivo (obligatorio)</Label>
              <p className="text-[0.75rem] text-ink">
                {courtesy ? "Es una cortesía ($0)." : "Lo cobrado es distinto al precio del plan."} Queda en la bitácora con tu nombre.
              </p>
              <Textarea id="cobro-motivo" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. cortesía por evento de apertura" />
              {!reasonOk && <p className="text-[0.75rem] text-ink-muted">Mínimo 5 caracteres.</p>}
            </div>
          )}
        </Panel>
```

- **Resumen:**
  - Tras `{row("Método", methodLabel)}`: `{paymentReference.trim() && row("Referencia", paymentReference.trim())}` y `{selectedPlan && differs && row("Precio del plan", formatMXN(listPrice))}`.
  - El total pasa a `{selectedPlan && amountValid ? formatMXN(amount) : "—"}`.
  - Junto a "Total": `{courtesy && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-accent-strong">Cortesía</span>}`.
- **Botón:** `disabled={!selectedUser || !selectedPlan || !amountValid || (needsReason && !reasonOk) || assignMutation.isPending}`.

**`src/pages/admin/memberships/MembershipsList.tsx`:**
- **Import:** `import { Textarea } from "@/components/ui/textarea";`.
- **Estado:** `const [reasonVal, setReasonVal] = useState("");`; en `openEdit`, `setReasonVal("")`.
- **`editMutation`:** tipo del cuerpo `{ startDate?: string; endDate?: string; reason: string }`.
- **`submitEdit`:** `const body: { startDate?: string; endDate?: string; reason: string } = { startDate: startVal, reason: reasonVal.trim() };`.
- **En el diálogo**, antes del párrafo de ayuda:

```tsx
            <div className="space-y-1.5">
              <Label htmlFor="m-reason">Motivo del ajuste</Label>
              <Textarea id="m-reason" rows={2} value={reasonVal} onChange={(e) => setReasonVal(e.target.value)}
                placeholder="Obligatorio: p. ej. preventa acordada con la clienta" />
              <p className="text-xs text-ink/50">Queda en la bitácora con tu nombre. Mínimo 5 caracteres.</p>
            </div>
```

- **"Guardar vigencia":** `disabled={editMutation.isPending || reasonVal.trim().length < 5}`.

**`src/pages/admin/clients/ClientDetail.tsx`:**
- **Import:** `import { Textarea } from "@/components/ui/textarea";`.
- **Estado:** `const [editReason, setEditReason] = useState("");`; en `openEditMem`, `setEditReason("")`.
- **`mutationFn`:** agrega `body.reason = editReason.trim();`.
- **Derivado:**

```tsx
  const creditsNum = Number(editCredits);
  const editAbovePlan = !editUnlimited && editMem?.classLimit != null && editCredits.trim() !== ""
    && Number.isFinite(creditsNum) && creditsNum > Number(editMem.classLimit);
```

- **"Clases restantes":** agrega `htmlFor="mem-credits"` al `Label` e `id="mem-credits"` al `Input`. Bajo su ayuda:

```tsx
                  {editAbovePlan && (
                    <p className="text-[0.75rem] font-bold text-danger">Queda por encima del plan ({editMem.classLimit} clases).</p>
                  )}
```

- **Antes del cierre del `<div className="space-y-4">` del diálogo:**

```tsx
                <div className="space-y-1">
                  <Label htmlFor="mem-reason" className="text-xs text-ink/70">Motivo del ajuste</Label>
                  <Textarea id="mem-reason" rows={2} className={fieldCls} value={editReason} onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Obligatorio: p. ej. compensación por clase cancelada" />
                  <p className="text-xs text-ink/50">Queda en la bitácora con tu nombre. Mínimo 5 caracteres.</p>
                </div>
```

- **"Guardar":** agrega `|| editReason.trim().length < 5` a `disabled`.

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/payments src/pages/admin/memberships src/pages/admin/clients` → PASS.
  - En tu base (5573/8173): `ventas-ajustes.test.mjs` más `reportes.test.mjs`, `vencidas-pagos.test.mjs`, `robustez.test.mjs` y `creditos.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/membershipAdmin.js server/lib/membershipAdmin.test.js server/index.js server/tests/ventas-ajustes.test.mjs src/pages/admin/payments/PaymentsPage.tsx src/pages/admin/payments/PaymentsPage.test.tsx src/pages/admin/memberships/MembershipsList.tsx src/pages/admin/memberships/MembershipsList.test.tsx src/pages/admin/clients/ClientDetail.tsx src/pages/admin/clients/ClientDetail.test.tsx
git commit -m "fix(hive): venta en mostrador con quién, referencia y motivo si es cortesía o precio distinto; ajustes de membresía con motivo y bitácora"
```

---

### Task 4: Asistencia en la bitácora y corrección de falta el mismo día

**Files:**
- Modify: `server/lib/checkin.js`, `server/lib/checkin.test.js`, `server/lib/faltas.js`, `server/lib/faltas.test.js`
- Modify: `server/index.js`:
  - Imports de `faltas.js` y `checkin.js`.
  - `studioNow`, `awardCheckinPoints` y `PUT /api/bookings/:id/check-in` (~14004–14106).
  - `POST /api/admin/checkin/scan` (~14108–14186).
  - `PUT /api/bookings/:id/no-show` (~14188–14207) y ruta nueva justo después.
- Modify: `src/pages/admin/attendance/TodayAttendance.tsx`, `src/pages/admin/attendance/TodayAttendance.test.tsx`
- Create: `server/tests/faltas-correccion.test.mjs`

**Interfaces:**
- Consumes:
  - Task 1: `recordAudit`, `recordAuditBestEffort`, `reasonProblem`; `bookings.falta_recorded_at`.
  - Task 2: `promptText({ minLength })`.
- Produces:

```js
// server/lib/checkin.js
export function noShowCorrectionRule({ bookingStatus, classStatus, classDate, nowDate })
// → { ok:true } | { ok:false, code: "NOT_NO_SHOW"|"CLASS_CANCELLED"|"NOT_SAME_DAY", message }
// server/lib/faltas.js
export function faltaReversal({ faltasCount, threshold = 5, penaltyPoints = 0 }) // { newCount, refundPoints }
```

- `PUT /api/bookings/:id/correct-no-show`:
  - Cuerpo `{ reason }`.
  - Responde `{ data, falta_reverted, penalty_refunded, points_awarded }`.
  - 400 `REASON_REQUIRED`; 409 con `code`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/checkin.test.js`: cambia el import a `import { checkinRule, noShowCorrectionRule } from "./checkin.js";` y agrega:

```js
test("corregir falta: sólo no_show, clase no cancelada, mismo día", () => {
  const ok = { bookingStatus: "no_show", classStatus: "scheduled", classDate: "2026-09-28", nowDate: "2026-09-28" };
  assert.deepEqual(noShowCorrectionRule(ok), { ok: true });
  for (const s of ["confirmed", "checked_in", "cancelled", "waitlist"]) {
    assert.equal(noShowCorrectionRule({ ...ok, bookingStatus: s }).code, "NOT_NO_SHOW");
  }
  assert.equal(noShowCorrectionRule({ ...ok, classStatus: "cancelled" }).code, "CLASS_CANCELLED");
  const otro = noShowCorrectionRule({ ...ok, classDate: "2026-09-27" });
  assert.equal(otro.code, "NOT_SAME_DAY");
  assert.match(otro.message, /mismo día/);
});
```

`server/lib/faltas.test.js`: cambia el import a `import { isWithinCancelWindow, penaltyDueAt, faltaReversal } from "./faltas.js";` y agrega:

```js
test("revertir UNA falta: baja el contador y devuelve la penalización si esa falta la completó", () => {
  assert.deepEqual(faltaReversal({ faltasCount: 5, threshold: 5, penaltyPoints: 50 }), { newCount: 4, refundPoints: 50 });
  assert.deepEqual(faltaReversal({ faltasCount: 6, threshold: 5, penaltyPoints: 50 }), { newCount: 5, refundPoints: 0 });
  assert.deepEqual(faltaReversal({ faltasCount: 10, threshold: 5, penaltyPoints: 50 }), { newCount: 9, refundPoints: 50 });
  assert.deepEqual(faltaReversal({ faltasCount: 5, threshold: 5, penaltyPoints: 0 }), { newCount: 4, refundPoints: 0 });
  assert.deepEqual(faltaReversal({ faltasCount: 0, threshold: 5, penaltyPoints: 50 }), { newCount: 0, refundPoints: 0 });
});
```

`server/tests/faltas-correccion.test.mjs`:

```js
// Tarea 4 · auditoría 2026-09-27, bloque 2. Corregir una falta el mismo día con
// motivo: asistencia, sin esa falta (y su penalización si la completó), puntos
// una sola vez, y todo en la bitácora. Check-in manual y QR también se registran.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgfaltas";
let A, adminId, f, prevLoyalty;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
  [prevLoyalty] = await sql(`SELECT value FROM settings WHERE key = 'loyalty_config'`);
  await sql(
    `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ ...(prevLoyalty?.value ?? {}), enabled: true, points_per_class: 10, faltas_enabled: true, faltas_threshold: 5, faltas_penalty_points: 50 })],
  );
});
after(async () => {
  if (prevLoyalty) await sql(`UPDATE settings SET value = $1::jsonb WHERE key = 'loyalty_config'`, [JSON.stringify(prevLoyalty.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'loyalty_config'`);
  await cleanup(PFX);
  await closeDb();
});

async function reservaDeHoy(key) {
  const v = ventanaAhora();
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, c.id]);
  return { c, classId, bookingId: bk.id };
}
const puntos = async (userId, like) =>
  (await sql(`SELECT points FROM loyalty_transactions WHERE user_id=$1 AND description LIKE $2 ORDER BY created_at`, [userId, like])).map((r) => Number(r.points));
const corregir = (id, body) => api("PUT", `/api/bookings/${id}/correct-no-show`, { token: A, body });

test("falta del día corregida con motivo: asistencia, sin la falta, penalización devuelta y puntos una vez", async () => {
  const { c, bookingId } = await reservaDeHoy("corrige");
  await sql(`UPDATE users SET faltas_count = 4 WHERE id = $1`, [c.id]);
  const ns = await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  assert.equal(ns.status, 200);
  assert.equal((await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]))[0].faltas_count, 5);
  assert.deepEqual(await puntos(c.id, "Penalización%"), [-50]);
  assert.ok((await sql(`SELECT falta_recorded_at FROM bookings WHERE id=$1`, [bookingId]))[0].falta_recorded_at, "la falta queda ligada a la reserva");

  const r = await corregir(bookingId, { reason: "Sí vino, se marcó por error" });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.falta_reverted, true);
  assert.equal(r.body.penalty_refunded, 50);
  assert.equal(r.body.points_awarded, 10);
  const [b] = await sql(`SELECT status, checked_in_by, checked_in_at, falta_recorded_at FROM bookings WHERE id=$1`, [bookingId]);
  assert.equal(b.status, "checked_in");
  assert.equal(b.checked_in_by, adminId);
  assert.ok(b.checked_in_at);
  assert.equal(b.falta_recorded_at, null);
  assert.equal((await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]))[0].faltas_count, 4);
  assert.deepEqual(await puntos(c.id, "Reverso de penalización%"), [50]);
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10]);
  const logs = await sql(`SELECT action, reason, before, after FROM audit_log WHERE entity_id = $1 ORDER BY created_at`, [bookingId]);
  assert.deepEqual(logs.map((l) => l.action), ["booking.no_show", "booking.no_show_corrected"]);
  assert.equal(logs[1].reason, "Sí vino, se marcó por error");
  assert.equal(logs[1].before.faltas_count, 5);
  assert.equal(logs[1].after.faltas_count, 4);

  const otra = await corregir(bookingId, { reason: "Otra vez por si acaso" });
  assert.equal(otra.status, 409);
  assert.equal(otra.body.code, "NOT_NO_SHOW");
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10], "sin puntos repetidos");
  assert.deepEqual(await puntos(c.id, "Reverso de penalización%"), [50], "sin reverso repetido");
});

test("sin motivo → 400 y la falta sigue", async () => {
  const { bookingId } = await reservaDeHoy("sinmotivo");
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  for (const body of [{}, { reason: "ok" }]) {
    const r = await corregir(bookingId, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.code, "REASON_REQUIRED");
  }
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "no_show");
});

test("una falta de otro día no se corrige: 409 NOT_SAME_DAY", async () => {
  const { bookingId, classId } = await reservaDeHoy("ayer");
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-1), classId]);
  const r = await corregir(bookingId, { reason: "Sí vino, se marcó por error" });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "NOT_SAME_DAY");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "no_show");
});

test("una reserva con check-in que luego se marcó falta: la corrección no da puntos otra vez", async () => {
  const { c, bookingId } = await reservaDeHoy("yavino");
  const ci = await api("PUT", `/api/bookings/${bookingId}/check-in`, { token: A });
  assert.equal(ci.status, 200, JSON.stringify(ci.body).slice(0, 150));
  await api("PUT", `/api/bookings/${bookingId}/no-show`, { token: A });
  const r = await corregir(bookingId, { reason: "Se marcó falta por error" });
  assert.equal(r.status, 200);
  assert.equal(r.body.points_awarded, 0);
  assert.deepEqual(await puntos(c.id, "Clase asistida"), [10], "sólo los del check-in original");
  const [log] = await sql(`SELECT actor_id, meta FROM audit_log WHERE entity_id=$1 AND action='booking.checkin'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.meta.method, "manual");
});

test("el check-in por QR queda en la bitácora con el método", async () => {
  const { c, bookingId } = await reservaDeHoy("qr");
  const r = await api("POST", "/api/admin/checkin/scan", { token: A, body: { code: Buffer.from(c.id).toString("base64") } });
  assert.equal(r.body.status, "ok", JSON.stringify(r.body));
  const [log] = await sql(`SELECT actor_id, meta FROM audit_log WHERE entity_id=$1 AND action='booking.checkin'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.meta.method, "qr");
});

test("ids: basura → 400; inexistente → 404", async () => {
  assert.equal((await api("PUT", "/api/bookings/basura/correct-no-show", { token: A, body: { reason: "Motivo válido" } })).status, 400);
  assert.equal((await corregir(crypto.randomUUID(), { reason: "Motivo válido" })).status, 404);
});
```

`src/pages/admin/attendance/TodayAttendance.test.tsx`:
- Reemplaza la prueba "el diálogo de falta dice que ya no podrá marcarse como asistencia" por:

```tsx
  it("el diálogo de falta dice que se puede corregir hoy mismo", async () => {
    montar();
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    fireEvent.click(within(actual).getByRole("button", { name: "Marcar falta de Camila Torres" }));
    expect(await screen.findByText("Su reserva quedará registrada como falta. Si fue un error, podrás corregirla a asistencia hoy mismo, con un motivo.")).toBeInTheDocument();
    expect(screen.queryByText(/ya no podrá marcarse como asistencia/)).toBeNull();
  });
```

- Agrega:

```tsx
  it("una falta de hoy ofrece Corregir a asistencia y pide motivo", async () => {
    montar([clase("c11", "11:00", "11:50", "Reformer Intermedio", 8, [e("n", "no_show", "Lucía Díaz")])]);
    const actual = await screen.findByRole("region", { name: "Reformer Intermedio 11:00" });
    fireEvent.click(within(actual).getByRole("button", { name: "Corregir a asistencia de Lucía Díaz" }));
    const dlg = await screen.findByRole("alertdialog");
    const corregir = within(dlg).getByRole("button", { name: "Corregir a asistencia" });
    expect(corregir).toBeDisabled();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "Sí vino, error al marcar" } });
    expect(corregir).toBeEnabled();
    fireEvent.click(corregir);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/bookings/n/correct-no-show", { reason: "Sí vino, error al marcar" }));
  });
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**

`server/lib/checkin.js`, al final:

```js
/** Corregir una falta a asistencia (pedido del dueño, bloque 2): sólo una
 *  reserva marcada como falta, de una clase no cancelada y el mismo día de la
 *  clase en la zona del estudio. */
export function noShowCorrectionRule({ bookingStatus, classStatus, classDate, nowDate }) {
  if (bookingStatus !== "no_show") {
    return { ok: false, code: "NOT_NO_SHOW", message: "La reserva no está marcada como falta." };
  }
  if (classStatus === "cancelled") {
    return { ok: false, code: "CLASS_CANCELLED", message: "La clase fue cancelada." };
  }
  if (classDate !== nowDate) {
    return { ok: false, code: "NOT_SAME_DAY", message: `Sólo se puede corregir el mismo día de la clase (${classDate}).` };
  }
  return { ok: true };
}
```

`server/lib/faltas.js`, al final:

```js
/** Qué deshacer al corregir UNA falta: el contador baja uno y, si el contador
 *  actual es múltiplo del umbral (esa falta completó la penalización), se
 *  devuelve la penalización. Auditoría 2026-09-27, bloque 2. */
export function faltaReversal({ faltasCount, threshold = 5, penaltyPoints = 0 }) {
  const n = Math.max(0, Math.trunc(Number(faltasCount) || 0));
  if (n === 0) return { newCount: 0, refundPoints: 0 };
  const refund = penaltyDueAt(n, threshold) && Number(penaltyPoints) > 0 ? Math.abs(Number(penaltyPoints)) : 0;
  return { newCount: n - 1, refundPoints: refund };
}
```

En `server/index.js`:

**Imports** (edita en su lugar):

```js
import { isWithinCancelWindow, penaltyDueAt, faltaReversal } from "./lib/faltas.js";
import { checkinRule, noShowCorrectionRule } from "./lib/checkin.js";
```

**Helper**, tras `awardCheckinPoints`:

```js
// Refleja en Wellhub una asistencia marcada en el estudio (lista o corrección
// de falta) para que la visita se facture. Best-effort, sin esperar.
function reflectWellhubVisit(booking) {
  (async () => {
    try {
      const creds = await getWellhubCredentials(pool);
      if (creds && creds.is_enabled) {
        const u = await pool.query("SELECT wellhub_id FROM users WHERE id=$1", [booking.user_id]);
        const vres = await wellhubValidateVisit(creds, { customCode: u.rows[0]?.wellhub_id });
        await pool.query(
          `INSERT INTO partner_checkins (booking_id, user_id, channel, status, method, validated_at, external_response)
           VALUES ($1,$2,'wellhub',$3,'manual',NOW(),$4)`,
          [booking.id, booking.user_id, vres.ok ? "confirmed" : "failed", JSON.stringify(vres.data || {})],
        );
      }
    } catch (e) { console.warn("[wellhub] reflect visit:", e.message); }
  })();
}
```

**Check-in manual:**
- Reemplaza el bloque `if (booking.channel === "wellhub" && !wasAlreadyCheckedIn) { (async () => { … })(); }` por `if (booking.channel === "wellhub" && !wasAlreadyCheckedIn) reflectWellhubVisit(booking);`.
- Tras la línea de `awardCheckinPoints`:

```js
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.checkin", entityType: "booking", entityId: booking.id,
      subjectUserId: booking.user_id, before: { status: bk.status }, after: { status: "checked_in" },
      meta: { method: "manual", class_id: booking.class_id },
    });
```

**QR:** tras `await awardCheckinPoints(userId);`:

```js
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.checkin", entityType: "booking", entityId: bk.id,
      subjectUserId: userId, before: { status: bk.status }, after: { status: "checked_in" },
      meta: { method: "qr", class_name: bk.class_name },
    });
```

**`PUT /api/bookings/:id/no-show`:** reemplaza la ruta completa por:

```js
// PUT /api/bookings/:id/no-show — marca falta. La falta queda ligada a ESTA
// reserva (falta_recorded_at) para poder corregirla el mismo día, y el cambio
// queda en la bitácora (auditoría 2026-09-27, bloque 2).
app.put("/api/bookings/:id/no-show", adminMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `WITH prev AS (SELECT id, status::text AS status FROM bookings WHERE id = $1 FOR UPDATE)
       UPDATE bookings b SET status = 'no_show'
         FROM prev
        WHERE b.id = prev.id AND prev.status NOT IN ('cancelled', 'no_show')
       RETURNING b.*, prev.status AS prev_status`,
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Reserva no encontrada o ya procesada" });
    const { prev_status: prevStatus, ...bk } = r.rows[0];
    triggerWalletPassSync(bk.user_id, "booking_no_show");
    // Registrar falta por no-show (excluye invitadas con guest_profile_id).
    let falta = null;
    try {
      if (bk.user_id && !bk.guest_profile_id) {
        falta = await recordFalta({ userId: bk.user_id, reason: "no-show" });
        if (falta.faltasCount > 0) {
          await pool.query("UPDATE bookings SET falta_recorded_at = NOW() WHERE id = $1", [bk.id]);
        }
      }
    } catch (e) { console.warn("[faltas] no-show:", e.message); }
    await recordAuditBestEffort(pool, {
      actorId: req.userId, action: "booking.no_show", entityType: "booking", entityId: bk.id,
      subjectUserId: bk.user_id, before: { status: prevStatus }, after: { status: "no_show" },
      meta: { falta_recorded: Boolean(falta?.faltasCount), penalty_applied: Boolean(falta?.penaltyApplied) },
    });
    return res.json({ data: bk });
  } catch (err) {
    console.error("[PUT /bookings/:id/no-show]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/bookings/:id/correct-no-show — corrige a asistencia una falta
// marcada por error, sólo el mismo día de la clase y con motivo. Revierte la
// falta que registró ESTA reserva (el contador y, si esa falta completó el
// umbral, la penalización), da los puntos de asistencia una sola vez y deja
// constancia en la bitácora. Pedido del dueño, auditoría 2026-09-27, bloque 2.
app.put("/api/bookings/:id/correct-no-show", adminMiddleware, async (req, res) => {
  const reason = req.body?.reason;
  const problem = reasonProblem(reason);
  if (problem) return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT b.id, b.user_id, b.status::text AS status, b.checked_in_at, b.guest_profile_id,
              b.falta_recorded_at, b.channel, c.status::text AS class_status,
              to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
         LEFT JOIN class_types ct ON ct.id = c.class_type_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const bk = cur.rows[0];
    const { nowDate } = await studioNow(client);
    const rule = noShowCorrectionRule({ bookingStatus: bk.status, classStatus: bk.class_status, classDate: bk.class_date, nowDate });
    if (!rule.ok) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: rule.code, message: rule.message });
    }
    const firstAttendance = !bk.checked_in_at;
    await client.query(
      `UPDATE bookings
          SET status = 'checked_in', checked_in_at = COALESCE(checked_in_at, NOW()),
              checked_in_by = COALESCE(checked_in_by, $2), falta_recorded_at = NULL
        WHERE id = $1`,
      [bk.id, req.userId],
    );
    const cfg = await getLoyaltyConfig(client);
    let faltas = null;
    if (bk.falta_recorded_at && bk.user_id && !bk.guest_profile_id) {
      const u = await client.query("SELECT COALESCE(faltas_count, 0)::int AS n FROM users WHERE id = $1 FOR UPDATE", [bk.user_id]);
      const antes = Number(u.rows[0]?.n ?? 0);
      const rev = faltaReversal({ faltasCount: antes, threshold: cfg.faltas_threshold, penaltyPoints: cfg.faltas_penalty_points });
      await client.query("UPDATE users SET faltas_count = $2 WHERE id = $1", [bk.user_id, rev.newCount]);
      if (rev.refundPoints > 0) {
        await client.query(
          "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'adjust', $2, $3)",
          [bk.user_id, rev.refundPoints, "Reverso de penalización: falta corregida a asistencia"],
        );
      }
      faltas = { antes, despues: rev.newCount, refund: rev.refundPoints };
    }
    let pointsAwarded = 0;
    const pts = Number(cfg.points_per_class);
    if (firstAttendance && bk.user_id && cfg.enabled !== false && pts > 0) {
      await client.query(
        "INSERT INTO loyalty_transactions (user_id, type, points, description) VALUES ($1, 'earn', $2, 'Clase asistida')",
        [bk.user_id, pts],
      );
      pointsAwarded = pts;
    }
    await recordAudit(client, {
      actorId: req.userId, action: "booking.no_show_corrected", entityType: "booking", entityId: bk.id,
      subjectUserId: bk.user_id, reason,
      before: { status: "no_show", ...(faltas ? { faltas_count: faltas.antes } : {}) },
      after: { status: "checked_in", ...(faltas ? { faltas_count: faltas.despues } : {}) },
      meta: { class_name: bk.class_name, falta_reverted: Boolean(faltas), penalty_refunded: faltas?.refund ?? 0, points_awarded: pointsAwarded },
    });
    await client.query("COMMIT");
    if (bk.user_id) {
      triggerWalletPassSync(bk.user_id, "no_show_corrected");
      if (pointsAwarded > 0) {
        checkLoyaltyMilestones(bk.user_id).catch((e) => console.warn("[Milestones] corrección de falta:", e?.message));
      }
    }
    if (bk.channel === "wellhub" && firstAttendance) reflectWellhubVisit({ id: bk.id, user_id: bk.user_id });
    const row = await pool.query("SELECT * FROM bookings WHERE id = $1", [bk.id]);
    return res.json({ data: row.rows[0], falta_reverted: Boolean(faltas), penalty_refunded: faltas?.refund ?? 0, points_awarded: pointsAwarded });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /bookings/:id/correct-no-show]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`src/pages/admin/attendance/TodayAttendance.tsx`:**
- **`ClassCardProps`:** agrega `onCorrect: (r: TodayRosterEntry) => void;` y desestructúralo en `ClassCard`.
- **Rama `no_show` de la fila** (reemplaza la `<span>Falta</span>` y su comentario):

```tsx
                ) : r.status === "no_show" ? (
                  // Una falta se corrige a asistencia el mismo día con motivo
                  // (PUT /bookings/:id/correct-no-show). Pasar lista sólo trae
                  // clases de hoy; el servidor vuelve a revisar el día.
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] text-ink-muted">Falta</span>
                    <Button variant="outline" size="sm" aria-label={`Corregir a asistencia de ${labelOf(r)}`} onClick={() => onCorrect(r)} disabled={mutating}>
                      <RotateCcw size={14} aria-hidden="true" />
                      <span className="hidden sm:inline">Corregir a asistencia</span>
                      <span className="sm:hidden">Corregir</span>
                    </Button>
                  </span>
                ) : (
```

- **En `TodayAttendance`:** `const { confirm, promptText, dialog } = useConfirm();`, y:

```tsx
  const correctMutation = useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string; name: string }) =>
      api.put(`/bookings/${bookingId}/correct-no-show`, { reason }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["today-roster"] });
      toast({ title: "Falta corregida", description: `${vars.name} quedó con asistencia.` });
    },
    onError: (e: any) => toast({
      title: "No se pudo corregir la falta",
      description: e?.response?.data?.message ?? "Intenta de nuevo.",
      variant: "destructive",
    }),
  });

  const handleCorrect = async (r: TodayRosterEntry) => {
    const name = labelOf(r);
    const reason = await promptText({
      title: `¿Corregir la falta de ${name}?`,
      description: "Pasa a asistencia, se le quita esta falta y recibe los puntos de la clase. Sólo se puede el mismo día y queda en la bitácora con tu nombre.",
      placeholder: "Motivo (obligatorio): p. ej. sí vino, se marcó por error",
      confirmLabel: "Corregir a asistencia",
      minLength: 5,
    });
    if (reason) correctMutation.mutate({ bookingId: r.booking_id, reason, name });
  };
```

- **Texto del diálogo de falta:** `description: "Su reserva quedará registrada como falta. Si fue un error, podrás corregirla a asistencia hoy mismo, con un motivo.",`.
- **`mutating`:** `checkinMutation.isPending || noShowMutation.isPending || correctMutation.isPending`.
- **`cardProps`:** agrega `onCorrect: handleCorrect`.

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/attendance src/components/admin` → PASS.
  - En tu base (5574/8174): `faltas-correccion.test.mjs` más `checkin-regla.test.mjs`, `creditos.test.mjs` y `roster-salud.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/checkin.js server/lib/checkin.test.js server/lib/faltas.js server/lib/faltas.test.js server/index.js server/tests/faltas-correccion.test.mjs src/pages/admin/attendance/TodayAttendance.tsx src/pages/admin/attendance/TodayAttendance.test.tsx
git commit -m "fix(hive): corregir una falta a asistencia el mismo día con motivo; check-in, QR y faltas en la bitácora"
```

---

### Task 5: Cancelaciones del estudio, "Limpiar semana" y borrar clase sin perder historial

**Files:**
- Create: `server/lib/weekClear.js`, `server/lib/weekClear.test.js`, `server/tests/cancelaciones-semana.test.mjs`, `src/components/admin/UnreachedDialog.tsx`, `src/pages/admin/bookings/BookingsList.cancelarReserva.test.tsx`
- Modify: `server/index.js`:
  - Import tras `import { extractGymId, computeEventId } …`.
  - Helpers nuevos antes de `// PUT /api/classes/:id/cancel — admin cancela clase completa.`.
  - `PUT /api/classes/:id/cancel`, `DELETE /api/admin/bookings/:id`, `DELETE /api/classes/week` y `DELETE /api/admin/classes/:id`.
- Modify: `src/pages/admin/bookings/BookingsList.tsx`, `src/pages/admin/classes/ClassesCalendar.tsx`, `src/pages/admin/classes/ClassesCalendar.test.tsx`

**Interfaces:**
- Consumes:
  - Task 1: `recordAudit`, `reasonProblem`, `cleanReason` e `isDay`; columnas `bookings.cancelled_by/cancellation_reason` y `classes.cancelled_by/cancelled_at/cancellation_reason`.
  - Task 2: `promptText({ minLength })`.
- Produces:

```js
// server/lib/weekClear.js
export const MAX_CLEAR_DAYS = 31;
export function planWeekClear(rows) // rows: { id, status, started, total_bookings, active_bookings } → { delete:[], cancel:[], keep:[], activeBookings }
export function weekRangeProblem(start, end) // null | mensaje del 400
// server/index.js (internos)
async function cancelClassInTx(client, classId, { actorId, reason, source }) // null | { classRow, activeBookings, creditsRestored, pointsReverted }
async function notifyClassCancelled(classRow, activeBookings, reason) // { waQueued, waUnreached, channelState }
```

```tsx
// src/components/admin/UnreachedDialog.tsx
export type UnreachedPerson = { user_id: string; display_name: string | null; phone: string | null };
export default function UnreachedDialog(props: { items: UnreachedPerson[]; channelOff: boolean; onClose: () => void })
```

- API:
  - `DELETE /api/admin/bookings/:id` exige `reason` (400 `REASON_REQUIRED`).
  - `DELETE /api/classes/week`: cuerpo `{ startDate, endDate, force?, reason? }`; 409 `ACTIVE_BOOKINGS`; respuesta con `deleted, cancelled, kept, bookingsCancelled, creditsRestored, wa_*`.
  - `DELETE /api/admin/classes/:id`: 409 `CLASS_HAS_BOOKINGS`, 404.
  - La respuesta de `PUT /api/classes/:id/cancel` no cambia.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/weekClear.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { planWeekClear, weekRangeProblem } from "./weekClear.js";

test("clasifica: vacías se borran, empezadas y canceladas se quedan, el resto se cancela", () => {
  const plan = planWeekClear([
    { id: "vacia", total_bookings: 0, active_bookings: 0, started: false, status: "scheduled" },
    { id: "vacia-pasada", total_bookings: 0, active_bookings: 0, started: true, status: "scheduled" },
    { id: "con-reservas", total_bookings: 3, active_bookings: 2, started: false, status: "scheduled" },
    { id: "solo-historial", total_bookings: 1, active_bookings: 0, started: false, status: "closed" },
    { id: "ya-paso", total_bookings: 4, active_bookings: 4, started: true, status: "scheduled" },
    { id: "cancelada", total_bookings: 2, active_bookings: 0, started: false, status: "cancelled" },
  ]);
  assert.deepEqual(plan, {
    delete: ["vacia", "vacia-pasada"],
    cancel: ["con-reservas", "solo-historial"],
    keep: ["ya-paso", "cancelada"],
    activeBookings: 2,
  });
});

test("rango", () => {
  assert.equal(weekRangeProblem("2026-09-21", "2026-09-27"), null);
  assert.match(weekRangeProblem(null, "2026-09-27"), /requeridos/);
  assert.match(weekRangeProblem("2026-09-21", "basura"), /inválidas/);
  assert.match(weekRangeProblem("2026-09-27", "2026-09-21"), /inválido/);
  assert.match(weekRangeProblem("2026-01-01", "2026-03-01"), /31 días/);
  assert.equal(weekRangeProblem("2026-09-01", "2026-10-01"), null, "31 días exactos");
});
```

`server/tests/cancelaciones-semana.test.mjs`:

```js
// Tarea 5 · auditoría 2026-09-27, bloque 2 (P0-3, P1-5 · I6). El estudio cancela
// con motivo y queda en la bitácora; "Limpiar semana" borra sólo lo vacío, cancela
// (crédito y aviso) lo que tiene reservas y no toca lo que ya ocurrió.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgcancel";
let A, adminId, f;

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

async function reserva(key, date) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}: ${JSON.stringify(asg.body).slice(0, 150)}`);
  const [bk] = await sql(`SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2`, [classId, c.id]);
  return { c, classId, bookingId: bk.id };
}
const cuantas = async (id) => (await sql(`SELECT COUNT(*)::int n FROM classes WHERE id=$1`, [id]))[0].n;

test("cancelar una reserva desde el panel exige motivo", async () => {
  const { bookingId } = await reserva("sinmotivo", day(30));
  for (const body of [{}, { reason: "ok" }, { reason: "     " }]) {
    const r = await api("DELETE", `/api/admin/bookings/${bookingId}`, { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.code, "REASON_REQUIRED");
  }
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "confirmed");
});

test("con motivo: cancela, devuelve crédito, guarda quién y por qué, y queda en la bitácora", async () => {
  const { c, bookingId } = await reserva("conmotivo", day(31));
  const antes = await credits(c.id);
  const r = await api("DELETE", `/api/admin/bookings/${bookingId}`, { token: A, body: { reason: "Nos pidió moverla por teléfono" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await credits(c.id), antes + 1);
  const [b] = await sql(`SELECT status, cancelled_by, cancellation_reason FROM bookings WHERE id=$1`, [bookingId]);
  assert.equal(b.status, "cancelled");
  assert.equal(b.cancelled_by, adminId);
  assert.equal(b.cancellation_reason, "Nos pidió moverla por teléfono");
  const [log] = await sql(`SELECT actor_id, subject_user_id, reason, before, after, meta FROM audit_log WHERE entity_id=$1 AND action='booking.cancel'`, [bookingId]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.subject_user_id, c.id);
  assert.equal(log.before.status, "confirmed");
  assert.equal(log.after.status, "cancelled");
  assert.equal(log.meta.credit_restored, true);
});

test("cancelar una clase deja quién y por qué en la clase y en la bitácora; la respuesta no cambia", async () => {
  const { classId } = await reserva("clase", day(35));
  const r = await api("PUT", `/api/classes/${classId}/cancel`, { token: A, body: { reason: "La coach se enfermó" } });
  assert.equal(r.status, 200);
  for (const k of ["bookings_cancelled", "credits_restored", "points_reverted", "wa_queued", "wa_failed", "wa_unreached", "wa_channel_state"]) {
    assert.ok(k in r.body.data, k);
  }
  const [cl] = await sql(`SELECT cancelled_by, cancellation_reason, cancelled_at FROM classes WHERE id=$1`, [classId]);
  assert.equal(cl.cancelled_by, adminId);
  assert.equal(cl.cancellation_reason, "La coach se enfermó");
  assert.ok(cl.cancelled_at);
  const [log] = await sql(`SELECT reason, meta FROM audit_log WHERE entity_id=$1 AND action='class.cancel'`, [classId]);
  assert.equal(log.reason, "La coach se enfermó");
  assert.equal(log.meta.source, "manual");
  assert.equal(log.meta.bookings_cancelled, 1);
});

test("limpiar semana: 409 con el resumen si hay reservas activas; con force exige motivo; nada cambia", async () => {
  const vacia = await makeClass(A, f, { date: day(40) });
  const { classId: conReserva } = await reserva("semana1", day(41));
  const r409 = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(40), endDate: day(46) } });
  assert.equal(r409.status, 409);
  assert.equal(r409.body.code, "ACTIVE_BOOKINGS");
  assert.equal(r409.body.activeBookings, 1);
  assert.equal(r409.body.classesToCancel, 1);
  assert.equal(r409.body.classesToDelete, 1);
  const sinMotivo = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(40), endDate: day(46), force: true } });
  assert.equal(sinMotivo.status, 400);
  assert.equal(sinMotivo.body.code, "REASON_REQUIRED");
  assert.equal(await cuantas(vacia), 1);
  assert.equal(await cuantas(conReserva), 1);
});

test("limpiar semana con motivo: borra vacías, cancela las que tienen reservas y conserva el historial", async () => {
  const vacia = await makeClass(A, f, { date: day(50) });
  const { c, classId: conReserva, bookingId } = await reserva("semana2", day(51));
  const soloHistorial = await reserva("semana3", day(52));
  await api("DELETE", `/api/admin/bookings/${soloHistorial.bookingId}`, { token: A, body: { reason: "Canceló por teléfono" } });
  const antes = await credits(c.id);
  const r = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(50), endDate: day(56), force: true, reason: "Cierre por vacaciones" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.deleted, 1);
  assert.equal(r.body.cancelled, 2);
  assert.equal(r.body.bookingsCancelled, 1);
  assert.equal(r.body.wa_failed, 1, "sin Evolution configurado: hay que avisar a mano");
  assert.equal(await cuantas(vacia), 0, "la vacía se borró");
  const [cr] = await sql(`SELECT status, cancelled_by, cancellation_reason FROM classes WHERE id=$1`, [conReserva]);
  assert.equal(cr.status, "cancelled");
  assert.equal(cr.cancelled_by, adminId);
  assert.equal(cr.cancellation_reason, "Cierre por vacaciones");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "cancelled", "la reserva sigue, cancelada");
  assert.equal(await credits(c.id), antes + 1, "se devolvió el crédito");
  assert.equal((await sql(`SELECT status FROM classes WHERE id=$1`, [soloHistorial.classId]))[0].status, "cancelled", "con sólo historial se cancela, no se borra");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM bookings WHERE id=$1`, [soloHistorial.bookingId]))[0].n, 1, "su reserva cancelada sigue");
  const [wk] = await sql(`SELECT reason, after FROM audit_log WHERE action='class.week_clear' AND meta->>'start' = $1`, [day(50)]);
  assert.equal(wk.reason, "Cierre por vacaciones");
  assert.equal(wk.after.deleted, 1);
  const cancels = await sql(`SELECT entity_id FROM audit_log WHERE action='class.cancel' AND meta->>'source'='week_clear' AND entity_id = ANY($1::uuid[])`, [[conReserva, soloHistorial.classId]]);
  assert.equal(cancels.length, 2);
});

test("limpiar semana no toca clases que ya ocurrieron", async () => {
  const { c, classId, bookingId } = await reserva("pasada", day(20));
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-200), classId]);
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`, [bookingId]);
  const antes = await credits(c.id);
  const r = await api("DELETE", "/api/classes/week", { token: A, body: { startDate: day(-200), endDate: day(-200) } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.kept, 1);
  assert.equal(r.body.deleted, 0);
  assert.notEqual((await sql(`SELECT status FROM classes WHERE id=$1`, [classId]))[0].status, "cancelled");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [bookingId]))[0].status, "checked_in");
  assert.equal(await credits(c.id), antes, "no se devuelve crédito de una clase que ocurrió");
});

test("rango inválido → 400, nunca 500", async () => {
  for (const body of [{}, { startDate: "basura", endDate: day(1) }, { startDate: day(5), endDate: day(1) }, { startDate: day(0), endDate: day(60) }]) {
    const r = await api("DELETE", "/api/classes/week", { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("borrar una clase con reservas → 409; sin reservas se borra y queda en la bitácora; inexistente → 404", async () => {
  const { classId } = await reserva("borrar", day(33));
  const r409 = await api("DELETE", `/api/admin/classes/${classId}`, { token: A });
  assert.equal(r409.status, 409);
  assert.equal(r409.body.code, "CLASS_HAS_BOOKINGS");
  assert.equal(await cuantas(classId), 1);
  const vacia = await makeClass(A, f, { date: day(34) });
  const ok = await api("DELETE", `/api/admin/classes/${vacia}`, { token: A });
  assert.equal(ok.status, 200);
  assert.equal(await cuantas(vacia), 0);
  const [log] = await sql(`SELECT actor_id FROM audit_log WHERE entity_id=$1 AND action='class.delete'`, [vacia]);
  assert.equal(log.actor_id, adminId);
  assert.equal((await api("DELETE", `/api/admin/classes/${crypto.randomUUID()}`, { token: A })).status, 404);
});
```

`src/pages/admin/bookings/BookingsList.cancelarReserva.test.tsx`: copia el encabezado de `BookingsList.cancelar.test.tsx` (mocks, `semana`, `roster` y `beforeEach` con `routeApi`), cambia `mockApi` a `{ get: Mock; put: Mock; delete: Mock }` y agrega en `beforeEach` `mockApi.delete.mockReset().mockResolvedValue({ data: { data: { id: "b1", credit_restored: true } } });`. Luego:

```tsx
describe("Reservas · cancelar una reserva", () => {
  it("exige motivo y lo manda con la devolución de crédito", async () => {
    renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
    const lista = await screen.findByRole("region", { name: "Lista de la clase" });
    await within(lista).findByText("Ana");
    fireEvent.keyDown(within(lista).getByRole("button", { name: "Más acciones para Ana" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Cancelar reserva (devuelve crédito)" }));
    const dlg = await screen.findByRole("dialog", { name: "Cancelar reserva de Ana" });
    const boton = within(dlg).getByRole("button", { name: "Cancelar reserva" });
    expect(boton).toBeDisabled();
    expect(within(dlg).getByText(/Queda en la bitácora y se incluye en el WhatsApp/)).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "Nos pidió moverla" } });
    expect(boton).toBeEnabled();
    fireEvent.click(boton);
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith("/admin/bookings/b1", { data: { reason: "Nos pidió moverla", refundCredit: true } }));
  });
});
```

`src/pages/admin/classes/ClassesCalendar.test.tsx`:
- Agrega `waitFor` al import.
- Agrega:

```tsx
  it("Limpiar semana: con reservas pide motivo, cancela esas clases y avisa a quién no le llegó", async () => {
    const mockDelete = (api as unknown as { delete: Mock }).delete;
    mockDelete.mockReset()
      .mockRejectedValueOnce({ response: { status: 409, data: { code: "ACTIVE_BOOKINGS", activeBookings: 8, classesToCancel: 1, classesToDelete: 0, classesKept: 0 } } })
      .mockResolvedValueOnce({ data: { deleted: 0, cancelled: 1, kept: 0, bookingsCancelled: 8, wa_failed: 1, wa_unreached: [{ user_id: "u1", display_name: "Camila Torres", phone: "5512345678" }], wa_channel_state: "disconnected" } });
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    const limpiar = await screen.findByRole("button", { name: "Limpiar semana" });
    await waitFor(() => expect(limpiar).toBeEnabled());
    fireEvent.click(limpiar);
    const confirmar = await screen.findByRole("alertdialog");
    expect(within(confirmar).getByText(/Las que ya pasaron no se tocan/)).toBeInTheDocument();
    fireEvent.click(within(confirmar).getByRole("button", { name: "Limpiar semana" }));
    const prompt = await screen.findByRole("alertdialog", { name: "Hay reservas activas" });
    const seguir = within(prompt).getByRole("button", { name: "Cancelar esas clases y limpiar" });
    expect(seguir).toBeDisabled();
    fireEvent.change(within(prompt).getByRole("textbox"), { target: { value: "Cierre por vacaciones" } });
    fireEvent.click(seguir);
    await waitFor(() => expect(mockDelete).toHaveBeenLastCalledWith("/classes/week", { data: { startDate: "2026-09-21", endDate: "2026-09-27", force: true, reason: "Cierre por vacaciones" } }));
    expect(mockDelete).toHaveBeenNthCalledWith(1, "/classes/week", { data: { startDate: "2026-09-21", endDate: "2026-09-27", force: false, reason: undefined } });
    expect(await screen.findByText("Avisa a mano a estas alumnas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "5512345678" })).toHaveAttribute("href", "tel:5512345678");
  });
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**

`server/lib/weekClear.js`:

```js
// "Limpiar semana" sin borrar historial (auditoría 2026-09-27, P1-5 · I6).
import { isDay } from "./validate.js";

export const MAX_CLEAR_DAYS = 31;

/**
 * Clasifica cada clase del rango:
 *  - sin ninguna reserva (de ningún estado) → se borra;
 *  - ya empezó o pasó, o ya estaba cancelada → no se toca;
 *  - el resto (tiene reservas y no ha empezado) → se cancela con el flujo de
 *    cancelar clase, que devuelve créditos y avisa.
 */
export function planWeekClear(rows) {
  const plan = { delete: [], cancel: [], keep: [], activeBookings: 0 };
  for (const r of rows || []) {
    const total = Number(r.total_bookings) || 0;
    if (total === 0) plan.delete.push(r.id);
    else if (r.started === true || r.status === "cancelled") plan.keep.push(r.id);
    else {
      plan.cancel.push(r.id);
      plan.activeBookings += Number(r.active_bookings) || 0;
    }
  }
  return plan;
}

/** null si el rango sirve; si no, el texto del 400. */
export function weekRangeProblem(start, end) {
  if (!start || !end) return "startDate y endDate requeridos";
  if (!isDay(start) || !isDay(end)) return "Fechas inválidas (usa AAAA-MM-DD).";
  if (start > end) return "Rango de fechas inválido";
  const days = (Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000 + 1;
  if (days > MAX_CLEAR_DAYS) return `El rango no puede pasar de ${MAX_CLEAR_DAYS} días.`;
  return null;
}
```

En `server/index.js`:

**Import**, tras `import { extractGymId, computeEventId } from "./lib/wellhub/payload.js";`:

```js
import { planWeekClear, weekRangeProblem } from "./lib/weekClear.js";
```

**Helpers**, justo antes de `// PUT /api/classes/:id/cancel — admin cancela clase completa. Cascada:`:

```js
// ── Cancelar una clase (compartido por PUT /classes/:id/cancel y "Limpiar
// semana"). Auditoría 2026-09-27, bloque 2. ─────────────────────────────────
/**
 * Dentro de una transacción abierta: marca la clase cancelada con quién y por
 * qué, cancela sus reservas activas devolviendo crédito y puntos
 * (applyCancellationRollback) y deja la fila en la bitácora. Devuelve null si
 * la clase no existe o ya estaba cancelada. Los avisos van DESPUÉS del COMMIT
 * con notifyClassCancelled().
 */
async function cancelClassInTx(client, classId, { actorId, reason, source = "manual" }) {
  const actor = isUuid(actorId) ? actorId : null;
  const why = cleanReason(reason);
  const cls = await client.query(
    `WITH prev AS (SELECT id, status::text AS status FROM classes WHERE id = $1 FOR UPDATE)
     UPDATE classes c
        SET status = 'cancelled', updated_at = NOW(), cancelled_at = NOW(),
            cancelled_by = $2, cancellation_reason = $3
       FROM prev
      WHERE c.id = prev.id AND prev.status <> 'cancelled'
      RETURNING c.id, c.date, c.start_time, c.class_type_id, to_char(c.date, 'YYYY-MM-DD') AS day, prev.status AS prev_status`,
    [classId, actor, why],
  );
  if (!cls.rows.length) return null;
  const classRow = cls.rows[0];

  // Reservas activas ANTES de cancelarlas (incluye checked_in: la admin puede
  // cancelar una clase a posteriori).
  const bookingsRes = await client.query(
    `SELECT b.id, b.user_id, b.class_id, b.membership_id, b.status, b.checked_in_at,
            c.date AS class_date,
            u.display_name, u.phone, ct.name AS class_name
       FROM bookings b
       LEFT JOIN users u ON u.id = b.user_id
       LEFT JOIN classes c ON c.id = b.class_id
       LEFT JOIN class_types ct ON ct.id = c.class_type_id
      WHERE b.class_id = $1 AND b.status NOT IN ('cancelled', 'no_show')`,
    [classId],
  );
  const activeBookings = bookingsRes.rows;
  let creditsRestored = 0;
  let pointsReverted = 0;
  for (const b of activeBookings) {
    await client.query(
      `UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by=$2,
              cancellation_reason = COALESCE($3, cancellation_reason)
        WHERE id=$1`,
      [b.id, actor, why],
    );
    // Al cancelar la clase completa se devuelve crédito también a quienes ya
    // tenían check-in (la clase no ocurrió).
    const rollback = await applyCancellationRollback(client, b, { refundCheckedIn: true });
    if (rollback.creditRestored) creditsRestored++;
    if (rollback.pointsReverted) pointsReverted += rollback.pointsReverted;
  }
  // Red de seguridad: recalcula el cupo desde las reservas vivas en vez de asumir 0.
  await client.query(
    `UPDATE classes c SET current_bookings = COALESCE((
       SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND b.status IN ('confirmed','checked_in')
     ), 0) WHERE c.id = $1`,
    [classId],
  );
  await recordAudit(client, {
    actorId: actor, action: "class.cancel", entityType: "class", entityId: classRow.id, reason: why,
    before: { status: classRow.prev_status }, after: { status: "cancelled" },
    meta: {
      source, day: classRow.day, start_time: String(classRow.start_time).slice(0, 5),
      bookings_cancelled: activeBookings.length, credits_restored: creditsRestored, points_reverted: pointsReverted,
      booking_ids: activeBookings.map((b) => b.id),
    },
  });
  return { classRow, activeBookings, creditsRestored, pointsReverted };
}

/** Avisos de una clase cancelada, fuera de la transacción. Con el canal caído o
 *  los avisos apagados no se intenta y se devuelve la lista para avisar a mano
 *  (auditoría 2026-09-27, P0-1). */
async function notifyClassCancelled(classRow, activeBookings, reason) {
  const dateStr = classRow.date ? new Date(classRow.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
  const timeStr = classRow.start_time ? String(classRow.start_time).slice(0, 5) : "";
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
  return { waQueued, waUnreached, channelState: channel.state };
}
```

**`PUT /api/classes/:id/cancel`:** reemplaza el cuerpo de la ruta (desde `app.put("/api/classes/:id/cancel"` hasta su `});`) por:

```js
app.put("/api/classes/:id/cancel", adminMiddleware, async (req, res) => {
  const { reason } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const done = await cancelClassInTx(client, req.params.id, { actorId: req.userId, reason, source: "manual" });
    if (!done) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada o ya cancelada" });
    }
    await client.query("COMMIT");
    const wa = await notifyClassCancelled(done.classRow, done.activeBookings, reason);
    return res.json({
      data: {
        class_id: done.classRow.id,
        bookings_cancelled: done.activeBookings.length,
        credits_restored: done.creditsRestored,
        points_reverted: done.pointsReverted,
        wa_queued: wa.waQueued,
        wa_failed: wa.waUnreached.length,
        wa_unreached: wa.waUnreached,
        // "disabled" = la dueña apagó los avisos; otro estado = canal caído.
        wa_channel_state: wa.channelState,
        reason: reason || null,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /classes/:id/cancel]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`DELETE /api/admin/bookings/:id`:** reemplaza la ruta completa por:

```js
// DELETE /api/admin/bookings/:id — el estudio cancela una reserva (override de
// la política de 2 h). Motivo obligatorio: queda en la reserva, en la bitácora
// y, como antes, en el WhatsApp (auditoría 2026-09-27, P0-3).
app.delete("/api/admin/bookings/:id", adminMiddleware, async (req, res) => {
  // refundCredit (default true): la admin decide si devolver el crédito. En false
  // se cancela y libera el lugar pero la clase cuenta como usada (ej. una falta).
  const { reason, refundCredit } = req.body || {};
  const problem = reasonProblem(reason);
  if (problem) return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
  const why = cleanReason(reason);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `SELECT b.id, b.user_id, b.class_id, b.membership_id, b.status, b.checked_in_at,
              c.date, c.start_time, to_char(c.date, 'YYYY-MM-DD') AS day, ct.name AS class_name
         FROM bookings b
         JOIN classes c ON c.id = b.class_id
         JOIN class_types ct ON ct.id = c.class_type_id
        WHERE b.id = $1
        FOR UPDATE OF b`,
      [req.params.id],
    );
    if (!r.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const booking = r.rows[0];
    if (booking.status === "cancelled") {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Esta reserva ya estaba cancelada" });
    }
    await client.query(
      `UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancelled_by=$2, cancellation_reason=$3 WHERE id=$1`,
      [req.params.id, req.userId, why],
    );
    // Rollback completo (créditos y puntos). La admin que cancela a mano espera
    // que el crédito se devuelva incluso si ya tenía check-in (suele ser un
    // check-in por error o re-clasificación de la asistencia).
    const rb = await applyCancellationRollback(client, booking, { refundCheckedIn: true, skipCreditRestore: refundCredit === false });
    await recordAudit(client, {
      actorId: req.userId, action: "booking.cancel", entityType: "booking", entityId: booking.id,
      subjectUserId: booking.user_id, reason: why,
      before: { status: booking.status }, after: { status: "cancelled" },
      meta: {
        class_id: booking.class_id, day: booking.day, class_name: booking.class_name,
        refund_credit_requested: refundCredit !== false, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted,
      },
    });
    await client.query("COMMIT");

    // WA + wallet sync (igual que antes)
    if (booking.user_id) {
      const dateStr = booking.date ? new Date(booking.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
      const timeStr = booking.start_time ? String(booking.start_time).slice(0, 5) : "";
      notifyByTemplate(
        booking.user_id,
        "booking_cancelled",
        { class: booking.class_name || "tu clase", date: dateStr, time: timeStr, creditRestored: rb.creditRestored ? "Sí" : "No" },
        ({ firstName }) =>
          `${firstName}, cancelamos tu reserva de ${booking.class_name || "la clase"}${dateStr ? ` del ${dateStr}` : ""}. (motivo: ${why})${rb.creditRestored ? " Tu clase regresó a tu paquete." : ""}`,
      ).catch(() => {});
      triggerWalletPassSync(booking.user_id, "admin_booking_cancelled");
    }
    return res.json({ data: { id: booking.id, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted, reason: why } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[DELETE /admin/bookings/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`DELETE /api/classes/week`:** reemplaza la ruta completa (desde `// DELETE /api/classes/week — clear classes in date range` hasta su `});`) por:

```js
// DELETE /api/classes/week — "Limpiar semana" sin borrar historial
// (auditoría 2026-09-27, P1-5 · I6). Borra sólo las clases sin ninguna reserva;
// las que tienen reservas y no han empezado se cancelan con el flujo de
// cancelar clase (devuelve créditos y avisa); las que ya empezaron no se tocan.
// Sin force, si hay reservas activas responde 409 con el resumen; con force
// exige motivo porque cancela reservas.
app.delete("/api/classes/week", adminMiddleware, async (req, res) => {
  const { startDate, endDate, force, reason } = req.body || {};
  const start = typeof startDate === "string" ? startDate.slice(0, 10) : null;
  const end = typeof endDate === "string" ? endDate.slice(0, 10) : null;
  const rangeProblem = weekRangeProblem(start, end);
  if (rangeProblem) return res.status(400).json({ message: rangeProblem });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM classes WHERE date >= $1 AND date <= $2 FOR UPDATE", [start, end]);
    const rows = (await client.query(
      `SELECT c.id, c.status::text AS status,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') <= NOW() AS started,
              COUNT(b.id)::int AS total_bookings,
              (COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in','waitlist')))::int AS active_bookings
         FROM classes c
         LEFT JOIN bookings b ON b.class_id = c.id
        WHERE c.date >= $1 AND c.date <= $2
        GROUP BY c.id
        ORDER BY c.date, c.start_time`,
      [start, end],
    )).rows;
    const plan = planWeekClear(rows);
    if (plan.activeBookings > 0 && !force) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        code: "ACTIVE_BOOKINGS",
        message: "Hay reservas activas esta semana. Esas clases se cancelan (se devuelve el crédito y se avisa a cada alumna) en lugar de borrarse.",
        activeBookings: plan.activeBookings,
        classesToCancel: plan.cancel.length,
        classesToDelete: plan.delete.length,
        classesKept: plan.keep.length,
      });
    }
    if (plan.activeBookings > 0) {
      const problem = reasonProblem(reason);
      if (problem) {
        await client.query("ROLLBACK");
        return res.status(400).json({ code: "REASON_REQUIRED", message: problem });
      }
    }
    const cancelled = [];
    for (const id of plan.cancel) {
      const done = await cancelClassInTx(client, id, { actorId: req.userId, reason: cleanReason(reason) || "Limpieza de la semana", source: "week_clear" });
      if (done) cancelled.push(done);
    }
    let deleted = 0;
    if (plan.delete.length) {
      // NOT EXISTS: una clase que recibió una reserva entre el conteo y aquí no se borra.
      const del = await client.query(
        `DELETE FROM classes c
          WHERE c.id = ANY($1::uuid[])
            AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.class_id = c.id)
          RETURNING c.id`,
        [plan.delete],
      );
      deleted = del.rowCount ?? del.rows.length;
    }
    const bookingsCancelled = cancelled.reduce((s, c) => s + c.activeBookings.length, 0);
    const creditsRestored = cancelled.reduce((s, c) => s + c.creditsRestored, 0);
    await recordAudit(client, {
      actorId: req.userId, action: "class.week_clear", entityType: "class_week",
      reason: plan.activeBookings > 0 ? reason : null,
      after: { deleted, cancelled: cancelled.length, kept: plan.keep.length },
      meta: {
        start, end, deleted_ids: plan.delete, cancelled_ids: cancelled.map((c) => c.classRow.id), kept_ids: plan.keep,
        bookings_cancelled: bookingsCancelled, credits_restored: creditsRestored,
      },
    });
    await client.query("COMMIT");

    // Avisos después del COMMIT, igual que al cancelar una clase.
    let waQueued = 0;
    let channelState = null;
    const unreached = new Map();
    for (const c of cancelled) {
      if (!c.activeBookings.length) continue;
      const wa = await notifyClassCancelled(c.classRow, c.activeBookings, cleanReason(reason));
      waQueued += wa.waQueued;
      channelState = wa.channelState;
      for (const u of wa.waUnreached) if (!unreached.has(u.user_id)) unreached.set(u.user_id, u);
    }
    return res.json({
      deleted, cancelled: cancelled.length, kept: plan.keep.length, bookingsCancelled, creditsRestored,
      wa_queued: waQueued, wa_failed: unreached.size, wa_unreached: [...unreached.values()], wa_channel_state: channelState,
      startDate: start, endDate: end,
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "23503") {
      return res.status(409).json({ message: "Alguna clase tiene registros ligados: cancélala en lugar de borrarla." });
    }
    console.error("[DELETE /classes/week]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`DELETE /api/admin/classes/:id`:** reemplaza la ruta completa por:

```js
// DELETE /api/admin/classes/:id — sólo borra una clase sin ninguna reserva (de
// ningún estado): borrarla con reservas se llevaba su historial en cascada. Con
// reservas se cancela (PUT /api/classes/:id/cancel). Auditoría 2026-09-27, P1-5.
app.delete("/api/admin/classes/:id", adminMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT c.id, to_char(c.date, 'YYYY-MM-DD') AS day, c.start_time, c.status::text AS status,
              (SELECT COUNT(*)::int FROM bookings b WHERE b.class_id = c.id) AS bookings
         FROM classes c WHERE c.id = $1 FOR UPDATE`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clase no encontrada" });
    }
    const cls = cur.rows[0];
    if (cls.bookings > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ code: "CLASS_HAS_BOOKINGS", message: "Esta clase tiene reservas o historial: cancélala en lugar de borrarla." });
    }
    await client.query("DELETE FROM classes WHERE id = $1", [cls.id]);
    await recordAudit(client, {
      actorId: req.userId, action: "class.delete", entityType: "class", entityId: cls.id,
      before: { day: cls.day, start_time: String(cls.start_time).slice(0, 5), status: cls.status },
      meta: { source: "manual" },
    });
    await client.query("COMMIT");
    return res.json({ message: "Clase eliminada" });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err?.code === "23503") {
      return res.status(409).json({ code: "CLASS_HAS_BOOKINGS", message: "La clase tiene registros ligados: cancélala en lugar de borrarla." });
    }
    console.error("[DELETE /admin/classes/:id]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`src/components/admin/UnreachedDialog.tsx`:** mueve aquí, sin cambiar el JSX, el componente `UnreachedDialog` de `BookingsList.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type UnreachedPerson = { user_id: string; display_name: string | null; phone: string | null };

// "Avisa a mano": el canal de WhatsApp estaba caído (o apagado) al cancelar una
// clase, así que a estas alumnas no les llegó el aviso automático. Compartido
// por Reservas y el calendario de Clases (auditoría 2026-09-27).
export default function UnreachedDialog({
  items, channelOff, onClose,
}: {
  items: UnreachedPerson[];
  /** La dueña apagó los avisos de WhatsApp en Configuración (no es una caída del canal). */
  channelOff: boolean;
  onClose: () => void;
}) {
  // (mismo JSX que el componente actual de BookingsList.tsx)
}
```

**`src/pages/admin/bookings/BookingsList.tsx`:**
- **Componente inline:** borra el `UnreachedDialog` de este archivo y agrega `import UnreachedDialog, { type UnreachedPerson } from "@/components/admin/UnreachedDialog";`.
- **Estado:** `const [unreached, setUnreached] = useState<UnreachedPerson[]>([]);`.
- **`CancelBookingDialog`:**
  - `onConfirm` pasa a `(args: { reason: string; refundCredit: boolean }) => void`.
  - El bloque del motivo:

```tsx
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-xs text-ink/70">Motivo (obligatorio)</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. nos pidió moverla por teléfono"
              rows={2}
              className="bg-canvas border-line-strong/60 text-ink placeholder:text-ink/40"
            />
            <p className="text-[0.75rem] text-ink/60">Queda en la bitácora y se incluye en el WhatsApp que le llega a {entry.displayName}. Mínimo 5 caracteres.</p>
          </div>
```

  - El botón "Cancelar reserva": `onClick={() => onConfirm({ reason: reason.trim(), refundCredit: isUnlimited ? false : refundCredit })}` y `disabled={pending || reason.trim().length < 5}`.
- **`cancelMutation`:** el tipo de `reason` pasa a `string`.

**`src/pages/admin/classes/ClassesCalendar.tsx`:**
- **Imports:** `import UnreachedDialog, { type UnreachedPerson } from "@/components/admin/UnreachedDialog";`; `const { confirm, promptText, dialog } = useConfirm();`.
- **Estado:**

```tsx
  const [unreached, setUnreached] = useState<UnreachedPerson[]>([]);
  const [unreachedOff, setUnreachedOff] = useState(false);
```

- **`cancelMutation.onSuccess`:**

```tsx
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const d = res?.data?.data ?? {};
      if (Number(d.wa_failed ?? 0) > 0) {
        const off = d.wa_channel_state === "disabled";
        setUnreachedOff(off);
        setUnreached(d.wa_unreached ?? []);
        toast({ title: "Clase cancelada", description: `No se pudo avisar a ${d.wa_failed} ${d.wa_failed === 1 ? "alumna" : "alumnas"} (${off ? "los avisos de WhatsApp están apagados" : "WhatsApp desconectado"}).`, variant: "destructive" });
      } else {
        toast({ title: "Clase cancelada" });
      }
      setSheetOpen(false);
    },
```

- **`clearWeekMutation`:**

```tsx
  const clearWeekMutation = useMutation({
    mutationFn: (vars: { force: boolean; reason?: string }) =>
      api.delete("/classes/week", { data: { startDate: start, endDate: end, force: vars.force, reason: vars.reason } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const d = res?.data ?? {};
      const deleted = Number(d.deleted ?? 0);
      const cancelled = Number(d.cancelled ?? 0);
      const bookings = Number(d.bookingsCancelled ?? 0);
      const kept = Number(d.kept ?? 0);
      const failed = Number(d.wa_failed ?? 0);
      const parts = [
        bookings > 0 ? `${bookings} ${bookings === 1 ? "reserva cancelada" : "reservas canceladas"}, crédito devuelto` : null,
        kept > 0 ? `${kept} ${kept === 1 ? "clase que ya pasó se quedó igual" : "clases que ya pasaron se quedaron igual"}` : null,
      ].filter(Boolean);
      toast({
        title: `${deleted} ${deleted === 1 ? "clase borrada" : "clases borradas"} · ${cancelled} ${cancelled === 1 ? "cancelada" : "canceladas"}`,
        description: parts.length ? `${parts.join(" · ")}.` : undefined,
        ...(failed > 0 ? { variant: "destructive" as const } : {}),
      });
      if (failed > 0) {
        setUnreachedOff(d.wa_channel_state === "disabled");
        setUnreached(d.wa_unreached ?? []);
      }
      setSheetOpen(false);
    },
    onError: async (error: any) => {
      // 409 = hay reservas activas: esas clases se cancelan (no se borran), con motivo.
      if (error?.response?.status === 409 && error?.response?.data?.code === "ACTIVE_BOOKINGS") {
        const n = Number(error.response.data.activeBookings ?? 0);
        const m = Number(error.response.data.classesToCancel ?? 0);
        const reason = await promptText({
          title: "Hay reservas activas",
          description: `${n} ${n === 1 ? "reserva" : "reservas"} en ${m} ${m === 1 ? "clase" : "clases"}. Esas clases se cancelan en lugar de borrarse: se devuelve el crédito y se avisa a cada alumna. Queda en la bitácora con tu nombre.`,
          placeholder: "Motivo (obligatorio): p. ej. cierre por vacaciones",
          confirmLabel: "Cancelar esas clases y limpiar",
          cancelLabel: "Volver",
          minLength: 5,
        });
        if (reason) clearWeekMutation.mutate({ force: true, reason });
        return;
      }
      toast({ title: error?.response?.data?.message ?? "No se pudo limpiar la semana", variant: "destructive" });
    },
  });
```

- **`handleClearWeek`:**

```tsx
  const handleClearWeek = async () => {
    if (classes.length === 0 || clearWeekMutation.isPending) return;
    const ok = await confirm({
      title: "¿Limpiar la semana?",
      description: `Se borran las clases sin reservas de la semana (${weekLabel}). Las que tienen reservas se cancelan: se devuelve el crédito y se avisa a cada alumna. Las que ya pasaron no se tocan.`,
      confirmLabel: "Limpiar semana",
      destructive: true,
    });
    if (ok) clearWeekMutation.mutate({ force: false });
  };
```

- **En el `return` principal**, junto a `{dialog}`: `<UnreachedDialog items={unreached} channelOff={unreachedOff} onClose={() => setUnreached([])} />`.

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/bookings src/pages/admin/classes src/components/admin` → PASS.
  - En tu base (5575/8175): `cancelaciones-semana.test.mjs` más `whatsapp-honesto.test.mjs`, `creditos.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/weekClear.js server/lib/weekClear.test.js server/index.js server/tests/cancelaciones-semana.test.mjs src/components/admin/UnreachedDialog.tsx src/pages/admin/bookings/BookingsList.tsx src/pages/admin/bookings/BookingsList.cancelarReserva.test.tsx src/pages/admin/classes/ClassesCalendar.tsx src/pages/admin/classes/ClassesCalendar.test.tsx
git commit -m "fix(hive): el estudio cancela con motivo y bitácora; Limpiar semana y borrar clase ya no se llevan historial"
```

---

### Task 6: Baja de clienta por anonimización

**Files:**
- Create: `server/lib/anonymize.js`, `server/lib/anonymize.test.js`, `server/lib/accountGate.js`, `server/lib/accountGate.test.js`, `server/tests/baja-clienta.test.mjs`
- Modify: `server/index.js`:
  - Imports tras `import { publicPartnerSettings, mergeSecret } …`.
  - `authMiddleware` (~3012–3022).
  - `GET /api/users` (~12951–12977).
  - `DELETE /api/users/:id` (~13001–13034).
- Modify: `src/pages/admin/clients/ClientsList.tsx`, `src/pages/admin/clients/ClientsList.test.tsx`

**Interfaces:**
- Consumes (Task 1): `recordAudit`; columnas `users.anonymized_at` y `users.anonymized_by`.
- Produces:

```js
// server/lib/accountGate.js
export function createAccountGate({ lookup, ttlMs = 30_000, now, maxEntries = 5000 }) // { isDisabled(userId): Promise<boolean>, forget(userId) }
// server/lib/anonymize.js
export const ANON_NAME, ANON_GUEST_NAME, WAIVER_ANON_VALUES, GUEST_ANON_VALUES;
export const anonEmail = (userId) => "baja+<hex>@hive.invalid";
export function userAnonymizationValues(userId, actorId) // { columna: valor }
export function buildAnonymizeUpdate({ table, values, nowColumns, existing, idColumn = "id", id }) // { sql, params } | null
```

- API:
  - `DELETE /api/users/:id` (sólo dueña): cuerpo `{ reason? }` → `{ message, data: { id, anonymized: true, kept } }` o `{ data: { alreadyAnonymized: true } }`.
  - Token de cuenta dada de baja → 401 `{ code: "ACCOUNT_DISABLED" }`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/accountGate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAccountGate } from "./accountGate.js";

test("consulta una vez por usuaria dentro del TTL", async () => {
  let calls = 0, t = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return false; }, ttlMs: 1000, now: () => t });
  assert.equal(await gate.isDisabled("u1"), false);
  await gate.isDisabled("u1");
  assert.equal(calls, 1);
  t = 1500;
  await gate.isDisabled("u1");
  assert.equal(calls, 2);
});

test("una cuenta dada de baja queda bloqueada; forget() obliga a volver a consultar", async () => {
  let disabled = false, calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return disabled; } });
  assert.equal(await gate.isDisabled("u2"), false);
  disabled = true;
  gate.forget("u2");
  assert.equal(await gate.isDisabled("u2"), true);
  assert.equal(calls, 2);
});

test("si la base falla, no bloquea (y no guarda el error)", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; throw new Error("ECONNREFUSED"); } });
  assert.equal(await gate.isDisabled("u3"), false);
  assert.equal(await gate.isDisabled("u3"), false);
  assert.equal(calls, 2);
});

test("sin id no consulta", async () => {
  let calls = 0;
  const gate = createAccountGate({ lookup: async () => { calls++; return true; } });
  assert.equal(await gate.isDisabled(undefined), false);
  assert.equal(calls, 0);
});
```

`server/lib/anonymize.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAnonymizeUpdate, userAnonymizationValues, anonEmail, WAIVER_ANON_VALUES, ANON_NAME } from "./anonymize.js";

const ID = "3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("el correo anónimo es único por id y de un dominio que no existe", () => {
  assert.equal(anonEmail(ID), "baja+3f1b2c4d1a2b4c3d8e9f0a1b2c3d4e5f@hive.invalid");
});

test("users: borra datos personales y de salud y cierra el acceso", () => {
  const v = userAnonymizationValues(ID, "actor");
  assert.equal(v.display_name, ANON_NAME);
  for (const k of ["phone", "date_of_birth", "health_notes", "has_injury", "injury_details", "emergency_contact_name", "emergency_contact_phone", "password_hash"]) {
    assert.equal(v[k], null, k);
  }
  assert.equal(v.is_active, false);
  assert.equal(v.anonymized_by, "actor");
});

test("sólo toca columnas que existen, en orden, con NOW() para las de fecha", () => {
  const existing = new Set(["id", "display_name", "email", "phone", "health_notes", "anonymized_at", "is_active"]);
  const u = buildAnonymizeUpdate({ table: "users", values: userAnonymizationValues(ID, null), nowColumns: ["anonymized_at", "updated_at"], existing, id: ID });
  assert.equal(u.sql, "UPDATE users SET display_name = $2, email = $3, phone = $4, health_notes = $5, is_active = $6, anonymized_at = NOW() WHERE id = $1");
  assert.deepEqual(u.params, [ID, ANON_NAME, anonEmail(ID), null, null, false]);
});

test("responsiva por user_id; sin columnas → null", () => {
  const w = buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: new Set(["full_name", "signature_data"]), idColumn: "user_id", id: ID });
  assert.equal(w.sql, "UPDATE waivers SET full_name = $2, signature_data = $3 WHERE user_id = $1");
  assert.equal(buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: new Set(), id: ID }), null);
});
```

`server/tests/baja-clienta.test.mjs`:

```js
// Tarea 6 · auditoría 2026-09-27, bloque 2 (P1-5 · A9 · EC15). Dar de baja a una
// clienta la anonimiza: sin datos personales ni de salud, sin acceso, y con sus
// órdenes, membresías y reservas conservadas. Sólo la dueña.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgbaja";
let A, adminId, f;
const bajas = [];

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  // Las anonimizadas ya no tienen el correo con el prefijo: se limpian por id.
  if (bajas.length) {
    await sql(`DELETE FROM bookings WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM waivers WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = ANY($1::uuid[]))`, [bajas]);
    await sql(`DELETE FROM orders WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM memberships WHERE user_id = ANY($1::uuid[])`, [bajas]);
    await sql(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [bajas]);
  }
  await cleanup(PFX);
  await closeDb();
});

test("dar de baja: borra datos personales y de salud, conserva historial y cierra el acceso", async () => {
  const c = await makeClient(PFX, "baja");
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(3) });
  const asg = await api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: c.id, classId } });
  assert.ok(asg.status < 300, `asignar devolvió ${asg.status}`);
  // Historial viejo: la clase ya pasó, asistió, y la membresía venció.
  await sql(`UPDATE classes SET date = $1 WHERE id = $2`, [day(-30), classId]);
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE class_id = $1`, [classId]);
  await sql(`UPDATE memberships SET status = 'expired', end_date = $2 WHERE user_id = $1`, [c.id, day(-1)]);
  await sql(
    `UPDATE users SET has_injury = true, injury_details = 'Rodilla derecha', health_notes = 'Asma',
            date_of_birth = '1990-05-05', emergency_contact_name = 'Mamá', emergency_contact_phone = '5511112222'
      WHERE id = $1`, [c.id]);
  const [antes] = await sql(`SELECT email, phone FROM users WHERE id=$1`, [c.id]);
  const cuenta = async () => (await sql(
    `SELECT (SELECT COUNT(*)::int FROM orders WHERE user_id=$1) o,
            (SELECT COUNT(*)::int FROM memberships WHERE user_id=$1) m,
            (SELECT COUNT(*)::int FROM bookings WHERE user_id=$1) b`, [c.id]))[0];
  const hist = await cuenta();

  const r = await api("DELETE", `/api/users/${c.id}`, { token: A, body: { reason: "Lo pidió por WhatsApp" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  bajas.push(c.id);

  const [u] = await sql(
    `SELECT display_name, email, phone, has_injury, injury_details, health_notes, date_of_birth,
            emergency_contact_name, password_hash, is_active, anonymized_at, anonymized_by
       FROM users WHERE id=$1`, [c.id]);
  assert.equal(u.display_name, "Clienta dada de baja");
  assert.match(u.email, /^baja\+[0-9a-f]{32}@hive\.invalid$/);
  for (const k of ["phone", "has_injury", "injury_details", "health_notes", "date_of_birth", "emergency_contact_name", "password_hash"]) {
    assert.equal(u[k], null, k);
  }
  assert.equal(u.is_active, false);
  assert.ok(u.anonymized_at);
  assert.equal(u.anonymized_by, adminId);
  const [w] = await sql(`SELECT full_name, signature_data FROM waivers WHERE user_id=$1`, [c.id]);
  assert.equal(w.signature_data, null);
  assert.equal(w.full_name, "Clienta dada de baja");
  assert.deepEqual(await cuenta(), hist, "órdenes, membresías y reservas se conservan");

  // Acceso cerrado: el token viejo ya no sirve y no puede volver a entrar.
  const me = await api("GET", "/api/auth/me", { token: c.token });
  assert.equal(me.status, 401);
  assert.equal(me.body.code, "ACCOUNT_DISABLED");
  assert.equal((await api("GET", "/api/memberships/my", { token: c.token })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { body: { email: c.email, password: c.password } })).status, 401);

  // Ya no aparece en la lista de clientas.
  const lista = await api("GET", `/api/users?role=client&search=${encodeURIComponent("Clienta dada de baja")}`, { token: A });
  assert.equal(lista.body.data.length, 0);

  // La bitácora dice quién y por qué, sin guardar lo borrado.
  const [log] = await sql(`SELECT * FROM audit_log WHERE entity_id=$1 AND action='user.anonymize'`, [c.id]);
  assert.equal(log.actor_id, adminId);
  assert.equal(log.reason, "Lo pidió por WhatsApp");
  const txt = JSON.stringify(log);
  for (const pii of [antes.email, antes.phone, "Rodilla", "Asma", "1990-05-05", "5511112222"]) {
    assert.ok(!txt.includes(pii), `la bitácora guardó ${pii}`);
  }
  assert.deepEqual(log.meta.kept, { memberships: hist.m, orders: hist.o, bookings: hist.b });

  // Repetir no hace nada nuevo.
  const again = await api("DELETE", `/api/users/${c.id}`, { token: A, body: {} });
  assert.equal(again.status, 200);
  assert.equal(again.body.data.alreadyAnonymized, true);
});

test("con membresía activa o reservas próximas → 409 y no cambia nada", async () => {
  const c = await makeClient(PFX, "activa");
  await giveMembership(A, c.id, f.plan.id, 8);
  const r = await api("DELETE", `/api/users/${c.id}`, { token: A, body: {} });
  assert.equal(r.status, 409);
  const [u] = await sql(`SELECT display_name, anonymized_at FROM users WHERE id=$1`, [c.id]);
  assert.equal(u.display_name, "QA activa");
  assert.equal(u.anonymized_at, null);
});

test("sólo la dueña; sólo clientas; no a sí misma; ids malos", async () => {
  const recep = await makeClient(PFX, "recep", { role: "reception" });
  const c = await makeClient(PFX, "protegida");
  assert.equal((await api("DELETE", `/api/users/${c.id}`, { token: recep.token, body: {} })).status, 403);
  assert.equal((await api("DELETE", `/api/users/${recep.id}`, { token: A, body: {} })).status, 400);
  assert.equal((await api("DELETE", `/api/users/${adminId}`, { token: A, body: {} })).status, 400);
  assert.equal((await api("DELETE", "/api/users/no-es-uuid", { token: A })).status, 400);
  assert.equal((await api("DELETE", `/api/users/${crypto.randomUUID()}`, { token: A, body: {} })).status, 404);
});
```

`src/pages/admin/clients/ClientsList.test.tsx`: agrega:

```tsx
  it("eliminar da de baja: lo explica, pide motivo opcional y lo manda", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "u1", anonymized: true } } });
    renderAdmin(<ClientsList />, { route: "/admin/clients" });
    await screen.findByText("Camila Torres");
    abrirMenu("Acciones de Camila Torres");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText(/Sus reservas, órdenes y pagos se conservan/)).toBeInTheDocument();
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "Lo pidió por WhatsApp" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Eliminar clienta" }));
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith("/users/u1", { data: { reason: "Lo pidió por WhatsApp" } }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Clienta dada de baja" })));
  });
```

- [ ] **Step 2: Correr y ver que fallan.**

- [ ] **Step 3: Implementar.**

`server/lib/accountGate.js`:

```js
// Cuentas dadas de baja (anonimizadas): su token deja de servir aunque no haya
// vencido (auditoría 2026-09-27, P1-5). Caché corta para no consultar la base en
// cada petición; si la base falla, no se bloquea a nadie (el handler fallará igual).
export function createAccountGate({ lookup, ttlMs = 30_000, now = () => Date.now(), maxEntries = 5000 }) {
  const cache = new Map();
  async function isDisabled(userId) {
    const key = String(userId || "");
    if (!key) return false;
    const hit = cache.get(key);
    if (hit && hit.exp > now()) return hit.disabled;
    let disabled;
    try {
      disabled = Boolean(await lookup(key));
    } catch {
      return false;
    }
    if (cache.size >= maxEntries) cache.clear();
    cache.set(key, { disabled, exp: now() + ttlMs });
    return disabled;
  }
  return { isDisabled, forget: (userId) => { cache.delete(String(userId || "")); } };
}
```

`server/lib/anonymize.js`:

```js
// Baja de clienta sin perder historial (auditoría 2026-09-27, P1-5 · A9 · EC15).
// Se reemplazan sus datos personales y de salud; órdenes, pagos, membresías y
// reservas se conservan apuntando al mismo id.
export const ANON_NAME = "Clienta dada de baja";
export const ANON_GUEST_NAME = "Invitada dada de baja";
export const anonEmail = (userId) => `baja+${String(userId).replace(/-/g, "")}@hive.invalid`;

/** Columnas de `users` con el valor que las reemplaza. */
export function userAnonymizationValues(userId, actorId) {
  return {
    display_name: ANON_NAME,
    email: anonEmail(userId),
    phone: null,
    photo_url: null,
    date_of_birth: null,
    gender: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    health_notes: null,
    has_injury: null,
    injury_details: null,
    practiced_barre_before: null,
    instructor_notes: null,
    alert_flag: false,
    alert_message: null,
    password_hash: null,
    firebase_uid: null,
    wellhub_id: null,
    platform_plan: null,
    receive_reminders: false,
    receive_promotions: false,
    receive_weekly_summary: false,
    accepts_communications: false,
    is_active: false,
    anonymized_by: actorId ?? null,
  };
}

export const WAIVER_ANON_VALUES = Object.freeze({ full_name: ANON_NAME, phone: null, email: null, signature_data: null });
export const GUEST_ANON_VALUES = Object.freeze({
  display_name: ANON_GUEST_NAME, phone: null, email: null, date_of_birth: null, has_injury: null,
  injury_details: null, practiced_barre_before: null, emergency_contact_name: null, emergency_contact_phone: null,
});

/**
 * UPDATE sólo con las columnas que existen en la base (producción puede no tener
 * todas las de schema_complete.sql). `table` y las columnas son constantes del
 * código, nunca entrada de usuaria. null si no hay nada que tocar.
 */
export function buildAnonymizeUpdate({ table, values, nowColumns = [], existing, idColumn = "id", id }) {
  const params = [id];
  const sets = [];
  for (const [col, val] of Object.entries(values)) {
    if (!existing.has(col)) continue;
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  for (const col of nowColumns) if (existing.has(col)) sets.push(`${col} = NOW()`);
  if (!sets.length) return null;
  return { sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $1`, params };
}
```

En `server/index.js`:

**Imports**, tras `import { publicPartnerSettings, mergeSecret } from "./lib/partnerSettings.js";`:

```js
import { createAccountGate } from "./lib/accountGate.js";
import { userAnonymizationValues, buildAnonymizeUpdate, WAIVER_ANON_VALUES, GUEST_ANON_VALUES } from "./lib/anonymize.js";
```

**`authMiddleware`**, reemplaza la función por:

```js
// Cuentas dadas de baja (anonimizadas) o borradas: su token deja de servir
// aunque no haya vencido. Ver server/lib/accountGate.js (auditoría 2026-09-27, P1-5).
const accountGate = createAccountGate({
  lookup: async (userId) => {
    if (!isUuid(userId)) return false;
    const r = await pool.query("SELECT anonymized_at FROM users WHERE id = $1", [userId]);
    return r.rows.length === 0 || r.rows[0].anonymized_at != null;
  },
});

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ message: "No autorizado" });
  let payload;
  try {
    payload = jwt.verify(header.slice(7), JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
  req.userId = payload.sub;
  if (await accountGate.isDisabled(req.userId)) {
    return res.status(401).json({ code: "ACCOUNT_DISABLED", message: "Esta cuenta fue dada de baja." });
  }
  next();
}
```

**`GET /api/users`:** en `let q = \`SELECT id, display_name, email, phone, role, created_at FROM users WHERE 1=1\`;` cambia `WHERE 1=1` por `WHERE anonymized_at IS NULL` (las dadas de baja no se listan ni se encuentran en el buscador).

**`DELETE /api/users/:id`:** reemplaza la ruta completa por:

```js
// Columnas que existen en la base, por tabla (la baja sólo toca ésas).
async function existingColumns(db, tables) {
  const r = await db.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tables],
  );
  const out = Object.fromEntries(tables.map((t) => [t, new Set()]));
  for (const row of r.rows) out[row.table_name]?.add(row.column_name);
  return out;
}

// DELETE /api/users/:id — dar de baja a una clienta SIN borrar su historial
// (auditoría 2026-09-27, P1-5 · A9 · EC15). Antes el DELETE se llevaba en cascada
// sus órdenes, pagos y reservas. Ahora se anonimiza: se quitan sus datos
// personales y de salud, se cierra su acceso y se conserva todo lo demás con el
// mismo id. Sólo la dueña: es irreversible.
app.delete("/api/users/:id", ownerMiddleware, async (req, res) => {
  const id = req.params.id;
  if (id === req.userId) {
    return res.status(400).json({ message: "No puedes eliminar tu propia cuenta." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      "SELECT id, role::text AS role, is_active, anonymized_at, guest_profile_id FROM users WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Clienta no encontrada" });
    }
    const target = cur.rows[0];
    if (!["client", "guest"].includes(target.role)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Sólo se pueden dar de baja clientas desde aquí." });
    }
    if (target.anonymized_at) {
      await client.query("ROLLBACK");
      return res.json({ message: "La clienta ya estaba dada de baja.", data: { id, alreadyAnonymized: true } });
    }
    // No dar de baja con historial vivo: membresías activas o reservas próximas.
    const deps = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM memberships
            WHERE user_id = $1 AND status IN ('active','pending_activation','pending_payment')) AS memberships,
         (SELECT COUNT(*) FROM bookings b JOIN classes c ON b.class_id = c.id
            WHERE b.user_id = $1 AND b.status IN ('confirmed','checked_in')
              AND c.date >= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date) AS upcoming`,
      [id],
    );
    const d = deps.rows[0] || {};
    if (Number(d.memberships) > 0 || Number(d.upcoming) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        message: "No se puede eliminar: la clienta tiene membresías activas o reservas próximas. Cancélalas primero.",
      });
    }
    const kept = (await client.query(
      `SELECT (SELECT COUNT(*)::int FROM memberships WHERE user_id = $1) AS memberships,
              (SELECT COUNT(*)::int FROM orders WHERE user_id = $1) AS orders,
              (SELECT COUNT(*)::int FROM bookings WHERE user_id = $1) AS bookings`,
      [id],
    )).rows[0];

    const cols = await existingColumns(client, ["users", "waivers", "guest_profiles"]);
    const u = buildAnonymizeUpdate({
      table: "users", values: userAnonymizationValues(id, req.userId),
      nowColumns: ["anonymized_at", "updated_at"], existing: cols.users, id,
    });
    await client.query(u.sql, u.params);
    const w = buildAnonymizeUpdate({ table: "waivers", values: WAIVER_ANON_VALUES, existing: cols.waivers, idColumn: "user_id", id });
    if (w) await client.query(w.sql, w.params);
    if (target.guest_profile_id) {
      const g = buildAnonymizeUpdate({ table: "guest_profiles", values: GUEST_ANON_VALUES, nowColumns: ["updated_at"], existing: cols.guest_profiles, id: target.guest_profile_id });
      if (g) await client.query(g.sql, g.params);
    }
    await client.query("UPDATE referral_codes SET is_active = false WHERE user_id = $1", [id]);
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [id]);
    const serial = buildAppleWalletSerialFromUserId(id);
    await client.query("DELETE FROM apple_wallet_devices WHERE serial_number = $1 OR serial_number LIKE $2", [serial, `${serial}_ev_%`]);
    await recordAudit(client, {
      actorId: req.userId, action: "user.anonymize", entityType: "user", entityId: id, subjectUserId: id,
      reason: req.body?.reason,
      before: { role: target.role, is_active: target.is_active !== false },
      after: { is_active: false, anonymized: true },
      meta: { kept },
    });
    await client.query("COMMIT");
    accountGate.forget(id);
    return res.json({
      message: "Clienta dada de baja: se borraron sus datos personales y se conserva su historial.",
      data: { id, anonymized: true, kept },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`src/pages/admin/clients/ClientsList.tsx`:**
- `const { promptText, dialog } = useConfirm();` (quita `confirm` si queda sin uso).
- `deleteMutation`:

```tsx
  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.delete(`/users/${id}`, { data: reason ? { reason } : {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Clienta dada de baja", description: "Se borraron sus datos personales; su historial y sus pagos se conservan." });
    },
    onError: (e: any) =>
      toast({ title: "No se pudo eliminar", description: e?.response?.data?.message ?? "Revisa si tiene membresías o reservas activas.", variant: "destructive" }),
  });

  const askDelete = async (c: Client) => {
    const reason = await promptText({
      title: `¿Dar de baja a ${c.displayName}?`,
      description: "Se borran sus datos personales y de salud y se cierra su acceso. Sus reservas, órdenes y pagos se conservan sin su nombre. No se puede deshacer.",
      placeholder: "Motivo (opcional): p. ej. lo pidió por WhatsApp",
      confirmLabel: "Eliminar clienta",
    });
    if (reason !== null) deleteMutation.mutate({ id: c.id, reason: reason || undefined });
  };
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/clients` → PASS.
  - En tu base (5576/8176): `baja-clienta.test.mjs` más `seguridad.test.mjs`, `permisos.test.mjs` y `revision.test.mjs` → PASS. El candado nuevo corre en cada petición autenticada; si alguna prueba vieja usaba un token de una usuaria ya borrada, dilo en el reporte.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/accountGate.js server/lib/accountGate.test.js server/lib/anonymize.js server/lib/anonymize.test.js server/index.js server/tests/baja-clienta.test.mjs src/pages/admin/clients/ClientsList.tsx src/pages/admin/clients/ClientsList.test.tsx
git commit -m "fix(hive): borrar clienta la anonimiza, cierra su acceso y conserva órdenes, pagos y reservas"
```

---

### Task 7: Verificación

**Files:** ninguno nuevo en el repo. La evidencia va a `.superpowers/sdd/auditoria-b2/verificacion/` (ignorado).

- [ ] **Step 1: Suites.** `npm test` (vitest, `test:server` y scripts) → todo en verde. Si hay esperas agotadas del panel por carga de la máquina, vuelve a correr esos archivos solos y reporta ambos resultados.
- [ ] **Step 2: Tipos.** `npx tsc --noEmit -p tsconfig.app.json` → sin errores nuevos (sólo los preexistentes de `aliases` y supabase).
- [ ] **Step 3: Build con Node 20.** `rm -rf dist && VITE_API_URL=/api npx -y node@20 node_modules/vite/bin/vite.js build` → `✓ built`.
- [ ] **Step 4: Regresión completa del servidor** en base desechable (5581/8181), con el procedimiento de Global Constraints: `API_URL=http://127.0.0.1:8181 DATABASE_URL=postgres://alma:alma@127.0.0.1:5581/hive node --test --test-concurrency=1 "server/tests/*.test.mjs"` → todo en verde. Son las suites de antes más `bitacora`, `ventas-ajustes`, `faltas-correccion`, `cancelaciones-semana` y `baja-clienta`.
- [ ] **Step 5: Recorrido del panel en navegador** con Playwright de Python en navegador propio (no el MCP compartido).
  - **Base y servidor:** base desechable 5582/8182, con `dist/` servido por el servidor.
  - **Hora:** córrelo de día; la clase de "hoy" empieza en 20 min.
  - **Script:** guárdalo como `.superpowers/sdd/auditoria-b2/verificacion/recorrido.py` y corre `BASE_URL=http://127.0.0.1:8182 DATABASE_URL=postgres://alma:alma@127.0.0.1:5582/hive python3 recorrido.py` → sale con código 0 y deja capturas.

```python
#!/usr/bin/env python3
# Recorrido del panel · auditoría bloque 2. Sólo contra una base desechable.
import json, os, re, subprocess, sys, urllib.error, urllib.request
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8182")
DB = os.environ.get("DATABASE_URL", "postgres://alma:alma@127.0.0.1:5582/hive")
OUT = os.environ.get("OUT_DIR", ".superpowers/sdd/auditoria-b2/verificacion")
TZ = ZoneInfo("America/Mexico_City")
PWD = "Recorrido!2026"
ESPERADOS = {("DELETE", "/api/classes/week", 409)}  # el primer intento de Limpiar semana
os.makedirs(OUT, exist_ok=True)
fallas = []

def psql(q):
    return subprocess.run(["psql", DB, "-Atqc", q], check=True, capture_output=True, text=True).stdout.strip()

def api(method, path, token=None, body=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(BASE + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

HASH = subprocess.run(["node", "-e", "console.log(require('bcryptjs').hashSync(process.argv[1], 10))", PWD],
                      check=True, capture_output=True, text=True).stdout.strip()

def usuaria(clave, nombre, rol="client"):
    email = f"recorrido_{clave}@hive.test"
    uid = psql(f"""INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, is_active)
                   VALUES ('{nombre}', '{email}', '55{abs(hash(clave)) % 10**8:08d}', '{HASH}', '{rol}', true, true)
                   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
                   RETURNING id""")
    if rol == "client":
        psql(f"INSERT INTO waivers (user_id, full_name, signature_data) VALUES ('{uid}', '{nombre}', 'data:image/png;base64,recorrido') ON CONFLICT DO NOTHING")
    return {"id": uid, "email": email, "name": nombre}

# ── Datos sintéticos ────────────────────────────────────────────────────────
duena = usuaria("duena", "Dueña Recorrido", "admin")
recep = usuaria("recep", "Recepción Recorrido", "reception")
ana, eva, bea = usuaria("ana", "Ana Recorrido"), usuaria("eva", "Eva Recorrido"), usuaria("bea", "Bea Recorrido")
dana, caro = usuaria("dana", "Dana Recorrido"), usuaria("caro", "Caro Recorrido")
A = api("POST", "/api/auth/login", body={"email": duena["email"], "password": PWD})[1]["token"]
coach = api("POST", "/api/instructors", A, {"displayName": "Coach Recorrido", "isActive": True})[1]["data"]["id"]
tipo, categoria = psql("SELECT id || '|' || category FROM class_types WHERE is_active ORDER BY sort_order NULLS LAST LIMIT 1").split("|")
plan = psql(f"""SELECT id FROM plans WHERE is_active AND class_category = '{categoria}' AND class_limit >= 8
                AND COALESCE(morning_only,false) = false AND COALESCE(is_visit_pack,false) = false ORDER BY class_limit LIMIT 1""") \
    or psql(f"""INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                VALUES ('Recorrido 8', 'Recorrido', 1700, 'MXN', 30, 8, '{categoria}', true, 998) RETURNING id""")
plan_nombre = psql(f"SELECT name FROM plans WHERE id = '{plan}'")
for u in (ana, eva, bea):
    s, r = api("POST", "/api/memberships", A, {"userId": u["id"], "planId": plan, "paymentMethod": "cash"})
    assert s == 201, (s, r)

def clase(fecha, hora):
    h, m = map(int, hora.split(":"))
    fin = f"{(h * 60 + m + 50) // 60:02d}:{(h * 60 + m + 50) % 60:02d}"
    s, r = api("POST", "/api/classes", A, {"classTypeId": tipo, "instructorId": coach,
                                            "startTime": f"{fecha}T{hora}", "endTime": f"{fecha}T{fin}", "maxCapacity": 5})
    assert s == 201, (s, r)
    return r["data"]["id"]

ahora = datetime.now(TZ) + timedelta(minutes=20)
hoy_id = clase(ahora.strftime("%Y-%m-%d"), ahora.strftime("%H:%M"))
lunes = (datetime.now(TZ) + timedelta(days=7 - datetime.now(TZ).weekday())).date()
vacia_id = clase(str(lunes + timedelta(days=1)), "09:00")
semana_id = clase(str(lunes + timedelta(days=2)), "09:00")
for u, c in ((ana, hoy_id), (eva, hoy_id), (bea, semana_id)):
    s, r = api("POST", "/api/admin/bookings/assign", A, {"userId": u["id"], "classId": c})
    assert s < 300, (s, r)

# ── Ayudas del navegador ───────────────────────────────────────────────────
def vigilar(page):
    def on_resp(r):
        if "/api/" in r.url and r.status >= 400 and not any(
                m == r.request.method and frag in r.url and st == r.status for m, frag, st in ESPERADOS):
            fallas.append(f"HTTP {r.status} {r.request.method} {r.url}")
    page.on("response", on_resp)
    page.on("console", lambda msg: msg.type == "error" and fallas.append(f"consola: {msg.text[:160]}"))

def revisar(page, nombre):
    page.wait_for_load_state("networkidle")
    if page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"):
        fallas.append(f"{nombre}: scroll horizontal")
    chicas = page.evaluate("""() => [...document.querySelectorAll('main *')].filter(el =>
        el.offsetParent !== null && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
        parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 40))""")
    if chicas:
        fallas.append(f"{nombre}: texto < 12 px: {chicas[:5]}")
    for mal in ("undefined", "NaN", "Invalid Date"):
        if mal in page.inner_text("main"):
            fallas.append(f"{nombre}: aparece '{mal}'")
    page.screenshot(path=f"{OUT}/{nombre}.png", full_page=True)

with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={"width": 1280, "height": 900}, locale="es-MX", timezone_id="America/Mexico_City")
    page = ctx.new_page()
    vigilar(page)
    page.goto(f"{BASE}/auth/login")
    page.get_by_placeholder("tu@email.com").fill(duena["email"])
    page.get_by_placeholder("••••••••").fill(PWD)
    page.get_by_role("button", name="Entrar").click()
    page.wait_for_url(re.compile(r".*/admin/.*"))

    # 1) Cortesía en mostrador con motivo
    page.goto(f"{BASE}/admin/payments")
    page.get_by_role("combobox", name="Buscar clienta para cobrar").fill("Dana")
    page.get_by_role("option", name=re.compile("Dana Recorrido")).click()
    page.get_by_role("radio", name=re.compile(re.escape(plan_nombre))).click()
    page.get_by_label("Precio cobrado").fill("0")
    confirmar = page.get_by_role("button", name="Confirmar y activar membresía")
    expect(confirmar).to_be_disabled()
    page.get_by_label("Motivo (obligatorio)").fill("Cortesía por evento de apertura")
    revisar(page, "cobrar-1280")
    confirmar.click()
    expect(page.get_by_text("Membresía activada").first).to_be_visible()

    # 2) Ajuste de vigencia con motivo
    page.goto(f"{BASE}/admin/memberships")
    page.get_by_role("button", name="Acciones de la membresía de Dana Recorrido").click()
    page.get_by_role("menuitem", name="Editar vigencia").click()
    page.get_by_label("Fecha de inicio").fill(str(lunes))
    guardar = page.get_by_role("button", name="Guardar vigencia")
    expect(guardar).to_be_disabled()
    page.get_by_label("Motivo del ajuste").fill("Preventa acordada con la clienta")
    guardar.click()
    expect(page.get_by_text("Vigencia actualizada").first).to_be_visible()

    # 3) Pasar lista: falta y corrección el mismo día
    page.goto(f"{BASE}/admin/pasar-lista")
    page.get_by_role("button", name="Marcar falta de Ana Recorrido").click()
    expect(page.get_by_text("podrás corregirla a asistencia hoy mismo", exact=False)).to_be_visible()
    page.get_by_role("button", name="Marcar falta", exact=True).click()
    page.get_by_role("button", name="Corregir a asistencia de Ana Recorrido").click()
    dlg = page.get_by_role("alertdialog")
    expect(dlg.get_by_role("button", name="Corregir a asistencia")).to_be_disabled()
    dlg.get_by_role("textbox").fill("Sí vino, se marcó por error")
    dlg.get_by_role("button", name="Corregir a asistencia").click()
    expect(page.get_by_text("Falta corregida").first).to_be_visible()
    revisar(page, "pasar-lista-1280")

    # 4) Cancelar la reserva de Eva con motivo
    page.goto(f"{BASE}/admin/bookings?clase={hoy_id}")
    page.get_by_role("button", name="Más acciones para Eva Recorrido").click()
    page.get_by_role("menuitem", name="Cancelar reserva (devuelve crédito)").click()
    dlg = page.get_by_role("dialog", name="Cancelar reserva de Eva Recorrido")
    boton = dlg.get_by_role("button", name="Cancelar reserva")
    expect(boton).to_be_disabled()
    dlg.get_by_label("Motivo (obligatorio)").fill("Nos pidió moverla por teléfono")
    boton.click()
    expect(page.get_by_text("Reserva cancelada").first).to_be_visible()

    # 5) Limpiar la semana siguiente: la vacía se borra, la de Bea se cancela y hay que avisarle a mano
    page.goto(f"{BASE}/admin/classes")
    page.get_by_role("button", name="Semana siguiente").click()
    page.get_by_role("button", name="Limpiar semana").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Limpiar semana").click()
    prompt = page.get_by_role("alertdialog", name="Hay reservas activas")
    prompt.get_by_role("textbox").fill("Cierre por vacaciones")
    prompt.get_by_role("button", name="Cancelar esas clases y limpiar").click()
    expect(page.get_by_text("Avisa a mano a estas alumnas")).to_be_visible()
    expect(page.get_by_text("Bea Recorrido")).to_be_visible()
    page.get_by_role("button", name="Listo").click()

    # 6) Dar de baja a Caro
    page.goto(f"{BASE}/admin/clients")
    page.get_by_role("button", name="Acciones de Caro Recorrido").click()
    page.get_by_role("menuitem", name="Eliminar").click()
    dlg = page.get_by_role("alertdialog")
    expect(dlg.get_by_text("Sus reservas, órdenes y pagos se conservan", exact=False)).to_be_visible()
    dlg.get_by_role("textbox").fill("Lo pidió por WhatsApp")
    dlg.get_by_role("button", name="Eliminar clienta").click()
    expect(page.get_by_text("Clienta dada de baja").first).to_be_visible()
    expect(page.get_by_text("Caro Recorrido")).to_have_count(0)

    # 7) Bitácora
    page.goto(f"{BASE}/admin/bitacora")
    lista = page.get_by_role("list", name="Movimientos")
    for texto in ["Cortesía en mostrador ($0)", "Ajuste de membresía", "Falta marcada", "Falta corregida a asistencia",
                  "Reserva cancelada por el estudio", "Limpieza de semana", "Clase cancelada", "Clienta dada de baja (anonimizada)"]:
        expect(lista.get_by_text(texto, exact=True).first).to_be_visible()
    revisar(page, "bitacora-1280")
    page.get_by_label("Qué").select_option("class")
    expect(lista.get_by_text("Clase cancelada").first).to_be_visible()
    expect(lista.get_by_text("Ajuste de membresía")).to_have_count(0)
    ctx.storage_state(path=f"{OUT}/sesion.json")
    ctx.close()

    # 8) Celular 390 px
    movil = nav.new_context(viewport={"width": 390, "height": 844}, storage_state=f"{OUT}/sesion.json",
                            locale="es-MX", timezone_id="America/Mexico_City")
    mp = movil.new_page()
    vigilar(mp)
    for ruta, nombre in [("/admin/bitacora", "bitacora-390"), ("/admin/pasar-lista", "pasar-lista-390"), ("/admin/payments", "cobrar-390")]:
        mp.goto(BASE + ruta)
        revisar(mp, nombre)
    movil.close()

    # 9) Recepción: sin Bitácora en el menú, la ruta la saca y el API da 403
    tok = api("POST", "/api/auth/login", body={"email": recep["email"], "password": PWD})[1]["token"]
    if api("GET", "/api/admin/audit", tok)[0] != 403:
        fallas.append("recepción puede leer /api/admin/audit")
    rctx = nav.new_context(viewport={"width": 1280, "height": 900})
    rp = rctx.new_page()
    rp.goto(f"{BASE}/auth/login")
    rp.evaluate("t => localStorage.setItem('auth_token', t)", tok)
    rp.goto(f"{BASE}/admin/dashboard")
    rp.wait_for_load_state("networkidle")
    if rp.get_by_role("link", name="Bitácora").count():
        fallas.append("recepción ve Bitácora en el menú")
    rp.goto(f"{BASE}/admin/bitacora")
    rp.wait_for_url(re.compile(r".*/app.*"))
    rctx.close()
    nav.close()

# ── Comprobaciones en la base ───────────────────────────────────────────────
if psql(f"SELECT activated_by = '{duena['id']}' AND payment_reference IS NOT NULL FROM memberships WHERE user_id = '{dana['id']}' ORDER BY created_at DESC LIMIT 1") != "t":
    fallas.append("la venta de Dana no tiene activated_by o payment_reference")
acciones = set(psql("SELECT DISTINCT action FROM audit_log").split("\n"))
faltan = {"membership.sale", "membership.adjust", "booking.no_show", "booking.no_show_corrected",
          "booking.cancel", "class.cancel", "class.week_clear", "user.anonymize"} - acciones
if faltan:
    fallas.append(f"acciones sin bitácora: {sorted(faltan)}")
if psql(f"SELECT COUNT(*) FROM classes WHERE id = '{vacia_id}'") != "0":
    fallas.append("la clase vacía no se borró")
if psql(f"SELECT status FROM classes WHERE id = '{semana_id}'") != "cancelled":
    fallas.append("la clase con reserva no quedó cancelada")
if psql(f"SELECT status FROM bookings WHERE class_id = '{semana_id}' AND user_id = '{bea['id']}'") != "cancelled":
    fallas.append("la reserva de Bea no se conservó como cancelada")
if psql(f"SELECT display_name || '|' || is_active FROM users WHERE id = '{caro['id']}'") != "Clienta dada de baja|false":
    fallas.append("Caro no quedó anonimizada")
if psql(f"SELECT status FROM bookings WHERE class_id = '{hoy_id}' AND user_id = '{ana['id']}'") != "checked_in":
    fallas.append("la falta de Ana no quedó corregida")

print("\n".join(fallas) if fallas else "Recorrido sin fallas")
sys.exit(1 if fallas else 0)
```

- [ ] **Step 6: Reporte.**
  - Salidas de suites, tsc, build y regresión.
  - Salida del recorrido con las capturas de `.superpowers/sdd/auditoria-b2/verificacion/`.
  - Cualquier falla, con su prueba en rojo y su arreglo.
  - Desmontaje confirmado: puertos 5581, 8181, 5582 y 8182 libres, y directorios temporales borrados.
