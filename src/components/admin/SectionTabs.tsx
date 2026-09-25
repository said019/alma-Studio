import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface SectionTab {
  label: string;
  to: string;
  /** Contador de atención (coral). Sólo se muestra si es mayor que 0. */
  count?: number;
  /** Activa sólo en su ruta exacta, no en sus sub-rutas. */
  exact?: boolean;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  className?: string;
  "aria-label"?: string;
}

/**
 * Pestañas entre páginas hermanas de una sección (p. ej. Cobros → Cobrar /
 * Verificar / Historial). Van a la derecha del título (spec §4.3).
 */
const SectionTabs = ({ tabs, className, "aria-label": ariaLabel = "Secciones" }: SectionTabsProps) => {
  const location = useLocation();

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1", className)}
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? location.pathname === tab.to
          : location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
        return (
          <Link
            key={tab.to}
            to={tab.to}
            data-press
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-[13px] font-bold no-underline transition-colors duration-200",
              active
                ? "bg-ink text-canvas"
                : "text-ink-muted hover:text-ink hover:bg-sunken",
            )}
          >
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span className="nums grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[0.75rem] font-extrabold leading-none text-ink">
                {tab.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
};

export default SectionTabs;
