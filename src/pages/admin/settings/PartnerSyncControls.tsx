import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import TotalpassCheckinControls from "./TotalpassCheckinControls";
type State = {
  sync_enabled: boolean;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_summary: Record<string, number | string> | null;
  issues: Array<{
    code: string;
    detail: { title?: string; date?: string; time?: string };
  }>;
};
export default function PartnerSyncControls({
  configured,
}: {
  configured: boolean;
}) {
  const provider = "totalpass";
  const url = `/admin/partner-integrations/${provider}/runtime`,
    qc = useQueryClient(),
    { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const query = useQuery<State>({
    queryKey: ["partner-runtime", provider],
    queryFn: async () => (await api.get(url)).data.data,
    refetchInterval: 15000,
  });
  async function change(enabled: boolean) {
    setBusy(true);
    try {
      const result = await api.post(url, { enabled });
      toast({ title: result.data.message });
      await qc.invalidateQueries({ queryKey: ["partner-runtime", provider] });
      await qc.invalidateQueries({ queryKey: ["partner-config", provider] });
    } catch (e: any) {
      toast({
        title:
          e.response?.data?.message || "No se pudo cambiar la sincronización",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  if (query.isLoading) return <p>Cargando sincronización…</p>;
  if (query.isError)
    return (
      <p role="alert">
        No se pudo consultar la sincronización.{" "}
        <Button variant="outline" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </p>
    );
  const data = query.data!;
  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="font-semibold">Sincronización de clases y reservas</h3>
      {configured && <TotalpassCheckinControls />}
      <p className="text-sm">
        {data.sync_enabled ? "Automática activada" : "Pausada"} ·{" "}
        {data.last_sync_status === "running"
          ? "Sincronización en curso"
          : data.last_sync_status === "success"
            ? "Última ejecución correcta"
            : data.last_sync_status === "attention"
              ? "Hay clases o reservas que requieren revisión"
              : data.last_sync_status === "failed"
                ? "La última ejecución falló"
                : "Pendiente de primera ejecución"}
      </p>
      {data.last_sync_at && (
        <p className="text-xs text-muted-foreground">
          Última ejecución:{" "}
          {new Date(data.last_sync_at).toLocaleString("es-MX", {
            timeZone: "America/Mexico_City",
          })}
        </p>
      )}
      {data.last_sync_summary && (
        <p className="text-sm">
          Vinculadas: {data.last_sync_summary.mapped ?? 0} · Publicadas:{" "}
          {data.last_sync_summary.published ?? 0} · Actualizadas:{" "}
          {data.last_sync_summary.updated ?? 0} · Reservas revisadas:{" "}
          {data.last_sync_summary.imported ?? 0}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy || !configured} onClick={() => change(true)}>
          {data.sync_enabled ? "Sincronizar ahora" : "Activar sincronización"}
        </Button>
        {data.sync_enabled && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => change(false)}
          >
            Pausar
          </Button>
        )}
      </div>
      {data.issues?.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm">
            Ver pendientes ({data.issues.length})
          </summary>
          <ul className="mt-2 space-y-2 text-xs">
            {data.issues.map((issue, i) => (
              <li key={i}>
                {[issue.detail.title, issue.detail.date, issue.detail.time]
                  .filter(Boolean)
                  .join(" · ")}{" "}
                — {issue.code}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
