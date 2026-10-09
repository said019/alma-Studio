import {beforeEach,describe,expect,it,vi} from 'vitest';
import {manualSaleKey,completeManualSale} from './manual-sale-intent';
beforeEach(()=>{completeManualSale();vi.restoreAllMocks();});
describe('manual sale intentions',()=>{
 it('retries keep key; completed/new payload can make a legitimate new purchase',()=>{
  const payload={userId:'a',planId:'b',amount:100};const first=manualSaleKey(payload);
  expect(manualSaleKey({...payload})).toBe(first);
  completeManualSale();expect(manualSaleKey(payload)).not.toBe(first);
  expect(manualSaleKey({...payload,amount:200})).not.toBe(first);
 });
 it('blocked storage still deduplicates within the page',()=>{
  vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
  const first=manualSaleKey({amount:100});expect(manualSaleKey({amount:100})).toBe(first);
 });
});
