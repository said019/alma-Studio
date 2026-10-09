import { mpError } from './mercadoPago.js';

// Mercado Pago Payment Search caps pages at 50 and offset at 10000.
// Fail closed rather than treating a truncated/repeated page as a full search.
export async function searchOrderPayments(request, orderId) {
  const found = new Map();
  let expectedTotal;
  for (let offset = 0; offset <= 10000; offset += 50) {
    const page = await request(`/v1/payments/search?external_reference=${encodeURIComponent(orderId)}&sort=id&criteria=asc&limit=50&offset=${offset}`);
    if (!Array.isArray(page.results)) throw mpError('Respuesta de conciliación incompleta.', 503);
    const total = page.paging?.total;
    if (total != null && (!Number.isInteger(total) || total < 0)) throw mpError('Paginación de conciliación inválida.', 503);
    if (total != null) {
      if(expectedTotal != null && expectedTotal !== total)throw mpError('La búsqueda cambió; se reintentará la conciliación.',503);
      expectedTotal=total;
    }
    let added = 0;
    for (const payment of page.results) {
      if (String(payment.external_reference) !== orderId || !/^\d+$/.test(String(payment.id))) throw mpError('Referencia de conciliación incompatible.', 409);
      if (!found.has(String(payment.id))) added++;
      found.set(String(payment.id), payment);
    }
    if (page.results.length>50 || added!==page.results.length) throw mpError('La búsqueda repitió movimientos; se reintentará.',503);
    if (total != null ? offset + page.results.length >= total : page.results.length < 50) {
      if(total!=null&&found.size!==total)throw mpError('La búsqueda de pagos no está completa.',503);
      return [...found.values()];
    }
    if (!added || page.results.length !== 50) throw mpError('La búsqueda de pagos no está completa.', 503);
  }
  throw mpError('La búsqueda excede el límite del proveedor y necesita revisión.', 409);
}

export function canonicalPayment(payments, persistedId) {
  if (persistedId) return payments.find(p => String(p.id) === String(persistedId)) ?? null;
  return [...payments].sort((a, b) => {
    const rank = p => ['approved', 'refunded', 'charged_back'].includes(p.status) ? 0 : ['pending', 'in_process', 'authorized'].includes(p.status) ? 1 : 2;
    const status = rank(a) - rank(b);
    if (status) return status;
    const date = (Date.parse(a.date_approved || a.date_created) || 0) - (Date.parse(b.date_approved || b.date_created) || 0);
    if (date) return date;
    return BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0;
  })[0] ?? null;
}
