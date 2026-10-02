// Información proporcionada por el estudio el 1 de octubre de 2026.
// Se aplica una sola vez; las ediciones posteriores del panel se conservan.
export async function applyHiveStudioSettings(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('hive_information_20261001'))");
    const marker = await client.query("SELECT 1 FROM settings WHERE key='hive_information_20261001'");
    if (!marker.rowCount) {
      const previous = (await client.query("SELECT value FROM settings WHERE key='bank_info'")).rows[0]?.value ?? null;
      const bank = { bank: 'Mercado Pago', clabe: '722969020124160665', account_holder: '', account_number: '' };
      await client.query(`INSERT INTO settings(key,value) VALUES('bank_info',$1::jsonb)
        ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`, [JSON.stringify(bank)]);
      await client.query("INSERT INTO settings(key,value) VALUES('hive_information_20261001',$1::jsonb)", [JSON.stringify({ appliedAt: new Date().toISOString(), previousBank: previous })]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK'); throw error;
  } finally { client.release(); }
}
