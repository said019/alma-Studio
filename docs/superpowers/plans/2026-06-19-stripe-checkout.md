# Stripe Hosted Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add card payment via Stripe Hosted Checkout to Alma Studio — zero Stripe.js on frontend, webhook-first activation, full idempotency.

**Architecture:** Server creates a Stripe Checkout Session and returns `checkout_url`; frontend redirects the browser to it. Activation happens exclusively in the `checkout.session.completed` webhook. A `stripe_webhook_events` dedup table prevents double-activation. Stripe customer IDs are cached on `users.stripe_customer_id` to avoid creating duplicate Stripe customers per user.

**Tech Stack:** Node.js ESM (`"type":"module"`), Express 4, PostgreSQL `pool.query()` (no ORM), `stripe@14`, React 18 / TypeScript / Vite, Tanstack Query v5

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/lib/stripe.js` | Stripe singleton, pure helpers, stateful helpers (pool passed as param) |
| Modify | `server/index.js` | Stripe import, DB migrations, middleware exclusion, webhook route + dispatcher, `finalizeStripeOrder()`, card branch in `POST /api/orders`, startup validation |
| Modify | `src/pages/client/Checkout.tsx` | Add `card` option, redirect to Stripe, handle `?checkout=success/cancelled` return params |
| Modify | `.env.example` | Stripe env vars |

---

### Task 1: Install Stripe SDK and document env vars

**Files:**
- Modify: `package.json` (via npm)
- Modify: `.env.example`

- [ ] **Step 1: Install stripe**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
npm install stripe@14
```

Expected: `added 1 package` (no errors).

- [ ] **Step 2: Verify ESM import works**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node --input-type=module <<'EOF'
import Stripe from "stripe";
console.log("stripe ok:", typeof Stripe);
EOF
```

Expected: `stripe ok: function`

- [ ] **Step 3: Append Stripe vars to .env.example**

Open `alma-Studio/.env.example` and append at the end:

```env
# ── Stripe Hosted Checkout ────────────────────────────────────────────────────
# Secret key from Stripe Dashboard → Developers → API Keys
STRIPE_SECRET_KEY=sk_test_...
# Webhook signing secret from Stripe Dashboard → Developers → Webhooks → endpoint
STRIPE_WEBHOOK_SECRET=whsec_...
# Shows on bank statements (max 22 chars)
STRIPE_STATEMENT_DESCRIPTOR=ALMA MOVEMENT
# Set true to allow sk_test_ in production. DELETE before going live.
PAYMENT_PROVIDER_ALLOW_TEST=false
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add package.json package-lock.json .env.example
git commit -m "chore: install stripe@14, add stripe env vars template"
```

---

### Task 2: Create server/lib/stripe.js

**Files:**
- Create: `server/lib/stripe.js`

This is the only file in the project that imports `stripe`. All Stripe logic goes through these exports. Stateful functions that need DB access receive `pool` as their first argument — this keeps the file importable without relying on global state.

- [ ] **Step 1: Create the file**

Create `/Users/saidromero/Alma Studio/alma-Studio/server/lib/stripe.js`:

```js
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
```

- [ ] **Step 2: Smoke-test pure helpers (no env vars needed)**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node --input-type=module <<'EOF'
import { buildLineItem, buildIdempotencyKey } from "./server/lib/stripe.js";
const item = buildLineItem({ name: "Plan 8 Clases" }, 1500);
console.assert(item.price_data.unit_amount === 150000, "unit_amount wrong: " + item.price_data.unit_amount);
console.assert(item.price_data.currency === "mxn", "currency wrong");
console.assert(buildIdempotencyKey("abc-123") === "checkout-session-abc-123", "idempotency key wrong");
console.log("✅ stripe.js pure helpers OK");
EOF
```

Expected: `✅ stripe.js pure helpers OK`

