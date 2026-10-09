# Auditoría HIVE: ventas, ingresos y Mercado Pago

Corte: 2026-10-08. Código `e76f73ff156d59f5feabe10dca67b1c6e8897a17`. Revisión acotada, sin porcentaje global. Skill pilates-studio-auditor y referencias de escenarios, operación, pagos y validación. No se modificó aplicación ni producción; no cargos, devoluciones monetarias o mensajes externos. PostgreSQL Embedded desechable, API local con entorno mínimo sin `.env`, identidades `example.invalid`, sin credenciales de proveedores.

## Evidencia ejecutada

- `node scripts/audit-sales-income-20261008.mjs`: API real + PostgreSQL desechable, terminó `AUDIT COMPLETED`.
- `node scripts/audit-mp-isolated-20261008.mjs`: 36/36 pruebas pasan. Envuelve `server/tests/hive-mercadopago-review.test.mjs` y unitarias de MP/refunds/membershipAdmin, impone DB desechable explícita. Proveedor completamente ficticio.
- `node scripts/verify-order-expiration.mjs`: pasa ventana 1 hora, idempotencia y protección de pagos/comprobantes/intentos en proceso.
- `npx vitest run src/pages/admin/payments/PaymentsPage.test.tsx src/pages/admin/payments/PaymentsHistory.test.tsx src/pages/admin/clients/ClientDetail.test.tsx --maxWorkers=2`: 3 archivos, 32/32 pasan. Son componentes con API mock, no certificación de navegador productivo.
- Logs: [hive-sales-audit.log](hive-sales-audit.log), [hive-mp-audit.log](hive-mp-audit.log), [hive-expiration-audit.log](hive-expiration-audit.log), [hive-sales-ui-audit.log](hive-sales-ui-audit.log).
- DB y API terminadas en `finally`; bases temporales desechables. Los scripts y este reporte son los únicos archivos propios añadidos.

## Resultados por escenario de este ámbito

| Escenario | Estado | Evidencia y límite |
|---|---|---|
| D8/E2 venta manual efectivo y transferencia | Parcial | API crea membresía+orden+ingreso correctamente; pendiente idempotencia de venta repetida (P0-1). |
| E3 webhook/pago concurrente e idempotencia | Cubierto en laboratorio | Enviar y confirmar misma orden concurrentemente produce un POST al proveedor y una activación. Pendiente→aprobado, devolución repetida y notificación intermedia tardía protegidos. Firma probada por unitarias; entrega externa no certificada. |
| E4 pérdida de webhook/reconciliación | Parcial | Reabrir la orden recupera pago por consulta autenticada, sin segundo POST. No existe barrido autónomo MP ni paginación de búsqueda; P0-2. |
| E5 rechazo/estado incierto | Parcial | Timeout conserva intento durable, bloquea segundo cobro y recupera al consultar. UI productiva/reintento tarjeta real/3DS físico no probados. |
| E6 reembolso total/parcial | Cubierto en laboratorio para registro manual | Total concurrente devuelve 201/409, una fila de reembolso, neto cero. Parcial de250 sobre1000 deja neto750 y3 clases de4. Dinero se devuelve externamente; API sólo registra devolución ya realizada. |
| D12 cortesía | Cubierto en laboratorio | $0 sin motivo400; con motivo201; ingreso no aumenta. Cliente no puede vender ni reembolsar403. |
| K1 ingresos | Parcial | Neto funciona con reembolsos, pero límite silencioso200 y fecha de creación en lugar de cobro distorsionan KPIs (P1-1/P1-2). |
| Cancelar membresía | Cubierto según contrato actual | Cancelación idempotente no borra dinero cobrado; reembolso explícito posterior sí lo resta. No presumir que cancelar acceso equivale a devolver dinero. |
| Caducidad órdenes | Cubierto en laboratorio | Una hora; pagadas, comprobantes en revisión e intentos en proceso protegidos. Administrador sí puede aprobar manualmente una orden expirada; requiere decisión de política, no se declara defecto por sí solo. |

## Hallazgos

### P0-1 · RG19/RG20 · Reintento de intención manual no distinguible de otra compra

