// Las versiones v1/v2 se conservan tal como se firmaron. La v3 transcribe
// la carta original proporcionada por HIVE el 1 de octubre de 2026.
// El texto debe coincidir con server/lib/responsiva.js.
export type ResponsivaVersion = "v1" | "v2" | "v3";
export type ResponsivaSection = { n: string; title: string; body: string };
export type ResponsivaDocument = { title: string; sections: readonly ResponsivaSection[] };

function documento(studio: string, disciplinas: string): ResponsivaDocument {
  return {
    title: `${studio} — Responsiva y Consentimiento Informado`,
    sections: [
      {
        n: "1",
        title: "Aceptación de riesgo",
        body: `Participo de forma voluntaria en las clases, entrenamientos y actividades de ${studio} (${disciplinas}), entendiendo que la práctica de ejercicio físico implica riesgos inherentes, incluyendo lesiones musculares, articulares o caídas. Asumo la responsabilidad por cualquier lesión, accidente o daño físico que pudiera ocurrir durante o después de las clases, y libero de toda responsabilidad a ${studio}, sus coaches, personal y representantes por cualquier incidente derivado de mi participación.`,
      },
      {
        n: "2",
        title: "Condición física y lesiones",
        body: `Declaro encontrarme en condiciones físicas adecuadas para realizar actividad física. Es mi responsabilidad informar previamente a las coaches o al personal sobre cualquier lesión, molestia, condición médica, embarazo u otra situación que pueda afectar mi práctica. ${studio} no se hace responsable por lesiones agravadas por falta de comunicación de mi parte.`,
      },
      {
        n: "3",
        title: "Normas del estudio",
        body: "Para la seguridad, higiene y experiencia de todas, acepto: uso obligatorio de calcetines antiderrapantes en todas las clases; llegar 10 minutos antes; respetar el horario de inicio (no se permite el acceso una vez iniciada la clase); mantener el celular en silencio; no ingresar bajo efectos de alcohol o sustancias que alteren el estado físico; y detenerme y avisar de inmediato a la coach en caso de dolor, mareo o malestar.",
      },
      {
        n: "4",
        title: "Uso de imagen",
        body: `Autorizo a ${studio} a utilizar fotografías o videos tomados durante las clases para fines promocionales, redes sociales y material de comunicación, sin derecho a compensación económica. Esta autorización es opcional y la indico abajo.`,
      },
      {
        n: "5",
        title: "Firma de conformidad",
        body: `Declaro haber leído y comprendido completamente este documento. Al firmar, acepto los términos aquí descritos y libero de toda responsabilidad a ${studio} por cualquier lesión o daño derivado de mi participación.`,
      },
    ],
  };
}

