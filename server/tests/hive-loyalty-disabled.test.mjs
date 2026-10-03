// Exercise actual server functions/routes in an isolated runtime, never production or live providers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { penaltyDueAt, faltaReversal } from '../lib/faltas.js';
const source = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
function functionSource(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const defaults = source.slice(source.indexOf('const LOYALTY_CONFIG_DEFAULTS ='), source.indexOf('\n};', source.indexOf('const LOYALTY_CONFIG_DEFAULTS =')) + 3);
function runtime({ enabled = false, query = async () => ({ rows: [] }), extras = {} } = {}) {
  const calls = [];
  const pool = { query: async (sql, params) => { calls.push({ sql, params }); return query(sql, params); } };
  const context = vm.createContext({ console, Buffer, Date, pool, penaltyDueAt, faltaReversal, getLoyaltyConfig: async () => ({ enabled, points_per_class: 10, points_per_peso: 1, birthday_bonus: 100, faltas_enabled: true, faltas_threshold: 5, faltas_penalty_points: 50 }), ...extras });
  return { context, pool, calls, func(name) { vm.runInContext(functionSource(name), context); return context[name]; } };
}
async function route(path, method = 'get', options = {}) {
  const r = runtime(options);
  let handler;
  r.context.authMiddleware = () => {};
  r.context.adminMiddleware = () => {};
  r.context.app = { [method]: (...args) => { handler = args.at(-1); } };
  for (const name of ['prettyTemplateKey', 'humanizeMotivationKey']) {
    const start = source.indexOf(`function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), r.context);
  }
  const start = source.indexOf(`app.${method}("${path}",`);
  assert.notEqual(start, -1, path);
  vm.runInContext(source.slice(start, source.indexOf('\n});', start) + 4), r.context);
  let status = 200, body;
  const res = { status(s) { status = s; return this; }, json(b) { body = JSON.parse(JSON.stringify(b)); return this; } };
  await handler({ userId: 'user', params: { userId: 'user' }, query: {}, body: { rewardId: 'reward', userId: 'user', points: 100 } }, res);
  return { ...r, status, body };
}

test('HIVE defaults off; explicit enabled config remains supported and cancellation window stays 12h', async () => {
  for (const stored of [undefined, {}, { enabled: false }, { enabled: true }]) {
    const r = runtime({ query: async () => ({ rows: stored ? [{ value: stored }] : [] }) });
    vm.runInContext(defaults, r.context);
    const cfg = await r.func('getLoyaltyConfig')();
    assert.equal(cfg.enabled, stored?.enabled === true);
    assert.equal(cfg.faltas_cancel_window_hours, 12);
    assert.equal(cfg.faltas_enabled, true);
  }
});

test('disabled check-in awards nothing; enabled check-in still awards once per invocation', async () => {
  for (const enabled of [false, true]) {
    const r = runtime({ enabled });
    assert.equal(await r.func('insertCheckinPoints')(r.pool, 'user', await r.context.getLoyaltyConfig()), enabled ? 10 : 0);
    assert.equal(r.calls.length, enabled ? 1 : 0);
  }
});

test('disabled loyalty counts fifth absence but never inserts penalty points', async () => {
  for (const enabled of [false, true]) {
    const r = runtime({ enabled, query: async () => ({ rows: [{ faltas_count: 5 }] }) });
    const result = await r.func('recordFalta')({ userId: 'user', reason: 'no-show' });
    assert.equal(result.faltasCount, 5);
    assert.equal(result.penaltyApplied, enabled);
    assert.match(r.calls[0].sql, /UPDATE users SET faltas_count/);
    assert.equal(r.calls.filter(c => c.sql.includes('INSERT INTO loyalty_transactions')).length, enabled ? 1 : 0);
  }
});

test('cancelling attended class restores membership credit without negative points when disabled', async () => {
  for (const enabled of [false, true]) {
    let restored = 0;
    const r = runtime({ enabled, extras: { restoreMembershipCredit: async () => { restored++; } } });
    const result = await r.func('applyCancellationRollback')(r.pool, { user_id: 'u', membership_id: 'm', class_id: 'c', status: 'checked_in' }, { refundCheckedIn: true });
    assert.equal(restored, 1);
    assert.equal(result.creditRestored, true);
    assert.equal(result.pointsReverted, enabled ? 10 : 0);
    assert.equal(r.calls.length, enabled ? 1 : 0);
  }
});

test('birthday and milestone rewards stop, without writes or external messages', async () => {
  const r = runtime({ query: async () => ({ rows: [{ date_of_birth: new Date().toISOString() }] }) });
  assert.equal(await r.func('awardBirthdayBonusIfEligible')('user'), null);
  assert.equal((await r.func('checkLoyaltyMilestones')('user')).length, 0);
  assert.equal(r.calls.length, 1); // only the date of birth is read
  assert.ok(r.calls.every(c => !/INSERT|UPDATE|DELETE/.test(c.sql)));
  await r.func('notifyPointsEarned')('user', 100, 500);
  await r.func('notifyRewardRedeemed')('user', 'Reward', 100);
  for (const key of ['points_earned', 'reward_redeemed', 'milestone_classes_5']) {
    const result = await r.func('notifyByTemplate')('user', key);
    assert.equal(result.reason, 'loyalty_disabled');
  }
});

for (const path of ['/api/loyalty/my-history', '/api/loyalty/rewards', '/api/admin/loyalty/users']) {
  test(`${path}: empty while disabled, no ledger read or deletion`, async () => {
    const r = await route(path);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data, []);
    assert.equal(r.calls.length, 0);
  });
}
for (const path of ['/api/loyalty/redeem', '/api/admin/loyalty/adjust']) {
  test(`${path}: rejects before ledger/stock mutations`, async () => {
    const r = await route(path, 'post');
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'LOYALTY_DISABLED');
    assert.equal(r.calls.length, 0);
  });
}
test('retroactive recalculation disabled performs no reads/writes', async () => {
  const r = await route('/api/admin/loyalty/recalculate/:userId', 'post');
  assert.equal(r.body.data.awarded, 0);
  assert.equal(r.calls.length, 0);
});
test('balance is zero while ledger remains untouched', async () => {
  const r = await route('/api/loyalty/points/:userId');
  assert.equal(r.body.data.balance, 0);
  assert.equal(r.calls.length, 0);
});
test('wallet shows zero points but keeps membership/classes and operational queries', async () => {
  const r = await route('/api/wallet/pass', 'get', { query: async sql => {
    if (sql.includes('FROM loyalty_transactions')) return { rows: [{ total: 1000 }] };
    if (sql.includes('FROM users')) return { rows: [{ display_name: 'Test user' }] };
    if (sql.includes('FROM memberships')) return { rows: [{ id: 'm', plan_name: 'HIVE', classes_remaining: 4, class_category: 'reformer', status: 'active' }] };
    return { rows: [] };
  }, extras: { normalizeClassCategory: v => v, parseBooleanFlag: Boolean } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.points, 0);
  assert.equal(r.body.data.membership.classes_remaining, 4);
});
test('milestone progress retains actual attendance but suppresses rewards', async () => {
  const r = await route('/api/loyalty/milestones/me', 'get', { query: async () => ({ rows: [{ n: 7 }] }) });
  assert.equal(r.body.data.lifetime_classes, 7);
  assert.equal(r.body.data.next_milestone, null);
  assert.deepEqual(r.body.data.milestones, []);
  assert.equal(r.calls.length, 1);
});
test('notifications skip loyalty tables and filter legacy templates while keeping booking notice', async () => {
  const r = await route('/api/me/notifications', 'get', { query: async (sql, params) => {
    if (sql.includes('FROM motivation_sends')) {
      assert.equal(params[2], false);
      assert.match(sql, /template_key NOT IN \('points_earned', 'reward_redeemed'\)/);
      assert.match(sql, /LEFT\(template_key, 10\) <> 'milestone_'/);
      return { rows: [] };
    }
    if (sql.includes('FROM bookings')) return { rows: [{ id: 'b', status: 'confirmed', class_name: 'Reformer', occurred_at: '2026-10-03T12:00:00Z' }] };
    assert.ok(!/loyalty_transactions|loyalty_milestone_awards/.test(sql));
    return { rows: [{}] };
  } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.data.map(x => x.category), ['booking']);
  assert.equal(r.body.meta.unread_count, 1);
});
test('unread query gates both loyalty sources and the same template filter', async () => {
  const r = await route('/api/me/notifications/unread-count', 'get', { query: async (sql, params) => {
    if (sql.includes('AS n')) {
      assert.equal(params[2], false);
      assert.match(sql, /loyalty_milestone_awards[^)]*AND \$3::boolean/);
      assert.match(sql, /loyalty_transactions[^)]*AND \$3::boolean/);
      assert.match(sql, /template_key NOT IN \('points_earned', 'reward_redeemed'\)/);
      assert.match(sql, /LEFT\(template_key, 10\) <> 'milestone_'/);
      return { rows: [{ n: 2 }] };
    }
    return { rows: [{}] };
  } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.unread_count, 2);
});

test('notification missing template key retains safe missing_arg response', async () => {
  const r = runtime();
  const notify = r.func('notifyByTemplate');
  for (const key of [undefined, null, '']) {
    assert.equal((await notify('user', key)).reason, 'missing_arg');
  }
  assert.equal(r.calls.length, 0);
});
