// Only the studio's exact origins may receive a checkout return. Never trust
// arbitrary request origins, path strings, or provider query parameters.
export function paymentReturnUrl(baseUrl, requestedOrigin, orderId) {
 const canonical = new URL(baseUrl).origin;
 const hiveOrigins = ['https://hivestudio.com.mx', 'https://www.hivestudio.com.mx'];
 const allowed = hiveOrigins.includes(canonical) ? hiveOrigins : [canonical];
 const origin = typeof requestedOrigin === 'string' && allowed.includes(requestedOrigin) ? requestedOrigin : canonical;
 return `${origin}/app/payment-return/${encodeURIComponent(orderId)}`;
}
