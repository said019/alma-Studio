import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveClassColor } from "./palette";

export type GridClass = {
  id: string;
  classTypeName?: string;
  classTypeColor?: string;
  instructorName?: string;
  startTime: string;
  endTime: string;
  maxCapacity: number;
  currentBookings?: number;
  bookedCount?: number;
  isCancelled: boolean;
  isClosed: boolean;
};

export const HOUR_PX = 60;

const minutesOf = (iso: string): number => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NaN : d.getHours() * 60 + d.getMinutes();
};

/** De 7 a 21 por defecto; se abre si hay clases antes o después (entre 5 y 24). */
export function hourRange(classes: GridClass[]): { from: number; to: number } {
  let from = 7;
  let to = 21;
  for (const c of classes) {
    const s = minutesOf(c.startTime);
    const e = minutesOf(c.endTime);
    if (Number.isFinite(s)) from = Math.min(from, Math.floor(s / 60));
    if (Number.isFinite(e)) to = Math.max(to, Math.ceil(e / 60));
  }
  from = Math.max(5, from);
  return { from, to: Math.min(24, Math.max(to, from + 1)) };
}

type Placed = { cls: GridClass; top: number; height: number; lane: number; lanes: number };

/** Posiciona las clases de un día. Las que se enciman van en carriles lado a lado. */
export function placeBlocks(classes: GridClass[], fromHour: number): Placed[] {
  const sorted = [...classes]
    .filter((c) => Number.isFinite(minutesOf(c.startTime)))
    .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime));
  const placed: Placed[] = [];
  let cluster: Placed[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, ...cluster.map((p) => p.lane + 1));
    cluster.forEach((p) => { p.lanes = lanes; });
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  for (const c of sorted) {
    const s = minutesOf(c.startTime);
    const rawEnd = minutesOf(c.endTime);
    const e = Number.isFinite(rawEnd) && rawEnd > s ? rawEnd : s + 50;
    if (cluster.length && s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(e); } else { laneEnds[lane] = e; }
    const p: Placed = {
      cls: c,
      top: ((s - fromHour * 60) / 60) * HOUR_PX + 2,
      height: Math.max(28, ((e - s) / 60) * HOUR_PX - 4),
      lane,
      lanes: 1,
    };
    placed.push(p);
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return placed;
}

function ClassBlock({ p, now, selected, onSelect }: { p: Placed; now: Date; selected: boolean; onSelect: (c: GridClass) => void }) {
  const c = p.cls;
  const cap = Math.max(0, Number(c.maxCapacity) || 0);
  const booked = c.currentBookings ?? c.bookedCount ?? 0;
  const full = !c.isCancelled && cap > 0 && booked >= cap;
  const endDate = new Date(c.endTime);
  const past = !Number.isNaN(endDate.getTime()) && endDate < now;
  const name = c.classTypeName ?? "Clase";
  const start = format(new Date(c.startTime), "HH:mm");
  const end = Number.isNaN(endDate.getTime()) ? "" : format(endDate, "HH:mm");
  const second = c.isCancelled ? "Cancelada" : c.isClosed ? `${start} · Cerrada` : full ? `${start} · Llena` : `${start} · ${c.instructorName ?? "—"}`;
  const label = [
    name,
    format(new Date(c.startTime), "EEEE d", { locale: es }),
    end ? `${start} a ${end}` : start,
    `${booked} de ${cap}`,
    full && "llena",
    c.isCancelled && "cancelada",
    c.isClosed && "cerrada",
  ].filter(Boolean).join(", ");
  const width = 100 / p.lanes;
  const tone = c.isCancelled
    ? "border border-dashed border-line-strong bg-surface text-ink-muted"
    : full
      ? "border border-accent bg-accent text-ink"
      : "border border-line bg-canvas text-ink";
  return (
    <button
      type="button"
      onClick={() => onSelect(c)}
      aria-label={label}
      aria-pressed={selected}
      className={cn("absolute overflow-hidden rounded-lg px-2 py-1 text-left leading-tight", tone, past && !selected && "opacity-60", selected && "z-10 ring-2 ring-ink")}
      style={{ top: p.top, height: p.height, left: `calc(${p.lane * width}% + 3px)`, width: `calc(${width}% - 6px)` }}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className={cn("truncate text-[0.75rem] font-extrabold", c.isCancelled && "line-through")}>
          <span aria-hidden="true" className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: resolveClassColor(c.classTypeColor) }} />
          {name}
        </span>
        {!c.isCancelled && <span className="nums shrink-0 text-[0.75rem] font-extrabold">{booked}/{cap}</span>}
      </span>
      <span className={cn("block truncate text-[0.75rem] font-semibold", full ? "text-ink" : "text-ink-muted")}>{second}</span>
      {!c.isCancelled && !full && cap > 0 && (
        <span aria-hidden="true" className="absolute bottom-1 left-2 right-2 h-[3px] rounded bg-line">
          <span className="block h-full rounded bg-ink" style={{ width: `${Math.min(100, Math.round((booked / cap) * 100))}%` }} />
        </span>
      )}
    </button>
  );
}

