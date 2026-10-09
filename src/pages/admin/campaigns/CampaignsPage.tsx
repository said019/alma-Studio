import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { AdminPage, AdminPageHeader } from '@/components/admin/AdminPage';
import { AuthGuard } from '@/components/admin/AuthGuard';
import { BroadcastDialog } from '@/components/admin/BroadcastDialog';
import { Button } from '@/components/ui/button';
import { Mail, Plus, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
export default function CampaignsPage(){return <AuthGuard requiredRoles={['admin','super_admin']}><CampaignsContent/></AuthGuard>;}
function CampaignsContent() {
 const [open,setOpen]=useState(false);
 const [expanded,setExpanded]=useState<string|null>(null);
 const {data,isPending,isError,refetch}=useQuery({queryKey:['email-campaigns'],queryFn:async()=>{
  const result=(await api.get('/admin/broadcast/campaigns')).data.data;return Array.isArray(result)?result:[];
 },refetchInterval:15000});
 return <AdminLayout><AdminPage className="gap-8 lg:gap-10">
  <AdminPageHeader kicker="Comunicación" title="Campañas por correo" subtitle="Mantén a tu comunidad al día con las novedades del estudio." actions={<Button className="min-h-11 gap-2 px-5" onClick={()=>setOpen(true)}><Plus size={17}/>Nueva campaña por correo</Button>}/>
  <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:gap-5 sm:p-6" aria-label="Canal de comunicación">
   <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full bg-canvas px-4 py-2 text-sm font-semibold text-ink"><Mail size={16}/>Correo electrónico</span>
   <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">Elige tu audiencia, prepara el mensaje y confirma antes de enviarlo. Solo recibirán correos las personas que autorizaron promociones.</p>
  </section>
  <section className="space-y-5" aria-label="Historial de campañas">
   <div className="space-y-2"><h2 className="font-display text-xl font-semibold text-ink">Historial de campañas</h2><p className="max-w-3xl text-sm leading-relaxed text-ink-muted">Consulta el avance y los destinatarios de cada campaña. Aceptado significa recibido por el proveedor; no confirma entrega al buzón.</p></div>
   {isPending&&<div role="status" className="flex min-h-48 items-center justify-center gap-3 rounded-2xl border border-line bg-surface text-sm text-ink-muted"><Loader2 className="animate-spin" size={20}/>Cargando campañas…</div>}
   {isError&&<div role="alert" className="flex flex-col items-start gap-4 rounded-2xl border border-line bg-surface p-6"><p className="text-ink">No se pudo cargar el historial.</p><Button variant="outline" onClick={()=>void refetch()}>Reintentar historial</Button></div>}
   {!isPending&&!isError&&data?.length===0&&<div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-14 text-center"><Mail size={28} className="mx-auto mb-4 text-ink-muted"/><h3 className="text-lg font-semibold text-ink">Tu primera campaña empieza aquí</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">Cuando prepares un correo, aquí podrás consultar sus destinatarios y el avance de los envíos.</p><Button variant="outline" className="mt-6 min-h-11" onClick={()=>setOpen(true)}>Crear primera campaña</Button></div>}
   {!isError&&data?.map((c:any)=><article key={c.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
    <div className="space-y-6 p-5 sm:p-7">
     <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 space-y-2"><p className="text-xs font-semibold uppercase tracking-widest text-ink-muted">Campaña por correo</p><h3 className="break-words text-lg font-semibold leading-snug text-ink">{c.subject}</h3></div><Button variant="outline" className="min-h-11 shrink-0 gap-2 self-start" aria-expanded={expanded===c.id} onClick={()=>setExpanded(expanded===c.id?null:c.id)}>{expanded===c.id?'Ocultar detalle':'Ver destinatarios'}{expanded===c.id?<ChevronUp size={16}/>:<ChevronDown size={16}/>}</Button></div>
     <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[[c.accepted,'Aceptados'],[c.pending,'Pendientes'],[c.skipped,'Omitidos'],[c.needs_review,'Requieren revisión']].map(([value,label])=><div key={label} className="rounded-xl bg-canvas px-4 py-4"><dt className="text-xs leading-relaxed text-ink-muted">{label}</dt><dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">{Number(value)||0}</dd></div>)}</dl>
     {c.needs_review>0&&<p className="rounded-xl border border-line px-4 py-3 text-sm leading-relaxed text-ink-muted">Hay envíos que requieren revisión. Compruébalos en el proveedor antes de iniciar otra campaña.</p>}
    </div>
    {expanded===c.id&&<CampaignDetail key={c.id} id={c.id}/>}
   </article>)}
  </section>
  <BroadcastDialog open={open} onOpenChange={setOpen} emailOnly/>
 </AdminPage></AdminLayout>;
}
const deliveryLabels:Record<string,string>={accepted:'Aceptado por el proveedor',needs_review:'Requiere revisión',failed:'Fallido',queued:'En cola',retry:'Reintentando',sending:'Procesando',skipped:'Omitido'};
function CampaignDetail({id}:{id:string}) {
 const [offset,setOffset]=useState(0);
 const {data,isPending,isError,refetch}=useQuery({queryKey:['email-campaign-detail',id,offset],queryFn:async()=>(await api.get(`/admin/broadcast/campaigns/${id}?offset=${offset}&limit=100`)).data.data});
 if(isPending)return <p role="status" className="border-t border-line p-6 text-sm text-ink-muted">Cargando destinatarios…</p>;
 if(isError)return <div role="alert" className="flex flex-wrap items-center gap-4 border-t border-line p-6 text-sm">No se pudo cargar el detalle.<Button variant="outline" onClick={()=>void refetch()}>Reintentar</Button></div>;
 const rows=Array.isArray(data?.deliveries)?data.deliveries:[];
 return <section aria-label="Detalle de destinatarios" className="space-y-5 border-t border-line bg-canvas p-5 sm:p-7">
  <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">Usa el identificador del proveedor para verificar el envío. No vuelvas a enviar una campaña sin comprobar los movimientos pendientes.</p>
  <div className="grid gap-4 xl:grid-cols-2">{rows.map((d:any)=><div key={d.id} className="min-w-0 space-y-4 rounded-xl border border-line bg-surface p-5">
   <div className="space-y-2"><p className="break-words font-semibold text-ink">{d.recipient||'Destinatario anonimizado'}</p><p className="text-sm text-ink-muted">{deliveryLabels[d.status]||d.status} · {d.attempts} intentos</p></div>
   <div className="space-y-2 break-all text-xs leading-relaxed text-ink-muted"><p>Identificador del envío: {d.id}</p>{d.provider_id&&<p>Identificador del proveedor: {d.provider_id}</p>}</div>
   {d.last_error&&<p className="border-t border-line pt-3 text-sm leading-relaxed text-ink">{d.last_error}</p>}
  </div>)}</div>
  {!rows.length&&<p className="py-5 text-sm text-ink-muted">Sin destinatarios en esta página.</p>}
  {data?.pagination&&<nav aria-label="Páginas de destinatarios" className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5"><span className="text-sm text-ink-muted">{data.pagination.total} destinatarios</span><div className="flex gap-2"><Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Anterior</Button><Button variant="outline" disabled={!data.pagination.hasMore} onClick={()=>setOffset(offset+100)}>Siguiente</Button></div></nav>}
 </section>;
}
