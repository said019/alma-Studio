# Condiciones HIVE — octubre 2026

El catálogo inicial incorpora los nueve productos de la imagen, sus precios regulares y de apertura. Paquetes: 30 días naturales desde la compra (incluido ese día); 20 sesiones: 60 días. Las compras separadas conservan saldos y vencimientos independientes. No hay transferencia ni prórroga.

`plans.rules` contiene días/franjas, límite diario, credencial estudiantil, guest pass, café, periodo de cobro, compromiso y enlaces de pago. Editar las condiciones aplica también a membresías vigentes de ese plan. Las reservas se validan en servidor y mediante triggers de PostgreSQL; una promoción desde lista de espera revalida las condiciones. Inasistencia y cancelación con menos de 12 horas consumen la sesión diaria. Los guest pass mensuales se contabilizan por ciclo de 30 días desde la compra, no por mes calendario.

Recepción puede validar la fecha de vencimiento de la credencial en la ficha de cliente; no se guarda copia del documento. La entrega del café regular de cortesía también se registra desde la ficha y rechaza duplicados del mismo día, incluso solicitudes simultáneas.

## Mercado Pago y renovación

Los enlaces proporcionados son enlaces externos fijos. La app selecciona el enlace que corresponde al precio de apertura o regular, crea una orden pendiente y dirige a Mercado Pago. **La activación requiere verificar el pago en administración.** Un regreso desde Mercado Pago no activa la membresía. Esta implementación no incorpora credenciales/webhooks de Mercado Pago, no concilia cobros recurrentes y no ejecuta cargos automáticos. El compromiso anual y la renovación mensual describen las condiciones contratadas; el cobro recurrente se gestiona en Mercado Pago y cada periodo debe activarse después de confirmar su pago. Los descuentos internos no se aplican a enlaces fijos: el cliente debe elegir transferencia o pago en el estudio.

## Instalaciones existentes

La migración de estructura es aditiva; no reescribe planes capturados ni horarios/clases existentes al arrancar. Para reconciliar el catálogo autorizado:

```sh
DATABASE_URL=... node scripts/sync-hive-conditions.mjs
DATABASE_URL=... node scripts/sync-hive-conditions.mjs --apply
```

El primer comando es simulación con rollback. El segundo conserva identificadores y referencias históricas, actualiza únicamente nombres reconocidos y agrega faltantes. Archiva del catálogo de venta “Mes de 12 a 4” y “Clase muestra”; no los borra. Si detecta nombres ambiguos aborta. Aplica la política recibida: cancelaciones sin cuota y ventana de 12 horas, conservando otros ajustes. Los planes personalizados desconocidos permanecen intactos. Antes de aplicarlo a producción, revisar la simulación y contar con respaldo de la base.

Pruebas aisladas ejecutadas con `TEST_DATABASE_URL` explícita: vigencia30/60, no prórroga, diarios1/2, carreras de reservas, promoción de espera, horarios/días, credencial, personal1a1, guest pass cruzando mes e inasistencias/cancelación tardía. La suite HTTP prueba CRUD, conservación de reglas, desactivación del precio de apertura, credencial y café concurrente.
