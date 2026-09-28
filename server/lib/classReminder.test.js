import { test } from "node:test";
import assert from "node:assert/strict";
import { sendClassReminders } from "./classReminder.js";

// Bitácora en memoria: sólo las filas propias del recordatorio.
function memoryLog() {
  const rows = [];
  return {
    rows,
    async seen(userId, reason) {
      return new Set(rows.filter((r) => r.userId === userId && r.reason === reason).map((r) => r.status));
    },
    async add(userId, reason, status, why) { rows.push({ userId, reason, status, why }); },
  };
}

const ROWS = [
  { booking_id: "b1", user_id: "u1", class_name: "Reformer", start_time: "11:00:00" },
  { booking_id: "b2", user_id: "u2", class_name: "Reformer", start_time: "11:00:00" },
];

function deps({ log, connected = false, remindersOn = true, sent = true } = {}) {
  const calls = { notify: [], sync: [], probe: 0 };
  return {
    calls,
    opts: {
      log,
      remindersOn,
      pauseMs: 0,
      channelState: async () => { calls.probe++; return { connected, state: connected ? "connected" : "disconnected" }; },
      notify: async (row) => { calls.notify.push(row.booking_id); return { sent, reason: sent ? null : "send_failed" }; },
      syncPass: (userId, reason) => calls.sync.push(`${userId}:${reason}`),
    },
  };
}

test("canal caído dos corridas seguidas: una sola fila skipped_disconnected por reserva", async () => {
  const log = memoryLog();
  await sendClassReminders(ROWS, deps({ log }).opts);
  await sendClassReminders(ROWS, deps({ log }).opts);
  const skipped = log.rows.filter((r) => r.status === "skipped_disconnected");
  assert.equal(skipped.length, 2, `esperaba 1 fila por reserva, hay ${JSON.stringify(log.rows)}`);
  assert.deepEqual(skipped.map((r) => r.reason).sort(), ["class_reminder_b1", "class_reminder_b2"]);
});

test("canal caído: el pase se sincroniza igual, una vez por reserva y corrida", async () => {
  const log = memoryLog();
  const d = deps({ log });
  await sendClassReminders(ROWS, d.opts);
  assert.deepEqual(d.calls.sync, ["u1:class_reminder_b1", "u2:class_reminder_b2"]);
  assert.deepEqual(d.calls.notify, [], "con el canal caído no se intenta el envío");
});

test("canal conectado: envía, registra ok y sincroniza el pase una sola vez por reserva", async () => {
  const log = memoryLog();
  const d = deps({ log, connected: true });
  await sendClassReminders(ROWS, d.opts);
  assert.deepEqual(d.calls.notify, ["b1", "b2"]);
  assert.deepEqual(d.calls.sync, ["u1:class_reminder_b1", "u2:class_reminder_b2"]);
  assert.deepEqual(log.rows.map((r) => r.status), ["ok", "ok"]);
});

test("el canal vuelve dentro de la ventana: se reintenta el envío tras skipped_disconnected", async () => {
  const log = memoryLog();
  await sendClassReminders(ROWS, deps({ log }).opts);
  const d = deps({ log, connected: true });
  await sendClassReminders(ROWS, d.opts);
  assert.deepEqual(d.calls.notify, ["b1", "b2"]);
  assert.equal(log.rows.filter((r) => r.status === "ok").length, 2);
});

test("ya enviado (ok): la siguiente corrida no reenvía ni vuelve a sincronizar el pase", async () => {
  const log = memoryLog();
  await sendClassReminders(ROWS, deps({ log, connected: true }).opts);
  const d = deps({ log, connected: true });
  await sendClassReminders(ROWS, d.opts);
  assert.deepEqual(d.calls.notify, []);
  assert.deepEqual(d.calls.sync, []);
});

test("avisos apagados por la dueña: sin WhatsApp ni fila failed, con el pase sincronizado", async () => {
  const log = memoryLog();
  const d = deps({ log, connected: true, remindersOn: false });
  await sendClassReminders(ROWS, d.opts);
  assert.deepEqual(d.calls.notify, [], "no se llama al envío");
  assert.equal(log.rows.filter((r) => r.status === "failed").length, 0, "no se registra failed");
  assert.deepEqual(d.calls.sync, ["u1:class_reminder_b1", "u2:class_reminder_b2"]);
  assert.equal(d.calls.probe, 0, "no hace falta sondear el canal");
});
