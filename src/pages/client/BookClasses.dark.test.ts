import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { describeZone } from "@/design/zoneGuard";

const book = fs.readFileSync(path.resolve(__dirname, "BookClasses.tsx"), "utf8");
const confirm = fs.readFileSync(path.resolve(__dirname, "BookClassConfirm.tsx"), "utf8");

describeZone(["src/pages/client/BookClasses.tsx", "src/pages/client/BookClassConfirm.tsx"]);

describe("Reservar en oscuro (spec 2026-09-25 §6.2)", () => {
  it("encabezado Reserva tu / próxima clase.", () => {
    expect(book).toMatch(/titleAccent="próxima clase\."/);
  });
  it("día activo en degradado y punto terracota en días con clases", () => {
    expect(book).toContain("bg-accent-gradient");
    expect(book).toMatch(/\bbg-accent\b/);
  });
});

describe("Confirmar clase (spec 2026-09-25 §6.3)", () => {
  it("hexágono iluminado y acción fija", () => {
    expect(confirm).toContain('<HexPedestal size="lg"');
    expect(confirm).toContain("<StickyCta");
  });
});
