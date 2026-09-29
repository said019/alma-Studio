# Auditoría de producción — Bloque 2: bitácora y sin borrados duros

**Fecha:** 2026-09-28 · **Rama:** `hive-auditoria-b2` (desde `main` en d1a974c, con el bloque 1 ya fusionado).

**Origen:**
- Auditoría productiva de www.almamovement.com.mx del 27 sep 2026 (`.superpowers/auditoria-prod-2026-09-27.md`): P0-3 [E2 · D12 · I5 · I8] y P1-5 [I6 · A9 · EC15].
- Pedido del dueño: que recepción corrija una falta marcada por error el mismo día.
- La cobertura escenario por escenario del 27 sep no está en el checkout (sólo la del 8 sep en `auditoria-estudio/cobertura.md`, que no trae EC15); se usa la descripción de P1-5.

**Alcance:**
- Bitácora `audit_log` con actor, fecha, motivo y antes/después, y su pantalla para la dueña.
- Motivo obligatorio en ventas manuales a precio distinto o en $0, en ajustes de saldo, vigencia o estado, y en la cancelación de reservas por el estudio.
- `activated_by` y `payment_reference` en la venta manual.
- Check-in (lista y QR), falta y su corrección el mismo día, en la bitácora.
- "Limpiar semana" y borrar clase sin llevarse historial.
- Baja de clienta por anonimización.

**Principio:** no cambia ningún dato existente. Tablas y columnas nuevas sólo con `CREATE TABLE IF NOT EXISTS` y `ADD COLUMN IF NOT EXISTS` en `ensureSchema()`; nada de `UPDATE`/`DELETE` de migración. Ningún flujo nuevo borra filas de historial (reservas, órdenes, pagos, membresías).

---

## 1. Problema

**Hoy:**
- **Venta manual** (`POST /api/memberships`): crea la membresía y su orden aprobada, pero no guarda `activated_by` ni `payment_reference`. Cobra siempre el precio del plan, sin forma de registrar un descuento o una cortesía, y un plan de $0 se vende sin motivo. El panel muestra `price` aunque el servidor cobra el precio efectivo (apertura).
- **Ajustes** (`PUT /api/memberships/:id`): cambia saldo, vigencia, estado y método sin motivo ni registro. El saldo puede quedar por encima del plan ("2 de 1").
- **Check-in**: guarda `checked_in_by` (bloque 1), pero no hay bitácora. Una falta (`no_show`) no se puede corregir: `checkinRule` la rechaza y el diálogo dice que no se puede deshacer.
- **Falta**: `recordFalta` sólo suma `users.faltas_count` y, al llegar a un múltiplo del umbral, inserta una penalización en `loyalty_transactions`. No queda ligada a la reserva, así que no hay forma de revertir "esa" falta.
- **Cancelación de reserva por el estudio** (`DELETE /api/admin/bookings/:id`): el motivo es opcional y no se guarda en la reserva ni en ningún registro.
- **"Limpiar semana"** (`DELETE /api/classes/week`): sin `force` responde 409; con `force` devuelve créditos (incluso de clases que ya ocurrieron) y **borra** reservas y clases del rango. No avisa a nadie.
- **`DELETE /api/admin/classes/:id`**: borra la clase y, en cascada, sus reservas.
- **Borrar clienta** (`DELETE /api/users/:id`, cualquier rol de operación): `DELETE FROM users` se lleva en cascada membresías, reservas, órdenes, pagos y responsiva.
- **Bitácora**: no existe. La tabla `admin_actions` de `schema_complete.sql` tiene 0 usos, borra en cascada al borrar a la persona y exige `entity_id`.

## 2. Decisiones

