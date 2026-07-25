# Integración Wellhub — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans. Los pasos usan checkbox (`- [ ]`).

**Goal:** Socios Wellhub reservan y hacen check-in en clases de Alma; Alma confirma reservas, valida visitas contra la API de Wellhub y registra cada visita como orden de convenio.

**Architecture:** Monolito `server/index.js` (ESM/JS). Reserva Wellhub = fila en `bookings` con `channel='wellhub'`. Webhook con raw body (patrón Stripe) + firma HMAC-SHA1 + idempotencia. Alma se suma al gateway compartido vía `GYM_ROUTES`.

**Tech Stack:** Express, pg (`pool.query`), crypto (HMAC), axios/fetch (salientes), React + shadcn (panel). Tests con `node --test` (como `server/lib/*.test.js`).

**Spec:** `docs/superpowers/specs/2026-07-24-wellhub-integration-design.md`

---

## File Structure

- **Backend** (nuevos módulos lib, importados por `server/index.js`):
  - `server/lib/wellhub/signature.js` — verificación firma HMAC-SHA1 + normalización.
  - `server/lib/wellhub/signature.test.js`
  - `server/lib/wellhub/payload.js` — parseo de payload (gym_id, slot, bookingNumber, ventana check-in).
  - `server/lib/wellhub/payload.test.js`
  - `server/lib/wellhub/pricing.js` — `resolveWellhubPrice(settings)`.
  - `server/lib/wellhub/pricing.test.js`
  - `server/lib/wellhub/api.js` — cliente saliente (confirmBooking, validateVisit, syncCustomCode, base URLs por environment).
  - `server/lib/wellhub/credentials.js` — `getWellhubCredentials()` (lee `platform_credentials`).
  - `server/lib/wellhub/flows.js` — flujos (bookingRequested, checkin, cancel, planChange) — reciben `pool`/`client`.
- **Backend en `server/index.js`**: schema (ensureSchema), rutas webhook + gestión, hook check-in, crons.
- **Frontend**:
  - `src/pages/admin/settings/PartnerPlatforms.tsx` + ruta en `App.tsx`.
  - `src/pages/admin/bookings/PartnerCheckins.tsx` + ruta.
  - `src/pages/admin/classes/WellhubClassControl.tsx` (usado por `ClassesCalendar.tsx`).

---

## FASE 1 — Datos

### Task 1: Schema (tablas, columnas, trigger de inventario)

**Files:** Modify `server/index.js` (dentro de `ensureSchema`, junto a los otros `CREATE/ALTER ... IF NOT EXISTS`).

- [ ] **Step 1: Agregar tablas y columnas.** Insertar en `ensureSchema`:

```js
// ── Wellhub / partner channels ──────────────────────────────────────────
await pool.query(`CREATE TABLE IF NOT EXISTS platform_credentials (
  channel        VARCHAR(20) PRIMARY KEY,
  environment    VARCHAR(20) NOT NULL DEFAULT 'production',
  is_enabled     BOOLEAN NOT NULL DEFAULT false,
  gym_id         TEXT,
  webhook_secret TEXT,
  access_token   TEXT,
  api_base_url   TEXT, booking_base_url TEXT, access_base_url TEXT,
  webhook_url    TEXT,
  extra_config   JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
)`).catch((e)=>console.warn("[schema] platform_credentials", e.message));

await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'app'`).catch(()=>{});
await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_ref TEXT`).catch(()=>{});
await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_metadata JSONB DEFAULT '{}'::jsonb`).catch(()=>{});
await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_status TEXT`).catch(()=>{});
await pool.query(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_reported_at TIMESTAMPTZ`).catch(()=>{});
await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_bookings_channel_ref
  ON bookings(channel, external_ref) WHERE channel <> 'app' AND external_ref IS NOT NULL`).catch(()=>{});

await pool.query(`CREATE TABLE IF NOT EXISTS channel_inventory (
  class_id UUID NOT NULL, channel VARCHAR(20) NOT NULL,
  max_spots INT NOT NULL DEFAULT 0, booked_spots INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (class_id, channel)
)`).catch(()=>{});

await pool.query(`CREATE TABLE IF NOT EXISTS partner_class_mappings (
  class_id UUID NOT NULL, channel VARCHAR(20) NOT NULL,
  external_class_id TEXT, external_slot_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (class_id, channel)
)`).catch(()=>{});

await pool.query(`CREATE TABLE IF NOT EXISTS partner_checkins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_id UUID, user_id UUID, channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  method VARCHAR(20) NOT NULL DEFAULT 'automated',
  validated_at TIMESTAMPTZ, external_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(()=>{});

await pool.query(`CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY, channel VARCHAR(20), created_at TIMESTAMPTZ DEFAULT NOW()
)`).catch(()=>{});

