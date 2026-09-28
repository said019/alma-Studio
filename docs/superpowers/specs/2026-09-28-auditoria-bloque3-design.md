# Auditoría de producción — Bloque 3: cuota de cancelaciones, lista de espera, Wellhub, reembolsos, privacidad y marca en legales

**Fecha:** 2026-09-28 · **Rama:** `hive-auditoria-b3`, encima del bloque 2 terminado (`hive-auditoria-b2` = `main` d1a974c + bloque 2).

**Origen:**
- Auditoría productiva de www.almamovement.com.mx del 27 sep 2026 (`.superpowers/auditoria-prod-2026-09-27.md`): P0-4 [C1 · C8 · C2], P1-1 [B5 · B4 · H4], P1-9 [F6 · K6], P1-10 [L2 · L3] y P1-12 [E6 · EC11].
- Extra de la familia de P1-5: `DELETE /api/plans/:id?cascade=true`.
- Punto 7 (pedido del dueño): las páginas legales y la responsiva pasan a la marca HIVE Pilates Studio.
- Las decisiones de negocio ya las tomó el dueño; este documento fija cómo se implementan.

**Consume del bloque 2:** `server/lib/audit.js` (`recordAudit`, `recordAuditBestEffort`, `reasonProblem`, `cleanReason`, `changedFields`), la tabla `audit_log`, `server/lib/membershipAdmin.js` (`planMembershipAdjust`, `cleanPaymentReference`), `promptText({ minLength })`, la pantalla Bitácora y `src/lib/audit-log.ts`. El motivo faltante responde el mismo 400 `REASON_REQUIRED`.

**Principio:** no cambia ningún dato existente. Esquema nuevo sólo con `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` y `CREATE INDEX IF NOT EXISTS`, todo en una tarea. Además se **quita** un `UPDATE` que ya corría en cada arranque (§3.1): quitarlo deja de cambiar datos, no los cambia.

---

## 1. Problema

- **Cuota de cancelaciones (P0-4).**
  - `DELETE /api/bookings/:id` tiene escrito a mano `cancellations_used >= 2` → 403 "Has alcanzado el límite de 2 cancelaciones…". La cuota no aparece en ninguna política.
  - La revisión se hace **antes** de saber si la reserva es de lista de espera: salir de la fila queda bloqueado. Además, salir de la fila dentro de las 12 h registra una falta por "cancelación tardía".
  - `ensureSchema()` "reconcilia" `cancellations_used` en cada arranque con el total de reservas canceladas de la membresía. Así cuenta también las cancelaciones del estudio y las salidas de la fila, y un ajuste de recepción dura hasta el siguiente deploy.
  - `PUT /api/memberships/:id` ignora `cancellationsUsed`.
  - La ventana real vive en `loyalty_config.faltas_cancel_window_hours` (12 por defecto), pero los textos dicen "12 horas" a mano. El detalle de clase dice "Cancela hasta 12 horas antes y no cuenta como falta" y no menciona que se pierde la clase.
  - `cancellation_settings` no existe.
  - `/legal/cancelacion` nunca muestra su texto propio: `usePolicyText` recibe siempre el texto de `policies_settings`, que en producción es el de 2 líneas de Alma, porque `mergeSettingsWithDefaults` rellena los vacíos con los valores por defecto.
  - La clienta puede cancelar desde la API una reserva con check-in o falta.
- **Lista de espera (P1-1).**
  - Al liberarse un lugar nadie sube.
  - `POST /api/bookings` confirma a quien llega si hay lugar, aunque haya fila.
  - `waitlist_position` sale siempre `null`: la columna existe en `schema_complete.sql`, pero nadie la escribe.
  - El panel ordena la fila por nombre.
  - En la app no hay forma de salir de la fila (sólo por API).
- **Wellhub (P1-9).**
  - `FEATURES.partnerPlatforms = false` esconde los ajustes y los check-ins, aunque la integración está encendida en producción.
  - El check-in por webhook (`handleCheckin`) pone `checked_in` **sin** `checked_in_at`: no cuenta en "Primera vez" ni en los reportes que miran la fecha, y no queda en la bitácora.
  - Las cancelaciones por webhook liberan lugar sin avisar a nadie.
- **Reembolsos (P1-12):** no existen. Sólo está `PUT /memberships/:id/cancel`, que no toca el ingreso. Además, el Historial de cobros lee `createdAt`, pero `/api/payments` devuelve `created_at`: las fechas salen "—" y los totales de la semana y del mes, en $0.
- **Aviso de privacidad (P1-10).**
  - La página legal muestra el texto por defecto de 2 líneas ("Tus datos se usan para gestionar…").
  - El texto propio de la página (nunca visible) dice "Alma Movement" y da el correo de Alma.
  - No hay consentimiento expreso para los datos de salud, ni registro de versión o fecha.
- **Marca en legales (punto 7).**
  - `Términos`, `Cancelación`, `Privacidad` y `LegalLayout` dicen Alma Movement, Juriquilla, Banorte y `info@almamovement.mx`.
  - La responsiva (`responsivaContent.ts`, el PDF del servidor y el subtítulo "firmado con Alma Movement") sigue en `v1` Alma.
  - La responsiva guarda `waiver_version = 'v1'` escrito a mano, y el PDF imprime siempre el mismo texto, sin importar la versión.
  - El pase se descarga como `alma-pass.pkpass`.
- **Planes:** "Eliminar" de "Sesión Extra (Socias o Inscritas)" manda `?cascade=true` y borra membresías, órdenes y códigos de descuento del plan.

