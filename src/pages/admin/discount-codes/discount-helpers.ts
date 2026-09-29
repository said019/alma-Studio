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

/** Estado operativo: un cupón habilitado puede haber vencido o agotado su cupo. */
export function couponStatus(coupon: {
  isActive: boolean;
  expiresAt?: string | null;
  usesCount: number;
  maxUses?: number | null;
}, now = Date.now()) {
  if (!coupon.isActive) return "Inactivo";
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= now) return "Vencido";
  if (usageInfo(coupon.usesCount, coupon.maxUses).exhausted) return "Agotado";
  return "Activo";
}
