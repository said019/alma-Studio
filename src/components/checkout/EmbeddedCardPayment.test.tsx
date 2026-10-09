import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '@/test/renderPage';
import api from '@/lib/api';
import { loadMercadoPagoSdk } from '@/lib/mercadopago';
import { EmbeddedCardPayment } from './EmbeddedCardPayment';
vi.mock('@/lib/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@/lib/mercadopago',()=>({loadMercadoPagoSdk:vi.fn()}));
let settings:any;
const unmount=vi.fn();
const create=vi.fn(async(_kind:string,_host:string,config:any)=>{settings=config;config.callbacks.onReady();return {unmount};});
const session={orderId:'same-order',amount:1080,currency:'MXN',publicKey:'TEST-public',email:'synthetic@example.test',orderStatus:'pending_payment',canSubmit:true,payment:null};
beforeEach(()=>{
 vi.mocked(api.get).mockReset().mockResolvedValue({data:{data:session}});
 vi.mocked(api.post).mockReset();create.mockClear();unmount.mockClear();
 vi.mocked(loadMercadoPagoSdk).mockResolvedValue(class {bricks(){return {create};}});
});
afterEach(()=>vi.clearAllMocks());
const mount=()=>renderPage(<EmbeddedCardPayment orderId="same-order" onClose={()=>{}}/>,'/app/checkout');
describe('tarjeta dentro de HIVE',()=>{
 it('permite cerrar el modal sin enviar un pago',async()=>{
  const close=vi.fn();
  renderPage(<EmbeddedCardPayment orderId="same-order" onClose={close}/>, '/app/checkout');
  await waitFor(()=>expect(create).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'Close'}));
  expect(close).toHaveBeenCalledTimes(1);
  expect(api.post).not.toHaveBeenCalled();
 });
 it('carga campos hospedados sin popup y envía solo token; un doble submit produce un solo intento',async()=>{
  vi.mocked(api.post).mockImplementation(async(url)=>({data:{data:url.endsWith('card-payment')?{paymentId:'pay1',status:'in_process'}:{...session,canSubmit:false,payment:{paymentId:'pay1',status:'in_process'}}}}));
  mount();await waitFor(()=>expect(create).toHaveBeenCalled());
  expect(screen.getByRole('dialog',{name:'Pagar con Mercado Pago'})).toBeInTheDocument();
  const submit=settings.callbacks.onSubmit;
  await act(async()=>{await Promise.all([submit({token:'tokenized',payment_method_id:'visa',issuer_id:'issuer',installments:12,transaction_amount:1,card_number:'SHOULD_NOT_LEAVE',payer:{email:'spoof@example.test',identification:{type:'CURP',number:'synthetic'}}}),submit({token:'duplicate'})]);});
  const payments=vi.mocked(api.post).mock.calls.filter(([url])=>url.endsWith('/card-payment'));
  expect(payments).toHaveLength(1);
  expect(payments[0]).toEqual(['/orders/same-order/card-payment',{token:'tokenized',payment_method_id:'visa',issuer_id:'issuer',installments:1,payer:{identification:{type:'CURP',number:'synthetic'}}}]);
  expect(screen.getByRole('link',{name:'Ver mi orden'})).toHaveAttribute('href','/app/orders/same-order');
  expect(screen.queryByText('Pago confirmado. Tu compra está lista.')).not.toBeInTheDocument();
 });
 it('reanuda desafío bancario dentro de la página sin volver a enviar cobro',async()=>{
  vi.mocked(api.get).mockResolvedValue({data:{data:{...session,canSubmit:false,payment:{paymentId:'pay3ds',status:'pending',statusDetail:'pending_challenge',threeDS:{external_resource_url:'https://bank.example.test/challenge',creq:'challenge'}}}}});
  const view=mount();await waitFor(()=>expect(create).toHaveBeenCalledWith('statusScreen',expect.any(String),expect.objectContaining({initialization:{paymentId:'pay3ds',additionalInfo:{externalResourceURL:'https://bank.example.test/challenge',creq:'challenge'}}})));
  expect(screen.getByText('Completa la verificación de tu banco en esta página.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();view.unmount();await waitFor(()=>expect(unmount).toHaveBeenCalled());
 });
 it('permite recargar SDK fallido sin crear otra orden',async()=>{
  vi.mocked(loadMercadoPagoSdk).mockRejectedValueOnce(new Error('network'));
  mount();expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar Mercado Pago');
  fireEvent.focus(window);
  await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar Mercado Pago');
  fireEvent.click(screen.getByRole('button',{name:'Consultar / volver a cargar'}));
  await waitFor(()=>expect(create).toHaveBeenCalled());expect(api.post).not.toHaveBeenCalled();
 });
 it('un timeout del intento no muestra éxito ni permite cobro duplicado',async()=>{
  vi.mocked(api.post).mockImplementation(async(url)=>{if(url.endsWith('card-payment'))throw new Error('timeout');return {data:{data:{...session,canSubmit:false,payment:{status:'unknown'}}}};});
  mount();await waitFor(()=>expect(create).toHaveBeenCalled());await act(async()=>{await settings.callbacks.onSubmit({token:'once',payment_method_id:'visa'});});
  await screen.findByText('Estamos verificando el pago. No vuelvas a pagar esta orden.');
  expect(create).toHaveBeenCalledTimes(1);expect(screen.queryByText('Pago confirmado. Tu compra está lista.')).not.toBeInTheDocument();
 });
 it('solo vuelve a mostrar tarjeta si el servidor confirma que no existe intento',async()=>{
  vi.mocked(api.post).mockImplementation(async(url)=>{if(url.endsWith('card-payment'))throw {response:{status:400,data:{message:'Token inválido'}}};return {data:{data:session}};});
  mount();await waitFor(()=>expect(create).toHaveBeenCalled());await act(async()=>{await settings.callbacks.onSubmit({token:'bad',payment_method_id:'visa'});});
  await waitFor(()=>expect(create).toHaveBeenCalledTimes(2));
 });
 it('confirma compra solo cuando el servidor confirma orden approved',async()=>{
  vi.mocked(api.get).mockResolvedValue({data:{data:{...session,orderStatus:'approved',canSubmit:false,payment:{status:'approved'}}}});
  mount();expect(await screen.findByText('Pago confirmado. Tu compra está lista.')).toBeInTheDocument();expect(create).not.toHaveBeenCalled();
 });
});

