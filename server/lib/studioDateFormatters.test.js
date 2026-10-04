import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash } from 'node:crypto';

// Frozen from live/base a30a7c6e2c60072855bc1f583793fb4793e0cfcc.
// Only pure declarations are evaluated; the HTTP server, jobs and DB never start.
const fixtures = new URL('./fixtures/studio-formatters/', import.meta.url);
const read = path => fs.readFileSync(path, 'utf8');
const before = Object.fromEntries(Object.entries({
  header: ['studio-header.before.txt', 'ae61d5162e37dc9fb704d03c40f95e4c2169b2c380d88bdb1295d0c4ca4065d3'],
  booking: ['bookingRules.before.txt', '636ed6ad68ebf6cf5430fe6a75b27622052ce7b777c2dd0df55a5826ffd1c4de'],
  plan: ['planRules.before.txt', '97131136afd8c05ec312e5fafcf28ab4e0e4d36f9cf9594f92f191ee4c0a2427'],
}).map(([name, [file, hash]]) => {
  const source = read(new URL(file, fixtures));
  assert.equal(createHash('sha256').update(source).digest('hex'), hash);
  return [name, source];
}));
const entry = read(new URL('../index.js', import.meta.url));
const after = {
  header: entry.slice(entry.indexOf('const TZ_PEDIDA'), entry.indexOf('import express')),
  booking: read(new URL('./bookingRules.js', import.meta.url)),
  plan: read(new URL('./planRules.js', import.meta.url)),
  cache: read(new URL('./studioDateFormatters.js', import.meta.url)),
};
const plain = source => source.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const APIs = ['todayInStudio', 'isWithinMorningWindow', 'isWithinAfternoonWindow', 'sessionWithinRules', 'sessionWithinValidity', 'membershipAllowsSession'];

function world(source, zone = 'America/Mexico_City') {
  const counter = { constructors: 0 };
  const clock = { now: Date.parse('2026-10-02T18:00:00Z') };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static [Symbol.hasInstance](value) { return value instanceof Date; }
  }
  const CountingFormatter = new Proxy(Intl.DateTimeFormat, {
    construct(target, args) { counter.constructors++; return Reflect.construct(target, args); },
  });
  const context = vm.createContext({
    Intl: { DateTimeFormat: CountingFormatter }, Date: ClockDate,
    process: { env: { STUDIO_TIMEZONE: zone, TZ: 'UTC' } }, console: { warn() {} },
  });
  for (const part of ['cache', 'header', 'plan', 'booking']) if (source[part]) vm.runInContext(plain(source[part]), context);
  const api = Object.fromEntries(APIs.map(name => [name, vm.runInContext(name, context)]));
  return { ...api, counter, clock, zone: vm.runInContext('STUDIO_TIMEZONE', context) };
}
const outcome = fn => {
  try { return { value: fn() }; } catch (error) { return { error: error.name, message: error.message }; }
};
function equivalent(a, b, name, args) {
  assert.deepEqual(outcome(() => a[name](...args)), outcome(() => b[name](...args)), `${name}: ${String(args[0])}`);
}

test('daily formatter preserves validated studio zone, civil dates, native errors and a fresh now', () => {
  for (const zone of ['America/Mexico_City', 'UTC', 'America/New_York', 'Pacific/Kiritimati', '', 'Invalid/Zone']) {
    const a = world(before, zone), b = world(after, zone);
    assert.equal(a.zone, b.zone);
    for (const value of [new Date('2026-10-02T05:59:59Z'), new Date('2026-10-02T06:00:00Z'), new Date('2020-04-05T08:00:00Z'), new Date('2020-10-25T07:00:00Z'), new Date(NaN), 0, -1, null, NaN, '2026-10-02', Symbol('date')]) equivalent(a, b, 'todayInStudio', [value]);
    a.clock.now = b.clock.now = Date.parse('2026-10-02T01:00:00Z');
    equivalent(a, b, 'todayInStudio', []);
    const first = b.todayInStudio();
    a.clock.now += 86400000; b.clock.now += 86400000;
    equivalent(a, b, 'todayInStudio', []);
    assert.notEqual(b.todayInStudio(), first, 'cache stores configuration, never the current day');
  }
});

