# Alma Movement — Backlog Funcional Priorizado

> Documento de referencia: especificaciones de servicio, catálogo de precios, reglas operativas y automatizaciones deseadas.
> Última actualización: 2026-06-06
> Enfoque: MVP → v1 → v2 | Tono: premium, accesible, comunidad

---

## 1. Introducción y contexto

**Alma Movement** es un estudio de Pilates premium en Juriquilla, Querétaro, que requiere un ecosistema digital integrado para:

- Gestionar reservas en línea (4 disciplinas: Reformer, Tower, Mat, Barre, Sculpt)
- Procesar pagos (online, transferencia bancaria, efectivo) con validación manual de comprobantes
- Automatizar confirmaciones y recordatorios (WhatsApp/correo)
- Controlar asistencia (check-in QR)
- Renovar paquetes y membresías
- Mantener sistema de lealtad
- Entregar reportes operativos

**Audiencia:**
- **(A) Portal/App Clienta**: alumnas que reservan, pagan y participan
- **(B) Panel Admin**: staff del estudio que gestiona clases, confirma pagos, genera reportes

**Principios de diseño:**
- Lujo accesible, no complejo técnicamente
- Comunidad y pertenencia
- Transparencia de reglas (cancelación, no-show, lealtad)
- Seguridad en pagos y datos sensibles

---

## 2. Glosario canónico (referencia obligatoria)

### Enums y tipos

| Término canónico | Valores | Notas |
|---|---|---|
| **ClassType** | REFORMER, TOWER, MAT, BARRE, SCULPT | Disciplinas individuales |
| **DisciplineGroup** | STUDIO, REFORMER_TOWER, ALL | Agrupaciones de disciplinas |
| **PackageKind** | SINGLE, PACK, UNLIMITED, INTRO, MIXED, AM_CLUB | Tipos de paquetes/membresías |
| **BookingStatus** | RESERVED, ATTENDED, NO_SHOW, CANCELLED, WAITLISTED | Estados de reserva |
| **PaymentStatus** | PENDING, AWAITING_PROOF, CONFIRMED, REJECTED | Estados de pago (transferencia: requiere comprobante) |
| **PaymentMethod** | ONLINE, TRANSFER, CASH | Métodos aceptados |

### Reglas numéricas clave

| Regla | Valor |
|---|---|
| Ventana de cancelación | 12 horas antes del inicio |
| Capacidad Reformer | 4 lugares |
| Capacidad Tower | 4 lugares |
| Capacidad Studio (Mat/Barre/Sculpt) | TBD (ver Preguntas abiertas) |
| Vigencia estándar | 30 días |
| Vigencia PACK_12 | 45 días |
| Vigencia EXPERIENCE | 45 días |
| Vigencia INTRO | 7 días |
| Penalización lealtad | Tras 5 no-shows, pierde puntos |
| Adelanto recomendado | 10 minutos antes de clase |

---

## 3. Backlog funcional (MoSCoW)

### 3.1 MUST HAVE — MVP (Semanas 1–4)

Funcionalidad core sin la cual el producto no es viable.

#### (A) Portal Clienta — MUST HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PC-1** | Autenticación (registro/login) | Crear cuenta con email/contraseña, validación de email, reset de contraseña. UI limpia alineada a marca. | — | Not started |
| **PC-2** | Visualizar catálogo de clases | Listado de clases disponibles por día/hora con ClassType, instructor, capacidad actual, botón "Reservar". Filtrable por ClassType o DisciplineGroup. | — | Not started |
| **PC-3** | Reservar clase (flujo básico) | Seleccionar clase → confirmar datos → crear BookingStatus=RESERVED. Mostrar confirmación con número de reserva. Máx 1 sesión del paquete por clase. | PC-2 | Not started |
| **PC-4** | Ver mis reservas | Listado de reservas (RESERVED, ATTENDED, NO_SHOW, CANCELLED). Mostrar detalles: clase, hora, instructor, estado. | PC-3 | Not started |
| **PC-5** | Cancelar reserva | Permitir cancelación si >12 horas antes de inicio. Cambiar BookingStatus a CANCELLED. Validar con modal de confirmación. | PC-3 | Not started |
| **PC-6** | Mi perfil | Nombre, email, teléfono, preferencias. Mostrar avatar placeholder (iniciales). Botón editar datos. | PC-1 | Not started |
| **PC-7** | Historial de paquetes | Listar paquetes comprados (PackageKind, sesiones usadas/disponibles, fecha vencimiento, estado). | — | Not started |
| **PC-8** | Información de studio | Ubicación (Calle Acueducto 513), teléfono (7721119216), horarios, reglas del estudio (10 min antes, calcetines, silencio, lesiones). Link WhatsApp directo. | — | Not started |

