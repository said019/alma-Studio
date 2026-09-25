import { cn } from "@/lib/utils";

type SeatMeterProps = { booked: number; capacity: number; muted?: boolean; size?: "sm" | "md" };

/* Ocupación en segmentos, uno por lugar (spec §4.5). "Llena" va además en
   texto junto a la clase; aquí sólo se anuncia para lectores de pantalla.
   Con más de 12 lugares se dibuja una barra. Sobrecupo: todo lleno y la
   etiqueta dice la cifra real. */
export default function SeatMeter({ booked, capacity, muted = false, size = "md" }: SeatMeterProps) {
  const cap = Math.max(0, Math.floor(Number(capacity) || 0));
  const taken = Math.max(0, Math.floor(Number(booked) || 0));
  const full = cap > 0 && taken >= cap;
  const fill = muted ? "bg-line-strong" : "bg-ink";

  if (cap === 0) {
    return <span role="img" aria-label="Sin cupo definido" className="inline-block h-2 w-8 rounded-full bg-line" />;
  }
  const label = `${taken} de ${cap} lugares${full ? " · llena" : ""}`;
  if (cap > 12) {
    const pct = Math.min(100, Math.round((taken / cap) * 100));
    return (
      <span role="img" aria-label={label} className="inline-block h-2 w-24 overflow-hidden rounded-full bg-line">
        <span className={cn("block h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
      </span>
    );
  }
  const seg = size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2";
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 gap-[3px]">
      {Array.from({ length: cap }, (_, i) => (
        <span key={i} className={cn("rounded-[2px]", seg, i < taken ? fill : "bg-line")} />
      ))}
    </span>
  );
}
