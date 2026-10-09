import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { isPaymentReturn, notifyPaymentReturn, pendingPayment, rememberPayment, PAYMENT_RETURN_CHANNEL } from './paymentReturn';
const id='a4163ece-8589-431d-9e7e-e6399e44e844';
beforeEach(()=>localStorage.clear());afterEach(()=>vi.restoreAllMocks());
it('recovers only same user order and expires without extending on repeated polls',()=>{
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
 rememberPayment(id,'user-a');expect(pendingPayment('user-a')).toBe(id);expect(pendingPayment('user-b')).toBeNull();
 vi.mocked(Date.now).mockReturnValue(now+60*60*1000);rememberPayment(id,'user-a');
 vi.mocked(Date.now).mockReturnValue(now+2*60*60*1000+1);expect(pendingPayment('user-a')).toBeNull();
});
it('blocked storage and absent opener do not break checkout',()=>{
 vi.spyOn(localStorage,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 expect(()=>rememberPayment(id,'user')).not.toThrow();expect(pendingPayment('user')).toBeNull();
 expect(()=>notifyPaymentReturn(id)).not.toThrow();
});
it('message status cannot prove success and other order cannot refresh',()=>{
 expect(isPaymentReturn({type:PAYMENT_RETURN_CHANNEL,orderId:id,status:'approved'},id)).toBe(true);
 expect(isPaymentReturn({type:PAYMENT_RETURN_CHANNEL,orderId:'other',status:'approved'},id)).toBe(false);
 expect(isPaymentReturn({type:'approved',orderId:id},id)).toBe(false);
});
it('keeps separate orders, picks latest and repairs malformed or expired markers',()=>{
 const other='b4163ece-8589-431d-9e7e-e6399e44e844';
 const now=Date.now();vi.spyOn(Date,'now').mockReturnValue(now);
 localStorage.setItem('hive-pending-payment','{broken');rememberPayment(id,'user');expect(pendingPayment('user')).toBe(id);
 vi.mocked(Date.now).mockReturnValue(now+1);rememberPayment(other,'user');expect(pendingPayment('user')).toBe(other);
 expect(JSON.parse(localStorage.getItem('hive-pending-payment')!)).toHaveLength(2);
 vi.mocked(Date.now).mockReturnValue(now+3*60*60*1000);rememberPayment(id,'user');expect(pendingPayment('user')).toBe(id);
 expect(JSON.parse(localStorage.getItem('hive-pending-payment')!)).toHaveLength(1);
});
