import { beforeEach, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdmin, routeApi } from '@/test/admin-harness';
import { useAuthStore } from '@/stores/authStore';
vi.mock('@/lib/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
vi.mock('@/components/checkout/EmbeddedCardPayment',()=>({EmbeddedCardPayment:({orderId}:any)=><section aria-label="Tarjeta incrustada">Orden {orderId}</section>}));
import api from '@/lib/api';
import Checkout from './Checkout';
import OrderDetail from './OrderDetail';
const mock=api as unknown as {get:Mock;post:Mock};
const plan={id:'four',name:'4 Clases',price:1200,duration_days:30,class_limit:4,class_category:'reformer_tower'};
beforeEach(()=>{vi.stubGlobal('IntersectionObserver',class{observe(){}disconnect(){}unobserve(){}});mock.get.mockReset();mock.post.mockReset();useAuthStore.setState({user:{id:'client',role:'client',displayName:'QA',email:'qa@example.test'} as never,token:'test',isAuthenticated:true});});
async function choose(){renderAdmin(<Checkout/>,{route:'/app/checkout'});fireEvent.click((await screen.findByRole('heading',{name:'4 Clases'})).closest('button')!);fireEvent.click(screen.getByRole('button',{name:'Continuar a pago'}));}
it('crea una orden y abre tarjeta dentro del checkout',async()=>{
 routeApi(mock,{'/plans':{data:[plan]},'/payments/card-readiness':{data:{ready:true,provider:'mercadopago',recurringSupported:false}}});mock.post.mockResolvedValue({data:{data:{id:'same-order',mp_checkout_mode:'embedded',payment_provider:'mercadopago'}}});
 await choose();fireEvent.click(await screen.findByRole('radio',{name:/Tarjeta/}));fireEvent.click(screen.getByRole('button',{name:'Pagar con Mercado Pago'}));
 expect(await screen.findByRole('region',{name:'Tarjeta incrustada'})).toHaveTextContent('same-order');expect(mock.post).toHaveBeenCalledTimes(1);expect(mock.post).toHaveBeenCalledWith('/orders',{planId:'four',discountCode:undefined,paymentMethod:'card'});
});
it('no ofrece tarjeta operativa cuando Mercado Pago no está configurado',async()=>{
 routeApi(mock,{'/plans':{data:[plan]},'/payments/card-readiness':{data:{ready:false,message:'El estudio está habilitando los pagos con tarjeta.'}}});await choose();
 expect(await screen.findByRole('radio',{name:/Tarjeta/})).toBeDisabled();expect(screen.getByText('El estudio está habilitando los pagos con tarjeta.')).toBeInTheDocument();expect(mock.post).not.toHaveBeenCalled();
});
it('Mis órdenes retoma la misma orden Mercado Pago sin crear otra',async()=>{
 routeApi(mock,{'/orders/existing':{data:{id:'existing',plan_name:'4 Clases',status:'pending_payment',total_amount:1200,currency:'MXN',payment_method:'card',payment_provider:'mercadopago'}},'/payments/card-readiness':{data:{ready:true}}});
 renderAdmin(<OrderDetail/>,{route:'/app/orders/existing',path:'/app/orders/:orderId'});
 expect(await screen.findByRole('region',{name:'Tarjeta incrustada'})).toHaveTextContent('existing');expect(mock.post).not.toHaveBeenCalled();expect(screen.queryByText('Subir comprobante')).not.toBeInTheDocument();
});
it('convertir transferencia usa pay-with-card de la misma orden',async()=>{
 routeApi(mock,{'/orders/existing':{data:{id:'existing',plan_name:'4 Clases',status:'pending_payment',total_amount:1200,currency:'MXN',payment_method:'transfer'}},'/payments/card-readiness':{data:{ready:true}}});mock.post.mockResolvedValue({data:{data:{id:'existing',mp_checkout_mode:'embedded'}}});
 renderAdmin(<OrderDetail/>,{route:'/app/orders/existing',path:'/app/orders/:orderId'});fireEvent.click(await screen.findByRole('button',{name:'Pagar esta orden con tarjeta'}));
 expect(await screen.findByRole('region',{name:'Tarjeta incrustada'})).toHaveTextContent('existing');await waitFor(()=>expect(mock.post).toHaveBeenCalledWith('/orders/existing/pay-with-card'));expect(mock.post).not.toHaveBeenCalledWith('/orders',expect.anything());
});

it('un reembolso no se presenta como membresía activa',async()=>{
 routeApi(mock,{'/orders/existing':{data:{id:'existing',plan_name:'4 Clases',status:'approved',total_amount:1200,currency:'MXN',payment_method:'card',payment_provider:'mercadopago',mp_payment_status:'refunded',refund_status:'refunded',refunded_amount:1200}}});
 renderAdmin(<OrderDetail/>,{route:'/app/orders/existing',path:'/app/orders/:orderId'});
 expect(await screen.findByText('Reembolsado')).toBeInTheDocument();expect(screen.queryByText('Aprobado · membresía activa')).not.toBeInTheDocument();expect(screen.queryByRole('region',{name:'Tarjeta incrustada'})).not.toBeInTheDocument();
});
