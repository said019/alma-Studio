import test from 'node:test';
import assert from 'node:assert/strict';
import {renderCustomBroadcast} from '../emailService.js';
import {registerCommunications} from './communications.js';
test('preview uses actual email renderer, personalizes and escapes content',()=>{
 const result=renderCustomBroadcast({name:'María Pérez',subject:'Hola {name}',headline:'Hola {name}',body:'<script>alert(1)</script>\n\nPara {name}',ctaUrl:'https://hivestudio.com.mx/app/classes',ctaText:'Reserva {name}'});
 assert.equal(result.subject,'Hola María');assert.match(result.html,/Hola María/);assert.match(result.html,/Reserva María/);assert.match(result.html,/&lt;script&gt;/);assert.doesNotMatch(result.html,/<script>/);
 assert.throws(()=>renderCustomBroadcast({ctaUrl:'javascript:alert(1)'}));
});
test('preview is owner-only and counts email subscribers without changing consent',async()=>{
 const routes=new Map(), owner=()=>{};const queries=[];
 registerCommunications({get:(p,...h)=>routes.set(p,h),post:(p,...h)=>routes.set(p,h)},{ownerMiddleware:owner,pool:{query:async(sql)=>{queries.push(sql);return {rows:sql.includes('count(*)')?[{total:4,unsubscribed:4}]:[]};}}});
 const res={statusCode:200,status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};
 const count=routes.get('/api/admin/broadcast/audience-count');assert.equal(count[0],owner);
 await count[1]({query:{audience:'all'}},res);assert.deepEqual(res.body.data,{count:0,totalClients:4,unsubscribed:4});assert.match(queries[0],/receive_promotions=true/);
 const preview=routes.get('/api/admin/broadcast/email-preview');assert.equal(preview[0],owner);
 preview[1]({body:{subject:'Hola {name}',name:'Ana',body:'Mensaje'}},res);assert.equal(res.body.data.subject,'Hola Ana');assert.match(res.body.data.html,/Mensaje/);assert.equal(queries.length,2);
 preview[1]({body:{ctaUrl:'javascript:alert(1)'}},res);assert.equal(res.statusCode,400);
});
