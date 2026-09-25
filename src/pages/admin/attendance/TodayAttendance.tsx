import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import { Avatar } from "@/components/admin/PersonCell";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import ReservasTabs from "@/pages/admin/bookings/ReservasTabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Camera, Check, ChevronDown, RotateCcw, UserX } from "lucide-react";
import CheckinScanner from "@/components/admin/CheckinScanner";
import { hhmm, minutesUntil, splitDay, summarize, type TodayClass, type TodayRosterEntry } from "@/lib/today-roster";

type ClassCardProps = {
  cls: TodayClass;
  clock: string;
  open: boolean;
  onToggle?: () => void;
  current?: boolean;
  past?: boolean;
  mutating: boolean;
  labelOf: (r: TodayRosterEntry) => string;
  isGuest: (r: TodayRosterEntry) => boolean;
  onCheckin: (bookingId: string) => void;
  onNoShow: (r: TodayRosterEntry) => void;
};

function ClassCard({ cls, clock, open, onToggle, current = false, past = false, mutating, labelOf, isGuest, onCheckin, onNoShow }: ClassCardProps) {
  const s = summarize(cls);
  const mins = minutesUntil(hhmm(cls.start_time), clock);
  const name = cls.class_type_name;
  return (
    <section
      aria-label={`${name} ${hhmm(cls.start_time)}`}
      className={cn("rounded-2xl bg-surface", current ? "border-2 border-ink" : "border border-line", past && "opacity-70")}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 lg:px-6">
        <span className="nums w-[76px] font-display text-[1.5rem] font-semibold leading-none">{hhmm(cls.start_time)}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-base font-extrabold">{name}</p>
          <p className="text-[13px] text-ink-muted">con {cls.instructor_name} · cupo {s.booked}/{cls.max_capacity}</p>
        </div>
        {current && (
          <span className="rounded-full bg-ink px-2.5 py-1 text-[0.75rem] font-extrabold text-canvas">
            {mins <= 0 ? "En curso" : `Empieza en ${mins} min`}
          </span>
        )}
        {!past && s.full && <Badge variant="attention">Llena</Badge>}
        <span className="nums text-sm font-extrabold">
          {current ? (
            <>
              {s.attended} {s.attended === 1 ? "asistió" : "asistieron"} ·{" "}
              <span className={s.pending > 0 ? "text-accent-strong" : undefined}>{s.pending} {s.pending === 1 ? "pendiente" : "pendientes"}</span>
            </>
          ) : past ? (
            <>
              {s.attended} {s.attended === 1 ? "asistió" : "asistieron"}
              {s.noShow > 0 ? ` · ${s.noShow} ${s.noShow === 1 ? "falta" : "faltas"}` : ""}
            </>
          ) : (
            <span className={s.pending > 0 ? "text-accent-strong" : undefined}>{s.pending} {s.pending === 1 ? "pendiente" : "pendientes"}</span>
          )}
        </span>
        {onToggle && (
          <Button variant="outline" size="icon" aria-expanded={open} aria-label={open ? `Cerrar lista de ${name}` : `Abrir lista de ${name}`} onClick={onToggle}>
            <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
          </Button>
        )}
      </div>
      {open && (
        cls.roster.length === 0 ? (
          <p className="border-t border-line px-6 py-4 text-sm text-ink-muted">Sin reservas para esta clase.</p>
        ) : (
          <ul className="grid border-t border-line px-5 lg:grid-cols-2 lg:gap-x-8 lg:px-6">
            {cls.roster.map((r) => (
              <li key={r.booking_id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
                <Avatar name={labelOf(r)} size={40} />
                <span className="min-w-0 flex-1 leading-snug">
                  <span className="block truncate text-[15px] font-extrabold">
                    {labelOf(r)}
                    {isGuest(r) && r.host_name ? <span className="font-normal text-ink-muted"> (invitada de {r.host_name})</span> : null}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {r.phone ?? "—"}
                    {r.status === "no_show" && <span className="text-danger"> · No asistió</span>}
                  </span>
                </span>
                {r.status === "checked_in" ? (
                  <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-success px-4 text-sm font-extrabold text-canvas">
                    <Check size={16} aria-hidden="true" />Asistió
                  </span>
                ) : r.status === "waitlist" ? (
                  <span className="text-[13px] text-ink-muted">Lista de espera</span>
                ) : (
                  <span className="flex gap-1.5">
                    {r.status !== "no_show" && (
                      <Button variant="ghost" size="icon" aria-label={`Marcar falta de ${labelOf(r)}`} onClick={() => onNoShow(r)} disabled={mutating}>
                        <UserX size={18} />
                      </Button>
                    )}
                    <Button aria-label={`Check-in de ${labelOf(r)}`} onClick={() => onCheckin(r.booking_id)} disabled={mutating}>
                      <Check size={16} aria-hidden="true" />Check-in
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  );
}

const TodayAttendance = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  // Reloj de recepción: se actualiza cada 30 s, también marca la clase en curso.
  const [now, setNow] = useState(() => new Date());
  const [scanOpen, setScanOpen] = useState(false);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const { data, isLoading, isError, refetch } = useQuery<{ data: TodayClass[] }>({
    queryKey: ["today-roster"],
    queryFn: async () => (await api.get("/admin/today-roster")).data,
    refetchInterval: 30000,
  });
  const classes = [...(data?.data ?? [])].sort((a, b) =>
    (a.start_time ?? "").localeCompare(b.start_time ?? ""),
  );

  const checkinMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-roster"] });
      if (navigator.vibrate) navigator.vibrate(60);
    },
    onError: (e: any) => toast({
      title: "Error al hacer check-in",
      description: e?.response?.data?.message,
      variant: "destructive",
    }),
  });

  const noShowMutation = useMutation({
    mutationFn: (bookingId: string) => api.put(`/bookings/${bookingId}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["today-roster"] });
    },
    onError: (e: any) => toast({
      title: "No se pudo marcar la falta",
      description: e?.response?.data?.message,
      variant: "destructive",
    }),
  });

  const labelOf = (r: TodayRosterEntry) =>
    r.guest_name ?? r.display_name ?? "—";

  const isGuest = (r: TodayRosterEntry) => Boolean(r.guest_profile_id);

  const handleNoShow = async (r: TodayRosterEntry) => {
    const name = labelOf(r);
    const ok = await confirm({
      title: `¿Marcar a ${name} como no asistió?`,
      description: "Su reserva quedará registrada como falta. Si se equivocan, todavía pueden hacerle check-in después.",
      destructive: true,
      confirmLabel: "Marcar falta",
    });
    if (ok) noShowMutation.mutate(r.booking_id);
  };

  const clock = format(now, "HH:mm");
  const { past, next, later } = splitDay(classes, clock);

  const mutating = checkinMutation.isPending || noShowMutation.isPending;
  const cardProps = {
    clock, mutating, labelOf, isGuest,
    onCheckin: (id: string) => checkinMutation.mutate(id),
    onNoShow: handleNoShow,
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Reservas · hoy"
            title="Pasar lista"
            subtitle="Marca asistencia con un tap. Se actualiza cada 30 segundos."
            actions={<ReservasTabs />}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={() => setScanOpen(true)}>
              <Camera size={16} aria-hidden="true" />
              Escanear QR del pase
            </Button>
            <Button variant="ghost" onClick={() => refetch()}>
              <RotateCcw size={16} aria-hidden="true" />
              Actualizar
            </Button>
            <div className="ml-auto text-right leading-tight">
              <p className="nums font-display text-[1.75rem] font-semibold">{clock}</p>
              <p className="text-[0.75rem] text-ink-muted">{format(now, "EEEE d 'de' MMMM", { locale: es })}</p>
            </div>
          </div>

          {isError ? (
            <ErrorState title="No pudimos cargar las clases de hoy" onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : classes.length === 0 ? (
            <EmptyState
              title="Hoy no hay clases"
              description="Cuando haya clases programadas para hoy, aquí podrás pasar lista con un tap."
              ctaLabel="Ver calendario de clases"
              ctaTo="/admin/classes"
            />
          ) : (
            <>
              {next ? (
                <ClassCard cls={next} open current {...cardProps} />
              ) : (
                <Panel className="px-6 py-5"><p className="text-sm font-bold">Ya terminaron las clases de hoy.</p></Panel>
              )}
              {later.map((c) => (
                <ClassCard key={c.id} cls={c} open={openIds.has(c.id)} onToggle={() => toggle(c.id)} {...cardProps} />
              ))}
              {past.length > 0 && (
                <section aria-label="Ya terminaron" className="flex flex-col gap-2.5">
                  <h2 className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Ya terminaron</h2>
                  {past.map((c) => (
                    <ClassCard key={c.id} cls={c} past open={openIds.has(c.id)} onToggle={() => toggle(c.id)} {...cardProps} />
                  ))}
                </section>
              )}
            </>
          )}
          <CheckinScanner open={scanOpen} onOpenChange={setScanOpen} />
          {dialog}
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default TodayAttendance;
