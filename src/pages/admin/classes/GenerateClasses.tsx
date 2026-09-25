import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDayOfInterval, isSameDay, parseISO } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CalendarDays, Loader2 } from "lucide-react";
import { resolveClassColor, CLASSES_SECTION_TABS } from "./palette";
import { FEATURES } from "@/config/features";
import { previewMonths, validateGenerate } from "./generate-helpers";

interface ClassTypeOption {
  id: string;
  name: string;
  color?: string;
}

const GENERATE_DAYS = [
  { label: "Lun", value: 1 },
  { label: "Mar", value: 2 },
  { label: "Mié", value: 3 },
  { label: "Jue", value: 4 },
  { label: "Vie", value: 5 },
  { label: "Sáb", value: 6 },
  { label: "Dom", value: 0 },
];

const STEP_LABELS = ["Clase e instructora", "Rango de fechas", "Días de la semana", "Horario y cupo"];

const GenerateClasses = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();

  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [classTypeId, setClassTypeId] = useState("");
  const [instructorId, setInstructorId] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(5);

  const [presetInstructorId, setPresetInstructorId] = useState("");
  const [presetWeeks, setPresetWeeks] = useState(4);

  const typesQuery = useQuery<{ data: ClassTypeOption[] }>({
    queryKey: ["class-types"],
    queryFn: async () => (await api.get("/class-types")).data,
  });
  const types = Array.isArray(typesQuery.data?.data) ? typesQuery.data.data : [];

  const instructorsQuery = useQuery<{ data: { id: string; displayName: string }[] }>({
    queryKey: ["instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
  });
  const instructors = Array.isArray(instructorsQuery.data?.data) ? instructorsQuery.data.data : [];

  const resetAlmaMutation = useMutation({
    mutationFn: (params: { generate: boolean; instructorId?: string; weeks?: number }) =>
      api.post("/schedules/reset-alma", {
        generateClasses: params.generate,
        weeksAhead: params.weeks,
        instructorId: params.instructorId,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      const created = res.data?.data?.classesCreated ?? 0;
      const skipped = res.data?.data?.classesSkipped ?? 0;
      toast({
        title: "Horario Alma aplicado",
        description: created > 0
          ? `${created} clases creadas${skipped ? ` · ${skipped} ya existían` : ""}.`
          : (res.data?.message || "Plantilla guardada"),
      });
    },
    onError: (err: any) =>
      toast({
        title: err?.response?.data?.message || "No se pudo aplicar el horario",
        variant: "destructive",
      }),
  });

  const selectedType = types.find((t) => t.id === classTypeId);
  const selectedInstructor = instructors.find((i) => i.id === instructorId);

  // Vista previa: cuántas clases se generarán
  const preview = useMemo(() => {
    if (!startDate || !endDate || !selectedDays.length) return [];
    try {
      const days = eachDayOfInterval({
        start: parseISO(startDate),
        end: parseISO(endDate),
      });
      return days.filter((d) => selectedDays.includes(d.getDay()));
    } catch {
      return [];
    }
  }, [startDate, endDate, selectedDays]);

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post("/classes/generate", {
        classTypeId,
        instructorId,
        startDate,
        endDate,
        daysOfWeek: selectedDays,
        startTime,
        endTime,
        maxCapacity,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["classes"] });
      const created = Number(res.data?.created ?? 0);
      toast({ title: created === 1 ? "1 clase generada" : `${created} clases generadas` });
    },
    onError: (error: any) =>
      toast({
        title: error?.response?.data?.message ?? "Error generando clases",
        variant: "destructive",
      }),
  });

  const handlePresetGenerate = async () => {
    const totalSlots = presetWeeks * 23;
    const ok = await confirm({
      title: "¿Aplicar el horario Alma?",
      description: `Se crearán hasta ${totalSlots} clases (${presetWeeks} ${presetWeeks === 1 ? "semana" : "semanas"} por 23 horarios) con la instructora seleccionada. Las clases que ya existan se omiten.`,
      confirmLabel: "Aplicar y generar",
    });
    if (ok) resetAlmaMutation.mutate({ generate: true, instructorId: presetInstructorId, weeks: presetWeeks });
  };

  const handlePresetTemplateOnly = async () => {
    const ok = await confirm({
      title: "¿Guardar solo la plantilla?",
      description: "Se guarda la plantilla de 23 horarios semanales sin crear clases reales en el calendario.",
      confirmLabel: "Guardar plantilla",
    });
    if (ok) resetAlmaMutation.mutate({ generate: false });
  };

  const toggleDay = (v: number) => {
    setSelectedDays((prev) =>
      prev.includes(v) ? prev.filter((d) => d !== v) : [...prev, v]
    );
  };

  const canGenerate = Boolean(classTypeId && instructorId && startDate && endDate && selectedDays.length > 0);
  const errors = validateGenerate({ startTime, endTime, maxCapacity });
  const canSubmit = canGenerate && !errors.time && !errors.capacity;
  const months = previewMonths(preview);
  const referenceError = typesQuery.isError || instructorsQuery.isError;
  const referenceLoading = typesQuery.isLoading || instructorsQuery.isLoading;

  const stepBadge = (n: number) => (
    <span className="nums flex h-6 w-6 items-center justify-center rounded-full bg-sunken text-xs font-bold text-ink">
      {n}
    </span>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Clases"
            title="Generar clases"
            subtitle="Aplica el horario oficial del estudio o crea clases en bloque para un rango de fechas."
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
          ) : referenceLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-48 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="flex flex-col gap-4">
                {/* ── Preset: Horario oficial del estudio ── */}
                <Panel className="flex flex-col gap-4 p-6">
                  <div>
                    <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Plantilla del estudio</p>
                    <h2 className="text-base font-extrabold">Horario oficial</h2>
                    <p className="nums mt-0.5 text-xs text-ink/60">
                      Lun a Vie: 7am, 8am, 7pm y 8pm · Sáb: 7am, 8am y 9am · 23 horarios por semana
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-ink/70">Instructora</Label>
                      <Select value={presetInstructorId} onValueChange={setPresetInstructorId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar instructora" />
                        </SelectTrigger>
                        <SelectContent>
                          {instructors.map((inst) => (
                            <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-ink/70">Semanas a generar</Label>
                      <Select value={String(presetWeeks)} onValueChange={(v) => setPresetWeeks(Number(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 4, 6, 8, 12].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n} semana{n === 1 ? "" : "s"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      onClick={handlePresetGenerate}
                      disabled={resetAlmaMutation.isPending || !presetInstructorId}
                    >
                      {resetAlmaMutation.isPending ? (
                        <Loader2 size={14} className="mr-2 animate-spin" />
                      ) : (
                        <CalendarDays size={14} className="mr-2" />
                      )}
                      Aplicar y generar clases
                    </Button>
                    {FEATURES.scheduleTemplates && (
                      <Button
                        onClick={handlePresetTemplateOnly}
                        disabled={resetAlmaMutation.isPending}
                        variant="outline"
                        className="border-line-strong/70 text-ink"
                      >
                        Solo plantilla
                      </Button>
                    )}
                  </div>
                  {!presetInstructorId && instructors.length === 0 && (
                    <p className="text-xs text-ink">
                      Crea una instructora primero en la sección{" "}
                      <Link to="/admin/staff" className="font-semibold underline">Instructoras</Link>.
                    </p>
                  )}
                  {!presetInstructorId && instructors.length > 0 && (
                    <p className="text-xs text-ink/55">
                      Elige una instructora para activar el botón.
                    </p>
                  )}
                </Panel>

                {/* ── Crear clases en bloque ── */}
                <Panel className="p-6">
                  <h2 className="mb-4 text-base font-extrabold">Crear clases en bloque</h2>
                  <div className="flex flex-col gap-4">
                    {/* ── Step 1: Class type + Instructor ── */}
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-2">
                        {stepBadge(1)}
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">{STEP_LABELS[0]}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Tipo de clase</Label>
                          <Select onValueChange={setClassTypeId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar tipo" />
                            </SelectTrigger>
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
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Instructora</Label>
                          <Select onValueChange={setInstructorId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar instructora" />
                            </SelectTrigger>
                            <SelectContent>
                              {instructors.map((inst) => (
                                <SelectItem key={inst.id} value={inst.id}>{inst.displayName}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* ── Step 2: Date range ── */}
                    <div className="flex flex-col gap-4 border-t border-line pt-4">
                      <div className="flex items-center gap-2">
                        {stepBadge(2)}
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">{STEP_LABELS[1]}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Fecha inicio</Label>
                          <DatePicker value={startDate} onChange={setStartDate} placeholder="Desde" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Fecha fin</Label>
                          <DatePicker value={endDate} onChange={setEndDate} placeholder="Hasta" min={startDate} />
                        </div>
                      </div>
                    </div>

                    {/* ── Step 3: Days of week ── */}
                    <div className="flex flex-col gap-4 border-t border-line pt-4">
                      <div className="flex items-center gap-2">
                        {stepBadge(3)}
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">{STEP_LABELS[2]}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {GENERATE_DAYS.map((d) => {
                          const active = selectedDays.includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => toggleDay(d.value)}
                              aria-pressed={active}
                              className={cn(
                                "rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors",
                                active
                                  ? "bg-sunken text-ink ring-1 ring-inset ring-line-strong"
                                  : "border border-line bg-canvas text-ink/55 hover:border-line-strong hover:text-ink",
                              )}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex gap-4">
                        <button
                          type="button"
                          onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                          className="text-xs font-medium text-ink hover:underline"
                        >
                          Lun a Vie
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6])}
                          className="text-xs font-medium text-ink hover:underline"
                        >
                          Lun a Sáb
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                          className="text-xs font-medium text-ink hover:underline"
                        >
                          Todos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedDays([])}
                          className="text-xs font-medium text-ink/45 hover:underline"
                        >
                          Limpiar
                        </button>
                      </div>
                    </div>

                    {/* ── Step 4: Time + Capacity ── */}
                    <div className="flex flex-col gap-4 border-t border-line pt-4">
                      <div className="flex items-center gap-2">
                        {stepBadge(4)}
                        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink">{STEP_LABELS[3]}</span>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Hora inicio</Label>
                          <TimePicker value={startTime} onChange={setStartTime} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Hora fin</Label>
                          <TimePicker value={endTime} onChange={setEndTime} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-ink/70">Capacidad máx.</Label>
                          <Input
                            type="number"
                            value={maxCapacity}
                            onChange={(e) => setMaxCapacity(Number(e.target.value))}
                            className="nums text-center"
                          />
                        </div>
                      </div>
                    </div>

                    {errors.time && <p className="text-[13px] font-bold text-danger">{errors.time}</p>}
                    {errors.capacity && <p className="text-[13px] font-bold text-danger">{errors.capacity}</p>}
                  </div>
                </Panel>
              </div>

              {/* ── Vista previa ── */}
              <aside aria-label="Vista previa" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
                <div className="flex items-center justify-between">
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Vista previa</p>
                  <span className="nums rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold">{preview.length} {preview.length === 1 ? "clase" : "clases"}</span>
                </div>
                {months.length === 0 ? (
                  <p className="text-sm text-ink-muted">Elige un rango de fechas y días para ver las clases que se van a crear.</p>
                ) : (
                  months.slice(0, 3).map((m) => (
                    <div key={m.key}>
                      <p className="mb-2 text-sm font-bold capitalize">{m.label}</p>
                      <div className="grid grid-cols-7 gap-1 text-center">
                        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                          <span key={i} className="text-[0.75rem] font-extrabold text-ink-muted">{d}</span>
                        ))}
                        {m.cells.map((d, i) => {
                          if (!d) return <span key={i} />;
                          const on = preview.some((p) => isSameDay(p, d));
                          return (
                            <span key={i} className={on ? "nums grid h-9 place-items-center rounded-lg bg-ink text-[13px] font-extrabold text-canvas" : "nums grid h-9 place-items-center text-[13px] text-ink-muted"}>
                              {d.getDate()}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
                {months.length > 3 && <p className="text-[13px] text-ink-muted">Y {months.length - 3} meses más.</p>}
                {preview.length > 0 && (
                  <p className="text-[13px] text-ink-muted">
                    {selectedType?.name ?? "—"} · {selectedInstructor?.displayName ?? "—"} · {startTime} a {endTime} · {maxCapacity} lugares
                  </p>
                )}
                <Button size="lg" className="w-full" disabled={!canSubmit || generateMutation.isPending} onClick={() => generateMutation.mutate()}>
                  {generateMutation.isPending ? "Generando…" : preview.length > 0 ? `Generar ${preview.length} ${preview.length === 1 ? "clase" : "clases"}` : "Generar clases"}
                </Button>
                <p className="text-center text-[0.75rem] text-ink-muted">Las clases que ya existan en ese horario no se duplican.</p>
              </aside>
            </div>
          )}
        </AdminPage>

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default GenerateClasses;
