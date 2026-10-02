import { Link } from "react-router-dom";
import { STUDIO, instagramUrl, whatsappUrl } from "@/lib/studio";
import { SectionTitle } from "./SectionTitle";

const parts = STUDIO.address.split(", ");
const street = parts.slice(0, 2).join(", ");
const rest = parts.slice(2);
const LINK = "inline-flex min-h-[44px] items-center border-b border-line-strong text-sm font-bold text-ink no-underline";

export function Contact() {
  const wa = whatsappUrl("Hola, quiero conocer HIVE.");
  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="hive-contact scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="contacto-titulo" eyebrow="Nos vemos en el estudio" title="Un lugar para ti." accent="En el corazón de Coyoacán." />
        <div className="mt-10 grid gap-10 lg:grid-cols-2 lg:gap-20">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-accent">Encuéntranos</p>
            <p className="text-xl font-bold text-ink">{street}</p>
            <p className="mt-2 text-sm text-ink-muted">{rest.join(", ")}</p>
            <a href={STUDIO.mapsUrl} target="_blank" rel="noopener noreferrer" className={`${LINK} mt-5`}>Cómo llegar <span aria-hidden="true" className="ml-6">↗</span></a>
            <div className="mt-8 flex flex-wrap gap-x-8 gap-y-2">
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={LINK}>@{STUDIO.instagram}</a>
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={LINK}>WhatsApp</a>}
            </div>
          </div>
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-accent">Horarios del estudio · CDMX</p>
            <ul className="divide-y divide-line border-y border-line">
              {STUDIO.hours.split(" · ").map(hours => <li key={hours} className="py-4 text-sm font-semibold text-ink">{hours}</li>)}
            </ul>
            <p className="mt-4 text-sm leading-relaxed text-ink-muted">Horario especial: {STUDIO.specialHours}.</p>
          </div>
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-5 border-t border-line pt-6">
          <p className="text-sm text-ink-muted"><strong className="text-ink">Cancela con 12 h.</strong> Después, la clase cuenta como tomada.</p>
          <Link to="/legal/cancelacion" className={LINK}>Ver política →</Link>
        </div>
      </div>
    </section>
  );
}
