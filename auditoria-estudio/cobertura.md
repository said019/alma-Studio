# Cobertura de escenarios — Alma Movement (8 sep 2026)

**111 escenarios** de la matriz A–L. Leyenda: ✅ cubierto · ⚠️ parcial · ❌ falta · ➖ N/A · ❓ no verificable.
La evidencia marcada *(probado)* se ejecutó contra la base desechable y se cerró leyendo la BD.

## A — Registro e identidad (10)
| ID | Est. | Evidencia |
|---|---|---|
| A1 | ✅ | `POST /api/auth/register`; nombre, email, teléfono. Sin OTP de teléfono (el teléfono no se valida como llave real). |
| A2 | ✅ | `forgot-password` / `reset-password` con `password_reset_tokens` *(rutas presentes, envío no probado)* |
| A3 | ⚠️ | `PUT /api/users/:id` y `/app/profile/edit` editan; **no se verificó** que el cambio de teléfono propague al canal de WhatsApp |
| A4 | ✅ | `health_notes`, `has_injury`, `injury_details`, `alert_flag`; expuestos en roster de instructora |
| A5 | ✅ | **Probado**: la primera reserva devuelve `403 WAIVER_REQUIRED` hasta firmar. `waivers` con versión y `signed_at` |
| A6 | ⚠️ | `date_of_birth` se captura; no hay bloqueo ni flujo de tutor para menores |
| A7 | ✅ | `POST /api/admin/clients/manual` y `guest_profiles` |
| A8 | ✅ | Plan "Alma Studio Intro" ($150/1 clase) + `is_non_repeatable`/`repeat_key`; conversión en `/api/reports/conversion` |
| A9 | ❌ | Sin borrado/anonimización de cuenta. 0 coincidencias de ARCO en el código |
| A10 | ❌ | Sin detección ni merge de duplicados |

## B — Horarios y reservas (13)
| ID | Est. | Evidencia |
|---|---|---|
| B1 | ✅ | **Probado**: `GET /api/classes` calcula el cupo **en vivo** desde `bookings`; la PWA muestra lugares libres correctos |
| B2 | ✅ | **Probado**: reservar descuenta exactamente 1 crédito (8→7) |
| B3 | ➖ | No hay camas numeradas en esta operación |
| B4 | ✅ | **Probado**: al llenarse, la 2ª reserva entra como `waitlist` y **no** debita crédito |
| B5 | ⚠️ | Existe el estado `waitlist`; **no se encontró promoción automática** al liberarse un lugar ni ventana de confirmación |
| B6 | ⚠️ | Cierre de reservas a 2 h **hardcodeado** (`BOOKING_LEAD_HOURS = 2`), no configurable desde el panel |
| B7 | ✅ | **Probado**: 2ª reserva de la misma clase → `409`; límite semanal por plan (`weekly_class_limit`) |
| B8 | ✅ | **Probado**: sin saldo → `403` con mensaje claro |
| B9 | ✅ | `POST /api/bookings/with-guest` + `my-guests/search` |
| B10 | ❌ | Sin reserva recurrente |
| B11 | ⚠️ | `faltas_count` y `lib/faltas.js` existen; el bloqueo automático por faltas no se demostró |
| B12 | ✅ | `/api/bookings/my-bookings` + `/app/bookings` |
| B13 | ✅ | **Probado**: `POST /api/admin/bookings/assign` reserva a nombre de la clienta y debita (8→7) |

## C — Cancelaciones, cambios y waitlist (8)
| ID | Est. | Evidencia |
|---|---|---|
| C1 | ✅ | **Probado**: cancelar dentro de ventana devuelve exactamente 1 crédito; 5 cancelaciones simultáneas → 1 sola devolución |
| C2 | ⚠️ | Ventana de 2 h aplicada; **no se demostró** que se le advierta a la clienta *antes* de confirmar |
| C3 | ⚠️ | `PUT /api/bookings/:id/no-show` manual; no se demostró marcado automático al cierre |
| C4 | ❌ | Sin reagendado atómico (hay que cancelar y volver a reservar) |
| C5 | ✅ | **Probado**: cancelar la clase devuelve 1 crédito a cada reservada; repetir la cancelación → `404`, sin re-acreditar |
| C6 | ✅ | `class_substitutions` / `coach_substitutions` + notificación `coach_substituted` |
| C7 | ⚠️ | `PUT /api/admin/classes/:id` permite mover; no se demostró aviso ni opción de conservar |
| C8 | ❓ | No se probó la salida voluntaria de la lista de espera |

