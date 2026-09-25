import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Switch } from "./switch";

describe("Switch (dos temas)", () => {
  it("encendido: tinta en el panel y degradado terracota en la app; perilla clara en oscuro", () => {
    render(<Switch aria-label="Recordatorios" defaultChecked />);
    const sw = screen.getByRole("switch", { name: "Recordatorios" });
    expect(sw.className).toMatch(/data-\[state=checked\]:bg-primary/);
    expect(sw.className).toMatch(/dark:data-\[state=checked\]:bg-accent-gradient/);
    expect(sw.querySelector("span")!.className).toMatch(/dark:bg-inverse/);
  });
});
