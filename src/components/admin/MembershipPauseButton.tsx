import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useConfirm } from "./ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useCanSeeFinance } from "@/lib/roles";
export function MembershipPauseButton({ membership }: { membership: { id: string; status: string } }) {
  const { promptText, confirm, dialog } = useConfirm();
  const { toast } = useToast(); const qc = useQueryClient(); const owner = useCanSeeFinance();
  const action = membership.status === "paused" ? "resume" : "pause";
  const mutation = useMutation({
    mutationFn: (reason?: string) => api.put(`/memberships/${membership.id}/${action}`, { reason }),
    onSuccess: ({ data }) => {
      for (const key of ["memberships", "client-memberships", "classes", "client", "class-roster-sheet"]) qc.invalidateQueries({ queryKey: [key] });
      toast({ title: action === "pause" ? "Membresía congelada" : "Membresía reactivada",
        description: action === "pause" ? `${data.cancelledBookings} reservas futuras canceladas; créditos restituidos.` : `Vigencia extendida ${data.pausedDays} días.` });
    },
    onError: (e: any) => toast({ title: e.response?.data?.message ?? "No se pudo actualizar", variant: "destructive" }),
  });
  if (!owner || !["active","paused"].includes(membership.status)) return null;
  return <>{dialog}<Button size="sm" variant="outline" disabled={mutation.isPending} onClick={async () => {
    if (action === "pause") {
      const reason = await promptText({ title: "Congelar membresía", description: "Se cancelarán sus reservas futuras y se devolverán los créditos de las reservas confirmadas. Al reactivarla se extenderá la vigencia por los días congelados.", minLength: 5, confirmLabel: "Congelar" });
      if (reason) mutation.mutate(reason);
    } else if (await confirm({ title: "Reactivar membresía", description: "Se sumarán a la vigencia los días que permaneció congelada.", confirmLabel: "Reactivar" })) mutation.mutate(undefined);
  }}>{action === "pause" ? "Congelar" : "Reactivar"}</Button></>;
}
