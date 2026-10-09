import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateBulkClassInput, assessBulkClasses, registerBulkClasses } from './bulkClasses.js';
import { classEditReleasesSeats } from './waitlist.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOW = '2026-10-03T10:00:00';
const row = (n = 1, overrides = {}) => ({ id: id(n), date: '2026-10-04', start_time: '10:00:00', end_time: '10:50:00', class_type_id: id(80), instructor_id: id(90), max_capacity: 6, status: 'scheduled', notes: 'Original', revision: '2026-10-03 09:00:00.123456', ...overrides });
const assess = (changes = {}, rows = [row()], extra = {}) => assessBulkClasses({ ids: rows.map(r => r.id), rows, changes, now: NOW, ...extra });

test('strict input whitelist, unique IDs, maximum 200, integer capacity and HH:mm', () => {
  for (const body of [null, {}, { classIds: [], changes: { notes: '' } }, { classIds: [id(1), id(1)], changes: { notes: '' } }, { classIds: Array.from({ length: 201 }, (_, i) => id(i)), changes: { notes: '' } }, { classIds: ['oops'], changes: { notes: '' } }, ...[{}, { date: '2026-10-05' }, { status: 'cancelled' }, { maxCapacity: '5' }, { maxCapacity: 1.5 }, { maxCapacity: 0 }, { startTime: '25:00' }, { endTime: '2026-10-05T15:00' }, { notes: null }, { instructorId: null }, { classTypeId: 'bad' }].map(changes => ({ classIds: [id(1)], changes }))]) assert.throws(() => validateBulkClassInput(body), e => e.status === 400);
  assert.deepEqual(validateBulkClassInput({ classIds: [id(2), id(1)], changes: { notes: '', maxCapacity: 10, startTime: '09:00' } }), { ids: [id(1), id(2)], changes: { notes: '', max_capacity: 10, start_time: '09:00' } });
});
test('missing, cancelled and started classes conflict; new start must remain future', () => {
  assert.ok(assess({}, [row(1, { status: 'cancelled' })]).conflicts.length);
  assert.ok(assess({}, [row(1, { date: '2026-10-03', start_time: '10:00' })]).conflicts.length);
  assert.ok(assess({ start_time: '09:00' }, [row(1, { date: '2026-10-03', start_time: '12:00' })]).conflicts.length);
  assert.equal(assess({}, [row()], { ids: [id(1), id(2)] }).conflicts[0].id, id(2));
});
test('final start/end ordering validated even when only one field is provided', () => {
  assert.ok(assess({ start_time: '11:00' }).conflicts.length);
  assert.ok(assess({ end_time: '10:00' }).conflicts.length);
  assert.equal(assess({ start_time: '09:00' }).conflicts.length, 0);
});
test('real occupancy includes guest rows, never trusts stale current_bookings', () => {
  assert.ok(assess({ max_capacity: 2 }, [row(1, { current_bookings: 0 })], { occupied: { [id(1)]: 3 } }).conflicts.length);
  const result = assess({ max_capacity: 3 }, [row(1, { current_bookings: 100 })], { occupied: { [id(1)]: 3 } });
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.data.classes[0].current_bookings, 3);
});
test('reservations and waitlist forbid time/type/coach changes, permit capacity/notes/closing', () => {
  for (const changes of [{ start_time: '09:00' }, { end_time: '11:00' }, { class_type_id: id(81) }, { instructor_id: id(91) }]) assert.ok(assess(changes, [row()], { reserved: { [id(1)]: 1 } }).conflicts.length);
  assert.equal(assess({ max_capacity: 8, notes: '', status: 'closed' }, [row()], { occupied: { [id(1)]: 2 }, reserved: { [id(1)]: 2 } }).conflicts.length, 0);
});
test('an empty class permits coach reassignment', () => {
  assert.equal(assess({ instructor_id: id(91) }, [row()], { occupied: { [id(1)]: 0 }, reserved: { [id(1)]: 0 } }).conflicts.length, 0);
});
test('instructor overlaps checked against final batch and existing rows, adjacent slots allowed', () => {
  const second = row(2, { start_time: '12:00', end_time: '12:50' });
  assert.equal(assess({ start_time: '09:00', end_time: '09:50' }, [row(), second]).conflicts.length, 4); // instructor plus duplicate type for each
  assert.equal(assess({ start_time: '09:00', end_time: '09:50' }, [row()], { otherClasses: [row(2, { start_time: '09:50', end_time: '10:40' })] }).conflicts.length, 0);
  assert.ok(assess({ instructor_id: id(91) }, [row()], { otherClasses: [row(2, { instructor_id: id(91), start_time: '10:30', end_time: '11:20' })] }).conflicts.length);
});
test('notes and capacity ignore legacy overlapping classes; type change checks exact duplicate', () => {
  const overlap = row(2);
  assert.equal(assess({ notes: 'Nuevo', max_capacity: 10 }, [row()], { otherClasses: [overlap] }).conflicts.length, 0);
  assert.equal(assess({ class_type_id: id(81) }, [row()], { otherClasses: [row(2, { class_type_id: id(81), instructor_id: id(91) })] }).conflicts.length, 1);
  assert.equal(assess({ start_time: '09:00' }, [row()], { otherClasses: [row(2, { status: 'cancelled', start_time: '09:00' })] }).conflicts.length, 0);
});

