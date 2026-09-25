import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "@/design/theme";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { PrimaryButton } from "@/components/app/AppShell";


// 404 editorial: tipografía sola (numeral gigante + serif cálido),
// sin foto para mantener la página ligera y limpia.
const NotFound = () => {
  const location = useLocation();
  useTheme("dark", location.pathname);

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Nav mínima: símbolo HIVE → inicio. */}
      <nav className="px-6 lg:px-[60px] py-4 border-b border-line">
        <Link
          to="/"
          aria-label="Inicio HIVE Pilates Studio"
          className="inline-flex items-center no-underline transition-opacity hover:opacity-75 text-accent"
        >
          <BrandLogo size={32} />
        </Link>
      </nav>

      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="max-w-xl flex flex-col items-center text-center">
          <p className="text-[0.75rem] uppercase tracking-[0.32em] font-medium mb-2 text-accent-strong">
            HIVE Pilates Studio
          </p>
          <HexPedestal size="lg" />
          <p
            aria-hidden="true"
            className="font-display nums leading-none select-none m-0 mt-2 text-ink"
            style={{ fontSize: "clamp(7rem, 26vw, 13rem)", fontWeight: 360, letterSpacing: "-0.03em" }}
          >
            404
          </p>
          <h1 className="font-display leading-snug mt-5 mb-3" style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.1rem)", fontWeight: 420 }}>
            Esta página se nos <span className="font-display">escapó</span> del horario.
          </h1>
          <p className="text-[0.95rem] leading-[1.7] mb-9 text-ink-muted">
            La dirección que buscas no existe o cambió de lugar. Respira hondo y vuelve al estudio.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
            <PrimaryButton to="/">Volver al inicio</PrimaryButton>
            <Link
              to="/auth/register"
              className="text-[0.84rem] font-medium underline underline-offset-4 transition-opacity hover:opacity-75 text-accent-strong"
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
