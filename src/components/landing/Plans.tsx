import { useState } from "react";
import { PrimaryButton } from "@/components/app/AppShell";
import { formatMoneyMX } from "@/components/app/widgets";
import { SectionTitle } from "./SectionTitle";
import type { LandingPlan } from "./landingData";

const money = (n: number) => `$${formatMoneyMX(n)}`;

function Price({ p, big }: { p: LandingPlan; big?: boolean }) {
  return (
    <div className="text-right">
      {p.opening && (p.finalPrice < p.price ? <s className="block text-[0.75rem] text-ink-muted">{money(p.price)}</s> : <span className="block text-[0.75rem] text-ink-muted">Normal {money(p.price)}</span>)}
      <span className={"font-display font-extrabold text-ink " + (big ? "text-[1.4rem]" : "text-[1.1rem]")}>{money(p.finalPrice)}</span>
      {p.billingPeriod === "month" && <span className="block text-xs text-ink-muted">por mes</span>}
    </div>
  );
}

type Props = { trial: LandingPlan | null; plans: LandingPlan[]; loading: boolean; error: boolean; onRetry: () => void };

const ESQUELETO = "animate-pulse rounded-[18px] border border-line bg-surface/70";

export function Plans({ trial, plans, loading, error, onRetry }: Props) {
  const [chosen, setChosen] = useState<string | null>(null);
  const groups = [
    { id: "sessions", label: "Por sesiones", description: "Una clase o un paquete. Encuentra el ritmo que va contigo." },
    { id: "membership", label: "Membresías", description: "Haz del movimiento parte de tu día. Consulta los beneficios y el compromiso de cada plan." },
    { id: "special", label: "Especiales", description: "Horario especial, tarifa de estudiante y atención personalizada." },
  ].filter(group => plans.some(p => (p.kind ?? "sessions") === group.id));
  const selected = groups.find(group => group.id === chosen) ?? groups[0];
  const visiblePlans = plans.filter(p => (p.kind ?? "sessions") === selected?.id);
  const anyOpening = visiblePlans.some((p) => p.opening);
  return (
    <section id="paquetes" aria-labelledby="paquetes-titulo" className="hive-plans scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1120px] px-5 py-14 sm:px-8 lg:py-20">
        <SectionTitle id="paquetes-titulo" eyebrow="Paquetes" title="Tu práctica." accent="Tu ritmo." />
        {loading ? (
          // Altura aproximada de la sección cargada (clase muestra, filas y botón): la página no salta al llegar.
          <div aria-hidden="true">
            <div className={`mb-4 h-[84px] ${ESQUELETO}`} />
            <div className="grid gap-2">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className={`h-[60px] ${ESQUELETO}`} />)}
            </div>
            <div className="mt-6 h-11 animate-pulse rounded-full border border-line bg-surface/70" />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-line bg-surface/70 p-4">
            <p className="text-[0.9rem] text-ink-muted">No pudimos cargar los paquetes.</p>
            <button type="button" onClick={onRetry} className="min-h-[44px] rounded-full border border-line-strong px-4 text-[0.85rem] font-bold text-ink">
              Reintentar
            </button>
          </div>
        ) : (
          <>
            {trial && (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-[18px] border border-accent-deep bg-surface/70 p-4">
                <div>
                  <p className="text-[0.95rem] font-bold text-ink">{trial.name}</p>
                  <p className="text-[0.8rem] text-ink-muted">Tu primera vez en HIVE</p>
                  {trial.durationDays != null && <p className="text-[0.8rem] text-ink-muted">{trial.durationDays} días naturales desde la compra</p>}
                  {trial.conditions?.map(condition => <p key={condition} className="text-[0.8rem] text-ink-muted">{condition}</p>)}
                </div>
                <Price p={trial} big />
              </div>
            )}
            {groups.length > 1 && (
              <div role="group" aria-label="Tipos de plan" className="hive-plan-options mb-5 flex flex-wrap gap-2">
                {groups.map(group => <button key={group.id} type="button" aria-pressed={selected?.id === group.id}
                  onClick={() => setChosen(group.id)}
                  className="min-h-[44px] rounded-full border border-line-strong px-5 py-2 text-[0.85rem] font-bold text-ink">
                  {group.label}
                </button>)}
              </div>
            )}
            {selected && <p className="mb-6 max-w-xl text-sm leading-relaxed text-ink-muted">{selected.description}</p>}
            {anyOpening && <p className="mb-2 text-[0.75rem] font-extrabold uppercase tracking-[0.12em] text-accent">Precio de apertura</p>}
            <ul>
              {visiblePlans.map((p) => (
                <li key={p.id} className="hive-plan-row flex items-start justify-between gap-5 border-t border-line py-5">
                  <div className="min-w-0">
                    <p className="text-[0.95rem] font-bold text-ink">{p.name}</p>
                    {p.durationDays != null && <p className="text-[0.8rem] text-ink-muted">{p.durationDays} días naturales {p.billingPeriod === "month" ? "por periodo mensual" : "desde la compra"}</p>}
                    {p.conditions?.map(condition => <p key={condition} className="text-[0.8rem] text-ink-muted">{condition}</p>)}
                    {p.perClass != null && <p className="text-[0.8rem] text-ink-muted">{money(p.perClass)} por clase</p>}
                  </div>
                  <Price p={p} />
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <PrimaryButton to="/app/checkout" className="w-full sm:w-auto">Comprar paquete</PrimaryButton>
              <p className="text-xs text-ink-muted">Precios en MXN. Revisa las condiciones antes de comprar.</p>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
