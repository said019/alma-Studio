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
