import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell, PageHeader, PrimaryButton, GhostButton, EmptyState, ErrorState, ListGroup, ListRow } from "./AppShell";
import { SegmentedTabs } from "./widgets";
import { COLOR } from "@/design/tokens";

const wrap = (ui: React.ReactNode, route = "/app") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

describe("PageHeader", () => {
  it("es un bloque coral con texto negro (nunca claro sobre coral)", () => {
    wrap(<PageHeader title="Reserva tu clase" />);
    const bloque = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(bloque).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
  it("el titular escala y puede partir línea a 390 px", () => {
    wrap(<PageHeader title="Notificaciones" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    // Ruling 1: jsdom drops clamp() from inline style.fontSize, so the size lives
    // in a Tailwind arbitrary-value class instead.
    expect(h1.className).toMatch(/text-\[length:clamp\(/);
    expect(h1.className).toMatch(/break-words/);
  });
  it("sólo sube con margen negativo cuando es el primer elemento (no se come el mb-4 de BackLink)", () => {
    wrap(<PageHeader title="Mi perfil" />);
    const bloque = screen.getByRole("heading", { level: 1 }).closest("header")!;
    expect(bloque.className).toMatch(/(^|\s)first:-mt-4(\s|$)/);
    expect(bloque.className).not.toMatch(/(^|\s)-mt-4(\s|$)/);
  });
});

describe("botones", () => {
  it("primary: negro con texto claro", () => {
    wrap(<PrimaryButton>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ })).toHaveStyle({ backgroundColor: COLOR.ink, color: COLOR.canvas });
  });
  it("accent: coral con texto negro", () => {
    wrap(<PrimaryButton variant="accent">Comprar paquete</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Comprar/ })).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
  it("deshabilitado: fondo sunken y texto lineStrong (spec §4.1)", () => {
    wrap(<PrimaryButton disabled>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ })).toHaveStyle({ backgroundColor: COLOR.sunken, color: COLOR.lineStrong });
  });
  it("todos miden al menos 44 px de alto", () => {
    wrap(<><PrimaryButton size="sm">A</PrimaryButton><GhostButton>B</GhostButton></>);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });
});

describe("otras piezas", () => {
  it("SegmentedTabs: la pestaña activa va en negro", () => {
    wrap(<SegmentedTabs options={[{ value: "a", label: "Próximas" }, { value: "b", label: "Pasadas" }]} value="a" onChange={() => {}} />);
    const activa = screen.getByRole("tab", { selected: true });
    expect(activa).toHaveStyle({ backgroundColor: COLOR.ink, color: COLOR.canvas });
  });
  it("ListGroup es una tarjeta blanca", () => {
    const { container } = wrap(<ListGroup><ListRow title="Uno" /></ListGroup>);
    expect(container.firstElementChild).toHaveStyle({ backgroundColor: COLOR.surface });
  });
  it("EmptyState muestra su acción", () => {
    wrap(<EmptyState title="Aún no tienes clases" ctaLabel="Reservar" ctaTo="/app/classes" />);
    expect(screen.getByText("Aún no tienes clases")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/app/classes");
  });
  it("ErrorState es un alert y reintenta", () => {
    const retry = vi.fn();
    wrap(<ErrorState onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalled();
  });
});

describe("AppShell", () => {
  it("la pestaña activa de la barra inferior lleva el ícono sobre coral", () => {
    wrap(<AppShell hideGreeting><p>contenido</p></AppShell>, "/app/classes");
    const activa = screen.getAllByRole("link", { current: "page" }).find((a) => a.textContent?.includes("Reservar") && a.closest("nav[data-bottom-nav]"))!;
    expect(activa.querySelector("[data-nav-icon]")).toHaveStyle({ backgroundColor: COLOR.accent, color: COLOR.onAccent });
  });
});
