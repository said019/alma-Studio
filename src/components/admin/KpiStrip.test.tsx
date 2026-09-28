import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import KpiStrip, { type Kpi } from "./KpiStrip";

const kpis = (n: number): Kpi[] =>
  Array.from({ length: n }, (_, i) => ({ label: `KPI ${i + 1}`, value: String(i + 1) }));

describe("KpiStrip · hasta 5 columnas (A7)", () => {
  it("con 2 a 4 cifras, la fila de escritorio sigue igual que antes", () => {
    for (const n of [2, 3, 4]) {
      const { container, unmount } = render(<KpiStrip items={kpis(n)} />);
      const dl = container.querySelector("dl")!;
      expect(dl.className).toContain(`lg:grid-cols-${n}`);
      unmount();
    }
  });

  it("con 5 cifras (Wellhub), caben en una sola fila de escritorio con su borde", () => {
    render(<KpiStrip items={kpis(5)} />);
    const dl = screen.getByText("KPI 1").closest("dl")!;
    expect(dl.className).toContain("lg:grid-cols-5");
    const quinta = screen.getByText("KPI 5").closest("div")!;
    // La quinta ya no cae sola a otra fila en escritorio: lleva el borde
    // izquierdo de separación entre columnas de una sola fila.
    expect(quinta.className).toContain("lg:border-l");
    expect(quinta.className).toContain("border-t");
    expect(quinta.className).toContain("lg:border-t-0");
  });

  it("las 5 etiquetas y valores se muestran", () => {
    render(<KpiStrip items={kpis(5)} />);
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`KPI ${i}`)).toBeInTheDocument();
    }
  });
});