test('morning keeps en-US hour24/lastHour semantics; afternoon keeps current inclusive 11–16 minutes', () => {
  const a = world(before), b = world(after);
  for (const [time, expected] of [['10:59', false], ['11:00', true], ['12:00', true], ['16:00', true], ['16:01', false]]) {
    const date = `2026-10-02T${time}:00-06:00`;
    assert.equal(a.isWithinAfternoonWindow(date), expected);
    assert.equal(b.isWithinAfternoonWindow(date), expected);
  }
  for (const zone of ['America/Mexico_City', 'UTC', 'America/New_York', 'Pacific/Kiritimati']) {
    for (const date of ['2026-10-02T00:00:00-06:00', '2026-10-02T10:00:00-06:00', '2026-10-02T10:59:59-06:00', '2026-10-02T11:00:00-06:00', '2026-10-02T16:00:59-06:00', '2026-10-02T16:01:00-06:00', '2020-04-05T07:59:00Z', '2020-04-05T08:00:00Z', '2020-10-25T07:00:00Z']) {
      for (const lastHour of [undefined, 0, 9, 10, 10.5, 23, 24, -1, null, NaN, '10']) equivalent(a, b, 'isWithinMorningWindow', [date, zone, lastHour]);
      equivalent(a, b, 'isWithinAfternoonWindow', [date, zone]);
    }
  }
  assert.equal(b.isWithinMorningWindow('2026-10-02T00:00:00-06:00'), false, 'native en-US hour24 is not normalized to hour0');
});

test('invalid dates, falsy inputs, lastHour coercion and native timeZone errors remain identical', () => {
  const a = world(before), b = world(after);
  for (const date of [undefined, null, '', false, 0, NaN, 'invalid', new Date(NaN), Symbol('date'), 1n]) {
    for (const zone of [undefined, '', 'Invalid/Zone', null, Symbol('zone')]) {
      equivalent(a, b, 'isWithinMorningWindow', [date, zone]);
      equivalent(a, b, 'isWithinAfternoonWindow', [date, zone]);
      equivalent(a, b, 'sessionWithinRules', [{}, date, zone]);
    }
  }
  for (const lastHour of [Symbol('hour'), {}, { valueOf() { return 11; } }]) equivalent(a, b, 'isWithinMorningWindow', ['2026-10-02T10:00:00-06:00', 'America/Mexico_City', lastHour]);
});

test('plan rule weekdays, current time boundaries and malformed rule inputs retain results/errors', () => {
  const a = world(before), b = world(after);
  const rules = [undefined, null, {}, [], { allowed_weekdays: [1, 2, 3, 4, 5], booking_start_time: '11:00', booking_end_time: '16:00' }, { allowed_weekdays: [] }, { allowed_weekdays: 2 }, { booking_start_time: '00:00', booking_end_time: '23:59' }];
  for (const r of rules) for (const date of ['2026-10-02T10:59:00-06:00', '2026-10-02T11:00:00-06:00', '2026-10-02T16:00:00-06:00', '2026-10-02T16:01:00-06:00', '2026-10-03T12:00:00-06:00', '2026-10-04T12:00:00-06:00', '2020-04-05T08:00:00Z', '2026-10-02T00:00:00-06:00']) {
    for (const zone of ['America/Mexico_City', 'UTC', 'America/New_York', 'Pacific/Kiritimati']) equivalent(a, b, 'sessionWithinRules', [r, date, zone]);
  }
});

test('membership validity and real eligibility retain civil dates, legacy empty rules and capacities', () => {
  const a = world(before), b = world(after);
  const members = [{}, { start_date: '2026-10-01', end_date: '2026-10-30', rules: {} }, { start_date: new Date('2026-10-01T00:00:00Z'), end_date: new Date('2026-10-30T00:00:00Z') }, { start_date: new Date(NaN) }, { morning_only: true }, { afternoon_only: true }, { personal_only: true }, { rules: { allowed_weekdays: [1, 2, 3, 4, 5], booking_start_time: '11:00', booking_end_time: '16:00' } }];
  for (const member of members) for (const date of [undefined, null, 0, 'invalid', '2026-09-30T23:59:59-06:00', '2026-10-01T00:00:00-06:00', '2026-10-02T11:00:00-06:00', '2026-10-30T23:59:59-06:00', '2026-10-31T00:00:00-06:00']) {
    equivalent(a, b, 'sessionWithinValidity', [member, date]);
    for (const capacity of [undefined, 0, 1, 4, '1']) equivalent(a, b, 'membershipAllowsSession', [member, date, capacity]);
  }
});

