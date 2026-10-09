CREATE TABLE IF NOT EXISTS mp_retired_wallet_attempts (
 order_id UUID NOT NULL REFERENCES orders(id), preference_id TEXT NOT NULL,
 idempotency_key UUID NOT NULL, retired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(order_id,preference_id)
);
