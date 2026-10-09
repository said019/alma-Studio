import {render,screen,waitFor,act} from '@testing-library/react';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import api from '@/lib/api';
import {rememberPayment,pendingPayment} from '@/lib/paymentReturn';
import {PendingPaymentRecovery} from './PendingPaymentRecovery';
const state=vi.hoisted(()=>({user:{id:'own-user'},sessionCheck:'ok'}));
vi.mock('@/stores/authStore',()=>({useAuthStore:Object.assign((select:any)=>select(state),{getState:()=>state})}));
vi.mock('@/lib/api',()=>({default:{get:vi.fn()}}));
const id='a4163ece-8589-431d-9e7e-e6399e44e844';
const Location=()=> <p>{useLocation().pathname}</p>;
const mount=()=>render(<MemoryRouter initialEntries={['/app']}><PendingPaymentRecovery/><Location/></MemoryRouter>);
beforeEach(()=>{localStorage.clear();state.user={id:'own-user'};state.sessionCheck='ok';vi.mocked(api.get).mockReset();vi.spyOn(window,'matchMedia').mockReturnValue({matches:true} as MediaQueryList);});
afterEach(()=>vi.restoreAllMocks());
it('opens recovered order only after authenticated ownership endpoint confirms',async()=>{
 let resolve!:(value:unknown)=>void;vi.mocked(api.get).mockImplementation(()=>new Promise(r=>{resolve=r;}));
 rememberPayment(id,'own-user');mount();expect(screen.getByText('/app')).toBeInTheDocument();
 expect(api.get).toHaveBeenCalledWith(`/orders/${id}`);
 await act(async()=>resolve({data:{id,status:'pending_payment'}}));
 await screen.findByText(`/app/orders/${id}`);
 expect(pendingPayment("own-user")).toBe(id);
});
it('never opens another user marker or a rejected ownership lookup',async()=>{
 rememberPayment(id,'other-user');const view=mount();expect(api.get).not.toHaveBeenCalled();view.unmount();
 rememberPayment(id,'own-user');vi.mocked(api.get).mockRejectedValue({response:{status:404}});mount();
 await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(1));expect(screen.getByText('/app')).toBeInTheDocument();
});
it('does not navigate if account changes during lookup',async()=>{
 let resolve!:(value:unknown)=>void;vi.mocked(api.get).mockImplementation(()=>new Promise(r=>{resolve=r;}));rememberPayment(id,'own-user');mount();
 state.user={id:'another-user'};await act(async()=>resolve({data:{id}}));expect(screen.getByText('/app')).toBeInTheDocument();
});
it('keeps pending order on network failure and clears only authenticated terminal status',async()=>{
 rememberPayment(id,'own-user');vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));const view=mount();
 await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(1));expect(pendingPayment('own-user')).toBe(id);view.unmount();
 vi.mocked(api.get).mockResolvedValueOnce({data:{data:{id,status:'approved'}}});mount();
 await screen.findByText(`/app/orders/${id}`);expect(pendingPayment('own-user')).toBeNull();
});
it('does not erase pending marker on stale unauthorized response from former account',async()=>{
 let reject!:(error:unknown)=>void;vi.mocked(api.get).mockImplementation(()=>new Promise((_r,rej)=>{reject=rej;}));rememberPayment(id,'own-user');mount();
 state.user={id:'another-user'};await act(async()=>reject({response:{status:401}}));expect(pendingPayment('own-user')).toBe(id);
});
