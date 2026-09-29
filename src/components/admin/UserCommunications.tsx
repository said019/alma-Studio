import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
export function UserCommunications({userId}:{userId:string}) {
  const [open,setOpen]=useState(false);const [message,setMessage]=useState("¡Feliz cumpleaños, {name}! Te deseamos un gran día. Con cariño, HIVE.");
  const [email,setEmail]=useState(true);const [whatsapp,setWhatsapp]=useState(false);
  const {confirm,dialog}=useConfirm();const {toast}=useToast();
  const reset=useMutation({mutationFn:()=>api.post(`/admin/users/${userId}/reset-password`),onSuccess:({data})=>toast({title:data.message}),onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo enviar",variant:"destructive"})});
  const greet=useMutation({mutationFn:()=>api.post(`/admin/birthdays/${userId}/greet`,{message,sendEmail:email,sendWhatsapp:whatsapp}),onSuccess:({data})=>{
    const result=data.data;const failed=Object.values(result).includes("failed");
    toast({title:failed?"Revisa los canales de envío":"Felicitación enviada",description:`Correo: ${result.email==="sent"?"enviado":result.email==="failed"?"falló":"no solicitado"}. WhatsApp: ${result.whatsapp==="sent"?"enviado":result.whatsapp==="failed"?"falló":"no solicitado"}.`,variant:failed?"destructive":"default"});if(!failed)setOpen(false);
  },onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo enviar",variant:"destructive"})});
  return <>{dialog}<Button variant="outline" disabled={reset.isPending} onClick={async()=>{if(await confirm({title:"Restablecer acceso",description:"Se enviará al correo de este usuario un enlace para elegir una nueva contraseña. Su contraseña actual permanece vigente hasta que use el enlace.",confirmLabel:"Enviar enlace"}))reset.mutate();}}>Restablecer acceso</Button>
    <Button variant="outline" onClick={()=>setOpen(true)}>Felicitar cumpleaños</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Felicitación de cumpleaños</DialogTitle></DialogHeader>
      <label>Mensaje<Textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5}/></label><p className="text-sm text-ink-muted">Usa {'{name}'} para incluir su nombre.</p>
      <label><input type="checkbox" checked={email} onChange={e=>setEmail(e.target.checked)}/> Enviar por correo</label><label><input type="checkbox" checked={whatsapp} onChange={e=>setWhatsapp(e.target.checked)}/> Enviar por WhatsApp</label>
      <DialogFooter><Button disabled={greet.isPending||!message.trim()||(!email&&!whatsapp)} onClick={()=>greet.mutate()}>Enviar felicitación</Button></DialogFooter>
    </DialogContent></Dialog>
  </>;
}
