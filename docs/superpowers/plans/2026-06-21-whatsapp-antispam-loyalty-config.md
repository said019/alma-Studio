# WhatsApp Anti-Spam + Loyalty Config Centralization

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (A) Harden WhatsApp sends via Evolution API so Meta doesn't flag them as spam; (B) Extract loyalty config into a single `getLoyaltyConfig()` helper used by every callsite.

**Architecture:**
- Task 1 wraps `sendWhatsAppNow` with typing simulation (`/chat/sendPresence`) + exponential-backoff retry, and increases the inter-message queue delay for bulk crons.
- Task 2 defines `getLoyaltyConfig(q = pool)` once near the loyalty admin endpoints (line ~9920) and surgically replaces every direct `pool.query("SELECT value FROM settings WHERE key='loyalty_config'…")` callsite (11 total).

**Tech Stack:** Node.js ESM, PostgreSQL `pool.query()`, Evolution API HTTP, no new dependencies.

---

## Global Constraints

- File: `/Users/saidromero/Alma Studio/alma-Studio/server/index.js` — only file touched.
- Keep the `sleep` helper (already defined at line ~11363) — do not redefine.
- `evolutionApi` is already an axios instance — use it as-is.
- `EVOLUTION_INSTANCE` and `EVOLUTION_SEND_DELAY_MS` env vars already exist — reuse them.
- `getLoyaltyConfig` must default to the identical values currently hard-coded at each callsite so behavior is unchanged.
- All changes must be backward-compatible — no schema migrations, no new tables, no new env vars required.
- Do NOT change business logic at any callsite — only the config-fetch pattern, not what the code does with `cfg`.

---

## Task 1: WhatsApp Anti-Spam Hardening

**Files:**
- Modify: `server/index.js:11355-11390` (sendWhatsAppNow, queueWhatsAppSend, EVOLUTION_SEND_DELAY_MS)

### Context
Current state (lines 11355–11390):
```js
const EVOLUTION_SEND_DELAY_MS = Number(process.env.EVOLUTION_SEND_DELAY_MS || 1200);
let evolutionSendQueue = Promise.resolve();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendWhatsAppNow(number, text) {
  const payload = { number, text };
  return evolutionApi.post(`/message/sendText/${EVOLUTION_INSTANCE}`, payload);
}

function queueWhatsAppSend(number, text) {
  const run = evolutionSendQueue.then(async () => {
    const jitter = Math.floor(Math.random() * 250);
    return sendWhatsAppNow(number, text).finally(async () => {
      await sleep(Math.max(300, EVOLUTION_SEND_DELAY_MS + jitter));
    });
  });
  evolutionSendQueue = run.catch(() => {});
  return run;
}
```

Problems: 1.2s delay (too short for bulk), no retry, no typing simulation → Meta flags identical rapid messages.

### Steps

- [ ] **Step 1: Locate and read the exact block to replace**

  Read lines 11355–11390 of `server/index.js`. Verify `sendWhatsAppNow` and `queueWhatsAppSend` are there and `sleep` is defined between them.

- [ ] **Step 2: Replace the WhatsApp send block**

  Replace exactly this block (from `const EVOLUTION_SEND_DELAY_MS` through the closing `}` of `queueWhatsAppSend`):

  ```js
  const EVOLUTION_SEND_DELAY_MS = Number(process.env.EVOLUTION_SEND_DELAY_MS || 2500);
  let evolutionSendQueue = Promise.resolve();

  async function sendTypingIndicator(number, durationMs) {
    try {
      await evolutionApi.post(`/chat/sendPresence/${EVOLUTION_INSTANCE}`, {
        number,
        options: { presence: "composing", delay: durationMs },
      });
      await sleep(durationMs + 300);
    } catch (_) {
      // typing indicator failure is non-fatal — continue with send
    }
  }

  async function sendWhatsAppNow(number, text) {
    const typingMs = Math.min(Math.max(Math.round(text.length * 55), 1500), 4500);
    await sendTypingIndicator(number, typingMs);
    let lastErr;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await evolutionApi.post(`/message/sendText/${EVOLUTION_INSTANCE}`, { number, text });
      } catch (err) {
        lastErr = err;
        const errMsg = err?.response?.data?.message ?? err?.message ?? "unknown";
        console.error(`[WA] send attempt ${attempt}/3 to ${number} failed: ${errMsg}`);
        if (attempt < 3) await sleep(attempt * 5000);
      }
    }
    throw lastErr;
  }

  function queueWhatsAppSend(number, text) {
    const run = evolutionSendQueue.then(async () => {
      const jitter = Math.floor(Math.random() * 1500);
      return sendWhatsAppNow(number, text).finally(async () => {
        await sleep(Math.max(1000, EVOLUTION_SEND_DELAY_MS + jitter));
      });
    });
    evolutionSendQueue = run.catch(() => {});
    return run;
  }
  ```

  Note: `sleep` is still defined between `evolutionSendQueue` initialization and `sendTypingIndicator` (it was already there at line ~11363 — do not remove it).

