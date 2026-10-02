import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { instagramUrl } from "@/lib/studio";
import { SectionTitle } from "./SectionTitle";
import { availability, defaultDay, groupByDay, type LandingClass, type WeekDay } from "./landingData";

type Props = { days: WeekDay[]; classes: LandingClass[]; todayIso: string; loading: boolean; error: boolean; onRetry: () => void };

const CTA = "inline-flex min-h-[44px] shrink-0 items-center rounded-full px-4 text-[0.8rem] font-extrabold no-underline";

export function WeekSchedule({ days, classes, todayIso, loading, error, onRetry }: Props) {
  const byDay = useMemo(() => groupByDay(classes), [classes]);
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen && days.some((day) => day.iso === chosen) ? chosen : defaultDay(days, byDay, todayIso);
  const list = byDay[selected] ?? [];
  const selectedDay = days.find((d) => d.iso === selected);
  const dayName = selectedDay ? `${selectedDay.weekday} ${selectedDay.dayNum}` : "";
  // Lo que oye el lector al cambiar de día: un resumen corto, no el panel entero.
  const summary = loading || error || !selectedDay
    ? ""
    : list.length > 0
      ? `${list.length} ${list.length === 1 ? "clase" : "clases"} el ${dayName}`
      : `Sin clases el ${dayName}`;

  return (
    <section id="horario" aria-labelledby="horario-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-[1120px] gap-6 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
        <div>
          <SectionTitle id="horario-titulo" eyebrow="Horario" title="Esta semana" accent="en HIVE." />
          <div role="group" aria-label="Días de la semana" className="flex justify-between gap-1">
            {days.map((d) => {
              const on = d.iso === selected;
              const has = (byDay[d.iso]?.length ?? 0) > 0;
              return (
                <button
                  key={d.iso}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${d.weekday} ${d.dayNum}${has ? "" : ", sin clases"}`}
                  onClick={() => setChosen(d.iso)}
                  className={
                    "flex min-h-[44px] w-11 flex-col items-center justify-center rounded-xl text-[0.75rem] font-bold " +
                    (on
                      ? "bg-accent-gradient text-accent-foreground"
                      : "text-ink-muted")
                  }
                >
                  {d.weekday}
                  <span className="font-display text-[0.95rem]">{d.dayNum}</span>
                  <span
                    aria-hidden="true"
                    className={
                      "mt-0.5 h-1 w-1 rounded-full " +
                      (on
                        ? "bg-accent-foreground"
                        : "bg-accent") /* decorativo */ +
                      (has ? "" : " opacity-0")
                    }
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="sr-only" aria-live="polite">{summary}</p>
          {loading ? (
            <div className="grid gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => <div key={i} className="h-[72px] animate-pulse rounded-[18px] border border-line bg-surface/70" />)}
            </div>
          ) : error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/70 p-4">
              <p className="text-[0.9rem] text-ink-muted">No pudimos cargar el horario.</p>
              <button type="button" onClick={onRetry} className="min-h-[44px] rounded-full border border-line-strong px-4 text-[0.85rem] font-bold text-ink">
                Reintentar
              </button>
            </div>
          ) : classes.length === 0 ? (
            <div className="rounded-[18px] border border-line bg-surface/70 p-5">
              <p className="text-[0.95rem] font-bold text-ink">Pronto publicamos el horario de la semana.</p>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[0.85rem] font-bold text-accent no-underline">
                Síguenos en Instagram →
              </a>
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-[18px] border border-line bg-surface/70 p-5 text-[0.9rem] text-ink-muted">No hay clases este día.</p>
          ) : (
            <ul className="grid gap-2">
              {list.map((c) => {
                const a = availability(c);
                const dim = a.full ? "opacity-60" : "";
                return (
                  <li key={c.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[18px] border border-line bg-surface/70 p-3.5">
                    <div className={"min-w-[3.75rem] tabular-nums " + dim}>
                      <p className="font-display text-[1rem] font-bold text-ink">{c.start}</p>
                    </div>
                    <div className={"min-w-0 " + dim}>
                      <p className="truncate text-[0.9rem] font-bold text-ink">{c.name}</p>
                      <p className="truncate text-[0.8rem] text-ink-muted">{c.durationMin ? `${c.durationMin} min` : ""}</p>
                      <p className={"text-[0.75rem] font-bold " + (a.full ? "text-ink-muted" : "text-accent")}>{a.label}</p>
                    </div>
                    {c.bookingClosed ? (
                      <span className="text-center text-[0.75rem] font-bold text-ink-muted">Reservas cerradas</span>
                    ) : a.full ? (
                      <Link to={`/app/classes/${c.id}`} className={`${CTA} border border-line-strong text-ink`}>
                        <span className="sr-only">{c.name}, {c.start}: </span>Lista de espera
                      </Link>
                    ) : (
                      <Link to={`/app/classes/${c.id}`} className={`${CTA} bg-accent-gradient text-accent-foreground shadow-accent-glow`}>
                        <span className="sr-only">{c.name}, {c.start}: </span>Reservar
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
