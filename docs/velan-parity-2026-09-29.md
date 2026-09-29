# Funciones de Velan adaptadas a HIVE — 29 de septiembre de 2026

Referencia local: `Documents/Velan/velan-current`. Se compararon las rutas activas de `frontend/src/App.tsx`, sus páginas y operaciones del servidor. No se modificó Velan.

| Área de Velan | Implementación en HIVE |
| --- | --- |
| Inicio, acceso, registro, recuperación y legales | Vistas existentes, marca y contenido de HIVE |
| Usuarios y detalle | Registro, ficha, historial, edición, nacimiento día/mes/año; se añaden felicitaciones, enlace de recuperación y movimientos de créditos |
| Recepción | Portal propio, clases de hoy, lista mínima, asistencia y escáner QR |
| Instructoras | Portal propio, agenda y listas restringidas a clases asignadas |
| Cupones | Tabla/tarjetas móviles, filtros, búsqueda, porcentaje/importe, alcance, canales, mínimo, fecha final, cupo total y límite personal, pendientes e historial de usos |
| Aplicación del cupón | Compra en app, alta manual, venta de membresía y POS existentes; importe validado en servidor y límites bloqueados durante transacciones |
| Membresías | Congelar/reactivar, devolución de créditos por reservas futuras canceladas y extensión de vigencia por días congelados; venta, cortesía con motivo y ajustes existentes |
| Agenda | Crear/editar, generar y limpiar semana existentes; copiar semana sin duplicar, cancelar día futuro y marcar clase pasada como no realizada |
| Asistencia | Lista, QR, faltas y corrección existentes; deshacer check-in conservando la reserva y revirtiendo puntos |
| Invitados y visitas | Vista Visitas habilitada con acceso en menú; alta, búsqueda y asignación mediante perfiles de invitado de HIVE |
| Planes | Catálogo HIVE y edición existentes; ordenar planes |
| Reservas de usuario | Cambio de horario atómico: mismo crédito, validación de vigencia/categoría/franja/cupo/lista de espera; reserva original intacta si falla |
| Cobros e historial | Verificación, reembolsos y reportes existentes; cupón en venta de mostrador, detalle de orden, cancelar pendiente y continuar con tarjeta si Stripe está configurado |
| Pase y perfil | Pase de Wallet y seguridad del perfil habilitados, rutas de compatibilidad para `/app/pass` |
| Comunicaciones | Bandeja y plantillas habilitadas; campañas, comunicados por correo/WhatsApp y felicitación individual con resultados por canal |
| Reportes | Reportes existentes y ocupación por día/horario de las últimas cuatro semanas |
| Configuración y bitácora | Vistas existentes, diagnóstico Stripe sin revelar secretos y nuevas acciones auditadas |

## Reglas conservadas

- Los diez planes HIVE, precios normales/promoción y vigencia de 30 días no se reemplazan por el catálogo de Velan.
- Ilimitado se representa con `NULL`; congelar o cambiar una reserva no lo convierte en cero.
- Horario 12–16 y sesión personalizada con cupo uno siguen usando las reglas de HIVE.
- Invitados tienen perfiles/usuarios separados; no se copia el campo `guest_name` de Velan.
- Los triggers de HIVE mantienen el cupo; no se incrementa dos veces.
- Ni fotos ni coaches vuelven al inicio público.
- No se importan usuarios, ventas, credenciales ni información de Velan.
- Videoteca retirada y páginas de consultas/eventos sin ruta activa en Velan no se reintroducen.

## Verificación

`npm test`: pruebas de interfaz, servidor y scripts.
`npm run test:parity`: levanta Postgres y API desechables, sin leer `.env` ni credenciales externas; prueba límites concurrentes de cupón, venta/historial, cancelación, permisos del personal, reservas limitadas/ilimitadas, cupos, congelación/reactivación, deshacer asistencia y clase no realizada.
`npm run build`: compilación para producción.

Las pruebas no envían correos/WhatsApp ni ejecutan cobros reales de Stripe. Esos canales requieren sus integraciones configuradas. El historial de créditos registra movimientos desde la activación de su trigger, no inventa movimientos anteriores.