#### (B) Panel Admin — MUST HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PA-1** | Autenticación admin | Login solo para staff (email/contraseña). Roles: ADMIN, INSTRUCTOR. | — | Not started |
| **PA-2** | Crear/editar clases | Formulario: ClassType, fecha, hora, instructor, capacidad, notas. Agendar clases recurrentes (ej: lunes y miércoles 6am, 8 semanas). | — | Not started |
| **PA-3** | Ver reservas por clase | Tabla de reservas (alumna, teléfono, estado, paquete usado). Indicar asientos libres. | — | Not started |
| **PA-4** | Check-in (asistencia) | Botón "Marcar asistencia" → BookingStatus=ATTENDED. O escanear QR en clase → actualizar estado. | — | Not started |
| **PA-5** | Registrar no-show | Botón "No asistió" → BookingStatus=NO_SHOW. Log de penalización (5 no-shows = -1 punto lealtad). | PA-4 | Not started |
| **PA-6** | Catálogo de paquetes (lectura) | Tabla de todos los precios y tipos (SINGLE, PACK, UNLIMITED, INTRO, MIXED, AM_CLUB). Vigencias y descripciones. No editar en MVP. | — | Not started |
| **PA-7** | Gestionar pagos manuales (Transferencia) | Tabla de pagos con PaymentStatus=AWAITING_PROOF. Admin sube comprobante, valida manualmente, cambia a CONFIRMED o REJECTED. Enviar notificación a alumna. | — | Not started |
| **PA-8** | Crear cuenta para alumna (back office) | Si alumna no puede registrarse sola, admin crea cuenta y envía link de activación. | PC-1 | Not started |

---

### 3.2 SHOULD HAVE — v1 (Semanas 5–8)

Funcionalidad muy importante, diferenciadora, pero no bloqueadora de MVP.

#### (A) Portal Clienta — SHOULD HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PC-9** | Recordatorios automáticos (WhatsApp) | 24h antes de clase: envío automático de recordatorio vía WhatsApp Business API. Incluir link a detalles de clase. | PC-3, integraciones | Not started |
| **PC-10** | Recordatorios automáticos (Email) | 24h antes de clase: email con detalles, link a "Ver reserva", botón "Cancelar". Nombre de instructora, ubicación, reglas. | PC-3, integraciones | Not started |
| **PC-11** | Sistema de lealtad (puntos/sellos) | Contador visual de "constancia" (ej: sello por cada clase asistida). Mostrar progreso hacia logro (ej: 8 sellos = acceso a clase privada). Basado en ATTENDED bookings. | PC-4 | Not started |
| **PC-12** | Comprar paquete en línea | Catálogo de paquetes con descripción, precio, vigencia. Seleccionar → checkout → pago. Integración con pasarela (Stripe/Conekta/Mercado Pago). | — | Not started |
| **PC-13** | Pago por transferencia (cliente) | Opción "Pagar por transferencia" → mostrar CLABE + banco (Banorte, Estefanía Torres). Alumna sube comprobante, app registra PaymentStatus=AWAITING_PROOF. | PC-12, PA-7 | Not started |
| **PC-14** | Pago en efectivo (registro) | Opción "Pago en efectivo" → crear reserva con PaymentStatus=PENDING. Nota: "Completa pago en studio". | PC-12 | Not started |
| **PC-15** | Confirmación de pago | Una vez PaymentStatus=CONFIRMED (por admin o pasarela), notificar a clienta con email/WhatsApp. Mostrar "Paquete activado" en app. | PC-12, PC-13, PC-14 | Not started |
| **PC-16** | Renovación automática de paquete | Si paquete vence en 3 días y alumna ya compró 3+ veces, sugerir renovación con descuento (TBD) o recordar mediante email/WhatsApp. | PC-11, PC-12 | Not started |
| **PC-17** | Lista de espera | Si clase llena, botón "Añadir a lista de espera". Si hay cancelación, notificar a primera de la lista. BookingStatus=WAITLISTED. | PC-3, PC-5 | Not started |
| **PC-18** | Generar QR personal (check-in) | Al reservar o al llegar: mostrar QR único que admin escanea en clase. Facilita check-in rápido sin teclado. | PC-3, PA-4 | Not started |
| **PC-19** | Ver próxima clase recomendada | Basado en última clase asistida, sugerir clase similar (ej: si fue Reformer, sugerir Tower). Link directo a reservar. | PC-4 | Not started |

