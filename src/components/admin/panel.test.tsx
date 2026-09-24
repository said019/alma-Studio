import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { buttonVariants } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { adminNavItemClass } from "./AdminLayout";
import FigureCard from "./FigureCard";
import SectionTabs from "./SectionTabs";
import { COLOR } from "@/design/tokens";

const root = path.resolve(__dirname, "..", "..", "..");

describe("panel", () => {
  it("la sección activa lleva una línea coral a la izquierda sobre canvas", () => {
    const c = adminNavItemClass(true, false);
    expect(c).toMatch(/bg-canvas/);
    expect(c).toMatch(/shadow-\[inset_3px_0_0_theme\(colors\.accent\.DEFAULT\)\]/);
  });
  it("la inactiva no usa coral", () => {
    expect(adminNavItemClass(false, false)).not.toMatch(/accent/);
  });
  it("el botón por defecto es negro y mide 44 px", () => {
    const c = buttonVariants();
    expect(c).toMatch(/bg-primary/);
    expect(c).toMatch(/\bh-11\b/);
  });
  it("ningún tamaño de botón baja de 44 px", () => {
    for (const size of ["default", "sm", "lg", "icon"] as const) {
      expect(buttonVariants({ size }), size).toMatch(/\bh-(11|12)\b/);
    }
  });
  it("el panel no tiene botón coral (coral = atención)", () => {
    for (const variant of ["default", "destructive", "outline", "secondary", "ghost", "link"] as const) {
      expect(buttonVariants({ variant }), variant).not.toMatch(/\bbg-accent\b/);
    }
    // Y ninguna pantalla del panel usa el botón coral de la app.
    // (Excluye los .test.tsx: si no, este mismo archivo se autodetecta por
    // contener el literal del regex de abajo.)
    const archivos = ["src/pages/admin", "src/components/admin"].flatMap((d) =>
      (fs.readdirSync(path.join(root, d), { recursive: true }) as string[])
        .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
        .map((f) => path.join(d, f)));
    expect(archivos.length).toBeGreaterThan(20);
    const conCoral = archivos.filter((f) => /variant="accent"/.test(fs.readFileSync(path.join(root, f), "utf8")));
    expect(conCoral).toEqual([]);
  });
  it("la pill de atención es coral con texto negro", () => {
    expect(badgeVariants({ variant: "attention" })).toMatch(/bg-accent\b.*text-ink|text-ink.*bg-accent\b/);
  });
  it("deshabilitado: fondo sunken y texto lineStrong, sin transparencia (spec §4.1)", () => {
    const c = buttonVariants();
    expect(c).toMatch(/disabled:bg-sunken/);
    expect(c).toMatch(/disabled:text-line-strong/);
    expect(c).not.toMatch(/disabled:opacity/);
  });
});

describe("tarjeta de cifra", () => {
  it("normal: blanca, borde line, número negro", () => {
    render(<FigureCard label="Clases hoy" value="12" />);
    expect(screen.getByText("12")).toHaveStyle({ color: COLOR.ink });
    expect(screen.getByText("12").closest("[data-figure-card]")).toHaveStyle({ backgroundColor: COLOR.surface, borderColor: COLOR.line });
  });
  it("atención: borde coral y número en coral profundo, con su etiqueta", () => {
    render(<FigureCard label="Por verificar" value="3" attention />);
    expect(screen.getByText("3")).toHaveStyle({ color: COLOR.accentStrong });
    expect(screen.getByText("3").closest("[data-figure-card]")).toHaveStyle({ borderColor: COLOR.accent });
    expect(screen.getByText("Por verificar")).toBeInTheDocument();
  });
});

describe("SectionTabs", () => {
  it("la pestaña activa va en negro y todas miden 44 px", () => {
    render(
      <MemoryRouter initialEntries={["/admin/class-types"]}>
        <SectionTabs tabs={[{ label: "Calendario", to: "/admin/classes" }, { label: "Tipos de clase", to: "/admin/class-types" }]} />
      </MemoryRouter>,
    );
    const activa = screen.getByRole("link", { name: "Tipos de clase" });
    expect(activa).toHaveAttribute("aria-current", "page");
    expect(activa.className).toMatch(/\bbg-ink\b.*\btext-canvas\b/);
    for (const a of screen.getAllByRole("link")) expect(a.className).toMatch(/min-h-\[44px\]/);
  });
});
