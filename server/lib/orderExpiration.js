export const ORDER_PAYMENT_WINDOW_MS = 60 * 60 * 1000;

// Lock orders before updating so concurrent payment confirmation wins safely.
export async function expireUnpaidOrders(db) {
  return db.query(`WITH due AS (
    SELECT o.id FROM orders o
    WHERE o.status = 'pending_payment' AND o.paid_at IS NULL
      AND o.expires_at <= NOW()
      AND NOT EXISTS (SELECT 1 FROM payment_proofs p WHERE p.order_id=o.id AND p.status='pending')
      AND NOT EXISTS (SELECT 1 FROM mp_card_attempts a WHERE a.order_id=o.id AND a.status NOT IN ('rejected','cancelled'))
    FOR UPDATE OF o SKIP LOCKED
  ) UPDATE orders o SET status='expired',updated_at=NOW() FROM due WHERE o.id=due.id RETURNING o.id`);
}
