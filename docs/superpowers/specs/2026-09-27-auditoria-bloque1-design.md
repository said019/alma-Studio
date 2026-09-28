# Auditoría de producción — Bloque 1: arreglos técnicos

**Fecha:** 2026-09-27 · **Rama:** `hive-auditoria-b1` (desde `hive` en 266772c, lo que está en producción).

**Origen:**
- Auditoría productiva de www.almamovement.com.mx del 27 sep 2026 ("Reporte de auditoría" y "Cobertura de escenarios", compartidos por el usuario).
- Los ids P0-x, P1-x y los de escenario (A5, F2…) son los del reporte.
- La auditoría trató el sitio como "Alma Movement" y marcó la marca HIVE como defecto (P1-3). **No se atiende**: el rebrand a HIVE es intencional.

**Alcance:** los 9 arreglos que no necesitan decisiones del estudio.
- **Bloque 2:** bitácora de auditoría, y cambiar borrados duros por anonimización.
- **Bloque 3:** cuota de cancelaciones, lista de espera, Wellhub, aviso de privacidad y reembolsos.
- Ambos van en sus propias ramas.

**Principio:** no cambia ningún dato existente en producción. Donde un valor se "corrige" (membresías vencidas, pagos), se calcula en la consulta. Las columnas nuevas se agregan con `ADD COLUMN IF NOT EXISTS` en `ensureSchema()`.

---

## 1. Claves de Wellhub fuera del navegador (P0-2 · L8)

**Hoy:**
- `GET /api/partners/settings` (`server/index.js` ~2199) hace `SELECT *` y devuelve `webhook_secret` y `access_token` en claro.
- Lo hace para cualquier rol de operación (`adminMiddleware`: admin, super_admin, instructor, reception).
- `PUT` reescribe la fila completa y devuelve los secretos.
- La pantalla `PartnerPlatforms.tsx` los carga en inputs de texto y los reenvía completos al guardar.
- Si `webhook_secret` está vacío, el webhook se acepta **sin verificar la firma** (~2151).

**Diseño:**
- **Permisos:** `GET` y `PUT /api/partners/settings` pasan a `ownerMiddleware` (admin, super_admin).
- **Respuesta del GET:** nunca incluye los valores. Por cada secreto trae `webhook_secret: "••••<últimos 4>"` (o `null` si no hay) y `has_webhook_secret: boolean`. Lo mismo para `access_token`.
- **PUT:** si `webhook_secret` o `access_token` llegan ausentes, vacíos o iguales al valor enmascarado, **se conserva el valor guardado**; sólo un valor nuevo lo reemplaza. La respuesta viene enmascarada igual que el GET.
- **Webhook:** si la integración está encendida (`is_enabled`) y no hay `webhook_secret`, se rechaza con 401 y un aviso en el log. Si está apagada, se ignora como hoy.
- **Panel:**
  - Los dos campos pasan a `type="password"`, vacíos, con marcador "•••• a1b2 · déjalo vacío para no cambiarlo".
  - Al guardar sólo se envían si el usuario escribió algo.
- **Fuera:** cifrado en reposo (necesita manejo de llaves) y rotación de las claves con Wellhub (la hace el usuario).

## 2. WhatsApp honesto (P0-1 · C5 · H2 · H3 · H10)

**Hoy:**
- `PUT /api/classes/:id/cancel` dispara `notifyByTemplate` sin esperar y suma `waSent++` por cada reserva: cuenta intentos, no envíos.
- El panel lo muestra como "N WhatsApps".
- El cron de recordatorios registra `status='ok'` sin mirar el resultado.
- Nada avisa que WhatsApp está desconectado.

**Diseño:**
- **Helper `whatsappChannelState()`:**
  - Consulta el estado de Evolution con la misma lógica de `/api/evolution/status`, extraída a una función reutilizable.
  - Cachea el resultado 60 s.
  - Devuelve `{ connected: boolean, state }`.
