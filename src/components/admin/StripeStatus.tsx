import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
export function StripeStatus() {
  const query=useQuery({queryKey:["admin-stripe-status"],queryFn:async()=>(await api.get("/admin/integrations/stripe/status")).data.data,staleTime:60000});
  const status=query.data;
  return <section className="rounded-2xl border border-line bg-canvas p-5 mb-5"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-lg">Cobros en línea con Stripe</h2><Button variant="outline" disabled={query.isFetching} onClick={()=>query.refetch()}>Comprobar</Button></div>
    {query.isPending?<p>Comprobando conexión…</p>:query.isError||!status?<p>No se pudo consultar el estado.</p>:<div className="mt-3 space-y-2 text-sm">
      <p>{status.ready?`Listo para cobrar · ${status.mode==="test"?"modo de prueba":"modo real"}`:"Configuración pendiente"}</p>
      <p>Clave: {status.keyConfigured?"configurada":"sin configurar"} · Conexión: {status.apiReachable?"correcta":"no disponible"}</p>
      <p>Notificaciones de pagos: {status.webhookEnabled&&status.webhookSecretConfigured?"configuradas":"pendientes"}</p>
      {!!status.missingEvents?.length&&<p>Eventos pendientes: {status.missingEvents.join(", ")}</p>}
      {status.lastProcessedAt&&<p>Último pago notificado: {new Date(status.lastProcessedAt).toLocaleString("es-MX")}</p>}
      {status.error&&<p>{status.error}</p>}
    </div>}
  </section>;
}
