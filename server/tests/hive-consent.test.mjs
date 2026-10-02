import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, login, sql, makeClient, cleanup, closeDb, ADMIN } from './helpers.mjs';
const prefix = 'rghiveconsent';
let user, admin, planId;
const signature = () => {
  const b = Buffer.alloc(2033);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(b);
  b.writeUInt32BE(13,8); b.write('IHDR',12); b.writeUInt32BE(600,16); b.writeUInt32BE(200,20);
  return `data:image/png;base64,${b.toString('base64')}`;
};
const intake = () => ({ full_name:'Persona QA', phone:'5555555555', signature_data:signature(), waiver_version:'v3',
  emergency_contact_name:'Contacto QA', emergency_contact_phone:'5511111111', medical_conditions:'Sin lesión declarada', health_consent:true });
before(async () => {
  admin = await login(ADMIN.email, ADMIN.password);
  user = await makeClient(prefix, 'client', {waiver:false});
  [ { id:planId } ] = await sql("INSERT INTO plans(name,price,currency,duration_days,class_limit,is_active) VALUES($1,330,'MXN',30,1,true) RETURNING id",[`${prefix} clase`]);
});
after(async () => { await cleanup(prefix); await sql('DELETE FROM plans WHERE id=$1',[planId]); await closeDb(); });
test('compra en app y venta mostrador requieren responsiva antes de crear orden', async () => {
  const app = await api('POST','/api/orders',{token:user.token,body:{planId}});
  assert.equal(app.status,403); assert.equal(app.body.code,'WAIVER_REQUIRED');
  const desk = await api('POST','/api/memberships',{token:admin.token,body:{planId,userId:user.id,paymentMethod:'cash'}});
  assert.equal(desk.status,403); assert.equal(desk.body.code,'WAIVER_REQUIRED');
  assert.equal((await sql('SELECT count(*)::int n FROM orders WHERE user_id=$1',[user.id]))[0].n,0);
});
test('carta v3 rechaza datos incompletos y salud sin autorización; guarda campos íntegros', async () => {
  const bad = await api('POST','/api/me/waiver',{token:user.token,body:{...intake(),emergency_contact_phone:''}});
  assert.equal(bad.status,400);
  const noConsent = await api('POST','/api/me/waiver',{token:user.token,body:{...intake(),health_consent:false}});
  assert.equal(noConsent.status,400);
  const good = await api('POST','/api/me/waiver',{token:user.token,body:intake()});
  assert.equal(good.status,201,JSON.stringify(good.body));
  assert.equal(good.body.data.medical_conditions,'Sin lesión declarada');
  const metadata=(await sql('SELECT health_consent_version,health_consent_at FROM users WHERE id=$1',[user.id]))[0];
  assert.ok(metadata.health_consent_version);
  assert.ok(metadata.health_consent_at);
  const stored = await api('GET','/api/me/waiver',{token:user.token});
  assert.equal(stored.body.data.waiver_version,'v3');
  assert.equal(stored.body.data.emergency_contact_phone,'5511111111');
  const sale = await api('POST','/api/orders',{token:user.token,body:{planId,paymentMethod:'transfer'}});
  assert.equal(sale.status,201,JSON.stringify(sale.body));
});
test('revocación no borra metadata si falla la limpieza de salud en la responsiva', async () => {
  await sql(`CREATE OR REPLACE FUNCTION rghiveconsent_reject_waiver() RETURNS trigger AS $$ BEGIN
    IF OLD.user_id::text = TG_ARGV[0] THEN RAISE EXCEPTION 'QA: fallo simulado al borrar responsiva'; END IF;
    RETURN NEW;
  END; $$ LANGUAGE plpgsql`);
  try {
    await sql(`CREATE TRIGGER rghiveconsent_reject BEFORE UPDATE ON waivers FOR EACH ROW EXECUTE FUNCTION rghiveconsent_reject_waiver('${user.id}')`);
    const r = await api('DELETE','/api/me/health-consent',{token:user.token});
    assert.equal(r.status,500);
    const metadata=(await sql('SELECT health_consent_version,health_consent_at FROM users WHERE id=$1',[user.id]))[0];
    assert.ok(metadata.health_consent_version);
    assert.ok(metadata.health_consent_at);
    const row=(await sql('SELECT intake_data FROM waivers WHERE user_id=$1',[user.id]))[0];
    assert.equal(row.intake_data.medical_conditions,'Sin lesión declarada');
    assert.equal(row.intake_data.health_consent,true);
  } finally {
    await sql('DROP TRIGGER IF EXISTS rghiveconsent_reject ON waivers');
    await sql('DROP FUNCTION IF EXISTS rghiveconsent_reject_waiver()');
  }
});
test('retiro de consentimiento borra datos médicos nuevos y conserva contacto de emergencia', async () => {
  const r = await api('DELETE','/api/me/health-consent',{token:user.token});
  assert.equal(r.status,200);
  const row=(await sql('SELECT intake_data FROM waivers WHERE user_id=$1',[user.id]))[0];
  assert.equal(row.intake_data.medical_conditions,undefined);
  assert.equal(row.intake_data.health_consent,false);
  assert.equal(row.intake_data.emergency_contact_phone,'5511111111');
  const metadata=(await sql('SELECT health_consent_version,health_consent_at FROM users WHERE id=$1',[user.id]))[0];
  assert.equal(metadata.health_consent_version,null);
  assert.equal(metadata.health_consent_at,null);
});
test('firma en recepción autorizada solo para staff y permite venta posterior',async()=>{
  const visitor = await makeClient(prefix,'desk',{waiver:false});
  const denied=await api('POST',`/api/admin/users/${visitor.id}/waiver`,{token:user.token,body:intake()});
  assert.equal(denied.status,403);
  const signed=await api('POST',`/api/admin/users/${visitor.id}/waiver`,{token:admin.token,body:intake()});
  assert.equal(signed.status,201,JSON.stringify(signed.body));
  const sale=await api('POST','/api/memberships',{token:admin.token,body:{userId:visitor.id,planId,paymentMethod:'cash'}});
  assert.equal(sale.status,201,JSON.stringify(sale.body));
});
test('banco configurado coincide con información suministrada, sin inventar titular',async()=>{
  const r=await api('GET','/api/admin/bank-info',{token:admin.token});
  assert.equal(r.status,200);
  assert.equal(r.body.data.bank,'Mercado Pago');
  assert.equal(r.body.data.clabe.replace(/\s/g,''),'722969020124160665');
  assert.equal(r.body.data.account_holder,'');
});
