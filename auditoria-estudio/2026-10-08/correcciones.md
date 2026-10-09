# Correcciones autorizadas — HIVE — 8 de octubre de 2026

Cierre posterior a la auditoría; no reemplaza su diagnóstico histórico ni convierte pendientes externos en pruebas aprobadas.

## Corregido y verificado localmente

- **Clases/coaches CC01–07:** edición de cupo bloquea fila antes de contar; generación serializada sin duplicados; fechas/horas/cupos validados en estado final; coach eliminada no opera ni se asigna. Instructor sólo opera clases propias; gestión coaches y eliminación clases/semanas requieren dueño. Ruta legacy410. Clases reservadas no permiten mover fecha/hora/disciplina/coach: se indica cancelar con devolución y crear nueva. API/PG, bulk y10tests DOM pasan.
- **Ventas/ingresos:** intención durable por actor+UUID+payload, una sola venta ante retry concurrente o respuesta perdida. Nueva intención permite nueva compra. Frontend conserva la intención hasta éxito, incluso recarga. Agregados completos independientes de paginación;201ventas de$10 producen$2,010. Transferencia registra fecha de confirmación como fecha de cobro, no fecha de creación. Cancelación no inventa reembolso; devolución explícita ajusta neto. Pausa no crea crédito por pase invitado. API/PG y19tests UI pasan.
- **Reservas:** no-show rechaza futuro/waitlist; reiteración idempotente. Invitado incluido no debita ni devuelve crédito personal. Procedencia en metadata de nuevas reservas; cancelación libera pase. Agotamiento genera error accionable y rollback, no500. Pruebas PG de saldos/rollback/reutilización pasan. Reservas históricas sin marcador no se reinterpretan a partir del plan actual; en respaldo de este estudio no existen bookings históricos.
- **Registro/sesión:** baja revoca token inmediatamente; errores de consulta de acceso devuelven503 sin permitir acceso ni cerrar una sesión válida. Datos personales de campañas se anonimizan al dar de baja.41regresiones de identidad y caso real503→200 pasan. API valida contraseña/teléfono/aceptación/fecha civil, rechaza inválidos400 y normaliza internacional. Respuestas antiguas200/401/503 no sobrescriben nueva sesión ni deshacen logout. Dashboard cumple mínimo12px. No se inventó política de menores.
- **Mercado Pago:** conciliación periódica con lease, rotación y prioridad de órdenes pendientes; histórico revisado cada6horas. Búsqueda completa en páginas50, falla cerrada ante truncamiento/cambios de paginado. Canonical persistido no se reemplaza por movimiento adicional. Extras/incompatibles quedan en revisión visible privada; nunca se reembolsan automáticamente. Cancelar reconsulta proveedor y rechaza aprobación tardía. Fecha real date_approved conservada. Primera noticia de reembolso total reconoce cobro original y devolución sin activar acceso: neto0. POST tardío no sobrescribe pago ya asociado.48pruebas de proveedor ficticio/DB+outbox pasan.
- **Campañas:** consentimiento aplicado a todas las audiencias de marketing y revalidado antes del envío. Cola durable por destinatario, leases, clave proveedor estable y reintentos acotados. Ambiguos mayores de23horas quedan en revisión para no superar ventana de idempotencia. Historial distingue aceptado/pending/skipped/review y muestra destinatario, IDs y errores sólo al dueño, con paginación. Aceptación no se etiqueta como entrega. No se envió campaña real.
- **Arranque:** migraciones aditivas trazadas y gate de tablas/columnas críticas antes de escuchar tráfico. Corregido cálculo semanal Motivation que aplicaba EXTRACT a resta deDATE (entero). Test de medianoche compara semántica nativa con baseline en Node20/25, sin cambiar regla comercial por diferencia de ICU.

## Validación

| Capa | Resultado |
|---|---|
| Frontend completo |123archivos,1371pruebas pasan |
| Backend unitario |284pasan,2omitidas,0fallos |
| Scripts unitarios |5pasan,1omitida,0fallos |
| MP/reconciliación/campañas con PostgreSQL aislado |48pasan; sin proveedores reales |
| Clases/coaches/bulk |API/PG y10DOM pasan;14unitarias bulk pasan |
| Ventas/ingresos |API/PG,19DOM pasan |
| Registro/reserva/sesión |API/PG y pruebas detalladas en cierre-reservas-registro-sesion.md |
| TypeScript/build |PASS; advertencia de tamaño de bundle no resuelta por este cambio |

Las cifras de subconjuntos se superponen con suite completa; no se suman como pruebas únicas.

## Respaldo y publicación

Respaldo previo PostgreSQL18 fuera del repositorio, directorio privado0700 y dump0600. SHA256 `9e9292af5c3944af79a04f681cf3c68a7475f624b1ffac06e75c41cf42d2750b`,316375bytes. **Restaurado realmente en PostgreSQL desechable**, sin iniciar app/jobs. Las tres migraciones se aplicaron sobre la copia y conservaron conteos de usuarios/órdenes/membresías/reservas. No se restauró encima de producción.

Publicación: pendiente de registrar commit/deployment/smoke abajo. El cambio local previo de7líneas Wellhub en ClassesCalendar se conserva separado; sólo la explicación de restricciones de edición forma parte de estas correcciones.

## Límites que se mantienen

No cobro, reembolso monetario ni correo real. No certificación de3DS en dispositivo físico, lector QR, PWA instalada o entrega de correos. No se habilitan Wellhub, puntos ni botones Wallet excluidos. No se crean coaches/clases reales para rellenar catálogo vacío. Operación requiere que dueño configure agenda/coaches.

Documentación primaria contrastada: [paginación Mercado Pago](https://www.mercadopago.com.mx/developers/es/docs/subscriptions/additional-content/payment-management) y [claves idempotentes Resend](https://resend.com/changelog/idempotency-keys). Estas fuentes respaldan límites de página50 y ventana proveedor24h; las pruebas locales demuestran nuestra implementación, no una transacción externa.
