import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "./BrandLogo";

describe("BrandLogo", () => {
  it("el símbolo tiene nombre accesible", () => {
    render(<BrandLogo />);
    expect(screen.getByRole("img", { name: "HIVE Pilates Studio" })).toBeInTheDocument();
  });
  it("hereda el color del texto (un solo color, siempre)", () => {
    const { container } = render(<BrandLogo />);
    expect(container.querySelector("rect")?.getAttribute("fill")).toBe("currentColor");
  });
  it("dos logos en la misma pantalla no comparten máscara", () => {
    const { container } = render(<><BrandLogo /><BrandLogo /></>);
    const ids = [...container.querySelectorAll("mask")].map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });
  it("el logo completo dice HIVE y PILATES STUDIO", () => {
    render(<BrandLogo variant="lockup" />);
    expect(screen.getByText("HIVE")).toBeInTheDocument();
    expect(screen.getByText("PILATES STUDIO")).toBeInTheDocument();
  });
});
