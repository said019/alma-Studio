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
 let providerPosts=0,activations=0,syncs=0,preference=null,preferenceBody=null,puts=0,searches=0;const freed=[];
 const account={ready:true,accessToken:'test-not-a-token',publicKey:'test-public',collectorId:'100',webhookSecret:'test-only-secret',baseUrl:options.baseUrl||'https://hive.example.test',webhookUrl:'https://hive.example.test/api/mercadopago/webhook'};
 const payment={id:String(Date.now())+String(Math.floor(Math.random()*100000)),external_reference:orderId,collector_id:100,currency_id:'MXN',transaction_amount:330,payment_type_id:'credit_card',status:'approved',status_detail:'accredited',...options.payment};
 const routes={};
 const app={get:(url,...handlers)=>routes[`GET ${url}`]=handlers.at(-1),post:(url,...handlers)=>routes[`POST ${url}`]=handlers.at(-1)};
 const registered=registerMercadoPago(app,{pool,auth(){},config:()=>account,hasWaiver:async()=>options.waiver!==false,purchaseConflict:async()=>options.conflict||null,finalizeOrder:async(db,id)=>{
  activations++;
  await db.query("UPDATE orders SET status='approved' WHERE id=$1",[id]);
  await db.query("INSERT INTO memberships(order_id,status) VALUES($1,'active')",[id]);
 },afterPayment:()=>{syncs++;},afterReversal:ids=>{freed.push(...ids);},fetchImpl:async(url,init)=>{
  if(url.includes('/checkout/preferences/')){
   if(init.method==='PUT'){
    puts++;
    if(options.switchTimeout)throw new Error('uncertain expiration');
    if(options.switchDelay)await new Promise(r=>setTimeout(r,40));
    preference={...preference,...JSON.parse(init.body),preference_expired:!options.expirationUnconfirmed};
   }
   return {ok:true,json:async()=>({...preference,...(options.preferenceMismatch?{items:[{currency_id:'MXN',quantity:1,unit_price:1}]}:{})})};
  }
  if(init.method==='POST'){
   providerPosts++;
   const body=JSON.parse(init.body);
   if(url.endsWith('/checkout/preferences')){
    preferenceBody=body;
    const expectedReturn=`${options.expectedReturnOrigin||account.baseUrl}/app/payment-return/${orderId}`;
    assert.deepEqual(body.back_urls,{success:expectedReturn,pending:expectedReturn,failure:expectedReturn});
    assert.equal(body.auto_return,'approved');
    assert.equal(body.purpose,'wallet_purchase');assert.equal(body.items[0].unit_price,330);assert.equal(body.external_reference,orderId);assert.equal(body.expires,true);assert.ok(body.expiration_date_to);
    if(options.timeout)throw new Error('ambiguous preference timeout');
    preference={id:'qa-preference-'+orderId,collector_id:100,external_reference:orderId,items:body.items,expires:true,expiration_date_to:body.expiration_date_to};
    return {ok:true,json:async()=>preference};
   }
   assert.equal(body.transaction_amount,330);assert.equal(body.external_reference,orderId);
   assert.ok(init.headers['X-Idempotency-Key']);
   if(options.beforeResponse)await options.beforeResponse();
   if(options.timeout)throw new Error('simulated timeout after provider accepted payment');
  }
  return {ok:true,json:async()=>{
   if(url.includes('/search?')){
    searches++;
    const all=options.payments||[payment];const offset=Number(new URL(url).searchParams.get('offset')||0);
    const empty=options.searchEmpty&&!(options.paymentAfterExpire&&puts>0);
    return {results:empty?[]:all.slice(offset,offset+50),paging:{total:empty?0:all.length}};
   }
   return options.payments?.find(p=>url.endsWith('/'+p.id))||payment;
  }};
 }});
 const call=async(method='GET',suffix='card-payment-session',body={},user=userId)=>{
  const res={code:200,status(n){this.code=n;return this;},json(data){this.body=data;return this;}};
  await routes[`${method} /api/orders/:id/${suffix}`]({userId:user,params:{id:orderId},body},res,()=>{});return res;
 };
 const submit=()=>call('POST','card-payment',{token:'test-token',payment_method_id:'visa',installments:1});
 const row=async()=> (await pool.query('SELECT * FROM orders WHERE id=$1',[orderId])).rows[0];
 return {orderId,userId,account,payment,call,submit,row,apply:registered.processVerifiedPayment,reconcile:registered.reconcile,preferenceBody:()=>preferenceBody,puts:()=>puts,posts:()=>providerPosts,activations:()=>activations,syncs:()=>syncs,freed};
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

