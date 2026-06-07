# Alma Movement — Rebrand de catálogo (Fase 1)

**Fecha:** 2026-06-06
**Estado:** Diseño aprobado — pendiente de revisión final del usuario
**Autor:** Said Romero (+ Claude)

## Contexto

El repo `alma-Studio` se copió de una plataforma de studio previa (linaje
Ophelia Jumping Studio → Kala → Alma) y conserva datos, precios, disciplinas
y features que **no** corresponden a Alma Movement. La dueña entregó el
catálogo real (servicios, cupos, horarios y los paquetes con precios). Este
documento especifica la **Fase 1: dejar el catálogo correcto y borrar lo
heredado** que ya no aplica.

El trabajo total se divide en 3 fases independientes (cada una con su propio
spec → plan → implementación):

| Fase | Alcance | Estado |
|---|---|---|
| **1. Catálogo Alma** | Disciplinas, cupos, horarios, 17 paquetes/precios, modo apertura, gating por categoría, AM Club matutino, trial Intro; borrar planes/horarios viejos, planes de video, inscripción y anillos. | **Este spec** |
| 2. Limpieza de marca | Tokens `ophelia-*`, README, copy de landing/`index.html`, CSS `prose-ophelia`, `.lovable/plan.md`, footer de email, placeholder POS, dirección y banco reales. | Pendiente (requiere dirección + datos bancarios reales) |
| 3. Rediseño visual | Landing/UI premium · luxury · cercana · comunidad. | Brainstorm aparte (con mockups) |

## Objetivos de la Fase 1

1. La app ofrece las **5 disciplinas** reales agrupadas en 2 áreas.
2. Los **17 paquetes** con precios/sesiones/vigencia correctos quedan
   sembrados y visibles (landing + compra + POS), reemplazando todo lo viejo.
3. **Modo apertura**: un switch global en Admin alterna entre precio de
   apertura y precio regular para los 3 paquetes ilimitados.
4. El **gating por categoría** funciona: un plan `studio` no reserva clases
   `reformer_tower` y viceversa; `mixto`/`all` reservan todo.
5. **AM Club** solo permite reservar clases matutinas (≤ 10am).
6. Se **eliminan del producto**: inscripción anual, planes de video/online,
   y la feature de anillos (gamificación).

### Fuera de alcance (Fase 1)

- Rediseño visual / estética premium (Fase 3).
- Reescritura de copy de landing/README y limpieza de tokens `ophelia-*`
  (Fase 2), salvo lo mínimo necesario para que el catálogo se muestre bien.
- Datos reales de dirección y banco (Fase 2).
- Demolición profunda de tablas/funciones de anillos en DB (quedan dormidas;
  se borran en una migración posterior).

## Modelo de datos

### Disciplinas y áreas (`class_types`)

Se siembran 5 tipos de clase. El campo `category` representa el **área**
(no la disciplina), porque es a nivel de área que los paquetes dan acceso.

| Disciplina (`name`) | `category` (área) | `capacity` |
|---|---|---|
| Pilates Reformer | `reformer_tower` | 4 |
| Pilates Tower | `reformer_tower` | 4 |
| Pilates Mat | `studio` | 8 |
| Barre | `studio` | 8 |
| Sculpt | `studio` | 8 |

- El `CHECK` de `class_types.category` cambia de
  `('barre','jumping','pilates','mixto')` a
  `('studio','reformer_tower')` (más `mixto`/`all` no aplican a un tipo de
  clase, solo a planes).
- Se **borra** el seed actual del tipo "Barre" heredado y cualquier tipo
  Jumping/Pilates viejo.

### Horarios (`schedule_slots`)

Reemplazar el seed actual (7/8am, 7/8pm) por:

- **Mañana:** 6:00, 7:00, 8:00, 9:00, 10:00, 11:00 am
- **Tarde:** 5:00, 6:00, 7:00, 8:00 pm

Para cada slot, lunes a sábado (domingo sin clases, según la UI actual de
`AdminSchedule`). La disciplina concreta por slot la asigna la dueña después
desde el admin; el seed puede dejar un tipo por defecto editable.

### Paquetes (`plans`)

Categorías de plan (`plans.class_category`): `studio`, `reformer_tower`,
`mixto`, `all`. Comportamiento de gating (lógica ya existente en
`isMembershipCategoryCompatible`, `server/index.js:2253`):

- plan `studio` → solo clases área `studio`.
- plan `reformer_tower` → solo clases área `reformer_tower`.
- plan `mixto` o `all` → cualquier clase.
- `class_limit = NULL` → ilimitado (ya soportado, `isUnlimitedClasses`).