- **Tabla nueva `audit_log`** sin llaves foráneas: sobrevive a la persona y a la fila que describe. `actor_name` y `actor_role` se copian al escribir.
- **Motivo:** al menos 5 caracteres sin contar espacios de los extremos, a lo más 500 (igual que el override de responsiva del bloque 1). Falta de motivo → 400 `REASON_REQUIRED` con "Escribe el motivo (mínimo 5 caracteres)."
- **Transacción:** en ventas, ajustes, cancelaciones, limpieza, bajas y corrección, la fila de bitácora se escribe en la misma transacción que la acción (si no se puede escribir, la acción no ocurre). En check-in, QR y marcar falta se escribe "si se puede": nunca convierte un éxito en 500.
- **Precio del plan** = precio efectivo (`resolveEffectivePrice`, con apertura).
- **Lectura de la bitácora:** sólo dueña (`ownerMiddleware`: admin, super_admin).
- **Falta ↔ reserva:** columna `bookings.falta_recorded_at`, escrita cuando `recordFalta` sí registró la falta.
- **Baja = anonimización**, sólo dueña, con el candado de hoy (membresías activas o reservas próximas → 409).

## 3. Diseño

### 3.1 Bitácora (P0-3 · I8)

**Esquema** (`ensureSchema()`, al final):

| Objeto | Definición |
|---|---|
| `audit_log` | `id UUID PK`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `actor_id UUID`, `actor_role VARCHAR(30)`, `actor_name TEXT`, `action VARCHAR(60) NOT NULL`, `entity_type VARCHAR(30) NOT NULL`, `entity_id UUID`, `subject_user_id UUID`, `reason TEXT`, `before JSONB`, `after JSONB`, `meta JSONB NOT NULL DEFAULT '{}'` |
| Índices | `(created_at DESC)`, `(entity_type, entity_id)`, `(actor_id, created_at DESC)`, `(subject_user_id, created_at DESC)` |
| `memberships` | `activated_by UUID`, `activated_at TIMESTAMPTZ`, `payment_reference VARCHAR(255)` (existen en `schema_complete.sql`; se aseguran) |
| `bookings` | `cancellation_reason TEXT`, `cancelled_by UUID`, `falta_recorded_at TIMESTAMPTZ` |
| `classes` | `cancellation_reason TEXT`, `cancelled_by UUID`, `cancelled_at TIMESTAMPTZ` |
| `users` | `anonymized_at TIMESTAMPTZ`, `anonymized_by UUID` |

**Acciones** (`action` / `entity_type`):

| Acción | Entidad | Motivo | Antes → después |
|---|---|---|---|
| `membership.sale` | membership | si es $0 o distinto al plan | después: plan, precio del plan, cobrado, método, referencia, orden, fechas, saldo |
| `membership.adjust` | membership | si cambia saldo, vigencia o estado | sólo los campos que cambian |
| `booking.checkin` | booking | — | estado; `meta.method`: `manual` o `qr` |
| `booking.no_show` | booking | — | estado; `meta.falta_recorded`, `meta.penalty_applied` |
| `booking.no_show_corrected` | booking | sí | estado y `faltas_count` |
| `booking.cancel` | booking | sí | estado; crédito devuelto, puntos revertidos |
| `class.cancel` | class | opcional (limpieza: el de la limpieza) | estado; `meta.source`: `manual` o `week_clear` |
| `class.delete` | class | — | día, hora y estado de la clase borrada |
| `class.week_clear` | class_week | si canceló reservas activas | borradas, canceladas, sin tocar; ids en `meta` |
| `user.anonymize` | user | opcional | acceso; `meta.kept` con lo conservado. **Nunca** los datos borrados |

**Módulo `server/lib/audit.js`:**
- `reasonProblem`, `cleanReason`, `changedFields`.
- `recordAudit(db, entry)`: el INSERT, con el rol y el nombre del actor leídos de `users` en el mismo INSERT.
- `recordAuditBestEffort`.
- `buildAuditQuery(query, { timezone })`: valida y arma la consulta.
- `auditRowOut`.

**Lectura:**
- `GET /api/admin/audit?entityType&entityId&actorId&action&from&to&page&limit` → `{ data: AuditEntry[], page, limit, total }`, lo más nuevo primero.
  - `entityId` busca en `entity_id` **o** `subject_user_id`: con el id de una clienta trae todo lo suyo.
  - `from`/`to` son días `AAAA-MM-DD` en la zona del estudio (inclusive).
  - `limit` de 1 a 100 (por defecto 50).
