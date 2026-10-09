import {useQuery} from '@tanstack/react-query';
import api from '@/lib/api';
export default function MercadoPagoReview(){
 const {data,isError}=useQuery({queryKey:['mp-payment-reviews'],queryFn:async()=>
   (await api.get('/admin/payments/mercadopago-review')).data.data,refetchInterval:60000});
 const reviews=Array.isArray(data?.reviews)?data.reviews:[];
 const errors=Array.isArray(data?.syncErrors)?data.syncErrors:[];
 if(isError)return <p role="alert" className="text-sm">No se pudo consultar la conciliación de Mercado Pago. Reintenta antes de resolver un pago pendiente.</p>;
 if(!reviews.length&&!errors.length)return null;
 return <section className="space-y-2 rounded-xl border border-line p-4" aria-label="Pagos por revisar">
  <h2 className="font-semibold">Mercado Pago: movimientos por revisar</h2>
  <p className="text-sm text-ink-muted">Consulta la operación en Mercado Pago antes de cobrar de nuevo o devolver dinero. Los movimientos adicionales no activan otro paquete ni se reembolsan automáticamente.</p>
  {reviews.map((r:any)=><p key={`${r.order_id}:${r.payment_id}`} className="text-sm">{r.order_number||r.order_id} · Pago {r.payment_id} · {r.reason}</p>)}
  {errors.map((r:any)=><p key={r.id} className="text-sm">{r.order_number||r.id} · {r.mp_sync_error}</p>)}
 </section>;
}
