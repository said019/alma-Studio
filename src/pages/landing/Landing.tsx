import { useEffect, useMemo, useRef } from "react";
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

/** Aparición suave de las secciones; sin IntersectionObserver (o en pruebas) todo queda visible. */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = root.querySelectorAll("[data-reveal]");
    if (typeof IntersectionObserver === "undefined") {
      els.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
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

  const ref = useReveal();
  return (
    <div ref={ref} className="min-h-screen bg-canvas bg-app-glow text-ink">
      <LandingNav links={links} />
      <main>
        <LandingHero />
        <div data-reveal>
          <ClassesCoaches
            classTypes={typesQ.data ?? []}
            coaches={coachesQ.data ?? []}
            loading={typesQ.isLoading || coachesQ.isLoading}
            error={typesQ.isError && coachesQ.isError}
            onRetry={() => { typesQ.refetch(); coachesQ.refetch(); }}
          />
        </div>
        <div data-reveal>
          <WeekSchedule
            days={days}
            classes={classes}
            todayIso={format(now, "yyyy-MM-dd")}
            loading={classesQ.isLoading}
            error={classesQ.isError}
            onRetry={() => classesQ.refetch()}
          />
        </div>
        {hasPlans && (
          <div data-reveal>
            <Plans trial={trial} plans={rest} />
          </div>
        )}
        <div data-reveal>
          <Contact />
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