- `GET /api/admin/audit/actors` → `{ data: [{ id, name, role }] }`, para el filtro "Quién".
- Ambas con `ownerMiddleware`.

### 3.2 Venta en mostrador (P0-3 · E2)

`POST /api/memberships` acepta además `amount?`, `paymentReference?` y `reason?`:
- **`amount`:** lo cobrado. Si falta, es el precio efectivo del plan. Número ≥ 0 (acepta coma decimal), ≤ 1,000,000.
- **Cortesía** (`amount` = 0, incluido un plan de $0) o **precio distinto** (±0.01): exige `reason` → 400 `REASON_REQUIRED`:
  - "Es una cortesía ($0). Escribe el motivo (mínimo 5 caracteres)."
  - "Lo cobrado es distinto al precio del plan. …"
- **Orden:** `subtotal` = max(precio, cobrado), `discount_amount` = max(0, precio − cobrado), `total_amount` = cobrado. Los ingresos (que suman `orders.total_amount`) quedan correctos.
- **Membresía:** `activated_by` = quien vende, `activated_at` = ahora, `payment_reference` = `paymentReference` o, si no hay, el folio de la orden (`order_number`) o su id.
- **Puntos de lealtad por compra:** sobre lo cobrado (cortesía = 0).
- **Validación:** `userId`/`planId` que no son UUID → 400 "Identificador inválido"; `startDate` inválida → 400; referencia > 100 caracteres → 400.
- **Bitácora:** `membership.sale`, en la transacción.

**Alta manual con paquete** (`POST /api/admin/clients/manual`, la otra venta de mostrador):
- Guarda `activated_by`, `activated_at`, `payment_reference` (folio o id de la orden) y `membership.sale` con `meta.source = "alta_manual"`.
- Si el precio final (con cupón) es $0, exige motivo, tomado de `reason` o de **Notas** → 400 "Es una cortesía ($0): escribe el motivo en Notas. …"

### 3.3 Ajustes de membresía (P0-3 · D12 · I5)

`PUT /api/memberships/:id` acepta además `reason?`. Todo en una transacción con `SELECT … FOR UPDATE`.
- **Validación (400):**
  - estado fuera del enum;
  - saldo que no es entero ≥ 0;
  - fechas que no son `AAAA-MM-DD` válidas;
  - fin antes del inicio;
  - método fuera de `cash|transfer|card|online`.
- **Semántica de hoy:** sólo inicio → el fin se recalcula con la duración del plan.
- **Comparación:** sólo cuenta lo que **cambia de verdad**. `9999` y `NULL` son "ilimitado"; las fechas se comparan como `AAAA-MM-DD`. El panel manda todos los campos aunque no cambien.
- **Sin cambios** → 200 `{ data, unchanged: true }`, sin bitácora.
- **Motivo obligatorio** si cambia saldo, inicio, fin o estado. Cambiar sólo el método no lo pide, pero queda en la bitácora.
- **Saldo por encima del plan:** se permite con motivo; queda `meta.above_plan = true` y el panel avisa "Queda por encima del plan (N clases)."
- **Bitácora:** `membership.adjust` con antes/después de lo que cambió.

### 3.4 Asistencia en la bitácora (P0-3 · F2)

- **Check-in manual** (`PUT /api/bookings/:id/check-in`) y **QR** (`POST /api/admin/checkin/scan`): tras marcar, `booking.checkin` con `meta.method` (`manual`/`qr`), best-effort.
- **Marcar falta** (`PUT /api/bookings/:id/no-show`):
  - Si `recordFalta` sí registró la falta (usuaria no invitada y faltas encendidas), escribe `bookings.falta_recorded_at = NOW()`.
  - Registra `booking.no_show` con el estado previo.

### 3.5 Corregir una falta el mismo día (pedido del dueño)

