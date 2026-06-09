import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import Schedule from "@/components/Schedule";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Play,
  Plus,
  Minus,
  MapPin,
  Phone,
  Mail,
  Clock,
  MessageCircle,
} from "lucide-react";

const IconInstagram = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

const IconFacebook = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
import almaHeroClass from "@/assets/alma/alma-hero-class.jpg";
import almaClassEnergy from "@/assets/alma/alma-class-energy.jpg";
import almaBarreLine from "@/assets/alma/alma-barre-line.jpg";
import almaDetailAnkleWeights from "@/assets/alma/alma-detail-ankle-weights.jpg";
import almaGallery01 from "@/assets/alma/alma-gallery-01.jpg";
import almaGallery02 from "@/assets/alma/alma-gallery-02.jpg";
import almaGallery03 from "@/assets/alma/alma-gallery-03.jpg";
import almaGallery04 from "@/assets/alma/alma-gallery-04.jpg";
import almaGallery05 from "@/assets/alma/alma-gallery-05.jpg";
import almaGallery06 from "@/assets/alma/alma-gallery-06.jpg";
import almaGallery07 from "@/assets/alma/alma-gallery-07.jpg";
import almaGallery08 from "@/assets/alma/alma-gallery-08.jpg";
import almaInstagram01 from "@/assets/alma/instagram/alma-instagram-01.jpg";
import almaInstagram02 from "@/assets/alma/instagram/alma-instagram-02.jpg";
import almaInstagram03 from "@/assets/alma/instagram/alma-instagram-03.jpg";
import almaIconUrl from "@/assets/alma/alma-icon.png";


/* ═════════════════════════════════════════════════════════════
   Alma Movement · Landing
   Full palette editorial. Berry / Coral / Olive / Orange roles.
   ═════════════════════════════════════════════════════════════ */

/* ── Brand color roles ── */
// Paleta Frame Pilates Lab (extraída de su sitio): greige cálido + café vino
// + tan. Lujo terroso monocromático.
const ALMA = {
  cream: "#E9E6DF",   // greige cálido, canvas
  blush: "#E4D2C3",   // tan suave, superficies y CTAs claros
  ink: "#4A3333",     // café cálido con matiz vino, texto + oscuros
  inkDeep: "#241B1A", // café casi negro, secciones drenched (footer)
  berry: "#8A6E60",   // café medio, acento
  wine: "#76214D",    // reservado (sin uso en la dirección Frame)
  coral: "#C7A892",   // tan apagado
  olive: "#8A7C66",   // neutro cálido
  orange: "#C7A892",  // tan apagado
  sand: "#DCD3C5",    // neutro greige
  border: "#D8CFC1",  // borde greige
} as const;

/* ───── Types ───── */
// Disciplinas (tipos de clase) que vienen de /api/class-types. Áreas:
// 'studio' (Mat, Barre, Sculpt) y 'reformer_tower' (Reformer, Tower).
type ClassTypeRow = {
  id: string;
  name: string;
  subtitle: string | null;
  description: string | null;
  category: string;
  intensity: "ligera" | "media" | "pesada" | "todas";
  color: string;
  emoji: string;
  level: string;
  duration_min: number;
  capacity: number;
  is_active: boolean;
  sort_order: number;
};

/* Catálogo real proveniente de /plans (camelCase) */
type PlanRow = {
  id: string;
  name: string;
  description?: string;
  price: number;
  effectivePrice?: number;
  openingActive?: boolean;
  classLimit: number | null;
  durationDays: number;
  classCategory: string;
  isActive?: boolean;
  sortOrder?: number;
  morningOnly?: boolean;
};

type CatalogGroup = { key: string; title: string; items: PlanRow[] };

/* ───── Fallbacks ───── */
const FALLBACK_CLASS_TYPES: ClassTypeRow[] = [
  { id: "ct1", name: "Pilates Reformer", subtitle: "Fuerza y control en equipo", description: "Trabajo de cuerpo completo en el reformer: resistencia, alineación y control en grupos pequeños.", category: "reformer_tower", intensity: "media", color: ALMA.ink, emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 4, is_active: true, sort_order: 1 },
  { id: "ct2", name: "Pilates Tower", subtitle: "Movilidad y precisión", description: "Trabajo en torre que combina resistencia y movilidad para una postura fuerte y consciente.", category: "reformer_tower", intensity: "media", color: ALMA.ink, emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 4, is_active: true, sort_order: 2 },
  { id: "ct3", name: "Pilates Mat", subtitle: "Core y conexión", description: "Pilates en tapete con accesorios: core profundo, control y respiración consciente.", category: "studio", intensity: "media", color: ALMA.berry, emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 8, is_active: true, sort_order: 3 },
  { id: "ct4", name: "Barre", subtitle: "Postura y tono", description: "Energía, fuerza y postura en una clase cercana apta para todos los niveles.", category: "studio", intensity: "media", color: ALMA.berry, emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 8, is_active: true, sort_order: 4 },
  { id: "ct5", name: "Sculpt", subtitle: "Fuerza funcional", description: "Trabajo de tonificación y fuerza funcional para todo el cuerpo, con ritmo y constancia.", category: "studio", intensity: "media", color: ALMA.berry, emoji: "sparkles", level: "Todos los niveles", duration_min: 50, capacity: 8, is_active: true, sort_order: 5 },
];

/* ── Real photos pool ── */
const HERO_PHOTOS = [almaHeroClass, almaClassEnergy, almaBarreLine] as const;

const GALLERY_IMAGES = [
  almaClassEnergy,
  almaBarreLine,
  almaGallery01,
  almaGallery02,
  almaGallery03,
  almaGallery04,
  almaGallery05,
  almaGallery06,
  almaGallery07,
  almaGallery08,
  almaDetailAnkleWeights,
  almaInstagram03,
  almaInstagram02,
  almaInstagram01,
];

const CLASS_IMAGE_POOL = [
  almaHeroClass,
  almaClassEnergy,
  almaBarreLine,
  almaDetailAnkleWeights,
  almaInstagram01,
  almaInstagram02,
  almaInstagram03,
  almaGallery01,
];

/* ───── Helpers ───── */
function normalizeVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/api/drive/video/")) return url;
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)\/preview/);
  if (m) return `/api/drive/video/${m[1]}`;
  return url;
}

