import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfWeek, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Cake, CreditCard, Hourglass, ScanLine, type LucideIcon } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel, PanelHeader, PanelLink } from "@/components/admin/Panel";
import KpiStrip, { type Kpi } from "@/components/admin/KpiStrip";
import SeatMeter from "@/components/admin/SeatMeter";
import StatusDot, { type StatusTone } from "@/components/admin/StatusDot";
import { Avatar } from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { useCanSeeFinance } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { COLOR } from "@/design/tokens";
import { daySummary, durationMin, hhmm, minutesUntil, splitDay, summarize, type TodayClass } from "@/lib/today-roster";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "Esperando pago",
  pending_verification: "Por verificar",
  pending_activation: "Por activar",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  active: "Activa",
  expired: "Expirada",
  frozen: "Congelada",
};
const STATUS_TONE: Record<string, StatusTone | "pending"> = {
  active: "success", approved: "success", expired: "muted", frozen: "muted",
  cancelled: "danger", rejected: "danger",
  pending_payment: "pending", pending_verification: "pending", pending_activation: "pending",
};

type Stats = { classesToday: number; activeMembers: number; monthlyRevenue: number | null; pendingAlerts: number };
type Birthday = { id: string; displayName: string; isToday: boolean };
type Order = { id: string; status: string; totalAmount?: number | string; total_amount?: number | string; amount?: number | string };
type RecentMembership = { id: string; userName?: string; planName?: string; status: string };
type TodoItem = { icon: LucideIcon; count: number; title: string; sub: string; to: string };

const TOOLTIP_STYLE = { background: COLOR.surface, border: `1px solid ${COLOR.line}`, borderRadius: 12, fontSize: 12, color: COLOR.ink };
const DORMANT = [
  { key: "active_7d", label: "≤ 7 días" },
  { key: "dormant_8_14d", label: "8–14 días" },
  { key: "dormant_15_30d", label: "15–30 días" },
  { key: "dormant_31_60d", label: "31–60 días" },
  { key: "lost_60d", label: "60+ días" },
] as const;

const LABEL = "text-[0.75rem] font-bold uppercase tracking-[0.12em]";

