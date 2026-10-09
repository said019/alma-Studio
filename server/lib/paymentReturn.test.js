import {test} from 'node:test';
import assert from 'node:assert/strict';
import {paymentReturnUrl} from './paymentReturn.js';
test('checkout returns to same allowed installed-app origin',()=>{
 for(const origin of ['https://hivestudio.com.mx','https://www.hivestudio.com.mx'])assert.equal(paymentReturnUrl('https://hivestudio.com.mx',origin,'abc'),origin+'/app/payment-return/abc');
});
test('rejects foreign, malformed, path, credential and insecure return origins',()=>{
 for(const origin of ['https://evil.test','https://hivestudio.com.mx.evil.test','https://evil@hivestudio.com.mx','https://hivestudio.com.mx/app','http://hivestudio.com.mx',null,{},'//evil.test'])assert.equal(paymentReturnUrl('https://hivestudio.com.mx',origin,'abc'),'https://hivestudio.com.mx/app/payment-return/abc');
});
test('nonproduction origin allowlist does not introduce HIVE production redirects',()=>{
 assert.equal(paymentReturnUrl('https://hive.example.test','https://hivestudio.com.mx','abc'),'https://hive.example.test/app/payment-return/abc');
});
