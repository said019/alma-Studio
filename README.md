# Alma Movement

Plataforma de reservas, pagos, asistencias y comunidad de **Alma Movement**, estudio de Pilates en **Juriquilla, Querétaro**.

## Arquitectura

- **App cliente**: reservar clases, comprar paquetes, ver membresía, historial, wallet y notificaciones.
- **Panel admin**: clases, horarios, alumnas, membresías, pagos, POS, lealtad, reportes y configuración.
- **Backend** Express + PostgreSQL: comprobantes de pago, recordatorios, WhatsApp/Evolution API, QR check-in y lealtad.

## Catálogo (Fase 1)

- **5 disciplinas** en 2 áreas:
  - **Reformer / Tower** (equipo) — cupo 4 por clase: *Pilates Reformer*, *Pilates Tower*.
  - **Studio** (tapete) — cupo 8 por clase: *Pilates Mat*, *Barre*, *Sculpt*.
- **Horarios**: lunes a sábado, 6:00–11:00 am y 5:00–8:00 pm. (La disciplina por horario se configura desde el admin.)
- **17 paquetes** (tabla completa en `docs/superpowers/specs/2026-06-06-alma-catalogo-fase1-design.md`):
  Clase única / 4 / 8 / 12 sesiones e Ilimitado por área, paquetes mixtos (Alma Balance / Fusion / Experience), AM Club matutino y Alma Unlimited.
- **Modo apertura**: switch global en *Admin → Configuración*. Con él activo los paquetes ilimitados muestran y cobran precio de apertura; al apagarlo, el precio regular.
- **Reglas**: un paquete reserva solo su área (Studio o Reformer/Tower); los mixtos y Unlimited reservan ambas. AM Club solo permite clases matutinas (hasta las 10:00 am). "Alma Studio Intro" es clase muestra de un solo uso para nuevas alumnas.

## Pagos

- Transferencia o pago físico (tarjeta/efectivo en estudio); el cliente envía su comprobante y se valida manualmente.
- **Transferencia Banorte** — titular **Estefanía Torres Lanzagorta**, CLABE **072298012591154950**, cuenta **4189143097040441**.
- Los datos bancarios se editan en *Admin → Configuración → Pagos*.

## Políticas

- **Cancelación**: hasta 12 horas antes de la clase sin penalización. Tras 5 clases reservadas sin asistir, penalización con pérdida de puntos de lealtad.
- **Vigencia**: todos los paquetes 30 días desde la compra.
- **Reglas en estudio**: llegar 10 min antes · calcetines antiderrapantes obligatorios · respetar el horario de inicio · celular en silencio · informar previamente lesiones o condiciones médicas.

## Datos públicos

- **Dirección**: Plaza Arce, Calle Acueducto de Querétaro 513, Jurica Acueducto, 76230 Juriquilla, Qro.
- **WhatsApp**: 7721119216
- **Instagram**: @movementalma
- **Facebook**: Alma Movement

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

Configura `.env` desde `.env.example` antes de conectar base de datos remota, correo, WhatsApp o Wallet. La planeación por fases vive en `docs/superpowers/`.
