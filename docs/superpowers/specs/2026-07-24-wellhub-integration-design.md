# Integración Wellhub (Gympass) para Alma — Spec de diseño

> Fecha: 2026-07-24. Portar la integración Wellhub (construida originalmente para
> Essenza/Balance Room en TypeScript) al monolito JavaScript de Alma
> (`server/index.js`). Referencia de origen: `WELLHUB_INTEGRATION.md` (raíz del
> workspace).

## Goal

Permitir que socios de Wellhub reserven y hagan check-in en clases de Alma:
Wellhub envía webhooks → Alma confirma reservas, valida visitas contra la API de
Wellhub, y registra cada visita como ingreso de convenio. Todo activable en
**producción** con las credenciales que el estudio ya tiene.

## Decisiones tomadas (con el dueño)

1. **Producción**: hay `gym_id`, `webhook_secret` y `access_token` de producción.
2. **Todo de una**: se implementa la integración completa (no MVP por fases),
   pero por tareas bite-size con un plan.
3. **Dinero**: cada visita Wellhub crea una **orden** con `payment_method='wellhub'`
   al precio de convenio (setting `wellhub_class_price`, default **170**). Alma NO
   tiene el sistema de "caja"/`sales` de Essenza; se usa `orders` (que ya tiene
   `payment_method` y `channel`).

## Contexto de Alma (verificado)

- Backend: monolito `server/index.js` (ESM, JS). Migraciones inline con
  `CREATE/ALTER TABLE IF NOT EXISTS` al arrancar.
- Raw body: patrón Stripe reutilizable — `express.raw({type:"application/json"})`
  en la ruta del webhook + el parser JSON global la salta (como `/api/stripe/webhook`).
- Crons: `setInterval` (no node-cron). Ya hay loops programados (~líneas 15818/15848).
- Check-in: `PUT /api/bookings/:id/check-in` (adminMiddleware) — punto de hook.
- `orders` tiene `channel` y `payment_method`. `bookings` NO tiene `channel`/`external_ref` (se agregan).
- No existe NADA de partners/wellhub hoy (scaffolding desde cero).

## Arquitectura

Una reserva Wellhub = fila en `bookings` con `channel='wellhub'`, `external_ref =
bookingNumber`. El resto de la app la trata como reserva normal, con reglas extra.

Alma se suma al **gateway compartido** (`wellhub-gateway`, proyecto Railway del
dueño): Wellhub apunta al gateway; el gateway enruta por `gym_id` a cada backend.
Activar Alma = agregar `"<gym_id_alma>": "https://<backend-alma>"` a la variable
`GYM_ROUTES` del gateway. No se contacta a Wellhub por studio.

## Modelo de datos (nuevo)

Todo vía `CREATE/ALTER TABLE IF NOT EXISTS` en `ensureSchema` de Alma.

- **`platform_credentials`** (una fila por canal; aquí `'wellhub'`):
  `channel` PK, `environment` ('sandbox'|'production'), `is_enabled` bool,
  `gym_id`, `webhook_secret`, `access_token`, `api_base_url`, `booking_base_url`,
  `access_base_url` (overrides opcionales), `webhook_url` (informativo),
  `extra_config` JSONB, timestamps.
- **`bookings`** columnas nuevas: `channel VARCHAR(20) DEFAULT 'app'`,
  `external_ref TEXT`, `partner_metadata JSONB`, `partner_status TEXT`,
  `partner_reported_at TIMESTAMPTZ`. Índice único parcial
  `(channel, external_ref) WHERE channel <> 'app' AND external_ref IS NOT NULL`.
- **`channel_inventory`** (`class_id`, `channel`, `max_spots`, `booked_spots`,
  único `(class_id, channel)`). `booked_spots` lo mantiene un **trigger** en
  INSERT/UPDATE/DELETE de `bookings` (el código NO suma/resta a mano).
- **`partner_class_mappings`** (`class_id`, `channel`, `external_class_id`,
  `external_slot_id`, único `(class_id, channel)`).
- **`partner_checkins`** (`id`, `booking_id`, `user_id`, `channel`, `status`
  ['pending'|'confirmed'|'failed'], `method` ['automated'|'manual'],
  `validated_at`, `external_response` JSONB, `created_at`).
- **`processed_events`** (`event_id` único, `channel`, `created_at`) — idempotencia.
- **`users`** columnas: `wellhub_id TEXT`, `platform_plan TEXT`, `source TEXT`.
- **Setting** `wellhub_class_price` (default 170) en la tabla `settings`.

## Backend

### Webhook entrante
`POST /webhooks/wellhub` (sin authMiddleware; se valida por firma). Montar antes
del parser JSON global usando `express.raw`. Pasos:
1. Verificar **firma HMAC-SHA1** del raw body con `webhook_secret`:
   normalizar hex (mayúsculas, prefijo `sha1=`), comparación timing-safe,
   aceptar el primer header presente de: `X-Gympass-Signature`, `X-API-Signature`,
   `X-Wellhub-Signature`, `X-Hub-Signature`, `X-Signature`. Sin secret → se omite
   firma (solo filtro gym_id) — advertir en logs.
2. **Aislamiento por `gym_id`**: extraer del payload (`event_data.slot.gym_id` y
   variantes); si difiere del configurado, rechazar.
3. **Idempotencia**: calcular `event_id`, `INSERT ... ON CONFLICT DO NOTHING` en
   `processed_events`; si ya existía → `200 {status:"already_processed"}`.
