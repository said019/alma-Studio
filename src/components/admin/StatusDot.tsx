import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "danger" | "muted" | "ink";

const TONE: Record<StatusTone, { text: string; dot: string }> = {
  success: { text: "text-success", dot: "bg-success" },
  danger: { text: "text-danger", dot: "bg-danger" },
  muted: { text: "text-ink-muted", dot: "bg-ink-muted" },
  ink: { text: "text-ink", dot: "bg-ink" },
};

/* Estado con punto y palabra (spec §4.2): el color nunca va solo. */
export default function StatusDot({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  const t = TONE[tone] ?? TONE.muted;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-bold", t.text)}>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
