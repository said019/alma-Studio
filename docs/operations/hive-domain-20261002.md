# Dominio HIVE — 2 de octubre de 2026

Dominio principal: https://hivestudio.com.mx. También se conecta www.hivestudio.com.mx al mismo servicio alma-web, proyecto Railway Hive studio. El dominio anterior permanece disponible para enlaces y callbacks existentes.

## DNS Hostinger

Nameservers conservados: cosmos.dns-parking.com y nova.dns-parking.com.

| Tipo | Nombre | Destino | TTL |
| --- | --- | --- | --- |
| ALIAS | @ | w6h1yyfl.up.railway.app | 300 |
| CNAME | www | t1k5ajeb.up.railway.app | 300 |
| TXT | _railway-verify | Verificación de propiedad asignada por Railway | 300 |
| TXT | _railway-verify.www | Verificación de propiedad asignada por Railway | 300 |

Antes del cambio había sólo A @ → 2.57.91.91 (TTL50) y CNAME www → hivestudio.com.mx (TTL300). El A se sustituyó por ALIAS porque Hostinger no permite coexistencia de ambos. No había registros MX/correo en esta zona. No se cambiaron nameservers ni cuentas.

## App y pagos

APP_URL, SITE_URL y MP_WEBHOOK_BASE_URL apuntan a https://hivestudio.com.mx. CORS incluye apex y www, conservando el dominio anterior y Railway. Metadatos, enlaces de instalación, emails, recuperación y Wallet usan el dominio nuevo; no se fuerza redirección global de webhooks anteriores.

Webhook de Mercado Pago: https://hivestudio.com.mx/api/mercadopago/webhook.

Cuenta receptora: propia de HIVE, nunca Bao. Siguen faltando MP_ACCESS_TOKEN, MP_PUBLIC_KEY, MP_WEBHOOK_SECRET y MP_COLLECTOR_ID de esa cuenta para habilitar pagos integrados. Cambiar el dominio no crea esas credenciales ni registra por sí solo el webhook en la aplicación del proveedor. El plan anual conserva sus enlaces externos y conciliación administrativa.

Los valores públicos de origen previos quedaron respaldados fuera del repositorio en el directorio privado de Codex. Los cambios de código se verificaron con pruebas focalizadas de emails/Stripe/marca, TypeScript y compilación de producción.
