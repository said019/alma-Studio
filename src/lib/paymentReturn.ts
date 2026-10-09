export const PAYMENT_RETURN_CHANNEL = 'hive-payment-return';
const MARKER = 'hive-pending-payment';
const MAX_AGE = 2 * 60 * 60 * 1000;
export const validOrderId = (value: unknown): value is string => typeof value === 'string' && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);
export const isPaymentReturn = (data: unknown, orderId: string) => {
  if (!data || typeof data !== 'object') return false;
  const message = data as Record<string, unknown>;
  return message.type === PAYMENT_RETURN_CHANNEL && message.orderId === orderId && validOrderId(message.orderId);
};
type PendingEntry = {orderId: string; userId: string; at: number};
function readEntries(): PendingEntry[] {
  let raw: unknown;
  try {raw=JSON.parse(localStorage.getItem(MARKER)||'[]');} catch {return [];}
  return (Array.isArray(raw)?raw:[]).filter((value): value is PendingEntry => Boolean(value && validOrderId(value.orderId) && typeof value.userId==='string' && value.userId && Number.isFinite(value.at) && value.at<=Date.now() && Date.now()-value.at<=MAX_AGE));
}
export function rememberPayment(orderId: string, userId: string | undefined) {
  if (!validOrderId(orderId) || !userId) return;
  try {
    const entries=readEntries();
    if(!entries.some(value=>value.orderId===orderId&&value.userId===userId)) entries.push({orderId,userId,at:Date.now()});
    localStorage.setItem(MARKER,JSON.stringify(entries));
  } catch { /* Browser storage may be unavailable. */ }
}
export function pendingPayment(userId: string) {
  try {return readEntries().filter(value=>value.userId===userId).sort((a,b)=>b.at-a.at||a.orderId.localeCompare(b.orderId))[0]?.orderId??null;} catch {return null;}
}
export function clearPendingPayment(orderId: string) {
  try {localStorage.setItem(MARKER,JSON.stringify(readEntries().filter(value=>value.orderId!==orderId)));} catch { /* Optional recovery only. */ }
}
export function notifyPaymentReturn(orderId: string) {
  if (!validOrderId(orderId)) return;
  const message={type:PAYMENT_RETURN_CHANNEL,orderId};
  try { window.opener?.postMessage(message,window.location.origin); window.opener?.focus(); } catch { /* Opening app may be isolated or closed. */ }
  try { const channel=new BroadcastChannel(PAYMENT_RETURN_CHANNEL); channel.postMessage(message); channel.close(); } catch { /* Not all browsers support channels. */ }
}