**Los 17 paquetes a sembrar:**

| # | Nombre | `price` | `opening_price` | `class_limit` | `duration_days` | `class_category` | Flags |
|---|---|---|---|---|---|---|---|
| 1 | Alma Studio Intro | 150 | — | 1 | 7 | studio | `is_non_repeatable`, `repeat_key=alma_studio_intro` (solo nuevas) |
| 2 | Clase Única Studio | 240 | — | 1 | 30 | studio | |
| 3 | 4 Sesiones Studio | 900 | — | 4 | 30 | studio | |
| 4 | 8 Sesiones Studio | 1700 | — | 8 | 30 | studio | |
| 5 | 12 Sesiones Studio | 2150 | — | 12 | 45 | studio | |
| 6 | Studio Ilimitado | 2700 | 2300 | NULL | 30 | studio | |
| 7 | Clase Única Reformer/Tower | 270 | — | 1 | 30 | reformer_tower | |
| 8 | 4 Sesiones Reformer/Tower | 920 | — | 4 | 30 | reformer_tower | |
| 9 | 8 Sesiones Reformer/Tower | 1760 | — | 8 | 30 | reformer_tower | |
| 10 | 12 Sesiones Reformer/Tower | 2280 | — | 12 | 45 | reformer_tower | |
| 11 | Reformer/Tower Ilimitado | 2900 | 2500 | NULL | 30 | reformer_tower | |
| 12 | Alma Balance | 1500 | — | 8 | 30 | mixto | 4 studio + 4 R/T (bolsa única) |
| 13 | Alma Fusion | 2200 | — | 12 | 30 | mixto | 6 + 6 |
| 14 | Alma Experience | 2800 | — | 16 | 45 | mixto | 8 + 8 |
| 15 | AM Club | 1300 | — | 8 | 30 | studio | `morning_only` (7–10am) |
| 16 | AM Club Reformer & Tower | 1600 | — | 8 | 30 | reformer_tower | `morning_only` (7–10am) |
| 17 | Alma Unlimited | 3900 | 3500 | NULL | 30 | all | acceso a las 5 disciplinas |

- `price` = precio **regular**; `opening_price` = precio de **apertura**
  (solo en los 3 ilimitados). Ver "Modo apertura".
- Se **borran** todos los planes viejos (Jumping/Pilates/Mixto/Barre), el
  fallback hardcodeado en `src/pages/Index.tsx:119` y el fallback de trial.

## Componentes / cambios

### 1. Modo apertura (precio de apertura vs. regular)

- Nueva columna `plans.opening_price DECIMAL(10,2) NULL`.
- Nuevo ajuste global `opening_pricing_active BOOLEAN` (en la tabla de
  settings que ya usa el admin para banco/políticas). Default `true`.
- Switch en **Admin → Configuración**: "Precios de apertura".
- Resolución de precio (helper único en server + espejo en front):
  `precio_efectivo = (opening_pricing_active && opening_price != null) ? opening_price : price`.
- Aplica en: landing (pricing), creación de orden/compra, POS. **Un solo
  interruptor** controla los 3 ilimitados.

### 2. AM Club — restricción matutina

- Nueva columna `plans.morning_only BOOLEAN DEFAULT false`.
- En el endpoint de reserva (`POST /api/bookings`, junto al chequeo de
  ventana de 2h en `server/index.js:3559`), si la membresía usada proviene
  de un plan `morning_only`, rechazar si `cls.starts_at` es después de las
  10:00am (hora local del studio) con un mensaje claro.
- `selectMembershipForClass` debe poder preferir/excluir membresías
  `morning_only` según la hora de la clase.

### 3. Gating por categoría (ajustes a lógica existente)

- `normalizeClassCategory` y los `CHECK`/normalizadores deben reconocer
  `studio` y `reformer_tower` (hoy asumen `barre/jumping/pilates/mixto`).
- `selectMembershipForClass` (`server/index.js:2261`): el ranking
  hardcodeado (jumping → mixto → all) se generaliza a
  **match exacto de área → mixto → all**, para consumir primero la bolsa
  específica correcta.
- Mensajes de error que hoy dicen "Jumping"/"Pilates"
  (`server/index.js:3611`) se vuelven genéricos según el área de la clase
  (Studio / Reformer-Tower).

### 4. Eliminar planes de video / online del producto

