// Layout compartido de las páginas legales (Términos, Privacidad, Cancelación).
// Nav simple sin blur (cream sólido + hairline), H1 serif en title-case,
// cuerpo de lectura a 70ch y footer corto con enlaces cruzados.
// Colores SIEMPRE desde los tokens de src/design/tokens.ts (nada de paletas locales).
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { STUDIO, whatsappUrl } from "@/lib/studio";
import { COLOR } from "@/design/tokens";

const LEGAL_PAGES = [
  { path: "/legal/informacion", label: "Preguntas frecuentes y reglamento" },
  { path: "/legal/terminos", label: "Términos y condiciones" },
  { path: "/legal/privacidad", label: "Aviso de privacidad" },
  { path: "/legal/cancelacion", label: "Política de cancelación" },
] as const;

export type LegalPath = (typeof LEGAL_PAGES)[number]["path"];

export type PolicyField = "terms_of_service" | "privacy_policy" | "cancellation_policy";

/** Skeleton de párrafos mientras resolvemos el contenido del CMS. */
export const LegalSkeleton = () => (
  <div aria-hidden="true" className="animate-pulse motion-reduce:animate-none space-y-9">
    {[0, 1, 2].map((block) => (
      <div key={block} className="space-y-3">
        <div className="h-4 w-44 rounded-sm" style={{ backgroundColor: COLOR.sunken }} />
        <div className="h-3 w-full rounded-sm" style={{ backgroundColor: COLOR.sunken }} />
        <div className="h-3 w-[92%] rounded-sm" style={{ backgroundColor: COLOR.sunken }} />
        <div className="h-3 w-[78%] rounded-sm" style={{ backgroundColor: COLOR.sunken }} />
      </div>
    ))}
  </div>
);

/** Subtítulo de sección: text-lg en Unbounded (font-display). */
export const LegalH2 = ({ children }: { children: ReactNode }) => (
  <h2 className="font-display text-lg mt-10 mb-3" style={{ color: COLOR.ink }}>
    {children}
  </h2>
);

/** Línea de "Última actualización" destacada en ink. */
export const LegalUpdated = ({ children }: { children: ReactNode }) => (
  <p className="font-semibold" style={{ color: COLOR.ink }}>
    Última actualización: {children}
  </p>
);

/** Datos de contacto del estudio. STUDIO es la única fuente: una fila sin dato
 *  confirmado no se muestra. Mientras no haya correo de privacidad, las
 *  solicitudes se presentan en recepción (auditoría 2026-09-27, P1-10). */
export const LegalContact = () => (
  <ul className="list-none space-y-1 p-0 m-0">
    {STUDIO.privacyEmail && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>Email:</strong>{" "}
        <a href={`mailto:${STUDIO.privacyEmail}`} className="underline underline-offset-2" style={{ color: COLOR.accentStrong }}>
          {STUDIO.privacyEmail}
        </a>
      </li>
    )}
    {whatsappUrl() && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>WhatsApp:</strong>{" "}
        <a
          href={whatsappUrl()!}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: COLOR.accentStrong }}
        >
          escríbenos por WhatsApp
        </a>
      </li>
    )}
    {STUDIO.phone && (
      <li>
        <strong className="font-semibold" style={{ color: COLOR.ink }}>Teléfono:</strong> {STUDIO.phone}
      </li>
    )}
    <li>
      <strong className="font-semibold" style={{ color: COLOR.ink }}>Dirección:</strong> {STUDIO.address}
    </li>
    <li>
      <strong className="font-semibold" style={{ color: COLOR.ink }}>Horario:</strong> {STUDIO.hours}
    </li>
  </ul>
);

type LegalLayoutProps = {
  current: LegalPath;
  /** H1 en title-case; admite acentos con .font-display. */
  title: ReactNode;
  children: ReactNode;
};

const LegalLayout = ({ current, title, children }: LegalLayoutProps) => {
  const crossLinks = LEGAL_PAGES.filter((page) => page.path !== current);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: COLOR.canvas, color: COLOR.ink }}>
      {/* Nav simple: wordmark serif → inicio. Cream sólido, sin blur. */}
      <nav
        className="sticky top-0 z-50 px-6 lg:px-[60px] py-4"
        style={{ backgroundColor: COLOR.canvas, borderBottom: `1px solid ${COLOR.line}` }}
      >
        <Link
          to="/"
          className="font-display text-[1.15rem] tracking-tight no-underline transition-opacity hover:opacity-75"
          style={{ color: COLOR.ink, fontWeight: 420 }}
        >
          {STUDIO.name}
        </Link>
      </nav>

      <main className="w-full max-w-3xl mx-auto flex-1 px-6 pt-14 pb-20">
        <p
          className="flex items-center gap-[10px] text-[0.75rem] uppercase tracking-[0.28em] font-medium mb-4"
          style={{ color: COLOR.accentStrong }}
        >
          <span className="inline-block h-px w-[30px]" style={{ backgroundColor: COLOR.line }} />
          Legal
        </p>
        <h1
          className="font-display leading-[1.06] mb-10"
          style={{ fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)", fontWeight: 420, color: COLOR.ink }}
        >
          {title}
        </h1>

        <div className="max-w-[70ch] text-[0.95rem] leading-[1.8]" style={{ color: COLOR.accentStrong }}>
          {children}
        </div>
      </main>

      {/* Footer corto: cruces a las otras legales + volver al inicio. */}
      <footer className="px-6 lg:px-[60px] py-8" style={{ borderTop: `1px solid ${COLOR.line}` }}>
        <div className="max-w-3xl mx-auto flex flex-col gap-4 sm:flex-row sm:items-baseline sm:justify-between text-[0.82rem]">
          <nav className="flex flex-wrap gap-x-6 gap-y-2">
            {crossLinks.map((page) => (
              <Link
                key={page.path}
                to={page.path}
                className="no-underline transition-colors hover:underline"
                style={{ color: COLOR.accentStrong }}
              >
                {page.label}
              </Link>
            ))}
            <Link
              to="/"
              className="no-underline font-medium transition-colors hover:underline"
              style={{ color: COLOR.ink }}
            >
              Volver al inicio
            </Link>
          </nav>
          <p className="m-0" style={{ color: COLOR.accentStrong, opacity: 0.75 }}>
            © 2026 {STUDIO.name}
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LegalLayout;
