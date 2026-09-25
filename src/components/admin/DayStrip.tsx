import { cn } from "@/lib/utils";

type Day = { date: string; label: string; day: number; count: number };

/* Tira de 7 días con número de clases. El elegido va en tinta; los días que
   ya pasaron, en gris. */
export default function DayStrip({ days, value, onChange, today }: { days: Day[]; value: string; onChange: (date: string) => void; today: string }) {
  return (
    <div role="group" aria-label="Días de la semana" className="flex gap-1.5">
      {days.map((d) => {
        const active = d.date === value;
        const past = d.date < today;
        return (
          <button
            key={d.date}
            type="button"
            aria-pressed={active}
            aria-label={`${d.label} ${d.day}, ${d.count} ${d.count === 1 ? "clase" : "clases"}`}
            onClick={() => onChange(d.date)}
            className={cn(
              "flex min-h-[60px] flex-1 flex-col items-center justify-center gap-px rounded-xl border",
              active ? "border-ink bg-ink text-canvas" : "border-line bg-transparent",
              !active && (past ? "text-ink-muted" : "text-ink"),
            )}
          >
            <span className="text-[0.75rem] font-extrabold tracking-[0.08em]">{d.label}</span>
            <span className="nums text-base font-extrabold leading-tight">{d.day}</span>
            <span className="nums text-[0.75rem] opacity-75">{d.count}</span>
          </button>
        );
      })}
    </div>
  );
}
