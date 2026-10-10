import test from 'node:test';
import assert from 'node:assert/strict';
import {claimRenewalReminder} from './renewalReminderOnce.js';
test('same membership never repeats; another purchased membership can notify',async()=>{
 const claims=new Set();const pool={query:async(sql,[key])=>{
  assert.match(sql,/ON CONFLICT \(key\) DO NOTHING/);
  if(claims.has(key))return {rows:[]};claims.add(key);return {rows:[{key}]};
 }};
 assert.equal(await claimRenewalReminder(pool,'one'),true);
 assert.equal(await claimRenewalReminder(pool,'one'),false);
 assert.equal(await claimRenewalReminder(pool,'two'),true);
});
