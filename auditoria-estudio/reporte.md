# Auditoría — Alma Movement · 8 sep 2026

Commit `b4de7dc` · 111 escenarios recorridos · 245 rutas API barridas · 47 rutas de UI en navegador · pruebas de concurrencia con lectura en base.
Todo se ejecutó en una **base desechable aislada**. No se tocó producción, no se cobró, no se envió ningún mensaje.

---

## Resumen ejecutivo

El sistema está **mucho más completo de lo habitual** en esta etapa: el núcleo de reservas es sólido y resistió todas las pruebas de concurrencia (8 clientas peleando la última cama → exactamente 3 confirmadas y 5 en lista de espera, sin sobreventa). Cancelar devuelve el crédito una sola vez, el precio siempre lo pone el servidor, y las 47 pantallas cargan limpias.

Pero **hay tres agujeros que cuestan dinero todos los días**:

1. **Cada clase cuesta 2 créditos en vez de 1.** Un paquete de 8 rinde 4. Probado: 8 → 7 al reservar → 6 al hacer check-in.
2. **El dashboard muestra $0 de ingresos del día en curso.** Con $920 vendidos hoy y 17 reservas, la dueña ve `monthlyRevenue: 0`.
3. **Ninguna venta de mostrador entra en el reporte de ingresos.** Efectivo y transferencia crean la membresía pero no generan orden, y los ingresos se calculan sólo sobre órdenes.

Además: la contraseña del admin está escrita en el repositorio **y se reimpone en cada arranque** (si la dueña la cambia, el siguiente deploy la revierte), y **recepción tiene acceso total** a ingresos, reportes y datos bancarios.

**Los tres quick wins** (P0-1 borrar un trigger, P0-2 una línea de fecha, P0-4 quitar el reset de contraseña) son de horas, no de semanas, y cierran lo más caro.

**Veredicto: NO-GO para lanzamiento comercial** hasta cerrar P0-1 a P0-4. El núcleo operativo (reservar, cancelar, check-in, vender) funciona; lo que falla es la **contabilidad de créditos y de dinero**, que es justo lo que rompe la confianza de una clienta y la caja de la dueña.

---

## Scorecard por dominio

| Dominio | ✅ | ⚠️ | ❌ | ➖ | ❓ | n | Cobertura |
|---|---|---|---|---|---|---|---|
| A — Registro e identidad | 6 | 2 | 2 | 0 | 0 | 10 | 🟡 60 % |
| B — Horarios y reservas | 8 | 3 | 1 | 1 | 0 | 13 | 🟡 67 % |
| C — Cancelaciones y waitlist | 3 | 3 | 1 | 0 | 1 | 8 | 🔴 38 % |
| D — Paquetes y membresías | 6 | 4 | 3 | 0 | 0 | 13 | 🟡 46 % |
| E — Pagos | 1 | 3 | 4 | 1 | 1 | 10 | 🔴 11 % |
| F — Check-in y asistencia | 5 | 2 | 2 | 0 | 0 | 9 | 🟡 56 % |
| G — Wallet passes | 3 | 3 | 0 | 0 | 1 | 7 | 🔴 43 % |
| H — Notificaciones | 7 | 2 | 1 | 0 | 0 | 10 | 🟢 70 % |
| I — Panel admin | 4 | 3 | 3 | 1 | 0 | 11 | 🔴 40 % |
| J — Instructoras | 4 | 1 | 0 | 0 | 0 | 5 | 🟢 80 % |
| K — Reportes | 4 | 1 | 2 | 0 | 0 | 7 | 🟡 57 % |
| L — Seguridad y datos | 2 | 2 | 2 | 1 | 1 | 8 | 🔴 29 % |
| **Total** | **53** | **29** | **21** | **4** | **4** | **111** | **50 %** |

*E (pagos) sale bajo en parte porque Stripe no era verificable sin credenciales: 3 de sus escenarios están implementados pero sin probar.*

---

## P0 — Sangra dinero o confianza YA

