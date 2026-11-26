import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { PLAN_RULES_SCHEMA } from '../lib/planSchema.js';

test('an audited date correction is scoped to one membership and transaction', async t => {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const postgres = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'hive-validity-')), port,
    user: 'test', password: 'test', persistent: false,
  });
  await postgres.initialise();
  await postgres.start();
  const db = new pg.Client({ host: '127.0.0.1', port, user: 'test', password: 'test', database: 'postgres' });
  t.after(async () => { await db.end(); await postgres.stop(); });
  await db.connect();
  await db.query(await readFile(new URL('../../supabase/migrations/schema_complete.sql', import.meta.url), 'utf8'));
  await db.query(PLAN_RULES_SCHEMA);
  const { rows: [person] } = await db.query("INSERT INTO users(phone,email,display_name) VALUES ('5550000001','test@example.invalid','Test') RETURNING id");
  const { rows: [plan] } = await db.query(`INSERT INTO plans(name,price,duration_days,rules) VALUES ('Free prueba',0,30,'{"extendable":false}') RETURNING id`);
  const { rows: [first, second] } = await db.query("INSERT INTO memberships(user_id,plan_id,status) VALUES ($1,$2,'active'), ($1,$2,'active') RETURNING id", [person.id,plan.id]);
  const update = id => db.query("UPDATE memberships SET start_date='2026-11-25',end_date='2028-04-08' WHERE id=$1 RETURNING start_date::date::text AS start,end_date::date::text AS end",[id]);
  await assert.rejects(update(first.id), /prórrogas/);
  await db.query('BEGIN');
  await db.query("SELECT set_config('hive.admin_validity_membership',$1,true)",[first.id]);
  assert.deepEqual((await update(first.id)).rows[0], {start: '2026-11-25',end: '2028-04-08'});
  await db.query('SAVEPOINT other_membership');
  await assert.rejects(update(second.id), /prórrogas/);
  await db.query('ROLLBACK TO SAVEPOINT other_membership');
  await db.query('COMMIT');
  await assert.rejects(db.query("UPDATE memberships SET end_date='2028-04-09' WHERE id=$1",[first.id]), /prórrogas/);
});
