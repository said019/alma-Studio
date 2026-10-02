import { Link } from "react-router-dom";
import { AtSign, Clock, MapPin, MessageCircle, RotateCcw } from "lucide-react";
import { STUDIO, instagramUrl, whatsappUrl } from "@/lib/studio";
import { SectionTitle } from "./SectionTitle";

const parts = STUDIO.address.split(", ");
const street = parts.slice(0, 2).join(", "); // "Cuauhtémoc #68, Del Carmen"
const rest = parts.slice(2);                   // ["Coyoacán", "C.P. 04100", "CDMX"]
const ICON = "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent";
const CARD = "flex items-start gap-3 rounded-[18px] border border-line bg-surface/70 p-4";
const LINK = "inline-flex min-h-[44px] items-center text-[0.85rem] font-bold text-accent no-underline";

export function Contact() {
  const wa = whatsappUrl("Hola, quiero conocer HIVE.");
  return (
    <section id="contacto" aria-labelledby="contacto-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="contacto-titulo" eyebrow="Contacto" title="Te esperamos" accent="en Coyoacán." />
        <ul className="grid gap-3 sm:grid-cols-2">
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><MapPin size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">{street}</p>
              <p className="text-[0.85rem] text-ink-muted">{rest.join(", ")}</p>
              <a href={STUDIO.mapsUrl} target="_blank" rel="noopener noreferrer" className={LINK}>Cómo llegar →</a>
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><Clock size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">{STUDIO.hours}</p>
              <p className="text-[0.85rem] text-ink-muted">Horario especial: {STUDIO.specialHours}.</p>
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><AtSign size={18} /></span>
            <div>
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" className={LINK}>@{STUDIO.instagram}</a>
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className={`${LINK} ml-4 gap-1`}>
                  <MessageCircle size={15} aria-hidden="true" /> WhatsApp
                </a>
              )}
            </div>
          </li>
          <li className={CARD}>
            <span className={ICON} aria-hidden="true"><RotateCcw size={18} /></span>
            <div>
              <p className="text-[0.9rem] font-bold text-ink">Cancela con 12 h</p>
              <p className="text-[0.85rem] text-ink-muted">Después, la clase cuenta como tomada.</p>
              <Link to="/legal/cancelacion" className={LINK}>Ver política →</Link>
            </div>
          </li>
        </ul>
      </div>
    </section>
  );
}
