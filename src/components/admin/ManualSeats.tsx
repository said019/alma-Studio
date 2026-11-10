import {useState} from 'react';
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import api from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
export function ManualSeats({classId}:{classId:string}) {
 const [name,setName]=useState('');const qc=useQueryClient();
 const {data}=useQuery({queryKey:['manual-seats',classId],queryFn:async()=>(await api.get(`/admin/classes/${classId}/manual-seats`)).data.data});
 const update=useMutation({mutationFn:(id?:string)=>id?api.delete(`/admin/classes/${classId}/manual-seats/${id}`):api.post(`/admin/classes/${classId}/manual-seats`,{name}),onSuccess:()=>{setName('');for(const k of ['manual-seats','classes','roster','class-roster-sheet','admin-classes-week'])qc.invalidateQueries({queryKey:[k]});}});
 return <section className="space-y-3 rounded-xl border border-line p-4"><h3 className="font-bold">Lugar manual</h3><p className="text-xs text-ink-muted">Ocupa un lugar sin vender un paquete ni descontar créditos. Puedes liberarlo después.</p><Input aria-label="Nombre del lugar manual" placeholder="Nombre o referencia (opcional)" value={name} onChange={e=>setName(e.target.value)} maxLength={150}/><Button disabled={update.isPending} onClick={()=>update.mutate(undefined)}>Ocupar un lugar</Button>{update.isError&&<p role="alert">{(update.error as any)?.response?.data?.message||'No se pudo guardar.'}</p>}{(data||[]).map((s:any)=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2"><span>{s.name}</span><Button variant="outline" disabled={update.isPending} onClick={()=>update.mutate(s.id)}>Liberar lugar</Button></div>)}</section>;
}
