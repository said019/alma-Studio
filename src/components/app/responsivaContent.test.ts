import { describe, it, expect } from "vitest";
import {
  RESPONSIVA_VERSION, RESPONSIVA_TITLE, RESPONSIVA_SECTIONS, RESPONSIVA_DOCUMENTS, responsivaDocument,
} from "./responsivaContent";
import * as servidor from "../../../server/lib/responsiva.js";

describe("responsiva versionada (auditoría 2026-09-27, punto 7)", () => {
  it("la vigente es la v2 y es de HIVE", () => {
    expect(RESPONSIVA_VERSION).toBe("v2");
    expect(RESPONSIVA_TITLE).toBe("HIVE Pilates Studio — Responsiva y Consentimiento Informado");
    expect(RESPONSIVA_SECTIONS).toBe(RESPONSIVA_DOCUMENTS.v2.sections);
    expect(JSON.stringify(RESPONSIVA_DOCUMENTS.v2)).not.toMatch(/Alma/);
  });

  it("la v1 se conserva tal como se firmó", () => {
    expect(RESPONSIVA_DOCUMENTS.v1.title).toBe("Alma Movement — Responsiva y Consentimiento Informado");
    expect(RESPONSIVA_DOCUMENTS.v1.sections[0].body).toMatch(/^Participo de forma voluntaria en las clases, entrenamientos y actividades de Alma Movement/);
  });

  it("una versión vacía o desconocida se lee como v1", () => {
    expect(responsivaDocument(null)).toBe(RESPONSIVA_DOCUMENTS.v1);
    expect(responsivaDocument("v9")).toBe(RESPONSIVA_DOCUMENTS.v1);
    expect(responsivaDocument("v2")).toBe(RESPONSIVA_DOCUMENTS.v2);
  });

  it("la app y el servidor tienen el mismo texto en cada versión", () => {
    expect(servidor.CURRENT_RESPONSIVA_VERSION).toBe(RESPONSIVA_VERSION);
    for (const v of ["v1", "v2"] as const) {
      const s = servidor.RESPONSIVA_DOCUMENTS[v];
      expect(`${s.studio} — ${s.title}`).toBe(RESPONSIVA_DOCUMENTS[v].title);
      expect(s.sections).toEqual(RESPONSIVA_DOCUMENTS[v].sections);
    }
  });
});
