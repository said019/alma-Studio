import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  EmptyState,
  ErrorState,
  SkeletonRow,
} from "@/components/app/AppShell";
import { StatusPill, formatMoneyMX } from "@/components/app/widgets";
import { Receipt } from "lucide-react";
import type { Order } from "@/types/order";
import { type Tone } from "@/design/tokens";

/* Ambos estados pendientes viven en berry para cumplir AA a 0.72rem
   (stone falla en texto pequeño): "Pago pendiente" pide acción de la
   socia, va sólido; "En verificación" es espera, va suave. */
const STATUS: Record<string, { label: string; tone: Tone; variant?: "soft" | "solid" }> = {
  pending_payment: { label: "Pago pendiente", tone: "accent", variant: "solid" },
  pending_verification: { label: "En verificación", tone: "accent" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "danger" },
  expired: { label: "Vencido", tone: "muted" },
};

const Orders = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => (await api.get("/orders")).data,
  });
  const orders: Order[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Mis órdenes"
          title={<>Historial de</>}
          titleAccent="compras."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonRow key={i} height={72} />)}</div>
          ) : isError ? (
            <ErrorState
              title="No pudimos cargar tus órdenes"
              description="Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Receipt size={20} />}
              title="Aún no compras un paquete."
              description="Cuando compres tu primer paquete o renovación, queda aquí el comprobante."
              ctaLabel="Ver paquetes"
              ctaTo="/app/checkout"
            />
          ) : (
            <ListGroup>
              {orders.map((order) => {
                const status = STATUS[order.status] ?? { label: order.status, tone: "accent" as const };
                return (
                  <ListRow
                    key={order.id}
                    to={`/app/orders/${order.id}`}
                    icon={<Receipt size={17} strokeWidth={1.7} />}
                    iconTint={status.tone}
                    title={order.plan_name ?? "Compra"}
                    description={
                      <>
                        {order.created_at ? format(safeParse(order.created_at), "d MMM yyyy", { locale: es }) : "—"}
                        {" · "}
                        ${formatMoneyMX(order.total_amount ?? order.amount)} {order.currency ?? "MXN"}
                      </>
                    }
                    trailing={<StatusPill label={status.label} tone={status.tone} variant={status.variant ?? "soft"} />}
                  />
                );
              })}
            </ListGroup>
          )}
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Orders;
