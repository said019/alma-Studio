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
        "mb-6 flex flex-wrap items-center gap-1 rounded-2xl border border-[#D8CFC1] bg-[#E9E6DF]/60 p-1 w-fit max-w-full",
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
              "rounded-xl px-4 py-2 text-[13px] font-semibold no-underline transition-all duration-200",
              active
                ? "bg-[#E4D2C3] text-[#4A3333] shadow-[inset_0_0_0_1px_rgba(138,110,96,0.45)]"
                : "text-[#4A3333]/55 hover:text-[#4A3333] hover:bg-[#E4D2C3]/40",
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
