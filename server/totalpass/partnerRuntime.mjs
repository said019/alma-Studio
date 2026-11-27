import crypto from 'node:crypto';
import { decryptCredentials, partnerAvailability, assertPartner } from './partnerConfiguration.mjs';
import { createTotalpassAdapter } from './partnerTotalpass.mjs';

const active = new Set(['confirmed','checked_in']);
// These Fitpass failures occur only during catalog/lesson validation, before
// publish sends any external mutation. Network/write/verification errors are
// deliberately absent: their outcome must be reconciled instead of retried.
const PREWRITE_CREATE_ERRORS = new Set(['FITPASS_LESSON_MISSING','FITPASS_LESSON_AMBIGUOUS',
  'FITPASS_RESERVATIONS_RESPONSE_INVALID','FITPASS_RESERVATION_ROW_INVALID',
  'FITPASS_RESERVATIONS_REQUIRE_REVIEW']);
export function canRetryPartnerCreate(link) {
  return !link?.external_id && (link?.state==='retryable'||PREWRITE_CREATE_ERRORS.has(link?.last_error));
}
// Only actual remote occupancy awaiting import reduces the shared physical pool.
// Advertised channel capacity is a ceiling, never a fixed allotment.
export const PARTNER_RESERVED_SQL = `(SELECT COALESCE(SUM(GREATEST(l.remote_booked-(SELECT COUNT(*) FROM bookings pb WHERE pb.class_id=l.class_id AND pb.partner_provider=l.provider AND pb.status IN ('confirmed','checked_in')),0)),0) FROM partner_class_links l WHERE l.class_id=c.id)`;
export function normalizePartnerTitle(value) {
  const title=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return ['functional strength','funcional'].includes(title)?'funcional':title;
}
const dateKey=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export function matchPartnerClass(remote, locals) {
  const title = normalizePartnerTitle(remote.title);
  const legacyCoach = /^clases? ([a-z]+)$/.exec(title)?.[1];
  const matching = locals.filter(local => {
    if (dateKey(local.date) !== remote.date || local.time.slice(0,5) !== remote.time.slice(0,5)) return false;
    if (normalizePartnerTitle(local.title) === title) return true;
    // HIVE's original TotalPass calendar used the coach's first name as the class title.
    return legacyCoach && normalizePartnerTitle(local.title) === 'pilates reformer'
      && normalizePartnerTitle(remote.coach).split(' ')[0] === legacyCoach
      && normalizePartnerTitle(local.coach).split(' ')[0] === legacyCoach;
  });
  return matching.length===1?matching[0]:null;
}
export function sharedPartnerCapacity({capacity,totalBooked,channelBooked,remoteBooked,maxSpots,buffer,otherHeld=0}) {
  const pending=Math.max(0,remoteBooked-channelBooked);
  const booked=Math.max(channelBooked,remoteBooked);
  return Math.max(booked,partnerAvailability({capacity,totalBooked:totalBooked+pending+otherHeld,channelBooked:booked,maxSpots,buffer}).capacityToPublish);
}
function cleanError(e){for(const v of [e?.code,e?.message])if(/^[A-Z][A-Z0-9_]{2,80}$/.test(v||''))return v;if(/^[0-9A-Z]{5}$/.test(e?.code||''))return `DATABASE_${e.code}`;return 'PARTNER_OPERATION_FAILED';}
function hash(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function dayOffset(date,days){const d=new Date(`${date}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function future(c){return Date.parse(`${dateKey(c.date)}T${c.time.slice(0,5)}:00-06:00`)>Date.now();}

export function createPartnerRuntime({pool,secret,getPolicies,adapters={totalpass:createTotalpassAdapter}}) {
  let stopped=false,timer=null,running=false,rerun=false,listener=null,connecting=false;
  const issue=async(provider,key,code,detail={})=>pool.query(`INSERT INTO partner_sync_issues(provider,issue_key,code,detail) VALUES($1,$2,$3,$4)
    ON CONFLICT(provider,issue_key) DO UPDATE SET code=$3,detail=$4,last_seen_at=NOW(),resolved_at=NULL`,[provider,key,code,detail]);
  async function run(provider,{manual=false,maxClasses=Infinity}={}) {
    assertPartner(provider);
    const db=await pool.connect();let locked=false;
    const summary={mapped:0,published:0,updated:0,cancelled:0,imported:0,issues:0};
    const seenIssues=new Set();
    const problem=async(key,code,detail={})=>{summary.issues++;seenIssues.add(key);await issue(provider,key,code,detail);};
    try {
      locked=(await db.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked',[`hive:partner-runtime:${provider}`])).rows[0].locked;
      if(!locked)return {busy:true};
      const row=(await db.query('SELECT * FROM partner_integration_config WHERE provider=$1',[provider])).rows[0];
      if(!row?.sync_enabled&&!manual)return {disabled:true};
      if(row?.connection_status!=='verified')throw Error('PARTNER_CONNECTION_NOT_VERIFIED');
      await db.query("UPDATE partner_integration_config SET last_sync_status='running',last_sync_at=NOW(),last_sync_summary=$2 WHERE provider=$1",[provider,summary]);
      const config=row.config,policies=await getPolicies();
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const from=dayOffset(today,-7),to=dayOffset(today,Math.min(config.horizonDays,policies.maxAdvanceDays));
      const adapter=adapters[provider]({credentials:decryptCredentials(provider,row.credentials_encrypted,secret),unitId:config.bookingUnitId ?? config.unitId,config});
      const catalog=await adapter.catalog({from,to});
      if(!catalog.complete||!Array.isArray(catalog.classes)||!Array.isArray(catalog.bookings))throw Error('PARTNER_CATALOG_INCOMPLETE');
      for(const warning of catalog.issues||[])await problem(`provider:${warning.key}`,warning.code,warning.detail||{});
      const locals=(await db.query(`SELECT c.id,c.date::text,LEFT(c.start_time::text,5) AS time,
        (EXTRACT(EPOCH FROM(c.end_time-c.start_time))/60)::int AS duration,c.max_capacity,c.status,
        ct.name AS title,ct.description,COALESCE(i.display_name,'Equipo HIVE') AS coach
        FROM classes c JOIN class_types ct ON ct.id=c.class_type_id LEFT JOIN instructors i ON i.id=c.instructor_id
        WHERE c.date BETWEEN $1::date AND $2::date ORDER BY c.date,c.start_time,c.id`,[from,to])).rows;
      const external=new Map(catalog.classes.map(c=>[String(c.externalId),c]));
      if(external.size!==catalog.classes.length)throw Error('PARTNER_DUPLICATE_EXTERNAL_CLASSES');
      const links=(await db.query('SELECT * FROM partner_class_links WHERE provider=$1',[provider])).rows;
      const byExternal=new Map(links.filter(l=>l.external_id).map(l=>[l.external_id,l]));
      const byLocal=new Map(links.map(l=>[l.class_id,l]));
      const candidates=new Map();
      for(const remote of catalog.classes){const local=matchPartnerClass(remote,locals);if(local){const list=candidates.get(local.id)||[];list.push(remote);candidates.set(local.id,list);}}
      for(const [id,matches] of candidates)if(matches.length>1)await problem(`duplicate:${id}`,'MULTIPLE_EXTERNAL_CLASSES',{title:matches[0].title,date:matches[0].date,time:matches[0].time});
      for(const remote of catalog.classes) {
        if(byExternal.has(String(remote.externalId)))continue;
        const local=matchPartnerClass(remote,locals);
        if(!local) { if(remote.date>=today&&remote.date<=to)await problem(`external:${remote.externalId}`,'EXTERNAL_CLASS_NOT_MATCHED',{title:remote.title,date:remote.date,time:remote.time});continue; }
        if(seenIssues.has(`duplicate:${local.id}`))continue;
        if(remote.metadata?.externalReference&&String(remote.metadata.externalReference)!==local.id){await problem(`duplicate:${local.id}`,'EXTERNAL_REFERENCE_CONFLICT',{title:local.title,date:local.date,time:local.time});continue;}
        if(byLocal.get(local.id)?.external_id&&byLocal.get(local.id).external_id!==String(remote.externalId)) {
          await problem(`duplicate:${local.id}`,'MULTIPLE_EXTERNAL_CLASSES',{title:local.title,date:local.date,time:local.time});continue;
        }
        await db.query(`INSERT INTO partner_class_links(provider,class_id,external_id,state) VALUES($1,$2,$3,'linked')
          ON CONFLICT(provider,class_id) DO UPDATE SET external_id=$3,state='linked',updated_at=NOW() WHERE partner_class_links.external_id IS NULL`,[provider,local.id,String(remote.externalId)]);
        const link={class_id:local.id,external_id:String(remote.externalId),state:'linked'};byLocal.set(local.id,link);byExternal.set(link.external_id,link);summary.mapped++;
      }
      // Record real external occupancy before importing names. Published capacity
      // remains diagnostic only; unsold channel places do not block direct sales.
      const observed=new Map();
      for(const remote of catalog.classes){
        const classId=byExternal.get(String(remote.externalId))?.class_id||matchPartnerClass(remote,locals)?.id;
        if(!classId)continue;
        if(byLocal.get(classId)?.state==='cancelled'&&locals.some(c=>c.id===classId&&c.status==='cancelled'))continue;
        const amount=Math.max(Number(remote.capacity),Number(remote.booked));
        if(!Number.isSafeInteger(amount)||amount<0)throw Error('PARTNER_CAPACITY_INVALID');
        const previous=observed.get(classId)||{capacity:0,booked:0};
        observed.set(classId,{capacity:previous.capacity+amount,booked:previous.booked+Number(remote.booked)});
      }
      for(const [classId,inventory] of observed){
        const held=inventory.capacity;
        if(!Number.isSafeInteger(held)||held<0)throw Error('PARTNER_CAPACITY_INVALID');
        await db.query('BEGIN');
        try{await db.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[classId]);
          await db.query(`INSERT INTO partner_class_links(provider,class_id,state,capacity_hold,remote_booked) VALUES($1,$2,'reconciliation',$3,$4)
            ON CONFLICT(provider,class_id) DO UPDATE SET capacity_hold=GREATEST(partner_class_links.capacity_hold,$3),remote_booked=$4`,[provider,classId,held,inventory.booked]);
          await db.query('COMMIT');
        }catch(e){await db.query('ROLLBACK');throw e;}
      }
      // Import only explicit provider states. Absence never cancels a booking.
      for(const booking of catalog.bookings) {
        let link=byExternal.get(String(booking.classExternalId));
        if(!link&&['cancelled','no_show'].includes(booking.status))link=(await db.query('SELECT class_id FROM bookings WHERE partner_provider=$1 AND partner_external_id=$2',[provider,String(booking.externalId)])).rows[0];
        if(!link||!booking.externalId||!['confirmed','cancelled','checked_in','no_show'].includes(booking.status)) {
          await problem(`booking:${booking.externalId||hash(booking).slice(0,16)}`,'EXTERNAL_BOOKING_NOT_MATCHED');continue;
        }
        await db.query('BEGIN');
        try {
          const lockedClass=(await db.query('SELECT id,status FROM classes WHERE id=$1 FOR UPDATE',[link.class_id])).rows[0];
          // A pre-delete provider snapshot cannot undo the studio's cancellation.
          // Keep existing attendance history; active remote snapshots do not create
          // or reactivate any local booking after its class has been cancelled.
          if(lockedClass?.status==='cancelled'&&active.has(booking.status)){await db.query('COMMIT');continue;}
          const existing=(await db.query('SELECT * FROM bookings WHERE partner_provider=$1 AND partner_external_id=$2 FOR UPDATE',[provider,String(booking.externalId)])).rows[0];
          if(existing&&existing.class_id!==link.class_id)throw Error('EXTERNAL_BOOKING_CLASS_CHANGED');
          // One guest-only row = one seat; never merge customers by an unverified email/name.
          const providerName={totalpass:'TotalPass',fitpass:'Fitpass',wellhub:'Wellhub'}[provider]||provider;
          const name=`${providerName} · ${String(booking.name||booking.externalId)}`.slice(0,200);
          const checkedAt=typeof booking.checkedInAt==='string'&&Number.isFinite(Date.parse(booking.checkedInAt))?booking.checkedInAt:null;
          const metadata={...existing?.partner_metadata,providerConfirmed:true,providerStatus:booking.status,attendanceTimeKnown:Boolean(checkedAt),providerPersonId:booking.personId?String(booking.personId):null};
          if(existing?.partner_metadata?.checkinSource==='totalpass_webhook'){
            metadata.checkinSource='totalpass_webhook';
            metadata.attendanceTimeKnown=existing.partner_metadata.attendanceTimeKnown===true;
          }
          if(existing) {
            const cancelledByStudio = existing.partner_metadata?.personAction?.state === 'verified' && existing.partner_metadata?.personAction?.action === 'cancel';
            const status=(cancelledByStudio ? 'cancelled' : null) || existing.partner_metadata?.localPartnerOverride?.status || (existing.status==='checked_in'&&booking.status==='confirmed'?'checked_in':booking.status);
            await db.query(`UPDATE bookings SET status=$3::text::booking_status,guest_name=$4,partner_metadata=$5,
              checked_in_at=CASE WHEN $3::text='checked_in' THEN COALESCE(checked_in_at,$6::timestamptz) ELSE checked_in_at END,
              cancelled_at=CASE WHEN $3::text='cancelled' THEN COALESCE(cancelled_at,NOW()) ELSE NULL END,updated_at=NOW()
              WHERE partner_provider=$1 AND partner_external_id=$2`,[provider,String(booking.externalId),status,name,metadata,checkedAt]);
          } else {
            await db.query(`INSERT INTO bookings(channel,class_id,user_id,membership_id,status,guest_name,partner_provider,partner_external_id,partner_metadata,checked_in_at,cancelled_at)
              VALUES('totalpass',$1,NULL,NULL,$2::text::booking_status,$3,$4,$5,$6,CASE WHEN $2::text='checked_in' THEN $7::timestamptz END,CASE WHEN $2::text='cancelled' THEN NOW() END)`,[link.class_id,booking.status,name,provider,String(booking.externalId),metadata,checkedAt]);
          }
          await recount(db,link.class_id);
          await db.query('COMMIT');summary.imported++;
        } catch(e){await db.query('ROLLBACK');await problem(`booking:${booking.externalId}`,cleanError(e));}
      }
      let processedClasses=0;
      for(const original of locals) {
        if(!future(original)&&original.status!=='cancelled')continue;
        if(processedClasses>=maxClasses)break;
        const link=byLocal.get(original.id),remote=link?.external_id?external.get(link.external_id):null;
        if (!link?.external_id && catalog.classes.some(c => c.date === original.date && c.time === original.time)) {
          await problem(`class:${original.id}`, 'EXISTING_TIME_REQUIRES_REVIEW', {title:original.title,date:original.date,time:original.time});
          continue;
        }
        // Cancellation is acknowledged by a verified delete or a complete
        // catalog confirming absence after local cancellation.
        if(original.status==='cancelled'&&link?.state==='cancelled')continue;
        if(seenIssues.has(`duplicate:${original.id}`))continue;
        // Never recreate an external class lost from a catalog: that could duplicate it.
        if(link?.external_id&&!remote&&original.status!=='cancelled'){await problem(`class:${original.id}`,'LINKED_CLASS_NOT_IN_CATALOG',{title:original.title,date:original.date});continue;}
        if(!remote&&!['scheduled','cancelled'].includes(original.status))continue;
        processedClasses++;
        let createAttempt=false,publishReturned=false;
        await db.query('BEGIN');
        try {
          const fresh=(await db.query(`SELECT CASE WHEN status::text='closed' THEN 'scheduled' ELSE status::text END AS status,(status::text='closed') AS booking_closed,date::text,LEFT(start_time::text,5) AS time,(EXTRACT(EPOCH FROM(end_time-start_time))/60)::int AS duration,max_capacity FROM classes WHERE id=$1 FOR UPDATE`,[original.id])).rows[0];
          const local={...original,...fresh};
          if(link?.external_id&&!remote&&local.status!=='cancelled')throw Error('LINKED_CLASS_NOT_IN_CATALOG');
          const quotaRow=(await db.query('SELECT quota FROM partner_class_quotas WHERE class_id=$1 AND provider=$2',[local.id,provider])).rows[0];
          const maxSpots=local.booking_closed?0:(quotaRow?.quota??config.maxSpots);
          const counts=(await db.query(`SELECT COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND NULLIF(guest_name,'') IS NOT NULL THEN 2 ELSE 1 END),0)::int AS total,
            COUNT(*) FILTER(WHERE partner_provider=$2)::int AS channel FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')`,[local.id,provider])).rows[0];
          if(counts.total>local.max_capacity)await problem(`overbooked:${local.id}`,'PHYSICAL_CAPACITY_EXCEEDED',{title:local.title,date:local.date,total:counts.total,capacity:local.max_capacity});
          const held=0;
          const otherHeld=Number((await db.query(`SELECT COALESCE(SUM(GREATEST(l.remote_booked-(SELECT COUNT(*) FROM bookings b WHERE b.class_id=l.class_id AND b.partner_provider=l.provider AND b.status IN ('confirmed','checked_in')),0)),0)::int AS held
            FROM partner_class_links l WHERE l.class_id=$1 AND l.provider<>$2`,[local.id,provider])).rows[0].held);
          const capacity=local.booking_closed?Math.max(counts.channel,Number(remote?.booked||0)):sharedPartnerCapacity({capacity:local.max_capacity,totalBooked:counts.total+held,channelBooked:counts.channel,remoteBooked:Number(remote?.booked||0),maxSpots,buffer:config.buffer,otherHeld});
          if(!remote&&(capacity===0||local.booking_closed)&&local.status!=='cancelled'){await db.query('COMMIT');continue;}
          const opts={capacity,cancellationHours:config.cancellationHours??policies.cancellationHours,externalReference:local.id};
          const desired=hash({local,opts});
          if(local.status==='scheduled'&&link?.synced_hash===desired&&remote&&Number(remote.capacity)===capacity&&remote.time===local.time&&remote.date===local.date&&remote.coach===local.coach&&normalizePartnerTitle(remote.title)===normalizePartnerTitle(local.title)){await db.query("UPDATE partner_class_links SET state='synced',last_error=NULL,updated_at=NOW() WHERE class_id=$1 AND provider=$2",[local.id,provider]);await db.query('COMMIT');continue;}
          await db.query(`INSERT INTO partner_class_links(provider,class_id,state,desired_hash) VALUES($1,$2,'pending',$3)
            ON CONFLICT(provider,class_id) DO UPDATE SET state='pending',desired_hash=$3,updated_at=NOW()`,[provider,local.id,desired]);
          await db.query('UPDATE partner_class_links SET capacity_hold=GREATEST(capacity_hold,$3) WHERE provider=$1 AND class_id=$2',[provider,local.id,capacity]);
          // Commit the durable intent before sending a mutation. Reconciliation, not blind retries, handles unknown outcomes.
          await db.query('COMMIT');
          const current=(await db.query('SELECT sync_enabled,revision FROM partner_integration_config WHERE provider=$1',[provider])).rows[0];
          if((!current.sync_enabled&&!manual)||current.revision!==row.revision)throw Error('PARTNER_CONFIGURATION_CHANGED');
          let verifiedCapacity;
          if(local.status==='cancelled'){
            if(remote){const result=await adapter.cancel(remote);if(result?.status!=='cancelled')throw Error('PARTNER_CANCEL_NOT_VERIFIED');}
            verifiedCapacity=0;summary.cancelled++;
          }
          else if(local.status!=='scheduled')continue;
          else if(remote){const result=await adapter.update(remote,local,opts);verifiedCapacity=Number(result?.capacity);summary.updated++;}
          else {
            if(provider!=='wellhub'&&link?.state==='uncertain'&&!canRetryPartnerCreate(link)){await problem(`class:${local.id}`,'PUBLISH_OUTCOME_UNCERTAIN',{title:local.title,date:local.date});continue;}
            // A pending create after restart is uncertain until the catalog establishes an exact unique match.
            if(provider!=='wellhub'&&link&&!link.external_id&&!canRetryPartnerCreate(link)){await problem(`class:${local.id}`,'PUBLISH_REQUIRES_RECONCILIATION',{title:local.title,date:local.date});continue;}
            // Clear the previous prewrite error before trying again: a crash
            // during this attempt must not inherit permission for a blind retry.
            await db.query("UPDATE partner_class_links SET state='uncertain',last_error=NULL WHERE provider=$1 AND class_id=$2",[provider,local.id]);
            createAttempt=true;
            let created=await adapter.publish(local,opts);
            publishReturned=true;
            if(!created?.externalId)throw Error('PUBLISH_OUTCOME_UNCERTAIN');
            await db.query('UPDATE partner_class_links SET external_id=$3 WHERE provider=$1 AND class_id=$2',[provider,local.id,String(created.externalId)]);
            if(Number(created.capacity)!==capacity)created=await adapter.update(created,local,opts);
            verifiedCapacity=Number(created?.capacity);
            summary.published++;
          }
          if(!Number.isSafeInteger(verifiedCapacity)||verifiedCapacity<0)throw Error('PARTNER_CAPACITY_NOT_VERIFIED');
          await db.query('BEGIN');
          await db.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[local.id]);
          if(local.status==='cancelled'){
            await db.query('UPDATE partner_class_links SET remote_booked=0 WHERE provider=$1 AND class_id=$2',[provider,local.id]);
            await db.query(`UPDATE bookings SET status='cancelled',cancelled_at=COALESCE(cancelled_at,NOW()),updated_at=NOW()
              WHERE class_id=$1 AND partner_provider=$2 AND status IN ('confirmed','waitlist')`,[local.id,provider]);
            await recount(db,local.id);
          }
          await db.query("UPDATE partner_class_links SET capacity_hold=$4,state=$5,synced_hash=$3,last_error=NULL,updated_at=NOW() WHERE provider=$1 AND class_id=$2",[provider,local.id,desired,verifiedCapacity,local.status==='cancelled'?'cancelled':'synced']);
          await db.query('COMMIT');
        } catch(e){await db.query('ROLLBACK').catch(()=>{});const code=cleanError(e);const retryable=createAttempt&&!publishReturned&&PREWRITE_CREATE_ERRORS.has(code);await db.query("UPDATE partner_class_links SET last_error=$3,state=CASE WHEN $4 THEN 'retryable' ELSE state END WHERE provider=$1 AND class_id=$2",[provider,original.id,code,retryable]);await problem(`class:${original.id}`,code,{title:original.title,date:original.date});if(code==='PARTNER_CONFIGURATION_CHANGED')break;}
      }
      await db.query('UPDATE partner_sync_issues SET resolved_at=NOW() WHERE provider=$1 AND NOT(issue_key=ANY($2::text[]))',[provider,[...seenIssues]]);
      await db.query('UPDATE partner_integration_config SET last_sync_at=NOW(),last_sync_status=$2,last_sync_summary=$3 WHERE provider=$1',[provider,summary.issues?'attention':'success',summary]);
      return summary;
    } catch(e) {
      await pool.query("UPDATE partner_integration_config SET last_sync_at=NOW(),last_sync_status='failed',last_sync_summary=$2 WHERE provider=$1",[provider,{error:cleanError(e)}]);
      throw Error(cleanError(e));
    } finally {if(locked)await db.query('SELECT pg_advisory_unlock(hashtext($1))',[`hive:partner-runtime:${provider}`]);db.release();}
  }
  async function tick(){
    if(stopped)return;if(running){rerun=true;return;}running=true;
    try{
      const rows=(await pool.query(`SELECT c.provider FROM partner_integration_config c
        LEFT JOIN partner_sync_requests q ON q.provider=c.provider
        WHERE c.sync_enabled
          AND (c.last_sync_status IS DISTINCT FROM 'failed' OR c.last_sync_at IS NULL OR c.last_sync_at<NOW()-INTERVAL '1 minute')
          AND (q.provider IS NOT NULL OR c.last_sync_at IS NULL OR c.last_sync_at<NOW()-((c.config->>'syncMinutes')::int*INTERVAL '1 minute'))`)).rows;
      for(const {provider} of rows)try{
        const requested=(await pool.query('SELECT revision FROM partner_sync_requests WHERE provider=$1',[provider])).rows[0];
        const result=await run(provider);
        // A booking committed during this cycle increments revision and survives.
        if(requested&&!result.busy&&!result.disabled)await pool.query('DELETE FROM partner_sync_requests WHERE provider=$1 AND revision=$2',[provider,requested.revision]);
      }catch(e){console.warn('[partner-sync]',provider,cleanError(e));}
    }catch{console.warn('[partner-sync] runtime unavailable');}
    finally{running=false;if(rerun&&!stopped){rerun=false;setTimeout(tick,250).unref();}}
  }
  async function listen(){
    if(stopped||listener||connecting)return;connecting=true;
    try{
      const client=await pool.connect();if(stopped){client.release();return;}
      listener=client;
      client.on('notification',()=>{void tick();});
      client.on('error',()=>{if(listener===client)listener=null;client.release(true);});
      await client.query('LISTEN partner_capacity_changed');
    }catch{if(listener){listener.release(true);listener=null;}console.warn('[partner-sync] notifications unavailable; polling remains active');}
    finally{connecting=false;}
  }
  return {run,flush:tick,start(){stopped=false;timer=setInterval(()=>{void listen();void tick();},30000);timer.unref();void listen();void tick();},stop(){stopped=true;if(timer)clearInterval(timer);if(listener){const client=listener;listener=null;client.query('UNLISTEN partner_capacity_changed').then(()=>client.release(),()=>client.release(true));}}};
}
async function recount(db,classId){await db.query(`UPDATE classes SET current_bookings=(SELECT COALESCE(SUM(CASE WHEN user_id IS NOT NULL AND NULLIF(guest_name,'') IS NOT NULL THEN 2 ELSE 1 END),0) FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')),updated_at=NOW() WHERE id=$1`,[classId]);}