## 2. Decisiones

**Cuota**
- Cuota en `settings` con la llave `cancellation_settings` = `{ "max_cancellations": 2 }`. Si no existe, vale 2. 0 = sin límite; máximo 20.
- **Sólo la dueña** la cambia, con su propia ruta. La ruta genérica `PUT /api/settings/cancellation_settings` responde 400.
- **Qué cuenta:** toda cancelación que la clienta hace de una reserva **confirmada**, a tiempo o tarde, igual que hoy.
  - No cuentan: salir de la fila, las cancelaciones del estudio, las clases canceladas ni el reembolso.
- **Política pública:** `GET /api/public/booking-policy` con la cuota, la ventana real (`loyalty_config`), el cierre de reservas y de fila (2 h) y las faltas.
- **Un solo texto:** `src/lib/booking-policy.ts` arma las reglas. Las usan `/legal/cancelacion`, el detalle de clase, el diálogo de cancelar y la vista previa de Configuración.

**Lista de espera**
- **Subida después del COMMIT** de lo que libera el lugar, en transacciones cortas: una por persona subida.
  - Cada una toma primero `SELECT … FROM classes … FOR UPDATE OF c` y luego lee cupo y fila.
  - Así dos liberaciones simultáneas quedan en fila, nadie sube dos veces y no se excede el cupo.
  - Una transacción de subida nunca guarda dos membresías a la vez. Por eso no hay interbloqueos con las reservas y las cancelaciones.
- **Gancho único `onSeatReleased(classIds, ctx)`** en `server/index.js`. Lo llama todo lo que libera lugar:
  - la clienta que cancela;
  - el estudio que cancela una reserva;
  - subir el cupo;
  - cancelar una membresía;
  - el reembolso total;
  - la cancelación por webhook de Wellhub;
  - reabrir una clase;
  - la reserva nueva que entra a la fila.
- **Barrido cada 5 min** (`WAITLIST_SWEEP_MINUTES`; 0 lo apaga): red de seguridad si un proceso se cae entre el COMMIT y la subida.
- **Orden de llegada** = `bookings.created_at, id` de la reserva en fila. `waitlist_position` se calcula en vivo; no se guarda (se desfasaría al salir alguien).
- **Ventana:** la subida aplica si faltan 2 h o más (`BOOKING_LEAD_HOURS`, la misma que cierra las reservas). Después el lugar queda libre y la fila ya no bloquea.
- **Elegibilidad:** se re-elige la membresía con `selectMembershipForClass` (vigente, categoría, créditos y cubetas de mixto) y se respetan AM Club y el tope semanal.
  - La que no cumple **se salta y sigue en la fila**; el salto queda en la bitácora de la subida (`meta.skipped`).
- **Con fila, la reserva nueva entra a la fila** (clienta y recepción, mientras aplique la subida). Justo después corre la subida.
  - Si las de adelante no pueden usar el lugar, sube la nueva. Nadie se salta la fila y el lugar no se desperdicia.
- **Sólo clases `scheduled`:** una clase cerrada no sube a nadie; reabrirla corre la subida.
- **La subida es una reserva normal:** usa una clase, cuenta para el tope semanal y aplican las mismas reglas de cancelación.
- **Bitácora:** `booking.waitlist_promoted` con actor "Sistema" (`systemActor: "system"`).

**Wellhub**
- Se enciende `FEATURES.partnerPlatforms`.
- Sólo la dueña, en el menú y en el servidor: ajustes, check-ins y publicar clases a Wellhub.

**Reembolsos**
- Sólo la dueña, sobre órdenes aprobadas con monto > 0 que no sean de Wellhub.
- El dinero se devuelve fuera del sistema: no se llama a ninguna pasarela.
- **Total:** devuelve lo que queda por devolver. Cancela la membresía de la orden, deja sus clases en 0 y cancela sus reservas futuras (confirmadas y en fila). Los lugares liberados suben la fila.
- **Parcial:** un monto menor a lo que queda por devolver. La dueña decide cuántas clases sin usar quitar; el panel sugiere la proporción (monto ÷ precio por clase, redondeado, con tope en las que le quedan). La membresía sigue activa.
  - En una membresía ilimitada, o sin membresía, no se quitan clases.
- **Estado del pago:** en la orden, con `refund_status` (`partially_refunded` | `refunded`) y `refunded_amount`. `orders.status` sigue `approved`, así que nada de lo que hoy cuenta órdenes aprobadas se rompe.
- **Reportes en base de caja:** ingreso del periodo = ventas aprobadas del periodo − reembolsos **registrados** en el periodo. No se reescriben meses cerrados.
- **Historial de cobros:** muestra cada reembolso como una fila negativa en su fecha.
- **No se revierten puntos de lealtad:** no hay registro fiable de cuántos dio cada compra (fuera de alcance).

**Privacidad**
- Versión del aviso: `2026-09-28`, en `server/lib/privacy.js` y en `src/lib/legal/privacy-notice.ts`. Una prueba exige que coincidan.
- **Columnas nuevas en `users`:** `privacy_notice_version` y `privacy_accepted_at` (al aceptar términos al registrarse), y `health_consent_version` y `health_consent_at`.
- **Cuándo se exige el consentimiento:** sólo cuando **la clienta** escribe datos de salud nuevos en su perfil o en el cuestionario, y no tiene consentimiento de la versión vigente.
  - Editar otros datos nunca lo pide.
  - El personal no queda bloqueado.
  - Registrarse no guarda salud: la casilla ahí es opcional.
