// Templates en voz HIVE (cercana, casual, con primer nombre).
// Editables vía system_settings.notification_templates (admin UI).
// Variables disponibles per-template documentadas en cada body.
// Extraído de server/index.js para poder probarse por separado
// (ver server/lib/brandResidue.test.js).
export const DEFAULT_NOTIFICATION_TEMPLATES = {
  // ── Onboarding y cuenta ─────────────────────────────────────────
  welcome: {
    subject: "Bienvenida a HIVE",
    body: "{firstName}, bienvenida a HIVE Pilates Studio. Este es un paso más hacia tus objetivos. Cuando quieras, reserva tu clase muestra desde la app.",
  },
  password_reset: {
    subject: "Recuperación de contraseña",
    body: "{firstName}, usa este enlace para restablecer tu contraseña: {link}",
  },

  // ── Reservas ────────────────────────────────────────────────────
  booking_confirmed: {
    subject: "Reserva confirmada",
    body: "{firstName}, te apartamos lugar de {class} el {date} a las {time}. Tu pase HIVE ya lo trae cargado. Te esperamos.",
  },
  booking_cancelled: {
    subject: "Reserva cancelada",
    body: "{firstName}, cancelaste tu reserva de {class} del {date}. Crédito devuelto: {creditRestored}. Cuando quieras volver, reservas desde la app.",
  },
  class_reminder: {
    subject: "Recordatorio de clase",
    body: "{firstName}, te recordamos tu clase de {class} a las {time}. Llega 10 minutos antes para acomodarte.",
  },
  class_attended: {
    subject: "Check-in registrado",
    body: "Listo, {firstName}. Tenemos tu check-in de {class}. Buena clase. ✨",
  },

  // ── Membresía y pagos ───────────────────────────────────────────
  membership_activated: {
    subject: "Tu paquete está activo",
    body: "{firstName}, tu paquete {plan} ya quedó activo. Vigencia: {startDate} al {endDate}. Tu pase HIVE está al día. Cuando quieras, reservas tu primera clase desde la app.",
  },
  membership_expiring_today: {
    subject: "Tu paquete vence hoy",
    body: "{firstName}, hoy vence tu paquete HIVE. Si quieres seguir, renueva desde la app y no perdemos el ritmo.",
  },
  membership_expiring_tomorrow: {
    subject: "Tu paquete vence mañana",
    body: "{firstName}, mañana vence tu paquete HIVE. Renueva desde la app para no parar.",
  },
  membership_expiring_n_days: {
    subject: "Tu paquete vence pronto",
    body: "{firstName}, te quedan {days} días en tu paquete HIVE. Renueva desde la app cuando quieras y seguimos sin pausa.",
  },
  membership_expired: {
    subject: "Tu paquete terminó",
    body: "{firstName}, tu paquete terminó. Aquí seguimos cuando quieras volver. Te recibimos como siempre, como una amiga en su casa.",
  },
  renewal_reminder: {
    subject: "Recordatorio de renovación",
    body: "{firstName}, tu plan {plan} está por vencer el {expiresAt}. Renueva desde la app para no parar.",
  },
  transfer_rejected: {
    subject: "Comprobante rechazado",
    body: "{firstName}, no pudimos aprobar tu comprobante. Motivo: {reason}. Mándanos uno nuevo desde la app o por WhatsApp.",
  },

  // ── Lealtad y eventos ──────────────────────────────────────────
  points_earned: {
    subject: "Sumaste puntos",
    body: "{firstName}, sumaste {points} puntos HIVE. Total: {totalPoints}. Canjéalos cuando se te antoje desde la app.",
  },
  reward_redeemed: {
    subject: "Recompensa canjeada",
    body: "{firstName}, canjeaste \"{rewardName}\" por {points} pts. Pasa por recepción a reclamarlo. Disfrútalo. ✨",
  },
  event_registered: {
    subject: "Inscrita al evento",
    body: "{firstName}, quedaste inscrita a \"{eventTitle}\". En tu HIVE Wallet ya tienes el pase del evento con tu QR para entrar.",
  },

  // ── Motivación por asistencia (auto, max 1/día por user) ────────
  motivation_first_class_week: {
    subject: "Arrancando la semana",
    body: "{firstName}, arrancas la semana 💪. {classesThisWeek} de {weekGoal} clases esta semana. Vas muy bien.",
  },
  motivation_almost_ringed: {
    subject: "Te falta una",
    body: "{firstName}, te falta 1 clase para cumplir tu meta de la semana. Reserva la siguiente desde la app.",
  },
  motivation_streak_2_weeks: {
    subject: "Dos semanas seguidas",
    body: "{firstName}, 2 semanas seguidas asistiendo a clase. Vas con todo. ✨",
  },
  motivation_streak_4_weeks: {
    subject: "Un mes completo",
    body: "{firstName}, 1 mes completo asistiendo cada semana. Eso es disciplina real.",
  },
  motivation_streak_8_weeks: {
    subject: "Imparable",
    body: "{firstName}, 2 meses sin saltarte una semana. Imparable. ✨",
  },
  motivation_milestone_10_classes: {
    subject: "10 clases",
    body: "{firstName}, ya van 10 clases en HIVE. Esto ya es hábito.",
  },
  motivation_milestone_25_classes: {
    subject: "25 clases",
    body: "{firstName}, 25 clases. Tu cuerpo ya nota el cambio.",
  },
  motivation_milestone_50_classes: {
    subject: "50 clases",
    body: "{firstName}, 50 clases. Eres parte de la familia HIVE.",
  },
  motivation_milestone_100_classes: {
    subject: "100 clases",
    body: "{firstName}, 100 clases. 🌟 Eres leyenda HIVE.",
  },
  motivation_comeback: {
    subject: "Qué bueno tenerte de regreso",
    body: "{firstName}, qué bueno tenerte de regreso. {daysAway} días sin verte fueron muchos.",
  },
  // Recordatorio de mitad de semana para socias con pack activo que aún no
  // agendan clase esta semana. Se manda como campaña desde Promociones.
  midweek_reservation_reminder: {
    subject: "Ya estás a la mitad de la semana",
    body: "{firstName}, vamos a la mitad de la semana y aún no agendas tu clase HIVE. Tu paquete está al día — entra a la app y aparta tu lugar antes de que se llenen las clases. ✨",
  },

  // ── Recompensas por asistencia (loyalty_milestones) ─────────────
  // Disparan cuando el usuario alcanza N clases lifetime/mes/año.
  // Acompañan al award (points/reward) auto-otorgado.
  milestone_classes_5: {
    subject: "Primera meta",
    body: "{firstName}, llegaste a tu primera meta: {classes} clases. +{points} puntos en tu cuenta. Esto está prendiendo. ✨",
  },
  milestone_classes_10: {
    subject: "10 clases",
    body: "{firstName}, 10 clases. Esto ya es hábito. +{points} puntos a tu cuenta como reconocimiento.",
  },
  milestone_classes_25: {
    subject: "25 clases",
    body: "{firstName}, 25 clases en HIVE. Tu cuerpo ya nota el cambio. +{points} puntos.",
  },
  milestone_classes_50: {
    subject: "50 clases",
    body: "{firstName}, 50 clases. Eres parte de la familia HIVE. +{points} puntos.",
  },
  milestone_classes_100: {
    subject: "100 clases",
    body: "{firstName}, 100 clases. 🌟 Leyenda HIVE. +{points} puntos para canjear como tú quieras.",
  },

  // ── Promociones (broadcast manual por segmento) ─────────────────
  // Editables. {message} es el cuerpo que la dueña escribe en el admin.
  promo_custom: {
    subject: "Promo HIVE",
    body: "{firstName}, {message}",
  },
  promo_dormant_invite: {
    subject: "Te extrañamos en el estudio",
    body: "{firstName}, llevamos {days} días sin verte. Te queremos de regreso. {message}",
  },
  promo_expiring_offer: {
    subject: "Renueva con beneficio",
    body: "{firstName}, tu paquete vence pronto. {message}",
  },
  promo_birthday_month: {
    subject: "Feliz mes",
    body: "{firstName}, este mes cumples años y te tenemos algo. {message}",
  },
  admin_new_booking: {
    subject: "Nueva reserva",
    body: "Nueva reserva: {clientName} en {class} el {date} a las {time}.",
  },
};
