// Imported rows always belong to TotalPass. All staff controls for those rows
// go through the integration so a local attendance does not imply settlement.
export function installPartnerBookingGuard(app,{pool,authMiddleware,adminMiddleware}) {
  const paths=[
    ['delete','/api/admin/bookings/:id'],
    ['put','/api/bookings/:id/check-in'],
    ['put','/api/bookings/:id/no-show'],
    ['put','/api/bookings/:id/correct-no-show'],
    ['put','/api/admin/bookings/:id/undo-check-in'],
    ['put','/api/staff/bookings/:id/check-in'],
  ];
  for(const [method,path] of paths) {
    app[method](path,adminMiddleware || authMiddleware,async(req,res,next)=>{
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) return next();
      try {
        const result=await pool.query("SELECT id FROM bookings WHERE id=$1 AND partner_provider='totalpass'",[req.params.id]);
        if(result.rowCount) return res.status(409).json({code:'PARTNER_BOOKING_MANAGED_EXTERNALLY',message:'Usa las acciones de TotalPass para esta reserva. El check-in se confirma con el aviso de la plataforma.'});
        next();
      } catch {res.status(503).json({message:'No se pudo verificar el origen de la reserva.'});}
    });
  }
}
