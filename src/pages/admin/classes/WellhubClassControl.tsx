import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

// Control por clase para publicar/despublicar a Wellhub con cupo + mapear el
// slot externo. Se embebe en el sheet de la clase del calendario.
export function WellhubClassControl({ classId }: { classId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["wellhub-class-status", classId],
    queryFn: async () => (await api.get(`/partners/wellhub/class-status/${classId}`)).data,
  });
  const status = data?.data;
  const [quota, setQuota] = useState("");
  const [slot, setSlot] = useState("");
  useEffect(() => {
    if (status) { setQuota(String(status.maxSpots ?? "")); setSlot(status.externalSlotId ?? ""); }
  }, [status]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wellhub-class-status", classId] });
  const publish = useMutation({
    mutationFn: () => api.post(`/partners/wellhub/publish/${classId}`, { quota: Number(quota), externalSlotId: slot || null }),
    onSuccess: () => { invalidate(); toast({ title: "Publicada a Wellhub" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error", variant: "destructive" }),
  });
  const unpublish = useMutation({
    mutationFn: () => api.post(`/partners/wellhub/unpublish/${classId}`),
    onSuccess: () => { invalidate(); toast({ title: "Despublicada de Wellhub" }); },
  });

  return (
    <div className="rounded-lg border border-alma-hairline bg-alma-mist p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-alma-ink">Wellhub</span>
        {status?.published
          ? <span className="text-xs text-alma-olive">Publicada · {status.bookedSpots}/{status.maxSpots}</span>
          : <span className="text-xs text-alma-ink/50">No publicada</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Cupo" type="number" value={quota} onChange={(e) => setQuota(e.target.value)} />
        <Input placeholder="Slot ID (Wellhub)" value={slot} onChange={(e) => setSlot(e.target.value)} />
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending || !quota}>
          {status?.published ? "Actualizar" : "Publicar"}
        </Button>
        {status?.published && (
          <Button size="sm" variant="outline" onClick={() => unpublish.mutate()} disabled={unpublish.isPending}>
            Despublicar
          </Button>
        )}
      </div>
    </div>
  );
}
