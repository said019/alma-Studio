# Cobertura trazable — HIVE, 2026-10-08

Matriz completa inventariada; ejecución parcial y por capas. ✅ demostrado en capa indicada, ⚠️ parcial o con brecha, ❌ contrato roto, ➖ noaplica confirmado, ❓ sin evidencia suficiente/excluido. El porcentaje NO significa tasa de pruebas que pasan ni porcentaje libre de errores en producción. Las filas amplias sólo se marcan completas si la evidencia cubre su contrato. No se multiplican conteos por regresiones RG.

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

Fórmula: (✅ + 0.5 × ⚠️)/(total − ➖). Denominador incluye noverificados y exclusiones. IDs extraídos de referencias reales, no del índice desactualizado. 141 IDs únicos, sin duplicados.

| ID | Escenario | Estado | Evidencia/límite |
|---|---|---|---|
| A1 | Quiere crear su cuenta desde el celular | ⚠️ | Navegador registro país/día/mes/año correcto; API acepta teléfono inválido/terms=false/password débil. identidad-seguridad.md ID01. |
| A2 | Olvidó su contraseña o cambió de dispositivo | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| A3 | Cambió de teléfono o email | ⚠️ | 41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log. |
| A4 | Tiene una lesión, está embarazada o condición médica relevante | ⚠️ | 41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log. |
| A5 | El estudio requiere deslinde de responsabilidad | ⚠️ | Navegador registro país/día/mes/año correcto; API acepta teléfono inválido/terms=false/password débil. identidad-seguridad.md ID01. |
| A6 | Es menor de edad | ❓ | Registro de menor201 demostrado; falta política explícita del estudio/tutor para evaluar corrección. |
| A7 | Una clienta llega y no quiere/puede registrarse sola | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| A8 | Quiere probar antes de comprar un paquete | ➖ | Trial no forma parte del catálogo actual solicitado; paquetes anteriores eliminados por instrucción del usuario. |
| A9 | Ejerce su derecho de cancelación de datos (ARCO) | ⚠️ | 41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log. |
| A10 | La misma persona quedó registrada dos veces (con y sin acento, dos teléfonos) | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| B1 | Quiere ver qué clases hay esta semana | ⚠️ | Contadores DB coinciden al final; no realtime navegador Ver reservas-creditos.md. |
| B2 | Reserva una clase teniendo paquete vigente | ✅ | Reserva, rechazo sin paquete y asignación admin/recepción con saldo Ver reservas-creditos.md. |
| B3 | El estudio es de reformer con camas numeradas | ❓ | No se asume cama numerada Ver reservas-creditos.md. |
| B4 | La clase que quiere está llena | ⚠️ | Último cupo genera waitlist; posición visible no ejercida Ver reservas-creditos.md. |
| B5 | Se libera un lugar en una clase con waitlist | ⚠️ | Promoción automática una vez verificada en API; entrega durable del aviso no certificada. No se exige aceptación según política actual. |
| B6 | Quiere controlar con cuánta anticipación se puede reservar | ⚠️ | Cierre BOOKING_LEAD_HOURS; configurabilidad completa no ejercida Ver reservas-creditos.md. |
| B7 | Una clienta acapara lugares | ⚠️ | Reglas de horario rechazadas; límite diario protegido trigger; empalmes no probados Ver reservas-creditos.md. |
| B8 | Intenta reservar sin clases disponibles o con paquete vencido | ⚠️ | API bloquea sinpaquete403 y futuro/horario inválido; CTA renovación navegador no certificado. |
| B9 | Quiere traer a una amiga | ⚠️ | RC-02 y RC-03 Ver reservas-creditos.md. |
| B10 | Toma la misma clase todos los martes | ❓ | Recurrencia no ejercida Ver reservas-creditos.md. |
| B11 | Una clienta acumula no-shows repetidos | ❌ | No-show aceptado3días antes y desde waitlist, RC01 reproducido API/PG. |
| B12 | Quiere ver sus próximas clases y su historial | ⚠️ | DOM cancelación pasa; navegación/historial real no probado Ver reservas-creditos.md. |
| B13 | Una clienta llama por teléfono para reservar | ✅ | Reserva, rechazo sin paquete y asignación admin/recepción con saldo Ver reservas-creditos.md. |
| B14 | La operación tiene sucursales separadas | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |
| C1 | Cancela con anticipación suficiente | ✅ | Dos DELETE concurrentes200/400; devolución una vez; siguiente waitlist confirmado Ver reservas-creditos.md. |
| C2 | Cancela fuera de la ventana (late cancel) | ⚠️ | Unitarias y código, no tiempo real límite API Ver reservas-creditos.md. |
| C3 | La clienta simplemente no llegó (no-show) | ❌ | No-show aceptado3días antes y desde waitlist, RC01 reproducido API/PG. |
| C4 | Quiere cambiarse a otra clase | ✅ | Reagendado con saldo0 conserva0, nuevo confirmed y origen cancelled Ver reservas-creditos.md. |
| C5 | El estudio cancela una clase (instructora enferma, festivo) | ⚠️ | Clase con booking confirmado: delete409, cancel devuelve crédito3→4, retry mantiene4; no entrega externa ni alternativas probadas. Ver clases-coaches.md. |
| C6 | Cambia la instructora de una clase ya reservada | ⚠️ | Reasignación actualiza sin notificación en ruta individual. Ver clases-coaches.md. |
| C7 | Mueve de horario una clase con reservas existentes | ⚠️ | Horario reservado actualiza sin consentimiento ni aviso, CC06. Ver clases-coaches.md. |
| C8 | Está en waitlist y ya no le interesa | ⚠️ | Unitarias waitlist; salida API no ejercida Ver reservas-creditos.md. |
| D1 | Quiere saber qué paquetes hay y cuánto cuestan | ⚠️ | Plan sintético creado/catalogado y precio usado API; UI Cobrar prueba precio efectivo. No se revisaron exhaustivamente nueve tarjetas checkout ni restricciones visibles. Ver ventas-ingresos.md. |
| D2 | Compra un paquete en línea | ⚠️ | MP ficticio activa una vez tras consulta autoritativa; webhooks externos/cargo real/aviso final no certificados y conciliación autónoma pendiente. Ver ventas-ingresos.md. |
| D3 | Quiere saber cuántas clases le quedan y cuándo vence | ⚠️ | ClientDetail tests32-suite incluye saldo/membresía; persistencia tras devolución comprobada. No saldo wallet/WhatsApp/PWA. Ver ventas-ingresos.md. |
| D4 | El paquete está por vencer (por fecha o por clases) | ❓ | No se ejecutó recordatorio de vencimiento ni outbox en este ámbito. Ver ventas-ingresos.md. |
| D5 | El paquete venció con clases sin usar | ❓ | No se ejerció paquete vencido/con saldo ni comunicación de política. Ver ventas-ingresos.md. |
| D6 | Quiere renovar | ⚠️ | ClientDetail tests botón Renovar y enlace Cobrar; API permite compra repetida. No política de stacking ni navegación completa. Ver ventas-ingresos.md. |
| D7 | Se va de viaje o se lesionó | ❓ | Congelación/pausa con reservas futuras no ejercida por este agente. Ver ventas-ingresos.md. |
| D8 | La clienta pagó en efectivo o transferencia **antes de existir en el sistema** | ⚠️ | Venta manual con clienta preexistente+waiver crea paquete/orden/ingreso; reintento sin clave pendiente, alta nueva y fecha real retroactiva no completas. Ver ventas-ingresos.md. |
| D9 | Una clienta tiene dos paquetes activos (compró antes de que venciera el anterior) | ❓ | No comparadas dos membresías elegibles para débito entre todos los canales. Ver ventas-ingresos.md. |
| D10 | Quiere regalar clases o una gift card | ❓ | Gift card/conversión/transferencia no ejercidas; no se presume requisito operativo. Ver ventas-ingresos.md. |
| D11 | Lanza una promo o precio especial (estudiante, fundadora) | ⚠️ | Precio de apertura y motivo manual cubiertos por PaymentsPage tests; esta ejecución no probó cupón concurrente/último uso/segmento. Ver ventas-ingresos.md. |
| D12 | Quiere dar cortesía: extender vigencia o regalar una clase | ⚠️ | Cortesía exige motivo y no inventa ingreso; helper membershipAdmin cubre ajustes. No se ejerció reconciliación posterior de todos ajustes. Ver ventas-ingresos.md. |
| D13 | Quiere subir de paquete a mitad de vigencia | ❓ | Upgrade/prorrateo no ejercido ni política confirmada. Ver ventas-ingresos.md. |
| E1 | Paga en línea | ⚠️ | Monto/moneda/colector/propiedad/waiver/3DS simulados y protegidos; cobro real y retorno físico no probados. Ver ventas-ingresos.md. |
| E2 | Recibe efectivo o transferencia en mostrador | ⚠️ | Venta efectivo/transferencia/referencia y orden auditable verificadas; misma intención sin idempotencia puede duplicar. Ver ventas-ingresos.md. |
| E3 | El webhook se duplica o el mismo recurso pasa `pending → approved` | ⚠️ | Concurrencia misma orden, transición pendiente→aprobado y duplicados de devolución protegidos en PG; no entrega de webhook real, fallo intermedio+retry transaccional exhaustivo no ejercido. Ver ventas-ingresos.md. |
| E4 | El pago se aprobó pero el webhook nunca llegó, o dos pagos se aprobaron para la misma orden | ⚠️ | Recuperación por consulta tras timeout pasa; sin reconciliador autónomo y búsqueda paginada completa, P0-2. Ver ventas-ingresos.md. |
| E5 | Su pago fue rechazado o quedó incierto | ⚠️ | Intento incierto bloquea nuevo POST y conserva intento; 3DS simulado no da acceso anticipado. No tarjeta real/red móvil. Ver ventas-ingresos.md. |
| E6 | Necesita revisar/reembolsar un cobro total, parcial o duplicado | ⚠️ | Total/parcial concurrente y registro negativo pasan, UI dialog tests pasan; auditoría de múltiples transacciones del proveedor y devolución bancaria real no certificadas. Ver ventas-ingresos.md. |
| E7 | Llega un contracargo (chargeback) | ⚠️ | Código apply incluye charged_back y cancela acceso/refleja devolución; prueba actual ejerció refunded, no contracargo ni alerta a dueña. Ver ventas-ingresos.md. |
| E8 | Quiere su comprobante | ❓ | No envío externo; llamadas a correo en verificación/venta no prueban recibo aceptado/entregado. Ver ventas-ingresos.md. |
| E9 | Necesita factura (CFDI) | ❓ | Captura de CFDI no ejercida. Ver ventas-ingresos.md. |
| E10 | Plataforma multi-tenant que cobra comisión | ➖ | HIVE usa cuenta propia según instrucciones, no plataforma que cobre comisión/split; no se requiere OAuth multicomercio para este alcance. Ver ventas-ingresos.md. |
| F1 | Llega a clase y presenta su QR (wallet pass o app) | ⚠️ | Manual con último crédito consumido:0→0, dos PUT200 segundo alreadyCheckedIn; QR/lector físico no ejercidos Ver reservas-creditos.md. |
| F2 | La clienta no trae celular / el QR no jala | ⚠️ | Manual con último crédito consumido:0→0, dos PUT200 segundo alreadyCheckedIn; QR/lector físico no ejercidos Ver reservas-creditos.md. |
| F3 | Se confirma la asistencia | ⚠️ | Manual con último crédito consumido:0→0, dos PUT200 segundo alreadyCheckedIn; QR/lector físico no ejercidos Ver reservas-creditos.md. |
| F4 | Llega sin reserva y hay lugar (walk-in) | ⚠️ | Venta/asignación funciona; variante invitada RC-02/03; no alta+asistencia en un único flujo visual Ver reservas-creditos.md. |
| F5 | Llega tarde | ⚠️ | checkinRule sólo abre90min antes y mismo día; no cierre tardío configurable, política comercial por confirmar Ver reservas-creditos.md. |
| F6 | Viene por TotalPass/Wellhub/Fitpass | ❓ | Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores. |
| F7 | Se fue el internet o la luz | ❓ | Offline y vista coach no ejercidos Ver reservas-creditos.md. |
| F8 | El mismo QR se escanea dos veces | ⚠️ | Manual con último crédito consumido:0→0, dos PUT200 segundo alreadyCheckedIn; QR/lector físico no ejercidos Ver reservas-creditos.md. |
| F9 | Quiere saber quién ya llegó | ❓ | Offline y vista coach no ejercidos Ver reservas-creditos.md. |
| G1 | Activa su paquete/membresía | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G2 | Tiene iPhone / tiene Android | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G3 | Cambia su saldo, su próxima clase o su vencimiento | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G4 | Hay novedad relevante (recordatorio, por vencer) | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G5 | Borró el pass sin querer | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G6 | El paquete venció | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| G7 | Su dispositivo no soporta wallet | ⚠️ | QR web presente en código/UI tests globales; no lector físico ni recorrido de escaneo navegador con API real. |
| H1 | Acaba de reservar | ⚠️ | Hooks y pruebas existentes en suite; cancelación/promoción/API funcionan. No entrega externa ni validación durable completa por destinatario. |
| H2 | Su clase es mañana / en 2 horas | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| H3 | El estudio canceló su clase | ⚠️ | Hooks y pruebas existentes en suite; cancelación/promoción/API funcionan. No entrega externa ni validación durable completa por destinatario. |
| H4 | Se liberó su lugar en waitlist | ⚠️ | Hooks y pruebas existentes en suite; cancelación/promoción/API funcionan. No entrega externa ni validación durable completa por destinatario. |
| H5 | Su paquete está por vencer | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| H6 | Acaba de registrarse / activó su primer paquete | ⚠️ | Hooks y pruebas existentes en suite; cancelación/promoción/API funcionan. No entrega externa ni validación durable completa por destinatario. |
| H7 | Lleva 2–3 semanas sin venir | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| H8 | Es su cumpleaños | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| H9 | No quiere ciertos mensajes | ❌ | Audiencias all/with_active_membership/without_membership omiten receive_promotions; gap de código CO01. |
| H10 | Un mensaje no se pudo entregar (número inválido, WhatsApp inexistente) | ⚠️ | Campañas enviadas en bucle de request sin outbox durable por destinatario CO02; no extrapolar a todos canales. |
| I1 | Configura su operación | ❌ | CC01 cupo1 con2reservas; CC02 generación duplicada; CC05 horarios/cupos inválidos. Clases-coaches API/PG. |
| I2 | Empieza el día | ❓ | Código vista diaria staff existe; flujo recepción completo con pagos pendientes no ejecutado. Ver clases-coaches.md. |
| I3 | Busca a una clienta | ⚠️ | ClientDetail DOM y asignación API verifican saldo y venta; búsqueda completa por teléfono/historial UI no ejercida. |
| I4 | Vende un paquete en mostrador | ⚠️ | Venta existente→paquete→reserva funciona API admin/recepción; retry duplica venta P0. Alta reclamada y retroactividad no completas. |
| I5 | Necesita corregir un saldo o vigencia | ⚠️ | Cortesía exige motivo y pruebas membershipAdmin pasan; ajustes completos/ledger no ejercidos por navegador. |
| I6 | Viene un festivo o cierre | ⚠️ | Cancelación clase devuelve crédito una vez y preserva historial; semana/rango no ejecutados en este script. Ver clases-coaches.md. |
| I7 | Tiene recepcionistas e instructoras con acceso | ⚠️ | Recepción no ve finanzas (41regresiones pasan); instructor opera clase ajena y coach eliminada mantiene acceso CC03/04. Política de roles amplia requiere decisión. |
| I8 | Algo raro pasó con un saldo | ⚠️ | Bulk prueba fila audit por clase; cancel/delete implementan auditoría. CRUD simple coach/clase no demuestra todos eventos. Ver clases-coaches.md. |
| I9 | Quiere cambiar una política (ventana de cancelación, tolerancia, penalizaciones) | ⚠️ | Producción setting max_cancellations=0; editor completo y todos límites no ejercidos; no se aplicó pedido cancelado de3h. |
| I10 | Opera más de una sucursal | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |
| I11 | Una clienta pregunta "¿por qué me descontaron esta clase?" | ⚠️ | Refund en cancelación verificado en saldo, ledger reconstruible completo delegado. Ver clases-coaches.md. |
| J1 | Empieza su día | ⚠️ | Rutas scoped existen; baja sigue autorizada CC03; no navegador real. Ver clases-coaches.md. |
| J2 | Va a dar una clase | ⚠️ | Proyección roster acotada/attentionNote por rol inspeccionada; primera visita no consta; coach eliminada accede. Ver clases-coaches.md. |
| J3 | Termina la clase | ⚠️ | Check-in de coach borrada demuestra fallo; paso activo integral delegado al equipo. Ver clases-coaches.md. |
| J4 | Una instructora no puede dar su clase | ⚠️ | Reasignación disponible; no aviso en PUT simple (CC06). Ver clases-coaches.md. |
| J5 | Paga a instructoras por clase | ❓ | Nómina/conteo instructor por periodo no ejercido. Ver clases-coaches.md. |
| K1 | ¿Cuánto entró este mes? | ⚠️ | Neto total/parcial correcto en laboratorio; P1 límite200 y mes creación vs cobro reproducidos. Ver ventas-ingresos.md. |
| K2 | ¿Qué horarios se llenan y cuáles no? | ❓ | Ocupación por horario/día/instructora no auditada aquí; no confundir con ingresos. Ver ventas-ingresos.md. |
| K3 | ¿Estoy reteniendo clientas? | ❓ | Existe `/reports/retention`, no contrastado contra población sintética por este agente. Ver ventas-ingresos.md. |
| K4 | ¿A quién le vence pronto? | ❓ | Lista accionable de vencimientos no ejercida. Ver ventas-ingresos.md. |
| K5 | ¿Quiénes faltan mucho? | ❓ | Reporte agregado faltas/cancelaciones por clienta-periodo no ejercido. Ver ventas-ingresos.md. |
| K6 | ¿Cuánto viene de agregadores? | ❓ | Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores. |
| K7 | Quiere llevarse los datos | ❓ | Exportaciones CSV no ejercidas. Ver ventas-ingresos.md. |
| L1 | Plataforma multi-tenant | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |
| L2 | Entregó datos de salud (A4) | ⚠️ | 41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log. |
| L3 | Ejerce derechos ARCO | ⚠️ | 41 regresiones API/PG identidad pasan: perfil, consentimiento/retirada y anonimización; entrega externa y recorrido completo de usuario no certificados. identity-api-retry.log. |
| L4 | Endpoints públicos (registro, checkout, webhook) | ⚠️ | Rate limit devolvió429 durante primer harness; límites elevados sólo en repetición local. No prueba distribuida/abuso completa. |
| L5 | Cualquier input de usuario | ❌ | Registro débil/teléfonoabc201; fecha imposible500; clases cupo negativo/horas invertidas201. ID01/CC05. |
| L6 | Llega un webhook | ⚠️ | Firma/monto/moneda/propietario y estados MP probados con proveedor ficticio; webhook real no enviado.ventas-ingresos.md. |
| L7 | "¿Y si se borra todo?" | ❓ | Sin prueba integral en este corte; requiere fixture y recorrido correspondiente. |
| L8 | Guarda credenciales de terceros (MP OAuth, APNs, Google Wallet) | ⚠️ | Variables de proveedor configuradas en servidor; chequeos estáticos credenciales pasan. No auditoría completa de almacenes/cifrado/logs históricos. |
| EC1 | La última cama | ✅ | Dos clientes una plaza:1confirmed+1waitlist, saldo total7 de8 Ver reservas-creditos.md. |
| EC2 | Doble descuento de crédito | ⚠️ | Cancelación doble y checkin doble pasan; todas rutas concurrentes no probadas Ver reservas-creditos.md. |
| EC3 | Compra simultánea del último cupo de promo | ❓ | Último uso de promo concurrente no ejercido por este agente. Ver ventas-ingresos.md. |
| EC4 | El paquete vence entre la reserva y la clase | ⚠️ | Membresía futura rechazada; vencimiento entre reserva/clase no ejecutado explícitamente Ver reservas-creditos.md. |
| EC5 | Congelación con reservas futuras | ❓ | Sin prueba específica suficiente en este corte. |
| EC6 | Zona horaria y horario de verano | ⚠️ | Zona estudio API/CDMX verificada; conexión DB administrativaUTC no es zona pool app. Test medianoche falla local Node25.9; no certifica todosjobs. |
| EC7 | Reserva de medianoche / clase de 6:00 a.m. | ❓ | Sin prueba específica suficiente en este corte. |
| EC8 | Activación manual retroactiva | ⚠️ | API acepta startDate y helpers validan/cuentan días; Cobrar envía fecha actual fija, sin selector retroactivo en esa pantalla; fecha real del dinero no se conserva al aprobar transferencia (P1-2). Ver ventas-ingresos.md. |
| EC9 | Webhook duplicado | ⚠️ | Duplicados/confirmaciones concurrentes y pending→approved probados con proveedor ficticio; no entrega real ni todos errores de esquema/claim. Ver ventas-ingresos.md. |
| EC10 | Pago aprobado, webhook perdido | ⚠️ | Reabrir recupera pago sin volver a cobrar; recuperación autónoma/paginación pendientes P0-2. Ver ventas-ingresos.md. |
| EC11 | Reembolso de paquete parcialmente usado | ⚠️ | Devolución parcial250 reduce saldo4→3 y neto1000→750; total tras cancelación deja0. No fixture con asistencias históricas reales ni política exacta por clase consumida. Ver ventas-ingresos.md. |
| EC12 | Contracargo con paquete ya consumido | ⚠️ | Rama charged_back en código cancela restantes; no ejecución con paquete consumido ni alerta a dueña. Ver ventas-ingresos.md. |
| EC13 | ¿De cuál paquete descuento? | ❓ | Selector determinista inspeccionado, múltiples paquetes no ejercidos Ver reservas-creditos.md. |
| EC14 | Clase trial que se vuelve compra | ➖ | Trial no forma parte del catálogo actual solicitado; paquetes anteriores eliminados por instrucción del usuario. |
| EC15 | Eliminar cuenta con paquete activo | ✅ | API/PG: baja con membresía activa/reserva futura409 sin cambios; baja sin compromisos anonimiza y preserva contabilidad.41regresiones identidad. |
| EC16 | Sin internet en la puerta | ❓ | Sin prueba específica suficiente en este corte. |
| EC17 | Pass desactualizado | ❓ | Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto. |
| EC18 | QR compartido/reenviado | ❓ | Sin prueba específica suficiente en este corte. |
| EC19 | Check-in de agregador sin cupo de canal | ❓ | Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores. |
| EC20 | RLS leak | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |
| EC21 | El teléfono cambió y nadie se enteró | ❓ | Sin prueba específica suficiente en este corte. |
| EC22 | Instructora que también es clienta | ❓ | Sin prueba específica suficiente en este corte. |
| EC23 | "Yo pagué, checa tus mensajes" | ⚠️ | Transferencia crea orden pending y no ingreso, admin verifica una vez; no se ejerció adjuntar comprobante ni nota manual de recepción/sin registro. Ver ventas-ingresos.md. |
| EC24 | Se equivocó de sucursal u horario | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |
| EC25 | Embarazo o lesión a media vigencia | ❓ | Sin prueba específica suficiente en este corte. |
| EC26 | El redeploy pisa configuración operativa | ⚠️ | Regresión seed no sobrescribe password y ediciónpromociones pasan; reinicio con valores operativos personalizados no ejercido completo. |
| EC27 | El contador de cupo deriva del estado real | ✅ | Query mismatches current_bookings versus confirmed/checked_in=[] Ver reservas-creditos.md. |
| EC28 | La mutación funciona pero la UI muestra caché vieja | ❓ | No navegador con caché preexistente Ver reservas-creditos.md. |
| EC29 | Sucursal modelada como sala o texto decorativo | ❓ | Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede. |

