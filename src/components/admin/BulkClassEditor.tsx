import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Reference = { id: string; name?: string; displayName?: string; display_name?: string };
type Props = { startDate: string; endDate: string; types: Reference[]; instructors: Reference[] };
type Changes = { classTypeId?: string; instructorId?: string; maxCapacity?: number; startTime?: string; endTime?: string; notes?: string; status?: "scheduled" | "closed" };
type Snapshot = { classIds: string[]; changes: Changes; expectedVersions?: Record<string, string> };
type Raw = Record<string, unknown>;
type ClassRow = { id: string; date: string; time: string; end: string; weekday: number; name: string; instructor: string; typeId: string; instructorId: string; status: string; capacity: number; booked: number; future: boolean };
type PreviewClass = { id: string; date?: string; before: Raw; after: Raw };
type Preview = { count: number; classes: PreviewClass[]; expectedVersions: Record<string, string> };
type Conflict = { id?: string; message: string };
const DAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const FIELD = "min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const referenceName = (item: Reference) => item.displayName || item.display_name || item.name || item.id;
const take = (row: Raw, snake: string, camel: string) => row[camel] ?? row[snake];
const text = (value: unknown) => value == null ? "" : String(value);
// API local timestamps describe the studio clock, never the browser's timezone.
function studioInstant(value: unknown) {
  const raw = text(value);
  return new Date(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) ? `${raw.replace(" ", "T")}-06:00` : raw);
}
function studioParts(value: unknown) {
  const date = studioInstant(value);
  if (Number.isNaN(date.getTime())) return { date: "", time: "", weekday: -1 };
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value || "";
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  return { date: day, time: `${part("hour")}:${part("minute")}`, weekday: new Date(`${day}T12:00:00Z`).getUTCDay() };
}
function normalize(row: Raw): ClassRow {
  const start = take(row, "start_time", "startTime");
  const parts = studioParts(start);
  const cancelled = row.isCancelled || row.is_cancelled || row.status === "cancelled" || row.status === "canceled";
  const closed = row.isClosed || row.is_closed || row.status === "closed";
  return {
    id: text(row.id), ...parts, end: studioParts(take(row, "end_time", "endTime")).time,
    name: text(take(row, "class_type_name", "classTypeName")) || "Clase",
    instructor: text(take(row, "instructor_name", "instructorName")) || "Sin instructora",
    typeId: text(take(row, "class_type_id", "classTypeId")), instructorId: text(take(row, "instructor_id", "instructorId")),
    status: cancelled ? "cancelled" : closed ? "closed" : "scheduled",
    capacity: Number(take(row, "max_capacity", "maxCapacity") ?? row.capacity ?? 0),
    booked: Number(take(row, "current_bookings", "currentBookings") ?? take(row, "booked_count", "bookedCount") ?? 0),
    future: studioInstant(start).getTime() > Date.now(),
  };
}
const rowTime = (value: unknown) => /^\d{2}:\d{2}(?::\d{2})?$/.test(text(value)) ? text(value).slice(0, 5) : studioParts(value).time;
const stateName = (value: unknown) => value === "closed" ? "Reservas cerradas" : value === "scheduled" ? "Acepta reservas" : text(value);
function ChangeSummary({ value, types, instructors }: { value: Raw; types: Reference[]; instructors: Reference[] }) {
  const type = text(take(value, "class_type_name", "classTypeName")) || types.find(t => t.id === take(value, "class_type_id", "classTypeId"))?.name;
  const instructor = text(take(value, "instructor_name", "instructorName")) || instructors.find(t => t.id === take(value, "instructor_id", "instructorId"));
  return <div className="space-y-1 text-sm">
    <p>{type || "Clase"} · {typeof instructor === "string" ? instructor : instructor ? referenceName(instructor) : "Sin instructora"}</p>
    <p>{rowTime(take(value, "start_time", "startTime"))}–{rowTime(take(value, "end_time", "endTime"))} · Cupo {text(take(value, "max_capacity", "maxCapacity"))}</p>
    <p>{stateName(value.status)}</p><p className="break-words">Notas: {text(value.notes) || "Sin notas"}</p>
  </div>;
}

