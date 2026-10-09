import { assertClassActor } from './classAdminWrites.js';
import { isUuid } from './validate.js';

const FIELDS = { classTypeId: 'class_type_id', instructorId: 'instructor_id', maxCapacity: 'max_capacity', startTime: 'start_time', endTime: 'end_time', notes: 'notes', status: 'status' };
const timeValid = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const failure = (message, status = 400, conflicts = []) => Object.assign(new Error(message), { status, conflicts });
export function validateBulkClassInput(body) {
  if (!body || !Array.isArray(body.classIds) || body.classIds.length < 1 || body.classIds.length > 200 || body.classIds.some(id => typeof id !== 'string' || !isUuid(id))) throw failure('Selecciona entre 1 y 200 clases válidas.');
  const ids = body.classIds.map(id => id.toLowerCase());
  if (new Set(ids).size !== ids.length) throw failure('La selección contiene clases repetidas.');
  const c = body.changes;
  if (!c || typeof c !== 'object' || Array.isArray(c) || !Object.keys(c).length || Object.keys(c).some(k => !Object.hasOwn(FIELDS, k))) throw failure('Indica al menos un cambio válido.');
  for (const key of ['classTypeId', 'instructorId']) if (Object.hasOwn(c, key) && (typeof c[key] !== 'string' || !isUuid(c[key]))) throw failure('Selecciona una disciplina e instructora válidas.');
  if (Object.hasOwn(c, 'maxCapacity') && (!Number.isInteger(c.maxCapacity) || c.maxCapacity < 1 || c.maxCapacity > 1000)) throw failure('El cupo debe ser un entero entre 1 y 1000.');
  for (const key of ['startTime', 'endTime']) if (Object.hasOwn(c, key) && !timeValid(c[key])) throw failure('Usa horas válidas en formato HH:mm.');
  if (Object.hasOwn(c, 'notes') && (typeof c.notes !== 'string' || c.notes.length > 2000)) throw failure('Las notas deben tener máximo 2000 caracteres.');
  if (Object.hasOwn(c, 'status') && !['scheduled', 'closed'].includes(c.status)) throw failure('Sólo puedes abrir o cerrar reservas; cancelar tiene su propia operación.');
  const changes = Object.fromEntries(Object.entries(c).map(([key, value]) => [FIELDS[key], key.endsWith('Id') ? value.toLowerCase() : value]));
  return { ids: ids.sort(), changes };
}

export function assessBulkClasses({ ids, rows, changes, now, occupied = {}, reserved = {}, otherClasses = [] }) {
  const conflicts = [];
  const candidates = [];
  const conflict = (id, message) => conflicts.push({ id, message });
  for (const id of ids) {
    const row = rows.find(r => r.id === id);
    if (!row) { conflict(id, 'Clase no encontrada.'); continue; }
    const before = { ...row, start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time ?? '').slice(0, 5), current_bookings: Number(occupied[id] ?? 0) };
    const after = { ...before, ...changes };
    if (!['scheduled', 'closed'].includes(before.status)) conflict(id, 'La clase está cancelada o finalizada.');
    if (`${before.date}T${before.start_time}:00` <= now) conflict(id, 'Sólo se pueden editar clases futuras.');
    if (!timeValid(after.start_time) || !timeValid(after.end_time) || after.end_time <= after.start_time) conflict(id, 'La hora final debe ser posterior a la inicial, dentro del mismo día.');
    if (`${after.date}T${after.start_time}:00` <= now) conflict(id, 'El nuevo horario debe ser futuro.');
    if (after.max_capacity < before.current_bookings) conflict(id, `Hay ${before.current_bookings} reservas activas; no puedes reducir el cupo a ${after.max_capacity}.`);
    if (Number(reserved[id] ?? before.current_bookings) > 0 && (before.start_time !== after.start_time || before.end_time !== after.end_time || before.class_type_id !== after.class_type_id || before.instructor_id !== after.instructor_id)) conflict(id, 'Tiene reservas: no puedes cambiar horario, disciplina ni coach. Cancela con devolución y crea una nueva clase.');
    candidates.push({ ...after, before, after });
  }
  for (const candidate of candidates) {
    const { before, after } = candidate;
    const moved = before.start_time !== after.start_time || before.end_time !== after.end_time || before.instructor_id !== after.instructor_id;
    const slotChanged = before.start_time !== after.start_time || before.class_type_id !== after.class_type_id;
    if (slotChanged && [...otherClasses, ...candidates.map(c => c.after)].some(other => other.id !== after.id && other.date === after.date && other.status !== 'cancelled' && other.class_type_id === after.class_type_id && String(other.start_time).slice(0, 5) === after.start_time)) conflict(after.id, 'Ya existe una clase de esta disciplina en ese horario.');
    if (!moved || !after.instructor_id) continue;
    const overlaps = [...otherClasses, ...candidates.map(c => c.after)].some(other => other.id !== after.id && other.instructor_id === after.instructor_id && other.date === after.date && other.status !== 'cancelled' && String(other.start_time).slice(0, 5) < after.end_time && String(other.end_time).slice(0, 5) > after.start_time);
    if (overlaps) conflict(after.id, 'La instructora tiene otra clase en ese horario.');
  }
  return { data: { classes: candidates, count: candidates.length }, conflicts };
}

