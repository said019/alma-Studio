import type { ReactNode } from "react";
import { COLOR } from "@/design/tokens";

/* Tarjeta de cifra del panel (spec §4.5). Variante atención: borde coral y
   número en coral profundo — el único número coral de la pantalla, siempre
   con su etiqueta (coral nunca es la única señal). */
type FigureCardProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  attention?: boolean;
};

export default function FigureCard({ label, value, hint, attention = false }: FigureCardProps) {
  return (
    <div
      data-figure-card
      className="rounded-xl p-4 lg:p-5"
      style={{
        backgroundColor: COLOR.surface,
        borderWidth: attention ? 2 : 1,
        borderStyle: "solid",
        borderColor: attention ? COLOR.accent : COLOR.line,
      }}
    >
      <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em]" style={{ color: COLOR.inkMuted }}>{label}</p>
      <p
        className="nums mt-2 font-display font-semibold text-[1.75rem] leading-none"
        style={{ color: attention ? COLOR.accentStrong : COLOR.ink }}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-[0.8125rem]" style={{ color: COLOR.inkMuted }}>{hint}</p>}
    </div>
  );
}
