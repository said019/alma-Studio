import crypto from 'node:crypto';

export const MANUAL_SALE_INTENT_SCHEMA = `CREATE TABLE IF NOT EXISTS manual_sale_intents (
 actor_id UUID NOT NULL, intent_key UUID NOT NULL, payload_hash TEXT NOT NULL,
 response JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(actor_id, intent_key)
)`;
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).filter(k => k !== 'idempotencyKey').sort().map(k => [k, canonical(value[k])])) : value;
export const saleIntentHash = body => crypto.createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex');