- [ ] **Step 3: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/lib/stripe.js
git commit -m "feat: add server/lib/stripe.js with helpers and checkout session creation"
```

---

### Task 3: DB Migrations

**Files:**
- Modify: `server/index.js` — add 3 migration statements before the `console.log("✅ Schema ensured")` at line 1570

- [ ] **Step 1: Locate the exact insertion point**

The migration try-block ends at line 1570–1573:
```js
    console.log("✅ Schema ensured");
  } catch (err) {
    console.error("Schema migration warning:", err.message);
  }
```

The last migration before line 1570 is at line 1568:
```js
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_event_passes_registration_unique ON event_passes(registration_id) WHERE registration_id IS NOT NULL`).catch(() => { });
```

- [ ] **Step 2: Add Stripe migrations before "✅ Schema ensured"**

Find the line `console.log("✅ Schema ensured");` (line 1570) and insert BEFORE it:

```js
    // ── Stripe ──────────────────────────────────────────────────────────────
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`).catch(() => { });
    await pool.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS stripe_session_id        TEXT,
        ADD COLUMN IF NOT EXISTS stripe_checkout_url      TEXT,
        ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
        ADD COLUMN IF NOT EXISTS stripe_payment_status    TEXT,
        ADD COLUMN IF NOT EXISTS payment_provider         TEXT DEFAULT 'internal'
    `).catch(() => { });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        event_id     TEXT PRIMARY KEY,
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(() => { });
```

- [ ] **Step 3: Verify migration runs clean**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node server/index.js &
sleep 4
# Look for the schema ensured log and no migration errors
# Then confirm the columns exist via a quick introspection (requires DB_URL)
kill %1
```

Check server output for `✅ Schema ensured` with no errors above it.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/index.js
git commit -m "feat: add stripe db migrations (stripe_customer_id, stripe_webhook_events)"
```

---

### Task 4: Import stripe.js and validate config at startup

**Files:**
- Modify: `server/index.js` — add import at top, add startup validation

- [ ] **Step 1: Add import at line ~29 (after existing lib imports)**

Current last lib import (line 29):
```js
import { isWithinCancelWindow, penaltyDueAt } from "./lib/faltas.js";
```

Add after it:
```js
import {
  validateStripeConfig,
  createOrGetStripeCustomer,
  createCheckoutSession,
  verifyWebhookSignature,
} from "./lib/stripe.js";
```

- [ ] **Step 2: Add startup validation after migrations (after line ~1573)**

Find the closing of the migration catch block:
```js
  } catch (err) {
    console.error("Schema migration warning:", err.message);
  }
```

Add after it (inside the same async init function or at the top-level, wherever the migrations block lives):
```js
  // ── Stripe config (only if key is set; allows running without Stripe in dev) ──
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      validateStripeConfig();
      console.log("[Stripe] Config validated OK");
    } catch (stripeConfigErr) {
      console.error("[Stripe] Config error:", stripeConfigErr.message);
      process.exit(1);
    }
  }
```

- [ ] **Step 3: Verify server still starts without Stripe env vars**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node server/index.js &
sleep 4
# Should start without error since STRIPE_SECRET_KEY is not set in dev
kill %1
```

Expected: no `[Stripe]` error, server starts normally.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/index.js
git commit -m "feat: import stripe lib and validate config at startup"
```

---

### Task 5: Patch express.json() to skip /api/stripe/webhook

**Files:**
- Modify: `server/index.js` lines 1789–1796

The webhook MUST receive the raw Buffer for signature verification. Adding a skip here works because the webhook route will mount its own `express.raw()` middleware inline.

- [ ] **Step 1: Confirm current middleware (lines 1789–1796)**

Current:
```js
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.json({ limit: "20mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  express.urlencoded({ extended: true, limit: "20mb" })(req, res, next);
});
```

- [ ] **Step 2: Add webhook exclusion to both middleware blocks**

Replace both blocks with:
```js
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  if (req.path === "/api/stripe/webhook") return next();
  express.json({ limit: "20mb" })(req, res, next);
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/drive/upload-chunk/")) return next();
  if (req.path === "/api/stripe/webhook") return next();
  express.urlencoded({ extended: true, limit: "20mb" })(req, res, next);
});
```

