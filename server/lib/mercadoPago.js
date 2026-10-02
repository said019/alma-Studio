import crypto from 'node:crypto';
export const mpError=(message,status=400)=>Object.assign(new Error(message),{status});
export function mpConfig(env=process.env) {
 const clean=v=>String(v||'').trim();
 const config={enabled:env.MP_ENABLED==='true',accessToken:clean(env.MP_ACCESS_TOKEN),publicKey:clean(env.MP_PUBLIC_KEY),webhookSecret:clean(env.MP_WEBHOOK_SECRET),collectorId:clean(env.MP_COLLECTOR_ID),baseUrl:clean(env.MP_WEBHOOK_BASE_URL||env.APP_URL).replace(/\/+$/,'')};
 const allowTest=env.NODE_ENV!=='production'||env.PAYMENT_PROVIDER_ALLOW_TEST==='true';
 const testCredentials=config.accessToken.startsWith('TEST-')||config.publicKey.startsWith('TEST-');
 let https=false;try{https=new URL(config.baseUrl).protocol==='https:';}catch{}
 return {...config,requireLive:!allowTest,ready:Boolean((allowTest||!testCredentials)&&config.enabled&&config.accessToken&&config.publicKey&&config.webhookSecret&&/^\d+$/.test(config.collectorId)&&https),webhookUrl:`${config.baseUrl}/api/mercadopago/webhook`};
}
export function assertMpPayment(order,payment,config) {
 if(config.requireLive && payment.live_mode!==true)throw mpError('No se puede activar una compra real con un pago de prueba.',409);
 if(order.payment_provider!=='mercadopago'||order.mp_checkout_mode!=='embedded'||order.payment_method!=='card'||order.mp_collector_id!==config.collectorId)throw mpError('La cuenta de cobro no corresponde a la orden.',409);
 if(!/^\d+$/.test(String(payment.id||''))||String(payment.external_reference)!==order.id||String(payment.collector_id)!==config.collectorId)throw mpError('Referencia o receptor del pago incompatible.',409);
 if(payment.currency_id!=='MXN'||!Number.isFinite(Number(payment.transaction_amount))||Number(payment.transaction_amount)<=0||Math.round(Number(payment.transaction_amount)*100)!==Math.round(Number(order.total_amount)*100))throw mpError('El importe o la moneda del pago no coincide.',409);
 if(!['credit_card','debit_card','prepaid_card'].includes(payment.payment_type_id))throw mpError('El pago no corresponde a una tarjeta.',409);
 if(order.mp_payment_id&&String(payment.id)!==order.mp_payment_id)throw mpError('La orden ya está asociada a otro pago.',409);
}
export function buildMpPayment(order,form,config) {
 if(!form||typeof form!=='object'||Array.isArray(form)||Object.keys(form).some(k=>!['token','payment_method_id','issuer_id','installments','payer'].includes(k)))throw mpError('Datos de pago no permitidos.');
 if(typeof form.token!=='string'||!/^[\w-]{4,256}$/.test(form.token))throw mpError('Token de tarjeta inválido.');
 if(!/^[a-zA-Z0-9_]{1,40}$/.test(form.payment_method_id||''))throw mpError('Método de tarjeta inválido.');
 // HIVE collects a single period; installments are not an annual subscription.
 if(form.installments!==1)throw mpError('Este pago debe realizarse en una sola exhibición.');
 if(form.issuer_id!=null&&!/^\d{1,20}$/.test(String(form.issuer_id)))throw mpError('Emisor inválido.');
 if(!Number.isFinite(Number(order.total_amount))||Number(order.total_amount)<=0)throw mpError('Importe de orden inválido.');
 const payer={email:order.user_email};const id=form.payer?.identification;
 if(id){if(!/^[\w-]{1,20}$/.test(id.type)||!/^[a-zA-Z0-9 -]{1,32}$/.test(id.number))throw mpError('Identificación inválida.');payer.identification={type:id.type,number:id.number};}
 return {transaction_amount:Number(order.total_amount),token:form.token,payment_method_id:form.payment_method_id,installments:1,...(form.issuer_id!=null?{issuer_id:String(form.issuer_id)}:{}),payer,description:order.plan_name||'HIVE Pilates Studio',external_reference:order.id,notification_url:config.webhookUrl,three_d_secure_mode:'optional'};
}
export function verifyMpSignature({signature,requestId,dataId,secret,now=Date.now()}) {
 if(!secret||!requestId||!/^\d+$/.test(String(dataId)))return false;
 const parts=String(signature||'').split(',').map(p=>p.trim().split('='));
 if(parts.filter(([k])=>k==='ts').length!==1||parts.filter(([k])=>k==='v1').length!==1)return false;
 const {ts,v1}=Object.fromEntries(parts);if(!/^\d{10,13}$/.test(ts||'')||!/^[a-f0-9]{64}$/i.test(v1||''))return false;
 const time=Number(ts)*(ts.length<=10?1000:1);if(Math.abs(now-time)>10*60*1000)return false;
 const expected=crypto.createHmac('sha256',secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest();
 return crypto.timingSafeEqual(expected,Buffer.from(v1,'hex'));
}
export const MP_SCHEMA=`
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_checkout_mode TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_collector_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_external_checkout_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS mp_payment_status TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS orders_mp_payment_unique ON orders(mp_payment_id) WHERE mp_payment_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS mp_card_attempts(order_id UUID PRIMARY KEY REFERENCES orders(id),idempotency_key UUID NOT NULL UNIQUE,status TEXT NOT NULL,payment_id TEXT UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS mp_payment_events(payment_id TEXT NOT NULL,status TEXT NOT NULL,processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(payment_id,status));
`;
