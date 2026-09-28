import { test } from "node:test";
import assert from "node:assert/strict";
import { planWeekClear, weekRangeProblem } from "./weekClear.js";

test("clasifica: vacías se borran, empezadas y canceladas se quedan, el resto se cancela", () => {
  const plan = planWeekClear([
    { id: "vacia", total_bookings: 0, active_bookings: 0, started: false, status: "scheduled" },
    { id: "vacia-pasada", total_bookings: 0, active_bookings: 0, started: true, status: "scheduled" },
    { id: "con-reservas", total_bookings: 3, active_bookings: 2, started: false, status: "scheduled" },
    { id: "solo-historial", total_bookings: 1, active_bookings: 0, started: false, status: "closed" },
    { id: "ya-paso", total_bookings: 4, active_bookings: 4, started: true, status: "scheduled" },
    { id: "cancelada", total_bookings: 2, active_bookings: 0, started: false, status: "cancelled" },
  ]);
  // Empezada (o pasada) siempre se conserva, aunque esté vacía: "Limpiar
  // semana" nunca toca lo que ya ocurrió (ruling R4).
  assert.deepEqual(plan, {
    delete: ["vacia"],
    cancel: ["con-reservas", "solo-historial"],
    keep: ["vacia-pasada", "ya-paso", "cancelada"],
    activeBookings: 2,
  });
});

test("rango", () => {
  assert.equal(weekRangeProblem("2026-09-21", "2026-09-27"), null);
  assert.match(weekRangeProblem(null, "2026-09-27"), /requeridos/);
  assert.match(weekRangeProblem("2026-09-21", "basura"), /inválidas/);
  assert.match(weekRangeProblem("2026-09-27", "2026-09-21"), /inválido/);
  assert.match(weekRangeProblem("2026-01-01", "2026-03-01"), /31 días/);
  assert.equal(weekRangeProblem("2026-09-01", "2026-10-01"), null, "31 días exactos");
});
