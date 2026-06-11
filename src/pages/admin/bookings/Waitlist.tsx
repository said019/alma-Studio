import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Users, Calendar, RefreshCw } from "lucide-react";

interface WaitlistEntry {
  bookingId: string;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  planName: string | null;
  classesRemaining: number | null;
}

const Waitlist = () => {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  const {
    data: classesData,
    isLoading: classesLoading,
    isError: classesError,
    refetch: refetchClasses,
  } = useQuery({
    queryKey: ["waitlist-classes", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });
  const classes: any[] = Array.isArray(classesData?.data) ? classesData.data : [];

  const {
    data: rosterData,
    isLoading: rosterLoading,
    isError: rosterError,
    refetch,
  } = useQuery({
    queryKey: ["waitlist-roster", selectedClassId],
    queryFn: async () => (await api.get(`/classes/${selectedClassId}/roster`)).data,
    enabled: !!selectedClassId,
    refetchInterval: 15000,
  });
  const roster: WaitlistEntry[] = (rosterData?.data?.roster ?? []).filter(
    (r: any) => r.status === "waitlist"
  );
  const classInfo = rosterData?.data?.class ?? null;

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <div className="mb-7">
            <h1 className="admin-title font-display text-alma-ink mb-1">Lista de espera</h1>
            <p className="text-sm text-alma-ink/55">
              {selectedClassId
                ? "Clientas en lista de espera para esta clase"
                : "Selecciona una clase para ver su lista de espera"}
            </p>
          </div>

          {selectedClassId ? (
            <div className="space-y-5">
              <button
                onClick={() => setSelectedClassId(null)}
                className="flex items-center gap-2 text-sm text-alma-ink/55 hover:text-alma-ink transition-colors"
              >
                <ChevronLeft size={14} /> Volver al calendario
              </button>

              {rosterError ? (
                <ErrorState onRetry={() => refetch()} />
              ) : rosterLoading ? (
                <Skeleton className="h-20 rounded-2xl" />
              ) : classInfo && (
                <div className="rounded-2xl border border-alma-hairline bg-alma-mist p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl text-alma-ink mb-1">{classInfo.classTypeName}</h2>
                      <p className="text-sm text-alma-ink/60 nums">
                        {classInfo.startsAt
                          ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es })
                          : classInfo.date ?? "Sin fecha"}
                      </p>
                    </div>
                    <button
                      onClick={() => refetch()}
                      className="text-xs text-alma-berry hover:text-alma-ink transition-colors flex items-center gap-1"
                    >
                      <RefreshCw size={11} /> Actualizar
                    </button>
                  </div>
                  <div className="mt-3">
                    <span className="inline-flex items-center rounded-full border border-alma-sandstone/60 bg-alma-oat/50 px-2.5 py-1 text-xs font-medium text-alma-ink nums">
                      {roster.length} en lista de espera
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {rosterLoading
                  ? Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)
                  : roster.length === 0
                    ? (
                      <div className="text-center py-12 text-alma-ink/45 text-sm">
                        <Users size={28} className="mx-auto mb-2 text-alma-sandstone" />
                        No hay clientas en lista de espera
                      </div>
                    )
                    : roster.map((entry, idx) => (
                      <div
                        key={entry.bookingId}
                        className="flex items-center gap-4 p-4 rounded-xl border border-alma-hairline bg-alma-mist"
                      >
                        <div className="w-10 h-10 rounded-full bg-alma-oat flex items-center justify-center text-sm font-semibold text-alma-berry nums">
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-alma-ink truncate">{entry.displayName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-alma-ink/55 truncate">{entry.email}</span>
                            {entry.phone && <span className="text-xs text-alma-ink/45 nums">{entry.phone}</span>}
                          </div>
                          {entry.planName && (
                            <p className="text-xs text-alma-berry mt-0.5 nums">
                              {entry.planName}
                              {entry.classesRemaining !== null
                                ? ` · ${entry.classesRemaining} clases`
                                : " · Ilimitado"}
                            </p>
                          )}
                        </div>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-full border border-alma-sandstone/60 bg-alma-oat/50 text-alma-ink shrink-0 nums">
                          Posición {idx + 1}
                        </span>
                      </div>
                    ))
                }
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setWeekStart((w) => subWeeks(w, 1))}
                  aria-label="Semana anterior"
                  className="w-8 h-8 rounded-lg border border-alma-hairline text-alma-ink/55 hover:text-alma-ink hover:border-alma-sandstone flex items-center justify-center transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-sm font-semibold text-alma-ink/70 min-w-[200px] text-center nums">
                  {format(weekStart, "d MMM", { locale: es })} a {format(weekEnd, "d MMM yyyy", { locale: es })}
                </span>
                <button
                  onClick={() => setWeekStart((w) => addWeeks(w, 1))}
                  aria-label="Semana siguiente"
                  className="w-8 h-8 rounded-lg border border-alma-hairline text-alma-ink/55 hover:text-alma-ink hover:border-alma-sandstone flex items-center justify-center transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                  className="ml-2 text-xs text-alma-berry hover:text-alma-ink transition-colors"
                >
                  Hoy
                </button>
              </div>

              {classesError ? (
                <ErrorState onRetry={() => refetchClasses()} />
              ) : (
                <div className="space-y-4">
                  {days.map((day) => {
                    const dayStr = format(day, "yyyy-MM-dd");
                    const dayClasses = classes
                      .filter((c: any) => (c.date ?? c.start_time?.split("T")[0]) === dayStr)
                      .sort((a: any, b: any) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));

                    if (!dayClasses.length && !classesLoading) return null;
                    const isToday = dayStr === todayStr;

                    return (
                      <div key={dayStr}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className={cn(
                            "text-xs font-semibold uppercase tracking-wider",
                            isToday ? "text-alma-berry" : "text-alma-ink/45"
                          )}>
                            {format(day, "EEEE d", { locale: es })}
                          </p>
                          {isToday && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-alma-oat text-alma-ink font-semibold">
                              Hoy
                            </span>
                          )}
                        </div>
                        {classesLoading ? (
                          <Skeleton className="h-14 rounded-xl" />
                        ) : (
                          <div className="space-y-2">
                            {dayClasses.map((cls: any) => {
                              const time = cls.start_time
                                ? format(new Date(cls.start_time), "HH:mm")
                                : cls.startTime ?? "";
                              return (
                                <button
                                  key={cls.id}
                                  onClick={() => setSelectedClassId(cls.id)}
                                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-alma-hairline bg-alma-mist hover:border-alma-sandstone hover:bg-alma-oat/40 transition-colors group text-left"
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-alma-ink truncate">
                                      {cls.class_type_name ?? cls.className ?? "Clase"}
                                    </p>
                                    <p className="text-xs text-alma-ink/55 nums">
                                      {time} · {cls.instructor_name ?? "Sin instructora"}
                                    </p>
                                  </div>
                                  <ChevronRight size={14} className="text-alma-ink/30 group-hover:text-alma-berry transition-colors" />
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {!classesLoading && classes.length === 0 && (
                    <div className="text-center py-16 text-alma-ink/45 text-sm">
                      <Calendar size={28} className="mx-auto mb-2 text-alma-sandstone" />
                      No hay clases programadas esta semana
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

export default Waitlist;
