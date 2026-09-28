import { describe, it, expect } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useConfirm } from "./ConfirmDialog";

function Probe({ minLength, destructive }: { minLength?: number; destructive?: boolean }) {
  const { promptText, dialog } = useConfirm();
  const [res, setRes] = useState<string | null | undefined>(undefined);
  return (
    <>
      <button onClick={async () => setRes(await promptText({ title: "Motivo", confirmLabel: "Guardar", minLength, destructive }))}>abrir</button>
      <output data-testid="res">{res === undefined ? "—" : res === null ? "cancelado" : res}</output>
      {dialog}
    </>
  );
}

describe("promptText con minLength", () => {
  it("no deja confirmar hasta tener el mínimo (sin contar espacios) y lo avisa", async () => {
    render(<Probe minLength={5} />);
    fireEvent.click(screen.getByText("abrir"));
    const guardar = await screen.findByRole("button", { name: "Guardar" });
    expect(screen.getByText("Mínimo 5 caracteres.")).toBeInTheDocument();
    const caja = screen.getByRole("textbox");
    fireEvent.change(caja, { target: { value: "  hola  " } });
    expect(guardar).toBeDisabled();
    fireEvent.change(caja, { target: { value: "  hola!  " } });
    expect(guardar).toBeEnabled();
    fireEvent.click(guardar);
    await waitFor(() => expect(screen.getByTestId("res").textContent).toBe("hola!"));
  });

  it("sin minLength se comporta como antes", async () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("abrir"));
    expect(await screen.findByRole("button", { name: "Guardar" })).toBeEnabled();
    expect(screen.queryByText(/Mínimo/)).toBeNull();
  });

  it("destructive: true también pinta de rojo el botón de confirmar en el prompt (ronda de ajustes 1)", async () => {
    render(<Probe destructive />);
    fireEvent.click(screen.getByText("abrir"));
    const guardar = await screen.findByRole("button", { name: "Guardar" });
    expect(guardar.className).toMatch(/bg-destructive/);
  });

  it("sin destructive el botón de confirmar del prompt no se pinta de rojo", async () => {
    render(<Probe />);
    fireEvent.click(screen.getByText("abrir"));
    const guardar = await screen.findByRole("button", { name: "Guardar" });
    expect(guardar.className).not.toMatch(/bg-destructive/);
  });
});
