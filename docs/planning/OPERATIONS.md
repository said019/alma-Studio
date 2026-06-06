# Alma Movement — Operations Reference

> Documento operativo del estudio. Base para configuración de plataforma, atención al cliente y operación diaria.
> Última actualización: 2026-06-06

---

## 1. Identidad y Contacto

| Campo | Detalle |
|---|---|
| Nombre del estudio | Alma Movement |
| Disciplina principal | Pilates (Reformer, Tower, Mat) + Barre + Sculpt |
| Segmento | Boutique premium — "lujo accesible" |
| Ubicación | Plaza Arce, Calle Acueducto de Querétaro 513, Jurica Acueducto, 76230 Juriquilla, Qro., México |
| Teléfono / WhatsApp | 7721119216 |
| Instagram | @movementalma |
| Correo de operaciones | TBD / requiere confirmación del cliente |

### 1.1 Canal WhatsApp

El número 7721119216 debe integrarse con enlace directo de WhatsApp en todos los puntos de contacto digital (plataforma, correos automáticos, confirmaciones de reserva).

---

## 2. Horarios

### 2.1 Horario de atención del estudio

| Días | Horario de atención |
|---|---|
| TBD / requiere confirmación del cliente | 8:00 am – 10:00 pm |

> Nota: los días de operación (lunes a sábado, lunes a domingo, etc.) no están definidos en la fuente. Requieren confirmación del cliente.

### 2.2 Bloques de clases

Las clases se programan dentro de dos bloques horarios fijos:

| Bloque | Horario |
|---|---|
| Matutino | 6:00 am – 11:00 am |
| Vespertino | 5:00 pm – 8:00 pm |

> Los horarios exactos de inicio de cada clase dentro de cada bloque (p. ej. 6:00, 7:00, 8:00, 9:00, 10:00, 11:00 am) son TBD / requieren confirmación del cliente. La plataforma debe permitir configurarlos por disciplina y día.

---

## 3. Catálogo de Clases

### 3.1 Enums canónicos

```
ClassType   : REFORMER | TOWER | MAT | BARRE | SCULPT
DisciplineGroup : STUDIO | REFORMER_TOWER | ALL
```

- **STUDIO** agrupa: MAT, BARRE, SCULPT
- **REFORMER_TOWER** agrupa: REFORMER, TOWER
- **ALL** agrupa: REFORMER, TOWER, MAT, BARRE, SCULPT

### 3.2 Tabla de clases

| Nombre UI | ClassType | DisciplineGroup | Capacidad por clase |
|---|---|---|---|
| Pilates Reformer | `REFORMER` | `REFORMER_TOWER` | 4 lugares |
| Pilates Tower | `TOWER` | `REFORMER_TOWER` | 4 lugares |
| Pilates Mat | `MAT` | `STUDIO` | TBD |
| Barre | `BARRE` | `STUDIO` | TBD |
| Sculpt | `SCULPT` | `STUDIO` | TBD |

> Las capacidades de Mat, Barre y Sculpt no están definidas en la fuente. Deben confirmarse con el cliente antes de configurar la plataforma.

---

## 4. Reglas de Operación

### 4.1 Reservas y cancelaciones

| Regla | Valor |
|---|---|
| Ventana de cancelación | Mínimo 12 horas antes del inicio de la clase |
| Reagendar | Permitido con mínimo 12 horas de anticipación |
| No-show (`NO_SHOW`) | La sesión se descuenta del paquete; no reembolsable |
| Lista de espera | Soportada (`BookingStatus: WAITLISTED`) |

### 4.2 Estados de reserva (`BookingStatus`)

| Valor | Descripción |
|---|---|
| `RESERVED` | Lugar confirmado, clase próxima |
| `ATTENDED` | Asistencia registrada (check-in completado) |
| `NO_SHOW` | No asistió sin cancelar dentro de la ventana |
| `CANCELLED` | Cancelada por la clienta dentro de la ventana permitida |
| `WAITLISTED` | En lista de espera por capacidad llena |

### 4.3 Sistema de lealtad

| Regla | Detalle |
|---|---|
| Penalización | Tras 5 reservas con estado `NO_SHOW` acumuladas, la clienta pierde punto(s) de lealtad |
| Estructura completa del programa | TBD / requiere confirmación del cliente (puntos, sellos, beneficios, niveles) |

### 4.4 Reglamento del estudio (mostrar en la plataforma)

1. Llegar 10 minutos antes del inicio de la clase.
2. Uso obligatorio de calcetines antiderrapantes.
3. Respetar el horario de inicio; no se permite el acceso después de comenzada la clase.
4. Mantener el celular en silencio durante la sesión.
5. Informar previamente cualquier lesión o condición médica al instructor.

---

## 5. Pagos

### 5.1 Métodos aceptados (`PaymentMethod`)