await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS wellhub_id TEXT`).catch(()=>{});
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_plan TEXT`).catch(()=>{});
await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS source TEXT`).catch(()=>{});
await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_wellhub_id ON users(wellhub_id)`).catch(()=>{});
```

- [ ] **Step 2: Trigger de `booked_spots`.** Crear función + triggers que recalculan `channel_inventory.booked_spots` desde el COUNT real de `bookings` activas por `(class_id, channel)` en INSERT/UPDATE/DELETE. Idempotente (`CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`).

```js
await pool.query(`CREATE OR REPLACE FUNCTION fn_update_channel_inventory() RETURNS TRIGGER AS $$
DECLARE cid UUID; ch VARCHAR(20);
BEGIN
  cid := COALESCE(NEW.class_id, OLD.class_id); ch := COALESCE(NEW.channel, OLD.channel);
  IF ch IS NULL OR ch = 'app' THEN RETURN NULL; END IF;
  UPDATE channel_inventory SET booked_spots = (
    SELECT COUNT(*) FROM bookings b WHERE b.class_id = cid AND b.channel = ch
      AND b.status NOT IN ('cancelled','no_show')
  ), updated_at = NOW() WHERE class_id = cid AND channel = ch;
  RETURN NULL;
END; $$ LANGUAGE plpgsql`).catch((e)=>console.warn("[schema] inv fn", e.message));
await pool.query(`DROP TRIGGER IF EXISTS trg_channel_inventory ON bookings`).catch(()=>{});
await pool.query(`CREATE TRIGGER trg_channel_inventory AFTER INSERT OR UPDATE OR DELETE ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_update_channel_inventory()`).catch(()=>{});
```

- [ ] **Step 3: Seed setting de precio.** `INSERT ... ON CONFLICT DO NOTHING` en `settings` para `wellhub_class_price = 170` (respetar el formato que usa Alma para settings — revisar cómo se guardan otros settings antes).

- [ ] **Step 4: Verificar arranque.** Run: `node --check server/index.js`. Deploy y confirmar en logs que no hay errores de schema.

- [ ] **Step 5: Commit.** `feat(wellhub): schema (credenciales, inventario, mappings, checkins, idempotencia)`

---

## FASE 2 — Librería núcleo (unit-testable)

### Task 2: Verificación de firma HMAC-SHA1

**Files:** Create `server/lib/wellhub/signature.js`, `server/lib/wellhub/signature.test.js`.

- [ ] **Step 1: Test primero.** `signature.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { verifyWellhubSignature, extractSignatureHeader } from "./signature.js";

