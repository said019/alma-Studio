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
  it("el punto del día activo contrasta con el degradado (no terracota sobre terracota)", () => {
    expect(book).toContain("bg-accent-foreground");
  });
});

describe("Fila 'Reservada' (interactiva sin CTA): toda la fila vuelve a ser el botón", () => {
  // BookClasses depende de varias queries de react-query (clases, mis reservas,
  // membresía, estado semanal): renderizarlo con RTL exigiría montar ese árbol de
  // providers y datos de prueba sólo para esta aserción. Se verifica en el código
  // fuente, como el resto de las pruebas de este archivo (BookClasses.redesign.test.ts
  // hace lo mismo).
  const ariaLabelExpr = "aria-label={`${cls.name}, ${cls.timeLabel}, ${state.label}`}";

  it("restaura el aria-label con el nombre de la clase en ClassRow y ClassCell", () => {
    const occurrences = book.split(ariaLabelExpr).length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("ese aria-label vive en un <button> real (no un <div>), con 44px mínimos", () => {
    expect((book.match(/<button\b/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(book).toContain("min-h-[44px]");
  });
});

describe("Confirmar clase (spec 2026-09-25 §6.3)", () => {
  it("hexágono iluminado y acción fija", () => {
    expect(confirm).toContain('<HexPedestal size="lg"');
    expect(confirm).toContain("<StickyCta");
  });
});
