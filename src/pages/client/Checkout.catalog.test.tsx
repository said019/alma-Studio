import { beforeEach, expect, it, vi, type Mock } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderAdmin, routeApi } from '@/test/admin-harness';
import { useAuthStore } from '@/stores/authStore';
import { CATALOG_PLANS } from '../../../server/lib/catalog.js';
vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from '@/lib/api';
import Checkout from './Checkout';
const plans = CATALOG_PLANS.map((p, i) => ({...p, id:String(i), isActive:true, sortOrder:p.sort_order, classLimit:p.class_limit, durationDays:p.duration_days, personalOnly:p.personal_only, afternoonOnly:p.afternoon_only, effectivePrice:p.opening_price ?? p.price, openingActive:p.opening_price != null}));
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class { observe(){} disconnect(){} unobserve(){} });
  useAuthStore.setState({user:{id:'test-client',role:'client',displayName:'Cliente'} as never,token:'test',isAuthenticated:true});
  routeApi(api as unknown as {get:Mock}, {'/plans':{data:[...plans].reverse()}});
});
it('muestra las nueve ofertas HIVE en el orden del folleto y sin modalidades heredadas', async () => {
  await renderAdmin(<Checkout/>,{route:'/app/checkout'});
  const sessions = await screen.findByRole('region',{name:'Sesiones de Pilates Reformer'});
  expect(within(sessions).getAllByRole('heading',{level:3}).map(h=>h.textContent)).toEqual(['1 Clase','4 Clases','10 Clases','20 Clases']);
  expect(screen.getAllByRole('heading',{level:3})).toHaveLength(9);
  expect(screen.queryByRole('tab',{name:'Reformer/Tower'})).toBeNull();
  expect(screen.queryByText('Ilimitado')).toBeNull();
  for(const [name,price,regular] of [['1 Clase','290.00','330.00'],['4 Clases','1,080.00','1,200.00'],['10 Clases','2,200.00','2,700.00'],['20 Clases','4,000.00','4,400.00'],['Plan mensual','4,200.00','4,800.00'],['Plan anual / pago mensual','3,900.00','4,200.00'],['Horario especial','250.00',null],['Promo estudiante','250.00',null],['Personalizado','500.00',null]]) {
    const card=screen.getByRole('heading',{name,level:3}).closest('button')!;
    expect(card).toHaveTextContent('$'+price.replace('.00',''));
    if(regular) expect(card).toHaveTextContent('Regular $'+regular.replace('.00',''));
  }
  const annual=screen.getByRole('heading',{name:'Plan anual / pago mensual',level:3}).closest('button')!;
  for(const value of ['2 sesiones por día','2 guest pass por mes','1 café regular de cortesía por día','Compromiso de 12 meses','por mes']) expect(annual).toHaveTextContent(value);
  expect(screen.getByRole('heading',{name:'20 Clases'}).closest('button')).toHaveTextContent('60 días naturales desde la compra');
  expect(screen.getByRole('heading',{name:'Promo estudiante'}).closest('button')).toHaveTextContent('Requiere credencial de estudiante vigente');
  const special=screen.getByRole('heading',{name:'Horario especial'}).closest('button')!;
  expect(special).toHaveTextContent('De lunes a viernes');expect(special).toHaveTextContent('11:00 a 16:00');
  fireEvent.click(screen.getByRole('heading',{name:'10 Clases'}).closest('button')!);
  expect(screen.getByRole('button',{name:'Continuar a pago'})).toBeEnabled();
});
