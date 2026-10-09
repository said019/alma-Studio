# Auditoría HIVE — 8 de octubre de 2026

## 1. Resumen ejecutivo

**NO-GO para certificar operación sin fallos ni cobro comercial completo.** La auditoría con tres subagentes reprodujo defectos que afectan cupo, ventas e ingresos. Hay tres bloqueos principales: edición individual que deja2reservas en cupo1, reintento de venta manual que crea dos compras y recuperación de pago sin conciliación autónoma completa. Los primeros dos se reprodujeron en API/PostgreSQL local; el tercero es un gap confirmado de código, sin incidente bancario real observado.

La matriz inventaría141escenarios únicos: cobertura ponderada **31.2%**,7completos en su capa,72parciales,5rotos,3noaplicables y54noverificados/excluidos. No es porcentaje de tests aprobados ni de fallos productivos. Es deliberadamente conservador: una prueba de API no certifica dispositivos, envío externo y todo recorrido UI.

GO operativo manual: **pendiente** por P0 de cupo/venta y configuración actual sin coaches activos ni clases futuras. GO comercial completo: **pendiente**, también faltan prueba externa MP y restore. Producción https://hivestudio.com.mx, deployment e1003020-552f-4e70-8f60-70528cdd2efb, commit e76f73ff; health/version/catálogo/aislamiento anónimo leídos correctamente. Sin cambios de producción, cargos, envíos ni fixtures reales. Backup/restore no ejercidos.

Tres correcciones rápidas: bloquear/validar cupo en una transacción, impedir no-show de clases futuras/lista de espera y revocar operación de coach eliminada.

## 2. Scorecard por dominio

| Dominio | ✅ | ⚠️ | ❌ | ➖ | ❓ | Cobertura | Semáforo |
|---|---:|---:|---:|---:|---:|---:|---|
| A | 0 | 5 | 0 | 1 | 4 | 27.8% | 🔴 |
| B | 2 | 8 | 1 | 0 | 3 | 42.9% | 🔴 |
| C | 2 | 5 | 1 | 0 | 0 | 56.2% | 🔴 |
| D | 0 | 7 | 0 | 0 | 6 | 26.9% | 🔴 |
| E | 0 | 7 | 0 | 1 | 2 | 38.9% | 🔴 |
| F | 0 | 6 | 0 | 0 | 3 | 33.3% | 🔴 |
| G | 0 | 1 | 0 | 0 | 6 | 7.1% | 🔴 |
| H | 0 | 5 | 1 | 0 | 4 | 25.0% | 🔴 |
| I | 0 | 8 | 1 | 0 | 2 | 36.4% | 🔴 |
| J | 0 | 4 | 0 | 0 | 1 | 40.0% | 🔴 |
| K | 0 | 1 | 0 | 0 | 6 | 7.1% | 🔴 |
| L | 0 | 5 | 1 | 0 | 2 | 31.2% | 🔴 |
| EC | 3 | 10 | 0 | 1 | 15 | 28.6% | 🔴 |
| Global | 7 | 72 | 5 | 3 | 54 | 31.2% | 🔴 |


La [matriz completa](cobertura.md) contiene evidencia por ID y todos los pendientes. Dominio rojo puede significar falta de evidencia; no se confunde con un defecto demostrado. Detalle de entornos y comandos en [inventario](inventario.md).

## 3. Gaps priorizados

### P0-1 · I1 / EC1 · Editar cupo puede sobreocupar una clase

**Hoy:** PUT usado por calendario lee ocupación antes del lock; carrera reproducida termina capacidad1/reservas2. Puede venderse o asignarse más espacio físico del disponible. **Esperado:** lectura, validación y escritura dentro de la misma transacción/lock. **Fix:** server/index.js:17193–17225. **Cierre pendiente:** carrera responde conflicto y conserva capacidad≥ocupación. Estimación medio–1día. Evidencia [CC01](clases-coaches.md), local8/oct. CC02 generación duplicada y CC05 datos imposibles agravan el mismo dominio operativo crítico y deben corregirse en ese bloque; no se reducen de prioridad por pasar el CRUD normal.