- [ ] **Step 3: Verify JSON body still parses for normal routes**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node server/index.js &
sleep 4
curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@alma.mx","password":"wrong"}' | grep -i "message\|error\|invalid"
kill %1
```

Expected: a JSON response with a `message` field (e.g. `"Credenciales inválidas"`), not an empty body or parse error.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/index.js
git commit -m "fix: exclude /api/stripe/webhook from express.json() middleware"
```

---

### Task 6: Add finalizeStripeOrder() and webhook route

**Files:**
- Modify: `server/index.js` — add `finalizeStripeOrder()` helper before `generateOrderNumber` (~line 3700), then add webhook route + `handleStripeEvent()` dispatcher

`finalizeStripeOrder` mirrors the activation logic from `PUT /api/admin/orders/:id/verify` (line 13053) but runs inside a webhook transaction, not an HTTP handler.

- [ ] **Step 1: Add finalizeStripeOrder before generateOrderNumber (~line 3703)**

Find:
```js
// ── Generate short order number: OPH-YYMM-XXXX ──
async function generateOrderNumber(client) {
```

Insert BEFORE that block:

```js
// ── Activate a Stripe-paid order (called from webhook, never from HTTP) ────
async function finalizeStripeOrder(client, orderId) {
  const orderRes = await client.query("SELECT * FROM orders WHERE id = $1 FOR UPDATE", [orderId]);
  if (!orderRes.rows.length) throw new Error(`Order ${orderId} not found`);
  const order = orderRes.rows[0];

  if (order.status === "approved") return; // already activated — idempotent

  await client.query(
    "UPDATE orders SET status = 'approved', verified_at = NOW() WHERE id = $1",
    [orderId]
  );

  if (!order.plan_id || !order.user_id) return;

  const planRes = await client.query("SELECT * FROM plans WHERE id = $1", [order.plan_id]);
  if (!planRes.rows.length) return;
  const plan = planRes.rows[0];

  // Carry-over: cancel active memberships and transfer remaining credits
  let carryOver = 0;
  const activeMemberships = await client.query(
    `SELECT id, classes_remaining FROM memberships
      WHERE user_id = $1 AND status = 'active' AND classes_remaining > 0`,
    [order.user_id]
  );
  if (activeMemberships.rows.length > 0) {
    for (const m of activeMemberships.rows) {
      carryOver += Number(m.classes_remaining) || 0;
    }
    const oldIds = activeMemberships.rows.map((m) => m.id);
    await client.query(
      `UPDATE memberships
          SET status = 'cancelled',
              cancellation_reason = 'Renovación: créditos transferidos a nueva membresía',
              cancelled_at = NOW(),
              end_date = NOW()
        WHERE id = ANY($1::uuid[])`,
      [oldIds]
    );
  }

  const newCredits = (plan.class_limit ?? 0) + carryOver;
  const end = new Date();
  end.setDate(end.getDate() + (plan.duration_days || 30));

  const existing = await client.query(
    `SELECT id FROM memberships WHERE order_id = $1 AND COALESCE(is_addon, false) = false`,
    [orderId]
  );
  if (existing.rows.length > 0) {
    await client.query(
      `UPDATE memberships SET status = 'active', classes_remaining = $1 WHERE id = $2`,
      [newCredits, existing.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO memberships
          (user_id, plan_id, status, payment_method, start_date, end_date, classes_remaining, order_id)
         VALUES ($1, $2, 'active', 'card', NOW(), $3, $4, $5)`,
      [order.user_id, order.plan_id, end.toISOString(), newCredits, orderId]
    );
  }

  if (order.discount_code_id) {
    await incrementDiscountUsage(order.discount_code_id, client);
  }
}
```

- [ ] **Step 2: Add webhook route and event dispatcher**

Find the `// POST /api/orders` comment (~line 3715) and add the webhook route and dispatcher BEFORE it:

