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

const results=[];
const expected = {'create coach role client':403,'create coach role reception':403,'create coach role instructor':403,'create class with deleted coach':409,'create backwards hours and negative capacity':400,'partial edit start after unchanged end':400,'legacy admin class create':410,'deleted coach can still read roster':403,'deleted coach can check-in':403,'instructor edits another coach class':403,'reception deletes class with no bookings':403,'change reserved class time':409};
const record=(name,value)=>{if(expected[name]!==undefined)assert.equal(value.status,expected[name],name+JSON.stringify(value));if(name==='concurrent generator'){assert.equal(value.count,1);assert.deepEqual(value.responses.map(x=>x.created).sort(),[0,1]);}if(name==='single edit capacity booking race'){assert.equal(value.response.status,409);assert.ok(value.persisted.max_capacity>=value.persisted.current_bookings);}results.push({name,...value});console.log(JSON.stringify(results.at(-1)));};
const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r;};
const c=check(await request('/instructors','POST',{displayName:'AUDIT Coach',email:'audit@example.invalid',bio:'Original',specialties:['reformer']}),201).data;
check(await request('/instructors/'+c.id,'PUT',{displayName:'AUDIT Edited'}));
assert.equal((await db.query('SELECT bio FROM instructors WHERE id=$1',[c.id])).rows[0].bio,'Original');
record('coach create/edit preserves unmentioned fields',{pass:true});
for(const role of ['client','reception','instructor']) record('create coach role '+role,{status:(await request('/instructors','POST',{displayName:'Role probe'},role)).status});
const type=(await db.query('SELECT id FROM class_types LIMIT 1')).rows[0].id;
const date=(await db.query("SELECT to_char(CURRENT_DATE+30,'YYYY-MM-DD') AS day")).rows[0].day;
const payload={classTypeId:type,instructorId:c.id,startTime:date+'T09:00',endTime:date+'T10:00',maxCapacity:8};
const cls=check(await request('/classes','POST',payload),201).data;
check(await request('/admin/classes/'+cls.id,'PUT',{notes:'Edited',startTime:date+'T10:00',endTime:date+'T11:00'}));
check(await request('/admin/classes/'+cls.id,'PUT',{status:'cancelled'}),400);
check(await request('/admin/classes/'+cls.id,'DELETE'));
record('class create/edit/delete empty and reject generic cancel',{pass:true});
const booked=check(await request('/classes','POST',payload),201).data;
const plan=(await db.query('SELECT id FROM plans LIMIT 1')).rows[0].id;
const member=(await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',3,CURRENT_DATE,CURRENT_DATE+60) RETURNING id",[users.client,plan])).rows[0].id;
await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed')",[users.client,booked.id,member]);
check(await request('/admin/classes/'+booked.id,'DELETE'),409);
check(await request('/classes/'+booked.id+'/cancel','PUT',{reason:'Audit cancellation'}));
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining,4);
await request('/classes/'+booked.id+'/cancel','PUT',{reason:'Retry'});
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining,4);
record('class history protected, cancel refunds once',{pass:true});
check(await request('/instructors/'+c.id,'DELETE'));
assert.ok(!(check(await request('/instructors')).data.some(x=>x.id===c.id)));
assert.equal((await db.query('SELECT count(*)::int n FROM classes WHERE instructor_id=$1',[c.id])).rows[0].n,1);
record('coach delete hides while retaining history',{pass:true});
const deletedCreate=await request('/classes','POST',{...payload,startTime:date+'T12:00',endTime:date+'T13:00'});
record('create class with deleted coach',{status:deletedCreate.status,id:deletedCreate.data?.id});
const backwards=await request('/classes','POST',{...payload,startTime:date+'T17:00',endTime:date+'T16:00',maxCapacity:-2});
record('create backwards hours and negative capacity',{status:backwards.status,data:backwards.data});
const coach2=check(await request('/instructors','POST',{displayName:'AUDIT 2'}),201).data;
const partial=check(await request('/classes','POST',{...payload,instructorId:coach2.id,startTime:date+'T14:00',endTime:date+'T15:00'}),201).data;
record('partial edit start after unchanged end',await request('/admin/classes/'+partial.id,'PUT',{startTime:'16:00'}));
record('legacy admin class create',await request('/admin/classes','POST',{...payload,instructorId:coach2.id}));
// Deterministic overlap: a trigger stalls both inserts after both existence checks.
await db.query("CREATE FUNCTION audit_pause_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END $$; CREATE TRIGGER audit_pause BEFORE INSERT ON classes FOR EACH ROW EXECUTE FUNCTION audit_pause_insert()");
const gen={startDate:date,endDate:date,classTypeId:type,instructorId:coach2.id,daysOfWeek:[0,1,2,3,4,5,6],startTime:'18:00',endTime:'19:00',maxCapacity:5};
const concurrent=await Promise.all([request('/classes/generate','POST',gen),request('/classes/generate','POST',gen)]);
record('concurrent generator',{responses:concurrent,count:(await db.query("SELECT count(*)::int n FROM classes WHERE date=$1 AND start_time='18:00' AND class_type_id=$2",[date,type])).rows[0].n});
await db.query('UPDATE instructors SET user_id=$2 WHERE id=$1',[c.id,users.instructor]);
record('deleted coach can still read roster',await request('/staff/instructor/classes/'+booked.id+'/roster','GET',null,'instructor'));
await db.query('DROP TRIGGER audit_pause ON classes');
const raced=check(await request('/classes','POST',{...payload,instructorId:coach2.id,startTime:date+'T20:00',endTime:date+'T21:00'}),201).data;
await db.query('BEGIN');await db.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[raced.id]);
const pendingEdit=request('/admin/classes/'+raced.id,'PUT',{maxCapacity:1});
let waiting=false;for(let x=0;x<40;x++){await new Promise(r=>setTimeout(r,25));const waits=await db.query("SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FROM classes WHERE id=$1 FOR UPDATE%'");if(waits.rows[0].n){waiting=true;break;}}
assert.ok(waiting,'edit is waiting on fixture class lock');
await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$3,$4,'confirmed'),($2,$3,$4,'confirmed')",[users.client,users.admin,raced.id,member]);await db.query('COMMIT');
record('single edit capacity booking race',{response:await pendingEdit,persisted:(await db.query('SELECT max_capacity,current_bookings FROM classes WHERE id=$1',[raced.id])).rows[0]});
const today=(await db.query("SELECT to_char(CURRENT_DATE,'YYYY-MM-DD') AS day,to_char(LOCALTIME,'HH24:MI') t")).rows[0];
const todayClass=(await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,CURRENT_DATE,$3::time,($3::time+INTERVAL '1 hour'),5) RETURNING id",[type,c.id,today.t])).rows[0].id;
const todayBooking=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[users.client,todayClass,member])).rows[0].id;
record('deleted coach can check-in',await request('/staff/bookings/'+todayBooking+'/check-in','PUT',{},'instructor'));
check(await request('/users','GET',null,'instructor'),403);
record('instructor edits another coach class',await request('/admin/classes/'+partial.id,'PUT',{notes:'Changed by unrelated instructor'},'instructor'));
record('reception deletes class with no bookings',await request('/admin/classes/'+partial.id,'DELETE',null,'reception'));
record('change reserved class time',await request('/admin/classes/'+raced.id,'PUT',{startTime:date+'T22:00',endTime:date+'T23:00'}));
await db.query('UPDATE instructors SET user_id=NULL WHERE id=$1',[c.id]);
await db.query('UPDATE instructors SET user_id=$2 WHERE id=$1',[coach2.id,users.instructor]);
check(await request('/admin/classes/'+partial.id,'PUT',{notes:'Own class edit'},'instructor'));
check(await request('/admin/classes/'+raced.id,'PUT',{instructorId:check(await request('/instructors','POST',{displayName:'Replacement'}),201).data.id}),409);
check(await request('/classes','POST',{...payload,instructorId:coach2.id,startTime:'2030-02-31T12:00',endTime:'2030-02-31T13:00'}),400);
check(await request('/classes/week','DELETE',{startDate:date,endDate:date},'reception'),403);
console.log('CLASS COACH FIX REGRESSIONS PASS');
} catch(error) {console.error(logs);throw error;} finally {if(apiProcess){const exited=new Promise(r=>apiProcess.once('exit',r));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}if(db)await db.end();await postgres.stop();}
