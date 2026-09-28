import { useState } from "react";
import { HeartPulse } from "lucide-react";

type Props = { hasInjury?: boolean | null; injuryDetails?: string | null; healthNotes?: string | null; firstVisit?: boolean | null };

/** Alertas para la coach y recepción: lesión o notas de salud, y primera visita (auditoría 2026-09-27, P1-8). */
export function HealthBadges({ hasInjury, injuryDetails, healthNotes, firstVisit }: Props) {
  const [open, setOpen] = useState(false);
  const notes = [injuryDetails, healthNotes].map((s) => (s ?? "").trim()).filter(Boolean);
  const injury = Boolean(hasInjury) || notes.length > 0;
  if (!injury && !firstVisit) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {injury && (
        <span className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-[28px] items-center gap-1 rounded-full border border-danger/25 bg-danger/10 px-2 text-[0.75rem] font-bold text-danger"
          >
            <HeartPulse size={12} aria-hidden="true" /> Lesión
          </button>
          {open && (
            <span role="note" className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-xl border border-line bg-surface p-3 text-[0.8rem] text-ink shadow-float">
              {notes.length ? notes.map((n) => <span key={n} className="block">{n}</span>) : "Reportó una lesión sin detalle."}
            </span>
          )}
        </span>
      )}
      {firstVisit && (
        <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 text-[0.75rem] font-bold text-accent-strong">
          Primera vez
        </span>
      )}
    </span>
  );
}
