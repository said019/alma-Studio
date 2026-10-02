import { afterEach, expect, it, vi } from 'vitest';
afterEach(()=>{vi.useRealTimers();delete (window as any).MercadoPago;document.querySelectorAll('script[src="https://sdk.mercadopago.com/js/v2"]').forEach(s=>s.remove());vi.resetModules();});
it('carga una sola instancia concurrente del SDK hospedado',async()=>{
 const {loadMercadoPagoSdk}=await import('./mercadopago');
 const a=loadMercadoPagoSdk(),b=loadMercadoPagoSdk();expect(a).toBe(b);
 const scripts=document.querySelectorAll('script[src="https://sdk.mercadopago.com/js/v2"]');expect(scripts).toHaveLength(1);
 const sdk=class {}; (window as any).MercadoPago=sdk;scripts[0].dispatchEvent(new Event('load'));
 await expect(a).resolves.toBe(sdk);
});
it('una carga fallida se elimina y permite reintento real',async()=>{
 const {loadMercadoPagoSdk}=await import('./mercadopago');
 const failed=loadMercadoPagoSdk();const assertion=expect(failed).rejects.toThrow('No pudimos cargar');
 document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]')!.dispatchEvent(new Event('error'));await assertion;
 const retry=loadMercadoPagoSdk();const sdk=class {}; (window as any).MercadoPago=sdk;
 document.querySelector('script[src="https://sdk.mercadopago.com/js/v2"]')!.dispatchEvent(new Event('load'));await expect(retry).resolves.toBe(sdk);
});
