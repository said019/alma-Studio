// Resuelve el precio que se muestra/cobra según el modo apertura.
// El precio de apertura puede ser menor, igual o mayor al normal.
export function resolveEffectivePrice(plan, openingActive) {
  const base = Number(plan?.price);
  const openingRaw = plan?.opening_price ?? plan?.openingPrice;
  const opening = openingRaw == null ? null : Number(openingRaw);
  if (openingActive && opening != null && Number.isFinite(opening) && opening > 0) {
    return opening;
  }
  return base;
}
