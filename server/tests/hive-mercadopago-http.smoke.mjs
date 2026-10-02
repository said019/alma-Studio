// Standalone real HTTP/finalizeOrder smoke. Isolated temporary database, fake MP only.
// DATABASE_URL must point at the LOCAL QA database whose schema may be copied.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import {CATALOG_PLANS} from '../lib/catalog.js';
const source=new URL(process.env.DATABASE_URL||'postgres://saidromero@127.0.0.1:5432/hive_conditions_qa');
assert.ok(['127.0.0.1','localhost'].includes(source.hostname),'LOCAL QA only');
const name=`hive_mp_http_${Date.now()}`, target=new URL(source);target.pathname=`/${name}`;
const admin=new pg.Pool({connectionString:source.href});let db,child,logs='';
const dir=await mkdtemp(path.join(tmpdir(),'hive-mp-http-'));const stats=path.join(dir,'provider.json');
try {
 await admin.query(`CREATE DATABASE ${name}`);
 const dump=execFileSync('pg_dump',['--schema-only','--no-owner','--no-privileges',source.href],{maxBuffer:32*1024*1024});
 execFileSync('psql',['-X','-v','ON_ERROR_STOP=1',target.href],{input:dump,stdio:['pipe','ignore','pipe']});
 const preload=path.join(dir,'mock.mjs');
 await writeFile(preload,`import {writeFileSync} from 'node:fs';
let posts=0,payment;
globalThis.fetch=async(url,init={})=>{
 if(!String(url).startsWith('https://api.mercadopago.com/v1/payments'))throw new Error('QA outbound network blocked');
 if(init.method==='POST') { const b=JSON.parse(init.body);posts++;payment={id:'99001122',status:'approved',status_detail:'accredited',external_reference:b.external_reference,transaction_amount:b.transaction_amount,currency_id:'MXN',collector_id:100,payment_type_id:'credit_card',live_mode:false};writeFileSync(${JSON.stringify(stats)},JSON.stringify({posts,body:b})); }
 return {ok:true,json:async()=>String(url).includes('/search?')?{results:payment?[payment]:[]}:payment};
};`);
 child=spawn(process.execPath,['--import',preload,'server/index.js'],{cwd:process.cwd(),env:{PATH:process.env.PATH,HOME:process.env.HOME,DOTENV_CONFIG_PATH:'/dev/null',DATABASE_URL:target.href,PORT:'8118',NODE_ENV:'test',JWT_SECRET:'qa-local-http-only',MP_ENABLED:'true',MP_ACCESS_TOKEN:'TEST-no-real-token',MP_PUBLIC_KEY:'TEST-no-real-key',MP_WEBHOOK_SECRET:'qa-only-secret',MP_COLLECTOR_ID:'100',MP_WEBHOOK_BASE_URL:'https://qa.example.test',WAITLIST_SWEEP_MINUTES:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
 const base='http://127.0.0.1:8118';let ready=false;
 for(let i=0;i<120;i++){try{const r=await fetch(`${base}/api/payments/card-readiness`);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}
 assert.ok(ready,logs);
 db=new pg.Pool({connectionString:target.href});
 const user=(await db.query("INSERT INTO users(display_name,email,phone,role,accepts_terms,is_active) VALUES('QA HTTP','qa-http@example.test','5555555555','client',true,true) RETURNING id")).rows[0];
 const hive20=CATALOG_PLANS.find(p=>p.name==='20 Clases');
 const plan=(await db.query("INSERT INTO plans(name,price,currency,duration_days,class_limit,is_active,rules,class_category) VALUES('QA HTTP 20',$1,'MXN',$2,$3,true,$4,$5) RETURNING id",[hive20.price,hive20.duration_days,hive20.class_limit,JSON.stringify(hive20.rules),hive20.class_category])).rows[0];
 const token=jwt.sign({sub:user.id},'qa-local-http-only');
 const call=async(route,body)=>{const r=await fetch(base+'/api'+route,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 assert.equal((await call('/orders',{planId:plan.id,paymentMethod:'card'})).status,403);
 const png=Buffer.alloc(2033);Buffer.from([137,80,78,71,13,10,26,10]).copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(600,16);png.writeUInt32BE(200,20);
 const waiver=await call('/me/waiver',{full_name:'QA HTTP',phone:'5555555555',waiver_version:'v3',signature_data:`data:image/png;base64,${png.toString('base64')}`,emergency_contact_name:'QA Contact',emergency_contact_phone:'5511111111'});assert.equal(waiver.status,201,JSON.stringify(waiver));
 const order=await call('/orders',{planId:plan.id,paymentMethod:'card'});assert.equal(order.status,201,JSON.stringify(order));const id=order.body.data.id;
 assert.equal(order.body.data.payment_provider,'mercadopago');assert.equal(Number(order.body.data.total_amount),4400);
 const payload={token:'qa-token-only',payment_method_id:'visa',installments:1};
 const submitted=await Promise.all([call(`/orders/${id}/card-payment`,payload),call(`/orders/${id}/card-payment`,payload)]);assert.ok(submitted.every(r=>r.status===202),JSON.stringify(submitted));
 const synced=await Promise.all([call(`/orders/${id}/card-payment-sync`,{}),call(`/orders/${id}/card-payment-sync`,{})]);assert.ok(synced.every(r=>r.status===200&&r.body.data.orderStatus==='approved'),JSON.stringify(synced));
 const memberships=(await db.query('SELECT *,end_date::date-start_date::date days FROM memberships WHERE order_id=$1',[id])).rows;
 assert.equal(memberships.length,1);assert.equal(memberships[0].status,'active');assert.equal(memberships[0].classes_remaining,20);assert.equal(memberships[0].days,59);assert.equal(memberships[0].payment_method,'card');
 const provider=JSON.parse(await readFile(stats,'utf8'));assert.equal(provider.posts,1);assert.equal(provider.body.transaction_amount,4400);assert.equal(provider.body.external_reference,id);assert.equal(provider.body.three_d_secure_mode,'optional');
 await call(`/orders/${id}/card-payment-sync`,{});assert.equal((await db.query('SELECT count(*)::int n FROM memberships WHERE order_id=$1',[id])).rows[0].n,1);
 console.log('PASS real HTTP: waiver gate, order amount4400, concurrent submit1, real finalize membership20 credits/60 inclusive calendar days, repeated sync idempotent. No real provider network.');
} catch(e){console.error(logs.slice(-8000));throw e;} finally {
 if(child && child.exitCode===null && child.signalCode===null){const exited=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await exited;}
 await db?.end();await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);await admin.end();await rm(dir,{recursive:true,force:true});
}
