import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {api,sql,login,ADMIN,closeDb} from './helpers.mjs';
let token,uid,mid,pid;const plans=[];
before(async()=>{
 ({token}=await login(ADMIN.email,ADMIN.password));
 uid=(await sql("INSERT INTO users(email,display_name) VALUES($1,'HIVE conditions QA') RETURNING id",[`conditions-${crypto.randomUUID()}@example.test`]))[0].id;
 pid=(await sql("INSERT INTO plans(name,price,duration_days,rules) VALUES($1,100,30,$2) RETURNING id",[`QA Benefits ${crypto.randomUUID()}`,JSON.stringify({complimentary_coffee_per_day:1,extendable:false})]))[0].id;plans.push(pid);
 mid=(await sql("INSERT INTO memberships(user_id,plan_id,status) VALUES($1,$2,'active') RETURNING id",[uid,pid]))[0].id;
});
after(async()=>{
 if(uid){await sql('DELETE FROM membership_benefit_redemptions WHERE membership_id IN (SELECT id FROM memberships WHERE user_id=$1)',[uid]);await sql('DELETE FROM memberships WHERE user_id=$1',[uid]);await sql('DELETE FROM users WHERE id=$1',[uid]);}
 if(plans.length)await sql('DELETE FROM plans WHERE id=ANY($1::uuid[])',[plans]);await closeDb();
});
test('CRUD conserva condiciones en PUT parcial y permite retirar precio apertura',async()=>{
 const rules={daily_class_limit:2,allowed_weekdays:[1,2,3,4,5],booking_start_time:'11:00',booking_end_time:'16:00',guest_passes:2,guest_pass_period:'month',billing_period:'month',commitment_months:12,auto_renew:true,requires_student_id:false,complimentary_coffee_per_day:1,transferable:false,extendable:false,payment_url:'https://mpago.la/1YY3tpp'};
 const created=await api('POST','/api/plans',{token,body:{name:`QA Config ${crypto.randomUUID()}`,price:4200,opening_price:3900,durationDays:30,classLimit:null,rules}});
 assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.data.id;plans.push(id);assert.deepEqual(created.body.data.rules,rules);
 const patched=await api('PUT',`/api/plans/${id}`,{token,body:{description:'Actualizada',opening_price:null}});
 assert.equal(patched.status,200);assert.deepEqual(patched.body.data.rules,rules);assert.equal(patched.body.data.openingPrice,null);
 for(const body of [{price:-1},{durationDays:0},{rules:{daily_class_limit:0}},{rules:{allowed_weekdays:[]}},{rules:{booking_start_time:'18:00',booking_end_time:'11:00'}},{rules:{payment_url:'http://unsafe.test'}},{rules:{transferable:true}}]) {
  const r=await api('PUT',`/api/plans/${id}`,{token,body});assert.equal(r.status,400,JSON.stringify(body));
 }
});
test('credencial: fecha imposible rechazada y fecha vigente persiste en ficha',async()=>{
 for(const validUntil of ['2026-02-30','bad',undefined]) {const r=await api('PUT',`/api/admin/users/${uid}/student-verification`,{token,body:{validUntil}});assert.equal(r.status,400);}
 const valid=await api('PUT',`/api/admin/users/${uid}/student-verification`,{token,body:{validUntil:'2027-10-01'}});assert.equal(valid.status,200);
 const profile=await api('GET',`/api/users/${uid}`,{token});assert.equal(String(profile.body.data.studentIdValidUntil).slice(0,10),'2027-10-01');
 const invalid=await api('PUT','/api/admin/users/invalid/student-verification',{token,body:{validUntil:'2027-10-01'}});assert.equal(invalid.status,400);
});
test('café cortesía concurrente: solo una entrega y rules visibles para recepción',async()=>{
 const results=await Promise.all([1,2].map(()=>api('POST',`/api/admin/memberships/${mid}/redeem-coffee`,{token,body:{}})));
 assert.deepEqual(results.map(x=>x.status).sort(),[201,403]);
 const listed=await api('GET',`/api/memberships?userId=${uid}`,{token});assert.equal(listed.body.data[0].rules.complimentary_coffee_per_day,1);
 const extension=await api('PUT',`/api/memberships/${mid}`,{token,body:{endDate:'2099-01-01',reason:'No debe permitir prórroga'}});assert.equal(extension.status,400);
});
