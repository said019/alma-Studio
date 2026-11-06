import crypto from 'node:crypto';
import {parsePhoneNumberFromString} from 'libphonenumber-js';
import {validateRegistration} from './registrationValidation.js';
const keyFor=t=>'client_invite:'+crypto.createHash('sha256').update(t).digest('hex');
export function registerClientInvites(app,{pool,adminMiddleware,bcrypt,signToken,mapUser,appPublicUrl,whatsappChannelState,queueWhatsAppSend,normalisePhone,privacyVersion}){
 app.post('/api/admin/clients/invite',adminMiddleware,async(req,res)=>{
  const name=typeof req.body?.displayName==='string'?req.body.displayName.trim():'';
  const phone=typeof req.body?.phone==='string'?parsePhoneNumberFromString(req.body.phone,'MX'):null;
  if(name.length<2||name.length>150||!phone?.isValid())return res.status(400).json({message:'Escribe nombre y teléfono válido con lada internacional.'});
  const client=await pool.connect();let user,token;
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[phone.number]);
   const matches=(await client.query("SELECT id,email,is_active FROM users WHERE regexp_replace(phone,'[^0-9]','','g')=ANY($1::text[]) FOR UPDATE",[[phone.number.slice(1),phone.country==='MX'?phone.nationalNumber:phone.number.slice(1)]])).rows;
   if(matches.length && (matches.length!==1||!matches[0].email.endsWith('@pending.hive.invalid')||!matches[0].is_active)){await client.query('ROLLBACK');return res.status(409).json({message:'Ya existe una cuenta con ese teléfono. Búscala en Personas para evitar duplicados.'});}
   user=matches[0];
   if(!user){const id=crypto.randomUUID();const hash=await bcrypt.hash(crypto.randomBytes(32).toString('hex'),12);user=(await client.query("INSERT INTO users(id,display_name,phone,email,password_hash,role,is_active,accepts_terms,accepts_communications,receive_promotions,onboarding_completed) VALUES($1,$2,$3,$4,$5,'client',true,false,false,false,false) RETURNING id",[id,name,phone.number,`${id}@pending.hive.invalid`,hash])).rows[0];}
   await client.query("DELETE FROM settings WHERE key LIKE 'client_invite:%' AND value->>'userId'=$1",[user.id]);
   token=crypto.randomBytes(32).toString('hex');await client.query('INSERT INTO settings(key,value) VALUES($1,$2::jsonb)',[keyFor(token),JSON.stringify({userId:user.id,createdBy:req.userId,expiresAt:Date.now()+72*3600000})]);
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return res.status(500).json({message:'No se pudo crear la invitación.'});}finally{client.release();}
  const link=`${appPublicUrl}/auth/register?invite=${token}`;const message=`Hola ${name}, HIVE te invita a completar tu perfil y crear tu contraseña: ${link} El enlace es personal y vence en 72 horas.`;
  let delivery='manual';try{if((await whatsappChannelState()).connected){await queueWhatsAppSend(normalisePhone(phone.number),message);delivery='sent';}}catch{delivery='failed';}
  res.status(201).json({data:{userId:user.id,link,delivery,shareUrl:`https://wa.me/${phone.number.slice(1)}?text=${encodeURIComponent(message)}`}});
 });
 app.post('/api/auth/invite-details',async(req,res)=>{
  const token=req.body?.inviteToken;if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return res.status(400).json({message:'Invitación inválida.'});
  try{const row=(await pool.query("SELECT u.display_name,u.phone FROM settings s JOIN users u ON u.id=(s.value->>'userId')::uuid WHERE s.key=$1 AND (s.value->>'expiresAt')::bigint>$2 AND u.is_active=true",[keyFor(token),Date.now()])).rows[0];
   if(!row)return res.status(410).json({message:'Invitación vencida o utilizada. Pide un nuevo enlace a recepción.'});
   const p=parsePhoneNumberFromString(row.phone);res.json({data:{displayName:row.display_name,phone:p?.nationalNumber,phoneCountry:p?.country||'MX'}});
  }catch{res.status(500).json({message:'No se pudo consultar la invitación.'});}
 });
 app.post('/api/auth/complete-invite',async(req,res)=>{
  const token=req.body?.inviteToken;if(typeof token!=='string'||! /^[a-f0-9]{64}$/.test(token))return res.status(400).json({message:'Invitación inválida.'});
  const validation=validateRegistration(req.body);if(!validation.data)return res.status(400).json({message:validation.message});
  const client=await pool.connect();
  try{
   await client.query('BEGIN');const invite=(await client.query('SELECT value FROM settings WHERE key=$1 FOR UPDATE',[keyFor(token)])).rows[0]?.value;
   if(!invite||invite.expiresAt<Date.now()){await client.query('ROLLBACK');return res.status(410).json({message:'El enlace venció o ya fue utilizado. Solicita otro a recepción.'});}
   const user=(await client.query('SELECT id,email,phone,is_active FROM users WHERE id=$1 FOR UPDATE',[invite.userId])).rows[0];
   if(!user?.is_active||!user.email.endsWith('@pending.hive.invalid')){await client.query('ROLLBACK');return res.status(409).json({message:'La cuenta ya fue completada.'});}
   if(validation.data.phone!==user.phone){await client.query('ROLLBACK');return res.status(400).json({message:'Usa el teléfono al que recibiste la invitación.'});}
   const b=req.body;const hash=await bcrypt.hash(b.password,12);
   const result=await client.query(`UPDATE users SET display_name=$2,email=$3,password_hash=$4,gender=$5,date_of_birth=$6,accepts_terms=true,accepts_communications=$7,receive_promotions=$8,privacy_notice_version=$9,privacy_accepted_at=NOW(),health_consent_version=$10,health_consent_at=CASE WHEN $10::text IS NULL THEN NULL ELSE NOW() END,updated_at=NOW() WHERE id=$1 RETURNING *`,[user.id,b.displayName.trim(),b.email.trim().toLowerCase(),hash,b.gender,validation.data.dateOfBirth,b.acceptsCommunications===true,b.receivePromotions===true,privacyVersion,b.healthConsent===true?privacyVersion:null]);
   await client.query('DELETE FROM settings WHERE key=$1',[keyFor(token)]);await client.query('COMMIT');res.json({user:mapUser(result.rows[0]),token:signToken(user.id)});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});res.status(e.code==='23505'?409:500).json({message:e.code==='23505'?'Ese correo ya tiene una cuenta. Contacta a recepción.':'No se pudo completar el perfil.'});}finally{client.release();}
 });
}
