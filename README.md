# HIVE Pilates Studio

Plataforma de reservas, pagos, asistencias y comunidad de **HIVE Pilates Studio**, estudio de Pilates Reformer en **Coyoacán, CDMX**.

## Arquitectura

- **Landing** (`/`): horario de la semana, paquetes, clases y coaches, y contacto. Lee el catálogo del servidor.
- **App cliente**: reservar clases, comprar paquetes, ver membresía, historial, wallet y notificaciones.
- **Panel admin**: clases, horarios, alumnas, membresías, pagos, POS, lealtad, reportes y configuración.
- **Backend** Express + PostgreSQL: comprobantes de pago, recordatorios, WhatsApp/Evolution API, QR check-in y lealtad.

## Catálogo

El catálogo real del estudio (tipos de clase, paquetes, precios, coaches y horarios) se captura en el panel. El servidor sólo siembra un catálogo inicial cuando las tablas están **vacías** (instalación nueva): `server/lib/catalog.js`, sembrado por `server/lib/catalogSeed.js`. Con filas existentes el arranque no desactiva ni reescribe nada.

El catálogo inicial trae:

- **5 disciplinas** en 2 áreas:
  - **Reformer / Tower** (equipo) — cupo 4 por clase: *Pilates Reformer*, *Pilates Tower*.
  - **Studio** (tapete) — cupo 8 por clase: *Pilates Mat*, *Barre*, *Sculpt*.
- **Horarios**: lunes a sábado, 6:00–11:00 am y 5:00–8:00 pm. (La disciplina por horario se configura desde el admin.)
- **17 paquetes**: Clase única / 4 / 8 / 12 sesiones e Ilimitado por área, paquetes mixtos (Balance / Fusion / Experience), AM Club matutino, Unlimited y "Studio Intro" como clase muestra.
- **Modo apertura**: switch global en *Admin → Configuración*. Con él activo los paquetes ilimitados muestran y cobran precio de apertura; al apagarlo, el precio regular.
- **Reglas**: un paquete reserva solo su área (Studio o Reformer/Tower); los mixtos y Unlimited reservan ambas. AM Club solo permite clases matutinas (hasta las 10:00 am). "Studio Intro" es clase muestra de un solo uso para nuevas alumnas.

## Pagos

- Tarjeta (Stripe), transferencia o pago en el estudio (tarjeta/efectivo). Con transferencia, la clienta sube su comprobante y recepción lo valida.
- Los datos bancarios de la transferencia se capturan en *Admin → Configuración → Pagos* (o con las variables `BANK_*`). No van en el repositorio.

## Políticas

Las políticas de cancelación, la cuota de cancelaciones y los textos legales se configuran en *Admin → Configuración → Políticas* y se publican en `/legal/terminos`, `/legal/cancelacion` y `/legal/privacidad`.

## Datos públicos

Fuente única: `src/lib/studio.ts`.

- **Dirección**: Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX
- **Instagram**: [@hive.pilates](https://www.instagram.com/hive.pilates)
- **Horario**: 6 AM a 9 PM
- **WhatsApp y teléfono**: pendientes (el estudio aún no comparte número).
- **Sitio**: https://www.almamovement.com.mx (dominio actual del sitio).

## Desarrollo local

Frontend con hot-reload (sin backend):

```sh
npm install
npm run dev
```

App completa (frontend + API + base de datos local):

```sh
npm run db:local      # Postgres embebido en 127.0.0.1:5433 (deja la terminal abierta)
npm run db:schema     # aplica esquema + migraciones
npm start             # sirve dist + API en http://localhost:8080
```

Configura `.env` desde `.env.example` antes de conectar base de datos remota, correo, WhatsApp o Wallet. Más detalle en `docs/LOCAL-DEV.md` y `docs/DEPLOY.md`. La planeación por fases vive en `docs/superpowers/`.

Imágenes de marca (favicon, íconos, logo de correo, logos del pase): `npm run brand:assets` las genera desde `src/assets/brand/hive-mark.svg`.
