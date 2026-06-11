import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatMXN, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Area, AreaChart, Cell,
} from "recharts";
import { useNavigate } from "react-router-dom";
import {
  TrendingUp, TrendingDown, Minus, Download, Printer, Sparkles,
  AlertTriangle, Star, BarChart3, CalendarDays, Users,
} from "lucide-react";

/* ════════════════════════════════════════════════════════════════
   ReportsPage — página patrón del admin (Hero / Secondary / Strip)
   ════════════════════════════════════════════════════════════════ */

// Paleta canónica Alma. Solo para recharts (necesita hex);
// en el markup se usan las utilidades alma-* de Tailwind.
const C = {
  ink: "#43392F",
  inkSoft: "rgba(67, 57, 47, 0.55)",
  berry: "#6E5A46",
  stone: "#A48D78",
  sandstone: "#CBB9A4",
  oat: "#E6DAC8",
  mist: "#F4F1EA",
  canvas: "#FAF9F6",
  hairline: "#E0D5C6",
  olive: "#5F6B4A",
  destructive: "#B23A48",
};

type RangeKey = "this_month" | "30d" | "90d" | "ytd";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "this_month", label: "Este mes" },
  { key: "30d", label: "Últimos 30 días" },
  { key: "90d", label: "Últimos 90 días" },
  { key: "ytd", label: "Año en curso" },
];

function rangeToDates(r: RangeKey): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  let from: string;
  if (r === "this_month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  } else if (r === "30d") {
    const d = new Date(now); d.setDate(d.getDate() - 30);
    from = d.toISOString().slice(0, 10);
  } else if (r === "90d") {
    const d = new Date(now); d.setDate(d.getDate() - 90);
    from = d.toISOString().slice(0, 10);
  } else {
    from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }
  return { from, to };
}

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const safeArray = (v: any) => (Array.isArray(v) ? v : []);
const fmtMonth = (raw: any) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw);
  return new Intl.DateTimeFormat("es-MX", { month: "short" }).format(d);
};

/* ═══════════ Delta indicator ═══════════ */
function Delta({ pct, suffix = "" }: { pct: number | undefined; suffix?: string }) {
  if (pct === undefined || pct === null || Number.isNaN(pct)) return null;
  const isUp = pct > 0;
  const isFlat = Math.abs(pct) < 0.5;
  const Icon = isFlat ? Minus : isUp ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "nums inline-flex items-center gap-1 text-[11px] font-medium",
        isFlat ? "text-alma-ink/55" : isUp ? "text-alma-olive" : "text-destructive",
      )}
    >
      <Icon size={11} strokeWidth={2.2} />
      {isFlat ? "sin cambio" : `${isUp ? "+" : ""}${pct.toFixed(1)}%${suffix}`}
    </span>
  );
}

