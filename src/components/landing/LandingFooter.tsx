import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";

const LEGAL = [["/legal/informacion", "Preguntas frecuentes y reglamento"], ["/legal/privacidad", "Privacidad"], ["/legal/terminos", "Términos"], ["/legal/cancelacion", "Cancelación"]] as const;

export function LandingFooter() {
  return (
    <footer className="border-t border-line px-5 py-10 text-center">
      <div className="flex justify-center text-accent">
        <BrandLogo variant="mark" size={34} title="HIVE" />
      </div>
      <p className="mt-4 text-[0.75rem] font-extrabold tracking-[0.3em] text-accent">MOVIMIENTO · BIENESTAR · COMUNIDAD</p>
      <nav aria-label="Legales" className="mt-3 flex flex-wrap justify-center gap-x-5">
        {LEGAL.map(([to, label]) => (
          <Link key={to} to={to} className="inline-flex min-h-[44px] items-center text-[0.8rem] text-ink-muted no-underline hover:text-ink">
            {label}
          </Link>
        ))}
      </nav>
      <p className="text-[0.75rem] text-ink-faint">© {new Date().getFullYear()} HIVE Pilates Studio</p>
    </footer>
  );
}