async function isolateSweep(f){
 await pool.query("UPDATE orders SET mp_sync_attempted_at=NOW()+INTERVAL '1 day'");
 await pool.query('UPDATE orders SET mp_sync_attempted_at=NULL WHERE id=$1',[f.orderId]);
}
test('background sweep recovers missing webhook without client return and keeps provider paid_at',async()=>{
 const f=await fixture({timeout:true,payment:{date_approved:'2026-10-07T19:03:00Z',payment_method_id:'visa'}});
 await f.submit();await isolateSweep(f);
 const results=await Promise.all([f.reconcile({limit:1}),f.reconcile({limit:1})]);
 assert.equal(results.reduce((n,r)=>n+r.checked,0),1);assert.equal(f.activations(),1);
 const row=await f.row();assert.equal(row.status,'approved');assert.ok(row.provider_synced_at);assert.equal(row.mp_sync_claim,null);
 assert.equal(row.paid_at.toISOString(),'2026-10-07T19:03:00.000Z');assert.equal(row.mp_method_id,'visa');
});
test('full search records50extra movements and preserves the canonical payment',async()=>{
 const options={timeout:true,payments:[]};const f=await fixture(options);
 options.payments.push(...Array.from({length:51},(_,i)=>({...f.payment,id:String(900000000+i),status:i===50?'approved':'rejected'})));
 await f.submit();await isolateSweep(f);assert.equal((await f.reconcile()).failed,0);
 assert.equal(f.activations(),1);assert.equal((await f.row()).mp_payment_id,'900000050');
 assert.equal((await pool.query('SELECT COUNT(*)::int n FROM mp_payment_reviews WHERE order_id=$1',[f.orderId])).rows[0].n,50);
 options.payments[0].status='approved';await isolateSweep(f);await f.reconcile();
 assert.equal((await f.row()).mp_payment_id,'900000050');assert.equal(f.activations(),1);
});
test('failed sweeps release lease and rotate instead of starving other orders',async()=>{
 const f=await fixture({timeout:true,payment:{currency_id:'USD'}});await f.submit();await isolateSweep(f);
 assert.equal((await f.reconcile({limit:1})).failed,1);
 const row=await f.row();assert.ok(row.mp_sync_attempted_at);assert.ok(row.mp_sync_error);assert.equal(row.mp_sync_lease_until,null);assert.equal(row.provider_synced_at,null);
 assert.equal((await f.reconcile({limit:1})).checked,0);
});
test('cancellation rechecks provider and blocks late approval on previously rejected attempt',async()=>{
 const f=await fixture({payment:{status:'rejected'}});await f.submit();await f.call();
 f.payment.status='approved';const result=await f.call('POST','cancel');
 assert.equal(result.code,409);assert.equal((await f.row()).status,'approved');assert.equal(f.activations(),1);
});

test('first observed full refund records gross and reversal without granting access',async()=>{
 const f=await fixture({timeout:true,payment:{status:'refunded',date_approved:'2026-10-07T19:03:00Z'}});await f.submit();await isolateSweep(f);await f.reconcile();
 const row=await f.row();assert.equal(row.status,'approved');assert.equal(row.refund_status,'refunded');assert.equal(f.activations(),0);
 const refund=(await pool.query('SELECT SUM(amount)::numeric n FROM refunds WHERE order_id=$1',[f.orderId])).rows[0];
 assert.equal(Number(row.total_amount)-Number(refund.n),0);assert.ok(row.paid_at);
});
test('late POST cannot replace canonical attempt already fixed by authenticated webhook',async()=>{
 const options={};const f=await fixture(options);
 options.beforeResponse=async()=>{await f.apply({...f.payment,id:'887700001'},f.account);};
 assert.equal((await f.submit()).code,409);
 const attempt=(await pool.query('SELECT payment_id FROM mp_card_attempts WHERE order_id=$1',[f.orderId])).rows[0];
 assert.equal(attempt.payment_id,'887700001');assert.equal((await f.row()).mp_payment_id,'887700001');assert.equal(f.activations(),1);
 assert.equal((await pool.query('SELECT COUNT(*)::int n FROM mp_payment_reviews WHERE order_id=$1',[f.orderId])).rows[0].n,1);
});

