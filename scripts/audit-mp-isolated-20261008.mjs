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
const child=spawn(process.execPath,['--test','server/tests/hive-mercadopago-review.test.mjs','server/lib/mercadoPago.test.js','server/lib/mpReconciliation.test.js','server/tests/campaign-outbox.test.mjs','server/lib/refunds.test.js','server/lib/membershipAdmin.test.js'],{cwd:new URL('..',import.meta.url),env:{PATH:process.env.PATH,HOME:process.env.HOME,DATABASE_URL:databaseUrl,DOTENV_CONFIG_PATH:'/dev/null'},stdio:'inherit'});
const code=await new Promise(resolve=>child.on('exit',resolve));assert.equal(code,0);
} catch(error) { console.error(logs);throw error; }
finally {
 if(apiProcess){const exited=new Promise(resolve=>apiProcess.once('exit',resolve));apiProcess.kill('SIGTERM');if(apiProcess.exitCode===null)await exited;}
 if(db)await db.end();await postgres.stop();
}
