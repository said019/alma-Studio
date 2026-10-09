import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { clearPendingPayment, pendingPayment } from '@/lib/paymentReturn';
export function PendingPaymentRecovery() {
  const resumed=useRef(new Set<string>());
  const {pathname}=useLocation();
  const navigate=useNavigate();
  const user=useAuthStore(s=>s.user);
  const sessionCheck=useAuthStore(s=>s.sessionCheck);
  useEffect(()=>{
    if(pathname!=='/app'||!user?.id||sessionCheck!=='ok') return;
    let active=true, busy=false;
    const resume=async()=>{
      const standalone=window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & {standalone?:boolean}).standalone;
      if(!standalone||document.hidden||busy) return;
      const orderId=pendingPayment(user.id);if(!orderId||resumed.current.has(`${user.id}:${orderId}`)) return;
      busy=true;
      try {
        // The authenticated endpoint checks ownership; a marker alone grants no access.
        const response=await api.get(`/orders/${orderId}`);
        const order=response.data?.data??response.data;
        if(active&&useAuthStore.getState().user?.id===user.id&&useAuthStore.getState().sessionCheck==='ok') {
          if(["approved","cancelled","expired","rejected"].includes(order?.status)) clearPendingPayment(orderId);
          resumed.current.add(`${user.id}:${orderId}`);
          navigate(`/app/orders/${orderId}`,{replace:true});
        }
      } catch(e:any) { if(active&&useAuthStore.getState().user?.id===user.id&&useAuthStore.getState().sessionCheck==='ok'&&[403,404].includes(e?.response?.status)) clearPendingPayment(orderId); }
      finally {busy=false;}
    };
    void resume();window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return ()=>{active=false;window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[pathname,user?.id,sessionCheck,navigate]);
  return null;
}