## D — Paquetes y membresías (13)
| ID | Est. | Evidencia |
|---|---|---|
| D1 | ✅ | 37 planes activos con vigencia, categoría y restricciones |
| D2 | ⚠️ | Stripe Checkout + webhook firmado implementados; **no verificables** sin credenciales |
| D3 | ✅ | **Probado**: la PWA muestra "Te quedan 4 clases · vence 8 oct" |
| D4 | ✅ | Cron de renovación + `sendRenewalReminder` |
| D5 | ⚠️ | `end_date` existe; sin política de gracia ni congelación configurable |
| D6 | ✅ | Recompra desde `/app/checkout` |
| D7 | ❌ | **Sin congelamiento**: sólo la columna `paused_at`, ningún flujo |
| D8 | ✅ | **Probado**: `POST /api/memberships` con `paymentMethod: cash` y `startDate` editable activa al instante |
| D9 | ⚠️ | **Probado**: el débito toma la membresía **más antigua** (regla correcta), pero el sistema permite dos activas idénticas sin avisar ni apilar vigencias |
| D10 | ❌ | Sin gift cards ni transferencia de créditos |
| D11 | ✅ | `discount_codes` con vigencia, límite de usos y validación |
| D12 | ⚠️ | `PUT /api/memberships/:id` ajusta saldo/vigencia, **sin motivo obligatorio ni registro de auditoría** |
| D13 | ❌ | Sin upgrade con prorrateo |

## E — Pagos (10)
| ID | Est. | Evidencia |
|---|---|---|
| E1 | ⚠️ | Stripe con confirmación por webhook (no por URL) — correcto por diseño, **no verificado en vivo** |
| E2 | ⚠️ | **Probado**: la venta en mostrador registra método en `memberships`, pero **no genera orden ni registro de pago** → no llega a ingresos (ver P0-3) |
| E3 | ✅ | `stripe_webhook_events` + `processed_events` para idempotencia; **probado** que verificar una orden dos veces crea **una** sola membresía |
| E4 | ❌ | Sin reconciliación de pagos aprobados sin webhook |
| E5 | ❓ | No verificable sin pasarela |
| E6 | ❌ | **Sin flujo de reembolso**: ninguna ruta, 0 pagos negativos posibles |
| E7 | ❌ | Sin manejo de contracargos |
| E8 | ⚠️ | Emails de activación existen; no se demostró recibo en venta manual |
| E9 | ❌ | Sin captura de datos fiscales/CFDI |
| E10 | ➖ | No es multi-tenant |

## F — Check-in y asistencia (9)
| ID | Est. | Evidencia |
|---|---|---|
| F1 | ⚠️ | **Probado**: `POST /api/admin/checkin/scan` y check-in funcionan… pero **descuentan un crédito extra** (ver P0-1) |
| F2 | ✅ | **Probado**: `PUT /api/bookings/:id/check-in` desde el roster |
| F3 | ❌ | **P0-1**: se descuenta al reservar **y** otra vez al hacer check-in |
| F4 | ✅ | `POST /api/admin/classes/:id/walkin-visit` + `visit-sale` |
| F5 | ⚠️ | `checkinWindow` con respaldo de 90 min (probado en unit tests); no configurable desde el panel |
| F6 | ✅ | Wellhub: `partner_checkins`, `channel_inventory`, `channel` en `bookings`, sin tocar paquetes propios |
| F7 | ❌ | Sin fallback offline |
| F8 | ✅ | **Probado**: segundo check-in devuelve 200 sin descuento adicional |
| F9 | ✅ | `GET /api/admin/today-roster` y `/api/classes/:id/roster` |

## G — Wallet passes (7)
| ID | Est. | Evidencia |
|---|---|---|
| G1 | ⚠️ | Generación implementada; **sin certificados** → modo fallback web |
| G2 | ⚠️ | Apple y Google implementados; Google responde `503 no configurado` *(probado)* |
| G3 | ✅ | `wallet_update_queue` + `wallet_pass_updates` |
| G4 | ⚠️ | APNs implementado, sin credenciales |
| G5 | ✅ | Re-descarga desde `/app/wallet` |
| G6 | ❓ | No verificable sin passes reales |
| G7 | ✅ | Fallback QR web |

## H — Notificaciones (10)
| ID | Est. | Evidencia |
|---|---|---|
| H1 | ✅ | Email + WhatsApp al confirmar reserva |
| H2 | ✅ | Cron de recordatorio de clase con `notification_logs` |
| H3 | ✅ | Aviso al cancelar clase, disparado desde C5 |
| H4 | ❌ | Sin aviso de waitlist (no hay promoción — ver B5) |
| H5 | ✅ | Cron de renovación |
| H6 | ✅ | Bienvenida + plantillas editables desde el panel |
| H7 | ⚠️ | `/api/reports/dormant` y campañas; envío win-back manual |
| H8 | ✅ | `GET /api/admin/birthdays` + `birthday_gift_year` |
| H9 | ✅ | `receive_reminders`, `receive_promotions`, `receive_weekly_summary` separados |
| H10 | ⚠️ | `notification_logs` con estado `pending/sent/failed`; **sin reintentos ni cola durable** (los envíos van en `setInterval`, se pierden al reiniciar) |