function MembershipStatus({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? "muted";
  const label = STATUS_LABEL[status] ?? status;
  if (tone === "pending") return <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{label}</span>;
  return <StatusDot tone={tone}>{label}</StatusDot>;
}

/* Bloque negro "Siguiente clase" (préstamo de la dirección B, spec §5.1). */
function NextClassHero({ cls, clock, tomorrow }: { cls: TodayClass | null; clock: string; tomorrow: { name: string; time: string } | null }) {
  if (!cls) {
    return (
      <section aria-label="Siguiente clase" className="rounded-2xl bg-inverse px-7 py-6 text-inverse-foreground">
        <p className={cn(LABEL, "text-inverse-muted")}>Siguiente clase</p>
        <p className="mt-3 font-display text-xl font-semibold uppercase leading-tight">Ya no hay más clases hoy</p>
        {tomorrow && <p className="mt-2 text-sm text-inverse-muted">Mañana abre {tomorrow.name} a las {tomorrow.time}.</p>}
      </section>
    );
  }
  const s = summarize(cls);
  const mins = minutesUntil(hhmm(cls.start_time), clock);
  const people = cls.roster.filter((r) => r.status === "confirmed" || r.status === "checked_in").slice(0, 8);
  return (
    <section aria-label="Siguiente clase" className="grid items-center gap-6 rounded-2xl bg-inverse px-7 py-6 text-inverse-foreground lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:gap-8">
      <div>
        <p className={cn(LABEL, "text-inverse-muted")}>{mins <= 0 ? "En curso" : `Siguiente · en ${mins} min`}</p>
        <p className="nums mt-2.5 font-display text-[3.5rem] font-extrabold leading-none">{hhmm(cls.start_time)}</p>
      </div>
      <div className="min-w-0 space-y-2.5">
        <p className="font-display text-xl font-semibold uppercase leading-tight">{cls.class_type_name}</p>
        <p className="text-sm text-inverse-muted">con {cls.instructor_name} · {durationMin(cls)} min</p>
        <div className="flex flex-wrap gap-2">
          {s.full ? (
            <Badge variant="attention">Llena · {s.booked}/{cls.max_capacity}</Badge>
          ) : (
            <span className="nums rounded-full bg-inverse-raised px-2.5 py-1 text-[0.75rem] font-extrabold">{s.booked}/{cls.max_capacity} reservadas</span>
          )}
          {s.waitlist > 0 && (
            <span className="rounded-full bg-inverse-raised px-2.5 py-1 text-[0.75rem] font-extrabold">{s.waitlist} en espera</span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-start gap-3.5 lg:items-end">
        {people.length > 0 && (
          <div className="flex pl-2" aria-label={`${people.length} reservadas`}>
            {people.map((p) => (
              <Avatar key={p.booking_id} name={p.guest_name ?? p.display_name} size={36} className="-ml-2 border-2 border-inverse bg-inverse-raised text-inverse-foreground" />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Link to={`/admin/bookings?clase=${cls.id}`} className="inline-flex min-h-[44px] items-center rounded-full border border-inverse-muted px-5 text-sm font-bold text-inverse-foreground no-underline">
            Ver lista
          </Link>
          <Link to="/admin/pasar-lista" className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-canvas px-5 text-sm font-bold text-ink no-underline">
            <ScanLine size={16} aria-hidden="true" />
            Pasar lista
          </Link>
        </div>
      </div>
    </section>
  );
}

function AgendaRow({ cls, past }: { cls: TodayClass; past: boolean }) {
  const s = summarize(cls);
  return (
    <li className="grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-5 py-3.5 first:border-t-0 lg:grid-cols-[60px_minmax(0,1fr)_190px_170px] lg:gap-4 lg:px-6">
      <span className={cn("nums text-[15px] font-extrabold", past ? "text-ink-muted" : "text-ink")}>{hhmm(cls.start_time)}</span>
      <span className="min-w-0">
        <span className={cn("block truncate text-[15px] font-bold", past ? "text-ink-muted" : "text-ink")}>{cls.class_type_name}</span>
        <span className="block truncate text-[13px] text-ink-muted">con {cls.instructor_name}</span>
      </span>
      <span className="hidden items-center gap-2.5 lg:flex">
        <SeatMeter booked={s.booked} capacity={cls.max_capacity} muted={past} />
        <span className={cn("nums text-sm font-bold", past && "text-ink-muted")}>{s.booked}/{cls.max_capacity}</span>
      </span>
      <span className="flex justify-end">
        {past ? (
          <span className="text-[13px] text-ink-muted">
            {s.attended} {s.attended === 1 ? "asistió" : "asistieron"}
            {s.noShow > 0 ? ` · ${s.noShow} ${s.noShow === 1 ? "falta" : "faltas"}` : ""}
          </span>
        ) : s.full ? (
          <Badge variant="attention">Llena</Badge>
        ) : (
          <span className="text-[13px] text-ink-muted">{cls.max_capacity - s.booked} lugares libres</span>
        )}
      </span>
    </li>
  );
}

function TodoRow({ item }: { item: TodoItem }) {
  const Icon = item.icon;
  return (
    <li className="flex items-center gap-3.5 border-t border-line py-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-canvas">
        <Icon size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 leading-snug">
        <span className="block text-sm font-bold"><span className="nums">{item.count}</span> {item.title}</span>
        <span className="block truncate text-[13px] text-ink-muted">{item.sub}</span>
      </span>
      <PanelLink to={item.to}>Ver</PanelLink>
    </li>
  );
}

const Dashboard = () => {
  const showFinance = useCanSeeFinance();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const clock = format(now, "HH:mm");
  const from = format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const to = format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd");
  const tomorrow = format(addDays(now, 1), "yyyy-MM-dd");
  const month = now.getMonth() + 1;
  const monthName = MONTHS[now.getMonth()];

  const statsQ = useQuery<Stats>({ queryKey: ["admin-stats"], queryFn: async () => (await api.get("/admin/stats")).data });
  const todayQ = useQuery<{ data: TodayClass[] }>({
    queryKey: ["today-roster"],
    queryFn: async () => (await api.get("/admin/today-roster")).data,
    refetchInterval: 60_000,
  });
  const expiringQ = useQuery<{ data: unknown[] }>({
    queryKey: ["memberships", "expiring"],
    queryFn: async () => (await api.get("/memberships?status=expiring")).data,
  });
  const recentQ = useQuery<{ data: RecentMembership[] }>({
    queryKey: ["memberships-recent"],
    queryFn: async () => (await api.get("/memberships?limit=5")).data,
  });
  const ordersQ = useQuery<{ data: Order[] }>({
    queryKey: ["orders-pending"],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        api.get("/admin/orders?status=pending_verification"),
        api.get("/admin/orders?status=pending_payment"),
      ]);
      const list = (r: { data?: { data?: Order[] } }) => (Array.isArray(r.data?.data) ? r.data!.data! : []);
      return { data: [...list(a), ...list(b)] };
    },
  });
  const birthdaysQ = useQuery<{ data: Birthday[] }>({
    queryKey: ["admin-birthdays", month],
    queryFn: async () => (await api.get(`/admin/birthdays?month=${month}`)).data,
  });
  const overviewQ = useQuery<{ data: { classOccupancyRate?: number; deltas?: { occupancy?: number } } }>({
    queryKey: ["reports-overview", from, to],
    queryFn: async () => (await api.get(`/reports/overview?from=${from}&to=${to}`)).data,
    enabled: showFinance,
  });
  const revenueQ = useQuery<{ data: { month: string; amount: number }[] }>({
    queryKey: ["dashboard-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
    enabled: showFinance,
  });
  const dormantQ = useQuery<{ data: Record<string, number> }>({
    queryKey: ["dashboard-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
    enabled: showFinance,
  });

  const classes = Array.isArray(todayQ.data?.data) ? todayQ.data!.data : [];
  const { past, next } = splitDay(classes, clock);
  const day = daySummary(classes);
  const rest = [...classes]
    .filter((c) => c.id !== next?.id)
    .sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  const pastIds = new Set(past.map((c) => c.id));

  const tomorrowQ = useQuery<{ data: { class_type_name?: string; start_time?: string }[] }>({
    queryKey: ["dashboard-tomorrow", tomorrow],
    queryFn: async () => (await api.get(`/classes?start=${tomorrow}&end=${tomorrow}`)).data,
    enabled: todayQ.isSuccess && !next,
  });
  const firstTomorrow = tomorrowQ.data?.data?.[0];

  const stats = statsQ.data;
  const pendingCount = stats?.pendingAlerts ?? 0;
  const orders = Array.isArray(ordersQ.data?.data) ? ordersQ.data!.data : [];
  const pendingAmount = orders
    .filter((o) => o.status === "pending_verification")
    .reduce((sum, o) => sum + Number(o.totalAmount ?? o.total_amount ?? o.amount ?? 0), 0);
  const expiringCount = Array.isArray(expiringQ.data?.data) ? expiringQ.data!.data.length : 0;
  const birthdays = Array.isArray(birthdaysQ.data?.data) ? birthdaysQ.data!.data : [];
  const todayBirthdays = birthdays.filter((b) => b.isToday);
  const recent = Array.isArray(recentQ.data?.data) ? recentQ.data!.data.slice(0, 5) : [];
  const occupancy = overviewQ.data?.data?.classOccupancyRate;
  const occDelta = overviewQ.data?.data?.deltas?.occupancy;

  const kpis: Kpi[] = [
    { label: "Reservas hoy", value: String(day.booked), hint: `de ${day.capacity} lugares en ${day.count} ${day.count === 1 ? "clase" : "clases"}` },
    ...(showFinance
      ? [
          {
            label: "Ocupación · semana",
            value: occupancy != null ? `${Math.round(occupancy)}%` : "—",
            hint: typeof occDelta === "number" ? `${occDelta >= 0 ? "+" : ""}${occDelta.toFixed(1)} pts vs. semana pasada` : "de los lugares de la semana",
          },
          { label: `Ingresos · ${monthName}`, value: stats?.monthlyRevenue != null ? formatMXN(stats.monthlyRevenue) : "—", hint: "órdenes aprobadas" },
        ]
      : [
          { label: "Clases hoy", value: String(stats?.classesToday ?? day.count), hint: "programadas en la agenda" },
          { label: "En lista de espera hoy", value: String(day.waitlist), hint: "en clases llenas" },
        ]),
    {
      label: "Membresías activas",
      value: stats?.activeMembers != null ? String(stats.activeMembers) : "—",
      hint: expiringCount ? `${expiringCount} vencen en 7 días` : "clientas con paquete vigente",
    },
  ];

  const waitClasses = classes.filter((c) => summarize(c).waitlist > 0);
  const todos: TodoItem[] = [];
  if (day.waitlist > 0) {
    todos.push({
      icon: Hourglass, count: day.waitlist, title: "en lista de espera hoy",
      sub: waitClasses.map((c) => `${c.class_type_name} · ${hhmm(c.start_time)}`).join(", "),
      to: "/admin/bookings/waitlist",
    });
  }
  if (expiringCount > 0) {
    todos.push({
      icon: CreditCard, count: expiringCount, title: expiringCount === 1 ? "membresía por vencer" : "membresías por vencer",
      sub: "en los próximos 7 días", to: "/admin/memberships?tab=expiring",
    });
  }
  if (todayBirthdays.length > 0) {
    todos.push({
      icon: Cake, count: todayBirthdays.length, title: "cumpleaños hoy",
      sub: `${todayBirthdays.map((b) => b.displayName).join(", ")} · ${birthdays.length} en ${monthName}`,
      to: "/admin/clients?birthday=month",
    });
  }
  // Fallos silenciosos: si alguna de estas se cae, la fila desaparece sin
  // avisar (F1 revisión). Se juntan aquí para mostrar un aviso único y
  // reintentar sólo las que fallaron.
  const todoErrors = [
    { key: "today" as const, isError: todayQ.isError, refetch: () => todayQ.refetch() },
    { key: "expiring" as const, isError: expiringQ.isError, refetch: () => expiringQ.refetch() },
    { key: "birthdays" as const, isError: birthdaysQ.isError, refetch: () => birthdaysQ.refetch() },
  ].filter((q) => q.isError);
  // "Todo al día" sólo cuando las 4 fuentes ya contestaron; si no, se puede
  // decir "nada pendiente" mientras en realidad faltan datos por llegar.
  const pendingQueriesLoading = statsQ.isLoading || todayQ.isLoading || expiringQ.isLoading || birthdaysQ.isLoading;
  const allPendingLoaded = statsQ.isSuccess && todayQ.isSuccess && expiringQ.isSuccess && birthdaysQ.isSuccess;
  const nothingPending = allPendingLoaded && pendingCount === 0 && todos.length === 0;

  const revenueRows = (Array.isArray(revenueQ.data?.data) ? revenueQ.data!.data : [])
    .slice(-6)
    .map((r) => ({ month: new Date(r.month).toLocaleDateString("es-MX", { month: "short" }), amount: Number(r.amount) || 0 }));
  const dorm = dormantQ.data?.data ?? null;
  const dormMax = dorm ? Math.max(1, ...DORMANT.map((d) => Number(dorm[d.key]) || 0)) : 1;

  return (
    <AuthGuard requiredRoles={["admin", "super_admin", "reception", "instructor"]}>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker={format(now, "EEEE d 'de' MMMM", { locale: es })}
            title="Hoy en el estudio"
            actions={<span className="text-[13px] text-ink-muted">Actualizado {clock}</span>}
          />

          {statsQ.isError ? (
            <ErrorState title="No pudimos cargar los indicadores" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => statsQ.refetch()} />
          ) : (
            <KpiStrip items={kpis} />
          )}

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-6">
              {todayQ.isLoading ? (
                <SkeletonRow height={170} />
              ) : !todayQ.isError ? (
                <NextClassHero
                  cls={next}
                  clock={clock}
                  tomorrow={firstTomorrow ? { name: firstTomorrow.class_type_name ?? "la primera clase", time: hhmm(firstTomorrow.start_time) } : null}
                />
              ) : null}

              <Panel aria-label="Agenda de hoy" className="overflow-hidden">
                <PanelHeader title="Agenda de hoy" trailing={<PanelLink to="/admin/classes">Ver semana</PanelLink>} />
                {todayQ.isError ? (
                  <div className="px-6">
                    <ErrorState title="No pudimos cargar la agenda de hoy" onRetry={() => todayQ.refetch()} />
                  </div>
                ) : todayQ.isLoading ? (
                  <div className="space-y-2 px-6 pb-5"><SkeletonRow /><SkeletonRow /></div>
                ) : classes.length === 0 ? (
                  <p className="border-t border-line px-6 py-5 text-sm text-ink-muted">Hoy no hay clases programadas.</p>
                ) : rest.length === 0 ? (
                  <p className="border-t border-line px-6 py-5 text-sm text-ink-muted">Es la única clase de hoy.</p>
                ) : (
                  <ul className="border-t border-line">
                    {rest.map((c) => <AgendaRow key={c.id} cls={c} past={pastIds.has(c.id)} />)}
                  </ul>
                )}
              </Panel>
            </div>

            <div className="flex flex-col gap-6">
              <Panel aria-label="Por atender">
                <PanelHeader title="Por atender" />
                <div className="px-5 pb-3 lg:px-6">
                  {pendingCount > 0 && (
                    <div className="mb-1.5 flex items-center gap-3.5 rounded-xl bg-accent-soft p-4">
                      <span className="nums font-display text-[2rem] font-semibold leading-none text-accent-strong">{pendingCount}</span>
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-extrabold">Pagos por verificar</span>
                        {ordersQ.isError ? (
                          <span className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[13px] text-ink-muted">No pudimos calcular el monto</span>
                            <button
                              type="button"
                              onClick={() => ordersQ.refetch()}
                              className="inline-flex min-h-[44px] items-center text-[13px] font-bold text-ink underline-offset-2 hover:underline"
                            >
                              Reintentar
                            </button>
                          </span>
                        ) : (
                          <span className="block text-[13px] text-ink-muted">
                            {ordersQ.isSuccess ? `${formatMXN(pendingAmount)} por confirmar` : "Calculando el monto…"}
                          </span>
                        )}
                      </span>
                      <Link to="/admin/orders" className={cn(buttonVariants(), "no-underline")}>Revisar</Link>
                    </div>
                  )}
                  {todos.length > 0 && <ul>{todos.map((t) => <TodoRow key={t.to} item={t} />)}</ul>}
                  {todoErrors.length > 0 && (
                    <p className="flex flex-wrap items-center gap-2 border-t border-line py-3 text-[13px] text-danger first:border-t-0">
                      <span>No pudimos cargar todo lo pendiente.</span>
                      <button
                        type="button"
                        onClick={() => todoErrors.forEach((q) => q.refetch())}
                        className="inline-flex min-h-[44px] items-center text-[13px] font-bold text-danger underline-offset-2 hover:underline"
                      >
                        Reintentar
                      </button>
                    </p>
                  )}
                  {pendingQueriesLoading ? (
                    <SkeletonRow />
                  ) : nothingPending ? (
                    <p className="py-3 text-sm font-bold text-success">Todo al día</p>
                  ) : null}
                </div>
              </Panel>

              <Panel aria-label="Últimas membresías">
                <PanelHeader title="Últimas membresías" trailing={<PanelLink to="/admin/memberships">Todas</PanelLink>} />
                <div className="px-5 pb-3 lg:px-6">
                  {recentQ.isError ? (
                    <ErrorState title="No pudimos cargar las membresías" onRetry={() => recentQ.refetch()} />
                  ) : recent.length === 0 ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay membresías recientes. Cuando una clienta compre un paquete aparecerá aquí.</p>
                  ) : (
                    <ul>
                      {recent.map((m) => (
                        <li key={m.id} className="flex items-center gap-2.5 border-t border-line py-2.5 first:border-t-0">
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate text-sm font-bold">{m.userName ?? "Clienta"}</span>
                            <span className="block truncate text-xs text-ink-muted">{m.planName ?? "—"}</span>
                          </span>
                          <MembershipStatus status={m.status} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          </div>

          {showFinance && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel aria-label="Ingresos · últimos 6 meses">
                <PanelHeader title="Ingresos · últimos 6 meses" trailing={<PanelLink to="/admin/reports">Reportes</PanelLink>} />
                <div className="px-5 pb-5 lg:px-6">
                  {revenueQ.isError ? (
                    <ErrorState title="No pudimos cargar los ingresos" onRetry={() => revenueQ.refetch()} />
                  ) : revenueRows.length === 0 ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay ingresos registrados. Aquí verás la curva de los últimos meses.</p>
                  ) : (
                    <div role="img" aria-label={`Ingresos de los últimos ${revenueRows.length} meses; el último, ${formatMXN(revenueRows[revenueRows.length - 1].amount)}`}>
                      <ResponsiveContainer width="100%" height={170}>
                        <BarChart data={revenueRows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: COLOR.inkMuted }} />
                          <Tooltip cursor={{ fill: COLOR.sunken }} contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [formatMXN(v), "Ingresos"]} />
                          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={40}>
                            {revenueRows.map((_, i) => (
                              <Cell key={i} fill={i === revenueRows.length - 1 ? COLOR.ink : COLOR.lineStrong} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel aria-label="Clientas por última visita">
                <PanelHeader title="Clientas por última visita" trailing={<PanelLink to="/admin/reports">Ver en Reportes</PanelLink>} />
                <div className="px-5 pb-5 lg:px-6">
                  {dormantQ.isError ? (
                    <ErrorState title="No pudimos cargar esta gráfica" onRetry={() => dormantQ.refetch()} />
                  ) : !dorm ? (
                    <p className="py-3 text-sm text-ink-muted">Aún no hay visitas registradas para esta gráfica.</p>
                  ) : (
                    <ul className="flex flex-col gap-3">
                      {DORMANT.map((d) => {
                        const v = Number(dorm[d.key]) || 0;
                        return (
                          <li key={d.key} className="grid grid-cols-[96px_minmax(0,1fr)_40px] items-center gap-3">
                            <span className="text-[13px] text-ink-muted">{d.label}</span>
                            <span aria-hidden="true" className="block h-2.5 rounded-r bg-ink" style={{ width: `${Math.max(2, Math.round((v / dormMax) * 100))}%` }} />
                            <span className="nums text-right text-[13px] font-extrabold">{v}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </Panel>
            </div>
          )}
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Dashboard;
