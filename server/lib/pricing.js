// Resuelve el precio que se muestra/cobra según el modo apertura.
// opening_price solo está poblado en los paquetes ilimitados.
export function resolveEffectivePrice(plan, openingActive) {
  const base = Number(plan?.price);
  const openingRaw = plan?.opening_price ?? plan?.openingPrice;
  const opening = openingRaw == null ? null : Number(openingRaw);
  if (openingActive && opening != null && Number.isFinite(opening) && opening > 0) {
    return opening;
  }
  return base;
}