- **Retirar el consentimiento:** la clienta puede hacerlo desde su perfil. Se borran sus notas de salud y sus lesiones.

**Legales y responsiva**
- **Sin CMS:** las tres páginas dejan de mostrar el texto de `policies_settings` y salen del código con su fecha. La de cancelación se arma con la configuración real.
  - La pestaña "Políticas" de Configuración cambia a la cuota y a las ligas de los textos legales.
- **Responsiva `v2`:** el mismo texto con HIVE Pilates Studio, y las disciplinas dicen "Pilates en Reformer y las demás clases que ofrece el estudio".
  - `POST /me/waiver` acepta `waiver_version` (`v1`|`v2`; sin él, `v2`) y guarda la versión que la clienta leyó.
  - El PDF y "Mi responsiva" muestran el texto **de la versión firmada**. Las `v1` siguen valiendo: no se piden de nuevo ni se tocan.
- **`alma-pass.pkpass` → `hive-pass.pkpass`:** es sólo el nombre de descarga (`a.download` en `Wallet.tsx` y `Content-Disposition` de `GET /api/wallet/apple/pkpass`). Apple y los dispositivos piden el pase por `/api/wallet/v1/passes/:passTypeId/:serial`, que no cambia.

**Planes:** se archivan (`is_active = false`, `archived_at`, `archived_by`) si tienen membresías, órdenes o códigos de descuento; si no, se borran. `?cascade=true` se ignora.

**Costura para paralelizar:** la Tarea 1 deja `onSeatReleased` como función vacía y la Tarea 4 le pone el cuerpo. Así la cuota, los reembolsos y Wellhub llaman al gancho en paralelo con la lista de espera. La prueba de punta a punta está en la verificación.

## 3. Diseño

### 3.1 Esquema (`ensureSchema()`, al final)

| Objeto | Definición |
|---|---|
| `bookings` | `promoted_at TIMESTAMPTZ` (cuándo subió sola de la fila) |
| Índice | `idx_bookings_class_waitlist ON bookings(class_id, created_at, id) WHERE status = 'waitlist'` |
| `orders` | `refunded_amount NUMERIC(10,2) NOT NULL DEFAULT 0`, `refund_status VARCHAR(20)`, `refunded_at TIMESTAMPTZ` |
| `refunds` | `id UUID PK`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `order_id UUID NOT NULL`, `membership_id UUID`, `user_id UUID`, `amount NUMERIC(10,2) NOT NULL CHECK (amount > 0)`, `kind VARCHAR(10) NOT NULL CHECK (kind IN ('total','partial'))`, `method VARCHAR(20) NOT NULL`, `reference VARCHAR(100)`, `reason TEXT NOT NULL`, `classes_removed INTEGER NOT NULL DEFAULT 0`, `membership_cancelled BOOLEAN NOT NULL DEFAULT false`, `bookings_cancelled INTEGER NOT NULL DEFAULT 0`, `created_by UUID`. Sin llaves foráneas, como `audit_log` |
| Índices | `refunds(order_id)`, `refunds(created_at DESC)`, `refunds(user_id, created_at DESC)` |
| `plans` | `archived_at TIMESTAMPTZ`, `archived_by UUID` |
| `users` | `privacy_notice_version VARCHAR(20)`, `privacy_accepted_at TIMESTAMPTZ`, `health_consent_version VARCHAR(20)`, `health_consent_at TIMESTAMPTZ` |
| **Se quita** | el bloque "Reconcile cancellations_used with actual cancelled bookings" de `ensureSchema()` |

**Bitácora** (`server/lib/audit.js`):
- **Acciones nuevas:** `booking.waitlist_promoted`, `order.refund`, `plan.archive`, `plan.delete` y `settings.update`.
- **Entidades nuevas:** `order`, `plan` y `settings`.
- **Actor sin persona:** `recordAudit(db, { systemActor: "system" | "wellhub", … })` guarda `actor_id = NULL`, `actor_name` = "Sistema" o "Wellhub" y `meta.actor`.
- El panel ya muestra `actorName ?? "Sistema"`; `src/lib/audit-log.ts` gana las etiquetas nuevas.

### 3.2 Cuota de cancelaciones (P0-4)

**Módulo `server/lib/cancellationPolicy.js`:**
- `normalizeCancellationSettings`, `cancellationLimitProblem`, `cancellationQuota({ used, limit })`, `clientCancelDecision({ bookingStatus, used, limit })` y `publicBookingPolicy({ settings, loyalty, bookingLeadHours })`.

**`DELETE /api/bookings/:id`** (la clienta):

| Estado | Resultado |
|---|---|
| `cancelled` | 400 "Esta reserva ya fue cancelada" (como hoy) |
| `checked_in` / `no_show` | 409 `ATTENDANCE_RECORDED` "Esta reserva ya tiene la asistencia registrada. Si hay un error, habla con recepción." |
| `waitlist` | Sale de la fila: no consulta ni suma la cuota, no registra falta, no avisa ni libera lugar. `{ leftWaitlist: true }` |
| `confirmed` con la cuota agotada (`limit > 0` y `used ≥ limit`) | 403 `CANCELLATION_LIMIT` "Ya usaste tus N cancelaciones de este paquete. Si necesitas cancelar, habla con recepción." |
| `confirmed` | Suma 1 a la cuota. A tiempo (fuera de la ventana real) devuelve la clase; tarde la pierde y registra falta. Después del COMMIT: `onSeatReleased`, correo y WhatsApp como hoy |

