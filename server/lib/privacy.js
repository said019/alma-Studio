// Aviso de privacidad y consentimiento expreso para datos de salud (auditoría
// 2026-09-27, P1-10; LFPDPPP). La versión debe coincidir con
// src/lib/legal/privacy-notice.ts (privacy-notice.test.ts lo exige). Cambiar el
// aviso = versión nueva: el consentimiento de la versión anterior deja de valer
// y se vuelve a pedir la próxima vez que la clienta escriba datos de salud.
export const PRIVACY_NOTICE_VERSION = "2026-09-28";

export const HEALTH_CONSENT_REQUIRED_MESSAGE =
  "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.";

const texto = (v) => (typeof v === "string" ? v.trim() : "");

/** ¿Escribe datos de salud nuevos? Sólo cuenta un valor no vacío distinto al
 *  guardado (repetir el mismo texto o vaciarlo no pide consentimiento). */
export function healthDataChanges(current = {}, input = {}) {
  const notas = texto(input.healthNotes);
  const detalles = texto(input.injuryDetails);
  return (
    (notas !== "" && notas !== texto(current?.health_notes)) ||
    (input.hasInjury === true && current?.has_injury !== true) ||
    (detalles !== "" && detalles !== texto(current?.injury_details))
  );
}

export function hasCurrentHealthConsent(user) {
  return Boolean(user?.health_consent_at) && user?.health_consent_version === PRIVACY_NOTICE_VERSION;
}

/** null si se puede guardar; si no, el cuerpo del 400. */
export function healthConsentProblem({ changes, consentGiven, hasConsent }) {
  if (!changes || hasConsent || consentGiven === true) return null;
  return { code: "HEALTH_CONSENT_REQUIRED", message: HEALTH_CONSENT_REQUIRED_MESSAGE };
}