test('repeated daily/eligibility traversal keeps the chosen membership and reduces 800 constructors to four', () => {
  const a = world(before), b = world(after);
  const members = [
    { id: 'expired', start_date: '2026-10-01', end_date: '2026-10-01' },
    { id: 'morning', start_date: '2026-10-01', end_date: '2026-10-31', rules: {}, morning_only: true },
    { id: 'afternoon', start_date: '2026-10-01', end_date: '2026-10-31', rules: { allowed_weekdays: [1, 2, 3, 4, 5], booking_start_time: '11:00', booking_end_time: '16:00' }, afternoon_only: true },
  ];
  const date = '2026-10-02T12:00:00-06:00';
  const initialA = a.counter.constructors, initialB = b.counter.constructors;
  assert.equal(initialA, 1); assert.equal(initialB, 1); // existing startup zone validation only
  for (let i = 0; i < 100; i++) {
    const run = api => [api.todayInStudio(new Date(date)), members.find(m => api.membershipAllowsSession(m, date, 4))?.id];
    assert.deepEqual(run(a), run(b));
  }
  assert.equal(members.find(m => b.membershipAllowsSession(m, date, 4))?.id, 'afternoon');
  assert.equal(a.counter.constructors - initialA, 800);
  assert.equal(b.counter.constructors - initialB, 4);
});

test('bounded LRU keys distinguish configurations, retain hot entries and never insert invalid zones', () => {
  const api = world(after), initial = api.counter.constructors;
  const zones = ['UTC', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver', 'America/Sao_Paulo', 'America/Lima', 'America/Toronto', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Kolkata', 'Australia/Sydney', 'Pacific/Auckland'];
  const date = '2026-10-02T18:00:00Z';
  for (const zone of zones.slice(0, 16)) api.isWithinMorningWindow(date, zone);
  assert.equal(api.counter.constructors - initial, 16);
  api.isWithinMorningWindow(date, zones[0]); // refresh oldest entry
  api.isWithinMorningWindow(date, zones[16]);
  api.isWithinMorningWindow(date, zones[0]);
  assert.equal(api.counter.constructors - initial, 17);
  api.isWithinMorningWindow(date, zones[1]); // the least-recently-used entry was evicted
  assert.equal(api.counter.constructors - initial, 18);
  for (let i = 0; i < 2; i++) assert.throws(() => api.isWithinMorningWindow(date, 'Invalid/Zone'), { name: 'RangeError' });
  api.isWithinMorningWindow(date, zones[0]);
  assert.equal(api.counter.constructors - initial, 20, 'throwing construction never evicts a good entry');
  api.isWithinAfternoonWindow(date, zones[0]);
  api.sessionWithinRules({}, date, zones[0]);
  assert.equal(api.counter.constructors - initial, 22, 'morning, afternoon and rules must not share options');
});

test('non-string zone coercion runs on every call, preserving mutable objects and native throws', () => {
  for (const name of ['isWithinMorningWindow', 'isWithinAfternoonWindow', 'sessionWithinRules']) {
    const results = [];
    for (const source of [before, after]) {
      const api = world(source), counts = { calls: 0 }, zones = ['UTC', 'Pacific/Kiritimati'];
      const zone = { toString() { return zones[counts.calls++]; } };
      const args = name === 'sessionWithinRules' ? [{ booking_start_time: '11:00' }, '2026-10-02T12:00:00Z', zone] : ['2026-10-02T12:00:00Z', zone];
      results.push([outcome(() => api[name](...args)), outcome(() => api[name](...args)), counts.calls]);
    }
    assert.deepEqual(results[0], results[1]);
    assert.equal(results[1][2], 2);
  }
});

test('explicit studio rules stay equivalent across process zones without caching civil dates', () => {
  const oldTZ = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Mexico_City', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      const a = world(before), b = world(after);
      equivalent(a, b, 'todayInStudio', [new Date('2026-10-02T05:59:59Z')]);
      equivalent(a, b, 'sessionWithinValidity', [{ start_date: '2026-10-02', end_date: '2026-10-02' }, '2026-10-03T05:59:59Z']);
      equivalent(a, b, 'isWithinAfternoonWindow', ['2026-10-02T17:00:00Z']);
    }
  } finally { if (oldTZ === undefined) delete process.env.TZ; else process.env.TZ = oldTZ; }
});
