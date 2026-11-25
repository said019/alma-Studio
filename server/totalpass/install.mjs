import {readFile} from 'node:fs/promises';
import {PARTNER_DEFAULTS, encryptCredentials, decryptCredentials, installPartnerConfiguration} from './partnerConfiguration.mjs';
import {createPartnerRuntime, installPartnerRuntime} from './partnerRuntime.mjs';
import {installPartnerPersonActions} from './partnerPersonActions.mjs';
import {installPartnerBookingGuard} from './partnerBookingGuard.mjs';
import {installTotalpassCheckins} from './totalpassCheckins.mjs';
import {testPartnerConnection} from './partnerConnection.mjs';

export async function bootstrapHiveTotalPass(pool, secret, env=process.env) {
  if (!env.TOTALPASS_UNIT_ID || !env.TOTALPASS_PLACE_API_KEY) return;
  const db=await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT pg_advisory_xact_lock(hashtext('hive:partner-config:totalpass'))");
    const row=(await db.query("SELECT * FROM partner_integration_config WHERE provider='totalpass' FOR UPDATE")).rows[0];
    if (row && row.config.unitId !== env.TOTALPASS_UNIT_ID) throw new Error('TOTALPASS_BOOTSTRAP_UNIT_MISMATCH');
    const old=decryptCredentials('totalpass',row?.credentials_encrypted,secret);
    const credentials={...old};
    if(!credentials.placeApiKey) credentials.placeApiKey=env.TOTALPASS_PLACE_API_KEY;
    if(!credentials.partnerApiKey && env.TOTALPASS_PARTNER_API_KEY) credentials.partnerApiKey=env.TOTALPASS_PARTNER_API_KEY;
    if(!row || JSON.stringify(credentials)!==JSON.stringify(old)){
      const encrypted=encryptCredentials('totalpass',credentials,secret);
      await db.query(`INSERT INTO partner_integration_config(provider,config,credentials_encrypted,revision)
        VALUES('totalpass',$1,$2,1) ON CONFLICT(provider) DO UPDATE SET credentials_encrypted=$2,
        revision=partner_integration_config.revision+1,connection_status='not_tested',sync_enabled=false,tested_at=NULL`,
        [{...PARTNER_DEFAULTS.totalpass,unitId:env.TOTALPASS_UNIT_ID},encrypted]);
    }
    await db.query('COMMIT');
  } catch(e) {await db.query('ROLLBACK');throw e;} finally {db.release();}
}

export function registerHiveTotalPass(app,{pool,ownerMiddleware,adminMiddleware,authMiddleware,getBookingPolicy,limiter,jwtSecret}){
  const secret=process.env.PARTNER_ENCRYPTION_KEY || jwtSecret;
  const getPolicies=async()=>({cancellationHours:(await getBookingPolicy()).cancelWindowHours,maxAdvanceDays:90,maxDailyBookings:null,maxActiveBookings:null});
  const options={pool,adminMiddleware:ownerMiddleware,secret,getPolicies};
  const runtime=createPartnerRuntime(options);
  installPartnerRuntime(app,{...options,runtime});
  installPartnerBookingGuard(app,{pool,authMiddleware,adminMiddleware});
  installPartnerPersonActions(app,options);
  installPartnerConfiguration(app,{...options,testConnection:testPartnerConnection});
  const checkins=installTotalpassCheckins(app,{...options,limiter});
  return async()=>{
    await pool.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
    await bootstrapHiveTotalPass(pool,secret);
    runtime.start();
    checkins.start();
  };
}
