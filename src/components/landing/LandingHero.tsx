import { PrimaryButton } from "@/components/app/AppShell";
import { HexPedestal } from "@/components/brand/HexPedestal";
import { useAuthStore } from "@/stores/authStore";
import { heroCta } from "./landingData";

const FACTS: [string, string][] = [["6", "reformers por clase"], ["L–D", "desde las 6 AM"], ["CDMX", "Coyoacán"]];

export function LandingHero() {
  const { isAuthenticated, user } = useAuthStore();
  const cta = heroCta(user, isAuthenticated);
  return (
    <section aria-labelledby="hero-titulo" className="mx-auto grid max-w-[1120px] items-center gap-10 px-5 pb-14 pt-12 sm:px-8 lg:grid-cols-[1.15fr_0.85fr] lg:pb-24 lg:pt-20">
      <div>
        <p className="text-[0.75rem] font-extrabold uppercase tracking-[0.22em] text-accent">Pilates Reformer · Coyoacán</p>
        <h1 id="hero-titulo" className="mt-4 font-display text-[2.2rem] font-extrabold uppercase leading-none tracking-[-0.01em] text-ink sm:text-[3.2rem]">
          Entra.<br />Muévete.
        </h1>
        <p className="mt-2 font-display text-[1.25rem] font-bold text-accent sm:text-[1.6rem]">Sal más fuerte.</p>
        <p className="mt-4 max-w-[34rem] text-[0.95rem] leading-[1.6] text-ink-muted">
          Grupos de 6 en un espacio urbano con carácter. Una colmena que se mueve junta, desde las 6 de la mañana.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <PrimaryButton to={cta.to}>{cta.label}</PrimaryButton>
          <a href="#horario" className="inline-flex min-h-[44px] items-center rounded-full border border-line-strong px-5 text-[0.85rem] font-bold text-ink no-underline">
            Ver horario
          </a>
        </div>
        <div className="mt-8 grid grid-cols-3 border-t border-line">
          {FACTS.map(([value, label]) => (
            <div key={label} className="pr-2 pt-3">
              <p className="font-display text-[1rem] font-bold text-ink">{value}</p>
              <p className="text-[0.75rem] leading-[1.35] text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="hidden justify-center lg:flex" aria-hidden="true">
        <HexPedestal size="lg" />
      </div>
    </section>
  );
}
