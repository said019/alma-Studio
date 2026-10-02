import { Link } from "react-router-dom";

// The public offer follows HIVE's approved flyer, independently of legacy API disciplines.
export function ClassesCoaches() {
  return (
    <section id="clases" aria-labelledby="clases-titulo" className="hive-practice scroll-mt-20 border-t border-line">
      <div className="hive-practice-grid mx-auto max-w-[1120px] px-5 py-16 sm:px-8 lg:py-24">
        <figure className="hive-practice-photo">
          <img src="/hive/reformer-detail.webp" width={1536} height={1024} alt="Detalle ilustrativo de los resortes y el carro de un Reformer" loading="lazy" decoding="async" className="h-auto w-full" />
          <figcaption className="mt-3 text-xs text-ink-muted">Imagen ilustrativa de un Reformer.</figcaption>
        </figure>
        <div className="hive-practice-copy">
          <h2 id="clases-titulo" className="font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">Pilates Reformer.<br /><span className="text-accent">En HIVE.</span></h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-ink-muted">Una sesión, paquetes de 4, 10 o 20 clases y membresías. También sesiones personalizadas de lunes a viernes, de 11 am a 4 pm.</p>
          <Link to="/app/checkout" className="hive-practice-link mt-6 inline-flex min-h-11 items-center border-b border-line-strong text-sm font-bold text-ink">Ver opciones de plan <span aria-hidden="true" className="ml-5">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
