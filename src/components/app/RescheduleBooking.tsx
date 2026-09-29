import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
export function RescheduleBooking({bookingId}:{bookingId:string}) {
  const [open,setOpen]=useState(false); const [day,setDay]=useState(format(addDays(new Date(),1),"yyyy-MM-dd"));const [target,setTarget]=useState("");
  const qc=useQueryClient(); const {toast}=useToast();
  const classes=useQuery({queryKey:["reschedule-classes",day],enabled:open,queryFn:async()=>(await api.get(`/classes?start=${day}&end=${day}`)).data});
  const mutation=useMutation({mutationFn:()=>api.post(`/bookings/${bookingId}/reschedule`,{newClassId:target}),
    onSuccess:()=>{for(const key of ["my-bookings","my-membership","my-memberships-all","public-classes","classes"])qc.invalidateQueries({queryKey:[key]});setOpen(false);toast({title:"Reserva cambiada",description:"Se conservó tu crédito."});},
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo cambiar; tu reserva original se conserva.",variant:"destructive"})});
  const available=(classes.data?.data??[]).filter((c:any)=>c.status==="scheduled");
  return <><Button variant="outline" onClick={()=>setOpen(true)}>Cambiar horario</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Cambiar horario de tu reserva</DialogTitle></DialogHeader>
      <p className="text-sm">Elige otra clase dentro de la vigencia y las condiciones de tu plan. Tu reserva actual se conserva si el cambio no puede completarse.</p>
      <label>Fecha<Input type="date" value={day} min={format(new Date(),"yyyy-MM-dd")} onChange={e=>{setDay(e.target.value);setTarget("");}} /></label>
      {classes.isError?<Button variant="outline" onClick={()=>classes.refetch()}>Reintentar carga</Button>:classes.isLoading?<p>Cargando clases…</p>:available.length?<Select value={target} onValueChange={setTarget}><SelectTrigger aria-label="Nueva clase"><SelectValue placeholder="Selecciona una clase" /></SelectTrigger><SelectContent>
        {available.map((c:any)=><SelectItem key={c.id} value={c.id}>{c.class_type_name??c.classTypeName} · {String(c.start_time??c.startTime).split("T").pop()?.slice(0,5)}</SelectItem>)}
      </SelectContent></Select>:<p>No hay clases disponibles ese día.</p>}
      <DialogFooter><Button disabled={!target||mutation.isPending} onClick={()=>mutation.mutate()}>Confirmar cambio</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
