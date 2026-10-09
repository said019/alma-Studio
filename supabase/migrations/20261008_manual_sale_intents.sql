-- Additive durable receipts. Existing payments/memberships are unchanged.
-- Deployed automatically by ensureSchema via MANUAL_SALE_INTENT_SCHEMA.
CREATE TABLE IF NOT EXISTS manual_sale_intents (
  actor_id UUID NOT NULL,
  intent_key UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (actor_id, intent_key)
);
