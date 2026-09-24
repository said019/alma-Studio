import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { StatusPill, InfoBanner } from "./widgets";
import { Tag, Stat, ListRow, ActionRow } from "./AppShell";
import { COLOR } from "@/design/tokens";

const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("piezas con tono", () => {
  it("la pill suave coral lleva texto negro (coral profundo sobre coral suave no pasa)", () => {
    wrap(<StatusPill label="Por verificar" tone="accent" />);
    expect(screen.getByText("Por verificar")).toHaveStyle({ backgroundColor: COLOR.accentSoft, color: COLOR.ink });
  });

  it("el tono success pinta el texto en verde", () => {
    wrap(<StatusPill label="Pagado" tone="success" />);
    expect(screen.getByText("Pagado")).toHaveStyle({ color: COLOR.success });
  });

  it("un tono desconocido no rompe la pantalla: cae al neutro", () => {
    wrap(<StatusPill label="Raro" tone={"violeta" as never} />);
    expect(screen.getByText("Raro")).toHaveStyle({ color: COLOR.inkMuted });
  });

  it("la pill sólida coral nunca lleva texto claro", () => {
    wrap(<Tag tint="accent" variant="solid">4 lugares</Tag>);
    expect(screen.getByText("4 lugares")).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });

  it("InfoBanner usa coral suave por defecto", () => {
    wrap(<InfoBanner title="Aviso" />);
    expect(screen.getByText("Aviso").closest("div[class*='rounded-2xl']")).toHaveStyle({ backgroundColor: COLOR.accentSoft });
  });

  it("Stat pinta la cifra con el color del tono", () => {
    wrap(<Stat value="12" label="Clases" tint="accent" />);
    expect(screen.getByText("12")).toHaveStyle({ color: COLOR.accentStrong });
  });

  it("ListRow destructiva usa danger en el título", () => {
    wrap(<ListRow title="Cerrar sesión" destructive onClick={() => {}} />);
    expect(screen.getByText("Cerrar sesión")).toHaveStyle({ color: COLOR.danger });
  });

  it("ActionRow: el círculo coral lleva la flecha en negro", () => {
    wrap(<ActionRow title="Tu próxima clase" to="/app/bookings" />);
    const circulo = screen.getByTestId("action-row-arrow");
    expect(circulo).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });

  it("Tag suave lleva contorno line (success/danger no quedan blanco sobre blanco)", () => {
    wrap(<Tag tint="success">Pagado</Tag>);
    const style = screen.getByText("Pagado").getAttribute("style") ?? "";
    expect(style).toContain("inset 0 0 0 1px");
  });

  it("ListRow: el chip del ícono lleva contorno line (success/danger no quedan blanco sobre blanco)", () => {
    wrap(<ListRow title="Cerrar sesión" destructive icon={<span>i</span>} onClick={() => {}} />);
    const chip = screen.getByText("i").parentElement;
    const style = chip?.getAttribute("style") ?? "";
    expect(style).toContain("inset 0 0 0 1px");
  });
});
