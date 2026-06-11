import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  addWeeks,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  EmptyState,
  ErrorState,
  GhostButton,
  PrimaryButton,
  SkeletonRow,
  Tag,
  ALMA,
} from "@/components/app/AppShell";
import { InfoBanner, SegmentedTabs } from "@/components/app/widgets";
import { CalendarDays, ChevronRight, Moon } from "lucide-react";
import type { BookingClient } from "@/types/booking";

/* La semana de la clienta empieza en lunes, como su rutina. */
const DAY_LABELS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

type ClassCat = "studio" | "reformer_tower" | "mixto" | "all";
const CAT_LABEL: Record<ClassCat, string> = {
  studio: "Studio",
  reformer_tower: "Reformer/Tower",
  mixto: "Mixto",
  all: "Todas",
};

type ScheduleClass = {
  id: string;
  start_time?: string | null;
  end_time?: string | null;
  class_type_name?: string | null;
  instructor_name?: string | null;
  current_bookings?: number | null;
  max_capacity?: number | null;
  capacity?: number | null;
};

type DecoratedClass = {
  raw: ScheduleClass;
  start: Date | null;
  end: Date | null;
  timeLabel: string;
  endLabel: string | null;
  name: string;
  instructor: string;
  classCat: ClassCat;
  capacity: number;
  booked: number;
  remaining: number;
};

function inferClassCat(name: string): ClassCat {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("reformer") || n.includes("tower")) return "reformer_tower";
  return "studio";
}

function canBook(classCat: ClassCat, membershipCat: ClassCat | null): boolean {
  if (!membershipCat || membershipCat === "all" || membershipCat === "mixto") return true;
  return classCat === membershipCat;
}

function decorateClass(cls: ScheduleClass): DecoratedClass {
  const start = cls.start_time ? safeParse(cls.start_time) : null;
  const end = cls.end_time ? safeParse(cls.end_time) : null;
  const name = cls.class_type_name ?? "Clase";
  const classCat = inferClassCat(name);
  // Cupo real del backend; si falta, se deriva del área: Reformer/Tower 4, Studio 8.
  const areaFallback = classCat === "reformer_tower" ? 4 : 8;
  const capacity = Number(cls.max_capacity ?? cls.capacity ?? areaFallback);
  const booked = Number(cls.current_bookings ?? 0);
  return {
    raw: cls,
    start,
    end,
    timeLabel: start ? format(start, "HH:mm") : "--:--",
    endLabel: end ? format(end, "HH:mm") : null,
    name,
    instructor: cls.instructor_name ?? "Por confirmar",
    classCat,
    capacity,
    booked,
    remaining: Math.max(0, capacity - booked),
  };
}

/* Estado de cada clase, comunicado con texto legible, nunca solo con opacidad. */
type RowState = {
  label: string;
  color: string;
  dimmed: boolean;
  interactive: boolean;
};

type WeekKey = "prev" | "current" | "next";
const WEEK_OFFSETS: Record<WeekKey, number> = { prev: -1, current: 0, next: 1 };

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

const weekRangeLabel = (start: Date, end: Date) => {
  const sameMonth = start.getMonth() === end.getMonth();
  const startStr = format(start, sameMonth ? "d" : "d MMM", { locale: es });
  const endStr = format(end, "d MMM", { locale: es });
  return `Semana del ${startStr} al ${endStr}`;
};

