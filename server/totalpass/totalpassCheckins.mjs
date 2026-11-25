import crypto from 'node:crypto';
import express from 'express';
import {decryptCredentials,encryptCredentials} from './partnerConfiguration.mjs';

const ORIGIN='https://www.hivestudio.com.mx';
const BOOKING='https://booking-api.totalpass.com';
const GYM='https://gym-service-api.totalpass.com';
const WINDOW_MS=90*60*1000;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(code,status=502)=>Object.assign(Error(code),{code,status});
const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function checkinPath(secret,unitId){
 return '/webhooks/totalpass/checkin/'+crypto.createHmac('sha256',secret).update(`hive-only:${ORIGIN}:${unitId}`).digest('hex');
}
export function confirmationUrl(payload){
 const raw=payload?.endpoint??payload?.confirmation_url??payload?.confirmationUrl??payload?.check_in?.endpoint??payload?.checkin?.endpoint??payload?.data?.endpoint;
 try {const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!['totalpass.com','admin.totalpass.com'].includes(u.hostname)||!/^\/api\/v1\/webhook_confirmations\/[A-Za-z0-9_-]{8,512}$/.test(u.pathname))return null;
  return u.href;
 }catch{return null;}
}
export function checkinIdentity(payload,receivedAt=new Date()){
 const user=payload.user??payload.member??payload.customer??{};
 const raw=payload.check_in?.started_at??payload.checked_in_at??payload.timestamp;
 if(raw!=null&&(typeof raw!=='string'||!/(Z|[+-]\d\d:\d\d)$/.test(raw)||!Number.isFinite(Date.parse(raw))))throw fail('CHECKIN_TIMESTAMP_INVALID',400);
 const at=raw?new Date(raw):receivedAt;
 if(at.getTime()>receivedAt.getTime()+5*60000||at.getTime()<receivedAt.getTime()-WINDOW_MS)throw fail('CHECKIN_TIMESTAMP_OUT_OF_RANGE',400);
 const name=String(user.name??payload.name??'').trim().slice(0,200);
 const personId=String(user.id??payload.userId??'').trim().slice(0,200);
 return {name,personId,at:at.toISOString(),providerTimestamp:Boolean(raw)};
}
export function matchCheckin(rows,identity){
 const byId=identity.personId?rows.filter(b=>b.partner_metadata?.providerPersonId===identity.personId):[];
 if(byId.length)return byId.length===1?byId[0]:null;
 const byName=identity.name?rows.filter(b=>(!identity.personId||!b.partner_metadata?.providerPersonId)&&norm(String(b.guest_name||'').replace(/^TotalPass\s*[·:-]\s*/i,''))===norm(identity.name)):[];
 return byName.length===1?byName[0]:null;
}

