import { useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Símbolo de HIVE — PROVISIONAL (spec §5).
 * Trazado a partir del Instagram @hive.pilates (sep 2026). Cuando llegue el
 * logo oficial, reemplazar estos trazos y src/assets/brand/hive-mark.svg,
 * y correr `npm run brand:assets` para regenerar favicon, íconos y pase.
 */
const HEX = "50,0 100,28.87 100,86.6 50,115.47 0,86.6 0,28.87";
const SPOKES: [number, number, number, number][] = [
  [50, -2, 50, 23.8], [50, 117.5, 50, 91.6],
  [-2, 27.7, 18.5, 39.55], [102, 27.7, 81.5, 39.55],
  [-2, 87.8, 29.4, 70.9], [102, 87.8, 70.6, 70.9],
];
const CUTS = [
  "M34.5,37 C34.5,29 41.5,23.8 50,23.8 C58.5,23.8 65.5,29 65.5,37 Z",
  "M47.5,41.6 L27,41.6 C20.5,41.6 16.6,46.6 16.9,52.6 C17.2,59.4 22.2,65 29,65.2 C34.4,64.9 39.8,61.6 43.6,56.6 C45.9,53.6 47.5,50.4 47.5,47 Z",
  "M52.5,41.6 L73,41.6 C79.5,41.6 83.4,46.6 83.1,52.6 C82.8,59.4 77.8,65 71,65.2 C65.6,64.9 60.2,61.6 56.4,56.6 C54.1,53.6 52.5,50.4 52.5,47 Z",
  "M50,55.3 C52.5,59.5 57,63.2 62.6,65.7 C66.4,67.4 68.4,70.2 68.2,73.4 C68,75.2 67.6,76.8 67,78 L33,78 C32.4,76.8 32,75.2 31.8,73.4 C31.6,70.2 33.6,67.4 37.4,65.7 C43,63.2 47.5,59.5 50,55.3 Z",
  "M34,81.6 L66,81.6 C66,87.2 58.8,91.8 50,91.8 C41.2,91.8 34,87.2 34,81.6 Z",
];

type BrandLogoProps = {
  variant?: "mark" | "lockup";
  className?: string;
  title?: string;
  /** Alto del símbolo en px (el ancho se ajusta solo). */
  size?: number;
};

export function BrandLogo({ variant = "mark", className, title = "HIVE Pilates Studio", size = 40 }: BrandLogoProps) {
  const maskId = `hive-mark-${useId().replace(/[:]/g, "")}`;
  const mark = (
    <svg
      viewBox="-1 -1 102 117.47"
      height={size}
      width={Math.round(size * (102 / 117.47))}
      role={variant === "mark" ? "img" : undefined}
      aria-label={variant === "mark" ? title : undefined}
      aria-hidden={variant === "lockup" ? true : undefined}
      className="shrink-0"
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="-1" y="-1" width="102" height="117.47">
          <polygon points={HEX} fill="#fff" />
          <g stroke="#000" strokeWidth={3.2}>
            {SPOKES.map(([x1, y1, x2, y2]) => <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
          </g>
          <g fill="#000">{CUTS.map((d) => <path key={d.slice(0, 12)} d={d} />)}</g>
        </mask>
      </defs>
      <rect x="-1" y="-1" width="102" height="117.47" fill="currentColor" mask={`url(#${maskId})`} />
    </svg>
  );

  if (variant === "mark") return <span className={cn("inline-flex", className)}>{mark}</span>;

  return (
    <span role="img" aria-label={title} className={cn("inline-flex items-center gap-3", className)}>
      {mark}
      <span className="flex flex-col leading-none">
        <span className="font-display font-extrabold tracking-[0.04em]" style={{ fontSize: size * 0.62 }}>HIVE</span>
        <span className="font-bold tracking-[0.42em] mt-1.5" style={{ fontSize: Math.max(9, size * 0.17) }}>PILATES STUDIO</span>
      </span>
    </span>
  );
}
