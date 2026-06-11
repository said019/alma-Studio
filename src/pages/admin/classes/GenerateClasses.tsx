import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CalendarDays, CalendarPlus, Loader2 } from "lucide-react";
import { resolveClassColor, CLASSES_SECTION_TABS } from "./palette";

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
  const referenceError = typesQuery.isError || instructorsQuery.isError;
  const referenceLoading = typesQuery.isLoading || instructorsQuery.isLoading;

  const stepBadge = (n: number) => (
    <span className="nums flex h-6 w-6 items-center justify-center rounded-full bg-alma-oat text-xs font-bold text-alma-ink">
      {n}
    </span>
  );

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-3xl">
          <SectionTabs tabs={CLASSES_SECTION_TABS} />
          <div className="mb-6">
            <h1 className="admin-title text-alma-ink">Generar clases</h1>
            <p className="mt-1 text-sm text-alma-ink/55">
              Aplica el horario oficial del estudio o crea clases en bloque para un rango de fechas.
            </p>
          </div>

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
            <div className="space-y-5">
              {/* ── Preset: Horario Alma oficial ── */}
              <section className="space-y-4 rounded-2xl border border-alma-sandstone/60 bg-alma-oat/40 p-5">
                <div>
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">Plantilla Alma</p>
                  <p className="mt-1.5 text-sm font-semibold text-alma-ink">Horario oficial del estudio</p>
                  <p className="nums mt-0.5 text-xs text-alma-ink/60">
                    Lun a Vie: 7am, 8am, 7pm y 8pm · Sáb: 7am, 8am y 9am · 23 horarios por semana
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Instructora</Label>
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
                    <Label className="text-xs text-alma-ink/70">Semanas a generar</Label>
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
                  <Button
                    onClick={handlePresetTemplateOnly}
                    disabled={resetAlmaMutation.isPending}
                    variant="outline"
                    className="border-alma-sandstone/70 text-alma-ink"
                  >
                    Solo plantilla
                  </Button>
                </div>
                {!presetInstructorId && instructors.length === 0 && (
                  <p className="text-xs text-alma-berry">
                    Crea una instructora primero en la sección{" "}
                    <Link to="/admin/staff" className="font-semibold underline">Instructoras</Link>.
                  </p>
                )}
                {!presetInstructorId && instructors.length > 0 && (
                  <p className="text-xs text-alma-ink/55">
                    Selecciona una instructora arriba para activar el botón.
                  </p>
                )}
              </section>

              {/* ── Step 1: Class type + Instructor ── */}
              <section className="space-y-4 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
                <div className="flex items-center gap-2">
                  {stepBadge(1)}
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">{STEP_LABELS[0]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Tipo de clase</Label>
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
                    <Label className="text-xs text-alma-ink/70">Instructora</Label>
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
              </section>

              {/* ── Step 2: Date range ── */}
              <section className="space-y-4 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
                <div className="flex items-center gap-2">
                  {stepBadge(2)}
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">{STEP_LABELS[1]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Fecha inicio</Label>
                    <DatePicker value={startDate} onChange={setStartDate} placeholder="Desde" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Fecha fin</Label>
                    <DatePicker value={endDate} onChange={setEndDate} placeholder="Hasta" min={startDate} />
                  </div>
                </div>
              </section>

              {/* ── Step 3: Days of week ── */}
              <section className="space-y-4 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
                <div className="flex items-center gap-2">
                  {stepBadge(3)}
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">{STEP_LABELS[2]}</span>
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
                            ? "bg-alma-oat text-alma-ink ring-1 ring-inset ring-alma-sandstone"
                            : "border border-alma-hairline bg-alma-canvas text-alma-ink/55 hover:border-alma-sandstone hover:text-alma-ink",
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
                    className="text-xs font-medium text-alma-berry hover:underline"
                  >
                    Lun a Vie
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6])}
                    className="text-xs font-medium text-alma-berry hover:underline"
                  >
                    Lun a Sáb
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                    className="text-xs font-medium text-alma-berry hover:underline"
                  >
                    Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDays([])}
                    className="text-xs font-medium text-alma-ink/45 hover:underline"
                  >
                    Limpiar
                  </button>
                </div>
              </section>

              {/* ── Step 4: Time + Capacity ── */}
              <section className="space-y-4 rounded-2xl border border-alma-hairline bg-alma-mist p-5">
                <div className="flex items-center gap-2">
                  {stepBadge(4)}
                  <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry">{STEP_LABELS[3]}</span>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Hora inicio</Label>
                    <TimePicker value={startTime} onChange={setStartTime} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Hora fin</Label>
                    <TimePicker value={endTime} onChange={setEndTime} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-alma-ink/70">Capacidad máx.</Label>
                    <Input
                      type="number"
                      value={maxCapacity}
                      onChange={(e) => setMaxCapacity(Number(e.target.value))}
                      className="nums text-center"
                    />
                  </div>
                </div>
              </section>

              {/* ── Preview ── */}
              {preview.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-alma-sandstone/50 bg-alma-mist p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarDays size={14} className="text-alma-berry" />
                      <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-ink/60">Vista previa</span>
                    </div>
                    <Badge variant="outline" className="nums border-alma-sandstone text-alma-berry">
                      {preview.length} {preview.length === 1 ? "clase" : "clases"}
                    </Badge>
                  </div>

                  <div className="hidden grid-cols-7 gap-1.5 sm:grid">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
                      <div key={d} className="text-center text-[10px] font-bold uppercase text-alma-ink/40">{d}</div>
                    ))}
                  </div>

                  <div className="grid max-h-[220px] grid-cols-4 gap-1.5 overflow-y-auto sm:grid-cols-7">
                    {preview.map((d) => (
                      <div
                        key={d.toISOString()}
                        className="flex flex-col items-center gap-0.5 rounded-lg border border-alma-hairline bg-alma-canvas px-1 py-2"
                      >
                        <span className="text-[10px] text-alma-ink/50">
                          {format(d, "MMM", { locale: es })}
                        </span>
                        <span className="nums text-sm font-bold text-alma-ink">
                          {format(d, "d")}
                        </span>
                        <span className="nums text-[9px] font-medium text-alma-berry">
                          {startTime}
                        </span>
                        {selectedType && (
                          <span
                            className="mt-0.5 h-2 w-2 rounded-full"
                            style={{ backgroundColor: resolveClassColor(selectedType.color) }}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {selectedType && (
                    <div className="flex items-center gap-3 border-t border-alma-hairline pt-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: resolveClassColor(selectedType.color) }} />
                      <span className="text-xs text-alma-ink/65">
                        <strong className="text-alma-ink">{selectedType.name}</strong>
                        {selectedInstructor && <> · {selectedInstructor.displayName}</>}
                        {" · "}
                        <span className="nums">{startTime} a {endTime}</span> · <span className="nums">{maxCapacity}</span> cupos
                      </span>
                    </div>
                  )}
                </section>
              )}

              {/* ── Generate Button ── */}
              <Button
                type="button"
                size="lg"
                disabled={!canGenerate || generateMutation.isPending}
                onClick={() => generateMutation.mutate()}
                className="w-full"
              >
                {generateMutation.isPending ? (
                  <Loader2 className="mr-2 animate-spin" size={16} />
                ) : (
                  <CalendarPlus size={16} className="mr-2" />
                )}
                {generateMutation.isPending
                  ? "Generando…"
                  : preview.length > 0
                  ? `Generar ${preview.length} ${preview.length === 1 ? "clase" : "clases"}`
                  : "Generar clases"}
              </Button>
            </div>
          )}
        </div>

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default GenerateClasses;
