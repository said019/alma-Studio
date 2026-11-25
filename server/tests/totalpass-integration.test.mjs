// Runs against a disposable HIVE database. All provider calls are injected locally.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { createPartnerRuntime } from '../totalpass/partnerRuntime.mjs';
import { createPartnerPersonActions } from '../totalpass/partnerPersonActions.mjs';
import { checkinPath,createTotalpassCheckins } from '../totalpass/totalpassCheckins.mjs';
import { encryptCredentials } from '../totalpass/partnerConfiguration.mjs';

test('HIVE imports TotalPass bookings once, shares occupancy, edits classes and verifies cancellations', async (t) => {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const postgres = new EmbeddedPostgres({
    databaseDir: await mkdtemp(join(tmpdir(), 'hive-totalpass-')), port,
    user: 'test', password: 'test', persistent: false,
  });
  await postgres.initialise();
  await postgres.start();
  const pool = new pg.Pool({ host:'127.0.0.1', port, database:'postgres', user:'test', password:'test' });
  t.after(async () => { await pool.end(); await postgres.stop(); });
  const schema = file => readFile(new URL(file, import.meta.url), 'utf8');
  await pool.query(await schema('../../supabase/migrations/schema_complete.sql'));
  // bookings.channel is installed by the HIVE startup migrations before TotalPass.
  await pool.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'app'");
  await pool.query(await schema('../totalpass/schema.sql'));

  const secret = 'synthetic-test-secret-only-123456789';
  const config = { unitId:'999', horizonDays:14, maxSpots:3, buffer:0 };
  const credential = encryptCredentials('totalpass', { apiKey:'synthetic-key' }, secret);
  await pool.query(`INSERT INTO partner_integration_config(provider,config,credentials_encrypted,connection_status,sync_enabled)
    VALUES('totalpass',$1,$2,'verified',true)
    ON CONFLICT(provider) DO UPDATE SET config=$1,credentials_encrypted=$2,connection_status='verified',sync_enabled=true`,[config,credential]);
  const coach = (await pool.query(`WITH person AS (
    INSERT INTO users(phone,email,display_name,role) VALUES('5550000001','coach@example.invalid','Coach','instructor') RETURNING id)
    INSERT INTO instructors(user_id,display_name) SELECT id,'Coach' FROM person RETURNING id`)).rows[0];
  const type = (await pool.query("INSERT INTO class_types(name) VALUES('Reformer de prueba') RETURNING id")).rows[0];
  const cls = (await pool.query(`INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity)
    VALUES($1,$2,CURRENT_DATE+2,'15:00','15:50',3) RETURNING id,date::text`, [type.id,coach.id])).rows[0];
  const direct = (await pool.query("INSERT INTO users(phone,email,display_name,role) VALUES('5550000002','direct@example.invalid','Reserva local','client') RETURNING id")).rows[0];
  await pool.query("INSERT INTO bookings(class_id,user_id,status) VALUES($1,$2,'confirmed')", [cls.id,direct.id]);

  const remote = { externalId:'remote-class', title:'Reformer de prueba', coach:'Coach', date:cls.date,
    time:'15:00', duration:50, capacity:3, booked:1 };
  const guest = { externalId:'remote-guest', classExternalId:remote.externalId, name:'Visita de prueba', status:'confirmed' };
  let personCancellations = 0;
  let classCancellations = 0;
  const catalog = () => ({ complete:true, classes:[{...remote}], bookings:[{...guest}] });
  const adapters = { totalpass: () => ({
    catalog, update: async (_remote,local,options) => {
      Object.assign(remote,{ capacity:options.capacity,time:local.time,duration:local.duration });
      return {...remote};
    },
    cancelBooking: async () => {
      personCancellations++; guest.status='cancelled'; remote.booked=0;
      return { status:'cancelled',snapshot:catalog() };
    },
    cancel: async () => { classCancellations++; return {status:'cancelled'}; },
  }) };
  const runtime = createPartnerRuntime({pool,secret,adapters,getPolicies:async()=>({maxAdvanceDays:14,cancellationHours:3})});
  const sync = async () => {
    const result = await runtime.run('totalpass');
    const issues = (await pool.query('SELECT code FROM partner_sync_issues WHERE resolved_at IS NULL')).rows;
    assert.equal(result.issues,0,JSON.stringify(issues));
  };
  const occupancy = async () => (await pool.query('SELECT current_bookings FROM classes WHERE id=$1',[cls.id])).rows[0].current_bookings;
  await sync();
  await sync();
  const imported = (await pool.query("SELECT * FROM bookings WHERE partner_provider='totalpass'")).rows;
  assert.equal(imported.length,1);
  assert.equal(imported[0].membership_id,null);
  assert.equal(await occupancy(),2);
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const people = (await db.query(`INSERT INTO users(email,display_name,role,phone) VALUES
      ('other1@example.invalid','Cliente 1','client','5550000003'),
      ('other2@example.invalid','Cliente 2','client','5550000004') RETURNING id`)).rows;
    await db.query('INSERT INTO bookings(class_id,user_id) VALUES($1,$2)',[cls.id,people[0].id]);
    await assert.rejects(db.query('INSERT INTO bookings(class_id,user_id) VALUES($1,$2)',[cls.id,people[1].id]), /cupo|capacity|capacidad/i);
  } finally {
    await db.query('ROLLBACK');
    db.release();
  }
  assert.equal(remote.capacity,2,'a direct booking reduces the number of seats publishable on TotalPass');
  await assert.rejects(pool.query("UPDATE classes SET start_time='15:15' WHERE id=$1",[cls.id]),/reprogramar/i);
  await pool.query("UPDATE classes SET end_time='16:05' WHERE id=$1",[cls.id]);
  await sync();
  assert.equal(remote.duration,65);

  const act = createPartnerPersonActions({pool,secret,adapters});
  await assert.rejects(act(imported[0].id,'checkin'),/webhook|manual/i);
  assert.equal((await act(imported[0].id,'cancel')).status,'cancelled');
  await act(imported[0].id,'cancel');
  assert.equal(personCancellations,1);
  guest.status='confirmed'; // An older catalog can arrive after the confirmed cancellation.
  await sync();
  assert.equal(await occupancy(),1);
  guest.status='cancelled';
  assert.equal((await pool.query('SELECT status FROM bookings WHERE user_id=$1',[direct.id])).rows[0].status,'confirmed');
  await pool.query("UPDATE classes SET status='cancelled' WHERE id=$1",[cls.id]);
  await sync();
  assert.equal(classCancellations,1);

  // A separate class taking place now exercises the real webhook matching window.
  const currentClass = (await pool.query(`INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity)
    SELECT $1,$2,local_time::date,local_time::time,(local_time+interval '50 minutes')::time,3
    FROM (SELECT NOW() AT TIME ZONE 'America/Mexico_City' AS local_time) clock RETURNING id`,[type.id,coach.id])).rows[0];
  const currentGuest = (await pool.query(`INSERT INTO bookings(class_id,channel,guest_name,partner_provider,partner_external_id,status,partner_metadata)
    VALUES($1,'totalpass','TotalPass · Visita actual','totalpass','current-guest','confirmed','{"providerPersonId":"mock-person"}') RETURNING id`,[currentClass.id])).rows[0];
  let confirmations=0;
  const checkins=createTotalpassCheckins({pool,secret,request:async()=>{
    confirmations++;
    return new Response(null,{status:204});
  }});
  const webhook = checkinPath(secret,config.unitId).split('/').at(-1);
  const payload={endpoint:'https://totalpass.com/api/v1/webhook_confirmations/test-only-receipt',unit_id:config.unitId,
    user:{id:'mock-person',name:'Visita actual'},timestamp:new Date().toISOString()};
  await assert.rejects(checkins.receive(webhook,{...payload,unit_id:'other'}),/UNIT_MISMATCH/);
  assert.equal((await checkins.receive(webhook,payload)).status,'matched');
  assert.equal((await checkins.receive(webhook,payload)).status,'matched');
  assert.equal(confirmations,1);
  assert.equal((await pool.query('SELECT status FROM bookings WHERE id=$1',[currentGuest.id])).rows[0].status,'checked_in');
  await assert.rejects(act(currentGuest.id,'cancel'),/asistencia/);
  assert.equal((await pool.query('SELECT id FROM review_requests WHERE booking_id=$1',[currentGuest.id])).rowCount,0);
  const memberBooking=(await pool.query("INSERT INTO bookings(user_id,class_id,status) VALUES($1,$2,'confirmed') RETURNING id",[direct.id,currentClass.id])).rows[0];
  await pool.query("UPDATE bookings SET status='checked_in' WHERE id=$1",[memberBooking.id]);
  assert.equal((await pool.query('SELECT id FROM review_requests WHERE booking_id=$1',[memberBooking.id])).rowCount,1);
});
