import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Tag, Stat, ListRow } from "./AppShell";
import { TONE_CLASS } from "@/design/tokens";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("piezas con tono (clases por tema)", () => {
  it("Tag suave terracota: fondo accent-soft, texto ink y contorno", () => {
    wrap(<Tag tint="accent">Últimos 2</Tag>);
    const el = screen.getByText("Últimos 2");
    has(el, TONE_CLASS.accent.softBg); has(el, TONE_CLASS.accent.softFg); has(el, "ring-1");
  });
  it("Tag sólido terracota: nunca texto claro", () => {
    wrap(<Tag tint="accent" variant="solid">4 lugares</Tag>);
    const el = screen.getByText("4 lugares");
    has(el, "bg-accent"); has(el, "text-accent-foreground"); has(el, "dark:bg-accent-gradient"); has(el, "dark:text-accent-foreground");
  });
  it("un tono desconocido no rompe la pantalla: cae al neutro", () => {
    wrap(<Tag tint={"violeta" as never}>Raro</Tag>);
    has(screen.getByText("Raro"), TONE_CLASS.muted.softFg);
  });
  it("Stat pinta la cifra con el color del tono", () => {
    wrap(<Stat value="12" label="Clases" tint="accent" />);
    has(screen.getByText("12"), "text-accent-strong");
  });
  it("ListRow destructiva usa danger en el título; el chip lleva contorno", () => {
    wrap(<ListRow title="Cerrar sesión" destructive icon={<span>i</span>} onClick={() => {}} />);
    has(screen.getByText("Cerrar sesión"), "text-danger");
    const chip = document.querySelector("[data-row-icon]")!;
    has(chip, "ring-1"); has(chip, TONE_CLASS.danger.softBg);
  });
});
