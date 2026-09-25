import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, format, getISOWeek, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight, MessageCircle } from "lucide-react";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import MasterDetail from "@/components/admin/MasterDetail";
import WeekNav from "@/components/admin/WeekNav";
import PersonCell from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { waLink } from "@/lib/phone";
import { hhmm } from "@/lib/today-roster";
import { cn } from "@/lib/utils";
import ReservasTabs from "./ReservasTabs";

type WeekClass = {
  id: string; date?: string; start_time: string; class_type_name?: string; className?: string;
  instructor_name?: string | null; waitlist_count?: number;
};
type WaitEntry = {
  bookingId: string; status: string; displayName: string; email?: string | null; phone?: string | null;
  planName?: string | null; classesRemaining?: number | null;
};

const dateOf = (c: WeekClass) => c.date ?? String(c.start_time).split("T")[0];

const Waitlist = () => {
  const [classId, setClassId] = useSearchParamState("clase");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const classesQ = useQuery<{ data: WeekClass[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
  });
  const waiting = (Array.isArray(classesQ.data?.data) ? classesQ.data!.data : [])
    .filter((c) => (Number(c.waitlist_count) || 0) > 0)
    .sort((a, b) => `${dateOf(a)} ${hhmm(a.start_time)}`.localeCompare(`${dateOf(b)} ${hhmm(b.start_time)}`));

  const rosterQ = useQuery<{ data: { class?: { classTypeName?: string; startsAt?: string; date?: string }; roster?: WaitEntry[] } }>({
    queryKey: ["waitlist-roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    enabled: !!classId,
    refetchInterval: 15_000,
  });
  const classInfo = rosterQ.data?.data?.class ?? null;
  const people = (rosterQ.data?.data?.roster ?? []).filter((r) => r.status === "waitlist");

  const list = (
    <Panel aria-label="Clases con lista de espera" className="p-2">
      {classesQ.isError ? (
        <div className="px-4"><ErrorState title="No pudimos cargar la semana" onRetry={() => classesQ.refetch()} /></div>
      ) : classesQ.isLoading ? (
        <div className="space-y-2 p-3"><SkeletonRow /><SkeletonRow /></div>
      ) : waiting.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted">Nadie en lista de espera esta semana.</p>
      ) : (
        <ul>
          {waiting.map((c, i) => {
            const selected = c.id === classId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setClassId(c.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3.5 py-3.5 text-left",
                    selected ? "bg-canvas ring-2 ring-inset ring-ink" : i > 0 && "border-t border-line",
                  )}
                >
                  <span className="min-w-0 leading-snug">
                    <span className="nums block text-[0.75rem] font-extrabold uppercase tracking-[0.06em] text-ink-muted">
                      {format(parseISO(dateOf(c)), "EEE d", { locale: es }).replace(".", "")} · {hhmm(c.start_time)}
                    </span>
                    <span className="block truncate text-[15px] font-extrabold">{c.class_type_name ?? c.className ?? "Clase"}</span>
                    <span className="block truncate text-xs text-ink-muted">con {c.instructor_name ?? "—"} · llena</span>
                  </span>
                  <Badge variant="attention">{c.waitlist_count} en espera</Badge>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );

  const detail = classId ? (
    <Panel aria-label="Quién espera" className="overflow-hidden">
      <div className="flex flex-col gap-3 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
        <div className="min-w-0">
          <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
            {classInfo?.startsAt ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es }) : classInfo?.date ?? "—"}
          </p>
          <h2 className="mt-2 font-display text-[1.375rem] font-semibold leading-tight">{classInfo?.classTypeName ?? "Clase"}</h2>
          <p className="mt-1 text-[13px] text-ink-muted">Llena · se actualiza sola cada 15 s</p>
        </div>
        <Link to={`/admin/bookings?clase=${classId}`} className={cn(buttonVariants({ variant: "outline" }), "no-underline")}>
          Abrir en Reservas
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      {rosterQ.isError ? (
        <div className="px-6"><ErrorState onRetry={() => rosterQ.refetch()} /></div>
      ) : rosterQ.isLoading ? (
        <div className="space-y-2 p-5"><SkeletonRow /><SkeletonRow /></div>
      ) : people.length === 0 ? (
        <p className="border-t border-line px-6 py-6 text-sm text-ink-muted">No hay clientas en lista de espera</p>
      ) : (
        <ol>
          {people.map((p, i) => {
            const wa = waLink(p.phone);
            const unlimited = p.classesRemaining == null || p.classesRemaining >= 9999;
            const planText = p.planName ? `${p.planName} · ${unlimited ? "Ilimitado" : `${p.classesRemaining} clases`}` : "Sin plan";
            return (
              <li key={p.bookingId} className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-4 border-t border-line px-5 py-4 lg:grid-cols-[56px_minmax(0,1fr)_200px_auto] lg:px-6">
                <span className="nums text-center font-display text-[1.75rem] font-semibold leading-none" aria-label={`Posición ${i + 1}`}>{i + 1}</span>
                <div className="min-w-0">
                  <PersonCell name={p.displayName} sub={[p.email, p.phone].filter(Boolean).join(" · ")} size={40} />
                  <span className="mt-0.5 block text-xs text-ink-muted lg:hidden">{planText}</span>
                </div>
                <span className="hidden text-[13px] text-ink-muted lg:block">{planText}</span>
                {wa ? (
                  <a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp a ${p.displayName}`} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-ink">
                    <MessageCircle size={18} aria-hidden="true" />
                  </a>
                ) : <span className="w-11" />}
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  ) : (
    <Panel className="px-6 py-10"><p className="text-sm text-ink-muted">Elige una clase para ver quién espera lugar.</p></Panel>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker={`Reservas · semana ${getISOWeek(weekStart)}`}
            title="Lista de espera"
            subtitle="Quién espera lugar en las clases llenas de la semana, en orden."
            actions={<ReservasTabs />}
          />
          <WeekNav weekStart={weekStart} onChange={(w) => { setWeekStart(w); setClassId(null); }} />
          <MasterDetail hasSelection={!!classId} onBack={() => setClassId(null)} list={list} detail={detail} />
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Waitlist;
