import crypto from "node:crypto";
import { sendCustomBroadcast } from "../emailService.js";
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
    let where="u.role='client' AND u.is_active IS NOT FALSE";
    if(audience==="accepts_communications")where+=" AND u.receive_promotions=true";
    if(audience==="with_active_membership")where+=" AND EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active' AND (m.end_date IS NULL OR m.end_date>=CURRENT_DATE))";
    if(audience==="without_membership")where+=" AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=u.id AND m.status='active' AND (m.end_date IS NULL OR m.end_date>=CURRENT_DATE))";
    return (await pool.query(`SELECT u.id,u.display_name,u.email,u.phone FROM users u WHERE ${where} ORDER BY u.id`)).rows;
  };
  app.get("/api/admin/broadcast/audience-count",ownerMiddleware,async(req,res)=>{
    if(!audiences.has(req.query.audience))return res.status(400).json({message:"Audiencia inválida"});
    try{res.json({data:{count:(await resolve(req.query.audience)).length}});}catch{res.status(500).json({message:"No se pudo contar la audiencia"});}
  });
  for(const channel of ["email","whatsapp"]) {
    app.post(`/api/admin/broadcast/${channel}`,ownerMiddleware,async(req,res)=>{
      const {audience="accepts_communications",subject,body,message,headline,ctaUrl,ctaText}=req.body??{};
      if(!audiences.has(audience)||!(channel==="email"?subject&&body:message))return res.status(400).json({message:"Completa el mensaje y elige la audiencia"});
      if(channel==="email"&&!process.env.RESEND_API_KEY)return res.status(503).json({message:"Correo no configurado"});
      if(channel==="whatsapp"&&!(await whatsappChannelState()).connected)return res.status(503).json({message:"WhatsApp está desconectado"});
      try {
        const recipients=await resolve(audience);
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
      }catch{res.status(500).json({message:"No se pudo enviar el comunicado"});}
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
}
