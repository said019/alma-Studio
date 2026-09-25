import { describe, it, expect } from "vitest";
import { describeZone, read } from "@/design/zoneGuard";

const ARCHIVOS = [
  "src/pages/client/Responsiva.tsx",
  "src/components/app/ResponsivaDialog.tsx",
  "src/components/app/SignaturePad.tsx",
  "src/components/app/Lightbox.tsx",
];

describeZone(ARCHIVOS);

const responsiva = read("src/pages/client/Responsiva.tsx");
const dialog = read("src/components/app/ResponsivaDialog.tsx");
const signaturePad = read("src/components/app/SignaturePad.tsx");

describe("Responsiva, firma y consentimiento en oscuro (Tarea 12a)", () => {
  it('el toast de bienvenida dice "¡Bienvenida a HIVE!"', () => {
    expect(dialog).toMatch(/¡Bienvenida a HIVE!/);
    expect(dialog).not.toMatch(/Alma Movement/);
  });

  it("el subtítulo legal de la responsiva no se toca (lo decide el sub-proyecto A)", () => {
    expect(responsiva).toContain(
      "Responsiva y consentimiento informado firmado con Alma Movement."
    );
  });

  it("el trazo de la firma usa DARK.onInverse: el lienzo pinta con un color fijo (excepción de librería)", () => {
    expect(signaturePad).toMatch(/\bDARK\.onInverse\b/);
  });

  it("el panel de firma es una baldosa bg-inverse, visible en oscuro", () => {
    expect(signaturePad).toMatch(/\bbg-inverse\b/);
  });
});
