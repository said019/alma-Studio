import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
export function ReorderPlans({plans}:{plans:{id:string;name?:string}[]}) {
  const [open,setOpen]=useState(false); const [items,setItems]=useState(plans); const qc=useQueryClient(); const {toast}=useToast();
  const mutation=useMutation({mutationFn:()=>api.post("/admin/plans/reorder",{ids:items.map(p=>p.id)}),
    onSuccess:()=>{for(const key of ["plans","public-plans","plans-active"])qc.invalidateQueries({queryKey:[key]});setOpen(false);toast({title:"Orden de planes actualizado"});},
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo guardar",variant:"destructive"})});
  const move=(index:number,delta:number)=>setItems(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});
  return <><Button variant="outline" disabled={plans.length<2} onClick={()=>{setItems(plans);setOpen(true);}}>Ordenar planes</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Orden de los planes</DialogTitle></DialogHeader>
      <p className="text-sm">El orden se refleja en el catálogo y en los selectores de planes.</p>
      {items.map((p,i)=><div key={p.id} className="flex items-center gap-2"><span className="flex-1">{p.name}</span><Button variant="outline" size="sm" aria-label={`Subir ${p.name}`} disabled={i===0} onClick={()=>move(i,-1)}>↑</Button><Button variant="outline" size="sm" aria-label={`Bajar ${p.name}`} disabled={i===items.length-1} onClick={()=>move(i,1)}>↓</Button></div>)}
      <DialogFooter><Button disabled={mutation.isPending} onClick={()=>mutation.mutate()}>Guardar orden</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