### P0-1 · Cada clase descuenta 2 créditos ✅ CONFIRMADO
**Qué pasa hoy.** Al reservar, el handler descuenta 1 crédito. Al hacer check-in, el trigger de base `trigger_decrement_classes` descuenta **otro**.
**Prueba:** saldo 8 → reservar → 7 → check-in → **6**. Una clase, dos créditos.
**Dónde.** `server/index.js:3673` (`consumeMembershipCredit`) y `supabase/migrations/schema_complete.sql:1486-1502`.
**Por qué existe.** El esquema original descontaba al asistir; la app se movió a descontar al reservar y nadie quitó el trigger.
**Impacto.** Un paquete de 8 clases ($1 760) entrega 4. Es la queja número uno que va a llegar por WhatsApp.
**Fix.** `DROP TRIGGER trigger_decrement_classes ON bookings;` — el descuento al reservar ya es correcto y ya es idempotente.
**Regresión de cierre.** Reservar + check-in debe dejar el saldo en `inicial − 1`.

### P0-2 · El dashboard oculta todo lo que pasó hoy ✅ CONFIRMADO
**Qué pasa hoy.** `parseDateRange` cierra el rango con `to.toISOString().slice(0,10)`, o sea la **medianoche** de hoy. Todo lo del día queda fuera.
**Prueba:** por defecto `monthlyRevenue=0, monthlyBookings=0, newMembers=0`; con `to=mañana`, los mismos datos dan `920`, `17`, `13`.
**Dónde.** `server/index.js:11057-11080`.
**Agravante.** Como `toISOString()` pasa a UTC, después de las 18:00 hora de México el rango salta al día siguiente y las cifras "se arreglan solas". La dueña ve números distintos según la hora.
**Fix.** Que `to` sea el final del día (`to + 1 día`, o `< to+1`) y construir la fecha en zona local, no con `toISOString()`.

### P0-3 · Las ventas de mostrador no existen para el reporte de ingresos ✅ CONFIRMADO
**Qué pasa hoy.** `POST /api/memberships` (la venta en efectivo/transferencia) crea la membresía pero **no crea orden**. `/api/reports/revenue` suma `orders WHERE status='approved'`.
**Prueba:** venta de $920 en efectivo → membresía activa, órdenes aprobadas sin cambio, reporte de ingresos idéntico antes y después.
**Dónde.** `server/index.js:12816` vs `11232`.
**Impacto.** En un estudio mexicano donde buena parte se cobra en efectivo o transferencia, el número de "cuánto entró este mes" está incompleto por construcción.
**Nota.** La tabla `payments` existe pero está **muerta**: 0 escrituras y 0 lecturas en 16 170 líneas.
**Fix.** Que la venta manual genere una orden `approved` (o que el reporte una `orders` + `memberships` con pago registrado). Elegir una sola fuente de verdad de ingresos.

### P0-4 · Contraseña de admin en el repositorio y reimpuesta en cada arranque ✅ CONFIRMADO
**Qué pasa hoy.** `Alma$Reformer2026!` está escrita en `server/index.js`, y el bootstrap hace `ON CONFLICT (email) DO UPDATE SET password_hash = $1`: **cada reinicio revierte la contraseña del admin al valor por defecto.**
**Prueba:** login exitoso con esa contraseña contra una instalación limpia.
**Impacto.** Cualquiera con acceso al repositorio entra como dueña. Y aunque ella la cambie, el siguiente deploy la devuelve.
**Fix.** Sembrar sólo si no existe (`DO NOTHING`), exigir `ADMIN_PASSWORD` por entorno y rotar la actual.

### P0-5 · Datos bancarios reales en el código ✅ CONFIRMADO
**Dónde.** `server/index.js:70-75`: banco, titular, número de cuenta y CLABE de la dueña, como constante en un repositorio git.
**Fix.** Moverlos a `settings`/variables de entorno (ya existe `PUT /api/admin/bank-info`) y purgarlos del historial.

