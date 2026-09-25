import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const initials = (name?: string | null): string => {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join("") || "?";
};

type AvatarProps = { name?: string | null; photoUrl?: string | null; size?: number; className?: string };

export function Avatar({ name, photoUrl, size = 36, className }: AvatarProps) {
  const box = { width: size, height: size };
  if (photoUrl) {
    return <img src={photoUrl} alt="" className={cn("shrink-0 rounded-full object-cover", className)} style={box} />;
  }
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-sunken font-extrabold text-ink", className)}
      style={{ ...box, fontSize: Math.max(12, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
}

type PersonCellProps = { name?: string | null; sub?: ReactNode; photoUrl?: string | null; size?: number };

/* Avatar + nombre + línea secundaria. Los textos largos se cortan con "…"
   para no empujar la fila (Review Focus 5). */
export default function PersonCell({ name, sub, photoUrl, size = 36 }: PersonCellProps) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-bold text-ink">{name || "Sin nombre"}</span>
        {sub && <span className="mt-0.5 block truncate text-xs text-ink-muted">{sub}</span>}
      </span>
    </span>
  );
}
