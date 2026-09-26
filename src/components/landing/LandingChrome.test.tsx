import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderPage } from "@/test/renderPage";
import { describeZone } from "@/design/zoneGuard";
import { useAuthStore } from "@/stores/authStore";
import { LandingNav } from "./LandingNav";
import { LandingHero } from "./LandingHero";
import { LandingFooter } from "./LandingFooter";

describeZone(["src/components/landing/LandingNav.tsx", "src/components/landing/LandingHero.tsx", "src/components/landing/LandingFooter.tsx"]);

const LINKS = [{ href: "#clases", label: "Clases" }, { href: "#horario", label: "Horario" }];
const login = (role: string) => useAuthStore.setState({ isAuthenticated: true, user: { id: "u", role, displayName: "Ana" } as never });

afterEach(() => useAuthStore.setState({ isAuthenticated: false, user: null }));

describe("menú de la landing", () => {
  it("sin sesión: Entrar; con clienta: Mi cuenta; con staff: Panel", () => {
    const { unmount } = renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/auth/login");
    unmount();
    login("client");
    const r2 = renderPage(<LandingNav links={LINKS} />, "/");
    expect(screen.getByRole("link", { name: "Mi cuenta" })).toHaveAttribute("href", "/app");
    r2.unmount();
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
});

describe("portada", () => {
  it("titular, un solo h1 y botón a registro con regreso a comprar", () => {
    renderPage(<LandingHero />, "/");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Pilates Reformer · Coyoacán")).toBeInTheDocument();
    expect(screen.getByText("Sal más fuerte.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Reserva tu clase muestra/ })).toHaveAttribute("href", "/auth/register?returnUrl=%2Fapp%2Fcheckout");
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
    expect(screen.getByText("MOVIMIENTO · BIENESTAR · COMUNIDAD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacidad" })).toHaveAttribute("href", "/legal/privacidad");
    expect(screen.getByRole("link", { name: "Términos" })).toHaveAttribute("href", "/legal/terminos");
    expect(screen.getByRole("link", { name: "Cancelación" })).toHaveAttribute("href", "/legal/cancelacion");
    expect(screen.getByText(/© \d{4} HIVE Pilates Studio/)).toBeInTheDocument();
  });
});