```js
// ── POST /api/stripe/webhook ───────────────────────────────────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = verifyWebhookSignature(req.body, sig);
    } catch (err) {
      console.error("[Stripe Webhook] Signature verification failed:", err.message);
      return res.status(400).json({ message: "Invalid signature" });
    }

    const eventId = event.id;

    // Dedup: ignore already-processed events (PRIMARY KEY violation = duplicate)
    try {
      await pool.query(
        "INSERT INTO stripe_webhook_events (event_id) VALUES ($1)",
        [eventId]
      );
    } catch (_dupErr) {
      return res.status(200).json({ received: true, duplicate: true });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await handleStripeEvent(client, event);
      await client.query("COMMIT");
      return res.status(200).json({ received: true });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // Delete dedup row so Stripe retries this event
      await pool.query("DELETE FROM stripe_webhook_events WHERE event_id = $1", [eventId]).catch(() => {});
      console.error("[Stripe Webhook] Handler error for", eventId, ":", err.message);
      return res.status(500).json({ message: "Webhook handler error" });
    } finally {
      client.release();
    }
  }
);

// ── Stripe event dispatcher ────────────────────────────────────────────────
async function handleStripeEvent(client, event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (!orderId) {
        console.warn("[Stripe] checkout.session.completed missing order_id in metadata");
        return;
      }
      // Update Stripe fields on the order regardless of payment_status
      await client.query(
        `UPDATE orders SET
            stripe_session_id        = $1,
            stripe_payment_intent_id = $2,
            stripe_payment_status    = $3,
            payment_provider         = 'stripe'
          WHERE id = $4`,
        [session.id, session.payment_intent ?? null, session.payment_status, orderId]
      );
      // Only activate when fully paid (card). OXXO arrives as 'unpaid' here —
      // activation waits for payment_intent.succeeded below.
      if (session.payment_status === "paid") {
        await finalizeStripeOrder(client, orderId);
      }
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET status = 'expired', stripe_session_id = $1
          WHERE id = $2 AND status = 'pending_payment'`,
        [session.id, orderId]
      );
      break;
    }

    case "payment_intent.succeeded": {
      // Handles OXXO: session.completed arrives 'unpaid', this fires when cash collected
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET stripe_payment_intent_id = $1, stripe_payment_status = 'paid'
          WHERE id = $2`,
        [pi.id, orderId]
      );
      await finalizeStripeOrder(client, orderId);
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const orderId = pi.metadata?.order_id;
      if (!orderId) return;
      await client.query(
        `UPDATE orders SET stripe_payment_status = 'failed', stripe_payment_intent_id = $1
          WHERE id = $2`,
        [pi.id, orderId]
      );
      break;
    }

    case "charge.refunded":
    case "charge.dispute.created":
      console.log(`[Stripe] ${event.type}: ${event.data.object.id} — review in Stripe Dashboard`);
      break;

    default:
      // Unhandled event types — Stripe sends many, silence is intentional
      break;
  }
}
```

- [ ] **Step 3: Smoke-test webhook route exists with bad signature (expected 400)**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node server/index.js &
sleep 4
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8080/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1,v1=bad" \
  -d '{"id":"evt_test","type":"test"}')
echo "Status: $STATUS"
kill %1
```

Expected: `Status: 400` — route exists, signature check fires.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/index.js
git commit -m "feat: add stripe webhook route with dedup + event dispatcher + finalizeStripeOrder"
```

---

### Task 7: Add card branch to POST /api/orders

**Files:**
- Modify: `server/index.js` — replace the `COMMIT` + response block inside `POST /api/orders` (~lines 3788–3797)

- [ ] **Step 1: Locate the block to replace**

Current response block (lines ~3788–3797):
```js
    await client.query("COMMIT");

    const order = orderRes.rows[0];
    return res.status(201).json({
      data: {
        ...order,
        plan_name: plan.name,
        bank_details: { ...bankInfo, amount: total, currency: "MXN" },
      }
    });
```

- [ ] **Step 2: Replace with card branch**

```js
    await client.query("COMMIT");

    const order = orderRes.rows[0];

    // ── Card: create Stripe Checkout Session ──────────────────────────────
    if (paymentMethod === "card") {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ message: "Pagos con tarjeta no disponibles en este momento" });
      }
      try {
        const customerId = await createOrGetStripeCustomer(pool, req.userId);
        const session = await createCheckoutSession(pool, {
          order,
          plan,
          totalAmount: total,
          customerId,
        });
        await pool.query(
          `UPDATE orders SET
              stripe_session_id   = $1,
              stripe_checkout_url = $2,
              payment_provider    = 'stripe'
            WHERE id = $3`,
          [session.id, session.url, order.id]
        );
        return res.status(201).json({
          data: {
            ...order,
            plan_name: plan.name,
            checkout_url: session.url,
          },
        });
      } catch (stripeErr) {
        console.error("[Stripe] createCheckoutSession error:", stripeErr.message);
        return res.status(502).json({ message: "Error al crear sesión de pago. Intenta de nuevo." });
      }
    }

    // ── Transfer / cash ───────────────────────────────────────────────────
    return res.status(201).json({
      data: {
        ...order,
        plan_name: plan.name,
        bank_details: { ...bankInfo, amount: total, currency: "MXN" },
      },
    });
```

- [ ] **Step 3: Verify transfer orders still return bankDetails**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
node server/index.js &
sleep 4
# Login first (replace with a real test user)
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_TEST_EMAIL","password":"YOUR_TEST_PASSWORD"}' \
  | node --input-type=module <<'EOF'
import { createRequire } from "module";
process.stdin.resume();
let d = "";
process.stdin.on("data", c => d += c);
process.stdin.on("end", () => {
  const p = JSON.parse(d);
  process.stdout.write(p.data?.token || p.token || "");
});
EOF
)
# Create a transfer order (existing flow — should return bank_details)
PLAN_ID="YOUR_ACTIVE_PLAN_ID"
curl -s -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"planId\":\"$PLAN_ID\",\"paymentMethod\":\"transfer\"}" \
  | grep -o '"bank_details":{[^}]*}'
