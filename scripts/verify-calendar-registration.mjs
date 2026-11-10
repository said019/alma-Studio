// Fully isolated integration test: creates its own disposable database and API.
// Never reads .env, existing DATABASE_URL, mail credentials or production data.
import pg from 'pg';
import bcrypt from 'bcryptjs';
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
const databaseDir=await mkdtemp(join(tmpdir(),'hive-parity-'));
const databasePort=await freePort();const apiPort=await freePort();const testSecret=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir,user:'parity',password:'parity',port:databasePort,persistent:false});
let db,apiProcess;let logs='';
try {
await postgres.initialise();await postgres.start();await postgres.createDatabase('parity');
const databaseUrl=`postgres://parity:parity@127.0.0.1:${databasePort}/parity`;
db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query("SET TIME ZONE 'America/Mexico_City'");
await db.query(await readFile(new URL('../supabase/migrations/schema_complete.sql',import.meta.url),'utf8'));
await db.query(`CREATE TABLE IF NOT EXISTS schedule_slots(id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),time_slot VARCHAR(20),day_of_week INTEGER,class_type_id UUID,class_type_name VARCHAR(100),instructor_name VARCHAR(100),is_active BOOLEAN DEFAULT true,created_at TIMESTAMPTZ DEFAULT NOW());`);
apiProcess=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DOTENV_CONFIG_PATH:'/dev/null',DATABASE_URL:databaseUrl,JWT_SECRET:testSecret,PORT:String(apiPort),WAITLIST_SWEEP_MINUTES:'0'},stdio:['ignore','pipe','pipe']});
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

