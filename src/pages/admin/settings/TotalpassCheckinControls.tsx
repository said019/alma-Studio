import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
type Status = {
  registered: boolean;
  verifiedAt: string | null;
  events: { state: string; count: number; last_received: string }[];
};
export default function TotalpassCheckinControls() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const query = useQuery<Status>({
    queryKey: ["totalpass-checkins"],
    queryFn: async () =>
      (await api.get("/admin/partner-integrations/totalpass/checkins")).data
        .data,
    refetchInterval: 15000,
  });
  const data = query.data;
  const received = data?.events.reduce((sum, e) => sum + e.count, 0) ?? 0;
  const matched = data?.events.find((e) => e.state === "matched")?.count ?? 0;
  const review =
    data?.events
      .filter((e) => ["unmatched", "uncertain", "rejected"].includes(e.state))
      .reduce((sum, e) => sum + e.count, 0) ?? 0;
  async function register() {
    setBusy(true);
    try {
      await api.post("/admin/partner-integrations/totalpass/checkins", {});
      await query.refetch();
      toast({ title: "Check-ins conectados a HIVE" });
    } catch (e: any) {
      toast({
        title: "No se pudo verificar la conexión de check-ins",
        description: e.response?.data?.message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border p-3 space-y-2">
      <h4 className="font-medium">Check-ins de TotalPass</h4>
      <p className="text-sm">
        {query.isError
          ? "No se pudo consultar la conexión."
          : query.isLoading
            ? "Consultando conexión…"
            : data?.registered
              ? "Conexión exclusiva de HIVE registrada"
              : "Pendiente de conectar a HIVE"}
      </p>
      {data && (
        <p className="text-xs">
          Recibidos: {received} · Asistencias vinculadas: {matched} · Por
          revisar: {review}
        </p>
      )}
      <Button variant="outline" disabled={busy} onClick={register}>
        {busy
          ? "Verificando…"
          : data?.registered
            ? "Verificar conexión"
            : "Conectar check-ins"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Solo se registra asistencia después de confirmar el check-in con
        TotalPass y encontrar una reserva única de esta plataforma. Si la
        reserva aún no llega, se vuelve a buscar automáticamente.
      </p>
    </div>
  );
}
