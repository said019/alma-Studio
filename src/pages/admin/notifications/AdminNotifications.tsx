import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  UserPlus, ShoppingBag, Trophy, CheckCircle2, MessageCircle,
  XCircle, AlertCircle, BellOff, CheckCheck,
} from "lucide-react";

type Category =
  | "new_user" | "order_pending" | "milestone" | "checkin"
  | "campaign" | "order_rejected" | "expiring";

interface Notif {
  id: string;
  category: Category;
  title: string;
  body: string;
  time: string;
  link?: string;
  unread?: boolean;
}

const ICON: Record<Category, React.ReactNode> = {
  new_user: <UserPlus size={16} />,
  order_pending: <ShoppingBag size={16} />,
  milestone: <Trophy size={16} />,
  checkin: <CheckCircle2 size={16} />,
  campaign: <MessageCircle size={16} />,
  order_rejected: <XCircle size={16} />,
  expiring: <AlertCircle size={16} />,
};

// Urgente = requiere acción de la dueña (cobros, rechazos, vencimientos).
// Lo demás es informativo y baja un escalón en jerarquía visual.
const URGENT = new Set<Category>(["order_pending", "order_rejected", "expiring"]);

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (isToday(d)) return `Hoy · ${format(d, "HH:mm")}`;
  if (isYesterday(d)) return `Ayer · ${format(d, "HH:mm")}`;
  const days = differenceInDays(new Date(), d);
  if (days < 7) return format(d, "EEEE 'a las' HH:mm", { locale: es });
  return format(d, "d MMM 'a las' HH:mm", { locale: es });
}

const CATEGORY_LABEL: Record<Category, string> = {
  new_user: "Nuevas alumnas",
  order_pending: "Órdenes pendientes",
  milestone: "Logros otorgados",
  checkin: "Check-ins",
  campaign: "Campañas",
  order_rejected: "Órdenes rechazadas",
  expiring: "Membresías por vencer",
};

