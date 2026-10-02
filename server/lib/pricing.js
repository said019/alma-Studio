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

// A fixed external payment link must follow the same branch as the charged price.
export function resolvePlanPaymentUrl(plan, openingActive) {
  const opening = plan?.opening_price ?? plan?.openingPrice;
  const useOpening = openingActive && opening != null && Number.isFinite(Number(opening)) && Number(opening) > 0;
  return useOpening
    ? plan?.rules?.opening_payment_url || (Number(opening) === Number(plan?.price) ? plan?.rules?.payment_url : undefined)
    : plan?.rules?.payment_url;
}