export function createTotalpassCheckins({pool,secret,request=globalThis.fetch}){
 let timer,busy=false;
 async function configuration(db=pool){
  const row=(await db.query("SELECT config,credentials_encrypted,connection_status FROM partner_integration_config WHERE provider='totalpass'")).rows[0];
  if(!row?.config?.unitId||row.connection_status!=='verified')throw fail('TOTALPASS_NOT_CONFIGURED',409);
  return row;
 }
 async function providerCall(url,options={}){
  const response=await request(url,{...options,redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw fail('TOTALPASS_WEBHOOK_REQUEST_FAILED');
  return response.status===204?null:response.json();
 }
 async function register(){
  const row=await configuration();
  const creds=decryptCredentials('totalpass',row.credentials_encrypted,secret);
  const auth=await providerCall(BOOKING+'/partner/auth',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({partner_api_key:creds.partnerApiKey,place_api_key:creds.placeApiKey})});
  if(typeof auth?.token!=='string')throw fail('TOTALPASS_AUTH_INVALID');
  const headers={authorization:`Bearer ${auth.token}`,accept:'application/json'};
  const place=await providerCall(BOOKING+'/partner/plans',{headers});
  if(String(place?.identifier)!==row.config.unitId)throw fail('TOTALPASS_UNIT_MISMATCH',409);
  const url=ORIGIN+checkinPath(secret,row.config.unitId);
  const list=body=>Array.isArray(body)?body:Array.isArray(body?.data)?body.data:body?.webhook?[body.webhook]:body?.webhook_url?[body]:null;
  const before=list(await providerCall(GYM+'/partner/webhook/get',{headers}));
  if(!before)throw fail('TOTALPASS_WEBHOOK_RESPONSE_INVALID');
  if(before.some(h=>String(h.webhook_url??h.url)!==url))throw fail('TOTALPASS_OTHER_WEBHOOK_EXISTS',409);
  if(!before.length)await providerCall(GYM+'/partner/webhook/create',{method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify({webhook_url:url,webhook_type:'CHECKIN'})});
  const after=list(await providerCall(GYM+'/partner/webhook/get',{headers}));
  if(!after?.some(h=>String(h.webhook_url??h.url)===url))throw fail('TOTALPASS_WEBHOOK_NOT_VERIFIED');
  await pool.query('INSERT INTO totalpass_checkin_registration(unit_id) VALUES($1) ON CONFLICT(unit_id) DO UPDATE SET verified_at=now()',[row.config.unitId]);
  return {registered:true};
 }
 async function reconcile(event,db){
  if(!event.identity_encrypted)return;
  const identity=decryptCredentials('totalpass',event.identity_encrypted,secret);
  await db.query('BEGIN');
  try {
   // Same class-first lock order as imports/cancellations. Re-read people only
   // after locking the candidate classes; a racing rename/import cannot change
   // which person a unique match points to between lookup and attendance write.
   const classes=(await db.query(`SELECT id FROM classes WHERE status='scheduled'
     AND ABS(EXTRACT(EPOCH FROM(((date+start_time) AT TIME ZONE 'America/Mexico_City')-$1::timestamptz)))<=$2 ORDER BY id FOR UPDATE`,[new Date(event.checkin_at),WINDOW_MS/1000])).rows;
   const candidates=(await db.query(`SELECT id,class_id,guest_name,partner_metadata FROM bookings
     WHERE class_id=ANY($1::uuid[]) AND partner_provider='totalpass' AND status IN ('confirmed','checked_in') ORDER BY id FOR UPDATE`,[classes.map(c=>c.id)])).rows;
   const match=matchCheckin(candidates,identity);
   if(!match){await db.query("UPDATE totalpass_checkin_events SET state='unmatched',reason='NO_UNIQUE_BOOKING',updated_at=now() WHERE event_hash=$1",[event.event_hash]);await db.query('COMMIT');return;}
   const result=await db.query(`UPDATE bookings SET status='checked_in',checked_in_at=COALESCE(checked_in_at,$2),updated_at=now(),
     partner_metadata=partner_metadata || $3::jsonb WHERE id=$1 AND partner_provider='totalpass' AND status IN ('confirmed','checked_in') RETURNING id`,[match.id,event.checkin_at,JSON.stringify({checkinSource:'totalpass_webhook',attendanceTimeKnown:identity.providerTimestamp})]);
   await db.query(`UPDATE totalpass_checkin_events SET state=$2,booking_id=$3,reason=$4,identity_encrypted=CASE WHEN $2='matched' THEN NULL ELSE identity_encrypted END,updated_at=now() WHERE event_hash=$1`,[event.event_hash,result.rowCount?'matched':'unmatched',result.rowCount?match.id:null,result.rowCount?null:'BOOKING_CHANGED']);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}
 }
 async function receive(pathKey,payload){
  const row=await configuration();
  const expected=checkinPath(secret,row.config.unitId).split('/').pop();
  if(typeof pathKey!=='string'||!(/^[a-f0-9]{64}$/.test(pathKey))||!crypto.timingSafeEqual(Buffer.from(pathKey),Buffer.from(expected)))throw fail('NOT_FOUND',404);
  if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('CHECKIN_INVALID',400);
  const unit=payload.place?.identifier??payload.unit_id??payload.unitId;
  if(unit!=null&&String(unit)!==row.config.unitId)throw fail('TOTALPASS_UNIT_MISMATCH',403);
  const url=confirmationUrl(payload);if(!url)throw fail('CHECKIN_CONFIRMATION_INVALID',400);
  const identity=checkinIdentity(payload);
  const eventHash=hash(row.config.unitId+':'+new URL(url).pathname);
  const db=await pool.connect();let locked=false;
  try {
   locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',['hive:tp-checkin:'+eventHash])).rows[0].ok;
   if(!locked)throw fail('CHECKIN_BUSY',503);
   await db.query(`INSERT INTO totalpass_checkin_events(event_hash,unit_id,state,identity_encrypted,checkin_at) VALUES($1,$2,'received',$3,$4) ON CONFLICT DO NOTHING`,[eventHash,row.config.unitId,encryptCredentials('totalpass',identity,secret),identity.at]);
   let event=(await db.query('SELECT * FROM totalpass_checkin_events WHERE event_hash=$1',[eventHash])).rows[0];
   if(event.state==='matched'||event.state==='rejected'||event.state==='uncertain')return {status:event.state};
   if(!['confirmed','unmatched'].includes(event.state)){
    // Persist the dispatch intent before calling the provider. A timeout or restart
    // after they accept the confirmation must never trigger a second POST.
    await db.query("UPDATE totalpass_checkin_events SET state='uncertain',reason='CONFIRMATION_IN_FLIGHT',updated_at=now() WHERE event_hash=$1",[eventHash]);
    let response;
    try {response=await request(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000)});}
    catch {await db.query("UPDATE totalpass_checkin_events SET state='uncertain',reason='CONFIRMATION_NETWORK_ERROR',updated_at=now() WHERE event_hash=$1",[eventHash]);throw fail('CHECKIN_CONFIRMATION_UNCERTAIN');}
    const state=response.ok?'confirmed':response.status>=500||response.status===429?'uncertain':'rejected';
    await db.query('UPDATE totalpass_checkin_events SET state=$2,reason=$3,updated_at=now() WHERE event_hash=$1',[eventHash,state,response.ok?null:'CONFIRMATION_FAILED']);
    if(state==='uncertain')throw fail('CHECKIN_CONFIRMATION_UNCERTAIN');
    if(state==='rejected')return {status:'rejected'};
    event={...event,state};
   }
   await reconcile(event,db);
   return {status:(await db.query('SELECT state FROM totalpass_checkin_events WHERE event_hash=$1',[eventHash])).rows[0].state};
  }finally{if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',['hive:tp-checkin:'+eventHash]);db.release();}
 }
 async function retryUnmatched(){
  if(busy)return;busy=true;
  let db;
  try {const row=await configuration();db=await pool.connect();
   const events=(await db.query("SELECT * FROM totalpass_checkin_events WHERE unit_id=$1 AND state IN ('confirmed','unmatched') AND received_at>now()-interval '7 days' ORDER BY updated_at,event_hash LIMIT 100",[row.config.unitId])).rows;
   for(const pending of events){
    const lock='hive:tp-checkin:'+pending.event_hash;
    const locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok',[lock])).rows[0].ok;
    if(!locked)continue;
    try {const event=(await db.query('SELECT * FROM totalpass_checkin_events WHERE event_hash=$1',[pending.event_hash])).rows[0];
     if(event&&['confirmed','unmatched'].includes(event.state))await reconcile(event,db);
    }finally{await db.query('SELECT pg_advisory_unlock(hashtext($1))',[lock]);}
   }
   await db.query("UPDATE totalpass_checkin_events SET identity_encrypted=NULL WHERE identity_encrypted IS NOT NULL AND received_at<now()-interval '30 days'");
  }catch(e){if(e.code!=='TOTALPASS_NOT_CONFIGURED')console.warn('[totalpass-checkin] reconciliation unavailable');}finally{db?.release();busy=false;}
 }
 async function status(){
  const row=await configuration();
  const registration=(await pool.query('SELECT verified_at FROM totalpass_checkin_registration WHERE unit_id=$1',[row.config.unitId])).rows[0];
  const events=(await pool.query('SELECT state,COUNT(*)::int AS count,MAX(received_at) AS last_received FROM totalpass_checkin_events WHERE unit_id=$1 GROUP BY state',[row.config.unitId])).rows;
  return {registered:Boolean(registration),verifiedAt:registration?.verified_at??null,events};
 }
 return {register,receive,status,retryUnmatched,start(){timer=setInterval(()=>void retryUnmatched(),60000);timer.unref();},stop(){clearInterval(timer);}};
}

export function installTotalpassCheckins(app,{pool,secret,adminMiddleware,limiter}){
 const service=createTotalpassCheckins({pool,secret});
 const wrap=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||500).json({message:e.code||'TOTALPASS_CHECKIN_FAILED'});}};
 app.post('/webhooks/totalpass/checkin/:key',limiter,express.json({limit:'64kb'}),wrap(async(req,res)=>res.json(await service.receive(req.params.key,req.body))));
 const admin='/api/admin/partner-integrations/totalpass/checkins';
 app.get(admin,adminMiddleware,wrap(async(req,res)=>res.json({data:await service.status()})));
 app.post(admin,adminMiddleware,wrap(async(req,res)=>res.json({data:await service.register()})));
 return service;
}
