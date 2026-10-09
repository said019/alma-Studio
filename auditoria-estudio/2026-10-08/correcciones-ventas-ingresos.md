# Correcciones de ventas e ingresos — 2026-10-08

Verificación local con API real y PostgreSQL desechable, sin credenciales externas ni producción. No se hicieron cargos o devoluciones reales.

## Cambios comprobados

- Venta manual: clave de intención persistente en UI y tabla transaccional `manual_sale_intents`. Dos solicitudes concurrentes con igual actor, clave y contenido devuelven el mismo recibo/orden/membresía. Contenido diferente con la misma clave devuelve409. Otra clave permite una compra legítima nueva. Una respuesta perdida puede reintentarse con la misma clave. Un recibo ya emitido sigue recuperable aunque el plan después se desactive.
- Historial: agregados del universo filtrado independientes de la página, con paginación visible.201 ventas de10 conservan2010 en ambas páginas200+1 y en el KPI mensual.
- Fecha de ingreso: ventas/verificación establecen `paid_at`; reportes usan fecha de cobro con fallback histórico a verificación/aprobación/creación. Una orden del mes pasado pagada hoy no aparece en ingreso del mes pasado.
- Cancelar acceso no registra una devolución ficticia. Reembolso explícito total/parcial sí reduce ingreso neto; concurrencia del total permite un solo asiento.
- Pausa: se pasa `booking.id` a `restoreMembershipCredit` para identificar invitados. Una reserva personal y una con guest pass se cancelan, pero solo se devuelve el crédito personal realmente consumido.
- Historial incluye el componente independiente de incidencias de conciliación Mercado Pago, implementado por el agente principal.

## Pruebas

`node scripts/verify-sales-income-20261008.mjs` PASS: ventas, cortesía/motivo, permisos, aprobación concurrente, cancelación repetida, reembolsos concurrentes, intención/reintento/conflicto, paginación y fecha contable, pausa con invitado. Log: `verify-sales-income.log`.

`npx vitest run src/lib/manual-sale-intent.test.ts src/pages/admin/payments/PaymentsPage.test.tsx src/pages/admin/payments/PaymentsHistory.test.tsx src/pages/admin/payments/AuditSales20261008.test.tsx --maxWorkers=2`:4 archivos,19 pruebas pasan, incluida integración del componente MP en historial. Log: `verify-sales-ui.log`.

## Límites

La clave de intención distingue reintentos del mismo intento: dos personas que inician ventas independientes tienen claves distintas. Los históricos sin fecha autoritativa conservan fallback y no inventan una fecha bancaria. Estas pruebas no certifican entrega de webhook real, banco, 3DS ni despliegue. Conciliador MP y validación final del esquema/despliegue quedan coordinados por agente principal.