type WeekHourGridProps = {
  days: Date[];
  classes: GridClass[];
  now: Date;
  selectedId?: string | null;
  onSelect: (c: GridClass) => void;
  onCreate: (date: string) => void;
};

/* Calendario semanal por horas (spec §5.5). Cada clase es un bloque a la
   altura de su hora; llena = coral con la palabra "Llena"; la línea de la hora
   actual cruza la columna de hoy. */
export default function WeekHourGrid({ days, classes, now, selectedId, onSelect, onCreate }: WeekHourGridProps) {
  const { from, to } = hourRange(classes);
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  const height = (to - from) * HOUR_PX + 6;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const nowTop = ((nowMin - from * 60) / 60) * HOUR_PX;
  const nowVisible = nowMin >= from * 60 && nowMin <= to * 60 && days.some((d) => isSameDay(d, now));

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <div className="min-w-[980px]">
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-line">
          <div />
          {days.map((d) => {
            const key = format(d, "yyyy-MM-dd");
            const today = isSameDay(d, now);
            const count = classes.filter((c) => isSameDay(new Date(c.startTime), d) && !c.isCancelled).length;
            return (
              <div key={key} className="flex items-center gap-2 border-l border-line px-2.5 py-2">
                <span className={cn("nums grid h-9 w-9 shrink-0 place-items-center rounded-full text-lg font-extrabold", today ? "bg-ink text-canvas" : "text-ink")}>
                  {d.getDate()}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className={cn("block text-[0.75rem] font-extrabold uppercase tracking-[0.1em]", today ? "text-ink" : "text-ink-muted")}>
                    {format(d, "EEE", { locale: es }).replace(".", "")}{today ? " · hoy" : ""}
                  </span>
                  <span className="block text-[0.75rem] text-ink-muted">{count} {count === 1 ? "clase" : "clases"}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Nueva clase el ${format(d, "EEEE d", { locale: es })}`}
                  onClick={() => onCreate(key)}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
                >
                  <Plus size={16} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height }}>
          <div className="relative">
            {hours.map((h) => (
              <span key={h} className="nums absolute right-2.5 text-[0.75rem] text-ink-muted" style={{ top: Math.max(2, (h - from) * HOUR_PX - 8) }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
            {nowVisible && (
              <span className="nums absolute right-1 z-20 rounded-full bg-ink px-1.5 text-[0.75rem] font-extrabold text-canvas" style={{ top: nowTop - 10 }}>
                {format(now, "HH:mm")}
              </span>
            )}
          </div>
          {days.map((d) => {
            const placed = placeBlocks(classes.filter((c) => isSameDay(new Date(c.startTime), d)), from);
            const today = isSameDay(d, now);
            return (
              <div key={format(d, "yyyy-MM-dd")} className="relative border-l border-line">
                {placed.map((p) => (
                  <ClassBlock key={p.cls.id} p={p} now={now} selected={p.cls.id === selectedId} onSelect={onSelect} />
                ))}
                {today && nowVisible && (
                  <div aria-hidden="true" className="pointer-events-none absolute left-0 right-0 z-20 h-0.5 bg-ink" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-ink" />
                  </div>
                )}
              </div>
            );
          })}
          {hours.slice(1).map((h) => (
            <div key={h} aria-hidden="true" className="pointer-events-none absolute left-14 right-0 h-px bg-line" style={{ top: (h - from) * HOUR_PX }} />
          ))}
        </div>
      </div>
    </div>
  );
}
