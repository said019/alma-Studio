import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import KpiStrip from "@/components/admin/KpiStrip";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDate, formatMXN } from "@/lib/format";
import { cn } from "@/lib/utils";
import CobrosTabs from "./CobrosTabs";
import { summarizePayments, type PaymentRow } from "./payments-summary";
import RefundDialog from "./RefundDialog";
import MercadoPagoReview from "./MercadoPagoReview";
import { REFUND_METHOD_LABEL, type RefundablePayment } from "./refund-math";

const METHOD: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type Payment = PaymentRow & RefundablePayment & {
  id: string; userId?: string; source?: "order" | "membership" | "refund"; refundStatus?: string | null; channel?: string | null;
};

// Se puede reembolsar una orden cobrada a la que le queda algo por devolver
// (auditoría 2026-09-27, P1-12). Las membresías viejas sin orden, los
// reembolsos y las órdenes de Wellhub (se concilian con Wellhub) no.
const puedeReembolsar = (p: Payment) =>
  p.source === "order" && p.refundStatus !== "refunded" && Number(p.total_amount ?? 0) > 0
  && p.method !== "wellhub" && p.channel !== "wellhub";

const estadoDePago = (p: Payment): string => {
  if (p.source === "refund") return "Reembolso";
  if (p.refundStatus === "refunded") return "Reembolsado";
  if (p.refundStatus === "partially_refunded") return `Reembolso parcial · ${formatMXN(Number(p.refundedAmount ?? 0))}`;
  return "Cobrado";
};

// En una fila de reembolso, "card" es la terminal (así lo registra el diálogo).
const metodoDe = (p: Payment): string => {
  const m = p.method ?? "";
  if (p.source === "refund" && m in REFUND_METHOD_LABEL) return REFUND_METHOD_LABEL[m as keyof typeof REFUND_METHOD_LABEL];
  return METHOD[m] ?? p.method ?? "—";
};

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
  const [offset, setOffset] = useState(0);
  const { data, isLoading, isError, refetch } = useQuery<{ data: Payment[]; summary?: ReturnType<typeof summarizePayments>; pagination?: {limit:number;offset:number;totalCount:number;hasMore:boolean} }>({
    queryKey: ["payments", offset],
    queryFn: async () => (await api.get(offset ? `/payments?offset=${offset}` : "/payments")).data,
  });
  const payments = Array.isArray(data?.data) ? data!.data : [];
  const [reembolso, setReembolso] = useState<Payment | null>(null);
  const now = new Date();
  const s = data?.summary ?? summarizePayments(payments, now);
  const byMethod = Object.entries(s.byMethod)
    .map(([k, v]) => `${METHOD[k] ?? k} ${formatMXN(v)}`)
    .join(" · ") || "—";

  return (
    <AdminLayout>
      <AdminPage>
        <AdminPageHeader kicker="Cobros" title="Historial" subtitle="Órdenes aprobadas, membresías asignadas en mostrador y reembolsos." actions={<CobrosTabs />} />
        <MercadoPagoReview />
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
              ...(s.refunds.count > 0
                ? [{ label: `Reembolsos · ${MONTHS[now.getMonth()]}`, value: formatMXN(s.refunds.amount), hint: `${s.refunds.count} ${s.refunds.count === 1 ? "reembolso" : "reembolsos"}` }]
                : []),
            ]} />
            <Panel className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead><span className="sr-only">Acciones</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell><PersonCell name={p.userName ?? p.userId ?? "—"} /></TableCell>
                      <TableCell className="nums text-ink-muted">{p.createdAt ? formatDate(p.createdAt) : "—"}</TableCell>
                      <TableCell>
                        <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{metodoDe(p)}</span>
                      </TableCell>
                      <TableCell>
                        <span className={p.source === "refund" || p.refundStatus ? "rounded-full bg-danger/10 px-2.5 py-1 text-[0.75rem] font-extrabold text-danger" : "text-[13px] text-ink-muted"}>
                          {estadoDePago(p)}
                        </span>
                      </TableCell>
                      <TableCell className={cn("nums text-right text-[15px] font-extrabold", Number(p.total_amount ?? 0) < 0 && "text-danger")}>{formatMXN(Number(p.total_amount ?? p.amount ?? 0))}</TableCell>
                      <TableCell className="text-right">
                        {puedeReembolsar(p) && (
                          <Button size="sm" variant="outline" aria-label={`Reembolsar el pago de ${p.userName ?? "el usuario"}`} onClick={() => setReembolso(p)}>
                            Reembolsar
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {data?.pagination && <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-3 border-t p-4">
                <Button variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-data.pagination!.limit))}>Anterior</Button>
                <span className="text-sm">{offset+1}–{Math.min(offset+payments.length,data.pagination.totalCount)} de {data.pagination.totalCount} movimientos</span>
                <Button variant="outline" disabled={!data.pagination.hasMore} onClick={()=>setOffset(offset+data.pagination!.limit)}>Siguiente</Button>
              </nav>}
            </Panel>
          </>
        )}
        <RefundDialog payment={reembolso} onClose={() => setReembolso(null)} />
      </AdminPage>
    </AdminLayout>
  );
}
