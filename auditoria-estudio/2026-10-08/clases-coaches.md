# HIVE — auditoría clases, coaches y roles (2026-10-08)

## Identidad y alcance

Repo `/Users/saidromero/Alma Studio/alma-Studio`, HEAD `e76f73ff156d59f5feabe10dca67b1c6e8897a17`. Railway servicio alma-web, producción: deployment `e1003020-552f-4e70-8f60-70528cdd2efb` SUCCESS, mismo commit. Cambio local previo en `src/pages/admin/classes/ClassesCalendar.tsx` (7 líneas) no tocado; tests frontend incluyen ese cambio. APIs auditadas usan fuente del commit desplegado, pero la DB productiva no fue mutada ni se comprobó equivalencia completa de constraints.

Se leyó skill pilates-studio-auditor y referencias matriz, operación, validación y auditoría productiva. Pruebas mutantes exclusivamente contra Embedded PostgreSQL temporal y servidor local con entorno mínimo, JWT sintético, DOTENV_CONFIG_PATH=/dev/null y sin credenciales externas. Base parte de schema_complete.sql y bootstrap real; fixture schedule_slots explicita domingo=0, como script de promociones existente. No migración completa desde base histórica ni pruebas reales de notificaciones. No correcciones, commits ni despliegues.

## Pruebas ejecutadas

- `node auditoria-estudio/2026-10-08/clases-coaches.integration.mjs`: terminado AUDIT COMPLETE; es un **reproductor de auditoría**, algunas respuestas registradas demuestran bugs y no son un gate verde.
- `node scripts/verify-bulk-classes.mjs`: PASS. PostgreSQL real, preview sin cambios, apply atómico, auditoría, hook waitlist simulado, acceso denegado, preview obsoleto, carrera reserva/cupo y conflicto contra escritura concurrente.
- `npx vitest run src/pages/admin/classes/GenerateClasses.test.tsx src/pages/admin/classes/ClassesCalendar.test.tsx src/pages/admin/staff/InstructorsList.test.tsx --maxWorkers=2`: 3 archivos, **10 tests pasaron**. DOM/jsdom y API mock: no se presentan como navegador de producción ni E2E financiero.
- Evidencia persistida: clases-coaches-evidencia.jsonl, clases-coaches-ui.log y clases-coaches-bulk.log.

## Hallazgos reproducidos

### CC01 — P0: reducción individual de cupo puede sobreocupar la clase

`server/index.js:17193` lee liveBookingCount fuera de transacción/lock; `17225` escribe después. Endpoint **sí usado por UI**: `src/pages/admin/classes/ClassesCalendar.tsx:225` edición y `:338` modificación de cupo.

Reproducción determinista: conexión A bloquea clase vacía; PUT maxCapacity=1 lee 0 ocupantes y queda esperando UPDATE (se confirma wait_event_type='Lock' en pg_stat_activity). A inserta 2 reservas bajo el lock y confirma; PUT devuelve **200** y persiste **max_capacity=1/current_bookings=2**. No se cambió código productivo para forzar el fallo. Es una ventana de concurrencia del flujo cotidiano; edición masiva sí la evita.

Cierre requerido: lock clase, lectura ocupación y update en una transacción común; regresión concurrente debe devolver conflicto y conservar capacidad >= ocupación.

### CC02 — P1: generador concurrente duplica la misma clase

`server/index.js:11247` SELECT existencia y `:11252` INSERT sin unique natural/serialización compartida. Dos POST `/classes/generate` idénticos devuelven 200/created=1 ambos; DB conserva **2 filas** fecha+hora+tipo iguales. Fixture añade trigger pg_sleep(0.4) sólo en DB desechable para que ambos SELECT ocurran antes de ambos INSERT. Equivale a dos procesos solapados; el test no afirma probabilidad cotidiana.

Cierre: serialización/constraint natural compatible entre generadores; dos requests deben resultar en una sola clase.

### CC03 — P1: una coach eliminada conserva acceso operativo

`server/index.js:14847` y `:14973` filtran usuario asignado pero no `instructors.is_active/deleted_at`. Tras DELETE /instructors/:id, GET roster con su rol instructor devuelve **200** y PUT staff/bookings/:id/check-in devuelve **200, checked_in**. Fixture vincula user_id sintético a la coach eliminada para probar el contrato; usuario sigue activo, como ocurriría si ya tenía acceso.

Además POST `/classes` acepta el id eliminado y crea nueva clase **201** (`server/index.js:9857`). Baja oculta listados pero no revoca la habilitación operativa. Debe fallar cerrado al asignar o actuar con coach inactiva/eliminada.

### CC04 — P1: permisos de instructora exceden sus clases

`server/index.js:145` incluye instructor/reception en OPERATIONS_ROLES y `:3281` lo aplica a CRUD general. Reproducido: client no crea coach (403); reception e instructor sí (201); instructor edita notas de clase de **otra coach** (200); reception borra clase ajena sin reservas (200). Contradice matriz I7 (instructora sólo sus clases, recepción no borra). El código comenta que es deliberado permitir operación; la definición de alcance de negocio debe resolverse explícitamente antes de cambiarlo, pero el acceso amplio está demostrado.