### P0-2 · D8 / E2 / I4 · Reintentar venta puede duplicar ingreso y paquete

**Hoy:** dos solicitudes idénticas producen201/201 y dos órdenes/membresías. El botón bloquea dobletap mientras espera, pero una respuesta perdida permite reintentar sin identificar la misma intención. Dos compras voluntarias siguen siendo válidas: falta distinguirlas de un retry. **Esperado:** una clave durable por intención con resultado reutilizable. **Fix:** POST/memberships + PaymentsPage. **Cierre pendiente:** commit seguido de respuesta perdida/retry produce una venta; contenido distinto con misma clave409.1–2días. Evidencia [ventas-ingresos](ventas-ingresos.md), API/PG y componente real con transporte simulado.

### P0-3 · E4 / EC10 · Recuperación de pagos incompleta

**Hoy:** consultar nuevamente la orden recupera pago aprobado del proveedor ficticio, pero no existe conciliador MP autónomo ni búsqueda paginada completa. Si webhook/cliente no regresan, puede quedar pendiente. **Naturaleza:** gap de código, no prueba de dinero perdido en producción. **Esperado:** conciliación durable con rotación, búsqueda completa y extras en revisión. **Fix:** mercadoPagoRoutes/jobs. **Cierre pendiente:** webhook omitido,51+resultados y múltiples órdenes recuperan una sola venta sin depender del cliente; sin auto-reembolso.2–4días.

### P1 · Operación, ingresos y permisos

| Hallazgo | Evidencia y resultado actual | Cierre pendiente / zona / estimación |
|---|---|---|
| Coach eliminada conserva acceso | CC03: roster ycheck-in200; también asignable a nueva clase | Comprobar habilitación en servidor, rechazar coach eliminada; medio–1día |
| Roles amplios | CC04: instructor modifica clase ajena; recepción borra huérfana. Finanzas sí denegadas | Definir alcance comercial antes de cambiar, matriz por endpoint;1día |
| Cambio de horario/coach sin aviso | CC06: reserva conservada al mover hora; no aviso ni salida especial | Evento durable, notificación y política de cambio;1–2días |
| No-show indebido | RC01: clase futura y waitlist reciben no_show200 | Validar tiempo/estado bajo lock; medio día |
| Invitada consume dos beneficios | RC02: plan configurable4clases+2pases queda3clases y1pase usado | Unificar selector de derecho/devolución entre rutas; medio–1día. Mensual/anual ilimitados actuales no muestran débito numérico |
| Ingreso truncado |201ventas×$10: DB$2,010; API/UI$2,000 por límite200 | Agregado global independiente de paginación; medio–1día |
| Mes contable incorrecto | Orden creadaSept aprobadaOct sigue imputadaSept, paid_atnull | Definir fecha real de cobro y usarla coherentemente;1día más revisión de históricos |
| Registro sin validación equivalente | Password1carácter, teléfonoabc, termsfalse aceptados201; fecha imposible500 | Validación servidor compartida; medio–1día |
| Marketing omite preferencias por segmento | CO01 inspección: all/activas no filtran opt-out; no envíos realizados | Consentimiento independiente de segmentación; medio día |

Naturaleza y reproductores: [clases/coaches](clases-coaches.md), [reservas/créditos](reservas-creditos.md), [ventas/ingresos](ventas-ingresos.md), [identidad/comunicaciones](identidad-seguridad.md). Todos los cierres están **pendientes**, no desplegados. Estimaciones de ingeniería no son compromiso de entrega y pueden solaparse.

### P2 · Operación y pruebas

