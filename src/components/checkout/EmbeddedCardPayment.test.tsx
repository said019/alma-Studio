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
 it('carga campos hospedados sin popup y envía solo token; un doble submit produce un solo intento',async()=>{
  vi.mocked(api.post).mockImplementation(async(url)=>({data:{data:url.endsWith('card-payment')?{paymentId:'pay1',status:'in_process'}:{...session,canSubmit:false,payment:{paymentId:'pay1',status:'in_process'}}}}));
  mount();await waitFor(()=>expect(create).toHaveBeenCalled());
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
