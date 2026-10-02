import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import {PLAN_RULES_SCHEMA} from './lib/planSchema.js';
import {CATALOG_PLANS} from './lib/catalog.js';
// Requires an explicit isolated database; never uses the application's DATABASE_URL.
const url=process.env.TEST_DATABASE_URL;
test('HIVE conditions enforced by PostgreSQL across every booking channel',{skip:!url},async t=>{
 const c=new pg.Client({connectionString:url});await c.connect();
 await c.query('BEGIN');
 try {
  await c.query(PLAN_RULES_SCHEMA);
  const user=(await c.query("INSERT INTO users(email,display_name) VALUES($1,'HIVE QA') RETURNING id",[`qa-${crypto.randomUUID()}@example.test`])).rows[0].id;
  const guest=(await c.query("INSERT INTO users(email,display_name) VALUES($1,'HIVE Guest QA') RETURNING id",[`qa-${crypto.randomUUID()}@example.test`])).rows[0].id;
  const instructor=(await c.query("INSERT INTO instructors(display_name) VALUES('HIVE QA') RETURNING id")).rows[0].id;
  const type=(await c.query("INSERT INTO class_types(name,category) VALUES('QA Reformer','reformer_tower') RETURNING id")).rows[0].id;
  const member=async(name,overrides={})=>{
   const p={...CATALOG_PLANS.find(p=>p.name===name),...overrides};
   const plan=(await c.query('INSERT INTO plans(name,price,duration_days,class_limit,personal_only,rules) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[`QA ${p.name}`,p.price,p.duration_days,p.class_limit,p.personal_only,JSON.stringify(p.rules)])).rows[0].id;
   const order=(await c.query("INSERT INTO orders(user_id,plan_id,subtotal,total_amount,created_at) VALUES($1,$2,1,1,'2026-10-01T12:00:00-06:00') RETURNING id",[user,plan])).rows[0].id;
   return (await c.query("INSERT INTO memberships(user_id,plan_id,status,classes_remaining,order_id) VALUES($1,$2,'active',$3,$4) RETURNING *",[user,plan,p.class_limit,order])).rows[0];
  };
  const cls=async(day='2026-10-02',time='12:00',capacity=4)=>(await c.query('INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,$3,$4,$4::time+interval\'50 minutes\',$5) RETURNING id',[type,instructor,day,time,capacity])).rows[0].id;
  const book=async(m,{day,time,capacity,who=user,status='confirmed'}={})=>{const id=await cls(day,time,capacity);return (await c.query('INSERT INTO bookings(class_id,user_id,membership_id,status) VALUES($1,$2,$3,$4) RETURNING id',[id,who,m.id,status])).rows[0].id;};
  const rejected=async(fn,pattern)=>{await c.query('SAVEPOINT invalid');await assert.rejects(fn,pattern);await c.query('ROLLBACK TO SAVEPOINT invalid');};
  const scenario=async(name,fn)=>t.test(name,async()=>{await c.query('SAVEPOINT scenario');try{await fn();}finally{await c.query('ROLLBACK TO SAVEPOINT scenario');}});
  await scenario('30/60 días naturales exactos desde compra y ninguna prórroga',async()=>{
   const m=await member('1 Clase'),long=await member('20 Clases');
   assert.equal(m.start_date.toISOString().slice(0,10),'2026-10-01');
   assert.equal(m.end_date.toISOString().slice(0,10),'2026-10-30');
   assert.equal(long.end_date.toISOString().slice(0,10),'2026-11-29');
   await book(long,{day:'2026-11-29'});
   await rejected(()=>book(long,{day:'2026-11-30'}),/fuera de la vigencia/);
   await rejected(()=>book(m,{day:'2026-09-30'}),/fuera de la vigencia/);
   await rejected(()=>c.query("UPDATE memberships SET end_date=end_date+interval'1 day' WHERE id=$1",[m.id]),/prórrogas/);
  });
  await scenario('mensual 1 sesión diaria, anual 2; lista de espera revalida al promover',async()=>{
   const monthly=await member('Plan mensual');await book(monthly);
   await rejected(()=>book(monthly,{time:'13:00'}),/sesiones diarias/);
   const wait=await book(monthly,{time:'14:00',status:'waitlist'});
   await rejected(()=>c.query("UPDATE bookings SET status='confirmed' WHERE id=$1",[wait]),/sesiones diarias/);
   await book(monthly,{day:'2026-10-03'});
   const annual=await member('Plan anual / pago mensual');await book(annual);await book(annual,{time:'13:00'});
   await rejected(()=>book(annual,{time:'14:00'}),/sesiones diarias/);
  });
  await scenario('especial lunes-viernes 11:00–16:00; personalizado exclusivamente 1a1',async()=>{
   const m=await member('Horario especial');await book(m,{time:'11:00'});await book(m,{time:'16:00'});
   for(const options of [{time:'10:59'},{time:'16:01'},{day:'2026-10-03'},{day:'2026-10-04'}]) await rejected(()=>book(m,options),/no permite/);
   const personal=await member('Personalizado');await book(personal,{capacity:1});await rejected(()=>book(personal,{capacity:4}),/personalizado/);
   await rejected(()=>book(m,{capacity:1}),/personalizado/);
  });
  await scenario('plan legacy sin reglas permite grupo cupo1, HIVE mantiene personalizado',async()=>{
   const legacy=await member('Plan mensual',{rules:{}});
   await book(legacy,{capacity:1});
   const hive=await member('Plan mensual');
   await rejected(()=>book(hive,{capacity:1}),/personalizado/);
  });
  await scenario('estudiante requiere credencial vigente hasta fecha clase',async()=>{
   const m=await member('Promo estudiante');await rejected(()=>book(m),/credencial/);
   await c.query("UPDATE users SET student_id_valid_until='2026-10-02' WHERE id=$1",[user]);await book(m,{time:'20:00'});
   await rejected(()=>book(m,{day:'2026-10-03'}),/credencial/);
  });
  await scenario('dos guest pass por periodo comprado, sin reinicio al cambiar mes',async()=>{
   // Buy Oct 20: period crosses the calendar-month boundary.
   const m=await member('Plan anual / pago mensual');
   await c.query("ALTER TABLE memberships DISABLE TRIGGER hive_membership_validity");
   await c.query("UPDATE memberships SET start_date='2026-10-20',end_date='2026-11-18' WHERE id=$1",[m.id]);
   await c.query("ALTER TABLE memberships ENABLE TRIGGER hive_membership_validity");
   await book(m,{day:'2026-10-21',who:guest});await book(m,{day:'2026-10-22',who:guest});
   await rejected(()=>book(m,{day:'2026-11-01',who:guest}),/guest pass/);
   const personal=await member('4 Clases');await rejected(()=>book(personal,{who:guest}),/intransferible/);
  });
  await scenario('abandonar espera a última hora no consume sesión diaria',async()=>{
   const m=await member('Plan mensual');const wait=await book(m,{status:'waitlist'});
   await c.query("UPDATE bookings SET status='cancelled',cancelled_at='2026-10-02T11:00:00-06:00' WHERE id=$1",[wait]);
   await book(m,{time:'13:00'});
  });
  await scenario('cancelar en recepción sin fecha o cerca de la clase no consume el día',async()=>{
   const m=await member('Plan mensual');const b=await book(m);
   await c.query("UPDATE bookings SET status='cancelled' WHERE id=$1",[b]);
   const b2=await book(m,{time:'13:00'});
   await c.query("UPDATE bookings SET status='cancelled',cancelled_at='2026-10-02T12:59:00-06:00' WHERE id=$1",[b2]);
   await book(m,{time:'14:00'});
  });
  await scenario('inasistencia y cancelación tardía consumen sesión del día',async()=>{
   const m=await member('Plan mensual');const b=await book(m);
   await c.query("UPDATE bookings SET status='no_show' WHERE id=$1",[b]);
   await rejected(()=>book(m,{time:'13:00'}),/sesiones diarias/);
   await c.query("UPDATE bookings SET status='confirmed' WHERE id=$1",[b]);
   await c.query("UPDATE bookings SET status='cancelled',plan_late_cancel=true,cancelled_at='2026-10-02T11:00:00-06:00' WHERE id=$1",[b]);
   await rejected(()=>book(m,{time:'13:00'}),/sesiones diarias/);
   await c.query("UPDATE bookings SET plan_late_cancel=false,cancelled_at='2026-10-01T23:59:00-06:00' WHERE id=$1",[b]);
   await book(m,{time:'13:00'});
  });
 } finally {await c.query('ROLLBACK');await c.end();}
});
test('dos reservas simultáneas no rebasan el límite diario',{skip:!url},async()=>{
 const pool=new pg.Pool({connectionString:url,max:3});let user,plan,mem,type,instructor;const classes=[];
 try {
  await pool.query(PLAN_RULES_SCHEMA);
  user=(await pool.query("INSERT INTO users(email,display_name) VALUES($1,'Concurrency QA') RETURNING id",[`parallel-${crypto.randomUUID()}@example.test`])).rows[0].id;
  instructor=(await pool.query("INSERT INTO instructors(display_name) VALUES('Concurrency QA') RETURNING id")).rows[0].id;
  type=(await pool.query("INSERT INTO class_types(name,category) VALUES('Concurrency Reformer','reformer_tower') RETURNING id")).rows[0].id;
  plan=(await pool.query("INSERT INTO plans(name,price,duration_days,rules) VALUES('Concurrency QA',1,30,$1) RETURNING id",[JSON.stringify(CATALOG_PLANS.find(p=>p.name==='Plan mensual').rules)])).rows[0].id;
  mem=(await pool.query("INSERT INTO memberships(user_id,plan_id,status) VALUES($1,$2,'active') RETURNING id",[user,plan])).rows[0].id;
  for(const time of ['12:00','13:00'])classes.push((await pool.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity) VALUES($1,$2,(NOW() AT TIME ZONE 'America/Mexico_City')::date+1,$3,$3::time+interval'50 minutes',4) RETURNING id",[type,instructor,time])).rows[0].id);
  const results=await Promise.allSettled(classes.map(id=>pool.query("INSERT INTO bookings(class_id,user_id,membership_id,status) VALUES($1,$2,$3,'confirmed')",[id,user,mem])));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/sesiones diarias/);
 } finally {
  if(mem) {await pool.query('DELETE FROM bookings WHERE membership_id=$1',[mem]);await pool.query('DELETE FROM memberships WHERE id=$1',[mem]);}
  if(classes.length)await pool.query('DELETE FROM classes WHERE id=ANY($1::uuid[])',[classes]);
  if(plan)await pool.query('DELETE FROM plans WHERE id=$1',[plan]);if(type)await pool.query('DELETE FROM class_types WHERE id=$1',[type]);if(instructor)await pool.query('DELETE FROM instructors WHERE id=$1',[instructor]);if(user)await pool.query('DELETE FROM users WHERE id=$1',[user]);await pool.end();
 }
});