- **Respuesta:** `{ message, creditRestored, leftWaitlist, cancellationsUsed, cancellationLimit, cancellationsLeft, cancelWindowHours }`.

**Configuración:**
- `GET /api/public/booking-policy` → `{ data: { cancellationLimit, cancelWindowHours, bookingLeadHours, waitlistCutoffHours, faltasEnabled, faltasThreshold } }`.
- `PUT /api/admin/booking-policy` (`ownerMiddleware`):
  - cuerpo `{ cancellationLimit }`: entero de 0 a 20, si no → 400;
  - guarda `cancellation_settings`;
  - si cambió, bitácora `settings.update` con antes y después;
  - responde la política nueva.
- `PUT /api/settings/cancellation_settings` → 400 "La cuota de cancelaciones se cambia en Configuración → Políticas."

**Membresías:**
- `GET /api/memberships/my` y `/mine/all` agregan `cancellationLimit` y `cancellationsLeft`; `cancellationsUsed` ya venía.
- `GET /api/memberships` (panel) agrega `cancellationsUsed` y `cancellationLimit`.

**`PUT /api/memberships/:id`** (bloque 2) acepta `cancellationsUsed`:
- entero de 0 a 1000;
- cambiarlo exige motivo (`REASON_FIELDS`);
- queda en `membership.adjust` como `cancellations_used` antes → después;
- el mismo valor no cuenta como cambio (la ficha manda todo).

**Arranque:** sin la reconciliación, el contador sólo lo mueven la cancelación de la clienta y el ajuste con motivo. Los valores que hoy están en producción se quedan como estén. Pueden venir inflados por la reconciliación vieja; recepción los corrige con motivo.

### 3.3 Lista de espera (P1-1)

**Módulo `server/lib/waitlist.js` (puro):** `promotionWindowOpen(startsAt, now, cutoffHours)`, `freeSeats(capacity, live)`, `queueBlocksNewBooking({ waiting, startsAt, now, cutoffHours })` y `firstEligible(candidates)` → `{ promote, skipped }`.

**En `server/index.js`:**
- **`promoteOneFromWaitlist(classId)`**, en su propia transacción:
  - Bloquea la clase; sin clase, o si no está `scheduled` o ya no aplica la ventana → nada.
  - Cuenta el cupo vivo; sin lugar → nada.
  - Lee la fila `FOR UPDATE OF b` en orden de llegada.
  - A cada una le re-elige la membresía y revisa AM Club y el tope semanal.
  - A la primera que cumple le bloquea la membresía y vuelve a revisar sus créditos. Pasa la reserva a `confirmed` con `membership_id` y `promoted_at`, descuenta la clase (con cubetas si es mixto) y escribe `booking.waitlist_promoted` con `meta.position` y `meta.skipped`. Luego COMMIT.
  - Si nadie cumple, ROLLBACK: no cambia nada.
- **`promoteWaitlist(classId, { quietUserIds })`:** repite `promoteOneFromWaitlist` mientras haya lugar y alguien que cumpla, con un tope de 50. Luego avisa a cada subida con `notifyWaitlistPromoted`, salvo a las de `quietUserIds`, que ya reciben su confirmación normal.
- **`notifyWaitlistPromoted`:**
  - Sincroniza el pase.
  - **WhatsApp:** si el canal está conectado y los avisos encendidos, `notifyByTemplate(userId, "waitlist_promoted", …)`. Si no, no intenta y marca `whatsapp: "unreached" | "disabled"`.
  - **Correo:** `sendBookingConfirmed` (reserva confirmada) si los correos están encendidos.
  - Devuelve `{ whatsapp, email }`.
- **`onSeatReleased(classIds, ctx)`:** llama a `promoteWaitlist` por cada clase distinta y nunca lanza. Devuelve las subidas: `{ booking_id, user_id, display_name, phone, whatsapp, email }`.
- **`runWaitlistSweep()`:** clases `scheduled`, a 2 h o más y dentro de 60 días, con fila y lugar libre → `onSeatReleased(…, { source: "sweep" })`.

**Rutas que cambian:**

| Ruta | Cambio |
|---|---|
| `POST /api/bookings` | Entra a la fila si está llena **o** si ya hay fila y aplica la subida. Si entró a la fila con lugar libre, corre `onSeatReleased` (con ella en `quietUserIds`) y responde el estado final: confirmada si subió |
| `POST /api/admin/bookings/assign` | Igual que arriba para la socia (la acompañante sigue exigiendo que la socia quede confirmada) |
| `DELETE /api/admin/bookings/:id` | Tras el COMMIT, si la reserva ocupaba lugar → `onSeatReleased`. La respuesta agrega `waitlist_promoted` |
| `PUT /api/admin/classes/:id` | Si cambió el cupo → `onSeatReleased` |
| `PUT /api/memberships/:id/cancel` | Tras el COMMIT → `onSeatReleased` de las clases de las reservas canceladas |
| `PUT /api/classes/:id/reopen` | → `onSeatReleased` |
| `GET /api/bookings/my-bookings` | `waitlist_position` en vivo (1 = la primera) |
| `GET /api/classes/:id` | agrega `waitlist_count` |
| `GET /api/classes/:id/roster` | la fila ordenada por llegada, con `waitlistPosition` |

**Panel:**
- **Lista de espera:**
  - usa `waitlistPosition`;
  - subtítulo "Por orden de llegada. Si se libera un lugar hasta 2 horas antes, sube sola la primera que tenga clases disponibles.";
  - quien no tiene clases dice "Sin clases disponibles · se salta".
