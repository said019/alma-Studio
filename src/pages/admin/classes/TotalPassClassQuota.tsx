import { useMutation, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type Quota = { quota: number; capacity: number; booked: number; pending: boolean; syncing: boolean };

export function TotalPassClassQuota({ classId }: { classId: string }) {
  const path = `/admin/classes/${classId}/platforms/totalpass/quota`;
  const { toast } = useToast();
  const state = useQuery({
    queryKey: ["totalpass-quota", classId],
    queryFn: async () => (await api.get<{ data: Quota | null }>(path)).data.data,
    staleTime: 0,
  });
  const save = useMutation({
    mutationFn: (change: { quota: number; expectedQuota: number }) => api.put(path, change),
    onSuccess: () => toast({ title: "Cupo de TotalPass guardado" }),
    onError: error => toast({ title: isAxiosError(error) ? error.response?.data?.message ?? "Error al guardar el cupo" : "Error al guardar el cupo", variant: "destructive" }),
    onSettled: async () => { await state.refetch(); },
  });
  if (state.isError) return <Button variant="outline" onClick={() => state.refetch()}>Reintentar carga del cupo TotalPass</Button>;
  const data = state.data;
  if (!data) return null;
  const limit = Math.min(data.capacity, data.quota);
  const busy = save.isPending || state.isFetching || data.pending;
  const adjust = (delta: number) => save.mutate({ quota: limit + delta, expectedQuota: data.quota });

  return (
    <section aria-label="Lugares de TotalPass" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <h3 className="font-semibold">TotalPass</h3>
        <p className="text-sm text-ink-muted">Cupo asignado <strong className="nums text-ink">{limit}</strong> · Reservados {data.booked}</p>
        {data.pending ? <p className="text-xs">Clase pendiente de vincular</p> : !data.syncing && <p className="text-xs">Sincronización pausada</p>}
      </div>
      <div className="flex gap-1">
        <Button type="button" size="icon" variant="outline" aria-label="Quitar un lugar de TotalPass" disabled={busy || limit <= data.booked} onClick={() => adjust(-1)}>−</Button>
        <Button type="button" size="icon" variant="outline" aria-label="Agregar un lugar de TotalPass" disabled={busy || limit >= data.capacity} onClick={() => adjust(1)}>+</Button>
      </div>
    </section>
  );
}