**Ruta:** `PUT /api/bookings/:id/correct-no-show` con `{ reason }`, cualquier rol de operación.
- **Regla pura** `noShowCorrectionRule` (`server/lib/checkin.js`). Si no se cumple → 409 con `code`:
  - `NOT_NO_SHOW`: "La reserva no está marcada como falta."
  - `CLASS_CANCELLED`: "La clase fue cancelada."
  - `NOT_SAME_DAY`: "Sólo se puede corregir el mismo día de la clase (<fecha>)." El día se toma en la zona del estudio.
- **Sin motivo** → 400 `REASON_REQUIRED`.

**En una transacción:**
- **Reserva:** pasa a `checked_in`. `checked_in_at` y `checked_in_by` se conservan si ya existían; `falta_recorded_at` se limpia.
- **Revertir sólo esa falta** (si la reserva tenía `falta_recorded_at`):
  - `faltaReversal({ faltasCount, threshold, penaltyPoints })` (`server/lib/faltas.js`).
  - El contador baja 1.
  - Si el contador actual es múltiplo del umbral (esa falta completó la penalización), se devuelve la penalización con un asiento `adjust` positivo "Reverso de penalización: falta corregida a asistencia".
  - Sin la marca (invitadas, faltas apagadas, faltas previas al despliegue) no se toca el contador.
- **Puntos de check-in una sola vez:** sólo si la reserva nunca tuvo `checked_in_at`. Una reserva que tenía check-in y luego se marcó falta no recibe puntos otra vez. Una segunda corrección → 409 `NOT_NO_SHOW`.
- **Bitácora:** `booking.no_show_corrected` con motivo y `faltas_count` antes/después.

**Después del COMMIT:**
- Sincroniza el pase y revisa hitos de lealtad (sin WhatsApp de "tenemos tu check-in").
- Si es de Wellhub y es la primera asistencia, refleja la visita como un check-in.
- Respuesta: `{ data, falta_reverted, penalty_refunded, points_awarded }`.

### 3.6 Cancelaciones por el estudio (P0-3)

**`DELETE /api/admin/bookings/:id`:**
- Motivo obligatorio → 400 `REASON_REQUIRED` antes de tocar la base.
- Guarda `cancelled_by`, `cancellation_reason` y `booking.cancel` (en la transacción).
- El WhatsApp sigue incluyendo el motivo, como hoy.

**Cancelar clase:**
- El flujo de `PUT /api/classes/:id/cancel` se extrae a `cancelClassInTx()`. Marca la clase con `cancelled_at/by/cancellation_reason`, cancela sus reservas activas (guardando quién y por qué) con `applyCancellationRollback` y escribe `class.cancel`.
- Los avisos se extraen a `notifyClassCancelled()`, con la regla del bloque 1 (canal caído o apagado → lista para avisar a mano).
- La respuesta de la ruta no cambia. El motivo sigue opcional.

### 3.7 "Limpiar semana" y borrar clase (P1-5 · I6)

**Rango:** `startDate`/`endDate` `AAAA-MM-DD` válidos, inicio ≤ fin, a lo más 31 días → si no, 400 (antes, una fecha basura daba 500).

**Clasificación** (pura, `planWeekClear`):

| Clase | Qué pasa |
|---|---|
| Sin ninguna reserva (de ningún estado) | Se **borra** (el `DELETE` vuelve a comprobar que no tenga reservas) |
| Ya empezó o pasó | **No se toca** (su asistencia y créditos son historia) |
| Ya estaba cancelada | No se toca |
| Tiene reservas y no ha empezado | Se **cancela** con `cancelClassInTx` (devuelve créditos y avisa); las reservas quedan como `cancelled` |

**Respuestas:**
- **Sin `force` y con reservas activas** → 409 `ACTIVE_BOOKINGS` con `activeBookings`, `classesToCancel`, `classesToDelete` y `classesKept`. No cambia nada.
- **Con `force` y reservas activas:** exige motivo → 400 `REASON_REQUIRED`.
- **Éxito** → `{ deleted, cancelled, kept, bookingsCancelled, creditsRestored, wa_queued, wa_failed, wa_unreached, wa_channel_state, startDate, endDate }`. Los avisos van después del COMMIT y `wa_unreached` no repite alumnas.
- **Bitácora:** `class.week_clear` (resumen) y un `class.cancel` por cada clase cancelada.