## I — Panel admin (11)
| ID | Est. | Evidencia |
|---|---|---|
| I1 | ✅ | CRUD completo de tipos, horarios, plantillas, instructoras y cupos *(28 rutas del panel probadas en navegador)* |
| I2 | ✅ | `/admin/dashboard` + `today-roster` |
| I3 | ✅ | `/admin/clients` con búsqueda, saldo, historial y notas |
| I4 | ⚠️ | `/admin/pos` completo, pero la venta **no entra en ingresos** (P0-3) |
| I5 | ⚠️ | Se puede ajustar; **sin motivo obligatorio** |
| I6 | ✅ | `DELETE /api/classes/week` y cancelación masiva |
| I7 | ❌ | **Probado**: `reception` recibe 200 en las 60 rutas admin evaluadas, incluidas ingresos, reportes, órdenes y datos bancarios |
| I8 | ❌ | La tabla `admin_actions` existe pero tiene **0 usos** en el código |
| I9 | ⚠️ | Textos de política editables; **los números (2 h de ventana, tolerancia) están hardcodeados** |
| I10 | ➖ | Una sola sucursal |
| I11 | ❌ | **Sin ledger de créditos**: no existe tabla que explique qué reserva consumió qué clase |

## J — Instructoras (5)
| ID | Est. | Evidencia |
|---|---|---|
| J1 | ⚠️ | Hay magic-link y `instructor_availability`; **no hay ruta de frontend para la instructora** |
| J2 | ✅ | El roster expone `health_notes` y `alert_flag` |
| J3 | ✅ | `/admin/pasar-lista` |
| J4 | ✅ | Sustitución sin recrear la clase |
| J5 | ✅ | `/api/reports/instructors` + `pay_rate_per_class` |

## K — Reportes (7)
| ID | Est. | Evidencia |
|---|---|---|
| K1 | ❌ | **P0-2 y P0-3**: el dashboard oculta el día en curso y excluye toda venta de mostrador |
| K2 | ⚠️ | `/api/reports/classes` existe, pero la ocupación del panel usa el contador inflado (P1-6) |
| K3 | ✅ | `/api/reports/retention`, `conversion`, `dormant` |
| K4 | ✅ | `/api/reports/dormant` + cron de vencimiento |
| K5 | ✅ | `no_show` y `cancelled` en el overview |
| K6 | ✅ | `/api/partners/summary` y `partner_checkins` |
| K7 | ❌ | Sin export CSV |

## L — Seguridad y datos (8)
| ID | Est. | Evidencia |
|---|---|---|
| L1 | ➖ | No es multi-tenant |
| L2 | ⚠️ | Aviso de privacidad presente; los datos de salud los ve **cualquier rol admin, incluida recepción** (ver I7) |
| L3 | ❌ | Sin proceso ARCO |
| L4 | ✅ | Rate limiting por IP configurable en API y auth |
| L5 | ❌ | **Probado**: sin validación de params — UUID/fecha inválida en la ruta produce `500` de Postgres; JSON malformado produce `500` en 94 rutas |
| L6 | ✅ | Firma verificada en Stripe (`verifyWebhookSignature`) y Wellhub (HMAC, con tests) |
| L7 | ❓ | No verificable desde el código |
| L8 | ⚠️ | Secretos por variables de entorno, pero **contraseña de admin y datos bancarios reales están en el repositorio** (P0-4, P0-5) |

---

## Conteo
| | ✅ | ⚠️ | ❌ | ➖ | ❓ | total |
|---|---|---|---|---|---|---|
| escenarios | 53 | 29 | 21 | 4 | 4 | **111** |

Cobertura útil (✅ sobre los 107 aplicables): **50 %**. Con los parciales, **77 %** tiene algo construido.

## Concurrencia (probado con llamadas simultáneas y lectura en BD)
| Escenario | Resultado |
|---|---|
| 8 clientas sobre la última cama (cap. 3) | ✅ exactamente 3 confirmadas, 5 a lista de espera. **Sin sobreventa** (`FOR UPDATE`) |
| Misma clienta × 5 sobre la misma clase | ✅ 1 reserva, 1 débito, 4 × `409` |
| Saldo 2 reservando 5 clases a la vez | ✅ exactamente 2 confirmadas, saldo 0 |
| Cancelar la misma reserva × 5 | ✅ exactamente 1 devolución |
| Verificar la misma orden × 2 | ✅ una sola membresía |
| Doble check-in | ✅ idempotente |
| Contador `current_bookings` | ❌ suma 2 por reserva (trigger + handler) |
