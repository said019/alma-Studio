import crypto from 'node:crypto';
export const CAMPAIGN_SCHEMA = `
CREATE TABLE IF NOT EXISTS email_campaigns (
 id UUID PRIMARY KEY,actor_id UUID REFERENCES users(id),request_key UUID NOT NULL,
 request_hash TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(actor_id,request_key)
);
CREATE TABLE IF NOT EXISTS email_campaign_deliveries (
 id UUID PRIMARY KEY,campaign_id UUID NOT NULL REFERENCES email_campaigns(id),user_id UUID REFERENCES users(id),
 recipient TEXT NOT NULL,recipient_name TEXT,status TEXT NOT NULL DEFAULT 'queued',attempts INTEGER NOT NULL DEFAULT 0,
 first_attempt_at TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),lease_until TIMESTAMPTZ,
 claim UUID,provider_id TEXT,last_error TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS email_campaign_queue ON email_campaign_deliveries(next_attempt_at) WHERE status IN ('queued','retry','sending');
`;
export async function enqueueCampaign(pool,{actorId,key,payload,recipients}) {
 const db=await pool.connect();const hash=crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
 try {
  await db.query('BEGIN');
  const created=await db.query(`INSERT INTO email_campaigns(id,actor_id,request_key,request_hash,payload) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(actor_id,request_key) DO NOTHING RETURNING id`,[crypto.randomUUID(),actorId,key,hash,payload]);
  const campaign=(await db.query('SELECT * FROM email_campaigns WHERE actor_id=$1 AND request_key=$2 FOR UPDATE',[actorId,key])).rows[0];
  if(campaign.request_hash!==hash)throw Object.assign(new Error('Este envío ya existe con otro contenido.'),{status:409});
  if(created.rowCount)for(const user of recipients)await db.query(`INSERT INTO email_campaign_deliveries(id,campaign_id,user_id,recipient,recipient_name)
   VALUES($1,$2,$3,$4,$5)`,[crypto.randomUUID(),campaign.id,user.id,user.email,user.display_name]);
  const total=(await db.query('SELECT COUNT(*)::int n FROM email_campaign_deliveries WHERE campaign_id=$1',[campaign.id])).rows[0].n;
  await db.query('COMMIT');return {campaignId:campaign.id,total,queued:total,replayed:!created.rowCount};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
export async function drainCampaigns(pool,send,{limit=20}={}) {
 // Resend idempotency lasts24h. Ambiguous sends older than23h require human review.
 await pool.query(`UPDATE email_campaign_deliveries SET status='needs_review',last_error='Verificar en el proveedor antes de reenviar',claim=NULL,lease_until=NULL
  WHERE status IN ('retry','sending') AND first_attempt_at<NOW()-INTERVAL '23 hours' AND (lease_until IS NULL OR lease_until<NOW())`);
 let processed=0;
 for(let i=0;i<limit;i++){
  const claim=crypto.randomUUID();
  const row=(await pool.query(`WITH candidate AS (
   SELECT id FROM email_campaign_deliveries WHERE status IN ('queued','retry','sending') AND next_attempt_at<=NOW()
    AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
   ) UPDATE email_campaign_deliveries d SET status='sending',claim=$1,lease_until=NOW()+INTERVAL '5 minutes',
    attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,NOW()),updated_at=NOW()
    FROM candidate c WHERE d.id=c.id RETURNING d.*`,[claim])).rows[0];
  if(!row)break;
  const user=(await pool.query("SELECT email FROM users WHERE id=$1 AND is_active IS NOT FALSE AND receive_promotions=true AND role='client'",[row.user_id])).rows[0];
  if(!user||user.email!==row.recipient){
   await pool.query("UPDATE email_campaign_deliveries SET status='skipped',last_error='Sin consentimiento vigente o contacto actualizado',lease_until=NULL,claim=NULL WHERE id=$1 AND claim=$2",[row.id,claim]);continue;
  }
  const campaign=(await pool.query('SELECT payload FROM email_campaigns WHERE id=$1',[row.campaign_id])).rows[0];
  try{
   const result=await send({...campaign.payload,to:row.recipient,name:row.recipient_name,idempotencyKey:`hive-campaign/${row.id}`});
   if(!result?.id)throw new Error('Missing provider receipt');
   await pool.query("UPDATE email_campaign_deliveries SET status='accepted',provider_id=$3,last_error=NULL,lease_until=NULL,claim=NULL,updated_at=NOW() WHERE id=$1 AND claim=$2",[row.id,claim,result.id]);
  }catch{
   await pool.query(`UPDATE email_campaign_deliveries SET status=CASE WHEN attempts>=5 THEN 'needs_review' ELSE 'retry' END,
    last_error='Envío no confirmado; no implica entrega',next_attempt_at=NOW()+INTERVAL '2 minutes',lease_until=NULL,claim=NULL,updated_at=NOW()
    WHERE id=$1 AND claim=$2`,[row.id,claim]);
  }
  processed++;
 }
 return processed;
}
