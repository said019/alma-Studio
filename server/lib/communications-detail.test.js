import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCommunications} from './communications.js';
const id='00000000-0000-4000-8000-000000000001';
function setup(query){
 const routes=new Map();const owner=()=>{};
 const app={get:(path,...handlers)=>routes.set(path,handlers),post:()=>{}};
 registerCommunications(app,{pool:{query},ownerMiddleware:owner});
 const handlers=routes.get('/api/admin/broadcast/campaigns/:id');assert.equal(handlers[0],owner);
 const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
 return {run:(params,query={})=>handlers[1]({params,query},res),res};
}
test('private campaign detail validates ID and returns404 without delivery lookup',async()=>{
 let queries=0;const api=setup(async()=>{queries++;return {rows:[]};});
 await api.run({id:'bad'});assert.equal(api.res.statusCode,400);assert.equal(queries,0);
 await api.run({id});assert.equal(api.res.statusCode,404);assert.equal(queries,1);
});
test('campaign detail bounds page size, uses parameterized owner-only query and exposes review evidence',async()=>{
 const calls=[];const api=setup(async(sql,args)=>{calls.push(args);return {rows:calls.length===1?[{id,subject:'QA'}]:[{rows:[{id:'delivery',recipient:'qa@example.invalid',provider_id:'receipt',status:'needs_review',last_error:'Verify'}],total:201}]};});
 await api.run({id},{limit:'999999',offset:'100'});
 assert.deepEqual(calls[1],[id,100,100]);
 assert.equal(api.res.body.data.deliveries[0].provider_id,'receipt');
 assert.deepEqual(api.res.body.data.pagination,{limit:100,offset:100,total:201,hasMore:true});
});
