import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { STUDIO, whatsappUrl, instagramUrl } from "./studio";

const root = path.resolve(__dirname, "..", "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

describe("datos del estudio (HIVE)", () => {
  it("son los de HIVE en Coyoacán", () => {
    expect(STUDIO.name).toBe("HIVE Pilates Studio");
    expect(STUDIO.address).toBe("Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX");
    expect(STUDIO.mapsUrl).toBe("https://maps.app.goo.gl/6KvMNWPZk35siB4fA");
    expect(STUDIO.instagram).toBe("hive.pilates");
    expect(STUDIO.hours).toBe("6 AM a 9 PM");
    expect(instagramUrl).toBe("https://www.instagram.com/hive.pilates");
  });
  it("sin número de WhatsApp no hay liga", () => {
    expect(STUDIO.whatsapp).toBeNull();
    expect(whatsappUrl("Hola")).toBeNull();
  });
  it("no quedan datos de Alma", () => {
    const src = read("src/lib/studio.ts");
    expect(src).not.toMatch(/Alma|Juriquilla|Querétaro|movementalma|7721119216/);
  });
  it("perfil y legales sólo muestran WhatsApp si hay número", () => {
    expect(read("src/pages/client/Profile.tsx")).not.toMatch(/wa\.me\/\$\{STUDIO\.whatsapp\}/);
    expect(read("src/pages/legal/LegalLayout.tsx")).not.toMatch(/wa\.me\/\$\{STUDIO\.whatsapp\}/);
  });
  it("sin correo de privacidad todavía: el aviso remite a recepción y no queda el de Alma", () => {
    expect(STUDIO.privacyEmail).toBeNull();
    expect(read("src/pages/legal/LegalLayout.tsx")).not.toMatch(/almamovement|info@/);
  });
});