#### (B) Panel Admin — SHOULD HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PA-9** | Reportes de ocupación | Tabla: Clase, fecha, capacidad, # reservas, # asistencias, # no-shows, tasa de ocupación %. Exportar CSV. | PA-3, PA-4, PA-5 | Not started |
| **PA-10** | Reportes de ventas | Ingresos por período (día/semana/mes): total por PackageKind, PaymentMethod, alumna. Desglose CONFIRMED vs PENDING. | PA-7, PC-12 | Not started |
| **PA-11** | Gestión de instructoras | Crear/editar perfil de instructora: nombre, foto, especialidades (ClassType), horarios. Mostrar en app alumna. | — | Not started |
| **PA-12** | Dashboard operativo | Resumen: clases hoy, # reservas, # asistencias esperadas, pagos pendientes, alertas (clases sub-ocupadas, muchos no-shows). | PA-3, PA-9, PA-10 | Not started |
| **PA-13** | Enviar notificación manual | Admin puede enviar email/WhatsApp a alumna/grupo (ej: "Clase cancelada mañana" o "¡Bienvenida a la comunidad!"). | integraciones | Not started |
| **PA-14** | Gestión de promociones (apertura) | Precarga de precios promo (ej: ILIMITADO $2,500 en lugar de $2,900). No modificable en MVP, pero tabla visible. | PC-12, PA-6 | Not started |
| **PA-15** | Exportar historial de alumna | Descargar CV de alumna: reservas, asistencias, pagos, lealtad. Para soporte o análisis. | — | Not started |

---

### 3.3 COULD HAVE — v2 (Semanas 9+)

Nice-to-have, diferenciadores premium a largo plazo.

#### (A) Portal Clienta — COULD HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PC-20** | Clases privadas (consulta + reserva) | Listar disponibilidad de clases privadas (1-on-1), seleccionar fecha/instructor, enviar solicitud. Admin confirma. | — | Not started |
| **PC-21** | Eventos especiales | Calendario de eventos (workshops, retiros, etc.). Reservar + pagar por separado. Número de asistentes variable. | — | Not started |
| **PC-22** | Comunidad y feed | Muro donde alumnas pueden compartir logros, fotos (privacidad TBD), comentarios motivacionales. Feed moderado. | — | Not started |
| **PC-23** | Certificado de asistencia | Descargar PDF con # clases completadas, fecha rango, firma digital del estudio. | PC-4 | Not started |
| **PC-24** | Integración con calendario externo | Añadir clase a Google Calendar o Apple Calendar al reservar. | PC-3 | Not started |
| **PC-25** | Historial de instructoras favoritas | Marcar instructoras favoritas, filtrar clases por esas instructoras, sugerencias automáticas. | PA-11 | Not started |
| **PC-26** | Referidos y bonificación | Compartir código de referido, invitar amigas, ambas obtienen descuento. Tracking de conversión. | — | Not started |

#### (B) Panel Admin — COULD HAVE

| ID | Feature | Descripción | Dependencias | Status |
|---|---|---|---|---|
| **PA-16** | Análisis de retención | Cohortes: % de alumnas que renuevan paquete en 7, 14, 30 días. Churn prediction. | — | Not started |
| **PA-17** | Auditoría y logs | Registro de todas las acciones (quién cambió qué y cuándo). Trazabilidad de pagos y cambios de estado. | — | Not started |
| **PA-18** | Gestión de empleados | Crear cuentas para staff, asignar permisos (instructor solo ve sus clases, admin ve todo). | PA-1 | Not started |
| **PA-19** | Integración con contabilidad | Export a formato contable para reportar a contador (ingresos, IVA si aplica). | PA-10 | Not started |
| **PA-20** | Feedback y encuestas | Post-clase: alumna recibe encuesta corta (TBD preguntas). Admin ve resultados y trend. | — | Not started |

