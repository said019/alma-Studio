import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import api from "@/lib/api";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { ClassesCoaches } from "@/components/landing/ClassesCoaches";
import { WeekSchedule } from "@/components/landing/WeekSchedule";
import { Plans } from "@/components/landing/Plans";
import { Contact } from "@/components/landing/Contact";
import { LandingFooter } from "@/components/landing/LandingFooter";
import {
  normalizeClasses, splitPlans, weekDays, weekStartFor,
  type ApiClass, type ClassTypeRow, type CoachRow, type PlanRow,
} from "@/components/landing/landingData";

const lista = <T,>(data: unknown): T[] => (Array.isArray(data) ? data : ((data as { data?: T[] })?.data ?? []));

/** Aparición suave por sección; se observa a sí misma al montarse (también si llega tarde). Sin IntersectionObserver queda visible. */
function Reveal({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("is-visible");
      return;
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { el.classList.add("is-visible"); io.disconnect(); }
    }, { threshold: 0.12 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} data-reveal>{children}</div>;
}

export default function Landing() {
  const now = useMemo(() => new Date(), []);
  const start = weekStartFor(now);
  const days = weekDays(start);
  const from = days[0].iso;
  const to = days[6].iso;

  const classesQ = useQuery({
    queryKey: ["public-classes", from, to],
    queryFn: async () => lista<ApiClass>((await api.get(`/classes?start=${from}&end=${to}`)).data),
    staleTime: 1000 * 60 * 2,
  });
  const plansQ = useQuery({
    queryKey: ["plans-public"],
    queryFn: async () => lista<PlanRow>((await api.get("/plans?active=true")).data),
  });
  const typesQ = useQuery({
    queryKey: ["class-types-public"],
    queryFn: async () => lista<ClassTypeRow>((await api.get("/class-types")).data),
  });
  const coachesQ = useQuery({
    queryKey: ["public-instructors"],
    queryFn: async () => lista<CoachRow>((await api.get("/public/instructors")).data),
  });

  const classes = useMemo(() => normalizeClasses(classesQ.data ?? [], now), [classesQ.data, now]);
  const { trial, rest } = useMemo(() => splitPlans(plansQ.data ?? []), [plansQ.data]);
  const hasPlans = !!trial || rest.length > 0;

  const links = [
    { href: "#clases", label: "Clases" },
    { href: "#horario", label: "Horario" },
    ...(hasPlans ? [{ href: "#paquetes", label: "Paquetes" }] : []),
    { href: "#contacto", label: "Contacto" },
  ];

  return (
    <div className="min-h-screen bg-canvas bg-app-glow text-ink">
      <LandingNav links={links} />
      <main>
        <LandingHero />
        <Reveal>
          <ClassesCoaches
            classTypes={typesQ.data ?? []}
            coaches={coachesQ.data ?? []}
            loading={typesQ.isLoading || coachesQ.isLoading}
            error={typesQ.isError && coachesQ.isError}
            onRetry={() => { typesQ.refetch(); coachesQ.refetch(); }}
          />
        </Reveal>
        <Reveal>
          <WeekSchedule
            days={days}
            classes={classes}
            todayIso={format(now, "yyyy-MM-dd")}
            loading={classesQ.isLoading}
            error={classesQ.isError}
            onRetry={() => classesQ.refetch()}
          />
        </Reveal>
        {hasPlans && (
          <Reveal>
            <Plans trial={trial} plans={rest} />
          </Reveal>
        )}
        <Reveal>
          <Contact />
        </Reveal>
      </main>
      <LandingFooter />
    </div>
  );
}
