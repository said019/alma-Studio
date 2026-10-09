// Fully isolated integration test: creates its own disposable database and API.
// Never reads .env, existing DATABASE_URL, mail credentials or production data.
import pg from 'pg';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
const freePort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const databaseDir=await mkdtemp(join(tmpdir(),'hive-promotions-'));
const databasePort=await freePort();const apiPort=await freePort();const testSecret=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir,user:'parity',password:'parity',port:databasePort,persistent:false});
let db,apiProcess;let logs='';
try {
await postgres.initialise();await postgres.start();await postgres.createDatabase('parity');
const databaseUrl=`postgres://parity:parity@127.0.0.1:${databasePort}/parity`;
db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query("SET TIME ZONE 'America/Mexico_City'");
await db.query(await readFile(new URL('../../supabase/migrations/schema_complete.sql',import.meta.url),'utf8'));
// schema_complete.sql is legacy and omits schedule_slots. Mirror the deployed
// Sunday=0 schema for this disposable fixture; never migrate a real database here.
await db.query(`CREATE TABLE schedule_slots (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), time_slot VARCHAR(20) NOT NULL,
 day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
 class_type_id UUID REFERENCES class_types(id) ON DELETE SET NULL,
 class_type_name VARCHAR(100), instructor_name VARCHAR(100), is_active BOOLEAN DEFAULT true,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);

apiProcess=spawn(process.execPath,['server/index.js'],{cwd:new URL('../..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DOTENV_CONFIG_PATH:'/dev/null',DATABASE_URL:databaseUrl,JWT_SECRET:testSecret,PORT:String(apiPort),WAITLIST_SWEEP_MINUTES:'0'},stdio:['ignore','pipe','pipe']});
apiProcess.stdout.on('data',d=>logs+=d);apiProcess.stderr.on('data',d=>logs+=d);
let ready=false;
for(let i=0;i<100;i++){try{const response=await fetch(`http://127.0.0.1:${apiPort}/api/classes`);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
assert.ok(ready,logs);
const users={};
for (const role of ['admin','client','reception','instructor']) {
 const u=await db.query("INSERT INTO users(email,display_name,role) VALUES($1,$2,$3) RETURNING id",[`parity-${role}-${Date.now()}@example.invalid`,`Prueba ${role}`,role]); users[role]=u.rows[0].id;
}
async function request(path,method='GET',body,role='admin') {
 const token=jwt.sign({sub:users[role]},testSecret,{expiresIn:'10m'});
 const r=await fetch(`http://127.0.0.1:${apiPort}/api`+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const out=await r.json();return {status:r.status,...out};
}

const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r;};
const c=check(await request('/instructors','POST',{displayName:'FIX Coach',bio:'Preservar'}),201).data;
check(await request('/instructors/'+c.id,'PUT',{displayName:'FIX Edited'}));
assert.equal((await db.query('SELECT bio FROM instructors WHERE id=$1',[c.id])).rows[0].bio,'Preservar');
for(const role of ['client','reception','instructor'])check(await request('/instructors','POST',{displayName:'No'},role),403);
await db.query('UPDATE instructors SET user_id=$2 WHERE id=$1',[c.id,users.instructor]);
const type=(await db.query('SELECT id FROM class_types LIMIT 1')).rows[0].id;
const date=(await db.query("SELECT to_char(CURRENT_DATE+30,'YYYY-MM-DD') AS day")).rows[0].day;
const payload={classTypeId:type,instructorId:c.id,startTime:date+'T09:00',endTime:date+'T10:00',maxCapacity:8};
const cls=check(await request('/classes','POST',payload),201).data;
check(await request('/classes','POST',payload),409);
check(await request('/admin/classes/'+cls.id,'PUT',{startTime:'11:00'}),400);
check(await request('/classes','POST',{...payload,startTime:date+'T13:00',endTime:date+'T12:00',maxCapacity:-2}),400);
check(await request('/classes','POST',{...payload,maxCapacity:1.5}),400);
check(await request('/admin/classes/'+cls.id,'PUT',{notes:'Own scope'},'instructor'));
check(await request('/admin/classes','POST',payload),410);
const second=check(await request('/instructors','POST',{displayName:'Other'}),201).data;
const ownless=check(await request('/classes','POST',{...payload,instructorId:second.id,startTime:date+'T11:00',endTime:date+'T12:00'}),201).data;
check(await request('/admin/classes/'+ownless.id,'PUT',{notes:'Hijack'},'instructor'),403);
check(await request('/admin/classes/'+ownless.id,'DELETE',null,'instructor'),403);
check(await request('/classes/'+ownless.id+'/cancel','PUT',{},'instructor'),403);
check(await request('/classes/'+ownless.id+'/close','PUT',{},'instructor'),404);
check(await request('/admin/classes/'+ownless.id,'DELETE',null,'reception'));
const plan=(await db.query('SELECT id FROM plans LIMIT 1')).rows[0].id;
const member=(await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',3,CURRENT_DATE,CURRENT_DATE+60) RETURNING id",[users.client,plan])).rows[0].id;
// Real contention: edit must read count only after acquiring the class lock.
await db.query('BEGIN');await db.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[cls.id]);
const edit=request('/admin/classes/'+cls.id,'PUT',{maxCapacity:1});
let waiting=false;for(let x=0;x<80;x++){await new Promise(r=>setTimeout(r,25));if((await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT%,to_char(date%'")).rows[0].n){waiting=true;break;}}
assert.ok(waiting);await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$3,$4,'confirmed'),($2,$3,$4,'confirmed')",[users.client,users.admin,cls.id,member]);await db.query('COMMIT');check(await edit,409);
assert.deepEqual((await db.query('SELECT max_capacity,current_bookings FROM classes WHERE id=$1',[cls.id])).rows[0],{max_capacity:8,current_bookings:2});
for(const changes of [{startTime:date+'T14:00',endTime:date+'T15:00'},{instructorId:second.id}])check(await request('/admin/classes/'+cls.id,'PUT',changes),409);
check(await request('/admin/classes/'+cls.id,'PUT',{notes:'Safe edit',maxCapacity:9}));
check(await request('/admin/classes/'+cls.id,'DELETE'),409);
// Concurrent generators share serialization; a slow fixture trigger exposes overlap.
await db.query("CREATE FUNCTION audit_pause_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.2); RETURN NEW; END $$; CREATE TRIGGER audit_pause BEFORE INSERT ON classes FOR EACH ROW EXECUTE FUNCTION audit_pause_insert()");
const gen={startDate:date,endDate:date,classTypeId:type,instructorId:c.id,daysOfWeek:[0,1,2,3,4,5,6],startTime:'18:00',endTime:'19:00',maxCapacity:5};
const concurrent=await Promise.all([request('/classes/generate','POST',gen),request('/classes/generate','POST',gen)]);concurrent.forEach(r=>check(r));assert.equal(concurrent.reduce((n,r)=>n+r.created,0),1);
assert.equal((await db.query("SELECT count(*)::int n FROM classes WHERE date=$1 AND start_time='18:00' AND class_type_id=$2",[date,type])).rows[0].n,1);
await db.query('DROP TRIGGER audit_pause ON classes');
// Invalid and inactive references fail without writes.
check(await request('/classes/generate','POST',{...gen,startDate:'2026-02-30'}),400);
check(await request('/classes/generate','POST',{...gen,daysOfWeek:[7]}),400);
const today=(await db.query("SELECT to_char(LOCALTIME,'HH24:MI') AS t")).rows[0];
const todayClass=(await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,CURRENT_DATE,$3::time,($3::time+INTERVAL '1 hour'),5) RETURNING id",[type,c.id,today.t])).rows[0].id;
const booking=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[users.client,todayClass,member])).rows[0].id;
check(await request('/instructors/'+c.id,'DELETE'));
assert.ok(!check(await request('/instructors')).data.some(row=>row.id===c.id));
check(await request('/classes','POST',{...payload,startTime:date+'T22:00',endTime:date+'T23:00'}),409);
check(await request('/classes/generate','POST',{...gen,startTime:'20:00',endTime:'21:00'}),409);
check(await request('/staff/instructor/classes/'+todayClass+'/roster','GET',null,'instructor'),404);
check(await request('/staff/bookings/'+booking+'/check-in','PUT',{},'instructor'),404);
assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[booking])).rows[0].status,'confirmed');
console.log('PASS CC01-CC07: transaction capacity race, duplicate generation, validation, inactive coaches, ownership, protected reserved edits, legacy tombstone.');
} catch(error) {console.error(logs);throw error;} finally {if(apiProcess){const exited=new Promise(r=>apiProcess.once('exit',r));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}if(db)await db.end();await postgres.stop();}
