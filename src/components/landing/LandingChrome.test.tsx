import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, within, fireEvent } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { useAuthStore } from "@/stores/authStore";
import { LandingNav } from "./LandingNav";
import { LandingHero } from "./LandingHero";
import { LandingFooter } from "./LandingFooter";

describeZone(["src/components/landing/LandingNav.tsx", "src/components/landing/LandingHero.tsx", "src/components/landing/LandingFooter.tsx"]);

const LINKS = [{ href: "#clases", label: "Clases" }, { href: "#horario", label: "Horario" }];
const login = (role: string) => useAuthStore.setState({ isAuthenticated: true, user: { id: "u", role, displayName: "Ana" } as never });

// Cada prueba fija la sesión (si la necesita) antes de montar, y monta una
// sola vez: la rehidratación de useAuthStore (persist) puede actualizar un
// árbol que ya se desmontó o que se monta después si se entrelazan sesión y
// montajes dentro de la misma prueba, y eso dispara advertencias de act()
// fuera de test. Reiniciar a "sin sesión" en beforeEach evita fugas entre pruebas.
beforeEach(() => useAuthStore.setState({ isAuthenticated: false, user: null }));
afterEach(() => vi.restoreAllMocks());

describe("menú de la landing", () => {
  it("sin sesión: Entrar, y las ligas de escritorio miden 44 px", () => {
    renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth/login");
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.className).toMatch(/min-h-\[44px\]/);
    }
  });
  it("el logo (liga a inicio) también mide 44 px, como el resto del menú", () => {
    renderPage(<LandingNav links={LINKS} />, "/");
    const logo = screen.getByRole("link", { name: "HIVE Pilates Studio" });
    expect(logo.className).toMatch(/min-h-\[44px\]/);
  });
  it("con usuario: Mi cuenta", () => {
    login("client");
    renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/app");
  });
  it("con staff: Panel", () => {
    login("admin");
    renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Panel" })).toHaveAttribute("href", "/admin/dashboard");
  });
  it("el menú móvil abre, muestra las ligas y cierra con Escape", () => {
    renderPage(<LandingNav links={LINKS} />, "/");
    const boton = screen.getByRole("button", { name: "Abrir menú" });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("landing-menu")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.getElementById("landing-menu")).toBeNull();
  });
  it("al cerrar con Escape, el foco vuelve al botón del menú", () => {
    renderPage(<LandingNav links={LINKS} />, "/");
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú" }));
    const link = within(document.getElementById("landing-menu")!).getByRole("link", { name: "Horario" });
    link.focus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir menú" }));
  });
  it("el logo en / además sube al inicio; fuera de / sólo navega", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const r = renderPage(<LandingNav links={LINKS} />, "/");
    fireEvent.click(screen.getByRole("link", { name: "HIVE Pilates Studio" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    r.unmount();
    scrollTo.mockClear();
    renderPage(<LandingNav links={LINKS} />, "/legal/privacidad");
    fireEvent.click(screen.getByRole("link", { name: "HIVE Pilates Studio" }));
    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("portada", () => {
  it("titular, un solo h1 y botón a registro con regreso a comprar", () => {
    renderPage(<LandingHero />, "/");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Pilates Reformer en Coyoacán." })).toBeInTheDocument();
    expect(screen.getByText("BEE HEALTHY. BE HIVE.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reserva tu primera clase/ })).toHaveAttribute("href", "/auth/register?returnUrl=%2Fapp%2Fcheckout");
    expect(screen.getByRole("link", { name: "Ver horario" })).toHaveAttribute("href", "#horario");
  });
  it("staff: el botón lleva al panel", () => {
    login("reception");
    renderPage(<LandingHero />, "/");
    expect(screen.getByRole("link", { name: /Ir al panel/ })).toHaveAttribute("href", "/admin/dashboard");
  });
});

describe("pie", () => {
  it("lema, ligas legales y © HIVE", () => {
    renderPage(<LandingFooter />, "/");
    expect(screen.getByText("BEE HEALTHY. BE HIVE.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/legal/privacidad");
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/legal/terminos");
    expect(screen.getByRole("link", { name: "Cancelación" })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.getByText(/© \d{4} HIVE Pilates Studio/)).toBeInTheDocument();
  });
});
