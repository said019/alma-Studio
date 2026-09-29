import { describe, it, expect } from "vitest";
import { PRIVACY_NOTICE_VERSION, HEALTH_CONSENT_TEXT, hasCurrentHealthConsent } from "./privacy-notice";
import * as servidor from "../../../server/lib/privacy.js";

describe("aviso de privacidad · versión y consentimiento", () => {
  it("la app y el servidor usan la misma versión del aviso", () => {
    expect(PRIVACY_NOTICE_VERSION).toBe(servidor.PRIVACY_NOTICE_VERSION);
  });
  it("el texto de la casilla es consentimiento expreso para datos de salud", () => {
    expect(HEALTH_CONSENT_TEXT).toBe("Autorizo expresamente a HIVE Pilates Studio a tratar mis datos de salud (lesiones, condiciones o embarazo) para cuidarme en clase, como explica el aviso de privacidad.");
  });
  it("consentimiento vigente", () => {
    expect(hasCurrentHealthConsent({ healthConsentVersion: PRIVACY_NOTICE_VERSION, healthConsentAt: "2026-09-28T10:00:00Z" })).toBe(true);
    expect(hasCurrentHealthConsent({ healthConsentVersion: "2025-01-01", healthConsentAt: "2025-01-01T10:00:00Z" })).toBe(false);
    expect(hasCurrentHealthConsent(null)).toBe(false);
  });
});