Ausencia de idempotencia reproducida en API+DB local: dos POST idénticos concurrentes a `/api/memberships` devuelven `[201,201]`, UUID de membresía distintos y dos órdenes aprobadas. `server/index.js:14119` no recibe clave idempotente ni conserva el resultado de una intención. `PaymentsPage.tsx:326` deshabilita botón mientras `isPending`, pero esto no cubre respuesta perdida y reintento ni dos dispositivos. Dos compras voluntarias idénticas pueden ser legítimas: el defecto es que el sistema no distingue una nueva compra del reintento de una respuesta perdida. Se reprodujo además en el componente real PaymentsPage: mientras pending el botón está deshabilitado; tras error de transporte vuelve a habilitarse conservando la selección y manda exactamente el mismo payload, sin clave idempotente. Combinado con la API que persiste ambos requests, una respuesta perdida después del commit puede generar doble asiento/crédito. El error de red posterior al commit se simuló en componente; no se cortó una conexión real de producción.

Cierre: clave durable actor+intención+contenido, misma clave devuelve mismo recibo, contenido distinto409. Probar respuesta perdida seguida de retry y dos solicitudes simultáneas: una orden/membresía/asiento. Estimación 1–2 días incluyendo rutas de recepción.

### P0-2 · E4/RG08 · Recuperación de pago depende de webhook o regreso del cliente

Gap confirmado por código; no incidente monetario real demostrado. `server/lib/mercadoPagoRoutes.js:61–73` sólo recupera al llamar `card-payment-session` o `card-payment-sync`; búsqueda sin cursor/paginación. `registerMercadoPago` únicamente exporta `processVerifiedPayment`; `server/index.js:4995` no programa reconciliador. Inventario de jobs no contiene MP. Laboratorio demuestra recuperación al consultar, no recuperación autónoma sin webhook/cliente. Un pago aprobado cuyo webhook no llegue puede quedarse pendiente hasta abrir la orden. Búsqueda de más de un movimiento devuelve409 sin cola operativa durable propia.

Cierre: conciliación periódica con estado durable, rotación justa, paginación completa, canónico estable y revisión visible para extras/mismatch; test proveedor simulado con webhook omitido y51+ resultados. No realizar auto-reembolsos. Estimación 2–4 días.

### P1-1 · K1 · Historial y KPIs silenciosamente limitados a200 movimientos

Defecto reproducido:201 órdenes aprobadas de$10 en mismo usuario/mes ⇒ DB$2,010; GET `/api/payments?userId=…` devuelve200 filas y `total:2000`. `server/index.js:16241–16294` aplica LIMIT(default200,max1000) antes de sumar. `PaymentsHistory.tsx:59–90` solicita `/payments` sin paginación y calcula KPI semana/mes de esas filas; no indica truncamiento ni forma de llegar a ventas viejas. Si reembolso entra entre últimas200 y venta original queda fuera, puede distorsionar neto aún más.

Cierre: totales agregados del rango completo independientes de página; paginación visible del historial. Probar201+ ventas y reembolso fuera/dentro del corte, coincidir con DB. Estimación medio–1día.

### P1-2 · K1 · Cobro confirmado en octubre se imputa a septiembre

Defecto reproducido de fecha contable: orden transfer creada septiembre y aprobada hoy produce `{created_month:"2026-09",verified_month:"2026-10",paid_at:null}`. `NET_REVENUE_SQL`(12140), `/reports/revenue`(12310) y `/payments`(16252) agrupan por `created_at`, aunque se presentan como ingreso/caja. Aprobar transferencia no establece `paid_at` (15962+). Una orden de fin de mes confirmada al siguiente cambia retrospectivamente el mes previo. Falta acordar fecha de cobro/confirmación para transferencias en revisión; la fecha de intención no acredita recepción de dinero.

Cierre: conservar fecha autoritativa de cobro con política explícita para verificación manual, usarla en todas vistas e históricos. Probar cruce de mes y filtros diarios. Estimación1día, revisar backfill histórico antes de implementar.

## Observaciones que no deben venderse como bugs confirmados

- Cancelar membresía deja orden aprobada e ingreso intacto: correcto para cancelación sin devolución. Si dueña devuelve dinero, usar reembolso. Laboratorio verificó que reembolsar después de cancelar deja neto0.
- Admin puede verificar una orden expirada (200approved). Puede ser una excepción operativa intencional para pago fuera de plazo; no asumir prohibición ni corregir sin política.
- Tests MP usan mocks y no certifican cuenta comercial, webhook entregado, autorización bancaria, 3DS móvil ni liquidación. No se realizó cargo/reembolso real.
- Tests de componente no certifican la UI publicada, PWA iPhone ni red intermitente real.
- No se migró/respaldó/restauró producción; no había escrituras productivas en este alcance.


