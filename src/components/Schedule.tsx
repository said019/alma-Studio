import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  format,
  addDays,
  addWeeks,
  startOfWeek,
  isSameDay,
  parseISO,
  isToday,
  differenceInMinutes,
} from "date-fns";
import { es } from "date-fns/locale";
import { ArrowUpRight, Plus, Minus, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { ALMA } from "@/components/app/tokens";
import { STUDIO } from "@/lib/studio";
import { useAuthStore } from "@/stores/authStore";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface ApiClass {
  id: string;
  date: string;
  class_date: string;
  start_time: string;
  end_time: string;
  class_type_name: string;
  class_type_color: string;
  instructor_name: string;
  capacity: number;
  max_capacity?: number;
  current_bookings: number;
  status: string;
}

interface ScheduleClass {
  id: string;
  name: string;
  time: string;    // ISO 'YYYY-MM-DDTHH:MM'
  endTime: string; // 'HH:MM' o ''
  instructor: string;
  spots: number;
  maxSpots: number;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatHour(iso: string): string {
  try {
    return format(parseISO(iso), "h:mm a").toLowerCase().replace(". ", "").replace(".", "");
  } catch {
    return iso.slice(11, 16);
  }
}

function classEnd(cls: ScheduleClass): Date | null {
  try {
    const start = parseISO(cls.time);
    if (cls.endTime) {
      const end = parseISO(`${cls.time.split("T")[0]}T${cls.endTime.slice(0, 5)}`);
      if (!Number.isNaN(end.getTime())) return end;
    }
    return new Date(start.getTime() + 50 * 60_000);
  } catch {
    return null;
  }
}

function classDuration(cls: ScheduleClass): number {
  try {
    const start = parseISO(cls.time);
    const end = classEnd(cls);
    if (!end) return 50;
    const mins = differenceInMinutes(end, start);
    return mins > 0 && mins < 240 ? mins : 50;
  } catch {
    return 50;
  }
}

function startOfDayLocal(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function Schedule() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  // Reservar requiere sesión (POST /bookings lleva authMiddleware): la landing
  // manda a crear cuenta; si ya hay sesión, directo al booking de la app.
  const bookPath = isAuthenticated ? "/app/classes" : "/auth/register";

  /* Semana visible: lun→sáb. weekOffset 0 = semana actual, 1 = siguiente, etc. */
  const [weekOffset, setWeekOffset] = useState(0);

  const baseWeekStart = useMemo(() => {
    const today = new Date();
    const base = today.getDay() === 0 ? addDays(today, 1) : today;
    return startOfWeek(base, { weekStartsOn: 1 });
  }, []);

  const weekStart = useMemo(
    () => addWeeks(baseWeekStart, weekOffset),
    [baseWeekStart, weekOffset]
  );

  const weekDays = useMemo(
    () => Array.from({ length: 6 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    return today.getDay() === 0 ? addDays(today, 1) : today;
  });
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  useEffect(() => setOpenClassId(null), [selectedDate]);

  // When week changes, move selected date to first available day of new week
  useEffect(() => {
    setSelectedDate(weekDays[0]);
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Reloj de baja frecuencia para marcar clases ya iniciadas o finalizadas. */
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  /* Entrada de sección: [data-reveal] + .is-visible (index.css respeta
     prefers-reduced-motion). */
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = sectionRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  /* ── Fetch (mismo endpoint y queryKey de siempre) ─────────────────────── */
  const startDate = format(weekStart, "yyyy-MM-dd");
  const endDate = format(addDays(weekStart, 5), "yyyy-MM-dd");

  const { data: rawClasses, isLoading, isError, refetch } = useQuery<ApiClass[]>({
    queryKey: ["public-classes", startDate, endDate],
    queryFn: async () => {
      const { data } = await api.get(`/classes?start=${startDate}&end=${endDate}`);
      // API returns { data: [...] } or directly [...]
      return Array.isArray(data) ? data : (data?.data ?? []);
    },
    staleTime: 1000 * 60 * 2,
  });

  /* ── Transform ────────────────────────────────────────────────────────── */
  const allClasses: ScheduleClass[] = useMemo(() => {
    if (!rawClasses) return [];
    return rawClasses
      .filter((c) => c.status !== "cancelled")
      .map((c) => {
        const dateStr = (c.date || c.class_date || c.start_time?.split("T")[0] || "").split("T")[0];
        const startTimePart = c.start_time?.includes("T")
          ? c.start_time.split("T")[1].slice(0, 5)
          : (c.start_time ?? "00:00").slice(0, 5);
        const endTimePart = c.end_time?.includes("T")
          ? c.end_time.split("T")[1].slice(0, 5)
          : (c.end_time ?? "").slice(0, 5);
        const maxSpots = c.capacity ?? c.max_capacity ?? 0;
        const available = maxSpots - (c.current_bookings ?? 0);
        return {
          id: c.id,
          name: c.class_type_name ?? "Clase",
          time: `${dateStr}T${startTimePart}`,
          endTime: endTimePart,
          instructor: c.instructor_name ?? "Por confirmar",
          spots: Math.max(0, available),
          maxSpots,
        };
      });
  }, [rawClasses]);

  const dayClasses = useMemo(
    () =>
      allClasses
        .filter((c) => {
          try {
            return isSameDay(parseISO(c.time), selectedDate);
          } catch {
            return false;
          }
        })
        .sort((a, b) => a.time.localeCompare(b.time)),
    [allClasses, selectedDate]
  );

  const classCountByDay = useMemo(() => {
    const map: Record<string, number> = {};
    allClasses.forEach((c) => {
      const key = c.time.split("T")[0];
      map[key] = (map[key] ?? 0) + 1;
    });
    return map;
  }, [allClasses]);

  const isPastDay = (d: Date) => weekOffset === 0 && startOfDayLocal(d) < startOfDayLocal(now);

  /* "past": ya terminó · "live": en curso · null: por venir */
  const timeStatus = (cls: ScheduleClass): "past" | "live" | null => {
    try {
      const start = parseISO(cls.time);
      const end = classEnd(cls);
      if (end && now >= end) return "past";
      if (now >= start) return "live";
      return null;
    } catch {
      return null;
    }
  };

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <section
      ref={sectionRef}
      id="horario"
      className="scroll-mt-16 relative px-5 sm:px-8 lg:px-12 py-28 lg:py-40"
      style={{ backgroundColor: ALMA.cream }}
    >
      <div className="mx-auto max-w-[1320px]">

        {/* ── Encabezado editorial ─────────────────────────────────────── */}
        <div data-reveal className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12 lg:mb-16">
          <div>
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.berry }}>
              Agenda de la semana
            </span>
            <h2
              className="font-display mt-4 leading-[0.94]"
              style={{ color: ALMA.ink, fontSize: "clamp(2.4rem, 5.2vw, 4.6rem)", fontWeight: 420 }}
            >
              Elige tu día,
              <span className="block font-display-italic" style={{ color: ALMA.stone, fontWeight: 400 }}>
                aparta tu lugar.
              </span>
            </h2>
          </div>
          <p className="max-w-[42ch] text-[0.95rem] leading-[1.7]" style={{ color: `${ALMA.ink}b8` }}>
            El horario vivo del estudio. Grupos de 4 en Reformer y Tower, 8 en Studio: cada clase con lugares contados.
          </p>
        </div>

        {/* ── Selector de día (lun→sáb) con navegación de semana ─────── */}
        <div data-reveal className="mb-10">
          <div className="flex items-center justify-between gap-4 mb-4">
            <span className="text-[0.72rem] uppercase tracking-[0.22em]" style={{ color: ALMA.berry }}>
              {format(weekDays[0], "d MMM", { locale: es })} – {format(weekDays[5], "d MMM yyyy", { locale: es })}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={weekOffset <= 0}
                onClick={() => setWeekOffset((w) => w - 1)}
                aria-label="Semana anterior"
                className="grid h-9 w-9 place-items-center rounded-full border transition-colors"
                style={{
                  borderColor: weekOffset <= 0 ? `${ALMA.border}` : ALMA.berry,
                  color: weekOffset <= 0 ? `${ALMA.ink}44` : ALMA.berry,
                  backgroundColor: "transparent",
                  cursor: weekOffset <= 0 ? "default" : "pointer",
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                onClick={() => setWeekOffset((w) => w + 1)}
                aria-label="Semana siguiente"
                className="grid h-9 w-9 place-items-center rounded-full border transition-colors hover:bg-[color:var(--blush)]"
                style={{ borderColor: ALMA.berry, color: ALMA.berry, backgroundColor: "transparent", cursor: "pointer" }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Elegir día de la semana">
          {weekDays.map((day) => {
            const selected = isSameDay(day, selectedDate);
            const past = isPastDay(day);
            const today = isToday(day);
            const hasClasses = (classCountByDay[format(day, "yyyy-MM-dd")] ?? 0) > 0;
            return (
              <button
                key={day.toISOString()}
                type="button"
                disabled={past}
                onClick={() => setSelectedDate(day)}
                aria-pressed={selected}
                aria-label={format(day, "EEEE d 'de' MMMM", { locale: es })}
                data-press={past ? undefined : ""}
                className="inline-flex items-baseline gap-2 rounded-full border px-5 py-2.5 will-change-transform"
                style={{
                  backgroundColor: selected ? ALMA.ink : "transparent",
                  borderColor: selected ? ALMA.ink : today ? ALMA.sandstone : ALMA.border,
                  color: selected ? ALMA.cream : ALMA.ink,
                  opacity: past ? 0.4 : 1,
                  cursor: past ? "default" : "pointer",
                }}
              >
                <span className="text-[0.64rem] uppercase tracking-[0.22em]">
                  {format(day, "EEE", { locale: es }).replace(".", "")}
                </span>
                <span className="nums font-display text-[1.05rem] leading-none">
                  {format(day, "d")}
                </span>
                {hasClasses && !selected && !past && (
                  <span
                    aria-hidden
                    className="self-center inline-block h-1 w-1 rounded-full"
                    style={{ backgroundColor: ALMA.berry }}
                  />
                )}
              </button>
            );
          })}
          </div>
        </div>

        {/* ── Cabecera del día ─────────────────────────────────────────── */}
        <div data-reveal className="flex items-baseline justify-between gap-4 mb-1">
          <p className="text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
            {format(selectedDate, "EEEE d 'de' MMMM", { locale: es })}
          </p>
          {!isLoading && !isError && dayClasses.length > 0 && (
            <p className="nums text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: `${ALMA.ink}8c` }}>
              {dayClasses.length} {dayClasses.length === 1 ? "clase" : "clases"}
            </p>
          )}
        </div>

        {/* ── Lista del día ────────────────────────────────────────────── */}
        <div data-reveal>
          {isLoading ? (
            /* Skeleton de filas */
            <ul className="list-none m-0 p-0" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li
                  key={i}
                  className="py-7"
                  style={{ borderTop: `1px solid ${ALMA.border}`, borderBottom: i === 3 ? `1px solid ${ALMA.border}` : undefined }}
                >
                  <div className="grid grid-cols-[56px_1fr_auto] sm:grid-cols-[88px_1fr_auto] items-center gap-x-4 sm:gap-x-6 px-1 sm:px-2">
                    <div className="h-4 w-12 rounded-full animate-pulse" style={{ backgroundColor: ALMA.blush }} />
                    <div className="space-y-2">
                      <div className="h-4 w-44 max-w-full rounded-full animate-pulse" style={{ backgroundColor: ALMA.mist }} />
                      <div className="h-3 w-28 max-w-full rounded-full animate-pulse" style={{ backgroundColor: ALMA.mist }} />
                    </div>
                    <div className="h-3 w-20 rounded-full animate-pulse" style={{ backgroundColor: ALMA.mist }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : isError ? (
            /* Error honesto con reintentar */
            <div
              className="py-16 text-center"
              style={{ borderTop: `1px solid ${ALMA.border}`, borderBottom: `1px solid ${ALMA.border}` }}
            >
              <p className="text-[0.98rem]" style={{ color: ALMA.ink }}>
                No pudimos cargar el horario.
              </p>
              <p className="mt-1 text-[0.85rem]" style={{ color: `${ALMA.ink}99` }}>
                Revisa tu conexión e inténtalo otra vez.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                data-press
                className="mt-6 inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-[0.74rem] font-medium uppercase tracking-[0.18em]"
                style={{ borderColor: ALMA.sandstone, color: ALMA.ink, backgroundColor: "transparent", cursor: "pointer" }}
              >
                Reintentar
              </button>
            </div>
          ) : dayClasses.length === 0 ? (
            /* Día sin clases */
            <div
              className="py-16 text-center"
              style={{ borderTop: `1px solid ${ALMA.border}`, borderBottom: `1px solid ${ALMA.border}` }}
            >
              <p className="font-display-italic" style={{ color: ALMA.stone, fontSize: "clamp(1.5rem, 2.6vw, 1.9rem)" }}>
                El estudio descansa este día.
              </p>
              <p className="mt-3 text-[0.9rem]" style={{ color: `${ALMA.ink}99` }}>
                Elige otro día de la semana para ver sus clases.
              </p>
            </div>
          ) : (
            /* Filas editoriales con hairlines */
            <ul className="list-none m-0 p-0">
              {dayClasses.map((cls, i) => {
                const status = timeStatus(cls);
                const inactive = status !== null;
                const isOpen = openClassId === cls.id && !inactive;
                const full = cls.spots === 0;
                const hasSpotData = cls.maxSpots > 0;
                const isLast = i === dayClasses.length - 1;
                const metaLabel = inactive
                  ? status === "past" ? "Finalizada" : "En curso"
                  : full
                    ? "Completa"
                    : hasSpotData
                      ? `${cls.spots} de ${cls.maxSpots} lugares`
                      : null;
                return (
                  <li
                    key={cls.id}
                    style={{
                      borderTop: `1px solid ${ALMA.border}`,
                      borderBottom: isLast ? `1px solid ${ALMA.border}` : undefined,
                    }}
                  >
                    <button
                      type="button"
                      disabled={inactive}
                      onClick={() => setOpenClassId(isOpen ? null : cls.id)}
                      aria-expanded={inactive ? undefined : isOpen}
                      className="w-full grid grid-cols-[56px_1fr_auto] sm:grid-cols-[88px_1fr_auto_auto] items-center gap-x-4 sm:gap-x-6 px-1 sm:px-2 py-6 bg-transparent border-0 text-left"
                      style={{ cursor: inactive ? "default" : "pointer", opacity: inactive ? 0.45 : 1 }}
                    >
                      <span className="nums font-display text-[1.05rem] sm:text-[1.25rem] leading-none" style={{ color: ALMA.ink }}>
                        {formatHour(cls.time)}
                      </span>
                      <span className="min-w-0">
                        <h3 className="font-display text-[1.25rem] sm:text-[1.5rem] leading-tight truncate" style={{ color: ALMA.ink }}>
                          {cls.name}
                        </h3>
                        <p className="mt-1 text-[0.74rem] uppercase tracking-[0.18em]" style={{ color: ALMA.berry }}>
                          {cls.instructor}
                        </p>
                        {metaLabel && (
                          <p className="sm:hidden nums mt-1.5 text-[0.68rem] uppercase tracking-[0.16em]" style={{ color: `${ALMA.ink}8c` }}>
                            {metaLabel}
                          </p>
                        )}
                      </span>
                      <span className="hidden sm:block nums text-[0.72rem] uppercase tracking-[0.16em] text-right" style={{ color: full && !inactive ? ALMA.berry : `${ALMA.ink}8c` }}>
                        {metaLabel}
                      </span>
                      {!inactive ? (
                        <span
                          aria-hidden
                          className="grid h-9 w-9 place-items-center rounded-full transition-transform duration-300"
                          style={{
                            backgroundColor: isOpen ? ALMA.berry : "transparent",
                            color: isOpen ? ALMA.cream : ALMA.berry,
                            border: `1px solid ${ALMA.berry}`,
                            transitionTimingFunction: "var(--ease-alma-out)",
                          }}
                        >
                          {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                        </span>
                      ) : (
                        <span aria-hidden className="h-9 w-9" />
                      )}
                    </button>

                    {/* Detalle expandible in-place (grid-template-rows) */}
                    <div
                      className="grid overflow-hidden transition-[grid-template-rows] duration-500"
                      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-alma-out)" }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="grid grid-cols-[56px_1fr] sm:grid-cols-[88px_1fr] gap-x-4 sm:gap-x-6 px-1 sm:px-2">
                          <span aria-hidden />
                          <div className="pb-7 pr-1 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
                            <dl className="flex flex-wrap gap-x-8 gap-y-2.5 text-[0.7rem] uppercase tracking-[0.18em]" style={{ color: `${ALMA.ink}8c` }}>
                              <div className="flex items-baseline gap-2">
                                <dt>Inicio</dt>
                                <dd className="nums font-display text-[0.95rem] normal-case tracking-normal" style={{ color: ALMA.ink }}>
                                  {formatHour(cls.time)}
                                </dd>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <dt>Duración</dt>
                                <dd className="nums font-display text-[0.95rem] normal-case tracking-normal" style={{ color: ALMA.ink }}>
                                  {classDuration(cls)} min
                                </dd>
                              </div>
                              <div className="flex items-baseline gap-2">
                                <dt>Instructora</dt>
                                <dd className="font-display text-[0.95rem] normal-case tracking-normal" style={{ color: ALMA.ink }}>
                                  {cls.instructor}
                                </dd>
                              </div>
                              {hasSpotData && (
                                <div className="flex items-baseline gap-2">
                                  <dt>Lugares</dt>
                                  <dd className="nums font-display text-[0.95rem] normal-case tracking-normal" style={{ color: ALMA.ink }}>
                                    {full ? "Completa" : `${cls.spots} de ${cls.maxSpots}`}
                                  </dd>
                                </div>
                              )}
                            </dl>
                            {full ? (
                              <p className="text-[0.85rem] leading-[1.6] shrink-0" style={{ color: `${ALMA.ink}99` }}>
                                Esta clase ya está llena. Elige otro horario.
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => navigate(bookPath)}
                                data-press
                                className="group inline-flex w-fit items-center gap-2.5 rounded-full px-6 py-3 text-[0.74rem] font-medium uppercase tracking-[0.16em] shrink-0"
                                style={{ backgroundColor: ALMA.ink, color: ALMA.cream, border: "none", cursor: "pointer" }}
                              >
                                {isAuthenticated ? "Reservar esta clase" : "Crear cuenta y reservar"}
                                <ArrowUpRight
                                  size={13}
                                  className="transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                                  style={{ transitionTimingFunction: "var(--ease-alma-out)" }}
                                />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── CTA principal: clase muestra ─────────────────────────────── */}
        <div data-reveal className="mt-16 lg:mt-24 flex flex-col items-center text-center">
          <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.berry }}>
            ¿Primera vez en Alma?
          </span>
          <h3
            className="font-display mt-4 leading-[0.96]"
            style={{ color: ALMA.ink, fontSize: "clamp(1.9rem, 3.6vw, 3rem)", fontWeight: 420 }}
          >
            Empieza con una{" "}
            <span className="font-display-italic" style={{ color: ALMA.berry, fontWeight: 400 }}>
              clase muestra.
            </span>
          </h3>
          <p className="mt-4 max-w-[48ch] text-[0.95rem] leading-[1.7]" style={{ color: `${ALMA.ink}b8` }}>
            Tu primera visita para conocer el estudio, el equipo y a tu coach. Crea tu cuenta y aparta tu lugar en el horario que te quede.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-5">
            <button
              type="button"
              onClick={() => navigate(bookPath)}
              data-press
              className="group inline-flex items-center gap-3 rounded-full px-7 py-4 text-[0.8rem] font-medium uppercase tracking-[0.16em]"
              style={{ backgroundColor: ALMA.ink, color: ALMA.cream, border: "none", cursor: "pointer" }}
            >
              Reserva tu clase muestra
              <span
                className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1"
                style={{ transitionTimingFunction: "var(--ease-alma-out)" }}
              >
                <ArrowUpRight size={13} />
              </span>
            </button>
            <a
              href={`https://wa.me/${STUDIO.whatsapp}?text=${encodeURIComponent("Hola, me gustaría reservar una clase muestra en Alma Movement.")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[0.76rem] uppercase tracking-[0.2em] no-underline underline-offset-4 hover:underline"
              style={{ color: ALMA.berry }}
            >
              o escríbenos por WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
