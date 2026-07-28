import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { WELLHUB } from "@/lib/wellhubBrand";

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
  useEffect(() => {
    if (status) setQuota(String(status.maxSpots ?? ""));
  }, [status]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wellhub-class-status", classId] });
  const publish = useMutation({
    mutationFn: () => api.post(`/partners/wellhub/publish/${classId}`, { quota: Number(quota) }),
    onSuccess: () => { invalidate(); toast({ title: "Publicada a Wellhub" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error", variant: "destructive" }),
  });
  const unpublish = useMutation({
    mutationFn: () => api.post(`/partners/wellhub/unpublish/${classId}`),
    onSuccess: () => { invalidate(); toast({ title: "Despublicada de Wellhub" }); },
  });

  return (
    <div
      className="rounded-lg p-3 text-sm"
      style={{ backgroundColor: WELLHUB.soft, border: `1px solid ${WELLHUB.primary}`, borderLeft: `4px solid ${WELLHUB.primary}` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 font-bold tracking-tight" style={{ color: WELLHUB.ink }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WELLHUB.primary }} />
          Wellhub
        </span>
        {status?.published ? (
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: WELLHUB.primary, color: WELLHUB.on }}>
            Publicada · {status.bookedSpots}/{status.maxSpots}
          </span>
        ) : (
          <span className="text-xs" style={{ color: WELLHUB.ink, opacity: 0.5 }}>No publicada</span>
        )}
      </div>
      <div>
        <Input placeholder="Cupo para Wellhub" type="number" value={quota} onChange={(e) => setQuota(e.target.value)} />
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={() => publish.mutate()}
          disabled={publish.isPending || !quota}
          className="hover:opacity-90"
          style={{ backgroundColor: WELLHUB.primary, color: WELLHUB.on, fontWeight: 600 }}
        >
          {status?.published ? "Actualizar" : "Publicar"}
        </Button>
        {status?.published && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => unpublish.mutate()}
            disabled={unpublish.isPending}
            style={{ borderColor: WELLHUB.primary, color: WELLHUB.ink }}
          >
            Despublicar
          </Button>
        )}
      </div>
    </div>
  );
}
