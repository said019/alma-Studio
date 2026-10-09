import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { AuthGuard } from "@/components/admin/AuthGuard";
import { BroadcastDialog } from "@/components/admin/BroadcastDialog";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
export default function CampaignsPage(){return <AuthGuard requiredRoles={["admin","super_admin"]}><CampaignsContent/></AuthGuard>;}
function CampaignsContent() {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const {data,isError}=useQuery({queryKey:["email-campaigns"],queryFn:async()=>{
    const result=(await api.get('/admin/broadcast/campaigns')).data.data;
    return Array.isArray(result)?result:[];
  },refetchInterval:15000});
  return <AdminLayout>
    <div className="space-y-5">
      <h1 className="admin-title font-display text-ink">Campañas por correo</h1>
      <p className="text-ink-muted">Envía novedades y promociones por correo electrónico. Selecciona la audiencia, escribe el mensaje y revisa los destinatarios antes de enviarlo.</p>
      <Button onClick={() => setOpen(true)}><Mail className="mr-2 h-4 w-4" />Nueva campaña por correo</Button>
    </div>
    <section className="mt-8 space-y-3" aria-label="Historial de campañas">
      <h2 className="font-display text-lg">Historial de campañas</h2>
      <p className="text-sm text-ink-muted">Aceptado significa recibido por el proveedor; no confirma entrega al buzón.</p>
      {isError&&<p role="alert">No se pudo cargar el historial.</p>}
      {data?.map((c:any)=><article key={c.id} className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">{c.subject}</h3>
        <p className="text-sm">{c.accepted} aceptados · {c.pending} pendientes · {c.skipped} omitidos · {c.needs_review} requieren revisión</p>
        {c.needs_review>0&&<p className="text-sm text-ink-muted">Comprueba estos envíos en el proveedor antes de iniciar otra campaña.</p>}
        <Button variant="outline" className="mt-2" aria-expanded={expanded===c.id} onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{expanded===c.id?"Ocultar detalle":"Ver destinatarios"}</Button>
        {expanded===c.id&&<CampaignDetail key={c.id} id={c.id}/>}
      </article>)}
    </section>
    <BroadcastDialog open={open} onOpenChange={setOpen} emailOnly />
  </AdminLayout>;
}

const deliveryLabels:Record<string,string>={accepted:'Aceptado por el proveedor',needs_review:'Requiere revisión',failed:'Fallido',queued:'En cola',retry:'Reintentando',sending:'Procesando',skipped:'Omitido'};
function CampaignDetail({id}:{id:string}){
 const [offset,setOffset]=useState(0);
 const {data,isLoading,isError,refetch}=useQuery({queryKey:['email-campaign-detail',id,offset],queryFn:async()=>
  (await api.get(`/admin/broadcast/campaigns/${id}?offset=${offset}&limit=100`)).data.data});
 if(isLoading)return <p className="mt-3 text-sm">Cargando destinatarios…</p>;
 if(isError)return <div role="alert" className="mt-3 text-sm">No se pudo cargar el detalle. <Button variant="outline" onClick={()=>refetch()}>Reintentar</Button></div>;
 const rows=Array.isArray(data?.deliveries)?data.deliveries:[];
 return <section aria-label="Detalle de destinatarios" className="mt-4 space-y-3">
  <p className="text-sm text-ink-muted">Usa el identificador del proveedor para verificar el envío. No vuelvas a enviar una campaña sin comprobar los movimientos pendientes.</p>
  {rows.map((d:any)=><div key={d.id} className="border-t border-line pt-2 text-sm break-all">
   <p className="font-semibold">{d.recipient}</p><p>{deliveryLabels[d.status]||d.status} · {d.attempts} intentos</p>
   <p>Identificador del envío: {d.id}</p>{d.provider_id&&<p>Identificador del proveedor: {d.provider_id}</p>}
   {d.last_error&&<p>{d.last_error}</p>}
  </div>)}
  {!rows.length&&<p className="text-sm">Sin destinatarios en esta página.</p>}
  {data?.pagination&&<nav aria-label="Páginas de destinatarios" className="flex items-center gap-3">
   <Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Anterior</Button>
   <span className="text-sm">{data.pagination.total} destinatarios</span>
   <Button variant="outline" disabled={!data.pagination.hasMore} onClick={()=>setOffset(offset+100)}>Siguiente</Button>
  </nav>}
 </section>;
}
