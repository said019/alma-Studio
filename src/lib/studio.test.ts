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
    expect(STUDIO.hours).toContain("Lun–vie: 6–10 am y 5–8 pm");
    expect(instagramUrl).toBe("https://www.instagram.com/hive.pilates");
  });
  it("usa el WhatsApp confirmado por HIVE", () => {
    expect(STUDIO.whatsapp).toBe("525559449611");
    expect(whatsappUrl("Hola HIVE")).toBe("https://wa.me/525559449611?text=Hola%20HIVE");
    expect(STUDIO.clabe).toBe("722969020124160665");
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
