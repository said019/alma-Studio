import {render,screen} from '@testing-library/react';
import {MemoryRouter,Route,Routes} from 'react-router-dom';
import {expect,it,vi} from 'vitest';
import PaymentReturn from './PaymentReturn';
vi.mock('@/lib/paymentReturn',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/paymentReturn')>(),notifyPaymentReturn:vi.fn()}));
it('ignores fake success query and provides an ordinary HIVE return without requiring opener',()=>{
 const id='a4163ece-8589-431d-9e7e-e6399e44e844';
 render(<MemoryRouter initialEntries={[`/app/payment-return/${id}?status=approved&collection_status=approved`]}><Routes><Route path="/app/payment-return/:orderId" element={<PaymentReturn/>}/></Routes></MemoryRouter>);
 expect(screen.getByText(/Esta pantalla no confirma/)).toBeInTheDocument();
 expect(screen.getByRole('link',{name:'Volver a HIVE'})).toHaveAttribute('href',`/app/orders/${id}`);
 expect(screen.queryByText('Pago confirmado')).not.toBeInTheDocument();
});
