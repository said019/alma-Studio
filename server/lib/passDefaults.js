// Textos por defecto (fallback) del pase de wallet (Apple + Google) y del PDF
// de responsiva. Son los que se usan cuando no hay un dato de negocio más
// específico (nombre de evento, sede, etc.) o cuando no se definió la
// variable de entorno correspondiente (GOOGLE_ISSUER_NAME, etc.).
// Extraído de server/index.js para poder probarse por separado
// (ver server/lib/brandResidue.test.js).
export const PASS_DEFAULT_TEXTS = {
  // Google Wallet: nombre del emisor / del programa de lealtad.
  issuerName: "HIVE Pilates Studio",
  programName: "HIVE Club",
  programNameTranslated: "HIVE Club — Pilates · Barre · Reformer/Tower",
  logoDescription: "HIVE Pilates Studio",
  heroDescription: "HIVE Pilates Studio",

  // Encabezados y labels visibles en el frente/reverso del pase.
  passHeader: "HIVE CLUB",
  pointsLabel: "PUNTOS HIVE CLUB",
  membershipHeadline: "HIVE Pass",
  welcomeBackLabel: "Bienvenida a HIVE",
  memberFallbackName: "Miembro HIVE",

  // Apple Wallet: organización, descripción y términos del pase.
  organizationName: "HIVE Pilates Studio",
  termsDefault:
    "Pase personal para clases en HIVE Pilates Studio. Presenta tu QR al llegar. Cancelaciones: alumnas nuevas 4-5 h antes, recurrentes 2 h antes.",
  geofenceRelevantText: "Estás cerca de HIVE. Saca tu pase para check-in.",

  // Datos del estudio en el reverso del pase — alineados con src/lib/studio.ts
  // (única fuente de verdad). No hay WhatsApp/teléfono público todavía (null
  // ahí), así que ese campo se omite en vez de mostrar un número viejo.
  studioAddress: "Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX",
  studioHours: "6 AM a 9 PM",

  // Fallback cuando no hay sede/evento capturado.
  eventLocationDefault: "HIVE Pilates Studio",
  eventTitleDefault: "Evento HIVE",

  // Web pass fallback (sin certificados de Apple configurados).
  webPassTitle: "HIVE Club",
  webPassLogo: "HIVE",
  webEventPassTitle: "Pase de Evento — HIVE",
};

// Siembra inicial de loyalty_milestones (sólo corre con la tabla vacía —
// instalación nueva — ver server/index.js). Nombres/descripciones tal cual se
// insertan; el resto de columnas (classesRequired, period, awardType,
// awardPoints, messageTemplateKey, sortOrder) viaja en el mismo orden que la
// tupla original para que el INSERT parametrizado no cambie de forma.
export const LOYALTY_MILESTONES_SEED = [
  { name: "Primera meta", description: "Primer logro: 5 clases asistidas", classesRequired: 5, period: "lifetime", awardType: "points", awardPoints: 50, messageTemplateKey: "milestone_classes_5", sortOrder: 10 },
  { name: "Hábito en marcha", description: "10 clases. Esto ya es hábito.", classesRequired: 10, period: "lifetime", awardType: "points", awardPoints: 100, messageTemplateKey: "milestone_classes_10", sortOrder: 20 },
  { name: "Cuerpo en cambio", description: "25 clases. El cuerpo lo nota.", classesRequired: 25, period: "lifetime", awardType: "points", awardPoints: 250, messageTemplateKey: "milestone_classes_25", sortOrder: 30 },
  { name: "Familia HIVE", description: "50 clases. Eres parte del estudio.", classesRequired: 50, period: "lifetime", awardType: "points", awardPoints: 500, messageTemplateKey: "milestone_classes_50", sortOrder: 40 },
  { name: "Leyenda HIVE", description: "100 clases. Imparable.", classesRequired: 100, period: "lifetime", awardType: "points", awardPoints: 1000, messageTemplateKey: "milestone_classes_100", sortOrder: 50 },
];
