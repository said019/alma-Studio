import {waLink} from './phone';
import {describe,it,expect} from 'vitest';
import {internationalPhone,phoneCountries} from './internationalPhone';
describe('registro internacional',()=>{
 it('normaliza números locales según el país',()=>{
  expect(internationalPhone('5512345678','MX')).toBe('+525512345678');
  expect(internationalPhone('2025550123','US')).toBe('+12025550123');
  expect(internationalPhone('612345678','ES')).toBe('+34612345678');
  expect(internationalPhone('07911 123456','GB')).toBe('+447911123456');
 });
 it('no duplica ladas al pegar un número internacional',()=>{
  expect(internationalPhone('+34 612 345 678','MX')).toBe('+34612345678');
 });
 it('rechaza números incompletos y ofrece el catálogo de países',()=>{
  expect(internationalPhone('123','MX')).toBeNull();
  expect(phoneCountries.length).toBeGreaterThan(200);
  expect(waLink('+45 32123456')).toBe('https://wa.me/4532123456');
 });
});
