import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
export function ClassOperations({classId,bookingId}:{classId?:string;bookingId?:string}) {
  const {promptText,dialog}=useConfirm();const [open,setOpen]=useState(false);const [day,setDay]=useState("");const [reason,setReason]=useState("");const qc=useQueryClient();const {toast}=useToast();
  const mutation=useMutation({mutationFn:(why:string)=>bookingId?api.put(`/admin/bookings/${bookingId}/undo-check-in`,{reason:why}):api.post(classId?`/admin/classes/${classId}/not-held`:"/admin/classes/cancel-day",{day,reason:why}),
    onSuccess:({data})=>{for(const key of ["classes","class-roster-sheet","bookings","class-roster","roster","admin-classes-week","admin-stats","memberships"])qc.invalidateQueries({queryKey:[key]});setOpen(false);toast({title:data.message,description:data.data?.unreached?`${data.data.unreached} usuarios necesitan aviso manual; WhatsApp no pudo notificarlos.`:undefined});},
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo completar",variant:"destructive"})});
  const title=bookingId?"Deshacer asistencia":classId?"Clase no realizada":"Cancelar un día";
  return <>{dialog}<Button variant="outline" disabled={mutation.isPending} onClick={async()=>{
    if(!classId&&!bookingId){setOpen(true);return;}
    const why=await promptText({title,description:bookingId?"La reserva volverá a confirmada. Se revierten los puntos de asistencia y se conserva el crédito utilizado.":"Se cancelan las reservas y se restituyen los créditos. También se corrigen las faltas y las asistencias de esta clase.",minLength:5,confirmLabel:"Confirmar"});if(why)mutation.mutate(why);
  }}>{title}</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
    <p>Se cancelarán las clases que aún no comienzan en la fecha elegida y se devolverán los créditos de sus reservas.</p>
    <label>Fecha<Input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label><label>Motivo<Input value={reason} onChange={e=>setReason(e.target.value)}/></label>
    <DialogFooter><Button variant="destructive" disabled={!day||reason.trim().length<5||mutation.isPending} onClick={()=>mutation.mutate(reason)}>Cancelar clases del día</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
