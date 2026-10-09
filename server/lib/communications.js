import { enqueueCampaign, drainCampaigns } from './campaignOutbox.js';
import crypto from "node:crypto";
import { sendCustomBroadcast, renderCustomBroadcast } from "../emailService.js";
export function registerCommunications(app,{pool,ownerMiddleware,queueWhatsAppSend,normalisePhone,whatsappChannelState,appPublicUrl,recordAudit}) {
  app.post("/api/admin/users/:id/reset-password",ownerMiddleware,async(req,res)=>{
    if(!process.env.RESEND_API_KEY)return res.status(503).json({message:"Correo no configurado"});
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const user=(await client.query("SELECT id,email,display_name FROM users WHERE id=$1 AND is_active IS NOT FALSE FOR UPDATE",[req.params.id])).rows[0];
      if(!user) {await client.query("ROLLBACK");return res.status(404).json({message:"Usuario no encontrado"});}
      const token=crypto.randomBytes(32).toString("hex");
      await client.query("UPDATE password_reset_tokens SET used=true WHERE user_id=$1 AND used=false",[user.id]);
      await client.query("INSERT INTO password_reset_tokens(user_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '2 hours')",[user.id,token]);
      await recordAudit(client,{actorId:req.userId,action:"user.password_reset",entityType:"user",entityId:user.id,subjectUserId:user.id});
      await client.query("COMMIT");
      await sendCustomBroadcast({to:user.email,name:user.display_name,subject:"Restablecer acceso a HIVE",body:"Tu administrador solicitó un enlace para restablecer tu contraseña. El enlace vence en dos horas.",ctaUrl:`${appPublicUrl}/auth/reset-password?token=${encodeURIComponent(token)}`,ctaText:"Restablecer contraseña"});
      res.json({message:"Enlace enviado al correo del usuario"});
    }catch{await client.query("ROLLBACK").catch(()=>{});res.status(500).json({message:"No se pudo enviar el enlace. Intenta nuevamente."});}finally{client.release();}
  });
  const audiences=new Set(["all","with_active_membership","without_membership","accepts_communications"]);
  const resolve=async(audience)=>{
    let where="u.role='client' AND u.is_active IS NOT FALSE AND u.receive_promotions=true";
    if(audience==="accepts_communications")where+=" AND u.receive_promotions=true";
    if(audience==="with_active_membership")where+=" AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active' AND (m.end_date IS NULL OR m.end_date>=CURRENT_DATE))";
    if(audience==="without_membership")where+=" AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active' AND (m.end_date IS NULL OR m.end_date>=CURRENT_DATE))";
    return (await pool.query(`SELECT u.id,u.display_name,u.email,u.phone FROM users u WHERE ${where} ORDER BY u.id`)).rows;
  };
  app.get("/api/admin/broadcast/audience-count",ownerMiddleware,async(req,res)=>{
    if(!audiences.has(req.query.audience))return res.status(400).json({message:"Audiencia inválida"});
    try{
      const recipients=await resolve(req.query.audience);
      const summary=(await pool.query("SELECT count(*)::int total, count(*) FILTER (WHERE receive_promotions IS NOT TRUE)::int unsubscribed FROM users WHERE role='client' AND is_active IS NOT FALSE")).rows[0];
      res.json({data:{count:recipients.filter(u=>u.email?.trim()).length,totalClients:summary.total,unsubscribed:summary.unsubscribed}});
    }catch{res.status(500).json({message:"No se pudo contar la audiencia"});}
  });
  app.post("/api/admin/broadcast/email-preview",ownerMiddleware,(req,res)=>{
    const {subject="",body="",headline="",ctaUrl="",ctaText="",name="María"}=req.body??{};
    if([subject,body,headline,ctaUrl,ctaText,name].some(v=>typeof v!=="string") || subject.length>300 || body.length>20000 || headline.length>1000 || ctaUrl.length>2000 || ctaText.length>300 || name.length>100) return res.status(400).json({message:"Revisa la longitud del mensaje"});
    try {const preview=renderCustomBroadcast({to:"preview@example.invalid",name,subject,body,headline,ctaUrl,ctaText});res.json({data:{subject:preview.subject,html:preview.html}});}
    catch {res.status(400).json({message:"Revisa el enlace del botón: debe empezar con https:// o http://"});}
  });
  for(const channel of ["email","whatsapp"]) {
    app.post(`/api/admin/broadcast/${channel}`,ownerMiddleware,async(req,res)=>{
      const {audience="accepts_communications",subject,body,message,headline,ctaUrl,ctaText}=req.body??{};
      if(!audiences.has(audience)||!(channel==="email"?subject&&body:message))return res.status(400).json({message:"Completa el mensaje y elige la audiencia"});
      if(channel==="email"&&!process.env.RESEND_API_KEY)return res.status(503).json({message:"Correo no configurado"});
      if(channel==="whatsapp"&&!(await whatsappChannelState()).connected)return res.status(503).json({message:"WhatsApp está desconectado"});
      try {
        const recipients=await resolve(audience);
        if(channel==='email'){
          const key=req.body.idempotencyKey;
          if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(key||''))return res.status(400).json({message:'Identificador de envío inválido.'});
          if(typeof subject!=='string'||subject.length>300||typeof body!=='string'||body.length>20000)return res.status(400).json({message:'El asunto o mensaje es demasiado largo.'});
          if(ctaUrl){try{if(!['https:','http:'].includes(new URL(ctaUrl).protocol))throw new Error();}catch{return res.status(400).json({message:'Enlace inválido'});}}
          const data=await enqueueCampaign(pool,{actorId:req.userId,key,payload:{audience,subject,body,headline:headline||'',ctaUrl:ctaUrl||'',ctaText:ctaText||''},recipients:recipients.filter(u=>u.email)});
          return res.status(202).json({data});
        }
        let sent=0,failed=0;
        for(const u of recipients) {
          try {
            if(channel==="email"){if(!u.email)throw new Error("Sin correo");await sendCustomBroadcast({to:u.email,name:u.display_name,subject,body,headline,ctaUrl,ctaText});}
            else{if(!u.phone)throw new Error("Sin teléfono");await queueWhatsAppSend(normalisePhone(u.phone),String(message).replace(/\{name\}/gi,String(u.display_name||"").split(" ")[0]));}
            sent++;
          }catch{failed++;}
          if(channel==="email")await new Promise(resolve=>setTimeout(resolve,550));
        }
        res.json({data:{sent,failed,total:recipients.length}});
      }catch(e){res.status(e.status||500).json({message:e.status?e.message:"No se pudo guardar el comunicado"});}
    });
  }
  app.post("/api/admin/birthdays/:userId/greet",ownerMiddleware,async(req,res)=>{
    const {message,sendEmail=true,sendWhatsapp=true}=req.body??{};
    if(typeof message!=="string"||message.trim().length<2)return res.status(400).json({message:"Escribe la felicitación"});
    try {
      const user=(await pool.query("SELECT id,display_name,email,phone FROM users WHERE id=$1 AND is_active IS NOT FALSE",[req.params.userId])).rows[0];
      if(!user)return res.status(404).json({message:"Usuario no encontrado"});
      const results={email:null,whatsapp:null};
      if(sendEmail)try {await sendCustomBroadcast({to:user.email,name:user.display_name,subject:"¡Feliz cumpleaños! — HIVE",body:message});results.email="sent";}catch{results.email="failed";}
      if(sendWhatsapp)try {if(!user.phone||!(await whatsappChannelState()).connected)throw new Error();await queueWhatsAppSend(normalisePhone(user.phone),message.replace(/\{name\}/gi,String(user.display_name||"").split(" ")[0]));results.whatsapp="sent";}catch{results.whatsapp="failed";}
      res.json({data:results});
    }catch{res.status(500).json({message:"No se pudo enviar la felicitación"});}
  });
  app.get('/api/admin/broadcast/campaigns',ownerMiddleware,async(_req,res)=>{
    try{
      const data=(await pool.query(`SELECT c.id,c.payload->>'subject' AS subject,c.created_at,
       COUNT(d.id)::int total,COUNT(*) FILTER(WHERE d.status='accepted')::int accepted,
       COUNT(*) FILTER(WHERE d.status IN ('queued','retry','sending'))::int pending,
       COUNT(*) FILTER(WHERE d.status='needs_review')::int needs_review,
       COUNT(*) FILTER(WHERE d.status='skipped')::int skipped
       FROM email_campaigns c LEFT JOIN email_campaign_deliveries d ON d.campaign_id=c.id
       GROUP BY c.id ORDER BY c.created_at DESC LIMIT 100`)).rows;
      res.json({data});
    }catch{res.status(503).json({message:'No se pudo consultar el historial de campañas'});}
  });
  app.get('/api/admin/broadcast/campaigns/:id',ownerMiddleware,async(req,res)=>{
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(req.params.id))return res.status(400).json({message:'Campaña inválida'});
    const offset=Math.max(0,Math.min(10000000,Number.parseInt(String(req.query.offset||'0'),10)||0));
    const limit=Math.max(1,Math.min(100,Number.parseInt(String(req.query.limit||'100'),10)||100));
    try{
      const campaign=(await pool.query("SELECT id,payload->>'subject' AS subject FROM email_campaigns WHERE id=$1",[req.params.id])).rows[0];
      if(!campaign)return res.status(404).json({message:'Campaña no encontrada'});
      const result=(await pool.query(`WITH deliveries AS (
        SELECT id,recipient,status,attempts,provider_id,last_error,updated_at FROM email_campaign_deliveries WHERE campaign_id=$1
      ), page AS (SELECT * FROM deliveries ORDER BY CASE WHEN status IN ('needs_review','failed') THEN 0 ELSE 1 END,id LIMIT $2 OFFSET $3)
      SELECT COALESCE((SELECT json_agg(page ORDER BY CASE WHEN status IN ('needs_review','failed') THEN 0 ELSE 1 END,id) FROM page),'[]') AS rows,
       (SELECT COUNT(*)::int FROM deliveries) AS total`,[req.params.id,limit,offset])).rows[0];
      res.json({data:{campaign,deliveries:result.rows,pagination:{limit,offset,total:result.total,hasMore:offset+limit<result.total}}});
    }catch{res.status(503).json({message:'No se pudo consultar el detalle de la campaña'});}
  });
  return {drain:()=>process.env.RESEND_API_KEY?drainCampaigns(pool,sendCustomBroadcast):Promise.resolve(0)};

}
