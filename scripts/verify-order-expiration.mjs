import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {expireUnpaidOrders,ORDER_PAYMENT_WINDOW_MS} from '../server/lib/orderExpiration.js';
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const postgres=new EmbeddedPostgres({databaseDir:await mkdtemp(join(tmpdir(),'hive-expiration-')),user:'test',password:'test',port,persistent:false});
let db;
try {
 await postgres.initialise();await postgres.start();await postgres.createDatabase('test');
 db=new pg.Client({connectionString:`postgres://test:test@127.0.0.1:${port}/test`});await db.connect();
 await db.query(`CREATE TABLE orders(id int PRIMARY KEY,status text,paid_at timestamptz,expires_at timestamptz,updated_at timestamptz);
 CREATE TABLE payment_proofs(order_id int,status text);CREATE TABLE mp_card_attempts(order_id int,status text);
 INSERT INTO orders SELECT n,'pending_payment',NULL,NOW()-INTERVAL '1 minute',NOW() FROM generate_series(1,8) n;
 UPDATE orders SET expires_at=NOW()+INTERVAL '1 hour' WHERE id=2;
 UPDATE orders SET status='approved' WHERE id=3;
 UPDATE orders SET status='pending_verification' WHERE id=4;
 INSERT INTO payment_proofs VALUES(5,'pending');INSERT INTO mp_card_attempts VALUES(6,'in_process'),(7,'rejected');
 UPDATE orders SET paid_at=NOW() WHERE id=8;`);
 assert.equal(ORDER_PAYMENT_WINDOW_MS,3600000);
 assert.deepEqual((await expireUnpaidOrders(db)).rows.map(x=>x.id).sort(),[1,7]);
 assert.equal((await expireUnpaidOrders(db)).rowCount,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM orders WHERE status='expired'")).rows[0].n,2);
 console.log('PASS: one-hour window, expiration, idempotency, and protection for paid/pending/proof/provider orders');
} finally {if(db)await db.end();await postgres.stop();}