it.each([
 ['refunded',undefined,'El pago fue reembolsado. Esta compra ya no activa tu membresía.'],
 ['charged_back',undefined,'El pago tiene un contracargo. Consulta al estudio el estado de tu membresía.'],
 ['approved','partially_refunded','Esta compra tiene un reembolso parcial. Consulta el detalle de tu orden.'],
])('prioriza reversión %s sobre una orden contablemente aprobada',async(status,refundStatus,message)=>{
 vi.mocked(api.get).mockResolvedValue({data:{data:{...session,orderStatus:'approved',canSubmit:false,payment:{status},refundStatus}}});
 mount();expect(await screen.findByText(message)).toBeInTheDocument();expect(screen.queryByText('Pago confirmado. Tu compra está lista.')).not.toBeInTheDocument();expect(create).not.toHaveBeenCalled();
});

it('ofrece cuenta Mercado Pago y abre Wallet Brick sin enviar tarjeta ni crear otra orden', async () => {
 vi.mocked(api.post).mockResolvedValue({data:{data:{preferenceId:'pref-wallet', publicKey:'TEST-public'}}});
 mount(); await waitFor(()=>expect(create).toHaveBeenCalledWith('cardPayment',expect.any(String),expect.anything()));
 fireEvent.click(screen.getByRole('button',{name:'Pagar con mi cuenta de Mercado Pago'}));
 await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.objectContaining({initialization:{preferenceId:'pref-wallet',redirectMode:'blank'}})));
 expect(api.post).toHaveBeenCalledWith('/orders/same-order/mercadopago/wallet', {returnOrigin:window.location.origin});
 expect(screen.getByText(/la misma que usas en Mercado Libre/)).toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Pagar con mi cuenta de Mercado Pago'})).not.toBeInTheDocument();
 expect(settings.callbacks).not.toHaveProperty("onSubmit");
 expect(screen.getByRole("link", {name:"Abrir Mercado Pago en esta pestaña"})).toHaveAttribute("href", "https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-wallet");
 expect(screen.getByRole("link", {name:"Abrir Mercado Pago en esta pestaña"})).not.toHaveAttribute("target");
 expect(api.post).toHaveBeenCalledTimes(1);
});

it('reanuda wallet reservado sin mostrar tarjeta ni crear preferencia nueva', async () => {
 vi.mocked(api.get).mockResolvedValue({data:{data:{...session,canSubmit:false,paymentChoice:'wallet',walletPreferenceId:'existing-pref'}}});
 mount(); await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.objectContaining({initialization:{preferenceId:'existing-pref',redirectMode:'blank'}})));
 expect(api.post).not.toHaveBeenCalled();
 expect(create.mock.calls.some(([kind])=>kind==='cardPayment')).toBe(false);
});

