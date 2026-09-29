/** Reemplazo autorizado del catálogo HIVE. Requiere DATABASE_URL y --apply.
 * Guarda respaldo privado antes de retirar planes; conserva referencias históricas.
 */
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CATALOG_PLANS } from '../server/lib/catalog.js';
const marker = 'hive_catalog_20260929';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  await client.query('LOCK TABLE plans IN SHARE ROW EXCLUSIVE MODE');
  if ((await client.query('SELECT 1 FROM settings WHERE key=$1', [marker])).rowCount) {
    console.log('El reemplazo ya fue aplicado.');
    await client.query('ROLLBACK');
  } else {
    const old = (await client.query(`SELECT p.*,
      (SELECT count(*)::int FROM memberships m WHERE m.plan_id=p.id) memberships,
      (SELECT count(*)::int FROM orders o WHERE o.plan_id=p.id) orders,
      (SELECT count(*)::int FROM discount_codes d WHERE d.plan_id=p.id) discounts FROM plans p`)).rows;
    console.log(JSON.stringify({ oldPlans: old.length, newPlans: CATALOG_PLANS.length, preserve: old.filter(p=>p.memberships+p.orders+p.discounts>0).map(p=>p.name) }));
    if (!process.argv.includes('--apply')) {
      await client.query('ROLLBACK');
    } else {
      const backup = { createdAt:new Date().toISOString(), plans:old,
        memberships:(await client.query('SELECT * FROM memberships')).rows,
        orders:(await client.query('SELECT * FROM orders')).rows,
        discounts:(await client.query('SELECT * FROM discount_codes')).rows,
        general:(await client.query("SELECT * FROM settings WHERE key='general_settings'")).rows };
      const dir=path.join(os.homedir(),'.codex','backups','hive-plans');
      fs.mkdirSync(dir,{recursive:true,mode:0o700});
      const file=path.join(dir,`before-replace-${Date.now()}.json`);
      fs.writeFileSync(file,JSON.stringify(backup),{mode:0o600});
      let deleted=0,archived=0;
      for(const p of old) {
        if(p.memberships+p.orders+p.discounts>0) {
          await client.query('UPDATE plans SET is_active=false,archived_at=COALESCE(archived_at,NOW()),updated_at=NOW() WHERE id=$1',[p.id]); archived++;
        } else {
          await client.query('DELETE FROM plans WHERE id=$1',[p.id]);deleted++;
        }
      }
      for(const p of CATALOG_PLANS) {
        await client.query(`INSERT INTO plans
          (name,description,price,opening_price,currency,duration_days,class_limit,class_category,
           morning_only,afternoon_only,personal_only,is_non_repeatable,repeat_key,is_active,sort_order)
          VALUES ($1,$2,$3,$4,'MXN',$5,$6,$7,false,$8,$9,$10,$11,true,$12)`,
          [p.name,p.description,p.price,p.opening_price,p.duration_days,p.class_limit,p.class_category,
            p.afternoon_only,p.personal_only,p.is_non_repeatable,p.repeat_key,p.sort_order]);
      }
      await client.query(`INSERT INTO settings(key,value) VALUES('general_settings','{"opening_pricing_active":true}'::jsonb)
        ON CONFLICT(key) DO UPDATE SET value=COALESCE(settings.value,'{}'::jsonb)||EXCLUDED.value,updated_at=NOW()`);
      const active=(await client.query('SELECT name,price,opening_price,duration_days,class_limit,afternoon_only,personal_only FROM plans WHERE is_active=true ORDER BY sort_order')).rows;
      if(active.length!==10)throw new Error('Se esperaban diez planes activos');
      for(const [i,p] of active.entries()) {
        const wanted=CATALOG_PLANS[i];
        if(p.name!==wanted.name||Number(p.price)!==wanted.price||Number(p.opening_price)!==wanted.opening_price||p.duration_days!==30||p.class_limit!==wanted.class_limit)throw new Error('Catálogo no coincide');
      }
      await client.query('INSERT INTO settings(key,value) VALUES($1,$2::jsonb)',[marker,JSON.stringify({appliedAt:new Date().toISOString(),deleted,archived})]);
      await client.query('COMMIT');
      console.log(JSON.stringify({deleted,archived,active:active.length,backup:file}));
    }
  }
} catch(e) {
  await client.query('ROLLBACK'); console.error('No se aplicó el reemplazo:',e.message); process.exitCode=1;
} finally { await client.end(); }
