import crypto from 'node:crypto';
import {mpConfig,mpError,assertMpPayment,buildMpPayment,verifyMpSignature} from './mercadoPago.js';
const uuid=s=>/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(s));
const publicPayment=p=>({paymentId:String(p.id),status:p.status,statusDetail:p.status_detail,refundedAmount:Number(p.transaction_amount_refunded||(['refunded','charged_back'].includes(p.status)?p.transaction_amount:0)),...(p.status_detail==='pending_challenge'?{threeDS:p.three_ds_info}:{})});
export function registerMercadoPago(app,{pool,auth,finalizeOrder,afterPayment=()=>{},afterReversal=()=>{},purchaseConflict,hasWaiver,fetchImpl=fetch,config=()=>mpConfig()}) {
 const wrap=fn=>async(req,res,next)=>{try{return await fn(req,res,next);}catch(e){return res.status(e.status||503).json({message:e.status?e.message:'No pudimos confirmar el pago. Consulta su estado antes de volver a pagar.'});}};
 const ready=()=>{const c=config();if(!c.ready)throw mpError('El pago integrado con tarjeta todavía no está disponible.',503);return c;};
 const request=async(path,c,init={})=>{
  const response=await fetchImpl(`https://api.mercadopago.com${path}`,{...init,headers:{Authorization:`Bearer ${c.accessToken}`,...init.headers},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw mpError('Mercado Pago todavía no confirmó el intento. No vuelvas a pagar esta orden.',503);
  return response.json();
 };
 async function load(req){
  const c=ready();if(!uuid(req.params.id))throw mpError('Orden inválida.');
  const o=(await pool.query(`SELECT o.*,u.email AS user_email,p.name AS plan_name FROM orders o JOIN users u ON u.id=o.user_id LEFT JOIN plans p ON p.id=o.plan_id WHERE o.id=$1 AND o.user_id=$2`,[req.params.id,req.userId])).rows[0];
  if(!o)throw mpError('Orden no encontrada.',404);
  if(o.payment_provider!=='mercadopago'||o.mp_checkout_mode!=='embedded'||o.mp_collector_id!==c.collectorId||o.stripe_session_id)throw mpError('Esta orden conserva su método de pago original.',409);
  return {order:o,account:c};
 }
 async function apply(payment,c){
  if(!uuid(payment.external_reference))throw mpError('Referencia de pago inválida.',409);
  const db=await pool.connect();let order,activated=false,reversed=false,freedClasses=[];
  try{
   await db.query('BEGIN');order=(await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[payment.external_reference])).rows[0];
   if(!order)throw mpError('Orden no encontrada.',404);assertMpPayment(order,payment,c);
   // A provider-authenticated payment must correspond to an attempt reserved by HIVE.
   const attempt=(await db.query('SELECT * FROM mp_card_attempts WHERE order_id=$1',[order.id])).rows[0];
   if(!attempt||attempt.payment_id&&attempt.payment_id!==String(payment.id))throw mpError('El pago no corresponde al intento de la orden.',409);
   // Ignore stale intermediate notifications after a terminal provider result.
   if(['refunded','charged_back','cancelled'].includes(order.mp_payment_status)&&payment.status!==order.mp_payment_status){await db.query('ROLLBACK');return;}
   if(order.mp_payment_status==='approved'&&['pending','in_process','authorized','rejected'].includes(payment.status)){await db.query('ROLLBACK');return;}
   await db.query('UPDATE orders SET mp_payment_id=$2,mp_payment_status=$3,updated_at=NOW() WHERE id=$1',[order.id,String(payment.id),payment.status]);
   await db.query('UPDATE mp_card_attempts SET payment_id=$2,status=$3,updated_at=NOW() WHERE order_id=$1',[order.id,String(payment.id),payment.status]);
   const providerRefunded = ['refunded','charged_back'].includes(payment.status) ? Number(order.total_amount) : Number(payment.transaction_amount_refunded||0);
   if(!Number.isFinite(providerRefunded)||providerRefunded<0||providerRefunded>Number(order.total_amount))throw mpError('Importe de devolución incompatible.',409);
   if(payment.status==='approved'&&order.status!=='approved'){
    if(!['pending_payment','pending_verification','expired'].includes(order.status)||Number(order.refunded_amount||0)>0||providerRefunded>0)throw mpError('El pago necesita revisión del estudio; la orden no permite activación.',409);
    await finalizeOrder(db,order.id);activated=true;
   }
   const delta = Math.round((providerRefunded-Number(order.refunded_amount||0))*100)/100;
   if(delta>0) {
    const full=providerRefunded>=Number(order.total_amount);
    await db.query(`INSERT INTO refunds(order_id,user_id,amount,kind,method,reference,reason,membership_cancelled)
      VALUES($1,$2,$3,$4,'card',$5,$6,$7)`,[order.id,order.user_id,delta,full?'total':'partial',`mp:${payment.id}`,`Mercado Pago confirmado: ${payment.status}`,full]);
    await db.query('UPDATE orders SET refunded_amount=$2,refund_status=$3,refunded_at=NOW() WHERE id=$1',[order.id,providerRefunded,full?'refunded':'partially_refunded']);
   }
   if(['refunded','charged_back'].includes(payment.status)){
    reversed=true;
    // Lock future bookings before memberships, matching the existing refund flow.
    await db.query("SELECT b.id FROM bookings b JOIN memberships m ON m.id=b.membership_id JOIN classes c ON c.id=b.class_id WHERE m.order_id=$1 AND b.status IN ('confirmed','waitlist') AND (c.date+c.start_time) AT TIME ZONE 'America/Mexico_City'>NOW() ORDER BY b.id FOR UPDATE OF b",[order.id]);
    await db.query("UPDATE memberships SET status='cancelled',cancellation_reason='Mercado Pago: '||$2,updated_at=NOW() WHERE order_id=$1",[order.id,payment.status]);
    freedClasses=(await db.query("UPDATE bookings SET status='cancelled',cancelled_at=NOW(),plan_late_cancel=false WHERE membership_id IN (SELECT id FROM memberships WHERE order_id=$1) AND status IN ('confirmed','waitlist') AND class_id IN (SELECT id FROM classes WHERE (date+start_time) AT TIME ZONE 'America/Mexico_City'>NOW()) RETURNING class_id",[order.id])).rows.map(b=>b.class_id);
   }
   await db.query('INSERT INTO mp_payment_events(payment_id,status) VALUES($1,$2) ON CONFLICT DO NOTHING',[String(payment.id),payment.status]);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  if(activated||reversed)await afterPayment(order.user_id);
  if(freedClasses.length)await afterReversal(freedClasses);
 }
 async function recover(order,c){
  const a=(await pool.query('SELECT * FROM mp_card_attempts WHERE order_id=$1',[order.id])).rows[0];
  if(!a)return {attempt:null,payment:null};
  let id=a.payment_id;
  if(!id){
   const data=await request(`/v1/payments/search?external_reference=${encodeURIComponent(order.id)}&sort=date_created&criteria=desc`,c);
   const found=(data.results||[]).filter(p=>p.external_reference===order.id);
   if(found.length>1)throw mpError('Hay más de un movimiento asociado. El estudio debe revisar el pago.',409);
   if(!found.length)return {attempt:a,payment:{status:'processing'}};
   id=String(found[0].id);
  }
  if(!/^\d+$/.test(String(id)))throw mpError('Identificador de pago inválido.',409);
  const p=await request(`/v1/payments/${id}`,c);assertMpPayment(order,p,c);await apply(p,c);
  return {attempt:a,payment:publicPayment(p)};
 }
 const session=wrap(async(req,res)=>{
  const {order,account}=await load(req);const {attempt,payment}=await recover(order,account);
  const fresh=(await pool.query('SELECT status,refund_status,refunded_amount FROM orders WHERE id=$1',[order.id])).rows[0];
  const state=fresh?.status;
  res.json({data:{orderId:order.id,amount:Number(order.total_amount),currency:'MXN',publicKey:account.publicKey,email:order.user_email,orderStatus:state,refundStatus:fresh?.refund_status||null,refundedAmount:Number(fresh?.refunded_amount||0),payment,canSubmit:!attempt&&state==='pending_payment'&&(!order.expires_at||new Date(order.expires_at)>new Date()),recurringSupported:false}});
 });
 app.get('/api/payments/card-readiness',(_req,res)=>res.json({data:{ready:config().ready,provider:'mercadopago',recurringSupported:false,message:config().ready?null:'El pago integrado con tarjeta todavía no está disponible.'}}));
 app.get('/api/public/payment-config',(_req,res)=>res.json({data:{cardEnabled:config().ready,provider:'mercadopago'}}));
 app.get('/api/orders/:id/card-payment-session',auth,session);
 app.post('/api/orders/:id/card-payment-sync',auth,session);
 app.post('/api/orders/:id/card-payment',auth,wrap(async(req,res)=>{
  const {order,account}=await load(req);
  if(order.status!=='pending_payment'||order.expires_at&&new Date(order.expires_at)<=new Date())throw mpError('Esta orden ya no acepta pagos.',409);
  const body=buildMpPayment(order,req.body,account);
  const db=await pool.connect();let attempt;
  try{
   await db.query('BEGIN');const locked=(await db.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE',[order.id])).rows[0];
   if(locked.status!=='pending_payment'||locked.expires_at&&new Date(locked.expires_at)<=new Date())throw mpError('Esta orden ya no acepta pagos.',409);
   if(hasWaiver&&!(await hasWaiver(db,order.user_id)))throw mpError('Firma la responsiva antes de pagar.',403);
   const plan=(await db.query('SELECT * FROM plans WHERE id=$1',[order.plan_id])).rows[0];
   if(plan?.rules?.auto_renew)throw mpError('Este plan anual conserva su enlace de contratación externo.',409);
   const conflict=await purchaseConflict?.({userId:order.user_id,plan,excludeOrderId:order.id,client:db});if(conflict)throw mpError(conflict.message,409);
   attempt=(await db.query("INSERT INTO mp_card_attempts(order_id,idempotency_key,status) VALUES($1,$2,'processing') ON CONFLICT(order_id) DO NOTHING RETURNING *",[order.id,crypto.randomUUID()])).rows[0];
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  if(!attempt)return res.status(202).json({data:{status:'processing',message:'Ya existe un intento. Consulta su estado; no vuelvas a pagar.'}});
  // Never retry POST on timeout or ambiguous failure. The reserved attempt survives.
  const p=await request('/v1/payments',account,{method:'POST',headers:{'Content-Type':'application/json','X-Idempotency-Key':attempt.idempotency_key},body:JSON.stringify(body)});
  assertMpPayment(order,p,account);
  await pool.query('UPDATE mp_card_attempts SET payment_id=$2,status=$3,updated_at=NOW() WHERE order_id=$1',[order.id,String(p.id),p.status]);
  // Browser submission never activates access; a subsequent authenticated GET does.
  return res.status(202).json({data:publicPayment(p)});
 }));
 app.post('/api/mercadopago/webhook',wrap(async(req,res)=>{
  const c=ready();const id=req.query['data.id'];
  if(req.body?.data?.id!=null&&String(req.body.data.id)!==String(id))throw mpError('Notificación incompatible.',401);
  if(!verifyMpSignature({signature:req.headers['x-signature'],requestId:req.headers['x-request-id'],dataId:id,secret:c.webhookSecret}))throw mpError('Firma de notificación inválida.',401);
  const p=await request(`/v1/payments/${id}`,c);await apply(p,c);return res.json({received:true});
 }));
 // Intercept before the legacy Stripe routes. Existing provider sessions are immutable.
 app.post('/api/orders/:id/pay-with-card',auth,wrap(async(req,res)=>{
  const c=config();if(!uuid(req.params.id))throw mpError('Orden inválida.');const db=await pool.connect();
  try{
   await db.query('BEGIN');const o=(await db.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.userId])).rows[0];
   if(!o)throw mpError('Orden no encontrada.',404);
   if(o.status!=='pending_payment'||o.expires_at&&new Date(o.expires_at)<=new Date())throw mpError('La orden ya no acepta pagos.',409);
   if(hasWaiver&&!(await hasWaiver(db,o.user_id)))throw mpError('Firma la responsiva antes de pagar.',403);
   if(o.mp_checkout_mode==='external'&&o.mp_external_checkout_url) {
    await db.query('COMMIT');return res.json({data:{payment_provider:'mercadopago_external',mp_checkout_mode:'external',checkout_url:o.mp_external_checkout_url}});
   }
   if(o.stripe_session_id||['stripe','mercadopago_external'].includes(o.payment_provider)||o.payment_method==='card'&&o.mp_checkout_mode!=='embedded')throw mpError('Esta orden conserva su método original. Revísala con el estudio.',409);
   if(o.mp_checkout_mode==='embedded'&&o.mp_collector_id!==c.collectorId)throw mpError('La orden pertenece a otra cuenta de cobro.',409);
   const p=(await db.query('SELECT * FROM plans WHERE id=$1',[o.plan_id])).rows[0];
   if(p?.rules?.auto_renew) {
    const amount=Number(o.total_amount);
    const link=Number(p.opening_price)===amount ? p.rules.opening_payment_url : Number(p.price)===amount ? p.rules.payment_url : null;
    if(!link)throw mpError('El plan anual requiere un enlace compatible con el importe de esta orden.',409);
    await db.query("UPDATE orders SET payment_method='card',payment_provider='mercadopago_external',mp_checkout_mode='external',mp_external_checkout_url=$2 WHERE id=$1",[o.id,link]);
    await db.query('COMMIT');return res.json({data:{payment_provider:'mercadopago_external',mp_checkout_mode:'external',checkout_url:link}});
   }
   ready();

   await db.query("UPDATE orders SET payment_method='card',payment_provider='mercadopago',mp_checkout_mode='embedded',mp_collector_id=$2 WHERE id=$1",[o.id,c.collectorId]);
   await db.query('COMMIT');return res.json({data:{...o,payment_method:'card',payment_provider:'mercadopago',mp_checkout_mode:'embedded'}});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }));
 app.post('/api/orders/:id/cancel',auth,wrap(async(req,res,next)=>{
  if(!uuid(req.params.id))throw mpError('Orden inválida.');const db=await pool.connect();
  try{
   await db.query('BEGIN');const o=(await db.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE',[req.params.id,req.userId])).rows[0];
   if(!o||o.mp_checkout_mode!=='embedded'){await db.query('ROLLBACK');return next();}
   const a=(await db.query('SELECT status FROM mp_card_attempts WHERE order_id=$1',[o.id])).rows[0];
   if(o.status!=='pending_payment'||a&&!['rejected','cancelled'].includes(a.status))throw mpError('El intento de pago necesita confirmación antes de cancelar.',409);
   await db.query("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1",[o.id]);await db.query('COMMIT');return res.json({message:'Orden cancelada'});
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
 }));
 return {processVerifiedPayment:apply};
}
