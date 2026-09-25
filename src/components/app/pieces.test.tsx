import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AppShell, PageHeader, PrimaryButton, GhostButton, EmptyState, ErrorState, ListGroup, ListRow, ActionRow, SkeletonRow,
} from "./AppShell";
import { describeZone } from "@/design/zoneGuard";

describeZone(["src/components/app/AppShell.tsx", "src/components/brand/HexPedestal.tsx"]);

const wrap = (ui: React.ReactNode, route = "/app") =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );

/** Ningún elemento lleva color en `style`: todo sale de clases por tema. */
const sinColorEnLinea = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>("[style]")].filter((n) => n.style.color || n.style.backgroundColor || n.style.borderColor);

describe("AppShell (oscuro)", () => {
  it("barra inferior: las cinco pestañas reales con etiqueta", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>, "/app/classes");
    const nav = document.querySelector("nav[data-bottom-nav]")!;
    expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual(["Inicio", "Reservar", "Mis clases", "Wallet", "Perfil"]);
  });
  it("la pestaña activa va en degradado terracota con ícono oscuro; las demás en taupe", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>, "/app/classes");
    const nav = document.querySelector("nav[data-bottom-nav]")!;
    const activa = nav.querySelector('a[aria-current="page"] [data-nav-icon]')!;
    expect(activa.className).toMatch(/\bbg-accent-gradient\b/);
    expect(activa.className).toMatch(/\btext-accent-foreground\b/);
    const otra = nav.querySelector('a:not([aria-current]) [data-nav-icon]')!;
    expect(otra.className).toMatch(/\btext-ink-faint\b/);
  });
  it("las etiquetas de la barra miden 12 px y los destinos 44 px", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>);
    for (const a of document.querySelectorAll("nav[data-bottom-nav] a")) {
      expect(a.className).toMatch(/min-h-\[44px\]/);
      expect(a.querySelector("span:last-child")!.className).toMatch(/text-\[0\.75rem\]/);
    }
  });
  it("tiene el resplandor del fondo, sólo en oscuro", () => {
    wrap(<AppShell hideGreeting><p>x</p></AppShell>);
    const glow = document.querySelector("[data-app-glow]")!;
    expect(glow.className).toMatch(/\bhidden\b/);
    expect(glow.className).toMatch(/\bdark:block\b/);
    expect(glow.className).toMatch(/\bbg-app-glow\b/);
  });
  it("no pone colores en línea", () => {
    const { container } = wrap(<AppShell><p>x</p></AppShell>);
    expect(sinColorEnLinea(container)).toEqual([]);
  });
});

describe("PageHeader", () => {
  it("ya no es un bloque coral: título en tinta y segunda línea terracota", () => {
    wrap(<PageHeader title="Tus clases" titleAccent="en HIVE." />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.closest("header")!.className).not.toMatch(/bg-accent/);
    expect(h1.className).toMatch(/\btext-ink\b/);
    const acento = screen.getByText("en HIVE.");
    expect(acento.className).toMatch(/\btext-accent-strong\b/);
    expect(acento.className).toMatch(/\bdark:text-accent\b/);
  });
  it("el titular escala y puede partir línea a 390 px", () => {
    wrap(<PageHeader title="Notificaciones" />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toMatch(/text-\[length:clamp\(/);
    expect(h1.className).toMatch(/break-words/);
  });
});

describe("botones", () => {
  it("primary: tinta en el panel, degradado terracota con texto oscuro en la app", () => {
    wrap(<PrimaryButton>Reservar</PrimaryButton>);
    const b = screen.getByRole("button", { name: /Reservar/ });
    expect(b.className).toMatch(/\bbg-ink\b.*\btext-canvas\b/);
    expect(b.className).toMatch(/\bdark:bg-accent-gradient\b/);
    expect(b.className).toMatch(/\bdark:text-accent-foreground\b/);
  });
  it("accent: terracota con texto oscuro", () => {
    wrap(<PrimaryButton variant="accent">Comprar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Comprar/ }).className).toMatch(/\bbg-accent\b.*\btext-accent-foreground\b/);
  });
  it("deshabilitado: fondo sunken y texto tenue", () => {
    wrap(<PrimaryButton disabled>Reservar</PrimaryButton>);
    expect(screen.getByRole("button", { name: /Reservar/ }).className).toMatch(/\bbg-sunken\b.*\btext-ink-faint\b/);
  });
  it("GhostButton destructivo: contorno y texto danger", () => {
    wrap(<GhostButton tone="danger">Cancelar reserva</GhostButton>);
    expect(screen.getByRole("button", { name: "Cancelar reserva" }).className).toMatch(/\btext-danger\b.*\bring-danger\/60\b/);
  });
  it("todos miden al menos 44 px", () => {
    wrap(<><PrimaryButton size="sm">A</PrimaryButton><GhostButton>B</GhostButton></>);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-\[(4[4-9]|[5-9]\d)px\]/);
  });
});

describe("otras piezas", () => {
  it("ListGroup: tarjeta con borde, translúcida en oscuro", () => {
    const { container } = wrap(<ListGroup><ListRow title="Uno" /></ListGroup>);
    const c = container.firstElementChild as HTMLElement;
    expect(c.className).toMatch(/\bborder-line\b/);
    expect(c.className).toMatch(/\bbg-surface\b/);
    expect(c.className).toMatch(/\bdark:bg-surface\/70\b/);
  });
  it("ActionRow: la flecha es terracota con ícono oscuro", () => {
    wrap(<ActionRow title="Tu próxima clase" to="/app/bookings" />);
    const f = screen.getByTestId("action-row-arrow");
    expect(f.className).toMatch(/\bbg-accent\b/);
    expect(f.className).toMatch(/\bdark:bg-accent-gradient\b/);
    expect(f.className).toMatch(/\btext-accent-foreground\b/);
  });
  it("EmptyState: hexágono en pedestal y su acción", () => {
    wrap(<EmptyState title="Aún no tienes clases" ctaLabel="Reservar" ctaTo="/app/classes" />);
    expect(document.querySelector("[data-hex-pedestal]")).not.toBeNull();
    expect(screen.getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/app/classes");
  });
  it("ErrorState: alerta con reintento", () => {
    const retry = vi.fn();
    wrap(<ErrorState onRetry={retry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalled();
  });
  it("ninguna pieza pone colores en línea", () => {
    const { container } = wrap(
      <>
        <PageHeader title="T" titleAccent="a" subtitle="s" />
        <ListGroup><ListRow title="Uno" icon={<i>i</i>} onClick={() => {}} /><ListRow title="Salir" destructive onClick={() => {}} /></ListGroup>
        <ActionRow title="x" to="/app" eyebrow="e" meta="m" />
        <EmptyState title="v" /><ErrorState /><SkeletonRow />
        <PrimaryButton>p</PrimaryButton><GhostButton>g</GhostButton>
      </>,
    );
    expect(sinColorEnLinea(container)).toEqual([]);
  });
});
