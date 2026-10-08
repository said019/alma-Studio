import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const postgres=new EmbeddedPostgres({databaseDir:await mkdtemp(join(tmpdir(),'hive-expiration-')),user:'test',password:'test',port,persistent:false});
let db;
try {
 await postgres.initialise();await postgres.start();await postgres.createDatabase('test');
 db=new pg.Client({connectionString:`postgres://test:test@127.0.0.1:${port}/test`});await db.connect();
 await db.query(`CREATE TABLE instructors(id int PRIMARY KEY,is_active boolean,deleted_at timestamptz,updated_at timestamptz);
 CREATE TABLE classes(id int PRIMARY KEY,instructor_id int REFERENCES instructors(id) ON DELETE RESTRICT);
 INSERT INTO instructors VALUES(1,true,NULL,NOW());INSERT INTO classes VALUES(1,1);`);
 await assert.rejects(db.query('DELETE FROM instructors WHERE id=1'),e=>['23503','23001'].includes(e.code));
 await db.query('UPDATE instructors SET is_active=false,deleted_at=COALESCE(deleted_at,NOW()),updated_at=NOW() WHERE id=1');
 assert.equal((await db.query('SELECT * FROM instructors WHERE deleted_at IS NULL')).rowCount,0);
 assert.equal((await db.query('SELECT * FROM instructors WHERE is_active=true')).rowCount,0);
 assert.equal((await db.query('SELECT * FROM classes WHERE instructor_id=1')).rowCount,1);
 console.log('PASS: coach removal preserves linked classes and hides the coach');
} finally {if(db)await db.end();await postgres.stop();}
