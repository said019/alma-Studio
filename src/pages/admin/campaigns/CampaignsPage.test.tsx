import {describe,it,expect,vi} from 'vitest';
import {screen,fireEvent} from '@testing-library/react';
import {renderAdmin,loginAs} from '@/test/admin-harness';
import CampaignsPage from './CampaignsPage';
vi.mock('@/lib/api',()=>({default:{get:vi.fn(async()=>({data:{data:{count:3}}})),post:vi.fn()}}));
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