| Valor | Descripción |
|---|---|
| `ONLINE` | Pago en línea (pasarela digital) |
| `TRANSFER` | Transferencia bancaria / SPEI |
| `CASH` | Pago físico en estudio |

### 5.2 Flujo de transferencia bancaria

1. La clienta realiza la transferencia a los datos bancarios del estudio.
2. La clienta envía el comprobante de pago por WhatsApp o en la plataforma.
3. El equipo del estudio valida el comprobante manualmente.
4. El estado de pago avanza de `AWAITING_PROOF` a `CONFIRMED` o `REJECTED`.

### 5.3 Estados de pago (`PaymentStatus`)

| Valor | Descripción |
|---|---|
| `PENDING` | Pago generado, sin acción del cliente aún |
| `AWAITING_PROOF` | Transferencia declarada; comprobante pendiente de validación |
| `CONFIRMED` | Pago validado; paquete/sesión activo |
| `REJECTED` | Comprobante rechazado o pago no reconocido |

> **Datos bancarios de transferencia:** contienen información sensible (número de tarjeta, CLABE, titular). NO deben incluirse en este repositorio. Deben almacenarse exclusivamente en variables de entorno o configuración privada del servidor (`.env` / secrets manager). Referencia interna: `config/payments.env` (archivo excluido de versión pública).

---

## 6. Catálogo de Paquetes

### 6.1 Enums de tipo de paquete (`PackageKind`)

```
PackageKind : SINGLE | PACK | UNLIMITED | INTRO | MIXED | AM_CLUB
```

### 6.2 Vigencias por defecto

| Regla | Vigencia |
|---|---|
| Vigencia estándar | 30 días a partir de la compra |
| PACK de 12 sesiones (Reformer/Tower o Studio) | 45 días |
| ALMA EXPERIENCE (paquete mixto) | 45 días |
| INTRO (`ALMA STUDIO INTRO`) | 7 días |

### 6.3 Paquetes Reformer / Tower (`DisciplineGroup: REFORMER_TOWER`)

| Nombre | PackageKind | Sesiones | Precio MXN | Vigencia | Nota |
|---|---|---|---|---|---|
| Clase Única Reformer/Tower | `SINGLE` | 1 | $270 | 30 días | — |
| 4 Sesiones Reformer/Tower | `PACK` | 4 | $920 | 30 días | "1 vez por semana" |
| 8 Sesiones Reformer/Tower | `PACK` | 8 | $1,760 | 30 días | "Alumnas constantes" |
| 12 Sesiones Reformer/Tower | `PACK` | 12 | $2,280 | 45 días | "Transformación y constancia" |
| Ilimitado Reformer/Tower | `UNLIMITED` | Ilimitado | $2,900 | 30 días | "Experiencia premium Alma" |
| Promo Apertura Ilimitado R+T | `UNLIMITED` | Ilimitado | $2,500 | 30 días | Precio promocional de apertura |

### 6.4 Paquetes Studio — Mat, Barre, Sculpt (`DisciplineGroup: STUDIO`)

| Nombre | PackageKind | Sesiones | Precio MXN | Vigencia | Nota |
|---|---|---|---|---|---|
| Alma Studio Intro | `INTRO` | 1 | $150 | 7 días | Solo nuevos usuarios — clase muestra |
| Clase Única Studio | `SINGLE` | 1 | $240 | 30 días | — |
| 4 Sesiones Studio | `PACK` | 4 | $900 | 30 días | — |
| 8 Sesiones Studio | `PACK` | 8 | $1,700 | 30 días | — |
| 12 Sesiones Studio | `PACK` | 12 | $2,150 | 45 días | — |
| Studio Ilimitado | `UNLIMITED` | Ilimitado | $2,700 | 30 días | Mat + Barre + Sculpt |
| Studio Ilimitado Promo Apertura | `UNLIMITED` | Ilimitado | $2,300 | 30 días | Precio promocional de apertura |

### 6.5 Paquetes Mixtos (`DisciplineGroup: ALL` parcial — `PackageKind: MIXED`)

| Nombre | Sesiones Studio | Sesiones R/T | Total sesiones | Precio MXN | Vigencia |
|---|---|---|---|---|---|
| Alma Balance | 4 | 4 | 8 | $1,500 | 30 días |
| Alma Fusion | 6 | 6 | 12 | $2,200 | 30 días |
| Alma Experience | 8 | 8 | 16 | $2,800 | 45 días |

### 6.6 Paquetes AM Club — Solo Matutino (`PackageKind: AM_CLUB`)

Válidos exclusivamente en clases del bloque matutino 7:00 am – 10:00 am.

| Nombre | Disciplinas | Sesiones | Precio MXN | Vigencia |
|---|---|---|---|---|
| AM Club | `STUDIO` (Mat, Barre, Sculpt) | 8 | $1,300 | 30 días |
| AM Club Reformer & Tower | `REFORMER_TOWER` | 8 | $1,600 | 30 días |

