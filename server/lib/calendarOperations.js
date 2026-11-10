import {randomUUID} from 'node:crypto';
export const CALENDAR_OPERATIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS booking_movements (
 id BIGSERIAL PRIMARY KEY, booking_id UUID NOT NULL, user_id UUID, happened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 previous_status TEXT, status TEXT, previous_class_id UUID, class_id UUID, class_name TEXT, class_date DATE, start_time TIME
);
ALTER TABLE booking_movements ADD COLUMN IF NOT EXISTS event_type TEXT;
CREATE INDEX IF NOT EXISTS booking_movements_user_idx ON booking_movements(user_id,happened_at DESC);
CREATE OR REPLACE FUNCTION capture_booking_movement() RETURNS trigger AS $$
BEGIN
 IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.class_id IS DISTINCT FROM NEW.class_id THEN
 INSERT INTO booking_movements(booking_id,user_id,previous_status,status,previous_class_id,class_id,class_name,class_date,start_time)
 SELECT NEW.id,NEW.user_id,CASE WHEN TG_OP='UPDATE' THEN OLD.status::text END,NEW.status::text,
 CASE WHEN TG_OP='UPDATE' THEN OLD.class_id END,NEW.class_id,ct.name,c.date,c.start_time
 FROM classes c JOIN class_types ct ON ct.id=c.class_type_id WHERE c.id=NEW.class_id;
 END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS booking_movements_capture ON bookings;
CREATE TRIGGER booking_movements_capture AFTER INSERT OR UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION capture_booking_movement();
CREATE OR REPLACE FUNCTION capture_class_booking_changes() RETURNS trigger AS $$
BEGIN
 IF OLD.date IS DISTINCT FROM NEW.date OR OLD.start_time IS DISTINCT FROM NEW.start_time
 OR OLD.end_time IS DISTINCT FROM NEW.end_time OR OLD.instructor_id IS DISTINCT FROM NEW.instructor_id
 OR OLD.class_type_id IS DISTINCT FROM NEW.class_type_id THEN
 INSERT INTO booking_movements(booking_id,user_id,previous_status,status,previous_class_id,class_id,class_name,class_date,start_time,event_type)
 SELECT b.id,b.user_id,b.status::text,b.status::text,NEW.id,NEW.id,ct.name,NEW.date,NEW.start_time,'class_updated'
 FROM bookings b JOIN class_types ct ON ct.id=NEW.class_type_id
 WHERE b.class_id=NEW.id AND b.status IN ('confirmed','waitlist','checked_in');
 END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS class_booking_changes_capture ON classes;
CREATE TRIGGER class_booking_changes_capture AFTER UPDATE ON classes FOR EACH ROW EXECUTE FUNCTION capture_class_booking_changes();

`;
export function registerCalendarOperations(app,{pool,adminMiddleware,onSeatReleased}) {
 app.get('/api/admin/users/:id/booking-movements',adminMiddleware,async(req,res)=>{
  try {const r=await pool.query('SELECT * FROM booking_movements WHERE user_id=$1 ORDER BY happened_at DESC,id DESC LIMIT 500',[req.params.id]);res.json({data:r.rows});}
  catch {res.status(500).json({message:'No se pudo cargar el historial.'});}
 });
 app.get('/api/admin/classes/:id/manual-seats',adminMiddleware,async(req,res)=>{
  try {const r=await pool.query(`SELECT b.id,u.display_name AS name FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.class_id=$1 AND b.status='confirmed' AND b.partner_metadata->>'manual_seat'='true' ORDER BY b.created_at`,[req.params.id]);res.json({data:r.rows});}
  catch {res.status(500).json({message:'No se pudieron cargar los lugares manuales.'});}
 });
 app.post('/api/admin/classes/:id/manual-seats',adminMiddleware,async(req,res)=>{
  const db=await pool.connect();try {
   await db.query('BEGIN');
   const cls=(await db.query('SELECT * FROM classes WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!cls||cls.status!=='scheduled'){await db.query('ROLLBACK');return res.status(409).json({message:'La clase no está abierta.'});}
   const n=(await db.query("SELECT count(*)::int AS n FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')",[cls.id])).rows[0].n;
   if(n>=cls.max_capacity){await db.query('ROLLBACK');return res.status(409).json({message:'La clase está llena.'});}
   const name=String(req.body?.name||'Lugar manual').trim().slice(0,150)||'Lugar manual';
   const u=(await db.query("INSERT INTO users(display_name,email,role,accepts_terms) VALUES($1,$2,'guest',false) RETURNING id",[name,`${randomUUID()}@manual.hive.invalid`])).rows[0];
   const b=(await db.query(`INSERT INTO bookings(class_id,user_id,status,partner_metadata) VALUES($1,$2,'confirmed',$3) RETURNING id`,[cls.id,u.id,JSON.stringify({manual_seat:true,created_by:req.userId})])).rows[0];
   await db.query('COMMIT');res.status(201).json({data:b});
  }catch(e){await db.query('ROLLBACK');res.status(500).json({message:'No se pudo ocupar el lugar.'});}finally{db.release();}
 });
 app.delete('/api/admin/classes/:id/manual-seats/:bookingId',adminMiddleware,async(req,res)=>{
  const db=await pool.connect();try {
   await db.query('BEGIN');await db.query('SELECT id FROM classes WHERE id=$1 FOR UPDATE',[req.params.id]);
   const r=await db.query(`UPDATE bookings SET status='cancelled',updated_at=NOW() WHERE id=$1 AND class_id=$2 AND status='confirmed' AND partner_metadata->>'manual_seat'='true' RETURNING id`,[req.params.bookingId,req.params.id]);
   await db.query('COMMIT');if(!r.rowCount)return res.status(404).json({message:'El lugar ya no está ocupado.'});res.json({ok:true});
  }catch{await db.query('ROLLBACK');res.status(500).json({message:'No se pudo liberar el lugar.'});}finally{db.release();}
  await onSeatReleased([req.params.id],{source:'manual_seat_released'}).catch(()=>{});
 });
}