- **Reservas · Cancelar reserva:** si alguien subió, el aviso dice "Subió de la lista de espera: Ana". Si no le llegó el WhatsApp, agrega "Avísale tú: no le llegó el WhatsApp."

### 3.4 App de clientas (P0-4 y P1-1)

Tema oscuro terracota existente; textos de `src/lib/booking-policy.ts`.

- **Detalle de clase (`BookClassConfirm`):**
  - "Lista de espera" si no hay lugar **o** si ya hay fila (`waitlist_count`).
  - "Lo que tienes que saber" usa la regla de la fila.
  - La sección "Si necesitas cancelar" lista las mismas reglas, con "Te quedan N cancelaciones de este paquete." y la liga "Ver la política completa".
- **Calendario (`BookClasses`):** con fila, la clase sale como "Lista de espera".
- **Mis reservas:**
  - La reserva en fila dice "Lugar N en la fila" y ofrece "Salir de la lista de espera"; el diálogo explica que no usa una cancelación.
  - El diálogo de cancelar una confirmada lista las mismas reglas y "te quedan N". Con la cuota agotada no ofrece cancelar y remite a recepción.
  - El aviso de éxito usa el mensaje del servidor.
- **`/legal/cancelacion`:** en HIVE; las reglas son las mismas líneas y la fila con su regla. Sin el correo de Alma ni la tabla "Resumen rápido" (repetía números).

### 3.5 Wellhub (P1-9)

**Servidor:**
- **`handleCheckin`:** `UPDATE bookings SET status='checked_in', checked_in_at = COALESCE(checked_in_at, NOW())`, y bitácora `booking.checkin` con `systemActor: "wellhub"` y `meta.method = "wellhub"`, con `recordAuditBestEffort`. La validación de visita no cambia.
- **Cancelaciones:** `handleCancel` y `handlePlanChange` devuelven `classIds` de las reservas que ocupaban lugar. El manejador del webhook llama `onSeatReleased(classIds, { source: "wellhub" })` y no los incluye en la respuesta.
- **`GET /api/partners/checkins`** (sólo dueña):
  - acepta `?month=AAAA-MM` (por defecto el mes actual del estudio; inválido → 400);
  - responde `{ data, summary, unmatched, month }`;
  - `summary`: confirmados, pendientes, fallidos, reservas de Wellhub del mes, asistencias en el estudio, faltas y asistencias sin check-in de Wellhub;
  - `unmatched`: reservas de Wellhub con asistencia y sin check-in confirmado.
- **Sólo dueña (`ownerMiddleware`):** `POST /api/partners/checkins/:id/confirm`, `GET /api/partners/summary` y publicar o despublicar clases.

**Panel:**
- **Bandera y menú:** `partnerPlatforms: true`; los dos ítems de Wellhub son `ownerOnly`; las rutas se guardan con `AuthGuard requiredRoles={["admin","super_admin"]}`.
- **"Check-ins Wellhub":**
  - con `AdminPage`, un selector de mes y cinco cifras;
  - la tabla en español (Confirmado, Pendiente, Falló; Automático, Manual) con la columna "En el estudio";
  - la lista "Asistencias sin check-in de Wellhub".
- **Ajustes:** en español; `bg-white` pasa a `bg-surface`. La marca Wellhub conserva sus colores oficiales (excepción ya permitida en `guards.test.ts`).
- **Calendario:** el control de Wellhub de la clase se ve sólo para la dueña.

### 3.6 Reembolsos (P1-12)

**Módulo `server/lib/refunds.js`:** `REFUND_METHODS = ["cash","transfer","card"]`, `parseMoney(v)` (acepta coma decimal) y `refundPlan({ order, membership, input })`. La sugerencia de clases a quitar (`suggestedClassesToRemove`, proporcional a lo devuelto) vive en el panel, en `src/pages/admin/payments/refund-math.ts`; el servidor sólo valida el número que llega.

**`POST /api/admin/orders/:id/refunds`** (`ownerMiddleware`): cuerpo `{ kind: "total"|"partial", amount?, method, reference?, reason, classesToRemove? }`.

| Caso | Respuesta |
|---|---|
| No existe | 404 |
| No aprobada | 409 `ORDER_NOT_PAID` |
| Wellhub | 409 `WELLHUB_ORDER` |
| Cobrado $0 | 409 `NOTHING_CHARGED` |
| Ya reembolsada completa | 409 `ALREADY_REFUNDED` |
| Tipo, método, referencia, monto o clases inválidos | 400 en español |
| Sin motivo | 400 `REASON_REQUIRED` |
| Parcial por más de lo que queda | 400 "No puedes reembolsar más de lo cobrado: quedan $X por devolver." |
| Parcial por exactamente lo que queda | 400 "Es todo lo que queda por devolver: elige reembolso total." |

**En una transacción** (orden y membresía con `FOR UPDATE`):
- Inserta en `refunds`.
- Actualiza `refunded_amount`, `refund_status` y `refunded_at`.
- **Total:** cancela la membresía (`cancellation_reason` "Reembolso total: <motivo>"), deja sus clases en 0 si no es ilimitada, re-reparte las cubetas y cancela sus reservas futuras confirmadas y en fila, con quién y por qué.
- **Parcial:** resta las clases elegidas y re-reparte las cubetas.
- Escribe `order.refund` con antes y después (`refunded_amount`, `refund_status`, `classes_remaining`, `membership_status`) y `meta` (monto, tipo, método, referencia, clases quitadas y reservas canceladas).

