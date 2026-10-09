
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