## Pendientes para cerrar ❓

- **A2** — Olvidó su contraseña o cambió de dispositivo: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **A6** — Es menor de edad: Registro de menor201 demostrado; falta política explícita del estudio/tutor para evaluar corrección.
- **A7** — Una clienta llega y no quiere/puede registrarse sola: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **A10** — La misma persona quedó registrada dos veces (con y sin acento, dos teléfonos): Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **B3** — El estudio es de reformer con camas numeradas: No se asume cama numerada Ver reservas-creditos.md.
- **B10** — Toma la misma clase todos los martes: Recurrencia no ejercida Ver reservas-creditos.md.
- **B14** — La operación tiene sucursales separadas: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.
- **D4** — El paquete está por vencer (por fecha o por clases): No se ejecutó recordatorio de vencimiento ni outbox en este ámbito. Ver ventas-ingresos.md.
- **D5** — El paquete venció con clases sin usar: No se ejerció paquete vencido/con saldo ni comunicación de política. Ver ventas-ingresos.md.
- **D7** — Se va de viaje o se lesionó: Congelación/pausa con reservas futuras no ejercida por este agente. Ver ventas-ingresos.md.
- **D9** — Una clienta tiene dos paquetes activos (compró antes de que venciera el anterior): No comparadas dos membresías elegibles para débito entre todos los canales. Ver ventas-ingresos.md.
- **D10** — Quiere regalar clases o una gift card: Gift card/conversión/transferencia no ejercidas; no se presume requisito operativo. Ver ventas-ingresos.md.
- **D13** — Quiere subir de paquete a mitad de vigencia: Upgrade/prorrateo no ejercido ni política confirmada. Ver ventas-ingresos.md.
- **E8** — Quiere su comprobante: No envío externo; llamadas a correo en verificación/venta no prueban recibo aceptado/entregado. Ver ventas-ingresos.md.
- **E9** — Necesita factura (CFDI): Captura de CFDI no ejercida. Ver ventas-ingresos.md.
- **F6** — Viene por TotalPass/Wellhub/Fitpass: Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores.
- **F7** — Se fue el internet o la luz: Offline y vista coach no ejercidos Ver reservas-creditos.md.
- **F9** — Quiere saber quién ya llegó: Offline y vista coach no ejercidos Ver reservas-creditos.md.
- **G1** — Activa su paquete/membresía: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **G2** — Tiene iPhone / tiene Android: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **G3** — Cambia su saldo, su próxima clase o su vencimiento: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **G4** — Hay novedad relevante (recordatorio, por vencer): Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **G5** — Borró el pass sin querer: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **G6** — El paquete venció: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **H2** — Su clase es mañana / en 2 horas: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **H5** — Su paquete está por vencer: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **H7** — Lleva 2–3 semanas sin venir: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **H8** — Es su cumpleaños: Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **I2** — Empieza el día: Código vista diaria staff existe; flujo recepción completo con pagos pendientes no ejecutado. Ver clases-coaches.md.
- **I10** — Opera más de una sucursal: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.
- **J5** — Paga a instructoras por clase: Nómina/conteo instructor por periodo no ejercido. Ver clases-coaches.md.
- **K2** — ¿Qué horarios se llenan y cuáles no?: Ocupación por horario/día/instructora no auditada aquí; no confundir con ingresos. Ver ventas-ingresos.md.
- **K3** — ¿Estoy reteniendo clientas?: Existe `/reports/retention`, no contrastado contra población sintética por este agente. Ver ventas-ingresos.md.
- **K4** — ¿A quién le vence pronto?: Lista accionable de vencimientos no ejercida. Ver ventas-ingresos.md.
- **K5** — ¿Quiénes faltan mucho?: Reporte agregado faltas/cancelaciones por clienta-periodo no ejercido. Ver ventas-ingresos.md.
- **K6** — ¿Cuánto viene de agregadores?: Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores.
- **K7** — Quiere llevarse los datos: Exportaciones CSV no ejercidas. Ver ventas-ingresos.md.
- **L1** — Plataforma multi-tenant: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.
- **L7** — "¿Y si se borra todo?": Sin prueba integral en este corte; requiere fixture y recorrido correspondiente.
- **EC3** — Compra simultánea del último cupo de promo: Último uso de promo concurrente no ejercido por este agente. Ver ventas-ingresos.md.
- **EC5** — Congelación con reservas futuras: Sin prueba específica suficiente en este corte.
- **EC7** — Reserva de medianoche / clase de 6:00 a.m.: Sin prueba específica suficiente en este corte.
- **EC13** — ¿De cuál paquete descuento?: Selector determinista inspeccionado, múltiples paquetes no ejercidos Ver reservas-creditos.md.
- **EC16** — Sin internet en la puerta: Sin prueba específica suficiente en este corte.
- **EC17** — Pass desactualizado: Excluido por usuario: botones Apple/Google Wallet ocultos; no probar integración externa. Exclusión no equivale a NA del producto.
- **EC18** — QR compartido/reenviado: Sin prueba específica suficiente en este corte.
- **EC19** — Check-in de agregador sin cupo de canal: Excluido por usuario: Wellhub desconfigurado/oculto; no probar ni reactivar agregadores.
- **EC20** — RLS leak: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.
- **EC21** — El teléfono cambió y nadie se enteró: Sin prueba específica suficiente en este corte.
- **EC22** — Instructora que también es clienta: Sin prueba específica suficiente en este corte.
- **EC24** — Se equivocó de sucursal u horario: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.
- **EC25** — Embarazo o lesión a media vigencia: Sin prueba específica suficiente en este corte.
- **EC28** — La mutación funciona pero la UI muestra caché vieja: No navegador con caché preexistente Ver reservas-creditos.md.
- **EC29** — Sucursal modelada como sala o texto decorativo: Operación HIVE tratada como unestudio; no certificar multi-tenant/multisucursal ni marcar NA sólo por no ver segundasede.

Para cerrar evidencia externa: entorno de prueba de proveedor, webhook entregado y retorno en dispositivos reales; backup con restauración aislada; escenarios sintéticos de cada reporte y confirmación de políticas de menores/multisede. No se requiere reactivar Wallet/Wellhub excluidos para corregir operación actual.