---

## P1 — Cuesta clientas o carga operativa medible

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| P1-1 | **Recepción tiene permisos de dueña.** `adminMiddleware` acepta el rol `reception`: 200 en las 60 rutas admin evaluadas, incluidos `/api/reports/revenue`, `/api/payments`, `/api/admin/bank-info` y los datos de salud de las clientas | probado por barrido de roles | ✅ confirmado |
| P1-2 | **Editar borra datos en silencio.** `PUT /api/instructors/:id` es de reemplazo: cambiar sólo el nombre devuelve 200 y deja email, teléfono y bio en `NULL`. Mismo patrón en `PUT /api/plans/:id` | probado: `coach@qa.local / 5511111111 / bio` → `NULL / NULL / NULL` | ✅ confirmado |
| P1-3 | **"Cerrar" y "Reabrir" clase están muertos desde que se crearon.** El enum `class_status` no tiene el valor `'closed'` → siempre `500`. El botón *Reabrir* existe en `ClassesCalendar.tsx:845` | `invalid input value for enum class_status: "closed"` | ✅ confirmado |
| P1-4 | **Sin log de auditoría.** La tabla `admin_actions` existe y tiene **0 usos** en el código. No hay forma de saber quién ajustó un saldo | grep | ✅ confirmado |
| P1-5 | **Sin trazabilidad de créditos (I11).** No existe ledger: ante "¿por qué me descontaron esta clase?" no hay respuesta en el sistema | esquema | ✅ confirmado |
| P1-6 | **El contador de ocupación suma doble.** El trigger `update_class_booking_count` y el handler incrementan ambos: 1 reserva → `current_bookings = 2`. La clienta no lo ve (la PWA calcula en vivo), pero **`/api/admin/classes` sí devuelve el valor inflado**, así que la ocupación que ve la dueña es falsa | probado: contador 2 vs 1 reserva real | ✅ confirmado |
| P1-7 | **Lo desplegado no es lo que está en el código.** `dist/` es del **16 jun**; el fuente, del **24 jul**. El panel de Wellhub (el trabajo más reciente) simplemente no existe en el artefacto: `/admin/settings/platforms` daba 404 hasta que reconstruí | probado antes/después de `vite build` | ✅ confirmado |
| P1-8 | **`npm test` no corre los tests del servidor.** `vitest.config.ts` incluye sólo `src/**`; los **38 tests** de reglas de reserva, precios, faltas y firma de Wellhub (que pasan con `node --test`) nunca se ejecutan | probado | ✅ confirmado |
| P1-9 | **Lista de espera sin promoción automática (B5/H4).** El estado `waitlist` existe y funciona, pero al liberarse un lugar nadie avanza ni recibe aviso | código | ✅ confirmado |
| P1-10 | **Sin reembolsos (E6) ni congelamiento (D7).** Dos peticiones que llegan cada semana en un estudio y hoy sólo se resuelven editando la base | código | ✅ confirmado |
| P1-11 | **Notificaciones sin cola durable (H10).** Los envíos viven en `setInterval`; un reinicio pierde lo pendiente y no hay reintentos | código | ⚠️ plausible (proveedores apagados) |

---

## P2 — Operación y pulido

