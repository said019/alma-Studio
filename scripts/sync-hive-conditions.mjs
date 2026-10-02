/** Explicit catalog reconciliation, never run on startup. Dry-run by default.
 * Run with DATABASE_URL=... node scripts/sync-hive-conditions.mjs --apply.
 * Existing ids/history survive; unknown/custom plans remain untouched.
 */
import pg from 'pg';
import { CATALOG_PLANS } from '../server/lib/catalog.js';
import { PLAN_RULES_SCHEMA } from '../server/lib/planSchema.js';
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
await db.connect();
try {
 await db.query('BEGIN');
 await db.query(PLAN_RULES_SCHEMA);
 await db.query('LOCK TABLE plans IN SHARE ROW EXCLUSIVE MODE');
 const aliases={'Plan mensual':['Mes'],'Plan anual / pago mensual':['Suscripción'],'Horario especial':['Clases de 12 a 4']};
 const changes=[];
 for(const plan of CATALOG_PLANS) {
  const found=await db.query('SELECT id,name FROM plans WHERE name=ANY($1::text[]) ORDER BY (name=$2) DESC',[ [plan.name,...(aliases[plan.name]||[])],plan.name]);
  if(found.rowCount>1) throw new Error(`Más de un candidato para ${plan.name}; revisa manualmente para conservar el historial.`);
  changes.push({action:found.rowCount?'update':'insert',name:plan.name});
  if(found.rowCount) await db.query(`UPDATE plans SET name=$2,description=$3,price=$4,opening_price=$5,duration_days=$6,class_limit=$7,class_category=$8,afternoon_only=$9,personal_only=$10,is_non_transferable=true,rules=$11::jsonb,sort_order=$12,updated_at=NOW() WHERE id=$1`,[found.rows[0].id,plan.name,plan.description,plan.price,plan.opening_price,plan.duration_days,plan.class_limit,plan.class_category,plan.afternoon_only,plan.personal_only,JSON.stringify(plan.rules),plan.sort_order]);
  else await db.query(`INSERT INTO plans(name,description,price,opening_price,duration_days,class_limit,class_category,afternoon_only,personal_only,is_non_transferable,rules,sort_order,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb,$11,true)`,[plan.name,plan.description,plan.price,plan.opening_price,plan.duration_days,plan.class_limit,plan.class_category,plan.afternoon_only,plan.personal_only,JSON.stringify(plan.rules),plan.sort_order]);
 }
 // Retire only obsolete products of the previous HIVE catalog, preserving history.
 const retired=await db.query("UPDATE plans SET is_active=false,updated_at=NOW() WHERE name IN ('Mes de 12 a 4','Clase muestra') RETURNING name");
 // Apply the supplied cancellation policy exactly; preserve unrelated settings.
 await db.query(`INSERT INTO settings(key,value) VALUES('cancellation_settings','{"max_cancellations":0}'::jsonb)
   ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb)||EXCLUDED.value,updated_at=NOW()`);
 await db.query(`INSERT INTO settings(key,value) VALUES('loyalty_config','{"faltas_cancel_window_hours":12}'::jsonb)
   ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb)||EXCLUDED.value,updated_at=NOW()`);
 const apply=process.argv.includes('--apply');
 await db.query(apply?'COMMIT':'ROLLBACK');
 console.log(JSON.stringify({applied:apply,changes,retired:retired.rows.map(r=>r.name)}));
} catch(e) { await db.query('ROLLBACK');console.error(e.message);process.exitCode=1; } finally { await db.end(); }
