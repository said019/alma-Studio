import { HeartPulse } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = { hasInjury?: boolean | null; injuryDetails?: string | null; healthNotes?: string | null; firstVisit?: boolean | null };

/**
 * Alertas para la coach y recepción: lesión o notas de salud, y primera visita
 * (auditoría 2026-09-27, P1-8). El detalle usa el Popover del sistema (portal
 * de Radix) para no cortarse dentro de listas con `overflow-hidden` ni
 * desbordarse a la columna vecina en un grid (ronda de ajustes 1).
 */
export function HealthBadges({ hasInjury, injuryDetails, healthNotes, firstVisit }: Props) {
  const notes = [injuryDetails, healthNotes].map((s) => (s ?? "").trim()).filter(Boolean);
  const injury = Boolean(hasInjury) || notes.length > 0;
  if (!injury && !firstVisit) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {injury && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-danger/25 bg-danger/10 px-2 text-[0.75rem] font-bold text-danger"
            >
              <HeartPulse size={12} aria-hidden="true" /> Lesión
            </button>
          </PopoverTrigger>
          <PopoverContent role="note" align="start" className="w-64 text-[0.8rem] text-ink">
            {notes.length ? notes.map((n) => <span key={n} className="block">{n}</span>) : "Reportó una lesión sin detalle."}
          </PopoverContent>
        </Popover>
      )}
      {firstVisit && (
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold text-accent-strong">
          Primera vez
        </span>
      )}
    </span>
  );
}
