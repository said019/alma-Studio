import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Informacion from "./Informacion";
import { STUDIO_FAQS, STUDIO_RULES } from "@/lib/studioContent";

describe("Información suministrada por HIVE", () => {
  it("ofrece todas las preguntas, siete reglas, contacto y carta original", () => {
    const { container } = render(<MemoryRouter><Informacion /></MemoryRouter>);
    expect(STUDIO_FAQS).toHaveLength(6);
    expect(STUDIO_FAQS.reduce((total, group) => total + group.items.length, 0)).toBe(21);
    expect(container.querySelectorAll("summary")).toHaveLength(21);
    expect(STUDIO_RULES).toHaveLength(7);
    expect(screen.getByText(/Gómez Farías #58/)).toHaveTextContent("$20 por hora");
    expect(screen.getByText(/Cada clase tiene una duración de 50 minutos/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /documento original/ })).toHaveAttribute("href", "/documents/hive-consentimiento-responsiva.pdf");
    expect(container.textContent).toContain("12 horas");
    expect(container.textContent).toContain("60 días naturales");
    expect(container.textContent).toContain("5 minutos después");
  });
});
