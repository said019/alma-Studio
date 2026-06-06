# Alma Movement — Catálogo de Precios y Membresías

> Documento vivo. Fuente de verdad para pricing, catálogo de paquetes y reglas de vigencia.
> Última actualización: 2026-06-06

---

## Índice

1. [Glosario y enumeraciones canónicas](#1-glosario-y-enumeraciones-canónicas)
2. [Reglas generales de vigencia y cancelación](#2-reglas-generales-de-vigencia-y-cancelación)
3. [Catálogo — Reformer / Tower](#3-catálogo--reformer--tower)
4. [Catálogo — Studio (Mat · Barre · Sculpt)](#4-catálogo--studio-mat--barre--sculpt)
5. [Catálogo — Paquetes Mixtos](#5-catálogo--paquetes-mixtos)
6. [Catálogo — Premium / Especiales](#6-catálogo--premium--especiales)
7. [Vista comparativa general](#7-vista-comparativa-general)
8. [Reglas de negocio aplicadas al catálogo](#8-reglas-de-negocio-aplicadas-al-catálogo)
9. [Preguntas abiertas (TBD)](#9-preguntas-abiertas-tbd)

---

## 1. Glosario y enumeraciones canónicas

### Grupos de disciplina (`DisciplineGroup`)

| Valor enum | Disciplinas incluidas |
|---|---|
| `STUDIO` | Mat, Barre, Sculpt |
| `REFORMER_TOWER` | Reformer, Tower |
| `ALL` | Reformer, Tower, Mat, Barre, Sculpt |

### Tipos de clase (`ClassType`)

`REFORMER` · `TOWER` · `MAT` · `BARRE` · `SCULPT`

### Tipos de paquete (`PackageKind`)

| Valor | Descripción |
|---|---|
| `SINGLE` | Clase unitaria, pago por sesión |
| `PACK` | Paquete de N sesiones con vigencia fija |
| `UNLIMITED` | Clases ilimitadas dentro del `DisciplineGroup` durante la vigencia |
| `INTRO` | Clase de prueba para usuarios nuevos, vigencia reducida |
| `MIXED` | Paquete que combina sesiones de `STUDIO` y `REFORMER_TOWER` |
| `AM_CLUB` | Paquete de sesiones restringido a horario matutino |

### Estados de reserva (`BookingStatus`)

`RESERVED` · `ATTENDED` · `NO_SHOW` · `CANCELLED` · `WAITLISTED`

### Estados de pago (`PaymentStatus`)

`PENDING` · `AWAITING_PROOF` · `CONFIRMED` · `REJECTED`

### Métodos de pago (`PaymentMethod`)

`ONLINE` · `TRANSFER` · `CASH`

---

## 2. Reglas generales de vigencia y cancelación

| Regla | Valor |
|---|---|
| Vigencia por defecto | 30 días a partir de la fecha de compra |
| Vigencia extendida (PACK_12 y ALMA EXPERIENCE) | 45 días |
| Vigencia INTRO | 7 días |
| Ventana de cancelación sin penalización | Mínimo 12 horas antes del inicio de la clase |
| No-show | La sesión se descuenta del paquete; no reembolsable |
| Penalización de lealtad | Tras 5 reservas con `BookingStatus = NO_SHOW`, la clienta pierde punto(s) de lealtad |

---

## 3. Catálogo — Reformer / Tower

**`DisciplineGroup` aplicable:** `REFORMER_TOWER`

Las sesiones de esta sección pueden usarse indistintamente en clases de tipo `REFORMER` o `TOWER`.

| Nombre del paquete | `PackageKind` | Sesiones | Precio (MXN) | Vigencia (días) | Restricciones | Promo apertura |
|---|---|---|---|---|---|---|
| Clase Única Reformer/Tower | `SINGLE` | 1 | $270 | 30 | — | No |
| 4 Sesiones Reformer/Tower | `PACK` | 4 | $920 | 30 | Ideal: 1 vez por semana | No |
| 8 Sesiones Reformer/Tower | `PACK` | 8 | $1,760 | 30 | Perfil: alumnas constantes | No |
| 12 Sesiones Reformer/Tower | `PACK` | 12 | $2,280 | 45 | Perfil: transformación y constancia | No |
| Ilimitado Reformer/Tower | `UNLIMITED` | Ilimitadas | $2,900 | 30 | — | No |
| Promo Apertura Ilimitado Reformer/Tower | `UNLIMITED` | Ilimitadas | $2,500 | 30 | Precio de lanzamiento, `DisciplineGroup = REFORMER_TOWER` | **Sí** |

### Notas de sección

- El precio de referencia por sesión en Clase Única es **$270 MXN**.
- El paquete de 12 sesiones tiene vigencia extendida de **45 días** (excepción a la regla de 30 días).
- La promo de apertura para Ilimitado representa un descuento de **$400 MXN** respecto al precio regular.

---

## 4. Catálogo — Studio (Mat · Barre · Sculpt)

**`DisciplineGroup` aplicable:** `STUDIO`

Las sesiones de esta sección pueden usarse en clases de tipo `MAT`, `BARRE` o `SCULPT`.

| Nombre del paquete | `PackageKind` | Sesiones | Precio (MXN) | Vigencia (días) | Restricciones | Promo apertura |
|---|---|---|---|---|---|---|
| Alma Studio Intro | `INTRO` | 1 | $150 | 7 | Solo usuarios nuevos (primer acceso al estudio) | No |
| Clase Única Studio | `SINGLE` | 1 | $240 | 30 | — | No |
| 4 Sesiones Studio | `PACK` | 4 | $900 | 30 | — | No |
| 8 Sesiones Studio | `PACK` | 8 | $1,700 | 30 | — | No |
| 12 Sesiones Studio | `PACK` | 12 | $2,150 | 45 | — | No |
| Studio Ilimitado | `UNLIMITED` | Ilimitadas | $2,700 | 30 | `DisciplineGroup = STUDIO` | No |
| Studio Ilimitado Promo Apertura | `UNLIMITED` | Ilimitadas | $2,300 | 30 | Precio de lanzamiento | **Sí** |

### Notas de sección

- El paquete `INTRO` (`Alma Studio Intro`) **solo puede adquirirse una vez por usuario** y tiene vigencia reducida de **7 días**.
- El paquete de 12 sesiones tiene vigencia extendida de **45 días**.
- La promo de apertura Studio Ilimitado representa un descuento de **$400 MXN** respecto al precio regular.

---

## 5. Catálogo — Paquetes Mixtos

**`PackageKind`:** `MIXED`

Combinan sesiones de `STUDIO` y `REFORMER_TOWER` en un solo paquete. Las sesiones de cada grupo solo son canjeables en las disciplinas correspondientes.

| Nombre del paquete | `PackageKind` | Sesiones Studio | Sesiones Reformer/Tower | Total sesiones | Precio (MXN) | Vigencia (días) | Restricciones | Promo apertura |
|---|---|---|---|---|---|---|---|---|
| Alma Balance | `MIXED` | 4 | 4 | 8 | $1,500 | 30 | — | No |
| Alma Fusion | `MIXED` | 6 | 6 | 12 | $2,200 | 30 | — | No |
| Alma Experience | `MIXED` | 8 | 8 | 16 | $2,800 | 45 | — | No |

### Notas de sección

- **Alma Experience** tiene vigencia extendida de **45 días** para reflejar el volumen de 16 sesiones.
- Las sesiones de cada bloque no son intercambiables entre grupos: las 4/6/8 sesiones Studio no pueden usarse en Reformer/Tower y viceversa.

---

## 6. Catálogo — Premium / Especiales

Esta sección incluye paquetes con restricciones de horario o de grupo de disciplina ampliado.

| Nombre del paquete | `PackageKind` | `DisciplineGroup` | Sesiones | Precio (MXN) | Vigencia (días) | Restricciones | Promo apertura |
|---|---|---|---|---|---|---|---|
| AM Club Studio | `AM_CLUB` | `STUDIO` | 8 | $1,300 | 30 | Solo horario matutino 7:00am–10:00am | No |
| AM Club Reformer & Tower | `AM_CLUB` | `REFORMER_TOWER` | 8 | $1,600 | 30 | Solo horario matutino 7:00am–10:00am | No |
| Alma Unlimited (promo apertura) | `UNLIMITED` | `ALL` | Ilimitadas | $3,500 | 30 | Precio de lanzamiento — Reformer+Tower+Mat+Barre+Sculpt | **Sí** |
| Alma Unlimited (precio regular) | `UNLIMITED` | `ALL` | Ilimitadas | $3,900 | 30 | Reformer+Tower+Mat+Barre+Sculpt | No |

### Notas de sección

- Los paquetes `AM_CLUB` solo permiten reservar clases programadas entre las **7:00am y las 10:00am**. No son válidos para clases vespertinas (5:00pm–8:00pm).
- **Alma Unlimited** es el único paquete con `DisciplineGroup = ALL`: acceso irrestricto a todas las disciplinas del estudio.
- La diferencia entre precio promo y regular de Alma Unlimited es **$400 MXN**.

---

## 7. Vista comparativa general

La tabla siguiente permite comparar todos los paquetes activos por precio y costo implícito por sesión.

> El costo por sesión en paquetes `UNLIMITED` y `AM_CLUB` es referencial; asume una frecuencia de uso promedio estimada y **no es un valor contractual**.

### Reformer / Tower

| Paquete | Sesiones | Precio MXN | Costo por sesión (MXN) | Vigencia |
|---|---|---|---|---|
| Clase Única | 1 | $270 | $270.00 | 30 días |
| 4 Sesiones | 4 | $920 | $230.00 | 30 días |
| 8 Sesiones | 8 | $1,760 | $220.00 | 30 días |
| 12 Sesiones | 12 | $2,280 | $190.00 | 45 días |
| Ilimitado (regular) | Ilimitadas | $2,900 | — | 30 días |
| Ilimitado (promo apertura) | Ilimitadas | $2,500 | — | 30 días |

### Studio (Mat · Barre · Sculpt)

| Paquete | Sesiones | Precio MXN | Costo por sesión (MXN) | Vigencia |
|---|---|---|---|---|
| Alma Studio Intro | 1 | $150 | $150.00 | 7 días |
| Clase Única | 1 | $240 | $240.00 | 30 días |
| 4 Sesiones | 4 | $900 | $225.00 | 30 días |
| 8 Sesiones | 8 | $1,700 | $212.50 | 30 días |
| 12 Sesiones | 12 | $2,150 | $179.17 | 45 días |
| Studio Ilimitado (regular) | Ilimitadas | $2,700 | — | 30 días |
| Studio Ilimitado (promo apertura) | Ilimitadas | $2,300 | — | 30 días |

### Mixtos

| Paquete | Total sesiones | Precio MXN | Costo por sesión (MXN) | Vigencia |
|---|---|---|---|---|
| Alma Balance | 8 | $1,500 | $187.50 | 30 días |
| Alma Fusion | 12 | $2,200 | $183.33 | 30 días |
| Alma Experience | 16 | $2,800 | $175.00 | 45 días |

### Premium / Especiales

| Paquete | Sesiones | Precio MXN | Vigencia | Restricción clave |
|---|---|---|---|---|
| AM Club Studio | 8 | $1,300 | 30 días | Solo matutino 7:00am–10:00am |
| AM Club Reformer & Tower | 8 | $1,600 | 30 días | Solo matutino 7:00am–10:00am |
| Alma Unlimited (promo) | Ilimitadas | $3,500 | 30 días | Todas las disciplinas |
| Alma Unlimited (regular) | Ilimitadas | $3,900 | 30 días | Todas las disciplinas |

---

## 8. Reglas de negocio aplicadas al catálogo

### 8.1 Vigencia

- La vigencia inicia en la **fecha de compra confirmada** (`PaymentStatus = CONFIRMED`).
- Tres duraciones posibles según el paquete:

| Duración | Paquetes |
|---|---|
| 7 días | `INTRO` (Alma Studio Intro) |
| 30 días | Todos los demás, salvo excepciones |
| 45 días | 12 Sesiones Reformer/Tower · 12 Sesiones Studio · Alma Experience |

- Las sesiones no utilizadas al vencer la vigencia **no son reembolsables ni transferibles** (requiere confirmación del cliente si se contempla alguna excepción).

### 8.2 Cancelación y no-show

- `BookingStatus = CANCELLED` sin penalización: hasta **12 horas antes** del inicio de la clase.
- `BookingStatus = NO_SHOW`: la sesión pasa a estado `NO_SHOW`, se descuenta del saldo del paquete y **no es reembolsable**.
- Penalización de lealtad: al acumular **5 registros `NO_SHOW`**, la clienta pierde punto(s) en el programa de lealtad.

### 8.3 Restricciones específicas de paquetes

| Restricción | Paquetes afectados |
|---|---|
| Solo usuarios nuevos (un solo uso por cuenta) | Alma Studio Intro (`INTRO`) |
| Solo horario matutino 7:00am–10:00am | AM Club Studio · AM Club Reformer & Tower |
| Precio de lanzamiento (disponible durante promo de apertura) | Promo Apertura Ilimitado Reformer/Tower · Studio Ilimitado Promo · Alma Unlimited (promo) |

### 8.4 Métodos de pago aceptados

`ONLINE` · `TRANSFER` · `CASH`

> Los datos bancarios para pagos por `TRANSFER` (Banorte, titular: Estefanía Torres Lanzagorta) son **datos sensibles** y deben almacenarse exclusivamente en variables de entorno o configuración privada. No deben exponerse en repositorios públicos ni en la interfaz de usuario de forma abierta. El cliente adjunta comprobante; la validación es manual y lleva el pago a estado `CONFIRMED`.

### 8.5 Reglas del estudio (a mostrar en la app)

1. Llegar **10 minutos antes** del inicio de la clase.
2. Uso **obligatorio** de calcetines antiderrapantes.
3. Respetar el horario de inicio.
4. Mantener celulares en silencio.
5. Informar previamente cualquier lesión o condición médica.

---

## 9. Preguntas abiertas (TBD)

Los siguientes puntos no están definidos en la fuente de verdad y **requieren confirmación del cliente** antes de implementarse en producto o comunicarse al público.

| # | Tema | Detalle | Impacto |
|---|---|---|---|
| 1 | Capacidad de clases Studio | Capacidad máxima por clase para `MAT`, `BARRE` y `SCULPT` está marcada como TBD. Solo está definido: Reformer = 4 lugares, Tower = 4 lugares. | Crítico — bloquea lógica de lista de espera (`WAITLISTED`) y control de aforo |
| 2 | Fecha de vigencia de promos de apertura | No se especifica hasta qué fecha estarán activos los precios promocionales de apertura (`PROMO APERTURA`). | Alto — necesario para automatizar la transición al precio regular en el sistema |
| 3 | Sesiones no consumidas al vencer vigencia | ¿Se permite congelar paquetes, transferir sesiones o aplicar alguna política de cortesía? La especificación actual indica que no son reembolsables, pero no detalla casos de fuerza mayor. | Medio — impacta políticas de atención al cliente y satisfacción |
| 4 | Puntos de lealtad perdidos por no-show | La regla indica que tras 5 `NO_SHOW` se pierde(n) "punto(s) de lealtad", pero no especifica cuántos puntos se pierden ni cómo funciona el sistema completo de lealtad (acumulación, canje, niveles). | Alto — bloquea diseño del módulo de lealtad |
| 5 | Clases privadas — precios y formatos | Se mencionan como diferenciador, pero no hay precio, duración, ni condiciones definidas para sesiones privadas. | Medio — necesario para incluirlas en el catálogo |
| 6 | Eventos — precios y formatos | Se mencionan como servicio del estudio, sin precio ni estructura definida. | Bajo-Medio — requiere definición para habilitarlos en la plataforma |
| 7 | Horario detallado por disciplina | Se sabe el rango de horarios (6:00am–11:00am y 5:00pm–8:00pm), pero no la frecuencia ni distribución de cada disciplina en el horario semanal. | Medio — necesario para construir la vista de agenda |
| 8 | Política de reagendamiento múltiple | ¿Cuántas veces puede reagendarse una reserva dentro de la ventana de 12 horas? ¿Existe un límite? | Bajo — afecta reglas de negocio en el flujo de reserva |
| 9 | Instructoras por disciplina | No se lista el equipo de instructoras ni su asignación por horario/disciplina. | Medio — necesario para la funcionalidad de perfil de clase e instructor en la app |
| 10 | Acumulación de puntos de lealtad (positivo) | No está definido cómo se ganan puntos (¿por clase asistida?, ¿por compra de paquete?, ¿por referido?). | Alto — bloquea diseño completo del módulo de lealtad |
