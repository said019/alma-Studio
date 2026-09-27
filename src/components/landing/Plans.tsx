import { PrimaryButton } from "@/components/app/AppShell";
import { formatMoneyMX } from "@/components/app/widgets";
import { SectionTitle } from "./SectionTitle";
import type { LandingPlan } from "./landingData";

const money = (n: number) => `$${formatMoneyMX(n)}`;

function Price({ p, big }: { p: LandingPlan; big?: boolean }) {
  return (
    <div className="text-right">
      {p.opening && <s className="block text-[0.75rem] text-ink-muted">{money(p.price)}</s>}
      <span className={"font-display font-extrabold text-ink " + (big ? "text-[1.4rem]" : "text-[1.1rem]")}>{money(p.finalPrice)}</span>
    </div>
  );
}

export function Plans({ trial, plans }: { trial: LandingPlan | null; plans: LandingPlan[] }) {
  const anyOpening = plans.some((p) => p.opening);
  return (
    <section id="paquetes" aria-labelledby="paquetes-titulo" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[720px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="paquetes-titulo" eyebrow="Paquetes" title="Elige cómo" accent="entrar a la colmena." />
        {trial && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-accent-deep bg-surface/70 p-4">
            <div>
              <p className="text-[0.95rem] font-bold text-ink">{trial.name}</p>
              <p className="text-[0.8rem] text-ink-muted">Tu primera vez en HIVE</p>
            </div>
            <Price p={trial} big />
          </div>
        )}
        {anyOpening && <p className="mb-2 text-[0.75rem] font-extrabold uppercase tracking-[0.12em] text-accent">Precio de apertura</p>}
        <ul>
          {plans.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 border-t border-line py-3">
              <div className="min-w-0">
                <p className="truncate text-[0.95rem] font-bold text-ink">{p.name}</p>
                {p.perClass != null && <p className="text-[0.8rem] text-ink-muted">{money(p.perClass)} por clase</p>}
              </div>
              <Price p={p} />
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <PrimaryButton to="/app/checkout" className="w-full">Comprar paquete</PrimaryButton>
        </div>
      </div>
    </section>
  );
}
