import Stripe from "stripe";

const STRIPE_API_VERSION = "2026-04-22.dahlia";

// ── Singleton ──────────────────────────────────────────────────────────────
let _stripe = null;

export function getStripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  _stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  return _stripe;
}

// ── Config validation — call once at startup; throws on bad config ─────────
export function validateStripeConfig() {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  if (!key) throw new Error("[Stripe] STRIPE_SECRET_KEY is not set");
  if (!secret) throw new Error("[Stripe] STRIPE_WEBHOOK_SECRET is not set");

  const isTestKey = key.startsWith("sk_test_");
  const isProd = process.env.NODE_ENV === "production";
  const allowTest = process.env.PAYMENT_PROVIDER_ALLOW_TEST === "true";

  if (isProd && isTestKey && !allowTest) {
    throw new Error(
      "[Stripe] sk_test_ key in production — set PAYMENT_PROVIDER_ALLOW_TEST=true to override, then delete before going live"
    );
  }
  if (isProd && isTestKey && allowTest) {
    console.warn("[Stripe] WARNING: using test key in production. Remove PAYMENT_PROVIDER_ALLOW_TEST before going live.");
  }
}

// ── Pure helpers ───────────────────────────────────────────────────────────
export function buildLineItem(plan, totalAmount) {
  return {
    price_data: {
      currency: "mxn",
      unit_amount: Math.round(Number(totalAmount) * 100), // centavos
      product_data: {
        name: plan.name,
        ...(plan.description ? { description: plan.description } : {}),
      },
    },
    quantity: 1,
  };
}

export function buildIdempotencyKey(orderId) {
  return `checkout-session-${orderId}`;
}

// ── Webhook signature verification ─────────────────────────────────────────
// rawBody must be Buffer (express.raw), not a parsed object
export function verifyWebhookSignature(rawBody, signature) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

// ── Stateful: Customer reuse ───────────────────────────────────────────────
// pool is passed as first argument — no global DB dependency
export async function createOrGetStripeCustomer(pool, userId) {
  const uRes = await pool.query(
    "SELECT email, display_name, stripe_customer_id FROM users WHERE id = $1",
    [userId]
  );
  if (!uRes.rows.length) throw new Error(`User ${userId} not found`);
  const user = uRes.rows[0];

  if (user.stripe_customer_id) return user.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    ...(user.display_name ? { name: user.display_name } : {}),
    metadata: { user_id: userId },
  });

  await pool.query(
    "UPDATE users SET stripe_customer_id = $1 WHERE id = $2",
    [customer.id, userId]
  );
  return customer.id;
}

// ── Stateful: Create Checkout Session ──────────────────────────────────────
export async function createCheckoutSession(pool, { order, plan, totalAmount, customerId }) {
  const stripe = getStripe();
  const appUrl = (process.env.APP_URL ?? process.env.SITE_URL ?? "http://localhost:5173").replace(/\/+$/, "");
  const descriptor = (process.env.STRIPE_STATEMENT_DESCRIPTOR ?? "ALMA MOVEMENT").slice(0, 22);

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      customer: customerId,
      line_items: [buildLineItem(plan, totalAmount)],
      payment_method_types: ["card"],
      payment_intent_data: {
        statement_descriptor: descriptor,
        metadata: { order_id: order.id, order_number: order.order_number ?? "" },
      },
      metadata: { order_id: order.id, order_number: order.order_number ?? "" },
      success_url: `${appUrl}/app/checkout?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/app/checkout?checkout=cancelled`,
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 min
    },
    { idempotencyKey: buildIdempotencyKey(order.id) }
  );

  return session;
}

// ── Refund a charge ────────────────────────────────────────────────────────
export async function refundCharge(chargeId, amountCentavos, reason) {
  const stripe = getStripe();
  return stripe.refunds.create({
    charge: chargeId,
    amount: amountCentavos,
    reason: reason ?? "requested_by_customer",
  });
}