4. Enrutar por `event_type`:
   - `booking-requested` → flujo reserva.
   - `checkin` / `checkin-booking-occurred` → flujo check-in.
   - `booking-canceled` / `booking-late-canceled` → flujo cancelación.
   - otro → `200 {status:"ignored"}`.
- Legacy: `POST /webhooks/wellhub/checkin`, `/cancel`, `/change`, `/debug/echo`.

### Salientes a la API de Wellhub
Helper con `access_token` + header `X-Gym-Id`. Base URLs por `environment`
(prod `api.partners.gympass.com`, sandbox `apitesting.partners.gympass.com`):
- `confirmWellhubBooking` (Booking API `reserve`/`reject`).
- `validateWellhubVisit` (Access Control `/access/v1/validate`, usa `customCode`
  del wallet del usuario).
- sync del custom code del wallet hacia Wellhub (best-effort).

### Flujos
- **booking-requested** (ventana ~15 min): firma+idempotencia → mapear a clase
  local (`partner_class_mappings`); si no existe → `reject CLASS_NOT_FOUND` →
  find/create usuario Wellhub (`wellhub_id`) → verificar cupo de canal; sin cupo
  → `reject CLASS_IS_FULL` → crear `bookings` (`channel='wellhub'`,
  `external_ref=bookingNumber`) → **crear orden `payment_method='wellhub'` a
  `wellhub_class_price`** → `confirmWellhubBooking(reserve)` → recalcular
  disponibilidad + WhatsApp opcional (no bloquean).
- **checkin**: firma+idempotencia → usuario + timestamp → **ventana** (respeta
  `expires_at`; respaldo ~90 min) → **1 check-in/día** por usuario/canal → buscar
  reserva por `external_ref`, si no la de hoy, si no crear al vuelo → fila
  `partner_checkins` → `validateWellhubVisit`; falla → `failed`; OK → `confirmed`
  + `bookings.status='checked_in'` + crear orden si falta → sync custom code.
- **cancelaciones**: buscar por `external_ref` → cancelar local → liberar cupo
  (trigger) → si tardía, `partner_metadata.late_cancel=true`.
- **cambio/baja de plan** (`/change`, `/cancel`): actualizar `users.platform_plan`
  por `wellhub_id`; si queda 0/cancelled/paused → borrar custom code + cancelar
  reservas futuras.

### Hook de check-in local
En `PUT /api/bookings/:id/check-in`: si la reserva es `channel='wellhub'`, reflejar
la visita a Wellhub (`validateWellhubVisit`) — para check-ins hechos en recepción/QR.
Best-effort, nunca lanza.

### Endpoints de gestión (adminMiddleware)
- `GET /api/partners/settings`, `PUT /api/partners/settings` (config, reenvía fila completa).
- `POST /api/partners/wellhub/publish/:classId {quota, externalSlotId}`,
  `POST .../unpublish/:classId`, `GET .../wellhub/class-status/:classId`.
- `POST /api/partners/checkins/:id/confirm` (confirmación manual).
- `GET /api/partners/summary` (conteo del mes por canal).

### Crons (setInterval, junto a los existentes)
- **reconcile inventario** cada 5 min: recalcular `booked_spots`/`current_bookings`
  desde el COUNT real + push de disponibilidad.
- **resumen diario** 23:40: enviar a Wellhub los check-ins confirmados del día
  (URL en `extra_config`). Sin cron de refresco de token (es estático).

## Frontend (panel admin, React + shadcn)

- **`/admin/settings/platforms`** (`PartnerPlatforms`): form Wellhub —
  `is_enabled` switch, `environment`, `gym_id`, `access_token`, `webhook_secret`,
  3 base URLs, `wellhub_class_price`, `extra_config` (JSON). Carga/guarda con
  `GET/PUT /api/partners/settings`.
- **En `ClassesCalendar.tsx`**: control por clase (`WellhubClassControl`) —
  publicar/despublicar a Wellhub + cupo + mapear `external_slot_id`. Usa
  publish/unpublish/class-status.
- **`/admin/bookings/partners-checkins`**: lista de check-ins Wellhub + estado de
  validación + botón de confirmación manual.

## Activación (gateway)

Agregar el `gym_id` de Alma a `GYM_ROUTES` del servicio `wellhub-gateway` en
Railway, apuntando a la URL del backend de Alma. Verificar con un POST de prueba
(un `401 firma inválida` desde el backend confirma que el ruteo llega).

## Precio / dinero

Cada visita → orden `payment_method='wellhub'` a `wellhub_class_price` (default
170, configurable en el panel). Aparece en reportes de ingresos como método aparte.
No afecta memberships ni efectivo.

## Seguridad

- Firma HMAC-SHA1 obligatoria en producción (advertir si falta secret).
- Aislamiento por `gym_id` (defensa en profundidad; el gateway ya rutea por gym_id).
- Idempotencia por `event_id`.
- Endpoints de gestión bajo `adminMiddleware`.

## Fuera de alcance (por ahora)

- Dashboard card dedicada de "Reservas Wellhub" (se ve vía página de check-ins).
- TotalPass (el modelo es multi-canal, pero solo se implementa Wellhub).
- Refresco automático de `access_token` (es estático en Wellhub).

## Riesgos / notas

- **Mapeo clase↔slot**: sin `external_slot_id` mapeado, booking-requested siempre
  rechaza. La UI de publicar debe permitir capturarlo por clase.
- **Trigger de inventario**: la fuente de verdad de `booked_spots` es el trigger;
  el código nunca lo toca a mano (doble conteo).
- **Precio real de convenio**: confirmar con el dueño el monto real (default 170).
- **Zona horaria / ventanas**: check-in respeta `expires_at`; respaldo 90 min.