it('no ofrece cambiar de método con un pago de tarjeta en proceso', async () => {
 vi.mocked(api.get).mockResolvedValue({data:{data:{...session,canSubmit:false,payment:{status:'in_process',paymentId:'existing'}}}});
 mount(); await screen.findByText('Estamos verificando el pago. No vuelvas a pagar esta orden.');
 expect(screen.queryByRole('button',{name:'Pagar con mi cuenta de Mercado Pago'})).not.toBeInTheDocument();
 expect(create).not.toHaveBeenCalled();
});

it('bloquea doble elección y permite recuperar preferencia tras error', async () => {
 let reject!: (error:Error)=>void;
 vi.mocked(api.post).mockImplementationOnce(()=>new Promise((_resolve,rej)=>{reject=rej;}));
 mount(); await waitFor(()=>expect(create).toHaveBeenCalled());
 const button=screen.getByRole('button',{name:'Pagar con mi cuenta de Mercado Pago'});
 fireEvent.click(button); fireEvent.click(button);
 expect(api.post).toHaveBeenCalledTimes(1);
 await act(async()=>reject(new Error('timeout')));
 expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos preparar');
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:{preferenceId:'recovered',publicKey:'TEST-public'}}});
 fireEvent.click(screen.getByRole('button',{name:'Continuar con mi cuenta de Mercado Pago'}));
 await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.objectContaining({initialization:{preferenceId:'recovered',redirectMode:'blank'}})));
 expect(create.mock.calls.filter(([kind])=>kind==='cardPayment')).toHaveLength(1);
});

it('mantiene Wallet al consultar sin pago y al volver detecta aprobación sin ofrecer otro cobro', async () => {
 const walletSession={...session,canSubmit:false,paymentChoice:'wallet',walletAvailable:true,walletPreferenceId:'existing-pref',payment:null};
 vi.mocked(api.get).mockResolvedValue({data:{data:walletSession}});
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:walletSession}});
 mount();await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.anything()));
 fireEvent.focus(window);
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/orders/same-order/card-payment-sync'));
 expect(create).toHaveBeenCalledTimes(1);
 expect(unmount).not.toHaveBeenCalled();
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:{...walletSession,walletPreferenceId:null,walletAvailable:false,orderStatus:'approved',payment:{paymentId:'paid',status:'approved'}}}});
 fireEvent.focus(window);
 expect(await screen.findByText('Pago confirmado. Tu compra está lista.')).toBeInTheDocument();
 await waitFor(()=>expect(unmount).toHaveBeenCalled());
 expect(screen.queryByRole('button',{name:/mi cuenta de Mercado Pago/})).not.toBeInTheDocument();
 expect(create).toHaveBeenCalledTimes(1);
});

it('retira Wallet y acceso alternativo cuando el servidor deja de permitir la preferencia', async () => {
 const walletSession={...session,canSubmit:false,paymentChoice:'wallet',walletAvailable:true,walletPreferenceId:'pref/reserved?1',payment:null};
 vi.mocked(api.get).mockResolvedValue({data:{data:walletSession}});
 mount(); await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.anything()));
 expect(settings.callbacks).not.toHaveProperty('onSubmit');
 expect(screen.getByRole('link',{name:'Abrir Mercado Pago en esta pestaña'})).toHaveAttribute('href','https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref%2Freserved%3F1');
 vi.mocked(api.post).mockResolvedValueOnce({data:{data:{...walletSession,walletAvailable:false,walletPreferenceId:null}}});
 fireEvent.focus(window);
 await waitFor(()=>expect(unmount).toHaveBeenCalled());
 expect(screen.queryByRole('link',{name:'Abrir Mercado Pago en esta pestaña'})).not.toBeInTheDocument();
 expect(create).toHaveBeenCalledTimes(1);
});

