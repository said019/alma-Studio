import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Cake, Camera, CheckCircle2, Users } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, AreaChart, Area, Cell } from "recharts";
import CheckinScanner from "@/components/admin/CheckinScanner";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

interface Birthday {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  dateOfBirth: string;
  day: number;
  month: number;
  isToday: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  active: "Activa",
  expired: "Expirada",
  frozen: "Congelada",
};

interface Stats {
  classesToday: number;
  activeMembers: number;
  monthlyRevenue: number;
  pendingAlerts: number;
  recentMemberships: { id: string; userName: string; planName: string; status: string; createdAt: string }[];
  pendingOrders: { id: string; userName: string; totalAmount?: number; total_amount?: number; amount?: number; status: string }[];
}

/* ── Paleta terrosa para recharts (hex de los tokens alma-*) ── */
const CHART_INK = "#43392F";
const CHART_SANDSTONE = "#CBB9A4";
const CHART_AXIS = "rgba(67, 57, 47, 0.55)";
/* Ramp ink → oat: más oscuro = visita más reciente */
const DORMANCY_RAMP = ["#43392F", "#6E5A46", "#A48D78", "#CBB9A4", "#E6DAC8"];
const TOOLTIP_STYLE: CSSProperties = {
  fontSize: 12,
  padding: "6px 10px",
  backgroundColor: "#FAF9F6",
  border: "1px solid #E0D5C6",
  borderRadius: 10,
  color: CHART_INK,
};

const LABEL = "text-[0.72rem] font-medium uppercase tracking-[0.16em] text-alma-ink/55";

const PILL_BASE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.7rem] font-medium";
const statusPill = (status: string) => {
  if (status === "active" || status === "approved") return `${PILL_BASE} bg-alma-oat text-alma-ink`;
  if (status === "pending_verification" || status === "pending_payment")
    return `${PILL_BASE} border border-alma-sandstone/60 text-alma-berry`;
  return `${PILL_BASE} border border-alma-hairline text-alma-ink/55`;
};

/* Superficie de tarjeta; con `to` se vuelve un link real (hover + focus + aria). */
const CardShell = ({ to, ariaLabel, className, children }: {
  to?: string;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
}) => {
  const base = "rounded-xl border border-alma-hairline bg-alma-mist";
  if (to) {
    return (
      <Link
        to={to}
        aria-label={ariaLabel}
        className={cn(
          base,
          "group block no-underline transition-colors hover:border-alma-sandstone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alma-sandstone/70",
          className,
        )}
      >
        {children}
      </Link>
    );
  }
  return <div className={cn(base, className)}>{children}</div>;
};