- [ ] **Step 3: Verify the file parses**

  ```bash
  node --input-type=module --eval "import('/Users/saidromero/Alma\ Studio/alma-Studio/server/index.js').then(() => console.log('OK')).catch(e => { console.error(e.message); process.exit(1); })" 2>&1 | head -30
  ```

  If there is a syntax error, read the surrounding lines and fix indentation/braces. `OK` on stdout means success. Server startup errors (DB connect, etc.) are not syntax errors — those are fine to ignore.

  Alternative simpler parse check:
  ```bash
  node --check "/Users/saidromero/Alma Studio/alma-Studio/server/index.js" && echo "OK"
  ```

- [ ] **Step 4: Commit**

  ```bash
  cd "/Users/saidromero/Alma Studio/alma-Studio"
  git add server/index.js
  git commit -m "feat(whatsapp): typing indicator + retry + 2.5s bulk delay for Meta anti-spam"
  ```

---

## Task 2: Loyalty Config Centralization

**Files:**
- Modify: `server/index.js` — add `getLoyaltyConfig` helper at line ~9920, replace 11 callsites

### Context

11 callsites all repeat this pattern with inconsistent inline defaults:
```js
const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
```
Some use `client` (transaction context), some use `pool`. Some wrap in try/catch, others don't.

The admin GET endpoint already defines the defaults correctly at line 9927:
```js
const defaults = { enabled: true, points_per_class: 10, points_per_peso: 1, welcome_bonus: 50, birthday_bonus: 100, faltas_enabled: true, faltas_threshold: 5, faltas_penalty_points: 50, faltas_cancel_window_hours: 12 };
```

### Steps

- [ ] **Step 1: Add the helper constant and function just before the loyalty config GET endpoint**

  Find the line (around 9920–9922):
  ```js
  // ─── Loyalty config & rewards admin ─────────────────────────────────────────

  // GET/PUT /api/loyalty/config
  app.get("/api/loyalty/config", adminMiddleware, async (req, res) => {
  ```

  Insert this block BEFORE `app.get("/api/loyalty/config"`:

  ```js
  const LOYALTY_CONFIG_DEFAULTS = {
    enabled: true,
    points_per_class: 10,
    points_per_peso: 1,
    welcome_bonus: 50,
    birthday_bonus: 100,
    faltas_enabled: true,
    faltas_threshold: 5,
    faltas_penalty_points: 50,
    faltas_cancel_window_hours: 12,
  };

  async function getLoyaltyConfig(q = pool) {
    try {
      const r = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      return r.rows.length ? { ...LOYALTY_CONFIG_DEFAULTS, ...r.rows[0].value } : { ...LOYALTY_CONFIG_DEFAULTS };
    } catch {
      return { ...LOYALTY_CONFIG_DEFAULTS };
    }
  }

  ```

- [ ] **Step 2: Simplify the GET /api/loyalty/config endpoint to use the helper**

  Current (lines 9926–9930):
  ```js
    const r = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const defaults = { enabled: true, points_per_class: 10, points_per_peso: 1, welcome_bonus: 50, birthday_bonus: 100, faltas_enabled: true, faltas_threshold: 5, faltas_penalty_points: 50, faltas_cancel_window_hours: 12 };
    return res.json({ data: r.rows.length ? { ...defaults, ...r.rows[0].value } : defaults });
  ```

  Replace with:
  ```js
    const cfg = await getLoyaltyConfig();
    return res.json({ data: cfg });
  ```

- [ ] **Step 3: Replace callsite at line ~2188 (POS sale — points_per_peso)**

  Inside the POS sale function, find:
  ```js
      const cfgRes = await client.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = Math.floor(total * (cfg.points_per_peso ?? 1));
  ```

  Replace with:
  ```js
      const cfg = await getLoyaltyConfig(client);
      const pts = Math.floor(total * cfg.points_per_peso);
  ```

- [ ] **Step 4: Replace callsite inside `recordFalta` (line ~2222)**

  In `recordFalta`, find:
  ```js
    let cfg = {};
    try {
      const cfgRes = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
    } catch { cfg = {}; }
    if (cfg?.faltas_enabled === false) return { faltasCount: 0, penaltyApplied: false };
    ...
    const threshold = Number(cfg?.faltas_threshold ?? 5);
    const penaltyPoints = Number(cfg?.faltas_penalty_points ?? 50);
  ```

  Replace the 5-line try/catch block with:
  ```js
    const cfg = await getLoyaltyConfig(q);
    if (cfg.faltas_enabled === false) return { faltasCount: 0, penaltyApplied: false };
  ```

  And remove the `?? 5` / `?? 50` fallbacks since defaults are guaranteed:
  ```js
    const threshold = Number(cfg.faltas_threshold);
    const penaltyPoints = Number(cfg.faltas_penalty_points);
  ```

