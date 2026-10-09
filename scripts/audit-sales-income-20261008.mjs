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

await db.query("INSERT INTO waivers(user_id,full_name,signature_data) VALUES($1,'Prueba aislada','synthetic-test-only')",[users.client]);
await db.query("INSERT INTO settings(key,value) VALUES('general_settings','{\"opening_pricing_active\":true}'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value");
const made=check(await request('/plans','POST',{name:'AUDIT sales',price:1000,durationDays:30,classLimit:4,classCategory:'reformer_tower',rules:{promotion_mode:'disabled'}}),201).data;
const saleBody={userId:users.client,planId:made.id,paymentMethod:'cash'};
const sale=check(await request('/memberships','POST',saleBody),201).data;
const ledger=()=>request('/payments?userId='+users.client);
assert.equal(check(await ledger()).total,1000);
check(await request('/memberships/'+sale.id+'/cancel','PUT',{reason:'Auditoría cancelación sin devolver dinero'}));
assert.equal(check(await ledger()).total,1000);
assert.equal(check(await request('/memberships/'+sale.id+'/cancel','PUT',{})).alreadyCancelled,true);
console.log('PASS cancel is idempotent and does not falsely remove collected cash');
const refundBody={kind:'total',method:'cash',reason:'Auditoría devolución ya realizada sintéticamente'};
const refunds=await Promise.all([request('/admin/orders/'+sale.order_id+'/refunds','POST',refundBody),request('/admin/orders/'+sale.order_id+'/refunds','POST',refundBody)]);
assert.deepEqual(refunds.map(x=>x.status).sort(),[201,409]);assert.equal(check(await ledger()).total,0);
assert.equal((await db.query('SELECT count(*)::int n FROM refunds WHERE order_id=$1',[sale.order_id])).rows[0].n,1);
console.log('PASS concurrent full refunds only one ledger entry; net income zero');
const second=check(await request('/memberships','POST',{...saleBody,paymentMethod:'transfer'}),201).data;
check(await request('/admin/orders/'+second.order_id+'/refunds','POST',{kind:'partial',amount:250,classesToRemove:1,method:'transfer',reason:'Auditoría devolución parcial'}),201);
assert.equal(check(await ledger()).total,750);
assert.equal((await db.query('SELECT classes_remaining FROM memberships WHERE id=$1',[second.id])).rows[0].classes_remaining,3);
console.log('PASS partial refund adjusts net income and class balance');
const pending=check(await request('/orders','POST',{planId:made.id,paymentMethod:'transfer'},'client'),201).data;
assert.equal(check(await ledger()).total,750);
const approvals=await Promise.all([request('/admin/orders/'+pending.id+'/verify','PUT',{}),request('/admin/orders/'+pending.id+'/verify','PUT',{})]);approvals.forEach(x=>check(x));
assert.equal((await db.query('SELECT count(*)::int n FROM memberships WHERE order_id=$1',[pending.id])).rows[0].n,1);
assert.equal(check(await ledger()).total,1750);
console.log('PASS concurrent transfer approvals one membership, one income amount; pending excluded');
check(await request('/memberships','POST',{...saleBody,amount:0}),400);
check(await request('/memberships','POST',{...saleBody,amount:0,reason:'Auditoría cortesía autorizada'}),201);
assert.equal(check(await ledger()).total,1750);
check(await request('/memberships','POST',saleBody,'client'),403);
check(await request('/admin/orders/'+second.order_id+'/refunds','POST',refundBody,'client'),403);
console.log('PASS courtesy needs reason; zero income and client cannot sell/refund');
const smallLedger=check(await request('/payments?userId='+users.client+'&limit=1'));
console.log('OBSERVATION ledger limit1 total',smallLedger.total,'full',check(await ledger()).total);
const duplicates=await Promise.all([request('/memberships','POST',saleBody),request('/memberships','POST',saleBody)]);
console.log('OBSERVATION duplicate sale statuses',duplicates.map(x=>x.status),'membershipIds distinct',duplicates[0].data?.id!==duplicates[1].data?.id);
const exp=check(await request('/orders','POST',{planId:made.id,paymentMethod:'transfer'},'client'),201).data;
await db.query("UPDATE orders SET status='expired',expires_at=NOW()-INTERVAL '1 hour' WHERE id=$1",[exp.id]);
const revived=await request('/admin/orders/'+exp.id+'/verify','PUT',{});console.log('OBSERVATION expired approval',revived.status,revived.data?.status);
const isolatedUser=(await db.query("INSERT INTO users(email,display_name,role) VALUES('auditor-ledger@example.invalid','AUDIT ledger','client') RETURNING id")).rows[0].id;
await db.query("INSERT INTO orders(user_id,plan_id,status,payment_method,total_amount,subtotal) SELECT $1,$2,'approved','cash',10,10 FROM generate_series(1,201)",[isolatedUser,made.id]);
const defaultLedger=check(await request('/payments?userId='+isolatedUser));
assert.equal(defaultLedger.data.length,200);assert.equal(defaultLedger.total,2000);
console.log('REPRODUCED default ledger truncation: 201 approved orders x10 =2010 DB; API rows200 total2000; UI uses rows for month KPI');
const previous=check(await request('/orders','POST',{planId:made.id,paymentMethod:'transfer'},'client'),201).data;
await db.query("UPDATE orders SET created_at=DATE_TRUNC('month',NOW())-INTERVAL '1 minute' WHERE id=$1",[previous.id]);
check(await request('/admin/orders/'+previous.id+'/verify','PUT',{}));
const paidMonth=(await db.query("SELECT to_char(created_at,'YYYY-MM') created_month,to_char(verified_at,'YYYY-MM') verified_month,paid_at FROM orders WHERE id=$1",[previous.id])).rows[0];
console.log('OBSERVATION previous month order approved today',JSON.stringify(paidMonth));
console.log('AUDIT COMPLETED');
} catch(error) { console.error(logs);throw error; }
finally {
 if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
 if(db)await db.end();await postgres.stop();
}
