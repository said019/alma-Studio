import { useEffect, useState, type ReactNode } from "react";
import { useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
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
import { ZoomIn, CheckCircle2, Inbox, ImageOff, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/app/Lightbox";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const STATUS_PILL: Record<string, string> = {
  pending_payment: "bg-alma-oat/60 text-alma-ink border-alma-sandstone/50",
  pending_verification: "bg-alma-oat/60 text-alma-ink border-alma-sandstone/50",
  approved: "bg-alma-olive/10 text-alma-olive border-alma-olive/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  cancelled: "bg-alma-mist text-alma-ink/55 border-alma-hairline",
};

const StatusPill = ({ status }: { status: string }) => (
  <span className={cn(
    "inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap",
    STATUS_PILL[status] ?? "bg-alma-mist text-alma-ink/55 border-alma-hairline",
  )}>
    {STATUS_LABEL[status] ?? status}
  </span>
);

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
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-alma-sandstone/60 bg-alma-canvas py-8 text-alma-ink/55">
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
        className="flex items-center gap-2 rounded-xl border border-alma-hairline bg-alma-canvas px-4 py-3 text-sm font-medium text-alma-berry hover:border-alma-sandstone transition-colors"
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
        className="max-h-72 w-full rounded-xl object-contain border border-alma-hairline bg-alma-canvas"
      />
      <span className="absolute inset-0 bg-alma-ink-deep/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center gap-2 text-alma-canvas text-sm">
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/70 nums">
          Orden #{order.id.slice(0, 8)}
        </p>
        <StatusPill status={order.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-alma-ink/55">Clienta</span>
          <span className="font-semibold text-alma-ink text-right truncate">{order.userName ?? order.userId}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-alma-ink/55">Plan</span>
          <span className="font-medium text-alma-ink text-right truncate">{order.planName ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-alma-ink/55">Método</span>
          <span className="font-medium text-alma-ink">{METHOD_LABEL[order.paymentMethod ?? ""] ?? order.paymentMethod ?? "—"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-alma-ink/55">Fecha</span>
          <span className="font-medium text-alma-ink nums">{formatDate(order.createdAt)}</span>
        </div>
      </div>

      {/* Monto destacado: la tarea es compararlo contra el comprobante */}
      <div className="rounded-xl bg-alma-oat/50 border border-alma-sandstone/50 px-4 py-3">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">Monto a verificar</p>
        <p className="text-2xl font-semibold text-alma-ink nums mt-0.5">{formatMXN(Number(order.totalAmount))}</p>
      </div>

      {order.paymentMethod === "card" ? (
        <div className="rounded-xl border border-alma-sandstone/50 bg-alma-oat/30 px-4 py-3 space-y-1">
          <p className="text-sm font-semibold text-alma-ink">Pago con tarjeta (automático)</p>
          <p className="text-xs leading-relaxed text-alma-ink/70">
            Stripe cobra y activa la membresía sola cuando la clienta completa el pago — no necesitas verificar nada.
            Si esta orden sigue en espera, la clienta no terminó el pago: puedes ignorarla o rechazarla para limpiarla.
          </p>
        </div>
      ) : (
        <div>
          <Label className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/70 mb-2 block">
            Comprobante de pago
          </Label>
          <ProofViewer order={order} onZoom={onZoom} />
        </div>
      )}

      {isPending(order) && !rejectMode && (
        <>
          <div className="space-y-1">
            <Label htmlFor={`notes-${order.id}`} className="text-alma-ink/70">Notas internas (opcional)</Label>
            <Input
              id={`notes-${order.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Solo visibles para el equipo…"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setRejectMode(true)}
              disabled={approving || rejecting}
            >
              Rechazar
            </Button>
            <Button
              className="flex-1 bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink font-semibold"
              onClick={() => onApprove(order.id, notes)}
              disabled={approving || rejecting}
            >
              {approving ? "Aprobando…" : "Aprobar"}
            </Button>
          </div>
        </>
      )}

      {isPending(order) && rejectMode && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-alma-ink">Rechazar orden</p>
            <p className="text-xs text-alma-ink/70 mt-0.5">
              Se notificará a la clienta por email y WhatsApp con el motivo.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`reason-${order.id}`} className="text-alma-ink/70">Motivo del rechazo *</Label>
            <Textarea
              id={`reason-${order.id}`}
              rows={3}
              placeholder="Ej: El monto no coincide con el comprobante, imagen borrosa…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="border-alma-sandstone text-alma-ink hover:bg-alma-mist" onClick={() => { setRejectMode(false); setReason(""); }} disabled={rejecting}>
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

  const approveMutation = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => api.put(`/admin/orders/${id}/verify`, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
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

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
        {/* Lista */}
        <div className="rounded-xl border border-alma-hairline overflow-hidden bg-alma-canvas">
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
                    className={cn("cursor-pointer", active && "bg-alma-oat/40 hover:bg-alma-oat/40")}
                    onClick={() => {
                      setSelectedId(o.id);
                      if (!isDesktop) setMobileOpen(true);
                    }}
                  >
                    <TableCell>
                      <p className="font-medium text-alma-ink truncate max-w-[22ch]">{o.userName ?? o.userId}</p>
                      <p className="text-xs text-alma-ink/55">{METHOD_LABEL[o.paymentMethod ?? ""] ?? o.paymentMethod ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-right font-medium text-alma-ink nums whitespace-nowrap">
                      {formatMXN(Number(o.totalAmount))}
                    </TableCell>
                    <TableCell><StatusPill status={o.status} /></TableCell>
                    <TableCell className="text-sm text-alma-ink/70 nums whitespace-nowrap">{formatDate(o.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {/* Panel persistente (desktop): el comprobante siempre a la vista */}
        <aside className="hidden lg:block sticky top-20 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
          {detailProps ? (
            <OrderDetail key={detailProps.order.id} {...detailProps} />
          ) : (
            <p className="text-sm text-alma-ink/55 py-8 text-center">Selecciona una orden para revisarla</p>
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
  "rounded-xl px-4 py-2 text-[13px] font-semibold text-alma-ink/70 data-[state=active]:bg-alma-oat data-[state=active]:text-alma-ink data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-alma-sandstone";

const OrdersVerification = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-6xl">
        <SectionTabs
          tabs={[
            { label: "Cobrar", to: "/admin/payments" },
            { label: "Verificar", to: "/admin/orders" },
          ]}
        />
        <div className="mb-6">
          <h1 className="admin-title text-alma-ink mb-1">Verificación de órdenes</h1>
          <p className="text-sm text-alma-ink/55">Compara cada monto con su comprobante antes de aprobar</p>
        </div>
        <Tabs defaultValue="pending">
          <TabsList className="h-auto rounded-2xl border border-alma-hairline bg-alma-mist p-1">
            <TabsTrigger value="pending" className={tabTriggerClass}>Por verificar</TabsTrigger>
            <TabsTrigger value="all" className={tabTriggerClass}>Todas</TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-4">
            <OrdersBoard
              sources={[
                { url: "/admin/orders?status=pending_verification", queryKey: ["orders", "pending_verification"] },
                { url: "/admin/orders?status=pending_payment", queryKey: ["orders", "pending_payment"] },
              ]}
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
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default OrdersVerification;