---

## 4. Dependencias e integraciones de tecnología

### 4.1 Integraciones externas requeridas

| Integración | Propósito | MVP / v1 | Proveedor sugerido | Notas |
|---|---|---|---|---|
| **Pasarela de pago (online)** | Procesar pagos con tarjeta (ONLINE). MXN. | v1 | Stripe, Conekta, Mercado Pago | TBD: cuál elegir según contrato existente |
| **WhatsApp Business API** | Enviar recordatorios y notificaciones automáticas. | v1 | Meta / Twilio | Requiere número verificado + template preaprobado |
| **Servicio de email** | Enviar confirmaciones, recordatorios, notificaciones. | v1 | SendGrid, Mailgun, AWS SES | Plantillas HTML responsive |
| **Generación de QR** | Crear QR único por alumna para check-in (sin lib externa, JS puro o lib ligera). | v1 | qrcode.js o similar | Código + lectura integrada en check-in |
| **SMS/WhatsApp escalable** | Si volumen >1000 msgs/mes, considerar proveedores especializados. | v2+ | Twilio, Plivo | Backup a email si WhatsApp no disponible |

### 4.2 Configuración sensible (NO exponer en repos públicos)

Las siguientes credenciales y datos van en archivo `.env` o sistema de secrets:

```
# TRANSFERENCIA BANCARIA (datos sensibles — NUNCA en .env público)
BANK_TARJETA=«TARJETA — configurar en panel admin / privado»
BANK_CLABE=«CLABE — configurar en panel admin / privado»
BANK_NOMBRE=Banorte
BANK_TITULAR=«Titular — configurar en privado»

# PASARELA DE PAGO
PAYMENT_GATEWAY_API_KEY=xxx
PAYMENT_GATEWAY_SECRET=xxx

# WHATSAPP BUSINESS API
WHATSAPP_PHONE_NUMBER=+527721119216 (TBD confirmación)
WHATSAPP_BUSINESS_ACCOUNT_ID=xxx
WHATSAPP_ACCESS_TOKEN=xxx

# EMAIL
EMAIL_SERVICE_API_KEY=xxx
EMAIL_FROM_ADDRESS=noreply@movementalma.com (TBD)

# BASE DE DATOS
DATABASE_URL=xxx (con credenciales)

# GENERACIÓN DE QR (settings, no secretos)
QR_SIZE=300px
QR_ERROR_CORRECTION=H
```

---

## 5. Propuesta de fases de entrega

### Fase 0: Descubrimiento & Setup (Semana 0)

- Confirmar preguntas abiertas (capacidades Studio, precios finales, instructoras, etc.)
- Elegir stack técnico (frontend, backend, BD)
- Configurar repos, CI/CD, staging
- Definir wireframes de flujos críticos (reserva, pago, check-in)

### Fase 1: MVP (Semanas 1–4)

**Objetivo:** Alumnas pueden reservar clases y admin gestiona operación básica sin herramientas externas.

**Incluye:**
- PC-1 a PC-7: Autenticación, catálogo, reserva, cancelación, perfil, historial
- PA-1 a PA-8: Admin login, crear clases, ver reservas, marcar asistencia, validar pagos manuales
- BD básica: Users, Classes, Bookings, Packages, Payments
- Pagos offline: transferencia (validación manual) + efectivo
- UI minimalista, alineada a BRAND.md

**KPI de cierre:**
- 5+ alumnas registradas
- 10+ clases agendadas
- 100% reservas registradas sin errores
- Admin puede crear clase y marcar asistencia en < 2 min

### Fase 1.5: Integraciones críticas (Semanas 5–6)

**Objetivo:** Automatizar comunicación y pagos.

**Incluye:**
- PC-9, PC-10: Recordatorios WhatsApp/email
- PC-12 a PC-15: Compra de paquetes en línea (pasarela elegida)
- PA-7: Validación de transferencia mejorada
- Configurar WhatsApp Business API
- Configurar pasarela de pago (Stripe/Conekta/Mercado Pago)

**KPI de cierre:**
- 100% de clases generan recordatorio automático
- 80%+ open rate de emails
- Primer pago en línea procesado exitosamente

