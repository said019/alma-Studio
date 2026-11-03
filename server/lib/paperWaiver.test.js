import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
import {AUDIT_ACTIONS} from './audit.js';
const source=readFileSync(new URL('../index.js',import.meta.url),'utf8');
const route=source.slice(source.indexOf('app.post("/api/admin/users/:userId/waiver/paper"'),source.indexOf('// POST /api/auth/change-password'));
test('paper signature route is admin-only, validates attestation and audits without fabricating an image',async()=>{
 let handler;const owner=()=>{};const calls=[];let audit;
 const client={query:async(sql,args)=>{calls.push([sql,args]);if(sql.includes('SELECT id,display_name'))return {rows:[{id:'client',display_name:'Ana'}]};if(sql.includes('AS valid'))return {rows:[{valid:true}]};if(sql.includes('INSERT INTO waivers'))return {rowCount:1,rows:[{id:'waiver'}]};return {rows:[]};},release(){}};
 vm.runInNewContext(route,{app:{post:(path,middleware,h)=>{assert.equal(middleware,owner);handler=h;}},adminMiddleware:owner,isUuid:()=>true,pool:{connect:async()=>client},recordAudit:async(_,entry)=>{audit=entry;},waiverWithIntake:x=>x});
 const res={status(c){this.code=c;return this;},json(x){this.body=x;return this;}};
 await handler({params:{userId:'client'},body:{confirmed:false}},res);assert.equal(res.code,400);assert.equal(calls.length,0);
 await handler({params:{userId:'client'},userId:'admin',body:{signedOn:'2026-11-03',reference:'Original folio 12',confirmed:true}},res);
 assert.equal(res.code,201);assert.equal(audit.actorId,'admin');assert.equal(audit.after.signature_method,'paper');assert.ok(AUDIT_ACTIONS.includes(audit.action));
 assert.match(calls.find(([sql])=>sql.includes('INSERT INTO waivers'))[0],/false,'','paper'/);
});