## Ampliación: UI real y mapeo exhaustivo solicitado

`npx vitest run src/pages/admin/payments/AuditSales20261008.test.tsx --maxWorkers=1`: **2/2 pasan**. Una prueba verifica el guard durante pending y retry sin clave después de error; la otra monta el componente real PaymentsHistory con200 filas×10 y `total:2010`, verifica KPI$2,000 y ausencia de$2,010. Por tanto el límite afecta la UI de `/admin/payments/historial`, no sólo un JSON auxiliar. Fuente: GET `/payments` sin paginación; `summarizePayments(payments,now)` ignora agregado y resume sólo filas. No se certificó navegador/productivo. Log [hive-sales-regression-audit.log](hive-sales-regression-audit.log).

Estados: cubierto significa demostrado en la capa indicada, no en producción; parcial tiene controles pero alcance o gap pendiente; NV no verificado con suficiente evidencia; NA exclusivamente fuera de operación confirmada. No se calcula porcentaje.

| ID | Estado | Evidencia de esta ejecución / límite |
|---|---|---|
| D1 | Parcial | Plan sintético creado/catalogado y precio usado API; UI Cobrar prueba precio efectivo. No se revisaron exhaustivamente nueve tarjetas checkout ni restricciones visibles. |
| D2 | Parcial | MP ficticio activa una vez tras consulta autoritativa; webhooks externos/cargo real/aviso final no certificados y conciliación autónoma pendiente. |
| D3 | Parcial | ClientDetail tests32-suite incluye saldo/membresía; persistencia tras devolución comprobada. No saldo wallet/WhatsApp/PWA. |
| D4 | NV | No se ejecutó recordatorio de vencimiento ni outbox en este ámbito. |
| D5 | NV | No se ejerció paquete vencido/con saldo ni comunicación de política. |
| D6 | Parcial | ClientDetail tests botón Renovar y enlace Cobrar; API permite compra repetida. No política de stacking ni navegación completa. |
| D7 | NV | Congelación/pausa con reservas futuras no ejercida por este agente. |
| D8 | Parcial | Venta manual con clienta preexistente+waiver crea paquete/orden/ingreso; reintento sin clave pendiente, alta nueva y fecha real retroactiva no completas. |
| D9 | NV | No comparadas dos membresías elegibles para débito entre todos los canales. |
| D10 | NV | Gift card/conversión/transferencia no ejercidas; no se presume requisito operativo. |
| D11 | Parcial | Precio de apertura y motivo manual cubiertos por PaymentsPage tests; esta ejecución no probó cupón concurrente/último uso/segmento. |
| D12 | Parcial | Cortesía exige motivo y no inventa ingreso; helper membershipAdmin cubre ajustes. No se ejerció reconciliación posterior de todos ajustes. |
| D13 | NV | Upgrade/prorrateo no ejercido ni política confirmada. |
| E1 | Parcial | Monto/moneda/colector/propiedad/waiver/3DS simulados y protegidos; cobro real y retorno físico no probados. |
| E2 | Parcial | Venta efectivo/transferencia/referencia y orden auditable verificadas; misma intención sin idempotencia puede duplicar. |
| E3 | Parcial | Concurrencia misma orden, transición pendiente→aprobado y duplicados de devolución protegidos en PG; no entrega de webhook real, fallo intermedio+retry transaccional exhaustivo no ejercido. |
| E4 | Parcial | Recuperación por consulta tras timeout pasa; sin reconciliador autónomo y búsqueda paginada completa, P0-2. |
| E5 | Parcial | Intento incierto bloquea nuevo POST y conserva intento; 3DS simulado no da acceso anticipado. No tarjeta real/red móvil. |
| E6 | Parcial | Total/parcial concurrente y registro negativo pasan, UI dialog tests pasan; auditoría de múltiples transacciones del proveedor y devolución bancaria real no certificadas. |
| E7 | Parcial | Código apply incluye charged_back y cancela acceso/refleja devolución; prueba actual ejerció refunded, no contracargo ni alerta a dueña. |
| E8 | NV | No envío externo; llamadas a correo en verificación/venta no prueban recibo aceptado/entregado. |
| E9 | NV | Captura de CFDI no ejercida. |
| E10 | NA | HIVE usa cuenta propia según instrucciones, no plataforma que cobre comisión/split; no se requiere OAuth multicomercio para este alcance. |
| K1 | Parcial | Neto total/parcial correcto en laboratorio; P1 límite200 y mes creación vs cobro reproducidos. |
| K2 | NV | Ocupación por horario/día/instructora no auditada aquí; no confundir con ingresos. |
| K3 | NV | Existe `/reports/retention`, no contrastado contra población sintética por este agente. |
| K4 | NV | Lista accionable de vencimientos no ejercida. |
| K5 | NV | Reporte agregado faltas/cancelaciones por clienta-periodo no ejercido. |
| K6 | NA | Wellhub/agregadores fueron deshabilitados por instrucción del usuario; no conciliación activa exigida en operación presente. |
| K7 | NV | Exportaciones CSV no ejercidas. |
| EC3 | NV | Último uso de promo concurrente no ejercido por este agente. |
| EC8 | Parcial | API acepta startDate y helpers validan/cuentan días; Cobrar envía fecha actual fija, sin selector retroactivo en esa pantalla; fecha real del dinero no se conserva al aprobar transferencia (P1-2). |
| EC9 | Parcial | Duplicados/confirmaciones concurrentes y pending→approved probados con proveedor ficticio; no entrega real ni todos errores de esquema/claim. |
| EC10 | Parcial | Reabrir recupera pago sin volver a cobrar; recuperación autónoma/paginación pendientes P0-2. |
| EC11 | Parcial | Devolución parcial250 reduce saldo4→3 y neto1000→750; total tras cancelación deja0. No fixture con asistencias históricas reales ni política exacta por clase consumida. |
| EC12 | Parcial | Rama charged_back en código cancela restantes; no ejecución con paquete consumido ni alerta a dueña. |
| EC13 | NV | Selección determinista entre paquetes no ejercida por este agente. |
| EC14 | NA | Catálogo HIVE vigente no ofrece trial/clase muestra; usuario pidió borrar anteriores. No implica certificar lógica genérica trial. |
| EC15 | NV | Eliminación/anonimización con saldo activo pertenece auditoría de identidad; no probado aquí. |
| EC23 | Parcial | Transferencia crea orden pending y no ingreso, admin verifica una vez; no se ejerció adjuntar comprobante ni nota manual de recepción/sin registro. |

