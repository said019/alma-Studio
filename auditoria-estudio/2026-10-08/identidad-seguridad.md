# Identidad, seguridad y comunicaciones

Auditoría del 8 de octubre de 2026. Ninguna corrección aplicada.

## Ejecutado

`node scripts/audit-identity-20261008.mjs` levanta API y PostgreSQL desechables, sin .env ni credenciales externas. Seis casos sintéticos de registro y cuatro consultas anónimas, más 41 regresiones de privacidad, permisos, responsiva, validación y baja de clientes: **41/41 pasan** en la repetición aislada. El primer intento agotó el rate limit de autenticación por concentrar fixtures en una IP: no es fallo de esas 41 funcionalidades. Se elevaron límites exclusivamente en el proceso local del segundo intento; no certifica controles de abuso. Logs completos conservados en `identity-api.log` y `identity-api-retry.log`.

Baja de cliente conserva órdenes/membresías/reservas anonimizadas, revoca token, bloquea baja con membresía activa o reserva futura, y bloquea venta/asignación a persona anonimizada. Privacidad: registro de versión/fecha, salud exige consentimiento de cliente, retirada borra salud. Recepción no accede a pagos, banco ni informes financieros; sí a operación autorizada. Estas pruebas no constituyen dictamen legal ni certificación de cada proyección de datos de salud.

En navegador público productivo se observó registro con país telefónico y campos día/mes/año separados. Seleccionar 31/febrero/2000 muestra «Fecha fuera de rango». No se envió el formulario, aceptó contrato ni creó cuenta real; pestaña temporal cerrada.

## ID01 — P1: registro permite saltarse validaciones del formulario

Defecto reproducido API/DB local, `server/index.js:3323`. Password de un carácter →201; teléfono `abc` →201; acceptsTerms=false →201 y persiste false. Un teléfono internacional válido +34612345678 se conserva correctamente. Fecha 2000-02-31 →500, sin fila persistida, aunque frontend la rechaza correctamente. Validación superficial de fecha permite que PostgreSQL reciba el imposible. Cierre: validación compartida en servidor, fecha civil exacta, contrato de password/teléfono y aceptación según política; inválidos400 sin filas nuevas. Estimación 0.5–1 día. A1/A5/L5.

Registro de menor de seis años también devuelve201. No hay política de menores confirmada: decisión pendiente A6, no se asume prohibición ni requisito legal específico.

## CO01 — P1: campañas pueden incluir a quien rechazó promociones

Gap confirmado por inspección `server/lib/communications.js:20–26`: sólo audiencia accepts_communications filtra receive_promotions=true; all/with_active_membership/without_membership no lo filtran. La selección de segmento no debería anular preferencias de marketing. No se mandaron mensajes ni se afirma envío real a una persona. Cierre: aplicar consentimiento a todas las audiencias de marketing y separar avisos operativos explícitos; fixture opt-out excluido en cada segmento. Estimación medio día. H9.

## CO02 — P2: envío de campaña no tiene trabajo durable por destinatario

Inspección `server/lib/communications.js:33–50`: bucle de envío dentro del request, contadores de aceptados/fallidos, sin cola/reanudación/idempotencia persistida por campaña. Un proceso interrumpido no conserva qué destinatarios faltan. No hay prueba externa de entrega; `sent` sólo indica éxito del llamado. Cierre: outbox, estados y reintentos limitados visibles; prueba caída a media campaña y receipt tardío. Estimación 1–2 días. H10. No extrapolar esta ausencia al módulo de notificaciones de reservas, que tiene otras estructuras.

## Riesgos por verificar, no defectos reproducidos

- `src/lib/api.ts` y `src/stores/authStore.ts`: limpieza de sesión ante401 no compara token de la solicitud con sesión más reciente; una respuesta vieja podría cerrar sesión nueva. Requiere prueba de carrera específica; no se cuenta como bug confirmado.
- https://hivestudio.com.mx y https://www.hivestudio.com.mx sirven200 sin redirección al mismo host. La misma versión no comparte localStorage entre orígenes; no se certificó retorno de pago/PWA entre ambos.
- Backups/restauración, lector QR físico, PWA instalada, entrega de correos y cobros reales quedan sin evidencia vigente.
- Salud capturada por personal no exige consentimiento en la misma ruta (test existente lo permite); revisar política y evidencia fuera del formulario antes de cambiar permisos.
