// Fully isolated integration test: creates its own disposable database and API.
// Never reads .env, existing DATABASE_URL, mail credentials or production data.
import pg from 'pg';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
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
await db.query(await readFile(new URL('../supabase/migrations/schema_complete.sql',import.meta.url),'utf8'));
// schema_complete.sql is legacy and omits schedule_slots. Mirror the deployed
// Sunday=0 schema for this disposable fixture; never migrate a real database here.
await db.query(`CREATE TABLE schedule_slots (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), time_slot VARCHAR(20) NOT NULL,
 day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
 class_type_id UUID REFERENCES class_types(id) ON DELETE SET NULL,
 class_type_name VARCHAR(100), instructor_name VARCHAR(100), is_active BOOLEAN DEFAULT true,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);

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

const results=[];
const note=(name,data)=>{results.push({name,...data});console.log(JSON.stringify(results.at(-1)));};
const uid=async(name)=>{const id=(await db.query("INSERT INTO users(email,display_name,role) VALUES($1,$2,'client') RETURNING id",[name+'@example.invalid',name])).rows[0].id;await db.query("INSERT INTO waivers(user_id,full_name,signature_data) VALUES($1,'QA','synthetic')",[id]);return id;};
const coach=(await db.query("INSERT INTO instructors(user_id,display_name) VALUES($1,'QA coach') RETURNING id",[users.instructor])).rows[0].id;
const type=(await db.query("INSERT INTO class_types(name,category) VALUES('QA Reformer','reformer_tower') RETURNING id")).rows[0].id;
const cls=async(cap=1,days=3)=> (await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,CURRENT_DATE+$3::int,'12:00','13:00',$4) RETURNING id",[type,coach,days,cap])).rows[0].id;
const plan=async(rules={},limit=4)=>check(await request('/plans','POST',{name:'QA plan',price:330,durationDays:30,classLimit:limit,classCategory:'reformer_tower',rules}),201).data.id;
const mem=async(user,planid,credits=4)=>(await db.query("INSERT INTO memberships(user_id,plan_id,status,start_date,end_date,classes_remaining,payment_method) VALUES($1,$2,'active',CURRENT_DATE,CURRENT_DATE+30,$3,'cash') RETURNING id",[user,planid,credits])).rows[0].id;
const bal=async(id)=>(await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[id])).rows[0].classes_remaining;
const p=await plan();const u1=await uid('qa-a'),u2=await uid('qa-b');users.a=u1;users.b=u2;
const m1=await mem(u1,p),m2=await mem(u2,p);const c=await cls();
const race=await Promise.all(['a','b'].map(role=>request('/bookings','POST',{classId:c},role)));
note('last-seat-race',{responses:race});
const persisted=(await db.query('SELECT user_id,status FROM bookings WHERE class_id=$1',[c])).rows;assert.equal(persisted.filter(x=>x.status==='confirmed').length,1);assert.equal(persisted.filter(x=>x.status==='waitlist').length,1);
assert.equal((await bal(m1))+(await bal(m2)),7);note('race-invariants',{persisted,balances:[await bal(m1),await bal(m2)]});
const winner=persisted.find(x=>x.status==='confirmed');const booking=(await db.query("SELECT id FROM bookings WHERE class_id=$1 AND user_id=$2",[c,winner.user_id])).rows[0].id;
const role=winner.user_id===u1?'a':'b';
const cancel=await Promise.all([request('/bookings/'+booking,'DELETE',undefined,role),request('/bookings/'+booking,'DELETE',undefined,role)]);note('double-cancel-promotion',{responses:cancel,balances:[await bal(m1),await bal(m2)],rows:(await db.query('SELECT status,user_id FROM bookings WHERE class_id=$1',[c])).rows});
assert.equal(cancel.filter(x=>x.status===200).length,1);
const noPack=await uid('qa-no-pack');note('assign-no-package',{response:await request('/admin/bookings/assign','POST',{classId:await cls(),userId:noPack})});
const gp=await plan({guest_passes:2,guest_pass_period:'membership'},null);const host=await uid('qa-host');const hm=await mem(host,gp,null);const gc=await cls(8);
for(let i=0;i<3;i++){note('host-guest-'+(i+1),{response:await request('/admin/classes/'+gc+'/walkin-visit','POST',{profile:{name:'QA guest '+i,phone:'551234560'+i,acceptedWaiver:true},hostUserId:host})});}
note('guest-limit-persisted',{count:(await db.query('SELECT count(*)::int n FROM bookings WHERE membership_id=$1',[hm])).rows[0].n,credits:await bal(hm)});
const future=await uid('qa-future');users.future=future;const fm=await mem(future,p);await db.query('UPDATE memberships SET start_date=CURRENT_DATE+10 WHERE id=$1',[fm]);note('future-membership',{response:await request('/bookings','POST',{classId:await cls()},'future')});
const hourUser=await uid('qa-hours');users.hours=hourUser;await mem(hourUser,await plan({booking_start_time:'17:00',booking_end_time:'20:00'}));note('wrong-hours',{response:await request('/bookings','POST',{classId:await cls(8)},'hours')});
const limitedHost=await uid('qa-limited-host');const limitedMem=await mem(limitedHost,await plan({guest_passes:2}),4);note('limited-host-before',{credits:await bal(limitedMem)});note('limited-host-guest',{response:await request('/admin/classes/'+await cls(8)+'/walkin-visit','POST',{profile:{name:'QA limited guest',phone:'5512345698',acceptedWaiver:true},hostUserId:limitedHost}),creditsAfter:await bal(limitedMem)});
const checkUser=await uid('qa-check');users.check=checkUser;const checkMem=await mem(checkUser,p,1);const checkClass=await cls(8,0);await db.query("UPDATE classes SET start_time=((NOW() AT TIME ZONE 'America/Mexico_City')::time),end_time=((NOW() AT TIME ZONE 'America/Mexico_City')::time + interval '1 hour') WHERE id=$1",[checkClass]);const checkBook=check(await request('/admin/bookings/assign','POST',{classId:checkClass,userId:checkUser}),201).data.booking;note('checkin-zero-credit',{before:await bal(checkMem),first:await request('/bookings/'+checkBook.id+'/check-in','PUT',{}),second:await request('/bookings/'+checkBook.id+'/check-in','PUT',{}),after:await bal(checkMem)});
const nsuser=await uid('qa-noshow');users.ns=nsuser;const nsm=await mem(nsuser,p);const nsc=await cls(8);const nsbk=check(await request('/bookings','POST',{classId:nsc},'ns'),201).booking;note('future-noshow',{response:await request('/bookings/'+nsbk.id+'/no-show','PUT',{}),credits:await bal(nsm)});
const waituser=await uid('qa-wait-noshow');users.wns=waituser;const waitm=await mem(waituser,p);const wb=check(await request('/bookings','POST',{classId:c},'wns'),201).booking;note('waitlist-noshow',{before:wb.status,response:await request('/bookings/'+wb.id+'/no-show','PUT',{}),credits:await bal(waitm)});
note('walkin-sell-normal-package',{response:await request('/admin/classes/'+await cls(8)+'/walkin-visit','POST',{profile:{name:'QA paid visitor',phone:'5512345699',acceptedWaiver:true},sale:{planId:p,paymentMethod:'cash'}})});
const saleClientUser=await uid('qa-sale-normal');const saleClass=await cls(8);note('normal-sale-assign-before',{response:await request('/admin/bookings/assign','POST',{classId:saleClass,userId:saleClientUser})});const normalSale=await request('/memberships','POST',{userId:saleClientUser,planId:p,paymentMethod:'cash',amount:330,idempotencyKey:randomUUID()});note('normal-package-sale',{response:normalSale});note('normal-sale-assign-after',{response:await request('/admin/bookings/assign','POST',{classId:saleClass,userId:saleClientUser}),memberships:(await db.query('SELECT classes_remaining,order_id FROM memberships WHERE user_id=$1',[saleClientUser])).rows});
const receptionClient=await uid('qa-reception-sale');note('reception-normal-sale',{response:await request('/memberships','POST',{userId:receptionClient,planId:p,paymentMethod:'cash',amount:330,idempotencyKey:randomUUID()},'reception')});note('reception-assign',{response:await request('/admin/bookings/assign','POST',{classId:await cls(8),userId:saleClientUser},'reception')});
const moveUser=await uid('qa-move');users.move=moveUser;const mm=await mem(moveUser,p,1);const from=await cls(8),to=await cls(8,4);const mb=check(await request('/bookings','POST',{classId:from},'move'),201).booking;note('reschedule-zero-remaining',{response:await request('/bookings/'+mb.id+'/reschedule','POST',{newClassId:to},'move'),credits:await bal(mm)});
note('occupancy-consistency',{mismatches:(await db.query("SELECT c.id,c.current_bookings,COUNT(b.id)::int AS actual FROM classes c LEFT JOIN bookings b ON b.class_id=c.id AND b.status IN ('confirmed','checked_in') GROUP BY c.id HAVING c.current_bookings<>COUNT(b.id)")).rows});
assert.equal(await bal(limitedMem),4,'Included guest pass must not debit regular credit');
assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[nsbk.id])).rows[0].status,'confirmed','Future no-show rejected');
assert.equal((await db.query('SELECT status FROM bookings WHERE id=$1',[wb.id])).rows[0].status,'waitlist','Waitlist no-show rejected');
const goodRegister={displayName:'QA Register',email:'qa-reg@example.invalid',password:'Testing123',phone:'+14155552671',gender:'other',dateOfBirth:'2000-02-29',acceptsTerms:true};
for (const change of [{password:'a'},{phone:'123'},{acceptsTerms:false},{dateOfBirth:'2001-02-29'}]) check(await request('/auth/register','POST',{...goodRegister,...change}),400);
const registration=check(await request('/auth/register','POST',goodRegister),201);assert.equal(registration.user.phone,'+14155552671');
note('registration-validation',{invalidRejected:4,validInternational:201});
const includedBooking=(await db.query('SELECT id FROM bookings WHERE membership_id=$1',[limitedMem])).rows[0].id;
check(await request('/admin/bookings/'+includedBooking,'DELETE',{reason:'QA incluido',refundCredit:true}));assert.equal(await bal(limitedMem),4,'Cancellation of included pass must not mint regular credit');
// Cancelling an included pass releases its allowance without minting a credit.
const replacementClass=await cls(8);
const replacement=check(await request('/admin/classes/'+replacementClass+'/walkin-visit','POST',{profile:{name:'QA replacement guest',phone:'5512345671',acceptedWaiver:true},hostUserId:limitedHost}),201);
assert.equal(await bal(limitedMem),4);
const beforeRollback=(await db.query('SELECT count(*)::int n FROM guest_profiles')).rows[0].n;
const rejected=await request('/admin/classes/'+await cls(8)+'/walkin-visit','POST',{profile:{name:'QA rollback guest',phone:'5512345672',acceptedWaiver:true},sale:{planId:p,paymentMethod:'cash'}});
check(rejected,404);
assert.equal((await db.query('SELECT count(*)::int n FROM guest_profiles')).rows[0].n,beforeRollback,'Rejected visit sale rolls back newly created guest');
assert.equal(await bal(limitedMem),4);
note('guest-rollback-and-reuse',{replacement:replacement.status,rollback:rejected.status,credits:await bal(limitedMem)});
const nsPositive=check(await request('/bookings/'+checkBook.id+'/no-show','PUT',{}));assert.equal(nsPositive.data.status,'no_show');const nsRepeat=check(await request('/bookings/'+checkBook.id+'/no-show','PUT',{}));assert.equal(nsRepeat.alreadyNoShow,true);
note('fixed-pass-cancellation-and-noshow',{guestCredits:await bal(limitedMem),alreadyNoShow:nsRepeat.alreadyNoShow});
console.log('API_ERRORS' ,logs.split('\n').filter(l=>/error|Error|walkin|limit|violat/i.test(l)).join('\n'));console.log('AUDIT COMPLETE');
} catch(error) { console.error(logs);throw error; }
finally {
 if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
 if(db)await db.end();await postgres.stop();
}
