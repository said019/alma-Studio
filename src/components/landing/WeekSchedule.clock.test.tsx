import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WeekSchedule } from "./WeekSchedule";
import { weekDays, type LandingClass } from "./landingData";

const cls = (id: string, day: string, bookingClosed = false, remaining = 6): LandingClass => ({ id, day, start: "10:00", end: "10:50", name: "Reformer", coach: "Ana", durationMin: 50, capacity: 6, remaining, bookingClosed });
const base = { loading: false, error: false, onRetry: () => {} };
describe("calendario al avanzar el reloj", () => {
  it("revalida el día elegido al cambiar de semana", () => {
    const first = weekDays(new Date(2026, 8, 21));
    const next = weekDays(new Date(2026, 8, 28));
    const { rerender } = render(<MemoryRouter><WeekSchedule {...base} days={first} todayIso="2026-09-23" classes={[cls("old", "2026-09-24")]} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "JUE 24" }));
    rerender(<MemoryRouter><WeekSchedule {...base} days={next} todayIso="2026-09-27" classes={[cls("new", "2026-09-28")]} /></MemoryRouter>);
    expect(screen.getByRole("button", { pressed: true })).toHaveAccessibleName("LUN 28");
    expect(screen.getByRole("link", { name: /Reservar/ })).toHaveAttribute("href", "/app/classes/new");
  });
  it.each([0, 6])("no ofrece reserva ni lista dentro del cierre con %i lugares", (remaining) => {
    render(<MemoryRouter><WeekSchedule {...base} days={weekDays(new Date(2026, 8, 21))} todayIso="2026-09-23" classes={[cls("closed", "2026-09-23", true, remaining)]} /></MemoryRouter>);
    expect(screen.getByText("Reservas cerradas")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Reservar|Lista de espera/ })).toBeNull();
  });
});
