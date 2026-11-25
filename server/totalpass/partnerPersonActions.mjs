import { decryptCredentials } from './partnerConfiguration.mjs';
import { createTotalpassAdapter } from './partnerTotalpass.mjs';

const statuses = { cancel: 'cancelled', checkin: 'checked_in', no_show: 'no_show' };
const fail = (message, status = 409) => Object.assign(new Error(message), { status });
const safeError = e => [e?.code, e?.message].find(v => /^[A-Z][A-Z0-9_]{2,80}$/.test(v || '')) || 'PARTNER_ACTION_UNVERIFIED';

export function createPartnerPersonActions({ pool, secret, adapters = { totalpass: createTotalpassAdapter } }) {
  return async function act(bookingId, action) {
    if (!Object.hasOwn(statuses, action) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) throw fail('Acción o reserva inválida.', 400);
    const db = await pool.connect(); let provider, locked = false, intent = false;
    try {
      const identity = (await db.query('SELECT class_id,partner_provider FROM bookings WHERE id=$1', [bookingId])).rows[0];
      if (!identity) throw fail('Reserva no encontrada.', 404);
      provider = identity.partner_provider;
      if (provider !== 'totalpass') throw fail('Esta acción sólo admite reservas de plataforma.');
      locked = (await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`hive:partner-runtime:${provider}`])).rows[0].locked;
      if (!locked) throw fail('La plataforma está sincronizando. Intenta de nuevo en un momento.');
      await db.query('BEGIN');
      const c = (await db.query('SELECT id,status,date::text FROM classes WHERE id=$1 FOR UPDATE', [identity.class_id])).rows[0];
      const b = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
      if (!b || b.class_id !== identity.class_id || b.partner_provider !== provider || b.user_id || b.membership_id || !b.partner_external_id) throw fail('La reserva requiere revisión antes de modificarla.');
      if (provider === 'totalpass' && action === 'checkin') throw fail('TotalPass confirma la asistencia mediante su check-in y webhook. No admite check-in manual.');
      const scope = action === 'no_show' ? 'local' : 'provider';
      const message = scope === 'local' ? 'Inasistencia registrada sólo en HIVE, sin multa ni cambio en TotalPass.' : 'Cancelación confirmada en TotalPass.';
      const previous = b.partner_metadata?.personAction;
      if (previous?.state === 'verified' && previous.action === action && b.status === statuses[action]) {
        await db.query('COMMIT'); return { id: bookingId, action, status: b.status, scope, message };
      }
      const reconciling = previous && ['pending', 'uncertain'].includes(previous.state) && previous.action === action && scope === 'provider';
      if (c?.status === 'cancelled' || (!['confirmed', 'checked_in'].includes(b.status) && !(reconciling && b.status === statuses[action]))) throw fail('La reserva o clase ya no admite esta acción.');
      if (action === 'cancel' && b.status === 'checked_in') throw fail('No se puede cancelar una reserva con asistencia registrada.');
      const link = (await db.query('SELECT external_id FROM partner_class_links WHERE provider=$1 AND class_id=$2', [provider, b.class_id])).rows[0];
      if (!link?.external_id) throw fail('Falta verificar la clase de esta reserva en la plataforma.');
      let adapter, result;
      const remote = { externalId: b.partner_external_id, classExternalId: link.external_id, date: c.date };
      if (scope === 'provider') {
        const config = (await db.query('SELECT * FROM partner_integration_config WHERE provider=$1', [provider])).rows[0];
        if (config?.connection_status !== 'verified') throw fail('Verifica primero la conexión de la plataforma.');
        adapter = adapters[provider]({ credentials: decryptCredentials(provider, config.credentials_encrypted, secret), unitId: config.config.bookingUnitId ?? config.config.unitId, config: config.config });
      }
      if (previous && ['pending', 'uncertain'].includes(previous.state)) {
        if (previous.action !== action || scope !== 'provider') throw fail('Hay una acción pendiente de verificar. Revisa la plataforma antes de continuar.');
        const snapshot = await adapter.catalog({ from: c.date, to: c.date });
        const observed = snapshot.bookings?.find(x => x.externalId === remote.externalId && x.classExternalId === remote.classExternalId);
        // An absent row cannot resolve an uncertain deletion without explicit evidence.
        if (!snapshot.complete || !observed || observed.status !== statuses[action]) throw fail('El resultado anterior sigue sin confirmarse. Revisa la plataforma; no se repitió la acción.');
        result = { status: observed.status, snapshot };
      }
      const record = { action, scope, state: 'pending', startedAt: new Date().toISOString() };
      await db.query(`UPDATE bookings SET partner_metadata=COALESCE(partner_metadata,'{}'::jsonb)||jsonb_build_object('personAction',$2::jsonb),updated_at=NOW() WHERE id=$1`, [bookingId, JSON.stringify(record)]);
      await db.query('COMMIT'); intent = true;
      await db.query('BEGIN');
      const fresh = (await db.query('SELECT status FROM classes WHERE id=$1 FOR UPDATE', [b.class_id])).rows[0];
      if (fresh.status === 'cancelled') throw fail('La clase fue cancelada mientras se preparaba la acción.');
      const freshBooking = (await db.query('SELECT * FROM bookings WHERE id=$1 FOR UPDATE', [bookingId])).rows[0];
      if (!freshBooking || freshBooking.user_id || freshBooking.membership_id || freshBooking.class_id !== b.class_id || freshBooking.partner_provider !== provider || freshBooking.partner_external_id !== b.partner_external_id || freshBooking.status !== b.status) throw fail('La reserva cambió mientras se preparaba la acción. Actualiza la agenda y revisa su estado.');
      if (scope === 'provider' && !result) result = await (action === 'cancel' ? adapter.cancelBooking(remote) : action === 'checkin' ? adapter.markAttendance(remote) : adapter.markNoAttendance(remote));
      if (scope === 'provider' && result?.status !== statuses[action]) throw fail('La plataforma no confirmó la acción.');
      const metadata = { ...freshBooking.partner_metadata, personAction: { ...record, state: 'verified', verifiedAt: new Date().toISOString() }, ...(action === 'checkin' ? { checkinSource: 'fitpass_staff_verified', attendanceTimeKnown: false, attendanceVerifiedAt: new Date().toISOString() } : {}), ...(action === 'no_show' ? { noShowRecordedAt: new Date().toISOString() } : {}), ...(scope === 'local' ? { localPartnerOverride: { status: statuses[action], action, scope, at: new Date().toISOString() } } : {}) };
      await db.query(`UPDATE bookings SET status=$2::text::booking_status,partner_metadata=$3,
        cancelled_at=CASE WHEN $2::text='cancelled' THEN COALESCE(cancelled_at,NOW()) ELSE cancelled_at END,
        checked_in_at=CASE WHEN $2::text='checked_in' THEN COALESCE(checked_in_at,NOW()) ELSE checked_in_at END,updated_at=NOW() WHERE id=$1`, [bookingId, statuses[action], metadata]);
      const observedClass = result?.snapshot?.classes?.find(x => x.externalId === link.external_id);
      if (observedClass && Number.isSafeInteger(observedClass.booked) && observedClass.booked >= 0) await db.query('UPDATE partner_class_links SET remote_booked=$3,updated_at=NOW() WHERE provider=$1 AND class_id=$2', [provider, b.class_id, observedClass.booked]);
      await db.query(`UPDATE classes SET current_bookings=(SELECT COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND NULLIF(guest_name,'') IS NOT NULL THEN 2 ELSE 1 END),0) FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')),updated_at=NOW() WHERE id=$1`, [b.class_id]);
      await db.query('SELECT queue_partner_shared_sync()');
      await db.query('COMMIT'); intent = false;
      return { id: bookingId, action, status: statuses[action], scope, message };
    } catch (e) {
      await db.query('ROLLBACK');
      if (intent) await db.query(`UPDATE bookings SET partner_metadata=jsonb_set(partner_metadata,'{personAction}',COALESCE(partner_metadata->'personAction','{}'::jsonb)||$2::jsonb),updated_at=NOW() WHERE id=$1`, [bookingId, JSON.stringify({ state: 'uncertain', error: safeError(e) })]);
      throw e.status ? e : fail('No se pudo confirmar la acción. Revisa la plataforma antes de intentar de nuevo.');
    } finally {
      if (locked) await db.query('SELECT pg_advisory_unlock(hashtext($1))', [`hive:partner-runtime:${provider}`]);
      db.release();
    }
  };
}

export function installPartnerPersonActions(app, options) {
  const act = createPartnerPersonActions(options);
  app.post('/api/admin/partner-bookings/:id/action', options.adminMiddleware, async (req, res) => {
    try {
      if (!req.body || Object.keys(req.body).some(k => k !== 'action')) throw fail('Sólo se admite el campo action.', 400);
      const data = await act(req.params.id, req.body.action);
      res.json({ data, message: data.message });
    } catch (e) { res.status(e.status || 500).json({ message: e.status ? e.message : 'No se pudo procesar la acción.' }); }
  });
}