const coach=(await db.query("INSERT INTO instructors(user_id,display_name) VALUES($1,'Coach prueba') RETURNING id",[users.instructor])).rows[0];
const type=(await db.query("SELECT id FROM class_types LIMIT 1")).rows[0];
const plan=(await db.query(`INSERT INTO plans(name,price,class_limit,duration_days,class_category,is_visit_pack,rules) VALUES('Clase regular prueba',330,4,30,'all',false,'{"daily_class_limit":1}') RETURNING id`)).rows[0];
const makeClass=async(time)=>(await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,CURRENT_DATE+2,$3::time,$3::time+INTERVAL '1 hour',8) RETURNING id",[type.id,coach.id,time])).rows[0].id;
const first=await makeClass('09:00'),second=await makeClass('11:00');
const profile={name:'Nueva visitante',phone:'+525512345678',acceptedWaiver:false};
const visit=check(await request('/admin/classes/'+first+'/walkin-visit','POST',{profile,sale:{planId:plan.id,paymentMethod:'cash'}}),201).data;
assert.ok(visit.soldOrder);
const stored=(await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[visit.membershipId])).rows[0];assert.equal(stored.classes_remaining,3);
assert.equal((await db.query('SELECT accepted_waiver_at FROM guest_profiles WHERE id=$1',[visit.guestProfile.id])).rows[0].accepted_waiver_at,null);
check(await request('/admin/classes/'+first+'/walkin-visit','POST',{profile,sale:{planId:plan.id,paymentMethod:'cash'}}),409);
assert.equal((await db.query('SELECT count(*)::int AS n FROM orders WHERE user_id=$1',[visit.userId])).rows[0].n,1);
await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',4,CURRENT_DATE,CURRENT_DATE+30)",[users.client,plan.id]);
check(await request('/admin/bookings/assign','POST',{userId:users.client,classId:first}),201);
const limited=await request('/admin/bookings/assign','POST',{userId:users.client,classId:second});
check(limited,403);assert.match(limited.message,/sesión.*por día/);assert.notEqual(limited.code,'NO_ELIGIBLE_MEMBERSHIP');
await db.query("UPDATE plans SET rules='{\"allowed_weekdays\":[]}',personal_only=true WHERE id=$1",[plan.id]);
check(await request('/admin/classes/'+second+'/walkin-visit','POST',{profile:{name:'Otra visitante',phone:'+14155552671'},sale:{planId:plan.id,paymentMethod:'cash'}}),400);
// Manual seats are real occupancy, bounded by capacity, and reversible.
const manual=check(await request('/admin/classes/'+second+'/manual-seats','POST',{name:'Visita presencial'}),201).data;
assert.equal((await db.query('SELECT current_bookings FROM classes WHERE id=$1',[second])).rows[0].current_bookings,1);
for(let i=0;i<7;i++)check(await request('/admin/classes/'+second+'/manual-seats','POST',{}),201);
check(await request('/admin/classes/'+second+'/manual-seats','POST',{}),409);
check(await request('/admin/classes/'+second+'/manual-seats/'+manual.id,'DELETE'));
assert.equal((await db.query('SELECT current_bookings FROM classes WHERE id=$1',[second])).rows[0].current_bookings,7);
check(await request('/admin/classes/'+second+'/manual-seats','POST',{},'client'),403);
const movements=check(await request('/admin/users/'+users.client+'/booking-movements')).data;
assert.ok(movements.some(m=>m.status==='confirmed'));
const bell=check(await request('/admin/notifications?limit=100')).data;
assert.ok(bell.some(n=>n.category==='booking_created'));
assert.ok(bell.some(n=>n.category==='booking_cancelled'));
check(await request('/admin/notifications/mark-read','POST',{}));
assert.equal(check(await request('/admin/notifications/unread-count')).data.unread_count,0);
await db.query("UPDATE classes SET start_time='09:15' WHERE id=$1",[first]);
assert.ok(check(await request('/admin/users/'+users.client+'/booking-movements')).data.some(m=>m.event_type==='class_updated'));
// Partial edits preserve disabled messages, custom copies and reminder timing.
check(await request('/admin/notification-settings','PUT',{whatsapp_reminders:false,reminder_hours_before:1}));
check(await request('/admin/notification-settings','PUT',{email_reminders:false}));
const settings=check(await request('/admin/notification-settings')).data;
assert.equal(settings.reminder_hours_before,1);assert.equal(settings.whatsapp_reminders,false);
check(await request('/admin/notification-settings','PUT',{reminder_hours_before:-1}),400);
check(await request('/admin/whatsapp-templates','PUT',{templates:{booking_confirmed:{enabled:false,body:'Texto editado {firstName}'}}}));
check(await request('/admin/whatsapp-templates','PUT',{templates:{booking_confirmed:{subject:'Nuevo título'}}}));
const templates=check(await request('/admin/whatsapp-templates')).data.templates;
assert.equal(templates.booking_confirmed.enabled,false);assert.equal(templates.booking_confirmed.body,'Texto editado {firstName}');assert.ok(templates.client_invite);
// Phone and email resolve the same account; disabled/ambiguous accounts fail closed.
const hash=await bcrypt.hash('Integration-password-2026',10);
await db.query('UPDATE users SET phone=$1,password_hash=$2 WHERE id=$3',['+525555000123',hash,users.client]);
async function login(identifier,password='Integration-password-2026') {
 const r=await fetch(`http://127.0.0.1:${apiPort}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:identifier,password})});return {status:r.status,...await r.json()};
}
for(const phone of ['+525555000123','55 5500 0123'])assert.equal(check(await login(phone)).user.id,users.client);
const email=(await db.query('SELECT email FROM users WHERE id=$1',[users.client])).rows[0].email;
assert.equal(check(await login(email.toUpperCase())).user.id,users.client);
check(await login('+525555000123','wrong-password'),401);
await db.query('UPDATE users SET phone=$1,password_hash=$2 WHERE id=$3',['+525555000123',hash,users.reception]);
check(await login('+525555000123'),401);
await db.query('UPDATE users SET is_active=false WHERE id=$1',[users.client]);
check(await login(email),401);
console.log('PASS: visitor sale and booking, no consent gate, duplicate protection, active membership, daily limit, plan restrictions, manual occupancy/capacity/release/permissions, booking history, admin bell/read state, phone/email login and account ambiguity.');
} catch(error) { console.error(logs);throw error; }
finally {
  if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
  if(db)await db.end();await postgres.stop();
}
