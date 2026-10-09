
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_checkout_mode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_collector_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_external_checkout_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_mp_payment_unique ON orders(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS mp_card_attempts(order_id UUID PRIMARY KEY REFERENCES orders(id),idempotency_key UUID NOT NULL UNIQUE,status TEXT NOT NULL,payment_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS provider_synced_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_sync_attempted_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_sync_lease_until TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_sync_claim UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_sync_error TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_method_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_type_id TEXT;
CREATE TABLE IF NOT EXISTS mp_payment_reviews (
 order_id UUID NOT NULL REFERENCES orders(id), payment_id TEXT NOT NULL,
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'needs_review',
 provider_status TEXT, amount NUMERIC, currency TEXT,
 first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(order_id,payment_id)
);
CREATE INDEX IF NOT EXISTS orders_mp_sync_queue ON orders(mp_sync_attempted_at NULLS FIRST) WHERE mp_checkout_mode='embedded';
CREATE TABLE IF NOT EXISTS mp_payment_events(payment_id TEXT NOT NULL,status TEXT NOT NULL,processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(payment_id,status));
