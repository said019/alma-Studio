import { addDays, format, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Semana anterior / siguiente / Hoy. Las semanas empiezan en lunes. */
export default function WeekNav({ weekStart, onChange }: { weekStart: Date; onChange: (weekStart: Date) => void }) {
  const end = addDays(weekStart, 6);
  const label = `${format(weekStart, "d MMM", { locale: es })} – ${format(end, "d MMM yyyy", { locale: es })}`;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Button variant="outline" size="icon" aria-label="Semana anterior" onClick={() => onChange(addDays(weekStart, -7))}>
        <ChevronLeft size={18} />
      </Button>
      <Button variant="outline" size="icon" aria-label="Semana siguiente" onClick={() => onChange(addDays(weekStart, 7))}>
        <ChevronRight size={18} />
      </Button>
      <span className="nums ml-1 text-base font-extrabold text-ink">{label}</span>
      <Button variant="ghost" className="underline" onClick={() => onChange(startOfWeek(new Date(), { weekStartsOn: 1 }))}>
        Hoy
      </Button>
    </div>
  );
}
