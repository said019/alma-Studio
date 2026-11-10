import {beforeEach,describe,it,expect,vi} from 'vitest';
import {fireEvent,screen,waitFor} from '@testing-library/react';
import {renderPage} from '@/test/renderPage';
import {useAuthStore} from '@/stores/authStore';
vi.mock('@/lib/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '@/lib/api';
import Login from './Login';
beforeEach(()=>{useAuthStore.setState({isAuthenticated:false,user:null,error:null,isLoading:false});vi.mocked(api.post).mockReset().mockResolvedValue({data:{user:{id:'u1',role:'client'},token:'t'}} as never);});
function submit(identifier:string){fireEvent.change(screen.getByLabelText('Correo o número de WhatsApp'),{target:{value:identifier}});fireEvent.change(screen.getByLabelText('Contraseña',{selector:'input'}),{target:{value:'Password123'}});}
describe('Acceso por correo o WhatsApp',()=>{
 it('conserva el correo',async()=>{renderPage(<Login/>,'/auth/login');submit('ana@example.com');fireEvent.click(screen.getByRole('button',{name:'Entrar'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/auth/login',{email:'ana@example.com',password:'Password123'}));});
 it('normaliza un teléfono mexicano',async()=>{renderPage(<Login/>,'/auth/login');submit('5512345678');expect(screen.getByLabelText('País del teléfono')).toHaveValue('MX');fireEvent.click(screen.getByRole('button',{name:'Entrar'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/auth/login',{email:'+525512345678',password:'Password123'}));});
 it('respeta otro país',async()=>{renderPage(<Login/>,'/auth/login');submit('4155552671');fireEvent.change(screen.getByLabelText('País del teléfono'),{target:{value:'US'}});fireEvent.click(screen.getByRole('button',{name:'Entrar'}));await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/auth/login',{email:'+14155552671',password:'Password123'}));});
 it('no envía teléfonos incompletos',async()=>{renderPage(<Login/>,'/auth/login');submit('123');fireEvent.click(screen.getByRole('button',{name:'Entrar'}));await screen.findByText(/Escribe un correo válido/);expect(api.post).not.toHaveBeenCalled();});
});
