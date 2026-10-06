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
const base={name:'Promoción QA',price:1200,opening_price:900,durationDays:30,classLimit:4,classCategory:'reformer_tower'};
const modes=[['studio',null,900],['disabled',null,1200],['price',800,800],['percent',15,1020],['amount',200,1000],['percent',100,0]];
for(const [promotion_mode,promotion_value,expected] of modes){
 const rules={promotion_mode,promotion_value,daily_class_limit:1};
 const made=check(await request('/plans','POST',{...base,name:base.name+promotion_mode+promotion_value,rules}),201).data;
 assert.equal(made.effectivePrice,expected);assert.equal(made.promotionActive,expected!==1200);
 assert.equal(made.openingActive,promotion_mode==='studio');
 const listed=check(await request('/plans?active=true')).data.find(p=>p.id===made.id);
 assert.equal(listed.effectivePrice,expected);assert.equal(listed.promotionLabel,expected===1200?null:promotion_mode==='studio'?'Precio de apertura':'Promoción');
 const order=check(await request('/orders','POST',{planId:made.id,paymentMethod:'transfer'},'client'),201).data;
 assert.equal(Number(order.subtotal),expected);assert.equal(Number(order.total_amount),expected);
 const partial=check(await request('/plans/'+made.id,'PUT',{description:'Actualizado sin borrar descuento'})).data;
 assert.equal(partial.effectivePrice,expected);assert.equal(partial.rules.daily_class_limit,1);
}
const fixed=check(await request('/plans','POST',{...base,rules:{promotion_mode:'amount',promotion_value:1100,daily_class_limit:1}}),201).data;
check(await request('/plans/'+fixed.id,'PUT',{price:1000}),400);
assert.equal(Number((await db.query('SELECT price FROM plans WHERE id=$1',[fixed.id])).rows[0].price),1200);
const adjusted=check(await request('/plans/'+fixed.id,'PUT',{price:1000,rules:{promotion_mode:'percent',promotion_value:10,daily_class_limit:1}})).data;
assert.equal(adjusted.effectivePrice,900);assert.equal(adjusted.openingActive,false);
for(const rules of [{promotion_mode:'percent',promotion_value:101},{promotion_mode:'amount',promotion_value:1201},{promotion_mode:'price',promotion_value:1201},{promotion_mode:'price',promotion_value:'800'},{promotion_mode:'percent',promotion_value:-1}]){
 check(await request('/plans','POST',{...base,rules}),400);
 check(await request('/plans/'+fixed.id,'PUT',{rules}),400);
}
const links={payment_url:'https://mpago.la/test-regular',opening_payment_url:'https://mpago.la/test-opening',auto_renew:true,billing_period:'month'};
const annual=check(await request('/plans','POST',{...base,rules:{...links,promotion_mode:'price',promotion_value:900}}),201).data;
assert.equal(annual.paymentUrl,null);
check(await request('/orders','POST',{planId:annual.id,paymentMethod:'card'},'client'),503);
const annualTransfer=check(await request('/orders','POST',{planId:annual.id,paymentMethod:'transfer'},'client'),201).data;
check(await request('/orders/'+annualTransfer.id+'/pay-with-card','POST',{},'client'),409);
const customLink='https://mpago.la/test-custom';
check(await request('/plans/'+annual.id,'PUT',{rules:{...links,promotion_mode:'price',promotion_value:900,promotion_payment_url:'javascript:alert(1)'}}),400);
const customLinked=check(await request('/plans/'+annual.id,'PUT',{rules:{...links,promotion_mode:'price',promotion_value:900,promotion_payment_url:customLink}})).data;
assert.equal(customLinked.paymentUrl,customLink);
const externalOrder=check(await request('/orders','POST',{planId:annual.id,paymentMethod:'card'},'client'),201).data;
assert.equal(externalOrder.checkout_url,customLink);assert.equal(externalOrder.mp_checkout_mode,'external');
const converted=check(await request('/orders/'+annualTransfer.id+'/pay-with-card','POST',{},'client')).data;
assert.equal(converted.checkout_url,customLink);assert.equal(converted.mp_checkout_mode,'external');
const enabled=check(await request('/plans/'+annual.id,'PUT',{rules:{...links,promotion_mode:'studio',promotion_value:null}})).data;
assert.equal(enabled.paymentUrl,links.opening_payment_url);
const disabled=check(await request('/plans/'+annual.id,'PUT',{rules:{...links,promotion_mode:'disabled',promotion_value:null}})).data;
assert.equal(disabled.paymentUrl,links.payment_url);
await db.query("UPDATE settings SET value=jsonb_set(value,'{opening_pricing_active}','false') WHERE key='general_settings'");
assert.equal(check(await request('/plans')).data.find(p=>p.id===fixed.id).effectivePrice,900,'custom unaffected by studio toggle');
check(await request('/plans','POST',base,'client'),403);
console.log('PASS: all 5 promotion modes, zero price, create/update/catalog consistency, transfer order totals, partial preservation and invalid reduced-base rollback, validation, annual-link safety and role access.');
} catch(error) { console.error(logs);throw error; }
finally {
 if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
 if(db)await db.end();await postgres.stop();
}
