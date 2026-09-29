# HIVE Pilates Studio — Correr en LOCAL

Guía para levantar el proyecto en tu PC **sin instalar nada a nivel sistema**.
Usa un PostgreSQL **embebido/portable** (`embedded-postgres`) que vive en `.pgdata/`.

## Requisitos
- Node.js (ya instalado) — el resto se resuelve con `npm install`.

## Primera vez
```bash
npm install
cp .env.example .env      # o usa el .env ya creado para local
npm run build             # genera dist/ (el server sirve el frontend)
```

## Arrancar (cada vez)
Necesitas **2 procesos** (2 terminales):

```bash
# Terminal 1 — base de datos local (déjala abierta)
npm run db:local          # Postgres en 127.0.0.1:5433 (usuario y base técnicos: "alma")

# (solo la primera vez, o tras borrar .pgdata) aplicar el esquema:
npm run db:schema         # crea 59 tablas + seeds

# Terminal 2 — la app (API + frontend)
npm start                 # http://localhost:8090
```

Abre **http://localhost:8090**

## Cuenta de admin
El servidor ya no siembra una contraseña por defecto. Al arrancar crea la cuenta
de administración **sólo si no existe** y defines `ADMIN_PASSWORD` en `.env`
(mínimo 8 caracteres, una mayúscula y un número). El correo es `ADMIN_EMAIL`,
o `admin@almamovement.mx` si no lo defines. Si la cuenta ya existe, su
contraseña no se toca.
- Panel: http://localhost:8090/auth/login → `/admin/dashboard`

## Notas
- **Puerto:** la app corre en **8090** (el 8080 estaba ocupado en esta PC). Cambialo en `.env` (`PORT`).
- **Base de datos:** los datos persisten en `.pgdata/` (ignorada por git). El usuario, la contraseña y la base locales se llaman `alma` (`scripts/db-local.cjs`): son nombres técnicos del cluster ya creado; cambiarlos obliga a recrear `.pgdata/`. Para empezar de cero: borra `.pgdata/` y `.schema_applied`, y repite `db:local` + `db:schema`.
- **Encoding:** la BD se crea en UTF8 (necesario por los emojis del schema). El script `db:schema` asume una BD UTF8 ya creada por `db:local`.
- **Integraciones opcionales** (email Resend, WhatsApp Evolution, Apple/Google Wallet, Google Drive videos): se desactivan solas si no defines sus variables en `.env`. La app funciona sin ellas.

## Producción
Ver [DEPLOY.md](DEPLOY.md) (Railway + Postgres dedicado).
