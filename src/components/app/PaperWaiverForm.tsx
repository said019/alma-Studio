import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import api from '@/lib/api';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
export function PaperWaiverForm({userId,name,onClose,onSigned,onBack}:{userId:string;name:string;onClose:()=>void;onSigned:()=>void;onBack:()=>void}){
 const [signedOn,setSignedOn]=useState('');const [reference,setReference]=useState('');const [confirmed,setConfirmed]=useState(false);const qc=useQueryClient();
 const save=useMutation({mutationFn:()=>api.post(`/admin/users/${userId}/waiver/paper`,{signedOn,reference,confirmed}),onSuccess:()=>{void qc.invalidateQueries({queryKey:['admin-waiver',userId]});void qc.invalidateQueries({queryKey:['client',userId]});onSigned();}});
 return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-canvas/90 p-4"><section role="dialog" aria-modal="true" aria-labelledby="paper-title" className="max-h-[90dvh] w-full max-w-xl space-y-5 overflow-auto rounded-2xl border border-line bg-surface p-6 text-ink">
 <h2 id="paper-title" className="text-xl font-bold">Registrar responsiva firmada en papel</h2><p>{name}</p><p className="text-sm">Usa esta opción solo si el usuario ya firmó el documento físico. Conserva el original en recepción; no necesita volver a dibujar su firma.</p>
 <Label htmlFor="paper-date">Fecha de firma del documento</Label><Input id="paper-date" type="date" value={signedOn} onChange={e=>setSignedOn(e.target.value)}/>
 <Label htmlFor="paper-ref">Dónde se conserva el original / folio</Label><Input id="paper-ref" maxLength={500} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Carpeta de responsivas, folio 123"/>
 <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmo que recibí y conservo la responsiva firmada por este usuario.</label>
 {save.isError&&<p role="alert">{(save.error as any)?.response?.data?.message||'No se pudo guardar. Intenta de nuevo.'}</p>}
 <div className="flex flex-wrap gap-3"><Button variant="ghost" disabled={save.isPending} onClick={onBack}>Firma en pantalla</Button><Button variant="ghost" disabled={save.isPending} onClick={onClose}>Cancelar</Button><Button disabled={!signedOn||reference.trim().length<5||!confirmed||save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Guardando…':'Registrar documento firmado'}</Button></div>
 </section></div>;
}
