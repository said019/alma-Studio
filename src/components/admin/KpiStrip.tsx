import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Panel } from "./Panel";

export type Kpi = { label: string; value: ReactNode; hint?: ReactNode };

const COLS: Record<number, string> = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };

/* Fila de cifras en una sola tarjeta con divisores (spec §4.5). En celular
   van de dos en dos. */
export default function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <Panel>
      <dl className={cn("grid grid-cols-2", COLS[Math.min(Math.max(items.length, 1), 4)])}>
        {items.map((k, i) => (
          <div
            key={k.label}
            className={cn(
              "border-line px-5 py-4 lg:px-6 lg:py-5",
              i % 2 === 1 && "border-l",
              i >= 2 && "border-t lg:border-t-0",
              i > 0 && "lg:border-l",
            )}
          >
            <dt className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{k.label}</dt>
            <dd className="nums mt-2.5 font-display text-[1.5rem] font-semibold leading-[1.1] text-ink lg:text-[1.75rem]">{k.value}</dd>
            {k.hint && <dd className="mt-1.5 text-[13px] text-ink-muted">{k.hint}</dd>}
          </div>
        ))}
      </dl>
    </Panel>
  );
}