**Después del COMMIT:** `onSeatReleased` de las clases liberadas y sincronización del pase.

**Respuesta:** 201 `{ data: { refund, order: { id, refunded_amount, refund_status }, membership, bookings_cancelled } }`. Dos totales a la vez: el segundo espera el candado y responde 409.

**Reportes:**
- `/api/reports/overview` resta los reembolsos del periodo y del periodo anterior; agrega `grossRevenue` y `refundsTotal`.
- `/api/reports/revenue-sparkline` y `/api/reports/revenue` restan los reembolsos de cada semana o mes; `revenue` agrega `refunds`.
- `/api/admin/stats` da el ingreso del mes neto.

**`/api/payments`:**
- agrega a cada orden `refundedAmount`, `refundStatus`, `membershipId`, `membershipStatus`, `classesRemaining`, `classLimit` y `orderId`, y a todas las filas `createdAt` y `userId`;
- agrega filas `source: "refund"` con monto negativo en su fecha;
- `total` neto y `refundsTotal`;
- `limit` acotado de 1 a 1000.

**Panel (Cobros · Historial):**
- Cada orden elegible tiene "Reembolsar". Las ya tocadas muestran "Reembolsado" o "Reembolso parcial · $X"; los reembolsos salen como filas "Reembolso" en rojo.
- **Diálogo:**
  - "Reembolso total" o "Reembolso parcial" (monto y clases a quitar, con la sugerencia);
  - "¿Cómo se devolvió?" (Efectivo, Transferencia o Terminal), "Referencia (opcional)" y "Motivo (obligatorio)";
  - resumen de lo que pasará y la nota "El dinero se devuelve fuera del sistema: aquí sólo queda registrado.";
  - "Registrar reembolso" se deshabilita hasta que todo sea válido.
- La tira de cifras agrega "Reembolsos · mes" cuando los hay.

### 3.7 Aviso de privacidad y consentimiento (P1-10)

**Módulo `server/lib/privacy.js`:** `PRIVACY_NOTICE_VERSION = "2026-09-28"`, `healthDataChanges(current, input)`, `hasCurrentHealthConsent(user)` y `healthConsentProblem({ changes, consentGiven, hasConsent })`.

**Registro (`POST /api/auth/register`):**
- con `acceptsTerms` guarda `privacy_notice_version` y `privacy_accepted_at`;
- con `healthConsent: true` guarda `health_consent_version` y `health_consent_at`.

**`PUT /api/users/:id`:**
- **Edición propia:** si escribe notas de salud nuevas sin consentimiento vigente y sin `healthConsent: true` → 400 `HEALTH_CONSENT_REQUIRED` "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad." Con `healthConsent: true` registra versión y fecha.
- **Personal:** sin cambio.
- **Usuaria inexistente** → 404 (antes, 500).

**Cuestionario (`POST /api/auth/onboarding`):** la misma regla cuando reporta una lesión.

**`DELETE /api/me/health-consent`:** borra `health_notes`, `has_injury`, `injury_details` y el consentimiento, y devuelve la usuaria.

**`mapUser`:** agrega `privacyNoticeVersion`, `healthConsentVersion` y `healthConsentAt`.

**App:**
- **Registro:** casilla opcional con el texto `HEALTH_CONSENT_TEXT` y liga al aviso.
- **Perfil · Salud:**
  - Sin consentimiento vigente muestra la casilla. Guardar notas nuevas sin marcarla no manda nada y dice "Marca la casilla para guardar tus datos de salud."
  - Con consentimiento: "Autorizaste el tratamiento de tus datos de salud el {fecha}." y "Retirar mi consentimiento" (confirma y borra).
- **Cuestionario:** la casilla, obligatoria si reporta una lesión.
- **`/legal/privacidad`, aviso integral en HIVE:**
  - **Encabezado:** versión y fecha.
  - **Responsable:** HIVE Pilates Studio, Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX.
  - **Contenido:**
    - datos que recabamos;
    - finalidades primarias y secundarias, con cómo negarse;
    - datos sensibles de salud, con consentimiento expreso y revocación;
    - remisiones a encargados (hosting, correo, WhatsApp, pagos con tarjeta, almacenamiento de archivos y pases digitales), sin nombrar proveedores;
    - transferencias (Wellhub, sólo a quien reserva por Wellhub, y autoridades);
    - derechos ARCO, revocación y limitación, con el medio, los requisitos y los plazos;
    - almacenamiento local y cookies (sesión y preferencias; sin rastreo de terceros);
    - seguridad, conservación y baja (anonimización del bloque 2);
    - cambios al aviso;
    - contacto.
  - **Medio ARCO:** `STUDIO.privacyEmail = null` y el aviso dice "en recepción, en el domicilio del estudio, o por el medio que el estudio publique en esta página". Si algún día hay correo, el aviso y `LegalContact` lo muestran.

**Pendientes del dueño y del abogado (no bloquean la implementación):**
- **El texto de los tres documentos debe revisarlo un abogado** antes de darlo por definitivo: aviso, términos y responsiva.
- Nombre o razón social del responsable y, si aplica, RFC.
- El correo o medio electrónico para solicitudes ARCO (`STUDIO.privacyEmail`).
- La autoridad ante la que se presentan quejas (la reforma de 2025 a la LFPDPPP cambió la autoridad).
- Los plazos de respuesta (el aviso dice 20 días hábiles para responder y 15 para hacer efectiva la solicitud).

### 3.8 Marca HIVE en legales y responsiva (punto 7)