export function BulkClassEditor({ startDate, endDate, types, instructors }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState({ start: startDate, end: endDate, days: [0, 1, 2, 3, 4, 5, 6], time: "", type: "", instructor: "", status: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const [enabled, setEnabled] = useState({ instructorId: false, classTypeId: false, maxCapacity: false, time: false, notes: false, status: false });
  const [values, setValues] = useState({ instructorId: "", classTypeId: "", maxCapacity: "", startTime: "", endTime: "", notes: "", status: "scheduled" });
  const [review, setReview] = useState<{ preview: Preview; snapshot: Snapshot } | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [success, setSuccess] = useState("");
  const span = (Date.parse(filters.end) - Date.parse(filters.start)) / 86400000;
  const validRange = !!filters.start && !!filters.end && Number.isFinite(span) && span >= 0 && span < 90;
  const query = useQuery({ queryKey: ["classes", "bulk-editor", filters.start, filters.end], enabled: open && validRange,
    queryFn: async () => { const response = (await api.get("/classes", { params: { start: filters.start, end: filters.end } })).data; const rows = response?.data ?? response; return Array.isArray(rows) ? rows.map(normalize) : []; },
  });
  const rows = useMemo(() => (query.data ?? []).filter(c => filters.days.includes(c.weekday) && (!filters.time || c.time === filters.time) && (!filters.type || c.typeId === filters.type) && (!filters.instructor || c.instructorId === filters.instructor) && (!filters.status || c.status === filters.status)), [query.data, filters]);
  const eligible = rows.filter(c => c.future && c.status !== "cancelled");
  const eligibleIds = new Set(eligible.map(c => c.id));
  const selectionValid = selected.length > 0 && selected.length <= 200 && selected.every(id => eligibleIds.has(id));
  const changes: Changes = {};
  if (enabled.instructorId) changes.instructorId = values.instructorId;
  if (enabled.classTypeId) changes.classTypeId = values.classTypeId;
  if (enabled.maxCapacity) changes.maxCapacity = Number(values.maxCapacity);
  if (enabled.time) { changes.startTime = values.startTime; changes.endTime = values.endTime; }
  if (enabled.notes) changes.notes = values.notes;
  if (enabled.status) changes.status = values.status as "scheduled" | "closed";
  const invalidChange = !Object.keys(changes).length ? "Activa al menos un campo para modificar." :
    enabled.instructorId && !values.instructorId ? "Elige una instructora." : enabled.classTypeId && !values.classTypeId ? "Elige un tipo de clase." :
    enabled.maxCapacity && (!Number.isInteger(Number(values.maxCapacity)) || Number(values.maxCapacity) < 1) ? "El cupo debe ser un entero mayor que cero." :
    enabled.time && (!/^\d{2}:\d{2}$/.test(values.startTime) || !/^\d{2}:\d{2}$/.test(values.endTime) || values.endTime <= values.startTime) ? "Indica inicio y fin válidos, con el fin después del inicio." : "";
  function invalidate() { setReview(null); setError(""); setConflicts([]); setSuccess(""); }
  function changeFilters(next: Partial<typeof filters>) { invalidate(); setSelected([]); setFilters(current => ({ ...current, ...next })); }
  function choose(id: string) { invalidate(); setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < 200 ? [...current, id] : current); }
  function updateValue(key: keyof typeof values, value: string) { invalidate(); setValues(current => ({ ...current, [key]: value })); }
  function handleFailure(reason: unknown) {
    const response = (reason as { response?: { data?: { message?: string; conflicts?: Conflict[]; data?: { conflicts?: Conflict[] } } } }).response?.data;
    setError(response?.message || "No pudimos completar la operación. Revisa la conexión y vuelve a generar la vista previa antes de aplicar.");
    setConflicts(response?.conflicts || response?.data?.conflicts || []);
  }
  async function preview() {
    if (busy || !selectionValid || invalidChange || query.isFetching) return;
    setBusy("preview"); setError(""); setConflicts([]); setSuccess("");
    const snapshot: Snapshot = { classIds: [...selected], changes: { ...changes } };
    try {
      const response = (await api.post("/admin/classes/bulk/preview", snapshot)).data;
      const result: Preview = response.data ?? response;
      if (!result.expectedVersions || !snapshot.classIds.every(id => typeof result.expectedVersions[id] === "string" && result.expectedVersions[id]) || !Array.isArray(result.classes) || result.count !== snapshot.classIds.length || result.classes.length !== snapshot.classIds.length || new Set(result.classes.map(row => row.id)).size !== snapshot.classIds.length || !result.classes.every(row => snapshot.classIds.includes(row.id) && row.before && row.after)) throw new Error("Incomplete preview");
      setReview({ preview: result, snapshot: { ...snapshot, expectedVersions: { ...result.expectedVersions } } });
    } catch (reason) { setReview(null); handleFailure(reason); } finally { setBusy(null); }
  }
  async function apply() {
    if (!review || busy) return;
    setBusy("apply"); setError(""); setConflicts([]);
    try {
      const response = (await api.put("/admin/classes/bulk", review.snapshot)).data;
      const result = response.data ?? response;
      if (!(response.committed ?? result.committed)) throw new Error("Missing commit confirmation");
      const warnings = result.warnings ?? response.warnings;
      setSuccess(`Cambios aplicados a ${review.snapshot.classIds.length} clases.${Array.isArray(warnings) && warnings.length ? ` Avisos: ${warnings.map((w: unknown) => typeof w === "string" ? w : text((w as Raw)?.message)).join(" · ")}` : ""}`);
      setReview(null); setSelected([]);
      void qc.invalidateQueries({ queryKey: ["classes"] });
      void qc.invalidateQueries({ queryKey: ["class-roster-sheet"] });
    } catch (reason) { setReview(null); handleFailure(reason); } finally { setBusy(null); }
  }
  const filterSelect = (name: string, key: "type" | "instructor" | "status", options: { id: string; label: string }[]) => <label className="space-y-1 text-sm">{name}<select className={FIELD} value={filters[key]} onChange={e => changeFilters({ [key]: e.target.value })}><option value="">Todos</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
  const editField = (key: keyof typeof enabled, label: string, content: React.ReactNode) => <div className="space-y-2 rounded-md border border-border p-3"><label className="flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" checked={enabled[key]} onChange={e => { invalidate(); setEnabled(current => ({ ...current, [key]: e.target.checked })); }} />Cambiar {label}</label>{enabled[key] && content}</div>;
  return <>
    <Button variant="outline" onClick={() => { setFilters(current => ({ ...current, start: startDate, end: endDate })); setSelected([]); invalidate(); setOpen(true); }}>Editar varias clases</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[92dvh] max-w-5xl overflow-y-auto" onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onPointerDownOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader><DialogTitle>Editar varias clases</DialogTitle><DialogDescription>Selecciona hasta 200 clases futuras. Conservaremos su fecha y todos los campos que no actives. Primero revisarás los cambios; después podrás aplicarlos juntos.</DialogDescription></DialogHeader>
        <fieldset disabled={!!busy} className="min-w-0 space-y-5 disabled:opacity-70">
          <legend className="mb-2 font-semibold">1. Filtrar y seleccionar</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1 text-sm">Desde<Input type="date" value={filters.start} onChange={e => changeFilters({ start: e.target.value })} /></label>
            <label className="space-y-1 text-sm">Hasta<Input type="date" value={filters.end} onChange={e => changeFilters({ end: e.target.value })} /></label>
            <label className="space-y-1 text-sm">Hora de inicio<Input type="time" value={filters.time} onChange={e => changeFilters({ time: e.target.value })} /></label>
            {filterSelect("Tipo de clase", "type", types.map(t => ({ id: t.id, label: referenceName(t) })))}
            {filterSelect("Instructora", "instructor", instructors.map(t => ({ id: t.id, label: referenceName(t) })))}
            {filterSelect("Estado", "status", [{ id: "scheduled", label: "Acepta reservas" }, { id: "closed", label: "Reservas cerradas" }, { id: "cancelled", label: "Canceladas (no editables)" }])}
          </div>
          <fieldset><legend className="text-sm">Días de la semana</legend><div className="flex flex-wrap gap-3">{DAYS.map((day, index) => <label key={day} className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" checked={filters.days.includes(index)} onChange={() => changeFilters({ days: filters.days.includes(index) ? filters.days.filter(d => d !== index) : [...filters.days, index] })} />{day}</label>)}</div></fieldset>
          {!validRange && <p role="alert" className="text-sm text-destructive">El rango debe abarcar entre 1 y 90 días.</p>}
          <p className="text-sm text-muted-foreground">Horarios de Ciudad de México. Al cambiar un filtro, se borra la selección.</p>
          {validRange && <>
            {query.isLoading || query.isFetching ? <p role="status">Cargando clases…</p> : query.isError ? <div role="alert"><p>No pudimos cargar las clases.</p><Button variant="outline" onClick={() => void query.refetch()}>Reintentar carga</Button></div> : <>
              <div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!eligible.length || eligible.length > 200} onClick={() => { invalidate(); setSelected(eligible.map(c => c.id)); }}>Seleccionar todas las filtradas ({eligible.length})</Button><Button variant="ghost" disabled={!selected.length} onClick={() => { invalidate(); setSelected([]); }}>Quitar selección</Button><p aria-live="polite" className="text-sm">{selected.length} clases seleccionadas</p></div>
              {eligible.length > 200 && <p className="text-sm text-muted-foreground">Hay más de 200 clases editables. Acota los filtros o selecciona hasta 200 manualmente.</p>}
              <ul aria-label="Clases filtradas" className="max-h-72 overflow-y-auto divide-y divide-border rounded-md border border-border">{rows.map(c => <li key={c.id}><label className="flex items-start gap-3 p-3 text-sm"><input type="checkbox" className="mt-1" aria-label={`Seleccionar ${c.date} ${c.time} ${c.name}`} checked={selected.includes(c.id)} disabled={!c.future || c.status === "cancelled" || (!selected.includes(c.id) && selected.length >= 200)} onChange={() => choose(c.id)} /><span className="min-w-0"><span className="block font-medium">{c.date} · {c.time}–{c.end} · {c.name}</span><span className="block">{c.instructor} · Cupo {c.capacity} · {c.booked} reservas</span><span className="text-muted-foreground">{!c.future ? "Ya inició: no editable" : c.status === "cancelled" ? "Cancelada: no editable" : stateName(c.status)}</span></span></label></li>)}</ul>
              {!rows.length && <p>No hay clases con estos filtros.</p>}
            </>}
          </>}
          <div className="space-y-3"><h3 className="font-semibold">2. Elegir cambios</h3><p className="text-sm text-muted-foreground">Los campos desactivados se conservan. Cambiar el horario conserva la fecha de cada clase. No se puede cambiar tipo u horario en clases con reservas; la vista previa indicará cualquier conflicto.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {editField("instructorId", "instructora", <select aria-label="Nueva instructora" className={FIELD} value={values.instructorId} onChange={e => updateValue("instructorId", e.target.value)}><option value="">Elegir instructora</option>{instructors.map(t => <option key={t.id} value={t.id}>{referenceName(t)}</option>)}</select>)}
              {editField("classTypeId", "tipo de clase", <select aria-label="Nuevo tipo de clase" className={FIELD} value={values.classTypeId} onChange={e => updateValue("classTypeId", e.target.value)}><option value="">Elegir tipo</option>{types.map(t => <option key={t.id} value={t.id}>{referenceName(t)}</option>)}</select>)}
              {editField("maxCapacity", "cupo", <Input aria-label="Nuevo cupo" type="number" min="1" step="1" value={values.maxCapacity} onChange={e => updateValue("maxCapacity", e.target.value)} />)}
              {editField("time", "horario", <div className="grid grid-cols-2 gap-2"><label className="text-sm">Nuevo inicio<Input type="time" value={values.startTime} onChange={e => updateValue("startTime", e.target.value)} /></label><label className="text-sm">Nuevo fin<Input type="time" value={values.endTime} onChange={e => updateValue("endTime", e.target.value)} /></label></div>)}
              {editField("notes", "notas", <><textarea aria-label="Nuevas notas" className={`${FIELD} py-2`} value={values.notes} onChange={e => updateValue("notes", e.target.value)} /><p className="text-xs text-muted-foreground">Vacío elimina las notas de las clases seleccionadas.</p></>)}
              {editField("status", "estado de reservas", <select aria-label="Nuevo estado de reservas" className={FIELD} value={values.status} onChange={e => updateValue("status", e.target.value)}><option value="scheduled">Aceptar reservas</option><option value="closed">Cerrar reservas</option></select>)}
            </div>
            {invalidChange && <p className="text-sm text-muted-foreground">{invalidChange}</p>}
            <Button disabled={!selectionValid || !!invalidChange || query.isFetching || query.isError || !validRange} onClick={() => void preview()}>{busy === "preview" ? "Preparando vista previa…" : "Revisar cambios"}</Button>
          </div>
        </fieldset>
        {error && <div role="alert" className="space-y-2 rounded-md border border-destructive p-3 text-sm"><p>{error}</p>{conflicts.length > 0 && <ul className="list-disc pl-5">{conflicts.map((conflict, index) => { const row = rows.find(c => c.id === conflict.id); return <li key={`${conflict.id}-${index}`}>{row ? `${row.date} ${row.time} · ${row.name}: ` : conflict.id ? `${conflict.id}: ` : ""}{conflict.message}</li>; })}</ul>}</div>}
        {review && <section className="space-y-3" aria-label="Vista previa de cambios"><h3 className="font-semibold">3. Revisar {review.preview.count} clases antes de aplicar</h3><p className="text-sm">Se aplicarán juntas. Si alguna clase presenta un conflicto, no se guardará ninguna.</p><ul className="space-y-3">{review.preview.classes.map(row => <li key={row.id} className="rounded-md border border-border p-3"><p className="mb-2 font-semibold">{row.date || studioParts(row.before.start_time ?? row.before.startTime).date}</p><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase text-muted-foreground">Antes</p><ChangeSummary value={row.before} types={types} instructors={instructors} /></div><div><p className="text-xs font-semibold uppercase text-muted-foreground">Después</p><ChangeSummary value={row.after} types={types} instructors={instructors} /></div></div></li>)}</ul><Button disabled={!!busy} onClick={() => void apply()}>{busy === "apply" ? "Aplicando cambios…" : `Aplicar cambios a ${review.preview.count} clases`}</Button></section>}
        {success && <p role="status" className="rounded-md border border-border p-3 text-sm">{success}</p>}
        <div className="flex justify-end"><Button variant="outline" disabled={!!busy} onClick={() => setOpen(false)}>Cerrar</Button></div>
      </DialogContent>
    </Dialog>
  </>;
}
