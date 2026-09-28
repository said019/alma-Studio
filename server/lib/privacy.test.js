import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIVACY_NOTICE_VERSION, healthDataChanges, hasCurrentHealthConsent, healthConsentProblem, HEALTH_CONSENT_REQUIRED_MESSAGE } from "./privacy.js";

test("sólo cuenta escribir un dato de salud nuevo", () => {
  assert.equal(healthDataChanges({ health_notes: null }, { healthNotes: "Asma" }), true);
  assert.equal(healthDataChanges({ health_notes: "Asma" }, { healthNotes: " Asma " }), false, "el mismo texto no es cambio");
  assert.equal(healthDataChanges({ health_notes: "Asma" }, { healthNotes: "" }), false, "vaciar no pide consentimiento");
  assert.equal(healthDataChanges({ health_notes: null }, { displayName: "Ana" }), false);
  assert.equal(healthDataChanges({ has_injury: false }, { hasInjury: true, injuryDetails: "Tobillo" }), true);
  assert.equal(healthDataChanges({ has_injury: true, injury_details: "Tobillo" }, { hasInjury: true, injuryDetails: "Tobillo" }), false);
});

test("consentimiento vigente = con fecha y de la versión actual del aviso", () => {
  assert.equal(PRIVACY_NOTICE_VERSION, "2026-09-29");
  assert.equal(hasCurrentHealthConsent({ health_consent_at: new Date(), health_consent_version: PRIVACY_NOTICE_VERSION }), true);
  assert.equal(hasCurrentHealthConsent({ health_consent_at: new Date(), health_consent_version: "2025-01-01" }), false);
  assert.equal(hasCurrentHealthConsent({ health_consent_at: null, health_consent_version: PRIVACY_NOTICE_VERSION }), false);
  assert.equal(hasCurrentHealthConsent(null), false);
});

test("se exige sólo si escribe salud sin consentimiento vigente ni casilla", () => {
  assert.deepEqual(healthConsentProblem({ changes: true, consentGiven: false, hasConsent: false }),
    { code: "HEALTH_CONSENT_REQUIRED", message: HEALTH_CONSENT_REQUIRED_MESSAGE });
  assert.equal(healthConsentProblem({ changes: true, consentGiven: true, hasConsent: false }), null);
  assert.equal(healthConsentProblem({ changes: true, consentGiven: false, hasConsent: true }), null);
  assert.equal(healthConsentProblem({ changes: false, consentGiven: false, hasConsent: false }), null);
  assert.equal(HEALTH_CONSENT_REQUIRED_MESSAGE, "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.");
});
