/** Usos de un código: "7/50", "50/50 · agotado" o "23/∞". */
export function usageInfo(usesCount: number, maxUses: number | null | undefined) {
  const used = Math.max(0, Number(usesCount) || 0);
  if (!maxUses) return { label: `${used}/∞`, pct: null, exhausted: false };
  const exhausted = used >= maxUses;
  return {
    label: `${used}/${maxUses}${exhausted ? " · agotado" : ""}`,
    pct: Math.min(100, Math.round((used / maxUses) * 100)),
    exhausted,
  };
}
