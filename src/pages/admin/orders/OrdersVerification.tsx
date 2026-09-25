import { useEffect, useId, useState, type ReactNode } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import StatusDot from "@/components/admin/StatusDot";
import CobrosTabs from "@/pages/admin/payments/CobrosTabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatMXN, formatDate } from "@/lib/format";
import { ZoomIn, CheckCircle2, Inbox, ImageOff, FileText, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/app/Lightbox";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const StatusPill = ({ status }: { status: string }) => {
  const label = STATUS_LABEL[status] ?? status;
  if (status === "pending_verification") return <span className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{label}</span>;
  if (status === "pending_payment") return <span className="whitespace-nowrap rounded-full border border-line px-2.5 py-1 text-[0.75rem] font-extrabold text-ink-muted">{label}</span>;
  if (status === "approved") return <StatusDot tone="success">{label}</StatusDot>;
  if (status === "rejected") return <StatusDot tone="danger">{label}</StatusDot>;
  return <StatusDot tone="muted">{label}</StatusDot>;
};

interface Order {
  id: string;
  userName: string;
  userId: string;
  totalAmount: number;
  status: string;
  createdAt: string;
  proofUrl?: string;
  planName?: string;
  notes?: string;
  paymentMethod?: string;
}

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", transfer: "Transferencia", card: "Tarjeta" };

const isPending = (o: Order) => o.status === "pending_verification" || o.status === "pending_payment";

// ── Breakpoint lg (maestro-detalle solo en desktop) ──────
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

// ── Comprobante (siempre visible en el detalle) ──────────
const ProofViewer = ({ order, onZoom }: { order: Order; onZoom: (src: string) => void }) => {
  if (!order.proofUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong/60 bg-canvas py-8 text-ink/55">
        <ImageOff size={18} strokeWidth={1.8} />
        <span className="text-xs">Sin comprobante adjunto</span>
      </div>
    );
  }
  if (order.proofUrl.endsWith(".pdf")) {
    return (
      <a
        href={order.proofUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-sm font-medium text-ink hover:border-line-strong transition-colors"
      >
        <FileText size={15} /> Ver comprobante PDF
      </a>
    );
  }
  return (
    <button
      type="button"
      className="relative group cursor-zoom-in w-full"
      onClick={() => onZoom(order.proofUrl!)}
    >
      <img
        src={order.proofUrl}
        alt="Comprobante de pago"
        className="max-h-72 w-full rounded-xl object-contain border border-line bg-canvas"
      />
      <span className="absolute inset-0 bg-inverse/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2 text-canvas text-sm">
        <ZoomIn size={20} /> Ver completo
      </span>
    </button>
  );
};

// ── Detalle de orden (panel persistente en lg+, dialog en móvil) ──
type OrderDetailProps = {
  order: Order;
  onZoom: (src: string) => void;
  onApprove: (id: string, notes: string) => void;
  onReject: (id: string, reason: string) => void;
  approving: boolean;
  rejecting: boolean;
};