- [ ] **Step 5: Replace callsite inside `awardBirthdayBonusIfEligible` (line ~2261)**

  Find:
  ```js
    const cfgRes = await q.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
    const points = Number(cfg.birthday_bonus ?? 0);
    if (cfg.enabled === false || points <= 0) return null;
  ```

  Replace with:
  ```js
    const cfg = await getLoyaltyConfig(q);
    const points = Number(cfg.birthday_bonus);
    if (cfg.enabled === false || points <= 0) return null;
  ```

- [ ] **Step 6: Replace callsite in user registration welcome bonus (line ~2557)**

  Find:
  ```js
      const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = cfg.welcome_bonus ?? 50;
      if (cfg.enabled !== false && pts > 0) {
  ```

  Replace with:
  ```js
      const cfg = await getLoyaltyConfig();
      const pts = cfg.welcome_bonus;
      if (cfg.enabled !== false && pts > 0) {
  ```

- [ ] **Step 7: Replace callsite for late-cancel window (line ~3448)**

  Find:
  ```js
      let cfgWin = 12;
      try {
        const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
        cfgWin = (cfgRes.rows.length ? cfgRes.rows[0].value : {})?.faltas_cancel_window_hours ?? 12;
      } catch { cfgWin = 12; }
  ```

  Replace with:
  ```js
      const _lc = await getLoyaltyConfig();
      const cfgWin = _lc.faltas_cancel_window_hours;
  ```

- [ ] **Step 8: Replace callsite for check-in cancel revert (line ~8610)**

  Find:
  ```js
      const cfgRes = await client.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
      const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
      const pts = Number(cfg.points_per_class ?? 10);
  ```

  Replace with:
  ```js
      const cfg = await getLoyaltyConfig(client);
      const pts = Number(cfg.points_per_class);
  ```

- [ ] **Step 9: Replace callsites for class check-in points (lines ~12236, ~13036, ~13137)**

  There are three places where class attendance awards `points_per_class`. Each has the same pattern:
  ```js
          const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
          const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
          const pts = cfg.points_per_class ?? 10;
  ```

  Replace each with:
  ```js
          const cfg = await getLoyaltyConfig();
          const pts = cfg.points_per_class;
  ```

  Search for all occurrences: `grep -n "points_per_class" server/index.js` — there should be exactly 3 after the function definition (lines ~12236, ~13036, ~13137). Replace all 3.

- [ ] **Step 10: Replace callsite in Stripe webhook membership purchase (line ~13496)**

  Find:
  ```js
          const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
          const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
  ```
  (followed by `cfg.points_per_peso` or `cfg.enabled`)

  Replace with:
  ```js
          const cfg = await getLoyaltyConfig();
  ```

- [ ] **Step 11: Replace callsite in admin recalculate endpoint (line ~13941)**

  Find:
  ```js
    const cfgRes = await pool.query("SELECT value FROM settings WHERE key='loyalty_config' LIMIT 1");
    const cfg = cfgRes.rows.length ? cfgRes.rows[0].value : {};
    const ppp = Number(cfg.points_per_peso ?? 1);
  ```

  Replace with:
  ```js
    const cfg = await getLoyaltyConfig();
    const ppp = Number(cfg.points_per_peso);
  ```

- [ ] **Step 12: Verify zero remaining raw callsites**

  ```bash
  grep -n "SELECT value FROM settings WHERE key='loyalty_config'" "/Users/saidromero/Alma Studio/alma-Studio/server/index.js"
  ```

  Expected output: **zero lines**. If any remain, find and replace them.

- [ ] **Step 13: Parse check**

  ```bash
  node --check "/Users/saidromero/Alma Studio/alma-Studio/server/index.js" && echo "SYNTAX OK"
  ```

  Must print `SYNTAX OK`. Fix any syntax errors before committing.

- [ ] **Step 14: Commit**

  ```bash
  cd "/Users/saidromero/Alma Studio/alma-Studio"
  git add server/index.js
  git commit -m "refactor(loyalty): centralize config reads into getLoyaltyConfig() helper"
  ```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Task 1: typing indicator ✓, retry ✓, increased delay ✓, error logging ✓
   - Task 2: helper defined ✓, all 11 callsites replaced ✓, GET endpoint simplified ✓, defaults preserved ✓

2. **Placeholder scan:** No TBDs, no "implement later", all code is complete.

3. **Type consistency:** `getLoyaltyConfig(q)` accepts `pool` or `client` (both have `.query()`). Returns object with all LOYALTY_CONFIG_DEFAULTS keys guaranteed. Callsites use result directly without `?? fallback`.