### Fase 1.75: Lealtad & Check-in (Semanas 7–8)

**Objetivo:** Crear engagement premium y simplificar asistencia.

**Incluye:**
- PC-11: Sistema de lealtad (sellos/constancia)
- PC-18: QR check-in
- PA-4 mejorado: Escaneo QR integrado
- PC-17: Lista de espera

**KPI de cierre:**
- 80%+ de check-in por QR (vs. manual)
- 3+ alumnas viendo/celebrando logros de lealtad

### Fase 2: v1 Full (Semanas 9–12)

**Objetivo:** Completar todos SHOULD HAVE.

**Incluye:**
- PC-16, PC-19, PC-20: Renovación automática, recomendaciones, clases privadas
- PA-9, PA-10, PA-11, PA-12: Reportes, instructoras, dashboard
- Optimizaciones UI/UX basadas en feedback de MVP

**KPI de cierre:**
- 50+ alumnas activas
- Ocupación promedio 70%+
- Revenue tracking preciso

### Fase 3: v2 Premium (Q3 2026+)

**Objetivo:** Diferenciadores de largo plazo.

**Incluye:**
- PC-21, PC-22, PC-26: Eventos, comunidad, referidos
- PA-16, PA-17, PA-18: Análisis, auditoría, permisos granulares
- Posible app móvil nativa

---

## 6. Preguntas abiertas (confirmar con cliente)

| Pregunta | Impacto | Propuesta |
|---|---|---|
| **Capacidad de clases Studio (Mat/Barre/Sculpt)** | Alto — define max reservas, UI, reportes | Validar con estudio; propuesta: 6-8 personas por clase |
| **¿Hay instructoras existentes?** | Alto — necesario para crear clases, mostrar perfil | Obtener listado: nombre, especialidades, foto, horarios disponibles |
| **¿Precios finales confirmados?** | Medio — catálogo ya documentado, pero ¿cambios? | Validar tabla de precios; ¿aplican descuentos adicionales? |
| **¿Pasarela de pago elegida?** | Alto — arquitectura de backend depende | ¿Stripe, Conekta o Mercado Pago? ¿Ya tiene contrato? |
| **¿WhatsApp número oficial?** | Alto — integración, branding | ¿Es 7721119216 el número WhatsApp Business? |
| **¿Email oficial del estudio?** | Medio — para confirmaciones y soporte | Propuesta: contacto@movementalma.com o similar (TBD) |
| **¿Datos de logo/colores finales?** | Medio — ya hay BRAND.md, pero necesita asset kit | Obtener logo, paleta oficial, tipografías licenciadas |
| **¿Seguro médico o exoneración requerida?** | Bajo (pero legal) | ¿Necesita términos de aceptación de riesgo en registro? |
| **¿Política de reembolso más allá de no-show?** | Medio — regla de negocio | ¿Enfermedad/lesión: permite reembolso o crédito? |
| **¿Instructoras pueden tener "rating" de alumnas?** | Bajo — feature premium futura | ¿Incluir en v2 o nunca? |
| **¿Horario de atención del estudio (8am–10pm) = soporte?** | Medio — expectativa de respuesta | ¿Quién responde WhatsApp/email y cuándo? |

---

## 7. Principios de implementación alineados a marca

| Principio | Aplicación en features |
|---|---|
| **Lujo accesible** | UI limpia sin sobrecarga; flujos cortos (< 3 pasos para reservar); microcopy motivador |
| **Comunidad** | Sistema de lealtad visible, muro (v2), instructoras con foto/bio, logros públicos (opcional) |
| **Transparencia** | Reglas claras sobre cancelación (12h), no-show, penalización. Mostrar capacidad real. Estado de pago siempre visible. |
| **Premium** | Atención personalizada (admin puede contactar), clases privadas, eventos, sin saturación de publicidad |
| **Movimiento consciente** | Recomendaciones inteligentes, recordatorios motivadores, no spam de emails/notificaciones |

---

## 8. Métricas de éxito (North Star)