- **`LegalLayout`:** el logotipo y el © usan `STUDIO.name`. `LegalContact` quita `info@almamovement.mx`, muestra `STUDIO.privacyEmail` si existe y agrega el horario.
- **`studio.ts`:** gana `privacyEmail: null` con la nota de pendiente.
- **Términos, en HIVE y Coyoacán:**
  - sin Banorte ni el nombre de la titular de Alma;
  - cupo "el que muestra la app";
  - reservas que cierran 2 horas antes y la regla de la fila;
  - las cancelaciones remiten a la Política de cancelación (sin repetir números);
  - uso de imagen sólo con la autorización de la responsiva;
  - reembolsos sólo si el estudio los aprueba, con el ajuste de clases.
- **Cancelación y Privacidad:** sus tareas las reescriben en HIVE (§3.4 y §3.7).
- **Responsiva:**
  - **Texto:** `server/lib/responsiva.js` y `responsivaContent.ts` guardan `v1` (Alma, histórico) y `v2` (HIVE); la vigente es `v2`. Una prueba compara el `v2` del servidor con el de la app.
  - **"Mi responsiva":** muestra la versión firmada, con el subtítulo "Tu responsiva y consentimiento informado, en la versión que firmaste (vN).".
  - **Firma:** el diálogo manda `waiver_version`.
  - **PDF:** imprime el texto y el nombre del estudio de esa versión.
- **`DEFAULT_POLICIES_SETTINGS`** (servidor) pasa a HIVE y remite a las páginas.
- **Pruebas:** las que decían "lo decide el sub-proyecto A" (`app-zone.test.ts`, `Responsiva.dark.test.ts`, `Wallet.dark.test.ts`) pasan a exigir HIVE y `hive-pass.pkpass`.

### 3.9 Planes: archivar en vez de borrar con todo

**`DELETE /api/plans/:id`:**
- 404 si no existe.
- **Con membresías, órdenes o códigos de descuento:**
  - `is_active = false`, `archived_at = COALESCE(archived_at, NOW())` y `archived_by`;
  - bitácora `plan.archive` con `for_sale` antes → después y `meta.kept`;
  - 200 "Plan archivado: tiene membresías, órdenes o códigos de descuento, así que se ocultó de la venta y su historial se conserva.";
  - `?cascade=true` se ignora (queda `meta.cascade_requested`).
- **Sin nada ligado:** se borra (con `SAVEPOINT`; si otra tabla lo referencia, 23503 → se archiva) y queda `plan.delete`.

**Panel:**
- "Eliminar" explica "Si el plan tiene membresías, órdenes o códigos de descuento, se archiva: deja de venderse y su historial se conserva. Si no tiene nada ligado, se borra."
- Se quita el caso especial por nombre.
- La tarjeta dice "Archivado" si `archivedAt` y no está activo.

## 4. UI (resumen)

Textos en español.
- **Panel:** clases del tema, sin hex (salvo la marca Wellhub ya permitida) y texto de al menos 12 px.
- **App:** tema oscuro terracota y el guardia de zona de `src/design/zoneGuard.ts`.
- **Legales:** tema claro con los tokens `COLOR` de siempre; los textos de 11 px suben a 12 px.

| Pantalla | Qué cambia |
|---|---|
| Configuración · Políticas | Panel "Cancelaciones": "Cancelaciones permitidas por paquete" (0 = sin límite), la ventana y el cierre (sólo lectura), la vista previa "Así se publica" y "Guardar" (sólo dueña; recepción ve "Sólo la dueña puede cambiarlo."). Panel "Textos legales" con las tres ligas |
| Personas · Ficha | La tarjeta de membresía dice "Cancelaciones: N de M" o "N usadas · sin límite". "Editar membresía" gana "Cancelaciones usadas" (se ajusta con el mismo "Motivo del ajuste") |
| Reservas · Lista de espera | Posición del servidor, subtítulo nuevo y "Sin clases disponibles · se salta" |
| Reservas · Cancelar reserva | Aviso de quién subió de la fila |
| Check-ins Wellhub / Wellhub | §3.5 |
| Cobros · Historial | §3.6 |
| Planes | §3.9 |
| Bitácora | Etiquetas: "Subió de la lista de espera", "Reembolso total" o "Reembolso parcial", "Plan archivado", "Plan borrado (sin historial)", "Política de cancelación cambiada" y "Check-in (Wellhub)". Filtros nuevos: "Reembolsos", "Planes" y "Configuración" |
| App | §3.4, §3.7 |
| Legales | §3.4, §3.7, §3.8 |

## 5. Errores

| Situación | Respuesta |
|---|---|
| Cuota agotada (clienta) | 403 `CANCELLATION_LIMIT` |
| Cancelar una reserva con asistencia o falta (clienta) | 409 `ATTENDANCE_RECORDED` |
| Cuota inválida | 400 "Escribe un número entero de 0 a 20." |
| Recepción cambia la cuota | 403 |
| Cuota por la ruta genérica | 400 |
| `cancellationsUsed` inválido | 400 "Las cancelaciones usadas deben ser un número entero de 0 en adelante." |
| Motivo faltante (ajuste o reembolso) | 400 `REASON_REQUIRED` |
| Reembolso fuera de regla | 409 con `code` o 400 con el motivo (§3.6) |
| Reembolso por recepción | 403 |
| Salud sin consentimiento (clienta) | 400 `HEALTH_CONSENT_REQUIRED` |
| Versión de responsiva desconocida | 400 "Versión de responsiva desconocida." |
| Mes inválido en check-ins de Wellhub | 400 "Mes inválido (usa AAAA-MM)." |
| Check-ins de Wellhub por recepción | 403 |
| Ids que no son UUID | 400 "Identificador inválido" (validador común de siempre) |

