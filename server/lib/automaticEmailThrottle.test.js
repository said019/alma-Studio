import test from 'node:test';
import assert from 'node:assert/strict';
import {claimAutomaticEmail,WEEKLY_REMINDER_QUERY} from './automaticEmailThrottle.js';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
test('durable cooldown, concurrent workers and audience preferences',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hive-email-test-'));
 const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
 const postgres=new EmbeddedPostgres({databaseDir:dir,user:'test',password:'test',port,persistent:false});let db;
 try{
  await postgres.initialise();await postgres.start();await postgres.createDatabase('test');
  db=new pg.Pool({host:'127.0.0.1',port,user:'test',password:'test',database:'test'});
  await db.query("CREATE TABLE settings(key text PRIMARY KEY,value jsonb); CREATE TABLE users(id int PRIMARY KEY,email text,display_name text,is_active boolean,receive_weekly_summary boolean); CREATE TABLE memberships(id int PRIMARY KEY,user_id int,status text,start_date date,end_date date,classes_remaining int)");
  const results=await Promise.all(Array.from({length:8},()=>claimAutomaticEmail(db,'a')));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(await claimAutomaticEmail(db,'a'),false);
  await db.query("UPDATE settings SET value=jsonb_build_object('claimedAt',NOW()-INTERVAL '8 days')");
  assert.equal(await claimAutomaticEmail(db,'a'),true);
  assert.equal(await claimAutomaticEmail(db,'b'),true);
  await db.query("INSERT INTO users SELECT n,'qa@example.invalid','QA',n<>3,n<>2 FROM generate_series(1,6)n; INSERT INTO memberships SELECT n,n,'active',CURRENT_DATE-1,CURRENT_DATE+30,5 FROM generate_series(1,6)n; INSERT INTO memberships VALUES (7,1,'active',CURRENT_DATE-1,CURRENT_DATE+40,9); UPDATE memberships SET classes_remaining=1 WHERE user_id=4; UPDATE memberships SET end_date=CURRENT_DATE+2 WHERE user_id=5; UPDATE memberships SET start_date=CURRENT_DATE+2 WHERE user_id=6");
  assert.deepEqual((await db.query(WEEKLY_REMINDER_QUERY)).rows.map(r=>r.user_id),[1]);
 }finally{if(db)await db.end();await postgres.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
