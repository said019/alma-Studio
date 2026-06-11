import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ALMA } from "@/components/app/tokens";

// 404 editorial: tipografía sola (numeral gigante + serif cálido),
// sin foto para mantener la página ligera y limpia.
const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: ALMA.cream, color: ALMA.ink }}>
      {/* Nav mínima: wordmark serif → inicio. Cream sólido, sin blur. */}
      <nav className="px-6 lg:px-[60px] py-4" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
        <Link
          to="/"
          className="font-display text-[1.15rem] tracking-tight no-underline transition-opacity hover:opacity-75"
          style={{ color: ALMA.ink, fontWeight: 420 }}
        >
          Alma Movement
        </Link>
      </nav>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-xl text-center">
          <p className="text-[0.68rem] uppercase tracking-[0.32em] font-medium mb-2" style={{ color: ALMA.berry }}>
            Estudio de Pilates · Juriquilla
          </p>
          <p
            aria-hidden="true"
            className="font-display nums leading-none select-none m-0"
            style={{ fontSize: "clamp(7rem, 26vw, 13rem)", fontWeight: 360, letterSpacing: "-0.03em", color: ALMA.ink }}
          >
            404
          </p>
          <h1 className="font-display leading-snug mt-5 mb-3" style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.1rem)", fontWeight: 420 }}>
            Esta página se nos <span className="font-display-italic">escapó</span> del horario.
          </h1>
          <p className="text-[0.95rem] leading-[1.7] mb-9" style={{ color: ALMA.berry }}>
            La dirección que buscas no existe o cambió de lugar. Respira hondo y vuelve al estudio.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <Link
              to="/"
              className="inline-flex items-center rounded-full px-7 py-3 text-[0.78rem] font-medium uppercase tracking-[0.16em] no-underline transition-transform hover:-translate-y-px"
              style={{ backgroundColor: ALMA.ink, color: ALMA.cream }}
            >
              Volver al inicio
            </Link>
            <Link
              to="/auth/register"
              className="text-[0.84rem] font-medium underline underline-offset-4 transition-opacity hover:opacity-75"
              style={{ color: ALMA.berry }}
            >
              Reservar una clase
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
};

export default NotFound;