/* ═══════════ Sparkline (tiny inline chart) ═══════════ */
function Sparkline({ data, color, height = 30 }: { data: number[]; color: string; height?: number }) {
  if (!data || data.length === 0) return <div style={{ height }} />;
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={color} fillOpacity={0.12} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ═══════════ Hero KPI (1 grande) ═══════════ */
function HeroKPI({
  label, value, delta, deltaSuffix, sparkData, sparkColor, loading,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  sparkData?: number[];
  sparkColor?: string;
  loading?: boolean;
}) {
  return (
    <Card className="h-full border-alma-sandstone/70 bg-alma-mist" data-stagger-item>
      <CardContent className="p-5 sm:p-6">
        <div className="mb-2 flex items-start justify-between gap-3">
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-alma-ink/55">
            {label}
          </p>
          <Delta pct={delta} suffix={deltaSuffix} />
        </div>
        {loading ? (
          <Skeleton className="h-10 w-32" />
        ) : (
          <p className="font-display nums leading-none text-alma-ink" style={{ fontSize: "clamp(2.2rem, 4vw, 3rem)" }}>
            {value}
          </p>
        )}
        {sparkData && sparkData.length > 0 && (
          <div className="-mx-1 mt-3">
            <Sparkline data={sparkData} color={sparkColor || C.berry} height={42} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════ Secondary KPI (3 medianos) ═══════════ */
function SecondaryKPI({
  label, value, delta, deltaSuffix, loading,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaSuffix?: string;
  loading?: boolean;
}) {
  return (
    <Card className="h-full border-alma-hairline bg-alma-mist" data-stagger-item>
      <CardContent className="p-4">
        <p className="mb-1.5 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <p className="font-display nums leading-none text-alma-ink" style={{ fontSize: "1.7rem" }}>{value}</p>
        )}
        {delta !== undefined && (
          <div className="mt-1.5">
            <Delta pct={delta} suffix={deltaSuffix} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════ Strip stat (mini compactos sobre hairline superior) ═══════════ */
function StripStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-t border-alma-hairline pb-1 pt-2.5" data-stagger-item>
      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-alma-ink/60">{label}</p>
      <p className="font-display nums mt-1.5 leading-none text-alma-ink" style={{ fontSize: "1.15rem" }}>{value}</p>
    </div>
  );
}

/* ═══════════ Action panel — sugerencias contextuales ═══════════ */
function ActionPanel({ dorm, conv, cancelRate, cancelled, navigate }: { dorm: any; conv: any; cancelRate?: number; cancelled?: number; navigate: (p: string) => void }) {
  const actions: { icon: any; label: string; cta: string; link: string; urgent?: boolean }[] = [];
  if (cancelRate !== undefined && cancelRate >= 15 && (cancelled ?? 0) >= 3) {
    actions.push({
      icon: AlertTriangle,
      label: `Cancelaciones altas: ${cancelRate.toFixed(1)}% (${cancelled} canceladas)`,
      cta: "Revisar política",
      link: "/admin/whatsapp-templates",
      urgent: true,
    });
  }
  if (dorm) {
    const r60 = Number(dorm.lost_60d || 0);
    if (r60 >= 3) {
      actions.push({
        icon: AlertTriangle,
        label: `${r60} alumnas perdidas (60+ días)`,
        cta: "Win-back con descuento",
        link: "/admin/discount-codes",
      });
    }
  }
  if (conv && Number(conv.muestras_total || 0) > 0 && Number(conv.conversion_rate || 0) < 30) {
    actions.push({
      icon: Sparkles,
      label: `Conversión muestra a paquete: ${conv.conversion_rate}%`,
      cta: "Revisar follow-up post-muestra",
      link: "/admin/whatsapp-templates",
    });
  }
  if (actions.length === 0) return null;
  return (
    <Card className="mb-6 border-alma-hairline bg-alma-oat/50">
      <CardContent className="p-4">
        <p className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">
          Acciones sugeridas
        </p>
        <div className="space-y-2">
          {actions.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-alma-hairline bg-alma-canvas p-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Icon size={15} className={a.urgent ? "shrink-0 text-destructive" : "shrink-0 text-alma-berry"} />
                  <span className="truncate text-[13px] text-alma-ink">{a.label}</span>
                </div>
                <Button size="sm" onClick={() => navigate(a.link)} data-press className="shrink-0">
                  {a.cta}
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════ CSV export helper ═══════════ */
function downloadCSV(filename: string, rows: any[], columns: { key: string; label: string }[]) {
  if (!rows || rows.length === 0) return;
  const head = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows.map((r) =>
    columns.map((c) => {
      const v = r[c.key];
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    }).join(","),
  ).join("\n");
  const csv = "﻿" + head + "\n" + body;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ═══════════ Chart helpers ═══════════ */
const ChartSkeleton = () => <Skeleton className="h-[280px] w-full" />;
const tooltipStyle = { fontSize: 12, borderColor: C.hairline, backgroundColor: C.canvas, borderRadius: 8 };

/* ═══════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════ */
type TabKey = "revenue" | "classes" | "retention" | "top" | "instructors";

const ReportsPage = () => {
  const navigate = useNavigate();
  const [rangeKey, setRangeKey] = useState<RangeKey>("this_month");
  const [tab, setTab] = useState<TabKey>("revenue");
  const dateRange = useMemo(() => rangeToDates(rangeKey), [rangeKey]);

  const {
    data: overview, isLoading, isError: overviewError, refetch: refetchOverview,
  } = useQuery({
    queryKey: ["reports-overview", dateRange.from, dateRange.to],
    queryFn: async () => (await api.get(`/reports/overview?from=${dateRange.from}&to=${dateRange.to}`)).data,
  });
  const o = overview?.data ?? {};
  const deltas = o.deltas ?? {};

  const {
    data: revenue, isLoading: revenueLoading, isError: revenueError, refetch: refetchRevenue,
  } = useQuery({
    queryKey: ["reports-revenue"],
    queryFn: async () => (await api.get("/reports/revenue")).data,
  });
  // El sparkline es decorativo: si falla, el hero simplemente no lo muestra.
  const { data: revSparkData } = useQuery({
    queryKey: ["reports-revenue-sparkline"],
    queryFn: async () => (await api.get("/reports/revenue-sparkline")).data,
  });
  const revSparkValues = safeArray(revSparkData?.data).map((r: any) => Number(r.amount || 0));

  const {
    data: classes, isLoading: classesLoading, isError: classesError, refetch: refetchClasses,
  } = useQuery({
    queryKey: ["reports-classes"],
    queryFn: async () => (await api.get("/reports/classes")).data,
  });
  const {
    data: retention, isLoading: retentionLoading, isError: retentionError, refetch: refetchRetention,
  } = useQuery({
    queryKey: ["reports-retention"],
    queryFn: async () => (await api.get("/reports/retention")).data,
  });
  const {
    data: instructors, isLoading: instructorsLoading, isError: instructorsError, refetch: refetchInstructors,
  } = useQuery({
    queryKey: ["reports-instructors"],
    queryFn: async () => (await api.get("/reports/instructors")).data,
  });
  const {
    data: topAttendance, isLoading: topLoading, isError: topError, refetch: refetchTop,
  } = useQuery({
    queryKey: ["reports-top-attendance"],
    queryFn: async () => (await api.get("/reports/top-attendance?limit=10")).data,
  });
  const {
    data: conversion, isError: conversionError, refetch: refetchConversion,
  } = useQuery({
    queryKey: ["reports-conversion"],
    queryFn: async () => (await api.get("/reports/conversion")).data,
  });
  const {
    data: dormant, isError: dormantError, refetch: refetchDormant,
  } = useQuery({
    queryKey: ["reports-dormant"],
    queryFn: async () => (await api.get("/reports/dormant")).data,
  });

  const revenueData = safeArray(revenue?.data).map((row: any) => ({
    month: fmtMonth(row.month),
    amount: Number(row.amount ?? 0),
  })).slice(-12);
  const classesData = safeArray(classes?.data).map((row: any) => ({
    label: row.name ?? "—",
    bookings: Number(row.bookings ?? 0),
    attended: Number(row.attended ?? 0),
  }));
  const retentionData = safeArray(retention?.data).map((row: any) => ({
    month: fmtMonth(row.month),
    rate: Number(row.rate ?? 0),
  }));
  const topAttendanceData = safeArray(topAttendance?.data);
  const instructorsData = safeArray(instructors?.data);
  const conv = conversion?.data ?? null;
  const dorm = dormant?.data ?? null;

  /* ── CSV exports ── */
  const exportRevenueCsv = () => {
    downloadCSV("ingresos-12-meses.csv", revenueData, [
      { key: "month", label: "Mes" },
      { key: "amount", label: "Ingresos (MXN)" },
    ]);
  };
  const exportTopCsv = () => {
    downloadCSV("top-alumnas.csv", topAttendanceData, [
      { key: "display_name", label: "Alumna" },
      { key: "phone", label: "Teléfono" },
      { key: "lifetime", label: "Asistencias lifetime" },
      { key: "this_month", label: "Asistencias este mes" },
      { key: "last_visit", label: "Última visita" },
    ]);
  };
  const exportRetentionCsv = () => {
    downloadCSV("retencion-12-meses.csv", retentionData, [
      { key: "month", label: "Mes" },
      { key: "rate", label: "% Retención" },
    ]);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <SectionTabs
            tabs={[
              { label: "Reportes", to: "/admin/reports" },
              { label: "Lealtad", to: "/admin/loyalty" },
              { label: "Descuentos", to: "/admin/discount-codes" },
            ]}
          />
          {/* ═════ Header con range picker ═════ */}
          <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="admin-title font-display mb-1 leading-none text-alma-ink">
                Reportes
              </h1>
              <p className="text-[13px] text-alma-ink/55">
                Última actualización · <span className="nums">{formatDateTime(new Date())}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={rangeKey} onValueChange={(v) => setRangeKey(v as RangeKey)}>
                <TabsList>
                  {RANGES.map((r) => (
                    <TabsTrigger key={r.key} value={r.key}>{r.label}</TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.print()}
                data-press
                className="hidden border-alma-sandstone sm:inline-flex"
              >
                <Printer size={13} className="mr-1.5" /> Imprimir
              </Button>
            </div>
          </div>

          {/* ═════ Action panel (top-priority CTAs) ═════ */}
          <ActionPanel
            dorm={dorm}
            conv={conv}
            cancelRate={o.cancelRate}
            cancelled={o.cancelledBookings}
            navigate={navigate}
          />

          {overviewError ? (
            <Card className="mb-6 border-alma-hairline bg-alma-mist">
              <CardContent className="px-5">
                <ErrorState
                  title="No pudimos cargar el resumen"
                  description="Los indicadores del período no están disponibles ahora mismo."
                  onRetry={() => refetchOverview()}
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* ═════ KPI Layout: 1 Hero + 3 Secondary + 5 Strip ═════ */}
              <div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-12" data-stagger>
                {/* Hero: ingresos */}
                <div className="lg:col-span-6">
                  <HeroKPI
                    label="Ingresos del período"
                    value={formatMXN(o.monthlyRevenue || 0)}
                    delta={deltas.revenue}
                    sparkData={revSparkValues}
                    sparkColor={C.berry}
                    loading={isLoading}
                  />
                </div>
                {/* 3 secondary */}
                <div className="lg:col-span-2">
                  <SecondaryKPI
                    label="Miembros activos"
                    value={String(o.activeMembers ?? "—")}
                    loading={isLoading}
                  />
                </div>
                <div className="lg:col-span-2">
                  <SecondaryKPI
                    label="Ocupación"
                    value={fmtPct(o.classOccupancyRate || 0)}
                    delta={deltas.occupancy}
                    loading={isLoading}
                  />
                </div>
                <div className="lg:col-span-2">
                  <SecondaryKPI
                    label="Churn 30d"
                    value={fmtPct(o.churnRate || 0)}
                    loading={isLoading}
                  />
                </div>
              </div>

              {/* Strip de stats compactos */}
              <div className="mb-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-5" data-stagger>
                <StripStat label="Reservas" value={String(o.monthlyBookings ?? 0)} />
                <StripStat
                  label="Canceladas"
                  value={`${o.cancelledBookings ?? 0} · ${(o.cancelRate ?? 0).toFixed(1)}%`}
                />
                <StripStat label="Nuevos miembros" value={String(o.newMembersThisMonth ?? 0)} />
                <StripStat label="Reseñas" value={String(o.reviewsTotal ?? 0)} />
                <StripStat
                  label="Promedio"
                  value={
                    <span className="inline-flex items-center gap-1">
                      {o.reviewsAverage ? Number(o.reviewsAverage).toFixed(1) : "—"}
                      <Star size={13} className="text-alma-berry" fill="currentColor" strokeWidth={0} />
                    </span>
                  }
                />
              </div>
            </>
          )}

          {/* ═════ Conversión + dormant cohorts (side-by-side cuando aplica) ═════ */}
          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {conversionError ? (
              <Card className="border-alma-hairline bg-alma-mist" data-stagger-item>
                <CardContent className="px-5">
                  <ErrorState
                    title="Conversión no disponible"
                    description="No pudimos calcular la conversión de muestras."
                    onRetry={() => refetchConversion()}
                  />
                </CardContent>
              </Card>
            ) : conv && (
              <Card className="border-alma-hairline bg-alma-mist" data-stagger-item>
                <CardContent className="p-5">
                  <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
                    Conversión muestra a paquete
                  </p>
                  <div className="flex items-baseline gap-3">
                    <span className="font-display nums leading-none text-alma-berry" style={{ fontSize: "2.5rem" }}>
                      {conv.conversion_rate ?? 0}%
                    </span>
                    <span className="nums text-[12px] text-alma-ink/55">
                      {conv.converted_total ?? 0} de {conv.muestras_total ?? 0} muestras
                    </span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-alma-oat">
                    <div
                      className="h-full rounded-full bg-alma-berry transition-[width] duration-700"
                      style={{ width: `${conv.conversion_rate || 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
            {dormantError ? (
              <Card className="border-alma-hairline bg-alma-mist" data-stagger-item>
                <CardContent className="px-5">
                  <ErrorState
                    title="Cohortes no disponibles"
                    description="No pudimos cargar el desglose por última visita."
                    onRetry={() => refetchDormant()}
                  />
                </CardContent>
              </Card>
            ) : dorm && (
              <Card className="border-alma-hairline bg-alma-mist" data-stagger-item>
                <CardContent className="p-5">
                  <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
                    Por última visita
                  </p>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {[
                      { l: "≤7d", v: dorm.active_7d },
                      { l: "8-14", v: dorm.dormant_8_14d },
                      { l: "15-30", v: dorm.dormant_15_30d },
                      { l: "31-60", v: dorm.dormant_31_60d },
                      { l: "60+", v: dorm.lost_60d },
                    ].map((b) => (
                      <div key={b.l}>
                        <p className="font-display nums leading-none text-alma-ink" style={{ fontSize: "1.5rem" }}>{b.v ?? 0}</p>
                        <p className="mt-1 text-[0.72rem] uppercase tracking-[0.1em] text-alma-ink/55">{b.l}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═════ Tabs de detalle (shadcn) ═════ */}
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="revenue">Ingresos</TabsTrigger>
                <TabsTrigger value="classes">Clases</TabsTrigger>
                <TabsTrigger value="retention">Retención</TabsTrigger>
                <TabsTrigger value="top">Top alumnas</TabsTrigger>
                <TabsTrigger value="instructors">Instructoras</TabsTrigger>
              </TabsList>
              {/* Export CSV button changes per tab */}
              {tab === "revenue" && revenueData.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportRevenueCsv} data-press className="border-alma-sandstone">
                  <Download size={13} className="mr-1.5" /> Exportar CSV
                </Button>
              )}
              {tab === "top" && topAttendanceData.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportTopCsv} data-press className="border-alma-sandstone">
                  <Download size={13} className="mr-1.5" /> Exportar CSV
                </Button>
              )}
              {tab === "retention" && retentionData.length > 0 && (
                <Button size="sm" variant="outline" onClick={exportRetentionCsv} data-press className="border-alma-sandstone">
                  <Download size={13} className="mr-1.5" /> Exportar CSV
                </Button>
              )}
            </div>

            {/* ═════ Tab content ═════ */}
            <Card className="border-alma-hairline bg-alma-mist">
              <CardContent className="p-5">
                {tab === "revenue" && (
                  revenueError ? (
                    <ErrorState
                      title="No pudimos cargar los ingresos"
                      onRetry={() => refetchRevenue()}
                    />
                  ) : revenueLoading ? (
                    <ChartSkeleton />
                  ) : revenueData.length === 0 ? (
                    <EmptyState
                      icon={<BarChart3 size={20} />}
                      title="Aún no hay órdenes en este período"
                      description="Cuando se registren cobros, aquí verás los ingresos mes a mes."
                      ctaLabel="Ver órdenes"
                      onCta={() => navigate("/admin/orders")}
                    />
                  ) : (
                    <>
                      <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
                        Ingresos mensuales · últimos 12 meses
                      </p>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={revenueData} margin={{ top: 10, right: 5, left: 5, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(v: any) => formatMXN(Number(v))} contentStyle={tooltipStyle} />
                          <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                            {revenueData.map((_, i) => (
                              <Cell key={i} fill={i === revenueData.length - 1 ? C.berry : C.stone} fillOpacity={i === revenueData.length - 1 ? 1 : 0.55} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )
                )}

                {tab === "classes" && (
                  classesError ? (
                    <ErrorState
                      title="No pudimos cargar las clases"
                      onRetry={() => refetchClasses()}
                    />
                  ) : classesLoading ? (
                    <ChartSkeleton />
                  ) : classesData.length === 0 ? (
                    <EmptyState
                      icon={<CalendarDays size={20} />}
                      title="Aún no hay clases con reservas"
                      description="En cuanto las alumnas reserven, aquí comparas reservas contra asistencias por tipo de clase."
                    />
                  ) : (
                    <>
                      <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
                        Reservas vs asistencias por tipo
                      </p>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={classesData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
                          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.inkSoft }} />
                          <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <Bar dataKey="bookings" fill={C.berry} radius={[4, 4, 0, 0]} name="Reservas" />
                          <Bar dataKey="attended" fill={C.sandstone} radius={[4, 4, 0, 0]} name="Asistencias" />
                        </BarChart>
                      </ResponsiveContainer>
                    </>
                  )
                )}

                {tab === "retention" && (
                  retentionError ? (
                    <ErrorState
                      title="No pudimos cargar la retención"
                      onRetry={() => refetchRetention()}
                    />
                  ) : retentionLoading ? (
                    <ChartSkeleton />
                  ) : retentionData.length === 0 ? (
                    <EmptyState
                      icon={<TrendingUp size={20} />}
                      title="Sin datos de retención todavía"
                      description="Se calcula con la asistencia mes a mes; necesita al menos dos meses de actividad."
                    />
                  ) : (
                    <>
                      <p className="mb-3 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-ink/55">
                        Tasa de retención mensual · 12 meses
                      </p>
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={retentionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={C.hairline} />
                          <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.inkSoft }} />
                          <YAxis tick={{ fontSize: 11, fill: C.inkSoft }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                          <Tooltip formatter={(v: any) => `${v}%`} contentStyle={tooltipStyle} />
                          <Line
                            type="monotone"
                            dataKey="rate"
                            stroke={C.berry}
                            strokeWidth={2.5}
                            dot={{ fill: C.berry, r: 3 }}
                            activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </>
                  )
                )}

                {tab === "top" && (
                  topError ? (
                    <ErrorState
                      title="No pudimos cargar el ranking"
                      onRetry={() => refetchTop()}
                    />
                  ) : topLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                    </div>
                  ) : topAttendanceData.length === 0 ? (
                    <EmptyState
                      icon={<Users size={20} />}
                      title="Aún no hay asistencias registradas"
                      description="Cuando pases lista en las clases, aquí aparece el ranking de alumnas más constantes."
                    />
                  ) : (
                    <div className="space-y-2">
                      {topAttendanceData.map((u: any, idx: number) => {
                        const maxLifetime = Math.max(...topAttendanceData.map((x: any) => Number(x.lifetime || 0)));
                        const pct = maxLifetime > 0 ? (Number(u.lifetime || 0) / maxLifetime) * 100 : 0;
                        return (
                          <div
                            key={u.id}
                            className={cn(
                              "flex items-center gap-3 py-2",
                              idx < topAttendanceData.length - 1 && "border-b border-alma-hairline",
                            )}
                          >
                            <span
                              className={cn(
                                "nums grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                                idx < 3 ? "bg-alma-berry text-alma-canvas" : "bg-alma-oat text-alma-berry",
                              )}
                            >
                              {idx + 1}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[14px] font-medium text-alma-ink">{u.display_name}</p>
                              <p className="nums mt-0.5 text-[11px] text-alma-ink/55">
                                {u.this_month} este mes · última {u.last_visit ? formatDate(u.last_visit) : "—"}
                              </p>
                            </div>
                            <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-alma-oat sm:block">
                              <div className="h-full rounded-full bg-alma-berry" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="nums shrink-0 rounded-full bg-alma-ink-deep px-2.5 py-0.5 text-[12px] font-semibold text-alma-canvas">
                              {u.lifetime}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}

                {tab === "instructors" && (
                  instructorsError ? (
                    <ErrorState
                      title="No pudimos cargar a las instructoras"
                      onRetry={() => refetchInstructors()}
                    />
                  ) : instructorsLoading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                    </div>
                  ) : instructorsData.length === 0 ? (
                    <EmptyState
                      icon={<Users size={20} />}
                      title="Aún no hay instructoras con clases"
                      ctaLabel="Crear instructora"
                      onCta={() => navigate("/admin/staff")}
                    />
                  ) : (
                    <div className="space-y-3">
                      {instructorsData.map((ins: any) => {
                        const max = Math.max(...instructorsData.map((x: any) => Number(x.classCount || x.class_count || 0)));
                        const count = Number(ins.classCount || ins.class_count || 0);
                        const pct = max > 0 ? (count / max) * 100 : 0;
                        return (
                          <div key={ins.id} className="flex items-center justify-between gap-3 text-sm">
                            <span className="flex-1 truncate font-medium text-alma-ink">{ins.name || ins.display_name}</span>
                            <div className="flex items-center gap-3">
                              <div className="h-2 w-40 overflow-hidden rounded-full bg-alma-oat">
                                <div className="h-full rounded-full bg-alma-berry" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-display nums w-8 text-right text-alma-ink">{count}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ReportsPage;
