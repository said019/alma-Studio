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
const databaseDir=await mkdtemp(join(tmpdir(),'hive-parity-'));
const databasePort=await freePort();const apiPort=await freePort();const testSecret=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir,user:'parity',password:'parity',port:databasePort,persistent:false});
let db,apiProcess;let logs='';
try {
await postgres.initialise();await postgres.start();await postgres.createDatabase('parity');
const databaseUrl=`postgres://parity:parity@127.0.0.1:${databasePort}/parity`;
db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query("SET TIME ZONE 'America/Mexico_City'");
await db.query(await readFile(new URL('../supabase/migrations/schema_complete.sql',import.meta.url),'utf8'));
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
const code='TEST'+Date.now();
const coupon=check(await request('/discount-codes','POST',{code,discountType:'percent',discountValue:20,maxUses:2,maxUsesPerUser:1}),201).data;
check(await request('/discount-codes'));
check(await request('/discount-codes/'+coupon.id+'/redemptions'));
check(await request('/discount-codes/'+coupon.id,'PUT',{isActive:false}));
check(await request('/discount-codes/'+coupon.id,'PUT',{isActive:true}));
check(await request('/discount-codes','POST',{code:code+'BAD',discountType:'percent',discountValue:101}),400);
check(await request('/discount-codes', 'GET',null,'reception'),403);
check(await request('/staff/reception/classes','GET',null,'reception'));
check(await request('/staff/instructor/classes','GET',null,'instructor'));
check(await request('/staff/instructor/classes?from=bad','GET',null,'instructor'),400);
check(await request('/staff/instructor/classes','GET',null,'client'),403);
check(await request('/reports/occupancy-by-slot'));
const plan=(await db.query("SELECT id FROM plans WHERE is_active=true LIMIT 1")).rows[0];
const mem=(await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',4,CURRENT_DATE,CURRENT_DATE+30) RETURNING id",[users.client,plan.id])).rows[0];
check(await request('/memberships/'+mem.id+'/pause','PUT',{reason:'Viaje del usuario'}));
check(await request('/memberships/'+mem.id+'/pause','PUT',{reason:'Viaje del usuario'}),409);
check(await request('/memberships/'+mem.id+'/resume','PUT',{}));
check(await request('/admin/plans/reorder','POST',{ids:[plan.id]}));
check(await request('/admin/classes/duplicate-week','POST',{sourceStart:'2026-10-05',targetStart:'2026-10-12'}));
check(await request('/discount-codes/'+coupon.id,'DELETE'));

const coach=(await db.query("INSERT INTO instructors(user_id,display_name) VALUES($1,'Coach prueba') RETURNING id",[users.instructor])).rows[0];
const type=(await db.query("SELECT id FROM class_types LIMIT 1")).rows[0];
const unlimitedPlan=(await db.query("INSERT INTO plans(name,price,class_limit,duration_days,class_category) VALUES('Ilimitado prueba',4200,NULL,30,'all') RETURNING id")).rows[0];
const limitedPlan=(await db.query("SELECT id FROM plans WHERE class_limit=4 LIMIT 1")).rows[0];
const makeClass=async(offset,time='09:00')=>(await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,CURRENT_DATE+$3::int,$4::time,$4::time+INTERVAL '1 hour',8) RETURNING id",[type.id,coach.id,offset,time])).rows[0].id;
const source=await makeClass(5);const target=await makeClass(6);const full=await makeClass(7);
const member=(await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',3,CURRENT_DATE,CURRENT_DATE+30) RETURNING id",[users.client,limitedPlan.id])).rows[0].id;
const booking=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[users.client,source,member])).rows[0].id;
const moved=check(await request('/bookings/'+booking+'/reschedule','POST',{newClassId:target},'client')).data;
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining,3);
assert.equal((await db.query('SELECT current_bookings FROM classes WHERE id=$1',[source])).rows[0].current_bookings,0);
assert.equal((await db.query('SELECT current_bookings FROM classes WHERE id=$1',[target])).rows[0].current_bookings,1);
await db.query('UPDATE classes SET max_capacity=0 WHERE id=$1',[full]);
check(await request('/bookings/'+moved.id+'/reschedule','POST',{newClassId:full},'client'),409);
assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[moved.id])).rows[0].status,'confirmed');
check(await request('/memberships/'+member+'/pause','PUT',{reason:'Pausa por viaje'}));
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining,4);
assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[moved.id])).rows[0].status,'cancelled');
await db.query("UPDATE memberships SET paused_at=NOW()-INTERVAL '3 days' WHERE id=$1",[member]);
assert.equal(check(await request('/memberships/'+member+'/resume','PUT',{})).pausedDays,3);
check(await request('/admin/users/'+users.client+'/credit-history'));
const um=(await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,start_date,end_date) VALUES($1,$2,'active',NULL,CURRENT_DATE,CURRENT_DATE+30) RETURNING id",[users.admin,unlimitedPlan.id])).rows[0].id;
const ub=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[users.admin,source,um])).rows[0].id;
check(await request('/bookings/'+ub+'/reschedule','POST',{newClassId:target}));
check(await request('/memberships/'+um+'/pause','PUT',{reason:'Viaje ilimitado'}));
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[um])).rows[0].classes_remaining,null);
const today=await makeClass(0);
check(await request('/staff/instructor/classes/'+today+'/roster','GET',null,'instructor'));
const currentTime=(await db.query("SELECT to_char(LOCALTIME,'HH24:MI') AS t")).rows[0].t;
await db.query("UPDATE classes SET start_time=$2::time,end_time=$2::time+INTERVAL '1 hour' WHERE id=$1",[today,currentTime]);
const staffBooking=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status) VALUES($1,$2,$3,'confirmed') RETURNING id",[users.client,today,member])).rows[0].id;
assert.equal(check(await request('/staff/bookings/'+staffBooking+'/check-in','PUT',{},'instructor')).data.already,false);
assert.equal(check(await request('/staff/bookings/'+staffBooking+'/check-in','PUT',{},'instructor')).data.already,true);
assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM loyalty_transactions WHERE user_id=$1 AND description='Clase asistida'",[users.client])).rows[0].n,1);
const foreignCoach=(await db.query("INSERT INTO instructors(user_id,display_name) VALUES($1,'Otra coach') RETURNING id",[users.admin])).rows[0].id;
await db.query('UPDATE classes SET instructor_id=$2 WHERE id=$1',[today,foreignCoach]);
check(await request('/staff/instructor/classes/'+today+'/roster','GET',null,'instructor'),404);
const past=await makeClass(-1);
const attended=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status,checked_in_at) VALUES($1,$2,$3,'checked_in',NOW()) RETURNING id",[users.client,past,member])).rows[0].id;
check(await request('/admin/bookings/'+attended+'/undo-check-in','PUT',{reason:'Marcada por error'}));
check(await request('/admin/bookings/'+attended+'/undo-check-in','PUT',{reason:'Marcada por error'}),409);
check(await request('/admin/classes/'+past+'/not-held','POST',{reason:'Cierre por mantenimiento'}));
check(await request('/admin/classes/'+past+'/not-held','POST',{reason:'Cierre por mantenimiento'}),409);
const noShowClass=await makeClass(-2);
const noShow=(await db.query("INSERT INTO bookings(user_id,class_id,membership_id,status,falta_recorded_at) VALUES($1,$2,$3,'no_show',NOW()) RETURNING id",[users.client,noShowClass,member])).rows[0].id;
await db.query('UPDATE users SET faltas_count=1 WHERE id=$1',[users.client]);
const beforeRefund=(await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining;
check(await request('/admin/classes/'+noShowClass+'/not-held','POST',{reason:'Clase no impartida'}));
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[member])).rows[0].classes_remaining,beforeRefund+1);
assert.equal((await db.query('SELECT faltas_count FROM users WHERE id=$1',[users.client])).rows[0].faltas_count,0);
assert.equal((await db.query('SELECT falta_recorded_at FROM bookings WHERE id=$1',[noShow])).rows[0].falta_recorded_at,null);
const duplicateDates=(await db.query("SELECT to_char(CURRENT_DATE+5,'YYYY-MM-DD') AS source,to_char(CURRENT_DATE+19,'YYYY-MM-DD') AS target")).rows[0];
assert.ok(check(await request('/admin/classes/duplicate-week','POST',{sourceStart:duplicateDates.source,targetStart:duplicateDates.target})).data.created>0);
assert.equal(check(await request('/admin/classes/duplicate-week','POST',{sourceStart:duplicateDates.source,targetStart:duplicateDates.target})).data.created,0);
assert.ok(check(await request('/admin/classes/cancel-day','POST',{day:duplicateDates.target,reason:'Estudio cerrado ese día'})).data.classes>0);
check(await request('/admin/integrations/stripe/status'));
const saleCode='SALE'+Date.now();
const saleCoupon=check(await request('/discount-codes','POST',{code:saleCode,discountType:'percent',discountValue:10,maxUses:5,maxUsesPerUser:1}),201).data;
const preview=check(await request('/admin/discount-codes/preview','POST',{code:saleCode,planId:limitedPlan.id,userId:users.client})).data;
check(await request('/memberships','POST',{userId:users.client,planId:limitedPlan.id,paymentMethod:'cash',discountCode:saleCode,amount:preview.finalAmount}),201);
check(await request('/memberships','POST',{userId:users.client,planId:limitedPlan.id,paymentMethod:'cash',discountCode:saleCode,amount:preview.finalAmount}),400);
assert.equal(check(await request('/discount-codes/'+saleCoupon.id+'/redemptions')).data.length,1);
check(await request('/discount-codes/'+saleCoupon.id,'DELETE'),409);
const raceCode='RACE'+Date.now();
check(await request('/discount-codes','POST',{code:raceCode,discountType:'percent',discountValue:10,maxUses:1}),201);
const race=await Promise.all([request('/orders','POST',{planId:limitedPlan.id,paymentMethod:'transfer',discountCode:raceCode},'client'),request('/orders','POST',{planId:limitedPlan.id,paymentMethod:'transfer',discountCode:raceCode},'admin')]);
assert.deepEqual(race.map(r=>r.status).sort(),[201,400],JSON.stringify(race));
const winner=race.findIndex(r=>r.status===201);const order=race[winner].data;
check(await request('/orders/'+order.id+'/cancel','POST',{},winner===0?'client':'admin'));
check(await request('/orders','POST',{planId:limitedPlan.id,paymentMethod:'transfer',discountCode:raceCode},'client'),201);
check(await request('/admin/broadcast/audience-count?audience=all'));
check(await request('/admin/broadcast/email','POST',{subject:'test',body:'test',audience:'all'}),503);
check(await request('/admin/users/'+users.client+'/reset-password','POST',{}),503);
console.log('PASS: CRUD coupons, redemption history, counter sales, per-user limits, concurrent last coupon, release on cancel, staff access, finite/unlimited reschedule and pause, seat counts, failed move rollback, resume dates, credit history, attendance undo and class not held.');


} catch(error) { console.error(logs);throw error; }
finally {
  if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
  if(db)await db.end();await postgres.stop();
}