- No sembrar planes online (`scripts/seed-online-plans.cjs` no se ejecuta;
  marcar online existentes como inactivos o no sembrarlos).
- Ocultar la sección `ONLINE_PLANS` del landing (`src/pages/Index.tsx:241`,
  render ~`:1093`). El feature de biblioteca de video queda dormido en
  código (no se borra a fondo en esta fase).

### 5. Eliminar anillos (gamificación) del producto

Enfoque Fase 1 = **quitar todo lo visible**, dejar backend dormido:

- **Frontend (borrar/ocultar):**
  - `ProgresoSection` en `src/pages/Index.tsx:1254-1366` + import (`:7`).
  - Sección "Tres anillos" en `src/pages/client/Dashboard.tsx:205-230` y su
    cómputo `:104-154` + import (`:10`).
  - Display de anillos en `src/pages/client/Wallet.tsx:128-291` + import.
  - Campos "Metas de anillos" + `reward_description` en
    `src/pages/admin/plans/PlansList.tsx:349-370` (y parseo `:90-92,134-136`).
  - Tab "rings" + form "Sumar puntos de Conexión" en
    `src/pages/admin/clients/ClientDetail.tsx:411-467`.
  - Borrar `src/components/alma/RingsTriple.tsx`.
- **Pase de Apple Wallet:** `buildAlmaStripSvg` (`server/index.js:7007+`)
  dibuja anillos en el strip. Reemplazar el strip por una versión simple de
  marca (logo + "clases restantes"), sin anillos. Quitar bloques de anillos
  del pase de email/QR (`:8073-8075`, `:5370-5382`, etc.).
- **Plantillas de notificación:** quitar/ajustar `rings_closed` y las
  `motivation_*` que mencionan anillos (`server/index.js:237-268`).
- **Plan CRUD:** quitar la lectura/escritura de `ring_*_goal` en POST/PUT
  `/api/admin/plans` y en los endpoints externos.
- **Cron:** desactivar `runWeekResetCron` ligado al reset semanal de anillos.
- **Backend dormido (NO se toca en Fase 1):** tablas `ring_states`,
  `community_events`, funciones/triggers de la migración
  `20260506_alma_progress_rings.sql` y las columnas `ring_*_goal` en `plans`
  permanecen pero sin uso; se eliminan en una migración de limpieza posterior.

> Sub-decisión pendiente: qué muestra el strip del pase de wallet en lugar de
> los anillos. Default propuesto: nombre del plan + clases restantes + logo.

### 6. Eliminar inscripción anual

- No sembrar el plan "Inscripción (Pago Anual) $500". Verificar que nada en
  el flujo de alta exija una membresía de inscripción previa.

## Flujo de datos (sin cambios estructurales mayores)

Compra → orden → verificación admin → membresía activa con
`classes_remaining = class_limit` y `end_date = hoy + duration_days`
(lógica existente, `server/index.js:13766` y `:14947`). El único cambio es
que el **monto** de la orden usa el precio efectivo (modo apertura), y la
reserva valida categoría + `morning_only`.

## Manejo de errores

- Reserva fuera de categoría → 403 con mensaje por área (Studio /
  Reformer-Tower) en vez de Jumping/Pilates.
- Reserva de plan `morning_only` para clase de tarde → 403 con mensaje claro.
- Compra de "Alma Studio Intro" ya usada → bloqueada por
  `findNonRepeatablePlanConflict` (existente).
- Migración idempotente: `ADD COLUMN IF NOT EXISTS`, upserts por nombre/clave
  estable para no duplicar planes en reinicios del server.

## Testing

- Seeds aplican en DB limpia y en DB existente (idempotencia).
- Reserva: plan studio bloquea clase reformer; plan mixto/all permite ambas;
  ilimitado no descuenta créditos.
- AM Club: permite 7–10am, bloquea clase de tarde.
- Modo apertura: con switch ON los 3 ilimitados muestran/cobran apertura; con
  OFF muestran/cobran regular (landing, compra, POS coherentes).
- Trial Intro: no recomprable.
- Landing carga sin sección de anillos ni de planes online; muestra los 17
  paquetes correctos.
- Pase de wallet se genera sin anillos.

## Riesgos

- `server/index.js` es un monolito grande; la cirugía de anillos y el strip
  del pase deben hacerse con cuidado para no romper la generación del pase.
- El gating por categoría se apoya en lógica existente que asumía categorías
  viejas; hay que cubrir los normalizadores con pruebas.
- Datos sembrados vs. editados por admin: usar claves estables para upsert.
