import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
export function DuplicateWeek({ sourceStart }: { sourceStart: string }) {
  const [open,setOpen] = useState(false); const [target,setTarget] = useState(""); const qc=useQueryClient(); const {toast}=useToast();
  const mutation=useMutation({
    mutationFn:()=>api.post("/admin/classes/duplicate-week",{sourceStart,targetStart:target}),
    onSuccess:({data})=>{qc.invalidateQueries({queryKey:["classes"]});setOpen(false);toast({title:data.message});},
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo copiar la semana",variant:"destructive"}),
  });
  return <><Button variant="outline" onClick={()=>setOpen(true)}>Copiar semana</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent>
    <DialogHeader><DialogTitle>Copiar semana</DialogTitle></DialogHeader>
    <p className="text-sm">Copia las clases de los siete días desde {sourceStart}, conservando tipo, coach, hora y cupo. Los horarios existentes en el destino se omiten.</p>
    <label className="space-y-2">Primer día de destino<Input type="date" value={target} onChange={e=>setTarget(e.target.value)}/></label>
    <DialogFooter><Button disabled={!target||target===sourceStart||mutation.isPending} onClick={()=>mutation.mutate()}>Copiar clases</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
