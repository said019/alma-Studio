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
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { formatTime } from "@/lib/format";
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
import { WellhubClassControl } from "./WellhubClassControl";
import WeekHourGrid from "./WeekHourGrid";
import { FEATURES } from "@/config/features";

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
  isClosed: boolean;
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
        <AdminPage>
          <AdminPageHeader
            kicker="Clases · calendario semanal"
            title="Clases"
            actions={<SectionTabs aria-label="Secciones de Clases" tabs={CLASSES_SECTION_TABS} />}
          />

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
        </AdminPage>
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
        isClosed:         c.status === "closed",
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

  // Cerrar = dejar de aceptar NUEVAS reservas sin cancelar (sin reembolso). Las
  // reservas existentes siguen válidas. Distinto de Cancelar.
  const closeMutation = useMutation({
    mutationFn: (id: string) => api.put("/classes/" + id + "/close"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase cerrada", description: "Ya no acepta nuevas reservas. Las existentes siguen válidas." });
      setSheetOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo cerrar la clase",
      variant: "destructive",
    }),
  });

  const reopenMutation = useMutation({
    mutationFn: (id: string) => api.put("/classes/" + id + "/reopen"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      toast({ title: "Clase reabierta" });
      setSheetOpen(false);
    },
    onError: (e: any) => toast({
      title: e?.response?.data?.message ?? "No se pudo reabrir la clase",
      variant: "destructive",
    }),
  });

  const clearWeekMutation = useMutation({
    mutationFn: (force?: boolean) => api.delete("/classes/week", { data: { startDate: start, endDate: end, force } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const deleted = Number(res?.data?.deleted ?? 0);
      const cancelled = Number(res?.data?.bookingsCancelled ?? 0);
      toast({
        title: deleted === 1 ? "1 clase eliminada de la semana" : `${deleted} clases eliminadas de la semana`,
        description: cancelled > 0 ? `${cancelled} reserva${cancelled === 1 ? "" : "s"} cancelada${cancelled === 1 ? "" : "s"}, crédito devuelto.` : undefined,
      });
      setSheetOpen(false);
    },
    onError: async (error: any) => {
      // 409 = hay reservas activas: ofrecer forzar (cancela + devuelve crédito).
      if (error?.response?.status === 409) {
        const n = Number(error?.response?.data?.activeBookings ?? 0);
        const force = await confirm({
          title: "Hay reservas activas",
          description: `Esta semana tiene ${n} reserva${n === 1 ? "" : "s"} activa${n === 1 ? "" : "s"}. ¿Forzar la limpieza? Se cancelan y se devuelve el crédito a cada alumna.`,
          destructive: true,
          confirmLabel: "Forzar y limpiar",
          cancelLabel: "Volver",
        });
        if (force) clearWeekMutation.mutate(true);
        return;
      }
      toast({ title: error?.response?.data?.message ?? "No se pudo limpiar la semana", variant: "destructive" });
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
    if (ok) clearWeekMutation.mutate(false);
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

  const handleCloseClass = async () => {
    if (!selectedClass || closeMutation.isPending) return;
    const ok = await confirm({
      title: "¿Cerrar esta clase?",
      description: "La clase se marcará como cerrada y dejará de aceptar nuevas reservas. Las reservas existentes y los créditos NO se modifican (es distinto de cancelar).",
      confirmLabel: "Cerrar clase",
    });
    if (ok) closeMutation.mutate(selectedClass.id);
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
      {/* Week nav + summary + actions */}
      {(() => {
        const active = classes.filter((c) => !c.isCancelled);
        const bookedTotal = active.reduce((s, c) => s + (c.currentBookings ?? c.bookedCount ?? 0), 0);
        const capTotal = active.reduce((s, c) => s + (c.maxCapacity ?? 0), 0);
        const occ = capTotal ? Math.round((bookedTotal / capTotal) * 100) : 0;
        const today = new Date();
        const todayInWeek = today >= weekStart && today < addDays(weekStart, 7);
        return (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => shiftWeek(-7)}><ChevronLeft size={18} /></Button>
            <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => shiftWeek(7)}><ChevronRight size={18} /></Button>
            <span className="nums ml-1 text-base font-extrabold text-ink">{weekLabel}</span>
            <Button
              variant="ghost"
              className="underline"
              onClick={() => {
                setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
                if (isMobile) setMobileDay(format(today, "yyyy-MM-dd"));
              }}
            >
              Hoy
            </Button>
            <span className="text-[13px] text-ink-muted">
              <span className="nums">{active.length}</span> clases · <span className="nums">{bookedTotal}</span> reservas · <span className="nums">{occ}%</span> ocupación
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant="ghost"
                className="text-danger"
                onClick={handleClearWeek}
                disabled={clearWeekMutation.isPending || classes.length === 0}
              >
                {clearWeekMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                Limpiar semana
              </Button>
              <Button asChild variant="outline"><Link to="/admin/class-generator">Generar semana</Link></Button>
              <Button onClick={() => openCreate(format(todayInWeek ? today : weekStart, "yyyy-MM-dd"))}>
                <Plus size={16} aria-hidden="true" />
                Nueva clase
              </Button>
            </div>
          </div>
        );
      })()}

      {/* Empty week */}
      {!isLoadingClasses && classes.length === 0 && (
        <div className="mb-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-line-strong bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sunken text-ink">
              <CalendarDays size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Semana sin clases</p>
              <p className="text-xs text-ink/60">
                Genera la semana con la plantilla del estudio o toca un día para crear una clase.
              </p>
            </div>
          </div>
        </div>
      )}

      {isMobile ? (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-line bg-sunken p-2">
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
                        ? "border-line-strong bg-sunken text-ink"
                        : "border-line bg-canvas text-ink/60",
                    )}
                  >
                    <span className="text-[10px] uppercase">{DAYS_ES[day.getDay()]}</span>
                    <span className="nums text-base font-bold leading-none">{format(day, "d")}</span>
                    <span className="nums mt-0.5 text-[10px] text-ink/55">
                      {count} {count === 1 ? "clase" : "clases"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-line bg-sunken p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[0.72rem] uppercase tracking-widest text-ink/55">{DAYS_ES[mobileDayDate.getDay()]}</p>
                <p className="text-sm font-semibold text-ink">{format(mobileDayDate, "d 'de' MMMM", { locale: es })}</p>
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
              <div className="rounded-lg border border-dashed border-line-strong/60 p-6 text-center text-xs text-ink/55">
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
                      className="w-full rounded-xl border border-line p-3 text-left transition-colors hover:border-line-strong"
                      style={{ backgroundColor: classTint(color) }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                            <span className="truncate">{c.classTypeName ?? "Clase"}</span>
                          </p>
                          <p className="nums text-xs text-ink/60">
                            {c.startTime ? formatTime(c.startTime) : "sin hora"}
                            {c.endTime ? ` a ${formatTime(c.endTime)}` : ""}
                          </p>
                        </div>
                        {c.isCancelled ? (
                          <Badge variant="destructive" className="text-[10px]">Cancelada</Badge>
                        ) : c.isClosed ? (
                          <Badge variant="outline" className="border-line-strong/70 text-[10px] text-ink/70">Cerrada</Badge>
                        ) : (
                          <Badge variant="outline" className="border-line-strong/60 text-[10px] text-ink/70">Activa</Badge>
                        )}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {c.instructorPhoto ? (
                          <img
                            src={c.instructorPhoto}
                            alt={c.instructorName ?? ""}
                            className="h-6 w-6 rounded-full object-cover ring-1 ring-line"
                          />
                        ) : (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sunken text-[0.6rem] font-bold text-ink">
                            {(c.instructorName ?? "?")[0].toUpperCase()}
                          </span>
                        )}
                        <span className="truncate text-xs text-ink/60">{c.instructorName ?? "Sin asignar"}</span>
                        <span className="nums ml-auto text-xs text-ink/55">
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
        isLoadingClasses ? (
          <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-[480px] w-full" /></div>
        ) : (
          <WeekHourGrid
            days={days}
            classes={classes}
            now={new Date()}
            selectedId={sheetOpen ? selectedClass?.id ?? null : null}
            onSelect={(c) => { setSelectedClass(c as ClassInstance); setSheetOpen(true); }}
            onCreate={openCreate}
          />
        )
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar clase" : "Nueva clase"}</DialogTitle></DialogHeader>
          <form onSubmit={form.handleSubmit((d) => editingId ? editMutation.mutate({ id: editingId, d }) : createMutation.mutate(d))} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">Clase</legend>
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
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">Horario</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label>Inicio</Label><Input type="datetime-local" className="nums" {...form.register("startTime")} /></div>
                <div className="space-y-1"><Label>Fin</Label><Input type="datetime-local" className="nums" {...form.register("endTime")} /></div>
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">Cupo y notas</legend>
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
          <SheetHeader>
            <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {selectedClass?.startTime
                ? `${format(new Date(selectedClass.startTime), "EEEE d · HH:mm", { locale: es })}${selectedClass.endTime ? `–${format(new Date(selectedClass.endTime), "HH:mm")}` : ""}`
                : "Sin hora"}
            </p>
            <SheetTitle className="font-display text-xl font-semibold">{selectedClass?.classTypeName ?? "Clase"}</SheetTitle>
          </SheetHeader>
          {selectedClass && (() => {
            const booked = selectedClass.currentBookings ?? selectedClass.bookedCount ?? 0;
            const cap = selectedClass.maxCapacity ?? selectedClass.capacity ?? 0;
            const full = cap > 0 && booked >= cap;
            const waiting = ((rosterData?.data?.roster ?? []) as { status: string }[]).filter((r) => r.status === "waitlist").length;
            return (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-muted">con {selectedClass.instructorName ?? "—"}</span>
                {full ? <Badge variant="attention">Llena · {booked}/{cap}</Badge> : <span className="nums text-sm font-bold">{booked}/{cap}</span>}
                {waiting > 0 && <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">{waiting} en espera</span>}
              </div>
            );
          })()}
          {selectedClass && (
            <div className="mt-6 space-y-4 text-sm text-ink">
              {/* Cupo editable: +/- en línea para sumar o quitar lugares. */}
              {(() => {
                const occupied = selectedClass.bookedCount ?? selectedClass.currentBookings ?? 0;
                const cap = selectedClass.maxCapacity ?? selectedClass.capacity ?? 0;
                const isFull = occupied >= cap;
                const canShrink = cap > Math.max(1, occupied);
                return (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
                    <div>
                      <span className="font-medium">Cupo:</span>{" "}
                      <span className={cn("nums", isFull && "font-semibold text-ink")}>
                        {occupied} / {cap || "?"}
                      </span>
                      {isFull && <span className="ml-2 text-[10px] uppercase tracking-wider text-ink">Llena</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => capacityMutation.mutate({ id: selectedClass.id, newCap: Math.max(1, cap - 1) })}
                        disabled={!canShrink || capacityMutation.isPending}
                        className="h-7 w-7 rounded-md border border-line bg-canvas text-sm font-semibold text-ink transition-colors hover:bg-sunken/50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Quitar 1 lugar"
                      >
                        −
                      </button>
                      <button
                        type="button"
                        onClick={() => capacityMutation.mutate({ id: selectedClass.id, newCap: cap + 1 })}
                        disabled={capacityMutation.isPending}
                        className="h-7 w-7 rounded-md border border-line bg-canvas text-sm font-semibold text-ink transition-colors hover:bg-sunken/50"
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
                    <div className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider text-ink/55">
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
                      <p className="rounded-lg border border-dashed border-line-strong/60 px-3 py-2 text-xs text-ink/55">
                        Sin reservas aún
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {roster.map((r, i) => {
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
                            status === "checked_in" ? "border-success/30 bg-success/10 text-success"
                            : status === "waitlist" ? "border-line-strong/60 bg-canvas text-ink"
                            : status === "no_show" ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-line bg-sunken/60 text-ink";
                          return (
                            <li key={r.bookingId ?? r.booking_id ?? i} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-ink">{name}</p>
                                {planLabel && <p className="truncate text-[11px] text-ink/55">{planLabel}</p>}
                              </div>
                              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusClr}`}>
                                {statusLabel}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <Button asChild variant="outline" className="mt-3 w-full border-line-strong/70 text-ink">
                      <Link to={`/admin/bookings?clase=${selectedClass.id}`}>
                        Gestionar en Reservas
                        <ArrowRight size={14} className="ml-1.5" />
                      </Link>
                    </Button>
                  </div>
                );
              })()}
              {!selectedClass.isCancelled && FEATURES.partnerPlatforms && (
                <div className="pt-2">
                  <WellhubClassControl classId={selectedClass.id} />
                </div>
              )}
              <div className="flex flex-col gap-2 pt-4">
                {!selectedClass.isCancelled && !selectedClass.isClosed && (
                  <Button variant="outline" className="border-line-strong/70 text-ink" onClick={() => openEdit(selectedClass)}>
                    Editar clase
                  </Button>
                )}
                {!selectedClass.isCancelled && !selectedClass.isClosed && (
                  <Button variant="outline" className="border-line-strong/70 text-ink" onClick={handleCloseClass} disabled={closeMutation.isPending}>
                    {closeMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Cerrar clase
                  </Button>
                )}
                {selectedClass.isClosed && (
                  <Button variant="outline" className="border-line-strong/70 text-ink" onClick={() => reopenMutation.mutate(selectedClass.id)} disabled={reopenMutation.isPending}>
                    {reopenMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Reabrir clase
                  </Button>
                )}
                {!selectedClass.isCancelled && (
                  <Button variant="destructive" onClick={handleCancelClass} disabled={cancelMutation.isPending}>
                    {cancelMutation.isPending && <Loader2 size={14} className="mr-2 animate-spin" />}
                    Cancelar clase
                  </Button>
                )}
                {selectedClass.isClosed && <Badge variant="outline" className="w-fit border-line-strong/70 text-ink/70">Clase cerrada</Badge>}
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
