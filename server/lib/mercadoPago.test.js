import {test} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {mpConfig,assertMpPayment,buildMpPayment,verifyMpSignature} from './mercadoPago.js';
const config={ready:true,collectorId:'123',webhookUrl:'https://hive.test/api/mercadopago/webhook'};
const order={id:'01010101-0101-0101-0101-010101010101',payment_provider:'mercadopago',mp_checkout_mode:'embedded',mp_collector_id:'123',payment_method:'card',total_amount:'290.00',user_email:'client@example.test',plan_name:'1 Clase'};
const payment={id:987,external_reference:order.id,collector_id:123,currency_id:'MXN',transaction_amount:290,payment_type_id:'credit_card',status:'approved'};
test('MP falla cerrado si falta configuración; readiness nunca implica cobro',()=>{
 const env={MP_ENABLED:'true',MP_ACCESS_TOKEN:'fake-token',MP_PUBLIC_KEY:'fake-public',MP_WEBHOOK_SECRET:'fake-secret',MP_COLLECTOR_ID:'123',MP_WEBHOOK_BASE_URL:'https://hive.test/'};
 assert.equal(mpConfig(env).ready,true);assert.equal(mpConfig({...env,MP_ENABLED:'false'}).ready,false);
 for(const key of Object.keys(env))assert.equal(mpConfig({...env,[key]:''}).ready,false,key);
 assert.equal(mpConfig({...env,MP_WEBHOOK_BASE_URL:'http://hive.test'}).ready,false);
});
test('monto, moneda, referencia, cuenta, método y pago único se verifican',()=>{
 assert.doesNotThrow(()=>assertMpPayment(order,payment,config));
 for(const changed of [{transaction_amount:289.99},{transaction_amount:'NaN'},{currency_id:'USD'},{external_reference:'other'},{collector_id:456},{payment_type_id:'account_money'},{id:'bad'}])assert.throws(()=>assertMpPayment(order,{...payment,...changed},config));
 for(const changed of [{mp_payment_id:'different'},{payment_method:'cash'},{mp_checkout_mode:'external'},{payment_provider:'stripe'},{mp_collector_id:'456'}])assert.throws(()=>assertMpPayment({...order,...changed},payment,config));
});
test('payload usa precio/correo/referencia servidor y nunca acepta PAN o monto cliente',()=>{
 const form={token:'token_fake',payment_method_id:'visa',installments:1,payer:{email:'attacker@example.test'}};
 const body=buildMpPayment(order,form,config);
 assert.equal(body.transaction_amount,290);assert.equal(body.payer.email,order.user_email);assert.equal(body.external_reference,order.id);assert.equal(body.notification_url,config.webhookUrl);
 for(const changed of [{transaction_amount:1},{card_number:'4111111111111111'},{security_code:'123'},{installments:12},{issuer_id:'bad'},{token:''},{payment_method_id:'../other'}])assert.throws(()=>buildMpPayment(order,{...form,...changed},config));
});
test('firma HMAC requiere id=request-id+timestamp, tolerancia y longitud seguras',()=>{
 const now=Date.now(),ts=String(now),secret='synthetic-secret',requestId='synthetic-request',dataId='987';
 const hash=crypto.createHmac('sha256',secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
 const req={signature:`ts=${ts},v1=${hash}`,requestId,dataId,secret,now};assert.equal(verifyMpSignature(req),true);
 for(const changed of [{secret:''},{requestId:''},{dataId:'986'},{now:now+11*60*1000},{signature:'ts=1,v1=bad'},{signature:`ts=${ts},ts=${ts},v1=${hash}`}])assert.equal(verifyMpSignature({...req,...changed}),false);
});
test('producción rechaza credenciales y pagos de prueba por defecto',()=>{
 const env={NODE_ENV:'production',MP_ENABLED:'true',MP_ACCESS_TOKEN:'TEST-fake',MP_PUBLIC_KEY:'TEST-public',MP_WEBHOOK_SECRET:'secret',MP_COLLECTOR_ID:'123',MP_WEBHOOK_BASE_URL:'https://hive.test'};
 assert.equal(mpConfig(env).ready,false);assert.equal(mpConfig(env).requireLive,true);
 assert.equal(mpConfig({...env,PAYMENT_PROVIDER_ALLOW_TEST:'true'}).ready,true);
 assert.throws(()=>assertMpPayment(order,{...payment,live_mode:false},{...config,requireLive:true}),/prueba/);
 assert.throws(()=>assertMpPayment(order,payment,{...config,requireLive:true}),/prueba/);
 assert.doesNotThrow(()=>assertMpPayment(order,{...payment,live_mode:true},{...config,requireLive:true}));
});
