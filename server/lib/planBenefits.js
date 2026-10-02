export function registerPlanBenefits(app, { pool, adminMiddleware }) {
  app.post('/api/admin/memberships/:id/redeem-coffee', adminMiddleware, async (req,res) => {
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const result=await client.query(`SELECT m.*, p.rules FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.id=$1 FOR UPDATE OF m`,[req.params.id]);
      const m=result.rows[0];
      const today=(await client.query("SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS day")).rows[0].day;
      const civil=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
      if(!m || m.status!=='active' || (m.start_date && civil(m.start_date)>today) || (m.end_date && civil(m.end_date)<today)) { await client.query('ROLLBACK'); return res.status(403).json({message:'La membresía no está vigente.'}); }
      const limit=m.rules?.complimentary_coffee_per_day || 0;
      const used=(await client.query("SELECT COUNT(*)::int AS n FROM membership_benefit_redemptions WHERE membership_id=$1 AND benefit='coffee' AND redeemed_on=$2",[m.id,today])).rows[0].n;
      if(used>=limit) { await client.query('ROLLBACK'); return res.status(403).json({message:limit?'El café de cortesía de hoy ya fue entregado.':'El plan no incluye café de cortesía.'}); }
      await client.query("INSERT INTO membership_benefit_redemptions(membership_id,benefit,redeemed_on,redeemed_by) VALUES($1,'coffee',$2,$3)",[m.id,today,req.userId]);
      await client.query('COMMIT');
      return res.status(201).json({data:{membershipId:m.id,benefit:'coffee',redeemedOn:today,remaining:limit-used-1}});
    } catch(error) { await client.query('ROLLBACK').catch(()=>{}); return res.status(500).json({message:'No se pudo registrar la entrega.'}); }
    finally { client.release(); }
  });
}
