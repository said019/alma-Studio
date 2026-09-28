import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import KpiStrip from "@/components/admin/KpiStrip";
import { Panel } from "@/components/admin/Panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

interface PartnerCheckin {
  id: string;
  status: string;
  method: string;
  created_at: string;
  user_name?: string | null;
  wellhub_id?: string | null;
  class_date?: string | null;
  class_name?: string | null;
  booking_status?: string | null;
}
interface SinCheckin { booking_id: string; user_name?: string | null; wellhub_id?: string | null; class_name?: string | null; class_date?: string | null }
interface Resumen { confirmed: number; pending: number; failed: number; booked: number; attended: number; noShow: number; unmatched: number }
type Respuesta = { data: PartnerCheckin[]; summary: Resumen; unmatched: SinCheckin[]; month: string };

const ESTADO: Record<string, string> = { confirmed: "Confirmado", pending: "Pendiente", failed: "Falló" };
const VARIANTE: Record<string, "default" | "outline" | "destructive"> = { confirmed: "default", pending: "outline", failed: "destructive" };
const METODO: Record<string, string> = { automated: "Automático", manual: "Manual" };
const EN_ESTUDIO: Record<string, string> = { checked_in: "Asistió", no_show: "Falta", confirmed: "Reservada", cancelled: "Cancelada", waitlist: "Lista de espera" };

/* Fecha de la clase ("AAAA-MM-DD"): con formatDate directo corre un día en
   CDMX (new Date("AAAA-MM-DD") se interpreta en UTC). parseISO sí la ancla en
   la zona local (auditoría 2026-09-27, ronda de rulings del controlador, R7). */
const fechaClase = (d?: string | null) => (d ? formatDate(parseISO(d)) : "");

/* Check-ins de Wellhub (auditoría 2026-09-27, P1-9): sólo la dueña. Concilia,
   mes por mes, lo que confirmó Wellhub contra la asistencia en el estudio. El
   guardia va por fuera para que recepción no pida /partners/checkins (403). */
export default function PartnerCheckinsPage() {
  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <AdminLayout>
        <PartnerCheckinsContent />
      </AdminLayout>
    </AuthGuard>
  );
}

function PartnerCheckinsContent() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mes, setMes] = useState(() => format(new Date(), "yyyy-MM"));
  const q = useQuery<Respuesta>({
    queryKey: ["partner-checkins", mes],
    queryFn: async () => (await api.get(`/partners/checkins?month=${mes}`)).data,
  });
  const rows = Array.isArray(q.data?.data) ? q.data!.data : [];
  const sinCheckin = Array.isArray(q.data?.unmatched) ? q.data!.unmatched : [];
  const s = q.data?.summary;
  const confirmar = useMutation({
    mutationFn: (id: string) => api.post(`/partners/checkins/${id}/confirm`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["partner-checkins"] }); toast({ title: "Check-in confirmado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo confirmar", variant: "destructive" }),
  });
  const errorMsg = (q.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message;

  return (
    <AdminPage>
      <AdminPageHeader
        kicker="Sistema · sólo dueña"
        title="Check-ins Wellhub"
        subtitle="Concilia lo que confirmó Wellhub contra la asistencia en el estudio, mes por mes."
      />
      <div className="flex max-w-[220px] flex-col gap-1.5">
        <Label htmlFor="wh-mes">Mes</Label>
        <Input id="wh-mes" type="month" value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
      </div>

      {q.isError ? (
        <ErrorState title="No pudimos cargar los check-ins" description={errorMsg ?? "Revisa tu conexión y vuelve a intentarlo."} onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2"><SkeletonRow /><SkeletonRow /></div>
      ) : (
        <>
          <KpiStrip items={[
            { label: "Confirmados por Wellhub", value: String(s?.confirmed ?? 0), hint: `${s?.pending ?? 0} pendientes · ${s?.failed ?? 0} fallidos` },
            { label: "Reservas de Wellhub", value: String(s?.booked ?? 0) },
            { label: "Asistieron", value: String(s?.attended ?? 0) },
            { label: "Faltas", value: String(s?.noShow ?? 0) },
            { label: "Asistencias sin check-in", value: String(s?.unmatched ?? 0), hint: "Vinieron, pero Wellhub no confirmó la visita" },
          ]} />

          <Panel aria-label="Check-ins del mes" className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Socia</TableHead>
                  <TableHead>Clase</TableHead>
                  <TableHead>Wellhub</TableHead>
                  <TableHead>Método</TableHead>
                  <TableHead>En el estudio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-ink-muted">Sin check-ins de Wellhub este mes.</TableCell></TableRow>
                ) : rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-bold text-ink">{c.user_name ?? c.wellhub_id ?? "—"}</TableCell>
                    <TableCell className="text-ink-muted">{c.class_name ?? "—"}{c.class_date ? ` · ${fechaClase(c.class_date)}` : ""}</TableCell>
                    <TableCell><Badge variant={VARIANTE[c.status] ?? "outline"}>{ESTADO[c.status] ?? c.status}</Badge></TableCell>
                    <TableCell className="text-sm text-ink-muted">{METODO[c.method] ?? c.method}</TableCell>
                    <TableCell className="text-sm text-ink">{c.booking_status ? EN_ESTUDIO[c.booking_status] ?? c.booking_status : "Sin reserva"}</TableCell>
                    <TableCell className="nums text-sm text-ink-muted">{formatDate(c.created_at)}</TableCell>
                    <TableCell>
                      {c.status !== "confirmed" && (
                        <Button size="sm" variant="outline" onClick={() => confirmar.mutate(c.id)} disabled={confirmar.isPending}>
                          Confirmar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>

          {sinCheckin.length > 0 && (
            <Panel aria-label="Asistencias sin check-in de Wellhub" className="p-5">
              <h2 className="text-[15px] font-extrabold text-ink">Asistencias sin check-in de Wellhub</h2>
              <p className="mt-1 text-[13px] text-ink-muted">Vinieron por Wellhub y pasaron lista, pero Wellhub no confirmó la visita: revísalas con Wellhub.</p>
              <ul className="mt-3 divide-y divide-line">
                {sinCheckin.map((u) => (
                  <li key={u.booking_id} className="py-2.5 text-sm">
                    <span className="font-bold text-ink">{u.user_name ?? u.wellhub_id ?? "—"}</span>
                    <span className="text-ink-muted"> · {u.class_name ?? "Clase"}{u.class_date ? ` · ${fechaClase(u.class_date)}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </AdminPage>
  );
}