- **Cancelar clase:**
  - Antes de avisar, lee el estado del canal y si `whatsapp_reminders` está encendido.
  - **Canal desconectado o WhatsApp apagado:** no intenta enviar. Responde `wa_queued: 0`, `wa_failed: N` y `wa_unreached: [{ user_id, display_name, phone }]`, con las alumnas a las que hay que avisar a mano.
  - **Canal conectado:** encola como hoy y responde `wa_queued: N`, `wa_failed: 0`, `wa_unreached: []`.
  - `wa_sent` se elimina de la respuesta.
- **Toast del panel** (`BookingsList.tsx` ~308):
  - Canal conectado: "N reservas canceladas · N créditos devueltos · aviso por WhatsApp en cola para N".
  - Con fallas: un aviso de error que dice "No se pudo avisar a N alumnas (WhatsApp desconectado)" y muestra la lista (nombre y teléfono) en un diálogo, para avisar a mano.
- **Banner del panel:**
  - Se muestra en `AdminTopBar`, en todo el panel, cuando `GET /api/evolution/status` dice desconectado **y** `whatsapp_reminders` está encendido.
  - Texto: "WhatsApp desconectado: los avisos y recordatorios no están saliendo." con liga a Configuración → WhatsApp.
  - Se revisa al cargar el panel y cada 5 min.
  - Sólo lo ven admin y super_admin.
- **Recordatorios automáticos** (`runClassReminderCron`):
  - Si el canal está desconectado, no intenta y registra `status='skipped_disconnected'`.
  - Si intenta, registra el resultado real de `notifyByTemplate`: `ok` si `sent`; `failed` con el motivo si no.
  - La deduplicación sólo cuenta los `ok`, para que un recordatorio fallido pueda reintentarse en el siguiente ciclo si aún está dentro de la ventana.
- **Fuera:** cola durable con reintentos y acuse por mensaje (Bloque 2 o 3).

## 3. Responsiva en todas las vías (P1-2 · A5 · B13 · EC43)

**Hoy:**
- Sólo `POST /api/bookings` exige una fila en `waivers` (`WAIVER_REQUIRED`).
- `POST /api/admin/bookings/assign` y `POST /api/bookings/with-guest` (la anfitriona) crean reservas sin revisarla.
- `POST /api/me/waiver` acepta cualquier `signature_data`, incluida una PNG de 1×1 px.

**Diseño:**
- **Helper `hasSignedWaiver(client, userId)`:** usado por las tres vías.
- **`POST /api/bookings/with-guest`:** la anfitriona debe tener responsiva → 403 `WAIVER_REQUIRED`. La invitada sigue con su casilla `acceptedWaiver`.
- **`POST /api/admin/bookings/assign`:**
  - Si la clienta no tiene responsiva → 403 `WAIVER_REQUIRED`, salvo que el cuerpo traiga `waiverOverride: { reason }`, con motivo de al menos 5 caracteres.
  - Con override se crea la reserva y se guardan en ella `waiver_override_reason`, `waiver_override_by` (quién asignó) y `waiver_override_at`: tres columnas nuevas en `bookings`.
- **Fuera:** Wellhub (`server/lib/wellhub/flows.js`), porque sus usuarias llegan del agregador sin cuenta, y la visita walk-in, que es de invitadas y ya lleva su casilla.
- **Panel, al asignar** (`BookingsList.tsx`):
  - Si la respuesta es `WAIVER_REQUIRED`, el diálogo muestra "Esta clienta no ha firmado su responsiva".
  - Ofrece una casilla "Firmará en recepción" con un campo de motivo obligatorio y un botón "Asignar de todos modos", que reintenta con `waiverOverride`.
- **Firma mínima en `POST /api/me/waiver`:**
  - Se rechaza (400) si `signature_data` no es un `data:image/png;base64,…` válido.
  - También si pesa menos de 1,000 caracteres de base64, o si el PNG mide menos de 50 × 20 px (ancho y alto leídos de la cabecera IHDR).

## 4. Identificadores inválidos dan 400 (P1-11 · L5)

