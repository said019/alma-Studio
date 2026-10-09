import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { notifyPaymentReturn, validOrderId } from '@/lib/paymentReturn';
export default function PaymentReturn() {
  const {orderId}=useParams();
  const valid=validOrderId(orderId);
  useEffect(()=>{if(valid) notifyPaymentReturn(orderId);},[orderId,valid]);
  return <main className="min-h-screen bg-canvas px-6 py-20 text-ink"><section className="mx-auto max-w-md space-y-6">
    <p className="text-sm font-bold tracking-widest">HIVE PILATES STUDIO</p>
    <h1 className="text-3xl font-bold">Vuelve a tu orden</h1>
    <p>Consulta en HIVE el estado confirmado de tu pago. Esta pantalla no confirma que se haya realizado un cobro.</p>
    <Link onClick={()=>{if(valid) notifyPaymentReturn(orderId);}} className="inline-flex min-h-12 items-center rounded-xl bg-accent px-6 font-bold text-accent-foreground" to={valid?`/app/orders/${orderId}`:'/app'}>Volver a HIVE</Link>
    <p className="text-sm text-ink-muted">Si pagaste desde la app instalada y este enlace abre el navegador, vuelve a HIVE desde su icono. El teléfono decide dónde abrir los enlaces; no siempre permite regresar automáticamente a la app.</p>
  </section></main>;
}
