// Catálogo inicial del estudio: tipos de clase y paquetes.
//
// Sólo se siembra si la tabla está VACÍA (instalación nueva). Con filas
// existentes —lo que el estudio captura en el panel— el arranque no desactiva,
// no actualiza ni inserta nada: antes cada despliegue reimponía el catálogo
// heredado y desactivaba lo capturado (revisión final de la landing de HIVE, C1).

async function isEmpty(pool, table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? 0) === 0;
}

/** Siembra los tipos de clase si `class_types` no tiene filas. Devuelve cuántos insertó. */
export async function seedClassTypesIfEmpty(pool, types) {
  if (!(await isEmpty(pool, "class_types"))) return 0;
  for (const c of types) {
    await pool.query(
      `INSERT INTO class_types (name, category, intensity, level, duration_min, capacity, color, emoji, sort_order, is_active)
       VALUES ($1,$2,'media','all',$3,$4,$5,'sparkles',$6,true)`,
      [c.name, c.category, c.duration_min, c.capacity, c.color, c.sort_order]
    );
  }
  return types.length;
}

/** Siembra los paquetes si `plans` no tiene filas. Devuelve cuántos insertó. */
export async function seedPlansIfEmpty(pool, plans) {
  if (!(await isEmpty(pool, "plans"))) return 0;
  for (const p of plans) {
    await pool.query(
      `INSERT INTO plans
         (name, description, price, opening_price, currency, duration_days, class_limit,
          class_category, morning_only, is_non_repeatable, repeat_key, is_non_transferable,
          is_active, sort_order, studio_credits, rt_credits, afternoon_only, personal_only)
       VALUES ($1,$2,$3,$4,'MXN',$5,$6,$7,$8,$9,$10,false,true,$11,$12,$13,$14,$15)`,
      [p.name, p.description, p.price, p.opening_price, p.duration_days,
       p.class_limit, p.class_category, p.morning_only, p.is_non_repeatable,
       p.repeat_key, p.sort_order, p.studio_credits ?? null, p.rt_credits ?? null, p.afternoon_only ?? false, p.personal_only ?? false]
    );
  }
  return plans.length;
}
