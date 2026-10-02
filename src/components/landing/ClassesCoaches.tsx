import { Link } from "react-router-dom";

// The public offer comes from HIVE's approved flyer. Legacy API disciplines
// and coach specialties must not silently become advertised services.
export function ClassesCoaches() {
  return (
    <section id="clases" aria-labelledby="clases-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">La práctica / HIVE</p>
            <h2 id="clases-titulo" className="mt-5 font-display text-3xl font-bold leading-[0.95] tracking-tight text-ink sm:text-4xl">Pilates<br />Reformer.</h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-ink-muted">Un espacio para tu práctica. Elige tus sesiones y resérvalas desde nuestra app.</p>
            <Link to="/app/checkout" className="mt-6 inline-flex min-h-11 items-center border-b border-line-strong text-sm font-bold text-ink transition-transform hover:translate-x-1 active:scale-[0.98] motion-reduce:transform-none">Encuentra tu plan <span aria-hidden="true" className="ml-5">↗</span></Link>
          </div>
          <div className="self-end">
            <svg viewBox="0 0 440 170" fill="none" aria-hidden="true" className="mb-8 w-full max-w-lg text-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M38 104h340v22H38zM49 126v24h24v-24m272 0v24h24v-24M82 98h182l18-13H103zM67 85V65h33m-19 0 17 20M328 102V29m-13 0h28M112 85l216-48M294 101h60M179 104v22m24-22v22" />
            </svg>
            <dl className="divide-y divide-line border-y border-line">
              <div className="grid gap-2 py-5 sm:grid-cols-[1fr_1.2fr] sm:gap-5">
                <dt className="text-sm font-bold text-ink">Sesiones de Reformer</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">Paquetes de 1, 4, 10 o 20 sesiones. También planes mensual y anual con pago mensual.</dd>
              </div>
              <div className="grid gap-2 py-5 sm:grid-cols-[1fr_1.2fr] sm:gap-5">
                <dt className="text-sm font-bold text-ink">Sesión personalizada</dt>
                <dd className="text-sm leading-relaxed text-ink-muted">Disponible de lunes a viernes, de 11 am a 4 pm.</dd>
              </div>
            </dl>
          </div>
        </div>

      </div>
    </section>
  );
}