Pase de invitada agotado devuelve500 genérico, aunque trigger evita sobreconsumo (RC03). Ruta legacy POST/admin/classes devuelve500 por columnas antiguas; UI usa otra ruta (CC07). Campañas carecen de reanudación durable por destinatario (CO02). Dos pruebas frontend fallan por el mismo texto Dashboard de0.72rem. Un test backend de medianoche difiere bajo Node25.9/Intl local; no prueba por sí solo fallo productivo. Cerrar con contratos de error, retirada de ruta legacy, outbox y regresiones bajo runtime soportado (0.5–2días por bloque).

## 4. Quick wins y lo que sí pasó

1. Compartir el lock de edición masiva con edición individual, probando carrera contra reservas (CC01).
2. Validar estado final de hora/cupo y temporalidad de no-show, incluido PUT parcial (CC05/RC01).
3. Exigir coach activa al asignar y operar; comprobar token previo tras baja (CC03).
4. Obtener totales contables del conjunto filtrado completo y paginar filas (K1).

Pasaron los recorridos API de crear/editar coach y clase válida, baja lógica de coach, borrar clase huérfana, impedir borrar historia, cancelar clase y devolver crédito una vez; edición masiva con rollback/conflicto. Pasaron reserva concurrente del último lugar, cancelación doble sin doble devolución, promoción única, check-in repetido, reagendado con saldo0 y venta/asignación normal tanto admin como recepción.

**Cancelar membresía conserva el ingreso cobrado; registrar reembolso explícito sí reduce el neto.** Ambos resultados fueron comprobados. Cortesía exige motivo y no inventa ingresos. Promociones/configuración de precios y caducidad de órdenes1hora pasan en laboratorio.

Typecheck y build pasan. Suite frontend completa:1358pasan/2fallan. Backend unitario:276pasan/1falla/2omitidos. Identidad API:41/41. MP aislado:36/36. Los subconjuntos de agentes se superponen con suite global; no se suman para inflar el total.

## 5. Anexo: escenarios no verificables

Los54IDs ❓ están enumerados individualmente en [cobertura.md](cobertura.md). Incluyen correo realmente entregado, recuperación de acceso por canal externo, reservas recurrentes, reportes agregados/exportaciones, congelamientos, políticas de menores/multisede, backup/restauración y dispositivos físicos. Wallet/Wellhub permanecen excluidos por instrucción previa; no se reportan como obligación incumplida ni se reactivaron.

También falta recorrido completo de navegador autenticado con API real para todos los roles, caché caliente, PWA instalada/iPhone, lector QR y MP real. Tests DOM simulados no cubren esa evidencia. Se requiere entorno de prueba de proveedor y dispositivos/acceso para completar los cruces externos; no se hizo un cobro para obtener un semáforo verde.

## 6. Anexo productivo

| Control | Evidencia |
|---|---|
| Identidad y bundle | HEAD/APIe76f73ff; deploymentSUCCESS; /assets/index-DIlZypn_.js. production-readonly.json |
| Smoke GET | Home,health,version,planes,card-readiness200; users/payments/adminstats401 anónimo |
| DB/rol | railway/postgres, BEGIN READ ONLY;9planes activos,0coaches activos,0clases futuras |
| Timezone | API pool/procesoCDMX, matchesDbtrue; conexión administrativaUTC separada |
| Política | max_cancellations0; no modificación ni interpretación automática de ventana |
| Backup/restore | No ejecutado ni certificado |
| Invariantes | Cupo/crédito verificados en fixtures locales; sobrecupo CC01 reproducido. Sin mutación productiva |
| Limpieza | Sin fixtures productivas; procesos de laboratorio detenidos; pestaña temporal cerrada |
| Publicación | Ninguna corrección ni redeploy en esta auditoría |

La skill solicita auditar antes de corregir: este corte entrega diagnóstico y pruebas, no presupone que publicar algo solucione los hallazgos. Se preservó el cambio local previo de7líneas en ClassesCalendar.tsx. No se tocaron secretos ni cuentas reales.
