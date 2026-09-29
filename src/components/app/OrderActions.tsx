import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
export function OrderActions({orderId}:{orderId:string}) {
  const qc=useQueryClient();const {toast}=useToast();const {confirm,dialog}=useConfirm();
  const config=useQuery({queryKey:["public-payment-config"],queryFn:async()=>(await api.get("/public/payment-config")).data});
  const mutation=useMutation({
    mutationFn:(action:string)=>api.post(`/orders/${orderId}/${action}`),
    onSuccess:({data})=>{
      if(data.data?.checkout_url){window.location.assign(data.data.checkout_url);return;}
      qc.invalidateQueries({queryKey:["my-orders"]});qc.invalidateQueries({queryKey:["order-detail",orderId]});toast({title:"Orden cancelada"});
    },
    onError:(e:any)=>toast({title:e.response?.data?.message??"No se pudo completar",variant:"destructive"}),
  });
  return <div className="flex flex-wrap gap-3">{dialog}
    {config.data?.data?.cardEnabled&&<Button disabled={mutation.isPending} onClick={()=>mutation.mutate("pay-with-card")}>Pagar con tarjeta</Button>}
    <Button variant="outline" disabled={mutation.isPending} onClick={async()=>{
      if(await confirm({title:"¿Cancelar esta orden pendiente?",description:"Se libera el cupón apartado y podrás iniciar otra compra.",confirmLabel:"Cancelar orden"}))mutation.mutate("cancel");
    }}>Cancelar orden</Button>
  </div>;
}
