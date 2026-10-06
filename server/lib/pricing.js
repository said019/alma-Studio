// A single price decision for storefront, purchases, sales and coupon previews.
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function validatePlanPromotion(rules = {}, price) {
  const mode = rules.promotion_mode ?? 'studio';
  if (rules.promotion_mode !== undefined && !['studio', 'disabled', 'price', 'percent', 'amount'].includes(rules.promotion_mode)) throw new Error('Modo de promoción inválido.');
  const value = rules.promotion_value;
  if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('El valor de la promoción debe ser un número no negativo.');
  if (['price', 'percent', 'amount'].includes(mode) && value == null) throw new Error('Configura el valor de la promoción.');
  if (mode === 'percent' && value > 100) throw new Error('El descuento porcentual no puede superar 100%.');
  if (price !== undefined && ['price', 'amount'].includes(mode) && value > Number(price)) throw new Error('La promoción no puede superar el precio regular.');
}

export function resolveEffectivePrice(plan, openingActive) {
  const base = Number(plan?.price);
  const rules = plan?.rules ?? {};
  // Fail closed to regular price for malformed historical data; admin writes reject it.
  try { validatePlanPromotion(rules, base); } catch { return base; }
  const mode = rules.promotion_mode ?? 'studio';
  if (mode === 'disabled') return base;
  if (mode === 'price') return money(rules.promotion_value);
  if (mode === 'percent') return money(base * (1 - rules.promotion_value / 100));
  if (mode === 'amount') return money(base - rules.promotion_value);
  const openingRaw = plan?.opening_price ?? plan?.openingPrice;
  const opening = openingRaw == null ? null : Number(openingRaw);
  if (openingActive && opening != null && Number.isFinite(opening) && opening > 0) return opening;
  return base;
}

export function resolvePlanPricing(plan, openingActive) {
  const effective = resolveEffectivePrice(plan, openingActive);
  const base = Number(plan?.price);
  const active = effective !== base;
  const studio = (plan?.rules?.promotion_mode ?? 'studio') === 'studio';
  const opening = studio && Boolean(openingActive) && active;
  const label = active ? (opening ? 'Precio de apertura' : 'Promoción') : null;
  return { effective_price: effective, effectivePrice: effective,
    opening_active: opening, openingActive: opening,
    promotion_active: active, promotionActive: active,
    promotion_label: label, promotionLabel: label,
    payment_url: resolvePlanPaymentUrl(plan, openingActive) ?? null, paymentUrl: resolvePlanPaymentUrl(plan, openingActive) ?? null };
}

// Static external links have fixed amounts. Custom discounts cannot reuse the
// opening link, even if they happen to have the same price as today's opening offer.
export function resolvePlanPaymentUrl(plan, openingActive) {
  const effective = resolveEffectivePrice(plan, openingActive);
  const mode = plan?.rules?.promotion_mode ?? 'studio';
  if (mode !== 'studio') return effective === Number(plan?.price) ? plan?.rules?.payment_url : plan?.rules?.promotion_payment_url;
  const opening = plan?.opening_price ?? plan?.openingPrice;
  const useOpening = openingActive && opening != null && Number.isFinite(Number(opening)) && Number(opening) > 0 && effective === Number(opening);
  return useOpening
    ? plan?.rules?.opening_payment_url || (Number(opening) === Number(plan?.price) ? plan?.rules?.payment_url : undefined)
    : plan?.rules?.payment_url;
}