it('cambia Wallet a tarjeta una sola vez y espera confirmación del servidor', async () => {
 const walletSession={...session,canSubmit:false,paymentChoice:'wallet',walletAvailable:true,walletPreferenceId:'pref-existing',payment:null};
 vi.mocked(api.get).mockResolvedValueOnce({data:{data:walletSession}}).mockResolvedValue({data:{data:{...session,walletAvailable:true}}});
 let resolve!: (response:unknown)=>void;
 vi.mocked(api.post).mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 mount();await waitFor(()=>expect(create).toHaveBeenCalledWith('wallet',expect.any(String),expect.anything()));
 const button=screen.getByRole('button',{name:'Pagar con tarjeta'});
 fireEvent.click(button);fireEvent.click(button);
 expect(api.post).toHaveBeenCalledTimes(1);
 expect(api.post).toHaveBeenCalledWith('/orders/same-order/mercadopago/use-card');
 expect(screen.getByRole('button',{name:'Preparando tarjeta…'})).toBeDisabled();
 expect(screen.queryByRole('link',{name:'Abrir Mercado Pago en esta pestaña'})).not.toBeInTheDocument();
 expect(create.mock.calls.some(([kind])=>kind==='cardPayment')).toBe(false);
 await act(async()=>resolve({data:{data:{canSubmit:true}}}));
 await waitFor(()=>expect(create).toHaveBeenCalledWith('cardPayment',expect.any(String),expect.anything()));
 expect(settings.callbacks.onSubmit).toBeTypeOf('function');
 expect(screen.getByRole('button',{name:'Pagar con mi cuenta de Mercado Pago'})).toBeInTheDocument();
});

it('conserva Wallet y muestra el error del servidor si no permite cambiar a tarjeta', async () => {
 vi.mocked(api.get).mockResolvedValue({data:{data:{...session,canSubmit:false,paymentChoice:'wallet',walletAvailable:true,walletPreferenceId:'pref-existing',payment:null}}});
 vi.mocked(api.post).mockRejectedValueOnce({response:{data:{message:'El pago ya está en proceso.'}}});
 mount();await waitFor(()=>expect(create).toHaveBeenCalled());
 fireEvent.click(screen.getByRole('button',{name:'Pagar con tarjeta'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('El pago ya está en proceso.');
 expect(await screen.findByRole('link',{name:'Abrir Mercado Pago en esta pestaña'})).toHaveAttribute('href','https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=pref-existing');
 expect(create.mock.calls.some(([kind])=>kind==='cardPayment')).toBe(false);
});

it('descarta consulta Wallet anterior al cambio y vuelve a consultar tarjeta', async () => {
 const walletSession={...session,canSubmit:false,paymentChoice:'wallet',walletAvailable:true,walletPreferenceId:'pref-old',payment:null};
 vi.mocked(api.get).mockResolvedValueOnce({data:{data:walletSession}}).mockResolvedValue({data:{data:session}});
 let oldSync!: (response:unknown)=>void;
 vi.mocked(api.post).mockImplementation(async(url)=>{
  if(url.endsWith('card-payment-sync')) return new Promise(r=>{oldSync=r;});
  return {data:{data:{canSubmit:true}}};
 });
 mount();await waitFor(()=>expect(create).toHaveBeenCalled());
 fireEvent.focus(window);await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/orders/same-order/card-payment-sync'));
 fireEvent.click(screen.getByRole('button',{name:'Pagar con tarjeta'}));
 await waitFor(()=>expect(screen.getByText('Consultando tu orden…')).toBeInTheDocument());
 await act(async()=>oldSync({data:{data:walletSession}}));
 await waitFor(()=>expect(create).toHaveBeenCalledWith('cardPayment',expect.any(String),expect.anything()));
 expect(screen.queryByRole('link',{name:'Abrir Mercado Pago en esta pestaña'})).not.toBeInTheDocument();
 expect(create.mock.calls.filter(([kind])=>kind==='wallet')).toHaveLength(1);
});

it('solo una señal del origen y orden correctos consulta el servidor, nunca acepta status del mensaje', async () => {
 vi.spyOn(window,'focus').mockImplementation(()=>{});
 const orderId='a4163ece-8589-431d-9e7e-e6399e44e844';
 vi.mocked(api.get).mockResolvedValue({data:{data:{...session,orderId}}});
 renderPage(<EmbeddedCardPayment orderId={orderId} onClose={()=>{}}/>,'/app/checkout');
 await waitFor(()=>expect(create).toHaveBeenCalled());
 const message={type:'hive-payment-return',orderId,status:'approved'};
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.test',data:message})));
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,data:{...message,orderId:'another'}})));
 expect(api.get).toHaveBeenCalledTimes(1);
 await act(async()=>window.dispatchEvent(new MessageEvent('message',{origin:window.location.origin,data:message})));
 await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));
 expect(screen.queryByText('Pago confirmado. Tu compra está lista.')).not.toBeInTheDocument();
});
