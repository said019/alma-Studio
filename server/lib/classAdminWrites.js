import { isUuid } from './validate.js';

const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const time = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10) === value;
export function classWriteValues(body, before = null) {
  const start = body.startTime;
  const end = body.endTime;
  let date = before?.date, startTime = before?.start_time?.slice(0,5), endTime = before?.end_time?.slice(0,5);
  if (start !== undefined) {
    if (typeof start !== 'string') throw failure('Horario inválido.');
    if (start.includes('T')) { const bits=start.split('T'); if(bits.length!==2)throw failure('Horario inválido.'); [date,startTime]=bits; }
    else startTime=start;
  }
  if (end !== undefined) {
    if (typeof end !== 'string') throw failure('Horario inválido.');
    if (end.includes('T')) {const bits=end.split('T'); if(bits.length!==2||bits[0]!==date)throw failure('La clase debe empezar y terminar el mismo día.'); endTime=bits[1];}
    else endTime=end;
  }
  if (!before && end === undefined && time(startTime)) {const [h,m]=startTime.split(':').map(Number); const n=h*60+m+55; endTime=`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
  const capacity=body.maxCapacity??body.capacity??before?.max_capacity??5;
  const classTypeId=body.classTypeId??before?.class_type_id;
  const instructorId=body.instructorId??before?.instructor_id;
  if(!day(date)||!time(startTime)||!time(endTime)||endTime<=startTime)throw failure('Usa una fecha válida y una hora final posterior a la inicial, dentro del mismo día.');
  if(!Number.isInteger(capacity)||capacity<1||capacity>1000)throw failure('El cupo debe ser un entero entre 1 y 1000.');
  if(!isUuid(classTypeId)||!isUuid(instructorId))throw failure('Selecciona una disciplina e instructora válidas.');
  if(body.status!==undefined&&!['scheduled','closed'].includes(body.status))throw failure('Para cancelar usa Cancelar clase: devuelve créditos y conserva el historial.');
  if(body.notes!==undefined&&(typeof body.notes!=='string'||body.notes.length>2000))throw failure('Las notas deben tener máximo 2000 caracteres.');
  return {date,startTime,endTime,capacity,classTypeId,instructorId,status:body.status??before?.status??'scheduled',notes:body.notes??before?.notes??null};
}
export async function assertClassActor(db, req, instructorId, lock = true) {
  if(req.userRole!=='instructor')return;
  const found=await db.query(`SELECT id FROM instructors WHERE id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL ${lock?'FOR SHARE':''}`,[instructorId,req.userId]);
  if(!found.rowCount)throw failure('Sólo puedes operar tus propias clases con una cuenta de coach activa.',403);
}
async function activeReferences(db, values) {
  for (const [table,id] of [['class_types',values.classTypeId],['instructors',values.instructorId]]) {
    const found=await db.query(`SELECT id FROM ${table} WHERE id=$1 AND is_active=true ${table==='instructors'?'AND deleted_at IS NULL':''} FOR SHARE`,[id]);
    if(!found.rowCount)throw failure('La disciplina o coach seleccionada ya no está activa.',409);
  }
}
export function registerClassAdminWrites(app,{pool,adminMiddleware,recordAudit,onSeatReleased,classEditReleasesSeats}) {
  const run = handler => async(req,res)=>{
    let db,committed=false;
    try {db=await pool.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='5s'");
      // Creation, generation and edits share this lock. Bulk writes additionally
      // lock the classes table, so they serialize against these INSERT/UPDATEs.
      await db.query('SELECT pg_advisory_xact_lock(72901837)');
      const result=await handler(db,req);await db.query('COMMIT');committed=true;db.release();db=null;
      if(result.freed){try{result.body.waitlist_promoted=await onSeatReleased([result.freed],{source:'class_edit'});}catch{result.body.warning='Los cambios se guardaron. Revisa la lista de espera.';}}
      return res.status(result.status??200).json(result.body);
    }catch(error){if(db&&!committed)await db.query('ROLLBACK').catch(()=>{});const busy=['55P03','40P01','40001'].includes(error.code);return res.status(error.status??(busy?409:500)).json({message:error.status?error.message:busy?'Hay otra operación en curso. Intenta de nuevo.':'No se pudo guardar la clase.'});}finally{db?.release();}
  };
  app.post('/api/classes',adminMiddleware,run(async(db,req)=>{
    const v=classWriteValues(req.body??{});await assertClassActor(db,req,v.instructorId);await activeReferences(db,v);
    const existing=await db.query("SELECT id FROM classes WHERE date=$1 AND start_time=$2 AND class_type_id=$3 AND status<>'cancelled'",[v.date,v.startTime,v.classTypeId]);
    if(existing.rowCount)throw failure('Ya existe una clase de esta disciplina en ese horario.',409);
    const row=(await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity,notes,status) VALUES($1,$2,$3,$4,$5,$6,$7,'scheduled') RETURNING *",[v.classTypeId,v.instructorId,v.date,v.startTime,v.endTime,v.capacity,v.notes])).rows[0];
    await recordAudit(db,{actorId:req.userId,action:'class.create',entityType:'class',entityId:row.id,after:row});
    return {status:201,body:{data:row}};
  }));
  app.put('/api/admin/classes/:id',adminMiddleware,run(async(db,req)=>{
    if(!isUuid(req.params.id))throw failure('Clase inválida.');
    const before=(await db.query("SELECT *,to_char(date,'YYYY-MM-DD') AS date FROM classes WHERE id=$1 FOR UPDATE",[req.params.id])).rows[0];
    if(!before)throw failure('Clase no encontrada.',404);
    await assertClassActor(db,req,before.instructor_id);
    const v=classWriteValues(req.body??{},before);await assertClassActor(db,req,v.instructorId);await activeReferences(db,v);
    if(!['scheduled','closed'].includes(before.status))throw failure('La clase está cancelada o finalizada.',409);
    const counts=(await db.query("SELECT COUNT(*) FILTER(WHERE status IN ('confirmed','checked_in'))::int AS occupied, COUNT(*) FILTER(WHERE status IN ('confirmed','checked_in','waitlist'))::int AS reserved FROM bookings WHERE class_id=$1",[before.id])).rows[0];
    if(v.capacity<counts.occupied)throw failure(`La clase tiene ${counts.occupied} reservas activas; no puedes reducir el cupo a ${v.capacity}.`,409);
    const changed=['date','start_time','end_time','class_type_id','instructor_id'].some((k,i)=>String(before[k]).slice(0,k.endsWith('_time')?5:undefined)!==[v.date,v.startTime,v.endTime,v.classTypeId,v.instructorId][i]);
    if(counts.reserved>0&&changed)throw failure('Esta clase tiene reservas. Para cambiar horario, disciplina o coach, cancela la clase con devolución de créditos y crea una nueva. Puedes editar cupo y notas.',409);
    if(changed){const conflict=await db.query("SELECT id FROM classes WHERE id<>$1 AND date=$2 AND status<>'cancelled' AND ((class_type_id=$3 AND start_time=$4) OR (instructor_id=$5 AND start_time<$6 AND end_time>$4))",[before.id,v.date,v.classTypeId,v.startTime,v.instructorId,v.endTime]);if(conflict.rowCount)throw failure('Ya existe una clase o la coach está ocupada en ese horario.',409);}
    const row=(await db.query('UPDATE classes SET class_type_id=$2,instructor_id=$3,date=$4,start_time=$5,end_time=$6,max_capacity=$7,status=$8,notes=$9,updated_at=NOW() WHERE id=$1 RETURNING *',[before.id,v.classTypeId,v.instructorId,v.date,v.startTime,v.endTime,v.capacity,v.status,v.notes])).rows[0];
    await recordAudit(db,{actorId:req.userId,action:'class.edit',entityType:'class',entityId:row.id,before,after:row});
    return {body:{data:row},freed:classEditReleasesSeats({before,after:row})?row.id:null};
  }));
  app.post('/api/classes/generate',adminMiddleware,run(async(db,req)=>{
    const b=req.body??{};
    if(!day(b.startDate)||!day(b.endDate)||b.endDate<b.startDate||(Date.parse(b.endDate)-Date.parse(b.startDate))/86400000>366)throw failure('Selecciona un rango válido de hasta 366 días.');
    if(!Array.isArray(b.daysOfWeek)||!b.daysOfWeek.length||b.daysOfWeek.some(x=>!Number.isInteger(x)||x<0||x>6))throw failure('Selecciona días de la semana válidos.');
    const v=classWriteValues({...b,startTime:b.startDate+'T'+b.startTime});await assertClassActor(db,req,v.instructorId);await activeReferences(db,v);
    const created=[];
    for(let current=new Date(b.startDate+'T00:00:00Z');current.toISOString().slice(0,10)<=b.endDate;current.setUTCDate(current.getUTCDate()+1)){
      if(!b.daysOfWeek.includes(current.getUTCDay()))continue;
      const date=current.toISOString().slice(0,10);
      if((await db.query('SELECT id FROM classes WHERE date=$1 AND start_time=$2 AND class_type_id=$3',[date,v.startTime,v.classTypeId])).rowCount)continue;
      created.push((await db.query("INSERT INTO classes(class_type_id,instructor_id,date,start_time,end_time,max_capacity,status) VALUES($1,$2,$3,$4,$5,$6,'scheduled') RETURNING *",[v.classTypeId,v.instructorId,date,v.startTime,v.endTime,v.capacity])).rows[0]);
    }
    for(const row of created)await recordAudit(db,{actorId:req.userId,action:'class.generate',entityType:'class',entityId:row.id,after:row});
    return {body:{created:created.length,data:created}};
  }));
}
