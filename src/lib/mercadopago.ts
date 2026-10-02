const SDK_SRC = "https://sdk.mercadopago.com/js/v2";
let pending: Promise<unknown> | null = null;

/** Loads only Mercado Pago's hosted SDK. Failed loads can be retried in place. */
export function loadMercadoPagoSdk(timeoutMs = 12000): Promise<unknown> {
  if (typeof window === "undefined") return Promise.reject(new Error("Sin navegador"));
  const installed = (window as unknown as Record<string, unknown>).MercadoPago;
  if (installed) return Promise.resolve(installed);
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    let settled = false;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); pending = null; reject(new Error(error)); }
      else resolve((window as unknown as Record<string, unknown>).MercadoPago);
    };
    const timer = window.setTimeout(() => finish("El formulario tardó demasiado en cargar"), timeoutMs);
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => finish((window as unknown as Record<string, unknown>).MercadoPago ? undefined : "El formulario no pudo cargar");
    script.onerror = () => finish("No pudimos cargar Mercado Pago");
    document.head.appendChild(script);
  });
  return pending;
}

export type CardReadiness = { ready: boolean; provider: "mercadopago"; recurringSupported: false; message?: string };
export type CardPayment = { paymentId?: string; status?: string; statusDetail?: string; threeDS?: { external_resource_url: string; creq: string } };
export type CardSession = { refundStatus?: string | null; refundedAmount?: number; orderId: string; amount: number; currency: string; publicKey: string; email: string; orderStatus: string; canSubmit: boolean; payment?: CardPayment | null };