| Métrica | Meta (3 meses) | Cálculo |
|---|---|---|
| **Alumnas registradas** | 50+ | COUNT(users WHERE created_date < hoy - 90d) |
| **Tasa de ocupación promedio** | 70%+ | AVG(# asistencias / # capacidad) por clase |
| **Retención (día 30)** | 60%+ | % de alumnas con >=1 clase en días 30-60 |
| **NPS (Net Promoter Score)** | 40+ | Encuesta post-clase trimestral |
| **Revenue MoM** | +20% | Ingresos mes anterior vs. mes actual |
| **Check-in por QR** | 80%+ | % de ATTENDED por QR vs. manual |
| **Email open rate** | 40%+ | Recordatorios y confirmaciones |
| **Cancelación con 12h+** | 95%+ | Cancelaciones válidas / total cancelaciones |

---

## 9. Apéndice: Catálogo de precios (referencia)

### Paquetes Reformer / Tower

| Tipo | Sesiones | Precio (MXN) | Vigencia |
|---|---|---|---|
| CLASE ÚNICA | 1 | $270 | 30 días |
| PACK_4 | 4 | $920 | 30 días |
| PACK_8 | 8 | $1,760 | 30 días |
| PACK_12 | 12 | $2,280 | 45 días |
| UNLIMITED | ilimitadas | $2,900 | 30 días |
| PROMO_APERTURA_UNLIMITED | ilimitadas | $2,500 | 30 días |

### Paquetes Studio (Mat + Barre + Sculpt)

| Tipo | Sesiones | Precio (MXN) | Vigencia |
|---|---|---|---|
| CLASE ÚNICA | 1 | $240 | 30 días |
| INTRO | 1 (solo nuevas) | $150 | 7 días |
| PACK_4 | 4 | $900 | 30 días |
| PACK_8 | 8 | $1,700 | 30 días |
| PACK_12 | 12 | $2,150 | 45 días |
| UNLIMITED | ilimitadas (Mat+Barre+Sculpt) | $2,700 | 30 días |
| PROMO_APERTURA | ilimitadas | $2,300 | 30 días |

### Paquetes Mixtos

| Tipo | Composición | Precio (MXN) | Vigencia |
|---|---|---|---|
| ALMA_BALANCE | 4 Studio + 4 Reformer/Tower (8 sesiones) | $1,500 | 30 días |
| ALMA_FUSION | 6 Studio + 6 Reformer/Tower (12 sesiones) | $2,200 | 30 días |
| ALMA_EXPERIENCE | 8 Studio + 8 Reformer/Tower (16 sesiones) | $2,800 | 45 días |

### Paquetes Premium & AM_CLUB

| Tipo | Sesiones/Acceso | Precio (MXN) | Vigencia |
|---|---|---|---|
| AM_CLUB (Studio) | 8 sesiones (solo 7am–10am) | $1,300 | 30 días |
| AM_CLUB (Reformer & Tower) | 8 sesiones (solo 7am–10am) | $1,600 | 30 días |
| ALMA_UNLIMITED (promo) | Todo: Reformer+Tower+Mat+Barre+Sculpt | $3,500 | 30 días |
| ALMA_UNLIMITED (regular) | Todo: Reformer+Tower+Mat+Barre+Sculpt | $3,900 | 30 días |

---

## 10. Resumen ejecutivo

**Producto:** Plataforma digital integrada (Portal Clienta + Panel Admin) para gestionar el ciclo completo de reservas, pagos, asistencia y lealtad de Alma Movement.

**Scope MVP (4 semanas):** Autenticación, catálogo de clases, reserva/cancelación, historial, check-in manual, validación de pagos por transferencia, información del estudio.

**Scope v1 (8 semanas):** + Recordatorios automáticos, pasarela de pago, lealtad, lista de espera, QR check-in, reportes de ocupación/ventas.

**Scope v2 (12+ semanas):** + Clases privadas, eventos, comunidad, análisis avanzado, permisos granulares.

**Diferenciadores premium:**
- UX minimalista alineada a marca (lujo accesible, no técnico)
- Sistema de lealtad visible y motivador
- Automaciones que respetan "constancia" como valor central
- Transparencia en reglas (cancelación, no-show, penalización)
- Integración profunda con WhatsApp (canal preferido en México)

**Timeline:** MVP listo en 4 semanas; v1 en 8 semanas; v2 en 12+ semanas.

**Equipo mínimo:** 1 Product Manager, 1–2 full-stack devs, 1 diseñador UX/UI.

---

**Documento vivo. Revisar y actualizar con cliente cada 2 semanas durante MVP.**