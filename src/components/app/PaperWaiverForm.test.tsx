import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PaperWaiverForm} from './PaperWaiverForm';
import api from '@/lib/api';
vi.mock('@/lib/api',()=>({default:{post:vi.fn().mockResolvedValue({data:{}})}}));
it('requires attestation and records paper document for the selected client without a digital signature',async()=>{
 const signed=vi.fn();render(<QueryClientProvider client={new QueryClient()}><PaperWaiverForm userId="client-a" name="Ana" onClose={()=>{}} onBack={()=>{}} onSigned={signed}/></QueryClientProvider>);
 const button=screen.getByRole('button',{name:'Registrar documento firmado'});expect(button).toBeDisabled();
 fireEvent.change(screen.getByLabelText('Fecha de firma del documento'),{target:{value:'2026-11-03'}});
 fireEvent.change(screen.getByLabelText('Dónde se conserva el original / folio'),{target:{value:'Carpeta recepción folio 10'}});
 expect(button).toBeDisabled();fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(button);
 await waitFor(()=>expect(signed).toHaveBeenCalled());expect(api.post).toHaveBeenCalledWith('/admin/users/client-a/waiver/paper',{signedOn:'2026-11-03',reference:'Carpeta recepción folio 10',confirmed:true});
});
