// Fully isolated integration test: creates its own disposable database and API.
// Never reads .env, existing DATABASE_URL, mail credentials or production data.
import pg from 'pg';
import jwt from 'jsonwebtoken';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import net from 'node:net';
const freePort=()=>new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const databaseDir=await mkdtemp(join(tmpdir(),'hive-promotions-'));
const databasePort=await freePort();const apiPort=await freePort();const testSecret=randomBytes(24).toString('hex');
const postgres=new EmbeddedPostgres({databaseDir,user:'parity',password:'parity',port:databasePort,persistent:false});
let db,apiProcess;let logs='';
try {
await postgres.initialise();await postgres.start();await postgres.createDatabase('parity');
const databaseUrl=`postgres://parity:parity@127.0.0.1:${databasePort}/parity`;
db=new pg.Client({connectionString:databaseUrl});await db.connect();await db.query("SET TIME ZONE 'America/Mexico_City'");
await db.query(await readFile(new URL('../supabase/migrations/schema_complete.sql',import.meta.url),'utf8'));
// schema_complete.sql is legacy and omits schedule_slots. Mirror the deployed
// Sunday=0 schema for this disposable fixture; never migrate a real database here.
await db.query(`CREATE TABLE schedule_slots (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), time_slot VARCHAR(20) NOT NULL,
 day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
 class_type_id UUID REFERENCES class_types(id) ON DELETE SET NULL,
 class_type_name VARCHAR(100), instructor_name VARCHAR(100), is_active BOOLEAN DEFAULT true,
 created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP)`);

apiProcess=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DOTENV_CONFIG_PATH:'/dev/null',DATABASE_URL:databaseUrl,JWT_SECRET:testSecret,PORT:String(apiPort),WAITLIST_SWEEP_MINUTES:'0',AUTH_RATE_LIMIT_MAX:'10000',API_RATE_LIMIT_MAX:'10000',API_RATE_LIMIT_USER_MAX:'10000'},stdio:['ignore','pipe','pipe']});
apiProcess.stdout.on('data',d=>logs+=d);apiProcess.stderr.on('data',d=>logs+=d);
let ready=false;
for(let i=0;i<100;i++){try{const response=await fetch(`http://127.0.0.1:${apiPort}/api/classes`);if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
assert.ok(ready,logs);

const observations=[];
async function post(path,body){const r=await fetch(`http://127.0.0.1:${apiPort}/api${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const b=await r.json();return {status:r.status,body:b};}
for(const [name,changes] of [
 ['valid_international',{phone:'+34612345678',acceptsTerms:true}],
 ['weak_password',{password:'a',acceptsTerms:true}],
 ['missing_terms',{acceptsTerms:false}],
 ['invalid_phone',{phone:'abc',acceptsTerms:true}],
 ['impossible_birthdate',{dateOfBirth:'2000-02-31',acceptsTerms:true}],
 ['minor',{dateOfBirth:'2020-01-01',acceptsTerms:true}],
]) {
 const email=`audit-${name}@example.invalid`;
 const result=await post('/auth/register',{email,displayName:'Synthetic audit',gender:'other',password:'SyntheticPass9!',phone:'+525512345678',dateOfBirth:'1990-05-05',...changes});
 const row=(await db.query('SELECT phone,accepts_terms,date_of_birth FROM users WHERE email=$1',[email])).rows[0];
 observations.push({case:name,status:result.status,persisted:Boolean(row),phone:row?.phone,terms:row?.accepts_terms,message:result.body.message});
}
for(const path of ['/users','/memberships','/payments','/admin/stats']) {const r=await fetch(`http://127.0.0.1:${apiPort}/api${path}`);observations.push({anonymous:path,status:r.status});}
console.log(JSON.stringify({observations},null,2));
// Force a real lookup failure against the disposable DB; must fail closed with503,
// then recover without caching the error or revoking a still-valid session.
const gateUser=(await db.query("INSERT INTO users(email,display_name,role) VALUES('gate-failure@example.invalid','Gate fixture','client') RETURNING id")).rows[0].id;
const gateToken=jwt.sign({sub:gateUser},testSecret,{expiresIn:'10m'});
await db.query('ALTER TABLE users RENAME COLUMN anonymized_at TO qa_hidden_anonymized_at');
try {
 const r=await fetch(`http://127.0.0.1:${apiPort}/api/auth/me`,{headers:{Authorization:'Bearer '+gateToken}});
 assert.equal(r.status,503,'Account status lookup error must fail closed without401');
 assert.equal((await r.json()).code,'ACCOUNT_STATUS_UNAVAILABLE');
} finally { await db.query('ALTER TABLE users RENAME COLUMN qa_hidden_anonymized_at TO anonymized_at'); }
const recovered=await fetch(`http://127.0.0.1:${apiPort}/api/auth/me`,{headers:{Authorization:'Bearer '+gateToken}});
assert.equal(recovered.status,200,'Lookup failure must not poison account cache');
console.log('ACCOUNT_GATE_FAILURE_503_RECOVERY_200_PASS');
const regressionFiles=['privacidad-consentimiento','seguridad','permisos','hive-consent','validacion','baja-clienta'];
const regression=spawn(process.execPath,['--test','--test-concurrency=1',...regressionFiles.map(f=>`server/tests/${f}.test.mjs`)],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DATABASE_URL:databaseUrl,API_URL:`http://127.0.0.1:${apiPort}`,NODE_ENV:'test',DOTENV_CONFIG_PATH:'/dev/null'},stdio:['ignore','inherit','inherit']});
const code=await new Promise(resolve=>regression.once('exit',resolve));console.log('IDENTITY_REGRESSIONS_EXIT',code);assert.equal(code,0,'Identity regression suite failed');

} finally {
 if(apiProcess){apiProcess.kill('SIGTERM');await new Promise(r=>apiProcess.once('exit',r));}
 if(db)await db.end();await postgres.stop();
}
