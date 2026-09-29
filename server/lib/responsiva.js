// Responsiva y consentimiento informado, por versión (auditoría 2026-09-27,
// punto 7). La v1 es la que se firmó con Alma Movement y se conserva tal cual:
// una responsiva firmada vale con el texto de su versión. La v2 es la de HIVE
// Pilates Studio. Debe coincidir con src/components/app/responsivaContent.ts
// (responsivaContent.test.ts lo exige). PENDIENTE: revisión de un abogado.

function documento(studio, disciplinas) {
  return Object.freeze({
    studio,
    title: "Responsiva y Consentimiento Informado",
    sections: Object.freeze([
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
    ].map((s) => Object.freeze(s))),
  });
}

export const RESPONSIVA_DOCUMENTS = Object.freeze({
  v1: documento("Alma Movement", "Pilates Reformer, Tower, Mat, Barre y Sculpt"),
  v2: documento("HIVE Pilates Studio", "Pilates en Reformer y las demás clases que ofrece el estudio"),
});
export const RESPONSIVA_VERSIONS = Object.freeze(Object.keys(RESPONSIVA_DOCUMENTS));
export const CURRENT_RESPONSIVA_VERSION = "v2";

/** El texto de una versión. Las firmas de antes del versionado no traen versión: son v1. */
export function responsivaDocument(version) {
  return Object.hasOwn(RESPONSIVA_DOCUMENTS, version ?? "") ? RESPONSIVA_DOCUMENTS[version] : RESPONSIVA_DOCUMENTS.v1;
}

/** null si la versión que manda la app sirve (o no manda ninguna); si no, el 400. */
export function waiverVersionProblem(v) {
  if (v === undefined || v === null) return null;
  return RESPONSIVA_VERSIONS.includes(v) ? null : "Versión de responsiva desconocida.";
}