**Hoy:**
- `POST /api/bookings` sólo revisa que `classId` exista. Un texto que no es UUID revienta en Postgres y responde 500.
- El validador `UUID_RE` sólo corre para parámetros de ruta (`app.param`).
- Hay dos copias sueltas del regex (~13915 y ~14004).

**Diseño:**
- **Helper exportado `isUuid(value)`** en `server/lib/validate.js`, usado por `app.param` y por las rutas que reciben ids en el cuerpo:
  - `POST /api/bookings` (`classId`).
  - `POST /api/admin/bookings/assign` (`classId`, `userId`).
  - `POST /api/bookings/with-guest` (`classId`).
  - Un id inválido → 400 "Identificador inválido".
- Las dos copias sueltas se reemplazan por `isUuid`.

## 5. Check-in con una sola regla (P0-5 · F2 · F5)

**Hoy:**
- El check-in manual (`PUT /api/bookings/:id/check-in`) acepta cualquier estado de reserva y cualquier fecha.
- El QR (`POST /api/admin/checkin/scan`) exige hoy y reserva confirmada.
- Ninguno guarda quién (`bookings.checked_in_by` existe y nunca se escribe).
- Los puntos de lealtad están duplicados en las dos rutas.

**Diseño:**
- **`checkinRule(booking, klass, now)`**, una función pura en `server/lib/checkin.js`. Devuelve `{ ok: true }` o `{ ok: false, code, message }`:
  - Reserva `cancelled`, `waitlist` o `no_show` → `BOOKING_NOT_ACTIVE`, "La reserva no está activa".
  - Clase cancelada → `CLASS_CANCELLED`, "La clase fue cancelada".
  - Clase de otro día, en la zona del estudio → `NOT_TODAY`, "La clase es de otro día (<fecha>)".
  - Faltan más de 90 min para el inicio → `TOO_EARLY`, "El check-in abre a las <hora>".
  - Sin límite al final del día, para poder marcar después de la clase.
- **Ambas rutas usan la regla:**
  - Rechazo → 409 con `code` y `message`.
  - Una reserva ya registrada responde como hoy (`already` / idempotente), sin repetir puntos.
- **Actor:** las dos escriben `checked_in_by = req.userId`.
- **Puntos:** un solo helper `awardCheckinPoints(client, booking)` compartido.
- **Panel:** "Pasar lista" y la lista de la clase muestran el `message` del 409 en el toast de error.

## 6. No sacar a la admin por límite de velocidad (P1-4 · L4)

**Hoy:**
- `authStore.checkAuth()` borra el token ante **cualquier** error de `GET /auth/me`: 429, 500 o red. Los guardias te mandan al login.
- El limitador de `/api` es por IP (180/min), compartido por todo el estudio en la misma red.

**Diseño:**
- **Frontend (`checkAuth`):**
  - Sólo un 401 borra el token y la sesión.
  - Ante 429, 5xx o error de red, conserva token y usuaria.
  - Reintenta hasta 3 veces con pausa (respeta `Retry-After`, o 1 s, 2 s, 4 s).
  - Si agota los reintentos, deja `isLoading: false` con el estado previo, sin cerrar sesión.
  - Los guardias sólo redirigen al login si no hay token o si la respuesta fue 401.
- **Servidor:**
  - El limitador general de `/api` usa como llave el id de la usuaria cuando la petición trae un JWT válido, con límite de 600/min (configurable con `API_RATE_LIMIT_USER_MAX`).
  - Sin JWT, la llave sigue siendo la IP con el límite actual.
  - El limitador de `/auth/login`, `/register`, etc. no cambia.

## 7. Membresías vencidas no cuentan como activas (P1-6 · D5 · K3)

**Hoy:**
- Ningún proceso cambia `status` al vencer.
- `GET /api/admin/stats` y el reporte cuentan `status='active'` sin mirar `end_date`.
- `GET /api/memberships/my` puede devolver una vencida como la actual.

