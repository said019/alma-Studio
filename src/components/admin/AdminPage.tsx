import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* Contenedor de cada pantalla del panel: todo el ancho, márgenes de 32 px en
   escritorio (spec §4.3). Reemplaza al viejo `.admin-page max-w-*`. */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-6 px-4 py-5 lg:px-8 lg:py-7", className)}>{children}</div>;
}

type AdminPageHeaderProps = {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/* Encabezado de pantalla (spec §4.3): etiqueta, título en mayúsculas,
   subtítulo opcional y, a la derecha, pestañas + acción principal. */
export function AdminPageHeader({ kicker, title, subtitle, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-[0.75rem] font-bold uppercase leading-tight tracking-[0.12em] text-ink-muted">{kicker}</p>
        <h1 className="mt-2 break-words font-display text-[1.5rem] font-extrabold uppercase leading-[1.05] text-ink lg:text-[1.75rem]">
          {title}
        </h1>
        {subtitle && <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
    </header>
  );
}
