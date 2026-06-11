// Layout compartido de las páginas legales (Términos, Privacidad, Cancelación).
// Nav simple sin blur (cream sólido + hairline), H1 serif en title-case,
// cuerpo de lectura a 70ch y footer corto con enlaces cruzados.
// Colores SIEMPRE desde la paleta canónica ALMA (nada de paletas locales).
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ALMA } from "@/components/app/tokens";
import { STUDIO } from "@/lib/studio";
import api from "@/lib/api";

const LEGAL_PAGES = [
  { path: "/legal/terminos", label: "Términos y condiciones" },
  { path: "/legal/privacidad", label: "Aviso de privacidad" },
  { path: "/legal/cancelacion", label: "Política de cancelación" },
] as const;

export type LegalPath = (typeof LEGAL_PAGES)[number]["path"];

export type PolicyField = "terms_of_service" | "privacy_policy" | "cancellation_policy";

/** Texto editable desde el CMS. `loading` permite mostrar el skeleton
 *  antes de decidir entre el texto dinámico y el fallback estático,
 *  evitando el salto de contenido. */
export const usePolicyText = (field: PolicyField) => {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .get("/public/settings/policies_settings")
      .then(({ data }) => {
        if (!active) return;
        const value = data?.data;
        const raw = value?.[field];
        setText(typeof raw === "string" ? raw.trim() : "");
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [field]);

  return { text, loading };
};

/** Skeleton de párrafos mientras resolvemos el contenido del CMS. */
export const LegalSkeleton = () => (
  <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none space-y-9">
    {[0, 1, 2].map((block) => (
      <div key={block} className="space-y-3">
        <div className="h-4 w-44 rounded-sm" style={{ backgroundColor: ALMA.blush }} />
        <div className="h-3 w-full rounded-sm" style={{ backgroundColor: ALMA.mist }} />
        <div className="h-3 w-[92%] rounded-sm" style={{ backgroundColor: ALMA.mist }} />
        <div className="h-3 w-[78%] rounded-sm" style={{ backgroundColor: ALMA.mist }} />
      </div>
    ))}
  </div>
);

/** Subtítulo de sección: serif text-lg (Fraunces vía h2 base). */
export const LegalH2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display text-lg mt-10 mb-3" style={{ color: ALMA.ink }}>
    {children}
  </h2>
);

/** Línea de "Última actualización" destacada en ink. */
export const LegalUpdated = ({ children }: { children: ReactNode }) => (
  <p className="font-semibold" style={{ color: ALMA.ink }}>
    Última actualización: {children}
  </p>
);

/** Cuerpo dinámico del CMS, respetando saltos de línea del texto. */
export const LegalDynamicBody = ({ text }: { text: string }) => (
  <div className="space-y-6">
    <LegalUpdated>{new Date().toLocaleDateString("es-MX")}</LegalUpdated>
    <div className="whitespace-pre-wrap leading-[1.85]">{text}</div>
  </div>
);

/** Datos de contacto del estudio. STUDIO es la única fuente: si no hay
 *  teléfono confirmado, la fila no se muestra. */
export const LegalContact = () => (
  <ul className="list-none space-y-1 p-0 m-0">
    <li>
      <strong className="font-semibold" style={{ color: ALMA.ink }}>Email:</strong>{" "}
      <a
        href="mailto:info@almamovement.mx"
        className="underline underline-offset-2"
        style={{ color: ALMA.berry }}
      >
        info@almamovement.mx
      </a>
    </li>
    <li>
      <strong className="font-semibold" style={{ color: ALMA.ink }}>WhatsApp:</strong>{" "}
      <a
        href={`https://wa.me/${STUDIO.whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2"
        style={{ color: ALMA.berry }}
      >
        escríbenos por WhatsApp
      </a>
    </li>
    {STUDIO.phone && (
      <li>
        <strong className="font-semibold" style={{ color: ALMA.ink }}>Teléfono:</strong> {STUDIO.phone}
      </li>
    )}
    <li>
      <strong className="font-semibold" style={{ color: ALMA.ink }}>Dirección:</strong> {STUDIO.address}
    </li>
  </ul>
);

type LegalLayoutProps = {
  current: LegalPath;
  /** H1 en title-case; admite acentos con .font-display-italic. */
  title: ReactNode;
  children: ReactNode;
};

const LegalLayout = ({ current, title, children }: LegalLayoutProps) => {
  const crossLinks = LEGAL_PAGES.filter((page) => page.path !== current);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: ALMA.cream, color: ALMA.ink }}>
      {/* Nav simple: wordmark serif → inicio. Cream sólido, sin blur. */}
      <nav
        className="sticky top-0 z-50 px-6 lg:px-[60px] py-4"
        style={{ backgroundColor: ALMA.cream, borderBottom: `1px solid ${ALMA.border}` }}
      >
        <Link
          to="/"
          className="font-display text-[1.15rem] tracking-tight no-underline transition-opacity hover:opacity-75"
          style={{ color: ALMA.ink, fontWeight: 420 }}
        >
          Alma Movement
        </Link>
      </nav>

      <main className="w-full max-w-3xl mx-auto flex-1 px-6 pt-14 pb-20">
        <p
          className="flex items-center gap-[10px] text-[0.7rem] uppercase tracking-[0.28em] font-medium mb-4"
          style={{ color: ALMA.berry }}
        >
          <span className="inline-block h-px w-[30px]" style={{ backgroundColor: ALMA.sandstone }} />
          Legal
        </p>
        <h1
          className="font-display leading-[1.06] mb-10"
          style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)", fontWeight: 420, color: ALMA.ink }}
        >
          {title}
        </h1>

        <div className="max-w-[70ch] text-[0.95rem] leading-[1.8]" style={{ color: ALMA.berry }}>
          {children}
        </div>
      </main>

      {/* Footer corto: cruces a las otras legales + volver al inicio. */}
      <footer className="px-6 lg:px-[60px] py-8" style={{ borderTop: `1px solid ${ALMA.border}` }}>
        <div className="max-w-3xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between text-[0.82rem]">
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {crossLinks.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="no-underline transition-colors hover:underline"
                style={{ color: ALMA.berry }}
              >
                {page.label}
              </Link>
            ))}
            <Link
              to="/"
              className="no-underline font-medium transition-colors hover:underline"
              style={{ color: ALMA.ink }}
            >
              Volver al inicio
            </Link>
          </nav>
          <p className="m-0" style={{ color: ALMA.berry, opacity: 0.75 }}>
            © 2026 Alma Movement
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LegalLayout;
