import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("@/components/app/SignaturePad", () => ({ SignaturePad: () => <div aria-label="Firma manuscrita" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import PaymentsPage from "./PaymentsPage";
import PaymentsHistoryPage from "./PaymentsHistory";
import { loginAs, renderAdmin, routeApi } from "@/test/admin-harness";

const mockApi = api as unknown as { get: Mock; post: Mock };
const CAMILA = { id: "u1", displayName: "Camila Torres", email: "camila@correo.com", phone: "5512345678" };

function tabla() {
  return {
    "/admin/stats": { pendingAlerts: 3 },
    "/plans": { data: [
      { id: "p8", name: "Paquete 8 clases", price: 1450, classLimit: 8, durationDays: 30, classCategory: "studio", isActive: true },
      { id: "pu", name: "Ilimitado mensual", price: 2680, classLimit: null, durationDays: 30, classCategory: "reformer_tower", isActive: true },
    ] },
    "/users?search=cam": { data: [CAMILA] },
    "/users/u1": { data: CAMILA },
    "/users/zzz": Object.assign(new Error("404"), { response: { status: 404, data: {} } }),
    "/payments": { data: [
      { id: "y1", userName: "Camila Torres", createdAt: "2026-09-25T10:18:00", method: "transfer", total_amount: 1450 },
      { id: "y2", userName: "Isabel Rojas", createdAt: "2026-09-15T08:05:00", method: "cash", total_amount: 780 },
    ] },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 25, 10, 40));
  mockApi.get.mockReset();
  mockApi.post.mockReset().mockResolvedValue({ data: {} });
  routeApi(mockApi, tabla());
});
afterEach(() => vi.useRealTimers());

describe('Auditoría reintento de venta',()=>{
 it('bloquea durante pending pero respuesta perdida permite enviar idéntica intención con la misma clave',async()=>{
 loginAs('admin');let rejectRequest:any;
 mockApi.post.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectRequest=reject;}));
 renderAdmin(<PaymentsPage/>,{route:'/admin/payments'});
 fireEvent.change(screen.getByRole('combobox',{name:'Buscar usuario para cobrar'}),{target:{value:'cam'}});
 fireEvent.click(await screen.findByRole('option',{name:/Camila Torres/}));
 fireEvent.click(await screen.findByRole('radio',{name:/Paquete 8 clases/}));
 fireEvent.click(screen.getByRole('button',{name:'Confirmar y activar membresía'}));
 await waitFor(()=>expect(mockApi.post).toHaveBeenCalledTimes(1));
 expect(screen.getByRole('button',{name:'Activando…'})).toBeDisabled();
 const first=mockApi.post.mock.calls[0];rejectRequest(new Error('Respuesta perdida después de commit simulado'));
 const button=await screen.findByRole('button',{name:'Confirmar y activar membresía'});
 await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
 await waitFor(()=>expect(mockApi.post).toHaveBeenCalledTimes(2));
 expect(mockApi.post.mock.calls[1]).toEqual(first);expect(first).toHaveLength(2);expect(first[1].idempotencyKey).toEqual(expect.any(String));
 });
 it('historial real usa agregados completos y pagina200 filas',async()=>{
 loginAs('admin');const rows=Array.from({length:200},(_,i)=>({id:'audit'+i,userName:'Audit'+i,createdAt:'2026-09-25T09:00:00',method:'cash',total_amount:10,source:'order'}));
 routeApi(mockApi,{...tabla(),'/payments':{data:rows,total:2010,summary:{week:{amount:2010,count:201},month:{amount:2010,count:201},refunds:{amount:0,count:0},byMethod:{cash:2010}},pagination:{limit:200,offset:0,totalCount:201,hasMore:true}},'/payments?offset=200':{data:[{...rows[0],id:'last',userName:'Last movement'}],summary:{week:{amount:2010,count:201},month:{amount:2010,count:201},refunds:{amount:0,count:0},byMethod:{cash:2010}},pagination:{limit:200,offset:200,totalCount:201,hasMore:false}}});
 renderAdmin(<PaymentsHistoryPage/>,{route:'/admin/payments/historial'});
 await screen.findByText('Audit199');expect(screen.getAllByText('$2,010').length).toBeGreaterThan(0);
 expect(screen.queryByText('$2,000')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
 await screen.findByText('Last movement');expect(screen.getByRole('button',{name:'Siguiente'})).toBeDisabled();
 expect(screen.getAllByText('$2,010').length).toBeGreaterThan(0);
 expect(mockApi.get.mock.calls.filter(([p])=>p==='/payments')).toHaveLength(1);
 });
});
