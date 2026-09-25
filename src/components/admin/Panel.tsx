import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/* Tarjeta blanca del panel: borde en vez de sombra (spec §4.7). */
export function Panel({ children, className, "aria-label": ariaLabel }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <section aria-label={ariaLabel} className={cn("rounded-2xl border border-line bg-surface", className)}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, trailing }: { title: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 lg:px-6">
      <h2 className="text-base font-extrabold text-ink">{title}</h2>
      {trailing}
    </div>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 text-[13px] font-bold text-ink no-underline hover:text-accent-strong">
      {children}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}
