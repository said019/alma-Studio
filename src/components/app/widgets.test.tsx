import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SegmentedTabs, StatusPill, InfoBanner, Stepper, DataRow, StickyCta } from "./widgets";
import { TONE_CLASS } from "@/design/tokens";
import { describeZone } from "@/design/zoneGuard";

// jsdom no implementa IntersectionObserver (usado por StickyCta); stub mínimo
// local para no tocar el setup compartido de pruebas.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  class MockIntersectionObserver implements IntersectionObserver {
    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  // @ts-expect-error jsdom no lo define
  window.IntersectionObserver = MockIntersectionObserver;
  global.IntersectionObserver = MockIntersectionObserver;
}

describeZone(["src/components/app/widgets.tsx"]);

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const has = (el: Element, cls: string) => expect(el.className.split(/\s+/)).toContain(cls);

describe("widgets (clases por tema)", () => {
  it("SegmentedTabs: la activa en tinta (panel) y en degradado con texto oscuro (app)", () => {
    wrap(<SegmentedTabs options={[{ value: "a", label: "Próximas", count: 1 }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />);
    const activa = screen.getByRole("tab", { selected: true });
    has(activa, "bg-ink"); has(activa, "text-canvas"); has(activa, "dark:bg-accent-gradient"); has(activa, "dark:text-accent-foreground");
    expect(activa.className).toMatch(/min-h-\[44px\]/);
  });
  it("StatusPill suave: tinte, contorno y punto del tono", () => {
    wrap(<StatusPill label="Confirmada" tone="success" />);
    const el = screen.getByText("Confirmada");
    has(el, TONE_CLASS.success.softBg); has(el, TONE_CLASS.success.softFg); has(el, TONE_CLASS.success.ring);
  });
  it("StatusPill con tono desconocido cae al neutro", () => {
    wrap(<StatusPill label="Raro" tone={"violeta" as never} />);
    has(screen.getByText("Raro"), TONE_CLASS.muted.softFg);
  });
  it("InfoBanner usa terracota suave por defecto", () => {
    wrap(<InfoBanner title="Aviso" />);
    has(screen.getByText("Aviso").closest("div[class*='rounded-2xl']")!, "bg-accent-soft");
  });
  it("Stepper: el paso actual en tinta/degradado", () => {
    wrap(<Stepper steps={[{ id: "a", label: "Paquete" }, { id: "b", label: "Pago" }]} current="a" />);
    const actual = screen.getByText("1");
    has(actual, "bg-ink"); has(actual, "dark:bg-accent-gradient");
  });
  it("ningún widget pone color en línea", () => {
    const { container } = wrap(
      <>
        <SegmentedTabs options={[{ value: "a", label: "A" }]} value="a" onChange={() => {}} />
        <StatusPill label="x" tone="accent" variant="solid" /><InfoBanner title="t" description="d" />
        <Stepper steps={[{ id: "a", label: "A" }]} current="a" /><DataRow label="L" value="V" copyable="V" />
        <StickyCta><span>cta</span></StickyCta>
      </>,
    );
    const conColor = [...container.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);
    expect(conColor).toEqual([]);
  });
});