const BookClasses = () => {
  const navigate = useNavigate();
  const currentWeekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const [week, setWeek] = useState<WeekKey>("current");
  const weekStart = useMemo(
    () => addWeeks(currentWeekStart, WEEK_OFFSETS[week]),
    [currentWeekStart, week]
  );
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  const {
    data: classesData,
    isLoading: loadingClasses,
    isError: classesError,
    refetch: refetchClasses,
  } = useQuery({
    queryKey: ["public-classes", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/classes?start=${format(weekStart, "yyyy-MM-dd")}&end=${format(weekEnd, "yyyy-MM-dd")}`)).data,
  });

  const {
    data: bookingsData,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const {
    data: membershipData,
    isLoading: loadingMembership,
    isError: membershipError,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const {
    data: weeklyStatusData,
    isError: weeklyError,
    refetch: refetchWeekly,
  } = useQuery({
    queryKey: ["weekly-status", format(weekStart, "yyyy-MM-dd")],
    queryFn: async () =>
      (await api.get(`/bookings/weekly-status?date=${format(weekStart, "yyyy-MM-dd")}`)).data,
  });

  const classes: ScheduleClass[] = Array.isArray(classesData?.data) ? classesData.data : Array.isArray(classesData) ? classesData : [];
  const myBookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const membership = membershipData?.data ?? null;
  const hasActive = membership?.status === "active";
  const membershipCat: ClassCat | null = hasActive
    ? ((membership.classCategory ?? membership.class_category ?? "all") as ClassCat)
    : null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining;
  const isUnlimited = classesRemaining === null || classesRemaining === undefined || classesRemaining === 9999;
  const weeklyStatus: { plan_name: string; limit: number; used: number; remaining: number }[] =
    Array.isArray(weeklyStatusData?.data) ? weeklyStatusData.data : [];
  const weeklyCap = weeklyStatus[0] ?? null;
  const myBookedClassIds = useMemo(() => new Set(myBookings.map((b) => b.class_id)), [myBookings]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekStart]);

  const decoratedClasses = useMemo(
    () => classes.map(decorateClass).sort((a, b) => (a.raw.start_time ?? "").localeCompare(b.raw.start_time ?? "")),
    [classes]
  );

  const classesForDay = (day: Date) =>
    decoratedClasses.filter((cls) => cls.start && isSameDay(cls.start, day));

  const daysWithClasses = useMemo(() => {
    const s = new Set<string>();
    decoratedClasses.forEach((cls) => {
      if (cls.start) s.add(dayKey(cls.start));
    });
    return s;
  }, [decoratedClasses]);

  const nextDayWithClasses = useMemo(() => {
    const candidates = days.filter((d) => daysWithClasses.has(dayKey(d)) && !isSameDay(d, selectedDay));
    if (candidates.length === 0) return null;
    return candidates.find((d) => d.getTime() > selectedDay.getTime()) ?? candidates[0];
  }, [days, daysWithClasses, selectedDay]);

  const now = new Date();
  const weekIsEmpty = decoratedClasses.length === 0;
  const selectedDayClasses = classesForDay(selectedDay);

  const handleWeekChange = (value: WeekKey) => {
    setWeek(value);
    setSelectedDay(value === "current" ? new Date() : addWeeks(currentWeekStart, WEEK_OFFSETS[value]));
  };

  /* Day-strip anclado al día elegido (hoy al entrar). */
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const strip = stripRef.current;
    const el = selectedDayRef.current;
    if (!strip || !el) return;
    const target = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }, [selectedDay, week]);

  const getRowState = (cls: DecoratedClass): RowState => {
    const isPast = cls.start ? isBefore(cls.start, now) : true;
    const isBooked = myBookedClassIds.has(cls.raw.id);
    const allowed = canBook(cls.classCat, membershipCat);
    if (isBooked) {
      return { label: "Reservada", color: ALMA.olive, dimmed: isPast, interactive: hasActive && !isPast };
    }
    if (isPast) {
      return { label: "Ya pasó", color: ALMA.ink, dimmed: true, interactive: false };
    }
    if (!hasActive) {
      return {
        label: membershipError ? "No disponible por ahora" : "Activa tu paquete",
        color: ALMA.ink,
        dimmed: true,
        interactive: false,
      };
    }
    if (!allowed) {
      return { label: "Otra membresía", color: ALMA.ink, dimmed: true, interactive: false };
    }
    if (cls.remaining === 0) {
      return { label: "Lista de espera", color: ALMA.berry, dimmed: false, interactive: true };
    }
    if (cls.remaining === 1) {
      return { label: "Último lugar", color: ALMA.berry, dimmed: false, interactive: true };
    }
    if (cls.remaining === 2) {
      return { label: "Pocos lugares", color: ALMA.berry, dimmed: false, interactive: true };
    }
    return { label: "Disponible", color: ALMA.berry, dimmed: false, interactive: true };
  };

  const openClass = (id: string) => navigate(`/app/classes/${id}`);

  const auxError = membershipError || bookingsError || weeklyError;
  const retryAux = () => {
    if (membershipError) refetchMembership();
    if (bookingsError) refetchBookings();
    if (weeklyError) refetchWeekly();
  };

  const endRaw = membership?.endDate ?? membership?.end_date ?? null;
  const endLabel = endRaw ? format(safeParse(endRaw), "d MMM", { locale: es }) : null;
  const remainingLabel = isUnlimited
    ? "Clases ilimitadas"
    : Number(classesRemaining) === 1
      ? "Te queda 1 clase"
      : `Te quedan ${classesRemaining} clases`;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow={weekRangeLabel(weekStart, weekEnd)}
          title="Reserva tu"
          titleAccent="próxima clase."
          actions={
            <SegmentedTabs<WeekKey>
              options={[
                { value: "prev", label: "Anterior" },
                { value: "current", label: "Actual" },
                { value: "next", label: "Siguiente" },
              ]}
              value={week}
              onChange={handleWeekChange}
            />
          }
        />

        {/* ── Contexto de membresía, inline y honesto ── */}
        <div className="-mt-3 lg:-mt-5 mb-5">
          {loadingMembership ? (
            <div className="max-w-[280px]">
              <SkeletonRow height={22} />
            </div>
          ) : membershipError ? null : hasActive ? (
            <Link
              to="/app/profile/membership"
              className="nums inline-flex min-h-[44px] items-center gap-1.5 text-[0.92rem] no-underline"
              style={{ color: ALMA.ink }}
            >
              <span>
                {remainingLabel}
                {endLabel && <span style={{ opacity: 0.7 }}> · vence {endLabel}</span>}
              </span>
              <ChevronRight size={14} style={{ color: ALMA.berry }} />
            </Link>
          ) : (
            <InfoBanner
              title="Aún no tienes paquete activo."
              description="Activa un paquete para reservar clases. Puedes empezar con una clase muestra."
              action={<PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>}
            />
          )}

          {membershipCat && membershipCat !== "all" && membershipCat !== "mixto" && (
            <p className="text-[0.84rem]" style={{ color: ALMA.ink, opacity: 0.75 }}>
              Tu paquete reserva clases de{" "}
              <span style={{ color: ALMA.berry, fontWeight: 600 }}>{CAT_LABEL[membershipCat]}</span>.
            </p>
          )}

          {weeklyCap && weeklyCap.remaining === 0 && (
            <p className="mt-1 text-[0.84rem]" style={{ color: ALMA.berry }}>
              Tu semana está completa. Si quieres mover tu agenda, cancela una clase.
            </p>
          )}

          {auxError && (
            <div
              role="alert"
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
              style={{ backgroundColor: `${ALMA.destructive}12` }}
            >
              <p className="text-[0.84rem] leading-[1.5]" style={{ color: ALMA.ink }}>
                Parte de tu información no cargó. Tu membresía o tus reservas pueden verse incompletas.
              </p>
              <GhostButton onClick={retryAux}>Reintentar</GhostButton>
            </div>
          )}
        </div>

        {/* ── Day-strip sticky (móvil): lun a dom, anclado a hoy ── */}
        <div
          className="lg:hidden sticky top-16 z-20 -mx-5 sm:-mx-7"
          style={{ backgroundColor: ALMA.cream, borderBottom: `1px solid ${ALMA.border}` }}
        >
          <div
            ref={stripRef}
            role="tablist"
            aria-label="Días de la semana"
            className="flex gap-1 overflow-x-auto px-5 py-2 sm:px-7"
            style={{ scrollbarWidth: "none" }}
          >
            {days.map((day, i) => {
              const selected = isSameDay(day, selectedDay);
              const today = isToday(day);
              const hasClasses = daysWithClasses.has(dayKey(day));
              return (
                <button
                  key={dayKey(day)}
                  ref={selected ? selectedDayRef : undefined}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="day-panel"
                  aria-label={format(day, "EEEE d 'de' MMMM", { locale: es })}
                  data-press
                  onClick={() => setSelectedDay(day)}
                  className="flex min-w-[48px] flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-2xl border-0 px-2 py-2 transition-colors"
                  style={{
                    backgroundColor: selected ? ALMA.ink : "transparent",
                    color: selected ? ALMA.cream : today ? ALMA.berry : ALMA.ink,
                  }}
                >
                  <span className="text-[0.72rem] uppercase tracking-[0.12em]" style={{ opacity: selected ? 0.9 : 0.75 }}>
                    {DAY_LABELS[i]}
                  </span>
                  <span className="nums font-display text-[1.05rem] leading-none">{format(day, "d")}</span>
                  <span
                    aria-hidden="true"
                    className="h-1 w-1 rounded-full"
                    style={{ backgroundColor: selected ? ALMA.cream : ALMA.berry, opacity: hasClasses ? 1 : 0 }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {classesError ? (
          <div id="day-panel" role="tabpanel">
            <ErrorState
              title="No pudimos cargar los horarios."
              description="Revisa tu conexión y vuelve a intentarlo. El calendario sigue aquí."
              onRetry={() => refetchClasses()}
            />
          </div>
        ) : !loadingClasses && weekIsEmpty ? (
          <div id="day-panel" role="tabpanel">
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="Esta semana aún no hay horarios."
              description="En cuanto el estudio publique sus clases, las verás aquí."
              ctaLabel={week === "next" ? "Volver a esta semana" : "Ver la semana siguiente"}
              onCta={() => handleWeekChange(week === "next" ? "current" : week === "prev" ? "current" : "next")}
            />
          </div>
        ) : (
          <>
            {/* ── Lista editorial del día elegido (móvil) ── */}
            <div id="day-panel" role="tabpanel" className="lg:hidden">
              <h2
                className="mt-5 text-[0.72rem] font-medium uppercase tracking-[0.24em]"
                style={{ color: ALMA.ink, opacity: 0.65 }}
              >
                {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
              </h2>
              {loadingClasses ? (
                <div className="mt-4 space-y-2">
                  <SkeletonRow height={76} />
                  <SkeletonRow height={76} />
                  <SkeletonRow height={76} />
                  <SkeletonRow height={76} />
                </div>
              ) : selectedDayClasses.length === 0 ? (
                <EmptyState
                  icon={<Moon size={18} />}
                  title="Este día el estudio descansa."
                  description="Elige otro día de la semana para ver horarios."
                  ctaLabel={
                    nextDayWithClasses
                      ? `Ver el ${format(nextDayWithClasses, "EEEE d", { locale: es })}`
                      : undefined
                  }
                  onCta={nextDayWithClasses ? () => setSelectedDay(nextDayWithClasses) : undefined}
                />
              ) : (
                <div className="mt-2" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                  {selectedDayClasses.map((cls) => (
                    <ClassRow key={cls.raw.id} cls={cls} state={getRowState(cls)} onPick={() => openClass(cls.raw.id)} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Semana completa en columnas hairline (desktop) ── */}
            <div className="hidden lg:grid mt-2 grid-cols-7">
              {days.map((day, i) => {
                const dayClasses = classesForDay(day);
                const today = isToday(day);
                return (
                  <div
                    key={dayKey(day)}
                    className={"min-w-0 " + (i > 0 ? "pl-3 " : "") + (i < 6 ? "pr-3" : "")}
                    style={{ borderLeft: i > 0 ? `1px solid ${ALMA.border}` : undefined }}
                  >
                    <div className="flex items-baseline gap-1.5 pb-2">
                      <span
                        className="text-[0.72rem] uppercase tracking-[0.18em]"
                        style={{ color: today ? ALMA.berry : ALMA.ink, opacity: today ? 1 : 0.65 }}
                      >
                        {DAY_LABELS[i]}
                      </span>
                      <span className="nums font-display text-[1.15rem] leading-none" style={{ color: today ? ALMA.berry : ALMA.ink }}>
                        {format(day, "d")}
                      </span>
                    </div>
                    {loadingClasses ? (
                      <div className="space-y-2 pt-2">
                        <SkeletonRow height={88} />
                        <SkeletonRow height={88} />
                      </div>
                    ) : dayClasses.length === 0 ? (
                      <p className="pt-3 pb-2 text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.75, borderTop: `1px solid ${ALMA.border}` }}>
                        El estudio descansa.
                      </p>
                    ) : (
                      <div style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                        {dayClasses.map((cls) => (
                          <ClassCell key={cls.raw.id} cls={cls} state={getRowState(cls)} onPick={() => openClass(cls.raw.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

type ClassRowProps = {
  cls: DecoratedClass;
  state: RowState;
  onPick: () => void;
};

/* Fila editorial móvil: hora grande, clase, instructora, cupos y estado en texto. */
const ClassRow = ({ cls, state, onPick }: ClassRowProps) => {
  const inner = (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-4">
      <div className="w-[3.2rem]" style={{ opacity: state.dimmed ? 0.55 : 1 }}>
        <p className="nums font-display text-[1.1rem] leading-none" style={{ color: ALMA.ink }}>
          {cls.timeLabel}
        </p>
        {cls.endLabel && (
          <p className="nums mt-1 text-[0.72rem] leading-none" style={{ color: ALMA.ink, opacity: 0.6 }}>
            {cls.endLabel}
          </p>
        )}
      </div>
      <div className="min-w-0" style={{ opacity: state.dimmed ? 0.55 : 1 }}>
        <p className="text-[0.94rem] font-medium leading-tight truncate" style={{ color: ALMA.ink }}>
          {cls.name}
        </p>
        <p className="mt-0.5 text-[0.78rem] truncate" style={{ color: ALMA.ink, opacity: 0.65 }}>
          {cls.instructor}
        </p>
        <div className="mt-1.5">
          <Tag>{CAT_LABEL[cls.classCat]}</Tag>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right">
          <p className="nums text-[0.75rem]" style={{ color: ALMA.ink, opacity: state.dimmed ? 0.55 : 0.75 }}>
            {cls.remaining} de {cls.capacity} lugares
          </p>
          <p className="mt-0.5 text-[0.75rem] font-medium" style={{ color: state.color, opacity: state.dimmed ? 0.75 : 1 }}>
            {state.label}
          </p>
        </div>
        {state.interactive && <ChevronRight size={15} style={{ color: ALMA.ink, opacity: 0.4 }} />}
      </div>
    </div>
  );

  if (state.interactive) {
    return (
      <button
        type="button"
        data-press
        onClick={onPick}
        aria-label={`${cls.name}, ${cls.timeLabel}, ${state.label}`}
        className="block w-full cursor-pointer border-0 bg-transparent px-1 text-left transition-colors hover:bg-[#F4F1EA]"
        style={{ borderTop: `1px solid ${ALMA.border}` }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="px-1" style={{ borderTop: `1px solid ${ALMA.border}` }}>
      {inner}
    </div>
  );
};

/* Fila compacta para las columnas de la semana en desktop: mismo lenguaje, sin tarjetas. */
const ClassCell = ({ cls, state, onPick }: ClassRowProps) => {
  const inner = (
    <div className="py-3">
      <div style={{ opacity: state.dimmed ? 0.55 : 1 }}>
        <p className="nums font-display text-[0.95rem] leading-none" style={{ color: ALMA.ink }}>
          {cls.timeLabel}
        </p>
        <p className="mt-1 text-[0.82rem] font-medium leading-snug" style={{ color: ALMA.ink }}>
          {cls.name}
        </p>
        <p className="mt-0.5 text-[0.72rem] truncate" style={{ color: ALMA.ink, opacity: 0.65 }}>
          {cls.instructor}
        </p>
        <p className="mt-1 text-[0.72rem] uppercase tracking-[0.12em]" style={{ color: ALMA.berry }}>
          {CAT_LABEL[cls.classCat]}
        </p>
      </div>
      <p className="nums mt-1.5 text-[0.75rem]" style={{ color: ALMA.ink, opacity: state.dimmed ? 0.55 : 0.75 }}>
        {cls.remaining} de {cls.capacity} lugares
      </p>
      <p className="mt-0.5 text-[0.75rem] font-medium" style={{ color: state.color, opacity: state.dimmed ? 0.75 : 1 }}>
        {state.label}
      </p>
    </div>
  );

  if (state.interactive) {
    return (
      <button
        type="button"
        data-press
        onClick={onPick}
        aria-label={`${cls.name}, ${cls.timeLabel}, ${state.label}`}
        className="block w-full cursor-pointer border-0 bg-transparent px-1 text-left transition-colors hover:bg-[#F4F1EA]"
        style={{ borderTop: `1px solid ${ALMA.border}` }}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="px-1" style={{ borderTop: `1px solid ${ALMA.border}` }}>
      {inner}
    </div>
  );
};

export default BookClasses;
