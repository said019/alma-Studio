import { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BirthDateInput } from "./birth-date-input";

function Form({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return <form aria-label="Ficha"><BirthDateInput value={value} onChange={setValue} /><output aria-label="Fecha guardada">{value}</output></form>;
}
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("fecha de nacimiento", () => {
  it("permite elegir día, mes y año y entrega ISO", () => {
    render(<Form />);
    change("Día de nacimiento", "29"); change("Mes de nacimiento", "02"); change("Año de nacimiento", "2000");
    expect(screen.getByLabelText("Fecha guardada")).toHaveTextContent("2000-02-29");
    expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(true);
  });
  it("invalida 29 de febrero al cambiar a un año no bisiesto", () => {
    render(<Form initial="2000-02-29" />);
    change("Año de nacimiento", "2001");
    expect(screen.getByLabelText("Día de nacimiento")).toHaveValue("");
    expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(false);
    change("Día de nacimiento", "28");
    expect(screen.getByLabelText("Fecha guardada")).toHaveTextContent("2001-02-28");
  });
  it("muestra una fecha existente y permite borrarla", () => {
    render(<Form initial="1996-03-18" />);
    expect(screen.getByLabelText("Día de nacimiento")).toHaveValue("18");
    expect(screen.getByLabelText("Mes de nacimiento")).toHaveValue("03");
    expect(screen.getByLabelText("Año de nacimiento")).toHaveValue("1996");
    fireEvent.click(screen.getByRole("button", { name: "Borrar fecha" }));
    expect(screen.getByLabelText("Fecha guardada")).toBeEmptyDOMElement();
    expect((screen.getByRole("form") as HTMLFormElement).checkValidity()).toBe(true);
  });
});
