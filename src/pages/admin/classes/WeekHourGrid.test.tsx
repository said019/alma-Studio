import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WeekHourGrid, { HOUR_PX, hourRange, placeBlocks, type GridClass } from "./WeekHourGrid";

const g = (id: string, start: string, end: string, extra: Partial<GridClass> = {}): GridClass => ({
  id, classTypeName: id, instructorName: "Fer", startTime: `2026-09-25T${start}:00`, endTime: `2026-09-25T${end}:00`,
  maxCapacity: 8, currentBookings: 3, isCancelled: false, isClosed: false, ...extra,
});

describe("hourRange", () => {
  it("de 7 a 21 por defecto y se abre si hay clases fuera", () => {
    expect(hourRange([])).toEqual({ from: 7, to: 21 });
    expect(hourRange([g("a", "06:00", "06:50")]).from).toBe(6);
    expect(hourRange([g("a", "21:30", "22:20")]).to).toBe(23);
  });
});

describe("placeBlocks", () => {
  it("posición y alto según la hora", () => {
    const [p] = placeBlocks([g("a", "11:00", "11:50")], 7);
    expect(p.top).toBe(4 * HOUR_PX + 2);
    expect(p.height).toBeCloseTo((50 / 60) * HOUR_PX - 4);
    expect(p.lanes).toBe(1);
  });
  it("una clase de 50 minutos mide al menos 44 px de alto (área de toque)", () => {
    const [p] = placeBlocks([g("a", "11:00", "11:50")], 7);
    expect(p.height).toBeGreaterThanOrEqual(44);
  });
  it("dos clases a la misma hora van lado a lado", () => {
    const ps = placeBlocks([g("a", "11:00", "11:50"), g("b", "11:00", "11:50"), g("c", "13:00", "13:50")], 7);
    const byId = Object.fromEntries(ps.map((p) => [p.cls.id, p]));
    expect([byId.a.lane, byId.b.lane].sort()).toEqual([0, 1]);
    expect(byId.a.lanes).toBe(2);
    expect(byId.c.lanes).toBe(1);
  });
  it("una hora de fin inválida no rompe el acomodo", () => {
    const [p] = placeBlocks([g("a", "11:00", "11:50", { endTime: "" })], 7);
    expect(p.height).toBeGreaterThan(20);
  });
});

describe("WeekHourGrid", () => {
  const days = [new Date(2026, 8, 25)];
  it("sobrecupo: se marca llena sin tronar; cancelada lo dice", () => {
    const onSelect = vi.fn();
    render(
      <WeekHourGrid
        days={days}
        now={new Date(2026, 8, 25, 10, 40)}
        classes={[g("Reformer Intermedio", "11:00", "11:50", { currentBookings: 9 }), g("Mat", "20:00", "20:50", { isCancelled: true })]}
        onSelect={onSelect}
        onCreate={() => {}}
      />,
    );
    const llena = screen.getByRole("button", { name: /Reformer Intermedio.*9 de 8, llena/ });
    expect(llena).toHaveTextContent("11:00 · Llena");
    fireEvent.click(llena);
    expect(onSelect).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Mat.*cancelada/ })).toHaveTextContent("Cancelada");
  });
  it("el + del día crea una clase en esa fecha", () => {
    const onCreate = vi.fn();
    render(<WeekHourGrid days={days} now={new Date(2026, 8, 25, 10, 40)} classes={[]} onSelect={() => {}} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: /Nueva clase el viernes 25/ }));
    expect(onCreate).toHaveBeenCalledWith("2026-09-25");
  });
});
