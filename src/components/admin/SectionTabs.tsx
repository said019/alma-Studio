import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface SectionTab {
  label: string;
  to: string;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  className?: string;
}

/**
 * Barra de tabs horizontal para navegar entre páginas hermanas de una misma
 * sección del admin (p. ej. Cobros → Cobrar / Verificar). El nav lateral muestra
 * una sola entrada por grupo; estos tabs permiten saltar entre las páginas.
 *
 * La tab activa se detecta cuando location.pathname empieza con `to`.
 */
const SectionTabs = ({ tabs, className }: SectionTabsProps) => {
  const location = useLocation();

  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1 w-fit max-w-full",
        className,
      )}
    >
      {tabs.map((tab) => {
        const active =
          location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
        return (
          <Link
            key={tab.to}
            to={tab.to}
            data-press
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full px-4 text-[13px] font-bold no-underline transition-colors duration-200",
              active
                ? "bg-ink text-canvas"
                : "text-ink-muted hover:text-ink hover:bg-sunken",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
};

export default SectionTabs;