kill %1
```

Expected: output contains `"bank_details":` with bank info.

- [ ] **Step 4: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add server/index.js
git commit -m "feat: add card payment branch with stripe checkout session in POST /api/orders"
```

---

### Task 8: Frontend — add card option and redirect to Stripe

**Files:**
- Modify: `src/pages/client/Checkout.tsx`

- [ ] **Step 1: Update PaymentMethod type (line 37)**

```ts
// Before:
type PaymentMethod = "transfer" | "cash";

// After:
type PaymentMethod = "transfer" | "cash" | "card";
```

- [ ] **Step 2: Update createOrderMutation.onSuccess (lines 252–264)**

Current:
```ts
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderId(data.orderId ?? data.id);
      setOrderNumber(data.orderNumber ?? data.order_number ?? null);
      setBankDetails(data.bankDetails ?? data.bank_details);
      setStep(paymentMethod === "transfer" ? "bank" : "cash");
    },
```

Replace with:
```ts
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderId(data.orderId ?? data.id);
      setOrderNumber(data.orderNumber ?? data.order_number ?? null);
      // Card: redirect browser to Stripe Hosted Checkout
      if (paymentMethod === "card" && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setBankDetails(data.bankDetails ?? data.bank_details);
      setStep(paymentMethod === "transfer" ? "bank" : "cash");
    },
```

- [ ] **Step 3: Add card to the payment method options (lines 463–466)**

Current options array:
```ts
                  { id: "transfer" as const, label: "Transferencia", sub: "Banorte, subes tu comprobante", icon: Building2 },
                  { id: "cash" as const, label: "Efectivo", sub: "Pagas en recepción del estudio", icon: Banknote },
```

