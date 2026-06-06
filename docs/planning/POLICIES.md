# Alma Movement — Políticas Operativas y de Pagos

> Documento vivo. Fuente de verdad para reglas de negocio del estudio, flujos de pago y comportamiento del sistema.
> Última actualización: 2026-06-06
> Version: 1.0.0

---

## Tabla de contenidos

1. [Reglas del estudio](#1-reglas-del-estudio)
2. [Política de cancelación y reagendado](#2-política-de-cancelación-y-reagendado)
3. [Política de no-show](#3-política-de-no-show)
4. [Sistema de penalización de lealtad](#4-sistema-de-penalización-de-lealtad)
5. [Métodos de pago y flujo de validación](#5-métodos-de-pago-y-flujo-de-validación)
6. [Vigencias de paquetes (referencia rápida)](#6-vigencias-de-paquetes-referencia-rápida)
7. [Preguntas abiertas](#7-preguntas-abiertas)

---

## 1. Reglas del estudio

> Estas reglas se muestran en la app en la sección de confirmación de reserva y en el perfil de la usuaria.

| # | Regla |
|---|-------|
| 1 | Llegar **10 minutos antes** del inicio de la clase. |
| 2 | Uso **obligatorio** de calcetines antiderrapantes. |
| 3 | Respetar el horario de inicio; no se permite ingreso tardío. |
| 4 | Mantener el celular en **silencio** durante toda la clase. |
| 5 | Informar previamente al instructor cualquier **lesión o condición médica** relevante. |

**Horarios de clases:** 6:00 am – 11:00 am y 5:00 pm – 8:00 pm.

**Horario de atención del estudio:** 8:00 am – 10:00 pm.

---

## 2. Política de cancelación y reagendado

### 2.1 Ventana permitida

- Una reserva puede **cancelarse o reagendarse** con un mínimo de **12 horas de anticipación** al inicio de la clase.
- Dentro de ese margen, la sesión se devuelve al saldo del paquete activo de la usuaria (`BookingStatus` cambia a `CANCELLED`).

### 2.2 Cancelación fuera de ventana

- Si la cancelación se realiza con **menos de 12 horas** de anticipación, la sesión se **consume** del paquete y **no es reembolsable**.
- El sistema marca la reserva como `NO_SHOW` (o `CANCELLED` sin reintegro, según implementación — ver sección 3).

### 2.3 Proceso en la app

```
Usuaria solicita cancelar/reagendar
         │
         ▼
¿Faltan ≥ 12 horas para inicio de clase?
         │
   SÍ ──►  BookingStatus → CANCELLED
         │  Sesión reintegrada al paquete
         │
   NO ──►  BookingStatus → NO_SHOW (sesión consumida)
         │  Notificación a la usuaria vía WhatsApp/correo
         ▼
Registro en historial de la usuaria
```

### 2.4 Reagendado

- Aplican las mismas condiciones de ventana (≥ 12 horas).
- El reagendado crea una nueva reserva (`BookingStatus`: `RESERVED`) en el horario seleccionado y cancela la anterior (`CANCELLED`).
- Sujeto a disponibilidad de lugar en la clase destino.

---

## 3. Política de no-show

**Definición:** Una **no-show** ocurre cuando la usuaria tiene una reserva confirmada (`BookingStatus: RESERVED`) y no se presenta a la clase sin haber cancelado dentro de la ventana permitida.

### 3.1 Consecuencias inmediatas

| Consecuencia | Detalle |
|---|---|
| Sesión consumida | La clase se descuenta del paquete activo. |
| No reembolsable | No procede devolución de sesión ni de dinero bajo ningún concepto. |
| `BookingStatus` | Se actualiza a `NO_SHOW`. |

### 3.2 Registro y notificación

- El sistema registra el evento como `NO_SHOW` automáticamente al concluir el horario de la clase sin check-in registrado.
- Se envía una notificación informativa a la usuaria (WhatsApp/correo) indicando que la sesión fue consumida.

---

## 4. Sistema de penalización de lealtad

### 4.1 Regla de acumulación

- El contador de no-shows **se acumula de forma histórica** dentro del ciclo de lealtad activo.
- Al alcanzar **5 reservas con resultado `NO_SHOW`**, la usuaria pierde **punto(s) de lealtad** (la cantidad exacta de puntos deducidos es **TBD / requiere confirmación del cliente**).

### 4.2 Flujo del sistema

```
BookingStatus cambia a NO_SHOW
         │
         ▼
Contador de no-shows de la usuaria += 1
         │
         ▼
¿Contador >= 5?
         │
   SÍ ──►  Deducir punto(s) de lealtad
         │  Reiniciar contador a 0
         │  Notificar a la usuaria
         │
   NO ──►  Continuar (sin penalización de lealtad por ahora)
```

### 4.3 Parámetros TBD del sistema de lealtad

Los siguientes aspectos del programa de lealtad requieren definición antes de implementar:

- Número de puntos deducidos por penalización (actualmente: TBD).
- Escala de puntos para recompensas (canje, descuentos, etc.).
- Periodicidad de acumulación (mensual, por paquete, histórica).
- Definición completa del catálogo de beneficios del programa.

> Ver sección 7 — Preguntas abiertas para detalle completo.

---

## 5. Métodos de pago y flujo de validación

### 5.1 Métodos aceptados

El sistema soporta tres `PaymentMethod`:

| `PaymentMethod` | Descripción | Canal |
|---|---|---|
| `ONLINE` | Pago con tarjeta o pasarela digital en la app | App / plataforma web |
| `TRANSFER` | Transferencia bancaria SPEI / depósito | Fuera de app; requiere comprobante |
| `CASH` | Pago en efectivo en el estudio | Presencial; registrado por staff |

### 5.2 Estados de pago (`PaymentStatus`)

| `PaymentStatus` | Descripción |
|---|---|
| `PENDING` | Pago iniciado pero no confirmado (ej.: usuaria seleccionó paquete, aún no paga). |
| `AWAITING_PROOF` | Usuaria indica que realizó transferencia; pendiente de envío de comprobante. |
| `CONFIRMED` | Pago verificado y aprobado. Paquete activado. |
| `REJECTED` | Comprobante inválido, pago no identificado o monto incorrecto. |

### 5.3 Datos bancarios para transferencia

> ### ADVERTENCIA DE SEGURIDAD — LECTURA OBLIGATORIA
>
> Los datos bancarios a continuación (CLABE, numero de tarjeta y titular) son **informacion operativa sensible**.
>
> **NUNCA deben aparecer en un repositorio publico (GitHub, GitLab, Bitbucket, etc.).**
>
> **En la implementacion tecnica, estos valores DEBEN residir exclusivamente en:**
> - Variables de entorno (`.env`) excluidas del control de versiones via `.gitignore`.
> - Panel de administracion privado del sistema (base de datos cifrada o configuracion de servidor).
> - Gestor de secretos (ej.: AWS Secrets Manager, Vault, Doppler, o equivalente).
>
> Este bloque se incluye aqui SOLO como referencia para el equipo interno durante la fase de planeacion.
> **Eliminar o reemplazar con referencias a variables de entorno antes de cualquier commit.**

```
# NUNCA commitear estos valores — referenciar via variables de entorno
BANK_NAME=Banorte
ACCOUNT_HOLDER=Estefania Torres Lanzagorta
CARD_NUMBER=«TARJETA — configurar en panel admin / privado»
CLABE=«CLABE — configurar en panel admin / privado»
```

**Para mostrar al cliente en la app (UI):** mostrar unicamente banco, nombre del titular y los **ultimos 4 digitos de la CLABE** o tarjeta. El numero completo se muestra solo en el panel admin autenticado.

### 5.4 Flujo de validacion manual de comprobante (metodo `TRANSFER`)

#### Paso a paso

```
PASO 1 — Seleccion de paquete
  Usuaria elige paquete en la app y selecciona PaymentMethod: TRANSFER
  Sistema crea registro de pago con PaymentStatus: PENDING
  App muestra datos bancarios (banco + titular + ultimos digitos)
  App genera referencia unica de pago (ej.: "ALMA-2026-00342")

PASO 2 — Realizacion de la transferencia
  Usuaria realiza la transferencia desde su banco
  Usuaria regresa a la app y selecciona "Ya realice mi pago"
  PaymentStatus cambia a: AWAITING_PROOF

PASO 3 — Envio del comprobante
  La app solicita que la usuaria adjunte o comparta su comprobante:
    Opcion A: Subir imagen/PDF directamente en la app
    Opcion B: Enviar por WhatsApp al numero de contacto del estudio
  Sistema registra timestamp de envio del comprobante

PASO 4 — Validacion por staff (manual)
  Staff recibe notificacion de comprobante pendiente en panel admin
  Staff verifica:
    a) Que el monto coincide con el paquete seleccionado
    b) Que la referencia o concepto permite identificar el pago
    c) Que la fecha del comprobante es reciente y coherente
    d) Que el titular / origen del pago es identificable
  Decision del staff:
    Aprobado  →  PaymentStatus: CONFIRMED
    Rechazado →  PaymentStatus: REJECTED

PASO 5 — Notificacion a la usuaria
  Si CONFIRMED:
    Paquete activado automaticamente en la cuenta de la usuaria
    Notificacion: "Tu pago ha sido confirmado. ¡Tu paquete esta activo!"
    Vigencia inicia desde la fecha de confirmacion
  Si REJECTED:
    Notificacion con motivo del rechazo
    PaymentStatus vuelve a PENDING para reintento
    Staff puede contactar a la usuaria via WhatsApp
```

#### Tiempos esperados de validacion

| Horario de envio del comprobante | Tiempo estimado de confirmacion |
|---|---|
| Dentro de horario de atencion (8:00 am – 10:00 pm) | Mismo dia, maximo 2 horas (TBD — confirmar con cliente) |
| Fuera de horario de atencion | Siguiente dia habil en horario de apertura |

> El tiempo de respuesta exacto es **TBD / requiere confirmacion del cliente**.

### 5.5 Pago en efectivo (`CASH`)

- Registrado manualmente por el staff en el panel admin al momento del pago presencial.
- Staff selecciona paquete, asigna a la cuenta de la usuaria y confirma: `PaymentStatus: CONFIRMED`.
- El sistema activa el paquete de forma inmediata.

### 5.6 Pago en linea (`ONLINE`)

- Procesado por pasarela de pagos integrada en la app (pasarela especifica: **TBD**).
- Al recibir confirmacion de la pasarela: `PaymentStatus: CONFIRMED` de forma automatica.
- El paquete se activa sin intervencion del staff.

---

## 6. Vigencias de paquetes (referencia rapida)

| `PackageKind` | Vigencia | Ejemplo de paquete |
|---|---|---|
| `INTRO` | **7 dias** | Alma Studio Intro |
| `SINGLE` | 30 dias | Clase Unica Reformer/Tower, Clase Unica Studio |
| `PACK` (4 y 8 sesiones) | 30 dias | 4 Sesiones, 8 Sesiones |
| `PACK` (12 sesiones) | **45 dias** | 12 Sesiones Reformer/Tower, 12 Sesiones Studio |
| `UNLIMITED` | 30 dias | Ilimitado Reformer/Tower, Studio Ilimitado |
| `MIXED` — `ALMA_BALANCE`, `ALMA_FUSION` | 30 dias | Alma Balance, Alma Fusion |
| `MIXED` — `ALMA_EXPERIENCE` | **45 dias** | Alma Experience |
| `AM_CLUB` | 30 dias | AM Club Studio, AM Club Reformer & Tower |

> La vigencia inicia en la fecha de `PaymentStatus: CONFIRMED`, no en la fecha de primera clase.
> Esta regla debe confirmarse con el cliente (ver Preguntas abiertas).

---

## 7. Preguntas abiertas

Los siguientes puntos no estan definidos en la fuente de verdad y **requieren confirmacion del cliente** antes de implementar:

| # | Tema | Detalle |
|---|---|---|
| 1 | **Capacidad Studio** | Capacidad por clase de Mat, Barre y Sculpt esta marcada como TBD. |
| 2 | **Puntos deducidos por penalizacion de lealtad** | Se sabe que se pierde(n) "punto(s)" tras 5 no-shows, pero no cuantos puntos exactamente. |
| 3 | **Escala y catalogo completo del programa de lealtad** | No esta definido: como se ganan puntos, que se puede canjear, si hay niveles o sellos. |
| 4 | **Reinicio del contador de no-shows** | No se especifica si el contador de 5 no-shows es historico, mensual o por paquete. |
| 5 | **Pasarela de pagos en linea** | No se ha definido que plataforma procesa los pagos `ONLINE` (Stripe, Conekta, Clip, Mercado Pago, etc.). |
| 6 | **Tiempo maximo de validacion de comprobante** | El SLA de respuesta del staff para aprobar/rechazar transferencias no esta definido. |
| 7 | **Inicio de vigencia del paquete** | Confirmar si la vigencia inicia en la fecha de pago confirmado o en la fecha de primera clase utilizada. |
| 8 | **Politica de reembolso por rechazo de comprobante** | Que sucede si la usuaria no puede corregir el comprobante o el pago fue erroneo; flujo de devolucion. |
| 9 | **Numero de intentos de reenvio de comprobante** | Cuantas veces puede la usuaria reenviar un comprobante antes de que la solicitud expire. |
| 10 | **Clases privadas — precios y logistica** | Se mencionan como diferenciador pero no tienen precio ni politica operativa definida. |
| 11 | **Eventos — precios y logistica** | Idem: mencionados como diferenciador, sin detalle operativo. |
| 12 | **Instructor asignado por clase** | No se especifica si las clases tienen instructor fijo o rotativo, ni como se muestra en la app. |
| 13 | **Periodo de gracia tras vencimiento de paquete** | Si existe o no un periodo de gracia para usar sesiones restantes al expirar el paquete. |

---

*Documento generado para uso interno del equipo de Alma Movement. No distribuir publicamente sin revision del area de negocio.*