function harness({ rows = [row()], counts = [], failAudit = false, failFollowup = false, inactive = false, now = NOW, failCommit = false } = {}) {
  const calls = [], audits = [], promotions = [], routes = new Map();
  let released = 0;
  const db = { release() { released++; calls.push(['RELEASE']); }, async query(sql, params) {
    calls.push([sql, params]);
    if (sql.includes('FROM classes c LEFT JOIN')) return { rows };
    if (sql.includes('FROM bookings WHERE')) return { rows: counts };
    if (sql.includes('clock_timestamp')) return { rows: [{ now }] };
    if (sql.startsWith('SELECT name AS name') || sql.startsWith('SELECT display_name AS name')) return { rows: inactive ? [] : [{ name: 'Nueva referencia' }] };
    if (sql === 'COMMIT' && failCommit) throw Object.assign(new Error('serialization'), { code: '40001' });
    return { rows: [] };
  } };
  registerBulkClasses({ post(path, middleware, handler) { routes.set(`POST ${path}`, handler); }, put(path, middleware, handler) { routes.set(`PUT ${path}`, handler); } }, {
    pool: { connect: async () => db }, adminMiddleware: () => {}, studioTimezone: 'America/Mexico_City', classEditReleasesSeats,
    recordAudit: async (_, entry) => { audits.push(entry); if (failAudit) throw new Error('audit failed'); },
    onSeatReleased: async (ids, context) => { assert.ok(calls.some(([sql]) => sql === 'COMMIT')); assert.equal(released, 1); promotions.push({ ids, context }); if (failFollowup) throw new Error('provider'); return [{ id: 'promoted' }]; },
  });
  return { calls, audits, promotions, async request({ preview = false, changes = { maxCapacity: 8 }, classIds = rows.map(r => r.id), expectedVersions = Object.fromEntries(rows.map(r => [r.id, r.revision])) } = {}) {
    let status = 200, body;
    const res = { status(s) { status = s; return this; }, json(data) { body = data; return this; } };
    await routes.get(`${preview ? 'POST' : 'PUT'} /api/admin/classes/bulk${preview ? '/preview' : ''}`)({ userId: id(99), body: { classIds, changes, expectedVersions } }, res);
    assert.equal(released, 1);
    return { status, body };
  } };
}
test('preview is repeatable read/read only: no locks, writes, audit or promotions; includes versions', async () => {
  const h = harness(); const result = await h.request({ preview: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.data.expectedVersions[id(1)], row().revision);
  assert.equal(result.body.data.classes[0].before.max_capacity, 6);
  assert.equal(result.body.data.classes[0].after.max_capacity, 8);
  assert.equal(h.calls[0][0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.ok(h.calls.every(([sql]) => !/LOCK TABLE|FOR UPDATE|FOR SHARE|^UPDATE|COMMIT/.test(sql)));
  assert.equal(h.audits.length, 0); assert.equal(h.promotions.length, 0);
});
test('apply obtains locks, rechecks occupancy, writes/audits all and promotes only after commit/release', async () => {
  const h = harness({ rows: [row(1), row(2)] }); const r = await h.request();
  assert.equal(r.status, 200); assert.equal(r.body.committed, true);
  assert.equal(h.calls.filter(([sql]) => sql.startsWith('UPDATE classes')).length, 2);
  assert.equal(h.audits.length, 2); assert.ok(h.audits.every(a => a.action === 'class.bulk_edit'));
  assert.equal(h.promotions.length, 1);
  assert.ok(h.calls.findIndex(([sql]) => sql === 'LOCK TABLE classes IN EXCLUSIVE MODE') < h.calls.findIndex(([sql]) => sql.includes('FOR UPDATE OF c')));
  assert.ok(h.calls.some(([sql]) => sql.includes('ORDER BY c.id FOR UPDATE OF c')));
});
test('stale preview rejected atomically, missing versions rejected before writes', async () => {
  for (const expectedVersions of [{ [id(1)]: 'old' }, {}]) {
    const h = harness(); const r = await h.request({ expectedVersions });
    assert.equal(r.status, expectedVersions[id(1)] ? 409 : 400);
    assert.ok(h.calls.some(([sql]) => sql === 'ROLLBACK'));
    assert.ok(h.calls.every(([sql]) => !sql.startsWith('UPDATE')));
    assert.equal(h.audits.length, 0); assert.equal(h.promotions.length, 0);
  }
});
test('reservation created after preview is detected at commit and no row updates occur', async () => {
  const h = harness({ rows: [row(), row(2)], counts: [{ class_id: id(2), occupied: 7, reserved: 7 }] });
  const r = await h.request({ changes: { maxCapacity: 6 } });
  assert.equal(r.status, 409); assert.equal(r.body.conflicts[0].id, id(2));
  assert.ok(h.calls.every(([sql]) => !sql.startsWith('UPDATE')));
});
test('inactive references conflict and an audit or commit failure rolls back every change', async () => {
  const h = harness({ inactive: true }); assert.equal((await h.request({ changes: { instructorId: id(91) } })).status, 409);
  for (const options of [{ failAudit: true }, { failCommit: true }]) {
    const run = harness(options); const result = await run.request();
    assert.ok([409, 500].includes(result.status));
    assert.ok(run.calls.some(([sql]) => sql === 'ROLLBACK')); assert.equal(run.promotions.length, 0);
  }
});
test('successful notes edits do not promote; postcommit followup failure returns saved=true warning', async () => {
  const h = harness(); const r = await h.request({ changes: { notes: '' } });
  assert.equal(r.status, 200); assert.equal(h.promotions.length, 0);
  const f = harness({ failFollowup: true }); const failed = await f.request();
  assert.equal(failed.status, 200); assert.equal(failed.body.committed, true); assert.equal(failed.body.warnings.length, 1);
  assert.ok(f.calls.every(([sql]) => sql !== 'ROLLBACK'));
});