export const RESPONSIVA_DOCUMENTS: Record<ResponsivaVersion, ResponsivaDocument> = {
  v1: documento("Alma Movement", "Pilates Reformer, Tower, Mat, Barre y Sculpt"),
  v2: documento("HIVE Pilates Studio", "Pilates en Reformer y las demás clases que ofrece el estudio"),
  v3: {
  "title": "HIVE Pilates Studio — Carta de Consentimiento Informado y Responsiva",
  "sections": [
    {
      "n": "1",
      "title": "Declaración de Salud y Condición Física",
      "body": "Nombre completo: _______________ Teléfono de contacto: ____________ Contacto de emergencia (Nombre y teléfono): _________________________________________ 1. Declaración de Salud y Condición Física Declaro bajo mi propia responsabilidad que me encuentro en condiciones físicas y de salud adecuadas para la práctica de ejercicio físico de moderado a intenso, específicamente el método Pilates Reformer, y con el conocimiento que consiste en lo siguiente: Es un aparato para realizar ejercicios que pueden ser de moderado a intenso. Permite desarrollar fuerza, movilidad, estabilidad, coordinación, y control mediante sistema de resistencia progresiva proporcionada por resortes de alta calidad y sumamente resistentes al uso diario y constante, al estar hecho con metales resistentes. Aviso médico: Informo y manifiesto que no padezco ninguna lesión, enfermedad crónica, dolor articular agudo, embarazo o condición médica relevante. Me comprometo a presentar un certificado médico de aptitud física si el instructor lo requiere, o si presento alguna condición de salud particular."
    },
    {
      "n": "2",
      "title": "Asunción de Riesgos",
      "body": "Entiendo y acepto que la práctica de Pilates Reformer utiliza equipos con resistencia por resortes, poleas y plataformas móviles que implican fuerzas mecánicas y movimientos exigentes. Reconozco que, como en cualquier actividad física, existe un riesgo inherente de lesiones, accidentes, caídas o malestares musculares imprevistos. Asumo de manera libre y voluntaria dicha responsabilidad."
    },
    {
      "n": "3",
      "title": "Compromiso y Normas del Estudio",
      "body": "Me comprometo a seguir en todo momento las indicaciones y adaptaciones sugeridas por el instructor o instructora a cargo. Acepto utilizar de forma correcta el equipo (Reformer y accesorios) y notificar de inmediato cualquier anomalía o incomodidad física que sienta antes, durante o después de la sesión. Eximo al instructor, a Hive Pilates Studio y a su personal administrativo de toda responsabilidad legal penal, civil, administrativa o médica, así como de cualquier otra, por cualquier lesión o incidente derivado de la omisión de información sobre mi estado de salud o por el incumplimiento de las reglas del establecimiento."
    },
    {
      "n": "4",
      "title": "Firma de conformidad",
      "body": "HE LEÍDO, COMPRENDIDO Y ACEPTO LOS TÉRMINOS DE ESTA CARTA RESPONSIVA."
    },
    {
      "n": "5",
      "title": "Aviso de Privacidad",
      "body": "Hive Pilates Studio, con domicilio en la calle de Cuauhtémoc, numero 68, Planta baja, local uno, Colonia del Carmen, Alcaldía Coyoacán, en la Ciudad de México, es el sujeto obligado y responsable del tratamiento de los datos personales que se recaban de forma general a través del presente escrito, los cuales serán protegidos conforme a lo dispuesto por la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados, y demás normatividad que resulte aplicable; dichos datos son los listados en el apartado siguiente. Los datos personales recolectados por los particulares morales o físicos, los cuales consolidan datos personales sensibles, o aquellos datos recabados por cualquier otro sujeto obligado que utilice pilates reformer para la prestación de algún servicio, serán tratados bajo su responsabilidad, conforme a sus atribuciones legales y el aviso de privacidad correspondiente. Datos personales que se recolectan y la finalidad del tratamiento El único dato personal que se recaba a través del presente escrito, no está condicionado a proporcionar el correo electrónico, este dato personal se recopila como dato opcional, para que el usuario reciba mayor y mejor información. Se informa que no es obligación proporcionar datos personales sensibles. Los datos que proporcione, serán utilizados para las siguientes finalidades: Única: hacer llegar promociones de nuestros productos o información por cualquier eventualidad medica o física, que se tenga durante la estancia en nuestras instalaciones, jamás para cobrarle o proporcionárselos a terceros. Hive Pilates Studio, trata los datos personales antes señalados con fundamento en los artículos 6° Base A y 16 segundo párrafo de la Constitución Política de los Estados Unidos Mexicanos; 3°, fracción XXXIII, 4°, 16, 17 y 18 de la Ley General de Protección de Datos Personales en Posesión de Sujetos Obligados; El Mecanismo para ejercer sus derechos de acceso, rectificación, cancelación u oposición de sus datos personales, se deberá hacer por escrito en estas instalaciones especificando las modificaciones o el asunto a tratar, debiendo pilates reformer contestar su petición en 24 horas, y que nos ubicamos en la calle de Cuauhtémoc, numero 68, Planta baja, local uno, Colonia del Carmen, Alcaldía Coyoacán, en la Ciudad de México. Transferencia de datos personales No se realizarán transferencias de datos personales, salvo aquellas que sean necesarias para atender requerimientos debidamente fundados y motivados, provenientes de una autoridad competente. Cambios al aviso de privacidad En caso de que existir una modificación a este aviso de privacidad, se notificará por escrito en nuestras instalaciones, estamos ubicados en la calle de Cuauhtémoc, numero 68, Planta baja, local uno, Colonia del Carmen, Alcaldía Coyoacán, en la Ciudad de México."
    }
  ]
},
};

/** La versión que se firma hoy. */
export const RESPONSIVA_VERSION: ResponsivaVersion = "v3";

/** El texto de una versión firmada. Las firmas de antes del versionado no traen versión: son v1. */
export const responsivaDocument = (version?: string | null): ResponsivaDocument =>
  version === "v1" || version === "v2" || version === "v3" ? RESPONSIVA_DOCUMENTS[version] : RESPONSIVA_DOCUMENTS.v1;

export const RESPONSIVA_TITLE = RESPONSIVA_DOCUMENTS[RESPONSIVA_VERSION].title;
export const RESPONSIVA_SECTIONS = RESPONSIVA_DOCUMENTS[RESPONSIVA_VERSION].sections;

export const RESPONSIVA_PDF_URL = "/documents/hive-consentimiento-responsiva.pdf";
