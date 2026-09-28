import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HealthBadges } from "./HealthBadges";

describe("HealthBadges", () => {
  it("sin datos no renderiza nada", () => {
    const { container } = render(<HealthBadges />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hasInjury con detalle: botón Lesión y al tocarlo aparece el detalle", async () => {
    render(<HealthBadges hasInjury injuryDetails="Rodilla derecha" />);
    const boton = screen.getByRole("button", { name: /Lesión/ });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByText("Rodilla derecha")).not.toBeInTheDocument();
    fireEvent.click(boton);
    expect(await screen.findByText("Rodilla derecha")).toBeInTheDocument();
  });

  it("sólo healthNotes también muestra Lesión y el detalle son las notas", async () => {
    render(<HealthBadges healthNotes="Hipertensión controlada" />);
    const boton = screen.getByRole("button", { name: /Lesión/ });
    fireEvent.click(boton);
    expect(await screen.findByText("Hipertensión controlada")).toBeInTheDocument();
  });

  it("Escape cierra el detalle", async () => {
    render(<HealthBadges hasInjury injuryDetails="Rodilla derecha" />);
    fireEvent.click(screen.getByRole("button", { name: /Lesión/ }));
    await screen.findByText("Rodilla derecha");
    fireEvent.keyDown(screen.getByText("Rodilla derecha"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Rodilla derecha")).not.toBeInTheDocument());
  });

  it("firstVisit muestra la etiqueta Primera vez", () => {
    render(<HealthBadges firstVisit />);
    expect(screen.getByText("Primera vez")).toBeInTheDocument();
  });
});
