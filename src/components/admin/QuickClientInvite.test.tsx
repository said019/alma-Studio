import {it,expect,vi} from 'vitest';import {render,screen,fireEvent} from '@testing-library/react';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {QuickClientInvite} from './QuickClientInvite';import api from '@/lib/api';
vi.mock('@/lib/api',()=>({default:{post:vi.fn().mockResolvedValue({data:{data:{userId:'one',delivery:'manual',link:'https://example.invalid/invite',shareUrl:'https://wa.me/525512345678'}}})}}));
it('creates with name and international phone and clearly reports manual delivery',async()=>{
 render(<QueryClientProvider client={new QueryClient()}><QuickClientInvite/></QueryClientProvider>);fireEvent.click(screen.getByRole('button',{name:'Registrar usuario'}));
 expect(screen.getByRole('button',{name:'Registrar y enviar acceso'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Nombre completo'),{target:{value:'Ana Test'}});fireEvent.change(screen.getByLabelText('Teléfono con WhatsApp'),{target:{value:'5512345678'}});fireEvent.click(screen.getByRole('button',{name:'Registrar y enviar acceso'}));
 expect(await screen.findByText(/WhatsApp automático no está conectado/)).toBeInTheDocument();expect(api.post).toHaveBeenCalledWith('/admin/clients/invite',{displayName:'Ana Test',phone:'+525512345678'});expect(screen.getByRole('link',{name:'Compartir por WhatsApp'})).toHaveAttribute('href','https://wa.me/525512345678');
});
