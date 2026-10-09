import {describe,it,expect,vi,beforeEach} from 'vitest';
import {screen,fireEvent,waitFor,act} from '@testing-library/react';
import {renderAdmin,loginAs} from '@/test/admin-harness';
import CampaignsPage from './CampaignsPage';
vi.mock('@/lib/api',()=>({default:{get:vi.fn(async()=>({data:{data:{count:3}}})),post:vi.fn()}}));
beforeEach(()=>{vi.mocked(api.get).mockImplementation(async(url:any)=>({data:{data:url==='/admin/broadcast/campaigns'?[]:{count:3}}}) as any);vi.mocked(api.post).mockReset();});
describe('campañas por correo',()=>{
 it('abre correo sin ofrecer WhatsApp',async()=>{
  loginAs('admin');renderAdmin(<CampaignsPage/>,{route:'/admin/campaigns'});
  fireEvent.click(await screen.findByRole('button',{name:'Nueva campaña por correo'}));
  expect(await screen.findByRole('tab',{name:'Email'})).toBeInTheDocument();
  expect(screen.queryByRole('tab',{name:'WhatsApp'})).toBeNull();
  expect(screen.queryByText('Campañas WhatsApp')).toBeNull();
 });
});

import api from '@/lib/api';
it('muestra destinatarios privados y pagina las incidencias con identificador del proveedor',async()=>{
 vi.mocked(api.get).mockImplementation(async(url:any)=>{
  if(url.includes('/campaigns/c1?'))return {data:{data:{deliveries:[url.includes('offset=100')?{id:'d2',recipient:'second@example.invalid',status:'accepted',attempts:1,provider_id:'provider2'}:{id:'d1',recipient:'first@example.invalid',status:'needs_review',attempts:5,last_error:'Verificar en el proveedor'}],pagination:{total:101,hasMore:!url.includes('offset=100')}}}} as any;
  if(url==='/admin/broadcast/campaigns')return {data:{data:[{id:'c1',subject:'Promoción',accepted:100,pending:0,skipped:0,needs_review:1}]}} as any;
  return {data:{data:{count:3}}} as any;
 });
 loginAs('admin');renderAdmin(<CampaignsPage/>,{route:'/admin/campaigns'});
 fireEvent.click(await screen.findByRole('button',{name:'Ver destinatarios'}));
 expect(await screen.findByText('first@example.invalid')).toBeInTheDocument();
 expect(screen.getByText('Verificar en el proveedor')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Siguiente'}));
 expect(await screen.findByText('second@example.invalid')).toBeInTheDocument();
 expect(screen.getByText('Identificador del proveedor: provider2')).toBeInTheDocument();
 expect(screen.getByRole('button',{name:'Siguiente'})).toBeDisabled();
});
it('distingue carga del historial vacío y permite crear primera campaña',async()=>{
 let resolve!:(value:any)=>void;
 vi.mocked(api.get).mockImplementation(async(url:any)=>url==='/admin/broadcast/campaigns'?new Promise(r=>{resolve=r;}):{data:{data:{count:3}}});
 loginAs('admin');renderAdmin(<CampaignsPage/>,{route:'/admin/campaigns'});
 expect(await screen.findByText('Cargando campañas…')).toBeInTheDocument();
 expect(screen.queryByText('Tu primera campaña empieza aquí')).not.toBeInTheDocument();
 await act(async()=>resolve({data:{data:[]}}));
 fireEvent.click(await screen.findByRole('button',{name:'Crear primera campaña'}));
 expect(await screen.findByRole('dialog')).toHaveAccessibleName('Nueva campaña por correo');
 expect(screen.getByLabelText('Destinatarios')).toBeInTheDocument();
 expect(screen.getByLabelText('Asunto')).toBeInTheDocument();
 expect(screen.getByLabelText('Mensaje')).toBeInTheDocument();
});
it('muestra error de historial y permite reintentar sin aparentar un historial vacío',async()=>{
 vi.mocked(api.get).mockImplementation(async(url:any)=>{if(url==='/admin/broadcast/campaigns')throw new Error('offline');return {data:{data:{count:3}}};});
 loginAs('admin');renderAdmin(<CampaignsPage/>,{route:'/admin/campaigns'});
 expect(await screen.findByText('No se pudo cargar el historial.')).toBeInTheDocument();
 expect(screen.queryByText('Tu primera campaña empieza aquí')).not.toBeInTheDocument();
 vi.mocked(api.get).mockResolvedValue({data:{data:[]}} as any);
 fireEvent.click(screen.getByRole('button',{name:'Reintentar historial'}));
 expect(await screen.findByText('Tu primera campaña empieza aquí')).toBeInTheDocument();
});
it('mantiene revisión antes de enviar y bloquea si no puede contar audiencia',async()=>{
 loginAs('admin');renderAdmin(<CampaignsPage/>,{route:'/admin/campaigns'});
 fireEvent.click(await screen.findByRole('button',{name:'Nueva campaña por correo'}));
 const send=await screen.findByRole('button',{name:'Enviar'});await waitFor(()=>expect(send).toBeEnabled());
 fireEvent.click(send);expect(api.post).not.toHaveBeenCalled();
 expect(screen.getByRole('button',{name:'Confirmar y enviar a 3'})).toBeInTheDocument();
 vi.mocked(api.get).mockRejectedValue(new Error('offline'));
 fireEvent.change(screen.getByLabelText('Destinatarios'),{target:{value:'with_active_membership'}});
 expect(await screen.findByText(/No se pudo contar a los destinatarios/)).toBeInTheDocument();
 expect(screen.getByRole('button',{name:/Confirmar y enviar/})).toBeDisabled();
 expect(api.post).not.toHaveBeenCalled();
});
