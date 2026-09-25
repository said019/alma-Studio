import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import KpiStrip from "@/components/admin/KpiStrip";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDate, formatMXN } from "@/lib/format";
import CobrosTabs from "./CobrosTabs";
import { summarizePayments, type PaymentRow } from "./payments-summary";

const METHOD: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Payment = PaymentRow & { id: string; userName?: string; userId?: string };

/* Historial de cobros (spec §5.10): pasa de pestaña interna a ruta propia.
   El guardia va por fuera para que recepción no dispare /payments (403). */
export default function PaymentsHistoryPage() {
  return (
    <AuthGuard requiredRoles={["admin", "super_admin"]}>
      <PaymentsHistoryContent />
    </AuthGuard>
  );
}

function PaymentsHistoryContent() {
  const { data, isLoading, isError, refetch } = useQuery<{ data: Payment[] }>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });
  const payments = Array.isArray(data?.data) ? data!.data : [];
  const now = new Date();
  const s = summarizePayments(payments, now);
  const byMethod = Object.entries(s.byMethod)
    .map(([k, v]) => `${METHOD[k] ?? k} ${formatMXN(v)}`)
    .join(" · ") || "—";

  return (
    <AdminLayout>
      <AdminPage>
        <AdminPageHeader kicker="Cobros" title="Historial" subtitle="Órdenes aprobadas y membresías asignadas en mostrador." actions={<CobrosTabs />} />
        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[56px] w-full rounded-xl" />)}</div>
        ) : isError ? (
          <ErrorState title="No pudimos cargar el historial" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetch()} />
        ) : payments.length === 0 ? (
          <EmptyState icon={<History size={20} strokeWidth={1.8} />} title="Sin pagos registrados aún" description="Cuando cobres una membresía en mostrador, aparecerá aquí." />
        ) : (
          <>
            <KpiStrip items={[
              { label: "Esta semana", value: formatMXN(s.week.amount), hint: `${s.week.count} ${s.week.count === 1 ? "pago" : "pagos"}` },
              { label: MONTHS[now.getMonth()], value: formatMXN(s.month.amount), hint: `${s.month.count} ${s.month.count === 1 ? "pago" : "pagos"}` },
              { label: "Por método · mes", value: <span className="block font-sans text-sm font-bold leading-relaxed">{byMethod}</span> },
            ]} />
            <Panel className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clienta</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><PersonCell name={p.userName ?? p.userId ?? "—"} /></TableCell>
                      <TableCell className="nums text-ink-muted">{p.createdAt ? formatDate(p.createdAt) : "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{METHOD[p.method ?? ""] ?? p.method ?? "—"}</span>
                      </TableCell>
                      <TableCell className="nums text-right text-[15px] font-extrabold">{formatMXN(Number(p.total_amount ?? p.amount ?? 0))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </>
        )}
      </AdminPage>
    </AdminLayout>
  );
}
