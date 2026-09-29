import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Panel } from "./Panel";
import { formatDate } from "@/lib/format";
export function CreditHistory({userId}:{userId:string}) {
  const q=useQuery({queryKey:["credit-history",userId],queryFn:async()=>(await api.get(`/admin/users/${userId}/credit-history`)).data});
  const balance=(n:number|null)=>n===null?"Ilimitado":n;
  return <Panel className="p-5"><h2 className="font-bold">Movimientos de créditos</h2><p className="text-sm text-ink-muted">Movimientos registrados desde la activación de este historial.</p>
    {q.isLoading?<p>Cargando…</p>:q.isError?<button onClick={()=>q.refetch()}>No se pudo cargar. Reintentar</button>:q.data?.data?.length?<ul className="divide-y divide-line">{q.data.data.map((r:any)=><li key={r.id} className="py-3"><p>{r.planName} · {balance(r.oldValue)} → {balance(r.newValue)}</p><p className="text-sm text-ink-muted">{formatDate(r.createdAt)}</p></li>)}</ul>:<p className="mt-3">Aún no hay movimientos registrados.</p>}
  </Panel>;
}
