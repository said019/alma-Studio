import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SistemaPage from "./SistemaPage";
import { COLOR, DARK } from "@/design/tokens";

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><SistemaPage /></MemoryRouter>
    </QueryClientProvider>,
  );

describe("página del sistema", () => {
  it("muestra cada token con su valor", () => {
    renderPage();
    // Cada nombre y valor aparece dos veces (columna clara + columna oscura).
    for (const [nombre, valor] of Object.entries(COLOR)) {
      expect(screen.getAllByText(nombre).length).toBeGreaterThan(0);
      expect(screen.getAllByText(valor).length).toBeGreaterThan(0);
    }
  });
  it("muestra los dos temas lado a lado", () => {
    renderPage();
    expect(document.querySelector('[data-theme="light"]')).not.toBeNull();
    expect(document.querySelector('[data-theme="dark"]')).not.toBeNull();
    for (const v of Object.values(DARK)) expect(screen.getAllByText(v).length).toBeGreaterThan(0);
  });
  it("la ruta sólo existe en desarrollo", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "..", "..", "App.tsx"), "utf8");
    expect(app).toMatch(/const SistemaPage = import\.meta\.env\.DEV\s*\?\s*lazy\(/);
    expect(app).toMatch(/\{SistemaPage && \(\s*<Route path="\/sistema"/);
  });
});
