// 2026-09-29: vistas habilitadas a petición del usuario al traer las funciones de Velan.
/**
 * Funciones ocultas — paridad con Velan (24 sep 2026)
 * ===================================================
 *
 * HIVE tiene vistas que el proyecto Velan no expone. En vez de borrarlas, se
 * apagan desde aquí: el código, las rutas y los endpoints siguen enteros, y
 * volver a encender una función es cambiar su `false` por `true` y compilar.
 *
 * Qué hace cada apagador:
 *   - La ruta deja de existir en el router (cae en el 404 normal).
 *   - La entrada desaparece del menú.
 *
 * Qué NO hace: no toca el backend. Los endpoints siguen vivos, así que nada
 * que dependa de ellos por dentro (por ejemplo, los puntos de lealtad que se
 * otorgan al vender un paquete) se rompe por apagar la vista.
 *
 * Lo que se dejó encendido a propósito, aunque Velan no lo tenga:
 *   - `/app/profile/responsiva`: el backend bloquea la primera reserva
 *     con WAIVER_REQUIRED. Sin esta vista, ninguna clienta podría reservar.
 *   - `/admin/pasar-lista`: es el equivalente de `/admin/checkin` de Velan.
 *   - `/admin/class-generator` y `/admin/class-types`: son el destino real de
 *     `/admin/classes/generate` y `/admin/classes/types`, que Velan sí tiene.
 *   - `/app/wallet`: equivale a `/app/pass` de Velan.
 *   - `/admin/bitacora`: la pidió la auditoría de producción (2026-09-27, P0-3).
 *   - `/admin/settings/platforms` y `/admin/bookings/partners-checkins`: Wellhub está activo en producción y la dueña concilia sus visitas (auditoría 2026-09-27, P1-9).
 */
export const FEATURES = {
  // ── Panel ────────────────────────────────────────────────────────────────
  /** Puntos, recompensas e hitos de lealtad. `/admin/loyalty` */
  loyalty: false,
  /** Moderación de reseñas y etiquetas. `/admin/reviews` */
  reviews: false,
  /** Punto de venta de mostrador. `/admin/pos` */
  pos: false,
  /** Visitas sueltas y acompañantes. `/admin/visitas` */
  visits: true,
  /** Plantillas de WhatsApp y campañas. `/admin/whatsapp-templates` */
  whatsappTemplates: true,
  /** Bandeja de avisos del panel. `/admin/notifications` */
  adminInbox: true,
  /** Plantillas de horario semanal. `/admin/schedules` */
  scheduleTemplates: false,
  /** Wellhub: configuración y check-ins, sólo para la dueña. `/admin/settings/platforms`, `/admin/bookings/partners-checkins` */
  partnerPlatforms: true,
  /** Bitácora de la dueña: quién cobró, ajustó, canceló o dio de baja. `/admin/bitacora` */
  auditLog: true,

  // ── App de la clienta ────────────────────────────────────────────────────
  /** Historial y recompensas del monedero. `/app/wallet/history`, `/app/wallet/rewards` */
  walletExtras: false,
  /** Detalle de un pedido. `/app/orders/:orderId` */
  orderDetail: true,
  /** Detalle de la membresía. `/app/profile/membership` */
  membershipDetail: false,
  /** Cambio de contraseña desde el perfil. `/app/profile/security` */
  profileSecurity: true,

  // ── Alta ─────────────────────────────────────────────────────────────────
  /** Cuestionario posterior al registro. `/auth/onboarding` */
  onboarding: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

/** ¿Está encendida esta función? */
export const isOn = (name: FeatureName): boolean => FEATURES[name];
