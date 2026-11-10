import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shouldRetryWhatsApp} from './whatsappRetry.js';
test('ambiguous timeouts and server failures never duplicate the send request',()=>{
 for(const error of [new Error('timeout'),{code:'ECONNRESET'},{response:{status:500}},{response:{status:502}},{response:{status:400}}])assert.equal(shouldRetryWhatsApp(error,1),false);
});
test('explicit rate limiting has bounded retries',()=>{
 assert.equal(shouldRetryWhatsApp({response:{status:429}},1),true);
 assert.equal(shouldRetryWhatsApp({response:{status:429}},3),false);
});
