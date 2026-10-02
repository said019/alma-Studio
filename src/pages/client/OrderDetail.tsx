import { EmbeddedCardPayment } from "@/components/checkout/EmbeddedCardPayment";
import { OrderActions } from "@/components/app/OrderActions";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  ErrorState,
} from "@/components/app/AppShell";
import {
  BackLink,
  DataRow,
  StatusPill,
  InfoBanner,
  formatMoneyMX,
} from "@/components/app/widgets";
import { UploadDropzone } from "@/components/app/UploadDropzone";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";
import type { Order } from "@/types/order";
import type { Tone } from "@/design/tokens";

/* Ambos estados pendientes viven en berry para cumplir AA a 0.72rem
   (stone falla en texto pequeño): "Pago pendiente" pide acción de la
   socia, va sólido; "En verificación" es espera, va suave. */
const STATUS: Record<string, { label: string; tone: Tone; variant?: "soft" | "solid" }> = {
  pending_payment: { label: "Pago pendiente", tone: "accent", variant: "solid" },
  pending_verification: { label: "En verificación", tone: "accent" },
  approved: { label: "Aprobado · membresía activa", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "danger" },
  expired: { label: "Vencido", tone: "muted" },
};

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [cardOpen, setCardOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
  });
  const order: Order | null = data?.data ?? data ?? null;
  const provider = order?.payment_provider ?? order?.paymentProvider;
  const embedded = provider === "mercadopago";
  const external = provider === "mercadopago_external";
  const cardInProgress = embedded && !!order && ["pending_payment", "pending_verification"].includes(order.status);
  const notFound =
    (error as any)?.response?.status === 404 || (!isLoading && !isError && !order);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      return api.post(`/orders/${orderId}/proof`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      toast({ title: "Comprobante enviado." });
      setFile(null);
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo enviar",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  const reversal: {label: string; tone: Tone; variant?: "soft" | "solid"} | null = order?.mp_payment_status === "charged_back" ? {label:"Contracargo",tone:"danger" as const} : order?.refund_status === "refunded" || order?.mp_payment_status === "refunded" ? {label:"Reembolsado",tone:"muted" as const} : order?.refund_status === "partially_refunded" ? {label:"Reembolso parcial",tone:"accent" as const} : null;
  const status = reversal ?? (order ? STATUS[order.status] ?? { label: order.status, tone: "accent" as const } : null);
  const amountStr = order ? `$${formatMoneyMX(order.total_amount ?? order.amount)} ${order.currency ?? "MXN"}` : "";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/orders" label="Mis órdenes" />

        {isLoading ? (
          <SkeletonRow height={300} />
        ) : notFound ? (
          <ErrorState
            title="No encontramos esta orden"
            description="Puede que el enlace ya no sea válido o que la orden se haya eliminado. Tus compras siguen en tu historial."
            retryLabel="Volver a mis órdenes"
            onRetry={() => navigate("/app/orders")}
          />
        ) : isError ? (
          <ErrorState
            title="No pudimos cargar tu orden"
            description="Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetch()}
          />
        ) : order ? (
          <>
            <PageHeader
              eyebrow="Detalle"
              title={order.plan_name ?? "Compra"}
              actions={status ? <StatusPill label={status.label} tone={status.tone} variant={status.variant ?? "soft"} /> : null}
            />

            {(cardOpen || cardInProgress) && <EmbeddedCardPayment key={order.id} orderId={order.id} onClose={() => navigate("/app/orders")} />}
            {order.status === "pending_payment" && !embedded && !cardOpen && <OrderActions orderId={order.id} canChangePayment={external || order.payment_method !== "card"} external={external} onCardPayment={() => setCardOpen(true)} />}
            {order.status === "pending_payment" && order.payment_method === "card" && !embedded && !external && <InfoBanner title="Pago creado anteriormente" description="Este pago usa el proveedor original de la orden. Consulta al estudio para verificar su estado antes de iniciar otra compra." />}

            <Section>
              <div className="rounded-3xl p-5 sm:p-7 border border-line bg-sunken">
                <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3 border-b border-line">
                  <span className="text-[0.75rem] font-medium uppercase tracking-[0.24em] text-accent-strong">
                    Total
                  </span>
                  <span className="font-display nums leading-none text-ink" style={{ fontSize: "clamp(1.85rem, 3vw, 2.6rem)" }}>
                    {amountStr}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Fecha"
                    value={order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                  />
                  {Number(order.refunded_amount) > 0 && <DataRow label="Importe reembolsado" value={`$${formatMoneyMX(order.refunded_amount)} MXN`} />}
                  <DataRow label="Método" value={order.payment_method === "cash" ? "Efectivo" : order.payment_method === "card" ? "Tarjeta" : "Transferencia"} />
                  {(order as any).orderNumber && (
                    <DataRow label="Folio" value={(order as any).orderNumber} mono />
                  )}
                </div>
              </div>
            </Section>

            {order.status === "pending_payment" && order.payment_method === "transfer" && order.bank_clabe && (
              <Section title="Datos para transferencia">
                <div className="rounded-3xl p-5 sm:p-7 bg-canvas border border-line">
                  <DataRow label="CLABE" value={order.bank_clabe} mono copyable={String(order.bank_clabe)} />
                  {order.bank_name && <DataRow label="Banco" value={order.bank_name} />}
                  {order.bank_account_holder && (
                    <DataRow label="Titular" value={order.bank_account_holder} />
                  )}
                  <DataRow label="Monto" value={amountStr} mono copyable={amountStr.replace(/[^0-9.]/g, "")} />
                </div>
              </Section>
            )}

            {order.status === "pending_payment" && order.payment_method !== "card" && !cardOpen && (
              <Section title="Subir comprobante">
                <UploadDropzone file={file} onFileChange={setFile} />

                <div className="mt-5 flex gap-3">
                  <PrimaryButton
                    onClick={() => uploadMutation.mutate()}
                    disabled={!file || uploadMutation.isPending}
                    loading={uploadMutation.isPending}
                    loadingLabel="Enviando…"
                  >
                    Enviar comprobante
                  </PrimaryButton>
                  {file && <GhostButton onClick={() => setFile(null)}>Cambiar</GhostButton>}
                </div>
              </Section>
            )}

            {order.proof_url && (
              <Section title="Comprobante enviado">
                <a
                  href={order.proof_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 no-underline transition-colors bg-sunken text-accent-strong"
                >
                  <FileText size={15} />
                  Ver archivo
                </a>
              </Section>
            )}

            {order.admin_notes && (
              <Section>
                <InfoBanner
                  tone="muted"
                  title="Nota del estudio"
                  description={order.admin_notes}
                />
              </Section>
            )}
          </>
        ) : null}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default OrderDetail;
