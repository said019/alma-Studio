import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {CAMPAIGN_SCHEMA,enqueueCampaign,drainCampaigns} from '../lib/campaignOutbox.js';
import {registerCommunications} from '../lib/communications.js';
const url=process.env.DATABASE_URL;
if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Disposable local database required');
const schema='qa_campaign_'+crypto.randomBytes(6).toString('hex');
const admin=new pg.Pool({connectionString:url});let pool;
before(async()=>{await admin.query(`CREATE SCHEMA ${schema}`);pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema},public`});await pool.query(`CREATE TABLE users(id UUID PRIMARY KEY,email TEXT,display_name TEXT,phone TEXT,role TEXT,is_active BOOLEAN DEFAULT true,receive_promotions BOOLEAN DEFAULT true);CREATE TABLE memberships(user_id UUID,status TEXT,end_date DATE);`);await pool.query(CAMPAIGN_SCHEMA);});
after(async()=>{await pool?.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();});
async function fixture(){const id=crypto.randomUUID();await pool.query("INSERT INTO users(id,email,role,display_name)VALUES($1,$2,'client','Synthetic')",[id,id+'@example.invalid']);return{id,email:id+'@example.invalid',display_name:'Synthetic'};}
async function enqueue(user,key=crypto.randomUUID(),body='Synthetic body'){return enqueueCampaign(pool,{actorId:user.id,key,payload:{subject:'Test',body},recipients:[user]});}
test('durable intent replays after response loss and rejects changed payload',async()=>{
 const user=await fixture(),key=crypto.randomUUID();const results=await Promise.all([enqueue(user,key),enqueue(user,key)]);assert.equal(results[0].campaignId,results[1].campaignId);assert.equal(results[0].total,1);await assert.rejects(()=>enqueue(user,key,'Different'),{status:409});
 let sends=0;await Promise.all([drainCampaigns(pool,async()=>{sends++;return{id:'mock-provider'};}),drainCampaigns(pool,async()=>{sends++;return{id:'mock-provider'};})]);assert.equal(sends,1);
});
test('ambiguous provider failure retries same key and old leases require review',async()=>{
 const user=await fixture();const c=await enqueue(user);const keys=[];
 await drainCampaigns(pool,async p=>{keys.push(p.idempotencyKey);throw new Error('Simulated timeout');});
 await pool.query("UPDATE email_campaign_deliveries SET next_attempt_at=NOW() WHERE campaign_id=$1",[c.campaignId]);
 await drainCampaigns(pool,async p=>{keys.push(p.idempotencyKey);return{id:'provider-only-once'};});assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);
 const old=await enqueue(await fixture());await pool.query("UPDATE email_campaign_deliveries SET status='sending',first_attempt_at=NOW()-INTERVAL '25 hours',lease_until=NOW()-INTERVAL '1 minute' WHERE campaign_id=$1",[old.campaignId]);
 await drainCampaigns(pool,async()=>{throw new Error('must not send expired ambiguous retry');});assert.equal((await pool.query('SELECT status FROM email_campaign_deliveries WHERE campaign_id=$1',[old.campaignId])).rows[0].status,'needs_review');
});
test('withdrawn consent after enqueue skips provider and every audience honors opt-out',async()=>{
 const user=await fixture();const c=await enqueue(user);await pool.query('UPDATE users SET receive_promotions=false WHERE id=$1',[user.id]);
 let called=false;await drainCampaigns(pool,async()=>{called=true;return{id:'x'};});assert.equal(called,false);assert.equal((await pool.query('SELECT status FROM email_campaign_deliveries WHERE campaign_id=$1',[c.campaignId])).rows[0].status,'skipped');
 await pool.query('UPDATE users SET receive_promotions=false');
 const routes={};registerCommunications({get:(path,...h)=>routes[path]=h.at(-1),post:()=>{}},{pool,ownerMiddleware:()=>{}});
 for(const audience of ['all','accepts_communications','with_active_membership','without_membership']){
  let result;await routes['/api/admin/broadcast/audience-count']({query:{audience}},{json:r=>result=r,status(){return this;}});assert.equal(result.data.count,0,audience);
 }
});
