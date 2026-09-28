import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HealthBadges } from "./HealthBadges";

describe("HealthBadges", () => {
  it("sin datos no renderiza nada", () => {
    const { container } = render(<HealthBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hasInjury con detalle: botón Lesión y al tocarlo aparece el detalle", () => {
    render(<HealthBadges hasInjury injuryDetails="Rodilla derecha" />);
    const boton = screen.getByRole("button", { name: /Lesión/ });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByText("Rodilla derecha")).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(screen.getByText("Rodilla derecha")).toBeInTheDocument();
  });

  it("sólo healthNotes también muestra Lesión y el detalle son las notas", () => {
    render(<HealthBadges healthNotes="Hipertensión controlada" />);
    const boton = screen.getByRole("button", { name: /Lesión/ });
    fireEvent.click(boton);
    expect(screen.getByText("Hipertensión controlada")).toBeInTheDocument();
  });

  it("firstVisit muestra la etiqueta Primera vez", () => {
    render(<HealthBadges firstVisit />);
    expect(screen.getByText("Primera vez")).toBeInTheDocument();
  });
});