**`DELETE /api/admin/classes/:id`:**
- 404 si no existe.
- 409 `CLASS_HAS_BOOKINGS` si tiene cualquier reserva: "Esta clase tiene reservas o historial: cancélala en lugar de borrarla."
- Sin reservas se borra y queda `class.delete`.

### 3.8 Baja de clienta por anonimización (P1-5 · A9 · EC15)

`DELETE /api/users/:id` pasa a `ownerMiddleware`.

**Validaciones:**

| Caso | Respuesta |
|---|---|
| A sí misma | 400 |
| No existe | 404 |
| Rol distinto de `client`/`guest` | 400 "Sólo se pueden dar de baja clientas desde aquí." |
| Ya anonimizada | 200 `{ data: { alreadyAnonymized: true } }` |
| Con membresías activas o pendientes, o reservas próximas | 409 (mensaje de hoy) |

**En una transacción:**
- **`users`:**
  - `display_name` = "Clienta dada de baja", `email` = `baja+<id sin guiones>@hive.invalid`.
  - Se ponen en `NULL`: teléfono, foto, fecha de nacimiento, género, contactos de emergencia, `health_notes`, `has_injury`, `injury_details`, `practiced_barre_before`, `instructor_notes`, `alert_message`, `password_hash`, `firebase_uid`, `wellhub_id` y `platform_plan`.
  - Preferencias de aviso en `false`; `is_active = false`; `anonymized_at = NOW()`; `anonymized_by`.
  - **Sólo las columnas que existan** en la base (`information_schema`): producción puede no tener todas las de `schema_complete.sql`.
- **`waivers`:** `full_name` = "Clienta dada de baja"; teléfono, correo y firma en `NULL`. Se conservan fecha, versión y consentimiento de imagen.
- **`guest_profiles`** (si es usuaria sombra de invitada): mismos datos personales y de salud.
- **Otros:** `referral_codes.is_active = false`; se borran sus tokens de reseteo y los dispositivos registrados de su pase de Apple. Son técnicos, no historial.
- **Bitácora:** `user.anonymize` con `meta.kept` (membresías, órdenes, reservas) y **sin** los datos borrados.
- **Se conservan** órdenes, pagos, membresías y reservas con el mismo id.

**Acceso:**
- Sin contraseña y con otro correo no puede entrar.
- `authMiddleware` rechaza el token de una cuenta dada de baja (o inexistente) con 401 `ACCOUNT_DISABLED` "Esta cuenta fue dada de baja."
  - Caché de 30 s por usuaria (`server/lib/accountGate.js`); la baja la limpia al instante.
  - Si la base falla, no bloquea a nadie.
- `GET /api/users` excluye a las anonimizadas.

## 4. UI

Textos en español, clases del tema, sin hex, texto de al menos 12 px.

- **Bitácora** (`/admin/bitacora`, grupo "Sistema" del menú, sólo dueña, bandera `auditLog: true`):
  - Encabezado "Sistema · sólo dueña / Bitácora / Quién cobró, ajustó, canceló, corrigió o dio de baja, cuándo, por qué y qué cambió."
  - **Filtros** en la URL (`?que=&quien=&desde=&hasta=&id=&pagina=`):
    - "Qué": Todo, Ventas y membresías, Reservas y asistencia, Clases, Limpiezas de semana, Bajas de clientas.
    - "Quién": todo el equipo o una persona.
    - "Desde" y "Hasta"; botón "Quitar filtros".
  - **Lista "Movimientos":**
    - Por movimiento: acción (p. ej. "Cortesía en mostrador ($0)", "Falta corregida a asistencia") y fecha y hora.
    - Quién, con su rol, y sobre quién (clienta, clase o semana).
    - "Motivo:" y los cambios "Clases: 1 → 3".
  - **Paginación:** "Página N de M · T registros", con "Anterior" y "Siguiente".
  - **Estados:** vacío "Sin movimientos"; error con el mensaje del servidor.
