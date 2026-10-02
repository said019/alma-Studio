import { Link } from "react-router-dom";

const LEGAL = [["/legal/informacion", "Preguntas frecuentes y reglamento"], ["/legal/privacidad", "Privacidad"], ["/legal/terminos", "Términos"], ["/legal/cancelacion", "Cancelación"]] as const;

export function LandingFooter() {
  return (
    <footer className="hive-footer border-t border-line px-5 py-10">
      <div className="mx-auto max-w-[1120px]">
        <p className="hive-footer-wordmark font-display font-extrabold leading-none text-accent">HIVE</p>
        <div className="hive-footer-meta mt-6 flex flex-wrap items-center justify-between gap-5 border-t border-line pt-5">
          <p className="text-xs font-extrabold tracking-[0.15em] text-accent">BEE HEALTHY. BE HIVE.</p>
          <p className="text-xs text-ink-muted">© {new Date().getFullYear()} HIVE Pilates Studio</p>
        </div>
        <nav aria-label="Legales" className="mt-3 flex flex-wrap gap-x-5">
          {LEGAL.map(([to, label]) => (
            <Link key={to} to={to} className="inline-flex min-h-[44px] items-center text-[0.8rem] text-ink-muted no-underline hover:text-ink">{label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