export function installPartnerRuntime(app,{pool,adminMiddleware,runtime}) {
  const base='/api/admin/partner-integrations/:provider/runtime';
  const wrap=fn=>async(req,res)=>{try{assertPartner(req.params.provider);await fn(req,res);}catch(e){res.status(e.status||500).json({message:cleanError(e)});}};
  const quotaPath = '/api/admin/classes/:classId/platforms/:provider/quota';
  app.get(quotaPath,adminMiddleware,wrap(async(req,res)=>{
    const {rows:[state]} = await pool.query(`
      SELECT COALESCE(q.quota,(p.config->>'maxSpots')::int,0) AS quota,
             c.max_capacity AS capacity, p.sync_enabled AS syncing,
             COALESCE(l.remote_booked,0) AS remote, COALESCE((p.config->>'buffer')::int,0) AS buffer,
             counts.total, counts.channel, c.status,
             (SELECT COALESCE(SUM(GREATEST(ol.remote_booked-(SELECT COUNT(*) FROM bookings ob
                WHERE ob.class_id=c.id AND ob.partner_provider=ol.provider AND ob.status IN ('confirmed','checked_in')),0)),0)::int
              FROM partner_class_links ol WHERE ol.class_id=c.id AND ol.provider<>p.provider) AS other_held,
             EXISTS (SELECT 1 FROM partner_sync_issues s WHERE s.provider=p.provider AND s.issue_key='class:'||c.id::text
               AND s.code='EXISTING_TIME_REQUIRES_REVIEW' AND s.resolved_at IS NULL) AS pending
      FROM classes c JOIN partner_integration_config p ON p.provider=$2 AND p.connection_status='verified'
      LEFT JOIN partner_class_quotas q ON q.class_id=c.id AND q.provider=p.provider
      LEFT JOIN partner_class_links l ON l.class_id=c.id AND l.provider=p.provider
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(CASE WHEN b.user_id IS NOT NULL AND NULLIF(b.guest_name,'') IS NOT NULL THEN 2 ELSE 1 END),0)::int AS total,
               COUNT(*) FILTER(WHERE b.partner_provider=p.provider)::int AS channel
        FROM bookings b WHERE b.class_id=c.id AND b.status IN ('confirmed','checked_in')
      ) counts
      WHERE c.id=$1`,[req.params.classId,req.params.provider]);
    if (!state) return res.json({data:null});
    const {capacity,quota,syncing,pending} = state;
    const booked = Math.max(state.channel,state.remote);
    const ceiling = sharedPartnerCapacity({capacity,totalBooked:state.total,channelBooked:state.channel,
      remoteBooked:state.remote,maxSpots:quota,buffer:state.buffer,otherHeld:state.other_held});
    const available = state.status === 'scheduled' ? Math.max(0,ceiling-booked) : 0;
    res.json({data:{capacity,quota,syncing,pending,booked,available}});
  }));
  app.put(quotaPath,adminMiddleware,wrap(async(req,res)=>{
    const {quota,expectedQuota}=req.body||{};
    if(!Number.isSafeInteger(quota)||quota<0||!Number.isSafeInteger(expectedQuota)||expectedQuota<0)
      return res.status(400).json({message:'Indica un tope entero válido.'});
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.classId))return res.status(400).json({message:'Clase inválida.'});
    const db=await pool.connect();
    try {
      await db.query('BEGIN');
      const c=(await db.query('SELECT max_capacity,status FROM classes WHERE id=$1 FOR UPDATE',[req.params.classId])).rows[0];
      if(!c){await db.query('ROLLBACK');return res.status(404).json({message:'Clase no encontrada.'});}
      const p=(await db.query('SELECT config FROM partner_integration_config WHERE provider=$1',[req.params.provider])).rows[0];
      if(!p||c.status!=='scheduled'||quota>c.max_capacity){await db.query('ROLLBACK');return res.status(409).json({message:'Revisa el estado y el cupo de esta clase.'});}
      const pending=await db.query("SELECT 1 FROM partner_sync_issues WHERE provider=$1 AND issue_key=$2 AND code='EXISTING_TIME_REQUIRES_REVIEW' AND resolved_at IS NULL",[req.params.provider,`class:${req.params.classId}`]);
      if(pending.rowCount){await db.query('ROLLBACK');return res.status(409).json({message:'Clase pendiente de vincular.'});}
      const current=(await db.query('SELECT quota FROM partner_class_quotas WHERE class_id=$1 AND provider=$2',[req.params.classId,req.params.provider])).rows[0]?.quota??Number(p.config.maxSpots||0);
      const booked=Number((await db.query(`SELECT GREATEST((SELECT COUNT(*) FROM bookings WHERE class_id=$1 AND partner_provider=$2 AND status IN ('confirmed','checked_in')),COALESCE((SELECT remote_booked FROM partner_class_links WHERE class_id=$1 AND provider=$2),0)) AS n`,[req.params.classId,req.params.provider])).rows[0].n);
      if(current!==expectedQuota||quota<booked){await db.query('ROLLBACK');return res.status(409).json({message:'El cupo cambió o ya tiene reservas. Actualiza la agenda.'});}
      await db.query(`INSERT INTO partner_class_quotas(class_id,provider,quota) VALUES($1,$2,$3) ON CONFLICT(class_id,provider) DO UPDATE SET quota=$3,updated_at=now()`,[req.params.classId,req.params.provider,quota]);
      await db.query('SELECT queue_partner_shared_sync()');
      await db.query('COMMIT');
      res.status(202).json({data:{quota},message:'Tope guardado. Pendiente de sincronizar con la plataforma.'});
    }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }));
  app.get(base,adminMiddleware,wrap(async(req,res)=>{
    const provider=req.params.provider;
    const status=(await pool.query('SELECT sync_enabled,last_sync_at,last_sync_status,last_sync_summary FROM partner_integration_config WHERE provider=$1',[provider])).rows[0];
    const issues=(await pool.query('SELECT code,detail,last_seen_at FROM partner_sync_issues WHERE provider=$1 AND resolved_at IS NULL ORDER BY last_seen_at DESC LIMIT 50',[provider])).rows;
    res.json({data:{...status,issues}});
  }));
  app.post(base,adminMiddleware,wrap(async(req,res)=>{
    if(typeof req.body?.enabled!=='boolean'||Object.keys(req.body).some(k=>k!=='enabled'))return res.status(400).json({message:'Indica si deseas activar o pausar la sincronización.'});
    const provider=req.params.provider;
    const result=await pool.query(`UPDATE partner_integration_config SET sync_enabled=$2,last_sync_at=CASE WHEN $2 THEN NULL ELSE last_sync_at END
      WHERE provider=$1 AND (NOT $2 OR connection_status='verified') RETURNING provider`,[provider,req.body.enabled]);
    if(!result.rowCount)return res.status(409).json({message:'Primero guarda y verifica las credenciales de esta plataforma.'});
    res.status(202).json({message:req.body.enabled?'Sincronización activada. Consulta el resultado de la primera ejecución.':'Sincronización pausada. Las clases publicadas en la plataforma no se eliminan.'});
  }));
}