- **Cobrar** (`/admin/payments`):
  - **Paso 4 "Cobro":**
    - "Precio cobrado" (precio efectivo del plan por defecto) y "Referencia de pago (opcional)".
    - Si es $0 o distinto al plan: recuadro "Motivo (obligatorio)" con "Es una cortesía ($0)." o "Lo cobrado es distinto al precio del plan." y "Queda en la bitácora con tu nombre."
  - **Resumen:** total con lo cobrado, etiqueta "Cortesía", fila "Precio del plan" si difiere y "Referencia".
  - El botón se deshabilita sin motivo válido.
  - Las tarjetas de plan muestran el precio efectivo.
- **Membresías · Editar vigencia** y **Ficha · Editar membresía**:
  - Campo "Motivo del ajuste", obligatorio (Guardar deshabilitado con menos de 5 caracteres).
  - La ficha avisa "Queda por encima del plan (N clases)."
- **Pasar lista:**
  - La fila "Falta" ofrece "Corregir a asistencia" ("Corregir" en celular), que pide el motivo (mínimo 5 caracteres). Toast "Falta corregida".
  - El diálogo de falta dice: "Su reserva quedará registrada como falta. Si fue un error, podrás corregirla a asistencia hoy mismo, con un motivo."
- **Reservas · Cancelar reserva:** "Motivo (obligatorio)" y "Queda en la bitácora y se incluye en el WhatsApp que le llega a {nombre}. Mínimo 5 caracteres."
- **Clases · Limpiar semana:**
  - Confirmación: "Se borran las clases sin reservas… Las que tienen reservas se cancelan: se devuelve el crédito y se avisa a cada alumna. Las que ya pasaron no se tocan."
  - Si hay reservas activas: "Hay reservas activas" con motivo obligatorio y "Cancelar esas clases y limpiar".
  - Toast: "N clases borradas · M canceladas".
  - Diálogo "Avisa a mano a estas alumnas" si el canal está caído (también al cancelar una clase desde el calendario).
- **Clientas · Eliminar:**
  - Diálogo "¿Dar de baja a X?": "Se borran sus datos personales y de salud y se cierra su acceso. Sus reservas, órdenes y pagos se conservan sin su nombre. No se puede deshacer."
  - Motivo opcional; botón "Eliminar clienta"; toast "Clienta dada de baja".
- **`promptText({ minLength })`:** el diálogo compartido deshabilita Confirmar hasta el mínimo y muestra "Mínimo N caracteres."

## 5. Errores

| Situación | Respuesta |
|---|---|
| Falta motivo donde es obligatorio | 400 `REASON_REQUIRED` "Escribe el motivo (mínimo 5 caracteres)." (con prefijo en ventas) |
| Id que no es UUID (ruta o cuerpo) | 400 "Identificador inválido" |
| Monto cobrado inválido | 400 "El monto cobrado debe ser un número de 0 en adelante." |
| Referencia de pago larga o no texto | 400 |
| Fechas, saldo, estado o método inválidos en ajuste | 400 con el motivo |
| Filtros de bitácora inválidos | 400 ("Tipo de registro inválido.", "Fecha 'desde' inválida (usa AAAA-MM-DD).", "El límite debe estar entre 1 y 100.", …) |
| Rango de limpieza inválido o > 31 días | 400 |
| Corrección fuera de regla | 409 `NOT_NO_SHOW` / `CLASS_CANCELLED` / `NOT_SAME_DAY` |
| Limpiar con reservas activas sin `force` | 409 `ACTIVE_BOOKINGS` con resumen |
| Borrar clase con reservas | 409 `CLASS_HAS_BOOKINGS` |
| Dar de baja con membresía o reservas vivas | 409 (mensaje de hoy) |
| Dar de baja a personal | 400 |
| Token de cuenta dada de baja | 401 `ACCOUNT_DISABLED` |
| Bitácora o baja con rol que no es dueña | 403 |

