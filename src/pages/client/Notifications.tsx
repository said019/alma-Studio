import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
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
  GhostButton,
  ALMA,
} from "@/components/app/AppShell";
import {
  Bell, BellOff,
  CalendarCheck2, CreditCard, Info, Trophy, Sparkles, Coins, Gift,
} from "lucide-react";

type Category =
  | "booking" | "membership" | "marketing"
  | "milestone" | "motivation"
  | "loyalty_earn" | "loyalty_spend"
  | "system";

interface Notif {
  id: string;
  category: Category;
  title: string;
  body: string;
  time: string;
  link?: string;
  unread?: boolean;
}

// Icono por categoría para escanear rápido; el tinte es uno solo (berry)
// porque el color por categoría no comunicaba nada real.
const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  booking: <CalendarCheck2 size={17} strokeWidth={1.7} />,
  membership: <CreditCard size={17} strokeWidth={1.7} />,
  // Aviso del estudio
  marketing: <Info size={17} strokeWidth={1.7} />,
  milestone: <Trophy size={17} strokeWidth={1.7} />,
  motivation: <Sparkles size={17} strokeWidth={1.7} />,
  loyalty_earn: <Coins size={17} strokeWidth={1.7} />,
  loyalty_spend: <Gift size={17} strokeWidth={1.7} />,
  system: <Bell size={17} strokeWidth={1.7} />,
};

const PAGE_SIZE = 40;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return `Hoy · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Ayer · ${format(d, "HH:mm")}`;
  const days = differenceInDays(new Date(), d);
  if (days < 7) return format(d, "EEEE 'a las' HH:mm", { locale: es });
  return format(d, "d MMM 'a las' HH:mm", { locale: es });
}

const Notifications = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [limit, setLimit] = useState(PAGE_SIZE);

  const { data, isLoading, isError, isFetching, refetch } = useQuery<{ data: Notif[]; meta?: { unread_count: number } }>({
    queryKey: ["my-notifications", limit],
    queryFn: async () => (await api.get(`/me/notifications?limit=${limit}`)).data,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
  const items = Array.isArray(data?.data) ? data!.data : [];
  const hasUnread = items.some((n) => n.unread);

  const markReadMutation = useMutation({
    mutationFn: () => api.post("/me/notifications/mark-read"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });
  const { mutate: markAllRead } = markReadMutation;

  // Marca todo como leído al entrar (después de un breve delay para que la
  // alumna alcance a ver qué era nuevo). `mutate` es estable en react-query v5.
  useEffect(() => {
    if (!hasUnread) return;
    const t = setTimeout(() => markAllRead(), 1200);
    return () => clearTimeout(t);
  }, [hasUnread, markAllRead]);

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Tu bandeja"
          title={<>Lo que pasó</>}
          titleAccent="contigo."
        />

        <Section>
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map((i) => <SkeletonRow key={i} height={64} />)}</div>
          ) : isError ? (
            <ErrorState
              title="No pudimos cargar tu bandeja"
              description="Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<BellOff size={20} />}
              title="Sin novedades aún."
              description="Aquí van a aparecer tus reservas, logros, puntos ganados y avisos del estudio."
            />
          ) : (
            <>
              <ListGroup>
                {items.map((n) => (
                  <ListRow
                    key={n.id}
                    asButton={!!n.link}
                    onClick={n.link ? () => navigate(n.link!) : undefined}
                    icon={CATEGORY_ICON[n.category] ?? <Bell size={17} strokeWidth={1.7} />}
                    iconTint="berry"
                    title={
                      <span style={{ fontWeight: n.unread ? 600 : 500, opacity: n.unread ? 1 : 0.75 }}>
                        {n.title}
                      </span>
                    }
                    description={
                      <>
                        {n.body}
                        <span className="nums" style={{ color: ALMA.ink, opacity: 0.4 }}> · {formatTime(n.time)}</span>
                      </>
                    }
                    trailing={n.unread ? (
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: ALMA.berry }}
                        aria-label="Sin leer"
                      />
                    ) : undefined}
                  />
                ))}
              </ListGroup>

              {items.length >= limit && (
                <div className="mt-6 flex justify-center">
                  <GhostButton
                    onClick={() => setLimit((l) => l + PAGE_SIZE)}
                    disabled={isFetching}
                  >
                    {isFetching ? "Cargando…" : "Cargar más"}
                  </GhostButton>
                </div>
              )}
            </>
          )}
        </Section>

        <p className="mt-10 text-[0.74rem]" style={{ color: ALMA.ink, opacity: 0.45 }}>
          Configura cuáles avisos recibes desde Perfil, en Preferencias.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Notifications;
