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

// PDF de responsiva firmada (GET /api/admin/users/:userId/waiver/pdf).
export const RESPONSIVA_PDF_HEADER = "HIVE Pilates Studio";

export const RESPONSIVA_PDF_SECTIONS = [
  { n: "1", title: "Aceptación de riesgo", body: "Participo de forma voluntaria en las clases, entrenamientos y actividades de HIVE Pilates Studio (Pilates Reformer, Tower, Mat, Barre y Sculpt), entendiendo que la práctica de ejercicio físico implica riesgos inherentes, incluyendo lesiones musculares, articulares o caídas. Asumo la responsabilidad por cualquier lesión, accidente o daño físico que pudiera ocurrir durante o después de las clases, y libero de toda responsabilidad a HIVE Pilates Studio, sus coaches, personal y representantes por cualquier incidente derivado de mi participación." },
  { n: "2", title: "Condición física y lesiones", body: "Declaro encontrarme en condiciones físicas adecuadas para realizar actividad física. Es mi responsabilidad informar previamente a las coaches o al personal sobre cualquier lesión, molestia, condición médica, embarazo u otra situación que pueda afectar mi práctica. HIVE Pilates Studio no se hace responsable por lesiones agravadas por falta de comunicación de mi parte." },
  { n: "3", title: "Normas del estudio", body: "Para la seguridad, higiene y experiencia de todas, acepto: uso obligatorio de calcetines antiderrapantes en todas las clases; llegar 10 minutos antes; respetar el horario de inicio (no se permite el acceso una vez iniciada la clase); mantener el celular en silencio; no ingresar bajo efectos de alcohol o sustancias que alteren el estado físico; y detenerme y avisar de inmediato a la coach en caso de dolor, mareo o malestar." },
  { n: "4", title: "Uso de imagen", body: "Autorizo a HIVE Pilates Studio a utilizar fotografías o videos tomados durante las clases para fines promocionales, redes sociales y material de comunicación, sin derecho a compensación económica. Esta autorización es opcional y la indico abajo." },
  { n: "5", title: "Firma de conformidad", body: "Declaro haber leído y comprendido completamente este documento. Al firmar, acepto los términos aquí descritos y libero de toda responsabilidad a HIVE Pilates Studio por cualquier lesión o daño derivado de mi participación." },
];
