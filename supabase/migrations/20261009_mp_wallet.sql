ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_choice TEXT CHECK (mp_payment_choice IN ('card','wallet'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_wallet_preference_id TEXT;
