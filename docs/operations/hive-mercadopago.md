# Mercado Pago en HIVE

La experiencia toma como referencia la última versión de Bao del 1 de octubre de 2026: formulario Card Payment Brick dentro de la página, validación bancaria 3DS y regreso a la misma orden. La implementación y las credenciales se mantienen independientes de Bao.

## Configuración de producción

Servicio Railway: `alma-web`, proyecto `Hive studio`. Origen público: `https://hivestudio.com.mx`.

El usuario confirmó que HIVE cobrará en **su propia cuenta de Mercado Pago**; Bao se usa únicamente como referencia de implementación. Se requieren variables de la cuenta de HIVE: `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_WEBHOOK_SECRET`, `MP_COLLECTOR_ID`, `MP_ENABLED=true` y `MP_WEBHOOK_BASE_URL=https://hivestudio.com.mx`. El access token y public key deben pertenecer a la misma aplicación. Configurar notificaciones de pagos en Mercado Pago a `https://hivestudio.com.mx/api/mercadopago/webhook` y usar su secreto de firma. No reutilizar el secreto de otra aplicación por coincidencia de nombre.

`GET /api/payments/card-readiness` informa disponibilidad sin revelar secretos. Sin configuración completa, la opción integrada se deshabilita; transferencia y efectivo siguen disponibles. La configuración existente de HIVE no contiene credenciales Mercado Pago al preparar esta entrega. La cuenta receptora será la propia de HIVE, confirmado por el usuario. No se copiaron credenciales entre estudios.

## Confirmación y recuperación

El navegador sólo envía un token de tarjeta. Importe, correo y referencia provienen de la orden guardada. Cada orden reserva un intento con clave de idempotencia; un fallo o timeout no vuelve a enviar el cobro. La sesión consulta el proveedor para recuperar el intento. Antes de activar se valida referencia, importe, moneda MXN, cuenta receptora, tarjeta y modo real en producción. Webhooks requieren firma HMAC y una consulta autenticada al proveedor.

La activación y conciliación usan bloqueo de la orden y transacción. Los reembolsos actualizan el registro contable; reembolso total o contracargo cancelan la membresía y reservas futuras. Los avisos atrasados no restauran acceso. La interfaz muestra devoluciones antes que la antigua aprobación contable.

## Plan anual

Se conservan los enlaces proporcionados para contratación anual, asociados al importe regular o de apertura correspondiente. Este enlace es externo y requiere conciliación administrativa; el formulario de pago único no autoriza ni ejecuta cargos recurrentes. La activación automática descrita arriba aplica a pagos integrados con tarjeta, no a esos enlaces externos. No afirmar que abrir un enlace confirma una compra.

## Comprobación

Pruebas locales con proveedor simulado cubren concurrencia, timeout, recuperación, 3DS, titularidad de orden, firma, importes, cuentas, reembolsos y ausencia de doble activación. No se realizaron cargos reales. La visualización de los campos alojados por Mercado Pago y la entrega de un webhook real requieren terminar la configuración de la cuenta.
