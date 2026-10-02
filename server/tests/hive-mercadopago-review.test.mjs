// Independent integration review: real PostgreSQL locks, isolated schema,
// fictitious provider responses. Never connects to Mercado Pago or charges money.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { MP_SCHEMA } from '../lib/mercadoPago.js';
import { registerMercadoPago } from '../lib/mercadoPagoRoutes.js';

const connectionString=process.env.DATABASE_URL||'postgres://alma:alma@127.0.0.1:5501/alma_fix';
const schema=`qa_mp_review_${crypto.randomBytes(6).toString('hex')}`;
const adminDb=new pg.Pool({connectionString});
let pool;
before(async()=>{
 await adminDb.query(`CREATE SCHEMA ${schema}`);
 pool=new pg.Pool({connectionString,options:`-c search_path=${schema},public`,max:8});
 await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY,email TEXT);
 CREATE TABLE plans(id UUID PRIMARY KEY,name TEXT,rules JSONB DEFAULT '{}');
 CREATE TABLE orders(id UUID PRIMARY KEY,user_id UUID,plan_id UUID,total_amount NUMERIC,status TEXT DEFAULT 'pending_payment',payment_method TEXT DEFAULT 'card',payment_provider TEXT DEFAULT 'mercadopago',stripe_session_id TEXT,expires_at TIMESTAMPTZ,refunded_amount NUMERIC DEFAULT 0,refund_status TEXT,refunded_at TIMESTAMPTZ,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE refunds(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID,user_id UUID,amount NUMERIC,kind TEXT,method TEXT,reference TEXT,reason TEXT,membership_cancelled BOOLEAN);
 CREATE TABLE memberships(id UUID PRIMARY KEY DEFAULT gen_random_uuid(),order_id UUID,status TEXT,cancellation_reason TEXT,updated_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE classes(id UUID PRIMARY KEY,date DATE,start_time TIME);
 CREATE TABLE bookings(id UUID PRIMARY KEY,membership_id UUID,class_id UUID,status TEXT,cancelled_at TIMESTAMPTZ,plan_late_cancel BOOLEAN);`);
 await pool.query(MP_SCHEMA);
});
after(async()=>{await pool?.end();await adminDb.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await adminDb.end();});

async function fixture(options={}) {
 const userId=crypto.randomUUID(),orderId=crypto.randomUUID(),planId=crypto.randomUUID();
 await pool.query('INSERT INTO users(id,email) VALUES($1,$2)',[userId,'qa@example.test']);
 await pool.query('INSERT INTO plans(id,name) VALUES($1,$2)',[planId,'QA HIVE']);
 await pool.query(`INSERT INTO orders(id,user_id,plan_id,total_amount,mp_checkout_mode,mp_collector_id) VALUES($1,$2,$3,330,'embedded','100')`,[orderId,userId,planId]);
 let providerPosts=0,activations=0,syncs=0;const freed=[];
 const account={ready:true,accessToken:'test-not-a-token',publicKey:'test-public',collectorId:'100',webhookSecret:'test-only-secret',webhookUrl:'https://hive.example.test/api/mercadopago/webhook'};
 const payment={id:String(Date.now())+String(Math.floor(Math.random()*100000)),external_reference:orderId,collector_id:100,currency_id:'MXN',transaction_amount:330,payment_type_id:'credit_card',status:'approved',status_detail:'accredited',...options.payment};
 const routes={};
 const app={get:(url,...handlers)=>routes[`GET ${url}`]=handlers.at(-1),post:(url,...handlers)=>routes[`POST ${url}`]=handlers.at(-1)};
 const registered=registerMercadoPago(app,{pool,auth(){},config:()=>account,hasWaiver:async()=>options.waiver!==false,purchaseConflict:async()=>null,finalizeOrder:async(db,id)=>{
  activations++;
  await db.query("UPDATE orders SET status='approved' WHERE id=$1",[id]);
  await db.query("INSERT INTO memberships(order_id,status) VALUES($1,'active')",[id]);
 },afterPayment:()=>{syncs++;},afterReversal:ids=>{freed.push(...ids);},fetchImpl:async(url,init)=>{
  if(init.method==='POST'){
   providerPosts++;
   const body=JSON.parse(init.body);
   assert.equal(body.transaction_amount,330);assert.equal(body.external_reference,orderId);
   assert.ok(init.headers['X-Idempotency-Key']);
   if(options.timeout)throw new Error('simulated timeout after provider accepted payment');
  }
  return {ok:true,json:async()=>url.includes('/search?')?{results:options.searchEmpty?[]:[payment]}:payment};
 }});
 const call=async(method='GET',suffix='card-payment-session',body={},user=userId)=>{
  const res={code:200,status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  await routes[`${method} /api/orders/:id/${suffix}`]({userId:user,params:{id:orderId},body},res,()=>{});return res;
 };
 const submit=()=>call('POST','card-payment',{token:'test-token',payment_method_id:'visa',installments:1});
 const row=async()=> (await pool.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0];
 return {orderId,userId,account,payment,call,submit,row,apply:registered.processVerifiedPayment,posts:()=>providerPosts,activations:()=>activations,syncs:()=>syncs,freed};
}

test('same-order concurrent submissions and confirmations charge and activate once',async()=>{
 const f=await fixture();const posts=await Promise.all([f.submit(),f.submit()]);
 assert.deepEqual(posts.map(r=>r.code),[202,202]);assert.equal(f.posts(),1);assert.equal(f.activations(),0);
 const sync=await Promise.all([f.call(),f.call()]);assert.ok(sync.every(r=>r.code===200));
 assert.equal(f.activations(),1);assert.equal(f.syncs(),1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM memberships WHERE order_id=$1',[f.orderId])).rows[0].n,1);
});
test('timeout keeps a durable attempt and recovers without resubmission',async()=>{
 const f=await fixture({timeout:true});assert.equal((await f.submit()).code,503);
 assert.equal((await f.submit()).code,202);assert.equal(f.posts(),1);
 const recovered=await f.call();assert.equal(recovered.code,200);assert.equal(recovered.body.data.orderStatus,'approved');assert.equal(f.activations(),1);assert.equal(f.posts(),1);
});
test('uncertain provider state blocks further charges without granting access',async()=>{
 const f=await fixture({timeout:true,searchEmpty:true});await f.submit();
 const state=await f.call();assert.equal(state.body.data.canSubmit,false);assert.equal(state.body.data.orderStatus,'pending_payment');
 await f.submit();assert.equal(f.posts(),1);assert.equal(f.activations(),0);
});
test('ownership and consent checks happen before any provider charge',async()=>{
 const f=await fixture();assert.equal((await f.call('POST','card-payment',{token:'test-token',payment_method_id:'visa',installments:1},crypto.randomUUID())).code,404);assert.equal(f.posts(),0);
 const unsigned=await fixture({waiver:false});assert.equal((await unsigned.submit()).code,403);assert.equal(unsigned.posts(),0);
});
test('mismatched amount, currency and collector never activate a membership',async()=>{
 for(const payment of [{transaction_amount:1},{currency_id:'USD'},{collector_id:101}]){
  const f=await fixture({payment});assert.equal((await f.submit()).code,409);assert.equal((await f.call()).code,409);assert.equal(f.activations(),0);
 }
});
test('3DS challenge is exposed for completion but does not activate access',async()=>{
 const f=await fixture({payment:{status:'pending',status_detail:'pending_challenge',three_ds_info:{external_resource_url:'https://issuer.example.test',creq:'challenge-only'}}});
 const first=await f.submit();assert.equal(first.body.data.threeDS.creq,'challenge-only');
 const state=await f.call();assert.equal(state.body.data.canSubmit,false);assert.equal(state.body.data.payment.statusDetail,'pending_challenge');assert.equal(f.activations(),0);
 f.payment.status='approved';f.payment.status_detail='accredited';await f.call();assert.equal(f.activations(),1);
});
test('late intermediate notifications and post-refund approvals cannot restore access',async()=>{
 const f=await fixture();await f.submit();await f.call();
 const classId=crypto.randomUUID();
 await pool.query("INSERT INTO classes(id,date,start_time) VALUES($1,CURRENT_DATE+2,'12:00')",[classId]);
 const member=(await pool.query('SELECT id FROM memberships WHERE order_id=$1',[f.orderId])).rows[0];
 await pool.query("INSERT INTO bookings(id,membership_id,class_id,status) VALUES($1,$2,$3,'confirmed')",[crypto.randomUUID(),member.id,classId]);
 await f.apply({...f.payment,status:'in_process'},f.account);assert.equal((await f.row()).mp_payment_status,'approved');
 await f.apply({...f.payment,status:'refunded'},f.account);
 await f.apply(f.payment,f.account);
 assert.equal((await f.row()).mp_payment_status,'refunded');assert.equal(f.activations(),1);
 assert.equal(Number((await f.row()).refunded_amount),330);
 await f.apply({...f.payment,status:'refunded'},f.account);
 assert.equal((await pool.query('SELECT count(*)::int n FROM refunds WHERE order_id=$1',[f.orderId])).rows[0].n,1);
 assert.ok(f.syncs()>=2);
 assert.deepEqual(f.freed,[classId]);
 assert.equal((await pool.query('SELECT status FROM memberships WHERE order_id=$1',[f.orderId])).rows[0].status,'cancelled');
});
test('existing embedded orders cannot be rebound after account configuration changes',async()=>{
 const f=await fixture();f.account.collectorId='999';
 const conversion=await f.call('POST','pay-with-card');assert.equal(conversion.code,409);
 assert.equal((await f.row()).mp_collector_id,'100');
});

test('partial refunds followed by full refund keep a single cumulative financial ledger',async()=>{
 const f=await fixture();await f.submit();await f.call();
 await f.apply({...f.payment,transaction_amount_refunded:100},f.account);
 await f.apply({...f.payment,transaction_amount_refunded:100},f.account);
 assert.equal(Number((await f.row()).refunded_amount),100);
 await f.apply({...f.payment,status:'refunded',transaction_amount_refunded:330},f.account);
 const totals=(await pool.query('SELECT count(*)::int n,sum(amount)::numeric total FROM refunds WHERE order_id=$1',[f.orderId])).rows[0];
 assert.equal(totals.n,2);assert.equal(Number(totals.total),330);
});
