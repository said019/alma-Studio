# Cómo volver a encender una función

Las vistas que Velan no tiene están **apagadas, no borradas**. Todo el código,
las rutas y los endpoints siguen enteros.

## Para reactivar

1. Abre [`src/config/features.ts`](src/config/features.ts).
2. Cambia el `false` de la función por `true`.
3. `npm run build` y despliega.

La vista vuelve al router y su entrada reaparece en el menú, con los enlaces
internos que la apuntaban.

## Qué está apagado hoy (24 sep 2026)

| Bandera | Qué devuelve |
|---|---|
| `loyalty` | Puntos, recompensas e hitos · `/admin/loyalty` |
| `reviews` | Moderación de reseñas · `/admin/reviews` |
| `pos` | Punto de venta de mostrador · `/admin/pos` |
| `visits` | Visitas sueltas y acompañantes · `/admin/visitas` |
| `whatsappTemplates` | Plantillas de WhatsApp · `/admin/whatsapp-templates` |
| `adminInbox` | Bandeja de avisos del panel · `/admin/notifications` |
| `scheduleTemplates` | Plantillas de horario semanal · `/admin/schedules` |
| `partnerPlatforms` | Wellhub: ajustes y check-ins |
| `walletExtras` | Historial y recompensas del monedero |
| `orderDetail` | Detalle de un pedido · `/app/orders/:id` |
| `membershipDetail` | Detalle de la membresía |
| `profileSecurity` | Cambio de contraseña desde el perfil |
| `onboarding` | Cuestionario posterior al registro |

## Lo que se dejó encendido aunque Velan no lo tenga

- **`/app/profile/responsiva`** — el backend bloquea la primera reserva con
  `WAIVER_REQUIRED`. Sin esta vista **ninguna clienta podría reservar**.
- **`/admin/pasar-lista`** — es el equivalente de `/admin/checkin` de Velan.
- **`/admin/class-generator` y `/admin/class-types`** — son el destino real de
  `/admin/classes/generate` y `/admin/classes/types`, que Velan sí tiene.
- **`/app/wallet`** — equivale a `/app/pass` de Velan.

## Lo que NO se tocó

El backend está intacto: los endpoints siguen respondiendo. Se hizo así a
propósito, porque hay lógica interna que depende de ellos — por ejemplo, los
puntos de lealtad se otorgan al vender un paquete aunque la vista de lealtad
esté apagada. Apagar el backend habría roto ventas.

## Vistas que Velan tiene y Alma no

No se construyeron; sólo se anotan por si algún día hacen falta:
`/admin/audit` (bitácora), `/staff`, `/staff/instructor`, `/staff/reception`,
`/staff/reception/checkin` (portal propio para instructoras y recepción).
