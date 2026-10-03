// Isolated PostgreSQL/API verification; never loads .env or production credentials.
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import express from 'express';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { registerBulkClasses } from '../server/lib/bulkClasses.js';
import { classEditReleasesSeats } from '../server/lib/waitlist.js';
const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const directory = await mkdtemp(join(tmpdir(), 'hive-bulk-'));
const port = await freePort();
const postgres = new EmbeddedPostgres({ databaseDir: directory, user: 'test', password: 'test', port, persistent: false });
let pool, server;
try {
  await postgres.initialise(); await postgres.start(); await postgres.createDatabase('bulk');
  pool = new pg.Pool({ connectionString: `postgres://test:test@127.0.0.1:${port}/bulk` });
  await pool.query(`CREATE TABLE class_types(id uuid PRIMARY KEY,name text,is_active boolean DEFAULT true);
    CREATE TABLE instructors(id uuid PRIMARY KEY,display_name text,is_active boolean DEFAULT true);
    CREATE TABLE classes(id uuid PRIMARY KEY,date date,class_type_id uuid REFERENCES class_types,instructor_id uuid REFERENCES instructors,start_time time,end_time time,max_capacity integer,status text,notes text,updated_at timestamptz DEFAULT NOW());
    CREATE TABLE bookings(id uuid PRIMARY KEY,class_id uuid REFERENCES classes,status text);
    CREATE TABLE audit_test(class_id uuid,payload jsonb);`);
  const type = randomUUID(), coach = randomUUID();
  await pool.query('INSERT INTO class_types VALUES($1,$2,true)', [type, 'Reformer']);
  await pool.query('INSERT INTO instructors VALUES($1,$2,true)', [coach, 'Coach prueba']);
  const ids = [randomUUID(), randomUUID()];
  for (let i = 0; i < ids.length; i++) await pool.query("INSERT INTO classes(id,date,class_type_id,instructor_id,start_time,end_time,max_capacity,status) VALUES($1,CURRENT_DATE+30+$2::int,$3,$4,'09:00','10:00',5,'scheduled')", [ids[i], i, type, coach]);
  let promoted = 0;
  const app = express(); app.use(express.json());
  registerBulkClasses(app, { pool, studioTimezone: 'America/Mexico_City', classEditReleasesSeats,
    adminMiddleware: (req,res,next) => req.headers.authorization === 'test-admin' ? next() : res.sendStatus(403),
    recordAudit: (db, entry) => db.query('INSERT INTO audit_test VALUES($1,$2)', [entry.entityId, entry]),
    onSeatReleased: async freed => { promoted += freed.length; return []; },
  });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/admin/classes/bulk`;
  const call = async (preview, body, auth = 'test-admin') => {
    const r = await fetch(base + (preview ? '/preview' : ''), { method: preview ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json', Authorization: auth }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.text().then(t => { try { return JSON.parse(t); } catch { return t; } }) };
  };
  const body = { classIds: ids, changes: { maxCapacity: 7, notes: 'Edición conjunta' } };
  assert.equal((await call(true, body, 'client')).status, 403);
  const preview = await call(true, body); assert.equal(preview.status, 200, JSON.stringify(preview));
  assert.deepEqual((await pool.query('SELECT max_capacity FROM classes')).rows.map(r => r.max_capacity), [5,5]);
  const applied = await call(false, { ...body, expectedVersions: preview.body.data.expectedVersions });
  assert.equal(applied.status, 200, JSON.stringify(applied)); assert.equal(applied.body.committed, true); assert.equal(promoted, 2);
  assert.equal((await pool.query('SELECT COUNT(*)::int AS n FROM audit_test')).rows[0].n, 2);
  assert.equal((await call(false, { ...body, expectedVersions: preview.body.data.expectedVersions })).status, 409);
  const conflictBody = { classIds: ids, changes: { maxCapacity: 1 } };
  const beforeBooking = await call(true, conflictBody); assert.equal(beforeBooking.status, 200);
  for (let i = 0; i < 2; i++) await pool.query("INSERT INTO bookings VALUES($1,$2,'confirmed')", [randomUUID(), ids[1]]);
  const conflict = await call(false, { ...conflictBody, expectedVersions: beforeBooking.body.data.expectedVersions });
  assert.equal(conflict.status, 409, JSON.stringify(conflict));
  assert.deepEqual((await pool.query('SELECT max_capacity FROM classes')).rows.map(r => r.max_capacity), [7,7]);
  assert.equal((await call(true, { classIds: ids, changes: { startTime: '10:00', endTime: '11:00' } })).status, 409);
  // Existing class writer holds the lock: apply must wait and detect its new revision.
  const pendingBody = { classIds: [ids[0]], changes: { notes: 'No debe sobrescribir' } };
  const fresh = await call(true, pendingBody); assert.equal(fresh.status, 200);
  const writer = await pool.connect();
  try {
    await writer.query('BEGIN');
    await writer.query("UPDATE classes SET notes='Edición concurrente',updated_at=NOW() WHERE id=$1", [ids[0]]);
    const request = call(false, { ...pendingBody, expectedVersions: fresh.body.data.expectedVersions });
    await new Promise(resolve => setTimeout(resolve, 100));
    await writer.query('COMMIT');
    assert.equal((await request).status, 409);
  } finally { writer.release(); }
  assert.equal((await pool.query('SELECT notes FROM classes WHERE id=$1', [ids[0]])).rows[0].notes, 'Edición concurrente');
  console.log('PASS: real PostgreSQL preview, atomic apply, audit, waitlist, authorization, stale preview, booking race and concurrent edit.');
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await pool?.end(); await postgres.stop().catch(() => {}); await rm(directory, { recursive: true, force: true });
}
