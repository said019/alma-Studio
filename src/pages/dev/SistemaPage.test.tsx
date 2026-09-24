import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SistemaPage from "./SistemaPage";
import { COLOR } from "@/design/tokens";

describe("página del sistema", () => {
  it("muestra cada token con su valor", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter><SistemaPage /></MemoryRouter>
      </QueryClientProvider>,
    );
    for (const [nombre, valor] of Object.entries(COLOR)) {
      expect(screen.getByText(nombre)).toBeInTheDocument();
      expect(screen.getAllByText(valor).length).toBeGreaterThan(0);
    }
  });
  it("la ruta sólo existe en desarrollo", () => {
    const app = fs.readFileSync(path.resolve(__dirname, "..", "..", "App.tsx"), "utf8");
    expect(app).toMatch(/const SistemaPage = import\.meta\.env\.DEV\s*\?\s*lazy\(/);
    expect(app).toMatch(/\{SistemaPage && \(\s*<Route path="\/sistema"/);
  });
});