test("firma válida (hex minúsculas)", () => {
  const body = Buffer.from('{"a":1}'); const secret = "s3cr3t";
  const crypto = require("crypto"); // o import
  const sig = crypto.createHmac("sha1", secret).update(body).digest("hex");
  assert.equal(verifyWellhubSignature(body, sig, secret), true);
});
test("acepta MAYÚSCULAS y prefijo sha1=", () => { /* mismo hmac, .toUpperCase() y 'sha1='+sig */ });
test("firma inválida => false", () => { assert.equal(verifyWellhubSignature(Buffer.from("x"), "deadbeef", "s"), false); });
test("sin secret => null (omitir, no rechazar)", () => { assert.equal(verifyWellhubSignature(Buffer.from("x"), "aa", ""), null); });
```

- [ ] **Step 2: Implementar.** `signature.js`: `verifyWellhubSignature(rawBody, headerSig, secret)` — normaliza (`replace(/^sha1=/i,'').toLowerCase()`), calcula HMAC-SHA1, compara `crypto.timingSafeEqual` (mismo largo). Retorna `null` si no hay secret. `extractSignatureHeader(headers)` — primer header presente de la lista (`x-gympass-signature`, `x-api-signature`, `x-wellhub-signature`, `x-hub-signature`, `x-signature`).

- [ ] **Step 3: Run** `node --test server/lib/wellhub/signature.test.js` → PASS.
- [ ] **Step 4: Commit.** `feat(wellhub): verificación de firma HMAC-SHA1 + tests`

### Task 3: Parseo de payload

**Files:** Create `server/lib/wellhub/payload.js` + `.test.js`.

- [ ] **Step 1: Tests** para: `extractGymId(payload)` (busca `event_data.slot.gym_id` y variantes), `extractBookingNumber`, `extractSlot`, `computeEventId(eventType, payload)` (determinístico), `checkinWindow(payload, now)` (respeta `expires_at` epoch; respaldo 90 min).
- [ ] **Step 2: Implementar** los extractores tolerando variantes de estructura (`event_data`, `data`, anidados).
- [ ] **Step 3: Run tests** → PASS. **Step 4: Commit.**

### Task 4: Pricing

**Files:** Create `server/lib/wellhub/pricing.js` + `.test.js`.

- [ ] **Step 1: Test:** `resolveWellhubPrice(settingValue)` → número; default 170 si vacío/inválido.
- [ ] **Step 2: Implementar.** **Step 3: Run.** **Step 4: Commit.**

### Task 5: Credenciales + cliente saliente

**Files:** Create `server/lib/wellhub/credentials.js`, `server/lib/wellhub/api.js`.

- [ ] **Step 1: `getWellhubCredentials(pool)`** — `SELECT * FROM platform_credentials WHERE channel='wellhub'`; resuelve base URLs (override o default por `environment`): prod `api.partners.gympass.com`, sandbox `apitesting.partners.gympass.com` (paths `/access/v1`, `/booking/v1`).
- [ ] **Step 2: `api.js`** — `confirmWellhubBooking(creds, {bookingNumber, action})`, `rejectWellhubBooking(creds, {bookingNumber, reason})`, `validateWellhubVisit(creds, {customCode})` (Access Control `/validate`, header `X-Gym-Id`, `Authorization: Bearer access_token`), `syncCustomCode(...)`. Todas best-effort: retornan `{ok, status, data}` y **nunca lanzan** (try/catch). Usar `fetch` (Node 18+) o axios (ya en deps).
- [ ] **Step 3:** `node --check` de ambos. **Step 4: Commit.** `feat(wellhub): credenciales + cliente API saliente`

---

## FASE 3 — Webhooks y flujos

### Task 6: Router webhook + firma + idempotencia + dispatcher

**Files:** Modify `server/index.js`.

- [ ] **Step 1: Ruta raw body.** Montar `app.post("/webhooks/wellhub", express.raw({ type: "*/*" }), handler)` ANTES del parser JSON global, y añadir `/webhooks/wellhub` a la lista de paths que el parser global salta (como `/api/stripe/webhook`, líneas ~1907).
- [ ] **Step 2: Handler dispatcher.** En el handler: parsear `JSON.parse(req.body)`; `extractSignatureHeader` + `verifyWellhubSignature`; si `false` → `401 {message:"Firma Wellhub inválida"}`; aislar `gym_id`; idempotencia (`INSERT ... ON CONFLICT DO NOTHING` en `processed_events`, si 0 filas → `200 already_processed`); `switch(event_type)` → llamar flows.
- [ ] **Step 3: Endpoints legacy** `/checkin` `/cancel` `/change` `/debug/echo` (echo devuelve el body).
- [ ] **Step 4: Commit.** `feat(wellhub): webhook receiver (firma + idempotencia + dispatcher)`

### Task 7: Flujo booking-requested

**Files:** Modify `server/lib/wellhub/flows.js` (crear), `server/index.js` (wire).

- [ ] **Step 1:** `bookingRequested(pool, creds, payload)`:
  1. Mapear a clase local por `partner_class_mappings` (external_slot_id). Sin match → `rejectWellhubBooking(CLASS_NOT_FOUND)` + `200`.
  2. `findOrCreateWellhubUser(pool, payload)` (por `wellhub_id`).
  3. Cupo: `channel_inventory` de esa clase/`wellhub`; sin cupo → `reject CLASS_IS_FULL`.
  4. `INSERT INTO bookings (... channel='wellhub', external_ref=bookingNumber, status='confirmed')`.
  5. **Crear orden** `payment_method='wellhub'`, `channel='wellhub'`, `total_amount=wellhub_class_price`, `status='approved'`.
  6. `confirmWellhubBooking(reserve)`. WhatsApp opcional (no bloquea).
- [ ] **Step 2:** Wire desde el dispatcher. **Step 3:** `node --check`. **Step 4: Commit.**

### Task 8: Flujo check-in

**Files:** `flows.js`, `server/index.js`.

- [ ] **Step 1:** `wellhubCheckin(pool, creds, payload)`: usuario + ventana (`checkinWindow`) + 1/día (`partner_checkins` de hoy) → buscar reserva por `external_ref`, si no la de hoy, si no crear al vuelo → `INSERT partner_checkins(status='pending')` → `validateWellhubVisit`; OK → `confirmed` + `bookings.status='checked_in'` + crear orden si falta; falla → `failed`.
- [ ] **Step 2: Wire. Step 3: check. Step 4: Commit.**

### Task 9: Cancelaciones + cambio de plan

**Files:** `flows.js`, `server/index.js`.

- [ ] **Step 1:** `wellhubCancel(pool, payload, {late})` — buscar por `external_ref`, `status='cancelled'`, `partner_metadata.late_cancel=late`. El trigger libera cupo.
- [ ] **Step 2:** `wellhubPlanChange(pool, payload)` — `UPDATE users SET platform_plan` por `wellhub_id`; si 0/cancelled/paused → cancelar reservas futuras Wellhub del usuario + borrar custom code.
- [ ] **Step 3: Wire + check + Commit.**

### Task 10: Hook de check-in local

**Files:** Modify `server/index.js` (`PUT /api/bookings/:id/check-in`, ~13414).

- [ ] **Step 1:** Tras marcar `checked_in`, si `booking.channel==='wellhub'`, llamar `validateWellhubVisit` (best-effort, fuera de la transacción, nunca lanza) y registrar en `partner_checkins`.
- [ ] **Step 2: check + Commit.**

---

## FASE 4 — Endpoints de gestión

### Task 11: Config (settings)
**Files:** `server/index.js`.
- [ ] `GET /api/partners/settings` (adminMiddleware) → fila `platform_credentials`. `PUT` → upsert (reenvía fila completa). **Commit.**

### Task 12: Publicar clases + mapping
**Files:** `server/index.js`.
- [ ] `POST /api/partners/wellhub/publish/:classId {quota, externalSlotId}` → upsert `channel_inventory(max_spots=quota)` + `partner_class_mappings(external_slot_id)`. `POST .../unpublish/:classId` → borrar. `GET .../wellhub/class-status/:classId`. **Commit.**

### Task 13: Check-ins + summary
**Files:** `server/index.js`.
- [ ] `GET /api/partners/checkins` (lista con join a users/clases), `POST /api/partners/checkins/:id/confirm` (manual), `GET /api/partners/summary` (conteo mes por canal). **Commit.**

---

## FASE 5 — Crons

### Task 14: Reconcile inventario (5 min)
**Files:** `server/index.js` (nuevo `setInterval`, junto a ~15818).
- [ ] Cada 5 min: recalcular `booked_spots` desde COUNT real + `current_bookings` de la clase + push `syncPartnerAvailability` (si aplica). `node --check`. **Commit.**

### Task 15: Resumen diario (23:40)
**Files:** `server/index.js`.
- [ ] Loop que a las 23:40 (hora MX) envía a Wellhub los check-ins `confirmed` del día (URL en `extra_config`). **Commit.**

---

## FASE 6 — Frontend (panel)

### Task 16: Página Plataformas
**Files:** Create `src/pages/admin/settings/PartnerPlatforms.tsx`; Modify `src/App.tsx` (ruta `/admin/settings/platforms`).
- [ ] Form Wellhub (switch enabled, environment, gym_id, access_token, webhook_secret, 3 base URLs, precio, extra_config). `GET/PUT /api/partners/settings`. Patrón shadcn + AuthGuard + AdminLayout como otras páginas admin. `npx tsc --noEmit`. **Commit.**

### Task 17: Control por clase en el calendario
**Files:** Create `src/pages/admin/classes/WellhubClassControl.tsx`; Modify `ClassesCalendar.tsx` (usar dentro del sheet de la clase).
- [ ] Publicar/despublicar + cupo + `external_slot_id`. Usa publish/unpublish/class-status. `tsc`. **Commit.**

### Task 18: Página de check-ins de convenio
**Files:** Create `src/pages/admin/bookings/PartnerCheckins.tsx`; Modify `App.tsx` (ruta).
- [ ] Lista `GET /api/partners/checkins` + confirmación manual. `tsc`. **Commit.**

---

## FASE 7 — Activación

### Task 19: Alta en el gateway + prueba en producción
- [ ] En Railway (proyecto `wellhub-gateway`): agregar `"<gym_id_alma>":"https://<backend-alma>"` a `GYM_ROUTES`. (Requiere el `gym_id` de Alma y la URL del backend.)
- [ ] En el panel `/admin/settings/platforms`: cargar credenciales reales + `is_enabled=true`.
- [ ] Publicar clases con cupo + mapear slots.
- [ ] Prueba: `POST /webhooks/wellhub/debug/echo`, luego `booking-requested` y `checkin` reales; verificar orden creada + check-in validado.

---

## Self-Review
- Cobertura del spec: schema, firma, idempotencia, los 4 flujos, hook check-in, gestión, crons, panel, gateway, dinero (orden por visita) → todos con tarea. ✓
- Consistencia de tipos: `channel='wellhub'`, `external_ref=bookingNumber`, `payment_method='wellhub'` usados igual en flows y orden. ✓
- Riesgos anotados: mapping obligatorio (sin él booking-requested rechaza), trigger es la fuente de `booked_spots`, precio real a confirmar.

## Notas de ejecución
- TDD real solo aplica a los módulos lib (firma, payload, pricing). Los endpoints/flow se validan con `node --check` + prueba en sandbox/echo (Alma no tiene harness de integración HTTP).
- Confirmar con el dueño antes de la Fase 7: `gym_id` real de Alma, URL del backend, precio de convenio real.
