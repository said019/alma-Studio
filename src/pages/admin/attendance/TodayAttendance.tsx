import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, Users, Clock, RotateCcw, UserX } from "lucide-react";

interface RosterEntry {
  booking_id: string;
  class_id: string;
  status: string;
  checked_in_at: string | null;
  guest_profile_id: string | null;
  user_id: string | null;
  display_name: string | null;
  phone: string | null;
  guest_name: string | null;
  host_name: string | null;
}

interface ClassRow {
  id: string;
  start_time: string;
  end_time: string;
  max_capacity: number;
  class_type_name: string;
  class_type_color: string;
  instructor_name: string;
  roster: RosterEntry[];
}

const TodayAttendance = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  // Reloj de recepción: se actualiza cada 30 s, también marca la clase en curso.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const nowHHMM = format(now, "HH:mm");

  const { data, isLoading, isError, refetch } = useQuery<{ data: ClassRow[] }>({
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

  const labelOf = (r: RosterEntry) =>
    r.guest_name ?? r.display_name ?? "—";

  const isGuest = (r: RosterEntry) => Boolean(r.guest_profile_id);

  const counts = (roster: RosterEntry[]) => ({
    confirmed: roster.filter((r) => r.status === "confirmed").length,
    checked_in: roster.filter((r) => r.status === "checked_in").length,
    no_show: roster.filter((r) => r.status === "no_show").length,
    waitlist: roster.filter((r) => r.status === "waitlist").length,
  });

  const isLive = (c: ClassRow) => {
    const start = c.start_time?.slice(0, 5);
    const end = c.end_time?.slice(0, 5);
    return Boolean(start && end && nowHHMM >= start && nowHHMM < end);
  };

  const handleNoShow = async (r: RosterEntry) => {
    const name = labelOf(r);
    const ok = await confirm({
      title: `¿Marcar a ${name} como no asistió?`,
      description: "Su reserva quedará registrada como falta. Si se equivocan, todavía pueden hacerle check-in después.",
      destructive: true,
      confirmLabel: "Marcar falta",
    });
    if (ok) noShowMutation.mutate(r.booking_id);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-4xl">
          <SectionTabs
            tabs={[
              { label: "Semana", to: "/admin/bookings" },
              { label: "Hoy · pasar lista", to: "/admin/pasar-lista" },
            ]}
          />

          {/* Cabecera de recepción: título + reloj vivo */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="admin-title text-alma-ink">Pasar lista</h1>
              <p className="mt-1 text-sm text-alma-ink/55">
                Marca asistencia con un tap. Solo las clases de hoy.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => refetch()}
                className="h-11 border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-oat/40 hover:text-alma-ink"
              >
                <RotateCcw size={13} className="mr-1.5" /> Actualizar
              </Button>
              <div className="text-right">
                <p className="nums font-display text-3xl leading-none text-alma-ink">{formatTime(now)}</p>
                <p className="mt-1 text-xs capitalize text-alma-ink/55">
                  {format(now, "EEEE d 'de' MMMM", { locale: es })}
                </p>
              </div>
            </div>
          </div>

          {isError ? (
            <ErrorState
              title="No pudimos cargar las clases de hoy"
              onRetry={() => refetch()}
            />
          ) : isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
            </div>
          ) : classes.length === 0 ? (
            <EmptyState
              icon={<Clock size={20} strokeWidth={1.8} />}
              title="Hoy no hay clases"
              description="Cuando haya clases programadas para hoy, aquí podrás pasar lista con un tap."
              ctaLabel="Ver calendario de clases"
              ctaTo="/admin/classes"
            />
          ) : (
            <div className="space-y-5">
              {classes.map((c) => {
                const stats = counts(c.roster);
                const live = isLive(c);
                return (
                  <section
                    key={c.id}
                    className={cn(
                      "overflow-hidden rounded-2xl border bg-alma-mist",
                      live ? "border-alma-sandstone" : "border-alma-hairline",
                    )}
                  >
                    {/* Header de clase: plano, hairline, hora en serif */}
                    <header
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3",
                        live ? "border-alma-sandstone/60 bg-alma-oat" : "border-alma-hairline",
                      )}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: c.class_type_color || "#CBB9A4" }}
                          />
                          <p className="truncate font-display text-lg leading-tight text-alma-ink">
                            <span className="nums">{c.start_time?.slice(0, 5)}</span>
                            {" · "}
                            {c.class_type_name}
                          </p>
                          {live && (
                            <span className="shrink-0 rounded-full bg-alma-ink-deep px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-alma-canvas">
                              En curso
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-alma-ink/55">
                          {c.instructor_name} · Cupo{" "}
                          <span className="nums">{stats.confirmed + stats.checked_in}/{c.max_capacity}</span>
                        </p>
                      </div>
                      <p className="nums shrink-0 text-xs">
                        <span className="font-medium text-alma-olive">
                          {stats.checked_in} asisti{stats.checked_in === 1 ? "ó" : "eron"}
                        </span>
                        <span className="mx-1.5 text-alma-ink/30">·</span>
                        <span className="text-alma-ink/55">
                          {stats.confirmed} pendiente{stats.confirmed === 1 ? "" : "s"}
                        </span>
                      </p>
                    </header>

                    {/* Roster */}
                    {c.roster.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <Users size={18} className="mx-auto mb-1.5 text-alma-ink/30" />
                        <p className="text-xs text-alma-ink/55">Sin reservas para esta clase.</p>
                      </div>
                    ) : (
                      <ul className="divide-y divide-alma-hairline">
                        {c.roster.map((r) => {
                          const isCheckedIn = r.status === "checked_in";
                          const isNoShow = r.status === "no_show";
                          const isWaitlist = r.status === "waitlist";
                          const name = labelOf(r);
                          const isMutating = checkinMutation.isPending || noShowMutation.isPending;
                          return (
                            <li
                              key={r.booking_id}
                              className={cn(
                                "flex items-center justify-between gap-3 px-4 py-3 transition-colors",
                                isCheckedIn && "bg-alma-olive/[0.08]",
                                isNoShow && "opacity-60",
                              )}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-alma-ink">
                                  {name}
                                  {isGuest(r) && r.host_name && (
                                    <span className="ml-1.5 text-[11px] font-normal text-alma-ink/55">
                                      (invitada de {r.host_name})
                                    </span>
                                  )}
                                </p>
                                <p className="nums text-[11px] text-alma-ink/55">
                                  {r.phone ?? "—"}
                                  {isWaitlist && <span className="ml-1.5">· Lista de espera</span>}
                                  {isNoShow && <span className="ml-1.5 text-destructive">· No asistió</span>}
                                  {isCheckedIn && <span className="ml-1.5 font-medium text-alma-olive">· Asistió</span>}
                                </p>
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                {!isCheckedIn && !isWaitlist && (
                                  <Button
                                    size="sm"
                                    onClick={() => checkinMutation.mutate(r.booking_id)}
                                    disabled={isMutating}
                                    className="h-11 rounded-full bg-alma-ink px-4 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-canvas hover:bg-alma-ink-deep"
                                  >
                                    <Check size={14} className="mr-1" />
                                    Check-in
                                  </Button>
                                )}
                                {isCheckedIn && (
                                  <span className="inline-flex h-11 items-center gap-1.5 rounded-full bg-alma-olive/15 px-4 text-[0.72rem] font-medium uppercase tracking-[0.14em] text-alma-olive">
                                    <Check size={14} /> Asistió
                                  </span>
                                )}
                                {!isCheckedIn && !isNoShow && !isWaitlist && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleNoShow(r)}
                                    disabled={isMutating}
                                    aria-label={`Marcar a ${name} como no asistió`}
                                    className="h-11 w-11 rounded-full border-alma-sandstone/70 bg-transparent p-0 text-alma-ink/55 hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                                  >
                                    <UserX size={15} />
                                  </Button>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default TodayAttendance;
