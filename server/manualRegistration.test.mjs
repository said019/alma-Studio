import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('./index.js',import.meta.url),'utf8');
const start=source.indexOf('app.post("/api/admin/clients/manual"');
const end=source.indexOf('// GET /api/admin/orders',start);

async function request(existing, race=false) {
  const queries=[];let released=false;let handler;
  const client={query:async(sql)=>{queries.push(sql);if(sql.startsWith('SELECT id, anonymized_at'))return {rows:existing};if(race&&sql.includes('INSERT INTO users'))throw Object.assign(new Error('duplicate'),{code:'23505'});return {rows:[]};},release:()=>{released=true;}};
  const app={post:(_url,_auth,fn)=>{handler=fn;}};
  new Function('app','adminMiddleware','pool','bcrypt',source.slice(start,end))(app,()=>{},{connect:async()=>client},{hash:async()=> 'test-hash'});
  const res={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await handler({body:{displayName:'Name',email:' SAIDROMERO19@GMAIL.COM '}},res);
  return {res,queries,released};
}

test('alta manual con email existente avisa y no cambia nombre, contraseña ni rol',async()=>{
  const {res,queries,released}=await request([{id:'existing',anonymized_at:null}]);
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,'EMAIL_ALREADY_REGISTERED');
  assert.equal(queries.length,1);
  assert.ok(released);
});
test('cuenta dada de baja sigue bloqueada',async()=>{
  const {res}=await request([{id:'existing',anonymized_at:'2026-09-29'}]);
  assert.equal(res.statusCode,409);
  assert.equal(res.body.code,'ACCOUNT_ANONYMIZED');
});
test('registro simultáneo no actualiza accidentalmente al usuario previo',async()=>{
  const {res,queries,released}=await request([],true);
  assert.equal(res.statusCode,409);
  assert.ok(queries.includes('ROLLBACK'));
  assert.ok(!queries.some(q=>q.includes('ON CONFLICT')));
  assert.ok(released);
});
