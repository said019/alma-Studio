import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Panel } from "./Panel";
const days=["","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
export function OccupancyBySlot() {
  const query=useQuery({queryKey:["occupancy-by-slot"],queryFn:async()=>(await api.get("/reports/occupancy-by-slot?weeks=4")).data});
  return <Panel className="p-5"><h2 className="text-lg font-bold">Ocupación por horario</h2><p className="text-sm text-ink-muted">Últimas cuatro semanas · lugares reservados frente al cupo disponible</p>
    {query.isLoading?<p>Cargando…</p>:query.isError?<button onClick={()=>query.refetch()}>No se pudo cargar. Reintentar</button>:query.data?.data?.slots?.length?
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{query.data.data.slots.map((s:any)=><div key={s.dow+s.slot} className="rounded-xl border border-line p-3"><p className="font-semibold">{days[s.dow]} · {s.slot}</p><p>{s.booked}/{s.seats} lugares · {s.occupancy??"—"}%</p><p className="text-sm text-ink-muted">{s.classes} clases</p></div>)}</div>:<p className="mt-4">Aún no hay clases en este periodo.</p>}
  </Panel>;
}