const OrderDetail = ({ order, onZoom, onApprove, onReject, approving, rejecting }: OrderDetailProps) => {
  const [notes, setNotes] = useState("");
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");
  const uid = useId();
  const notesId = `${uid}-notes`;
  const reasonId = `${uid}-reason`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Orden #{order.id.slice(0, 8).toUpperCase()}</p>
        <StatusPill status={order.status} />
      </div>

      <PersonCell name={order.userName ?? order.userId} sub={METHOD_LABEL[order.paymentMethod ?? ""] ?? order.paymentMethod ?? undefined} size={44} />

      <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
        <div>
          {order.paymentMethod === "card" ? (
            <div className="rounded-xl border border-line-strong/50 bg-sunken/30 px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-ink">Pago con tarjeta (automático)</p>
              <p className="text-xs leading-relaxed text-ink/70">
                Stripe cobra y activa la membresía sola cuando la clienta completa el pago — no necesitas verificar nada.
                Si esta orden sigue en espera, la clienta no terminó el pago: puedes ignorarla o rechazarla para limpiarla.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/70 mb-2 block">
                Comprobante de pago
              </Label>
              <ProofViewer order={order} onZoom={onZoom} />
            </div>
          )}
        </div>
        <div>
          <div className="rounded-xl bg-accent-soft p-3.5">
            <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink">Monto a verificar</p>
            <p className="nums mt-1.5 font-display text-[1.75rem] font-semibold leading-none">{formatMXN(Number(order.totalAmount))}</p>
          </div>
          <dl className="mt-1.5">
            {[["Plan", order.planName ?? "—"], ["Método", METHOD_LABEL[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "—"], ["Fecha", formatDate(order.createdAt)]].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-t border-line py-2.5 first:border-t-0">
                <dt className="text-[13px] text-ink-muted">{k}</dt>
                <dd className="nums text-sm font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {isPending(order) && !rejectMode && (
        <>
          <div className="space-y-1">
            <Label htmlFor={notesId}>Notas internas (opcional)</Label>
            <Input
              id={notesId}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Solo visibles para el equipo…"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              variant="outline"
              className="border-danger text-danger"
              onClick={() => setRejectMode(true)}
              disabled={approving || rejecting}
            >
              <X size={16} aria-hidden="true" />
              Rechazar
            </Button>
            <Button onClick={() => onApprove(order.id, notes)} disabled={approving || rejecting}>
              <Check size={16} aria-hidden="true" />
              {approving ? "Aprobando…" : "Aprobar"}
            </Button>
          </div>
          <p className="text-[0.75rem] text-ink-muted">Si la rechazas, le avisamos a la clienta por email y WhatsApp con el motivo.</p>
        </>
      )}

      {isPending(order) && rejectMode && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-ink">Rechazar orden</p>
            <p className="text-xs text-ink/70 mt-0.5">
              Se notificará a la clienta por email y WhatsApp con el motivo.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={reasonId} className="text-ink/70">Motivo del rechazo *</Label>
            <Textarea
              id={reasonId}
              rows={3}
              placeholder="Ej: El monto no coincide con el comprobante, imagen borrosa…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-line-strong text-ink hover:bg-sunken" onClick={() => { setRejectMode(false); setReason(""); }} disabled={rejecting}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={!reason.trim() || rejecting}
              onClick={() => onReject(order.id, reason.trim())}
            >
              {rejecting ? "Rechazando…" : "Confirmar rechazo"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Maestro-detalle parametrizado (sustituye OrdersTable + MergedPendingTable) ──
type OrdersBoardProps = {
  sources: { url: string; queryKey: string[] }[];
  emptyTitle: string;
  emptyDescription: string;
  emptyIcon: ReactNode;
  /** Oculta órdenes de tarjeta (se cobran/activan solas con Stripe, no se verifican a mano). */
  hideCardOrders?: boolean;
};

const OrdersBoard = ({ sources, emptyTitle, emptyDescription, emptyIcon, hideCardOrders }: OrdersBoardProps) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const results = useQueries({
    queries: sources.map((s) => ({
      queryKey: s.queryKey,
      queryFn: async () => (await api.get(s.url)).data as { data: Order[] },
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const isError = results.some((r) => r.isError);
  const orders = results
    .flatMap((r) => (Array.isArray(r.data?.data) ? r.data!.data : []))
    .filter((o) => !(hideCardOrders && o.paymentMethod === "card"));

  const detailOrder = orders.find((o) => o.id === selectedId) ?? orders[0] ?? null;
  const closeDetail = () => { setMobileOpen(false); };

  // Aprobar/rechazar cambia lo que "Por verificar" cuenta en la pestaña de
  // Cobros y en la insignia de Bandeja (AdminLayout), ambos con estas llaves;
  // sin invalidarlas se quedan con el número viejo hasta 60 s (M1).
  const invalidateCobrosCounters = () => {
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
    qc.invalidateQueries({ queryKey: ["orders-pending"] });
  };

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.put(`/admin/orders/${id}/verify`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      invalidateCobrosCounters();
      toast({ title: "Orden aprobada" });
      closeDetail();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al aprobar", variant: "destructive" }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.put(`/admin/orders/${id}/reject`, { notes: reason, reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      invalidateCobrosCounters();
      toast({ title: "Orden rechazada, clienta notificada" });
      closeDetail();
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al rechazar", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="No pudimos cargar las órdenes"
        description="Revisa tu conexión y vuelve a intentarlo."
        onRetry={() => results.forEach((r) => r.refetch())}
      />
    );
  }

  if (!orders.length) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  const detailProps = detailOrder && {
    order: detailOrder,
    onZoom: (src: string) => setLightboxSrc(src),
    onApprove: (id: string, notes: string) => approveMutation.mutate({ id, notes }),
    onReject: (id: string, reason: string) => rejectMutation.mutate({ id, reason }),
    approving: approveMutation.isPending,
    rejecting: rejectMutation.isPending,
  };

  return (
    <>
      {lightboxSrc && <Lightbox src={lightboxSrc} alt="Comprobante" onClose={() => setLightboxSrc(null)} />}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:items-start lg:gap-6">
        {/* Lista */}
        <Panel className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clienta</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => {
                const active = isDesktop && detailOrder?.id === o.id;
                return (
                  <TableRow
                    key={o.id}
                    aria-selected={active}
                    className={cn("cursor-pointer", active && "bg-canvas shadow-[inset_3px_0_0_theme(colors.ink.DEFAULT)]")}
                    onClick={() => {
                      setSelectedId(o.id);
                      if (!isDesktop) setMobileOpen(true);
                    }}
                  >
                    <TableCell>
                      <PersonCell name={o.userName ?? o.userId} sub={METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "—"} />
                    </TableCell>
                    <TableCell className="nums text-right text-[15px] font-extrabold whitespace-nowrap">
                      {formatMXN(Number(o.totalAmount))}
                    </TableCell>
                    <TableCell><StatusPill status={o.status} /></TableCell>
                    <TableCell className="text-sm text-ink-muted nums whitespace-nowrap">{formatDate(o.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Panel>

        {/* Panel persistente (desktop): el comprobante siempre a la vista */}
        <aside aria-label="Detalle de la orden" className="hidden lg:block sticky top-24 rounded-2xl border border-line bg-surface p-6">
          {detailProps ? (
            <OrderDetail key={detailProps.order.id} {...detailProps} />
          ) : (
            <p className="text-sm text-ink-muted py-8 text-center">Selecciona una orden para revisarla</p>
          )}
        </aside>
      </div>

      {/* Detalle en móvil: dialog */}
      <Dialog open={mobileOpen && !isDesktop && !!detailProps} onOpenChange={(v) => !v && setMobileOpen(false)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de orden</DialogTitle>
          </DialogHeader>
          {detailProps && <OrderDetail key={`m-${detailProps.order.id}`} {...detailProps} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

const tabTriggerClass =
  "rounded-xl px-4 py-2 text-[13px] font-semibold text-ink/70 data-[state=active]:bg-sunken data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-line-strong";

const PENDING_SOURCES = [
  { url: "/admin/orders?status=pending_verification", queryKey: ["orders", "pending_verification"] },
  { url: "/admin/orders?status=pending_payment", queryKey: ["orders", "pending_payment"] },
];

const OrdersVerification = () => {
  // El mismo par de consultas que arma el tablero "Por verificar" (misma
  // llave: React Query las comparte, no duplica la petición). Se usa aquí
  // sólo para el contador de la pestaña (spec §5.9).
  const pendingResults = useQueries({
    queries: PENDING_SOURCES.map((s) => ({
      queryKey: s.queryKey,
      queryFn: async () => (await api.get(s.url)).data as { data: Order[] },
    })),
  });
  const pendingCount = pendingResults
    .flatMap((r) => (Array.isArray(r.data?.data) ? r.data!.data : []))
    .filter((o) => o.paymentMethod !== "card").length;

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Cobros · transferencias y efectivo"
            title="Verificar"
            subtitle="Compara cada monto con su comprobante antes de aprobar."
            actions={<CobrosTabs />}
          />
          <Tabs defaultValue="pending">
            <TabsList className="h-auto rounded-2xl border border-line bg-sunken p-1">
              <TabsTrigger value="pending" className={cn(tabTriggerClass, "gap-2")}>
                Por verificar
                {pendingCount > 0 && (
                  <span className="nums grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.75rem] font-extrabold leading-none text-ink">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="all" className={tabTriggerClass}>Todas</TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="mt-4">
              <OrdersBoard
                sources={PENDING_SOURCES}
                hideCardOrders
                emptyIcon={<CheckCircle2 size={20} strokeWidth={1.8} />}
                emptyTitle="Estás al día"
                emptyDescription="No hay transferencias ni efectivo esperando verificación. Los pagos con tarjeta se activan solos."
              />
            </TabsContent>
            <TabsContent value="all" className="mt-4">
              <OrdersBoard
                sources={[{ url: "/admin/orders", queryKey: ["orders", "all"] }]}
                emptyIcon={<Inbox size={20} strokeWidth={1.8} />}
                emptyTitle="Aún no hay órdenes"
                emptyDescription="Cuando una clienta suba un comprobante de pago, aparecerá aquí."
              />
            </TabsContent>
          </Tabs>
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default OrdersVerification;
