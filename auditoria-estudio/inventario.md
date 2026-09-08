# Inventario — Alma Movement

**Proyecto:** `/Users/saidromero/Alma Studio/alma-Studio` · producto **Alma Movement** (estudio de pilates, Juriquilla, Qro.)
**Corte:** 8 sep 2026 · commit `b4de7dc` (`main`, árbol limpio)
**Modo:** auditoría sobre código + sistema levantado en entorno desechable. **No se tocó producción.**

## Entorno de la auditoría
- Postgres 16 aislado en `127.0.0.1:5499`, base `alma_qa` creada para esto (cluster propio en scratchpad).
- API en `127.0.0.1:8099` con `DATABASE_URL` apuntando a esa base, proveedores externos apagados (Stripe, Evolution/WhatsApp, Google/Apple Wallet), rate limit elevado.
- Esquema aplicado **dos veces**: 0 errores en ambos pases → idempotente.
- Fixtures con prefijo `qa20260908_`, registradas en `auditoria-estudio/qa-20260908/fixtures.json`.

## Operación que asume el sistema
Un solo estudio, dos áreas de producto (**Studio** y **Reformer/Tower**) más paquetes **mixtos**; capacidad por clase (5 típica), **sin camas numeradas** (no hay seat selector → B3 N/A). Cobro online (Stripe) **y** en mostrador (efectivo/transferencia con comprobante). Integración con **Wellhub** como agregador. Zona horaria `America/Mexico_City`, moneda MXN.

## Actores presentes
| Actor | Superficie | Estado |
|---|---|---|
| Clienta | PWA `/app/*` (19 rutas) | ✅ completa |
| Nueva | `/auth/register`, onboarding, responsiva | ✅ |
| Recepción | rol `reception` | ⚠️ existe pero con permisos de admin total |
| Instructora | rol `instructor` + tabla `instructors` con magic-link | ⚠️ sin vista propia en el router |
| Dueña | panel `/admin/*` (28 rutas) | ✅ completa |
| Sistema | 6 `setInterval` (recordatorios, semanal, renovación, clase), webhooks Stripe/Wellhub/Evolution | ✅ |

## Stack
React 18 + Vite + Tailwind + Radix + React Query + Zustand · Express 4 monolítico (`server/index.js`, **16 170 líneas**) · Postgres (`pg`) · JWT + bcrypt · Railway/Nixpacks.

## Superficie medida
- **245 rutas API**: 175 `adminMiddleware`, 38 `authMiddleware`, 32 públicas.
- **57 rutas de frontend**: 28 admin, 19 PWA de clienta, 6 auth, 3 legales, landing.
- **55 tablas** en el esquema base + ~38 creadas en caliente por `ensureSchema()` al arrancar.
- **38 tests** de servidor (`node:test`) + **19** de frontend (vitest).

## Integraciones
| Integración | Estado en código | Verificado |
|---|---|---|
| Stripe Checkout + webhook firmado | implementado | ❓ sin credenciales |
| Evolution API (WhatsApp) | implementado con plantillas editables | ❓ apagado |
| Resend (email) | implementado | ❓ apagado |
| Apple Wallet (PKPass + APNs) | implementado con fallback web | ⚠️ sin certificados |
| Google Wallet | implementado | ❓ sin credenciales (503) |
| Wellhub | firma, inventario, check-ins, crons, panel | ⚠️ panel ausente del build desplegado |
| Google Drive (media) | implementado | ❓ |

## Módulos detectados
Registro/identidad · responsiva digital · calendario y reservas · lista de espera · paquetes y membresías · órdenes con comprobante · Stripe · POS de mostrador · check-in (manual, QR, escáner) · visitas/walk-in e invitadas · wallet passes · notificaciones (WhatsApp/email/push) · campañas y segmentos · lealtad (puntos, recompensas, hitos) · referidos · reseñas con etiquetas · eventos/masterclass · reportes · descuentos · productos · instructoras.