async function walletFixture(options={}) {
 const f=await fixture({searchEmpty:true,...options});
 await pool.query("UPDATE orders SET expires_at=NOW()+INTERVAL '1 hour' WHERE id=$1",[f.orderId]);
 return f;
}
test('wallet preference is durable, repeatable and exclusive with card submission',async()=>{
 const f=await walletFixture();const first=await f.call('POST','mercadopago/wallet');assert.equal(first.code,200,JSON.stringify(first.body));
 const second=await f.call('POST','mercadopago/wallet');assert.equal(second.body.data.preferenceId,first.body.data.preferenceId);assert.equal(f.posts(),1);
 await f.submit();assert.equal(f.posts(),1);
 const state=(await f.call()).body.data;assert.equal(state.payment,null);assert.equal(state.paymentChoice,'wallet');assert.equal(state.canSubmit,false);assert.equal(state.walletAvailable,true);assert.equal(state.walletPreferenceId,first.body.data.preferenceId);
});
test('concurrent card and wallet creation reserves only one provider request',async()=>{
 const f=await walletFixture();await Promise.all([f.submit(),f.call('POST','mercadopago/wallet')]);assert.equal(f.posts(),1);
});
test('ambiguous wallet preference creation fails closed on retry',async()=>{
 const f=await walletFixture({timeout:true});assert.equal((await f.call('POST','mercadopago/wallet')).code,503);
 assert.equal((await f.call('POST','mercadopago/wallet')).code,409);assert.equal(f.posts(),1);assert.equal((await f.call()).body.data.walletAvailable,false);
});
test('wallet owner, waiver and expiry checks prevent preference creation',async()=>{
 const f=await walletFixture();assert.equal((await f.call('POST','mercadopago/wallet',{},crypto.randomUUID())).code,404);
 await pool.query("UPDATE orders SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[f.orderId]);assert.equal((await f.call('POST','mercadopago/wallet')).code,409);assert.equal(f.posts(),0);
 const unsigned=await walletFixture({waiver:false});assert.equal((await unsigned.call('POST','mercadopago/wallet')).code,403);assert.equal(unsigned.posts(),0);
});
test('account balance activates once only after wallet choice; wrong collector rejected',async()=>{
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');
 await assert.rejects(()=>f.apply({...f.payment,payment_type_id:'account_money',collector_id:200},f.account));assert.equal(f.activations(),0);
 await f.apply({...f.payment,payment_type_id:'account_money'},f.account);await f.apply({...f.payment,payment_type_id:'account_money'},f.account);assert.equal(f.activations(),1);
 const state=(await f.call()).body.data;assert.equal(state.walletAvailable,false);assert.equal(state.walletPreferenceId,null);
 const card=await fixture();await card.submit();await assert.rejects(()=>card.apply({...card.payment,payment_type_id:'account_money'},card.account));assert.equal(card.activations(),0);
});
test('cancelled wallet order sends late payment to review without activation',async()=>{
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[f.orderId]);
 await assert.rejects(()=>f.apply({...f.payment,payment_type_id:'account_money'},f.account));assert.equal(f.activations(),0);assert.equal((await f.call('POST','mercadopago/wallet')).code,409);
});

test('wallet rejects annual contracts and purchase conflicts without provider traffic',async()=>{
 const annual=await walletFixture();await pool.query(`UPDATE plans SET rules='{"auto_renew":true}' WHERE id=(SELECT plan_id FROM orders WHERE id=$1)`,[annual.orderId]);
 assert.equal((await annual.call('POST','mercadopago/wallet')).code,409);assert.equal(annual.posts(),0);
 const conflict=await walletFixture({conflict:{message:'Existing membership'}});assert.equal((await conflict.call('POST','mercadopago/wallet')).code,409);assert.equal(conflict.posts(),0);
});
test('pending or rejected provider wallet payment prevents preference reuse',async()=>{
 for(const status of ['pending','rejected']){
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');await f.apply({...f.payment,status,payment_type_id:'account_money'},f.account);
 assert.equal((await f.call('POST','mercadopago/wallet')).code,409);assert.equal(f.posts(),1);
 }
});