function clampFocus(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function pickClassImage(name: string, idx: number): string {
  const lc = (name || "").toLowerCase();
  // Reformer/Tower usan la foto del estudio; el resto rota por el pool.
  if (lc.includes("reformer") || lc.includes("tower")) return almaHeroClass;
  return CLASS_IMAGE_POOL[idx % CLASS_IMAGE_POOL.length];
}

/* ═════════════════════════════════════════════════════════════
   INDEX
   ═════════════════════════════════════════════════════════════ */
const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const isAdminRole = ["admin", "super_admin", "instructor", "reception"].includes(user?.role ?? "");
  const membershipCtaPath = isAuthenticated
    ? (isAdminRole ? "/admin/dashboard" : "/app/checkout")
    : "/auth/register";

  const [navScrolled, setNavScrolled] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [classTypes, setClassTypes] = useState<ClassTypeRow[]>(FALLBACK_CLASS_TYPES);
  const [openClassId, setOpenClassId] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<number | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  const [instructors, setInstructors] = useState<{
    id: string;
    displayName: string;
    bio?: string;
    specialties?: string | string[];
    photoUrl?: string;
    photoFocusX?: number;
    photoFocusY?: number;
  }[]>([]);

  /* ── Queries ── */
  const { data: plansData } = useQuery<{ data: any[] }>({
    queryKey: ["plans-public"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
    staleTime: 1000 * 60 * 5,
  });

  /* Catálogo real desde /plans (solo planes activos). */
  const planRows: PlanRow[] = useMemo(
    () =>
      (Array.isArray(plansData?.data) ? plansData.data : []).filter(
        (p: any) => p?.isActive !== false
      ),
    [plansData]
  );

  const CATALOG_GROUPS: { key: string; title: string }[] = [
    { key: "studio", title: "Studio · Mat · Barre · Sculpt" },
    { key: "reformer_tower", title: "Reformer & Tower" },
    { key: "mixto", title: "Paquetes mixtos" },
    { key: "all", title: "Premium" },
  ];

  const groupedPlans: CatalogGroup[] = useMemo(
    () =>
      CATALOG_GROUPS.map((g) => ({
        ...g,
        items: planRows
          .filter((p) => p.classCategory === g.key)
          .filter((p) => p.name !== "Alma Studio Intro")
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      })).filter((g) => g.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [planRows]
  );

  /* La clase muestra es el plan más corto de una sola sesión (Alma Studio Intro). */
  const trialPlan: PlanRow | undefined = useMemo(() => {
    const candidates = planRows
      .filter((p) => p.classLimit === 1 && !p.morningOnly)
      .sort((a, b) => (a.durationDays ?? 0) - (b.durationDays ?? 0));
    return (
      planRows.find((p) => p.name === "Alma Studio Intro") ?? candidates[0]
    );
  }, [planRows]);

  /* ── Effects ── */
  useEffect(() => {
    const handleScroll = () => setNavScrolled(window.scrollY > 60);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    api.get<{ data: ClassTypeRow[] }>("/admin/class-types").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data.filter((c) => c.is_active) : [];
      if (rows.length > 0) setClassTypes(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    api.get("/public/instructors").then(({ data }) => {
      const rows = Array.isArray(data?.data) ? data.data : [];
      if (rows.length > 0) setInstructors(rows);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("opacity-100", "translate-y-0");
            entry.target.classList.remove("opacity-0", "translate-y-8");
          }
        });
      },
      { threshold: 0.12 }
    );
    document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    setNavOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  /* ═══════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen text-[color:var(--ink)] [--ink:#4A3333] [--ink-deep:#241B1A] [--cream:#E9E6DF] [--blush:#E4D2C3] [--berry:#8A6E60] [--wine:#76214D] [--coral:#C7A892] [--olive:#8A7C66] [--orange:#C7A892] [--sand:#DCD3C5] [--border:#D8CFC1]" style={{ backgroundColor: ALMA.cream }}>

      {/* ═════════ NAV ═════════ */}
      <nav
        className={
          "fixed inset-x-0 top-0 z-[100] transition-[background-color,backdrop-filter,border-color,padding] duration-500 " +
          (navScrolled
            ? "bg-[#FAF9F6]/92 backdrop-blur-xl border-b border-[#E0D5C6]/70 py-3"
            : "bg-transparent py-5")
        }
      >
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
          <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="flex items-center no-underline">
            <img src="/wallet-logo@2x.png" alt="Alma Movement" className="h-10 sm:h-12 w-auto object-contain" />
          </a>

          <ul className="hidden lg:flex items-center gap-7 list-none m-0 p-0">
            {[
              { label: "Estudio", id: "estudio" },
              { label: "Clases", id: "clases" },
              { label: "Horario", id: "horario" },
              { label: "Paquetes", id: "paquetes" },
              { label: "Coaches", id: "coaches" },
              { label: "Galería", id: "galeria" },
            ].map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => scrollTo(item.id)}
                  className="relative bg-transparent border-0 cursor-pointer text-[0.78rem] uppercase tracking-[0.2em] text-[color:var(--ink)]/68 hover:text-[color:var(--berry)] transition-colors"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2">
            {isAuthenticated && user ? (
              <button
                onClick={() => navigate(["admin", "super_admin", "instructor", "reception"].includes(user.role) ? "/admin/dashboard" : "/app")}
                className="hidden sm:inline-flex items-center gap-2 rounded-full px-4 py-2 text-[0.78rem] font-medium tracking-wide text-[color:var(--cream)] transition-transform hover:-translate-y-px"
                style={{ backgroundColor: ALMA.berry }}
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[color:var(--cream)]/22 text-[0.7rem] font-bold uppercase">
                  {user.displayName?.[0] ?? user.email?.[0] ?? "U"}
                </span>
                <span className="truncate max-w-[110px]">
                  {["admin", "super_admin"].includes(user.role) ? "Admin" : user.displayName?.split(" ")[0] ?? "Mi cuenta"}
                </span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate("/auth/login")}
                  className="hidden sm:inline-block bg-transparent border-0 cursor-pointer text-[0.78rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/68 hover:text-[color:var(--berry)] transition-colors"
                >
                  Entrar
                </button>
                <button
                  onClick={() => navigate("/auth/register")}
                  className="group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[0.76rem] font-medium uppercase tracking-[0.16em] transition-transform hover:-translate-y-px"
                  style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
                >
                  Reservar
                  <ArrowUpRight size={14} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </button>
              </>
            )}
            <button
              onClick={() => setNavOpen((v) => !v)}
              aria-label="Menú"
              className="lg:hidden grid h-10 w-10 place-items-center rounded-full border border-[#E0D5C6]/70 bg-[#FAF9F6]/85 text-[color:var(--ink)] transition-colors hover:border-[color:var(--berry)]"
            >
              {navOpen ? <Minus size={16} /> : <Plus size={16} />}
            </button>
          </div>
        </div>

        {/* Mobile menu drawer */}
        <div
          className={
            "lg:hidden grid overflow-hidden transition-[grid-template-rows] duration-500 ease-out " +
            (navOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]")
          }
        >
          <div className="min-h-0 overflow-hidden">
            <ul className="flex flex-col gap-1 px-5 py-4 list-none m-0" style={{ backgroundColor: ALMA.cream, borderTop: `1px solid ${ALMA.border}` }}>
              {[
                { label: "Estudio", id: "estudio" },
                { label: "Clases", id: "clases" },
                { label: "Horario", id: "horario" },
                { label: "Paquetes", id: "paquetes" },
                { label: "Coaches", id: "coaches" },
                { label: "Galería", id: "galeria" },
                { label: "Contacto", id: "contacto" },
              ].map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => scrollTo(item.id)}
                    className="flex w-full items-center justify-between bg-transparent border-0 cursor-pointer py-3 text-[0.92rem] tracking-wide text-[color:var(--ink)]/85 hover:text-[color:var(--berry)] transition-colors"
                  >
                    {item.label}
                    <ArrowRight size={14} className="opacity-40" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </nav>

      {/* ═════════ HERO ═════════ */}
      <section id="top" className="relative px-3 sm:px-5 lg:px-7 pt-24 sm:pt-28">
        {/* Full-bleed: foto del estudio + titular serif sobrepuesto (dirección Frame) */}
        <div className="relative mx-auto max-w-[1480px] overflow-hidden rounded-[26px] sm:rounded-[34px] min-h-[80vh] lg:min-h-[88vh] flex flex-col justify-end">
          <img
            src={HERO_PHOTOS[0]}
            alt="Estudio de Pilates Alma Movement en Juriquilla, Querétaro"
            className="alma-photo absolute inset-0 h-full w-full object-cover"
            loading="eager"
            fetchPriority="high"
          />
          <div className="absolute inset-0" style={{ background: "linear-gradient(176deg, rgba(42,30,27,0.36) 0%, rgba(42,30,27,0.04) 32%, rgba(42,30,27,0.10) 54%, rgba(42,30,27,0.74) 100%)" }} />

          <div className="relative z-10 p-6 sm:p-10 lg:p-16 max-w-[1100px]" data-stagger>
            <div className="flex items-center gap-3" data-stagger-item>
              <span className="inline-block h-px w-10" style={{ backgroundColor: ALMA.cream, opacity: 0.65 }} />
              <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.cream, opacity: 0.92 }}>
                Estudio de Pilates · Juriquilla, Querétaro
              </span>
            </div>

            <h1 data-stagger-item className="font-display mt-5 leading-[0.98]" style={{ color: ALMA.cream, fontSize: "clamp(2.7rem, 7.4vw, 6.4rem)", fontWeight: 380 }}>
              Donde el movimiento
              <span className="block font-display-italic" style={{ color: ALMA.blush, fontWeight: 360 }}>se vuelve bienestar.</span>
            </h1>

            <p data-stagger-item className="mt-6 max-w-[48ch] text-[1.02rem] leading-[1.7]" style={{ color: ALMA.cream, opacity: 0.86 }}>
              Pilates Reformer, Tower, Mat, Barre y Sculpt en grupos pequeños. Técnica, alineación y comunidad en un espacio pensado para que el movimiento se sienta como bienestar.
            </p>

            <div data-stagger-item className="mt-9 flex flex-wrap items-center gap-4">
              <button
                onClick={() => navigate(membershipCtaPath)}
                data-press
                className="group inline-flex items-center gap-3 rounded-full px-7 py-4 text-[0.82rem] font-medium uppercase tracking-[0.16em] transition-transform duration-200 will-change-transform"
                style={{ backgroundColor: ALMA.inkDeep, color: ALMA.cream }}
              >
                Reserva tu clase muestra
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15 transition-transform duration-300 group-hover:translate-x-1" style={{ transitionTimingFunction: "var(--ease-alma-out)" }}>
                  <ArrowUpRight size={13} />
                </span>
                <span className="ml-1 text-[0.78rem] font-normal opacity-85">$150</span>
              </button>
              <button
                onClick={() => scrollTo("clases")}
                data-press
                className="group inline-flex items-center gap-3 bg-transparent border-0 cursor-pointer text-[0.8rem] uppercase tracking-[0.2em] transition-colors"
                style={{ color: ALMA.cream }}
              >
                <span className="grid h-10 w-10 place-items-center rounded-full transition-colors group-hover:bg-white/10" style={{ border: "1px solid rgba(250,249,246,0.42)" }}>
                  <Play size={12} className="ml-0.5" />
                </span>
                Ver disciplinas
              </button>
            </div>
          </div>
        </div>

        {/* Datos del estudio, sobre crema */}
        <dl className="mx-auto max-w-[1480px] grid grid-cols-3 gap-5 sm:gap-8 px-4 sm:px-6 mt-7 sm:mt-9" data-stagger>
          {[
            { k: "5", l: "Disciplinas Alma" },
            { k: "4–8", l: "Lugares por clase · 4 Reformer/Tower, 8 Studio" },
            { k: "50 min", l: "Cada sesión" },
          ].map((stat) => (
            <div key={stat.l} data-stagger-item className="border-t pt-3" style={{ borderColor: ALMA.border }}>
              <dt className="font-display text-[1.9rem] sm:text-[2.4rem] leading-none" style={{ color: ALMA.berry, fontWeight: 400 }}>{stat.k}</dt>
              <dd className="mt-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/55">{stat.l}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ═════════ ESTUDIO · Esto es Alma ═════════ */}
      <section id="estudio" className="relative px-5 sm:px-8 lg:px-12 py-28 lg:py-40">
        <div className="mx-auto max-w-[1320px] grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          <div className="lg:col-span-5 reveal opacity-0 translate-y-8 transition-all duration-700">
            <div className="alma-photo-tint relative aspect-[4/5] overflow-hidden rounded-[24px]">
              <img src={almaClassEnergy} alt="Una clase en Alma Movement" className="alma-photo absolute inset-0 h-full w-full object-cover" loading="lazy" />
            </div>
            <p className="mt-3 text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: ALMA.olive }}>
              Plaza Arce, Juriquilla
            </p>
          </div>

          <div className="lg:col-span-7 lg:pl-6 reveal opacity-0 translate-y-8 transition-all duration-700">
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.berry }}>
              Esto es Alma
            </span>
            <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.ink, fontSize: "clamp(2.5rem, 5.6vw, 5rem)" }}>
              Un estudio donde
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.berry }}>te conocen por tu nombre.</span>
            </h2>
            <div className="mt-7 space-y-5 text-[1.02rem] leading-[1.85] text-[color:var(--ink)]/76 max-w-[60ch]">
              <p>
                Alma nace de una idea simple: que el movimiento se sienta como bienestar. Grupos pequeños, atención personalizada y técnica cuidada en cada disciplina, para que cada clase te acerque a tu mejor versión.
              </p>
              <p>
                Aquí no hay multitud ni prisa. Hay equipo de Pilates, técnica cuidada, música elegida y una intención: que salgas con la sensación de haber hecho algo real por ti.
              </p>
            </div>

            {/* Inline values, no card grid */}
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-0 list-none m-0 p-0" data-stagger>
              {[
                { tag: "01", word: "Bienestar", note: "Cuerpo, postura, energía." },
                { tag: "02", word: "Comunidad", note: "Grupos pequeños, atención cercana." },
                { tag: "03", word: "Compromiso", note: "Tu progreso, paso a paso." },
              ].map((v, i) => (
                <li
                  key={v.word}
                  data-stagger-item
                  className={"py-5 sm:py-0 sm:pl-6 " + (i === 0 ? "border-t sm:border-t-0 sm:border-l-0" : "border-t sm:border-t-0 sm:border-l")}
                  style={{ borderColor: ALMA.border }}
                >
                  <span className="font-bebas text-[0.92rem] tracking-[0.2em]" style={{ color: ALMA.coral }}>{v.tag}</span>
                  <h3 className="font-bebas text-[1.65rem] leading-tight mt-1" style={{ color: ALMA.ink }}>{v.word.toUpperCase()}</h3>
                  <p className="mt-2 text-[0.88rem] leading-[1.65] text-[color:var(--ink)]/65">{v.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ═════════ CLASES ═════════ */}
      <section id="clases" className="relative px-5 sm:px-8 lg:px-12 pb-20 lg:pb-28" style={{ backgroundColor: ALMA.cream }}>
        <div className="mx-auto max-w-[1320px]">
          <div className="reveal opacity-0 translate-y-8 transition-all duration-700 mb-10 lg:mb-14">
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.olive }}>
              Tu semana en Alma
            </span>
            <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.ink, fontSize: "clamp(2.4rem, 5.2vw, 4.6rem)" }}>
              Evoluciona
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.olive }}>en cada clase.</span>
            </h2>
            <p className="mt-6 max-w-[56ch] text-[1.02rem] leading-[1.75] text-[color:var(--ink)]/72">
              Cada clase trabaja técnica, alineación y control en grupos pequeños. Cupos reducidos: 4 lugares en Reformer y Tower, 8 en Studio.
            </p>
          </div>

          {/* Asymmetric editorial grid */}
          <ul className="reveal opacity-0 translate-y-8 transition-all duration-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-x-5 gap-y-10 list-none m-0 p-0" data-stagger>
            {classTypes.slice(0, 8).map((c, idx) => {
              const isOpen = openClassId === c.id;
              const img = pickClassImage(c.name, idx);
              const layout = idx % 7;
              const span =
                layout === 0 ? "lg:col-span-7" :
                layout === 1 ? "lg:col-span-5" :
                layout === 2 ? "lg:col-span-4" :
                layout === 3 ? "lg:col-span-4" :
                layout === 4 ? "lg:col-span-4" :
                layout === 5 ? "lg:col-span-7" :
                "lg:col-span-5";
              const aspect =
                layout === 0 ? "aspect-[5/4]" :
                layout === 1 ? "aspect-[4/5]" :
                layout === 5 ? "aspect-[5/4]" :
                "aspect-[4/5]";
              return (
                <li key={c.id} className={span} data-stagger-item>
                  <button
                    onClick={() => setOpenClassId(isOpen ? null : c.id)}
                    data-press
                    className="group block w-full text-left bg-transparent border-0 p-0 cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <div className={"alma-photo-tint relative overflow-hidden rounded-[22px] " + aspect}>
                      <img
                        src={img}
                        alt={c.name}
                        loading="lazy"
                        className="alma-photo absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                      />
                      <div className="absolute inset-0 transition-opacity duration-500" style={{ background: "linear-gradient(180deg, rgba(46,32,28,0) 50%, rgba(46,32,28,0.55) 100%)" }} />
                      <div className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.6rem] uppercase tracking-[0.22em]" style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ALMA.berry }} />
                        {c.category === "reformer_tower" ? "Reformer · Tower" : c.category === "studio" ? "Studio" : c.category}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex items-end justify-between gap-4">
                        <div>
                          <h3 className="font-bebas text-[1.7rem] sm:text-[2.1rem] leading-[0.95]" style={{ color: ALMA.cream }}>
                            {c.name}
                          </h3>
                          {c.subtitle && (
                            <p className="mt-1 font-alilato italic text-[0.92rem]" style={{ color: ALMA.cream, opacity: 0.85 }}>
                              {c.subtitle}
                            </p>
                          )}
                        </div>
                        <span
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full transition-transform group-hover:rotate-45"
                          style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}
                        >
                          {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                        </span>
                      </div>
                    </div>

                    <div
                      className="grid overflow-hidden transition-[grid-template-rows] duration-500 ease-out"
                      style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="pt-5">
                          <p className="text-[0.95rem] leading-[1.75] text-[color:var(--ink)]/76 max-w-[60ch]">
                            {c.description}
                          </p>
                          <dl className="mt-4 flex flex-wrap gap-x-7 gap-y-2 text-[0.74rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/55">
                            <div className="flex items-baseline gap-2"><dt>Duración</dt><dd className="font-bebas text-[0.95rem]" style={{ color: ALMA.ink }}>{c.duration_min} min</dd></div>
                            <div className="flex items-baseline gap-2"><dt>Nivel</dt><dd className="font-bebas text-[0.95rem]" style={{ color: ALMA.ink }}>{c.level}</dd></div>
                            <div className="flex items-baseline gap-2"><dt>Cupo</dt><dd className="font-bebas text-[0.95rem]" style={{ color: ALMA.ink }}>{c.capacity}</dd></div>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ═════════ HORARIO (Schedule embed) ═════════ */}
      <Schedule />

      {/* ═════════ COACHES (Olive drench) ═════════ */}
      <CoachesSection instructors={instructors} />

      {/* ═════════ PAQUETES (Berry drench) ═════════ */}
      <PaquetesSection
        trialPlan={trialPlan}
        groupedPlans={groupedPlans}
        onPick={() => navigate(membershipCtaPath)}
      />

      {/* ═════════ POLÍTICAS ═════════ */}
      <PoliticasSection />

      {/* ═════════ TESTIMONIOS ═════════ */}
      <TestimoniosSection />

      {/* ═════════ GALERÍA ═════════ */}
      <GaleriaSection galleryIdx={galleryIdx} setGalleryIdx={setGalleryIdx} />

      {/* ═════════ CIERRE (Coral drench) ═════════ */}
      <section className="relative overflow-hidden px-5 sm:px-8 lg:px-12 py-32 lg:py-44" style={{ backgroundColor: ALMA.coral }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 80% 20%, ${ALMA.orange}55 0%, transparent 55%)` }} />
        <div className="relative mx-auto max-w-[1100px] text-center reveal opacity-0 translate-y-8 transition-all duration-700">
          <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.cream, opacity: 0.78 }}>
            Tu turno
          </span>
          <h2 className="font-bebas mt-5 leading-[0.86]" style={{ color: ALMA.cream, fontSize: "clamp(2.8rem, 8vw, 6.5rem)" }}>
            Reserva tu clase muestra,
            <span className="block italic font-alilato font-normal mt-2" style={{ color: ALMA.cream }}>te recibimos.</span>
          </h2>
          <p className="mt-7 mx-auto max-w-[52ch] text-[1.05rem] leading-[1.7]" style={{ color: ALMA.cream, opacity: 0.88 }}>
            Una clase muestra para conocernos. Te mostramos el equipo, ajustamos tu técnica y te enseñamos cómo se siente entrenar acompañada.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={() => navigate(membershipCtaPath)}
              className="group inline-flex items-center gap-3 rounded-full px-8 py-4 text-[0.86rem] font-medium uppercase tracking-[0.18em] transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}
            >
              Reservar clase muestra
              <span className="grid h-7 w-7 place-items-center rounded-full transition-transform group-hover:translate-x-1" style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}>
                <ArrowUpRight size={13} />
              </span>
            </button>
            <a
              href="https://wa.me/5210000000000?text=Hola%2C%20me%20interesa%20conocer%20m%C3%A1s%20sobre%20Alma%20Movement" /* TODO: WhatsApp real de Alma */
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-full px-7 py-4 text-[0.84rem] uppercase tracking-[0.18em] no-underline transition-colors hover:bg-[color:var(--cream)]/10"
              style={{ border: `1px solid ${ALMA.cream}66`, color: ALMA.cream }}
            >
              <MessageCircle size={16} /> WhatsApp directo
            </a>
          </div>
        </div>
      </section>

      {/* ═════════ CONTACTO + MAPA ═════════ */}
      <ContactoSection />

      {/* ═════════ FOOTER (Berry drench) ═════════ */}
      <FooterSection scrollTo={scrollTo} navigate={navigate} />
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════
   COACHES (Olive drench)
   ═══════════════════════════════════════════════════════════ */
const CoachesSection = ({ instructors }: { instructors: { id: string; displayName: string; bio?: string; specialties?: string | string[]; photoUrl?: string; photoFocusX?: number; photoFocusY?: number }[] }) => {
  if (instructors.length === 0) return null;

  const items = instructors.map((inst) => ({
    key: inst.id,
    label: inst.displayName,
    coachTitle: inst.displayName,
    sub: Array.isArray(inst.specialties)
      ? (inst.specialties as unknown as string[]).join(" · ")
      : (typeof inst.specialties === "string" && inst.specialties ? inst.specialties : "Instructora"),
    bio: inst.bio || null,
    photoUrl: inst.photoUrl || null,
    photoFocusX: clampFocus(inst.photoFocusX),
    photoFocusY: clampFocus(inst.photoFocusY),
  }));

  const isSolo = items.length === 1;

  return (
    <section id="coaches" className="relative overflow-hidden px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.olive }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.07]" style={{ background: `radial-gradient(circle at 20% 30%, ${ALMA.cream} 0%, transparent 55%)` }} />
      <div className="relative mx-auto max-w-[1320px]">
        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.cream, opacity: 0.7 }}>
              Quién te va a recibir
            </span>
            <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.cream, fontSize: "clamp(2.4rem, 5.2vw, 4.6rem)" }}>
              Te enseña
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.cream, opacity: 0.85 }}>alguien que te conoce por tu nombre.</span>
            </h2>
          </div>
          <p className="max-w-[40ch] text-[0.95rem] leading-[1.7]" style={{ color: ALMA.cream, opacity: 0.78 }}>
            Quien te recibe ajusta cada clase a ti y sigue tu avance de cerca.
          </p>
        </div>

        <div className={"reveal opacity-0 translate-y-8 transition-all duration-700 grid gap-8 " + (isSolo ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
          {items.map((inst, idx) => (
            <article
              key={inst.key}
              className={isSolo ? "lg:col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center" : ""}
            >
              <div className={(isSolo ? "lg:col-span-6 " : "") + "alma-photo-tint relative overflow-hidden rounded-[24px] " + (isSolo ? "aspect-[4/5] lg:aspect-[5/6]" : "aspect-[3/4]")}>
                {inst.photoUrl ? (
                  <img
                    src={inst.photoUrl}
                    alt={inst.label}
                    className="alma-photo absolute inset-0 h-full w-full object-cover transition-transform duration-700 hover:scale-[1.03]"
                    style={{ objectPosition: clampFocus(inst.photoFocusX) + "% " + clampFocus(inst.photoFocusY) + "%" }}
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center" style={{ backgroundColor: ALMA.olive, color: ALMA.cream }}>
                    <img
                      src={CLASS_IMAGE_POOL[idx % CLASS_IMAGE_POOL.length]}
                      alt=""
                      className="alma-photo absolute inset-0 h-full w-full object-cover opacity-95"
                    />
                    <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 50%, ${ALMA.olive}cc 100%)` }} />
                  </div>
                )}
              </div>
              <div className={isSolo ? "lg:col-span-6" : "mt-5"}>
                <span className="text-[0.62rem] uppercase tracking-[0.24em]" style={{ color: ALMA.cream, opacity: 0.7 }}>{inst.sub}</span>
                <h3 className="font-bebas mt-2 leading-[0.92]" style={{ color: ALMA.cream, fontSize: isSolo ? "clamp(2.4rem, 4.4vw, 4rem)" : "clamp(1.7rem, 2.4vw, 2.4rem)" }}>
                  {inst.coachTitle}
                </h3>
                {inst.bio && (
                  <p className={"text-[0.95rem] leading-[1.75] max-w-[60ch] " + (isSolo ? "mt-5" : "mt-3")} style={{ color: ALMA.cream, opacity: 0.86 }}>
                    {inst.bio}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   PAQUETES (Berry drench)
   ═══════════════════════════════════════════════════════════ */
const formatPrice = (plan: PlanRow): string =>
  Number(plan.effectivePrice ?? plan.price).toLocaleString("es-MX");

const sessionsLabel = (plan: PlanRow): string =>
  plan.classLimit == null ? "Ilimitado" : `${plan.classLimit} sesiones`;

const PaquetesSection = ({
  trialPlan,
  groupedPlans,
  onPick,
}: {
  trialPlan: PlanRow | undefined;
  groupedPlans: CatalogGroup[];
  onPick: () => void;
}) => {
  return (
    <section id="paquetes" className="relative overflow-hidden px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.inkDeep }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.10]" style={{ background: `radial-gradient(circle at 80% 0%, ${ALMA.coral} 0%, transparent 55%), radial-gradient(circle at 0% 100%, ${ALMA.orange} 0%, transparent 60%)` }} />
      <div className="relative mx-auto max-w-[1320px]">
        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-12">
          <div>
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.cream, opacity: 0.72 }}>
              Inversión
            </span>
            <h2 className="font-bebas mt-4 leading-[0.9]" style={{ color: ALMA.cream, fontSize: "clamp(2.6rem, 6vw, 5.4rem)" }}>
              Un paquete
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.cream, opacity: 0.92 }}>para tu ritmo.</span>
            </h2>
          </div>
          <p className="max-w-[42ch] text-[0.95rem] leading-[1.7]" style={{ color: ALMA.cream, opacity: 0.78 }}>
            Elige tu paquete por modalidad, número de sesiones y vigencia (30 días). Estamos en modo apertura con precios especiales en los planes ilimitados.
          </p>
        </div>

        {/* Trial highlight — clase muestra */}
        {trialPlan && (
          <div className="reveal opacity-0 translate-y-8 transition-all duration-700 mb-10">
            <div className="rounded-[24px] p-7 sm:p-9 flex flex-col gap-5" style={{ backgroundColor: ALMA.cream }}>
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                <div>
                  <span className="text-[0.62rem] uppercase tracking-[0.24em]" style={{ color: ALMA.coral }}>Primera vez en Alma</span>
                  <h3 className="font-bebas mt-2 leading-tight" style={{ color: ALMA.berry, fontSize: "clamp(1.8rem, 3vw, 2.6rem)" }}>{trialPlan.name}</h3>
                </div>
                <span className="text-[0.78rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/60">{sessionsLabel(trialPlan)} · {trialPlan.durationDays} días</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-5">
                <div className="flex items-baseline gap-1">
                  <span className="font-bebas leading-none" style={{ color: ALMA.berry, fontSize: "clamp(3.5rem, 7vw, 5.8rem)" }}>${formatPrice(trialPlan)}</span>
                  <span className="text-[0.8rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/55">MXN</span>
                </div>
                <div className="flex-1">
                  <p className="text-[0.92rem] leading-[1.6] text-[color:var(--ink)]/72 max-w-[42ch]">
                    {trialPlan.description || "Tu primera clase en el estudio. Te mostramos el equipo y ajustamos tu técnica sin prisa."}
                  </p>
                </div>
                <button
                  onClick={onPick}
                  className="group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[0.76rem] font-medium uppercase tracking-[0.18em] transition-transform hover:-translate-y-0.5"
                  style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
                >
                  Quiero la mía
                  <ArrowUpRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Catálogo real agrupado por modalidad */}
        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 grid grid-cols-1 gap-6">
          {groupedPlans.map((group) => (
            <div key={group.key} className="rounded-[24px] overflow-hidden" style={{ backgroundColor: ALMA.cream }}>
              <div className="px-7 sm:px-9 pt-7 sm:pt-9 pb-1">
                <span className="text-[0.62rem] uppercase tracking-[0.24em]" style={{ color: ALMA.olive }}>Modalidad</span>
                <h3 className="font-bebas mt-2 leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.6rem, 2.6vw, 2.3rem)" }}>{group.title}</h3>
              </div>

              <ul className="mt-4 list-none m-0 p-0">
                {group.items.map((plan, i) => (
                  <li
                    key={plan.id}
                    className="group relative grid grid-cols-[auto_1fr_auto_auto] sm:grid-cols-[auto_1.8fr_1fr_auto_auto] items-center gap-x-4 sm:gap-x-6 gap-y-1 px-7 sm:px-9 py-5"
                    style={{ borderTop: `1px solid ${ALMA.border}` }}
                  >
                    <span className="font-bebas tabular-nums text-[0.86rem]" style={{ color: ALMA.coral }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bebas leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.15rem, 1.5vw, 1.4rem)" }}>{plan.name}</h4>
                        {plan.morningOnly && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.58rem] font-medium uppercase tracking-[0.16em]"
                            style={{ backgroundColor: `${ALMA.olive}1f`, color: ALMA.olive }}
                          >
                            Solo 7–10am
                          </span>
                        )}
                      </div>
                      <p className="text-[0.76rem] uppercase tracking-[0.16em] text-[color:var(--ink)]/55 mt-0.5">
                        {sessionsLabel(plan)} · {plan.durationDays} días
                      </p>
                      {plan.description && (
                        <p className="text-[0.84rem] leading-[1.55] text-[color:var(--ink)]/62 mt-1 max-w-[52ch]">
                          {plan.description}
                        </p>
                      )}
                    </div>
                    <div className="hidden sm:block" />
                    <div className="text-right">
                      <div className="font-bebas leading-none" style={{ color: ALMA.berry, fontSize: "clamp(1.6rem, 2.4vw, 2.1rem)" }}>${formatPrice(plan)}</div>
                      <div className="text-[0.66rem] uppercase tracking-[0.18em] text-[color:var(--ink)]/45 mt-0.5">MXN</div>
                    </div>
                    <button
                      onClick={onPick}
                      className="grid h-11 w-11 sm:h-12 sm:w-12 place-items-center rounded-full transition-transform group-hover:scale-105"
                      style={{ color: ALMA.berry, border: `1px solid ${ALMA.berry}` }}
                      aria-label={`Elegir ${plan.name}`}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="reveal opacity-0 translate-y-8 transition-all duration-700 mt-6 text-[0.78rem] uppercase tracking-[0.18em] text-center" style={{ color: ALMA.cream, opacity: 0.55 }}>
          Pagos por transferencia Banorte o efectivo en el estudio · Precios en MXN
        </p>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   POLÍTICAS — editorial accordion list, not 8 cards
   ═══════════════════════════════════════════════════════════ */
const PoliticasSection = () => {
  const items = [
    { num: "01", title: "Primera vez", text: "Si eres nueva, llega 10 minutos antes. Te mostramos el equipo y el espacio sin prisa. El uso de calcetines antiderrapantes es obligatorio." },
    { num: "02", title: "Reservación", text: "Todas las clases requieren reserva previa. Cupo de 4 lugares en Reformer/Tower y 8 en Studio." },
    { num: "03", title: "Cancelaciones", text: "Si cancelas dentro de las 12 horas previas a tu clase y acumulas 5 clases reservadas sin asistir, se aplica una penalización con pérdida de puntos." },
    { num: "04", title: "En el estudio", text: "Respeta el horario de inicio, mantén tu celular en silencio e informa antes cualquier lesión o condición médica." },
    { num: "05", title: "Pagos", text: "Transferencia Banorte · Estefanía Torres Lanzagorta · CLABE 072298012591154950. También aceptamos efectivo en el estudio." },
    { num: "06", title: "Vigencia", text: "Todos los paquetes tienen vigencia de 30 días a partir de la compra." },
    { num: "07", title: "Asistencia", text: "El check-in con QR registra tus asistencias y reservas. Llega 10 minutos antes para registrarte sin prisa." },
    { num: "08", title: "Comunidad", text: "Avisos y recordatorios de tus clases se comunican principalmente por WhatsApp. Cualquier duda, escríbenos por ahí." },
  ];
  const [open, setOpen] = useState<string | null>("01");

  return (
    <section id="politicas" className="relative px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.cream }}>
      <div className="mx-auto max-w-[1320px]">
        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 grid grid-cols-1 lg:grid-cols-12 gap-10 mb-10">
          <div className="lg:col-span-5">
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.olive }}>
              Lo que tienes que saber
            </span>
            <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.ink, fontSize: "clamp(2.2rem, 4.6vw, 4rem)" }}>
              Reglas de la casa,
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.olive }}>en una página.</span>
            </h2>
          </div>
          <p className="lg:col-span-7 lg:pl-6 text-[0.96rem] leading-[1.75] text-[color:var(--ink)]/70 max-w-[60ch] self-end">
            Toca cada punto para abrirlo. Lo que no esté aquí, pregúntanos por WhatsApp; respondemos rápido.
          </p>
        </div>

        <ul className="reveal opacity-0 translate-y-8 transition-all duration-700 list-none m-0 p-0">
          {items.map((it, i) => {
            const isOpen = open === it.num;
            const isLast = i === items.length - 1;
            return (
              <li key={it.num} style={{ borderTop: `1px solid ${ALMA.border}`, borderBottom: isLast ? `1px solid ${ALMA.border}` : undefined }}>
                <button
                  onClick={() => setOpen(isOpen ? null : it.num)}
                  className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-5 px-2 py-6 bg-transparent border-0 cursor-pointer text-left"
                  aria-expanded={isOpen}
                >
                  <span className="font-bebas tabular-nums text-[1rem]" style={{ color: ALMA.coral, opacity: 0.85 }}>{it.num}</span>
                  <h3 className="font-bebas tracking-tight leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.3rem, 2.4vw, 2rem)" }}>
                    {it.title}
                  </h3>
                  <span className="grid h-9 w-9 place-items-center rounded-full transition-transform" style={{ backgroundColor: isOpen ? ALMA.berry : "transparent", color: isOpen ? ALMA.cream : ALMA.berry, border: `1px solid ${ALMA.berry}` }}>
                    {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                  </span>
                </button>
                <div className="grid overflow-hidden transition-[grid-template-rows] duration-500 ease-out" style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}>
                  <div className="min-h-0 overflow-hidden">
                    <p className="pb-7 pl-9 sm:pl-10 pr-2 text-[0.96rem] leading-[1.75] text-[color:var(--ink)]/72 max-w-[64ch]">
                      {it.text}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   FILOSOFÍA — pull quote de marca (estudio nuevo, sin reseñas reales)
   ═══════════════════════════════════════════════════════════ */
const TestimoniosSection = () => {
  return (
    <section className="relative px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.blush }}>
      <div className="mx-auto max-w-[900px] text-center reveal opacity-0 translate-y-8 transition-all duration-700">
        <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.berry }}>
          Nuestra filosofía
        </span>
        <blockquote className="mt-6 font-bebas leading-[0.96]" style={{ color: ALMA.ink, fontSize: "clamp(2.2rem, 4.4vw, 3.8rem)" }}>
          <span className="font-alilato font-normal italic" style={{ color: ALMA.berry }}>“</span>
          Aquí el movimiento te regresa a ti. En grupos pequeños, donde te conocen por tu nombre y cada clase se siente como bienestar.
          <span className="font-alilato font-normal italic" style={{ color: ALMA.berry }}>”</span>
        </blockquote>
        <div className="mt-7 text-[0.74rem] uppercase tracking-[0.24em]" style={{ color: ALMA.berry, opacity: 0.85 }}>
          Alma Movement
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   GALERÍA — featured + masonry
   ═══════════════════════════════════════════════════════════ */
const GaleriaSection = ({ galleryIdx, setGalleryIdx }: { galleryIdx: number; setGalleryIdx: (n: number) => void }) => {
  useEffect(() => {
    const t = setInterval(() => setGalleryIdx((galleryIdx + 1) % GALLERY_IMAGES.length), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryIdx]);

  const next = () => setGalleryIdx((galleryIdx + 1) % GALLERY_IMAGES.length);
  const prev = () => setGalleryIdx((galleryIdx - 1 + GALLERY_IMAGES.length) % GALLERY_IMAGES.length);

  return (
    <section id="galeria" className="relative px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.cream }}>
      <div className="mx-auto max-w-[1320px]">
        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-10">
          <div>
            <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.coral }}>
              Por dentro
            </span>
            <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.ink, fontSize: "clamp(2.4rem, 5.2vw, 4.6rem)" }}>
              El estudio,
              <span className="block italic font-alilato font-normal" style={{ color: ALMA.coral }}>en sus mejores momentos.</span>
            </h2>
          </div>
          <p className="max-w-[40ch] text-[0.95rem] leading-[1.7] text-[color:var(--ink)]/70">
            El estudio por dentro: el equipo, el espacio y la comunidad de Alma.
          </p>
        </div>

        <div className="reveal opacity-0 translate-y-8 transition-all duration-700 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="alma-photo-tint lg:col-span-8 relative aspect-[4/3] overflow-hidden rounded-[24px] group" style={{ backgroundColor: ALMA.ink }}>
            {GALLERY_IMAGES.map((img, i) => (
              <img
                key={i}
                src={img}
                alt={"Alma momento " + (i + 1)}
                loading="lazy"
                className={"alma-photo absolute inset-0 h-full w-full object-cover transition-opacity duration-700 " + (i === galleryIdx ? "opacity-100" : "opacity-0")}
              />
            ))}
            <button onClick={prev} aria-label="Anterior" className="absolute left-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full transition-opacity opacity-0 group-hover:opacity-100" style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}>
              <ChevronLeft size={18} />
            </button>
            <button onClick={next} aria-label="Siguiente" className="absolute right-4 top-1/2 -translate-y-1/2 grid h-11 w-11 place-items-center rounded-full transition-opacity opacity-0 group-hover:opacity-100" style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}>
              <ChevronRight size={18} />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {GALLERY_IMAGES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setGalleryIdx(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: i === galleryIdx ? 24 : 6, backgroundColor: i === galleryIdx ? ALMA.cream : ALMA.cream + "66" }}
                  aria-label={"Ir a foto " + (i + 1)}
                />
              ))}
            </div>
          </div>
          <div className="lg:col-span-4 grid grid-cols-3 lg:grid-cols-2 gap-3">
            {GALLERY_IMAGES.slice(0, 6).map((img, i) => (
              <button
                key={i}
                onClick={() => setGalleryIdx(i)}
                className={"relative aspect-square overflow-hidden rounded-[14px] bg-transparent border-0 p-0 cursor-pointer transition-opacity " + (i === galleryIdx ? "opacity-100" : "opacity-65 hover:opacity-100")}
                aria-label={"Ver foto " + (i + 1)}
              >
                <img src={img} alt="" className="alma-photo absolute inset-0 h-full w-full object-cover" loading="lazy" />
                {i === galleryIdx && <span className="absolute inset-0" style={{ outline: `2px solid ${ALMA.berry}`, outlineOffset: -2, borderRadius: 14 }} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   CONTACTO + MAPA
   ═══════════════════════════════════════════════════════════ */
const ContactoSection = () => {
  const items = [
    { icon: <MapPin size={18} />, label: "Ubicación", value: "Plaza Arce, Calle Acueducto de Querétaro 513, Jurica Acueducto, 76230 Juriquilla, Qro." },
    { icon: <Phone size={18} />, label: "Teléfono", value: "por confirmar", href: "tel:5210000000000" }, // TODO: WhatsApp real de Alma
    { icon: <Mail size={18} />, label: "Email", value: "info@almamovement.mx", href: "mailto:info@almamovement.mx" },
    { icon: <Clock size={18} />, label: "Horarios", value: "Lun a Sáb · 6:00–11:00 AM y 5:00–8:00 PM" },
  ];
  return (
    <section id="contacto" className="px-5 sm:px-8 lg:px-12 py-28 lg:py-40" style={{ backgroundColor: ALMA.cream }}>
      <div className="mx-auto max-w-[1320px] grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-5 reveal opacity-0 translate-y-8 transition-all duration-700 flex flex-col">
          <span className="text-[0.66rem] font-medium uppercase tracking-[0.34em]" style={{ color: ALMA.berry }}>
            Cómo llegar
          </span>
          <h2 className="font-bebas mt-4 leading-[0.92]" style={{ color: ALMA.ink, fontSize: "clamp(2.2rem, 4.6vw, 4rem)" }}>
            Plaza Arce,
            <span className="block italic font-alilato font-normal" style={{ color: ALMA.berry }}>Juriquilla, Querétaro.</span>
          </h2>
          <ul className="mt-8 list-none m-0 p-0 grid gap-5">
            {items.map((it) => (
              <li key={it.label} className="grid grid-cols-[auto_1fr] items-start gap-4 py-3" style={{ borderTop: `1px solid ${ALMA.border}` }}>
                <span className="grid h-10 w-10 place-items-center rounded-full" style={{ backgroundColor: ALMA.blush, color: ALMA.berry }}>
                  {it.icon}
                </span>
                <div>
                  <div className="text-[0.6rem] uppercase tracking-[0.24em] text-[color:var(--ink)]/55">{it.label}</div>
                  {it.href ? (
                    <a href={it.href} className="mt-1 block text-[0.98rem] leading-[1.55] no-underline transition-colors hover:text-[color:var(--berry)]" style={{ color: ALMA.ink }}>
                      {it.value}
                    </a>
                  ) : (
                    <div className="mt-1 text-[0.98rem] leading-[1.55]" style={{ color: ALMA.ink }}>{it.value}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex items-center gap-3">
            <a href="https://www.instagram.com/movementalma/" target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 place-items-center rounded-full no-underline transition-colors hover:bg-[color:var(--blush)]" style={{ border: `1px solid ${ALMA.border}`, color: ALMA.berry }}>
              <IconInstagram size={16} />
            </a>
            <a href="https://www.facebook.com/search/top?q=Alma%20Movement%20Quer%C3%A9taro" target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 place-items-center rounded-full no-underline transition-colors hover:bg-[color:var(--blush)]" style={{ border: `1px solid ${ALMA.border}`, color: ALMA.berry }}>
              <IconFacebook size={16} />
            </a>
            <a href="https://wa.me/5210000000000" /* TODO: WhatsApp real de Alma */ target="_blank" rel="noopener noreferrer" className="grid h-11 w-11 place-items-center rounded-full no-underline transition-colors hover:bg-[color:var(--blush)]" style={{ border: `1px solid ${ALMA.border}`, color: ALMA.berry }}>
              <MessageCircle size={16} />
            </a>
          </div>
        </div>

        <div className="lg:col-span-7 reveal opacity-0 translate-y-8 transition-all duration-700 overflow-hidden rounded-[24px] min-h-[420px] lg:min-h-[520px]" style={{ border: `1px solid ${ALMA.border}` }}>
          <iframe
            src="https://www.google.com/maps?q=Plaza%20Arce%2C%20Calle%20Acueducto%20de%20Quer%C3%A9taro%20513%2C%20Jurica%20Acueducto%2C%2076230%20Juriquilla%2C%20Qro.&output=embed"
            width="100%"
            height="100%"
            style={{ border: 0, display: "block", minHeight: 420, filter: "saturate(0.9)" }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Alma Movement ubicación"
          />
        </div>
      </div>
    </section>
  );
};

/* ═══════════════════════════════════════════════════════════
   FOOTER (Berry drench)
   ═══════════════════════════════════════════════════════════ */
const FooterSection = ({ scrollTo, navigate }: { scrollTo: (id: string) => void; navigate: (path: string) => void }) => {
  return (
    <footer className="relative overflow-hidden px-5 sm:px-8 lg:px-12 pt-20 pb-8" style={{ backgroundColor: ALMA.inkDeep, color: ALMA.cream }}>
      <div className="absolute inset-0 pointer-events-none opacity-[0.10]" style={{ background: `radial-gradient(circle at 88% 8%, ${ALMA.berry} 0%, transparent 55%)` }} />
      <div className="relative mx-auto max-w-[1320px]">
        {/* Giant serif wordmark (estilo Frame) */}
        <div className="pb-12">
          <p className="text-[0.62rem] uppercase tracking-[0.34em] mb-5" style={{ opacity: 0.6 }}>Estudio de Pilates · Juriquilla, Querétaro</p>
          <h2 className="font-display leading-[0.88]" style={{ fontSize: "clamp(2.8rem, 11vw, 9rem)", fontWeight: 360, letterSpacing: "-0.02em" }}>Alma Movement</h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 pb-10" style={{ borderTop: `1px solid ${ALMA.cream}22` }}>
          <div className="col-span-2 sm:col-span-1 pt-8">
            <p className="text-[0.92rem] leading-[1.65] max-w-[28ch] opacity-85">
              Pilates Reformer, Tower, Mat, Barre y Sculpt. Movimiento consciente, técnica y comunidad.
            </p>
          </div>
          <div className="pt-8">
            <div className="text-[0.62rem] uppercase tracking-[0.24em] opacity-65 mb-4">Estudio</div>
            <ul className="flex flex-col gap-2 list-none m-0 p-0">
              {[["Clases","clases"],["Horario","horario"],["Paquetes","paquetes"],["Coaches","coaches"],["Galería","galeria"],["Políticas","politicas"]].map(([label, id]) => (
                <li key={id}>
                  <button onClick={() => scrollTo(id)} className="bg-transparent border-0 p-0 cursor-pointer text-[0.88rem] opacity-80 hover:opacity-100 transition-opacity">{label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-8">
            <div className="text-[0.62rem] uppercase tracking-[0.24em] opacity-65 mb-4">Legal</div>
            <ul className="flex flex-col gap-2 list-none m-0 p-0">
              {[
                { label: "Aviso de privacidad", path: "/legal/privacidad" },
                { label: "Términos y condiciones", path: "/legal/terminos" },
                { label: "Política de cancelación", path: "/legal/cancelacion" },
              ].map((l) => (
                <li key={l.path}>
                  <button onClick={() => navigate(l.path)} className="bg-transparent border-0 p-0 cursor-pointer text-[0.88rem] opacity-80 hover:opacity-100 transition-opacity">{l.label}</button>
                </li>
              ))}
            </ul>
          </div>
          <div className="pt-8">
            <div className="text-[0.62rem] uppercase tracking-[0.24em] opacity-65 mb-4">Contacto</div>
            <ul className="flex flex-col gap-2 list-none m-0 p-0 text-[0.88rem]">
              <li className="opacity-80">Juriquilla, Querétaro</li>
              <li><a href="mailto:info@almamovement.mx" className="opacity-80 hover:opacity-100 transition-opacity no-underline" style={{ color: ALMA.cream }}>info@almamovement.mx</a></li>
              <li><a href="https://wa.me/5210000000000" /* TODO: WhatsApp real de Alma */ target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition-opacity no-underline" style={{ color: ALMA.cream }}>WhatsApp</a></li>
              <li><a href="https://www.instagram.com/movementalma/" target="_blank" rel="noopener noreferrer" className="opacity-80 hover:opacity-100 transition-opacity no-underline" style={{ color: ALMA.cream }}>Instagram</a></li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-6 text-[0.74rem]" style={{ borderTop: `1px solid ${ALMA.cream}22` }}>
          <p className="opacity-60">© 2026 Alma Movement · Juriquilla, Querétaro.</p>
          <p className="opacity-60">Hecho con cariño en Querétaro.</p>
        </div>
      </div>
    </footer>
  );
};

export default Index;
