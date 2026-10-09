# HIVE — reservas, créditos, recepción y asistencia

Corte: 2026-10-08. Fuente HEAD `e76f73ff156d59f5feabe10dca67b1c6e8897a17`. Skill pilates-studio-auditor, matriz B/C/F, regresiones operación/validación y edge cases pertinentes. Auditoría, sin correcciones ni deploy ni escrituras productivas.

## Evidencia y límites

- `node scripts/audit-bookings-credits.mjs`: API real local + PostgreSQL embedded desechable, dos solicitudes simultáneas para cupo y cancelación; terminado `AUDIT COMPLETE`. Evidencia de respuestas y estado persistido en `reservas-creditos-evidencia.jsonl` (sólo datos sintéticos).
- Aislamiento: puertos loopback efímeros, directorio temporal propio, variables mínimas, `DOTENV_CONFIG_PATH=/dev/null`, sin tokens de proveedores; API y PostgreSQL apagados en finally. No se hereda DATABASE_URL. Carga snapshot schema_complete más bootstrap real. Crea fixture schedule_slots explícito por incompatibilidad conocida snapshot; **no prueba migración limpia autónoma ni esquema productivo**.
- Unitarias bookingRules/checkin/waitlist: **24/24**.
- Vitest BookingsList, cancelación/responsiva, MyBookings.cancelar, ClientDetail y PaymentsPage: **6 archivos,46/46**. DOM mock, no navegador contra API. Aviso accesibilidad DialogContent sin Description no fatal.
- Política fixture observada: cancelWindowHours12,cancellationLimit0; devuelve crédito a tiempo. **No demuestra ni cambia política vigente de producción**. El pedido anterior de 3 horas fue cancelado por usuario; no se implementa aquí.
- No cargos, correos, WhatsApp ni prueba de lector físico. No validación de PWA ni caché productiva.

## Hallazgos reproducidos

### P1 RC-01: se permite no-show antes de la clase y desde lista de espera

`server/index.js:15626` PUT `/api/bookings/:id/no-show` sólo excluye cancelled/no_show; no valida fecha, hora ni confirmed/checked_in.

Reproducción: crear clase CURRENT_DATE+3, reserva confirmed. PUT devuelve200 y persiste no_show tres días antes (créditos3 después del débito de reserva). Crear otra reserva waitlist en clase llena, mismo PUT devuelve200 no_show, saldo4; esa persona nunca obtuvo lugar. Riesgo: faltas/penalizaciones injustificadas; RG50/C3/B11. Corrección propuesta: servicio transaccional único con estados permitidos y tiempo de inicio+tolerancia validado bajo lock. Regresión: futuro, waitlist, borde de tolerancia, reintentos, rollback.

### P1 RC-02: una invitada incluida consume además crédito normal en walk-in

`server/index.js:10752` elige membresía anfitriona que tiene guest_passes; `server/index.js:10830` crea booking y `10837` descuenta siempre si classes_remaining no es NULL. Contrasta con `/bookings/with-guest` (`11005`) y `/admin/bookings/assign` (`15292`), que no descuentan crédito normal si guest_passes>0.

Reproducción: plan configurable4clases+2guestpass, anfitriona saldo4, `POST /admin/classes/:id/walkin-visit` con hostUserId y visitante.201; saldo3; el booking también cuenta para los2pases. Causa cobro de beneficio doble por elegir pantalla diferente. Afecta configuraciones futuras permitidas por editor; mensual/anual actuales de créditos NULL no muestran este débito numérico. RG53/B9. Cierre: mismo selector/consumo de beneficio que resto rutas, procedencia y devolución simétricas, pruebas limitado/ilimitado/pase agotado.

### P2 RC-03: agotamiento de guest passes muestra500 genérico

Mismo endpoint, `server/index.js:10855` catch genérico. Con plan ilimitado+2guestpass, dos visitantes201; tercero500 «Error interno». Trigger `server/lib/planSchema.js:68` bloquea correctamente con HIVE_PLAN y rollback deja sólo2reservas. **No es sobreconsumo ni pérdida de atomicidad**. Falta traducir a403/409 con mensaje accionable. Otras rutas sí traducen HIVE_PLAN. Evidencia API_ERRORS del script.

