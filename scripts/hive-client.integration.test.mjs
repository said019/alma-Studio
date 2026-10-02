import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

// Opt-in, local isolated QA only. Never reads DATABASE_URL or sends real payments.
const dbUrl = process.env.HIVE_QA_DATABASE_URL;
const base = process.env.HIVE_QA_API_URL;
test('HIVE client HTTP: consent, eligible membership fallback and matching Mercado Pago price', {skip: !dbUrl || !base}, async () => {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local QA API');
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(dbUrl).hostname), 'Use a local QA database');
  assert.match(new URL(dbUrl).pathname, /qa|test/i, 'Use an isolated QA database');
  const db = new pg.Client({connectionString: dbUrl});
  await db.connect();
  let uid, typeId, instructorId, classId, regularPlanId;
  try {
    const email = `hive-http-${crypto.randomUUID()}@example.test`, password = crypto.randomUUID();
    uid = (await db.query("INSERT INTO users(email,display_name,password_hash,role) VALUES($1,'Synthetic HTTP QA',$2,'client') RETURNING id", [email, await bcrypt.hash(password, 10)])).rows[0].id;
    const login = await fetch(`${base}/api/auth/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({email, password})});
    const auth = await login.json();
    const token = auth.token ?? auth.data?.token;
    assert.ok(token, 'Synthetic client login succeeds');
    const post = async (path, body) => {
      const response = await fetch(`${base}/api${path}`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify(body)});
      return {status: response.status, data: await response.json()};
    };
    const annual = (await db.query("SELECT * FROM plans WHERE name='Plan anual / pago mensual' AND is_active=true LIMIT 1")).rows[0];
    assert.ok(annual, 'HIVE catalog is installed in QA');
    const blocked = await post('/orders', {planId: annual.id, paymentMethod: 'card'});
    assert.equal(blocked.status, 403);
    assert.equal(blocked.data.code, 'WAIVER_REQUIRED');
    // Synthetic stored signature avoids introducing real personal/medical data.
    await db.query("INSERT INTO waivers(user_id,full_name,phone,image_consent,signature_data,waiver_version) VALUES($1,'Synthetic QA','5555555555',false,'synthetic-test-only','v3')", [uid]);
    const student = (await db.query("SELECT id FROM plans WHERE name='Promo estudiante' AND is_active=true LIMIT 1")).rows[0];
    const unverifiedPurchase = await post('/orders', {planId: student.id, paymentMethod: 'transfer'});
    assert.equal(unverifiedPurchase.status, 409, JSON.stringify(unverifiedPurchase));
    assert.match(unverifiedPurchase.data.message, /credencial estudiantil vigente/);
    await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining) VALUES($1,$2,'active',1)", [uid, student.id]);
    const membershipId = (await db.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining) VALUES($1,$2,'active',null) RETURNING id", [uid, annual.id])).rows[0].id;
    typeId = (await db.query("INSERT INTO class_types(name,category) VALUES('Synthetic Reformer QA','reformer_tower') RETURNING id")).rows[0].id;
    instructorId = (await db.query("INSERT INTO instructors(display_name) VALUES('Synthetic QA Coach') RETURNING id")).rows[0].id;
    classId = (await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,(NOW() AT TIME ZONE 'America/Mexico_City')::date+1,'12:00','12:50',6) RETURNING id", [typeId, instructorId])).rows[0].id;
    const booked = await post('/bookings', {classId});
    assert.equal(booked.status, 201, JSON.stringify(booked));
    const booking = (await db.query('SELECT membership_id FROM bookings WHERE class_id=$1 AND user_id=$2', [classId, uid])).rows[0];
    assert.equal(booking.membership_id, membershipId, 'Unverified student pack must not block an eligible annual membership');
    await db.query("UPDATE users SET student_id_valid_until=(NOW() AT TIME ZONE 'America/Mexico_City')::date+30 WHERE id=$1", [uid]);
    const verifiedPurchase = await post('/orders', {planId: student.id, paymentMethod: 'transfer'});
    assert.equal(verifiedPurchase.status, 201, JSON.stringify(verifiedPurchase));
    const openingOrder = await post('/orders', {planId: annual.id, paymentMethod: 'card'});
    assert.equal(openingOrder.status, 201, JSON.stringify(openingOrder));
    const price = (await db.query('SELECT subtotal FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1', [uid])).rows[0].subtotal;
    const expected = Number(price) === Number(annual.opening_price) ? annual.rules.opening_payment_url : annual.rules.payment_url;
    assert.equal((openingOrder.data.data ?? openingOrder.data).checkout_url, expected, 'Checkout URL must match the charged amount');
    regularPlanId = (await db.query("INSERT INTO plans(name,price,opening_price,duration_days,class_limit,class_category,rules,is_active) VALUES('Synthetic regular annual QA',4200,null,30,null,'reformer_tower',$1,true) RETURNING id", [JSON.stringify(annual.rules)])).rows[0].id;
    const regularOrder = await post('/orders', {planId: regularPlanId, paymentMethod: 'card'});
    assert.equal(regularOrder.status, 201, JSON.stringify(regularOrder));
    assert.equal((regularOrder.data.data ?? regularOrder.data).checkout_url, annual.rules.payment_url, 'No opening price means the regular payment link, even during the global promotion');
  } finally {
    if (uid) {
      await db.query('DELETE FROM notifications WHERE user_id=$1', [uid]);
      await db.query('DELETE FROM bookings WHERE user_id=$1', [uid]);
      await db.query('DELETE FROM memberships WHERE user_id=$1', [uid]);
      await db.query('DELETE FROM orders WHERE user_id=$1', [uid]);
      await db.query('DELETE FROM waivers WHERE user_id=$1', [uid]);
      await db.query('DELETE FROM users WHERE id=$1', [uid]);
    }
    if (classId) await db.query('DELETE FROM classes WHERE id=$1', [classId]);
    if (typeId) await db.query('DELETE FROM class_types WHERE id=$1', [typeId]);
    if (instructorId) await db.query('DELETE FROM instructors WHERE id=$1', [instructorId]);
    if (regularPlanId) await db.query('DELETE FROM plans WHERE id=$1', [regularPlanId]);
    await db.end();
  }
});