**Diseño (sin tocar datos):**
- **Conteos de activas en dashboard y reportes:** `status='active' AND (end_date IS NULL OR end_date >= CURRENT_DATE)`, en la zona del estudio igual que el resto.
- **`GET /api/memberships/my`:**
  - Prioriza las vigentes, con el mismo filtro de fecha.
  - Si sólo existe una vencida, la devuelve con `isExpired: true`.
  - El Inicio y el Perfil de la app muestran "Vencida" (en lugar de "Activa") cuando `isExpired`.
- **Lista de membresías del panel:** el filtro "Activas" aplica el mismo criterio.

## 8. Pagos contados dos veces (P1-7 · K1)

**Hoy:** `GET /api/payments` une órdenes aprobadas con membresías activas. La membresía que nació de una orden (`memberships.order_id`) aparece dos veces y el total la suma doble.

**Diseño:**
- La parte de membresías excluye las que tienen `order_id` (`AND m.order_id IS NULL`).
- Los reportes de ingresos no cambian: sólo suman órdenes y no estaban afectados.

## 9. Alerta de salud en la lista de clase (P1-8 · J2 · A4)

**Hoy:** `users.has_injury`, `users.injury_details`, `users.health_notes` y `guest_profiles.has_injury` / `injury_details` existen, pero ni `GET /api/admin/today-roster` ("Pasar lista") ni `GET /api/classes/:id/roster` los devuelven.

**Diseño:**
- **Las dos rutas agregan por fila:**
  - `has_injury`, `injury_details` y `health_notes`: de la usuaria, o de la invitada si es reserva de invitada.
  - `first_visit`: `true` si la persona no tiene ninguna reserva previa con `checked_in_at`.
- **Panel** (`TodayAttendance.tsx`, lista de la clase en `BookingsList.tsx`):
  - Marca **"Lesión"** (tono de peligro) si `has_injury` o hay notas de salud. Al tocarla, un popover muestra el detalle y las notas.
  - Marca **"Primera vez"** (tono de atención) si `first_visit`.
- **Tipos:** `src/lib/today-roster.ts` suma los campos.
- **Quién lo ve:** los mismos roles de hoy.

---

## Pruebas

Cada arreglo lleva su prueba en rojo primero:
- **Servidor:** pruebas unitarias con `node:test` para las funciones puras nuevas (`server/*.test.mjs`, en el glob de `npm test`): `checkinRule`, `isUuid`, el enmascarado de secretos y la validación de la firma. Las rutas se prueban en `server/tests/*.test.mjs` contra una base desechable (la regresión de 65; se agregan casos):
  - Partners GET sin secretos y PUT que conserva.
  - Assign sin responsiva → 403, y con override → 201 y columnas llenas.
  - Check-in de otro día → 409.
  - `classId` basura → 400.
  - Payments sin duplicado.
  - Stats sin vencidas.
  - Roster con `has_injury`.
- **Frontend:** vitest para:
  - `checkAuth`: 429 no cierra sesión; 401 sí.
  - Los toasts de cancelar clase.
  - El banner de WhatsApp.
  - El diálogo de override de responsiva.
  - Las marcas "Lesión" y "Primera vez".
- **Verificación:**
  - `npm test` completo, tsc y build con Node 20.
  - La regresión del servidor en base desechable.
  - Un barrido en navegador del panel (Pasar lista, lista de clase, Configuración → Wellhub, cancelar clase con WhatsApp desconectado) con datos sintéticos en base desechable.

## Fuera de alcance

- La marca (P1-3): HIVE es intencional.
- Bloque 2: bitácora `audit_log`, y borrados duros → cancelar y anonimizar.
- Bloque 3: cuota de cancelaciones, promoción de lista de espera, encender o apagar Wellhub, aviso de privacidad, reembolsos.
- Reconectar WhatsApp, que necesita el número de HIVE, y rotar las claves de Wellhub: los hace el usuario.
- Datos de producción de las pruebas de la auditoría (responsiva de prueba de Said, `cancellations_used`): sólo con permiso explícito.
