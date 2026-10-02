// Datos públicos de HIVE Pilates Studio: única fuente de verdad para contacto
// y dirección en landing, app y legales. Importar desde aquí, nunca hardcodear.
// Fuente: cuestionario del estudio (2026-09-25). Actualizado con información del estudio el 2026-10-01.
export const STUDIO = {
  name: "HIVE Pilates Studio",
  address: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  mapsUrl: "https://maps.app.goo.gl/6KvMNWPZk35siB4fA",
  instagram: "hive.pilates",
  whatsapp: "525559449611" as string | null,
  phone: "+52 55 5944 9611" as string | null,
  // Correo para solicitudes de privacidad (derechos ARCO). PENDIENTE: el dueño
  // no ha dado uno; mientras sea null, el aviso remite a recepción.
  privacyEmail: null as string | null,
  hours: "Lun–vie: 6–10 am y 5–8 pm · Sáb: 8 am–12 pm · Dom: 8–11 am",
  specialHours: "Lun–vie: 11 am–4 pm",
  bank: "Mercado Pago",
  clabe: "722969020124160665",
  annualPaymentPromoUrl: "https://mpago.la/1HWyxU1",
  annualPaymentRegularUrl: "https://mpago.la/1YY3tpp",
} as const;

export const instagramUrl = `https://www.instagram.com/${STUDIO.instagram}`;

/** Liga de WhatsApp, o null mientras el estudio no comparta número. */
export const whatsappUrl = (text?: string): string | null =>
  STUDIO.whatsapp ? `https://wa.me/${STUDIO.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ""}` : null;