Ninguna entrada mala da 500; los errores de base inesperados siguen como 500 "Error interno".

## 6. Pruebas

Cada punto con su prueba en rojo primero.

**Unitarias (`node:test`):**
- `audit.test.js`: actor de sistema y acciones y entidades nuevas.
- `cancellationPolicy.test.js`.
- `membershipAdmin.test.js`: `cancellations_used` pide motivo; el mismo valor no cuenta.
- `waitlist.test.js`.
- `wellhub/reconcile.test.js`.
- `refunds.test.js`.
- `privacy.test.js`.
- `responsiva.test.js`.

**Rutas** (`server/tests/*.test.mjs`, base desechable):
- `esquema-bloque3.test.mjs`: columnas, tabla e índice; el arranque sin la reconciliación y sin `UPDATE`/`DELETE` en el bloque nuevo.
- `cuota-cancelaciones.test.mjs`: cuota por defecto 2 y el 403 al tercer intento; salir de la fila con la cuota agotada → 200 sin sumar ni registrar falta; la ventana real; la dueña cambia la cuota y recepción no; 0 = sin límite; la ruta genérica → 400; el ajuste con y sin motivo, y por recepción; una reserva con asistencia → 409; `/memberships/my` con la cuota.
- `lista-espera.test.mjs`: la subida al cancelar el estudio; el salto a quien no tiene clases; "nadie se la salta"; la nueva sube si las de adelante no pueden; la ventana de 2 h; subir el cupo; cancelar la membresía; reabrir; posiciones y conteo; concurrencia (dos liberaciones con dos y con una en fila; cancelación y reserva a la vez).
- `wellhub-checkin.test.mjs`: webhook firmado → `checked_in_at` y bitácora "Wellhub"; "Primera vez"; conciliación del mes; 403 y 400; la cancelación por webhook.
- `reembolsos.test.mjs`: total, parcial, más de lo cobrado, dos totales (en serie y en paralelo), sin motivo, recepción 403, cortesía, Wellhub, clases de más, reportes, `/api/payments` y dashboard netos.
- `privacidad-consentimiento.test.mjs`: registro con y sin casilla; editar salud sin casilla → 400 sin cambios; editar otros datos sin casilla → 200; con casilla → versión y fecha; retirar; personal sin bloqueo; cuestionario.
- `marca-legales.test.mjs`: versión de la responsiva (`v2` por defecto, `v1` intacta, versión mala → 400, PDF de una `v1`), `hive-pass.pkpass` y textos por defecto sin Alma.
- `planes-archivar.test.mjs`: archivar con membresía u orden, borrar sin nada, `cascade` ignorado, código de descuento.

**Panel y app (vitest):** `booking-policy`, `audit-log`, `SettingsPage` (Políticas), `ClientDetail` (cancelaciones), `Waitlist`, `BookingsList` (subida), `BookClassConfirm`, `MyBookings` (cancelar y fila), `BookClasses` (fila), `Cancelacion`, `PartnerCheckins`, `AdminLayout` (Wellhub sólo dueña), `ClassesCalendar`, `paridad-velan`, `PaymentsHistory` y `RefundDialog`, `payments-summary`, `refund-math`, `Privacidad`, `Register`, `ProfileEdit`, `privacy-notice`, `Terminos`, `responsivaContent`, `studio` y las pruebas de marca actualizadas.

**Verificación:**
- **Suites:** `npm test`, tsc y build con Node 20.
- **Regresión:** completa en base desechable.
- **Integración entre tareas:** `integracion-bloque3.test.mjs`. La cancelación de la clienta, el reembolso total y la cancelación por Wellhub suben la fila; la cuota no cuenta la subida.
- **Navegador:** recorrido con Playwright de Python del panel y de la app de clientas a 1280 y 390 px, con comprobaciones en la base.

## 7. Fuera de alcance

- **Revertir puntos de lealtad al reembolsar:** no hay registro de cuántos puntos dio cada compra (depende de la vía y de la configuración de su momento). Revertir a ciegas podría quitar puntos que nunca se dieron.
- **Reembolsos de membresías viejas sin orden, de visitas Wellhub y por pasarela (Stripe):** decisión del dueño; lo viejo no tiene orden a qué ligar el reembolso.
- **Consentimiento cuando el personal captura salud** (ficha, alta manual, visitas): el pedido era el registro y el formulario de la clienta. Queda para cuando el estudio defina cómo recaba el consentimiento en recepción.
- **Lugar retenido con plazo para aceptar:** el dueño decidió inscribir directo.
- **Editar la ventana de 12 h en Configuración:** vive en `loyalty_config` y su pantalla (Lealtad) está apagada. Se muestra sólo de lectura.
- **La fila y Wellhub:** las reservas por Wellhub usan su propio cupo de canal y no pasan por la fila.
- **Plantilla editable `waitlist_promoted`:** no se agrega a `DEFAULT_NOTIFICATION_TEMPLATES`, para no chocar con la rama que quitó Alma de WhatsApp. Sale el texto de respaldo, y una plantilla guardada con esa llave la reemplaza.
- **CMS de textos legales:** los textos quedan versionados en el código. Editarlos desde el panel requiere un diseño propio (versiones, fecha y reconsentimiento).
- **Reagendar atómico (C4), límites por día (B7), congelar paquetes (D7).**
- **La marca:** HIVE es intencional.
