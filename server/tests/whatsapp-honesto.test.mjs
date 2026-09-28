// P0-1 · WhatsApp honesto: con Evolution sin configurar (como en producción
// hoy y en esta base de prueba, EVOLUTION_API_URL vacío) cancelar una clase
// NO debe contar los avisos como enviados — deben quedar en wa_unreached
// para que recepción avise a mano. Auditoría 2026-09-27.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, studioFixtures, makeClass, makeClient, giveMembership, cleanup, closeDb, day, ADMIN } from "./helpers.mjs";
import { pgReminderLog, sendClassReminders } from "../lib/classReminder.js";

const PFX = "rgwa";
let A, f;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  f = await studioFixtures(PFX, A);
});
after(async () => {
  await sql(`DELETE FROM wallet_notification_logs WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${PFX}%`]);
  await cleanup(PFX);
  await closeDb();
});

test("P0-1 cancelar una clase con Evolution sin configurar no cuenta wa_sent: todas quedan en wa_unreached", async () => {
  const c1 = await makeClient(PFX, "c1");
  const c2 = await makeClient(PFX, "c2");
  await giveMembership(A, c1.id, f.plan.id, 8);
  await giveMembership(A, c2.id, f.plan.id, 8);
  const id = await makeClass(A, f, { date: day(8) });
  const r1 = await api("POST", "/api/bookings", { token: c1.token, body: { classId: id } });
  const r2 = await api("POST", "/api/bookings", { token: c2.token, body: { classId: id } });
  assert.equal(r1.status, 201, `reserva 1 devolvió ${r1.status}`);
  assert.equal(r2.status, 201, `reserva 2 devolvió ${r2.status}`);

  const cancel = await api("PUT", `/api/classes/${id}/cancel`, { token: A, body: {} });
  assert.equal(cancel.status, 200, `cancelar devolvió ${cancel.status}: ${JSON.stringify(cancel.body).slice(0, 200)}`);
  const d = cancel.body.data;

  assert.equal(d.wa_queued, 0, "sin Evolution configurado no debe quedar nada en cola");
  assert.equal(d.wa_failed, 2, "las 2 alumnas con reserva viva deben quedar sin notificar");
  assert.equal(d.wa_unreached.length, 2, "wa_unreached debe traer a las 2 alumnas");
  const ids = d.wa_unreached.map((u) => u.user_id).sort();
  assert.deepEqual(ids, [c1.id, c2.id].sort());
  for (const u of d.wa_unreached) {
    assert.ok("display_name" in u && "phone" in u, "cada elemento trae display_name y phone");
  }
  assert.ok(!("wa_sent" in d), "wa_sent ya no debe existir en la respuesta");
});

// Cron de recordatorios (server/lib/classReminder.js) contra la tabla real.
const reminderRows = (users) => users.map((u) => ({
  booking_id: `${PFX}-${u.id}`, user_id: u.id, class_name: "Reformer", start_time: "11:00:00",
}));
const cronDeps = ({ connected, notify = async () => ({ sent: true }), syncPass = () => {} }) => ({
  log: pgReminderLog({ query: async (q, p) => ({ rows: await sql(q, p) }) }),
  remindersOn: true,
  pauseMs: 0,
  channelState: async () => ({ connected, state: connected ? "connected" : "disconnected" }),
  notify,
  syncPass,
});

test("cron de recordatorios con el canal caído dos corridas: una sola fila skipped_disconnected por reserva", async () => {
  const c = await makeClient(PFX, "cron1");
  const rows = reminderRows([c]);
  await sendClassReminders(rows, cronDeps({ connected: false }));
  await sendClassReminders(rows, cronDeps({ connected: false }));
  const logs = await sql(
    `SELECT status FROM wallet_notification_logs WHERE user_id = $1 AND reason = $2`,
    [c.id, `class_reminder_${rows[0].booking_id}`],
  );
  assert.deepEqual(logs.map((l) => l.status), ["skipped_disconnected"]);
});

test("cron de recordatorios: la bitácora del pase (misma reason, status ok) no bloquea el reintento cuando vuelve el canal", async () => {
  const c = await makeClient(PFX, "cron2");
  const rows = reminderRows([c]);
  const reason = `class_reminder_${rows[0].booking_id}`;
  // La sincronización del pase deja su propia fila 'ok' con la misma reason
  // (persistWalletNotificationLog en server/index.js).
  const pendientes = [];
  const syncPass = (userId, why) => pendientes.push(sql(
    `INSERT INTO wallet_notification_logs (user_id, reason, status, detail) VALUES ($1, $2, 'ok', $3::jsonb)`,
    [userId, why, JSON.stringify({ apple: { reason: "apns_not_configured" }, google: { reason: "google_wallet_not_configured" } })],
  ));
  await sendClassReminders(rows, cronDeps({ connected: false, syncPass }));
  await Promise.all(pendientes);

  const enviados = [];
  await sendClassReminders(rows, cronDeps({ connected: true, notify: async (row) => { enviados.push(row.booking_id); return { sent: true }; } }));
  assert.deepEqual(enviados, [rows[0].booking_id], "con el canal de vuelta se debe intentar el envío");
  const [propias] = await sql(
    `SELECT count(*)::int n FROM wallet_notification_logs
      WHERE user_id = $1 AND reason = $2 AND status = 'ok' AND detail->>'source' = 'class_reminder_cron'`,
    [c.id, reason],
  );
  assert.equal(propias.n, 1, "queda registrado el envío ok del recordatorio");
});