## Ruta principal pedida: sin paquete → venta → reservar

Cubierta en API admin y recepción. La ficha `src/pages/admin/clients/ClientDetail.tsx:204` enlaza «Vender plan» a `/admin/payments?clienta=id`; `PaymentsPage.tsx:134` POST/memberships. Luego clase→asignar (`BookingsList.tsx:358`). Prueba: asignar sin paquete403; venta normal$330efectivo201 crea orden ligada/membresía4créditos; asignar201 deja3. Rol reception también recibe201 al vender y asignar. Pruebas DOM cubren enlace y venta. No prueba navegación visual completa con API real.

La variante «Visita» (`VisitAssignDialog.tsx:118`) sólo ofrece is_visit_pack, y endpoint rechaza plan normal404. Es contrato particular/observación UX; **no se declara falta global de venta** porque ruta normal anterior funciona.

## Matriz acotada (sin extrapolar a producción)

| IDs | Estado | Evidencia / límite |
|---|---|---|
| B1 | Parcial | Contadores DB coinciden al final; no realtime navegador |
| B2,B8,B13 | Cubierto API | Reserva, rechazo sin paquete y asignación admin/recepción con saldo |
| B3 | No verificable/N-A por decidir | No se asume cama numerada |
| B4 | Parcial | Último cupo genera waitlist; posición visible no ejercida |
| B5 | Cubierto API política automática | Cancelación promueve una vez con débito único; política declara subida automática en código, no exige aceptación |
| B6 | Parcial inspección | Cierre BOOKING_LEAD_HOURS; configurabilidad completa no ejercida |
| B7 | Parcial | Reglas de horario rechazadas; límite diario protegido trigger; empalmes no probados |
| B9 | Parcial | RC-02 y RC-03 |
| B10 | No verificable | Recurrencia no ejercida |
| B11 | Parcial | RC-01 |
| B12 | Parcial | DOM cancelación pasa; navegación/historial real no probado |
| B14 | N/A provisional | HIVE una ubicación; aislamiento multisede no auditado |
| C1 | Cubierto API fixture | Dos DELETE concurrentes200/400; devolución una vez; siguiente waitlist confirmado |
| C2 | Parcial | Unitarias y código, no tiempo real límite API |
| C3 | Parcial | RC-01 |
| C4 | Cubierto API básico | Reagendado con saldo0 conserva0, nuevo confirmed y origen cancelled |
| C5,C6,C7 | Delegado | Auditoría clases; no evaluado aquí |
| C8 | Parcial | Unitarias waitlist; salida API no ejercida |
| F1,F2,F3,F8 | Parcial | Manual con último crédito consumido:0→0, dos PUT200 segundo alreadyCheckedIn; QR/lector físico no ejercidos |
| F4 | Parcial | Venta/asignación funciona; variante invitada RC-02/03; no alta+asistencia en un único flujo visual |
| F5 | Parcial inspección | checkinRule sólo abre90min antes y mismo día; no cierre tardío configurable, política comercial por confirmar |
| F6 | N/A | Wellhub desactivado por usuario |
| F7,F9 | No verificable | Offline y vista coach no ejercidos |
| EC1 | Cubierto API concurrente | Dos clientes una plaza:1confirmed+1waitlist, saldo total7 de8 |
| EC2 | Parcial | Cancelación doble y checkin doble pasan; todas rutas concurrentes no probadas |
| EC4 | Parcial | Membresía futura rechazada; vencimiento entre reserva/clase no ejecutado explícitamente |
| EC13 | No verificable | Selector determinista inspeccionado, múltiples paquetes no ejercidos |
| EC27 | Cubierto conjunto ejecutado | Query mismatches current_bookings versus confirmed/checked_in=[] |
| EC28 | No verificable | No navegador con caché preexistente |

## Lo que no se debe afirmar

No afirmar «todos los flujos pasan» ni GO comercial. Hay dos fallos funcionales reproducidos y un error de mensaje. No se ensayaron todos los cruces de lock, fallos intermedios de ledger, todos los roles/UI, crédito mixto, QR físico, lectores, internet caído ni recuperación. Ningún hallazgo fue corregido en esta auditoría.
