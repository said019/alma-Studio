# Auditoría de producción, Bloque 3 — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- La cuota de cancelaciones es configurable y está publicada en una sola política.
- La lista de espera sube sola, por orden de llegada, hasta 2 h antes.
- La dueña ve y concilia Wellhub, y el check-in por webhook cuenta como asistencia.
- La dueña registra reembolsos y los reportes los restan.
- Aviso de privacidad integral, con consentimiento expreso para los datos de salud.
- Los legales y la responsiva quedan en HIVE.
- Un plan con historial se archiva en lugar de borrarse.

Todo sin cambiar datos existentes.

**Architecture:**
- **Lógica pura en módulos nuevos**, cada uno con pruebas `node:test`:
  - `server/lib/cancellationPolicy.js`, `server/lib/waitlist.js`, `server/lib/refunds.js`, `server/lib/privacy.js`, `server/lib/responsiva.js` y `server/lib/wellhub/reconcile.js`.
  - Ampliaciones de `server/lib/audit.js`, `server/lib/membershipAdmin.js` y `server/lib/wellhub/flows.js`.
- **Rutas:**
  - Se editan en `server/index.js` por región (tabla abajo). El esquema nuevo lo agrega sólo la Tarea 1.
  - La Tarea 1 deja un gancho vacío, `onSeatReleased(classIds, ctx)`: lo llaman las tareas que liberan lugar y la Tarea 4 le pone el cuerpo (la subida de la fila).
- **Textos compartidos:**
  - `src/lib/booking-policy.ts`: una sola política de cancelación para la app, los legales y el panel.
  - `src/lib/audit-log.ts`: etiquetas de la bitácora.
- **Rutas probadas con base desechable** en `server/tests/`. La punta a punta entre tareas está en la Tarea 10.

**Tech Stack:** Node 20 ESM + Express + pg (`server/index.js`), node:test; React 18 + react-query 5 + zustand + vitest.

**Spec:** `docs/superpowers/specs/2026-09-28-auditoria-bloque3-design.md`

## Global Constraints

- **Base:**
  - Rama `hive-auditoria-b3`, creada por el controlador desde `hive-auditoria-b2` **con el bloque 2 ya terminado y fusionado**: existen `server/lib/audit.js`, `audit_log`, `server/lib/membershipAdmin.js`, `promptText({ minLength })`, `src/lib/audit-log.ts` y la pantalla Bitácora.
  - Cada tarea trabaja en su propio worktree (lo crea el controlador).
  - Si algo del bloque 2 que este plan cita no existe o se llama distinto, detente y repórtalo; no lo inventes.
- `node_modules` es un enlace compartido: **nunca** `npm install`.
- Nada de push, merge ni producción.
- **Sin migrar datos:**
  - Tablas, columnas e índices nuevos sólo con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE … ADD COLUMN IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` en `ensureSchema()`, y **sólo en la Tarea 1**.
  - Nada de `UPDATE`/`DELETE` de migración.
  - La Tarea 1 **quita** la reconciliación de `cancellations_used` del arranque: deja de cambiar datos.
- **Sin borrados de historial:** ningún flujo nuevo borra reservas, órdenes, pagos, membresías ni reembolsos.
- **Errores:**
  - Una entrada mala da 4xx con mensaje en español, nunca 500.
  - Los errores de base inesperados siguen como 500 "Error interno", sin detalle.
  - Motivo faltante → 400 `{ code: "REASON_REQUIRED", message }` con el texto de `reasonProblem()` del bloque 2.
- **Bitácora:**
  - `recordAudit` dentro de la transacción en ajustes, reembolsos, subidas de la fila, planes y política.
  - `recordAuditBestEffort` en el check-in de Wellhub.
  - Actor sin persona: `systemActor: "system"` (subida) o `"wellhub"`.
- **Gancho `onSeatReleased`:**
  - Se llama **después del COMMIT** y con `await`, para que la respuesta ya refleje la subida y las pruebas sean deterministas.
  - Nunca lanza.
  - Mientras la Tarea 4 no esté fusionada, es una función vacía que devuelve `[]`.
- **Commits:** en español (`fix(hive): …`), terminando con `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- **Pruebas del servidor:**
  - Unitarias: `server/lib/<nombre>.test.js` y `server/lib/wellhub/<nombre>.test.js` (glob de `npm run test:server`).
  - De rutas: `server/tests/<nombre>.test.mjs` (glob de `npm run test:regression`), con los helpers de `server/tests/helpers.mjs`: `api`, `login`, `sql`, `makeClient(prefix, key, {role, waiver})`, `studioFixtures`, `makeClass`, `giveMembership`, `credits`, `liveBookings`, `bookingId`, `ventanaAhora`, `cleanup`, `closeDb`, `day`, `ADMIN`, `API`, `DB`.
- **Base desechable para pruebas de rutas:** el procedimiento de `docs/superpowers/plans/2026-09-24-hive-sistema-visual.md`, Task 13 Step 2, con los puertos de tu tarea (`<PG>`/`<API>`):
  - Agrega a las variables del servidor `API_RATE_LIMIT_USER_MAX=100000` y `WAITLIST_SWEEP_MINUTES=0` (el barrido de la Tarea 4 no debe correr a media prueba).
  - Corre tus archivos de `server/tests` más los del área que se indican en tu tarea, apuntando `API_URL=http://127.0.0.1:<API>` y `DATABASE_URL=postgres://alma:alma@127.0.0.1:<PG>/hive`.
  - Al terminar: `lsof -ti tcp:<API> | xargs kill; pg_ctl -D "$SP/pg" stop -m fast; rm -rf "$SP"`.
- **Comandos:**
  - `npx vitest run <archivo>`.
  - `npm run test:server`.
  - `npx tsc --noEmit -p tsconfig.app.json`: ignora los errores preexistentes de `aliases` en `AdminLayout.tsx` y los de supabase.
  - `VITE_API_URL=/api npx vite build`.
- **Panel:** colores por clases del tema (`text-ink`, `text-ink-muted`, `bg-danger/10`, `border-line`, `bg-accent-soft`, `bg-surface`…); nada de hex (la marca Wellhub de `src/lib/wellhubBrand.ts` ya es excepción permitida); texto de al menos 12 px (`text-[0.75rem]` es el mínimo).
- **App de clientas:** tema oscuro terracota existente; cada archivo de la zona pasa `describeZone` de `src/design/zoneGuard.ts`; `text-ink-muted` para lo secundario; el único texto sobre terracota es `text-accent-foreground`.
- **Legales** (`src/pages/legal/*`): tema claro con los tokens `COLOR` de `@/design/tokens`, como hoy; ningún texto de menos de `0.75rem`.
- **Textos de la interfaz en español**, tal como los fija este plan.
- No revertir la marca HIVE. **Nunca** mencionar Google Drive en textos que ve una clienta ("archivos del estudio" o "almacenamiento de archivos").

## Review Focus

1. **Concurrencia de la subida.**
   - **Fallas a vigilar:**
     - dos liberaciones simultáneas suben dos veces a la misma;
     - las dos suben a alguien y se pasa del cupo;
     - una reserva nueva gana el lugar mientras corre la subida.
   - Cada subida es su propia transacción con `SELECT … FOR UPDATE OF c` de la clase, y nunca guarda dos membresías.
   - **Pruebas:** en Task 4, "dos liberaciones a la vez con dos en fila suben a las dos, una vez cada una", "con una sola en fila sube una vez y queda un lugar libre" y "cancelación y reserva nueva a la vez: sube la de la fila y la nueva queda detrás".
2. **"Nadie se la salta" sin desperdiciar el lugar.**
   - Con fila, la reserva nueva entra a la fila; pero si las de adelante no tienen clases, debe subir la nueva y la saltada seguir en la fila.
   - Dentro de 2 h la fila ya no bloquea y el lugar queda libre.
   - **Pruebas:** en Task 4, "nadie se salta la fila", "si las de adelante no pueden, sube la nueva" y "a menos de 2 horas no sube nadie y recepción asigna directo".
3. **Contador de cancelaciones.**
   - Salir de la fila no consulta ni suma la cuota, ni registra falta.
   - El arranque ya no pisa el ajuste.
   - Guardar la ficha sin cambios no pide motivo por `cancellationsUsed`; cambiarlo sí.
   - **Pruebas:** Task 3 ("salir de la lista de espera con la cuota agotada", "guardar sin cambios", "ajuste con motivo") y Task 1 ("el arranque ya no recalcula cancellations_used").
4. **Reembolsos.**
   - No devolver más de lo cobrado ni dos totales, tampoco en paralelo.
   - El total cancela la membresía y sus reservas futuras.
   - Los reportes, `/api/payments` y el dashboard restan una vez, en la fecha del reembolso.
   - **Pruebas:** en Task 7, "dos totales a la vez: uno pasa y el otro 409", "parcial por más de lo que queda" y "los reportes restan el reembolso en su fecha".
5. **Consentimiento de salud.**
   - Una clienta existente que escribe notas de salud sin la casilla no guarda nada.
   - Editar su teléfono sin la casilla sí se guarda.
   - El personal no queda bloqueado.
   - **Pruebas:** en Task 8, "notas de salud nuevas sin casilla → 400 y no cambia nada", "editar otros datos no pide la casilla" y "el personal no queda bloqueado".

---

## Ejecución en paralelo

| Ola | Tareas | Nota |
|---|---|---|
| 1 | 1 · 2 | T1: esquema, bitácora ampliada, gancho vacío y textos compartidos (`booking-policy.ts`, `audit-log.ts`). T2: marca HIVE en Términos, `LegalLayout`, `studio.ts`, responsiva y pase. Sin archivos en común |
| 2 | 3 · 4 · 5 · 6 · 7 · 8 · 9 | Consumen T1 y T2. Regiones de `server/index.js` disjuntas (tabla). Archivos del panel y de la app disjuntos (tabla). T5 sólo toca la app y consume por contrato las API de T3 y T4 (en vitest se simulan) |
| 3 | 10 | Verificación, con la prueba de integración entre tareas |

**Regiones de `server/index.js`:** números de línea en d1a974c, como referencia; el bloque 2 los movió, así que ancla siempre por contenido. Entre dos regiones de la misma ola siempre quedan líneas sin tocar.

| Tarea | Imports | Regiones (ancla por contenido · línea en d1a974c) |
|---|---|---|
| 1 | — | quitar el bloque `// ── Reconcile cancellations_used with actual cancelled bookings` (L1292–1303) · fin de `ensureSchema()` justo antes de `console.log("✅ Schema ensured");` (L1869, después de lo que agregó el bloque 2) · función nueva `onSeatReleased` justo después de `async function liveBookingCount(classId, db = pool) {…}` (L3743–3749) |
| 2 | nueva línea tras `import { checkinRule, noShowCorrectionRule } from "./lib/checkin.js";` | `const DEFAULT_POLICIES_SETTINGS = {` (L214–218) · `POST /api/me/waiver` (L3201–3225) · `Content-Disposition` de `GET /api/wallet/apple/pkpass` (L8102) · `const RESPONSIVA_PDF_SECTIONS` y `GET /api/admin/users/:userId/waiver/pdf` (L8595–8665) |
| 3 | nueva línea tras `import { saleAmountPlan, planMembershipAdjust, cleanPaymentReference } from "./lib/membershipAdmin.js";` | `GET /api/memberships/my` y `GET /api/memberships/mine/all` (L3429–3530) · `DELETE /api/bookings/:id` (L3969–4128) · sección Settings: `app.put("/api/settings/:key"` y rutas nuevas justo después (L11862–11876) · `GET /api/memberships` (L13039–13095) · `PUT /api/memberships/:id` (versión del bloque 2, L13364–13420) |
| 4 | nueva línea tras `import { planWeekClear, weekRangeProblem } from "./lib/weekClear.js";` | el cuerpo de `onSeatReleased` (dejado por T1) y helpers junto a él · `GET /api/classes/:id` (L3591–3622) · `GET /api/bookings/my-bookings` (L3627–3658) · `POST /api/bookings`: bloque `const isWaitlist = (await liveBookingCount(` … `await client.query("COMMIT");` (L3868–3883) · `PUT /api/classes/:id/reopen` (L9421–9437) · `DELETE /api/admin/bookings/:id` (versión del bloque 2): su `return res.json({ data: { id: booking.id, credit_restored` · `PUT /api/memberships/:id/cancel` (L13294–13361) · `POST /api/admin/bookings/assign`: `const isWaitlist = (await liveBookingCount(` (L13753), el 409 de acompañante (L13778) y justo después de su `await client.query("COMMIT");` (L13904) · `GET /api/classes/:id/roster` (L14210–14246) · `PUT /api/admin/classes/:id`: su `return res.json({ data: r.rows[0] });` (L15305) · `scheduleEmailCrons()`: después del `setInterval` de `runClassReminderCron` (L16506–16510, `await runClassReminderCron()` en L16507) |
| 5 | — | ninguna (sólo app) |
| 6 | nueva línea tras `import { handleBookingRequested, handleCheckin, handleCancel, handlePlanChange } from "./lib/wellhub/flows.js";` | `wellhubWebhookHandler` (L2152–2202) · rutas `/api/partners/*`: publish, unpublish, checkins, confirm y summary (L2246–2327) |
| 7 | nueva línea tras `import { userAnonymizationValues, buildAnonymizeUpdate, WAIVER_ANON_VALUES, GUEST_ANON_VALUES } from "./lib/anonymize.js";` | `GET /api/reports/overview`, `/revenue-sparkline` y `/revenue` (L11334–11501) · `GET /api/admin/stats` (L12922–12945) · `GET /api/payments` y sección nueva "Reembolsos" antes de `// ─── Discount codes admin CRUD` (L14656–14722) |
| 8 | nueva línea tras `import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";` | `function mapUser(u)` (L3052–3074) · `POST /api/auth/register` (L3079–3151) · `POST /api/auth/onboarding` (L3261–3290) · `PUT /api/users/:id` y ruta nueva justo después (L8669–8720) |
| 9 | — | `DELETE /api/plans/:id` (L13513–13559) |

Si al rebasar aparece un conflicto en el bloque de imports, son líneas aditivas: conserva ambas.

**Otros archivos del servidor:**

| Tarea | Archivos |
|---|---|
| 1 | `server/lib/audit.js`, `server/lib/audit.test.js`, `server/tests/esquema-bloque3.test.mjs` |
| 2 | `server/lib/responsiva.js`, `server/lib/responsiva.test.js`, `server/tests/marca-legales.test.mjs` |
| 3 | `server/lib/cancellationPolicy.js` (+test), `server/lib/membershipAdmin.js`, `server/lib/membershipAdmin.test.js`, `server/tests/cuota-cancelaciones.test.mjs` |
| 4 | `server/lib/waitlist.js` (+test), `server/tests/lista-espera.test.mjs` |
| 6 | `server/lib/wellhub/flows.js`, `server/lib/wellhub/reconcile.js` (+test), `server/tests/wellhub-checkin.test.mjs` |
| 7 | `server/lib/refunds.js` (+test), `server/tests/reembolsos.test.mjs` |
| 8 | `server/lib/privacy.js` (+test), `server/tests/privacidad-consentimiento.test.mjs` |
| 9 | `server/tests/planes-archivar.test.mjs` |
| 10 | `server/tests/integracion-bloque3.test.mjs` |

**Panel y app por tarea** (ninguna ola tiene dos tareas en el mismo archivo):

| Tarea | Archivos |
|---|---|
| 1 | `src/lib/audit-log.ts`, `src/lib/audit-log.test.ts`, `src/lib/booking-policy.ts`, `src/lib/booking-policy.test.ts` |
| 2 | `src/lib/studio.ts`, `src/lib/studio.test.ts`, `src/pages/legal/LegalLayout.tsx`, `src/pages/legal/Terminos.tsx`, `src/pages/legal/Terminos.test.tsx`, `src/components/app/responsivaContent.ts`, `src/components/app/responsivaContent.test.ts`, `src/components/app/ResponsivaDialog.tsx`, `src/components/app/ResponsivaDialog.test.tsx`, `src/pages/client/Responsiva.tsx`, `src/pages/client/Responsiva.dark.test.ts`, `src/pages/client/Wallet.tsx`, `src/pages/client/Wallet.dark.test.ts`, `src/design/app-zone.test.ts` |
| 3 | `src/pages/admin/settings/SettingsPage.tsx`, `src/pages/admin/settings/SettingsPage.politicas.test.tsx`, `src/pages/admin/clients/ClientDetail.tsx`, `src/pages/admin/clients/ClientDetail.test.tsx` |
| 4 | `src/pages/admin/bookings/Waitlist.tsx`, `src/pages/admin/bookings/Waitlist.test.tsx`, `src/pages/admin/bookings/BookingsList.tsx`, `src/pages/admin/bookings/BookingsList.subida.test.tsx` |
| 5 | `src/pages/client/BookClassConfirm.tsx`, `src/pages/client/BookClassConfirm.test.tsx`, `src/pages/client/MyBookings.tsx`, `src/pages/client/MyBookings.cancelar.test.tsx`, `src/pages/client/BookClasses.tsx`, `src/pages/client/BookClasses.fila.test.tsx`, `src/pages/legal/Cancelacion.tsx`, `src/pages/legal/Cancelacion.test.tsx` |
| 6 | `src/config/features.ts`, `src/components/admin/AdminLayout.tsx`, `src/components/admin/AdminLayout.wellhub.test.tsx`, `src/test/paridad-velan.test.ts`, `src/pages/admin/settings/PartnerPlatforms.tsx`, `src/pages/admin/bookings/PartnerCheckins.tsx`, `src/pages/admin/bookings/PartnerCheckins.test.tsx`, `src/pages/admin/classes/ClassesCalendar.tsx`, `src/pages/admin/classes/ClassesCalendar.test.tsx` |
| 7 | `src/pages/admin/payments/PaymentsHistory.tsx`, `src/pages/admin/payments/PaymentsHistory.test.tsx`, `src/pages/admin/payments/RefundDialog.tsx`, `src/pages/admin/payments/refund-math.ts`, `src/pages/admin/payments/refund-math.test.ts`, `src/pages/admin/payments/payments-summary.ts`, `src/pages/admin/payments/payments-summary.test.ts` |
| 8 | `src/lib/legal/privacy-notice.ts`, `src/lib/legal/privacy-notice.test.ts`, `src/pages/legal/Privacidad.tsx`, `src/pages/legal/Privacidad.test.tsx`, `src/pages/auth/Register.tsx`, `src/pages/auth/Register.consentimiento.test.tsx`, `src/pages/auth/Onboarding.tsx`, `src/pages/client/ProfileEdit.tsx`, `src/pages/client/ProfileEdit.consentimiento.test.tsx`, `src/types/auth.ts` |
| 9 | `src/pages/admin/plans/PlansList.tsx`, `src/pages/admin/plans/PlansList.test.tsx` |

**Puertos de base desechable:**

| Tarea | Base / API |
|---|---|
| 1 | 5591 / 8191 |
| 2 | 5592 / 8192 |
| 3 | 5593 / 8193 |
| 4 | 5594 / 8194 |
| 5 | sin base (sólo vitest) |
| 6 | 5595 / 8195 |
| 7 | 5596 / 8196 |
| 8 | 5597 / 8197 |
| 9 | 5598 / 8198 |
| 10 | 5599 / 8199 (regresión) y 5600 / 8200 (navegador) |

---


### Task 1: Cimientos — esquema, bitácora ampliada, gancho de lugar liberado y textos compartidos

**Files:**
- Modify: `server/lib/audit.js`, `server/lib/audit.test.js` (bloque 2).
- Modify: `server/index.js`:
  - Quitar la reconciliación de `cancellations_used` del arranque.
  - Fin de `ensureSchema()`.
  - Función `onSeatReleased` tras `liveBookingCount`.
- Create: `server/tests/esquema-bloque3.test.mjs`.
- Modify: `src/lib/audit-log.ts`, `src/lib/audit-log.test.ts` (bloque 2).
- Create: `src/lib/booking-policy.ts`, `src/lib/booking-policy.test.ts`.

**Interfaces:**
- Consumes: bloque 2 (`recordAudit`, `AUDIT_ACTIONS`, `AUDIT_ENTITY_TYPES`, `src/lib/audit-log.ts`).
- Produces:

```js
// server/lib/audit.js (además de lo del bloque 2)
export const SYSTEM_ACTORS; // { system: "Sistema", wellhub: "Wellhub" }
// AUDIT_ACTIONS gana: "booking.waitlist_promoted" | "order.refund" | "plan.archive" | "plan.delete" | "settings.update"
// AUDIT_ENTITY_TYPES gana: "order" | "plan" | "settings"
recordAudit(db, { ...como en el bloque 2, systemActor?: "system" | "wellhub" })
// con systemActor: actor_id NULL, actor_name "Sistema"/"Wellhub", meta.actor = systemActor

// server/index.js (interno; la Tarea 4 le pone el cuerpo)
async function onSeatReleased(classIds, ctx = {}) // → Promise<Promotion[]>; hoy devuelve []
// ctx: { source?: string, quietUserIds?: string[] }
// Promotion: { booking_id, user_id, display_name, phone, whatsapp, email }
```

```ts
// src/lib/booking-policy.ts
export type BookingPolicy = { cancellationLimit: number; cancelWindowHours: number; bookingLeadHours: number; waitlistCutoffHours: number; faltasEnabled: boolean; faltasThreshold: number };
export const DEFAULT_BOOKING_POLICY: BookingPolicy;
export function normalizeBookingPolicy(raw: unknown): BookingPolicy;
export const horasTexto: (h: number) => string;
export function cancellationRules(p: BookingPolicy): string[];
export function waitlistRule(p: BookingPolicy): string;
export function cancellationsLeftText(left: number | null | undefined, limit: number): string | null;
export function useBookingPolicy(): { policy: BookingPolicy; isLoading: boolean; isError: boolean; refetch: () => unknown };
// contrato de GET /api/public/booking-policy (lo sirve la Tarea 3): { data: BookingPolicy }
```

- **Esquema** (spec §3.1):
  - `bookings.promoted_at` e índice `idx_bookings_class_waitlist`.
  - `orders.refunded_amount/refund_status/refunded_at`.
  - Tabla `refunds` y sus índices.
  - `plans.archived_at/archived_by`.
  - `users.privacy_notice_version/privacy_accepted_at/health_consent_version/health_consent_at`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/audit.test.js`: cambia el import a `import { reasonProblem, cleanReason, changedFields, recordAudit, recordAuditBestEffort, buildAuditQuery, auditRowOut, AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, SYSTEM_ACTORS } from "./audit.js";` y agrega al final:

```js
test("recordAudit con actor de sistema: sin persona, con su nombre y meta.actor", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  await recordAudit(db, {
    systemActor: "system", action: "booking.waitlist_promoted", entityType: "booking",
    entityId: V, subjectUserId: U, before: { status: "waitlist" }, after: { status: "confirmed" }, meta: { position: 1 },
  });
  await recordAudit(db, { systemActor: "wellhub", actorId: U, action: "booking.checkin", entityType: "booking", entityId: V, meta: { method: "wellhub" } });
  assert.equal(calls[0].params[0], null, "sin actor_id");
  assert.equal(calls[0].params[9], "Sistema");
  assert.deepEqual(JSON.parse(calls[0].params[8]), { position: 1, actor: "system" });
  assert.equal(calls[1].params[0], null, "systemActor gana a un actorId");
  assert.equal(calls[1].params[9], "Wellhub");
  assert.match(calls[0].sql, /COALESCE\(\(SELECT display_name FROM users WHERE id = \$1::uuid\), \$10\)/);
  await assert.rejects(recordAudit(db, { systemActor: "robot", action: "booking.checkin", entityType: "booking" }), /desconocido/);
});

test("sin actor de sistema el nombre sale de users, como en el bloque 2", async () => {
  const calls = [];
  const db = { query: async (_s, p) => { calls.push(p); return { rows: [] }; } };
  await recordAudit(db, { actorId: U, action: "membership.adjust", entityType: "membership", meta: { a: 1 } });
  assert.equal(calls[0][0], U);
  assert.equal(calls[0][9], null);
  assert.deepEqual(JSON.parse(calls[0][8]), { a: 1 });
});

test("acciones y entidades del bloque 3", () => {
  for (const a of ["booking.waitlist_promoted", "order.refund", "plan.archive", "plan.delete", "settings.update"]) {
    assert.ok(AUDIT_ACTIONS.includes(a), a);
  }
  for (const t of ["order", "plan", "settings"]) assert.ok(AUDIT_ENTITY_TYPES.includes(t), t);
  assert.deepEqual(SYSTEM_ACTORS, { system: "Sistema", wellhub: "Wellhub" });
  assert.equal(buildAuditQuery({ entityType: "order" }).ok, true, "el filtro de la bitácora acepta las entidades nuevas");
});
```

`server/tests/esquema-bloque3.test.mjs`:

```js
// Tarea 1 · auditoría 2026-09-27, bloque 3. Esquema nuevo (sólo CREATE/ADD
// COLUMN/CREATE INDEX) y el arranque sin la "reconciliación" que pisaba el
// contador de cancelaciones.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { sql, closeDb } from "./helpers.mjs";

const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
const boot = SRC.slice(0, SRC.indexOf("✅ Schema ensured"));

after(async () => { await closeDb(); });

test("columnas nuevas del bloque 3", async () => {
  const esperadas = [
    ["bookings", "promoted_at"],
    ["orders", "refunded_amount"], ["orders", "refund_status"], ["orders", "refunded_at"],
    ["plans", "archived_at"], ["plans", "archived_by"],
    ["users", "privacy_notice_version"], ["users", "privacy_accepted_at"],
    ["users", "health_consent_version"], ["users", "health_consent_at"],
  ];
  const filas = await sql(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[]) AND column_name = ANY($2::text[])`,
    [[...new Set(esperadas.map(([t]) => t))], esperadas.map(([, c]) => c)],
  );
  const hay = new Set(filas.map((f) => `${f.table_name}.${f.column_name}`));
  for (const [t, c] of esperadas) assert.ok(hay.has(`${t}.${c}`), `falta ${t}.${c}`);
  const [def] = await sql(
    `SELECT column_default, is_nullable FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'orders' AND column_name = 'refunded_amount'`,
  );
  assert.equal(def.is_nullable, "NO");
  assert.match(String(def.column_default), /^0/);
});

test("tabla refunds e índices", async () => {
  const [r] = await sql(`SELECT to_regclass('refunds') AS t, to_regclass('idx_refunds_order') AS i1,
                                to_regclass('idx_refunds_created') AS i2, to_regclass('idx_bookings_class_waitlist') AS i3`);
  assert.ok(r.t && r.i1 && r.i2 && r.i3, JSON.stringify(r));
});

test("el arranque ya no recalcula cancellations_used (pisaba los ajustes de recepción)", () => {
  assert.ok(!/SET cancellations_used = sub\.cnt/.test(boot), "la reconciliación sigue en ensureSchema()");
  assert.ok(!/Reconcile cancellations_used/.test(boot));
});

test("el bloque de esquema nuevo no trae UPDATE ni DELETE", () => {
  const i = boot.indexOf("// ── Bloque 3 de la auditoría (2026-09-27)");
  assert.ok(i > 0, "falta el bloque de esquema del bloque 3");
  const bloque = boot.slice(i);
  assert.ok(!/\bUPDATE\b|\bDELETE\b/.test(bloque), "el esquema del bloque 3 no debe cambiar datos");
});

test("existe el gancho onSeatReleased", () => {
  assert.match(SRC, /async function onSeatReleased\(classIds, ctx = \{\}\)/);
});
```

`src/lib/booking-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_BOOKING_POLICY, normalizeBookingPolicy, cancellationRules, waitlistRule, cancellationsLeftText, horasTexto,
} from "./booking-policy";

describe("política de reservas y cancelación", () => {
  it("las tres reglas con la política por defecto (cuota, ventana, pérdida de la clase) y las faltas", () => {
    expect(cancellationRules(DEFAULT_BOOKING_POLICY)).toEqual([
      "Puedes cancelar hasta 2 veces por paquete. Salir de la lista de espera no cuenta.",
      "Si cancelas con 12 horas o más de anticipación, la clase regresa a tu paquete.",
      "Si cancelas con menos de 12 horas, pierdes la clase: no regresa a tu paquete y cuenta como falta.",
      "Al juntar 5 faltas (cancelaciones tardías o inasistencias) se descuentan puntos.",
    ]);
  });

  it("usa la configuración real: sin límite, otra ventana, faltas apagadas, singular", () => {
    const r = cancellationRules({ ...DEFAULT_BOOKING_POLICY, cancellationLimit: 0, cancelWindowHours: 24, faltasEnabled: false });
    expect(r).toEqual([
      "No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.",
      "Si cancelas con 24 horas o más de anticipación, la clase regresa a tu paquete.",
      "Si cancelas con menos de 24 horas, pierdes la clase: no regresa a tu paquete.",
    ]);
    expect(cancellationRules({ ...DEFAULT_BOOKING_POLICY, cancellationLimit: 1 })[0]).toBe(
      "Puedes cancelar hasta 1 vez por paquete. Salir de la lista de espera no cuenta.",
    );
    expect(horasTexto(1)).toBe("1 hora");
  });

  it("la regla de la lista de espera dice el corte y que usa una clase", () => {
    expect(waitlistRule(DEFAULT_BOOKING_POLICY)).toBe(
      "Si la clase está llena entras a la lista de espera, por orden de llegada. Si se libera un lugar hasta 2 horas antes, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.",
    );
  });

  it("te quedan N cancelaciones", () => {
    expect(cancellationsLeftText(2, 2)).toBe("Te quedan 2 cancelaciones de este paquete.");
    expect(cancellationsLeftText(1, 3)).toBe("Te queda 1 cancelación de este paquete.");
    expect(cancellationsLeftText(0, 2)).toBe("Ya usaste tus 2 cancelaciones de este paquete.");
    expect(cancellationsLeftText(0, 1)).toBe("Ya usaste tus 1 cancelación de este paquete.");
    expect(cancellationsLeftText(null, 0)).toBeNull();
    expect(cancellationsLeftText(undefined, 2)).toBeNull();
  });

  it("normaliza lo que llega del servidor y cae a los valores por defecto", () => {
    expect(normalizeBookingPolicy(undefined)).toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ cancellationLimit: "x", cancelWindowHours: -3, faltasThreshold: 0 })).toEqual(DEFAULT_BOOKING_POLICY);
    expect(normalizeBookingPolicy({ cancellationLimit: 0, cancelWindowHours: 24, faltasEnabled: false }).cancellationLimit).toBe(0);
    expect(normalizeBookingPolicy({ cancelWindowHours: 24 }).cancelWindowHours).toBe(24);
    expect(normalizeBookingPolicy({ faltasEnabled: false }).faltasEnabled).toBe(false);
  });
});
```

`src/lib/audit-log.test.ts`: agrega:

```ts
describe("bitácora · textos del bloque 3", () => {
  it("nombra las acciones nuevas", () => {
    expect(actionLabel({ ...base, action: "booking.waitlist_promoted" })).toBe("Subió de la lista de espera");
    expect(actionLabel({ ...base, action: "order.refund", meta: { kind: "total" } })).toBe("Reembolso total");
    expect(actionLabel({ ...base, action: "order.refund", meta: { kind: "partial" } })).toBe("Reembolso parcial");
    expect(actionLabel({ ...base, action: "plan.archive" })).toBe("Plan archivado");
    expect(actionLabel({ ...base, action: "plan.delete" })).toBe("Plan borrado (sin historial)");
    expect(actionLabel({ ...base, action: "settings.update" })).toBe("Política de cancelación cambiada");
    expect(actionLabel({ ...base, action: "booking.checkin", meta: { method: "wellhub" } })).toBe("Check-in (Wellhub)");
  });

  it("antes → después de cancelaciones, reembolsos, planes y política", () => {
    expect(auditChanges({ ...base, before: { cancellations_used: 2 }, after: { cancellations_used: 0 } })).toEqual([
      { key: "cancellations_used", label: "Cancelaciones usadas", before: "2", after: "0" },
    ]);
    expect(auditChanges({ ...base, action: "order.refund", before: { refunded_amount: 0, refund_status: null }, after: { refunded_amount: 500, refund_status: "partially_refunded" } })).toEqual([
      { key: "refunded_amount", label: "Reembolsado", before: "$0", after: "$500" },
      { key: "refund_status", label: "Pago", before: "Sin reembolso", after: "Reembolso parcial" },
    ]);
    expect(auditChanges({ ...base, action: "plan.archive", before: { for_sale: true }, after: { for_sale: false } })).toEqual([
      { key: "for_sale", label: "En venta", before: "Sí", after: "No" },
    ]);
    expect(formatAuditValue("max_cancellations", 0)).toBe("Sin límite");
    expect(formatAuditValue("membership_status", "cancelled")).toBe("Cancelada");
  });

  it("sobre qué: plan y política", () => {
    expect(auditSubject({ ...base, subjectName: null, entityType: "plan", meta: { plan_name: "Paquete 8" } })).toBe("el plan Paquete 8");
    expect(auditSubject({ ...base, subjectName: null, entityType: "settings", meta: {} })).toBe("la política de cancelación");
  });

  it("filtros nuevos", () => {
    expect(AUDIT_ENTITY_OPTIONS.map((o) => o.label)).toEqual(expect.arrayContaining(["Reembolsos", "Planes", "Configuración"]));
  });
});
```

Y cambia su import a `import { actionLabel, auditChanges, auditSubject, formatAuditValue, AUDIT_ENTITY_OPTIONS, type AuditEntry } from "./audit-log";`.

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/audit.test.js` → FAIL (`SYSTEM_ACTORS` no existe).
  - `npx vitest run src/lib/booking-policy.test.ts src/lib/audit-log.test.ts` → FAIL.
  - En tu base (5591/8191), `esquema-bloque3.test.mjs` → FAIL.

- [ ] **Step 3: Implementar.**

**`server/lib/audit.js`:**
- En `AUDIT_ACTIONS`, tras `"user.anonymize",`:

```js
  // Bloque 3 (auditoría 2026-09-27)
  "booking.waitlist_promoted",
  "order.refund",
  "plan.archive",
  "plan.delete",
  "settings.update",
```

- `AUDIT_ENTITY_TYPES` pasa a `Object.freeze(["membership", "booking", "class", "class_week", "user", "order", "plan", "settings"])`.
- Tras `AUDIT_ENTITY_TYPES`:

```js
/** Quien actúa sin ser una persona del equipo (bloque 3): la subida automática
 *  de la lista de espera y los webhooks de Wellhub. */
export const SYSTEM_ACTORS = Object.freeze({ system: "Sistema", wellhub: "Wellhub" });
```

- Reemplaza `recordAudit` completa por:

```js
/**
 * Escribe una fila en audit_log. `db` es el pool o el cliente de la transacción
 * en curso: dentro de una transacción, la bitácora se confirma o se revierte con
 * la acción. Lanza si la acción, la entidad o el actor de sistema no son
 * conocidos, o si la base falla. Con `systemActor` ("system" | "wellhub") no hay
 * persona: actor_id queda NULL y actor_name es "Sistema" o "Wellhub".
 */
export async function recordAudit(db, entry) {
  const {
    actorId = null, action, entityType, entityId = null, subjectUserId = null,
    reason = null, before = null, after = null, meta = {}, systemActor = null,
  } = entry || {};
  if (!AUDIT_ACTIONS.includes(action)) throw new Error(`Acción de bitácora desconocida: ${action}`);
  if (!AUDIT_ENTITY_TYPES.includes(entityType)) throw new Error(`Entidad de bitácora desconocida: ${entityType}`);
  if (systemActor !== null && !Object.hasOwn(SYSTEM_ACTORS, systemActor)) {
    throw new Error(`Actor de sistema desconocido: ${systemActor}`);
  }
  const actor = systemActor ? null : (isUuid(actorId) ? actorId : null);
  const metaOut = systemActor ? { ...(meta ?? {}), actor: systemActor } : (meta ?? {});
  await db.query(
    `INSERT INTO audit_log (actor_id, actor_role, actor_name, action, entity_type, entity_id,
                            subject_user_id, reason, before, after, meta)
     VALUES ($1::uuid,
             (SELECT role::text FROM users WHERE id = $1::uuid),
             COALESCE((SELECT display_name FROM users WHERE id = $1::uuid), $10),
             $2, $3, $4::uuid, $5::uuid, $6, $7::jsonb, $8::jsonb, $9::jsonb)`,
    [
      actor, action, entityType,
      isUuid(entityId) ? entityId : null, isUuid(subjectUserId) ? subjectUserId : null,
      cleanReason(reason), toJson(before), toJson(after), JSON.stringify(metaOut),
      systemActor ? SYSTEM_ACTORS[systemActor] : null,
    ],
  );
}
```

**`server/index.js`:**

1. **Quita** el bloque completo que empieza en `// ── Reconcile cancellations_used with actual cancelled bookings ────────` y termina en el `.catch(() => { });` de ese `UPDATE memberships m SET cancellations_used = sub.cnt …`. En su lugar deja:

```js
    // (Bloque 3, auditoría 2026-09-27, P0-4: aquí corría en cada arranque una
    // "reconciliación" que igualaba cancellations_used al total de reservas
    // canceladas de la membresía. Contaba también las cancelaciones del estudio y
    // las salidas de la lista de espera, y deshacía los ajustes de recepción. El
    // contador lo mueven sólo la cancelación de la clienta y el ajuste con motivo.)
```

2. Al final de `ensureSchema()`, justo antes de `console.log("✅ Schema ensured");` (después de lo que agregó el bloque 2):

```js
    // ── Bloque 3 de la auditoría (2026-09-27): lista de espera, reembolsos,
    // planes archivados y consentimiento de datos de salud. Sólo CREATE / ADD
    // COLUMN / CREATE INDEX: nada de esto cambia datos existentes.
    await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_bookings_class_waitlist
      ON bookings(class_id, created_at, id) WHERE status = 'waitlist'`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ`).catch(() => { });
    // Reembolsos registrados por la dueña. Sin llaves foráneas, como audit_log:
    // el registro sobrevive a la fila que describe.
    await pool.query(`CREATE TABLE IF NOT EXISTS refunds (
      id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      order_id             UUID NOT NULL,
      membership_id        UUID,
      user_id              UUID,
      amount               NUMERIC(10,2) NOT NULL CHECK (amount > 0),
      kind                 VARCHAR(10) NOT NULL CHECK (kind IN ('total', 'partial')),
      method               VARCHAR(20) NOT NULL,
      reference            VARCHAR(100),
      reason               TEXT NOT NULL,
      classes_removed      INTEGER NOT NULL DEFAULT 0,
      membership_cancelled BOOLEAN NOT NULL DEFAULT false,
      bookings_cancelled   INTEGER NOT NULL DEFAULT 0,
      created_by           UUID
    )`).catch((e) => console.warn("[schema] refunds:", e.message));
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_order ON refunds(order_id)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_created ON refunds(created_at DESC)`).catch(() => { });
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_refunds_user ON refunds(user_id, created_at DESC)`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS archived_by UUID`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_version VARCHAR(20)`).catch(() => { });
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS health_consent_at TIMESTAMPTZ`).catch(() => { });
```

3. Justo después de la función `liveBookingCount(classId, db = pool) { … }` (antes de `// Responsiva firmada — helper compartido`):

```js
// Se liberó uno o más lugares (bloque 3, auditoría 2026-09-27, P1-1). Lo llaman,
// DESPUÉS de su COMMIT y con await, todas las vías que liberan cupo:
//   - la clienta que cancela y el estudio que cancela una reserva;
//   - subir el cupo, cancelar una membresía o reembolsarla;
//   - la cancelación por webhook de Wellhub, reabrir una clase;
//   - la reserva nueva que entra a la fila.
// La Tarea 4 del bloque 3 le pone el cuerpo (la subida de la lista de espera).
// Contrato: nunca lanza y devuelve las subidas
// [{ booking_id, user_id, display_name, phone, whatsapp, email }].
// ctx: { source?: string, quietUserIds?: string[] }.
async function onSeatReleased(classIds, ctx = {}) {
  return [];
}
```

**`src/lib/booking-policy.ts`:**

```ts
// Política de reservas y cancelación de HIVE: una sola fuente de texto para
// /legal/cancelacion, el detalle de clase, el diálogo de cancelar y la vista
// previa de Configuración (auditoría 2026-09-27, P0-4 · P1-1). Los números
// vienen de GET /api/public/booking-policy.
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export type BookingPolicy = {
  /** Cancelaciones permitidas por paquete; 0 = sin límite. */
  cancellationLimit: number;
  /** Horas antes del inicio para cancelar sin perder la clase. */
  cancelWindowHours: number;
  /** Horas antes del inicio en que cierran las reservas de la app. */
  bookingLeadHours: number;
  /** Hasta cuántas horas antes del inicio sube sola la lista de espera. */
  waitlistCutoffHours: number;
  faltasEnabled: boolean;
  faltasThreshold: number;
};

export const DEFAULT_BOOKING_POLICY: BookingPolicy = {
  cancellationLimit: 2,
  cancelWindowHours: 12,
  bookingLeadHours: 2,
  waitlistCutoffHours: 2,
  faltasEnabled: true,
  faltasThreshold: 5,
};

const entero = (v: unknown, dflt: number, min: number) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isInteger(n) && n >= min ? n : dflt;
};
const horas = (v: unknown, dflt: number) => {
  const n = typeof v === "number" ? v : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

export function normalizeBookingPolicy(raw: unknown): BookingPolicy {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_BOOKING_POLICY;
  return {
    cancellationLimit: entero(r.cancellationLimit, d.cancellationLimit, 0),
    cancelWindowHours: horas(r.cancelWindowHours, d.cancelWindowHours),
    bookingLeadHours: horas(r.bookingLeadHours, d.bookingLeadHours),
    waitlistCutoffHours: horas(r.waitlistCutoffHours, d.waitlistCutoffHours),
    faltasEnabled: r.faltasEnabled === undefined ? d.faltasEnabled : r.faltasEnabled !== false,
    faltasThreshold: entero(r.faltasThreshold, d.faltasThreshold, 1),
  };
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
export const horasTexto = (h: number) => `${h} ${plural(h, "hora", "horas")}`;

/** Las reglas de cancelación, en el mismo orden y con las mismas palabras en
 *  todas las pantallas: cuota, ventana y pérdida de la clase (y las faltas). */
export function cancellationRules(p: BookingPolicy): string[] {
  const rules = [
    p.cancellationLimit > 0
      ? `Puedes cancelar hasta ${p.cancellationLimit} ${plural(p.cancellationLimit, "vez", "veces")} por paquete. Salir de la lista de espera no cuenta.`
      : "No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.",
    `Si cancelas con ${horasTexto(p.cancelWindowHours)} o más de anticipación, la clase regresa a tu paquete.`,
    `Si cancelas con menos de ${horasTexto(p.cancelWindowHours)}, pierdes la clase: no regresa a tu paquete${p.faltasEnabled ? " y cuenta como falta" : ""}.`,
  ];
  if (p.faltasEnabled) {
    rules.push(`Al juntar ${p.faltasThreshold} faltas (cancelaciones tardías o inasistencias) se descuentan puntos.`);
  }
  return rules;
}

/** La regla de la lista de espera (P1-1). */
export function waitlistRule(p: BookingPolicy): string {
  return `Si la clase está llena entras a la lista de espera, por orden de llegada. Si se libera un lugar hasta ${horasTexto(p.waitlistCutoffHours)} antes, quedas inscrita sola, se usa una clase de tu paquete y te avisamos. Desde ese momento aplican las reglas de cancelación.`;
}

/** "Te quedan N cancelaciones de este paquete." o null si no hay límite. */
export function cancellationsLeftText(left: number | null | undefined, limit: number): string | null {
  if (!limit || left === null || left === undefined) return null;
  if (left <= 0) return `Ya usaste tus ${limit} ${plural(limit, "cancelación", "cancelaciones")} de este paquete.`;
  return `Te ${plural(left, "queda", "quedan")} ${left} ${plural(left, "cancelación", "cancelaciones")} de este paquete.`;
}

/** La política vigente; mientras carga (o si falla) devuelve la de por defecto. */
export function useBookingPolicy() {
  const q = useQuery<{ data?: unknown }>({
    queryKey: ["booking-policy"],
    queryFn: async () => (await api.get("/public/booking-policy")).data,
    staleTime: 5 * 60_000,
  });
  return { policy: normalizeBookingPolicy(q.data?.data), isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}
```

**`src/lib/audit-log.ts`:**
- `AUDIT_ENTITY_OPTIONS`: agrega al final `{ value: "order", label: "Reembolsos" }`, `{ value: "plan", label: "Planes" }` y `{ value: "settings", label: "Configuración" }`.
- `ACTION_LABEL`: agrega:

```ts
  "booking.waitlist_promoted": "Subió de la lista de espera",
  "order.refund": "Reembolso",
  "plan.archive": "Plan archivado",
  "plan.delete": "Plan borrado (sin historial)",
  "settings.update": "Política de cancelación cambiada",
```

- En `actionLabel`, reemplaza la línea de `booking.checkin` por:

```ts
  if (e.action === "booking.checkin") {
    if (m.method === "wellhub") return "Check-in (Wellhub)";
    return m.method === "qr" ? "Check-in (QR)" : "Check-in (lista)";
  }
  if (e.action === "order.refund") return m.kind === "partial" ? "Reembolso parcial" : m.kind === "total" ? "Reembolso total" : "Reembolso";
```

- `FIELD_LABEL`: agrega `cancellations_used: "Cancelaciones usadas"`, `refunded_amount: "Reembolsado"`, `refund_status: "Pago"`, `membership_status: "Membresía"`, `for_sale: "En venta"` y `max_cancellations: "Cancelaciones por paquete"`.
- `MONEY` pasa a `new Set(["amount", "list_price", "refunded_amount"])`.
- Tras `METHOD_LABEL`:

```ts
const REFUND_LABEL: Record<string, string> = { refunded: "Reembolsado", partially_refunded: "Reembolso parcial" };
```

- En `formatAuditValue`, justo después de la línea de `classes_remaining`:

```ts
  if (key === "refund_status") return REFUND_LABEL[String(v)] ?? "Sin reembolso";
  if (key === "for_sale") return v ? "Sí" : "No";
```

  y después de la línea de `status`:

```ts
  if (key === "membership_status") return STATUS_LABEL[String(v)] ?? String(v);
  if (key === "max_cancellations") return Number(v) === 0 ? "Sin límite" : String(v);
```

- En `auditSubject`, antes del `return null;` final:

```ts
  if (e.entityType === "plan") return m.plan_name ? `el plan ${String(m.plan_name)}` : "un plan";
  if (e.entityType === "settings") return "la política de cancelación";
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/lib src/pages/admin/audit` → PASS.
  - En tu base (5591/8191): `esquema-bloque3.test.mjs`, `bitacora.test.mjs`, `deploy.test.mjs`, `instalacion.test.mjs` y `creditos.test.mjs` → PASS.
  - tsc limpio (salvo preexistentes).

- [ ] **Step 5: Commit**

```bash
git add server/lib/audit.js server/lib/audit.test.js server/index.js server/tests/esquema-bloque3.test.mjs src/lib/audit-log.ts src/lib/audit-log.test.ts src/lib/booking-policy.ts src/lib/booking-policy.test.ts
git commit -m "fix(hive): esquema del bloque 3, actor de sistema en la bitácora, gancho de lugar liberado y política de cancelación compartida; el arranque ya no pisa el contador de cancelaciones"
```

---


### Task 2: Marca HIVE en Términos, `LegalLayout`, la responsiva y el pase (punto 7)

**Files:**
- Create: `server/lib/responsiva.js`, `server/lib/responsiva.test.js`, `server/tests/marca-legales.test.mjs`.
- Modify: `server/index.js`:
  - Import tras `import { checkinRule, noShowCorrectionRule } from "./lib/checkin.js";`.
  - `DEFAULT_POLICIES_SETTINGS`.
  - `POST /api/me/waiver`.
  - `Content-Disposition` del pkpass.
  - `RESPONSIVA_PDF_SECTIONS` y `GET /api/admin/users/:userId/waiver/pdf`.
- Modify: `src/lib/studio.ts`, `src/lib/studio.test.ts`, `src/pages/legal/LegalLayout.tsx`, `src/pages/legal/Terminos.tsx`.
- Create: `src/pages/legal/Terminos.test.tsx`, `src/components/app/responsivaContent.test.ts`.
- Modify:
  - `src/components/app/responsivaContent.ts`, `src/components/app/ResponsivaDialog.tsx`, `src/components/app/ResponsivaDialog.test.tsx`.
  - `src/pages/client/Responsiva.tsx`, `src/pages/client/Responsiva.dark.test.ts`.
  - `src/pages/client/Wallet.tsx`, `src/pages/client/Wallet.dark.test.ts`.
  - `src/design/app-zone.test.ts`.

**Interfaces:**
- Consumes: nada de otras tareas del bloque 3.
- Produces:

```js
// server/lib/responsiva.js
export const RESPONSIVA_VERSIONS;           // ["v1", "v2"]
export const CURRENT_RESPONSIVA_VERSION;    // "v2"
export const RESPONSIVA_DOCUMENTS;          // { v1: { studio, title, sections }, v2: {…} }
export function responsivaDocument(version) // documento; vacía o desconocida → v1
export function waiverVersionProblem(v)     // null | "Versión de responsiva desconocida."
```

```ts
// src/components/app/responsivaContent.ts
export type ResponsivaVersion = "v1" | "v2";
export const RESPONSIVA_DOCUMENTS: Record<ResponsivaVersion, { title: string; sections: readonly { n: string; title: string; body: string }[] }>;
export const RESPONSIVA_VERSION: ResponsivaVersion; // "v2"
export function responsivaDocument(version?: string | null); // vacía o desconocida → v1
export const RESPONSIVA_TITLE, RESPONSIVA_SECTIONS;          // los de la vigente
// src/lib/studio.ts
STUDIO.privacyEmail: string | null  // null: pendiente del dueño
// src/pages/legal/LegalLayout.tsx: mismas exportaciones que hoy; LegalContact ya
// no trae el correo de Alma, muestra STUDIO.privacyEmail si existe y el horario.
```

- **API:** `POST /api/me/waiver` acepta `waiver_version` (`"v1"` | `"v2"`; sin él, `"v2"`); una versión desconocida → 400.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/responsiva.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RESPONSIVA_DOCUMENTS, RESPONSIVA_VERSIONS, CURRENT_RESPONSIVA_VERSION, responsivaDocument, waiverVersionProblem,
} from "./responsiva.js";

test("la vigente es la v2 de HIVE; la v1 de Alma se conserva tal como se firmó", () => {
  assert.equal(CURRENT_RESPONSIVA_VERSION, "v2");
  assert.deepEqual(RESPONSIVA_VERSIONS, ["v1", "v2"]);
  assert.equal(RESPONSIVA_DOCUMENTS.v2.studio, "HIVE Pilates Studio");
  assert.ok(!JSON.stringify(RESPONSIVA_DOCUMENTS.v2).includes("Alma"));
  assert.equal(RESPONSIVA_DOCUMENTS.v1.studio, "Alma Movement");
  assert.match(RESPONSIVA_DOCUMENTS.v1.sections[0].body, /^Participo de forma voluntaria en las clases, entrenamientos y actividades de Alma Movement \(Pilates Reformer, Tower, Mat, Barre y Sculpt\)/);
  assert.equal(RESPONSIVA_DOCUMENTS.v2.sections.length, 5);
});

test("una versión vacía o desconocida se lee como v1 (las firmas de antes del versionado)", () => {
  assert.equal(responsivaDocument(null), RESPONSIVA_DOCUMENTS.v1);
  assert.equal(responsivaDocument("v9"), RESPONSIVA_DOCUMENTS.v1);
  assert.equal(responsivaDocument("v2"), RESPONSIVA_DOCUMENTS.v2);
});

test("versión que se acepta al firmar", () => {
  assert.equal(waiverVersionProblem(undefined), null);
  assert.equal(waiverVersionProblem(null), null);
  assert.equal(waiverVersionProblem("v1"), null);
  assert.equal(waiverVersionProblem("v2"), null);
  for (const bad of ["v9", "", 2, "V2"]) assert.equal(waiverVersionProblem(bad), "Versión de responsiva desconocida.", String(bad));
});
```

`server/tests/marca-legales.test.mjs`:

```js
// Tarea 2 · auditoría 2026-09-27, bloque 3 (punto 7). La responsiva vigente es
// la v2 (HIVE); las v1 ya firmadas siguen valiendo y no se tocan; el pase se
// descarga como HIVE y los textos legales por defecto ya no dicen Alma.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { api, API, login, sql, makeClient, studioFixtures, makeClass, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgmarca";
const SRC = fs.readFileSync(path.join(import.meta.dirname, "..", "index.js"), "utf8");
let A, f;

// Firma PNG mínima que pasa signatureProblem() (misma receta que helpers.mjs).
const firma = () => {
  const b = Buffer.alloc(33 + 2000);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(600, 16); b.writeUInt32BE(200, 20);
  return `data:image/png;base64,${b.toString("base64")}`;
};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

test("firmar hoy guarda la versión vigente v2, la mande la app o no", async () => {
  const a = await makeClient(PFX, "conver", { waiver: false });
  const r1 = await api("POST", "/api/me/waiver", { token: a.token, body: { full_name: "QA conver", signature_data: firma(), waiver_version: "v2" } });
  assert.equal(r1.status, 201, JSON.stringify(r1.body).slice(0, 200));
  assert.equal(r1.body.data.waiver_version, "v2");
  const b = await makeClient(PFX, "sinver", { waiver: false });
  const r2 = await api("POST", "/api/me/waiver", { token: b.token, body: { full_name: "QA sinver", signature_data: firma() } });
  assert.equal(r2.status, 201);
  assert.equal(r2.body.data.waiver_version, "v2");
});

test("una versión desconocida → 400 y no guarda nada", async () => {
  const c = await makeClient(PFX, "malver", { waiver: false });
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "QA malver", signature_data: firma(), waiver_version: "v9" } });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "Versión de responsiva desconocida.");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM waivers WHERE user_id=$1`, [c.id]))[0].n, 0);
});

test("una responsiva v1 ya firmada sigue valiendo: reserva sin firmar otra vez, no se toca y su PDF sale", async () => {
  const c = await makeClient(PFX, "vieja", { waiver: false });
  await sql(
    `INSERT INTO waivers (user_id, full_name, signature_data, waiver_version, signed_at)
     VALUES ($1, 'QA vieja', $2, 'v1', NOW() - INTERVAL '30 days')`, [c.id, firma()]);
  await giveMembership(A, c.id, f.plan.id, 8);
  const classId = await makeClass(A, f, { date: day(7) });
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.equal(r.status, 201, `no se le debe pedir firmar otra vez: ${JSON.stringify(r.body).slice(0, 150)}`);
  const [w] = await sql(`SELECT waiver_version FROM waivers WHERE user_id=$1`, [c.id]);
  assert.equal(w.waiver_version, "v1");
  const pdf = await fetch(`${API}/api/admin/users/${c.id}/waiver/pdf`, { headers: { Authorization: `Bearer ${A}` } });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get("content-type") ?? "", /application\/pdf/);
});

test("volver a firmar deja la versión vigente", async () => {
  const c = await makeClient(PFX, "refirma", { waiver: false });
  await sql(`INSERT INTO waivers (user_id, full_name, signature_data, waiver_version) VALUES ($1, 'QA refirma', $2, 'v1')`, [c.id, firma()]);
  const r = await api("POST", "/api/me/waiver", { token: c.token, body: { full_name: "QA refirma", signature_data: firma(), waiver_version: "v2" } });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.waiver_version, "v2");
});

test("el pase se descarga como hive-pass.pkpass y los textos legales por defecto ya no dicen Alma", () => {
  assert.match(SRC, /filename="hive-pass\.pkpass"/);
  assert.ok(!/alma-pass\.pkpass/.test(SRC));
  const inicio = SRC.indexOf("const DEFAULT_POLICIES_SETTINGS");
  const defaults = SRC.slice(inicio, SRC.indexOf("};", inicio));
  assert.ok(inicio > 0);
  assert.ok(!/Alma/.test(defaults), "DEFAULT_POLICIES_SETTINGS aún dice Alma");
  assert.match(defaults, /HIVE Pilates Studio/);
});
```

`src/components/app/responsivaContent.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  RESPONSIVA_VERSION, RESPONSIVA_TITLE, RESPONSIVA_SECTIONS, RESPONSIVA_DOCUMENTS, responsivaDocument,
} from "./responsivaContent";
import * as servidor from "../../../server/lib/responsiva.js";

describe("responsiva versionada (auditoría 2026-09-27, punto 7)", () => {
  it("la vigente es la v2 y es de HIVE", () => {
    expect(RESPONSIVA_VERSION).toBe("v2");
    expect(RESPONSIVA_TITLE).toBe("HIVE Pilates Studio — Responsiva y Consentimiento Informado");
    expect(RESPONSIVA_SECTIONS).toBe(RESPONSIVA_DOCUMENTS.v2.sections);
    expect(JSON.stringify(RESPONSIVA_DOCUMENTS.v2)).not.toMatch(/Alma/);
  });

  it("la v1 se conserva tal como se firmó", () => {
    expect(RESPONSIVA_DOCUMENTS.v1.title).toBe("Alma Movement — Responsiva y Consentimiento Informado");
    expect(RESPONSIVA_DOCUMENTS.v1.sections[0].body).toMatch(/^Participo de forma voluntaria en las clases, entrenamientos y actividades de Alma Movement/);
  });

  it("una versión vacía o desconocida se lee como v1", () => {
    expect(responsivaDocument(null)).toBe(RESPONSIVA_DOCUMENTS.v1);
    expect(responsivaDocument("v9")).toBe(RESPONSIVA_DOCUMENTS.v1);
    expect(responsivaDocument("v2")).toBe(RESPONSIVA_DOCUMENTS.v2);
  });

  it("la app y el servidor tienen el mismo texto en cada versión", () => {
    expect(servidor.CURRENT_RESPONSIVA_VERSION).toBe(RESPONSIVA_VERSION);
    for (const v of ["v1", "v2"] as const) {
      const s = servidor.RESPONSIVA_DOCUMENTS[v];
      expect(`${s.studio} — ${s.title}`).toBe(RESPONSIVA_DOCUMENTS[v].title);
      expect(s.sections).toEqual(RESPONSIVA_DOCUMENTS[v].sections);
    }
  });
});
```

`src/components/app/ResponsivaDialog.test.tsx`: agrega al final:

```tsx
describe("ResponsivaDialog: versión del documento (bloque 3)", () => {
  it("muestra la responsiva de HIVE y manda la versión al firmar", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { data: {} } });
    abrir();
    expect(screen.getByText("HIVE Pilates Studio — Responsiva y Consentimiento Informado")).toBeInTheDocument();
    llenarYEnviar();
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/me/waiver", expect.objectContaining({ waiver_version: "v2" })));
  });
});
```

`src/pages/legal/Terminos.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
import Terminos from "./Terminos";

const fuente = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");
const montar = () => render(<MemoryRouter><Terminos /></MemoryRouter>);

describe("Términos y condiciones de HIVE (punto 7)", () => {
  it("son de HIVE en Coyoacán, con su fecha, y remiten a la política de cancelación y al aviso", () => {
    montar();
    expect(screen.getByText(/Última actualización: 28 de septiembre de 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/Cuauhtémoc #68, Del Carmen, Coyoacán/).length).toBeGreaterThan(0);
    const cancelacion = screen.getAllByRole("link", { name: "Política de cancelación" });
    expect(cancelacion.some((a) => a.getAttribute("href") === "/legal/cancelacion")).toBe(true);
    expect(screen.getAllByRole("link", { name: "Aviso de privacidad" }).some((a) => a.getAttribute("href") === "/legal/privacidad")).toBe(true);
    expect(screen.getByText(/Las reservas desde la app cierran 2 horas antes/)).toBeInTheDocument();
  });

  it("el logotipo y el © dicen HIVE; el contacto no trae correo mientras no haya uno", () => {
    montar();
    expect(screen.getByRole("link", { name: "HIVE Pilates Studio" })).toHaveAttribute("href", "/");
    expect(screen.getByText("© 2026 HIVE Pilates Studio")).toBeInTheDocument();
    expect(screen.queryByText(/Email:/)).toBeNull();
    expect(screen.getByText("6 AM a 9 PM", { exact: false })).toBeInTheDocument();
  });

  it("ya no queda nada de Alma en Términos ni en el layout legal", () => {
    for (const f of ["Terminos.tsx", "LegalLayout.tsx"]) {
      expect(fuente(f), f).not.toMatch(/Alma|Juriquilla|Querétaro|Banorte|Estefanía|almamovement/);
      expect(fuente(f), f).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
    }
  });
});
```

`src/lib/studio.test.ts`: agrega:

```ts
  it("sin correo de privacidad todavía: el aviso remite a recepción y no queda el de Alma", () => {
    expect(STUDIO.privacyEmail).toBeNull();
    expect(read("src/pages/legal/LegalLayout.tsx")).not.toMatch(/almamovement|info@/);
  });
```

`src/pages/client/Responsiva.dark.test.ts`: reemplaza la prueba "el subtítulo legal de la responsiva no se toca (lo decide el sub-proyecto A)" por:

```ts
  it("el subtítulo ya no dice Alma y la página muestra la versión firmada (punto 7: HIVE)", () => {
    expect(responsiva).toContain("en la versión que firmaste");
    expect(responsiva).not.toMatch(/Alma/);
    expect(responsiva).toMatch(/responsivaDocument\(waiver\?\.waiver_version\)/);
  });
```

`src/pages/client/Wallet.dark.test.ts`: reemplaza la prueba "el archivo del pase conserva su nombre (lo cambia el sub-proyecto A)" por:

```ts
  it("el pase se descarga como hive-pass.pkpass (es sólo el nombre de descarga; Apple lo pide por /api/wallet/v1/passes)", () => {
    expect(src).toContain('a.download = "hive-pass.pkpass"');
    expect(src).not.toMatch(/alma-pass/);
  });
```

`src/design/app-zone.test.ts`: reemplaza el `it("no quedan textos Alma, salvo los que decide el sub-proyecto A", …)` por:

```ts
  it("no quedan textos Alma, salvo la versión histórica de la responsiva", () => {
    const PERMITIDOS = [/paleta Alma/];
    // responsivaContent.ts conserva la v1 (Alma Movement) tal como se firmó: una
    // responsiva firmada vale con el texto de su versión (auditoría 2026-09-27, punto 7).
    const LEGALES = ["src/components/app/responsivaContent.ts"];
    const malos = ZONA.filter((f) => !LEGALES.includes(f)).flatMap((f) =>
      read(f).split("\n").map((l, i) => [l, i + 1] as const)
        .filter(([l]) => /\bAlma\b/.test(l) && !PERMITIDOS.some((re) => re.test(l)))
        .map(([, n]) => `${f}:${n}`));
    expect(malos).toEqual([]);
  });
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/responsiva.test.js` → FAIL (el módulo no existe).
  - `npx vitest run src/components/app src/pages/legal src/lib/studio.test.ts src/pages/client/Responsiva.dark.test.ts src/pages/client/Wallet.dark.test.ts src/design/app-zone.test.ts` → FAIL.
  - En tu base (5592/8192), `marca-legales.test.mjs` → FAIL.

- [ ] **Step 3: Implementar.**

`server/lib/responsiva.js`:

```js
// Responsiva y consentimiento informado, por versión (auditoría 2026-09-27,
// punto 7). La v1 es la que se firmó con Alma Movement y se conserva tal cual:
// una responsiva firmada vale con el texto de su versión. La v2 es la de HIVE
// Pilates Studio. Debe coincidir con src/components/app/responsivaContent.ts
// (responsivaContent.test.ts lo exige). PENDIENTE: revisión de un abogado.

function documento(studio, disciplinas) {
  return Object.freeze({
    studio,
    title: "Responsiva y Consentimiento Informado",
    sections: Object.freeze([
      {
        n: "1",
        title: "Aceptación de riesgo",
        body: `Participo de forma voluntaria en las clases, entrenamientos y actividades de ${studio} (${disciplinas}), entendiendo que la práctica de ejercicio físico implica riesgos inherentes, incluyendo lesiones musculares, articulares o caídas. Asumo la responsabilidad por cualquier lesión, accidente o daño físico que pudiera ocurrir durante o después de las clases, y libero de toda responsabilidad a ${studio}, sus coaches, personal y representantes por cualquier incidente derivado de mi participación.`,
      },
      {
        n: "2",
        title: "Condición física y lesiones",
        body: `Declaro encontrarme en condiciones físicas adecuadas para realizar actividad física. Es mi responsabilidad informar previamente a las coaches o al personal sobre cualquier lesión, molestia, condición médica, embarazo u otra situación que pueda afectar mi práctica. ${studio} no se hace responsable por lesiones agravadas por falta de comunicación de mi parte.`,
      },
      {
        n: "3",
        title: "Normas del estudio",
        body: "Para la seguridad, higiene y experiencia de todas, acepto: uso obligatorio de calcetines antiderrapantes en todas las clases; llegar 10 minutos antes; respetar el horario de inicio (no se permite el acceso una vez iniciada la clase); mantener el celular en silencio; no ingresar bajo efectos de alcohol o sustancias que alteren el estado físico; y detenerme y avisar de inmediato a la coach en caso de dolor, mareo o malestar.",
      },
      {
        n: "4",
        title: "Uso de imagen",
        body: `Autorizo a ${studio} a utilizar fotografías o videos tomados durante las clases para fines promocionales, redes sociales y material de comunicación, sin derecho a compensación económica. Esta autorización es opcional y la indico abajo.`,
      },
      {
        n: "5",
        title: "Firma de conformidad",
        body: `Declaro haber leído y comprendido completamente este documento. Al firmar, acepto los términos aquí descritos y libero de toda responsabilidad a ${studio} por cualquier lesión o daño derivado de mi participación.`,
      },
    ].map((s) => Object.freeze(s))),
  });
}

export const RESPONSIVA_DOCUMENTS = Object.freeze({
  v1: documento("Alma Movement", "Pilates Reformer, Tower, Mat, Barre y Sculpt"),
  v2: documento("HIVE Pilates Studio", "Pilates en Reformer y las demás clases que ofrece el estudio"),
});
export const RESPONSIVA_VERSIONS = Object.freeze(Object.keys(RESPONSIVA_DOCUMENTS));
export const CURRENT_RESPONSIVA_VERSION = "v2";

/** El texto de una versión. Las firmas de antes del versionado no traen versión: son v1. */
export function responsivaDocument(version) {
  return Object.hasOwn(RESPONSIVA_DOCUMENTS, version ?? "") ? RESPONSIVA_DOCUMENTS[version] : RESPONSIVA_DOCUMENTS.v1;
}

/** null si la versión que manda la app sirve (o no manda ninguna); si no, el 400. */
export function waiverVersionProblem(v) {
  if (v === undefined || v === null) return null;
  return RESPONSIVA_VERSIONS.includes(v) ? null : "Versión de responsiva desconocida.";
}
```

En `server/index.js`:
- **Import**, tras `import { checkinRule, noShowCorrectionRule } from "./lib/checkin.js";`:

```js
import { CURRENT_RESPONSIVA_VERSION, responsivaDocument, waiverVersionProblem } from "./lib/responsiva.js";
```

- **`DEFAULT_POLICIES_SETTINGS`:** reemplaza la constante completa por:

```js
// Textos de respaldo de policies_settings. Desde el bloque 3 las páginas legales
// ya no los muestran: los documentos viven versionados en src/pages/legal. Se
// dejan en HIVE por si algo viejo los lee (auditoría 2026-09-27, punto 7).
const DEFAULT_POLICIES_SETTINGS = {
  cancellation_policy: "La política de cancelación vigente de HIVE Pilates Studio está en /legal/cancelacion.",
  terms_of_service: "Los términos y condiciones vigentes de HIVE Pilates Studio están en /legal/terminos.",
  privacy_policy: "El aviso de privacidad vigente de HIVE Pilates Studio está en /legal/privacidad.",
};
```

- **`POST /api/me/waiver`:** reemplaza la ruta completa por:

```js
// POST: firma la responsiva (nombre + firma dibujada + consentimiento de imagen).
// Guarda la versión del texto que la clienta leyó (auditoría 2026-09-27, punto 7):
// la app manda `waiver_version`; sin él, la vigente. Las ya firmadas no se tocan
// ni se piden de nuevo.
app.post("/api/me/waiver", authMiddleware, async (req, res) => {
  const { full_name, phone, email, image_consent, signature_data, waiver_version } = req.body || {};
  if (!full_name?.trim() || !signature_data) {
    return res.status(400).json({ message: "Nombre y firma son requeridos." });
  }
  const firmaMala = signatureProblem(signature_data);
  if (firmaMala) return res.status(400).json({ message: firmaMala });
  const versionMala = waiverVersionProblem(waiver_version);
  if (versionMala) return res.status(400).json({ message: versionMala });
  const version = waiver_version ?? CURRENT_RESPONSIVA_VERSION;
  try {
    const r = await pool.query(
      `INSERT INTO waivers (user_id, full_name, phone, email, image_consent, signature_data, waiver_version, signed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name=$2, phone=$3, email=$4, image_consent=$5, signature_data=$6, waiver_version=$7, signed_at=NOW()
       RETURNING *`,
      [req.userId, full_name.trim(), phone || null, email || null, !!image_consent, signature_data, version]
    );
    return res.status(201).json({ data: r.rows[0] });
  } catch (err) {
    console.error("POST waiver error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- **pkpass:** en `GET /api/wallet/apple/pkpass`, `attachment; filename="alma-pass.pkpass"` pasa a `attachment; filename="hive-pass.pkpass"`. Es sólo el nombre del archivo que se descarga: Apple y los dispositivos registrados piden el pase por `/api/wallet/v1/passes/…`, que no cambia.
- **PDF de la responsiva:**
  - Borra la constante `RESPONSIVA_PDF_SECTIONS` (su texto vive ahora en `server/lib/responsiva.js`) y deja en su lugar el comentario `// GET /api/admin/users/:userId/waiver/pdf — responsiva firmada como PDF, con el texto de SU versión (bloque 3, punto 7)`.
  - Dentro de la ruta, justo después de `if (!w) return res.status(404)…`, agrega `const documento = responsivaDocument(w.waiver_version);`.
  - `doc.…text("Alma Movement");` pasa a `doc.…text(documento.studio);`.
  - `…text("Responsiva y Consentimiento Informado");` pasa a `…text(documento.title);`.
  - `for (const s of RESPONSIVA_PDF_SECTIONS)` pasa a `for (const s of documento.sections)`.

**`src/components/app/responsivaContent.ts`:** reemplaza el archivo completo por:

```ts
// Responsiva y consentimiento informado, por versión (auditoría 2026-09-27,
// punto 7). La v1 (Alma Movement) se conserva tal como se firmó: una responsiva
// firmada vale con el texto de su versión. La vigente es la v2 (HIVE Pilates
// Studio). Debe coincidir con server/lib/responsiva.js (responsivaContent.test.ts
// lo exige). PENDIENTE: revisión de un abogado.
export type ResponsivaVersion = "v1" | "v2";
export type ResponsivaSection = { n: string; title: string; body: string };
export type ResponsivaDocument = { title: string; sections: readonly ResponsivaSection[] };

function documento(studio: string, disciplinas: string): ResponsivaDocument {
  return {
    title: `${studio} — Responsiva y Consentimiento Informado`,
    sections: [
      {
        n: "1",
        title: "Aceptación de riesgo",
        body: `Participo de forma voluntaria en las clases, entrenamientos y actividades de ${studio} (${disciplinas}), entendiendo que la práctica de ejercicio físico implica riesgos inherentes, incluyendo lesiones musculares, articulares o caídas. Asumo la responsabilidad por cualquier lesión, accidente o daño físico que pudiera ocurrir durante o después de las clases, y libero de toda responsabilidad a ${studio}, sus coaches, personal y representantes por cualquier incidente derivado de mi participación.`,
      },
      {
        n: "2",
        title: "Condición física y lesiones",
        body: `Declaro encontrarme en condiciones físicas adecuadas para realizar actividad física. Es mi responsabilidad informar previamente a las coaches o al personal sobre cualquier lesión, molestia, condición médica, embarazo u otra situación que pueda afectar mi práctica. ${studio} no se hace responsable por lesiones agravadas por falta de comunicación de mi parte.`,
      },
      {
        n: "3",
        title: "Normas del estudio",
        body: "Para la seguridad, higiene y experiencia de todas, acepto: uso obligatorio de calcetines antiderrapantes en todas las clases; llegar 10 minutos antes; respetar el horario de inicio (no se permite el acceso una vez iniciada la clase); mantener el celular en silencio; no ingresar bajo efectos de alcohol o sustancias que alteren el estado físico; y detenerme y avisar de inmediato a la coach en caso de dolor, mareo o malestar.",
      },
      {
        n: "4",
        title: "Uso de imagen",
        body: `Autorizo a ${studio} a utilizar fotografías o videos tomados durante las clases para fines promocionales, redes sociales y material de comunicación, sin derecho a compensación económica. Esta autorización es opcional y la indico abajo.`,
      },
      {
        n: "5",
        title: "Firma de conformidad",
        body: `Declaro haber leído y comprendido completamente este documento. Al firmar, acepto los términos aquí descritos y libero de toda responsabilidad a ${studio} por cualquier lesión o daño derivado de mi participación.`,
      },
    ],
  };
}

export const RESPONSIVA_DOCUMENTS: Record<ResponsivaVersion, ResponsivaDocument> = {
  v1: documento("Alma Movement", "Pilates Reformer, Tower, Mat, Barre y Sculpt"),
  v2: documento("HIVE Pilates Studio", "Pilates en Reformer y las demás clases que ofrece el estudio"),
};

/** La versión que se firma hoy. */
export const RESPONSIVA_VERSION: ResponsivaVersion = "v2";

/** El texto de una versión firmada. Las firmas de antes del versionado no traen versión: son v1. */
export const responsivaDocument = (version?: string | null): ResponsivaDocument =>
  version === "v1" || version === "v2" ? RESPONSIVA_DOCUMENTS[version] : RESPONSIVA_DOCUMENTS.v1;

export const RESPONSIVA_TITLE = RESPONSIVA_DOCUMENTS[RESPONSIVA_VERSION].title;
export const RESPONSIVA_SECTIONS = RESPONSIVA_DOCUMENTS[RESPONSIVA_VERSION].sections;
```

**`src/components/app/ResponsivaDialog.tsx`:**
- El import pasa a `import { RESPONSIVA_TITLE, RESPONSIVA_SECTIONS, RESPONSIVA_VERSION } from "@/components/app/responsivaContent";`.
- En el cuerpo del `api.post("/me/waiver", {…})`, tras `signature_data: signatureData,`, agrega `waiver_version: RESPONSIVA_VERSION,`.

**`src/pages/client/Responsiva.tsx`:**
- El import pasa a `import { responsivaDocument } from "@/components/app/responsivaContent";`.
- En `WaiverRow` agrega `waiver_version?: string | null;`.
- Tras `const waiver = data?.data ?? null;` agrega:

```tsx
  // La responsiva se muestra con el texto de la versión que firmó (punto 7).
  const documento = responsivaDocument(waiver?.waiver_version);
```

- El `subtitle` del `PageHeader` pasa a:

```tsx
          subtitle={waiver
            ? `Tu responsiva y consentimiento informado, en la versión que firmaste (${waiver.waiver_version ?? "v1"}).`
            : "Tu responsiva y consentimiento informado."}
```

- `{RESPONSIVA_TITLE}` pasa a `{documento.title}` y `RESPONSIVA_SECTIONS.map(` pasa a `documento.sections.map(`.

**`src/pages/client/Wallet.tsx`:** `a.download = "alma-pass.pkpass";` pasa a `a.download = "hive-pass.pkpass";`.

**`src/lib/studio.ts`:** en `STUDIO`, tras `phone: null as string | null,`:

```ts
  // Correo para solicitudes de privacidad (derechos ARCO). PENDIENTE: el dueño
  // no ha dado uno; mientras sea null, el aviso remite a recepción.
  privacyEmail: null as string | null,
```

**`src/pages/legal/LegalLayout.tsx`:**
- En el `<nav>` superior, `Alma Movement` pasa a `{STUDIO.name}`.
- En el pie, `© 2026 Alma Movement` pasa a `© 2026 {STUDIO.name}`.
- El párrafo "Legal" pasa de `text-[0.7rem]` a `text-[0.75rem]`.
- Actualiza el comentario de `usePolicyText`: `/** Texto de policies_settings. Desde el bloque 3 las legales ya no lo usan (sus documentos viven versionados en el código); se conserva para no romper importaciones. */`.
- Reemplaza `LegalContact` completo por:

```tsx
/** Datos de contacto del estudio. STUDIO es la única fuente: una fila sin dato
 *  confirmado no se muestra. Mientras no haya correo de privacidad, las
 *  solicitudes se presentan en recepción (auditoría 2026-09-27, P1-10). */
export const LegalContact = () => (
  <ul className="list-none space-y-1 p-0 m-0">
    {STUDIO.privacyEmail && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>Email:</strong>{" "}
        <a href={`mailto:${STUDIO.privacyEmail}`} className="underline underline-offset-2" style={{ color: COLOR.accentStrong }}>
          {STUDIO.privacyEmail}
        </a>
      </li>
    )}
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
    {STUDIO.phone && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>Teléfono:</strong> {STUDIO.phone}
      </li>
    )}
    <li>
      <strong className="font-semibold" style={{ color: COLOR.ink }}>Dirección:</strong> {STUDIO.address}
    </li>
    <li>
      <strong className="font-semibold" style={{ color: COLOR.ink }}>Horario:</strong> {STUDIO.hours}
    </li>
  </ul>
);
```

**`src/pages/legal/Terminos.tsx`:** reemplaza el archivo completo por:

```tsx
import { Link } from "react-router-dom";

import { STUDIO } from "@/lib/studio";
import { COLOR } from "@/design/tokens";
import LegalLayout, { LegalContact, LegalH2, LegalUpdated } from "./LegalLayout";

// Términos y condiciones de HIVE Pilates Studio (auditoría 2026-09-27, punto 7).
// Texto versionado en el código: el de policies_settings ya no se muestra. Las
// reglas de cancelación viven en /legal/cancelacion (una sola política).
// PENDIENTE: revisión de un abogado antes de darlo por definitivo.
export const TERMINOS_ACTUALIZADOS = "28 de septiembre de 2026";

const fuerte = "font-semibold";
const liga = "font-medium underline underline-offset-2";

const Terminos = () => (
  <LegalLayout
    current="/legal/terminos"
    title={
      <>
        Términos y <span className="font-display">condiciones</span>
      </>
    }
  >
    <div className="space-y-6">
      <LegalUpdated>{TERMINOS_ACTUALIZADOS}</LegalUpdated>

      <p>
        Al usar los servicios de <strong className={fuerte} style={{ color: COLOR.ink }}>{STUDIO.name}</strong>, incluidas la app de reservas y las clases presenciales en el estudio, aceptas estos Términos y Condiciones. Te pedimos leerlos con calma.
      </p>

      <LegalH2>1. Definiciones</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Estudio":</strong> {STUDIO.name} y sus instalaciones en {STUDIO.address}.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Alumna":</strong> cualquier persona registrada en la app que toma clases.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Paquete":</strong> el plan de clases que compras en el estudio o en la app, con su número de clases y su vigencia.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Clase":</strong> cada sesión programada en el calendario del estudio.</li>
      </ul>

      <LegalH2>2. Registro y cuenta</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Para reservar necesitas una cuenta con datos verdaderos y al día.</li>
        <li>Cuida tu contraseña: tu cuenta es personal.</li>
        <li>Debes tener 16 años o más para registrarte. Si eres menor de edad, necesitas la autorización de tu madre, padre o tutor.</li>
        <li>El estudio puede suspender una cuenta que incumpla estos términos.</li>
      </ul>

      <LegalH2>3. Paquetes y pagos</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Los precios están en pesos mexicanos (MXN).</li>
        <li>Cada paquete indica al comprarlo su número de clases y su vigencia. Las clases que no uses dentro de la vigencia se pierden.</li>
        <li>Los paquetes son personales: no se transfieren a otra persona.</li>
        <li>Puedes pagar en el estudio (efectivo, transferencia o terminal) o en línea cuando la app lo ofrezca. Los datos para transferir se muestran al pagar.</li>
        <li>Los paquetes no son reembolsables, salvo en los casos que el estudio apruebe. Si el estudio aprueba un reembolso total o parcial, lo registra y ajusta las clases de tu paquete.</li>
      </ul>

      <LegalH2>4. Reservaciones y lista de espera</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Todas las clases se reservan en la app. El cupo de cada clase es el que muestra la app.</li>
        <li>Las reservas desde la app cierran 2 horas antes del inicio de la clase.</li>
        <li>Si la clase está llena puedes entrar a la lista de espera. Si se libera un lugar hasta 2 horas antes, quedas inscrita sola, por orden de llegada, y se usa una clase de tu paquete.</li>
      </ul>

      <LegalH2>5. Cancelaciones e inasistencias</LegalH2>
      <p>
        Cuántas veces puedes cancelar, con cuánta anticipación y qué pasa si cancelas tarde o no llegas está en la{" "}
        <Link to="/legal/cancelacion" className={liga} style={{ color: COLOR.ink }}>Política de cancelación</Link>. Es la misma que ves en la app al reservar y al cancelar.
      </p>

      <LegalH2>6. Puntualidad</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Llega 10 minutos antes de tu clase.</li>
        <li>Una vez iniciada la sesión no se permite el acceso, por seguridad y por respeto al grupo. Esa clase cuenta como usada.</li>
      </ul>

      <LegalH2>7. Salud y responsabilidad</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Antes de tu primera clase firmas en la app la responsiva y consentimiento informado.</li>
        <li>Avísanos de cualquier lesión, condición médica o embarazo antes de tu clase, para cuidarte durante la práctica.</li>
        <li>El estudio no se hace responsable por lesiones derivadas de condiciones de salud que no nos informaste.</li>
        <li>Te recomendamos consultar a tu médico antes de empezar un programa de ejercicio.</li>
        <li>
          Cómo tratamos tus datos de salud está en el{" "}
          <Link to="/legal/privacidad" className={liga} style={{ color: COLOR.ink }}>Aviso de privacidad</Link>.
        </li>
      </ul>

      <LegalH2>8. Vestimenta y objetos personales</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Los <strong className={fuerte} style={{ color: COLOR.ink }}>calcetines antiderrapantes son obligatorios</strong> en todas las clases. Te recomendamos ropa deportiva cómoda.</li>
        <li>Guarda tus pertenencias en el espacio destinado para ello y mantenlas fuera del área de equipo.</li>
        <li>El celular va en silencio durante la clase.</li>
        <li>El estudio no se hace responsable por objetos perdidos o robados.</li>
      </ul>

      <LegalH2>9. Conducta</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Esperamos un trato respetuoso hacia coaches, personal y demás alumnas.</li>
        <li>No toleramos ningún tipo de discriminación, acoso o conducta inapropiada.</li>
        <li>El estudio puede negar el servicio a quien no respete estas reglas.</li>
      </ul>

      <LegalH2>10. Uso de imagen</LegalH2>
      <p>
        Sólo usamos fotos o videos en los que aparezcas, en redes o material promocional, si lo autorizas en tu responsiva. Puedes retirar esa autorización en recepción cuando quieras.
      </p>

      <LegalH2>11. Cambios</LegalH2>
      <p>
        {STUDIO.name} puede cambiar estos términos, sus horarios, precios y políticas. Los cambios se publican en esta página con su fecha y entran en vigor al publicarse.
      </p>

      <LegalH2>12. Contacto</LegalH2>
      <p>Para cualquier duda sobre estos términos:</p>
      <LegalContact />
    </div>
  </LegalLayout>
);

export default Terminos;
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/components/app src/pages/legal src/pages/client src/lib src/design` → PASS.
  - En tu base (5592/8192): `marca-legales.test.mjs` más `responsiva-vias.test.mjs`, `seguridad.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.
  - `grep -rn "Alma" src/pages/legal/Terminos.tsx src/pages/legal/LegalLayout.tsx src/pages/client/Responsiva.tsx` → sin resultados.
  - **Si la rama que quitó Alma de WhatsApp, del pase y de los correos ya cambió el `Content-Disposition` del pkpass**, conserva su texto si ya dice `hive-pass.pkpass`, y dilo en el reporte.

- [ ] **Step 5: Commit**

```bash
git add server/lib/responsiva.js server/lib/responsiva.test.js server/index.js server/tests/marca-legales.test.mjs src/lib/studio.ts src/lib/studio.test.ts src/pages/legal/LegalLayout.tsx src/pages/legal/Terminos.tsx src/pages/legal/Terminos.test.tsx src/components/app/responsivaContent.ts src/components/app/responsivaContent.test.ts src/components/app/ResponsivaDialog.tsx src/components/app/ResponsivaDialog.test.tsx src/pages/client/Responsiva.tsx src/pages/client/Responsiva.dark.test.ts src/pages/client/Wallet.tsx src/pages/client/Wallet.dark.test.ts src/design/app-zone.test.ts
git commit -m "fix(hive): términos, layout legal, responsiva v2 y pase en HIVE; las responsivas v1 firmadas siguen valiendo con su texto"
```

---


### Task 3: Cuota de cancelaciones configurable — servidor y panel (P0-4)

**Files:**
- Create: `server/lib/cancellationPolicy.js`, `server/lib/cancellationPolicy.test.js`, `server/tests/cuota-cancelaciones.test.mjs`.
- Modify: `server/lib/membershipAdmin.js`, `server/lib/membershipAdmin.test.js` (bloque 2).
- Modify: `server/index.js`:
  - Import tras `import { saleAmountPlan, planMembershipAdjust, cleanPaymentReference } from "./lib/membershipAdmin.js";`.
  - `GET /api/memberships/my` y `/mine/all`.
  - `DELETE /api/bookings/:id`.
  - `PUT /api/settings/:key` y rutas nuevas justo después.
  - `GET /api/memberships`.
  - `PUT /api/memberships/:id`.
- Modify: `src/pages/admin/settings/SettingsPage.tsx`, `src/pages/admin/clients/ClientDetail.tsx`, `src/pages/admin/clients/ClientDetail.test.tsx`.
- Create: `src/pages/admin/settings/SettingsPage.politicas.test.tsx`.

**Interfaces:**
- Consumes:
  - Task 1: `onSeatReleased`, `settings.update` en `AUDIT_ACTIONS` y `useBookingPolicy`, `cancellationRules`, `horasTexto` de `src/lib/booking-policy.ts`.
  - Bloque 2: `planMembershipAdjust`, `reasonProblem`, `recordAudit`.
- Produces:

```js
// server/lib/cancellationPolicy.js
export const DEFAULT_CANCELLATION_LIMIT = 2, MAX_CANCELLATION_LIMIT = 20;
export function normalizeCancellationSettings(raw)     // { max_cancellations }
export function cancellationLimitProblem(value)        // null | "Escribe un número entero de 0 a 20."
export function cancellationQuota({ used, limit })     // { limited, used, limit, left: number|null, exhausted }
export function clientCancelDecision({ bookingStatus, used, limit })
//   { ok:false, status, code, message } | { ok:true, leavingWaitlist, countsTowardQuota, freesSeat }
export function publicBookingPolicy({ settings, loyalty, bookingLeadHours }) // BookingPolicy (contrato de Task 1)
// server/index.js (interno, lo usan otras tareas si lo necesitan)
async function getBookingPolicy(db = pool) // BookingPolicy
```

- API:
  - `GET /api/public/booking-policy` → `{ data: BookingPolicy }`, sin sesión.
  - `PUT /api/admin/booking-policy` (sólo dueña): `{ cancellationLimit }` → `{ data: BookingPolicy }`.
  - `PUT /api/settings/cancellation_settings` → 400.
  - `DELETE /api/bookings/:id` → `{ message, creditRestored, leftWaitlist, cancellationsUsed, cancellationLimit, cancellationsLeft, cancelWindowHours }`, o bien 403 `CANCELLATION_LIMIT` / 409 `ATTENDANCE_RECORDED` / 400.
  - `GET /api/memberships/my` y `/mine/all` agregan `cancellationLimit` y `cancellationsLeft`.
  - `GET /api/memberships` agrega `cancellationsUsed` y `cancellationLimit`.
  - `PUT /api/memberships/:id` acepta `cancellationsUsed` (entero de 0 a 1000; cambiarlo pide motivo).

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/cancellationPolicy.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCancellationSettings, cancellationLimitProblem, cancellationQuota, clientCancelDecision, publicBookingPolicy,
} from "./cancellationPolicy.js";

test("la cuota arranca en 2 y 0 es sin límite", () => {
  assert.deepEqual(normalizeCancellationSettings(null), { max_cancellations: 2 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 0 }), { max_cancellations: 0 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 5 }), { max_cancellations: 5 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: "5" }), { max_cancellations: 2 });
  assert.deepEqual(normalizeCancellationSettings({ max_cancellations: 99 }), { max_cancellations: 2 });
});

test("cuota válida: entero de 0 a 20", () => {
  for (const ok of [0, 1, 20, "3"]) assert.equal(cancellationLimitProblem(ok), null, String(ok));
  for (const bad of [-1, 21, 2.5, "x", "", null, undefined]) {
    assert.equal(cancellationLimitProblem(bad), "Escribe un número entero de 0 a 20.", String(bad));
  }
});

test("te quedan N", () => {
  assert.deepEqual(cancellationQuota({ used: 1, limit: 2 }), { limited: true, used: 1, limit: 2, left: 1, exhausted: false });
  assert.deepEqual(cancellationQuota({ used: 2, limit: 2 }), { limited: true, used: 2, limit: 2, left: 0, exhausted: true });
  assert.deepEqual(cancellationQuota({ used: 7, limit: 0 }), { limited: false, used: 7, limit: 0, left: null, exhausted: false });
});

test("decisión al cancelar: fila, confirmada, cuota agotada, asistencia y ya cancelada", () => {
  assert.deepEqual(clientCancelDecision({ bookingStatus: "waitlist", used: 9, limit: 2 }),
    { ok: true, leavingWaitlist: true, countsTowardQuota: false, freesSeat: false });
  assert.deepEqual(clientCancelDecision({ bookingStatus: "confirmed", used: 1, limit: 2 }),
    { ok: true, leavingWaitlist: false, countsTowardQuota: true, freesSeat: true });
  const agotada = clientCancelDecision({ bookingStatus: "confirmed", used: 2, limit: 2 });
  assert.equal(agotada.ok, false);
  assert.equal(agotada.status, 403);
  assert.equal(agotada.code, "CANCELLATION_LIMIT");
  assert.equal(agotada.message, "Ya usaste tus 2 cancelaciones de este paquete. Si necesitas cancelar, habla con recepción.");
  assert.match(clientCancelDecision({ bookingStatus: "confirmed", used: 1, limit: 1 }).message, /tus 1 cancelación de/);
  assert.equal(clientCancelDecision({ bookingStatus: "confirmed", used: 50, limit: 0 }).ok, true, "0 = sin límite");
  for (const s of ["checked_in", "no_show"]) {
    const r = clientCancelDecision({ bookingStatus: s, used: 0, limit: 2 });
    assert.equal(r.status, 409);
    assert.equal(r.code, "ATTENDANCE_RECORDED");
  }
  const ya = clientCancelDecision({ bookingStatus: "cancelled" });
  assert.equal(ya.status, 400);
  assert.equal(ya.message, "Esta reserva ya fue cancelada");
});

test("política pública: cuota, ventana real, cierres y faltas", () => {
  assert.deepEqual(publicBookingPolicy({ settings: null, loyalty: {}, bookingLeadHours: 2 }), {
    cancellationLimit: 2, cancelWindowHours: 12, bookingLeadHours: 2, waitlistCutoffHours: 2, faltasEnabled: true, faltasThreshold: 5,
  });
  const p = publicBookingPolicy({
    settings: { max_cancellations: 0 },
    loyalty: { faltas_cancel_window_hours: 24, faltas_enabled: false, faltas_threshold: 3 },
    bookingLeadHours: 2,
  });
  assert.equal(p.cancellationLimit, 0);
  assert.equal(p.cancelWindowHours, 24);
  assert.equal(p.faltasEnabled, false);
  assert.equal(p.faltasThreshold, 3);
  assert.equal(publicBookingPolicy({ loyalty: { faltas_cancel_window_hours: -5 } }).cancelWindowHours, 12);
});
```

`server/lib/membershipAdmin.test.js`: agrega al final:

```js
test("cancelaciones usadas: cambiarlas pide motivo; el mismo valor no cuenta", () => {
  const b = { ...before, cancellations_used: 2 };
  const r = planMembershipAdjust({ before: b, input: { cancellationsUsed: 0 } });
  assert.equal(r.ok, true);
  assert.equal(r.needsReason, true);
  assert.deepEqual(r.changes, { changed: ["cancellations_used"], before: { cancellations_used: 2 }, after: { cancellations_used: 0 } });
  const igual = planMembershipAdjust({ before: b, input: { cancellationsUsed: "2", status: "active" } });
  assert.deepEqual(igual.changes.changed, []);
  assert.equal(igual.needsReason, false);
  for (const bad of [-1, 1.5, "x", 1001]) {
    const m = planMembershipAdjust({ before: b, input: { cancellationsUsed: bad } });
    assert.equal(m.ok, false, String(bad));
    assert.equal(m.message, "Las cancelaciones usadas deben ser un número entero de 0 en adelante.");
  }
});
```

`server/tests/cuota-cancelaciones.test.mjs`:

```js
// Tarea 3 · auditoría 2026-09-27, bloque 3 (P0-4 · C1 · C8 · C2). La cuota de
// cancelaciones por paquete es configurable (2 por defecto, 0 = sin límite) y
// sólo la cambia la dueña; salir de la lista de espera no la consume; la
// ventana es la configurada; recepción ajusta cancellationsUsed con motivo.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, bookingId, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgcuota";
let A, f, recep, prevCancel, prevLoyalty;

const reservar = async (c, classId) => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return bookingId(r);
};
const cancelar = (c, id) => api("DELETE", `/api/bookings/${id}`, { token: c.token });
const usadas = async (userId) =>
  (await sql(`SELECT cancellations_used FROM memberships WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`, [userId]))[0].cancellations_used;
const ponerCuota = (n) => api("PUT", "/api/admin/booking-policy", { token: A, body: { cancellationLimit: n } });
// Mueve la clase a N horas de ahora, en la zona del estudio (sin cruzar mal el día).
const aHoras = (classId, h) => sql(
  `UPDATE classes SET date = ((NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $2))::date,
                      start_time = ((NOW() AT TIME ZONE 'America/Mexico_City') + make_interval(hours => $2))::time
    WHERE id = $1`, [classId, h]);
const ponerLealtad = (extra) => sql(
  `INSERT INTO settings (key, value) VALUES ('loyalty_config', $1::jsonb)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
  [JSON.stringify({ ...(prevLoyalty?.value ?? {}), ...extra })]);

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  [prevCancel] = await sql(`SELECT value FROM settings WHERE key = 'cancellation_settings'`);
  [prevLoyalty] = await sql(`SELECT value FROM settings WHERE key = 'loyalty_config'`);
  // La suite arranca sin configurar: la cuota debe ser 2.
  await sql(`DELETE FROM settings WHERE key = 'cancellation_settings'`);
});
after(async () => {
  if (prevCancel) await sql(`INSERT INTO settings (key, value) VALUES ('cancellation_settings', $1::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(prevCancel.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'cancellation_settings'`);
  if (prevLoyalty) await sql(`UPDATE settings SET value = $1::jsonb WHERE key = 'loyalty_config'`, [JSON.stringify(prevLoyalty.value)]);
  else await sql(`DELETE FROM settings WHERE key = 'loyalty_config'`);
  await cleanup(PFX);
  await closeDb();
});

test("sin configurar la cuota es 2: la tercera cancelación → 403 CANCELLATION_LIMIT y nada cambia", async () => {
  const c = await makeClient(PFX, "tres");
  await giveMembership(A, c.id, f.plan.id, 8);
  const primera = await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(20) })));
  assert.equal(primera.status, 200, JSON.stringify(primera.body));
  assert.equal(primera.body.cancellationsUsed, 1);
  assert.equal(primera.body.cancellationLimit, 2);
  assert.equal(primera.body.cancellationsLeft, 1);
  assert.equal((await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(21) })))).status, 200);
  assert.equal(await usadas(c.id), 2);
  const id3 = await reservar(c, await makeClass(A, f, { date: day(22) }));
  const r3 = await cancelar(c, id3);
  assert.equal(r3.status, 403);
  assert.equal(r3.body.code, "CANCELLATION_LIMIT");
  assert.equal(r3.body.message, "Ya usaste tus 2 cancelaciones de este paquete. Si necesitas cancelar, habla con recepción.");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id3]))[0].status, "confirmed");
  assert.equal(await usadas(c.id), 2);
});

test("salir de la lista de espera con la cuota agotada → 200, sin sumar ni registrar falta aunque falten menos de 12 h", async () => {
  const ocupa = await makeClient(PFX, "ocupa");
  await giveMembership(A, ocupa.id, f.plan.id, 8);
  const c = await makeClient(PFX, "fila");
  await giveMembership(A, c.id, f.plan.id, 8);
  await sql(`UPDATE memberships SET cancellations_used = 2 WHERE user_id = $1`, [c.id]);
  const classId = await makeClass(A, f, { date: day(8), cap: 1 });
  await reservar(ocupa, classId);
  const id = await reservar(c, classId);
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id]))[0].status, "waitlist");
  await aHoras(classId, 5);
  const [antes] = await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]);
  const r = await cancelar(c, id);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.leftWaitlist, true);
  assert.equal(r.body.message, "Saliste de la lista de espera. No usa una cancelación de tu paquete.");
  assert.equal(await usadas(c.id), 2, "salir de la fila no suma a la cuota");
  const [despues] = await sql(`SELECT faltas_count FROM users WHERE id=$1`, [c.id]);
  assert.equal(despues.faltas_count, antes.faltas_count, "salir de la fila no es falta");
  assert.equal((await sql(`SELECT status FROM bookings WHERE id=$1`, [id]))[0].status, "cancelled");
});

test("usa la ventana configurada: con 24 h, cancelar a 20 h pierde la clase y lo dice", async () => {
  await ponerLealtad({ faltas_cancel_window_hours: 24 });
  try {
    const c = await makeClient(PFX, "ventana");
    await giveMembership(A, c.id, f.plan.id, 8);
    const classId = await makeClass(A, f, { date: day(9) });
    const id = await reservar(c, classId);
    await aHoras(classId, 20);
    const antes = await credits(c.id);
    const r = await cancelar(c, id);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.creditRestored, false);
    assert.equal(r.body.cancelWindowHours, 24);
    assert.match(r.body.message, /menos de 24 horas/);
    assert.equal(await credits(c.id), antes, "tarde: la clase no regresa");
    assert.equal((await api("GET", "/api/public/booking-policy")).body.data.cancelWindowHours, 24);
  } finally {
    await ponerLealtad({ faltas_cancel_window_hours: 12 });
  }
});

test("la dueña cambia la cuota (queda en la bitácora); recepción no; inválida → 400; la ruta genérica → 400", async () => {
  const r = await ponerCuota(3);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.cancellationLimit, 3);
  const pub = await api("GET", "/api/public/booking-policy");
  assert.equal(pub.status, 200);
  assert.deepEqual(Object.keys(pub.body.data).sort(),
    ["bookingLeadHours", "cancelWindowHours", "cancellationLimit", "faltasEnabled", "faltasThreshold", "waitlistCutoffHours"]);
  assert.equal(pub.body.data.cancellationLimit, 3);
  const [log] = await sql(`SELECT before, after, meta FROM audit_log WHERE action = 'settings.update' ORDER BY created_at DESC LIMIT 1`);
  assert.deepEqual(log.before, { max_cancellations: 2 });
  assert.deepEqual(log.after, { max_cancellations: 3 });
  assert.equal((await api("PUT", "/api/admin/booking-policy", { token: recep.token, body: { cancellationLimit: 5 } })).status, 403);
  for (const bad of [-1, 2.5, "x", 21, null]) {
    const m = await ponerCuota(bad);
    assert.equal(m.status, 400, String(bad));
    assert.equal(m.body.message, "Escribe un número entero de 0 a 20.");
  }
  const generica = await api("PUT", "/api/settings/cancellation_settings", { token: A, body: { value: { max_cancellations: 9 } } });
  assert.equal(generica.status, 400);
  assert.equal((await api("GET", "/api/public/booking-policy")).body.data.cancellationLimit, 3);
  await ponerCuota(2);
});

test("0 = sin límite: con 7 usadas todavía cancela", async () => {
  await ponerCuota(0);
  try {
    const c = await makeClient(PFX, "sinlimite");
    await giveMembership(A, c.id, f.plan.id, 8);
    await sql(`UPDATE memberships SET cancellations_used = 7 WHERE user_id = $1`, [c.id]);
    const r = await cancelar(c, await reservar(c, await makeClass(A, f, { date: day(23) })));
    assert.equal(r.status, 200);
    assert.equal(r.body.cancellationLimit, 0);
    assert.equal(r.body.cancellationsLeft, null);
  } finally {
    await ponerCuota(2);
  }
});

test("recepción ajusta cancellationsUsed con motivo; sin motivo → 400; guardar lo mismo no pide motivo", async () => {
  const c = await makeClient(PFX, "ajuste");
  await giveMembership(A, c.id, f.plan.id, 8);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id=$1`, [c.id]);
  await sql(`UPDATE memberships SET cancellations_used = 2 WHERE id = $1`, [m.id]);
  const sin = await api("PUT", `/api/memberships/${m.id}`, { token: recep.token, body: { cancellationsUsed: 0 } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal(await usadas(c.id), 2);
  const con = await api("PUT", `/api/memberships/${m.id}`, { token: recep.token, body: { cancellationsUsed: 0, reason: "Canceló por enfermedad, trajo receta" } });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal(await usadas(c.id), 0);
  const [log] = await sql(`SELECT actor_id, reason, before, after FROM audit_log WHERE entity_id=$1 AND action='membership.adjust' ORDER BY created_at DESC LIMIT 1`, [m.id]);
  assert.equal(log.actor_id, recep.id);
  assert.equal(log.reason, "Canceló por enfermedad, trajo receta");
  assert.deepEqual(log.before, { cancellations_used: 2 });
  assert.deepEqual(log.after, { cancellations_used: 0 });
  const igual = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { cancellationsUsed: 0 } });
  assert.equal(igual.status, 200);
  assert.equal(igual.body.unchanged, true);
  for (const bad of [-1, 1.5, "x"]) {
    const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { cancellationsUsed: bad, reason: "Motivo válido" } });
    assert.equal(r.status, 400, String(bad));
  }
});

test("una reserva con asistencia o falta no se cancela desde la app → 409", async () => {
  const c = await makeClient(PFX, "asistio");
  await giveMembership(A, c.id, f.plan.id, 8);
  const id = await reservar(c, await makeClass(A, f, { date: day(24) }));
  await sql(`UPDATE bookings SET status = 'checked_in', checked_in_at = NOW() WHERE id = $1`, [id]);
  const r = await cancelar(c, id);
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "ATTENDANCE_RECORDED");
  await sql(`UPDATE bookings SET status = 'no_show', checked_in_at = NULL WHERE id = $1`, [id]);
  assert.equal((await cancelar(c, id)).status, 409);
  assert.equal(await usadas(c.id), 0);
});

test("las cancelaciones del estudio no cuentan para la cuota", async () => {
  const c = await makeClient(PFX, "estudio");
  await giveMembership(A, c.id, f.plan.id, 8);
  const id = await reservar(c, await makeClass(A, f, { date: day(25) }));
  const r = await api("DELETE", `/api/admin/bookings/${id}`, { token: A, body: { reason: "Cambio de coach, la movemos" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await usadas(c.id), 0);
});

test("la app y el panel reciben la cuota con la membresía", async () => {
  const c = await makeClient(PFX, "mia");
  await giveMembership(A, c.id, f.plan.id, 8);
  await sql(`UPDATE memberships SET cancellations_used = 1 WHERE user_id = $1`, [c.id]);
  const my = await api("GET", "/api/memberships/my", { token: c.token });
  assert.equal(my.body.data.cancellationsUsed, 1);
  assert.equal(my.body.data.cancellationLimit, 2);
  assert.equal(my.body.data.cancellationsLeft, 1);
  const all = await api("GET", "/api/memberships/mine/all", { token: c.token });
  assert.equal(all.body.data[0].cancellationsLeft, 1);
  const panel = await api("GET", `/api/memberships?userId=${c.id}`, { token: A });
  assert.equal(panel.body.data[0].cancellationsUsed, 1);
  assert.equal(panel.body.data[0].cancellationLimit, 2);
});
```

`src/pages/admin/settings/SettingsPage.politicas.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import SettingsPage from "./SettingsPage";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock };
const POLICY = { data: { cancellationLimit: 2, cancelWindowHours: 12, bookingLeadHours: 2, waitlistCutoffHours: 2, faltasEnabled: true, faltasThreshold: 5 } };

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.put.mockReset().mockResolvedValue({ data: { data: { ...POLICY.data, cancellationLimit: 3 } } });
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/public/booking-policy": POLICY,
    "/evolution/status": { data: { state: "close" } },
    "/settings/general_settings": { data: {} },
    "/settings/notification_settings": { data: {} },
    "/settings/notification_templates": { data: {} },
  });
});

const montar = () => renderAdmin(<SettingsPage />, { route: "/admin/settings?tab=policies", path: "/admin/settings" });

describe("Configuración · Políticas (auditoría 2026-09-27, P0-4)", () => {
  it("la dueña cambia la cuota, ve cómo se publica y guarda", async () => {
    loginAs("admin");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    await waitFor(() => expect(campo).toHaveValue(2));
    const reglas = screen.getByRole("list", { name: "Reglas publicadas" });
    expect(within(reglas).getByText("Puedes cancelar hasta 2 veces por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    expect(screen.getByText("12 horas")).toBeInTheDocument();
    const guardar = screen.getByRole("button", { name: "Guardar" });
    expect(guardar).toBeDisabled();
    fireEvent.change(campo, { target: { value: "3" } });
    expect(within(reglas).getByText("Puedes cancelar hasta 3 veces por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(mockApi.put).toHaveBeenCalledWith("/admin/booking-policy", { cancellationLimit: 3 }));
  });

  it("0 es sin límite y un valor inválido no se puede guardar", async () => {
    loginAs("admin");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    await waitFor(() => expect(campo).toHaveValue(2));
    fireEvent.change(campo, { target: { value: "0" } });
    expect(screen.getByText("No hay límite de cancelaciones por paquete. Salir de la lista de espera no cuenta.")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "25" } });
    expect(screen.getByText("Escribe un número entero de 0 a 20.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("recepción la ve pero no la cambia", async () => {
    loginAs("reception");
    montar();
    const campo = await screen.findByLabelText("Cancelaciones permitidas por paquete");
    expect(campo).toBeDisabled();
    expect(screen.getByText("Sólo la dueña puede cambiarlo.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar" })).toBeNull();
  });

  it("ya no edita los textos legales: liga a las tres páginas", async () => {
    loginAs("admin");
    montar();
    await screen.findByLabelText("Cancelaciones permitidas por paquete");
    expect(screen.queryByLabelText("Política de privacidad")).toBeNull();
    expect(screen.getByRole("link", { name: "Términos y condiciones" })).toHaveAttribute("href", "/legal/terminos");
    expect(screen.getByRole("link", { name: "Aviso de privacidad" })).toHaveAttribute("href", "/legal/privacidad");
    expect(screen.getByRole("link", { name: "Política de cancelación" })).toHaveAttribute("href", "/legal/cancelacion");
  });
});
```

`src/pages/admin/clients/ClientDetail.test.tsx`: agrega `waitFor` al import de testing-library si no está, y agrega:

```tsx
  it("la tarjeta dice cuántas cancelaciones lleva y Editar las ajusta con el motivo del ajuste", async () => {
    const mockPut = (api as unknown as { put: Mock }).put;
    mockPut.mockReset().mockResolvedValue({ data: {} });
    loginAs("reception");
    routeApi(mockApi, tabla({ "/memberships?userId=u1": { data: [{ ...MEM, cancellationsUsed: 2, cancellationLimit: 2 }] } }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    expect(within(mem).getByText("Cancelaciones: 2 de 2")).toBeInTheDocument();
    fireEvent.click(within(mem).getByRole("button", { name: /Editar/ }));
    const dlg = await screen.findByRole("dialog", { name: "Editar membresía" });
    const campo = within(dlg).getByLabelText("Cancelaciones usadas");
    expect(campo).toHaveValue(2);
    expect(within(dlg).getByText(/De 2 permitidas por paquete/)).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "0" } });
    fireEvent.change(within(dlg).getByLabelText("Motivo del ajuste"), { target: { value: "Canceló por enfermedad, trajo receta" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(mockPut).toHaveBeenCalledWith("/memberships/m1", expect.objectContaining({
      cancellationsUsed: 0, reason: "Canceló por enfermedad, trajo receta",
    })));
  });

  it("sin límite de cancelaciones la tarjeta lo dice", async () => {
    loginAs("admin");
    routeApi(mockApi, tabla({ "/memberships?userId=u1": { data: [{ ...MEM, cancellationsUsed: 1, cancellationLimit: 0 }] } }));
    renderAdmin(<ClientDetail />, { route: "/admin/clients/u1", path: "/admin/clients/:id" });
    const mem = await screen.findByRole("region", { name: "Membresía" });
    expect(within(mem).getByText("Cancelaciones: 1 usada · sin límite")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/cancellationPolicy.test.js server/lib/membershipAdmin.test.js` → FAIL.
  - `npx vitest run src/pages/admin/settings src/pages/admin/clients` → FAIL.
  - En tu base (5593/8193), `cuota-cancelaciones.test.mjs` → FAIL.

- [ ] **Step 3: Implementar.**

`server/lib/cancellationPolicy.js`:

```js
// Cuota de cancelaciones por paquete y política pública de reservas (auditoría
// 2026-09-27, P0-4). La cuota vive en settings.cancellation_settings (2 por
// defecto, 0 = sin límite); la ventana, en loyalty_config.faltas_cancel_window_hours.
// Cuenta toda cancelación que la clienta hace de una reserva confirmada, a tiempo
// o tarde. Salir de la lista de espera no cuenta.
export const DEFAULT_CANCELLATION_LIMIT = 2;
export const MAX_CANCELLATION_LIMIT = 20;

export function normalizeCancellationSettings(raw) {
  const n = raw && typeof raw === "object" ? raw.max_cancellations : undefined;
  const ok = Number.isInteger(n) && n >= 0 && n <= MAX_CANCELLATION_LIMIT;
  return { max_cancellations: ok ? n : DEFAULT_CANCELLATION_LIMIT };
}

/** null si la cuota que manda la dueña sirve; si no, el texto del 400. */
export function cancellationLimitProblem(value) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= MAX_CANCELLATION_LIMIT
    ? null
    : `Escribe un número entero de 0 a ${MAX_CANCELLATION_LIMIT}.`;
}

export function cancellationQuota({ used = 0, limit = 0 } = {}) {
  const u = Math.max(0, Math.trunc(Number(used) || 0));
  const l = Math.max(0, Math.trunc(Number(limit) || 0));
  return { limited: l > 0, used: u, limit: l, left: l > 0 ? Math.max(0, l - u) : null, exhausted: l > 0 && u >= l };
}

/** Qué pasa cuando la clienta cancela desde la app (DELETE /api/bookings/:id). */
export function clientCancelDecision({ bookingStatus, used = 0, limit = 0 }) {
  if (bookingStatus === "cancelled") {
    return { ok: false, status: 400, code: "ALREADY_CANCELLED", message: "Esta reserva ya fue cancelada" };
  }
  if (bookingStatus === "checked_in" || bookingStatus === "no_show") {
    return {
      ok: false, status: 409, code: "ATTENDANCE_RECORDED",
      message: "Esta reserva ya tiene la asistencia registrada. Si hay un error, habla con recepción.",
    };
  }
  if (bookingStatus === "waitlist") {
    return { ok: true, leavingWaitlist: true, countsTowardQuota: false, freesSeat: false };
  }
  const q = cancellationQuota({ used, limit });
  if (q.exhausted) {
    return {
      ok: false, status: 403, code: "CANCELLATION_LIMIT",
      message: `Ya usaste tus ${q.limit} ${q.limit === 1 ? "cancelación" : "cancelaciones"} de este paquete. Si necesitas cancelar, habla con recepción.`,
    };
  }
  return { ok: true, leavingWaitlist: false, countsTowardQuota: true, freesSeat: true };
}

/** La política que ven la app, los legales y el panel (contrato de src/lib/booking-policy.ts). */
export function publicBookingPolicy({ settings, loyalty, bookingLeadHours = 2 } = {}) {
  const s = normalizeCancellationSettings(settings);
  const w = Number(loyalty?.faltas_cancel_window_hours);
  const t = Number(loyalty?.faltas_threshold);
  return {
    cancellationLimit: s.max_cancellations,
    cancelWindowHours: Number.isFinite(w) && w > 0 ? w : 12,
    bookingLeadHours,
    waitlistCutoffHours: bookingLeadHours,
    faltasEnabled: loyalty?.faltas_enabled !== false,
    faltasThreshold: Number.isInteger(t) && t > 0 ? t : 5,
  };
}
```

**`server/lib/membershipAdmin.js`** (bloque 2):
- `REASON_FIELDS` pasa a `Object.freeze(["classes_remaining", "start_date", "end_date", "status", "cancellations_used"])` y su comentario a `/** Cambiar alguno de estos exige motivo (bloque 3: también las cancelaciones usadas). Cambiar sólo el método, no. */`.
- `ADJUST_FIELDS` pasa a `["status", "classes_remaining", "start_date", "end_date", "payment_method", "cancellations_used"]`.
- En `planMembershipAdjust`:
  - La primera línea pasa a `const { status, classesRemaining, startDate, endDate, paymentMethod, cancellationsUsed } = input || {};`.
  - Tras la validación de `paymentMethod`:

```js
  if (given(cancellationsUsed)) {
    const n = Number(cancellationsUsed);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      return { ok: false, message: "Las cancelaciones usadas deben ser un número entero de 0 en adelante." };
    }
  }
```

  - Tras `if (given(paymentMethod)) next.payment_method = paymentMethod;`: `if (given(cancellationsUsed)) next.cancellations_used = Number(cancellationsUsed);`.
  - La llamada a `changedFields` pasa a:

```js
  const changes = changedFields(before, next, ADJUST_FIELDS, (k, v) =>
    k === "classes_remaining" ? creditsKey(v) : k === "cancellations_used" ? Number(v ?? 0) : v);
```

En `server/index.js`:

**Import**, tras `import { saleAmountPlan, planMembershipAdjust, cleanPaymentReference } from "./lib/membershipAdmin.js";`:

```js
import { cancellationLimitProblem, cancellationQuota, clientCancelDecision, normalizeCancellationSettings, publicBookingPolicy } from "./lib/cancellationPolicy.js";
```

**`GET /api/memberships/my`:** entre `if (row.classLimit >= 9999) row.classLimit = null;` y `return res.json({ data: row });`:

```js
    // Cuota de cancelaciones del paquete (auditoría 2026-09-27, P0-4).
    const policy = await getBookingPolicy();
    const quota = cancellationQuota({ used: row.cancellationsUsed, limit: policy.cancellationLimit });
    row.cancellationsUsed = quota.used;
    row.cancellationLimit = policy.cancellationLimit;
    row.cancellationsLeft = quota.left;
```

**`GET /api/memberships/mine/all`:** reemplaza `const rows = camelRows(r.rows).map((row) => {` … `});` por:

```js
    const policy = await getBookingPolicy();
    const rows = camelRows(r.rows).map((row) => {
      if (row.classesRemaining >= 9999) row.classesRemaining = null;
      if (row.classLimit >= 9999) row.classLimit = null;
      const quota = cancellationQuota({ used: row.cancellationsUsed, limit: policy.cancellationLimit });
      return { ...row, cancellationsUsed: quota.used, cancellationLimit: policy.cancellationLimit, cancellationsLeft: quota.left };
    });
```

**`DELETE /api/bookings/:id`:** reemplaza la ruta completa (desde `// DELETE /api/bookings/:id` hasta su `});`) por:

```js
// DELETE /api/bookings/:id — la clienta cancela su reserva o sale de la lista de
// espera. Una sola política (auditoría 2026-09-27, P0-4):
//   - cuota de cancelaciones por paquete (settings.cancellation_settings; 0 = sin límite);
//   - ventana configurable (loyalty_config; 12 h por defecto): cancelar tarde
//     pierde la clase y cuenta como falta.
// Salir de la lista de espera no consulta ni suma la cuota, ni cuenta como falta.
// Una reserva con asistencia o falta ya no se cancela desde la app. Si se libera
// un lugar, sube la fila (onSeatReleased, después del COMMIT).
app.delete("/api/bookings/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const policy = await getBookingPolicy();
    await client.query("BEGIN");

    // Load + LOCK booking (FOR UPDATE OF b) para serializar cancelaciones
    // concurrentes: con doble-clic, la 2ª petición espera y ve status
    // 'cancelled' → aborta. Evita doble devolución de crédito / doble falta.
    const r = await client.query(
      `SELECT b.*, c.date, c.start_time, ct.name AS class_type_name
       FROM bookings b
       JOIN classes c ON b.class_id = c.id
       JOIN class_types ct ON c.class_type_id = ct.id
       WHERE b.id = $1 AND b.user_id = $2
       FOR UPDATE OF b`,
      [req.params.id, req.userId]
    );
    if (r.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Reserva no encontrada" });
    }
    const booking = r.rows[0];

    let membership = null;
    if (booking.membership_id) {
      const memRes = await client.query(
        "SELECT id, classes_remaining, cancellations_used, plan_id FROM memberships WHERE id = $1 FOR UPDATE",
        [booking.membership_id]
      );
      membership = memRes.rows[0] ?? null;
    }
    const limit = membership ? policy.cancellationLimit : 0;
    const decision = clientCancelDecision({ bookingStatus: booking.status, used: membership?.cancellations_used ?? 0, limit });
    if (!decision.ok) {
      await client.query("ROLLBACK");
      return res.status(decision.status).json({ code: decision.code, message: decision.message });
    }

    // Ventana para devolver la clase: hora del estudio contra el inicio real.
    const classStartRes = await client.query(
      `SELECT (c.date + c.start_time::time) AT TIME ZONE '${STUDIO_TIMEZONE}' AS class_start_utc
       FROM classes c WHERE c.id = $1`,
      [booking.class_id]
    );
    const classStartUTC = classStartRes.rows[0]?.class_start_utc ? new Date(classStartRes.rows[0].class_start_utc) : null;
    const minutesUntilClass = classStartUTC ? (classStartUTC.getTime() - Date.now()) / 60_000 : 999;
    const isLate = decision.countsTowardQuota && isWithinCancelWindow(minutesUntilClass, policy.cancelWindowHours);

    await client.query("UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1", [req.params.id]);
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).

    let used = Number(membership?.cancellations_used ?? 0);
    if (decision.countsTowardQuota && membership) {
      const up = await client.query(
        "UPDATE memberships SET cancellations_used = COALESCE(cancellations_used, 0) + 1 WHERE id = $1 RETURNING cancellations_used",
        [membership.id]
      );
      used = Number(up.rows[0]?.cancellations_used ?? used + 1);
      // A tiempo: la clase regresa al paquete (si tiene tope). Tarde: se pierde.
      if (!isLate && !isUnlimitedClasses(membership.classes_remaining)) {
        await restoreMembershipCredit(client, membership.id, booking.class_id);
      }
    }
    const creditRestored = decision.countsTowardQuota && !isLate;

    await client.query("COMMIT");

    // ── Después del COMMIT ──────────────────────────────────────────────────
    // Falta por cancelación tardía (misma ventana). Excluye invitadas.
    if (decision.countsTowardQuota && isLate && !booking.guest_profile_id) {
      try {
        await recordFalta({ userId: req.userId, reason: `cancelación dentro de ${policy.cancelWindowHours}h` });
      } catch (e) { console.warn("[faltas] late-cancel:", e.message); }
    }
    // Se liberó un lugar: sube la primera de la fila que pueda usarlo (P1-1).
    if (decision.freesSeat) await onSeatReleased([booking.class_id], { source: "client_cancel" });

    // Correo + WhatsApp sólo al cancelar una reserva (salir de la fila no avisa).
    if (!decision.leavingWaitlist) {
      try {
        const uRes = await pool.query("SELECT email, display_name, phone FROM users WHERE id = $1", [req.userId]);
        const memAfter = membership
          ? await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [membership.id])
          : null;
        if (uRes.rows[0]) {
          const u = uRes.rows[0];
          if (await areEmailNotificationsEnabled()) {
            sendBookingCancelled({
              to: u.email,
              name: u.display_name || "Alumna",
              className: booking.class_type_name || "tu clase",
              date: booking.date,
              startTime: booking.start_time,
              creditRestored,
              isLate,
              classesLeft: memAfter?.rows[0]?.classes_remaining ?? null,
            }).catch((e) => console.error("[Email] booking cancelled:", e.message));
          }
          sendConfiguredWhatsAppTemplate({
            templateKey: "booking_cancelled",
            phone: u.phone,
            vars: {
              name: u.display_name || "Alumna",
              class: booking.class_type_name || "tu clase",
              date: booking.date ? new Date(booking.date).toLocaleDateString("es-MX") : "",
              time: booking.start_time ? String(booking.start_time).slice(0, 5) : "",
              creditRestored: creditRestored ? "Sí" : "No",
            },
            fallbackMessage: isLate
              ? `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. La clase no se devolvió por cancelación tardía.`
              : `Hola ${u.display_name || "Alumna"}, cancelaste tu reserva de ${booking.class_type_name || "tu clase"}. Tu crédito fue devuelto.`,
          }).catch((e) => console.error("[WA] booking cancelled:", e.message));
        }
      } catch (emailErr) {
        console.error("[Email] cancelled query:", emailErr.message);
      }
    }

    triggerWalletPassSync(req.userId, decision.leavingWaitlist ? "waitlist_left" : isLate ? "booking_cancelled_late" : "booking_cancelled");
    const quota = cancellationQuota({ used, limit });
    return res.json({
      message: decision.leavingWaitlist
        ? "Saliste de la lista de espera. No usa una cancelación de tu paquete."
        : isLate
          ? `Reserva cancelada. Por cancelar con menos de ${policy.cancelWindowHours} horas de anticipación, la clase cuenta como utilizada y NO se devuelve a tu paquete.`
          : "Reserva cancelada. Se devolvió el crédito a tu paquete.",
      creditRestored,
      leftWaitlist: decision.leavingWaitlist,
      cancellationsUsed: quota.used,
      cancellationLimit: limit,
      cancellationsLeft: quota.left,
      cancelWindowHours: policy.cancelWindowHours,
    });
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch (_) { }
    console.error("DELETE bookings error:", err.message, err.stack);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**Settings:** en `app.put("/api/settings/:key", …)`, al inicio del `try` (antes de `const { value } = req.body;`):

```js
    // La cuota de cancelaciones tiene su ruta (sólo la dueña, validada y en la
    // bitácora): por aquí recepción podía cambiarla (auditoría 2026-09-27, P0-4).
    if (req.params.key === "cancellation_settings") {
      return res.status(400).json({ message: "La cuota de cancelaciones se cambia en Configuración → Políticas." });
    }
```

Y justo después del `});` de esa ruta:

```js
// ── Política de reservas y cancelación (auditoría 2026-09-27, P0-4) ─────────
// Cuota de cancelaciones por paquete (settings.cancellation_settings; 2 por
// defecto, 0 = sin límite), ventana real (loyalty_config) y cierre de reservas y
// de la lista de espera (BOOKING_LEAD_HOURS). La app, los legales y el panel la
// leen de aquí: una sola política.
async function getBookingPolicy(db = pool) {
  const [raw, loyalty] = await Promise.all([
    db.query("SELECT value FROM settings WHERE key = 'cancellation_settings' LIMIT 1")
      .then((r) => r.rows[0]?.value ?? null)
      .catch(() => null),
    getLoyaltyConfig(db),
  ]);
  return publicBookingPolicy({ settings: raw, loyalty, bookingLeadHours: BOOKING_LEAD_HOURS });
}

app.get("/api/public/booking-policy", async (_req, res) => {
  try {
    return res.json({ data: await getBookingPolicy() });
  } catch (err) {
    console.error("[GET /public/booking-policy]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});

// PUT /api/admin/booking-policy — sólo la dueña fija la cuota de cancelaciones.
app.put("/api/admin/booking-policy", ownerMiddleware, async (req, res) => {
  const problem = cancellationLimitProblem(req.body?.cancellationLimit);
  if (problem) return res.status(400).json({ message: problem });
  const next = Number(req.body.cancellationLimit);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query("SELECT value FROM settings WHERE key = 'cancellation_settings' FOR UPDATE");
    const raw = cur.rows[0]?.value && typeof cur.rows[0].value === "object" ? cur.rows[0].value : {};
    const prev = normalizeCancellationSettings(raw).max_cancellations;
    await client.query(
      `INSERT INTO settings (key, value) VALUES ('cancellation_settings', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ ...raw, max_cancellations: next })],
    );
    if (prev !== next) {
      await recordAudit(client, {
        actorId: req.userId, action: "settings.update", entityType: "settings",
        before: { max_cancellations: prev }, after: { max_cancellations: next },
        meta: { key: "cancellation_settings" },
      });
    }
    await client.query("COMMIT");
    return res.json({ data: await getBookingPolicy() });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[PUT /admin/booking-policy]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`GET /api/memberships`** (panel):
- Justo antes de `return res.json({` agrega `const policy = await getBookingPolicy();`.
- En el objeto de cada fila, tras `classLimit: m.class_limit,`:

```js
        cancellationsUsed: Number(m.cancellations_used ?? 0),
        cancellationLimit: policy.cancellationLimit,
```

**`PUT /api/memberships/:id`** (versión del bloque 2):
- La primera línea pasa a `const { status, classesRemaining, endDate, startDate, paymentMethod, reason, cancellationsUsed } = req.body || {};`.
- En el `SELECT … FOR UPDATE OF m`, tras `m.classes_remaining,` agrega `COALESCE(m.cancellations_used, 0)::int AS cancellations_used,`.
- La llamada pasa a `planMembershipAdjust({ before, input: { status, classesRemaining, startDate, endDate, paymentMethod, cancellationsUsed } })`.
- El `UPDATE memberships SET …` pasa a:

```js
    const r = await client.query(
      `UPDATE memberships SET
         status = COALESCE($1, status),
         classes_remaining = COALESCE($2, classes_remaining),
         end_date = COALESCE($3, end_date),
         start_date = COALESCE($4, start_date),
         payment_method = COALESCE($5, payment_method),
         cancellations_used = COALESCE($6, cancellations_used),
         updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [n.status ?? null, n.classes_remaining ?? null, n.end_date ?? null, n.start_date ?? null, n.payment_method ?? null,
       n.cancellations_used ?? null, req.params.id],
    );
```

**`src/pages/admin/settings/SettingsPage.tsx`:**
- **Imports:**

```tsx
import { useCanSeeFinance } from "@/lib/roles";
import { cancellationRules, horasTexto, useBookingPolicy } from "@/lib/booking-policy";
```

  (`useCanSeeFinance` ya se importa: no lo dupliques; `Input`, `Label`, `Button`, `Panel`, `ErrorState`, `useMutation`, `useQueryClient`, `useToast` y `api` también están).
- **Componente nuevo**, antes de `const SETTINGS_TABS = [`:

```tsx
// ── Políticas: cuota de cancelaciones (auditoría 2026-09-27, P0-4) ──────────
// La cuota la fija sólo la dueña; la ventana (Lealtad) y el cierre de reservas
// se muestran de lectura. "Así se publica" usa el mismo texto que la app y
// /legal/cancelacion. Los textos legales ya no se editan aquí.
const CancellationPolicySettings = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isOwner = useCanSeeFinance();
  const { policy, isLoading, isError, refetch } = useBookingPolicy();
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!isLoading) setValue(String(policy.cancellationLimit));
  }, [isLoading, policy.cancellationLimit]);
  const n = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 20;
  const dirty = valid && n !== policy.cancellationLimit;
  const save = useMutation({
    mutationFn: () => api.put("/admin/booking-policy", { cancellationLimit: n }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking-policy"] });
      toast({ title: "Política guardada", description: "La app y la política de cancelación ya muestran la nueva cuota." });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo guardar", variant: "destructive" }),
  });

  if (isError) {
    return <div className="max-w-md"><ErrorState description="No pudimos cargar la política. Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetch()} /></div>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Panel aria-label="Cancelaciones" className="p-6">
        <h2 className="mb-1 text-base font-extrabold">Cancelaciones</h2>
        <p className="mb-4 text-[13px] text-ink-muted">Se publica igual en la app, en el detalle de cada clase y en la política de cancelación.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pol-limit">Cancelaciones permitidas por paquete</Label>
            <Input id="pol-limit" type="number" inputMode="numeric" min={0} max={20} step={1} className="nums"
              disabled={!isOwner || isLoading} value={value} onChange={(e) => setValue(e.target.value)} />
            <p className="text-[0.75rem] text-ink-muted">0 = sin límite. Salir de la lista de espera no cuenta.</p>
            {!isOwner && <p className="text-[0.75rem] text-ink-muted">Sólo la dueña puede cambiarlo.</p>}
            {value.trim() !== "" && !valid && <p className="text-[0.75rem] text-danger">Escribe un número entero de 0 a 20.</p>}
          </div>
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-ink-muted">Ventana para cancelar sin perder la clase</dt>
              <dd className="nums font-bold text-ink">{horasTexto(policy.cancelWindowHours)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">Las reservas y la lista de espera cierran antes del inicio</dt>
              <dd className="nums font-bold text-ink">{horasTexto(policy.bookingLeadHours)}</dd>
            </div>
          </dl>
        </div>
        <h3 className="mt-5 text-sm font-extrabold">Así se publica</h3>
        <ul aria-label="Reglas publicadas" className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink">
          {cancellationRules({ ...policy, cancellationLimit: valid ? n : policy.cancellationLimit }).map((r) => <li key={r}>{r}</li>)}
        </ul>
        {isOwner && (
          <div className="mt-5">
            <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
          </div>
        )}
      </Panel>
      <Panel aria-label="Textos legales" className="p-6">
        <h2 className="mb-1 text-base font-extrabold">Textos legales</h2>
        <p className="text-sm text-ink-muted">
          Los términos, el aviso de privacidad y la política de cancelación se publican desde el sistema, con su fecha de versión. Para cambiar su redacción, pídelo a quien mantiene la app.
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
          <li><a href="/legal/terminos" target="_blank" rel="noreferrer" className="underline underline-offset-2">Términos y condiciones</a></li>
          <li><a href="/legal/privacidad" target="_blank" rel="noreferrer" className="underline underline-offset-2">Aviso de privacidad</a></li>
          <li><a href="/legal/cancelacion" target="_blank" rel="noreferrer" className="underline underline-offset-2">Política de cancelación</a></li>
        </ul>
      </Panel>
    </div>
  );
};
```

- **`<TabsContent value="policies">`:** reemplaza el `<SettingsSection settingKey="policies_settings" … />` por `<CancellationPolicySettings />`.

**`src/pages/admin/clients/ClientDetail.tsx`:**
- **`MembershipCard`**, justo antes de `<div className="grid grid-cols-2 gap-2">`:

```tsx
      {mem.cancellationLimit !== undefined && (() => {
        const usadas = Number(mem.cancellationsUsed ?? 0);
        const tope = Number(mem.cancellationLimit ?? 0);
        return (
          <p className="nums text-[13px] text-ink-muted">
            {tope > 0 ? `Cancelaciones: ${usadas} de ${tope}` : `Cancelaciones: ${usadas} ${usadas === 1 ? "usada" : "usadas"} · sin límite`}
          </p>
        );
      })()}
```

- **Estado:** `const [editCancellations, setEditCancellations] = useState("");`; en `openEditMem`, `setEditCancellations(String(m.cancellationsUsed ?? 0));`.
- **`editMemMutation.mutationFn`:** antes del `return api.put(…)`:

```tsx
      if (editCancellations.trim() !== "") body.cancellationsUsed = Number(editCancellations);
```

- **En el diálogo "Editar membresía"**, justo después del bloque de "Clases restantes" (el del `id="mem-credits"` del bloque 2, con su aviso "Queda por encima del plan") y antes del de "Estado":

```tsx
                <div className="space-y-1">
                  <Label htmlFor="mem-cancellations" className="text-xs text-ink/70">Cancelaciones usadas</Label>
                  <Input
                    id="mem-cancellations"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    className={cn(fieldCls, "nums")}
                    value={editCancellations}
                    onChange={(e) => setEditCancellations(e.target.value)}
                  />
                  <p className="text-xs text-ink/50">
                    {Number(editMem.cancellationLimit) > 0
                      ? `De ${editMem.cancellationLimit} permitidas por paquete.`
                      : "Este paquete no tiene límite de cancelaciones."}{" "}
                    Bajarlas le deja cancelar otra vez; queda en la bitácora con el motivo del ajuste.
                  </p>
                </div>
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/settings src/pages/admin/clients src/lib` → PASS.
  - En tu base (5593/8193): `cuota-cancelaciones.test.mjs` más `creditos.test.mjs`, `ventas-ajustes.test.mjs`, `cancelaciones-semana.test.mjs`, `vencidas-pagos.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/cancellationPolicy.js server/lib/cancellationPolicy.test.js server/lib/membershipAdmin.js server/lib/membershipAdmin.test.js server/index.js server/tests/cuota-cancelaciones.test.mjs src/pages/admin/settings/SettingsPage.tsx src/pages/admin/settings/SettingsPage.politicas.test.tsx src/pages/admin/clients/ClientDetail.tsx src/pages/admin/clients/ClientDetail.test.tsx
git commit -m "fix(hive): cuota de cancelaciones configurable por la dueña, salir de la lista de espera ya no la consume y recepción la ajusta con motivo"
```

---


### Task 4: Lista de espera con subida automática — servidor y panel (P1-1)

**Files:**
- Create: `server/lib/waitlist.js`, `server/lib/waitlist.test.js`, `server/tests/lista-espera.test.mjs`.
- Modify: `server/index.js`. Las regiones de la tabla: import, cuerpo de `onSeatReleased` y helpers, y además:
  - `GET /api/classes/:id`, `GET /api/bookings/my-bookings` y `POST /api/bookings`.
  - `PUT /api/classes/:id/reopen`, `DELETE /api/admin/bookings/:id`, `PUT /api/memberships/:id/cancel` y `POST /api/admin/bookings/assign`.
  - `GET /api/classes/:id/roster`, `PUT /api/admin/classes/:id` y `scheduleEmailCrons()`.
- Modify: `src/pages/admin/bookings/Waitlist.tsx`, `src/pages/admin/bookings/Waitlist.test.tsx`, `src/pages/admin/bookings/BookingsList.tsx`.
- Create: `src/pages/admin/bookings/BookingsList.subida.test.tsx`.

**Interfaces:**
- Consumes (Task 1):
  - La función vacía `onSeatReleased(classIds, ctx = {})`: le pones el cuerpo **sin cambiar su firma**.
  - `recordAudit({ systemActor: "system", … })` y `booking.waitlist_promoted`.
  - `bookings.promoted_at` e `idx_bookings_class_waitlist`.
- Produces:

```js
// server/lib/waitlist.js
export function promotionWindowOpen(startsAt, now = Date.now(), cutoffHours = 2) // boolean
export function freeSeats(capacity, live)                                        // entero ≥ 0
export function queueBlocksNewBooking({ waiting, startsAt, now, cutoffHours })   // boolean
export function firstEligible(candidates)  // { promote: candidate|null, skipped: candidate[] }; candidate = { bookingId, userId, membershipId, position, reason: null|"sin_clases"|"solo_manana"|"tope_semanal" }
// server/index.js (internos)
async function onSeatReleased(classIds, ctx = {})  // → [{ booking_id, user_id, display_name, phone, whatsapp: "queued"|"failed"|"unreached"|"disabled"|"skipped", email: "queued"|"skipped" }]
const waitingCount = async (classId, db = pool)    // número en fila
async function promoteOneFromWaitlist(classId)     // null | { retry:true } | { bookingId, userId, membershipId, cls }
async function promoteWaitlist(classId, { quietUserIds })
async function notifyWaitlistPromoted(p)           // { whatsapp, email }
async function runWaitlistSweep()
```

- API:
  - `POST /api/bookings` y `POST /api/admin/bookings/assign` responden el estado final (`booking.status` y `data.isWaitlist`).
  - `DELETE /api/admin/bookings/:id` y `PUT /api/memberships/:id/cancel` agregan `waitlist_promoted`.
  - `GET /api/bookings/my-bookings`: `waitlist_position` en vivo.
  - `GET /api/classes/:id`: `waitlist_count`.
  - `GET /api/classes/:id/roster`: `waitlistPosition` y la fila por orden de llegada.
- Variable de entorno `WAITLIST_SWEEP_MINUTES` (5 por defecto; 0 apaga el barrido).

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/waitlist.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { promotionWindowOpen, freeSeats, queueBlocksNewBooking, firstEligible } from "./waitlist.js";

const AHORA = Date.parse("2026-10-01T10:00:00Z");

test("la subida aplica hasta 2 h antes del inicio (justo 2 h todavía sí)", () => {
  assert.equal(promotionWindowOpen(new Date("2026-10-01T12:00:00Z"), AHORA, 2), true);
  assert.equal(promotionWindowOpen("2026-10-01T15:00:00Z", AHORA, 2), true);
  assert.equal(promotionWindowOpen("2026-10-01T11:59:00Z", AHORA, 2), false);
  assert.equal(promotionWindowOpen("2026-10-01T09:00:00Z", AHORA, 2), false, "ya empezó");
  assert.equal(promotionWindowOpen("basura", AHORA, 2), false);
  assert.equal(promotionWindowOpen(null, AHORA, 2), false);
});

test("lugares libres", () => {
  assert.equal(freeSeats(5, 3), 2);
  assert.equal(freeSeats(5, 7), 0);
  assert.equal(freeSeats(null, 1), 0);
});

test("con fila, la reserva nueva entra a la fila sólo mientras aplique la subida", () => {
  const lejos = "2026-10-02T10:00:00Z";
  assert.equal(queueBlocksNewBooking({ waiting: 1, startsAt: lejos, now: AHORA, cutoffHours: 2 }), true);
  assert.equal(queueBlocksNewBooking({ waiting: 0, startsAt: lejos, now: AHORA, cutoffHours: 2 }), false);
  assert.equal(queueBlocksNewBooking({ waiting: 3, startsAt: "2026-10-01T11:00:00Z", now: AHORA, cutoffHours: 2 }), false,
    "a menos de 2 h el lugar queda libre");
});

test("firstEligible: sube la primera que cumple; las de adelante que no cumplen se saltan", () => {
  const a = { bookingId: "a", position: 1, reason: "sin_clases" };
  const b = { bookingId: "b", position: 2, reason: "tope_semanal" };
  const c = { bookingId: "c", position: 3, reason: null };
  assert.deepEqual(firstEligible([a, b, c]), { promote: c, skipped: [a, b] });
  assert.deepEqual(firstEligible([c, a]), { promote: c, skipped: [] });
  assert.deepEqual(firstEligible([a]), { promote: null, skipped: [a] });
  assert.deepEqual(firstEligible([]), { promote: null, skipped: [] });
});
```

`server/tests/lista-espera.test.mjs`:

```js
// Tarea 4 · auditoría 2026-09-27, bloque 3 (P1-1 · B5 · B4 · H4). Al liberarse
// un lugar sube sola la primera de la fila (orden de llegada) que pueda usarlo,
// hasta 2 h antes; nadie se salta la fila; dos liberaciones a la vez no suben dos
// veces a la misma ni pasan el cupo. El barrido (WAITLIST_SWEEP_MINUTES) va
// apagado en la base de pruebas.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, credits, liveBookings, bookingId, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgfila";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => { await cleanup(PFX); await closeDb(); });

async function clienta(key, clases = 8) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, clases);
  return c;
}
async function reservar(c, classId) {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return { id: bookingId(r), status: r.body.booking?.status, body: r.body };
}
const estado = async (id) => (await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [id]))[0].s;
const cancelarEstudio = (id) => api("DELETE", `/api/admin/bookings/${id}`, { token: A, body: { reason: "La movimos a otra clase" } });
const subidas = (id) => sql(`SELECT actor_id, actor_name, meta FROM audit_log WHERE entity_id = $1 AND action = 'booking.waitlist_promoted'`, [id]);

test("al cancelar el estudio sube la primera de la fila: confirmada, usa su clase y queda en la bitácora como Sistema", async () => {
  const a = await clienta("a1");
  const w1 = await clienta("w1");
  const w2 = await clienta("w2");
  const classId = await makeClass(A, f, { date: day(10), cap: 1 });
  const ra = await reservar(a, classId);
  const r1 = await reservar(w1, classId);
  const r2 = await reservar(w2, classId);
  assert.equal(r1.status, "waitlist");
  assert.equal(r2.status, "waitlist");
  assert.equal(await credits(w1.id), 8, "estar en la fila no usa clase");
  const c = await cancelarEstudio(ra.id);
  assert.equal(c.status, 200, JSON.stringify(c.body).slice(0, 200));
  assert.equal(await estado(r1.id), "confirmed");
  assert.equal(await estado(r2.id), "waitlist");
  assert.equal(await credits(w1.id), 7, "usa su clase como una reserva normal");
  assert.equal(await liveBookings(classId), 1);
  const [log] = await subidas(r1.id);
  assert.equal(log.actor_id, null);
  assert.equal(log.actor_name, "Sistema");
  assert.equal(log.meta.actor, "system");
  assert.equal(log.meta.position, 1);
  const [b] = await sql(`SELECT promoted_at FROM bookings WHERE id = $1`, [r1.id]);
  assert.ok(b.promoted_at);
  const promo = c.body.data.waitlist_promoted;
  assert.equal(promo.length, 1);
  assert.equal(promo[0].user_id, w1.id);
  assert.ok(["unreached", "disabled"].includes(promo[0].whatsapp), `sin WhatsApp conectado no se finge el aviso (${promo[0].whatsapp})`);
  const mias = await api("GET", "/api/bookings/my-bookings", { token: w2.token });
  assert.equal(mias.body.data.find((x) => x.id === r2.id).waitlist_position, 1, "la que sigue ya es la primera");
});

test("la primera sin clases se salta y sigue en la fila; sube la siguiente", async () => {
  const a = await clienta("a2");
  const sin = await clienta("sin");
  const w = await clienta("w3");
  const classId = await makeClass(A, f, { date: day(11), cap: 1 });
  const ra = await reservar(a, classId);
  const rs = await reservar(sin, classId);
  const rw = await reservar(w, classId);
  await sql(`UPDATE memberships SET classes_remaining = 0 WHERE user_id = $1`, [sin.id]);
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rs.id), "waitlist", "la saltada sigue en la fila");
  assert.equal(await estado(rw.id), "confirmed");
  const [log] = await subidas(rw.id);
  assert.equal(log.meta.position, 2);
  assert.deepEqual(log.meta.skipped.map((s) => [s.booking_id, s.reason]), [[rs.id, "sin_clases"]]);
  const roster = await api("GET", `/api/classes/${classId}/roster`, { token: A });
  const fila = roster.body.data.roster.filter((x) => x.status === "waitlist");
  assert.deepEqual(fila.map((x) => [x.bookingId, x.waitlistPosition]), [[rs.id, 1]]);
});

test("nadie se salta la fila: con un lugar libre y fila, la reserva nueva entra a la fila y sube la que esperaba", async () => {
  const a = await clienta("a3");
  const w = await clienta("w4");
  const nueva = await clienta("nueva");
  const classId = await makeClass(A, f, { date: day(12), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  // Un lugar que se liberó sin pasar por el gancho (p. ej. un reinicio a media cancelación).
  await sql(`UPDATE bookings SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`, [ra.id]);
  const rn = await reservar(nueva, classId);
  assert.equal(rn.status, "waitlist", "la nueva no se salta a quien ya esperaba");
  assert.equal(rn.body.message, "Añadido a lista de espera");
  assert.equal(await estado(rw.id), "confirmed", "sube la que esperaba");
  assert.equal(await liveBookings(classId), 1);
  const mias = await api("GET", "/api/bookings/my-bookings", { token: nueva.token });
  assert.equal(mias.body.data.find((x) => x.id === rn.id).waitlist_position, 1);
  const cls = await api("GET", `/api/classes/${classId}`);
  assert.equal(cls.body.data.waitlist_count, 1);
});

test("si las de adelante no pueden usar el lugar, sube la nueva (el lugar no se desperdicia)", async () => {
  const a = await clienta("a4");
  const sin = await clienta("sin2");
  const nueva = await clienta("nueva2");
  const classId = await makeClass(A, f, { date: day(13), cap: 1 });
  const ra = await reservar(a, classId);
  const rs = await reservar(sin, classId);
  await sql(`UPDATE memberships SET classes_remaining = 0 WHERE user_id = $1`, [sin.id]);
  await cancelarEstudio(ra.id);
  assert.equal(await liveBookings(classId), 0, "la única de la fila no tiene clases: nadie sube");
  const antes = await credits(nueva.id);
  const rn = await reservar(nueva, classId);
  assert.equal(rn.status, "confirmed");
  assert.equal(rn.body.message, "Reserva confirmada");
  assert.equal(await credits(nueva.id), antes - 1);
  assert.equal(await estado(rs.id), "waitlist");
});

test("a menos de 2 horas no sube nadie y recepción asigna directo el lugar libre", async () => {
  const a = await clienta("a5");
  const w = await clienta("w5");
  const walk = await clienta("walk");
  const v = ventanaAhora(90);
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end, cap: 1 });
  const asignar = (u) => api("POST", "/api/admin/bookings/assign", { token: A, body: { userId: u.id, classId } });
  assert.ok((await asignar(a)).status < 300);
  const enFila = await asignar(w);
  assert.equal(enFila.body.data.isWaitlist, true);
  const [ba] = await sql(`SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, a.id]);
  const [bw] = await sql(`SELECT id FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, w.id]);
  await cancelarEstudio(ba.id);
  assert.equal(await estado(bw.id), "waitlist", "a menos de 2 h no sube nadie");
  const directo = await asignar(walk);
  assert.equal(directo.status, 201, JSON.stringify(directo.body).slice(0, 200));
  assert.equal(directo.body.data.isWaitlist, false, "el lugar quedó libre: recepción asigna directo");
});

test("subir el cupo sube a la fila", async () => {
  const a = await clienta("a6");
  const w = await clienta("w6");
  const classId = await makeClass(A, f, { date: day(14), cap: 1 });
  await reservar(a, classId);
  const rw = await reservar(w, classId);
  const r = await api("PUT", `/api/admin/classes/${classId}`, { token: A, body: { maxCapacity: 2 } });
  assert.equal(r.status, 200);
  assert.equal(await estado(rw.id), "confirmed");
});

test("cancelar la membresía de una inscrita sube a la fila", async () => {
  const a = await clienta("a7");
  const w = await clienta("w7");
  const classId = await makeClass(A, f, { date: day(15), cap: 1 });
  await reservar(a, classId);
  const rw = await reservar(w, classId);
  const [m] = await sql(`SELECT id FROM memberships WHERE user_id = $1`, [a.id]);
  const r = await api("PUT", `/api/memberships/${m.id}/cancel`, { token: A, body: { reason: "Se mudó de ciudad" } });
  assert.equal(r.status, 200);
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal(r.body.waitlist_promoted.length, 1);
});

test("una clase cerrada no sube a nadie; al reabrirla sí", async () => {
  const a = await clienta("a8");
  const w = await clienta("w8");
  const classId = await makeClass(A, f, { date: day(16), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  assert.equal((await api("PUT", `/api/classes/${classId}/close`, { token: A })).status, 200);
  await cancelarEstudio(ra.id);
  assert.equal(await estado(rw.id), "waitlist");
  assert.equal((await api("PUT", `/api/classes/${classId}/reopen`, { token: A })).status, 200);
  assert.equal(await estado(rw.id), "confirmed");
});

test("dos liberaciones a la vez con dos en fila suben a las dos, una vez cada una, sin pasar el cupo", async () => {
  const a = await clienta("c1");
  const b = await clienta("c2");
  const w1 = await clienta("cw1");
  const w2 = await clienta("cw2");
  const classId = await makeClass(A, f, { date: day(17), cap: 2 });
  const ra = await reservar(a, classId);
  const rb = await reservar(b, classId);
  const r1 = await reservar(w1, classId);
  const r2 = await reservar(w2, classId);
  const [x, y] = await Promise.all([cancelarEstudio(ra.id), cancelarEstudio(rb.id)]);
  assert.equal(x.status, 200);
  assert.equal(y.status, 200);
  assert.equal(await estado(r1.id), "confirmed");
  assert.equal(await estado(r2.id), "confirmed");
  assert.equal(await liveBookings(classId), 2);
  assert.equal((await subidas(r1.id)).length, 1);
  assert.equal((await subidas(r2.id)).length, 1);
  assert.equal(await credits(w1.id), 7);
  assert.equal(await credits(w2.id), 7);
});

test("dos liberaciones a la vez con una sola en fila: sube una vez y queda un lugar libre", async () => {
  const a = await clienta("d1");
  const b = await clienta("d2");
  const w = await clienta("dw");
  const classId = await makeClass(A, f, { date: day(18), cap: 2 });
  const ra = await reservar(a, classId);
  const rb = await reservar(b, classId);
  const rw = await reservar(w, classId);
  await Promise.all([cancelarEstudio(ra.id), cancelarEstudio(rb.id)]);
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal((await subidas(rw.id)).length, 1, "no sube dos veces a la misma");
  assert.equal(await credits(w.id), 7, "una sola clase usada");
  assert.equal(await liveBookings(classId), 1);
});

test("cancelación y reserva nueva a la vez: sube la de la fila y la nueva queda detrás", async () => {
  const a = await clienta("e1");
  const w = await clienta("ew");
  const nueva = await clienta("en");
  const classId = await makeClass(A, f, { date: day(19), cap: 1 });
  const ra = await reservar(a, classId);
  const rw = await reservar(w, classId);
  const [, rn] = await Promise.all([
    cancelarEstudio(ra.id),
    api("POST", "/api/bookings", { token: nueva.token, body: { classId } }),
  ]);
  assert.ok(rn.status < 300, JSON.stringify(rn.body).slice(0, 150));
  assert.equal(await estado(rw.id), "confirmed");
  assert.equal(await estado(bookingId(rn)), "waitlist");
  assert.equal(await liveBookings(classId), 1);
});
```

`src/pages/admin/bookings/Waitlist.test.tsx`: agrega dentro del `describe`:

```tsx
  it("usa la posición del servidor, lo explica y marca a quien se salta por no tener clases", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/classes?start=": { data: [clase("c11", "11:00", "Reformer Intermedio", 2)] },
      "/classes/c11/roster": { data: {
        class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25" },
        roster: [
          { bookingId: "b3", status: "waitlist", waitlistPosition: 1, displayName: "Paula Herrera", email: null, phone: null, planName: "Paquete 4", classesRemaining: 0 },
          { bookingId: "b2", status: "waitlist", waitlistPosition: 2, displayName: "Regina López", email: null, phone: null, planName: "Paquete 8", classesRemaining: 4 },
        ] } },
    });
    renderAdmin(<Waitlist />, { route: "/admin/bookings/waitlist?clase=c11" });
    expect(await screen.findByText("Por orden de llegada. Si se libera un lugar hasta 2 horas antes, sube sola la primera que tenga clases disponibles.")).toBeInTheDocument();
    const detalle = await screen.findByRole("region", { name: "Quién espera" });
    const uno = (await within(detalle).findByLabelText("Posición 1")).closest("li")!;
    expect(within(uno).getByText("Paula Herrera")).toBeInTheDocument();
    expect(within(uno).getAllByText("Paquete 4 · Sin clases disponibles · se salta").length).toBeGreaterThan(0);
    const dos = within(detalle).getByLabelText("Posición 2").closest("li")!;
    expect(within(dos).getByText("Regina López")).toBeInTheDocument();
  });
```

`src/pages/admin/bookings/BookingsList.subida.test.tsx`:

```tsx
// Auditoría 2026-09-27, bloque 3 (P1-1): al cancelar una reserva, el aviso dice
// quién subió de la lista de espera y si hay que avisarle a mano.
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import BookingsList from "./BookingsList";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; put: Mock; delete: Mock };

const semana = {
  data: [
    { id: "c11", date: "2026-09-25", start_time: "2026-09-25T11:00:00", class_type_name: "Reformer Intermedio", instructor_name: "Fer", max_capacity: 8, current_bookings: 8, waitlist_count: 1 },
  ],
};
const roster = {
  data: {
    class: { classTypeName: "Reformer Intermedio", startsAt: "2026-09-25T11:00:00", date: "2026-09-25", instructorName: "Fer" },
    roster: [
      { bookingId: "b1", status: "confirmed", checkedInAt: null, userId: "u1", displayName: "Ana", email: "ana@x.com", phone: "5512345678", planName: "Paquete 8", classesRemaining: 3 },
      { bookingId: "b9", status: "waitlist", checkedInAt: null, userId: "u9", displayName: "Regina López", email: "regi@x.com", phone: "5578901234", planName: "Paquete 8", classesRemaining: 4, waitlistPosition: 1 },
    ],
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.put.mockReset();
  mockApi.delete.mockReset();
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, {
    "/admin/stats": { pendingAlerts: 0 },
    "/classes?start=": semana,
    "/classes/c11/roster": roster,
    "/loyalty/config": { data: { faltas_cancel_window_hours: 12 } },
    "/users?role=client": { data: [] },
  });
});
afterEach(() => vi.useRealTimers());

async function cancelarReservaDeAna() {
  renderAdmin(<BookingsList />, { route: "/admin/bookings?clase=c11", path: "/admin/bookings" });
  const lista = await screen.findByRole("region", { name: "Lista de la clase" });
  await within(lista).findByText("Ana");
  fireEvent.keyDown(within(lista).getByRole("button", { name: "Más acciones para Ana" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: "Cancelar reserva (devuelve crédito)" }));
  const dlg = await screen.findByRole("dialog", { name: "Cancelar reserva de Ana" });
  fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "Nos pidió moverla" } });
  fireEvent.click(within(dlg).getByRole("button", { name: "Cancelar reserva" }));
}

describe("Reservas · subida de la lista de espera (P1-1)", () => {
  it("dice quién subió y pide avisarle a mano si no le llegó el WhatsApp", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [
      { booking_id: "b9", user_id: "u9", display_name: "Regina López", phone: "5578901234", whatsapp: "unreached", email: "queued" },
    ] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada",
      description: "Crédito devuelto a la alumna. Subió de la lista de espera: Regina López. Avísale tú: no le llegó el WhatsApp.",
    })));
  });

  it("con el WhatsApp enviado no pide avisar a mano", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [
      { booking_id: "b9", user_id: "u9", display_name: "Regina López", phone: "5578901234", whatsapp: "queued", email: "queued" },
    ] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      description: "Crédito devuelto a la alumna. Subió de la lista de espera: Regina López.",
    })));
  });

  it("sin nadie en la fila el aviso es el de siempre", async () => {
    mockApi.delete.mockResolvedValue({ data: { data: { id: "b1", credit_restored: true, waitlist_promoted: [] } } });
    await cancelarReservaDeAna();
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada", description: "Crédito devuelto a la alumna.",
    })));
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/waitlist.test.js` → FAIL.
  - `npx vitest run src/pages/admin/bookings` → FAIL.
  - En tu base (5594/8194), `lista-espera.test.mjs` → FAIL: nadie sube y la nueva queda confirmada.

- [ ] **Step 3: Implementar.**

`server/lib/waitlist.js`:

```js
// Reglas puras de la lista de espera con subida automática (auditoría
// 2026-09-27, P1-1). La subida vive en server/index.js (promoteOneFromWaitlist).
const HOUR_MS = 60 * 60 * 1000;

const ms = (v) => (v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v ?? ""));

/** ¿Todavía aplica la subida? Sólo si faltan cutoffHours o más para el inicio. */
export function promotionWindowOpen(startsAt, now = Date.now(), cutoffHours = 2) {
  const t = ms(startsAt);
  const n = ms(now);
  if (!Number.isFinite(t) || !Number.isFinite(n)) return false;
  return t - n >= Number(cutoffHours) * HOUR_MS;
}

export function freeSeats(capacity, live) {
  return Math.max(0, (Number(capacity) || 0) - (Number(live) || 0));
}

/** Con fila y subida vigente, una reserva nueva entra a la fila aunque haya
 *  lugar: nadie se salta la fila. A menos de cutoffHours el lugar queda libre. */
export function queueBlocksNewBooking({ waiting, startsAt, now = Date.now(), cutoffHours = 2 }) {
  return Number(waiting) > 0 && promotionWindowOpen(startsAt, now, cutoffHours);
}

/** La primera que cumple, en orden de llegada, y las que se saltaron antes que ella. */
export function firstEligible(candidates = []) {
  const skipped = [];
  for (const c of candidates) {
    if (!c.reason) return { promote: c, skipped };
    skipped.push(c);
  }
  return { promote: null, skipped };
}
```

En `server/index.js`:

**Import**, tras `import { planWeekClear, weekRangeProblem } from "./lib/weekClear.js";`:

```js
import { promotionWindowOpen, freeSeats, queueBlocksNewBooking, firstEligible } from "./lib/waitlist.js";
```

**`onSeatReleased` (dejado por la Tarea 1):** reemplaza la función completa, con su comentario, por:

```js
// ── Lista de espera: subida automática (auditoría 2026-09-27, P1-1) ─────────
// Se liberó uno o más lugares. Lo llaman, DESPUÉS de su COMMIT y con await,
// todas las vías que liberan cupo. Sube, clase por clase, a la primera de la
// fila (orden de llegada) que pueda usar el lugar:
//   - membresía vigente con clases para esa categoría;
//   - AM Club y tope semanal respetados.
// La que no cumple se salta y sigue en la fila. Sólo en clases 'scheduled' y
// hasta BOOKING_LEAD_HOURS antes del inicio; después el lugar queda libre.
// Concurrencia: cada subida es su propia transacción y empieza con
// SELECT … FOR UPDATE de la clase. Así dos liberaciones a la vez se forman, y
// ninguna sube dos veces a la misma ni pasa el cupo. Una subida bloquea una
// sola membresía, así que no se interbloquea con reservas ni cancelaciones.
// Nunca lanza. ctx: { source?, quietUserIds? }.
async function onSeatReleased(classIds, ctx = {}) {
  const ids = [...new Set([].concat(classIds ?? []).map((x) => String(x ?? "")).filter((x) => isUuid(x)))];
  const out = [];
  for (const id of ids) {
    try {
      out.push(...(await promoteWaitlist(id, { quietUserIds: ctx.quietUserIds ?? [] })));
    } catch (err) {
      console.error(`[waitlist] no se pudo subir la fila de ${id} (${ctx.source ?? "?"}):`, err?.message);
    }
  }
  return out;
}

const waitingCount = async (classId, db = pool) =>
  Number((await db.query(
    "SELECT COUNT(*)::int AS n FROM bookings WHERE class_id = $1 AND status = 'waitlist'", [classId],
  )).rows[0]?.n ?? 0);

/** Una subida, en su propia transacción. null = nada que hacer; { retry } = revisar otra vez. */
async function promoteOneFromWaitlist(classId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const c = await client.query(
      `SELECT c.id, c.status::text AS status, c.max_capacity, c.date, c.start_time,
              to_char(c.date, 'YYYY-MM-DD') AS day,
              ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') AS starts_at,
              ct.category AS class_category, ct.name AS class_name, i.display_name AS instructor_name
         FROM classes c
         JOIN class_types ct ON ct.id = c.class_type_id
         LEFT JOIN instructors i ON i.id = c.instructor_id
        WHERE c.id = $1
        FOR UPDATE OF c`,
      [classId],
    );
    const cls = c.rows[0];
    if (!cls || cls.status !== "scheduled" || !promotionWindowOpen(cls.starts_at, Date.now(), BOOKING_LEAD_HOURS)) {
      await client.query("ROLLBACK");
      return null;
    }
    if (freeSeats(cls.max_capacity, await liveBookingCount(classId, client)) <= 0) {
      await client.query("ROLLBACK");
      return null;
    }
    const queue = (await client.query(
      `SELECT id, user_id FROM bookings
        WHERE class_id = $1 AND status = 'waitlist'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE`,
      [classId],
    )).rows;
    const category = normalizeClassCategory(cls.class_category, "all");
    const candidates = [];
    for (const [i, w] of queue.entries()) {
      const mem = w.user_id ? await selectMembershipForClass({ userId: w.user_id, classCategory: category, client }) : null;
      let reason = null;
      if (!mem) reason = "sin_clases";
      else if (mem.morning_only && !isWithinMorningWindow(cls.starts_at)) reason = "solo_manana";
      else if (!(await checkWeeklyClassLimit(client, w.user_id, mem.id, cls.date)).ok) reason = "tope_semanal";
      candidates.push({ bookingId: w.id, userId: w.user_id, membershipId: mem?.id ?? null, position: i + 1, reason });
      if (!reason) break; // la primera que cumple; las de atrás siguen esperando
    }
    const { promote, skipped } = firstEligible(candidates);
    if (!promote) {
      await client.query("ROLLBACK");
      return null;
    }
    const locked = (await client.query(
      "SELECT id, classes_remaining FROM memberships WHERE id = $1 FOR UPDATE", [promote.membershipId],
    )).rows[0];
    if (!locked || (!isUnlimitedClasses(locked.classes_remaining) && Number(locked.classes_remaining) <= 0)) {
      // Gastó su última clase entre la revisión y el candado: la siguiente vuelta la salta.
      await client.query("ROLLBACK");
      return { retry: true };
    }
    await client.query(
      "UPDATE bookings SET status = 'confirmed', membership_id = $2, promoted_at = NOW() WHERE id = $1",
      [promote.bookingId, promote.membershipId],
    );
    // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
    if (!isUnlimitedClasses(locked.classes_remaining)) {
      await consumeMembershipCredit(client, promote.membershipId, classId);
    }
    await recordAudit(client, {
      systemActor: "system", action: "booking.waitlist_promoted", entityType: "booking",
      entityId: promote.bookingId, subjectUserId: promote.userId,
      before: { status: "waitlist" }, after: { status: "confirmed" },
      meta: {
        class_id: cls.id, class_name: cls.class_name, day: cls.day, start_time: String(cls.start_time).slice(0, 5),
        position: promote.position, membership_id: promote.membershipId,
        skipped: skipped.map((s) => ({ booking_id: s.bookingId, position: s.position, reason: s.reason })),
      },
    });
    await client.query("COMMIT");
    return { bookingId: promote.bookingId, userId: promote.userId, membershipId: promote.membershipId, cls };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Sube mientras haya lugar y alguien que cumpla; luego avisa (salvo a quietUserIds). */
async function promoteWaitlist(classId, { quietUserIds = [] } = {}) {
  const promoted = [];
  for (let vuelta = 0; vuelta < 50; vuelta++) {
    const p = await promoteOneFromWaitlist(classId);
    if (!p) break;
    if (p.retry) continue;
    promoted.push(p);
  }
  const out = [];
  for (const p of promoted) {
    const aviso = quietUserIds.includes(p.userId)
      ? { whatsapp: "skipped", email: "skipped" }
      : await notifyWaitlistPromoted(p);
    const u = (await pool.query("SELECT display_name, phone FROM users WHERE id = $1", [p.userId]).catch(() => ({ rows: [] }))).rows[0] ?? {};
    out.push({ booking_id: p.bookingId, user_id: p.userId, display_name: u.display_name ?? null, phone: u.phone ?? null, ...aviso });
  }
  return out;
}

// Aviso de la subida, con la regla honesta del bloque 1: con el canal de
// WhatsApp caído o los avisos apagados no se intenta y se dice
// ("unreached" | "disabled"), para que recepción avise a mano. Va también el
// correo de "reserva confirmada" y se sincroniza el pase. La plantilla
// "waitlist_promoted" no está en DEFAULT_NOTIFICATION_TEMPLATES: sale el texto
// de respaldo, salvo que se guarde una plantilla con esa llave.
async function notifyWaitlistPromoted(p) {
  const out = { whatsapp: "skipped", email: "skipped" };
  try {
    triggerWalletPassSync(p.userId, "waitlist_promoted");
    const cls = p.cls;
    const dateStr = cls.date ? new Date(cls.date).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" }) : "";
    const timeStr = cls.start_time ? String(cls.start_time).slice(0, 5) : "";
    const className = cls.class_name || "tu clase";
    const notif = await getSettingsValue("notification_settings", DEFAULT_NOTIFICATION_SETTINGS);
    const waOn = notif?.whatsapp_reminders !== false;
    const channel = waOn ? await whatsappChannelState() : { connected: false, state: "disabled" };
    if (!channel.connected) {
      out.whatsapp = channel.state === "disabled" ? "disabled" : "unreached";
    } else {
      const r = await notifyByTemplate(
        p.userId,
        "waitlist_promoted",
        { class: className, date: dateStr, time: timeStr },
        ({ firstName }) =>
          `${firstName}, se liberó un lugar en ${className}${dateStr ? ` del ${dateStr}` : ""}${timeStr ? ` a las ${timeStr}` : ""} y ya quedó a tu nombre: se usó una clase de tu paquete. Si no puedes ir, cancela desde la app; aplican las reglas de cancelación.`,
      );
      out.whatsapp = r?.sent ? "queued" : "failed";
    }
    const u = (await pool.query("SELECT email, display_name FROM users WHERE id = $1", [p.userId])).rows[0];
    if (u?.email && (await areEmailNotificationsEnabled())) {
      const mem = p.membershipId
        ? (await pool.query("SELECT classes_remaining FROM memberships WHERE id = $1", [p.membershipId])).rows[0]
        : null;
      const cfg = await getLoyaltyConfig();
      sendBookingConfirmed({
        to: u.email, name: u.display_name || "Alumna", className, date: cls.date, startTime: cls.start_time,
        instructor: cls.instructor_name, classesLeft: mem?.classes_remaining ?? null, isWaitlist: false,
        cancelHours: cfg.faltas_cancel_window_hours,
      }).catch((e) => console.error("[Email] subida de lista de espera:", e.message));
      out.email = "queued";
    }
  } catch (e) {
    console.warn("[waitlist] aviso de subida:", e?.message);
  }
  return out;
}

// Red de seguridad: clases con lugar libre y fila, por si una subida no ocurrió
// (un reinicio a media cancelación o una vía sin gancho). Lo corre
// scheduleEmailCrons cada WAITLIST_SWEEP_MINUTES.
async function runWaitlistSweep() {
  const r = await pool.query(
    `SELECT c.id FROM classes c
      WHERE c.status = 'scheduled'
        AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') >= NOW() + make_interval(hours => $1)
        AND c.date <= (NOW() AT TIME ZONE '${STUDIO_TIMEZONE}')::date + 60
        AND EXISTS (SELECT 1 FROM bookings w WHERE w.class_id = c.id AND w.status = 'waitlist')
        AND (SELECT COUNT(*) FROM bookings b
              WHERE b.class_id = c.id AND b.status IN ('confirmed', 'checked_in')) < c.max_capacity`,
    [BOOKING_LEAD_HOURS],
  );
  if (r.rows.length) await onSeatReleased(r.rows.map((x) => x.id), { source: "sweep" });
}
```

**`GET /api/classes/:id`:** tras `row.current_bookings = await liveBookingCount(req.params.id);` agrega `row.waitlist_count = await waitingCount(req.params.id);`.

**`GET /api/bookings/my-bookings`:**
- En el `SELECT`, tras `f.name AS facility_name` agrega:

```sql
              , CASE WHEN b.status = 'waitlist' THEN (
                  SELECT COUNT(*)::int + 1 FROM bookings w
                   WHERE w.class_id = b.class_id AND w.status = 'waitlist'
                     AND (w.created_at, w.id) < (b.created_at, b.id)
                ) END AS waitlist_position_live
```

- `return res.json({ data: r.rows });` pasa a:

```js
    // waitlist_position en vivo por orden de llegada (antes salía siempre null).
    return res.json({
      data: r.rows.map(({ waitlist_position_live, ...row }) => ({ ...row, waitlist_position: waitlist_position_live ?? null })),
    });
```

**`POST /api/bookings`:** reemplaza desde `const isWaitlist = (await liveBookingCount(classId, client)) >= cls.max_capacity;` hasta `await client.query("COMMIT");` (inclusive) por:

```js
    // Lista de espera por orden de llegada (auditoría 2026-09-27, P1-1): si ya
    // hay fila y la subida aplica, la reserva nueva entra a la fila aunque haya
    // lugar. Tras el COMMIT corre la subida: si las de adelante no pueden usar el
    // lugar, sube ella. Nadie se salta la fila y el lugar no se desperdicia.
    const liveNow = await liveBookingCount(classId, client);
    const queueFirst = queueBlocksNewBooking({
      waiting: await waitingCount(classId, client), startsAt: cls.starts_at, now: Date.now(), cutoffHours: BOOKING_LEAD_HOURS,
    });
    const insertAsWaitlist = liveNow >= cls.max_capacity || queueFirst;
    const status = insertAsWaitlist ? "waitlist" : "confirmed";
    const result = await client.query(
      `INSERT INTO bookings (class_id, user_id, membership_id, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [classId, req.userId, membership.id, status]
    );

    if (!insertAsWaitlist) {
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
      if (!isUnlimitedClasses(lockedMembership.classes_remaining)) {
        // Descuenta total y, si es mixto, el bucket del área de la clase.
        await consumeMembershipCredit(client, membership.id, classId);
      }
    }
    await client.query("COMMIT");

    if (insertAsWaitlist && liveNow < cls.max_capacity) {
      await onSeatReleased([classId], { source: "new_booking", quietUserIds: [req.userId] });
      const final = await pool.query("SELECT status::text AS status FROM bookings WHERE id = $1", [result.rows[0].id]);
      if (final.rows[0]?.status) result.rows[0].status = final.rows[0].status;
    }
    const isWaitlist = result.rows[0].status === "waitlist";
```

(Todo lo que sigue en la ruta, el correo, el WhatsApp y el mensaje, ya usa `isWaitlist` y queda igual.)

**`PUT /api/classes/:id/reopen`:** reemplaza `return res.json({ data: r.rows[0] });` por:

```js
    // Mientras estuvo cerrada no subió nadie: al reabrir, sube la fila (P1-1).
    const promoted = await onSeatReleased([req.params.id], { source: "reopen" });
    return res.json({ data: r.rows[0], waitlist_promoted: promoted });
```

**`DELETE /api/admin/bookings/:id`** (versión del bloque 2): reemplaza su `return res.json({ data: { id: booking.id, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted, reason: why } });` por:

```js
    // Si ocupaba lugar, sube la fila (P1-1). La respuesta dice a quién, para
    // que recepción avise a mano si no le llegó el WhatsApp.
    const promoted = ["confirmed", "checked_in"].includes(booking.status)
      ? await onSeatReleased([booking.class_id], { source: "studio_cancel" })
      : [];
    return res.json({ data: {
      id: booking.id, credit_restored: rb.creditRestored, points_reverted: rb.pointsReverted, reason: why,
      waitlist_promoted: promoted,
    } });
```

**`PUT /api/memberships/:id/cancel`:** reemplaza el bloque desde `triggerWalletPassSync(membership.user_id, "membership_cancelled");` hasta el `});` del `return res.json({…})` por:

```js
    triggerWalletPassSync(membership.user_id, "membership_cancelled");
    // Los lugares que dejan sus reservas futuras suben la fila (P1-1).
    const promoted = await onSeatReleased(futureBookings.rows.map((b) => b.class_id), { source: "membership_cancel" });

    return res.json({
      data: membership,
      bookings_cancelled: bookingsCancelled,
      reason: cancellationReason,
      waitlist_promoted: promoted,
    });
```

**`POST /api/admin/bookings/assign`:**
1. Reemplaza `const isWaitlist = (await liveBookingCount(classId, client)) >= cls.max_capacity;` por:

```js
    // Misma regla que la app (P1-1): con fila y subida vigente, la socia entra a
    // la fila aunque haya lugar; a menos de 2 h el lugar queda libre y se asigna.
    const liveNow = await liveBookingCount(classId, client);
    const queueFirst = queueBlocksNewBooking({
      waiting: await waitingCount(classId, client), startsAt: cls.starts_at, now: Date.now(), cutoffHours: BOOKING_LEAD_HOURS,
    });
    let isWaitlist = liveNow >= cls.max_capacity || queueFirst;
```

2. En el 409 de la acompañante, el mensaje pasa a `"La socia quedaría en lista de espera (la clase está llena o ya tiene fila); no se puede agregar acompañante."`.
3. Justo después del `await client.query("COMMIT");` de esta ruta (antes del `try {` del correo):

```js
    if (isWaitlist && liveNow < cls.max_capacity) {
      // Entró a la fila con lugar libre: corre la subida (quizá sube ella).
      await onSeatReleased([classId], { source: "new_booking", quietUserIds: [userId] });
      const st = await pool.query("SELECT status::text AS status FROM bookings WHERE id = $1", [result.rows[0].id]);
      if (st.rows[0]?.status === "confirmed") {
        isWaitlist = false;
        result.rows[0].status = "confirmed";
      }
    }
```

**`GET /api/classes/:id/roster`:**
- En el `SELECT`, tras `… AS first_visit` agrega:

```sql
              , CASE WHEN b.status = 'waitlist' THEN (
                  SELECT COUNT(*)::int + 1 FROM bookings w
                   WHERE w.class_id = b.class_id AND w.status = 'waitlist'
                     AND (w.created_at, w.id) < (b.created_at, b.id)
                ) END AS waitlist_position
```

- El `ORDER BY` pasa a:

```sql
       ORDER BY CASE b.status
         WHEN 'confirmed'  THEN 1
         WHEN 'checked_in' THEN 2
         WHEN 'waitlist'   THEN 3
         WHEN 'no_show'    THEN 4
         ELSE 5 END,
         CASE WHEN b.status = 'waitlist' THEN b.created_at END ASC NULLS LAST,
         u.display_name ASC
```

**`PUT /api/admin/classes/:id`:** reemplaza su `return res.json({ data: r.rows[0] });` por:

```js
    // Más cupo = lugares nuevos: sube la fila (P1-1).
    const promoted = newCap != null ? await onSeatReleased([req.params.id], { source: "capacity" }) : [];
    return res.json({ data: r.rows[0], waitlist_promoted: promoted });
```

**`scheduleEmailCrons()`:** justo después del `setInterval(…runClassReminderCron()…, 10 * 60 * 1000);`:

```js
  // ── Lista de espera: barrido de respaldo (auditoría 2026-09-27, P1-1) ──
  // WAITLIST_SWEEP_MINUTES=0 lo apaga (la base de pruebas lo apaga).
  const sweepMin = Number(process.env.WAITLIST_SWEEP_MINUTES ?? 5);
  if (Number.isFinite(sweepMin) && sweepMin > 0) {
    setInterval(() => {
      runWaitlistSweep().catch((e) => console.error("[Cron] lista de espera:", e?.message));
    }, sweepMin * 60 * 1000);
  }
```

**`src/pages/admin/bookings/Waitlist.tsx`:**
- En `WaitEntry` agrega `waitlistPosition?: number | null;`.
- El `subtitle` del `AdminPageHeader` pasa a `"Por orden de llegada. Si se libera un lugar hasta 2 horas antes, sube sola la primera que tenga clases disponibles."`.
- Dentro de `people.map((p, i) => {`:
  - Tras `const unlimited = …`:

```tsx
            const pos = p.waitlistPosition ?? i + 1;
            // Sin clases la subida la salta (sigue en la fila, P1-1).
            const sinClases = !unlimited && Number(p.classesRemaining) <= 0;
```

  - `const planText = …` pasa a:

```tsx
            const planText = p.planName
              ? `${p.planName} · ${unlimited ? "Ilimitado" : sinClases ? "Sin clases disponibles · se salta" : `${p.classesRemaining} clases`}`
              : "Sin plan";
```

  - En el `<span className="nums text-center font-display …">` de la posición, `aria-label={`Posición ${i + 1}`}` pasa a `aria-label={`Posición ${pos}`}` y su contenido `{i + 1}` pasa a `{pos}`.

**`src/pages/admin/bookings/BookingsList.tsx`:** en `cancelMutation.onSuccess`, reemplaza la llamada `toast({ title: "Reserva cancelada", description: restored ? … })` por:

```tsx
      // Si alguien subió de la lista de espera, se dice; si no le llegó el
      // WhatsApp, recepción le avisa a mano (auditoría 2026-09-27, P1-1).
      const subio: { display_name?: string | null; whatsapp?: string }[] = res?.data?.data?.waitlist_promoted ?? [];
      const nombres = subio.map((p) => p.display_name ?? "una alumna").join(", ");
      toast({
        title: "Reserva cancelada",
        description: [
          restored ? "Crédito devuelto a la alumna." : "Cancelada (sin crédito por devolver).",
          subio.length ? `Subió de la lista de espera: ${nombres}.` : null,
          subio.some((p) => p.whatsapp !== "queued") ? "Avísale tú: no le llegó el WhatsApp." : null,
        ].filter(Boolean).join(" "),
      });
      if (subio.length) qc.invalidateQueries({ queryKey: ["waitlist-roster"] });
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/bookings` → PASS.
  - En tu base (5594/8194, con `WAITLIST_SWEEP_MINUTES=0`): `lista-espera.test.mjs` más `panel.test.mjs`, `creditos.test.mjs`, `cancelaciones-semana.test.mjs`, `responsiva-vias.test.mjs`, `checkin-regla.test.mjs`, `roster-salud.test.mjs` y `robustez.test.mjs` → PASS.
  - Corre `lista-espera.test.mjs` tres veces seguidas: las pruebas de concurrencia no deben fallar ninguna vez.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/waitlist.js server/lib/waitlist.test.js server/index.js server/tests/lista-espera.test.mjs src/pages/admin/bookings/Waitlist.tsx src/pages/admin/bookings/Waitlist.test.tsx src/pages/admin/bookings/BookingsList.tsx src/pages/admin/bookings/BookingsList.subida.test.tsx
git commit -m "fix(hive): la lista de espera sube sola por orden de llegada hasta 2 h antes, nadie se la salta y la posición ya no sale vacía"
```

---


### Task 5: App de clientas — una sola política, "te quedan N" y la lista de espera (P0-4 · P1-1)

**Files:**
- Modify: `src/pages/client/BookClassConfirm.tsx`, `src/pages/client/MyBookings.tsx`, `src/pages/client/BookClasses.tsx`, `src/pages/legal/Cancelacion.tsx`.
- Create: `src/pages/client/BookClassConfirm.test.tsx`, `src/pages/client/MyBookings.cancelar.test.tsx`, `src/pages/client/BookClasses.fila.test.tsx`, `src/pages/legal/Cancelacion.test.tsx`.
- Sin cambios en el servidor.

**Interfaces:**
- Consumes:
  - **Task 1:** `useBookingPolicy`, `cancellationRules`, `waitlistRule` y `cancellationsLeftText` de `src/lib/booking-policy.ts`.
  - **Task 2:** `LegalLayout`, `LegalContact`, `LegalH2`, `LegalSkeleton`, `LegalUpdated` y `STUDIO.name`.
  - **Contratos de API** (en vitest se simulan; los sirven las tareas 3 y 4):
    - `GET /api/public/booking-policy` → `{ data: BookingPolicy }`;
    - `GET /api/memberships/my` y `/mine/all` → `cancellationsUsed`, `cancellationLimit` y `cancellationsLeft` (`null` si no hay límite);
    - `GET /api/bookings/my-bookings` → `waitlist_position`, `membership_id`;
    - `GET /api/classes/:id` → `waitlist_count`;
    - `DELETE /api/bookings/:id` → `{ message, creditRestored, leftWaitlist, … }`.
- Produces: pantallas (spec §3.4). Nada que consuman otras tareas.

- [ ] **Step 1: Pruebas en rojo.**

`src/pages/client/BookClassConfirm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import api from "@/lib/api";
import BookClassConfirm from "./BookClassConfirm";
import { renderPage, respuestas } from "@/test/renderPage";
import { cancellationRules, waitlistRule, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 3, cancelWindowHours: 24 };
const CLASE = {
  id: "c1", class_type_name: "Reformer", instructor_name: "Ana",
  start_time: "2026-09-26T10:00:00", end_time: "2026-09-26T10:50:00", max_capacity: 4, current_bookings: 2, waitlist_count: 0,
};
const MEM = { status: "active", classesRemaining: 5, planName: "Paquete 8", cancellationsUsed: 1, cancellationLimit: 3, cancellationsLeft: 2 };

function montar(clase: Record<string, unknown> = CLASE, membresia: Record<string, unknown> = MEM) {
  vi.mocked(api.get).mockImplementation(respuestas({
    "/classes/c1": { data: clase },
    "/memberships/my": { data: membresia },
    "/public/booking-policy": { data: POLITICA },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
  return renderPage(<Routes><Route path="/app/classes/:classId" element={<BookClassConfirm />} /></Routes>, "/app/classes/c1");
}

beforeEach(() => { vi.mocked(api.get).mockReset(); });

describe("Detalle de clase · política y fila (P0-4 · P1-1)", () => {
  it("las reglas son las de la política configurada, iguales a /legal/cancelacion, y dice cuántas le quedan", async () => {
    montar();
    const reglas = await screen.findByRole("list", { name: "Reglas de cancelación" });
    await within(reglas).findByText(cancellationRules(POLITICA)[0]);
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA));
    expect(screen.getByText("Te quedan 2 cancelaciones de este paquete.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la política completa" })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.queryByText(/no cuenta como falta/)).toBeNull();
    expect(screen.getByText(waitlistRule(POLITICA))).toBeInTheDocument();
  });

  it("con fila y lugares libres, la clase se ofrece como lista de espera", async () => {
    montar({ ...CLASE, current_bookings: 2, waitlist_count: 1 });
    expect(await screen.findByRole("button", { name: "Unirme a la lista de espera" })).toBeInTheDocument();
    expect(screen.getByText("Lista de espera")).toBeInTheDocument();
  });

  it("con la cuota agotada lo dice antes de reservar", async () => {
    montar(CLASE, { ...MEM, cancellationsUsed: 3, cancellationsLeft: 0 });
    expect(await screen.findByText("Ya usaste tus 3 cancelaciones de este paquete.")).toBeInTheDocument();
  });

  it("sin límite no muestra el contador", async () => {
    montar(CLASE, { ...MEM, cancellationLimit: 0, cancellationsLeft: null });
    await screen.findByRole("list", { name: "Reglas de cancelación" });
    expect(screen.queryByText(/cancelaciones de este paquete/)).toBeNull();
  });
});
```

`src/pages/client/MyBookings.cancelar.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, within, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import MyBookings from "./MyBookings";
import { renderPage, respuestas } from "@/test/renderPage";
import { cancellationRules, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));

const AHORA = new Date(2026, 8, 23, 10, 0);
const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 2 };
const RESERVAS = [
  { id: "b3", class_id: "c3", membership_id: "m1", class_type_name: "Mat", instructor_name: "Ana", start_time: "2026-09-26T10:00:00", status: "confirmed" },
  { id: "b4", class_id: "c4", membership_id: "m1", class_type_name: "Reformer", instructor_name: "Ana", start_time: "2026-09-27T10:00:00", status: "waitlist", waitlist_position: 2 },
];
const mem = (left: number) => ({ id: "m1", status: "active", cancellationsUsed: 2 - left, cancellationLimit: 2, cancellationsLeft: left });

function montar(left = 1) {
  vi.mocked(api.get).mockImplementation(respuestas({
    "/bookings/my-bookings": { data: RESERVAS },
    "/memberships/mine/all": { data: [mem(left)] },
    "/public/booking-policy": { data: POLITICA },
    "/public/review-tags": { data: [] },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
  renderPage(<MyBookings />, "/app/bookings");
}

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  toastSpy.mockReset();
  vi.mocked(api.delete).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Mis clases · cancelar y lista de espera (P0-4 · P1-1)", () => {
  it("el diálogo de cancelar lista las mismas reglas y cuántas le quedan; el aviso usa el mensaje del servidor", async () => {
    montar(1);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Cancelar tu reserva?" });
    const reglas = within(dlg).getByRole("list", { name: "Reglas de cancelación" });
    await waitFor(() => expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA)));
    expect(within(dlg).getByText("Te queda 1 cancelación de este paquete.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { message: "Reserva cancelada. Se devolvió el crédito a tu paquete.", creditRestored: true, leftWaitlist: false } } as never);
    fireEvent.click(within(dlg).getByRole("button", { name: "Sí, cancelar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/bookings/b3"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({
      title: "Reserva cancelada", description: "Reserva cancelada. Se devolvió el crédito a tu paquete.",
    })));
  });

  it("con la cuota agotada no ofrece cancelar y manda a recepción", async () => {
    montar(0);
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Cancelar tu reserva?" });
    expect(await within(dlg).findByText("Ya usaste tus 2 cancelaciones de este paquete.")).toBeInTheDocument();
    expect(within(dlg).getByText("Si necesitas cancelar, habla con recepción.")).toBeInTheDocument();
    expect(within(dlg).queryByRole("button", { name: "Sí, cancelar" })).toBeNull();
  });

  it("en la fila dice su lugar y puede salir sin usar una cancelación, aunque la cuota esté agotada", async () => {
    montar(0);
    expect(await screen.findByText("Lugar 2 en la fila")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salir de la lista de espera" }));
    const dlg = await screen.findByRole("alertdialog", { name: "¿Salir de la lista de espera?" });
    expect(within(dlg).getByText("Dejas tu lugar en la fila. No usa una cancelación de tu paquete.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { message: "Saliste de la lista de espera. No usa una cancelación de tu paquete.", creditRestored: false, leftWaitlist: true } } as never);
    fireEvent.click(within(dlg).getByRole("button", { name: "Sí, salir" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/bookings/b4"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Saliste de la lista de espera" })));
  });
});
```

`src/pages/client/BookClasses.fila.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import api from "@/lib/api";
import BookClasses from "./BookClasses";
import { renderPage, respuestas } from "@/test/renderPage";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const AHORA = new Date(2026, 8, 23, 10, 0);
Element.prototype.scrollTo = () => {};

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
  vi.mocked(api.get).mockImplementation(respuestas({
    "/classes": { data: [
      { id: "fila", start_time: "2026-09-23T18:00:00", end_time: "2026-09-23T18:50:00", class_type_name: "Reformer", instructor_name: "Ana", current_bookings: 2, max_capacity: 4, waitlist_count: 1 },
    ] },
    "/memberships/my": { data: { status: "active", classCategory: "all", classesRemaining: 5 } },
    "/me/notifications/unread-count": { data: { unread_count: 0 } },
  }) as never);
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("Reservar: con fila, la clase es lista de espera aunque haya lugares (P1-1)", () => {
  it("nadie se salta la fila desde el calendario", async () => {
    renderPage(<BookClasses />, "/app/classes");
    expect((await screen.findAllByRole("button", { name: /Lista de espera/ })).length).toBeGreaterThan(0);
    expect(screen.queryByText("Pocos lugares")).toBeNull();
  });
});
```

`src/pages/legal/Cancelacion.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
import api from "@/lib/api";
import Cancelacion from "./Cancelacion";
import { cancellationRules, waitlistRule, DEFAULT_BOOKING_POLICY } from "@/lib/booking-policy";

const POLITICA = { ...DEFAULT_BOOKING_POLICY, cancellationLimit: 3, cancelWindowHours: 24 };
const montar = () => {
  vi.mocked(api.get).mockResolvedValue({ data: { data: POLITICA } } as never);
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Cancelacion /></MemoryRouter>
    </QueryClientProvider>,
  );
};

describe("Política de cancelación de HIVE (P0-4 · punto 7)", () => {
  it("publica las mismas reglas que la app, con la configuración real", async () => {
    montar();
    const reglas = await screen.findByRole("list", { name: "Reglas de cancelación" });
    expect(within(reglas).getAllByRole("listitem").map((li) => li.textContent)).toEqual(cancellationRules(POLITICA));
    expect(screen.getByText(waitlistRule(POLITICA))).toBeInTheDocument();
    expect(screen.getByText("Salir de la lista de espera no usa una cancelación de tu paquete.")).toBeInTheDocument();
    expect(screen.getByText(/Última actualización: 28 de septiembre de 2026/)).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/public/booking-policy");
    expect(screen.getAllByText(/HIVE Pilates Studio/).length).toBeGreaterThan(0);
  });

  it("ya no trae nada de Alma, ni el texto editable, ni letra de menos de 12 px", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "Cancelacion.tsx"), "utf8");
    expect(src).not.toMatch(/Alma|almamovement|Juriquilla/);
    expect(src).not.toMatch(/usePolicyText|LegalDynamicBody/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**: `npx vitest run src/pages/client/BookClassConfirm.test.tsx src/pages/client/MyBookings.cancelar.test.tsx src/pages/client/BookClasses.fila.test.tsx src/pages/legal/Cancelacion.test.tsx` → FAIL.

- [ ] **Step 3: Implementar.**

**`src/pages/client/BookClassConfirm.tsx`:**
- **Imports:**
  - `import { useParams, useNavigate } from "react-router-dom";` pasa a `import { Link, useParams, useNavigate } from "react-router-dom";`.
  - Agrega `import { cancellationRules, cancellationsLeftText, useBookingPolicy, waitlistRule } from "@/lib/booking-policy";`.
  - Quita `InfoBanner` del import de `@/components/app/widgets` si queda sin uso.
- **`KNOW_BEFORE`:** reemplaza la constante por:

```tsx
// La regla de la fila sale de la política vigente (auditoría 2026-09-27, P1-1).
const knowBefore = (fila: string) => [
  "Llega 10 minutos antes para acomodarte.",
  fila,
  "Trae ropa cómoda y algo para hidratarte.",
];
```

- **Dentro del componente**, tras `const { user } = useAuthStore();`: `const { policy } = useBookingPolicy();`.
- **`isFull`:** reemplaza `const isFull = Boolean(cls) && remaining === 0;` por:

```tsx
  // Con fila, la clase se ofrece como lista de espera aunque haya lugares:
  // nadie se salta la fila (P1-1).
  const waiting = Number(cls?.waitlist_count ?? 0);
  const isFull = Boolean(cls) && (remaining === 0 || waiting > 0);
```

- **Tras `const remainingAfter = …`:**

```tsx
  // "Te quedan N cancelaciones de este paquete." (P0-4)
  const quedanText = hasActivePkg
    ? cancellationsLeftText(membership?.cancellationsLeft ?? null, Number(membership?.cancellationLimit ?? 0))
    : null;
```

- **"Lo que tienes que saber":** `KNOW_BEFORE.map(` pasa a `knowBefore(waitlistRule(policy)).map(`.
- **Sección de cancelación:** reemplaza la `<Section>` que contiene el `<InfoBanner title="Cancela hasta 12 horas antes…" … />` por:

```tsx
            <Section title="Si necesitas cancelar">
              {/* Mismas reglas y mismas palabras que /legal/cancelacion y el
                  diálogo de cancelar (src/lib/booking-policy.ts, P0-4). */}
              <ul aria-label="Reglas de cancelación" className="list-none m-0 p-0">
                {cancellationRules(policy).map((regla, i, arr) => (
                  <li
                    key={regla}
                    className={"py-3 border-t border-line text-[0.92rem] leading-[1.55] text-ink-muted" + (i === arr.length - 1 ? " border-b" : "")}
                  >
                    {regla}
                  </li>
                ))}
              </ul>
              {quedanText && <p className="m-0 mt-3 text-[0.92rem] font-medium text-ink">{quedanText}</p>}
              <Link
                to="/legal/cancelacion"
                className="mt-2 inline-flex min-h-[44px] items-center text-[0.84rem] font-medium text-accent-strong underline underline-offset-2"
              >
                Ver la política completa
              </Link>
            </Section>
```

**`src/pages/client/MyBookings.tsx`:**
- **Imports:**
  - Agrega `import { cancellationRules, cancellationsLeftText, useBookingPolicy } from "@/lib/booking-policy";`.
- **Tipo**, bajo los imports:

```tsx
/** Reserva de "Mis clases" con lo que agrega el servidor (bloque 3). */
type Reserva = BookingClient & { waitlist_position?: number | null; membership_id?: string | null };
type MembresiaCuota = { id: string; cancellationsUsed?: number; cancellationLimit?: number; cancellationsLeft?: number | null };
```

- **Estado:** `const [cancelId, setCancelId] = useState<string | null>(null);` pasa a `const [cancelTarget, setCancelTarget] = useState<Reserva | null>(null);`. Cambia cada `setCancelId(null)` por `setCancelTarget(null)`.
- **Datos**, tras la query de `my-bookings`:

```tsx
  const { policy } = useBookingPolicy();
  const { data: membershipsData } = useQuery({
    queryKey: ["my-memberships-all"],
    queryFn: async () => (await api.get("/memberships/mine/all")).data,
  });
  const memberships: MembresiaCuota[] = Array.isArray(membershipsData?.data) ? membershipsData.data : [];
```

- **Tipo de la lista:** `const bookings: BookingClient[] = …` pasa a `const bookings: Reserva[] = …`, con el mismo cuerpo.
- **`cancelMutation`:** el `onSuccess` pasa a:

```tsx
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      qc.invalidateQueries({ queryKey: ["my-membership"] });
      qc.invalidateQueries({ queryKey: ["my-memberships-all"] });
      qc.invalidateQueries({ queryKey: ["public-classes"] });
      const d = res?.data ?? {};
      toast({
        title: d.leftWaitlist ? "Saliste de la lista de espera" : "Reserva cancelada",
        description: d.message ?? (d.creditRestored ? "Cancelaste a tiempo, tu clase regresó a tu paquete." : "Tu lugar quedó libre."),
      });
      setCancelTarget(null);
    },
```

- **`renderBookingRow`:**
  - La firma pasa a `(b: Reserva) =>`.
  - `const isCancellable = b.status === "confirmed" && !isPast;` pasa a `const isCancellable = (b.status === "confirmed" || b.status === "waitlist") && !isPast;`.
  - Tras el `<div>` de fecha e instructora (el de `nums text-[0.8rem] mt-1 text-ink-muted`):

```tsx
            {b.status === "waitlist" && b.waitlist_position ? (
              <div className="nums text-[0.8rem] mt-1 text-ink-muted">Lugar {b.waitlist_position} en la fila</div>
            ) : null}
```

  - El botón de cancelar pasa a:

```tsx
            {isCancellable && (
              <GhostButton tone="danger" onClick={() => setCancelTarget(b)}>
                {b.status === "waitlist" ? "Salir de la lista de espera" : "Cancelar reserva"}
              </GhostButton>
            )}
```

- **Antes del `return (`:**

```tsx
  // Diálogo de cancelar: las mismas reglas que /legal/cancelacion y la cuota de
  // la membresía de ESA reserva (P0-4). Salir de la fila no usa cancelación.
  const saliendo = cancelTarget?.status === "waitlist";
  const memDeReserva = memberships.find((m) => m.id === cancelTarget?.membership_id) ?? memberships[0] ?? null;
  const limite = Number(memDeReserva?.cancellationLimit ?? policy.cancellationLimit);
  const quedan = !saliendo && memDeReserva ? cancellationsLeftText(memDeReserva.cancellationsLeft ?? null, limite) : null;
  const agotada = !saliendo && limite > 0 && memDeReserva?.cancellationsLeft === 0;
```

- **El `AlertDialog` "Cancel confirm":** reemplaza completo por:

```tsx
        {/* Cancelar o salir de la fila */}
        <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
          <AlertDialogContent className="w-[calc(100%-2rem)] rounded-3xl bg-canvas border-line">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display text-[1.35rem] font-normal leading-snug text-ink">
                {saliendo ? "¿Salir de la lista de espera?" : "¿Cancelar tu reserva?"}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-[0.92rem] leading-[1.6] text-ink-muted">
                  {saliendo ? (
                    <p className="m-0">Dejas tu lugar en la fila. No usa una cancelación de tu paquete.</p>
                  ) : (
                    <>
                      <ul aria-label="Reglas de cancelación" className="m-0 list-disc space-y-1 pl-5">
                        {cancellationRules(policy).map((r) => <li key={r}>{r}</li>)}
                      </ul>
                      {quedan && <p className="m-0 mt-3 font-medium text-ink">{quedan}</p>}
                      {agotada && <p className="m-0 mt-1">Si necesitas cancelar, habla con recepción.</p>}
                    </>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogCancel className="h-11 rounded-full px-5 text-[0.75rem] font-medium uppercase tracking-[0.18em]">
                Volver
              </AlertDialogCancel>
              {!agotada && (
                <AlertDialogAction
                  className="h-11 rounded-full px-5 text-[0.75rem] font-medium uppercase tracking-[0.18em] bg-danger text-canvas hover:bg-danger/90"
                  onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.id)}
                >
                  {saliendo ? "Sí, salir" : "Sí, cancelar"}
                </AlertDialogAction>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
```

**`src/pages/client/BookClasses.tsx`:**
- En `ScheduleClass` agrega `waitlist_count?: number | null;`.
- En `decorateClass`:
  - Tras `const booked = Number(cls.current_bookings ?? 0);` agrega:

```tsx
  // Con fila, la clase se muestra como "Lista de espera" aunque haya lugares:
  // nadie se salta la fila (auditoría 2026-09-27, P1-1).
  const waiting = Number(cls.waitlist_count ?? 0);
```

  - `remaining: Math.max(0, capacity - booked),` pasa a `remaining: waiting > 0 ? 0 : Math.max(0, capacity - booked),`.

**`src/pages/legal/Cancelacion.tsx`:** reemplaza el archivo completo por:

```tsx
import { STUDIO } from "@/lib/studio";
import { cancellationRules, useBookingPolicy, waitlistRule } from "@/lib/booking-policy";
import LegalLayout, { LegalContact, LegalH2, LegalSkeleton, LegalUpdated } from "./LegalLayout";

// Política de cancelación de HIVE Pilates Studio (auditoría 2026-09-27, P0-4 y
// punto 7). Las reglas salen de la configuración real (GET /api/public/booking-policy)
// con el mismo texto que el detalle de clase y el diálogo de cancelar
// (src/lib/booking-policy.ts): una sola política. El texto de policies_settings
// ya no se muestra. PENDIENTE: revisión de un abogado.
export const CANCELACION_ACTUALIZADA = "28 de septiembre de 2026";

const Cancelacion = () => {
  const { policy, isLoading } = useBookingPolicy();

  return (
    <LegalLayout
      current="/legal/cancelacion"
      title={
        <>
          Política de <span className="font-display">cancelación</span>
        </>
      }
    >
      {isLoading ? (
        <LegalSkeleton />
      ) : (
        <div className="space-y-6">
          <LegalUpdated>{CANCELACION_ACTUALIZADA}</LegalUpdated>

          <p>
            En <strong className="text-foreground">{STUDIO.name}</strong> los grupos son pequeños: cuando cancelas a tiempo, tu lugar lo puede aprovechar alguien de la lista de espera. Estas reglas son las mismas que ves en la app al reservar y al cancelar.
          </p>

          <LegalH2>1. Cancelar una reserva</LegalH2>
          <ul aria-label="Reglas de cancelación" className="list-disc pl-6 space-y-2">
            {cancellationRules(policy).map((regla) => <li key={regla}>{regla}</li>)}
          </ul>
          <p>En la app ves cuántas cancelaciones te quedan en tu paquete: en el detalle de cada clase y al cancelar.</p>

          <LegalH2>2. Lista de espera</LegalH2>
          <p>{waitlistRule(policy)}</p>
          <p>Salir de la lista de espera no usa una cancelación de tu paquete.</p>

          <LegalH2>3. Inasistencias</LegalH2>
          <p>Si no llegas a una clase reservada, la clase cuenta como usada{policy.faltasEnabled ? " y como falta" : ""}.</p>

          <LegalH2>4. Clases que cancela el estudio</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Si tenemos que cancelar una clase (por ejemplo, por ausencia de la coach o por mantenimiento), la clase regresa a tu paquete, no cuenta como cancelación tuya y te avisamos lo antes posible.</li>
            <li>Por fuerza mayor (fenómenos naturales, cortes de servicio), el estudio puede cancelar clases sin reposición obligatoria, aunque haremos lo posible por reprogramar.</li>
          </ul>

          <LegalH2>5. Cambio de horario</LegalH2>
          <p>Para cambiar de horario, cancela tu reserva y reserva la nueva clase. Aplican las reglas de arriba y el cupo disponible.</p>

          <LegalH2>6. Puntualidad</LegalH2>
          <p>Llega 10 minutos antes. Una vez iniciada la clase no se permite el acceso, por seguridad y por respeto al grupo; esa clase cuenta como usada.</p>

          <LegalH2>7. Paquetes y excepciones</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Los paquetes no son reembolsables, salvo en los casos que el estudio apruebe. Si el estudio aprueba un reembolso total o parcial, lo registra y ajusta las clases de tu paquete.</li>
            <li>Ante una fuerza mayor (accidente, hospitalización, emergencia médica comprobable), el estudio puede evaluar extender tu paquete. Pídelo en recepción con tu documentación.</li>
          </ul>

          <LegalH2>8. Contacto</LegalH2>
          <p>Para cualquier duda sobre esta política:</p>
          <LegalContact />
        </div>
      )}
    </LegalLayout>
  );
};

export default Cancelacion;
```

- [ ] **Step 4: Verde**:
  - `npx vitest run src/pages/client src/pages/legal src/design src/lib` → PASS. Incluye `MyBookings.render.test.tsx`, `MyBookings.dark.test.ts`, `BookClasses.*` y `app-zone.test.ts`: la zona oscura sigue limpia.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add src/pages/client/BookClassConfirm.tsx src/pages/client/BookClassConfirm.test.tsx src/pages/client/MyBookings.tsx src/pages/client/MyBookings.cancelar.test.tsx src/pages/client/BookClasses.tsx src/pages/client/BookClasses.fila.test.tsx src/pages/legal/Cancelacion.tsx src/pages/legal/Cancelacion.test.tsx
git commit -m "fix(hive): una sola política de cancelación en la app y en /legal/cancelacion, con te quedan N; salir de la lista de espera desde Mis clases"
```

---


### Task 6: Wellhub en el panel (sólo dueña) y check-in por webhook con fecha y bitácora (P1-9)

**Files:**
- Modify: `server/lib/wellhub/flows.js`.
- Create: `server/lib/wellhub/reconcile.js`, `server/lib/wellhub/reconcile.test.js`, `server/tests/wellhub-checkin.test.mjs`.
- Modify: `server/index.js`:
  - `wellhubWebhookHandler`.
  - Rutas `/api/partners/wellhub/publish|unpublish`, `/api/partners/checkins`, `/api/partners/checkins/:id/confirm` y `/api/partners/summary`.
- Modify: `src/config/features.ts`, `src/components/admin/AdminLayout.tsx`, `src/test/paridad-velan.test.ts`, `src/pages/admin/settings/PartnerPlatforms.tsx`, `src/pages/admin/bookings/PartnerCheckins.tsx`, `src/pages/admin/classes/ClassesCalendar.tsx`, `src/pages/admin/classes/ClassesCalendar.test.tsx`.
- Create: `src/pages/admin/bookings/PartnerCheckins.test.tsx`, `src/components/admin/AdminLayout.wellhub.test.tsx`.

**Interfaces:**
- Consumes (Task 1): `recordAuditBestEffort({ systemActor: "wellhub", … })`, la etiqueta "Check-in (Wellhub)" de `audit-log.ts` y `onSeatReleased`.
- Produces:

```js
// server/lib/wellhub/reconcile.js
export function wellhubMonthRange(month, today)  // { ok:true, month, from, to } | { ok:false, message: "Mes inválido (usa AAAA-MM)." }
export function summarizeWellhubMonth(checkins, bookingCounts, unmatchedCount)
//   { confirmed, pending, failed, booked, attended, noShow, unmatched }
// server/lib/wellhub/flows.js
handleCheckin(...)       // ahora escribe checked_in_at y deja booking.checkin (actor Wellhub)
handleCancel(...)        // → { status, late, classIds }
handlePlanChange(...)    // → { status, plan, inactive, classIds }
```

- API (sólo dueña):
  - `GET /api/partners/checkins?month=AAAA-MM` → `{ data, summary, unmatched, month }`.
  - `POST /api/partners/checkins/:id/confirm`.
  - `GET /api/partners/summary`.
  - `POST /api/partners/wellhub/publish/:classId` y `unpublish`.
- Panel: `FEATURES.partnerPlatforms = true`; los ítems de Wellhub son `ownerOnly`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/wellhub/reconcile.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { wellhubMonthRange, summarizeWellhubMonth } from "./reconcile.js";

test("mes AAAA-MM; sin mes, el de hoy en el estudio; diciembre cruza de año", () => {
  assert.deepEqual(wellhubMonthRange("2026-09", "2026-10-02"), { ok: true, month: "2026-09", from: "2026-09-01", to: "2026-10-01" });
  assert.deepEqual(wellhubMonthRange(undefined, "2026-10-02"), { ok: true, month: "2026-10", from: "2026-10-01", to: "2026-11-01" });
  assert.deepEqual(wellhubMonthRange("2026-12", "2026-12-31"), { ok: true, month: "2026-12", from: "2026-12-01", to: "2027-01-01" });
  for (const bad of ["2026-13", "2026-9", "09-2026", "basura"]) {
    assert.deepEqual(wellhubMonthRange(bad, "2026-10-02"), { ok: false, message: "Mes inválido (usa AAAA-MM)." }, bad);
  }
});

test("resumen del mes", () => {
  const s = summarizeWellhubMonth(
    [{ status: "confirmed" }, { status: "confirmed" }, { status: "pending" }, { status: "failed" }],
    { booked: 5, attended: 3, no_show: 1 },
    2,
  );
  assert.deepEqual(s, { confirmed: 2, pending: 1, failed: 1, booked: 5, attended: 3, noShow: 1, unmatched: 2 });
  assert.deepEqual(summarizeWellhubMonth(), { confirmed: 0, pending: 0, failed: 0, booked: 0, attended: 0, noShow: 0, unmatched: 0 });
});
```

`server/tests/wellhub-checkin.test.mjs`:

```js
// Tarea 6 · auditoría 2026-09-27, bloque 3 (P1-9 · F6 · K6). El check-in que
// llega por webhook de Wellhub marca checked_in CON checked_in_at (cuenta en
// "Primera vez" y en reportes) y queda en la bitácora con actor "Wellhub"; la
// dueña concilia el mes; recepción no ve nada de esto. La validación de visita
// no cambia: aquí la atiende un Wellhub de mentira que siempre acepta.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, makeClass, cleanup, closeDb, day, ventanaAhora, ADMIN } from "./helpers.mjs";

const PFX = "rgwhci";
const SECRET = "whsec-qa-bloque3";
const RUN = crypto.randomUUID().slice(0, 8);
let A, f, recep, stub, prevCreds, bookingCheckin;

const levantarStub = () => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});
const webhook = (ruta, payload) => {
  const raw = JSON.stringify(payload);
  const firma = crypto.createHmac("sha1", SECRET).update(raw).digest("hex");
  return api("POST", ruta, { raw, headers: { "x-gympass-signature": firma } });
};
async function socia(key) {
  const c = await makeClient(PFX, key);
  const wid = `wh-${RUN}-${key}`;
  await sql(`UPDATE users SET wellhub_id = $2 WHERE id = $1`, [c.id, wid]);
  return { ...c, wid };
}
const reservaWellhub = async (classId, userId, ref, status = "confirmed") =>
  (await sql(
    `INSERT INTO bookings (class_id, user_id, status, channel, external_ref, checked_in_at)
     VALUES ($1, $2, $3, 'wellhub', $4, CASE WHEN $3 = 'checked_in' THEN NOW() END) RETURNING id`,
    [classId, userId, status, ref],
  ))[0].id;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  stub = await levantarStub();
  [prevCreds] = await sql(`SELECT * FROM platform_credentials WHERE channel = 'wellhub'`);
  await sql(
    `INSERT INTO platform_credentials (channel, environment, is_enabled, gym_id, webhook_secret, access_base_url, booking_base_url, extra_config)
     VALUES ('wellhub', 'sandbox', true, 'g-qa-b3', $1, $2, $2, '{}'::jsonb)
     ON CONFLICT (channel) DO UPDATE SET is_enabled = true, gym_id = 'g-qa-b3', webhook_secret = $1,
       access_base_url = $2, booking_base_url = $2`,
    [SECRET, `http://127.0.0.1:${stub.address().port}`],
  );
});
after(async () => {
  await sql(`DELETE FROM partner_checkins WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  if (prevCreds) {
    await sql(
      `UPDATE platform_credentials SET environment = $1, is_enabled = $2, gym_id = $3, webhook_secret = $4,
              access_base_url = $5, booking_base_url = $6 WHERE channel = 'wellhub'`,
      [prevCreds.environment, prevCreds.is_enabled, prevCreds.gym_id, prevCreds.webhook_secret, prevCreds.access_base_url, prevCreds.booking_base_url],
    );
  } else {
    await sql(`DELETE FROM platform_credentials WHERE channel = 'wellhub'`);
  }
  stub.close();
  await cleanup(PFX);
  await closeDb();
});

test("el check-in por webhook marca la asistencia con fecha y queda en la bitácora como Wellhub", async () => {
  const s = await socia("ci");
  const v = ventanaAhora();
  const classId = await makeClass(A, f, { date: day(0), start: v.start, end: v.end });
  const ref = `WH-${RUN}-ci`;
  bookingCheckin = await reservaWellhub(classId, s.id, ref);
  const r = await webhook("/webhooks/wellhub/checkin", {
    event_type: "checkin", event_id: `ci-${RUN}`, gym_id: "g-qa-b3",
    event_data: { user: { id: s.wid }, booking_number: ref, occurred_at: new Date().toISOString() },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "confirmed");
  const [b] = await sql(`SELECT status::text AS status, checked_in_at FROM bookings WHERE id = $1`, [bookingCheckin]);
  assert.equal(b.status, "checked_in");
  assert.ok(b.checked_in_at, "sin checked_in_at no cuenta en Primera vez ni en los reportes");
  const [log] = await sql(`SELECT actor_id, actor_name, meta FROM audit_log WHERE entity_id = $1 AND action = 'booking.checkin'`, [bookingCheckin]);
  assert.equal(log.actor_id, null);
  assert.equal(log.actor_name, "Wellhub");
  assert.equal(log.meta.method, "wellhub");
  assert.equal(log.meta.actor, "wellhub");
  // "Primera vez": en su siguiente clase ya no es la primera.
  const otra = await makeClass(A, f, { date: day(3) });
  await sql(`INSERT INTO bookings (class_id, user_id, status, channel) VALUES ($1, $2, 'confirmed', 'app')`, [otra, s.id]);
  const roster = await api("GET", `/api/classes/${otra}/roster`, { token: A });
  assert.equal(roster.body.data.roster.find((x) => x.userId === s.id).firstVisit, false);
});

test("la dueña concilia el mes: check-ins, reservas de Wellhub y asistencias sin check-in", async () => {
  const s = await socia("sin");
  const classId = await makeClass(A, f, { date: day(0) });
  await reservaWellhub(classId, s.id, `WH-${RUN}-sin`, "checked_in");
  const mes = day(0).slice(0, 7);
  const r = await api("GET", `/api/partners/checkins?month=${mes}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.month, mes);
  assert.ok(r.body.summary.confirmed >= 1, "el check-in del webhook");
  assert.ok(r.body.summary.attended >= 2, "las dos asistencias de Wellhub del mes");
  assert.ok(r.body.unmatched.some((u) => u.user_name === "QA sin"), "asistió en el estudio sin check-in de Wellhub");
  assert.ok(!r.body.unmatched.some((u) => u.booking_id === bookingCheckin), "la del webhook sí está conciliada");
  const fila = r.body.data.find((x) => x.user_name === "QA ci");
  assert.equal(fila.booking_status, "checked_in");
  const sinMes = await api("GET", "/api/partners/checkins", { token: A });
  assert.equal(sinMes.status, 200);
  assert.equal(sinMes.body.month, mes, "sin mes, el actual del estudio");
});

test("sólo la dueña: check-ins, confirmar, resumen y publicar a Wellhub; un mes inválido → 400", async () => {
  const mes = day(0).slice(0, 7);
  assert.equal((await api("GET", `/api/partners/checkins?month=${mes}`, { token: recep.token })).status, 403);
  assert.equal((await api("GET", "/api/partners/summary", { token: recep.token })).status, 403);
  const classId = await makeClass(A, f, { date: day(4) });
  assert.equal((await api("POST", `/api/partners/wellhub/publish/${classId}`, { token: recep.token, body: { quota: 2 } })).status, 403);
  assert.equal((await api("POST", `/api/partners/checkins/${crypto.randomUUID()}/confirm`, { token: recep.token })).status, 403);
  const malo = await api("GET", "/api/partners/checkins?month=2026-13", { token: A });
  assert.equal(malo.status, 400);
  assert.equal(malo.body.message, "Mes inválido (usa AAAA-MM).");
});

test("la cancelación por webhook libera el lugar y no le devuelve a Wellhub los ids de clase", async () => {
  const s = await socia("cx");
  const classId = await makeClass(A, f, { date: day(5) });
  const ref = `WH-${RUN}-cx`;
  await reservaWellhub(classId, s.id, ref);
  const r = await webhook("/webhooks/wellhub", {
    event_type: "booking-canceled", event_id: `cx-${RUN}`, gym_id: "g-qa-b3",
    event_data: { booking_number: ref },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.status, "cancelled");
  assert.equal(r.body.classIds, undefined);
  const [b] = await sql(`SELECT status::text AS s FROM bookings WHERE external_ref = $1`, [ref]);
  assert.equal(b.s, "cancelled");
});
```

`src/pages/admin/bookings/PartnerCheckins.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PartnerCheckins from "./PartnerCheckins";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const RESPUESTA = {
  month: "2026-09",
  summary: { confirmed: 3, pending: 1, failed: 0, booked: 6, attended: 4, noShow: 1, unmatched: 1 },
  data: [
    { id: "p1", status: "confirmed", method: "automated", created_at: "2026-09-24T12:00:00Z", user_name: "Lucía Díaz", class_name: "Reformer", class_date: "2026-09-24", booking_status: "checked_in" },
    { id: "p2", status: "pending", method: "automated", created_at: "2026-09-25T12:00:00Z", user_name: "Sara Ruiz", class_name: "Reformer", class_date: "2026-09-25", booking_status: "confirmed" },
  ],
  unmatched: [{ booking_id: "b9", user_name: "Ana Wellhub", class_name: "Reformer", class_date: "2026-09-20" }],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/partners/checkins?month=": RESPUESTA });
});
afterEach(() => vi.useRealTimers());

const pedidas = () => mockApi.get.mock.calls.map(([u]) => String(u)).filter((u) => u.startsWith("/partners/checkins"));

describe("Check-ins Wellhub (auditoría 2026-09-27, P1-9)", () => {
  it("la dueña concilia el mes: cifras, tabla en español y asistencias sin check-in", async () => {
    loginAs("admin");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    expect(await screen.findByRole("heading", { level: 1, name: "Check-ins Wellhub" })).toBeInTheDocument();
    expect(pedidas()[0]).toBe("/partners/checkins?month=2026-09");
    expect(await screen.findByText("Confirmados por Wellhub")).toBeInTheDocument();
    const tabla = screen.getByRole("region", { name: "Check-ins del mes" });
    const lucia = within(tabla).getByText("Lucía Díaz").closest("tr")!;
    expect(within(lucia).getByText("Confirmado")).toBeInTheDocument();
    expect(within(lucia).getByText("Automático")).toBeInTheDocument();
    expect(within(lucia).getByText("Asistió")).toBeInTheDocument();
    const sin = screen.getByRole("region", { name: "Asistencias sin check-in de Wellhub" });
    expect(within(sin).getByText("Ana Wellhub")).toBeInTheDocument();
    const sara = within(tabla).getByText("Sara Ruiz").closest("tr")!;
    fireEvent.click(within(sara).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/partners/checkins/p2/confirm"));
  });

  it("cambiar el mes pide ese mes", async () => {
    loginAs("admin");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    fireEvent.change(await screen.findByLabelText("Mes"), { target: { value: "2026-08" } });
    await waitFor(() => expect(pedidas().at(-1)).toBe("/partners/checkins?month=2026-08"));
  });

  it("recepción no entra ni pide los check-ins", async () => {
    loginAs("reception");
    renderAdmin(<PartnerCheckins />, { route: "/admin/bookings/partners-checkins" });
    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/app"));
    expect(pedidas()).toEqual([]);
  });
});
```

`src/components/admin/AdminLayout.wellhub.test.tsx`:

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

describe("AdminLayout · Wellhub (P1-9)", () => {
  it("la dueña ve los ajustes y los check-ins de Wellhub en Sistema", async () => {
    loginAs("admin");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    expect(await screen.findByRole("link", { name: /Check-ins Wellhub/ })).toHaveAttribute("href", "/admin/bookings/partners-checkins");
    expect(screen.getByRole("link", { name: /^Wellhub$/ })).toHaveAttribute("href", "/admin/settings/platforms");
  });

  it("recepción no los ve", async () => {
    loginAs("reception");
    renderAdmin(<AdminLayout><div>contenido</div></AdminLayout>, { route: "/admin/dashboard", path: "/admin/dashboard" });
    await screen.findByRole("link", { name: /Reservas/ });
    expect(screen.queryByRole("link", { name: /Wellhub/ })).toBeNull();
  });
});
```

`src/pages/admin/classes/ClassesCalendar.test.tsx`:
- En el `routeApi` del `beforeEach` agrega `"/partners/wellhub/class-status/c11": { data: { published: false, maxSpots: 0, bookedSpots: 0, externalSlotId: null } },`.
- En la prueba "al tocar una clase abre su panel con el resumen, iniciales de inscritas, sin Wellhub y con enlace directo a Reservas":
  - Renómbrala a "al tocar una clase abre su panel con el resumen, iniciales de inscritas, el control de Wellhub para la dueña y enlace directo a Reservas".
  - Reemplaza `expect(screen.queryByText("Wellhub")).toBeNull();` por `expect(await screen.findByPlaceholderText("Cupo para Wellhub")).toBeInTheDocument();`.
- Agrega:

```tsx
  it("recepción no ve el control de Wellhub de la clase (sólo la dueña publica a Wellhub)", async () => {
    loginAs("reception");
    renderAdmin(<ClassesCalendar />, { route: "/admin/classes" });
    fireEvent.click(await screen.findByRole("button", { name: /Reformer Intermedio.*8 de 8, llena/ }));
    expect(await screen.findByText("Llena · 8/8")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Cupo para Wellhub")).toBeNull();
  });
```

`src/test/paridad-velan.test.ts`:
- En `APAGADAS`, quita `"/admin/settings/platforms": "partnerPlatforms",` y `"/admin/bookings/partners-checkins": "partnerPlatforms",`.
- En `EXCEPCIONES`, agrega:

```ts
  "/admin/settings/platforms": "Wellhub está activo en producción: la dueña configura la integración (auditoría 2026-09-27, P1-9)",
  "/admin/bookings/partners-checkins": "la dueña concilia las visitas de Wellhub (auditoría 2026-09-27, P1-9)",
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/wellhub/reconcile.test.js` → FAIL.
  - `npx vitest run src/pages/admin/bookings src/components/admin src/pages/admin/classes src/test` → FAIL.
  - En tu base (5595/8195), `wellhub-checkin.test.mjs` → FAIL: `checked_in_at` null, sin bitácora, recepción 200.

- [ ] **Step 3: Implementar.**

`server/lib/wellhub/reconcile.js`:

```js
// Conciliación mensual de Wellhub en el panel de la dueña (auditoría 2026-09-27,
// P1-9): lo que confirmó Wellhub contra la asistencia en el estudio.
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "AAAA-MM" → { ok, month, from, to } (to = primer día del mes siguiente). Sin mes: el de `today`. */
export function wellhubMonthRange(month, today) {
  const m = month === undefined || month === null || month === "" ? String(today ?? "").slice(0, 7) : String(month);
  const hit = MONTH_RE.exec(m);
  if (!hit) return { ok: false, message: "Mes inválido (usa AAAA-MM)." };
  const y = Number(hit[1]);
  const mm = Number(hit[2]);
  const next = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
  return { ok: true, month: m, from: `${m}-01`, to: `${next}-01` };
}

export function summarizeWellhubMonth(checkins = [], bookings = {}, unmatched = 0) {
  const por = (s) => checkins.filter((c) => c.status === s).length;
  return {
    confirmed: por("confirmed"),
    pending: por("pending"),
    failed: por("failed"),
    booked: Number(bookings?.booked ?? 0),
    attended: Number(bookings?.attended ?? 0),
    noShow: Number(bookings?.no_show ?? 0),
    unmatched: Number(unmatched) || 0,
  };
}
```

**`server/lib/wellhub/flows.js`:**
- **Import**, tras los imports actuales: `import { recordAuditBestEffort } from "../audit.js";`.
- **`handleCheckin`:** reemplaza el bloque `if (booking) { await pool.query("UPDATE bookings SET status='checked_in' WHERE id=$1", [booking.id]); … }` por:

```js
    if (booking) {
      // Con checked_in_at: sin la fecha no contaba en "Primera vez" ni en los
      // reportes que miran la asistencia (auditoría 2026-09-27, P1-9).
      await pool.query(
        "UPDATE bookings SET status='checked_in', checked_in_at = COALESCE(checked_in_at, NOW()) WHERE id=$1",
        [booking.id],
      );
      await recordAuditBestEffort(pool, {
        systemActor: "wellhub", action: "booking.checkin", entityType: "booking",
        entityId: booking.id, subjectUserId: user.id,
        before: { status: booking.status }, after: { status: "checked_in" },
        meta: { method: "wellhub", checkin_id: checkinId, class_id: booking.class_id },
      });
      await createWellhubOrder(pool, { userId: user.id, price: resolveWellhubPrice(creds.extra_config) });
    }
```

- **`handleCancel`:** reemplaza la función completa por:

```js
// ── cancelaciones ──
// Devuelve las clases cuyo lugar se liberó: el webhook sube su lista de espera
// (auditoría 2026-09-27, P1-1).
export async function handleCancel(pool, creds, payload, { late = false } = {}) {
  const bookingNumber = extractBookingNumber(payload);
  if (!bookingNumber) return { status: "ignored" };
  const r = await pool.query(
    `WITH prev AS (
       SELECT id, status::text AS status FROM bookings
        WHERE channel='wellhub' AND external_ref=$1 AND status <> 'cancelled'
        FOR UPDATE
     )
     UPDATE bookings b SET status='cancelled', cancelled_at=NOW(),
            partner_metadata = COALESCE(b.partner_metadata,'{}'::jsonb) || $2::jsonb
       FROM prev
      WHERE b.id = prev.id
      RETURNING b.id, b.class_id, prev.status AS prev_status`,
    [String(bookingNumber), JSON.stringify({ late_cancel: late })],
  );
  const classIds = r.rows.filter((x) => ["confirmed", "checked_in"].includes(x.prev_status)).map((x) => x.class_id);
  return { status: r.rows.length ? "cancelled" : "not_found", late, classIds };
}
```

- **`handlePlanChange`:** reemplaza el `if (inactive) { await pool.query(…); }` y el `return` por:

```js
  let classIds = [];
  if (inactive) {
    const r = await pool.query(
      `UPDATE bookings b SET status='cancelled', cancelled_at=NOW()
         FROM classes c WHERE b.class_id=c.id AND b.channel='wellhub'
           AND b.user_id=(SELECT id FROM users WHERE wellhub_id=$1)
           AND c.date >= NOW()::date AND b.status NOT IN ('cancelled','no_show')
       RETURNING b.class_id`,
      [String(wid)],
    );
    classIds = r.rows.map((x) => x.class_id);
  }
  return { status: "updated", plan, inactive, classIds };
```

En `server/index.js`:

**`wellhubWebhookHandler`:** reemplaza `return res.status(200).json(result);` (el del `try` del `switch`) por:

```js
    // Lo que liberó lugar sube la lista de espera (auditoría 2026-09-27, P1-1).
    // Los ids de clase no van en la respuesta a Wellhub.
    const { classIds, ...body } = result ?? {};
    if (Array.isArray(classIds) && classIds.length) await onSeatReleased(classIds, { source: "wellhub" });
    return res.status(200).json(body);
```

**Import**, en la línea de imports existente del módulo de Wellhub: agrega `import { wellhubMonthRange, summarizeWellhubMonth } from "./lib/wellhub/reconcile.js";` justo después de `import { handleBookingRequested, handleCheckin, handleCancel, handlePlanChange } from "./lib/wellhub/flows.js";`.

**Rutas de partners:**
- `app.post("/api/partners/wellhub/publish/:classId", adminMiddleware, …` y `app.post("/api/partners/wellhub/unpublish/:classId", adminMiddleware, …`: `adminMiddleware` pasa a `ownerMiddleware`.
- Antes de la primera de ellas, deja el comentario `// Publicar clases a Wellhub, sus check-ins y su resumen: sólo la dueña (auditoría 2026-09-27, P1-9).`
- `GET /api/partners/checkins`: reemplaza la ruta completa por:

```js
// GET /api/partners/checkins?month=AAAA-MM — conciliación del mes (P1-9): los
// check-ins de Wellhub con la asistencia en el estudio, el resumen y las
// asistencias de Wellhub sin check-in confirmado. Sólo la dueña.
app.get("/api/partners/checkins", ownerMiddleware, async (req, res) => {
  const range = wellhubMonthRange(typeof req.query.month === "string" ? req.query.month : undefined, todayInStudio());
  if (!range.ok) return res.status(400).json({ message: range.message });
  try {
    const [rows, bookings, unmatched] = await Promise.all([
      pool.query(
        `SELECT pc.id, pc.status, pc.method, pc.validated_at, pc.created_at, pc.channel, pc.booking_id,
                u.display_name AS user_name, u.wellhub_id,
                to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name,
                b.status::text AS booking_status, b.checked_in_at
           FROM partner_checkins pc
           LEFT JOIN users u ON u.id = pc.user_id
           LEFT JOIN bookings b ON b.id = pc.booking_id
           LEFT JOIN classes c ON c.id = b.class_id
           LEFT JOIN class_types ct ON ct.id = c.class_type_id
          WHERE pc.channel = 'wellhub'
            AND pc.created_at >= ($1::date::timestamp AT TIME ZONE '${STUDIO_TIMEZONE}')
            AND pc.created_at <  ($2::date::timestamp AT TIME ZONE '${STUDIO_TIMEZONE}')
          ORDER BY pc.created_at DESC
          LIMIT 500`,
        [range.from, range.to],
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE b.status <> 'cancelled')::int AS booked,
                COUNT(*) FILTER (WHERE b.status = 'checked_in')::int AS attended,
                COUNT(*) FILTER (WHERE b.status = 'no_show')::int AS no_show
           FROM bookings b JOIN classes c ON c.id = b.class_id
          WHERE b.channel = 'wellhub' AND c.date >= $1::date AND c.date < $2::date`,
        [range.from, range.to],
      ),
      pool.query(
        `SELECT b.id AS booking_id, u.display_name AS user_name, u.wellhub_id,
                to_char(c.date, 'YYYY-MM-DD') AS class_date, ct.name AS class_name, b.checked_in_at
           FROM bookings b
           JOIN classes c ON c.id = b.class_id
           LEFT JOIN class_types ct ON ct.id = c.class_type_id
           LEFT JOIN users u ON u.id = b.user_id
          WHERE b.channel = 'wellhub' AND b.status = 'checked_in'
            AND c.date >= $1::date AND c.date < $2::date
            AND NOT EXISTS (SELECT 1 FROM partner_checkins pc WHERE pc.booking_id = b.id AND pc.status = 'confirmed')
          ORDER BY c.date DESC
          LIMIT 200`,
        [range.from, range.to],
      ),
    ]);
    return res.json({
      data: rows.rows,
      summary: summarizeWellhubMonth(rows.rows, bookings.rows[0], unmatched.rows.length),
      unmatched: unmatched.rows,
      month: range.month,
    });
  } catch (err) {
    console.error("[partners checkins]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

- `app.post("/api/partners/checkins/:id/confirm", adminMiddleware, …` y `app.get("/api/partners/summary", adminMiddleware, …`: `adminMiddleware` pasa a `ownerMiddleware`.

**`src/config/features.ts`:**
- `partnerPlatforms: false,` pasa a `partnerPlatforms: true,`, y su comentario a `/** Wellhub: configuración y check-ins, sólo para la dueña. `/admin/settings/platforms`, `/admin/bookings/partners-checkins` */`.
- En la cabecera, bajo "Lo que se dejó encendido a propósito", agrega: `` - `/admin/settings/platforms` y `/admin/bookings/partners-checkins`: Wellhub está activo en producción y la dueña concilia sus visitas (auditoría 2026-09-27, P1-9). ``

**`src/components/admin/AdminLayout.tsx`:** en el grupo "Sistema" de `NAV_GROUPS`, a los ítems `/admin/settings/platforms` y `/admin/bookings/partners-checkins` agrégales `ownerOnly: true`.

**`src/pages/admin/classes/ClassesCalendar.tsx`:**
- `import { useCanSeeFinance } from "@/lib/roles";`.
- Al inicio del componente: `const isOwner = useCanSeeFinance();`.
- `{!selectedClass.isCancelled && FEATURES.partnerPlatforms && (` pasa a `{!selectedClass.isCancelled && FEATURES.partnerPlatforms && isOwner && (`, con el comentario `{/* Publicar a Wellhub: sólo la dueña (auditoría 2026-09-27, P1-9). */}`.

**`src/pages/admin/settings/PartnerPlatforms.tsx`:**
- `<AuthGuard>` pasa a `<AuthGuard requiredRoles={["admin", "super_admin"]}>`.
- `<Label>Environment</Label>` pasa a `<Label>Ambiente</Label>`; las opciones muestran `Producción` y `Pruebas (sandbox)` (los `value` no cambian).
- `<Label>Gym ID (ID del studio en Wellhub)</Label>` pasa a `<Label>ID del estudio en Wellhub (gym ID)</Label>`.
- En el `<select>`, `bg-white` pasa a `bg-surface text-ink`.

**`src/pages/admin/bookings/PartnerCheckins.tsx`:** reemplaza el archivo completo por:

```tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import KpiStrip from "@/components/admin/KpiStrip";
import { Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

interface PartnerCheckin {
  id: string;
  status: string;
  method: string;
  created_at: string;
  user_name?: string | null;
  wellhub_id?: string | null;
  class_date?: string | null;
  class_name?: string | null;
  booking_status?: string | null;
}
interface SinCheckin { booking_id: string; user_name?: string | null; wellhub_id?: string | null; class_name?: string | null; class_date?: string | null }
interface Resumen { confirmed: number; pending: number; failed: number; booked: number; attended: number; noShow: number; unmatched: number }
type Respuesta = { data: PartnerCheckin[]; summary: Resumen; unmatched: SinCheckin[]; month: string };

const ESTADO: Record<string, string> = { confirmed: "Confirmado", pending: "Pendiente", failed: "Falló" };
const VARIANTE: Record<string, "default" | "outline" | "destructive"> = { confirmed: "default", pending: "outline", failed: "destructive" };
const METODO: Record<string, string> = { automated: "Automático", manual: "Manual" };
const EN_ESTUDIO: Record<string, string> = { checked_in: "Asistió", no_show: "Falta", confirmed: "Reservada", cancelled: "Cancelada", waitlist: "Lista de espera" };

/* Check-ins de Wellhub (auditoría 2026-09-27, P1-9): sólo la dueña. Concilia,
   mes por mes, lo que confirmó Wellhub contra la asistencia en el estudio. El
   guardia va por fuera para que recepción no pida /partners/checkins (403). */
export default function PartnerCheckinsPage() {
  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <PartnerCheckinsContent />
      </AdminLayout>
    </AuthGuard>
  );
}

function PartnerCheckinsContent() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => format(new Date(), "yyyy-MM"));
  const q = useQuery<Respuesta>({
    queryKey: ["partner-checkins", mes],
    queryFn: async () => (await api.get(`/partners/checkins?month=${mes}`)).data,
  });
  const rows = Array.isArray(q.data?.data) ? q.data!.data : [];
  const sinCheckin = Array.isArray(q.data?.unmatched) ? q.data!.unmatched : [];
  const s = q.data?.summary;
  const confirmar = useMutation({
    mutationFn: (id: string) => api.post(`/partners/checkins/${id}/confirm`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-checkins"] }); toast({ title: "Check-in confirmado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo confirmar", variant: "destructive" }),
  });
  const errorMsg = (q.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sistema · sólo dueña"
        title="Check-ins Wellhub"
        subtitle="Concilia lo que confirmó Wellhub contra la asistencia en el estudio, mes por mes."
      />
      <div className="flex max-w-[220px] flex-col gap-1.5">
        <Label htmlFor="wh-mes">Mes</Label>
        <Input id="wh-mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>

      {q.isError ? (
        <ErrorState title="No pudimos cargar los check-ins" description={errorMsg ?? "Revisa tu conexión y vuelve a intentarlo."} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2"><SkeletonRow /><SkeletonRow /></div>
      ) : (
        <>
          <KpiStrip items={[
            { label: "Confirmados por Wellhub", value: String(s?.confirmed ?? 0), hint: `${s?.pending ?? 0} pendientes · ${s?.failed ?? 0} fallidos` },
            { label: "Reservas de Wellhub", value: String(s?.booked ?? 0), hint: `${s?.attended ?? 0} asistieron · ${s?.noShow ?? 0} faltas` },
            { label: "Asistencias sin check-in", value: String(s?.unmatched ?? 0), hint: "Vinieron, pero Wellhub no confirmó la visita" },
          ]} />

          <Panel aria-label="Check-ins del mes" className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socia</TableHead>
                  <TableHead>Clase</TableHead>
                  <TableHead>Wellhub</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>En el estudio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-ink-muted">Sin check-ins de Wellhub este mes.</TableCell></TableRow>
                ) : rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-bold text-ink">{c.user_name ?? c.wellhub_id ?? "—"}</TableCell>
                    <TableCell className="text-ink-muted">{c.class_name ?? "—"}{c.class_date ? ` · ${formatDate(c.class_date)}` : ""}</TableCell>
                    <TableCell><Badge variant={VARIANTE[c.status] ?? "outline"}>{ESTADO[c.status] ?? c.status}</Badge></TableCell>
                    <TableCell className="text-sm text-ink-muted">{METODO[c.method] ?? c.method}</TableCell>
                    <TableCell className="text-sm text-ink">{c.booking_status ? EN_ESTUDIO[c.booking_status] ?? c.booking_status : "Sin reserva"}</TableCell>
                    <TableCell className="nums text-sm text-ink-muted">{formatDate(c.created_at)}</TableCell>
                    <TableCell>
                      {c.status !== "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => confirmar.mutate(c.id)} disabled={confirmar.isPending}>
                          Confirmar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          {sinCheckin.length > 0 && (
            <Panel aria-label="Asistencias sin check-in de Wellhub" className="p-5">
              <h2 className="text-[15px] font-extrabold text-ink">Asistencias sin check-in de Wellhub</h2>
              <p className="mt-1 text-[13px] text-ink-muted">Vinieron por Wellhub y pasaron lista, pero Wellhub no confirmó la visita: revísalas con Wellhub.</p>
              <ul className="mt-3 divide-y divide-line">
                {sinCheckin.map((u) => (
                  <li key={u.booking_id} className="py-2.5 text-sm">
                    <span className="font-bold text-ink">{u.user_name ?? u.wellhub_id ?? "—"}</span>
                    <span className="text-ink-muted"> · {u.class_name ?? "Clase"}{u.class_date ? ` · ${formatDate(u.class_date)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </AdminPage>
  );
}
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin src/components/admin src/test src/design` → PASS. Incluye `PartnerPlatforms.test.tsx` y `guards.test.ts`: la marca Wellhub sigue en la lista de permitidos.
  - En tu base (5595/8195): `wellhub-checkin.test.mjs` más `wellhub-ajustes.test.mjs`, `roster-salud.test.mjs`, `faltas-correccion.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/wellhub/flows.js server/lib/wellhub/reconcile.js server/lib/wellhub/reconcile.test.js server/index.js server/tests/wellhub-checkin.test.mjs src/config/features.ts src/components/admin/AdminLayout.tsx src/components/admin/AdminLayout.wellhub.test.tsx src/test/paridad-velan.test.ts src/pages/admin/settings/PartnerPlatforms.tsx src/pages/admin/bookings/PartnerCheckins.tsx src/pages/admin/bookings/PartnerCheckins.test.tsx src/pages/admin/classes/ClassesCalendar.tsx src/pages/admin/classes/ClassesCalendar.test.tsx
git commit -m "fix(hive): Wellhub encendido sólo para la dueña con conciliación por mes; el check-in por webhook guarda checked_in_at y queda en la bitácora"
```

---


### Task 7: Reembolsos registrados por la dueña (P1-12)

**Files:**
- Create: `server/lib/refunds.js`, `server/lib/refunds.test.js`, `server/tests/reembolsos.test.mjs`.
- Modify: `server/index.js`:
  - Import tras `import { userAnonymizationValues, buildAnonymizeUpdate, WAIVER_ANON_VALUES, GUEST_ANON_VALUES } from "./lib/anonymize.js";`.
  - Reportes (`overview`, `revenue-sparkline`, `revenue`), `GET /api/admin/stats` y `GET /api/payments`.
  - Sección nueva "Reembolsos" antes de `// ─── Discount codes admin CRUD`.
- Modify: `src/pages/admin/payments/PaymentsHistory.tsx`, `src/pages/admin/payments/payments-summary.ts`, `src/pages/admin/payments/payments-summary.test.ts`.
- Create: `src/pages/admin/payments/RefundDialog.tsx`, `src/pages/admin/payments/refund-math.ts`, `src/pages/admin/payments/refund-math.test.ts`, `src/pages/admin/payments/PaymentsHistory.test.tsx`.

**Interfaces:**
- Consumes:
  - **Task 1:** tabla `refunds`, `orders.refunded_amount/refund_status/refunded_at`, `order.refund` en `AUDIT_ACTIONS` y `onSeatReleased`.
  - **Bloque 2:** `reasonProblem`, `cleanReason`, `recordAudit`, `cleanPaymentReference`, la orden que crea `POST /api/memberships` con `memberships.order_id` y `bookings.cancelled_by/cancellation_reason`.
- Produces:

```js
// server/lib/refunds.js
export const REFUND_METHODS;  // ["cash", "transfer", "card"] (card = terminal)
export function parseMoney(v) // número | NaN (acepta coma decimal)
export function refundPlan({ order, membership, input })
//   { ok:false, status, code?, message }
//   | { ok:true, kind, amount, method, reference, classesToRemove, cancelMembership, newRefunded, newStatus, charged, remaining }
```

```ts
// src/pages/admin/payments/refund-math.ts
export type RefundablePayment = { orderId: string; userName?: string | null; planName?: string | null; total_amount?: number | string; refundedAmount?: number | null; membershipId?: string | null; membershipStatus?: string | null; classesRemaining?: number | null; classLimit?: number | null };
export const REFUND_METHOD_LABEL: Record<"cash" | "transfer" | "card", string>;
export function refundRemaining(total: number, refunded?: number | null): number;
export function suggestedClassesToRemove(a: { amount: number; charged: number; classLimit?: number | null; classesRemaining?: number | null }): number;
```

- **API:** `POST /api/admin/orders/:id/refunds` (sólo dueña):
  - cuerpo `{ kind: "total"|"partial", amount?, method, reference?, reason, classesToRemove? }`;
  - responde 201 `{ data: { refund, order: { id, refunded_amount, refund_status }, membership, bookings_cancelled } }`.
- `GET /api/payments`:
  - cada orden agrega `orderId`, `refundedAmount`, `refundStatus`, `membershipId`, `membershipStatus`, `classesRemaining` y `classLimit`;
  - todas las filas llevan `createdAt` y `userId`;
  - agrega filas `source: "refund"` con monto negativo, además de `total` (neto) y `refundsTotal`.
- `GET /api/reports/overview` agrega `grossRevenue` y `refundsTotal`, y su `monthlyRevenue` es neto. `/revenue` agrega `refunds` por mes y su `amount` es neto.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/refunds.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { refundPlan, parseMoney, REFUND_METHODS } from "./refunds.js";

const order = { status: "approved", payment_method: "cash", channel: "counter", total_amount: "1700.00", refunded_amount: "0", refund_status: null };
const mem = { status: "active", classes_remaining: 6 };
const base = { method: "cash", reason: "No pudo seguir por lesión" };

test("total: devuelve lo que queda, cancela la membresía y quita sus clases", () => {
  const r = refundPlan({ order, membership: mem, input: { ...base, kind: "total" } });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 1700);
  assert.equal(r.newStatus, "refunded");
  assert.equal(r.newRefunded, 1700);
  assert.equal(r.cancelMembership, true);
  assert.equal(r.classesToRemove, 6);
  const tras = refundPlan({ order: { ...order, refunded_amount: "500", refund_status: "partially_refunded" }, membership: mem, input: { ...base, kind: "total" } });
  assert.equal(tras.amount, 1200, "después de un parcial, el total es lo que quedaba");
  const ilimitada = refundPlan({ order, membership: { status: "active", classes_remaining: null }, input: { ...base, kind: "total" } });
  assert.equal(ilimitada.classesToRemove, 0);
});

test("parcial: monto menor a lo que queda y las clases que decida la dueña", () => {
  const r = refundPlan({ order, membership: mem, input: { ...base, kind: "partial", amount: "425,50", classesToRemove: 2 } });
  assert.equal(r.ok, true);
  assert.equal(r.amount, 425.5);
  assert.equal(r.classesToRemove, 2);
  assert.equal(r.cancelMembership, false);
  assert.equal(r.newStatus, "partially_refunded");
  assert.equal(r.newRefunded, 425.5);
});

test("no deja devolver más de lo cobrado, ni lo mismo dos veces, ni clases que no hay", () => {
  const msg = (input, o = order, m = mem) => refundPlan({ order: o, membership: m, input: { ...base, ...input } });
  assert.equal(msg({ kind: "partial", amount: 1800 }).message, "No puedes reembolsar más de lo cobrado: quedan $1,700 por devolver.");
  assert.equal(msg({ kind: "partial", amount: 1700 }).message, "Es todo lo que queda por devolver: elige reembolso total.");
  assert.equal(msg({ kind: "partial", amount: 0 }).message, "Escribe el monto a devolver (mayor a $0).");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 7 }).message, "Sólo le quedan 6 clases sin usar.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1.5 }).message, "Las clases a quitar deben ser un número entero de 0 en adelante.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1 }, order, { status: "active", classes_remaining: null }).message,
    "La membresía es ilimitada: no hay clases que quitar.");
  assert.equal(msg({ kind: "partial", amount: 100, classesToRemove: 1 }, order, null).message, "Esta orden no tiene membresía: no hay clases que quitar.");
  const ya = msg({ kind: "total" }, { ...order, refunded_amount: "1700", refund_status: "refunded" });
  assert.equal(ya.status, 409);
  assert.equal(ya.code, "ALREADY_REFUNDED");
});

test("sólo órdenes pagadas, con monto, que no sean de Wellhub", () => {
  assert.equal(refundPlan({ order: { ...order, status: "pending_verification" }, input: { ...base, kind: "total" } }).code, "ORDER_NOT_PAID");
  assert.equal(refundPlan({ order: { ...order, total_amount: "0" }, input: { ...base, kind: "total" } }).code, "NOTHING_CHARGED");
  assert.equal(refundPlan({ order: { ...order, channel: "wellhub" }, input: { ...base, kind: "total" } }).code, "WELLHUB_ORDER");
  assert.equal(refundPlan({ order: null, input: {} }).status, 404);
});

test("entrada: tipo, método y motivo", () => {
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "otro" } }).message, "Elige reembolso total o parcial.");
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "total", method: "cheque" } }).message,
    "Elige cómo se devolvió el dinero: efectivo, transferencia o terminal.");
  const sin = refundPlan({ order, membership: mem, input: { kind: "total", method: "cash", reason: "ok" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.code, "REASON_REQUIRED");
  assert.equal(refundPlan({ order, membership: mem, input: { ...base, kind: "total", reference: "x".repeat(101) } }).status, 400);
  assert.deepEqual(REFUND_METHODS, ["cash", "transfer", "card"]);
  assert.equal(parseMoney("99,50"), 99.5);
  assert.ok(Number.isNaN(parseMoney("abc")));
});
```

`server/tests/reembolsos.test.mjs`:

```js
// Tarea 7 · auditoría 2026-09-27, bloque 3 (P1-12 · E6 · EC11). La dueña
// registra reembolsos total o parcial de una orden aprobada: no más de lo cobrado
// ni dos totales; ajusta las clases; los reportes, el dashboard y /api/payments
// restan el reembolso en su fecha; todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, makeClass, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgreemb";
let A, f, recep, precio, parte;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  recep = await makeClient(PFX, "recep", { role: "reception" });
  const planes = await api("GET", "/api/plans", { token: A });
  precio = Number(planes.body.data.find((p) => p.id === f.plan.id).effectivePrice);
  assert.ok(precio > 10, `el plan de prueba debe cobrar algo (precio=${precio})`);
  parte = Math.round(precio * 0.3);
});
after(async () => {
  await sql(`DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  await cleanup(PFX);
  await closeDb();
});

async function venta(key) {
  const c = await makeClient(PFX, key);
  const r = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [m] = await sql(`SELECT id, order_id, classes_remaining FROM memberships WHERE user_id = $1`, [c.id]);
  assert.ok(m.order_id, "la venta de mostrador liga su orden (bloque 2)");
  return { c, membershipId: m.id, orderId: m.order_id, clases: m.classes_remaining };
}
const reembolsar = (orderId, body, token = A) =>
  api("POST", `/api/admin/orders/${orderId}/refunds`, { token, body: { method: "cash", reason: "Se mudó de ciudad", ...body } });

test("total: registra, marca la orden, cancela la membresía y sus reservas futuras, y queda en la bitácora", async () => {
  const { c, membershipId, orderId } = await venta("total");
  const classId = await makeClass(A, f, { date: day(9) });
  assert.equal((await api("POST", "/api/bookings", { token: c.token, body: { classId } })).status, 201);
  const r = await reembolsar(orderId, { kind: "total", method: "transfer", reference: "SPEI 123", reason: "No pudo seguir por lesión" });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(Number(r.body.data.refund.amount), precio);
  assert.equal(r.body.data.order.refund_status, "refunded");
  assert.equal(r.body.data.bookings_cancelled, 1);
  const [o] = await sql(`SELECT status::text AS s, refunded_amount, refund_status, refunded_at FROM orders WHERE id = $1`, [orderId]);
  assert.equal(o.s, "approved", "la orden sigue aprobada: nada de lo que cuenta órdenes aprobadas se rompe");
  assert.equal(Number(o.refunded_amount), precio);
  assert.equal(o.refund_status, "refunded");
  assert.ok(o.refunded_at);
  const [m] = await sql(`SELECT status::text AS s, classes_remaining, cancellation_reason FROM memberships WHERE id = $1`, [membershipId]);
  assert.equal(m.s, "cancelled");
  assert.equal(m.classes_remaining, 0);
  assert.match(m.cancellation_reason, /^Reembolso total: No pudo seguir por lesión/);
  const [b] = await sql(`SELECT status::text AS s, cancellation_reason FROM bookings WHERE class_id = $1 AND user_id = $2`, [classId, c.id]);
  assert.equal(b.s, "cancelled");
  const [log] = await sql(`SELECT actor_id, reason, before, after, meta FROM audit_log WHERE entity_id = $1 AND action = 'order.refund'`, [orderId]);
  assert.equal(log.reason, "No pudo seguir por lesión");
  assert.equal(log.meta.kind, "total");
  assert.equal(Number(log.meta.amount), precio);
  assert.equal(log.meta.method, "transfer");
  assert.equal(log.meta.reference, "SPEI 123");
  assert.equal(log.meta.bookings_cancelled, 1);
  assert.equal(log.after.refund_status, "refunded");
  assert.equal(log.after.membership_status, "cancelled");
  const otra = await reembolsar(orderId, { kind: "total" });
  assert.equal(otra.status, 409);
  assert.equal(otra.body.code, "ALREADY_REFUNDED");
});

test("parcial: quita las clases elegidas, la membresía sigue activa y no deja pasar de lo cobrado", async () => {
  const { membershipId, orderId, clases } = await venta("parcial");
  const r = await reembolsar(orderId, { kind: "partial", amount: parte, classesToRemove: 2 });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.order.refund_status, "partially_refunded");
  const [m] = await sql(`SELECT status::text AS s, classes_remaining FROM memberships WHERE id = $1`, [membershipId]);
  assert.equal(m.s, "active");
  assert.equal(m.classes_remaining, clases - 2);
  const quedan = precio - parte;
  const mas = await reembolsar(orderId, { kind: "partial", amount: quedan + 1 });
  assert.equal(mas.status, 400);
  assert.match(mas.body.message, /^No puedes reembolsar más de lo cobrado: quedan/);
  const exacto = await reembolsar(orderId, { kind: "partial", amount: quedan });
  assert.equal(exacto.body.message, "Es todo lo que queda por devolver: elige reembolso total.");
  const muchas = await reembolsar(orderId, { kind: "partial", amount: 1, classesToRemove: clases });
  assert.equal(muchas.status, 400);
  assert.equal(muchas.body.message, `Sólo le quedan ${clases - 2} clases sin usar.`);
  const resto = await reembolsar(orderId, { kind: "total" });
  assert.equal(resto.status, 201);
  assert.equal(Number(resto.body.data.refund.amount), quedan, "el total devuelve sólo lo que quedaba");
  const [o] = await sql(`SELECT refunded_amount, refund_status FROM orders WHERE id = $1`, [orderId]);
  assert.equal(Number(o.refunded_amount), precio);
  assert.equal(o.refund_status, "refunded");
});

test("dos totales a la vez: uno pasa y el otro 409 (no se devuelve dos veces)", async () => {
  const { orderId } = await venta("doble");
  const [x, y] = await Promise.all([reembolsar(orderId, { kind: "total" }), reembolsar(orderId, { kind: "total" })]);
  assert.deepEqual([x.status, y.status].sort(), [201, 409]);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId]))[0].n, 1);
});

test("sin motivo, método o tipo malos → 400; recepción → 403; inexistente → 404; id basura → 400", async () => {
  const { orderId } = await venta("malas");
  const sin = await api("POST", `/api/admin/orders/${orderId}/refunds`, { token: A, body: { kind: "total", method: "cash" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await reembolsar(orderId, { kind: "total", method: "cheque" })).status, 400);
  assert.equal((await reembolsar(orderId, { kind: "casi" })).status, 400);
  assert.equal((await reembolsar(orderId, { kind: "total" }, recep.token)).status, 403);
  assert.equal((await reembolsar(crypto.randomUUID(), { kind: "total" })).status, 404);
  assert.equal((await api("POST", "/api/admin/orders/basura/refunds", { token: A, body: { kind: "total", method: "cash", reason: "Motivo válido" } })).status, 400);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM refunds WHERE order_id = $1`, [orderId]))[0].n, 0);
});

test("una cortesía, una orden sin pagar o una de Wellhub no se reembolsan (409)", async () => {
  const c = await makeClient(PFX, "cortesia");
  const r = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0), amount: 0, reason: "Cortesía por evento de apertura" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const [m] = await sql(`SELECT order_id FROM memberships WHERE user_id = $1`, [c.id]);
  const cero = await reembolsar(m.order_id, { kind: "total" });
  assert.equal(cero.status, 409);
  assert.equal(cero.body.code, "NOTHING_CHARGED");
  const [p] = await sql(`INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount) VALUES ($1, $2, 'pending_verification', 'transfer', 100, 100) RETURNING id`, [c.id, f.plan.id]);
  assert.equal((await reembolsar(p.id, { kind: "total" })).body.code, "ORDER_NOT_PAID");
  const [w] = await sql(`INSERT INTO orders (user_id, plan_id, status, payment_method, subtotal, total_amount, channel) VALUES ($1, $2, 'approved', 'cash', 170, 170, 'wellhub') RETURNING id`, [c.id, f.plan.id]);
  assert.equal((await reembolsar(w.id, { kind: "total" })).body.code, "WELLHUB_ORDER");
});

test("los reportes, el dashboard y /api/payments restan el reembolso en su fecha", async () => {
  const { c, orderId } = await venta("reporte");
  const antes = (await api("GET", "/api/reports/overview", { token: A })).body.data;
  const stAntes = (await api("GET", "/api/admin/stats", { token: A })).body;
  const r = await reembolsar(orderId, { kind: "partial", amount: parte });
  assert.equal(r.status, 201);
  const despues = (await api("GET", "/api/reports/overview", { token: A })).body.data;
  assert.equal(Number(despues.monthlyRevenue), Number(antes.monthlyRevenue) - parte);
  assert.equal(Number(despues.refundsTotal), Number(antes.refundsTotal) + parte);
  assert.equal(Number(despues.grossRevenue), Number(antes.grossRevenue), "las ventas no cambian");
  const stDespues = (await api("GET", "/api/admin/stats", { token: A })).body;
  assert.equal(Number(stDespues.monthlyRevenue), Number(stAntes.monthlyRevenue) - parte);
  const pagos = await api("GET", `/api/payments?userId=${c.id}`, { token: A });
  assert.equal(pagos.status, 200);
  const orden = pagos.body.data.find((p) => p.source === "order");
  assert.equal(orden.refundStatus, "partially_refunded");
  assert.equal(orden.refundedAmount, parte);
  assert.equal(orden.orderId, orderId);
  assert.ok(orden.createdAt, "createdAt para el historial (antes salía vacío)");
  const fila = pagos.body.data.find((p) => p.source === "refund");
  assert.equal(Number(fila.total_amount), -parte);
  assert.match(fila.planName, /^Reembolso · /);
  assert.equal(Number(pagos.body.total), precio - parte);
  assert.equal(Number(pagos.body.refundsTotal), parte);
  const meses = (await api("GET", "/api/reports/revenue", { token: A })).body.data;
  assert.ok(Number(meses.at(-1).refunds) >= parte, "el mes actual resta el reembolso");
});

test("un parcial sobre una membresía ilimitada no quita clases", async () => {
  const { membershipId, orderId } = await venta("ilimitada");
  await sql(`UPDATE memberships SET classes_remaining = NULL WHERE id = $1`, [membershipId]);
  const r = await reembolsar(orderId, { kind: "partial", amount: parte, classesToRemove: 1 });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, "La membresía es ilimitada: no hay clases que quitar.");
  assert.equal((await reembolsar(orderId, { kind: "partial", amount: parte })).status, 201);
});
```

`src/pages/admin/payments/refund-math.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { refundRemaining, suggestedClassesToRemove, REFUND_METHOD_LABEL } from "./refund-math";

describe("reembolsos · cálculos del panel", () => {
  it("lo que queda por devolver", () => {
    expect(refundRemaining(1700, 0)).toBe(1700);
    expect(refundRemaining(1700, 500.5)).toBe(1199.5);
    expect(refundRemaining(1700, null)).toBe(1700);
  });
  it("clases sugeridas: proporcionales a lo devuelto, con tope en las que le quedan", () => {
    expect(suggestedClassesToRemove({ amount: 425, charged: 1700, classLimit: 8, classesRemaining: 6 })).toBe(2);
    expect(suggestedClassesToRemove({ amount: 1600, charged: 1700, classLimit: 8, classesRemaining: 5 })).toBe(5);
    expect(suggestedClassesToRemove({ amount: 100, charged: 1700, classLimit: null, classesRemaining: null })).toBe(0);
    expect(suggestedClassesToRemove({ amount: Number.NaN, charged: 1700, classLimit: 8, classesRemaining: 6 })).toBe(0);
  });
  it("cómo se devolvió", () => {
    expect(REFUND_METHOD_LABEL).toEqual({ cash: "Efectivo", transfer: "Transferencia", card: "Terminal" });
  });
});
```

`src/pages/admin/payments/payments-summary.test.ts`: agrega:

```ts
  it("los reembolsos (filas negativas) restan del mes y se cuentan aparte", () => {
    const s = summarizePayments([
      p("2026-09-24T10:00:00", "cash", 1700),
      p("2026-09-25T09:00:00", "transfer", -500),
      p("2026-09-10T12:00:00", "cash", 0),
    ], now);
    expect(s.month).toEqual({ amount: 1200, count: 2 });
    expect(s.refunds).toEqual({ amount: 500, count: 1 });
    expect(s.byMethod).toEqual({ cash: 1700 });
    expect(s.week).toEqual({ amount: 1200, count: 1 });
  });
```

`src/pages/admin/payments/PaymentsHistory.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: (...a: unknown[]) => toastSpy(...a) }));
import api from "@/lib/api";
import PaymentsHistoryPage from "./PaymentsHistory";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const orden = (over: Record<string, unknown>) => ({
  source: "order", method: "cash", total_amount: 1700, createdAt: "2026-09-24T12:00:00Z", planName: "Paquete 8 clases",
  refundedAmount: 0, refundStatus: null, membershipStatus: "active", classesRemaining: 6, classLimit: 8, ...over,
});
const PAGOS = {
  data: [
    orden({ id: "o1", orderId: "o1", userName: "Camila Torres", userId: "u1", membershipId: "m1" }),
    orden({ id: "o2", orderId: "o2", userName: "Lucía Díaz", userId: "u2", membershipId: "m2", refundedAmount: 500, refundStatus: "partially_refunded" }),
    { id: "r1", orderId: "o2", source: "refund", userName: "Lucía Díaz", userId: "u2", planName: "Reembolso · Paquete 8 clases", total_amount: -500, method: "transfer", createdAt: "2026-09-25T09:00:00Z" },
    orden({ id: "o3", orderId: "o3", userName: "Sara Ruiz", userId: "u3", membershipId: "m3", refundedAmount: 1700, refundStatus: "refunded", membershipStatus: "cancelled", classesRemaining: 0 }),
  ],
  total: 4600,
  refundsTotal: 500,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: { data: {} } });
  toastSpy.mockReset();
  loginAs("admin");
  routeApi(mockApi, { "/admin/stats": { pendingAlerts: 0 }, "/payments": PAGOS });
});
afterEach(() => vi.useRealTimers());

const fila = async (nombre: string, n = 0) => (await screen.findAllByText(nombre))[n].closest("tr")!;

describe("Cobros · Historial con reembolsos (auditoría 2026-09-27, P1-12)", () => {
  it("marca los reembolsos, sólo ofrece reembolsar lo que queda por devolver y los resta en las cifras", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    const camila = await fila("Camila Torres");
    expect(within(camila).getByRole("button", { name: "Reembolsar el pago de Camila Torres" })).toBeInTheDocument();
    const sara = await fila("Sara Ruiz");
    expect(within(sara).getByText("Reembolsado")).toBeInTheDocument();
    expect(within(sara).queryByRole("button", { name: /Reembolsar/ })).toBeNull();
    const lucias = await screen.findAllByText("Lucía Díaz");
    const textos = lucias.map((el) => el.closest("tr")!.textContent ?? "");
    expect(textos.some((t) => t.includes("Reembolso parcial · $500"))).toBe(true);
    expect(textos.some((t) => t.includes("-$500"))).toBe(true);
    expect(screen.getByText("Reembolsos · septiembre")).toBeInTheDocument();
  });

  it("reembolso parcial: sugiere clases proporcionales, pide motivo y manda lo elegido", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    fireEvent.click(within(await fila("Camila Torres")).getByRole("button", { name: "Reembolsar el pago de Camila Torres" }));
    const dlg = await screen.findByRole("dialog", { name: "Reembolsar a Camila Torres" });
    fireEvent.click(within(dlg).getByLabelText("Reembolso parcial"));
    fireEvent.change(within(dlg).getByLabelText("Monto a devolver"), { target: { value: "425" } });
    expect(within(dlg).getByLabelText("Clases a quitar")).toHaveValue(2);
    const registrar = within(dlg).getByRole("button", { name: "Registrar reembolso" });
    expect(registrar).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "Se lesionó la rodilla" } });
    expect(registrar).toBeEnabled();
    expect(within(dlg).getByText("El dinero se devuelve fuera del sistema: aquí sólo queda registrado.")).toBeInTheDocument();
    fireEvent.click(registrar);
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/admin/orders/o1/refunds", {
      kind: "partial", method: "cash", reason: "Se lesionó la rodilla", amount: 425, classesToRemove: 2,
    }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Reembolso registrado" })));
  });

  it("reembolso total: explica que cancela la membresía y manda el método y la referencia", async () => {
    renderAdmin(<PaymentsHistoryPage />, { route: "/admin/payments/historial" });
    fireEvent.click(within(await fila("Camila Torres")).getByRole("button", { name: "Reembolsar el pago de Camila Torres" }));
    const dlg = await screen.findByRole("dialog", { name: "Reembolsar a Camila Torres" });
    expect(within(dlg).getByText(/Se devuelven \$1,700, se cancela la membresía y se quitan sus 6 clases sin usar/)).toBeInTheDocument();
    fireEvent.change(within(dlg).getByLabelText("¿Cómo se devolvió?"), { target: { value: "transfer" } });
    fireEvent.change(within(dlg).getByLabelText("Referencia (opcional)"), { target: { value: "SPEI 1" } });
    fireEvent.change(within(dlg).getByLabelText("Motivo (obligatorio)"), { target: { value: "No pudo seguir por lesión" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Registrar reembolso" }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith("/admin/orders/o1/refunds", {
      kind: "total", method: "transfer", reason: "No pudo seguir por lesión", reference: "SPEI 1",
    }));
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/refunds.test.js` → FAIL.
  - `npx vitest run src/pages/admin/payments` → FAIL.
  - En tu base (5596/8196), `reembolsos.test.mjs` → FAIL (404, la ruta no existe).

- [ ] **Step 3: Implementar.**

`server/lib/refunds.js`:

```js
// Reembolsos que registra la dueña (auditoría 2026-09-27, P1-12). El dinero se
// devuelve fuera del sistema (efectivo, transferencia o terminal): aquí sólo se
// registra, se ajustan las clases y se marca el pago. No se llama a ninguna pasarela.
//   - Total: devuelve lo que queda por devolver, cancela la membresía de la orden
//     y le deja las clases en 0.
//   - Parcial: un monto menor a lo que queda; la dueña elige cuántas clases sin
//     usar quitar (el panel sugiere la proporción) y la membresía sigue activa.
import { reasonProblem } from "./audit.js";
import { cleanPaymentReference } from "./membershipAdmin.js";

export const REFUND_METHODS = Object.freeze(["cash", "transfer", "card"]);

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const pesos = (n) => `$${round2(n).toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const isUnlimited = (v) => v === null || v === undefined || Number(v) >= 9999;

export function parseMoney(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string" || !v.trim()) return Number.NaN;
  return Number(v.trim().replace(",", "."));
}

export function refundPlan({ order, membership = null, input = {} } = {}) {
  if (!order) return { ok: false, status: 404, message: "Orden no encontrada" };
  if (String(order.status) !== "approved") {
    return { ok: false, status: 409, code: "ORDER_NOT_PAID", message: "Sólo se reembolsan órdenes pagadas (aprobadas)." };
  }
  if (String(order.payment_method) === "wellhub" || String(order.channel) === "wellhub") {
    return { ok: false, status: 409, code: "WELLHUB_ORDER", message: "Las visitas de Wellhub se concilian con Wellhub; no se reembolsan aquí." };
  }
  const charged = round2(order.total_amount ?? 0);
  const already = round2(order.refunded_amount ?? 0);
  const remaining = round2(charged - already);
  if (charged <= 0) {
    return { ok: false, status: 409, code: "NOTHING_CHARGED", message: "Esta orden no tiene monto cobrado (cortesía): no hay nada que reembolsar." };
  }
  if (order.refund_status === "refunded" || remaining <= 0) {
    return { ok: false, status: 409, code: "ALREADY_REFUNDED", message: "Esta orden ya se reembolsó completa." };
  }
  const { kind, amount, method, reference, reason, classesToRemove } = input || {};
  if (kind !== "total" && kind !== "partial") return { ok: false, status: 400, message: "Elige reembolso total o parcial." };
  if (!REFUND_METHODS.includes(method)) {
    return { ok: false, status: 400, message: "Elige cómo se devolvió el dinero: efectivo, transferencia o terminal." };
  }
  const problem = reasonProblem(reason);
  if (problem) return { ok: false, status: 400, code: "REASON_REQUIRED", message: problem };
  const ref = cleanPaymentReference(reference);
  if (!ref.ok) return { ok: false, status: 400, message: ref.message };
  const limited = Boolean(membership) && !isUnlimited(membership.classes_remaining);

  if (kind === "total") {
    return {
      ok: true, kind, amount: remaining, method, reference: ref.value,
      classesToRemove: limited ? Math.max(0, Number(membership.classes_remaining) || 0) : 0,
      cancelMembership: Boolean(membership) && membership.status !== "cancelled",
      newRefunded: charged, newStatus: "refunded", charged, remaining,
    };
  }

  const n = round2(parseMoney(amount));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, status: 400, message: "Escribe el monto a devolver (mayor a $0)." };
  if (n > remaining + 0.004) {
    return { ok: false, status: 400, message: `No puedes reembolsar más de lo cobrado: quedan ${pesos(remaining)} por devolver.` };
  }
  if (Math.abs(n - remaining) < 0.005) {
    return { ok: false, status: 400, message: "Es todo lo que queda por devolver: elige reembolso total." };
  }
  const c = classesToRemove === undefined || classesToRemove === null || classesToRemove === "" ? 0 : Number(classesToRemove);
  if (!Number.isInteger(c) || c < 0) {
    return { ok: false, status: 400, message: "Las clases a quitar deben ser un número entero de 0 en adelante." };
  }
  if (c > 0) {
    if (!membership) return { ok: false, status: 400, message: "Esta orden no tiene membresía: no hay clases que quitar." };
    if (!limited) return { ok: false, status: 400, message: "La membresía es ilimitada: no hay clases que quitar." };
    if (membership.status !== "active") return { ok: false, status: 400, message: "La membresía ya no está activa: no hay clases que quitar." };
    if (c > Number(membership.classes_remaining)) {
      return { ok: false, status: 400, message: `Sólo le quedan ${membership.classes_remaining} clases sin usar.` };
    }
  }
  return {
    ok: true, kind, amount: n, method, reference: ref.value, classesToRemove: c, cancelMembership: false,
    newRefunded: round2(already + n), newStatus: "partially_refunded", charged, remaining,
  };
}
```

En `server/index.js`:

**Import**, tras `import { userAnonymizationValues, buildAnonymizeUpdate, WAIVER_ANON_VALUES, GUEST_ANON_VALUES } from "./lib/anonymize.js";`:

```js
import { refundPlan } from "./lib/refunds.js";
```

**Reportes.**
1. Justo antes de `app.get("/api/reports/overview", …`:

```js
// Ingreso neto en caja de un rango: ventas aprobadas − reembolsos registrados en
// el rango (auditoría 2026-09-27, P1-12). Un reembolso resta en su fecha: no
// reescribe meses cerrados.
const NET_REVENUE_SQL = `SELECT
    (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'approved' AND created_at BETWEEN $1 AND $2) AS gross,
    (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE created_at BETWEEN $1 AND $2) AS refunds`;
```

2. En `/api/reports/overview`:
   - El elemento `pool.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status='approved' AND created_at BETWEEN $1 AND $2", [range.from, range.to]),` pasa a `pool.query(NET_REVENUE_SQL, [range.from, range.to]),`.
   - El del periodo anterior (`[range.prevFrom, range.prevTo]`) pasa a `pool.query(NET_REVENUE_SQL, [range.prevFrom, range.prevTo]),`.
   - `const monthlyRevenue = parseFloat(revenue.rows[0].total);` pasa a:

```js
    const grossRevenue = parseFloat(revenue.rows[0].gross);
    const refundsTotal = parseFloat(revenue.rows[0].refunds);
    const monthlyRevenue = grossRevenue - refundsTotal;
```

   - `const prevRev = parseFloat(prevRevenue.rows[0].total);` pasa a `const prevRev = parseFloat(prevRevenue.rows[0].gross) - parseFloat(prevRevenue.rows[0].refunds);`.
   - En `data`, tras `monthlyRevenue,`: `grossRevenue,` y `refundsTotal,`.
3. `/api/reports/revenue-sparkline`: reemplaza su consulta por:

```js
    const r = await pool.query(`
      WITH weeks AS (
        SELECT DATE_TRUNC('week', CURRENT_DATE) - (INTERVAL '1 week' * gs.n) AS week_start
        FROM generate_series(0, 11) AS gs(n)
      ),
      sales AS (
        SELECT DATE_TRUNC('week', created_at) AS week_start, SUM(total_amount) AS amount
          FROM orders WHERE status = 'approved' GROUP BY 1
      ),
      refunded AS (
        SELECT DATE_TRUNC('week', created_at) AS week_start, SUM(amount) AS amount
          FROM refunds GROUP BY 1
      )
      SELECT w.week_start AS week,
             (COALESCE(s.amount, 0) - COALESCE(rf.amount, 0))::int AS amount
        FROM weeks w
        LEFT JOIN sales s ON s.week_start = w.week_start
        LEFT JOIN refunded rf ON rf.week_start = w.week_start
       ORDER BY w.week_start ASC
    `);
```

4. `/api/reports/revenue`: reemplaza su consulta por:

```js
    const r = await pool.query(
      `WITH months AS (
         SELECT DATE_TRUNC('month', CURRENT_DATE) - (INTERVAL '1 month' * gs.n) AS month_start
         FROM generate_series(0, 11) AS gs(n)
       ),
       orders_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start,
                COALESCE(SUM(total_amount), 0) AS total,
                COUNT(*) AS count
           FROM orders
          WHERE status = 'approved'
          GROUP BY 1
       ),
       refunds_by_month AS (
         SELECT DATE_TRUNC('month', created_at) AS month_start, COALESCE(SUM(amount), 0) AS total
           FROM refunds
          GROUP BY 1
       )
       SELECT m.month_start AS month,
              COALESCE(o.total, 0) - COALESCE(rf.total, 0) AS amount,
              COALESCE(o.count, 0) AS count,
              COALESCE(rf.total, 0) AS refunds
         FROM months m
         LEFT JOIN orders_by_month o ON o.month_start = m.month_start
         LEFT JOIN refunds_by_month rf ON rf.month_start = m.month_start
        ORDER BY m.month_start ASC`
    );
```

**`GET /api/admin/stats`:** el elemento `pool.query("SELECT COALESCE(SUM(total_amount),0) AS total FROM orders WHERE status = 'approved' AND created_at >= $1", [monthStart]),` pasa a:

```js
      // Neto: ventas del mes − reembolsos del mes (auditoría 2026-09-27, P1-12).
      pool.query(
        `SELECT (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE status = 'approved' AND created_at >= $1)
              - (SELECT COALESCE(SUM(amount), 0) FROM refunds WHERE created_at >= $1) AS total`,
        [monthStart],
      ),
```

**`GET /api/payments`:** reemplaza la ruta completa por:

```js
// GET /api/payments — el libro de cobros de la dueña: órdenes aprobadas,
// membresías viejas sin orden y, desde el bloque 3, los reembolsos como filas
// negativas en su fecha (auditoría 2026-09-27, P1-12). Cada orden trae su
// reembolso y su membresía para el diálogo "Reembolsar". `total` es neto.
app.get("/api/payments", ownerMiddleware, async (req, res) => {
  try {
    const { startDate, endDate, userId } = req.query;
    const limit = Math.min(1000, Math.max(1, Number.parseInt(String(req.query.limit ?? "200"), 10) || 200));
    const params = [];
    const filtros = (col, userCol) => {
      let w = "";
      if (startDate) { params.push(startDate); w += ` AND ${col} >= $${params.length}`; }
      if (endDate) { params.push(endDate); w += ` AND ${col} <= $${params.length}`; }
      if (userId) { params.push(userId); w += ` AND ${userCol} = $${params.length}`; }
      return w;
    };
    const ordenes = `
      SELECT o.id, o.user_id, u.display_name AS user_name, p.name AS plan_name,
             o.total_amount::numeric AS total_amount, o.payment_method::text AS method, o.status::text AS status,
             o.created_at, 'order'::text AS source, o.id AS order_id,
             COALESCE(o.refunded_amount, 0)::numeric AS refunded_amount, o.refund_status::text AS refund_status,
             mm.id AS membership_id, mm.status::text AS membership_status, mm.classes_remaining, p.class_limit,
             NULL::text AS reason
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN plans p ON o.plan_id = p.id
        LEFT JOIN LATERAL (
          SELECT m.id, m.status, m.classes_remaining FROM memberships m
           WHERE m.order_id = o.id ORDER BY m.created_at ASC LIMIT 1
        ) mm ON true
       WHERE o.status = 'approved'${filtros("o.created_at", "o.user_id")}`;
    const membresias = `
      SELECT m.id, m.user_id, u.display_name AS user_name, p.name AS plan_name,
             p.price::numeric AS total_amount, m.payment_method::text AS method, m.status::text AS status,
             m.created_at, 'membership'::text AS source, NULL::uuid AS order_id,
             0::numeric AS refunded_amount, NULL::text AS refund_status,
             m.id AS membership_id, m.status::text AS membership_status, m.classes_remaining, p.class_limit,
             NULL::text AS reason
        FROM memberships m
        LEFT JOIN users u ON m.user_id = u.id
        LEFT JOIN plans p ON m.plan_id = p.id
       WHERE m.status = 'active' AND m.order_id IS NULL${filtros("m.created_at", "m.user_id")}`;
    const reembolsos = `
      SELECT r.id, r.user_id, u.display_name AS user_name, p.name AS plan_name,
             (-r.amount)::numeric AS total_amount, r.method::text AS method, 'refunded'::text AS status,
             r.created_at, 'refund'::text AS source, r.order_id,
             r.amount::numeric AS refunded_amount, NULL::text AS refund_status,
             r.membership_id, NULL::text AS membership_status, NULL::int AS classes_remaining, NULL::int AS class_limit,
             r.reason
        FROM refunds r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN plans p ON p.id = o.plan_id
       WHERE true${filtros("r.created_at", "r.user_id")}`;
    params.push(limit);
    const r = await pool.query(
      `(${ordenes}) UNION ALL (${membresias}) UNION ALL (${reembolsos}) ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    const total = r.rows.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
    const refundsTotal = r.rows.filter((o) => o.source === "refund").reduce((sum, o) => sum + parseFloat(o.refunded_amount || 0), 0);
    return res.json({
      data: r.rows.map((o) => ({
        ...o,
        userName: o.user_name,
        userId: o.user_id,
        planName: o.source === "refund" ? `Reembolso · ${o.plan_name ?? "orden"}` : o.plan_name,
        createdAt: o.created_at,
        orderId: o.order_id ?? null,
        refundedAmount: Number(o.refunded_amount ?? 0),
        refundStatus: o.refund_status ?? null,
        membershipId: o.membership_id ?? null,
        membershipStatus: o.membership_status ?? null,
        classesRemaining: o.classes_remaining ?? null,
        classLimit: o.class_limit ?? null,
      })),
      total,
      refundsTotal,
    });
  } catch (err) {
    console.error("[GET /payments]", err);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

**Sección nueva**, justo antes de `// ─── Discount codes admin CRUD`:

```js
// ─── Reembolsos (auditoría 2026-09-27, P1-12) ───────────────────────────────
// La dueña registra un reembolso total o parcial de una orden aprobada. El
// dinero se devuelve fuera del sistema (efectivo, transferencia o terminal):
// aquí no se llama a ninguna pasarela.
//   - Total: cancela la membresía de la orden, deja sus clases en 0 y cancela
//     sus reservas futuras (confirmadas y en fila); los lugares suben la fila.
//   - Parcial: resta las clases que eligió la dueña; la membresía sigue activa.
// La orden queda approved con refunded_amount y refund_status; los reportes
// restan el reembolso en su fecha. Todo en una transacción con la orden y la
// membresía bloqueadas: dos totales a la vez no pasan.
app.post("/api/admin/orders/:id/refunds", ownerMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const o = await client.query(
      `SELECT o.id, o.user_id, o.status::text AS status, o.payment_method::text AS payment_method, o.channel,
              o.total_amount, COALESCE(o.refunded_amount, 0) AS refunded_amount, o.refund_status, o.order_number,
              p.name AS plan_name
         FROM orders o
         LEFT JOIN plans p ON p.id = o.plan_id
        WHERE o.id = $1
        FOR UPDATE OF o`,
      [req.params.id],
    );
    if (!o.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Orden no encontrada" });
    }
    const order = o.rows[0];
    const membership = (await client.query(
      `SELECT id, user_id, status::text AS status, classes_remaining FROM memberships
        WHERE order_id = $1 ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
      [order.id],
    )).rows[0] ?? null;
    const plan = refundPlan({ order, membership, input: req.body || {} });
    if (!plan.ok) {
      await client.query("ROLLBACK");
      return res.status(plan.status).json({ ...(plan.code ? { code: plan.code } : {}), message: plan.message });
    }
    const why = cleanReason(req.body.reason);
    let membershipAfter = membership;
    let bookings = [];
    if (plan.cancelMembership) {
      membershipAfter = (await client.query(
        `UPDATE memberships SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = $2,
                classes_remaining = CASE WHEN classes_remaining IS NULL OR classes_remaining >= 9999
                                         THEN classes_remaining ELSE 0 END,
                updated_at = NOW()
          WHERE id = $1
          RETURNING id, status::text AS status, classes_remaining`,
        [membership.id, `Reembolso total: ${why}`.slice(0, 500)],
      )).rows[0];
      await resyncMixtoBuckets(client, membership.id);
      bookings = (await client.query(
        `WITH prev AS (
           SELECT b.id, b.class_id, b.status::text AS status
             FROM bookings b JOIN classes c ON c.id = b.class_id
            WHERE b.membership_id = $1 AND b.status IN ('confirmed', 'waitlist')
              AND ((c.date + c.start_time) AT TIME ZONE '${STUDIO_TIMEZONE}') > NOW()
            FOR UPDATE OF b
         )
         UPDATE bookings b SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $2, cancellation_reason = $3
           FROM prev
          WHERE b.id = prev.id
          RETURNING b.id, b.class_id, prev.status AS prev_status`,
        [membership.id, req.userId, `Reembolso total: ${why}`.slice(0, 500)],
      )).rows;
      // Cupo: lo mantiene el trigger update_class_booking_count (auditoría 2026-09-08, P1-6).
    } else if (plan.classesToRemove > 0) {
      membershipAfter = (await client.query(
        `UPDATE memberships SET classes_remaining = GREATEST(classes_remaining - $2, 0), updated_at = NOW()
          WHERE id = $1
          RETURNING id, status::text AS status, classes_remaining`,
        [membership.id, plan.classesToRemove],
      )).rows[0];
      await resyncMixtoBuckets(client, membership.id);
    }
    const refund = (await client.query(
      `INSERT INTO refunds (order_id, membership_id, user_id, amount, kind, method, reference, reason,
                            classes_removed, membership_cancelled, bookings_cancelled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [order.id, membership?.id ?? null, order.user_id, plan.amount, plan.kind, plan.method, plan.reference, why,
       plan.classesToRemove, plan.cancelMembership, bookings.length, req.userId],
    )).rows[0];
    await client.query(
      `UPDATE orders SET refunded_amount = $2, refund_status = $3, refunded_at = NOW() WHERE id = $1`,
      [order.id, plan.newRefunded, plan.newStatus],
    );
    await recordAudit(client, {
      actorId: req.userId, action: "order.refund", entityType: "order", entityId: order.id, subjectUserId: order.user_id,
      reason: why,
      before: {
        refunded_amount: Number(order.refunded_amount), refund_status: order.refund_status ?? null,
        ...(membership ? { classes_remaining: membership.classes_remaining, membership_status: membership.status } : {}),
      },
      after: {
        refunded_amount: plan.newRefunded, refund_status: plan.newStatus,
        ...(membershipAfter ? { classes_remaining: membershipAfter.classes_remaining, membership_status: membershipAfter.status } : {}),
      },
      meta: {
        refund_id: refund.id, kind: plan.kind, amount: plan.amount, method: plan.method, reference: plan.reference,
        classes_removed: plan.classesToRemove, bookings_cancelled: bookings.length,
        order_number: order.order_number ?? null, plan_name: order.plan_name ?? null,
      },
    });
    await client.query("COMMIT");

    const freed = bookings.filter((b) => b.prev_status === "confirmed").map((b) => b.class_id);
    if (freed.length) await onSeatReleased(freed, { source: "refund" });
    if (order.user_id) triggerWalletPassSync(order.user_id, "refund");
    return res.status(201).json({
      data: {
        refund,
        order: { id: order.id, refunded_amount: plan.newRefunded, refund_status: plan.newStatus },
        membership: membershipAfter ?? null,
        bookings_cancelled: bookings.length,
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[POST /admin/orders/:id/refunds]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

`src/pages/admin/payments/refund-math.ts`:

```ts
// Cálculos del diálogo "Reembolsar" (auditoría 2026-09-27, P1-12). El servidor
// valida de nuevo; aquí sólo se sugiere y se explica.
export type RefundablePayment = {
  orderId: string;
  userName?: string | null;
  planName?: string | null;
  total_amount?: number | string;
  refundedAmount?: number | null;
  membershipId?: string | null;
  membershipStatus?: string | null;
  classesRemaining?: number | null;
  classLimit?: number | null;
};

export const REFUND_METHOD_LABEL: Record<"cash" | "transfer" | "card", string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Terminal",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export const refundRemaining = (total: number, refunded?: number | null): number => round2(Number(total || 0) - Number(refunded || 0));

/** Clases a quitar en un parcial: proporcionales a lo devuelto (precio por
 *  clase = cobrado ÷ clases del plan), con tope en las que le quedan. */
export function suggestedClassesToRemove({ amount, charged, classLimit, classesRemaining }: {
  amount: number; charged: number; classLimit?: number | null; classesRemaining?: number | null;
}): number {
  const a = Number(amount);
  const c = Number(charged);
  const l = Number(classLimit);
  const r = Number(classesRemaining);
  if (!(a > 0) || !(c > 0) || !(l > 0) || classesRemaining === null || classesRemaining === undefined || !(r >= 0) || r >= 9999) return 0;
  return Math.min(r, Math.max(0, Math.round(a / (c / l))));
}
```

`src/pages/admin/payments/RefundDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatMXN } from "@/lib/format";
import { REFUND_METHOD_LABEL, refundRemaining, suggestedClassesToRemove, type RefundablePayment } from "./refund-math";

type Metodo = keyof typeof REFUND_METHOD_LABEL;
const SELECT_CLS = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink focus:border-2 focus:border-ink focus:outline-none";

/* Registrar un reembolso (auditoría 2026-09-27, P1-12): sólo la dueña. El
   dinero se devuelve fuera del sistema; aquí queda el registro, las clases se
   ajustan y el motivo va a la bitácora. */
export default function RefundDialog({ payment, onClose }: { payment: RefundablePayment | null; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState<"total" | "partial">("total");
  const [amountStr, setAmountStr] = useState("");
  const [classesStr, setClassesStr] = useState("");
  const [classesTouched, setClassesTouched] = useState(false);
  const [method, setMethod] = useState<Metodo>("cash");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    setKind("total"); setAmountStr(""); setClassesStr(""); setClassesTouched(false);
    setMethod("cash"); setReference(""); setReason("");
  }, [payment?.orderId]);

  const mutation = useMutation({
    mutationFn: ({ orderId, body }: { orderId: string; body: Record<string, unknown>; resumen: string }) =>
      api.post(`/admin/orders/${orderId}/refunds`, body),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Reembolso registrado", description: vars.resumen });
      onClose();
    },
    onError: (e: any) => toast({
      title: "No se pudo registrar el reembolso",
      description: e?.response?.data?.message ?? "Inténtalo de nuevo.",
      variant: "destructive",
    }),
  });

  if (!payment) return null;

  const total = Number(payment.total_amount ?? 0);
  const remaining = refundRemaining(total, payment.refundedAmount);
  const unlimited = payment.classesRemaining === null || payment.classesRemaining === undefined || Number(payment.classesRemaining) >= 9999;
  const puedeQuitar = Boolean(payment.membershipId) && payment.membershipStatus === "active" && !unlimited;
  const amount = kind === "total" ? remaining : Number(amountStr.trim().replace(",", "."));
  const sugerencia = kind === "partial" && puedeQuitar
    ? suggestedClassesToRemove({ amount, charged: total, classLimit: payment.classLimit, classesRemaining: payment.classesRemaining })
    : 0;
  const clases = kind === "total"
    ? (unlimited || !payment.membershipId ? 0 : Number(payment.classesRemaining ?? 0))
    : classesTouched ? Number(classesStr) : sugerencia;
  const amountOk = kind === "total" || (Number.isFinite(amount) && amount > 0 && amount < remaining - 0.004);
  const clasesOk = kind === "total" || (Number.isInteger(clases) && clases >= 0 && (puedeQuitar ? clases <= Number(payment.classesRemaining ?? 0) : clases === 0));
  const reasonOk = reason.trim().length >= 5;
  const cancelaMembresia = Boolean(payment.membershipId) && payment.membershipStatus !== "cancelled";
  const resumen = kind === "total"
    ? `Se devuelven ${formatMXN(remaining)}${cancelaMembresia ? `, se cancela la membresía${clases > 0 ? ` y se quitan sus ${clases} clases sin usar` : ""}; sus reservas futuras se cancelan` : ""}.`
    : `Se devuelven ${amountOk ? formatMXN(amount) : "—"}${clases > 0 ? ` y se quitan ${clases} ${clases === 1 ? "clase" : "clases"}` : ""}. La membresía sigue activa.`;

  const enviar = () => mutation.mutate({
    orderId: payment.orderId,
    resumen,
    body: {
      kind, method, reason: reason.trim(),
      ...(kind === "partial" ? { amount, classesToRemove: clases } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
    },
  });

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md border-line bg-canvas text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">Reembolsar a {payment.userName ?? "la clienta"}</DialogTitle>
          <DialogDescription className="text-sm text-ink-muted">
            {payment.planName ?? "Pago"} · cobrado {formatMXN(total)}
            {Number(payment.refundedAmount ?? 0) > 0 ? ` · ya se devolvieron ${formatMXN(Number(payment.refundedAmount))}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-bold">Tipo de reembolso</legend>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="radio" name="refund-kind" checked={kind === "total"} onChange={() => setKind("total")} />
              Reembolso total ({formatMXN(remaining)})
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm">
              <input type="radio" name="refund-kind" checked={kind === "partial"} onChange={() => setKind("partial")} />
              Reembolso parcial
            </label>
          </fieldset>

          {kind === "partial" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ref-monto">Monto a devolver</Label>
                <Input id="ref-monto" type="number" inputMode="decimal" min={0} step="1" className="nums"
                  value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
                <p className="text-[0.75rem] text-ink-muted">Quedan {formatMXN(remaining)} por devolver.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref-clases">Clases a quitar</Label>
                <Input id="ref-clases" type="number" inputMode="numeric" min={0} step="1" className="nums" disabled={!puedeQuitar}
                  value={classesTouched ? classesStr : String(sugerencia)}
                  onChange={(e) => { setClassesTouched(true); setClassesStr(e.target.value); }} />
                <p className="text-[0.75rem] text-ink-muted">
                  {unlimited
                    ? "La membresía es ilimitada: no se quitan clases."
                    : !puedeQuitar
                      ? "Sin membresía activa: no se quitan clases."
                      : `Le quedan ${payment.classesRemaining} sin usar. Sugerido: ${sugerencia}.`}
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ref-metodo">¿Cómo se devolvió?</Label>
            <select id="ref-metodo" className={SELECT_CLS} value={method} onChange={(e) => setMethod(e.target.value as Metodo)}>
              {(Object.keys(REFUND_METHOD_LABEL) as Metodo[]).map((m) => <option key={m} value={m}>{REFUND_METHOD_LABEL[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-referencia">Referencia (opcional)</Label>
            <Input id="ref-referencia" maxLength={100} value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder="Folio de la transferencia o del voucher" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ref-motivo">Motivo (obligatorio)</Label>
            <Textarea id="ref-motivo" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. no pudo seguir por una lesión" />
            <p className="text-[0.75rem] text-ink-muted">Queda en la bitácora con tu nombre. Mínimo 5 caracteres.</p>
          </div>
          <p className="rounded-xl bg-accent-soft p-3 text-[13px] text-ink" aria-live="polite">{resumen}</p>
          <p className="text-[0.75rem] text-ink-muted">El dinero se devuelve fuera del sistema: aquí sólo queda registrado.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!amountOk || !clasesOk || !reasonOk || mutation.isPending} onClick={enviar}>
            {mutation.isPending ? "Registrando…" : "Registrar reembolso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**`src/pages/admin/payments/payments-summary.ts`:** reemplaza `summarizePayments` por:

```ts
/* Totales del Historial calculados con la misma lista de GET /payments. Los
   reembolsos llegan como filas negativas (bloque 3): restan del total, se
   cuentan aparte y no entran al desglose por método. */
export function summarizePayments(payments: PaymentRow[], now: Date) {
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const week = { amount: 0, count: 0 };
  const month = { amount: 0, count: 0 };
  const refunds = { amount: 0, count: 0 };
  const byMethod: Record<string, number> = {};
  for (const p of payments) {
    const d = p.createdAt ? new Date(p.createdAt) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const amount = Number(p.total_amount ?? p.amount ?? 0) || 0;
    if (isSameMonth(d, now)) {
      month.amount += amount;
      if (amount < 0) {
        refunds.amount += -amount;
        refunds.count += 1;
      } else {
        month.count += 1;
        const key = p.method ?? "otro";
        byMethod[key] = (byMethod[key] ?? 0) + amount;
      }
    }
    if (d >= weekStart && d <= now) {
      week.amount += amount;
      if (amount >= 0) week.count += 1;
    }
  }
  return { week, month, byMethod, refunds };
}
```

**`src/pages/admin/payments/PaymentsHistory.tsx`:**
- **Imports:** `import { useState } from "react";`, `import { Button } from "@/components/ui/button";`, `import RefundDialog from "./RefundDialog";` y `import type { RefundablePayment } from "./refund-math";`.
- **Tipo:** `type Payment = PaymentRow & { id: string; userName?: string; userId?: string };` pasa a:

```tsx
type Payment = PaymentRow & RefundablePayment & {
  id: string; userId?: string; source?: "order" | "membership" | "refund"; refundStatus?: string | null;
};

// Se puede reembolsar una orden cobrada a la que le queda algo por devolver
// (auditoría 2026-09-27, P1-12). Las membresías viejas sin orden y los
// reembolsos no.
const puedeReembolsar = (p: Payment) =>
  p.source === "order" && p.refundStatus !== "refunded" && Number(p.total_amount ?? 0) > 0 && p.method !== "wellhub";

const estadoDePago = (p: Payment): string => {
  if (p.source === "refund") return "Reembolso";
  if (p.refundStatus === "refunded") return "Reembolsado";
  if (p.refundStatus === "partially_refunded") return `Reembolso parcial · ${formatMXN(Number(p.refundedAmount ?? 0))}`;
  return "Cobrado";
};
```

- **En `PaymentsHistoryContent`:** `const [reembolso, setReembolso] = useState<Payment | null>(null);`.
- **`KpiStrip`:** tras el item "Por método · mes" agrega

```tsx
              ...(s.refunds.count > 0
                ? [{ label: `Reembolsos · ${MONTHS[now.getMonth()]}`, value: formatMXN(s.refunds.amount), hint: `${s.refunds.count} ${s.refunds.count === 1 ? "reembolso" : "reembolsos"}` }]
                : []),
```

- **Tabla:**
  - Encabezados: tras `<TableHead>Método</TableHead>` agrega `<TableHead>Estado</TableHead>`, y tras `Monto` agrega `<TableHead><span className="sr-only">Acciones</span></TableHead>`.
  - En cada fila, tras la celda del método:

```tsx
                      <TableCell>
                        <span className={p.source === "refund" || p.refundStatus ? "rounded-full bg-danger/10 px-2.5 py-1 text-[0.75rem] font-extrabold text-danger" : "text-[13px] text-ink-muted"}>
                          {estadoDePago(p)}
                        </span>
                      </TableCell>
```

  - La celda del monto pasa a `<TableCell className={cn("nums text-right text-[15px] font-extrabold", Number(p.total_amount ?? 0) < 0 && "text-danger")}>…</TableCell>`, con el mismo contenido (importa `cn` de `@/lib/utils` si no está).
  - Nueva celda al final:

```tsx
                      <TableCell className="text-right">
                        {puedeReembolsar(p) && (
                          <Button size="sm" variant="outline" aria-label={`Reembolsar el pago de ${p.userName ?? "la clienta"}`} onClick={() => setReembolso(p)}>
                            Reembolsar
                          </Button>
                        )}
                      </TableCell>
```

- **Antes de cerrar `</AdminPage>`:** `<RefundDialog payment={reembolso} onClose={() => setReembolso(null)} />`.
- **El `subtitle` del encabezado** pasa a `"Órdenes aprobadas, membresías asignadas en mostrador y reembolsos."`.

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/pages/admin/payments` → PASS.
  - En tu base (5596/8196): `reembolsos.test.mjs` más `reportes.test.mjs`, `vencidas-pagos.test.mjs`, `ventas-ajustes.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/refunds.js server/lib/refunds.test.js server/index.js server/tests/reembolsos.test.mjs src/pages/admin/payments/PaymentsHistory.tsx src/pages/admin/payments/PaymentsHistory.test.tsx src/pages/admin/payments/RefundDialog.tsx src/pages/admin/payments/refund-math.ts src/pages/admin/payments/refund-math.test.ts src/pages/admin/payments/payments-summary.ts src/pages/admin/payments/payments-summary.test.ts
git commit -m "fix(hive): la dueña registra reembolsos total o parcial con motivo; ajusta clases, marca el pago y los reportes lo restan"
```

---


### Task 8: Aviso de privacidad integral y consentimiento expreso para datos de salud (P1-10)

**Files:**
- Create: `server/lib/privacy.js`, `server/lib/privacy.test.js`, `server/tests/privacidad-consentimiento.test.mjs`.
- Modify: `server/index.js`:
  - Import tras `import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";`.
  - `mapUser`, `POST /api/auth/register` y `POST /api/auth/onboarding`.
  - `PUT /api/users/:id` y ruta nueva justo después.
- Create: `src/lib/legal/privacy-notice.ts`, `src/lib/legal/privacy-notice.test.ts`, `src/pages/legal/Privacidad.test.tsx`, `src/pages/auth/Register.consentimiento.test.tsx`, `src/pages/client/ProfileEdit.consentimiento.test.tsx`.
- Modify: `src/pages/legal/Privacidad.tsx`, `src/pages/auth/Register.tsx`, `src/pages/auth/Onboarding.tsx`, `src/pages/client/ProfileEdit.tsx`, `src/types/auth.ts`.

**Interfaces:**
- Consumes:
  - **Task 1:** columnas `users.privacy_notice_version/privacy_accepted_at/health_consent_version/health_consent_at`.
  - **Task 2:** `STUDIO.privacyEmail` y `LegalContact` sin el correo de Alma.
- Produces:

```js
// server/lib/privacy.js
export const PRIVACY_NOTICE_VERSION;              // "2026-09-28"
export const HEALTH_CONSENT_REQUIRED_MESSAGE;
export function healthDataChanges(current, input) // boolean: escribe datos de salud nuevos
export function hasCurrentHealthConsent(user)      // boolean
export function healthConsentProblem({ changes, consentGiven, hasConsent }) // null | { code: "HEALTH_CONSENT_REQUIRED", message }
```

```ts
// src/lib/legal/privacy-notice.ts
export const PRIVACY_NOTICE_VERSION: string, PRIVACY_NOTICE_UPDATED: string, HEALTH_CONSENT_TEXT: string;
export const hasCurrentHealthConsent: (u?: { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null) => boolean;
```

- **API:**
  - `POST /api/auth/register` acepta `healthConsent`.
  - `PUT /api/users/:id` acepta `healthConsent`: sin él, una clienta que escribe salud nueva sin consentimiento vigente recibe 400 `HEALTH_CONSENT_REQUIRED`. Una usuaria inexistente → 404.
  - `POST /api/auth/onboarding` acepta `healthConsent`.
  - `DELETE /api/me/health-consent` → `{ user, message }`.
  - `mapUser` agrega `privacyNoticeVersion`, `healthConsentVersion` y `healthConsentAt`.

- [ ] **Step 1: Pruebas en rojo.**

`server/lib/privacy.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_NOTICE_VERSION, healthDataChanges, hasCurrentHealthConsent, healthConsentProblem, HEALTH_CONSENT_REQUIRED_MESSAGE } from "./privacy.js";

test("sólo cuenta escribir un dato de salud nuevo", () => {
  assert.equal(healthDataChanges({ health_notes: null }, { healthNotes: "Asma" }), true);
  assert.equal(healthDataChanges({ health_notes: "Asma" }, { healthNotes: " Asma " }), false, "el mismo texto no es cambio");
  assert.equal(healthDataChanges({ health_notes: "Asma" }, { healthNotes: "" }), false, "vaciar no pide consentimiento");
  assert.equal(healthDataChanges({ health_notes: null }, { displayName: "Ana" }), false);
  assert.equal(healthDataChanges({ has_injury: false }, { hasInjury: true, injuryDetails: "Tobillo" }), true);
  assert.equal(healthDataChanges({ has_injury: true, injury_details: "Tobillo" }, { hasInjury: true, injuryDetails: "Tobillo" }), false);
});

test("consentimiento vigente = con fecha y de la versión actual del aviso", () => {
  assert.equal(PRIVACY_NOTICE_VERSION, "2026-09-28");
  assert.equal(hasCurrentHealthConsent({ health_consent_at: new Date(), health_consent_version: PRIVACY_NOTICE_VERSION }), true);
  assert.equal(hasCurrentHealthConsent({ health_consent_at: new Date(), health_consent_version: "2025-01-01" }), false);
  assert.equal(hasCurrentHealthConsent({ health_consent_at: null, health_consent_version: PRIVACY_NOTICE_VERSION }), false);
  assert.equal(hasCurrentHealthConsent(null), false);
});

test("se exige sólo si escribe salud sin consentimiento vigente ni casilla", () => {
  assert.deepEqual(healthConsentProblem({ changes: true, consentGiven: false, hasConsent: false }),
    { code: "HEALTH_CONSENT_REQUIRED", message: HEALTH_CONSENT_REQUIRED_MESSAGE });
  assert.equal(healthConsentProblem({ changes: true, consentGiven: true, hasConsent: false }), null);
  assert.equal(healthConsentProblem({ changes: true, consentGiven: false, hasConsent: true }), null);
  assert.equal(healthConsentProblem({ changes: false, consentGiven: false, hasConsent: false }), null);
  assert.equal(HEALTH_CONSENT_REQUIRED_MESSAGE, "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.");
});
```

`server/tests/privacidad-consentimiento.test.mjs`:

```js
// Tarea 8 · auditoría 2026-09-27, bloque 3 (P1-10 · L2 · L3). Consentimiento
// expreso para datos de salud: se registra versión y fecha; una clienta que
// escribe salud sin él no guarda nada; editar otros datos nunca lo pide; el
// personal no queda bloqueado; retirarlo borra los datos de salud.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, cleanup, closeDb, ADMIN } from "./helpers.mjs";

const PFX = "rgpriv";
const VERSION = "2026-09-28";
let A;

const registrar = (key, extra = {}) => api("POST", "/api/auth/register", { body: {
  email: `${PFX}_${key}@qa.local`, password: "QaPass!2026", displayName: `QA ${key}`,
  phone: "+525500000000", acceptsTerms: true, acceptsCommunications: false, ...extra,
} });
const editar = (c, body) => api("PUT", `/api/users/${c.id}`, { token: c.token, body });
const salud = async (id) => (await sql(
  `SELECT health_notes, has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1`, [id]))[0];

before(async () => { A = (await login(ADMIN.email, ADMIN.password)).token; });
after(async () => { await cleanup(PFX); await closeDb(); });

test("registrarse deja la versión y la fecha del aviso; la casilla de salud es opcional y se registra si se marca", async () => {
  const a = await registrar("sinsalud");
  assert.equal(a.status, 201, JSON.stringify(a.body).slice(0, 200));
  assert.equal(a.body.user.privacyNoticeVersion, VERSION);
  assert.equal(a.body.user.healthConsentVersion, null);
  const [ua] = await sql(`SELECT privacy_notice_version, privacy_accepted_at, health_consent_at FROM users WHERE email = $1`, [`${PFX}_sinsalud@qa.local`]);
  assert.equal(ua.privacy_notice_version, VERSION);
  assert.ok(ua.privacy_accepted_at);
  assert.equal(ua.health_consent_at, null);
  const b = await registrar("consalud", { healthConsent: true });
  assert.equal(b.status, 201);
  assert.equal(b.body.user.healthConsentVersion, VERSION);
  assert.ok(b.body.user.healthConsentAt);
});

test("una clienta existente que escribe notas de salud sin la casilla → 400 y no cambia nada; con la casilla se guarda", async () => {
  const c = await makeClient(PFX, "existente");
  const sin = await editar(c, { healthNotes: "Lesión en rodilla derecha" });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "HEALTH_CONSENT_REQUIRED");
  assert.equal(sin.body.message, "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.");
  assert.equal((await salud(c.id)).health_notes, null);
  const con = await editar(c, { healthNotes: "Lesión en rodilla derecha", healthConsent: true });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal(con.body.user.healthNotes, "Lesión en rodilla derecha");
  assert.equal(con.body.user.healthConsentVersion, VERSION);
  const s = await salud(c.id);
  assert.equal(s.health_consent_version, VERSION);
  assert.ok(s.health_consent_at);
  const despues = await editar(c, { healthNotes: "Rodilla y hombro" });
  assert.equal(despues.status, 200, "con el consentimiento vigente ya no se pide la casilla");
});

test("editar otros datos no pide la casilla, aunque ya tenga notas de salud guardadas", async () => {
  const c = await makeClient(PFX, "otros");
  await sql(`UPDATE users SET health_notes = 'Asma' WHERE id = $1`, [c.id]);
  const r = await editar(c, { displayName: "QA otros nuevo", phone: "+525512345678", healthNotes: "Asma" });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.user.displayName, "QA otros nuevo");
});

test("el personal no queda bloqueado al capturar salud", async () => {
  const c = await makeClient(PFX, "staff");
  const r = await api("PUT", `/api/users/${c.id}`, { token: A, body: { healthNotes: "Embarazo de 12 semanas" } });
  assert.equal(r.status, 200);
  assert.equal((await salud(c.id)).health_notes, "Embarazo de 12 semanas");
  assert.equal((await api("PUT", `/api/users/${crypto.randomUUID()}`, { token: A, body: { displayName: "Nadie" } })).status, 404);
});

test("retirar el consentimiento borra los datos de salud y la casilla se vuelve a pedir", async () => {
  const c = await makeClient(PFX, "retira");
  assert.equal((await editar(c, { healthNotes: "Hernia", healthConsent: true })).status, 200);
  await sql(`UPDATE users SET has_injury = true, injury_details = 'Hernia lumbar' WHERE id = $1`, [c.id]);
  const r = await api("DELETE", "/api/me/health-consent", { token: c.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.healthConsentVersion, null);
  const s = await salud(c.id);
  for (const k of ["health_notes", "has_injury", "injury_details", "health_consent_version", "health_consent_at"]) assert.equal(s[k], null, k);
  assert.equal((await editar(c, { healthNotes: "Hernia" })).status, 400);
});

test("el cuestionario también pide la casilla cuando reporta una lesión", async () => {
  const c = await makeClient(PFX, "cuestionario");
  const sin = await api("POST", "/api/auth/onboarding", { token: c.token, body: { hasInjury: true, practicedBarreBefore: false, injuryDetails: "Tobillo" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "HEALTH_CONSENT_REQUIRED");
  const con = await api("POST", "/api/auth/onboarding", { token: c.token, body: { hasInjury: true, practicedBarreBefore: false, injuryDetails: "Tobillo", healthConsent: true } });
  assert.equal(con.status, 200);
  assert.equal(con.body.user.injuryDetails, "Tobillo");
  assert.equal(con.body.user.healthConsentVersion, VERSION);
  const otra = await makeClient(PFX, "sinlesion");
  const r = await api("POST", "/api/auth/onboarding", { token: otra.token, body: { hasInjury: false, practicedBarreBefore: true } });
  assert.equal(r.status, 200, "sin lesión no se pide la casilla");
});
```

`src/lib/legal/privacy-notice.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PRIVACY_NOTICE_VERSION, HEALTH_CONSENT_TEXT, hasCurrentHealthConsent } from "./privacy-notice";
import * as servidor from "../../../server/lib/privacy.js";

describe("aviso de privacidad · versión y consentimiento", () => {
  it("la app y el servidor usan la misma versión del aviso", () => {
    expect(PRIVACY_NOTICE_VERSION).toBe(servidor.PRIVACY_NOTICE_VERSION);
  });
  it("el texto de la casilla es consentimiento expreso para datos de salud", () => {
    expect(HEALTH_CONSENT_TEXT).toBe("Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud (lesiones, condiciones o embarazo) para cuidarme en clase, como explica el aviso de privacidad.");
  });
  it("consentimiento vigente", () => {
    expect(hasCurrentHealthConsent({ healthConsentVersion: PRIVACY_NOTICE_VERSION, healthConsentAt: "2026-09-28T10:00:00Z" })).toBe(true);
    expect(hasCurrentHealthConsent({ healthConsentVersion: "2025-01-01", healthConsentAt: "2025-01-01T10:00:00Z" })).toBe(false);
    expect(hasCurrentHealthConsent(null)).toBe(false);
  });
});
```

`src/pages/legal/Privacidad.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(() => new Promise(() => {})) } }));
import Privacidad from "./Privacidad";

describe("Aviso de privacidad integral (P1-10, LFPDPPP)", () => {
  it("trae responsable, datos, finalidades, salud, transferencias, ARCO, almacenamiento local, cambios y versión", () => {
    render(<MemoryRouter><Privacidad /></MemoryRouter>);
    for (const h of [
      "1. Responsable", "2. Datos que recabamos", "3. Para qué los usamos (finalidades primarias)", "4. Finalidades secundarias",
      "5. Datos de salud y consentimiento expreso", "6. Con quién compartimos tus datos",
      "7. Tus derechos ARCO, revocación y limitación", "8. Almacenamiento local y cookies",
      "9. Seguridad y conservación", "10. Cambios a este aviso", "11. Contacto",
    ]) expect(screen.getByRole("heading", { name: h })).toBeInTheDocument();
    expect(screen.getByText("Versión 2026-09-28")).toBeInTheDocument();
    expect(screen.getByText(/Última actualización: 28 de septiembre de 2026/)).toBeInTheDocument();
    expect(screen.getByText(/es responsable del tratamiento de tus datos personales/)).toHaveTextContent("HIVE Pilates Studio, con domicilio en Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX");
    expect(screen.getByText(/Sólo los guardamos si nos das tu consentimiento expreso/)).toBeInTheDocument();
    expect(screen.getByText(/A Wellhub, si reservas a través de Wellhub/)).toBeInTheDocument();
    expect(screen.getByText(/presenta tu solicitud en recepción, en Cuauhtémoc #68/)).toBeInTheDocument();
    expect(screen.getByText(/20 días hábiles/)).toBeInTheDocument();
    expect(screen.getByText(/no usa cookies de publicidad ni herramientas de rastreo de terceros/)).toBeInTheDocument();
  });

  it("sin nada de Alma, sin un correo inventado y sin nombrar al proveedor de archivos", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "Privacidad.tsx"), "utf8");
    expect(src).not.toMatch(/\bAlma\b|almamovement|Estefanía|info@|Drive/); // \b: "Almacenamiento" sí va
    expect(src).not.toMatch(/usePolicyText|LegalDynamicBody/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
});
```

`src/pages/auth/Register.consentimiento.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from "@/lib/api";
import Register from "./Register";
import { renderPage } from "@/test/renderPage";

beforeEach(() => {
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { user: { id: "u1" }, token: "t" } } as never);
});

function llenar() {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Ana Pérez" } });
  fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "5512345678" } });
  fireEvent.change(screen.getByLabelText("Sexo"), { target: { value: "female" } });
  fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "1990-05-05" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "ana@correo.com" } });
  fireEvent.change(screen.getByLabelText("Contraseña", { selector: "input" }), { target: { value: "Clave1234" } });
  fireEvent.change(screen.getByLabelText("Confirmar", { selector: "input" }), { target: { value: "Clave1234" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Acepto los términos y condiciones/ }));
}

describe("Registro · consentimiento de datos de salud (P1-10)", () => {
  it("la casilla es opcional, dice que es consentimiento expreso y viaja si se marca", async () => {
    renderPage(<Register />, "/auth/register");
    const casilla = screen.getByRole("checkbox", { name: /Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud/ });
    expect(casilla).toHaveAttribute("aria-checked", "false");
    llenar();
    fireEvent.click(casilla);
    fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/register", expect.objectContaining({ acceptsTerms: true, healthConsent: true })));
  });

  it("sin marcarla también se registra", async () => {
    renderPage(<Register />, "/auth/register");
    llenar();
    fireEvent.click(screen.getByRole("button", { name: "Crear mi cuenta" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/register", expect.objectContaining({ healthConsent: false })));
  });
});
```

`src/pages/client/ProfileEdit.consentimiento.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import ProfileEdit from "./ProfileEdit";
import { renderPage, respuestas } from "@/test/renderPage";
import { useAuthStore } from "@/stores/authStore";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/layout/ClientAuthGuard", () => ({
  ClientAuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const U = {
  id: "u1", role: "client", displayName: "Ana Pérez", email: "ana@correo.com", phone: "+525512345678",
  healthNotes: null, healthConsentVersion: null, healthConsentAt: null,
};

function montar(user: Record<string, unknown>) {
  useAuthStore.setState({ user, token: "t", isAuthenticated: true } as never);
  vi.mocked(api.get).mockImplementation(respuestas({ "/me/notifications/unread-count": { data: { unread_count: 0 } } }) as never);
  renderPage(<ProfileEdit />, "/app/profile/edit");
}

beforeEach(() => {
  vi.mocked(api.put).mockReset();
  vi.mocked(api.delete).mockReset();
});

describe("Perfil · consentimiento para datos de salud (P1-10)", () => {
  it("sin consentimiento, escribir notas de salud no guarda nada hasta marcar la casilla", async () => {
    montar(U);
    fireEvent.change(await screen.findByLabelText("Notas (opcional)"), { target: { value: "Lesión en rodilla" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByText("Marca la casilla para guardar tus datos de salud.")).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Autorizo expresamente/ }));
    vi.mocked(api.put).mockResolvedValue({ data: { user: { ...U, healthNotes: "Lesión en rodilla" } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/users/u1", expect.objectContaining({ healthNotes: "Lesión en rodilla", healthConsent: true })));
  });

  it("editar otros datos no pide la casilla", async () => {
    montar({ ...U, healthNotes: "Asma" });
    fireEvent.change(await screen.findByLabelText("Nombre completo"), { target: { value: "Ana P." } });
    vi.mocked(api.put).mockResolvedValue({ data: { user: { ...U, displayName: "Ana P." } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(vi.mocked(api.put).mock.calls[0][1]).not.toHaveProperty("healthConsent");
  });

  it("con consentimiento vigente lo dice y permite retirarlo, que borra sus datos de salud", async () => {
    montar({ ...U, healthNotes: "Asma", healthConsentVersion: "2026-09-28", healthConsentAt: "2026-09-20T16:00:00Z" });
    expect(await screen.findByText("Autorizaste el tratamiento de tus datos de salud el 20 de septiembre, 2026.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Autorizo expresamente/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retirar mi consentimiento" }));
    expect(screen.getByText("Se borran tus notas de salud y tus lesiones registradas. El equipo ya no las verá.")).toBeInTheDocument();
    vi.mocked(api.delete).mockResolvedValue({ data: { user: { ...U, healthNotes: null } } } as never);
    fireEvent.click(screen.getByRole("button", { name: "Sí, retirar y borrar" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/me/health-consent"));
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `node --test server/lib/privacy.test.js` → FAIL.
  - `npx vitest run src/lib/legal src/pages/legal src/pages/auth src/pages/client/ProfileEdit.consentimiento.test.tsx` → FAIL.
  - En tu base (5597/8197), `privacidad-consentimiento.test.mjs` → FAIL.

- [ ] **Step 3: Implementar.**

`server/lib/privacy.js`:

```js
// Aviso de privacidad y consentimiento expreso para datos de salud (auditoría
// 2026-09-27, P1-10; LFPDPPP). La versión debe coincidir con
// src/lib/legal/privacy-notice.ts (privacy-notice.test.ts lo exige). Cambiar el
// aviso = versión nueva: el consentimiento de la versión anterior deja de valer
// y se vuelve a pedir la próxima vez que la clienta escriba datos de salud.
export const PRIVACY_NOTICE_VERSION = "2026-09-28";

export const HEALTH_CONSENT_REQUIRED_MESSAGE =
  "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.";

const texto = (v) => (typeof v === "string" ? v.trim() : "");

/** ¿Escribe datos de salud nuevos? Sólo cuenta un valor no vacío distinto al
 *  guardado (repetir el mismo texto o vaciarlo no pide consentimiento). */
export function healthDataChanges(current = {}, input = {}) {
  const notas = texto(input.healthNotes);
  const detalles = texto(input.injuryDetails);
  return (
    (notas !== "" && notas !== texto(current?.health_notes)) ||
    (input.hasInjury === true && current?.has_injury !== true) ||
    (detalles !== "" && detalles !== texto(current?.injury_details))
  );
}

export function hasCurrentHealthConsent(user) {
  return Boolean(user?.health_consent_at) && user?.health_consent_version === PRIVACY_NOTICE_VERSION;
}

/** null si se puede guardar; si no, el cuerpo del 400. */
export function healthConsentProblem({ changes, consentGiven, hasConsent }) {
  if (!changes || hasConsent || consentGiven === true) return null;
  return { code: "HEALTH_CONSENT_REQUIRED", message: HEALTH_CONSENT_REQUIRED_MESSAGE };
}
```

En `server/index.js`:

**Import**, tras `import { recordAudit, recordAuditBestEffort, reasonProblem, cleanReason, buildAuditQuery, auditRowOut } from "./lib/audit.js";`:

```js
import { PRIVACY_NOTICE_VERSION, healthDataChanges, hasCurrentHealthConsent, healthConsentProblem } from "./lib/privacy.js";
```

**`mapUser`:** tras `onboardingCompleted: u.onboarding_completed ?? false,`:

```js
    // Aviso de privacidad y consentimiento de salud (auditoría 2026-09-27, P1-10).
    privacyNoticeVersion: u.privacy_notice_version ?? null,
    healthConsentVersion: u.health_consent_version ?? null,
    healthConsentAt: u.health_consent_at ?? null,
```

**`POST /api/auth/register`:**
- La primera línea pasa a `const { email, password, displayName, phone, gender, dateOfBirth, acceptsTerms, acceptsCommunications, healthConsent } = req.body;`.
- El `INSERT INTO users …` pasa a:

```js
    // Aceptar términos deja la versión y la fecha del aviso de privacidad; la
    // casilla de salud (opcional al registrarse) deja su consentimiento expreso
    // (auditoría 2026-09-27, P1-10).
    const versionAviso = acceptsTerms === true ? PRIVACY_NOTICE_VERSION : null;
    const versionSalud = healthConsent === true ? PRIVACY_NOTICE_VERSION : null;
    const result = await pool.query(
      `INSERT INTO users (display_name, email, phone, gender, date_of_birth, password_hash, accepts_terms, accepts_communications, role,
                          privacy_notice_version, privacy_accepted_at, health_consent_version, health_consent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'client',
               $9::varchar, CASE WHEN $9::varchar IS NULL THEN NULL ELSE NOW() END,
               $10::varchar, CASE WHEN $10::varchar IS NULL THEN NULL ELSE NOW() END)
       RETURNING *`,
      [displayName.trim(), email.toLowerCase().trim(), phone || null, gender || null, normalizedDob, passwordHash,
       acceptsTerms ?? false, acceptsCommunications ?? false, versionAviso, versionSalud]
    );
```

**`POST /api/auth/onboarding`:** entre la validación de `details` y el `try {`… reemplaza el `try` completo por:

```js
  try {
    // Reportar una lesión es dato de salud: exige consentimiento expreso
    // vigente o la casilla (auditoría 2026-09-27, P1-10).
    const cur = await pool.query(
      "SELECT has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1",
      [req.userId],
    );
    if (!cur.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const hasConsent = hasCurrentHealthConsent(cur.rows[0]);
    const consentGiven = req.body?.healthConsent === true;
    const problem = healthConsentProblem({
      changes: healthDataChanges(cur.rows[0], { hasInjury, injuryDetails: details }), consentGiven, hasConsent,
    });
    if (problem) return res.status(400).json(problem);
    const recordConsent = consentGiven && !hasConsent;
    const r = await pool.query(
      `UPDATE users SET
         has_injury             = $1,
         practiced_barre_before = $2,
         injury_details         = $3,
         onboarding_completed   = true,
         health_consent_version = CASE WHEN $5 THEN $6 ELSE health_consent_version END,
         health_consent_at      = CASE WHEN $5 THEN NOW() ELSE health_consent_at END,
         updated_at             = NOW()
       WHERE id = $4
       RETURNING *`,
      [hasInjury, practicedBarreBefore, hasInjury ? details : null, req.userId, recordConsent, PRIVACY_NOTICE_VERSION]
    );
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("[onboarding] FAILED:", err?.message);
    return res.status(500).json({ message: "No pudimos guardar tus respuestas" });
  }
```

**`PUT /api/users/:id`:** reemplaza la ruta completa por:

```js
// PUT /api/users/:id — la clienta edita su perfil o la dueña edita a cualquiera.
// Si la clienta escribe datos de salud nuevos sin consentimiento expreso
// vigente, pide la casilla (400 HEALTH_CONSENT_REQUIRED) y no guarda nada. Editar
// otros datos nunca lo pide, y el personal no queda bloqueado (auditoría
// 2026-09-27, P1-10).
app.put("/api/users/:id", authMiddleware, async (req, res) => {
  try {
    const selfRes = await pool.query("SELECT role FROM users WHERE id = $1", [req.userId]);
    const callerRole = selfRes.rows[0]?.role || "client";
    const isAdminCaller = ["admin", "super_admin"].includes(callerRole);
    if (req.params.id !== req.userId && !isAdminCaller) {
      return res.status(403).json({ message: "Acceso denegado" });
    }
    const {
      displayName, phone, dateOfBirth, gender,
      emergencyContactName, emergencyContactPhone, healthNotes,
      receiveReminders, receivePromotions, receiveWeeklySummary,
      acceptsCommunications,
      role, healthConsent,
    } = req.body;
    // Non-admins cannot change role
    const newRole = isAdminCaller && role ? role : null;
    const targetId = req.params.id;
    const cur = await pool.query(
      "SELECT health_notes, has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1",
      [targetId],
    );
    if (!cur.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    const selfEdit = targetId === req.userId;
    const hasConsent = hasCurrentHealthConsent(cur.rows[0]);
    const consentGiven = healthConsent === true;
    if (selfEdit) {
      const problem = healthConsentProblem({ changes: healthDataChanges(cur.rows[0], { healthNotes }), consentGiven, hasConsent });
      if (problem) return res.status(400).json(problem);
    }
    const recordConsent = selfEdit && consentGiven && !hasConsent;
    const r = await pool.query(
      `UPDATE users SET
         display_name              = COALESCE($1, display_name),
         phone                     = COALESCE($2, phone),
         date_of_birth             = COALESCE($3, date_of_birth),
         emergency_contact_name    = COALESCE($4, emergency_contact_name),
         emergency_contact_phone   = COALESCE($5, emergency_contact_phone),
         health_notes              = COALESCE($6, health_notes),
         receive_reminders         = COALESCE($7, receive_reminders),
         receive_promotions        = COALESCE($8, receive_promotions),
         receive_weekly_summary    = COALESCE($9, receive_weekly_summary),
         accepts_communications    = COALESCE($10, accepts_communications),
         role                      = COALESCE($11, role),
         gender                    = COALESCE($12, gender),
         health_consent_version    = CASE WHEN $14 THEN $15 ELSE health_consent_version END,
         health_consent_at         = CASE WHEN $14 THEN NOW() ELSE health_consent_at END,
         updated_at                = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        displayName || null, phone || null, dateOfBirth || null,
        emergencyContactName || null, emergencyContactPhone || null, healthNotes || null,
        receiveReminders ?? null, receivePromotions ?? null, receiveWeeklySummary ?? null,
        acceptsCommunications ?? null,
        newRole,
        gender || null,
        targetId,
        recordConsent, PRIVACY_NOTICE_VERSION,
      ]
    );
    return res.json({ user: mapUser(r.rows[0]) });
  } catch (err) {
    console.error("PUT users/:id error:", err);
    return res.status(500).json({ message: "Error interno" });
  }
});

// DELETE /api/me/health-consent — la clienta retira su consentimiento para datos
// de salud: se borran sus notas de salud y sus lesiones registradas
// (auditoría 2026-09-27, P1-10).
app.delete("/api/me/health-consent", authMiddleware, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE users SET health_notes = NULL, has_injury = NULL, injury_details = NULL,
              health_consent_version = NULL, health_consent_at = NULL, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [req.userId],
    );
    if (!r.rows.length) return res.status(404).json({ message: "Usuario no encontrado" });
    return res.json({ user: mapUser(r.rows[0]), message: "Retiraste tu consentimiento: borramos tus datos de salud de tu perfil." });
  } catch (err) {
    console.error("[DELETE /me/health-consent]", err.message);
    return res.status(500).json({ message: "Error interno" });
  }
});
```

`src/lib/legal/privacy-notice.ts`:

```ts
// Aviso de privacidad integral de HIVE Pilates Studio (auditoría 2026-09-27,
// P1-10; LFPDPPP). La versión debe coincidir con server/lib/privacy.js
// (privacy-notice.test.ts lo exige): cambiar el aviso = versión nueva.
// PENDIENTE (dueño y abogado): revisión legal del texto, nombre o razón social del
// responsable y correo para solicitudes ARCO (STUDIO.privacyEmail).
export const PRIVACY_NOTICE_VERSION = "2026-09-28";
export const PRIVACY_NOTICE_UPDATED = "28 de septiembre de 2026";

/** Texto de la casilla de consentimiento expreso (registro, perfil y cuestionario). */
export const HEALTH_CONSENT_TEXT =
  "Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud (lesiones, condiciones o embarazo) para cuidarme en clase, como explica el aviso de privacidad.";

export const hasCurrentHealthConsent = (
  u?: { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null,
): boolean => Boolean(u?.healthConsentAt) && u?.healthConsentVersion === PRIVACY_NOTICE_VERSION;
```

**`src/types/auth.ts`:**
- En `User`, tras `onboardingCompleted?: boolean;`:

```ts
  privacyNoticeVersion?: string | null;
  healthConsentVersion?: string | null;
  healthConsentAt?: string | null;
```

- En `RegisterData` y en `UpdateProfileData` agrega `healthConsent?: boolean;`.

**`src/pages/legal/Privacidad.tsx`:** reemplaza el archivo completo por:

```tsx
import { STUDIO } from "@/lib/studio";
import { COLOR } from "@/design/tokens";
import { PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION } from "@/lib/legal/privacy-notice";
import LegalLayout, { LegalContact, LegalH2, LegalUpdated } from "./LegalLayout";

// Aviso de privacidad integral (auditoría 2026-09-27, P1-10; LFPDPPP). Texto
// versionado en el código: el de policies_settings ya no se muestra.
// PENDIENTE (dueño y abogado): revisión legal; nombre o razón social del
// responsable; correo para solicitudes ARCO (STUDIO.privacyEmail); autoridad y
// plazos tras la reforma de 2025 a la LFPDPPP.
const fuerte = "font-semibold";

const Privacidad = () => (
  <LegalLayout
    current="/legal/privacidad"
    title={
      <>
        Aviso de <span className="font-display">privacidad</span>
      </>
    }
  >
    <div className="space-y-6">
      <LegalUpdated>{PRIVACY_NOTICE_UPDATED}</LegalUpdated>
      <p className="text-[0.82rem]">Versión {PRIVACY_NOTICE_VERSION}</p>
      <p>
        Este aviso explica qué datos personales tratamos, para qué, con quién los compartimos y cómo puedes ejercer tus derechos, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
      </p>

      <LegalH2>1. Responsable</LegalH2>
      <p>
        <strong className={fuerte} style={{ color: COLOR.ink }}>{STUDIO.name}</strong>, con domicilio en {STUDIO.address}, es responsable del tratamiento de tus datos personales.
      </p>

      <LegalH2>2. Datos que recabamos</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Identificación y contacto:</strong> nombre, correo electrónico, teléfono o WhatsApp, fecha de nacimiento, sexo y, si la subes, tu foto de perfil.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Contacto de emergencia:</strong> nombre y teléfono de la persona que nos indiques. Al dárnoslos, confirmas que esa persona está de acuerdo.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Datos de salud (sensibles):</strong> lesiones, condiciones físicas o médicas, embarazo y las notas de salud que nos compartas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Responsiva:</strong> tu nombre, tu firma, la fecha y la versión del documento que firmaste, y si autorizas el uso de tu imagen.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Reservas y asistencia:</strong> clases que reservas, lista de espera, asistencias, faltas, cancelaciones, puntos y reseñas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Pagos:</strong> paquete, monto, método, referencia o comprobante de transferencia y reembolsos. Los pagos en línea con tarjeta los procesa un proveedor de pagos: no guardamos el número completo de tu tarjeta.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Wellhub:</strong> si reservas por Wellhub, tu identificador y tu plan de Wellhub y la confirmación de tus visitas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Datos técnicos:</strong> lo que tu navegador guarda para mantener tu sesión (sección 8).</li>
      </ul>

      <LegalH2>3. Para qué los usamos (finalidades primarias)</LegalH2>
      <p>Son necesarias para darte el servicio:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Crear y administrar tu cuenta.</li>
        <li>Gestionar tus reservas, la lista de espera (incluido inscribirte sola cuando se libera un lugar) y tu asistencia.</li>
        <li>Registrar cobros, pagos y reembolsos.</li>
        <li>Enviarte avisos del servicio por WhatsApp, correo o la app: confirmaciones, cambios, cancelaciones de clase y recordatorios.</li>
        <li>Cuidar tu seguridad en clase con tus datos de salud.</li>
        <li>Guardar tu responsiva y, si lo pides, generar tu pase digital para Apple Wallet o Google Wallet.</li>
        <li>Conciliar tus visitas con Wellhub, si reservas por Wellhub.</li>
        <li>Atender tus dudas, aclaraciones y quejas, y cumplir obligaciones legales.</li>
      </ul>

      <LegalH2>4. Finalidades secundarias</LegalH2>
      <p>No son necesarias para el servicio y puedes negarte:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Enviarte promociones y novedades del estudio.</li>
        <li>Invitarte a encuestas y reseñas.</li>
        <li>Publicar fotos o videos de clase en redes o en material promocional, sólo si lo autorizas en tu responsiva.</li>
      </ul>
      <p>
        Para negarte, desmarca "Quiero recibir recordatorios y novedades por WhatsApp" al registrarte o en las preferencias de tu perfil, no autorices el uso de imagen en tu responsiva, o pídelo en recepción. Negarte no afecta tus reservas ni tus clases.
      </p>

      <LegalH2>5. Datos de salud y consentimiento expreso</LegalH2>
      <p>
        Tus datos de salud son datos personales sensibles. Los pedimos sólo para cuidarte en clase y adaptar los ejercicios. Sólo los guardamos si nos das tu consentimiento expreso, marcando la casilla al registrarte o al escribirlos en tu perfil; guardamos la fecha y la versión de este aviso que aceptaste. Sólo el equipo del estudio (dueña, recepción y coaches) los ve.
      </p>
      <p>
        Puedes retirar tu consentimiento cuando quieras desde tu perfil ("Retirar mi consentimiento") o en recepción. Al hacerlo borramos tus datos de salud de tu perfil.
      </p>

      <LegalH2>6. Con quién compartimos tus datos</LegalH2>
      <p>
        Para prestarte el servicio, algunos proveedores tratan tus datos por cuenta nuestra y bajo confidencialidad: servidores y base de datos (hosting), envío de correos, envío de mensajes de WhatsApp, procesamiento de pagos con tarjeta, almacenamiento de archivos (fotos de perfil y comprobantes) y pases digitales de Apple y Google.
      </p>
      <p>Sólo transferimos tus datos a terceros en estos casos, necesarios para el servicio o exigidos por la ley:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>A Wellhub, si reservas a través de Wellhub: la confirmación de tus reservas y de tus visitas.</li>
        <li>A autoridades, cuando una ley o una orden lo exija.</li>
      </ul>
      <p>No vendemos tus datos personales.</p>

      <LegalH2>7. Tus derechos ARCO, revocación y limitación</LegalH2>
      <p>
        Tienes derecho a Acceder a tus datos, Rectificarlos, Cancelarlos u Oponerte a su uso (derechos ARCO), a revocar tu consentimiento y a limitar el uso de tus datos.
      </p>
      <p>
        Para ejercerlos, presenta tu solicitud {STUDIO.privacyEmail ? <>al correo {STUDIO.privacyEmail}, </> : null}en recepción, en {STUDIO.address}, o por el medio que el estudio publique en esta página. Tu solicitud debe incluir:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Tu nombre y un medio para responderte.</li>
        <li>Un documento que acredite tu identidad o, en su caso, la representación de quien presenta la solicitud.</li>
        <li>La descripción clara del derecho que quieres ejercer y de los datos de que se trata.</li>
        <li>Cualquier dato que ayude a localizar tus datos y, si pides una rectificación, el dato correcto.</li>
      </ul>
      <p>
        Te respondemos en un máximo de 20 días hábiles desde que recibimos tu solicitud y, si procede, la hacemos efectiva dentro de los 15 días hábiles siguientes. Algunos datos los puedes corregir tú misma en tu perfil de la app.
      </p>

      <LegalH2>8. Almacenamiento local y cookies</LegalH2>
      <p>
        La app no usa cookies de publicidad ni herramientas de rastreo de terceros. Guarda en tu navegador (almacenamiento local) tu sesión iniciada y algunas preferencias de pantalla, como si ya viste el aviso para instalar la app. Si borras los datos del navegador, se cierra tu sesión.
      </p>

      <LegalH2>9. Seguridad y conservación</LegalH2>
      <p>
        Protegemos tus datos con medidas administrativas, técnicas y físicas: conexión cifrada y acceso sólo para el personal que los necesita según su función.
      </p>
      <p>
        Conservamos tus datos mientras tengas cuenta. Si pides tu baja, borramos tus datos personales y de salud y cerramos tu acceso; tus reservas, órdenes y pagos se conservan sin tu nombre por obligaciones contables.
      </p>

      <LegalH2>10. Cambios a este aviso</LegalH2>
      <p>
        Si cambiamos este aviso, publicamos la versión nueva en esta página con su fecha. Si el cambio toca las finalidades o tus datos de salud, te pediremos de nuevo tu consentimiento en la app.
      </p>

      <LegalH2>11. Contacto</LegalH2>
      <p>Si tienes dudas sobre este aviso:</p>
      <LegalContact />
    </div>
  </LegalLayout>
);

export default Privacidad;
```

**`src/pages/auth/Register.tsx`:**
- **Import:** `import { HEALTH_CONSENT_TEXT } from "@/lib/legal/privacy-notice";`.
- **`schema`:** tras `acceptsCommunications: z.boolean().default(false),` agrega `healthConsent: z.boolean().default(false),`.
- **`FormValues`:** agrega `healthConsent: boolean;`.
- **`defaultValues`:** pasa a `{ acceptsTerms: false, acceptsCommunications: false, healthConsent: false }`.
- **Tras `const acceptsCommunications = watch("acceptsCommunications");`:** `const healthConsent = watch("healthConsent");`.
- **En `registerUser({…})`:** tras `acceptsCommunications: data.acceptsCommunications,` agrega `healthConsent: data.healthConsent,`.
- **Tras la casilla de WhatsApp:**

```tsx
          {/* Consentimiento expreso para datos de salud (LFPDPPP, auditoría
              2026-09-27, P1-10). Opcional aquí: el registro no guarda salud;
              se vuelve obligatoria al escribirlos en el perfil. */}
          <AuthCheckbox
            checked={healthConsent}
            onChange={(v) => setValue("healthConsent", v)}
          >
            {HEALTH_CONSENT_TEXT}{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium text-accent-strong"
            >
              Leer el aviso
            </a>
            . Opcional al registrarte.
          </AuthCheckbox>
```

**`src/pages/client/ProfileEdit.tsx`:**
- **Imports:**
  - `import { useEffect, useRef } from "react";` pasa a `import { useEffect, useRef, useState } from "react";`.
  - Agrega:

```tsx
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AuthCheckbox } from "@/components/auth/AuthShell";
import { HEALTH_CONSENT_TEXT, hasCurrentHealthConsent } from "@/lib/legal/privacy-notice";
```

- **Tras `const avatarInputRef = useRef<HTMLInputElement>(null);`:**

```tsx
  // Consentimiento expreso para datos de salud (auditoría 2026-09-27, P1-10):
  // a las clientas existentes se les pide la próxima vez que escriban salud, sin
  // bloquear lo demás.
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const yaConsintio = hasCurrentHealthConsent(user as { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null);
  const consentidoEl = user?.healthConsentAt ? format(parseISO(user.healthConsentAt), "d 'de' MMMM, yyyy", { locale: es }) : null;
```

- **`mutation.onError`** pasa a:

```tsx
    onError: (e: any) => {
      if (e?.response?.data?.code === "HEALTH_CONSENT_REQUIRED") setConsentError(e.response.data.message);
      toast({ title: "No se guardaron los cambios", description: e?.response?.data?.message, variant: "destructive" });
    },
```

- **Tras `avatarMutation`:**

```tsx
  const retirar = useMutation({
    mutationFn: () => api.delete("/me/health-consent"),
    onSuccess: (res) => {
      const updated = res.data?.user;
      if (updated) updateUser(updated);
      setConfirmarRetiro(false);
      setConsent(false);
      reset({ ...(user as never), healthNotes: "" } as never);
      toast({ title: "Retiraste tu consentimiento", description: "Borramos tus datos de salud de tu perfil." });
    },
    onError: () => toast({ title: "No pudimos retirarlo", description: "Inténtalo de nuevo o pídelo en recepción.", variant: "destructive" }),
  });
```

- **`onSubmit`** pasa a:

```tsx
  const onSubmit = (data: FormValues) => {
    const notasNuevas = (data.healthNotes ?? "").trim();
    const notasGuardadas = String(user?.healthNotes ?? user?.health_notes ?? "").trim();
    const escribeSalud = notasNuevas !== "" && notasNuevas !== notasGuardadas;
    if (escribeSalud && !yaConsintio && !consent) {
      setConsentError("Marca la casilla para guardar tus datos de salud.");
      return;
    }
    setConsentError(null);
    mutation.mutate({
      displayName: data.displayName,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      healthNotes: data.healthNotes || undefined,
      ...(escribeSalud && !yaConsintio ? { healthConsent: true } : {}),
    } as any);
  };
```

- **En `<Section title="Salud">`**, tras el `<TextAreaField … />`:

```tsx
            {yaConsintio ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="m-0 text-[0.8125rem] text-ink-muted">
                  Autorizaste el tratamiento de tus datos de salud{consentidoEl ? ` el ${consentidoEl}` : ""}.
                </p>
                {confirmarRetiro ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                    <p className="m-0 text-[0.8125rem] text-ink">Se borran tus notas de salud y tus lesiones registradas. El equipo ya no las verá.</p>
                    <div className="flex flex-wrap gap-2">
                      <GhostButton tone="danger" onClick={() => retirar.mutate()} disabled={retirar.isPending}>Sí, retirar y borrar</GhostButton>
                      <GhostButton onClick={() => setConfirmarRetiro(false)}>Volver</GhostButton>
                    </div>
                  </div>
                ) : (
                  <div>
                    <GhostButton onClick={() => setConfirmarRetiro(true)}>Retirar mi consentimiento</GhostButton>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3">
                <AuthCheckbox
                  checked={consent}
                  onChange={(v) => { setConsent(v); if (v) setConsentError(null); }}
                  error={consentError ?? undefined}
                >
                  {HEALTH_CONSENT_TEXT}{" "}
                  <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" className="no-underline font-medium text-accent-strong">
                    Leer el aviso
                  </a>
                </AuthCheckbox>
              </div>
            )}
```

**`src/pages/auth/Onboarding.tsx`:**
- **Imports:** agrega `AuthCheckbox` al import de `@/components/auth/AuthShell` y `import { HEALTH_CONSENT_TEXT, hasCurrentHealthConsent } from "@/lib/legal/privacy-notice";`.
- **Estado:** tras `const [touched, setTouched] = useState(false);`:

```tsx
  // Reportar una lesión es dato de salud: pide consentimiento expreso (P1-10).
  const [consent, setConsent] = useState(false);
  const yaConsintio = hasCurrentHealthConsent(user as { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null);
  const faltaConsentimiento = injuryReported && !yaConsintio && !consent;
```

- **En `onSubmit`**, tras el `if (detailsMissing) { … }`:

```tsx
    if (faltaConsentimiento) {
      setError("Marca la casilla para guardar tus datos de salud.");
      return;
    }
```

- **El cuerpo del `api.post`**, tras `injuryDetails: …,` agrega `...(injuryReported && !yaConsintio ? { healthConsent: true } : {}),`.
- **Tras el `<AuthTextarea id="injury-details" … />`** (dentro del mismo `<div className="pt-5">`):

```tsx
                {!yaConsintio && (
                  <div className="pt-4">
                    <AuthCheckbox
                      checked={consent}
                      onChange={setConsent}
                      error={touched && faltaConsentimiento ? "Marca la casilla para guardar tus datos de salud." : undefined}
                    >
                      {HEALTH_CONSENT_TEXT}
                    </AuthCheckbox>
                  </div>
                )}
```

- [ ] **Step 4: Verde**:
  - `npm run test:server` → PASS.
  - `npx vitest run src/lib src/pages/legal src/pages/auth src/pages/client src/design` → PASS, incluidos `Profile.dark.test.ts` y `app-zone.test.ts`.
  - En tu base (5597/8197): `privacidad-consentimiento.test.mjs` más `seguridad.test.mjs`, `baja-clienta.test.mjs`, `revision.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/lib/privacy.js server/lib/privacy.test.js server/index.js server/tests/privacidad-consentimiento.test.mjs src/lib/legal/privacy-notice.ts src/lib/legal/privacy-notice.test.ts src/pages/legal/Privacidad.tsx src/pages/legal/Privacidad.test.tsx src/pages/auth/Register.tsx src/pages/auth/Register.consentimiento.test.tsx src/pages/auth/Onboarding.tsx src/pages/client/ProfileEdit.tsx src/pages/client/ProfileEdit.consentimiento.test.tsx src/types/auth.ts
git commit -m "fix(hive): aviso de privacidad integral de HIVE y consentimiento expreso para datos de salud con versión y fecha; la clienta puede retirarlo"
```

---


### Task 9: Planes — archivar en vez de "Eliminar con todo" (familia de P1-5)

**Files:**
- Modify: `server/index.js` (`DELETE /api/plans/:id`), `src/pages/admin/plans/PlansList.tsx`, `src/pages/admin/plans/PlansList.test.tsx`.
- Create: `server/tests/planes-archivar.test.mjs`.

**Interfaces:**
- Consumes (Task 1):
  - `plans.archived_at/archived_by`.
  - `plan.archive` y `plan.delete` en `AUDIT_ACTIONS`.
  - La etiqueta "Plan archivado" y el `for_sale` de `audit-log.ts`.
- Produces: `DELETE /api/plans/:id`:
  - con membresías, órdenes o códigos de descuento → 200 `{ message: "Plan archivado: …", data: { id, archived: true, kept } }`;
  - sin nada ligado → 200 `{ message: "Plan eliminado", data: { id, deleted: true } }`;
  - no existe → 404. `?cascade=true` ya no borra nada.

- [ ] **Step 1: Pruebas en rojo.**

`server/tests/planes-archivar.test.mjs`:

```js
// Tarea 9 · auditoría 2026-09-27, bloque 3 (familia de P1-5). Un plan con
// membresías, órdenes o códigos de descuento se archiva en lugar de borrarse,
// aunque llegue ?cascade=true; uno sin nada ligado se borra. Todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgplan";
let A, f;
const nuevoPlan = async (nombre) => (await sql(
  `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
   VALUES ($1, 'Plan de la prueba de archivar', 900, 'MXN', 30, 4, $2, true, 997) RETURNING id`,
  [`${PFX} ${nombre}`, f.category],
))[0].id;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  await sql(`DELETE FROM discount_codes WHERE code LIKE 'RGPLAN%'`);
  await cleanup(PFX);
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

test("con una membresía vendida, ?cascade=true archiva en vez de borrar y no toca la membresía ni la orden", async () => {
  const planId = await nuevoPlan("vendido");
  const c = await makeClient(PFX, "compra");
  const venta = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(venta.status, 201, JSON.stringify(venta.body).slice(0, 200));
  const r = await api("DELETE", `/api/plans/${planId}?cascade=true`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.data.archived, true);
  assert.equal(r.body.message, "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.");
  const [p] = await sql(`SELECT is_active, archived_at, archived_by FROM plans WHERE id = $1`, [planId]);
  assert.equal(p.is_active, false);
  assert.ok(p.archived_at);
  assert.ok(p.archived_by);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM memberships WHERE plan_id = $1`, [planId]))[0].n, 1);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM orders WHERE plan_id = $1`, [planId]))[0].n, 1);
  const [log] = await sql(`SELECT before, after, meta FROM audit_log WHERE entity_id = $1 AND action = 'plan.archive'`, [planId]);
  assert.deepEqual(log.before, { for_sale: true });
  assert.deepEqual(log.after, { for_sale: false });
  assert.equal(log.meta.cascade_requested, true);
  assert.deepEqual(log.meta.kept, { memberships: 1, orders: 1, discount_codes: 0 });
  const enVenta = (await api("GET", "/api/plans?active=true", { token: A })).body.data;
  assert.ok(!enVenta.some((x) => x.id === planId), "archivado: fuera de la venta");
  const otra = await api("POST", "/api/memberships", { token: A, body: { userId: c.id, planId, paymentMethod: "cash" } });
  assert.equal(otra.status, 404, "no se puede vender un plan archivado");
});

test("un plan con un código de descuento también se archiva y el código se queda ligado", async () => {
  const planId = await nuevoPlan("concodigo");
  await sql(`INSERT INTO discount_codes (code, discount_type, discount_value, plan_id, is_active) VALUES ('RGPLAN10', 'percent', 10, $1, true)`, [planId]);
  const r = await api("DELETE", `/api/plans/${planId}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.archived, true);
  const [d] = await sql(`SELECT plan_id FROM discount_codes WHERE code = 'RGPLAN10'`);
  assert.equal(d.plan_id, planId, "el código no se vuelve de todos los planes");
});

test("un plan sin nada ligado se borra y queda en la bitácora", async () => {
  const planId = await nuevoPlan("vacio");
  const r = await api("DELETE", `/api/plans/${planId}`, { token: A });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.deleted, true);
  assert.equal((await sql(`SELECT COUNT(*)::int AS n FROM plans WHERE id = $1`, [planId]))[0].n, 0);
  const [log] = await sql(`SELECT before, meta FROM audit_log WHERE entity_id = $1 AND action = 'plan.delete'`, [planId]);
  assert.equal(log.before.plan_name, `${PFX} vacio`);
  assert.equal(log.meta.plan_name, `${PFX} vacio`);
});

test("inexistente → 404; id basura → 400", async () => {
  assert.equal((await api("DELETE", `/api/plans/${crypto.randomUUID()}`, { token: A })).status, 404);
  assert.equal((await api("DELETE", "/api/plans/basura", { token: A })).status, 400);
});
```

`src/pages/admin/plans/PlansList.test.tsx`:
- Agrega `waitFor` al import de testing-library, e `import fs from "fs";` e `import path from "path";`.
- Cambia `mockApi` a `{ get: Mock; delete: Mock }`.
- Agrega:

```tsx
  it("eliminar explica que un plan con historial se archiva y ya no manda cascade", async () => {
    mockApi.delete.mockReset().mockResolvedValue({ data: { message: "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.", data: { archived: true } } });
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    const paquete = (await screen.findByRole("heading", { name: "Paquete 8 clases" })).closest("article")!;
    fireEvent.keyDown(within(paquete).getByRole("button", { name: "Acciones de Paquete 8 clases" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Eliminar" }));
    const dlg = await screen.findByRole("alertdialog");
    expect(within(dlg).getByText(/se archiva: deja de venderse y su historial se conserva/)).toBeInTheDocument();
    fireEvent.click(within(dlg).getByRole("button", { name: "Eliminar" }));
    await waitFor(() => expect(mockApi.delete).toHaveBeenCalledWith("/plans/p8"));
  });

  it("un plan archivado dice Archivado", async () => {
    routeApi(mockApi, {
      "/admin/stats": { pendingAlerts: 0 },
      "/plans": { data: [
        { id: "pa", name: "Plan viejo", price: 900, duration_days: 30, class_limit: 4, class_category: "studio", is_active: false, archived_at: "2026-09-28T10:00:00Z" },
      ] },
    });
    renderAdmin(<PlansList />, { route: "/admin/plans" });
    const viejo = (await screen.findByRole("heading", { name: "Plan viejo" })).closest("article")!;
    expect(within(viejo).getByText("Archivado")).toBeInTheDocument();
  });

  it("ya no hay borrado en cascada por nombre de plan, ni texto de menos de 12 px", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "PlansList.tsx"), "utf8");
    expect(src).not.toMatch(/cascade|CASCADE_DELETE_PLAN_NAME/);
    expect(src).not.toMatch(/text-\[0\.(?:[0-6]\d*|7[0-4]?)rem\]/);
  });
```

- [ ] **Step 2: Correr y ver que fallan**:
  - `npx vitest run src/pages/admin/plans` → FAIL.
  - En tu base (5598/8198), `planes-archivar.test.mjs` → FAIL: con `cascade` se borraron la membresía y la orden.

- [ ] **Step 3: Implementar.**

**`server/index.js` · `DELETE /api/plans/:id`:** reemplaza la ruta completa por:

```js
// DELETE /api/plans/:id — un plan con historial (membresías, órdenes o códigos
// de descuento) se ARCHIVA: deja de venderse (is_active = false) y su historial
// se conserva. Sólo un plan sin nada ligado se borra. `?cascade=true` ya no
// borra nada: antes se llevaba membresías y órdenes (auditoría 2026-09-27,
// familia de P1-5). Todo queda en la bitácora.
app.delete("/api/plans/:id", adminMiddleware, async (req, res) => {
  const cascadeRequested = parseBooleanFlag(
    req.query?.cascade ?? req.query?.purgeRelated ?? req.body?.cascade ?? req.body?.purgeRelated
  );
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query(
      `SELECT p.id, p.name, p.price, p.is_active,
              (SELECT COUNT(*)::int FROM memberships m WHERE m.plan_id = p.id) AS memberships,
              (SELECT COUNT(*)::int FROM orders o WHERE o.plan_id = p.id) AS orders,
              (SELECT COUNT(*)::int FROM discount_codes d WHERE d.plan_id = p.id) AS discount_codes
         FROM plans p
        WHERE p.id = $1
        FOR UPDATE OF p`,
      [req.params.id],
    );
    if (!cur.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Plan no encontrado" });
    }
    const plan = cur.rows[0];
    const kept = { memberships: plan.memberships, orders: plan.orders, discount_codes: plan.discount_codes };
    const archivar = async (porque) => {
      await client.query(
        `UPDATE plans SET is_active = false, archived_at = COALESCE(archived_at, NOW()),
                archived_by = COALESCE(archived_by, $2), updated_at = NOW()
          WHERE id = $1`,
        [plan.id, req.userId],
      );
      await recordAudit(client, {
        actorId: req.userId, action: "plan.archive", entityType: "plan", entityId: plan.id,
        before: { for_sale: plan.is_active !== false }, after: { for_sale: false },
        meta: { plan_name: plan.name, kept, cascade_requested: cascadeRequested, why: porque },
      });
      await client.query("COMMIT");
      return res.json({
        message: "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.",
        data: { id: plan.id, archived: true, kept },
      });
    };
    if (plan.memberships + plan.orders + plan.discount_codes > 0) return await archivar("historial");

    // Sin nada ligado: se borra. Si otra tabla lo referencia, se archiva.
    await client.query("SAVEPOINT borrar_plan");
    try {
      await client.query("DELETE FROM plans WHERE id = $1", [plan.id]);
    } catch (err) {
      if (err?.code !== "23503") throw err;
      await client.query("ROLLBACK TO SAVEPOINT borrar_plan");
      return await archivar("referencias");
    }
    await recordAudit(client, {
      actorId: req.userId, action: "plan.delete", entityType: "plan", entityId: plan.id,
      before: { plan_name: plan.name, list_price: Number(plan.price), for_sale: plan.is_active !== false },
      meta: { plan_name: plan.name },
    });
    await client.query("COMMIT");
    return res.json({ message: "Plan eliminado", data: { id: plan.id, deleted: true } });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("[DELETE /plans]", err.message);
    return res.status(500).json({ message: "Error interno" });
  } finally {
    client.release();
  }
});
```

**`src/pages/admin/plans/PlansList.tsx`:**
- Borra el comentario `// RIESGO: el borrado en cascada …` y la constante `CASCADE_DELETE_PLAN_NAME`.
- `interface Plan extends PlanFormData { id: string; }` pasa a `interface Plan extends PlanFormData { id: string; archivedAt?: string | null; }`.
- En `normalizePlanRow`, tras `isVisitPack: …,` agrega `archivedAt: (row?.archivedAt ?? row?.archived_at ?? null) as string | null,`.
- En `PlanCard`, la línea del estado pasa a:

```tsx
        {p.isActive
          ? <StatusDot tone="success">Activo</StatusDot>
          : <StatusDot tone="muted">{p.archivedAt ? "Archivado" : "Inactivo"}</StatusDot>}
```

- En el encabezado de cada grupo de categoría, `text-[0.72rem] font-medium uppercase tracking-[0.18em]` pasa a `text-[0.75rem] font-medium uppercase tracking-[0.18em]`. Mide 11.5 px y la regla del panel es de 12 px; el recorrido de la Tarea 10 mide esta pantalla.
- `deleteMutation` pasa a:

```tsx
  // Un plan con historial se archiva en el servidor; ya no hay "Eliminar con
  // todo" (auditoría 2026-09-27, familia de P1-5).
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: res?.data?.message ?? "Plan eliminado" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar", variant: "destructive" }),
  });
```

- `requestDelete` pasa a:

```tsx
  const requestDelete = async (p: Plan) => {
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      description: "Si el plan tiene membresías, órdenes o códigos de descuento, se archiva: deja de venderse y su historial se conserva. Si no tiene nada ligado, se borra.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(p.id);
  };
```

- [ ] **Step 4: Verde**:
  - `npx vitest run src/pages/admin/plans` → PASS.
  - En tu base (5598/8198): `planes-archivar.test.mjs` más `ventas-ajustes.test.mjs` y `robustez.test.mjs` → PASS.
  - tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add server/index.js server/tests/planes-archivar.test.mjs src/pages/admin/plans/PlansList.tsx src/pages/admin/plans/PlansList.test.tsx
git commit -m "fix(hive): borrar un plan con historial lo archiva en lugar de llevarse membresías y órdenes; queda en la bitácora"
```

---

### Task 10: Verificación

**Files:**
- Create: `server/tests/integracion-bloque3.test.mjs`: prueba de punta a punta entre tareas. Es el único archivo nuevo del repo en esta tarea; la evidencia va a `.superpowers/sdd/2026-09-28-auditoria-bloque3/verificacion/`, que está ignorada.

- [ ] **Step 1: Prueba de integración entre tareas.** Crea `server/tests/integracion-bloque3.test.mjs`:

```js
// Tarea 10 · auditoría 2026-09-27, bloque 3. Punta a punta entre tareas que en
// su ola sólo vieron el gancho vacío:
//   - la cancelación de la clienta (T3), el reembolso total (T7) y la
//     cancelación por webhook de Wellhub (T6) suben la lista de espera (T4);
//   - la subida no gasta la cuota de nadie (T3).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { api, login, sql, makeClient, studioFixtures, makeClass, giveMembership, bookingId, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";

const PFX = "rgintb3";
const SECRET = "whsec-qa-integracion";
const RUN = crypto.randomUUID().slice(0, 8);
let A, f, prevCreds, stub;

// Un Wellhub de mentira que acepta todo, como en wellhub-checkin.test.mjs.
const levantarStub = () => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    req.resume();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
  });
  s.listen(0, "127.0.0.1", () => resolve(s));
});

const estado = async (id) => (await sql(`SELECT status::text AS s FROM bookings WHERE id = $1`, [id]))[0].s;
const usadas = async (userId) => (await sql(`SELECT cancellations_used FROM memberships WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`, [userId]))[0].cancellations_used;
async function clienta(key) {
  const c = await makeClient(PFX, key);
  await giveMembership(A, c.id, f.plan.id, 8);
  return c;
}
const reservar = async (c, classId) => {
  const r = await api("POST", "/api/bookings", { token: c.token, body: { classId } });
  assert.ok(r.status < 300, `reservar devolvió ${r.status}: ${JSON.stringify(r.body).slice(0, 150)}`);
  return bookingId(r);
};

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
  stub = await levantarStub();
  [prevCreds] = await sql(`SELECT * FROM platform_credentials WHERE channel = 'wellhub'`);
  await sql(
    `INSERT INTO platform_credentials (channel, environment, is_enabled, gym_id, webhook_secret, access_base_url, booking_base_url, extra_config)
     VALUES ('wellhub', 'sandbox', true, 'g-int-b3', $1, $2, $2, '{}'::jsonb)
     ON CONFLICT (channel) DO UPDATE SET is_enabled = true, gym_id = 'g-int-b3', webhook_secret = $1,
       access_base_url = $2, booking_base_url = $2`,
    [SECRET, `http://127.0.0.1:${stub.address().port}`],
  );
});
after(async () => {
  if (prevCreds) {
    await sql(
      `UPDATE platform_credentials SET environment = $1, is_enabled = $2, gym_id = $3, webhook_secret = $4,
              access_base_url = $5, booking_base_url = $6 WHERE channel = 'wellhub'`,
      [prevCreds.environment, prevCreds.is_enabled, prevCreds.gym_id, prevCreds.webhook_secret, prevCreds.access_base_url, prevCreds.booking_base_url],
    );
  } else {
    await sql(`DELETE FROM platform_credentials WHERE channel = 'wellhub'`);
  }
  stub.close();
  await sql(`DELETE FROM refunds WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  await cleanup(PFX);
  await closeDb();
});

test("la clienta cancela a tiempo: sube la primera de la fila; sólo a la que canceló le cuenta", async () => {
  const a = await clienta("a");
  const w = await clienta("w");
  const classId = await makeClass(A, f, { date: day(12), cap: 1 });
  const ba = await reservar(a, classId);
  const bw = await reservar(w, classId);
  assert.equal(await estado(bw), "waitlist");
  const r = await api("DELETE", `/api/bookings/${ba}`, { token: a.token });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await estado(bw), "confirmed", "la cancelación de la clienta sube la fila");
  assert.equal(await usadas(a.id), 1);
  assert.equal(await usadas(w.id), 0, "subir de la fila no gasta cuota");
});

test("el reembolso total de una inscrita sube la fila", async () => {
  const b = await makeClient(PFX, "b");
  const v = await api("POST", "/api/memberships", { token: A, body: { userId: b.id, planId: f.plan.id, paymentMethod: "cash", startDate: day(0) } });
  assert.equal(v.status, 201);
  const [m] = await sql(`SELECT order_id FROM memberships WHERE user_id = $1`, [b.id]);
  const w = await clienta("w2");
  const classId = await makeClass(A, f, { date: day(13), cap: 1 });
  await reservar(b, classId);
  const bw = await reservar(w, classId);
  const r = await api("POST", `/api/admin/orders/${m.order_id}/refunds`, { token: A, body: { kind: "total", method: "cash", reason: "No pudo seguir por lesión" } });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  assert.equal(await estado(bw), "confirmed");
});

test("la cancelación por webhook de Wellhub sube la fila", async () => {
  const s = await makeClient(PFX, "wh");
  const w = await clienta("w3");
  const classId = await makeClass(A, f, { date: day(14), cap: 1 });
  const ref = `WH-${RUN}-int`;
  await sql(`INSERT INTO bookings (class_id, user_id, status, channel, external_ref) VALUES ($1, $2, 'confirmed', 'wellhub', $3)`, [classId, s.id, ref]);
  const bw = await reservar(w, classId);
  assert.equal(await estado(bw), "waitlist");
  const raw = JSON.stringify({ event_type: "booking-canceled", event_id: `int-${RUN}`, gym_id: "g-int-b3", event_data: { booking_number: ref } });
  const firma = crypto.createHmac("sha1", SECRET).update(raw).digest("hex");
  const r = await api("POST", "/webhooks/wellhub", { raw, headers: { "x-gympass-signature": firma } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(await estado(bw), "confirmed");
});
```

- [ ] **Step 2: Suites.** `npm test` (vitest, `test:server` y scripts) → todo en verde. Si hay esperas agotadas del panel por carga de la máquina, vuelve a correr esos archivos solos y reporta ambos resultados.
- [ ] **Step 3: Tipos.** `npx tsc --noEmit -p tsconfig.app.json` → sin errores nuevos (sólo los preexistentes de `aliases` y supabase).
- [ ] **Step 4: Build con Node 20.** `rm -rf dist && VITE_API_URL=/api npx -y node@20 node_modules/vite/bin/vite.js build` → `✓ built`.
- [ ] **Step 5: Regresión completa del servidor** en base desechable (5599/8199), con el procedimiento de Global Constraints (incluidos `API_RATE_LIMIT_USER_MAX=100000` y `WAITLIST_SWEEP_MINUTES=0`):
  - **Comando:** `API_URL=http://127.0.0.1:8199 DATABASE_URL=postgres://alma:alma@127.0.0.1:5599/hive node --test --test-concurrency=1 "server/tests/*.test.mjs"` → todo en verde.
  - **Qué corre:** las suites de antes, las del bloque 2 y las nuevas: `esquema-bloque3`, `marca-legales`, `cuota-cancelaciones`, `lista-espera`, `wellhub-checkin`, `reembolsos`, `privacidad-consentimiento`, `planes-archivar` e `integracion-bloque3`.
  - **Repite** `lista-espera.test.mjs` e `integracion-bloque3.test.mjs` tres veces: las de concurrencia no deben fallar ninguna vez.
- [ ] **Step 5b: Commit de la prueba de integración** (sólo si la regresión quedó en verde):

```bash
git add server/tests/integracion-bloque3.test.mjs
git commit -m "test(hive): integración del bloque 3 — la cancelación de la clienta, el reembolso total y la cancelación de Wellhub suben la lista de espera sin gastar cuota"
```

- [ ] **Step 6: Recorrido en navegador** con Playwright de Python en navegador propio (no el MCP compartido), del panel y de la app de clientas a 1280 y 390 px.
  - **Base y servidor:** base desechable 5600/8200 con `WAITLIST_SWEEP_MINUTES=0`, con `dist/` servido por el servidor.
  - **Hora:** córrelo de día; las clases del recorrido son de dentro de 3 a 5 días.
  - **Script:** guárdalo como `.superpowers/sdd/2026-09-28-auditoria-bloque3/verificacion/recorrido.py` y corre `BASE_URL=http://127.0.0.1:8200 DATABASE_URL=postgres://alma:alma@127.0.0.1:5600/hive python3 recorrido.py` → sale con código 0 y deja capturas.

```python
#!/usr/bin/env python3
# Recorrido del panel y de la app · auditoría bloque 3. Sólo contra una base desechable.
import json, os, re, subprocess, sys, urllib.error, urllib.request, zlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8200")
DB = os.environ.get("DATABASE_URL", "postgres://alma:alma@127.0.0.1:5600/hive")
OUT = os.environ.get("OUT_DIR", ".superpowers/sdd/2026-09-28-auditoria-bloque3/verificacion")
TZ = ZoneInfo("America/Mexico_City")
PWD = "Recorrido!2026"
ESPERADOS = set()  # (método, fragmento de URL, status): ninguna respuesta >= 400 es esperada aquí
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
FIRMA = "data:image/png;base64," + ("A" * 400)

def usuaria(clave, nombre, rol="client", responsiva="v2"):
    email = f"recorrido3_{clave}@hive.test"
    tel = f"55{zlib.crc32(clave.encode()) % 10**8:08d}"
    uid = psql(f"""INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, is_active)
                   VALUES ('{nombre}', '{email}', '{tel}', '{HASH}', '{rol}', true, true)
                   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
                   RETURNING id""")
    if rol == "client":
        psql(f"""INSERT INTO waivers (user_id, full_name, signature_data, waiver_version)
                 VALUES ('{uid}', '{nombre}', '{FIRMA}', '{responsiva}') ON CONFLICT DO NOTHING""")
    token = api("POST", "/api/auth/login", body={"email": email, "password": PWD})[1].get("token")
    return {"id": uid, "email": email, "name": nombre, "token": token}

# ── Datos sintéticos ────────────────────────────────────────────────────────
duena = usuaria("duena", "Dueña Recorrido", "admin")
recep = usuaria("recep", "Recepción Recorrido", "reception")
ana, eva, bea = usuaria("ana", "Ana Recorrido"), usuaria("eva", "Eva Recorrido"), usuaria("bea", "Bea Recorrido")
dani, caro = usuaria("dani", "Dani Recorrido"), usuaria("caro", "Caro Recorrido")
vieja = usuaria("vieja", "Vieja Recorrido", responsiva="v1")
A = duena["token"]
coach = api("POST", "/api/instructors", A, {"displayName": "Coach Recorrido", "isActive": True})[1]["data"]["id"]
tipo, categoria = psql("SELECT id || '|' || category FROM class_types WHERE is_active ORDER BY sort_order NULLS LAST LIMIT 1").split("|")
plan = psql(f"""INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                VALUES ('Recorrido 8', 'Recorrido', 1700, 'MXN', 30, 8, '{categoria}', true, 998) RETURNING id""")
archivable = psql(f"""INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                      VALUES ('Recorrido archivable', 'Recorrido', 900, 'MXN', 30, 4, '{categoria}', true, 999) RETURNING id""")
for u in (ana, eva, bea, dani, caro):
    s, r = api("POST", "/api/memberships", A, {"userId": u["id"], "planId": plan, "paymentMethod": "cash"})
    assert s == 201, (s, r)
s, r = api("POST", "/api/memberships", A, {"userId": vieja["id"], "planId": archivable, "paymentMethod": "cash"})
assert s == 201, (s, r)
psql(f"UPDATE memberships SET cancellations_used = 2 WHERE user_id = '{dani['id']}'")

def clase(fecha, hora, cupo):
    h, m = map(int, hora.split(":"))
    fin = f"{(h * 60 + m + 50) // 60:02d}:{(h * 60 + m + 50) % 60:02d}"
    s, r = api("POST", "/api/classes", A, {"classTypeId": tipo, "instructorId": coach,
                                            "startTime": f"{fecha}T{hora}", "endTime": f"{fecha}T{fin}", "maxCapacity": cupo})
    assert s == 201, (s, r)
    return r["data"]["id"]

hoy = datetime.now(TZ).date()
llena_id = clase(str(hoy + timedelta(days=3)), "09:00", 1)   # Eva confirmada, Ana en la fila
libre_id = clase(str(hoy + timedelta(days=4)), "09:00", 5)   # Dani reserva y cancela desde la app
fila_id = clase(str(hoy + timedelta(days=5)), "09:00", 1)    # Eva confirmada, Caro en la fila (sale desde la app)
for u, c in ((eva, llena_id), (ana, llena_id), (eva, fila_id), (caro, fila_id)):
    s, r = api("POST", "/api/bookings", u["token"], {"classId": c})
    assert s < 300, (s, r)
if psql(f"SELECT status FROM bookings WHERE class_id = '{llena_id}' AND user_id = '{ana['id']}'") != "waitlist":
    fallas.append("Ana no quedó en la fila de la clase llena")
# Una visita de Wellhub del mes, para la pantalla de conciliación.
wh_book = psql(f"""INSERT INTO bookings (class_id, user_id, status, channel, external_ref, checked_in_at)
                   VALUES ('{libre_id}', '{vieja['id']}', 'checked_in', 'wellhub', 'WH-RECORRIDO-1', NOW()) RETURNING id""")
psql(f"""INSERT INTO partner_checkins (booking_id, user_id, channel, status, method, validated_at)
         VALUES ('{wh_book}', '{vieja['id']}', 'wellhub', 'confirmed', 'automated', NOW())""")

# ── Ayudas del navegador ───────────────────────────────────────────────────
def vigilar(page):
    def on_resp(r):
        if "/api/" in r.url and r.status >= 400 and not any(
                m == r.request.method and frag in r.url and st == r.status for m, frag, st in ESPERADOS):
            fallas.append(f"HTTP {r.status} {r.request.method} {r.url}")
    page.on("response", on_resp)
    page.on("console", lambda msg: msg.type == "error" and fallas.append(f"consola: {msg.text[:160]}"))

def revisar(page, nombre, zona="main", fuente=True):
    """Sin scroll horizontal, sin 'undefined'/'NaN'/'Invalid Date' y, en el panel
    (fuente=True), sin texto de menos de 12 px. La app de clientas y los legales
    conservan su tema; ahí no se mide la fuente."""
    page.wait_for_load_state("networkidle")
    if page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth"):
        fallas.append(f"{nombre}: scroll horizontal")
    if fuente:
        chicas = page.evaluate(f"""() => [...document.querySelectorAll('{zona} *')].filter(el =>
            el.offsetParent !== null && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) &&
            parseFloat(getComputedStyle(el).fontSize) < 12).map(el => el.textContent.trim().slice(0, 40))""")
        if chicas:
            fallas.append(f"{nombre}: texto < 12 px: {chicas[:5]}")
    texto = page.inner_text(zona)
    for mal in ("undefined", "NaN", "Invalid Date"):
        if mal in texto:
            fallas.append(f"{nombre}: aparece '{mal}'")
    page.screenshot(path=f"{OUT}/{nombre}.png", full_page=True)

def contexto(nav, ancho, alto, **kw):
    return nav.new_context(viewport={"width": ancho, "height": alto}, locale="es-MX",
                           timezone_id="America/Mexico_City", **kw)

def entrar(ctx, persona, red=True):
    # La sesión vive en localStorage (auth_token): cada persona va en su propio contexto.
    page = ctx.new_page()
    if red:
        vigilar(page)
    page.goto(f"{BASE}/auth/login")
    page.get_by_placeholder("tu@email.com").fill(persona["email"])
    page.get_by_placeholder("••••••••").fill(PWD)
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_url(re.compile(r".*/(admin|app).*"))
    return page

with sync_playwright() as p:
    nav = p.chromium.launch()

    # ═══ Panel · dueña · 1280 ═══════════════════════════════════════════════
    ctx = contexto(nav, 1280, 900)
    page = entrar(ctx, duena)

    # 1) Configuración · Políticas: la cuota pasa de 2 a 3 y se ve cómo queda publicada
    page.goto(f"{BASE}/admin/settings?tab=policies")
    campo = page.get_by_label("Cancelaciones permitidas por paquete")
    expect(campo).to_have_value("2")
    campo.fill("3")
    expect(page.get_by_role("list", name="Reglas publicadas").get_by_text("Puedes cancelar hasta 3 veces por paquete.", exact=False)).to_be_visible()
    page.get_by_role("button", name="Guardar", exact=True).click()
    expect(page.get_by_text("Política guardada").first).to_be_visible()
    revisar(page, "politicas-1280")

    # 2) Reservas: cancelar la reserva de Eva en la clase llena sube a Ana
    page.goto(f"{BASE}/admin/bookings?clase={llena_id}")
    page.get_by_role("button", name="Más acciones para Eva Recorrido", exact=True).click()
    page.get_by_role("menuitem", name="Cancelar reserva (devuelve crédito)").click()
    dlg = page.get_by_role("dialog", name="Cancelar reserva de Eva Recorrido")
    dlg.get_by_label("Motivo (obligatorio)").fill("La movimos a otra clase")
    dlg.get_by_role("button", name="Cancelar reserva", exact=True).click()
    expect(page.get_by_text("Subió de la lista de espera: Ana Recorrido", exact=False).first).to_be_visible()
    expect(page.get_by_text("Avísale tú: no le llegó el WhatsApp.", exact=False).first).to_be_visible()

    # 3) Lista de espera (Caro espera en la otra clase)
    page.goto(f"{BASE}/admin/bookings/waitlist")
    expect(page.get_by_text("Por orden de llegada.", exact=False).first).to_be_visible()
    revisar(page, "lista-espera-1280")

    # 4) Ficha de Dani: sus 2 cancelaciones usadas vuelven a 0 con motivo
    page.goto(f"{BASE}/admin/clients/{dani['id']}")
    mem = page.get_by_role("region", name="Membresía", exact=True)
    expect(mem.get_by_text("Cancelaciones: 2 de 3")).to_be_visible()
    mem.get_by_role("button", name=re.compile("Editar")).click()
    dlg = page.get_by_role("dialog", name="Editar membresía")
    dlg.get_by_label("Cancelaciones usadas").fill("0")
    dlg.get_by_label("Motivo del ajuste").fill("Canceló por enfermedad, trajo receta")
    dlg.get_by_role("button", name="Guardar", exact=True).click()
    expect(page.get_by_text("Membresía actualizada").first).to_be_visible()
    revisar(page, "ficha-1280")

    # 5) Cobros · Historial: reembolso parcial a Bea
    page.goto(f"{BASE}/admin/payments/historial")
    page.get_by_role("button", name="Reembolsar el pago de Bea Recorrido", exact=True).click()
    dlg = page.get_by_role("dialog", name="Reembolsar a Bea Recorrido")
    dlg.get_by_label("Reembolso parcial").check()
    dlg.get_by_label("Monto a devolver").fill("425")
    expect(dlg.get_by_label("Clases a quitar")).to_have_value("2")
    dlg.get_by_label("Motivo (obligatorio)").fill("Se lesionó la rodilla")
    dlg.get_by_role("button", name="Registrar reembolso", exact=True).click()
    expect(page.get_by_text("Reembolso registrado").first).to_be_visible()
    expect(page.get_by_text("Reembolso parcial · $425").first).to_be_visible()
    revisar(page, "historial-1280")

    # 6) Planes: el plan vendido se archiva
    page.goto(f"{BASE}/admin/plans")
    page.get_by_role("button", name="Acciones de Recorrido archivable", exact=True).click()
    page.get_by_role("menuitem", name="Eliminar").click()
    page.get_by_role("alertdialog").get_by_role("button", name="Eliminar", exact=True).click()
    expect(page.get_by_text("Plan archivado", exact=False).first).to_be_visible()
    revisar(page, "planes-1280")

    # 7) Wellhub: ajustes y conciliación (sólo la dueña)
    page.goto(f"{BASE}/admin/settings/platforms")
    expect(page.get_by_text("Ambiente", exact=True)).to_be_visible()
    page.goto(f"{BASE}/admin/bookings/partners-checkins")
    expect(page.get_by_role("heading", name="Check-ins Wellhub", exact=True)).to_be_visible()
    expect(page.get_by_text("Confirmados por Wellhub", exact=True)).to_be_visible()
    revisar(page, "wellhub-checkins-1280")

    # 8) Bitácora
    page.goto(f"{BASE}/admin/bitacora")
    lista = page.get_by_role("list", name="Movimientos")
    for texto in ["Subió de la lista de espera", "Reembolso parcial", "Plan archivado", "Política de cancelación cambiada", "Ajuste de membresía"]:
        expect(lista.get_by_text(texto, exact=True).first).to_be_visible()
    revisar(page, "bitacora-1280")
    ctx.storage_state(path=f"{OUT}/sesion-duena.json")
    ctx.close()

    # ═══ Panel · dueña · 390 ════════════════════════════════════════════════
    movil = contexto(nav, 390, 844, storage_state=f"{OUT}/sesion-duena.json")
    mp = movil.new_page()
    vigilar(mp)
    for ruta, nombre in [("/admin/settings?tab=policies", "politicas-390"), ("/admin/payments/historial", "historial-390"),
                         ("/admin/bookings/partners-checkins", "wellhub-checkins-390"), ("/admin/bookings/waitlist", "lista-espera-390"),
                         (f"/admin/clients/{dani['id']}", "ficha-390"), ("/admin/plans", "planes-390"), ("/admin/bitacora", "bitacora-390")]:
        mp.goto(BASE + ruta)
        revisar(mp, nombre)
    movil.close()

    # ═══ Panel · recepción ══════════════════════════════════════════════════
    if api("GET", "/api/partners/checkins", recep["token"])[0] != 403:
        fallas.append("recepción puede leer /api/partners/checkins")
    if api("PUT", "/api/admin/booking-policy", recep["token"], {"cancellationLimit": 5})[0] != 403:
        fallas.append("recepción puede cambiar la cuota")
    rctx = contexto(nav, 1280, 900)
    rp = entrar(rctx, recep, red=False)   # sin vigilar la red: algunas pantallas piden cosas de la dueña
    rp.wait_for_load_state("networkidle")
    if rp.get_by_role("link", name=re.compile("Wellhub")).count():
        fallas.append("recepción ve Wellhub en el menú")
    rp.goto(f"{BASE}/admin/settings?tab=policies")
    expect(rp.get_by_label("Cancelaciones permitidas por paquete")).to_be_disabled()
    rp.goto(f"{BASE}/admin/bookings/partners-checkins")
    rp.wait_for_url(re.compile(r".*/app.*"))
    rctx.close()

    # ═══ App de clientas · 390 y 1280 (un contexto por persona) ═════════════
    for ancho, alto, sufijo in ((390, 844, "390"), (1280, 900, "1280")):
        # Ana: subió de la fila y la ve confirmada
        c = contexto(nav, ancho, alto)
        ap = entrar(c, ana)
        ap.goto(f"{BASE}/app/bookings")
        expect(ap.get_by_text("Confirmada", exact=True).first).to_be_visible()
        revisar(ap, f"app-ana-reservas-{sufijo}", fuente=False)
        c.close()

        # Dani: la misma política en el detalle y al cancelar, con "te quedan N"
        c = contexto(nav, ancho, alto)
        dp = entrar(c, dani)
        dp.goto(f"{BASE}/app/classes/{libre_id}")
        reglas = dp.get_by_role("list", name="Reglas de cancelación")
        expect(reglas.get_by_text("Puedes cancelar hasta 3 veces por paquete. Salir de la lista de espera no cuenta.", exact=True)).to_be_visible()
        # 390 va primero: cuota 3 y 0 usadas tras el ajuste; ahí cancela una y en 1280 le quedan 2.
        esperado_quedan = "Te quedan 3 cancelaciones de este paquete." if sufijo == "390" else "Te quedan 2 cancelaciones de este paquete."
        expect(dp.get_by_text(esperado_quedan, exact=True)).to_be_visible()
        revisar(dp, f"app-detalle-clase-{sufijo}", fuente=False)
        if sufijo == "390":
            dp.get_by_role("button", name="Reservar", exact=True).click()
            dp.wait_for_url(re.compile(r".*/app/bookings.*"))
            dp.get_by_role("button", name="Cancelar reserva", exact=True).first.click()
            dlg = dp.get_by_role("alertdialog", name="¿Cancelar tu reserva?")
            expect(dlg.get_by_text("Te quedan 3 cancelaciones de este paquete.", exact=True)).to_be_visible()
            dlg.get_by_role("button", name="Sí, cancelar", exact=True).click()
            expect(dp.get_by_text("Reserva cancelada").first).to_be_visible()
        c.close()

        # Caro: su lugar en la fila y salir sin usar cancelación; salud con consentimiento
        c = contexto(nav, ancho, alto)
        cp = entrar(c, caro)
        cp.goto(f"{BASE}/app/bookings")
        if sufijo == "390":
            expect(cp.get_by_text("Lugar 1 en la fila", exact=True)).to_be_visible()
            cp.get_by_role("button", name="Salir de la lista de espera", exact=True).click()
            dlg = cp.get_by_role("alertdialog", name="¿Salir de la lista de espera?")
            dlg.get_by_role("button", name="Sí, salir", exact=True).click()
            expect(cp.get_by_text("Saliste de la lista de espera").first).to_be_visible()
            cp.goto(f"{BASE}/app/profile/edit")
            cp.get_by_label("Notas (opcional)").fill("Lesión en rodilla derecha")
            cp.get_by_role("button", name="Guardar cambios", exact=True).click()
            expect(cp.get_by_text("Marca la casilla para guardar tus datos de salud.").first).to_be_visible()
            cp.get_by_role("checkbox", name=re.compile("Autorizo expresamente")).click()
            cp.get_by_role("button", name="Guardar cambios", exact=True).click()
            expect(cp.get_by_text("Perfil actualizado.").first).to_be_visible()
        cp.goto(f"{BASE}/app/profile/edit")
        revisar(cp, f"app-perfil-{sufijo}", fuente=False)
        cp.goto(f"{BASE}/app/profile/responsiva")
        expect(cp.get_by_text("HIVE Pilates Studio — Responsiva y Consentimiento Informado").first).to_be_visible()
        expect(cp.get_by_text("en la versión que firmaste (v2)", exact=False)).to_be_visible()
        revisar(cp, f"app-responsiva-{sufijo}", fuente=False)
        c.close()

        # Legales, sin sesión
        c = contexto(nav, ancho, alto)
        lp = c.new_page()
        vigilar(lp)
        lp.goto(f"{BASE}/legal/privacidad")
        expect(lp.get_by_role("heading", name="7. Tus derechos ARCO, revocación y limitación", exact=True)).to_be_visible()
        expect(lp.get_by_text("Versión 2026-09-28", exact=True)).to_be_visible()
        revisar(lp, f"legal-privacidad-{sufijo}", zona="body", fuente=False)
        lp.goto(f"{BASE}/legal/cancelacion")
        expect(lp.get_by_role("list", name="Reglas de cancelación").get_by_text("Puedes cancelar hasta 3 veces por paquete.", exact=False)).to_be_visible()
        revisar(lp, f"legal-cancelacion-{sufijo}", zona="body", fuente=False)
        lp.goto(f"{BASE}/legal/terminos")
        revisar(lp, f"legal-terminos-{sufijo}", zona="body", fuente=False)
        for ruta in ("/legal/privacidad", "/legal/cancelacion", "/legal/terminos"):
            lp.goto(BASE + ruta)
            lp.wait_for_load_state("networkidle")
            if re.search(r"\bAlma\b|almamovement|Juriquilla", lp.inner_text("body")):
                fallas.append(f"{ruta} ({sufijo}): todavía dice Alma")
        c.close()
    nav.close()

# ── Comprobaciones en la base ───────────────────────────────────────────────
if psql(f"SELECT status::text || '|' || (promoted_at IS NOT NULL)::text FROM bookings WHERE class_id = '{llena_id}' AND user_id = '{ana['id']}'") != "confirmed|true":
    fallas.append("Ana no subió de la fila (o sin promoted_at)")
if psql("SELECT value->>'max_cancellations' FROM settings WHERE key = 'cancellation_settings'") != "3":
    fallas.append("la cuota no quedó en 3")
if psql(f"SELECT cancellations_used FROM memberships WHERE user_id = '{dani['id']}' ORDER BY created_at DESC LIMIT 1") != "1":
    fallas.append("a Dani no le cuadra la cuota (0 tras el ajuste + 1 cancelación)")
if psql(f"SELECT status FROM bookings WHERE class_id = '{fila_id}' AND user_id = '{caro['id']}'") != "cancelled":
    fallas.append("Caro no salió de la fila")
if psql(f"SELECT cancellations_used FROM memberships WHERE user_id = '{caro['id']}' ORDER BY created_at DESC LIMIT 1") != "0":
    fallas.append("salir de la fila le gastó cuota a Caro")
if psql(f"SELECT health_consent_version FROM users WHERE id = '{caro['id']}'") != "2026-09-28":
    fallas.append("el consentimiento de salud de Caro no quedó con su versión")
if psql(f"SELECT refund_status FROM orders o JOIN memberships m ON m.order_id = o.id WHERE m.user_id = '{bea['id']}'") != "partially_refunded":
    fallas.append("el pago de Bea no quedó como reembolso parcial")
if psql(f"SELECT (NOT is_active) AND archived_at IS NOT NULL FROM plans WHERE id = '{archivable}'") != "t":
    fallas.append("el plan no quedó archivado")
if psql(f"SELECT COUNT(*) FROM memberships WHERE plan_id = '{archivable}'") != "1":
    fallas.append("archivar el plan tocó su membresía")
if psql(f"SELECT waiver_version FROM waivers WHERE user_id = '{vieja['id']}'") != "v1":
    fallas.append("la responsiva v1 de Vieja cambió de versión")
acciones = set(psql("SELECT DISTINCT action FROM audit_log").split("\n"))
faltan = {"booking.waitlist_promoted", "order.refund", "plan.archive", "settings.update", "membership.adjust"} - acciones
if faltan:
    fallas.append(f"acciones sin bitácora: {sorted(faltan)}")

print("\n".join(fallas) if fallas else "Recorrido sin fallas")
sys.exit(1 if fallas else 0)
```

- [ ] **Step 7: Reporte.**
  - Salidas de suites, tsc, build y regresión, incluidas las tres corridas de las pruebas de concurrencia.
  - Salida del recorrido, con las capturas de `.superpowers/sdd/2026-09-28-auditoria-bloque3/verificacion/`.
  - Cualquier falla, con su prueba en rojo y su arreglo.
  - Los pendientes del dueño y del abogado del spec §3.7, sin resolver.
  - Desmontaje confirmado: puertos 5599, 8199, 5600 y 8200 libres, y directorios temporales borrados.