- **Familia: JSON malformado → 500 en 94 rutas.** Falta un manejador de error del body-parser. Un solo `app.use((err,req,res,next) => err.type==='entity.parse.failed' ? res.status(400)... )` cierra las 94.
- **Familia: parámetros sin validar → 500.** UUID basura, fechas imposibles o negativos en la ruta llegan crudos a Postgres (`22P02`). ~236 sondas devolvieron 500. Un middleware de validación de params lo cierra de una vez. *(No es inyección: las consultas están parametrizadas.)*
- `POST /api/memberships` sin `paymentMethod` → 500: el default es `"efectivo"`, que **no es un valor del enum** (`cash|transfer|card|online`).
- `PUT /api/classes/:id/close` devuelve `err.message` al cliente — filtra detalle interno.
- `POST /webhooks/wellhub/debug/echo` es un endpoint público de depuración.
- 53 usos de `CURRENT_DATE`: si el servidor corre en UTC (default de Railway) y el estudio es UTC−6, las vigencias cambian de día 6 h antes.
- Tabla `payments` muerta (0 lecturas / 0 escrituras).
- `server/index.js` con 16 170 líneas y ~38 tablas creadas en caliente por `ensureSchema()` en cada arranque.
- Faltan: export CSV (K7), merge de duplicados (A10), ARCO/borrado de cuenta (A9/L3), reagendado atómico (C4), reserva recurrente (B10), gift cards (D10), CFDI (E9), fallback offline de check-in (F7), vista propia de instructora (J1).

---

## Quick wins (mayor impacto / menor esfuerzo)

| # | Acción | Esfuerzo | Cierra |
|---|---|---|---|
| 1 | `DROP TRIGGER trigger_decrement_classes ON bookings` | minutos | **P0-1** — deja de cobrar doble |
| 2 | Que el rango de reportes termine al **final** del día y se construya en hora local | ~1 h | **P0-2** — el dashboard vuelve a ser cierto |
| 3 | Bootstrap del admin con `DO NOTHING` + `ADMIN_PASSWORD` obligatorio | ~1 h | **P0-4** — deja de revertir la contraseña |
| 4 | Separar `receptionMiddleware` de `adminMiddleware` y cerrar finanzas y datos de salud | ~3 h | **P1-1**, ayuda a **L2** |
| 5 | `COALESCE(campo, valor_actual)` en los PUT de reemplazo (instructores, planes) | ~2 h | **P1-2** — se acaba la pérdida silenciosa |
| 6 | Manejador de error de JSON + validador de params UUID/fecha | ~3 h | las dos familias de 500 |

Los tres primeros son de un día de trabajo y cierran lo más caro. Antes de cualquiera: **reconstruir y volver a desplegar el frontend** (P1-7) o nada de lo reciente estará en el aire.

---

## Regla de la dueña: "ninguna acción del panel debe dar 404 con ID válido ni 500"

**Confirmados (5):** `PUT /api/classes/:id/close` y `/reopen` (enum inexistente) · `PUT /api/instructors/:id` y `PUT /api/plans/:id` con cuerpo parcial (NOT NULL) · `POST /api/memberships` sin `paymentMethod` (enum inválido).
**Familias (2):** JSON malformado (94 rutas) · parámetro de ruta inválido (~236 sondas). Se reportan como **dos** hallazgos con un fix cada uno, no como 330.
**Refutados (3):** las 16 "fugas de guard" eran rutas `/api/me/*` donde la clienta *es* la dueña del recurso · el "saldo 2 → 3 reservas" era un error de conteo de mi prueba (el sistema contuvo correctamente) · los 404 de `/admin/settings/platforms` y `/admin/bookings/partners-checkins` eran el build viejo, no rutas rotas.
**Limpio:** 27/28 rutas del panel y 19/19 de la PWA a 390 px cargaron sin errores de consola, sin API ≥400, sin `undefined`/`NaN`/`Invalid Date`, sin pantallas en blanco ni scroll horizontal. Cliente → 403 y anónimo → 401 en las 147 comprobaciones de guard.

---

## Qué NO se probó

Stripe real (sin credenciales) · WhatsApp/Evolution y email reales (apagados) · Apple/Google Wallet (sin certificados) · Wellhub contra el sandbox del proveedor · la base de producción · restauración de respaldo · cobros o reembolsos reales · los crons con el paso del tiempo · dispositivos físicos y lectores de QR.

## Limpieza

La base desechable, el cluster de Postgres aislado y **todas** las fixtures `qa20260908_*` se eliminaron al cerrar. El único cambio que queda en el repositorio es `dist/` reconstruido (el anterior, de junio, está respaldado) y esta carpeta `auditoria-estudio/`.