test('wallet can switch to card only after confirmed preference expiration and archives history',async()=>{
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');
 const result=await f.call('POST','mercadopago/use-card');assert.equal(result.code,200,JSON.stringify(result.body));assert.equal(result.body.data.canSubmit,true);assert.equal(f.puts(),1);
 assert.equal((await f.row()).mp_payment_choice,null);assert.equal((await pool.query('SELECT count(*)::int n FROM mp_retired_wallet_attempts WHERE order_id=$1',[f.orderId])).rows[0].n,1);
 assert.equal((await f.call()).body.data.canSubmit,true);assert.equal((await f.submit()).code,202);assert.equal(f.posts(),2);
});
test('wallet switch fails closed on uncertain, mismatched or unconfirmed provider expiration',async()=>{
 for(const options of [{switchTimeout:true},{expirationUnconfirmed:true},{preferenceMismatch:true},{paymentAfterExpire:true}]){
  const f=await walletFixture(options);await f.call('POST','mercadopago/wallet');const result=await f.call('POST','mercadopago/use-card');assert.ok([409,503].includes(result.code),JSON.stringify(result.body));
  assert.equal((await f.row()).mp_payment_choice,'wallet');assert.equal((await pool.query('SELECT count(*)::int n FROM mp_card_attempts WHERE order_id=$1',[f.orderId])).rows[0].n,1);
 }
});
test('wallet switch respects owner and expiry; concurrent switches release once',async()=>{
 const f=await walletFixture({switchDelay:true});await f.call('POST','mercadopago/wallet');assert.equal((await f.call('POST','mercadopago/use-card',{},crypto.randomUUID())).code,404);
 const results=await Promise.all([f.call('POST','mercadopago/use-card'),f.call('POST','mercadopago/use-card')]);assert.ok(results.every(r=>r.code===200));assert.equal(f.puts(),1);
 const expired=await walletFixture();await expired.call('POST','mercadopago/wallet');await pool.query("UPDATE orders SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",[expired.orderId]);assert.equal((await expired.call('POST','mercadopago/use-card')).code,409);assert.equal(expired.puts(),0);
});
test('wallet switch never releases an attempt already associated with a payment',async()=>{
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');await f.apply({...f.payment,status:'rejected'},f.account);
 assert.equal((await f.call('POST','mercadopago/use-card')).code,409);assert.equal(f.puts(),0);
});
test('retired wallet attempts remain reconciled and late money enters review without access',async()=>{
 const options={searchEmpty:true};const f=await fixture(options);await pool.query("UPDATE orders SET expires_at=NOW()+INTERVAL '1 hour' WHERE id=$1",[f.orderId]);
 await f.call('POST','mercadopago/wallet');assert.equal((await f.call('POST','mercadopago/use-card')).code,200);
 options.searchEmpty=false;f.payment.payment_type_id='account_money';
 await f.reconcile({limit:100});
 assert.equal((await pool.query('SELECT count(*)::int n FROM mp_payment_reviews WHERE order_id=$1',[f.orderId])).rows[0].n,1);assert.equal(f.activations(),0);
 assert.equal((await f.submit()).code,409);assert.equal(f.posts(),1);
});
test('existing manual review blocks direct card, wallet and repeated switch calls',async()=>{
 const f=await walletFixture();await f.call('POST','mercadopago/wallet');await f.call('POST','mercadopago/use-card');
 await pool.query("INSERT INTO mp_payment_reviews(order_id,payment_id,reason) VALUES($1,'999999','needs review')",[f.orderId]);
 assert.equal((await f.submit()).code,409);assert.equal((await f.call('POST','mercadopago/use-card')).code,409);assert.equal((await f.call('POST','mercadopago/wallet')).code,409);assert.equal(f.posts(),1);
});

test('wallet uses the requested allowed HIVE origin for all checkout return URLs',async()=>{
 const f=await walletFixture({baseUrl:'https://hivestudio.com.mx',expectedReturnOrigin:'https://www.hivestudio.com.mx'});
 const result=await f.call('POST','mercadopago/wallet',{returnOrigin:'https://www.hivestudio.com.mx'});assert.equal(result.code,200,JSON.stringify(result.body));
 assert.deepEqual(Object.values(f.preferenceBody().back_urls),Array(3).fill(`https://www.hivestudio.com.mx/app/payment-return/${f.orderId}`));
});
test('wallet never passes an untrusted return origin to Mercado Pago',async()=>{
 for(const origin of ['https://evil.test','https://hivestudio.com.mx.evil.test','https://evil@hivestudio.com.mx','http://hivestudio.com.mx','https://hivestudio.com.mx/app',{},null]){
 const f=await walletFixture({baseUrl:'https://hivestudio.com.mx'});
 const result=await f.call('POST','mercadopago/wallet',{returnOrigin:origin});assert.equal(result.code,200,JSON.stringify(result.body));
 assert.deepEqual(Object.values(f.preferenceBody().back_urls),Array(3).fill(`https://hivestudio.com.mx/app/payment-return/${f.orderId}`));
 }
});