Replace with (card first, it's the recommended path):
```ts
                  { id: "card" as const, label: "Tarjeta", sub: "Visa, Mastercard — pago seguro con Stripe", icon: CreditCard },
                  { id: "transfer" as const, label: "Transferencia", sub: "Banorte, subes tu comprobante", icon: Building2 },
                  { id: "cash" as const, label: "Efectivo", sub: "Pagas en recepción del estudio", icon: Banknote },
```

`CreditCard` is already imported at line 29 — no new import needed.

- [ ] **Step 4: TypeScript check**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
npx tsc --noEmit 2>&1 | grep -i "error\|checkout" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add src/pages/client/Checkout.tsx
git commit -m "feat: add card payment option with stripe redirect in checkout"
```

---

### Task 9: Frontend — handle Stripe return URLs

**Files:**
- Modify: `src/pages/client/Checkout.tsx`

When the user returns from Stripe with `?checkout=success` or `?checkout=cancelled`, show the appropriate state immediately.

- [ ] **Step 1: Add useEffect and router imports**

Current react import (line 1):
```ts
import { useMemo, useState } from "react";
```

Change to:
```ts
import { useEffect, useMemo, useState } from "react";
```

Add a new import line after line 1:
```ts
import { useSearchParams } from "react-router-dom";
```

- [ ] **Step 2: Extend Step type (line 36)**

```ts
// Before:
type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";

// After:
type Step = "select" | "method" | "bank" | "cash" | "upload" | "done" | "stripe-success" | "stripe-cancelled";
```

- [ ] **Step 3: Add search param handling inside Checkout component**

After `const [file, setFile] = useState<File | null>(null);` (line 188), add:

```ts
  const [searchParams] = useSearchParams();
  const checkoutReturn = searchParams.get("checkout"); // "success" | "cancelled" | null

  useEffect(() => {
    if (checkoutReturn === "success") {
      setStep("stripe-success");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    } else if (checkoutReturn === "cancelled") {
      setStep("stripe-cancelled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutReturn]);
```

- [ ] **Step 4: Add Stripe return UI sections**

After the `{/* ── Step 5: Done ── */}` closing `)}` (after line ~641), add:

```tsx
        {/* ── Stripe return: success ── */}
        {step === "stripe-success" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: ALMA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: ALMA.olive, color: ALMA.cream }}
              >
                <CheckCircle2 size={22} />
              </span>
              <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Pago recibido
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: ALMA.ink, opacity: 0.7 }}>
                Tu pago fue procesado. Activamos tu paquete en segundos — revisa tus órdenes para confirmar.
              </p>
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {/* ── Stripe return: cancelled ── */}
        {step === "stripe-cancelled" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: ALMA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: ALMA.sandstone, color: ALMA.cream }}
              >
                <ArrowLeft size={22} />
              </span>
              <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Pago cancelado
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: ALMA.ink, opacity: 0.7 }}>
                Cancelaste el pago. Tu orden quedó pendiente — puedes intentarlo de nuevo cuando quieras.
              </p>
            </div>
            <StickyCta>
              <div className="flex gap-3">
                <PrimaryButton onClick={() => setStep("select")} className="flex-1">
                  Intentar de nuevo
                </PrimaryButton>
                <PrimaryButton to="/app/orders" className="flex-1">
                  Ver órdenes
                </PrimaryButton>
              </div>
            </StickyCta>
          </Section>
        )}
```

- [ ] **Step 5: TypeScript check**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
npx tsc --noEmit 2>&1 | grep -i "error" | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd "/Users/saidromero/Alma Studio/alma-Studio"
git add src/pages/client/Checkout.tsx
git commit -m "feat: handle stripe return urls (?checkout=success/cancelled) in checkout"
```

---

### Task 10: Stripe Dashboard setup and end-to-end test

No code changes — manual setup required before real card test.

