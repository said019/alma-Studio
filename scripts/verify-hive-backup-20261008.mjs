// Restore an existing archive ONLY into a disposable local PostgreSQL. No app/jobs started.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import {mkdtemp,readFile,writeFile,chmod} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import net from 'node:net';
import assert from 'node:assert/strict';
const archive=process.argv[2];if(!archive)throw new Error('Archive path required');
const folder=await mkdtemp(join(tmpdir(),'hive-restore-'));await chmod(folder,0o700);
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const instance=new EmbeddedPostgres({databaseDir:folder,user:'restore_test',password:'local_disposable_only',port,persistent:false});
let client;
try{
 await instance.initialise();await instance.start();await instance.createDatabase('restore_test');
 const url=`postgres://restore_test:local_disposable_only@127.0.0.1:${port}/restore_test`;
 const result=spawnSync('/opt/homebrew/opt/postgresql@18/bin/pg_restore',['--no-owner','--no-privileges','--no-publications','--no-subscriptions','--exit-on-error','--dbname',url,archive],{encoding:'utf8'});
 await writeFile(join(dirname(archive),'restore-private.log'),result.stderr||'',{mode:0o600});
 assert.equal(result.status,0,'Restore failed; see private log');
 client=new pg.Client({connectionString:url});await client.connect();
 const counts=async()=> (await client.query(`SELECT (SELECT COUNT(*) FROM orders)::int orders,(SELECT COUNT(*) FROM memberships)::int memberships,(SELECT COUNT(*) FROM users)::int users,(SELECT COUNT(*) FROM bookings)::int bookings`)).rows[0];
 const before=await counts();
 for(const name of ['20261008_mp_reconciliation.sql','20261008_manual_sale_intents.sql','20261008_campaign_outbox.sql'])await client.query(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
 assert.deepEqual(await counts(),before,'Additive migrations must preserve existing rows');
 const meta={restored:true,migrationsApplied:true,originalRowCountsPreserved:true,counts:before,productionMutated:false};
 await writeFile(join(dirname(archive),'restore-metadata.json'),JSON.stringify(meta,null,2),{mode:0o600});
 console.log('BACKUP RESTORE PASS; additive migrations preserve row counts; no application/jobs launched.');
}finally{await client?.end();await instance.stop();}
