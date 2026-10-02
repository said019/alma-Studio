import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import type { CardReadiness } from "@/lib/mercadopago";

export function OrderActions({orderId, canChangePayment = true, external = false, onCardPayment}: {orderId: string; canChangePayment?: boolean; external?: boolean; onCardPayment?: () => void}) {
  const qc = useQueryClient();
  const {toast} = useToast();
  const {confirm, dialog} = useConfirm();
  const [externalUrl, setExternalUrl] = useState<string | null>(null);
  const config = useQuery<CardReadiness>({queryKey:["card-readiness"],queryFn:async()=>{const res=await api.get("/payments/card-readiness");return res.data.data??res.data;}});
  const mutation = useMutation({
    mutationFn:(action:string)=>api.post(`/orders/${orderId}/${action}`),
    onSuccess:({data},action)=>{
      const result = data.data ?? data;
      if (action === "pay-with-card") {
        if (result.mp_checkout_mode === "embedded" || result.mpCheckoutMode === "embedded") onCardPayment?.();
        else if (result.checkout_url) setExternalUrl(result.checkout_url);
        else toast({title:"Consulta el estado de esta orden antes de volver a pagar."});
      } else toast({title:"Orden cancelada"});
      void qc.invalidateQueries({queryKey:["my-orders"]});
      void qc.invalidateQueries({queryKey:["order-detail",orderId]});
    },
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo completar",variant:"destructive"}),
  });
  return <div className="flex flex-wrap items-center gap-3">{dialog}
    {canChangePayment && (config.data?.ready || external) && <Button disabled={mutation.isPending} onClick={()=>mutation.mutate("pay-with-card")}>{external ? "Consultar pago anual" : "Pagar esta orden con tarjeta"}</Button>}
    {externalUrl && <a href={externalUrl} className="inline-flex min-h-11 items-center font-bold text-accent-strong">Continuar pago en Mercado Pago</a>}
    <Button variant="outline" disabled={mutation.isPending} onClick={async()=>{
      if(await confirm({title:"¿Cancelar esta orden pendiente?",description:"Se libera el cupón apartado y podrás iniciar otra compra.",confirmLabel:"Cancelar orden"}))mutation.mutate("cancel");
    }}>Cancelar orden</Button>
  </div>;
}
