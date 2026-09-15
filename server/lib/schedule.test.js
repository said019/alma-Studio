// Jobs a hora de reloj. Auditoría de zona, 2026-09-15.
import { test } from "node:test";
import assert from "node:assert/strict";
import { msUntilNext, describeNext, scheduleAt } from "./schedule.js";

const en = (iso) => new Date(iso); // el proceso corre en hora del estudio

test("diario: si aún no es la hora, espera a hoy", () => {
  const ms = msUntilNext({ hour: 9, minute: 0 }, en("2026-09-15T07:30:00"));
  assert.equal(ms, 90 * 60 * 1000, "de 07:30 a 09:00 hay 90 minutos");
});

test("diario: si ya pasó la hora, espera a mañana", () => {
  const ms = msUntilNext({ hour: 9, minute: 0 }, en("2026-09-15T09:30:00"));
  assert.equal(ms, 23.5 * 60 * 60 * 1000, "de 09:30 a las 09:00 del día siguiente");
});

test("diario: justo en la hora exacta, agenda mañana (no re-dispara)", () => {
  const ms = msUntilNext({ hour: 9, minute: 0 }, en("2026-09-15T09:00:00.000"));
  assert.equal(ms, 24 * 60 * 60 * 1000, "no debe disparar dos veces el mismo minuto");
});

test("semanal: domingo 08:00 desde un martes", () => {
  const martes = en("2026-09-15T10:00:00"); // 2026-09-15 es martes
  assert.equal(martes.getDay(), 2, "la fixture debe ser martes");
  const ms = msUntilNext({ hour: 8, minute: 0, weekday: 0 }, martes);
  const cuando = new Date(martes.getTime() + ms);
  assert.equal(cuando.getDay(), 0, "debe caer en domingo");
  assert.equal(cuando.getHours(), 8);
  assert.equal(cuando.getDate(), 20, "el domingo siguiente es el 20");
});

test("semanal: el mismo domingo antes de la hora, espera a hoy", () => {
  const domingo = en("2026-09-20T06:00:00");
  assert.equal(domingo.getDay(), 0);
  const ms = msUntilNext({ hour: 8, minute: 0, weekday: 0 }, domingo);
  assert.equal(ms, 2 * 60 * 60 * 1000, "faltan 2 horas");
});

test("semanal: el mismo domingo después de la hora, espera 7 días", () => {
  const domingo = en("2026-09-20T09:00:00");
  const ms = msUntilNext({ hour: 8, minute: 0, weekday: 0 }, domingo);
  const cuando = new Date(domingo.getTime() + ms);
  assert.equal(cuando.getDate(), 27, "el domingo siguiente");
});

test("la espera nunca excede el máximo de setTimeout", () => {
  for (const h of [0, 8, 9, 23]) {
    for (const w of [null, 0, 6]) {
      const ms = msUntilNext({ hour: h, minute: 0, weekday: w }, en("2026-09-15T12:00:00"));
      assert.ok(ms > 0 && ms <= 7 * 24 * 60 * 60 * 1000, `espera fuera de rango: ${ms}`);
      assert.ok(ms < 2 ** 31 - 1, "setTimeout desborda arriba de 2^31-1 ms y dispararía de inmediato");
    }
  }
});

test("describeNext dice cuándo corre, en español y hora local", () => {
  const txt = describeNext({ hour: 9, minute: 0 }, en("2026-09-15T07:30:00"));
  assert.match(txt, /09:00/, `debe mostrar la hora: ${txt}`);
});

test("scheduleAt dispara a su hora y se reagenda solo", async () => {
  // Se agenda para el minuto siguiente y se adelanta el reloj con timers falsos.
  const { mock } = await import("node:test");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date("2026-09-15T08:59:30").getTime() });
  try {
    const corridas = [];
    const silencio = { log() {}, error() {} };
    const cancelar = scheduleAt("prueba", { hour: 9, minute: 0 }, () => { corridas.push(Date.now()); }, { logger: silencio });
    assert.equal(corridas.length, 0, "no debe correr antes de su hora");
    mock.timers.tick(30 * 1000);            // llega 09:00
    await Promise.resolve();
    assert.equal(corridas.length, 1, "debe correr a las 09:00");
    mock.timers.tick(23 * 60 * 60 * 1000);  // 08:00 del día siguiente
    await Promise.resolve();
    assert.equal(corridas.length, 1, "no debe repetir antes de las 09:00 del día siguiente");
    mock.timers.tick(60 * 60 * 1000);       // 09:00 del día siguiente
    await Promise.resolve();
    assert.equal(corridas.length, 2, "debe reagendarse para el día siguiente");
    cancelar();
  } finally { mock.timers.reset(); }
});

test("un job que revienta no mata la agenda", async () => {
  const { mock } = await import("node:test");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date("2026-09-15T08:59:30").getTime() });
  try {
    let intentos = 0;
    const silencio = { log() {}, error() {} };
    const cancelar = scheduleAt("explota", { hour: 9, minute: 0 }, () => {
      intentos++; throw new Error("boom");
    }, { logger: silencio });
    mock.timers.tick(30 * 1000);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(intentos, 1);
    mock.timers.tick(24 * 60 * 60 * 1000);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(intentos, 2, "tras fallar debe volver a agendarse");
    cancelar();
  } finally { mock.timers.reset(); }
});

test("cancelar detiene la agenda", async () => {
  const { mock } = await import("node:test");
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: new Date("2026-09-15T08:59:30").getTime() });
  try {
    let n = 0;
    const silencio = { log() {}, error() {} };
    const cancelar = scheduleAt("cancelable", { hour: 9, minute: 0 }, () => { n++; }, { logger: silencio });
    cancelar();
    mock.timers.tick(48 * 60 * 60 * 1000);
    await Promise.resolve();
    assert.equal(n, 0, "cancelado no debe correr");
  } finally { mock.timers.reset(); }
});
