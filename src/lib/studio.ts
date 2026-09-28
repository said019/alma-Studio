// Datos públicos de HIVE Pilates Studio: única fuente de verdad para contacto
// y dirección en landing, app y legales. Importar desde aquí, nunca hardcodear.
// Fuente: cuestionario del estudio (2026-09-25). WhatsApp y teléfono: pendientes.
export const STUDIO = {
  name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  mapsUrl: "https://maps.app.goo.gl/6KvMNWPZk35siB4fA",
  instagram: "hive.pilates",
  whatsapp: null as string | null,
  phone: null as string | null,
  // Correo para solicitudes de privacidad (derechos ARCO). PENDIENTE: el dueño
  // no ha dado uno; mientras sea null, el aviso remite a recepción.
  privacyEmail: null as string | null,
  hours: "6 AM a 9 PM",
} as const;

export const instagramUrl = `https://www.instagram.com/${STUDIO.instagram}`;

/** Liga de WhatsApp, o null mientras el estudio no comparta número. */
export const whatsappUrl = (text?: string): string | null =>
  STUDIO.whatsapp ? `https://wa.me/${STUDIO.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
