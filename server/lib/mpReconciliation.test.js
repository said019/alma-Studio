import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchOrderPayments,canonicalPayment} from './mpReconciliation.js';
const oid='order';
const payments=Array.from({length:51},(_,i)=>({id:String(100+i),external_reference:oid,status:i===50?'approved':'rejected',date_created:'2026-10-08T12:00:00Z'}));
test('search reads all51 payments in pages capped at50',async()=>{
 const offsets=[];
 const found=await searchOrderPayments(async path=>{const q=new URL('https://test'+path).searchParams;assert.equal(q.get('limit'),'50');const offset=Number(q.get('offset'));offsets.push(offset);return {results:payments.slice(offset,offset+50),paging:{total:51}};},oid);
 assert.deepEqual(offsets,[0,50]);assert.equal(found.length,51);assert.equal(canonicalPayment(found).id,'150');
});
test('repeated last page and incomplete page fail closed',async()=>{
 await assert.rejects(()=>searchOrderPayments(async()=>({results:payments.slice(0,50),paging:{total:51}}),oid));
 await assert.rejects(()=>searchOrderPayments(async()=>({results:payments.slice(0,2),paging:{total:51}}),oid));
});
test('canonical remains stable with extras and deterministic across response ordering',()=>{
 assert.equal(canonicalPayment(payments,'100').id,'100');
 assert.equal(canonicalPayment([...payments].reverse()).id,'150');
 assert.equal(canonicalPayment(payments,'999'),null);
});
