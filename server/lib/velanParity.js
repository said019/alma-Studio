import { membershipAllowsSession, isMembershipCategoryCompatible } from "./bookingRules.js";
import { getStripe, createOrGetStripeCustomer, createCheckoutSession } from "./stripe.js";
/** Additional Velan operations adapted to HIVE's credits and booking-count trigger. */
export function registerVelanParity(app, deps) {
  const { pool, ownerMiddleware, authMiddleware, restoreMembershipCredit, recordAudit,
    triggerWalletPassSync, onSeatReleased, camelRow, isDay, reasonProblem, getBookingPolicy, bookingLeadHours, cancelClassInTx, notifyClassCancelled, applyCancellationRollback } = deps;
  const fail = (res, err) => res.status(err.status || 500).json({
    message: err.status ? err.message : "No se pudo completar la operación",
  });
  const problem = (status, message) => Object.assign(new Error(message), { status });

  app.put("/api/admin/bookings/:id/undo-check-in",ownerMiddleware,async(req,res)=>{
    if(reasonProblem(req.body?.reason))return res.status(400).json({message:reasonProblem(req.body?.reason)});
    const client=await pool.connect();let booking;
    try {
      await client.query("BEGIN");
      booking=(await client.query("SELECT * FROM bookings WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
      if(!booking)throw problem(404,"Reserva no encontrada");
      if(booking.status!=="checked_in")throw problem(409,"La reserva no tiene asistencia registrada");
      if(!["app","web","direct"].includes(booking.channel||"app"))throw problem(409,"La asistencia debe corregirse en la plataforma de origen");
      await applyCancellationRollback(client,booking,{skipCreditRestore:true});
      await client.query("UPDATE bookings SET status='confirmed',checked_in_at=NULL,checked_in_by=NULL,updated_at=NOW() WHERE id=$1",[booking.id]);
      await recordAudit(client,{actorId:req.userId,action:"booking.checkin_undone",entityType:"booking",entityId:booking.id,subjectUserId:booking.user_id,reason:req.body.reason,before:{status:"checked_in"},after:{status:"confirmed"}});
      await client.query("COMMIT");
    }catch(err){await client.query("ROLLBACK").catch(()=>{});return fail(res,err);}finally{client.release();}
    triggerWalletPassSync(booking.user_id,"checkin_undone");res.json({message:"Asistencia deshecha. La reserva y el crédito utilizado se conservan."});
  });
  for (const operation of ["cancel-day","not-held"]) {
    app.post(operation==="cancel-day"?"/api/admin/classes/cancel-day":"/api/admin/classes/:id/not-held",ownerMiddleware,async(req,res)=>{
      const {day,reason}=req.body??{};
      if(reasonProblem(reason)||(operation==="cancel-day"&&!isDay(day)))return res.status(400).json({message:reasonProblem(reason)||"Fecha inválida"});
      const client=await pool.connect();const results=[];
      try {
        await client.query("BEGIN");
        const targets=await client.query(operation==="cancel-day"?
          "SELECT id FROM classes WHERE date=$1 AND (date+start_time)>LOCALTIMESTAMP AND status<>'cancelled' ORDER BY id FOR UPDATE":
          "SELECT id FROM classes WHERE id=$1 AND (date+start_time)<=LOCALTIMESTAMP AND status<>'cancelled' FOR UPDATE",[operation==="cancel-day"?day:req.params.id]);
        if(operation==="not-held"&&!targets.rows.length)throw problem(409,"Solo se puede marcar una clase pasada que todavía no esté cancelada");
        for(const target of targets.rows){const result=await cancelClassInTx(client,target.id,{actorId:req.userId,reason,source:operation,includeNoShows:operation==="not-held"});if(result)results.push(result);}
        await client.query("COMMIT");
      }catch(err){await client.query("ROLLBACK").catch(()=>{});return fail(res,err);}finally{client.release();}
      let unreached=0;
      for(const result of results){const notices=await notifyClassCancelled(result.classRow,result.activeBookings,reason).catch(()=>({waUnreached:result.activeBookings}));unreached+=notices.waUnreached?.length??0;}
      res.json({data:{classes:results.length,bookings:results.reduce((n,r)=>n+r.activeBookings.length,0),unreached},message:`${results.length} clases canceladas; créditos restituidos`});
    });
  }

  app.post("/api/bookings/:id/reschedule", authMiddleware, async(req,res)=>{
    const targetId=req.body?.newClassId;
    if (!/^[a-f0-9-]{36}$/i.test(String(targetId))) return res.status(400).json({message:"Clase destino inválida"});
    const policy=await getBookingPolicy();
    const client=await pool.connect();let booking;let moved;
    try {
      await client.query("BEGIN");
      booking=(await client.query("SELECT * FROM bookings WHERE id=$1 AND user_id=$2 FOR UPDATE",[req.params.id,req.userId])).rows[0];
      if (!booking) throw problem(404,"Reserva no encontrada");
      if (booking.status!=="confirmed") throw problem(409,"Solo puedes cambiar reservas confirmadas");
      if (booking.class_id===targetId) throw problem(400,"Esa ya es tu clase");
      if (booking.channel && !["direct","app","web"].includes(booking.channel)) throw problem(409,"Cambia esta reserva desde la plataforma donde la hiciste.");
      const classes=(await client.query(`SELECT c.*,ct.category AS category,(c.date+c.start_time) AT TIME ZONE current_setting('TIMEZONE') AS starts_at
        FROM classes c JOIN class_types ct ON ct.id=c.class_type_id WHERE c.id=ANY($1::uuid[]) ORDER BY c.id FOR UPDATE OF c`,[[booking.class_id,targetId]])).rows;
      const original=classes.find(c=>c.id===booking.class_id);const target=classes.find(c=>c.id===targetId);
      if(!target)throw problem(404,"Clase destino no encontrada");
      if(!original || new Date(original.starts_at).getTime()-Date.now()<policy.cancelWindowHours*3600000)throw problem(403,`Los cambios requieren al menos ${policy.cancelWindowHours} horas de anticipación`);
      if(target.status!=="scheduled" || new Date(target.starts_at).getTime()-Date.now()<bookingLeadHours*3600000)throw problem(409,"Esta clase ya no admite cambios de reserva");
      const mem=(await client.query(`SELECT m.*,p.class_category,p.morning_only,p.afternoon_only,p.personal_only,p.weekly_class_limit,
        (m.status='active' AND (m.start_date IS NULL OR m.start_date<=$2::date) AND (m.end_date IS NULL OR m.end_date>=$2::date)) AS covers
        FROM memberships m JOIN plans p ON p.id=m.plan_id WHERE m.id=$1 FOR UPDATE OF m`,[booking.membership_id,target.date])).rows[0];
      if(!mem?.covers)throw problem(403,"La nueva clase debe estar dentro de la vigencia de la membresía original");
      if(!isMembershipCategoryCompatible(mem.class_category,target.category)||!membershipAllowsSession(mem,target.starts_at,target.max_capacity))throw problem(403,"Tu plan no permite esta clase u horario");
      const counts=(await client.query(`SELECT COUNT(*) FILTER(WHERE status IN ('confirmed','checked_in'))::int AS booked,
        COUNT(*) FILTER(WHERE status='waitlist')::int AS waiting FROM bookings WHERE class_id=$1`,[targetId])).rows[0];
      if(counts.waiting>0 || counts.booked>=target.max_capacity)throw problem(409,"La clase está llena o tiene lista de espera. Tu reserva original se conserva.");
      if((await client.query("SELECT 1 FROM bookings WHERE user_id=$1 AND class_id=$2 AND status<>'cancelled'",[req.userId,targetId])).rows.length)throw problem(409,"Ya tienes una reserva en esa clase");
      if(mem.weekly_class_limit) {
        const count=(await client.query(`SELECT COUNT(*)::int AS n FROM bookings b JOIN classes c ON c.id=b.class_id
          WHERE b.membership_id=$1 AND b.id<>$2 AND b.status IN ('confirmed','checked_in')
          AND date_trunc('week',c.date)=date_trunc('week',$3::date)`,[mem.id,booking.id,target.date])).rows[0].n;
        if(count>=mem.weekly_class_limit)throw problem(409,"Alcanzaste el límite semanal de tu plan");
      }
      if(mem.class_category==="mixto" && original.category!==target.category) {
        const bucket=target.category==="studio"?"studio_remaining":"rt_remaining";
        const oldBucket=original.category==="studio"?"studio_remaining":"rt_remaining";
        if(Number(mem[bucket]??0)<=0)throw problem(409,"No quedan créditos de la categoría destino");
        await client.query(`UPDATE memberships SET ${bucket}=${bucket}-1,${oldBucket}=${oldBucket}+1 WHERE id=$1`,[mem.id]);
      }
      // Cancel + insert lets both HIVE occupancy triggers update their own class.
      await client.query("UPDATE bookings SET status='cancelled',cancelled_at=NOW(),cancellation_reason='Cambio de horario',updated_at=NOW() WHERE id=$1",[booking.id]);
      moved=(await client.query(`INSERT INTO bookings(user_id,class_id,membership_id,status)
        VALUES($1,$2,$3,'confirmed') RETURNING *`,[req.userId,targetId,mem.id])).rows[0];
      if(!moved)throw problem(409,"Otra operación cambió tu reserva. Intenta de nuevo.");
      await recordAudit(client,{actorId:req.userId,action:"booking.reschedule",entityType:"booking",entityId:booking.id,subjectUserId:req.userId,
        before:{class_id:booking.class_id},after:{class_id:targetId,booking_id:moved.id}});
      await client.query("COMMIT");
    }catch(err){await client.query("ROLLBACK").catch(()=>{});if(["40P01","40001"].includes(err.code))return res.status(409).json({message:"Otra operación modificó la clase. Reintenta; conservamos tu reserva."});return fail(res,err);}
    finally{client.release();}
    triggerWalletPassSync(req.userId,"booking_rescheduled");
    await onSeatReleased([booking.class_id],{source:"reschedule"}).catch(()=>{});
    return res.json({data:moved,message:"Reserva cambiada sin consumir otra clase"});
  });

  app.get("/api/admin/integrations/stripe/status",ownerMiddleware,async(_req,res)=>{
    const key=process.env.STRIPE_SECRET_KEY||"";
    const base={keyConfigured:Boolean(key),webhookSecretConfigured:Boolean(process.env.STRIPE_WEBHOOK_SECRET),mode:key.includes('_test_')?'test':'live'};
    if(!key)return res.json({data:{...base,ready:false,apiReachable:false}});
    try {
      const [account,endpoints,last]=await Promise.all([getStripe().accounts.retrieve(),getStripe().webhookEndpoints.list({limit:100}),pool.query("SELECT processed_at FROM stripe_webhook_events ORDER BY processed_at DESC LIMIT 1")]);
      const origin=(process.env.APP_URL||process.env.SITE_URL||"https://hivestudio.com.mx").replace(/\/$/,"");
      const endpoint=endpoints.data.find(e=>e.url.replace(/\/$/,"")===`${origin}/api/stripe/webhook`);
      const missingEvents=['checkout.session.completed','checkout.session.expired'].filter(e=>!endpoint?.enabled_events?.includes(e)&&!endpoint?.enabled_events?.includes('*'));
      res.json({data:{...base,apiReachable:true,chargesEnabled:account.charges_enabled,webhookRegistered:Boolean(endpoint),webhookEnabled:endpoint?.status==='enabled',missingEvents,lastProcessedAt:last.rows[0]?.processed_at??null,ready:Boolean(base.webhookSecretConfigured&&endpoint?.status==='enabled'&&!missingEvents.length&&(base.mode==='test'||account.charges_enabled))}});
    }catch{res.json({data:{...base,apiReachable:false,ready:false,error:"No se pudo comprobar la conexión con Stripe"}});}
  });

  app.get("/api/public/payment-config", (_req,res) => res.json({ data: { cardEnabled: Boolean(process.env.STRIPE_SECRET_KEY) } }));
  for (const action of ["cancel", "pay-with-card"]) {
    app.post(`/api/orders/:id/${action}`, authMiddleware, async (req,res) => {
      const client=await pool.connect();
      try {
        await client.query("BEGIN");
        const order=(await client.query("SELECT * FROM orders WHERE id=$1 AND user_id=$2 FOR UPDATE", [req.params.id,req.userId])).rows[0];
        if (!order) throw problem(404,"Orden no encontrada");
        if (order.status!=="pending_payment") throw problem(409,"La orden ya cambió de estado. Actualiza el historial.");
        let existingSession=null;
        if (order.stripe_session_id) {
          if (!process.env.STRIPE_SECRET_KEY) throw problem(503,"No se pudo verificar el estado del pago con tarjeta.");
          existingSession=await getStripe().checkout.sessions.retrieve(order.stripe_session_id);
          if (existingSession.payment_status==="paid" || existingSession.status==="complete") throw problem(409,"El pago ya fue confirmado. Espera la actualización de la orden.");
        }
        if (action==="cancel") {
          if (existingSession?.status==="open") await getStripe().checkout.sessions.expire(existingSession.id);
          await client.query("UPDATE orders SET status='cancelled',updated_at=NOW() WHERE id=$1",[order.id]);
          await client.query("COMMIT");
          return res.json({message:"Orden cancelada"});
        }
        if (!process.env.STRIPE_SECRET_KEY) throw problem(503,"Pagos con tarjeta no disponibles");
        if (order.expires_at && new Date(order.expires_at)<=new Date()) throw problem(409,"La orden venció. Cancélala y crea una nueva compra.");
        if (existingSession?.status==="expired") throw problem(409,"La sesión de pago venció. Cancela esta orden y crea una nueva compra.");
        if (existingSession?.status==="open") {
          await client.query("COMMIT");
          return res.json({data:{checkout_url:existingSession.url}});
        }
        const plan=(await client.query("SELECT * FROM plans WHERE id=$1",[order.plan_id])).rows[0];
        if (!plan) throw problem(404,"Plan no encontrado");
        const customerId=await createOrGetStripeCustomer(client,req.userId);
        const session=await createCheckoutSession(client,{order,plan,totalAmount:Number(order.total_amount),customerId});
        await client.query("UPDATE orders SET stripe_session_id=$2,stripe_checkout_url=$3,payment_provider='stripe',payment_method='card',updated_at=NOW() WHERE id=$1",[order.id,session.id,session.url]);
        await client.query("COMMIT");return res.json({data:{checkout_url:session.url}});
      } catch(err) {await client.query("ROLLBACK").catch(()=>{});return fail(res,err);}
      finally {client.release();}
    });
  }

  app.get("/api/admin/users/:id/credit-history", ownerMiddleware, async(req,res)=>{
    try {
      const result=await pool.query(`SELECT l.*,p.name AS plan_name FROM membership_credit_log l
        JOIN memberships m ON m.id=l.membership_id LEFT JOIN plans p ON p.id=m.plan_id
        WHERE m.user_id=$1 ORDER BY l.created_at DESC,l.id DESC LIMIT 300`,[req.params.id]);
      res.json({data:result.rows.map(camelRow)});
    } catch(err) {fail(res,err);}
  });

  for (const action of ["pause", "resume"]) {
    app.put(`/api/memberships/:id/${action}`, ownerMiddleware, async (req, res) => {
      if (action === "pause" && reasonProblem(req.body?.reason)) {
        return res.status(400).json({ message: reasonProblem(req.body?.reason) });
      }
      const client = await pool.connect();
      let member; let updated; let pausedDays = 0; const freed = [];
      try {
        await client.query("BEGIN");
        member = (await client.query("SELECT * FROM memberships WHERE id=$1 FOR UPDATE", [req.params.id])).rows[0];
        if (!member) throw problem(404, "Membresía no encontrada");
        if (action === "pause") {
          if (member.status !== "active") throw problem(409, "Solo se puede congelar una membresía activa");
          const bookings = await client.query(`SELECT b.id, b.class_id, b.status FROM bookings b
            JOIN classes c ON c.id=b.class_id WHERE b.membership_id=$1
            AND b.status IN ('confirmed','waitlist') AND (c.date+c.start_time) > LOCALTIMESTAMP
            ORDER BY c.id,b.id FOR UPDATE OF b,c`, [member.id]);
          for (const booking of bookings.rows) {
            await client.query("UPDATE bookings SET status='cancelled', cancelled_at=NOW(), cancellation_reason='Membresía congelada', updated_at=NOW() WHERE id=$1", [booking.id]);
            if (booking.status === "confirmed") await restoreMembershipCredit(client, member.id, booking.class_id, booking.id);
            freed.push(booking.class_id);
          }
          updated = (await client.query(`UPDATE memberships SET status='paused', paused_at=NOW(),
            pause_reason=$2, updated_at=NOW() WHERE id=$1 RETURNING *`, [member.id, req.body.reason.trim()])).rows[0];
        } else {
          if (member.status !== "paused" || !member.paused_at) throw problem(409, "La membresía no está congelada");
          pausedDays = Number((await client.query("SELECT GREATEST(0, CURRENT_DATE - $1::timestamptz::date)::int AS days", [member.paused_at])).rows[0].days);
          updated = (await client.query(`UPDATE memberships SET status='active',
            end_date=end_date+$2::int, paused_at=NULL, total_paused_days=total_paused_days+$2,
            last_resumed_at=NOW(), updated_at=NOW() WHERE id=$1 RETURNING *`, [member.id, pausedDays])).rows[0];
        }
        await recordAudit(client, { actorId: req.userId, action: `membership.${action}`, entityType: "membership",
          entityId: member.id, subjectUserId: member.user_id, reason: req.body?.reason,
          before: { status: member.status, end_date: member.end_date, classes_remaining: member.classes_remaining },
          after: { status: updated.status, end_date: updated.end_date, classes_remaining: updated.classes_remaining },
          meta: { cancelledBookings: freed.length, pausedDays } });
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {}); return fail(res, err);
      } finally { client.release(); }
      triggerWalletPassSync(member.user_id, `membership_${action}`);
      if (freed.length) await onSeatReleased(freed, { source: "membership_pause" }).catch(() => {});
      return res.json({ data: camelRow(updated), cancelledBookings: freed.length, pausedDays });
    });
  }

  app.post("/api/admin/plans/reorder", ownerMiddleware, async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[a-f0-9-]{36}$/i.test(id))) return res.status(400).json({ message: "Lista de planes inválida" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query("SELECT id FROM plans WHERE id=ANY($1::uuid[]) FOR UPDATE", [ids]);
      if (existing.rows.length !== ids.length) throw problem(404, "Uno de los planes ya no existe");
      for (let i = 0; i < ids.length; i++) await client.query("UPDATE plans SET sort_order=$2, updated_at=NOW() WHERE id=$1", [ids[i], i]);
      await recordAudit(client, { actorId: req.userId, action: "plan.reorder", entityType: "plan", after: { ids } });
      await client.query("COMMIT"); res.json({ message: "Orden actualizado" });
    } catch (err) { await client.query("ROLLBACK").catch(() => {}); fail(res, err); }
    finally { client.release(); }
  });

  app.get("/api/reports/occupancy-by-slot", ownerMiddleware, async (req, res) => {
    try {
      const weeks = Math.min(26, Math.max(1, parseInt(req.query.weeks, 10) || 4));
      const result = await pool.query(`SELECT EXTRACT(ISODOW FROM c.date)::int AS dow,
        TO_CHAR(c.start_time,'HH24:MI') AS slot, COUNT(*)::int AS classes,
        SUM(c.max_capacity)::int AS seats, COALESCE(SUM(oc.people),0)::int AS booked
        FROM classes c LEFT JOIN LATERAL (SELECT COUNT(*)::int AS people FROM bookings b
          WHERE b.class_id=c.id AND b.status IN ('confirmed','checked_in','no_show')) oc ON true
        WHERE c.status<>'cancelled' AND c.date>=CURRENT_DATE-($1::int*7) AND c.date<CURRENT_DATE
        GROUP BY 1,2 ORDER BY 2,1`, [weeks]);
      res.json({ data: { weeks, slots: result.rows.map((r) => ({ ...r, occupancy: r.seats ? Math.round(r.booked / r.seats * 100) : null })) } });
    } catch (err) { fail(res, err); }
  });

  app.post("/api/admin/classes/duplicate-week", ownerMiddleware, async (req,res) => {
    const { sourceStart, targetStart } = req.body ?? {};
    if (!isDay(sourceStart) || !isDay(targetStart) || sourceStart === targetStart) return res.status(400).json({ message: "Elige dos semanas distintas" });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize overlapping duplicate requests. Existing slots remain untouched.
      await client.query("SELECT pg_advisory_xact_lock(72901837)");
      const refs=await client.query("SELECT DISTINCT instructor_id,class_type_id FROM classes WHERE date BETWEEN $1::date AND $1::date+6 AND status<>'cancelled'",[sourceStart]);
      for(const ref of refs.rows.sort((a,b)=>String(a.instructor_id).localeCompare(String(b.instructor_id)))) {
        const coach=await client.query("SELECT id FROM instructors WHERE id=$1 AND is_active=true AND deleted_at IS NULL FOR SHARE",[ref.instructor_id]);
        const type=await client.query("SELECT id FROM class_types WHERE id=$1 AND is_active=true FOR SHARE",[ref.class_type_id]);
        if(!coach.rowCount||!type.rowCount){await client.query("ROLLBACK");return res.status(409).json({message:"La semana contiene una coach o disciplina inactiva. Corrige la agenda antes de copiarla."});}
      }
      const result = await client.query(`INSERT INTO classes (class_type_id,instructor_id,date,start_time,end_time,max_capacity,status)
        SELECT c.class_type_id,c.instructor_id,($2::date+(c.date-$1::date)),c.start_time,c.end_time,c.max_capacity,'scheduled'
        FROM classes c WHERE c.date BETWEEN $1::date AND $1::date+6 AND c.status<>'cancelled'
          AND ($2::date+(c.date-$1::date)+c.start_time)>LOCALTIMESTAMP
          AND NOT EXISTS (SELECT 1 FROM classes dest
            WHERE dest.date=($2::date+(c.date-$1::date)) AND dest.start_time=c.start_time AND dest.status<>'cancelled')
        RETURNING id`, [sourceStart,targetStart]);
      await recordAudit(client, { actorId:req.userId, action:"class.duplicate_week", entityType:"class", after:{sourceStart,targetStart,created:result.rowCount} });
      await client.query("COMMIT");
      res.json({ data:{created:result.rowCount}, message:`${result.rowCount} clases copiadas sin duplicar horarios existentes` });
    } catch(err) { await client.query("ROLLBACK").catch(()=>{});fail(res,err); } finally { client.release(); }
  });
}
