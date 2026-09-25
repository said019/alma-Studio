import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type MasterDetailProps = {
  list: ReactNode;
  detail: ReactNode;
  hasSelection: boolean;
  onBack: () => void;
  backLabel?: string;
  /** "list-narrow": lista de 400 px y detalle ancho. "detail-narrow": al revés (Verificar). */
  layout?: "list-narrow" | "detail-narrow";
};

const GRID = {
  "list-narrow": "lg:grid-cols-[400px_minmax(0,1fr)]",
  "detail-narrow": "lg:grid-cols-[minmax(0,1fr)_440px]",
};

/* Lista y detalle lado a lado (spec §4.5). En pantallas angostas se ve uno a
   la vez: con algo elegido, el detalle con "Volver"; sin nada, la lista. */
export default function MasterDetail({ list, detail, hasSelection, onBack, backLabel = "Volver a la lista", layout = "list-narrow" }: MasterDetailProps) {
  return (
    <div className={cn("grid items-start gap-6", GRID[layout])}>
      <div className={cn("min-w-0", hasSelection && "hidden lg:block")}>{list}</div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        {hasSelection && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-bold text-ink-muted lg:hidden"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            {backLabel}
          </button>
        )}
        {detail}
      </div>
    </div>
  );
}
