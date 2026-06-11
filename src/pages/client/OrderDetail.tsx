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
  ALMA,
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

/* Ambos estados pendientes viven en berry para cumplir AA a 0.72rem
   (stone falla en texto pequeño): "Pago pendiente" pide acción de la
   socia, va sólido; "En verificación" es espera, va suave. */
const STATUS: Record<string, { label: string; tone: keyof typeof ALMA; variant?: "soft" | "solid" }> = {
  pending_payment: { label: "Pago pendiente", tone: "berry", variant: "solid" },
  pending_verification: { label: "En verificación", tone: "berry" },
  approved: { label: "Aprobado · membresía activa", tone: "olive" },
  rejected: { label: "Rechazado", tone: "destructive" },
  cancelled: { label: "Cancelado", tone: "destructive" },
};

const OrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["order-detail", orderId],
    queryFn: async () => (await api.get(`/orders/${orderId}`)).data,
  });
  const order: Order | null = data?.data ?? data ?? null;
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

  const status = order ? STATUS[order.status] ?? { label: order.status, tone: "berry" as const } : null;
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

            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.blush }}>
                <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
                    Total
                  </span>
                  <span className="font-display nums leading-none" style={{ color: ALMA.ink, fontSize: "clamp(1.85rem, 3vw, 2.6rem)" }}>
                    {amountStr}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Fecha"
                    value={order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                  />
                  <DataRow label="Método" value={order.payment_method === "cash" ? "Efectivo" : "Transferencia (Banorte)"} />
                  {(order as any).orderNumber && (
                    <DataRow label="Folio" value={(order as any).orderNumber} mono />
                  )}
                </div>
              </div>
            </Section>

            {order.status === "pending_payment" && order.bank_clabe && (
              <Section title="Datos para transferencia">
                <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}>
                  <DataRow label="CLABE" value={order.bank_clabe} mono copyable={String(order.bank_clabe)} />
                  {order.bank_name && <DataRow label="Banco" value={order.bank_name} />}
                  {order.bank_account_holder && (
                    <DataRow label="Titular" value={order.bank_account_holder} />
                  )}
                  <DataRow label="Monto" value={amountStr} mono copyable={amountStr.replace(/[^0-9.]/g, "")} />
                </div>
              </Section>
            )}

            {order.status === "pending_payment" && (
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
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-3 no-underline transition-colors"
                  style={{ backgroundColor: ALMA.blush, color: ALMA.berry }}
                >
                  <FileText size={15} />
                  Ver archivo
                </a>
              </Section>
            )}

            {order.admin_notes && (
              <Section>
                <InfoBanner
                  tone="stone"
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
