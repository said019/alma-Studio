// Aviso de privacidad integral de HIVE Pilates Studio (auditoría 2026-09-27,
// P1-10; LFPDPPP). La versión debe coincidir con server/lib/privacy.js
// (privacy-notice.test.ts lo exige): cambiar el aviso = versión nueva.
// PENDIENTE (dueño y abogado): revisión legal del texto, nombre o razón social del
// responsable y correo para solicitudes ARCO (STUDIO.privacyEmail).
export const PRIVACY_NOTICE_VERSION = "2026-09-28";
export const PRIVACY_NOTICE_UPDATED = "29 de septiembre de 2026";

/** Texto de la casilla de consentimiento expreso (registro, perfil y cuestionario). */
export const HEALTH_CONSENT_TEXT =
  "Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud (lesiones, condiciones o embarazo) para cuidarme en clase, como explica el aviso de privacidad.";

export const hasCurrentHealthConsent = (
  u?: { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null,
): boolean => Boolean(u?.healthConsentAt) && u?.healthConsentVersion === PRIVACY_NOTICE_VERSION;