Ninguna entrada mala da 500; los errores de base inesperados siguen como 500 "Error interno" sin detalle.

## 6. Pruebas

Cada punto con su prueba en rojo primero.

**Unitarias (`node:test`, `server/lib/*.test.js`):**
- `audit.test.js`: motivo, `changedFields`, `recordAudit` con base simulada, `buildAuditQuery`.
- `validate.test.js`: `isDay`.
- `membershipAdmin.test.js`: venta, ajuste y normalización de ilimitado.
- `checkin.test.js`: `noShowCorrectionRule`.
- `faltas.test.js`: `faltaReversal`.
- `weekClear.test.js`: clasificación y rango.
- `accountGate.test.js`: caché, `forget` y falla abierta.
- `anonymize.test.js`: sólo columnas existentes, sin datos personales.

**Rutas** (`server/tests/*.test.mjs`, base desechable):
- `bitacora.test.mjs`: dueña, filtros, paginación, 403 a recepción y 400 con filtros malos.
- `ventas-ajustes.test.mjs`: `activated_by`, referencia, cortesía, precio distinto, ajuste con y sin motivo, "guardar sin cambios" y alta manual.
- `faltas-correccion.test.mjs`: corrección con reverso de penalización y puntos una vez, 409 al repetir, otro día, sin motivo, reserva que ya tenía check-in, y check-in manual y QR en la bitácora.
- `cancelaciones-semana.test.mjs`:
  - motivo al cancelar una reserva;
  - clase cancelada con quién y por qué;
  - "Limpiar semana" 409, 400 y éxito, con vacía borrada, con reservas cancelada, sólo historial conservado y pasada intacta;
  - rango malo;
  - borrar clase.
- `baja-clienta.test.mjs`:
  - anonimiza y conserva historial;
  - token viejo 401 y login 401;
  - fuera de la lista;
  - bitácora sin datos personales;
  - idempotente;
  - 409 con membresía, 403, 400 y 404.

**Panel (vitest):**
- `ConfirmDialog` (`minLength`) y `audit-log` (textos).
- `AuditLogPage` y `AdminLayout` (Bitácora sólo para la dueña).
- `PaymentsPage` (precio distinto, cortesía, referencia, precio de apertura) y `MembershipsList` / `ClientDetail` (motivo y aviso de saldo).
- `TodayAttendance` (Corregir a asistencia, texto nuevo).
- `BookingsList` (motivo al cancelar reserva) y `ClassesCalendar` (Limpiar semana con 409 → motivo → "Avisa a mano").
- `ClientsList` (baja con motivo).

**Verificación:**
- `npm test`, tsc y build con Node 20.
- Regresión completa del servidor en base desechable.
- Recorrido del panel con Playwright de Python a 1280 y 390 px, con comprobaciones en la base.

## 7. Fuera de alcance

- **`DELETE /api/plans/:id?cascade=true`:** borra membresías y órdenes del plan. Mismo problema que P1-5, pero la auditoría no lo marca; queda propuesto aparte.
- **Bloque 3:** cuota de cancelaciones y `cancellationsUsed` (P0-4), lista de espera, reembolsos (P1-12), aviso de privacidad.
- **Otras vías de venta:** visitas, walk-in, `guestSale` y POS (precio de catálogo, vistas apagadas por bandera). Sin `activated_by` ni bitácora.
- **Permisos:** `POST /memberships` sigue abierto a recepción y coach por API (I7).
- **Sin bitácora:** activar o cancelar membresía, verificar o rechazar órdenes, asignar reservas.
- **Texto libre con datos personales:** notificaciones, notas de órdenes, bitácoras de WhatsApp, `partner_metadata` de Wellhub y motivos escritos por el equipo no se limpian.
- **Bitácora:** retención y purga, exportar a CSV, filas a prueba de alteraciones.
- **"Corregir a asistencia"** en la lista de cada clase (sólo Pasar lista).
- **La marca:** HIVE es intencional, no se toca.

