import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Copy, ArrowLeft } from "lucide-react";

import { resolveToneClass, type Tone } from "@/design/tokens";

/* Widgets de la app: color en clases por tema (spec 2026-09-25 §5). */

/* ═══ formatMoneyMX ═══ */
export const formatMoneyMX = (value: number | string | null | undefined) => {
  const n = Number(value ?? 0);
  return n.toLocaleString("es-MX", { maximumFractionDigits: 0 });
};

/* ═══ SegmentedTabs ═══ activa en tinta (panel) o degradado (app) */
type SegmentedTabsProps<T extends string> = {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
};
export function SegmentedTabs<T extends string>({ options, value, onChange }: SegmentedTabsProps<T>) {
  return (
    <div role="tablist" className="inline-flex gap-1 p-1 rounded-full border border-line bg-surface dark:bg-surface/70">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={
              "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[0.85rem] font-bold transition-colors " +
              (active
                ? "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground"
                : "text-ink-muted hover:text-ink")
            }
          >
            {opt.label}
            {typeof opt.count === "number" && <span className="nums text-[0.75rem]">{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ═══ BackLink ═══ */
type BackLinkProps = { to: string; label: string };
export const BackLink = ({ to, label }: BackLinkProps) => (
  <Link to={to} className="inline-flex min-h-[44px] items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.12em] no-underline mb-4 text-ink-muted hover:text-ink">
    <ArrowLeft size={14} />
    {label}
  </Link>
);

/* ═══ DataRow — key-value ═══ */
type DataRowProps = {
  label: string;
  value: ReactNode;
  mono?: boolean;
  copyable?: string;
};
export const DataRow = ({ label, value, mono, copyable }: DataRowProps) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(copyable).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-3 border-t border-line">
      <span className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</span>
      <div className="flex items-center gap-2 justify-end">
        <span className={"text-right text-ink " + (mono ? "font-mono text-[0.92rem]" : "nums text-[0.95rem] font-semibold")}>{value}</span>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? "Copiado" : "Copiar"}
            className={"grid h-11 w-11 place-items-center rounded-full bg-transparent border-0 cursor-pointer " + (copied ? "text-success" : "text-accent-strong")}
          >
            {copied ? <Check size={15} strokeWidth={2.5} /> : <Copy size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

/* ═══ Stepper — progreso de flujos de varios pasos ═══ */
type StepperProps<T extends string> = {
  steps: { id: T; label: string }[];
  current: T;
};
export function Stepper<T extends string>({ steps, current }: StepperProps<T>) {
  const currentIdx = Math.max(0, steps.findIndex((s) => s.id === current));
  return (
    <ol className="flex items-center gap-2 list-none m-0 p-0 overflow-x-auto">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const dot = active
          ? "bg-ink text-canvas dark:bg-accent-gradient dark:text-accent-foreground"
          : done
            ? "bg-surface text-success ring-1 ring-inset ring-line"
            : "text-ink-muted ring-1 ring-inset ring-line";
        return (
          <li key={s.id} className="flex items-center gap-2 shrink-0">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[0.75rem] font-bold nums ${dot}`}>
              {done ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={"text-[0.75rem] font-bold uppercase tracking-[0.12em] " + (active ? "text-ink" : "text-ink-muted")}>{s.label}</span>
            {i < steps.length - 1 && <span className={"hidden sm:inline-block h-px w-6 ml-1 " + (done ? "bg-success" : "bg-line")} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ═══ StickyCta — acción fija al fondo en flujos de confirmación ═══ */
type StickyCtaProps = {
  children: ReactNode;
};
export const StickyCta = ({ children }: StickyCtaProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sentinel = document.createElement("div");
    el.parentElement?.insertBefore(sentinel, el);
    const obs = new IntersectionObserver(([entry]) => {
      setStuck(!entry.isIntersecting);
    }, { rootMargin: "-1px 0px 0px 0px", threshold: [1] });
    obs.observe(sentinel);
    return () => {
      obs.disconnect();
      sentinel.remove();
    };
  }, []);
  return (
    <div ref={ref} className="sticky bottom-20 lg:bottom-6 z-20 mt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className={"rounded-3xl p-3 transition-shadow border " + (stuck ? "bg-surface/95 border-line shadow-float backdrop-blur" : "bg-transparent border-transparent")}>
        {children}
      </div>
    </div>
  );
};

/* ═══ StatusPill — estado semántico; el color nunca va solo ═══ */
type StatusPillProps = {
  label: string;
  tone: Tone;
  variant?: "soft" | "solid";
};
export const StatusPill = ({ label, tone, variant = "soft" }: StatusPillProps) => {
  const t = resolveToneClass(tone);
  const cls = variant === "soft" ? `${t.softBg} ${t.softFg} ring-1 ring-inset ${t.ring}` : `${t.solidBg} ${t.solidFg}`;
  return (
    <span className={"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-semibold leading-none " + cls}>
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
};

/* ═══ InfoBanner — aviso en línea (no toast) ═══ */
type InfoBannerProps = {
  tone?: Tone;
  title: string;
  description?: string;
  action?: ReactNode;
};
export const InfoBanner = ({ tone = "accent", title, description, action }: InfoBannerProps) => {
  const t = resolveToneClass(tone);
  return (
    <div className={`flex items-start gap-4 rounded-2xl p-4 border border-line text-ink ${t.softBg}`}>
      <span aria-hidden="true" className={`mt-1.5 inline-block h-2 w-2 rounded-full shrink-0 bg-current ${t.fg}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[0.95rem] font-semibold leading-snug text-ink">{title}</p>
        {description && <p className="mt-1 text-[0.875rem] leading-[1.5] text-ink-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