### CC05 — P1: horas/cupos inválidos se guardan

`server/index.js:9857–9886`: POST `/classes` devuelve **201** para inicio17:00/fin16:00/cupo=-2 y persiste los tres. `:17210` comprueba horas sólo cuando vienen ambas: PUT únicamente startTime16:00 sobre clase14:00–15:00 devuelve **200** y persiste16:00–15:00. Interfaz puede restringir campos pero API no protege el contrato. Validar estado final combinado, capacidad entera positiva y fecha/hora civil en todas rutas.

### CC06 — P1: cambiar horario reservado no notifica ni ofrece salida especial

PUT `/admin/classes/:id` (`server/index.js:17225–17251`) actualiza horario de clase con reservas y responde200; reproductor demuestra mantener dos reservas al mover20:00–21:00 a22:00–23:00. Ruta no encola aviso ni marca aceptación/opción de cancelación sin penalización. Edición masiva rechaza cambio horario si hay reservas (`server/lib/bulkClasses.js:35`), individual permite. C7 parcial. C6/J4 reasignan coach sin aviso en esta misma ruta: gap por inspección de código, no entrega de aviso externa probada.

### CC07 — P2: ruta legacy crear clase está rota

POST `/admin/classes` (`server/index.js:17146`) inserta columnas inexistentes `capacity/location` y no fecha; retorna **500**, PG columna capacity inexistente. UI actual usa POST `/classes` y no esta ruta, por eso no se confunde con fallo de crear clase desde calendario. Retirar/tombstone o unificar contrato.

## Cobertura por escenario de la skill

| ID | Estado | Evidencia y límite |
|---|---|---|
| I1 | Parcial | API CRUD coach/clase, borrar huérfana, generación y bulk probados; CC01/02/03/05. Tipos/layout completos no auditados aquí. |
| I2 | No verificable | Código vista diaria staff existe; flujo recepción completo con pagos pendientes no ejecutado. |
| I3 | No verificable | Delegado a reservas/ventas; fuera de pruebas de este agente. |
| I4 | No verificable | Delegado ventas. |
| I5 | No verificable | Delegado membresías. |
| I6 | Parcial | Cancelación clase devuelve crédito una vez y preserva historial; semana/rango no ejecutados en este script. |
| I7 | Parcial | Client denegado; permisos instructor/reception demasiado amplios CC04 y baja no revoca CC03. |
| I8 | Parcial | Bulk prueba fila audit por clase; cancel/delete implementan auditoría. CRUD simple coach/clase no demuestra todos eventos. |
| I9 | No verificable | Políticas completas fuera de alcance. |
| I10 | No verificable | HIVE se trata como un estudio; no se certificó aislamiento entre facilities. No marcar N/A sólo por columna nullable. |
| I11 | Parcial | Refund en cancelación verificado en saldo, ledger reconstruible completo delegado. |
| J1 | Parcial | Rutas scoped existen; baja sigue autorizada CC03; no navegador real. |
| J2 | Parcial | Proyección roster acotada/attentionNote por rol inspeccionada; primera visita no consta; coach eliminada accede. |
| J3 | Parcial | Check-in de coach borrada demuestra fallo; paso activo integral delegado al equipo. |
| J4 | Parcial | Reasignación disponible; no aviso en PUT simple (CC06). |
| J5 | No verificable | Nómina/conteo instructor por periodo no ejercido. |
| C5 | Parcial | Clase con booking confirmado: delete409, cancel devuelve crédito3→4, retry mantiene4; no entrega externa ni alternativas probadas. |
| C6 | Parcial | Reasignación actualiza sin notificación en ruta individual. |
| C7 | Parcial | Horario reservado actualiza sin consentimiento ni aviso, CC06. |

19 IDs únicos: 12 parciales y 7 no verificables. No atribuir porcentaje E2E verde a estos tests. Regresiones RG54/RG16 cubiertas con fallos, RG24/RG52 parcialmente pasan para cancelar/borrar clase individual, RG17 falla para coach eliminada.

## Lo que sí funcionó

Crear coach, editar nombre sin perder bio, borrado lógico ocultando listados y reteniendo relaciones; crear/editar clase válida; borrar clase huérfana; impedir borrar clase con historial; impedir status=cancelled por PUT genérico; cancelar clase y devolver crédito exactamente una vez en retry secuencial. Edición masiva con conflicto real revierte el conjunto y detecta preview viejo. Los happy paths no compensan CC01.

## Veredicto acotado

NO-GO para afirmar todos los flujos libres de fallas: **1 P0, 5 P1 y 1 P2** en este ámbito. Ninguno corregido ni desplegado por esta auditoría. Evidencia de negocio principal es API/PostgreSQL local; las escrituras productivas, dispositivos físicos, correos/WhatsApp y recorrido completo navegador permanecen sin probar.