const AdminNotifications = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Category | "all">("all");
  // El backend solo soporta "marcar todo"; este set apaga el dot del item
  // que ya se abrió para que la bandeja refleje lo que la dueña ya vio.
  const [readLocal, setReadLocal] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery<{ data: Notif[]; meta?: { unread_count: number } }>({
    queryKey: ["admin-notifications"],
    queryFn: async () => (await api.get("/admin/notifications?limit=60")).data,
    refetchInterval: 30_000,
  });
  const items = Array.isArray(data?.data) ? data!.data : [];

  const markReadMutation = useMutation({
    mutationFn: () => api.post("/admin/notifications/mark-read"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
      qc.invalidateQueries({ queryKey: ["admin-notifications-unread-count"] });
    },
  });

  // Conteos por categoría para los chips de filtro
  const counts = items.reduce<Record<Category, number>>((acc, n) => {
    acc[n.category] = (acc[n.category] || 0) + 1;
    return acc;
  }, {} as Record<Category, number>);
  const chipCategories = (Object.keys(CATEGORY_LABEL) as Category[]).filter((cat) => (counts[cat] || 0) > 0);

  const visible = filter === "all" ? items : items.filter((n) => n.category === filter);
  const hasUnread = items.some((n) => n.unread && !readLocal.has(n.id));

  const openItem = (n: Notif) => {
    if (n.unread) {
      setReadLocal((prev) => {
        const next = new Set(prev);
        next.add(n.id);
        return next;
      });
    }
    if (n.link) navigate(n.link);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="admin-title font-display leading-none text-alma-ink">Bandeja del studio</h1>
              <p className="mt-1.5 text-sm text-alma-ink/55">
                Eventos recientes: nuevas alumnas, órdenes pendientes, logros, check-ins y más.
              </p>
            </div>
            {hasUnread && (
              <Button
                size="sm"
                variant="outline"
                className="border-alma-sandstone"
                onClick={() => markReadMutation.mutate()}
                disabled={markReadMutation.isPending}
                data-press
              >
                <CheckCheck size={14} className="mr-1.5" />
                Marcar todo como leído
              </Button>
            )}
          </div>

          {/* Chips de filtro por categoría */}
          {!isLoading && !isError && items.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-1.5">
              <button
                data-press
                onClick={() => setFilter("all")}
                aria-pressed={filter === "all"}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === "all"
                    ? "border-alma-sandstone bg-alma-oat text-alma-ink"
                    : "border-alma-hairline bg-alma-mist text-alma-ink/70 hover:bg-alma-oat/40 hover:text-alma-ink",
                )}
              >
                Todas <span className="nums">{items.length}</span>
              </button>
              {chipCategories.map((cat) => (
                <button
                  key={cat}
                  data-press
                  onClick={() => setFilter(filter === cat ? "all" : cat)}
                  aria-pressed={filter === cat}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    filter === cat
                      ? "border-alma-sandstone bg-alma-oat text-alma-ink"
                      : "border-alma-hairline bg-alma-mist text-alma-ink/70 hover:bg-alma-oat/40 hover:text-alma-ink",
                  )}
                >
                  {CATEGORY_LABEL[cat]} <span className="nums">{counts[cat]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Feed */}
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : isError ? (
            <Card className="border-alma-hairline bg-alma-mist">
              <CardContent className="px-6">
                <ErrorState
                  title="No pudimos cargar la bandeja"
                  description="Los eventos del studio no están disponibles ahora mismo."
                  onRetry={() => refetch()}
                />
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card className="border-alma-hairline bg-alma-mist">
              <CardContent className="p-10 text-center">
                <BellOff size={28} className="mx-auto mb-3 text-alma-ink/40" />
                <p className="font-medium text-alma-ink">Sin novedades</p>
                <p className="mt-1 text-xs text-alma-ink/55">
                  Aquí van a aparecer reservas, registros, órdenes y demás eventos del studio.
                </p>
              </CardContent>
            </Card>
          ) : visible.length === 0 ? (
            <Card className="border-alma-hairline bg-alma-mist">
              <CardContent className="p-10 text-center">
                <BellOff size={28} className="mx-auto mb-3 text-alma-ink/40" />
                <p className="font-medium text-alma-ink">Nada en esta categoría</p>
                <p className="mt-1 text-xs text-alma-ink/55">
                  No hay eventos de "{filter !== "all" ? CATEGORY_LABEL[filter] : ""}" en los últimos 30 días.
                </p>
                <Button size="sm" variant="outline" className="mt-4 border-alma-sandstone" onClick={() => setFilter("all")} data-press>
                  Ver todas
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-alma-hairline bg-alma-canvas">
              <CardContent className="p-0">
                <ul className="divide-y divide-alma-hairline">
                  {visible.map((n) => {
                    const urgent = URGENT.has(n.category);
                    const unread = !!n.unread && !readLocal.has(n.id);
                    return (
                      <li key={n.id}>
                        <button
                          data-press
                          onClick={() => openItem(n)}
                          className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-alma-mist/70"
                        >
                          <span
                            className={cn(
                              "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                              urgent
                                ? "bg-alma-oat text-alma-berry"
                                : "border border-alma-hairline bg-alma-mist text-alma-ink/50",
                            )}
                          >
                            {ICON[n.category]}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "truncate text-sm",
                                urgent ? "font-semibold" : "font-medium",
                                unread ? "text-alma-ink" : "text-alma-ink/60",
                              )}
                            >
                              {n.title}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-alma-ink/55">
                              {n.body}
                              <span className="nums text-alma-ink/40"> · {formatTime(n.time)}</span>
                            </p>
                          </div>
                          {unread && (
                            <span
                              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-alma-berry"
                              aria-label="Sin leer"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          )}

          <p className="mt-6 text-[11px] text-alma-ink/45">
            Actualización automática cada 30 segundos · Últimos 30 días.
          </p>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminNotifications;