const Dashboard = () => {
  const [scanOpen, setScanOpen] = useState(false);

  const { data: stats, isLoading, isError: statsError, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["admin-stats"],
    queryFn: async () => (await api.get("/admin/stats")).data,
  });

  const { data: memberships, isLoading: memsLoading, isError: memsError, refetch: refetchMems } = useQuery<{ data: Stats["recentMemberships"] }>({
    queryKey: ["memberships-recent"],
    queryFn: async () => (await api.get("/memberships?limit=5")).data,
  });

  const { data: pendingOrders, isLoading: ordersLoading, isError: ordersError, refetch: refetchOrders } = useQuery<{ data: Stats["pendingOrders"] }>({
    queryKey: ["orders-pending"],
    queryFn: async () => {
      const [v, p] = await Promise.all([
        api.get("/admin/orders?status=pending_verification"),
        api.get("/admin/orders?status=pending_payment"),
      ]);
      const merged = [
        ...(Array.isArray(v.data?.data) ? v.data.data : []),
        ...(Array.isArray(p.data?.data) ? p.data.data : []),
      ];
      return { data: merged };
    },
  });

  const { data: revenueData, isLoading: revenueLoading, isError: revenueError, refetch: refetchRevenue } = useQuery<any>({
    queryKey: ["dashboard-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });
  const revenueRows: { month: string; amount: number }[] = Array.isArray(revenueData?.data)
    ? revenueData.data.map((r: any) => ({
        month: r.month ? new Date(r.month).toLocaleDateString("es-MX", { month: "short" }) : "",
        amount: Number(r.amount ?? 0),
      })).slice(-6)
    : [];

  const { data: dormantData, isLoading: dormantLoading, isError: dormantError, refetch: refetchDormant } = useQuery<any>({
    queryKey: ["dashboard-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
  });

  const dorm = dormantData?.data ?? null;
  const dormantRows = dorm ? [
    { label: "≤7 d", value: Number(dorm.active_7d ?? 0) },
    { label: "8-14 d", value: Number(dorm.dormant_8_14d ?? 0) },
    { label: "15-30 d", value: Number(dorm.dormant_15_30d ?? 0) },
    { label: "31-60 d", value: Number(dorm.dormant_31_60d ?? 0) },
    { label: "60+ d", value: Number(dorm.lost_60d ?? 0) },
  ] : [];

  const currentMonth = new Date().getMonth() + 1;
  const { data: birthdaysData, isLoading: loadingBirthdays, isError: birthdaysError, refetch: refetchBirthdays } = useQuery<{
    month: number; total: number; todayCount: number; data: Birthday[];
  }>({
    queryKey: ["admin-birthdays", currentMonth],
    queryFn: async () => (await api.get(`/admin/birthdays?month=${currentMonth}`)).data,
  });
  const birthdays: Birthday[] = Array.isArray(birthdaysData?.data) ? birthdaysData.data : [];
  const todayBirthdays = birthdays.filter((b) => b.isToday);

  const membershipRows = Array.isArray(memberships?.data) ? memberships.data : [];
  const orderRows = Array.isArray(pendingOrders?.data) ? pendingOrders.data : [];
  const pendingCount = stats?.pendingAlerts ?? 0;

  const todayLabel = (() => {
    const s = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const secondaryStats = [
    { label: "Clases de hoy", value: String(stats?.classesToday ?? 0), hint: "programadas en la agenda" },
    { label: "Membresías activas", value: String(stats?.activeMembers ?? 0), hint: "clientas con paquete vigente" },
    { label: "Ingresos del mes", value: formatMXN(stats?.monthlyRevenue ?? 0), hint: "órdenes aprobadas" },
  ];

  return (
    <AuthGuard requiredRoles={["admin", "super_admin", "reception", "instructor"]}>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="admin-title font-display text-alma-ink">Hoy en el estudio</h1>
              <p className="mt-1 text-sm text-alma-ink/55">{todayLabel}</p>
            </div>
            <Button onClick={() => setScanOpen(true)} className="gap-2">
              <Camera size={16} />
              Pasar lista con cámara
            </Button>
          </div>
          <CheckinScanner open={scanOpen} onOpenChange={setScanOpen} />

          {/* ── Métricas: 1 hero accionable + fila editorial ── */}
          {statsError ? (
            <CardShell className="mb-6 px-6">
              <ErrorState
                title="No pudimos cargar los indicadores"
                description="Revisa tu conexión y vuelve a intentarlo."
                onRetry={() => refetchStats()}
              />
            </CardShell>
          ) : (
            <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <CardShell
                to="/admin/orders"
                ariaLabel={`Revisar ${pendingCount} órdenes por verificar`}
                className="p-5 sm:p-6 lg:col-span-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className={LABEL}>Órdenes por verificar</p>
                  <ArrowUpRight size={16} className="shrink-0 text-alma-ink/40 transition-colors group-hover:text-alma-ink" aria-hidden="true" />
                </div>
                {isLoading ? (
                  <Skeleton className="mt-3 h-11 w-24 bg-alma-oat/60" />
                ) : (
                  <p className="nums mt-2 font-display text-[2.75rem] leading-none text-alma-ink">{pendingCount}</p>
                )}
                <p className="mt-3 text-sm leading-relaxed text-alma-ink/70">
                  Pagos enviados por clientas que esperan tu confirmación.
                </p>
                {!isLoading && (pendingCount > 0 ? (
                  <span className="mt-3 inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-[0.7rem] font-medium text-destructive">
                    Requiere atención
                  </span>
                ) : (
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[0.78rem] font-medium text-alma-olive">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    Todo al día
                  </span>
                ))}
              </CardShell>

              <div className="grid grid-cols-1 divide-y divide-alma-hairline rounded-xl border border-alma-hairline bg-alma-mist sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-7">
                {secondaryStats.map((s) => (
                  <div key={s.label} className="flex flex-col justify-center p-5">
                    <p className={LABEL}>{s.label}</p>
                    {isLoading ? (
                      <Skeleton className="mt-2 h-8 w-20 bg-alma-oat/60" />
                    ) : (
                      <p className="nums mt-2 font-display text-[1.9rem] leading-none text-alma-ink">{s.value}</p>
                    )}
                    <p className="mt-2 text-xs text-alma-ink/55">{s.hint}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Mini gráficas ── */}
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardShell
              to={revenueError ? undefined : "/admin/reports"}
              ariaLabel="Abrir reportes de ingresos"
              className="p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className={LABEL}>Ingresos últimos 6 meses</p>
                {!revenueError && (
                  <ArrowUpRight size={16} className="shrink-0 text-alma-ink/40 transition-colors group-hover:text-alma-ink" aria-hidden="true" />
                )}
              </div>
              <div className="mt-3">
                {revenueLoading ? (
                  <Skeleton className="h-[130px] w-full bg-alma-oat/60" />
                ) : revenueError ? (
                  <ErrorState title="No pudimos cargar los ingresos" onRetry={() => refetchRevenue()} />
                ) : revenueRows.length === 0 ? (
                  <p className="py-10 text-sm text-alma-ink/55">
                    Aún no hay ingresos registrados. Aquí verás la curva de los últimos meses.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={130}>
                    <AreaChart data={revenueRows} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                      <XAxis dataKey="month" tick={{ fontSize: 10, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: any) => [formatMXN(Number(v)), "Ingresos"]}
                        contentStyle={TOOLTIP_STYLE}
                        labelStyle={{ color: CHART_INK, fontWeight: 500 }}
                        cursor={{ stroke: CHART_SANDSTONE, strokeDasharray: "3 3" }}
                      />
                      <Area type="monotone" dataKey="amount" stroke={CHART_INK} strokeWidth={1.8} fill={CHART_SANDSTONE} fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardShell>

            <CardShell
              to={dormantError ? undefined : "/admin/whatsapp-templates"}
              ariaLabel="Reactivar clientas dormidas con una plantilla de WhatsApp"
              className="p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <p className={LABEL}>Clientas por última visita</p>
                {!dormantError && (
                  <ArrowUpRight size={16} className="shrink-0 text-alma-ink/40 transition-colors group-hover:text-alma-ink" aria-hidden="true" />
                )}
              </div>
              <div className="mt-3">
                {dormantLoading ? (
                  <Skeleton className="h-[130px] w-full bg-alma-oat/60" />
                ) : dormantError ? (
                  <ErrorState title="No pudimos cargar esta gráfica" onRetry={() => refetchDormant()} />
                ) : dormantRows.length === 0 ? (
                  <p className="py-10 text-sm text-alma-ink/55">
                    Aún no hay visitas registradas para esta gráfica.
                  </p>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height={130}>
                      <BarChart data={dormantRows} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: CHART_AXIS }} axisLine={false} tickLine={false} />
                        <Tooltip
                          formatter={(v: any) => [v, "Clientas"]}
                          contentStyle={TOOLTIP_STYLE}
                          labelStyle={{ color: CHART_INK, fontWeight: 500 }}
                          cursor={{ fill: "rgba(230, 218, 200, 0.45)" }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {dormantRows.map((_, i) => (
                            <Cell key={i} fill={DORMANCY_RAMP[i]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <p className="mt-2 flex items-center justify-end gap-1 text-[0.72rem] font-medium text-alma-berry">
                      Reactivar por WhatsApp
                      <ArrowUpRight size={12} aria-hidden="true" />
                    </p>
                  </>
                )}
              </div>
            </CardShell>
          </div>

          {/* ── Cumpleaños del mes ── */}
          <CardShell
            to={birthdaysError ? undefined : "/admin/clients?birthday=month"}
            ariaLabel={`Ver clientas que cumplen años en ${MONTHS[currentMonth - 1]}`}
            className="mb-6 p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={cn(LABEL, "flex items-center gap-2")}>
                <Cake size={14} className="text-alma-berry" aria-hidden="true" />
                Cumpleaños de {MONTHS[currentMonth - 1]}
                {!loadingBirthdays && !birthdaysError && (
                  <span className="nums normal-case tracking-normal text-alma-ink/55">· {birthdays.length}</span>
                )}
              </p>
              <span className="flex items-center gap-2">
                {todayBirthdays.length > 0 && (
                  <span className="nums inline-flex items-center rounded-full bg-alma-oat px-2.5 py-0.5 text-[0.7rem] font-medium text-alma-ink">
                    {todayBirthdays.length} {todayBirthdays.length === 1 ? "es hoy" : "son hoy"}
                  </span>
                )}
                {!birthdaysError && (
                  <ArrowUpRight size={16} className="shrink-0 text-alma-ink/40 transition-colors group-hover:text-alma-ink" aria-hidden="true" />
                )}
              </span>
            </div>
            <div className="mt-4">
              {loadingBirthdays ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full bg-alma-oat/60" />)}
                </div>
              ) : birthdaysError ? (
                <ErrorState title="No pudimos cargar los cumpleaños" onRetry={() => refetchBirthdays()} />
              ) : birthdays.length === 0 ? (
                <p className="text-sm text-alma-ink/55">
                  Ninguna clienta cumple años en {MONTHS[currentMonth - 1]}.
                </p>
              ) : (
                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {birthdays.map((b) => {
                    const initials = b.displayName.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <li
                        key={b.id}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-3 py-2.5",
                          b.isToday ? "border-alma-sandstone/70 bg-alma-oat/50" : "border-alma-hairline",
                        )}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-alma-oat text-[0.7rem] font-semibold text-alma-berry">
                          {b.photoUrl ? (
                            <img src={b.photoUrl} alt="" className="h-full w-full object-cover" />
                          ) : initials || "·"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-alma-ink">{b.displayName}</p>
                          {b.phone && (
                            <p className="nums truncate text-[0.72rem] text-alma-ink/55">{b.phone}</p>
                          )}
                        </div>
                        {b.isToday ? (
                          <span className="rounded-full bg-alma-ink-deep px-2 py-0.5 text-[0.66rem] font-semibold uppercase tracking-[0.08em] text-alma-canvas">
                            Hoy
                          </span>
                        ) : (
                          <span className="nums rounded-full border border-alma-sandstone/50 px-2 py-0.5 text-[0.7rem] font-medium text-alma-berry">
                            {b.day} {MONTHS[b.month - 1].slice(0, 3)}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </CardShell>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── Últimas membresías ── */}
            <CardShell className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className={LABEL}>Últimas membresías</p>
                <Link
                  to="/admin/memberships"
                  className="text-[0.72rem] font-medium text-alma-berry no-underline transition-colors hover:text-alma-ink"
                >
                  Ver todas
                </Link>
              </div>
              <div className="mt-3">
                {memsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full bg-alma-oat/60" />)}
                  </div>
                ) : memsError ? (
                  <ErrorState title="No pudimos cargar las membresías" onRetry={() => refetchMems()} />
                ) : membershipRows.length === 0 ? (
                  <div className="flex items-center gap-3 py-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-alma-oat text-alma-berry">
                      <Users size={17} aria-hidden="true" />
                    </span>
                    <p className="text-sm text-alma-ink/70">
                      Aún no hay membresías recientes. Cuando una clienta compre un paquete aparecerá aquí.
                    </p>
                  </div>
                ) : (
                  <ul className="m-0 list-none divide-y divide-alma-hairline p-0">
                    {membershipRows.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-alma-ink">{m.userName}</p>
                          <p className="truncate text-xs text-alma-ink/55">{m.planName}</p>
                        </div>
                        <span className={statusPill(m.status)}>{STATUS_LABEL[m.status] ?? m.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardShell>

            {/* ── Órdenes pendientes ── */}
            <CardShell
              to={ordersError ? undefined : "/admin/orders"}
              ariaLabel="Abrir verificación de órdenes"
              className="p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <p className={LABEL}>Órdenes pendientes</p>
                {!ordersError && (
                  <ArrowUpRight size={16} className="shrink-0 text-alma-ink/40 transition-colors group-hover:text-alma-ink" aria-hidden="true" />
                )}
              </div>
              <div className="mt-3">
                {ordersLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full bg-alma-oat/60" />)}
                  </div>
                ) : ordersError ? (
                  <ErrorState title="No pudimos cargar las órdenes" onRetry={() => refetchOrders()} />
                ) : orderRows.length === 0 ? (
                  <div className="flex items-center gap-3 py-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-alma-oat text-alma-olive">
                      <CheckCircle2 size={17} aria-hidden="true" />
                    </span>
                    <p className="text-sm text-alma-ink/70">
                      Sin órdenes pendientes. Todos los pagos están verificados.
                    </p>
                  </div>
                ) : (
                  <ul className="m-0 list-none divide-y divide-alma-hairline p-0">
                    {orderRows.map((o) => (
                      <li key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-alma-ink">{o.userName}</p>
                          <p className="nums text-xs text-alma-ink/55">
                            {formatMXN(Number(o.totalAmount ?? o.total_amount ?? o.amount ?? 0))}
                          </p>
                        </div>
                        <span className={statusPill(o.status)}>{STATUS_LABEL[o.status] ?? o.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardShell>
          </div>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Dashboard;