- [ ] **Step 1: Create webhook endpoint in Stripe Dashboard**
  - Go to: Stripe Dashboard → Developers → Webhooks → Add endpoint
  - Endpoint URL: `https://almamovement.com.mx/api/stripe/webhook`
  - Events to subscribe:
    - `checkout.session.completed`
    - `checkout.session.expired`
    - `payment_intent.succeeded`
    - `payment_intent.payment_failed`
    - `charge.refunded`
    - `charge.dispute.created`
  - Copy the signing secret → this is `STRIPE_WEBHOOK_SECRET`

- [ ] **Step 2: Set Railway environment variables**
  - `STRIPE_SECRET_KEY` = `sk_test_...` (Stripe Dashboard → Developers → API Keys → Secret key)
  - `STRIPE_WEBHOOK_SECRET` = `whsec_...` (from Step 1)
  - `STRIPE_STATEMENT_DESCRIPTOR` = `ALMA MOVEMENT`
  - `PAYMENT_PROVIDER_ALLOW_TEST` = `true` (while using test keys)
  - `APP_URL` = `https://almamovement.com.mx` (must already be set)

- [ ] **Step 3: End-to-end test — happy path (card payment)**
  1. Log in as a client on `https://almamovement.com.mx/app/checkout`
  2. Select any active plan
  3. Select "Tarjeta"
  4. Click "Confirmar" — you should be redirected to Stripe Hosted Checkout
  5. Use test card `4242 4242 4242 4242`, expiry `12/34`, CVC `123`
  6. After payment completes, Stripe redirects to `/app/checkout?checkout=success`
  7. UI should show "Pago recibido" state
  8. Check DB:
     ```sql
     SELECT status, stripe_payment_status, payment_provider
       FROM orders
      WHERE payment_method = 'card'
      ORDER BY created_at DESC
      LIMIT 1;
     ```
     Expected: `status=approved, stripe_payment_status=paid, payment_provider=stripe`

- [ ] **Step 4: End-to-end test — cancelled**
  1. Repeat step 3 but click the back/cancel button on Stripe's checkout page
  2. Stripe redirects to `/app/checkout?checkout=cancelled`
  3. UI should show "Pago cancelado" state
  4. Check DB: order status remains `pending_payment`

- [ ] **Step 5: Test webhook dedup (optional)**
  - In Stripe Dashboard → Webhooks → your endpoint → select a `checkout.session.completed` event → click "Resend"
  - Railway logs should show `duplicate: true` — no double-activation

---

## Spec Coverage Checklist

| Spec requirement | Task |
|----------------|------|
| `getStripe()` singleton | Task 2 |
| `validateStripeConfig()` hard-fail at startup | Tasks 2 + 4 |
| `PAYMENT_PROVIDER_ALLOW_TEST` escape hatch | Task 2 |
| `buildLineItem()` with centavos conversion | Task 2 |
| `buildIdempotencyKey()` on session creation | Task 2 |
| `verifyWebhookSignature()` | Tasks 2 + 6 |
| `createOrGetStripeCustomer()` with `stripe_customer_id` cache | Tasks 2 + 3 |
| `createCheckoutSession()` with 30-min expiry + `APP_URL` | Task 2 |
| `refundCharge()` helper | Task 2 (available for future use) |
| Webhook BEFORE `express.json()` (via skip) | Task 5 |
| `stripe_webhook_events` dedup table | Tasks 3 + 6 |
| Delete dedup row on handler error (allow Stripe retry) | Task 6 |
| `checkout.session.completed` → activate only if `payment_status=paid` | Task 6 |
| `payment_intent.succeeded` → OXXO activation path | Task 6 |
| `checkout.session.expired` → mark order expired | Task 6 |
| `charge.refunded` + `charge.dispute.created` → log | Task 6 |
| Stripe columns on orders | Task 3 |
| `stripe_customer_id` on users | Task 3 |
| Card branch in `POST /api/orders` | Task 7 |
| Frontend redirect to `checkout_url` | Task 8 |
| Return URL `?checkout=success/cancelled` | Task 9 |
| Never expose secret key on frontend | ✓ (no Stripe import in frontend) |
| Carry-over credits + discount usage increment on activation | Task 6 (`finalizeStripeOrder`) |
