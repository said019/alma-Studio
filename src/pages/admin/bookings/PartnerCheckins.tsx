import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { WELLHUB } from "@/lib/wellhubBrand";

interface PartnerCheckin {
  id: string;
  status: string;
  method: string;
  validated_at?: string;
  created_at: string;
  channel: string;
  user_name?: string;
  wellhub_id?: string;
  class_date?: string;
  class_name?: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  confirmed: "default",
  pending: "outline",
  failed: "destructive",
};

const PartnerCheckins = () => {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ data: PartnerCheckin[] }>({
    queryKey: ["partner-checkins"],
    queryFn: async () => (await api.get("/partners/checkins")).data,
  });
  const rows = Array.isArray(data?.data) ? data.data : [];

  const confirm = useMutation({
    mutationFn: (id: string) => api.post(`/partners/checkins/${id}/confirm`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-checkins"] }); toast({ title: "Check-in confirmado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error", variant: "destructive" }),
  });

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <div className="mb-6 flex items-center gap-2">
            <span className="rounded-md px-2 py-1 text-xs font-bold tracking-tight" style={{ backgroundColor: WELLHUB.yellow, color: WELLHUB.ink }}>Wellhub</span>
            <h1 className="admin-title font-semibold text-alma-ink">Check-ins de convenio</h1>
          </div>
          <div className="overflow-hidden rounded-xl border border-alma-hairline bg-alma-mist">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socio</TableHead>
                  <TableHead>Clase</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-alma-ink/60">Cargando…</TableCell></TableRow>
                ) : rows.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-alma-ink/60">Aún no hay check-ins de convenio.</TableCell></TableRow>
                ) : rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-alma-ink">{c.user_name ?? c.wellhub_id ?? "—"}</TableCell>
                    <TableCell>{c.class_name ?? "—"}{c.class_date ? ` · ${formatDate(c.class_date)}` : ""}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[c.status] ?? "outline"}>{c.status}</Badge></TableCell>
                    <TableCell className="text-alma-ink/70 text-sm">{c.method}</TableCell>
                    <TableCell className="nums text-sm text-alma-ink/70">{formatDate(c.created_at)}</TableCell>
                    <TableCell>
                      {c.status !== "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => confirm.mutate(c.id)} disabled={confirm.isPending}>
                          Confirmar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default PartnerCheckins;
