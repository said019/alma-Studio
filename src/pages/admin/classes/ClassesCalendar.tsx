import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, startOfWeek, addDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { formatDateTime, formatTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Loader2, ArrowRight } from "lucide-react";
import { resolveClassColor, classTint, CLASSES_SECTION_TABS } from "./palette";

/* ── Types ── */
interface ClassInstance {
  id: string;
  classTypeId: string;
  classTypeName?: string;
  classTypeColor?: string;
  instructorId: string;
  instructorName?: string;
  instructorPhoto?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  capacity?: number;
  bookedCount?: number;
  currentBookings?: number;
  isCancelled: boolean;
  notes?: string;
}

interface ClassType {
  id: string;
  name: string;
  color: string;
  category?: string;
  defaultDuration?: number;
  durationMin?: number;
  maxCapacity?: number;
  capacity?: number;
  isActive?: boolean;
}

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/* ── Schema ── */
const classSchema = z.object({
  classTypeId: z.string().min(1),
  instructorId: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  maxCapacity: z.coerce.number().min(1),
  notes: z.string().optional(),
});
type ClassFormData = z.infer<typeof classSchema>;

/* ═══════════════════════════════════════════════════════════════════
   PAGE
   ═══════════════════════════════════════════════════════════════════ */
const ClassesCalendar = () => {
  const typesQuery = useQuery<{ data: ClassType[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
  });
  const types = Array.isArray(typesQuery.data?.data) ? typesQuery.data.data : [];

  const instructorsQuery = useQuery<{ data: { id: string; displayName: string }[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(instructorsQuery.data?.data) ? instructorsQuery.data.data : [];

  const referenceError = typesQuery.isError || instructorsQuery.isError;

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <SectionTabs tabs={CLASSES_SECTION_TABS} />
          <div className="mb-6">
            <h1 className="admin-title text-alma-ink">Clases</h1>
            <p className="mt-1 text-sm text-alma-ink/55">Calendario semanal del estudio.</p>
          </div>

          {referenceError ? (
            <ErrorState
              description="No pudimos cargar los tipos de clase o las instructoras. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => {
                typesQuery.refetch();
                instructorsQuery.refetch();
              }}
            />
          ) : (
            <CalendarView types={types} instructors={instructors} />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
};

/* ═══════════════════════════════════════════════════════════════════
   CALENDAR
   ═══════════════════════════════════════════════════════════════════ */
function CalendarView({
  types,
  instructors,
}: {
  types: ClassType[];
  instructors: { id: string; displayName: string }[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { confirm, dialog } = useConfirm();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassInstance | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mobileDay, setMobileDay] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Roster (alumnas inscritas) de la clase seleccionada, para mostrarlo en el
  // panel lateral. Solo corre cuando el sheet está abierto.
  const rosterQuery = useQuery<{ data: { class: any; roster: any[] } }>({
    queryKey: ["class-roster-sheet", selectedClass?.id],
    enabled: sheetOpen && !!selectedClass?.id,
    queryFn: async () => (await api.get(`/classes/${selectedClass!.id}/roster`)).data,
  });
  const rosterData = rosterQuery.data;

  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");

  const classesQuery = useQuery<{ data: ClassInstance[] }>({
    queryKey: ["classes", start, end],
    queryFn: async () => {
      const res = await api.get("/classes?start=" + start + "&end=" + end);
      const raw: any[] = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      // Normalise snake_case → camelCase expected by ClassInstance
      const mapped: ClassInstance[] = raw.map((c: any) => ({
        id:               c.id,
        classTypeId:      c.class_type_id,
        classTypeName:    c.class_type_name,
        classTypeColor:   c.class_type_color,
        instructorId:     c.instructor_id,
        instructorName:   c.instructor_name,
        instructorPhoto:  c.instructor_photo,
        startTime:        c.start_time,   // already full ISO from server normalisation
        endTime:          c.end_time,
        maxCapacity:      c.max_capacity ?? c.capacity ?? 5,
        capacity:         c.max_capacity ?? c.capacity ?? 5,
        bookedCount:      c.current_bookings ?? 0,
        currentBookings:  c.current_bookings ?? 0,
        isCancelled:      c.status === "cancelled" || c.is_cancelled === true,
        notes:            c.notes,
      }));
      return { data: mapped };
    },
  });
  const classes = Array.isArray(classesQuery.data?.data) ? classesQuery.data.data : [];
  const isLoadingClasses = classesQuery.isLoading;

  const form = useForm<ClassFormData>({ resolver: zodResolver(classSchema) });

  const createMutation = useMutation({
    mutationFn: (d: ClassFormData) => api.post("/classes", d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase creada" });
      setCreateOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo crear la clase",
      variant: "destructive",
    }),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: ClassFormData }) => api.put(`/admin/classes/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase actualizada" });
      setCreateOpen(false);
      setEditingId(null);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo actualizar la clase",
      variant: "destructive",
    }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.put("/classes/" + id + "/cancel"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase cancelada" });
      setSheetOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo cancelar la clase",
      variant: "destructive",
    }),
  });

  const clearWeekMutation = useMutation({
    mutationFn: () => api.delete("/classes/week", { data: { startDate: start, endDate: end } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const deleted = Number(res?.data?.deleted ?? 0);
      toast({
        title: deleted === 1 ? "1 clase eliminada de la semana" : `${deleted} clases eliminadas de la semana`,
      });
      setSheetOpen(false);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "No se pudo limpiar la semana";
      toast({ title: message, variant: "destructive" });
    },
  });

  // Editar cupo (max_capacity) de UNA clase específica.
  const capacityMutation = useMutation({
    mutationFn: ({ id, newCap }: { id: string; newCap: number }) =>
      api.put(`/admin/classes/${id}`, { maxCapacity: newCap }),
    onSuccess: (res: any, vars) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      qc.invalidateQueries({ queryKey: ["class-roster-sheet"] });
      const newCap = res?.data?.data?.max_capacity ?? vars.newCap;
      toast({ title: `Cupo actualizado a ${newCap}` });
      // Reflejar en el sheet sin esperar al refetch
      setSelectedClass((cur) => cur && cur.id === vars.id
        ? { ...cur, maxCapacity: newCap, capacity: newCap }
        : cur);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo cambiar el cupo",
      variant: "destructive",
    }),
  });

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const classesForDay = (date: Date) =>
    classes.filter((c) => c.startTime?.startsWith(format(date, "yyyy-MM-dd")));

  useEffect(() => {
    const currentWeekDays = Array.from({ length: 7 }, (_, i) =>
      format(addDays(weekStart, i), "yyyy-MM-dd"),
    );
    if (!currentWeekDays.includes(mobileDay)) {
      setMobileDay(currentWeekDays[0]);
    }
  }, [weekStart, mobileDay]);

  const openCreate = (date: string) => {
    setEditingId(null);
    form.reset({ startTime: date + "T09:00", endTime: date + "T10:00", maxCapacity: 5 });
    setCreateOpen(true);
  };

  // Editar una clase existente: reusa el mismo formulario, precargado.
  const openEdit = (cls: any) => {
    const fmt = (t: any) => (t ? String(t).slice(0, 16) : "");
    form.reset({
      classTypeId: cls.classTypeId ?? cls.class_type_id ?? "",
      instructorId: cls.instructorId ?? cls.instructor_id ?? "",
      startTime: fmt(cls.startTime ?? cls.start_time),
      endTime: fmt(cls.endTime ?? cls.end_time),
      maxCapacity: cls.maxCapacity ?? cls.max_capacity ?? 5,
      notes: cls.notes ?? "",
    });
    setEditingId(cls.id);
    setSheetOpen(false);
    setCreateOpen(true);
  };

  const shiftWeek = (offset: number) => {
    const next = addDays(weekStart, offset);
    setWeekStart(next);
    if (isMobile) setMobileDay(format(next, "yyyy-MM-dd"));
  };

  const weekLabel = `${format(weekStart, "d MMM", { locale: es })} al ${format(addDays(weekStart, 6), "d MMM yyyy", { locale: es })}`;

  const handleClearWeek = async () => {
    if (classes.length === 0 || clearWeekMutation.isPending) return;
    const ok = await confirm({
      title: "¿Limpiar toda la semana?",
      description:
        classes.length === 1
          ? `Se eliminará la única clase de la semana (${weekLabel}), junto con sus reservas. Esta acción no se puede deshacer.`
          : `Se eliminarán las ${classes.length} clases de la semana (${weekLabel}), junto con sus reservas. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar clases",
      destructive: true,
    });
    if (ok) clearWeekMutation.mutate();
  };

  const handleCancelClass = async () => {
    if (!selectedClass || cancelMutation.isPending) return;
    const occupied = selectedClass.bookedCount ?? selectedClass.currentBookings ?? 0;
    const ok = await confirm({
      title: "¿Cancelar esta clase?",
      description:
        occupied > 0
          ? `Hay ${occupied} ${occupied === 1 ? "reserva activa" : "reservas activas"}. La clase quedará cancelada y habrá que avisar a las clientas inscritas.`
          : "La clase quedará cancelada y dejará de aceptar reservas.",
      confirmLabel: "Cancelar clase",
      destructive: true,
    });
    if (ok) cancelMutation.mutate(selectedClass.id);
  };

  const mobileDayDate = parseISO(mobileDay);
  const mobileClasses = classes.filter((c) => c.startTime?.startsWith(mobileDay));

  if (classesQuery.isError) {
    return (
      <>
        <ErrorState
          description="No pudimos cargar las clases de la semana. Revisa tu conexión y vuelve a intentarlo."
          onRetry={() => classesQuery.refetch()}
        />
        {dialog}
      </>
    );
  }

  return (
    <>
      {/* Week nav */}
      <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-center gap-2 sm:gap-3">
          <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => shiftWeek(-7)}>
            <ChevronLeft size={14} />
          </Button>
          <span className="nums text-center text-xs font-medium text-alma-ink sm:text-sm">{weekLabel}</span>
          <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => shiftWeek(7)}>
            <ChevronRight size={14} />
          </Button>
        </div>
        <div className="flex justify-center sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={handleClearWeek}
            disabled={clearWeekMutation.isPending || classes.length === 0}
            className="min-h-[44px] border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            {clearWeekMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
            Limpiar semana
          </Button>
        </div>
      </div>

      {/* Empty week */}
      {!isLoadingClasses && classes.length === 0 && (
        <div className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-dashed border-alma-sandstone/70 bg-alma-mist p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-alma-oat text-alma-berry">
              <CalendarDays size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-alma-ink">Semana sin clases</p>
              <p className="text-xs text-alma-ink/60">
                Genera la semana con la plantilla del estudio o toca un día para crear una clase.
              </p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline" className="border-alma-sandstone text-alma-ink">
            <Link to="/admin/class-generator">Generar semana</Link>
          </Button>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-alma-hairline bg-alma-mist p-2">
            <div className="flex min-w-max gap-2">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const isActive = dayKey === mobileDay;
                const count = classesForDay(day).length;
                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => setMobileDay(dayKey)}
                    className={cn(
                      "flex min-h-[52px] min-w-[76px] flex-col items-center justify-center rounded-xl border px-2 text-xs transition-colors",
                      isActive
                        ? "border-alma-sandstone bg-alma-oat text-alma-ink"
                        : "border-alma-hairline bg-alma-canvas text-alma-ink/60",
                    )}
                  >
                    <span className="text-[10px] uppercase">{DAYS_ES[day.getDay()]}</span>
                    <span className="nums text-base font-bold leading-none">{format(day, "d")}</span>
                    <span className="nums mt-0.5 text-[10px] text-alma-ink/55">
                      {count} {count === 1 ? "clase" : "clases"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-alma-hairline bg-alma-mist p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[0.72rem] uppercase tracking-widest text-alma-ink/55">{DAYS_ES[mobileDayDate.getDay()]}</p>
                <p className="text-sm font-semibold text-alma-ink">{format(mobileDayDate, "d 'de' MMMM", { locale: es })}</p>
              </div>
              <Button size="sm" className="h-9" onClick={() => openCreate(mobileDay)}>
                <Plus size={14} className="mr-1" /> Nueva
              </Button>
            </div>

            {isLoadingClasses ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : mobileClasses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-alma-sandstone/60 p-6 text-center text-xs text-alma-ink/55">
                Sin clases programadas para este día.
              </div>
            ) : (
              <div className="space-y-2">
                {mobileClasses.map((c) => {
                  const color = resolveClassColor(c.classTypeColor);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                      className="w-full rounded-xl border border-alma-hairline p-3 text-left transition-colors hover:border-alma-sandstone"
                      style={{ backgroundColor: classTint(color) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-alma-ink">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                            <span className="truncate">{c.classTypeName ?? "Clase"}</span>
                          </p>
                          <p className="nums text-xs text-alma-ink/60">
                            {c.startTime ? formatTime(c.startTime) : "sin hora"}
                            {c.endTime ? ` a ${formatTime(c.endTime)}` : ""}
                          </p>
                        </div>
                        {c.isCancelled ? (
                          <Badge variant="destructive" className="text-[10px]">Cancelada</Badge>
                        ) : (
                          <Badge variant="outline" className="border-alma-sandstone/60 text-[10px] text-alma-ink/70">Activa</Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {c.instructorPhoto ? (
                          <img
                            src={c.instructorPhoto}
                            alt={c.instructorName ?? ""}
                            className="h-6 w-6 rounded-full object-cover ring-1 ring-alma-hairline"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-alma-oat text-[0.6rem] font-bold text-alma-ink">
                            {(c.instructorName ?? "?")[0].toUpperCase()}
                          </span>
                        )}
                        <span className="truncate text-xs text-alma-ink/60">{c.instructorName ?? "Sin asignar"}</span>
                        <span className="nums ml-auto text-xs text-alma-ink/55">
                          {(c.bookedCount ?? c.currentBookings ?? 0)}/{c.maxCapacity ?? c.capacity ?? "?"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-7 gap-2">
            {days.map((day, i) => {
              const dayClasses = classesForDay(day);
              return (
                <div key={i} className="min-h-[320px]">
                  <button
                    type="button"
                    className="mb-2 w-full text-center text-xs font-medium text-alma-ink/55 transition-colors hover:text-alma-ink"
                    onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                  >
                    <div className="uppercase tracking-wide">{DAYS_ES[day.getDay()]}</div>
                    <div className="nums text-lg font-semibold text-alma-ink">{format(day, "d")}</div>
                  </button>
                  <div className="space-y-1">
                    {isLoadingClasses
                      ? Array.from({ length: 2 }).map((_, j) => (
                          <Skeleton key={j} className="h-20 w-full rounded-lg" />
                        ))
                      : dayClasses.map((c) => {
                          const color = resolveClassColor(c.classTypeColor);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedClass(c); setSheetOpen(true); }}
                              className={cn(
                                "w-full rounded-lg border border-alma-hairline px-2 py-1.5 text-left text-xs transition-colors hover:border-alma-sandstone",
                                c.isCancelled && "opacity-60",
                              )}
                              style={{ backgroundColor: classTint(color) }}
                            >
                              <div className="flex items-center gap-1.5">
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                                <span className="truncate font-semibold text-alma-ink">{c.classTypeName ?? "Clase"}</span>
                              </div>
                              <div className="nums text-alma-ink/60">{c.startTime ? formatTime(c.startTime) : ""}</div>
                              <div className="mt-1 flex items-center gap-1">
                                {c.instructorPhoto ? (
                                  <img
                                    src={c.instructorPhoto}
                                    alt={c.instructorName ?? ""}
                                    className="h-4 w-4 rounded-full object-cover ring-1 ring-alma-hairline"
                                  />
                                ) : (
                                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-alma-oat text-[0.5rem] font-bold text-alma-ink">
                                    {(c.instructorName ?? "?")[0].toUpperCase()}
                                  </span>
                                )}
                                <span className="truncate text-[0.65rem] text-alma-ink/60">{c.instructorName ?? "Sin asignar"}</span>
                              </div>
                              <div className="nums mt-0.5 text-alma-ink/55">
                                {(c.bookedCount ?? c.currentBookings ?? 0)}/{c.maxCapacity ?? c.capacity ?? "?"}
                              </div>
                              {c.isCancelled && <Badge variant="destructive" className="mt-1 px-1 text-[0.6rem]">Cancelada</Badge>}
                            </button>
                          );
                        })}
                    <button
                      type="button"
                      aria-label={`Crear clase el ${format(day, "d 'de' MMMM", { locale: es })}`}
                      onClick={() => openCreate(format(day, "yyyy-MM-dd"))}
                      className="w-full py-1 text-center text-alma-ink/30 transition-colors hover:text-alma-ink/70"
                    >
                      <Plus size={12} className="mx-auto" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar clase" : "Nueva clase"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editingId ? editMutation.mutate({ id: editingId, d }) : createMutation.mutate(d))} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">Clase</legend>
              <div className="space-y-1">
                <Label>Tipo de clase</Label>
                <Select value={form.watch("classTypeId")} onValueChange={(v) => form.setValue("classTypeId", v, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: resolveClassColor(t.color) }} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Instructora</Label>
                <Select value={form.watch("instructorId")} onValueChange={(v) => form.setValue("instructorId", v, { shouldValidate: true })}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar instructora" /></SelectTrigger>
                  <SelectContent>
                    {instructors.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">Horario</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Inicio</Label><Input type="datetime-local" className="nums" {...form.register("startTime")} /></div>
                <div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" className="nums" {...form.register("endTime")} /></div>
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">Cupo y notas</legend>
              <div className="space-y-1"><Label>Capacidad máxima</Label><Input type="number" className="nums" {...form.register("maxCapacity")} /></div>
              <div className="space-y-1"><Label>Notas</Label><Input {...form.register("notes")} /></div>
            </fieldset>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || editMutation.isPending}>
                {(createMutation.isPending || editMutation.isPending) && <Loader2 size={14} className="mr-2 animate-spin" />}
                {editingId ? "Guardar cambios" : "Crear clase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>{selectedClass?.classTypeName ?? "Clase"}</SheetTitle></SheetHeader>
          {selectedClass && (
            <div className="mt-6 space-y-4 text-sm text-alma-ink">
              {/* Instructora con avatar */}
              <div className="flex items-center gap-3">
                {selectedClass.instructorPhoto ? (
                  <img
                    src={selectedClass.instructorPhoto}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover ring-1 ring-alma-sandstone"
                  />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-alma-oat text-sm font-bold text-alma-ink">
                    {(selectedClass.instructorName ?? "?")[0].toUpperCase()}
                  </span>
                )}
                <div>
                  <div className="font-medium">{selectedClass.instructorName ?? selectedClass.instructorId}</div>
                  <div className="text-xs text-alma-ink/55">Instructora</div>
                </div>
              </div>
              <div>
                <span className="font-medium">Inicio:</span>{" "}
                <span className="nums">{selectedClass.startTime ? formatDateTime(selectedClass.startTime) : "Sin hora"}</span>
              </div>
              {/* Cupo editable: +/- en línea para sumar o quitar lugares. */}
              {(() => {
                const occupied = selectedClass.bookedCount ?? selectedClass.currentBookings ?? 0;
                const cap = selectedClass.maxCapacity ?? selectedClass.capacity ?? 0;
                const isFull = occupied >= cap;
                const canShrink = cap > Math.max(1, occupied);
                return (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-alma-hairline bg-alma-mist px-3 py-2">
                    <div>
                      <span className="font-medium">Cupo:</span>{" "}
                      <span className={cn("nums", isFull && "font-semibold text-alma-berry")}>
                        {occupied} / {cap || "?"}
                      </span>
                      {isFull && <span className="ml-2 text-[10px] uppercase tracking-wider text-alma-berry">Llena</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => capacityMutation.mutate({ id: selectedClass.id, newCap: Math.max(1, cap - 1) })}
                        disabled={!canShrink || capacityMutation.isPending}
                        className="h-7 w-7 rounded-md border border-alma-hairline bg-alma-canvas text-sm font-semibold text-alma-ink transition-colors hover:bg-alma-oat/50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Quitar 1 lugar"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => capacityMutation.mutate({ id: selectedClass.id, newCap: cap + 1 })}
                        disabled={capacityMutation.isPending}
                        className="h-7 w-7 rounded-md border border-alma-hairline bg-alma-canvas text-sm font-semibold text-alma-ink transition-colors hover:bg-alma-oat/50"
                        title="Agregar 1 lugar"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })()}
              {selectedClass.notes && <div><span className="font-medium">Notas:</span> {selectedClass.notes}</div>}

              {/* ── Inscritas (vista rápida; la gestión vive en Reservas) ── */}
              {(() => {
                const roster: any[] = rosterData?.data?.roster ?? [];
                const activos = roster.filter((r) => r.status === "confirmed" || r.status === "checked_in");
                const espera = roster.filter((r) => r.status === "waitlist");
                const noShow = roster.filter((r) => r.status === "no_show");
                return (
                  <div className="pt-1">
                    <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-alma-ink/55">
                      Inscritas <span className="nums">({activos.length})</span>
                      {espera.length > 0 && <span className="ml-1 font-normal opacity-70">· {espera.length} en espera</span>}
                      {noShow.length > 0 && <span className="ml-1 font-normal opacity-70">· {noShow.length} no asistió</span>}
                    </div>
                    {rosterQuery.isLoading ? (
                      <div className="space-y-1.5">
                        <Skeleton className="h-10 w-full rounded-lg" />
                        <Skeleton className="h-10 w-full rounded-lg" />
                      </div>
                    ) : rosterQuery.isError ? (
                      <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                        No pudimos cargar la lista.{" "}
                        <button type="button" className="font-semibold underline" onClick={() => rosterQuery.refetch()}>
                          Reintentar
                        </button>
                      </p>
                    ) : roster.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-alma-sandstone/60 px-3 py-2 text-xs text-alma-ink/55">
                        Sin reservas aún
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {roster.map((r) => {
                          const isWalkIn = !r.userId && !r.user_id;
                          const name = r.displayName ?? r.display_name ?? r.guestName ?? r.guest_name ?? "Sin nombre";
                          const planLabel = isWalkIn ? "Walk-in" : (r.planName ?? r.plan_name ?? "");
                          const status = r.status;
                          const statusLabel =
                            status === "confirmed" ? "Confirmada"
                            : status === "checked_in" ? "Check-in"
                            : status === "waitlist" ? "En espera"
                            : status === "no_show" ? "No asistió"
                            : status;
                          const statusClr =
                            status === "checked_in" ? "border-alma-olive/30 bg-alma-olive/10 text-alma-olive"
                            : status === "waitlist" ? "border-alma-sandstone/60 bg-alma-canvas text-alma-berry"
                            : status === "no_show" ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-alma-hairline bg-alma-oat/60 text-alma-ink";
                          return (
                            <li key={r.bookingId ?? r.booking_id} className="flex items-center justify-between gap-2 rounded-lg border border-alma-hairline bg-alma-mist px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-alma-ink">{name}</p>
                                {planLabel && <p className="truncate text-[11px] text-alma-ink/55">{planLabel}</p>}
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClr}`}>
                                {statusLabel}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Button asChild variant="outline" className="mt-3 w-full border-alma-sandstone/70 text-alma-ink">
                      <Link to="/admin/bookings">
                        Gestionar en Reservas
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })()}
              <div className="flex flex-col gap-2 pt-4">
                {!selectedClass.isCancelled && (
                  <Button variant="outline" className="border-alma-sandstone/70 text-alma-ink" onClick={() => openEdit(selectedClass)}>
                    Editar clase
                  </Button>
                )}
                {!selectedClass.isCancelled && (
                  <Button variant="destructive" onClick={handleCancelClass} disabled={cancelMutation.isPending}>
                    {cancelMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Cancelar clase
                  </Button>
                )}
                {selectedClass.isCancelled && <Badge variant="destructive" className="w-fit">Clase cancelada</Badge>}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {dialog}
    </>
  );
}

export default ClassesCalendar;