Nota: esta ampliación sustituye estados abreviados excesivamente generales de tablas anteriores cuando difieran. IDs K1 y K2 se separaron: los defectos de dinero pertenecen K1, K2 es ocupación.


## Cierre: configuración de planes y evidencias persistidas

Revisado `scripts/verify-plan-promotions.mjs`: crea PostgreSQL y API desechables, no lee `.env` ni hereda credenciales; URLs `mpago.la/test-*` son valores sintéticos persistidos, nunca navegados ni cobrados. Ejecutado el2026-10-08, exit0 y PASS.

Comprueba cinco modos de promoción (`studio`, `disabled`, `price`, `percent`, `amount`) y precio0, coherencia crear/editar/catálogo, importes reales de órdenes por transferencia, conservación de `daily_class_limit` en edición parcial, rollback al reducir precio incompatible con descuento, valores inválidos400, enlaces HTTPS, elección regular/apertura/promoción anual, bloqueo de tarjeta sin enlace compatible y cliente sin permiso403. No prueba que todas restricciones de horario/credencial se hagan cumplir al reservar; eso queda fuera de esta suite. No prueba cobro real de suscripción anual.

D1 y D11 permanecen parciales en matriz integral, pero ahora **configuración backend de precios/promociones + reflejo en órdenes** está demostrada con PostgreSQL real desechable. EC3 sigue NV: esta suite no es carrera del último cupón.

Los seis logs de esta ejecución están guardados junto al informe:

- [Ventas e ingresos](hive-sales-audit.log)
- [Mercado Pago y helpers](hive-mp-audit.log)
- [Caducidad](hive-expiration-audit.log)
- [32 pruebas UI](hive-sales-ui-audit.log)
- [2 reproducciones UI](hive-sales-regression-audit.log)
- [Promociones/configuración de planes](hive-plan-promotions-audit.log)
