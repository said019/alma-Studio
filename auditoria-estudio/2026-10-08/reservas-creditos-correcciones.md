# Correcciones autorizadas — 2026-10-08

Estado: implementadas y probadas localmente en API real y PostgreSQL desechable. Sin deploy, commit ni mutaciones productivas por este agente. Diagnóstico histórico conservado en reservas-creditos.md.

- **RC01**: no-show sólo confirmed/checked_in de clase iniciada y no cancelada. Clase/reserva bloqueadas dentro de transacción; reintento no_show devuelve mismo registro sin repetir penalización. No se inventa tolerancia: mínimo inicio de clase. Futuro/waitlist devuelven409 sin mutación; caso iniciado200 y reintento alreadyNoShow.
- **RC02**: walk-in usa selector compartido de guestpasses y no debita crédito normal cuando el pase es beneficio incluido. Incluso saldo normal0 puede utilizar pase incluido si resto reglas permite. Las tres rutas guest guardan procedencia durable `bookings.partner_metadata.hive_guest_pass=true`; las devoluciones con bookingId no acreditan clases no consumidas. Metadata usa columna ya existente, sin migración. Respuesta de saldo corregida también en /with-guest y /assign.
- **RC03**: selector evita tercero con dos pases agotados, devuelve400 accionable; guard DB HIVE_PLAN se traduce a403 si hay cambio concurrente, sin500 genérico.
- **ID01**: validación registro servidor previa a cualquier escritura: nombre/email tipos, contraseña8+mayúscula+número, teléfono válido normalizado E164 con libphonenumber-js (mismo que UI; defaultMX si nacional), acepta términos booleantrue, género del enum, fecha obligatoria YYYY-MM-DD con roundtrip exacto,1900..hoy. No agrega política de menores. Opt-in comunicaciones/salud mantiene su independencia.

## Pruebas

`node scripts/audit-bookings-credits.mjs`: completo, API+DB efímera sin credenciales externas. Nuevas aserciones: saldo guest4→4 y cancelación4; reservas futuro/waitlist conservan estado; no-show iniciado/retry; cuatro registros inválidos400 y USA válido201 conserva+14155552671. Conserva carrera último cupo, doblecancel/promoción, venta/asignación admin/recepción, checkin saldo0, reagendado saldo0 y contador sin discrepancias. Evidencia nueva en reservas-creditos-corregido-evidencia.jsonl.

`node --test server/lib/registrationValidation.test.js server/lib/checkin.test.js server/lib/bookingRules.test.js server/lib/waitlist.test.js`:25pruebas pasan. Registro prueba fecha imposible/futura, tipos, terms falso/string, teléfono corto y númerosMX/USA.

## Límites

No se reescribe historial guest anterior sin marcador, pues no tiene evidencia suficiente para inferir qué ruta debitó. Helper conserva devolución histórica si no hay marcador. Los registros nuevos sí conservan procedencia. No se probó tiempo de tolerancia porque no existe política confirmada. Penalización falta/notificaciones mantienen mecanismos existentes; no se certifica entrega externa. Prueba de registro API no demuestra navegación de frontend ni sesión móvil. Publicación y verificación de producción quedan al agente principal.