export function registerBulkClasses(app, { pool, adminMiddleware, recordAudit, onSeatReleased, classEditReleasesSeats, studioTimezone }) {
  const handler = preview => async (req, res) => {
    let db, committed = false;
    try {
      const { ids, changes } = validateBulkClassInput(req.body);
      db = await pool.connect();
      await db.query(preview ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await db.query("SET LOCAL lock_timeout = '3s'");
      // Legacy creation/edit paths do not lock instructors. Serialize class writes to
      // protect the overlap check against inserts too, not only selected row updates.
      // EXCLUSIVE also waits for existing booking SELECT FOR UPDATE transactions.
      if (!preview) await db.query('LOCK TABLE classes IN EXCLUSIVE MODE');
      const rows = (await db.query(`SELECT c.id, to_char(c.date, 'YYYY-MM-DD') AS date, c.class_type_id, c.instructor_id,
          c.start_time, c.end_time, c.max_capacity, c.status::text AS status, c.notes,
          to_char(c.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS revision,
          ct.name AS class_type_name, i.display_name AS instructor_name
        FROM classes c LEFT JOIN class_types ct ON ct.id=c.class_type_id LEFT JOIN instructors i ON i.id=c.instructor_id
        WHERE c.id=ANY($1::uuid[]) ORDER BY c.id ${preview ? '' : 'FOR UPDATE OF c'}`, [ids])).rows;
      for (const row of rows) await assertClassActor(db,req,row.instructor_id,!preview);
      if(changes.instructor_id) await assertClassActor(db,req,changes.instructor_id,!preview);
      const expectedVersions = Object.fromEntries(rows.map(row => [row.id, row.revision]));
      if (!preview) {
        const revisions = req.body.expectedVersions;
        if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions) || ids.some(id => typeof revisions[id] !== 'string')) throw failure('Actualiza la vista previa antes de guardar.');
        const stale = rows.filter(row => revisions[row.id] !== row.revision).map(row => ({ id: row.id, message: 'La clase cambió desde la vista previa. Revísala nuevamente.' }));
        if (stale.length) throw failure('La vista previa está desactualizada. No se aplicó ningún cambio.', 409, stale);
      }
      const counts = (await db.query(`SELECT class_id,
          COUNT(*) FILTER (WHERE status IN ('confirmed','checked_in'))::int AS occupied,
          COUNT(*) FILTER (WHERE status IN ('confirmed','checked_in','waitlist'))::int AS reserved
        FROM bookings WHERE class_id=ANY($1::uuid[]) GROUP BY class_id`, [ids])).rows;
      // Confirmed and checked-in guest bookings are separate rows, exactly as liveBookingCount.
      const occupied = Object.fromEntries(counts.map(r => [r.class_id, r.occupied]));
      const reserved = Object.fromEntries(counts.map(r => [r.class_id, r.reserved]));
      const now = (await db.query("SELECT to_char(clock_timestamp() AT TIME ZONE $1, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS now", [studioTimezone])).rows[0].now;
      const names = {};
      for (const [key, table, label, name] of [['class_type_id', 'class_types', 'disciplina', 'name'], ['instructor_id', 'instructors', 'instructora', 'display_name']]) {
        if (!Object.hasOwn(changes, key)) continue;
        const ref = (await db.query(`SELECT ${name} AS name FROM ${table} WHERE id=$1 AND is_active=true ${preview ? '' : 'FOR SHARE'}`, [changes[key]])).rows[0];
        if (!ref) throw failure(`La ${label} seleccionada no existe o está inactiva.`, 409, ids.map(id => ({ id, message: `${label} no disponible.` })));
        names[key === 'class_type_id' ? 'class_type_name' : 'instructor_name'] = ref.name;
      }
      const needsOverlap = ['start_time', 'end_time', 'instructor_id', 'class_type_id'].some(key => Object.hasOwn(changes, key));
      const otherClasses = needsOverlap ? (await db.query(`SELECT id, to_char(date,'YYYY-MM-DD') AS date, class_type_id, instructor_id, start_time, end_time, status::text AS status
        FROM classes WHERE NOT(id=ANY($1::uuid[])) AND status<>'cancelled'
          AND date=ANY($2::date[])`,
      [ids, [...new Set(rows.map(r => r.date))]])).rows : [];
      const result = assessBulkClasses({ ids, rows, changes: { ...changes, ...names }, now, occupied, reserved, otherClasses });
      result.data.expectedVersions = expectedVersions;
      if (result.conflicts.length) {
        await db.query('ROLLBACK');
        db.release(); db = null;
        return res.status(409).json({ ...result, message: 'No se aplicó ningún cambio. Revisa los conflictos.' });
      }
      if (preview) {
        await db.query('ROLLBACK');
        db.release(); db = null;
        return res.json(result);
      }
      for (const entry of result.data.classes) {
        const keys = Object.keys(changes);
        await db.query(`UPDATE classes SET ${keys.map((key, i) => `${key}=$${i + 2}`).join(', ')}, updated_at=NOW() WHERE id=$1`, [entry.id, ...keys.map(key => changes[key])]);
        await recordAudit(db, { actorId: req.userId, action: 'class.bulk_edit', entityType: 'class', entityId: entry.id, before: entry.before, after: entry.after, meta: { batch_class_ids: ids, changed_fields: keys } });
      }
      await db.query('COMMIT'); committed = true;
      db.release(); db = null;
      const freed = result.data.classes.filter(entry => classEditReleasesSeats(entry)).map(entry => entry.id);
      let promoted = [], warnings = [];
      if (freed.length) {
        try { promoted = await onSeatReleased(freed, { source: 'bulk_class_edit', reportFailures: true }); }
        catch { warnings.push('Los cambios se guardaron, pero no pudimos actualizar la lista de espera. Revisa las clases; no repitas la edición.'); }
      }
      return res.json({ ...result, committed: true, waitlist_promoted: promoted, warnings });
    } catch (err) {
      if (db && !committed) await db.query('ROLLBACK').catch(() => {});
      const busy = ['55P03', '40P01', '40001'].includes(err.code);
      return res.status(committed ? 200 : err.status || (busy ? 409 : 500)).json({ committed, message: committed ? 'Los cambios se guardaron. Actualiza la lista para verlos.' : busy ? 'Hay otra operación en curso. Actualiza la vista previa y vuelve a intentar.' : err.status ? err.message : 'No se aplicó ningún cambio. No pudimos actualizar las clases.', conflicts: err.conflicts ?? [] });
    } finally { db?.release(); }
  };
  app.post('/api/admin/classes/bulk/preview', adminMiddleware, handler(true));
  app.put('/api/admin/classes/bulk', adminMiddleware, handler(false));
}
