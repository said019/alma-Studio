import test from 'node:test';import assert from 'node:assert/strict';import pg from 'pg';import EmbeddedPostgres from 'embedded-postgres';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import net from 'node:net';import {registerClientInvites} from './clientInvites.js';
test('invitation creates one client, expires, completes atomically and cannot be replayed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'hive-invite-'));const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});const postgres=new EmbeddedPostgres({databaseDir:dir,user:'test',password:'test',port,persistent:false});let db;
 try{await postgres.initialise();await postgres.start();await postgres.createDatabase('test');db=new pg.Pool({host:'127.0.0.1',port,user:'test',password:'test',database:'test'});
 await db.query(`CREATE TABLE settings(key text PRIMARY KEY,value jsonb); CREATE TABLE users(id uuid PRIMARY KEY,display_name text,email text UNIQUE,phone text,password_hash text,role text,is_active boolean,accepts_terms boolean,accepts_communications boolean,receive_promotions boolean,onboarding_completed boolean,gender text,date_of_birth date,privacy_notice_version text,privacy_accepted_at timestamptz,health_consent_version text,health_consent_at timestamptz,updated_at timestamptz)`);
 const routes=new Map();const admin=()=>{};let sent=0;
 registerClientInvites({post:(p,...h)=>routes.set(p,h)},{pool:db,adminMiddleware:admin,bcrypt:{hash:async()=>'hashed'},signToken:id=>'session-'+id,mapUser:u=>({id:u.id,email:u.email}),appPublicUrl:'https://example.invalid',whatsappChannelState:async()=>({connected:false}),queueWhatsAppSend:async()=>{sent++;},normalisePhone:p=>p,privacyVersion:'v1'});
 assert.equal(routes.get('/api/admin/clients/invite')[0],admin);
 const call=async(path,body)=>{const res={statusCode:200,status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};await routes.get(path).at(-1)({body,userId:'admin'},res);return res;};
 const first=await call('/api/admin/clients/invite',{displayName:'Ana Test',phone:'+525512345678'});assert.equal(first.statusCode,201);assert.equal(first.body.data.delivery,'manual');assert.equal(sent,0);
 const firstToken=new URL(first.body.data.link).searchParams.get('invite');
 const second=await call('/api/admin/clients/invite',{displayName:'Ana Test',phone:'+525512345678'});assert.equal(second.body.data.userId,first.body.data.userId);
 assert.equal((await call('/api/auth/invite-details',{inviteToken:firstToken})).statusCode,410);
 const token=new URL(second.body.data.link).searchParams.get('invite');assert.equal((await call('/api/auth/invite-details',{inviteToken:token})).body.data.displayName,'Ana Test');
 const profile={inviteToken:token,displayName:'Ana Test',phone:'+525512345678',email:'ana@example.com',password:'Password123',gender:'female',dateOfBirth:'1990-01-01',acceptsTerms:true};
 assert.equal((await call('/api/auth/complete-invite',{...profile,phone:'+525587654321'})).statusCode,400);
 const complete=await call('/api/auth/complete-invite',profile);assert.equal(complete.statusCode,200);assert.equal(complete.body.user.id,first.body.data.userId);
 assert.equal((await call('/api/auth/complete-invite',profile)).statusCode,410);
 assert.equal((await call('/api/admin/clients/invite',{displayName:'Ana Test',phone:'+525512345678'})).statusCode,409);
 const third=await call('/api/admin/clients/invite',{displayName:'Other User',phone:'+525587654321'});await db.query("UPDATE settings SET value=value||'{\"expiresAt\":0}'::jsonb");assert.equal((await call('/api/auth/invite-details',{inviteToken:new URL(third.body.data.link).searchParams.get('invite')})).statusCode,410);
 }finally{if(db)await db.end();await postgres.stop().catch(()=>{});await rm(dir,{recursive:true,force:true});}
});
