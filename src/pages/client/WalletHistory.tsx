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
  EmptyState,
  ErrorState,
  SkeletonRow,
  ALMA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { ArrowDownRight, ArrowUpRight, History as HistoryIcon } from "lucide-react";

const WalletHistory = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["loyalty-history"],
    queryFn: async () => (await api.get("/loyalty/my-history")).data,
  });
  const history: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/wallet" label="Volver a Wallet" />
        <PageHeader
          eyebrow="Historial"
          title={<>Tus puntos,</>}
          titleAccent="movimiento a movimiento."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <SkeletonRow key={i} height={60} />)}</div>
          ) : isError ? (
            <ErrorState
              title="Tu historial no cargó"
              description="No pudimos traer tus movimientos. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : history.length === 0 ? (
            <EmptyState
              icon={<HistoryIcon size={20} />}
              title="Sin movimientos aún."
              description="Cada vez que asistas o canjees, aparece aquí."
            />
          ) : (
            <ListGroup>
              {history.map((item) => {
                const earned = item.type === "earned";
                const key = item.id ?? `${item.created_at ?? "sin-fecha"}-${item.reason ?? "movimiento"}-${item.points}`;
                return (
                  <div
                    key={key}
                    className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-1 py-4"
                    style={{ borderTop: `1px solid ${ALMA.border}` }}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl"
                      style={{
                        backgroundColor: ALMA.blush,
                        color: earned ? ALMA.olive : ALMA.ink,
                      }}
                    >
                      {earned
                        ? <ArrowUpRight size={17} strokeWidth={1.7} />
                        : <ArrowDownRight size={17} strokeWidth={1.7} />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[0.94rem] font-medium leading-tight" style={{ color: ALMA.ink }}>
                        {item.reason || (earned ? "Puntos ganados" : "Puntos usados")}
                      </p>
                      <p className="mt-0.5 truncate text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                        {item.created_at
                          ? format(safeParse(item.created_at), "d MMM yyyy", { locale: es })
                          : "Sin fecha"}
                      </p>
                    </div>
                    <p
                      className="nums shrink-0 text-[0.94rem] font-medium"
                      style={earned ? { color: ALMA.olive } : { color: ALMA.ink, opacity: 0.55 }}
                    >
                      {earned ? "+" : "−"}
                      {item.points}
                    </p>
                  </div>
                );
              })}
            </ListGroup>
          )}
        </Section>

        <p className="mt-10 text-[0.74rem]" style={{ color: ALMA.ink, opacity: 0.45 }}>
          Los puntos se acreditan al cierre de cada visita.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default WalletHistory;