> Nota: el bloque AM Club se define como 7:00 am – 10:00 am. Verificar si las clases de las 6:00 am quedan incluidas o excluidas en este beneficio. Requiere confirmación del cliente.

### 6.7 Paquete Alma Unlimited (`DisciplineGroup: ALL`)

| Nombre | Disciplinas | Precio regular MXN | Precio promo apertura MXN | Vigencia |
|---|---|---|---|---|
| Alma Unlimited | ALL (Reformer + Tower + Mat + Barre + Sculpt) | $3,900 | $3,500 | 30 días |

---

## 7. Diferenciadores del Estudio

Los siguientes diferenciadores deben comunicarse en la plataforma, materiales de marketing y perfiles de redes sociales:

1. **Clases privadas** — sesiones individuales o en grupo reducido, disponibles a petición.
2. **Realización de eventos** — el estudio puede ser sede o co-organizador de eventos de bienestar.
3. **Atención personalizada** — seguimiento individual de progreso, objetivos y condición física.
4. **Enfoque en técnica y alineación** — instructores especializados con protocolo de corrección postural.
5. **Ambiente cuidadosamente diseñado** — espacio físico y digital concebido como experiencia de lujo.
6. **Experiencia integral de bienestar** — más allá del ejercicio: comunidad, constancia y crecimiento personal.

> Precios, condiciones y disponibilidad de clases privadas y eventos son TBD / requieren confirmación del cliente.

---

## 8. Automatizaciones y Funcionalidades Requeridas

| Funcionalidad | Descripción operativa |
|---|---|
| Reservas en línea | Flujo de reserva desde la plataforma, con selección de clase, horario y lugar |
| Confirmaciones automáticas | Notificación inmediata por WhatsApp y/o correo al confirmar reserva y pago |
| Lista de espera | `BookingStatus: WAITLISTED` — notificación automática si se libera un lugar |
| Check-in con QR | Registro de asistencia en estudio mediante código QR por reserva (`BookingStatus: ATTENDED`) |
| Pagos automáticos | Procesamiento de `PaymentMethod: ONLINE`; flujo manual de validación para `TRANSFER` |
| Recordatorios de clase | Notificación por WhatsApp y/o correo antes del inicio de cada clase (tiempo de anticipación TBD) |
| Renovación de paquetes | Alerta y flujo de compra cuando el paquete está próximo a vencer o se agotaron sesiones |
| Reportes de ocupación y ventas | Panel administrativo con métricas de ocupación por clase, disciplina y bloque horario |
| Sistema de lealtad | Acumulación y descuento de puntos/sellos; penalización automática tras 5 `NO_SHOW` |

---

## 9. Preguntas Abiertas

Los siguientes datos no están definidos en la fuente de verdad del cliente y deben confirmarse antes de configurar la plataforma o publicar información oficial:

1. **Capacidad por clase — Studio:** capacidad máxima de Mat, Barre y Sculpt (actualmente TBD).
2. **Días de operación:** ¿el estudio opera de lunes a sábado, lunes a domingo, u otro esquema? ¿Hay días festivos con horario especial?
3. **Horarios exactos de clase dentro de cada bloque:** ¿cuáles son los slots disponibles en el bloque 6-11 am y 5-8 pm por disciplina y día?
4. **Cobertura del AM Club a las 6:00 am:** ¿las clases del slot de 6:00 am están incluidas en los paquetes AM Club (definidos como 7-10 am) o quedan excluidas?
5. **Correo de operaciones / contacto administrativo:** dirección de email oficial del estudio para notificaciones y atención.
6. **Clases privadas — precios y condiciones:** tarifa, duración, anticipación mínima para agendar y modalidades disponibles.
7. **Eventos — condiciones:** tipos de eventos que organiza o acoge el estudio, tarifas y disponibilidad.
8. **Programa de lealtad — estructura completa:** ¿puntos o sellos? ¿Cuántos puntos por clase? ¿Qué beneficios se obtienen y en qué umbrales? ¿Qué cantidad exacta de puntos se pierde tras 5 `NO_SHOW`?
9. **Tiempo de anticipación para recordatorios:** ¿con cuántas horas de anticipación se envían los recordatorios de clase (p. ej. 24h y 1h antes)?
10. **Días de operación de instructores:** ¿los instructores tienen horarios fijos asignados por disciplina? ¿La plataforma debe gestionar perfiles de instructores?
11. **Pasarela de pago en línea:** ¿qué proveedor se utilizará para `PaymentMethod: ONLINE` (Stripe, Conekta, Clip, MercadoPago, otro)?
12. **Vigencia de promociones de apertura:** ¿hasta qué fecha están disponibles los precios de promo apertura (Ilimitado R+T $2,500; Studio Ilimitado Promo $2,300; Alma Unlimited promo $3,500)?
