import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import api from '@/lib/api';
import { renderPage, respuestas } from '@/test/renderPage';
import { normalizePlanRules } from '@/lib/planConditions';
import BookClasses from './BookClasses';
vi.mock('@/lib/api',()=>({default:{get:vi.fn()}}));
vi.mock('@/components/layout/ClientAuthGuard',()=>({ClientAuthGuard:({children}:any)=><>{children}</>}));
Element.prototype.scrollTo=()=>{};
const special={id:'special',status:'active',classCategory:'reformer_tower',rules:normalizePlanRules({allowed_weekdays:[1,2,3,4,5],booking_start_time:'11:00',booking_end_time:'16:00'}),classesRemaining:1};
const session={id:'c1',start_time:'2026-10-02T18:00:00',end_time:'2026-10-02T18:50:00',class_type_name:'Clase HIVE',class_category:'reformer_tower',max_capacity:6,current_bookings:0};
beforeEach(()=>{vi.useFakeTimers({now:new Date(2026,9,2,10),toFake:['Date']});});
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
function setup(memberships:any[]){
  vi.mocked(api.get).mockImplementation(respuestas({'/classes':{data:[session]},'/memberships/my':{data:special},'/memberships/mine/all':{data:memberships},'/bookings/my-bookings':{data:[]}}) as never);
  renderPage(<BookClasses/>,'/app/classes');
}
it('explica y deshabilita clases fuera del horario comprado',async()=>{
  setup([special]);
  expect((await screen.findAllByText('Horario fuera de tu plan')).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button',{name:/Reservar$/})).not.toBeInTheDocument();
});
it('permite otro paquete compatible y usa categoría explícita aunque nombre no diga Reformer',async()=>{
  setup([special,{id:'annual',status:'active',classCategory:'reformer_tower',rules:normalizePlanRules({daily_class_limit:2}),classesRemaining:null}]);
  const buttons=await screen.findAllByRole('button',{name:/Reservar$/});
  expect(buttons.length).toBeGreaterThan(0);
  for(const button of buttons) expect(button).not.toBeDisabled();
});
