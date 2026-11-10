// Recordatorio de clase por WhatsApp (~2 h antes) más la sincronización del
// pase, reserva por reserva. Vive fuera de server/index.js para poder probarlo
// contra la base sin arrancar el cron (auditoría 2026-09-27, P0-1).
//
// La bitácora es wallet_notification_logs con reason = class_reminder_<booking>
// y detail.source = 'class_reminder_cron'. La sincronización del pase escribe
// en la misma tabla con la misma reason (persistWalletNotificationLog, casi
// siempre con status 'ok'), así que las filas propias se distinguen por source:
// sin ese filtro, el 'ok' del pase cuenta como "recordatorio ya enviado" y no
// se reintenta cuando el canal vuelve.
export const REMINDER_CLAIMS_SCHEMA = `CREATE TABLE IF NOT EXISTS class_reminder_claims (
 user_id UUID NOT NULL, reason TEXT NOT NULL, claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id,reason)
);`;
export const reminderLeadMinutes = hours => {
 const value = Number(hours ?? 2);
 return Math.round(Math.min(4320, Math.max(15, Number.isFinite(value) ? value * 60 : 120)));
};
export const reminderWindowSql = (timezone) => `(c.date + c.start_time) AT TIME ZONE '${timezone}'
 BETWEEN NOW() + ($1::int-2) * INTERVAL '1 minute' AND NOW() + $1::int * INTERVAL '1 minute'`;
export const REMINDER_SOURCE = "class_reminder_cron";

/** Bitácora del recordatorio sobre wallet_notification_logs. */
export function pgReminderLog(db) {
  return {
    async claim(userId, reason) {
      const r = await db.query(`INSERT INTO class_reminder_claims(user_id,reason) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING reason`,[userId,reason]);
      return r.rowCount === 1;
    },
    async release(userId, reason) {
      await db.query('DELETE FROM class_reminder_claims WHERE user_id=$1 AND reason=$2',[userId,reason]);
    },
    /** Estados ya registrados por el recordatorio para esta reserva. */
    async seen(userId, reason) {
      const r = await db.query(
        `SELECT DISTINCT status FROM wallet_notification_logs
          WHERE user_id = $1 AND reason = $2 AND detail->>'source' = $3`,
        [userId, reason, REMINDER_SOURCE],
      );
      return new Set(r.rows.map((x) => x.status));
    },
    async add(userId, reason, status, why) {
      await db.query(
        `INSERT INTO wallet_notification_logs (user_id, reason, status, detail)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [userId, reason, status, JSON.stringify({ source: REMINDER_SOURCE, reason: why ?? null })],
      ).catch((e) => console.error("[Cron] class_reminder log:", e?.message));
    },
  };
}

/**
 * @param rows reservas en la ventana: { booking_id, user_id, class_name, start_time }
 * @param deps.log          bitácora ({ seen, add }), ver pgReminderLog
 * @param deps.remindersOn  ajuste whatsapp_reminders de la dueña
 * @param deps.channelState () => Promise<{ connected, state }>
 * @param deps.notify       (row) => Promise<{ sent, reason }>, el envío por WhatsApp
 * @param deps.syncPass     (userId, reason) => void, sincroniza el pase de wallet
 * @param deps.pauseMs      espera entre envíos (límite de Evolution)
 */
export async function sendClassReminders(rows, { log, remindersOn, channelState, notify, syncPass, pauseMs = 400 }) {
  if (!rows?.length) return;
  // Ajustes y canal se leen una vez por corrida. Con los avisos apagados por
  // la dueña no se sondea el canal ni se registra nada del WhatsApp.
  const channel = remindersOn ? await channelState() : { connected: false, state: "disabled" };

  for (const row of rows) {
    const reason = `class_reminder_${row.booking_id}`;

    // Sólo un envío 'ok' cierra la reserva: un 'skipped_disconnected' o un
    // 'failed' se reintenta en la siguiente corrida si el canal vuelve.
    const seen = await log.seen(row.user_id, reason);
    if (seen.has("ok")) continue;

    // El pase no depende de WhatsApp: se sincroniza aunque el canal esté
    // caído o los avisos apagados. Una vez por reserva y corrida.
    syncPass(row.user_id, reason);

    if (!remindersOn) continue;

    if (!channel.connected) {
      // Una sola fila por reserva: sin esto cada corrida (cada 10 min dentro
      // de la ventana de 30) sumaba otra al historial.
      if (!seen.has("skipped_disconnected")) {
        await log.add(row.user_id, reason, "skipped_disconnected", "channel_disconnected");
      }
      continue;
    }

    // Durable claim prevents overlap across processes and survives a restart.
    // An ambiguous network failure keeps the claim: do not risk sending twice.
    if (!(await log.claim(row.user_id, reason))) continue;
    const r = await Promise.resolve()
      .then(() => notify(row))
      .catch((e) => ({ sent: false, reason: "exception", error: e?.message }));
    const definitelyNotSent = new Set(['whatsapp_disabled','template_disabled','nonessential_disabled','no_phone','user_not_found','user_opted_out','empty_message','evolution_not_configured','missing_arg']);
    if (!r?.sent && definitelyNotSent.has(r?.reason)) await log.release(row.user_id, reason);
    await log.add(row.user_id, reason, r?.sent ? "ok" : "failed", r?.reason);

    if (pauseMs > 0) await new Promise((res) => setTimeout(res, pauseMs));
  }
}
