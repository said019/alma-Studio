import { describe, it, expect } from "vitest";
import { previewMonths, validateGenerate } from "./generate-helpers";

describe("validateGenerate", () => {
  it("la hora de fin va después de la de inicio", () => {
    expect(validateGenerate({ startTime: "13:00", endTime: "13:00", maxCapacity: 6 }).time).toBe("La hora de fin debe ser después de la de inicio.");
    expect(validateGenerate({ startTime: "13:00", endTime: "12:00", maxCapacity: 6 }).time).not.toBeNull();
    expect(validateGenerate({ startTime: "13:00", endTime: "13:50", maxCapacity: 6 }).time).toBeNull();
  });
  it("el cupo es de al menos 1", () => {
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: 0 }).capacity).toBe("El cupo debe ser de al menos 1.");
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: "" }).capacity).not.toBeNull();
    expect(validateGenerate({ startTime: "09:00", endTime: "10:00", maxCapacity: "6" }).capacity).toBeNull();
  });
});

describe("previewMonths", () => {
  it("arma cada mes de lunes a domingo con huecos al inicio", () => {
    const [sep] = previewMonths([new Date(2026, 8, 29), new Date(2026, 8, 30)]);
    expect(sep.label).toBe("septiembre 2026");
    // 1 de septiembre de 2026 es martes: un hueco (lunes) antes.
    expect(sep.cells[0]).toBeNull();
    expect(sep.cells[1]?.getDate()).toBe(1);
  });
  it("un rango que cruza meses da dos meses; sin fechas, ninguno", () => {
    expect(previewMonths([new Date(2026, 8, 30), new Date(2026, 9, 1)]).map((m) => m.key)).toEqual(["2026-09", "2026-10"]);
    expect(previewMonths([])).toEqual([]);
  });
});
