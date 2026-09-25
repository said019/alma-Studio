import type { ReactNode } from "react";

/*
 * Hexágono HIVE sobre un pedestal iluminado: momento de marca (spec 2026-09-25 §5).
 * Estados vacío y error, acceso, confirmación de clase, 404. Decorativo.
 * En claro (panel) conserva el hexágono pequeño de siempre; el pedestal y su
 * resplandor sólo aparecen en oscuro.
 */
type HexPedestalProps = {
  size?: "sm" | "lg";
  icon?: ReactNode;
  tone?: "accent" | "danger";
};

export function HexPedestal({ size = "sm", icon, tone = "accent" }: HexPedestalProps) {
  const lg = size === "lg";
  const small = tone === "danger" ? "bg-sunken text-danger" : "bg-accent-soft text-accent-strong";
  const core = tone === "danger" ? "bg-danger text-canvas" : "bg-accent-gradient text-accent-foreground";
  return (
    <span aria-hidden="true" data-hex-pedestal className="inline-grid">
      <span className={`grid h-12 w-[52px] place-items-center clip-hex dark:hidden ${small}`}>{icon}</span>
      <span className={`relative hidden dark:grid place-items-center ${lg ? "h-[190px] w-[200px]" : "h-[120px] w-[150px]"}`}>
        <span className={`absolute rounded-full blur-[6px] bg-pedestal-glow ${lg ? "h-[180px] w-[180px]" : "h-[110px] w-[110px]"}`} />
        <span className={`absolute bottom-2 rounded-[50%] bg-pedestal-base ${lg ? "h-[26px] w-[150px]" : "h-[18px] w-[110px]"}`} />
        <span className={`relative grid place-items-center clip-hex bg-surface ${lg ? "h-[108px] w-[96px]" : "h-[70px] w-[62px]"}`}>
          <span className={`grid place-items-center clip-hex ${core} ${lg ? "h-[65px] w-[58px]" : "h-[42px] w-[37px]"}`}>{icon}</span>
        </span>
      </span>
    </span>
  );
}
