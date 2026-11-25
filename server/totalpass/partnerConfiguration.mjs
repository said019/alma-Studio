import crypto from 'node:crypto';

export const PARTNER_DEFAULTS = Object.freeze({
  totalpass: { unitId: '', maxSpots: 0, buffer: 0, horizonDays: 21, syncMinutes: 10, cancellationHours: null },
});
const CREDENTIAL_FIELDS = { totalpass: ['partnerApiKey', 'placeApiKey'] };
export function assertPartner(provider) {
  if (!Object.hasOwn(PARTNER_DEFAULTS, provider)) throw Object.assign(new Error('Plataforma inválida'), { status: 400 });
}
function invalid(message) { throw Object.assign(new Error(message), { status: 400 }); }
export function validatePartnerConfig(provider, input, previous = PARTNER_DEFAULTS[provider]) {
  assertPartner(provider);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Configuración inválida');
  const config = { ...PARTNER_DEFAULTS[provider], ...previous };
  for (const key of Object.keys(input)) if (!Object.hasOwn(config, key)) invalid(`Campo no permitido: ${key}`);
  if (Object.hasOwn(input, 'unitId')) {
    if (typeof input.unitId !== 'string' || input.unitId.length > 120) invalid('Identificador de unidad inválido');
    config.unitId = input.unitId.trim();
    if (!/^\d+$/.test(config.unitId)) invalid('El ID de unidad debe ser numérico');
    if (process.env.TOTALPASS_UNIT_ID && config.unitId !== process.env.TOTALPASS_UNIT_ID) invalid('La unidad no corresponde a HIVE Pilates Studio.');
  }
  for (const [key, min, max] of [['maxSpots', 0, 500], ['buffer', 0, 500], ['horizonDays', 1, 90], ['syncMinutes', 5, 60], ['cancellationHours', 0, 168]]) {
    if (!Object.hasOwn(input, key)) continue;
    const n = input[key];
    if (key === 'cancellationHours' && n === null) { config[key] = null; continue; }
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (key !== 'cancellationHours' && !Number.isInteger(n))) invalid(`Valor inválido: ${key}`);
    config[key] = n;
  }
  return config;
}
export function mergeCredentials(provider, previous, input = {}) {
  assertPartner(provider);
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('Credenciales inválidas');
  const next = { ...previous };
  for (const [key, value] of Object.entries(input)) {
    if (!CREDENTIAL_FIELDS[provider].includes(key) || typeof value !== 'string' || value.length > 4096) invalid('Credencial inválida');
    // Blank means keep the saved secret; never return a secret to the browser.
    if (value !== '') next[key] = key === 'password' ? value : value.trim();
  }
  if (provider === 'fitpass' && next.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email)) invalid('Correo Fitpass inválido');
  return next;
}
function key(secret) {
  if (!secret || secret.length < 32) throw new Error('PARTNER_ENCRYPTION_KEY requiere al menos 32 caracteres');
  return crypto.createHash('sha256').update(`hive-partners-v1:${secret}`).digest();
}
export function encryptCredentials(provider, value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(`hive:${provider}`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.');
}
export function decryptCredentials(provider, raw, secret) {
  if (!raw) return {};
  const [version, iv, tag, data] = raw.split('.');
  if (version !== 'v1') throw new Error('Versión de cifrado inválida');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key(secret), Buffer.from(iv, 'base64'));
  cipher.setAAD(Buffer.from(`hive:${provider}`));
  cipher.setAuthTag(Buffer.from(tag, 'base64'));
  return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data, 'base64')), cipher.final()]).toString());
}
// Shared pool from BAÖ/Crisol: channel limits are ceilings, not allocated seats.
export function partnerAvailability({ capacity, totalBooked, channelBooked, maxSpots, buffer = 0 }) {
  for (const n of [capacity, totalBooked, channelBooked, maxSpots, buffer]) if (!Number.isInteger(n) || n < 0) invalid('Los cupos deben ser enteros no negativos');
  const available = Math.max(0, Math.min(maxSpots - channelBooked, capacity - totalBooked - buffer));
  return { available, capacityToPublish: Math.min(capacity, channelBooked + available), overbooked: totalBooked > capacity, maxSpots };
}
export function publicPartnerConfig(provider, row, credentials, policies) {
  const config = { ...PARTNER_DEFAULTS[provider], ...row?.config };
  return {
    provider, config, revision: Number(row?.revision || 0),
    credentialStatus: Object.fromEntries(CREDENTIAL_FIELDS[provider].map(k => [k, Boolean(credentials[k])])),
    configured: Boolean(config.unitId && (provider !== 'wellhub' || config.productId) && CREDENTIAL_FIELDS[provider].every(k => credentials[k])),
    connection: row?.connection_status || 'not_tested', testedAt: row?.tested_at || null,
    // Configuring a connection does not publish or import classes.
    synchronizationEnabled: row?.sync_enabled === true,
    rules: { timeZone: 'America/Mexico_City', branches: 1, sharedCapacity: true, directBookingsHaveNoChannelCap: true,
      zeroCapClosesChannel: true, autoIncreaseCap: false, externalConfirmedBookingsRequireReconciliation: true,
      duplicateEventsAllowed: false, checkinRequiresProviderConfirmation: true,
      cancellationHours: config.cancellationHours ?? policies.cancellationHours,
      studioCancellationHours: policies.cancellationHours,
      maxAdvanceDays: Math.min(config.horizonDays, policies.maxAdvanceDays),
      maxDailyBookings: policies.maxDailyBookings, maxActiveBookings: policies.maxActiveBookings,
      checkinValidationMinutes: provider === 'totalpass' ? 90 : provider === 'wellhub' ? 60 : null },
  };
}

export function installPartnerConfiguration(app, { pool, adminMiddleware, secret, getPolicies, testConnection }) {
  const base = '/api/admin/partner-integrations/:provider';
  async function read(provider, query = pool) { return (await query.query('SELECT * FROM partner_integration_config WHERE provider=$1', [provider])).rows[0]; }
  const handler = fn => async (req, res) => {
    try { assertPartner(req.params.provider); await fn(req, res); }
    catch (error) { res.status(error.status || 500).json({ message: error.status ? error.message : 'No se pudo procesar la configuración de la plataforma.' }); }
  };
  app.get(base, adminMiddleware, handler(async (req, res) => {
    const provider = req.params.provider, row = await read(provider);
    res.json({ data: publicPartnerConfig(provider, row, decryptCredentials(provider, row?.credentials_encrypted, secret), await getPolicies()) });
  }));
  app.put(base, adminMiddleware, handler(async (req, res) => {
    const provider = req.params.provider;
    const body = req.body || {};
    if (Object.keys(body).some(k => !['config', 'credentials', 'revision'].includes(k))) invalid('Campo no permitido');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`hive:partner-config:${provider}`]);
      const row = await read(provider, client);
      if (body.revision !== Number(row?.revision || 0)) throw Object.assign(new Error('La configuración cambió. Recarga antes de guardar.'), { status: 409 });
      const config = validatePartnerConfig(provider, body.config || {}, row?.config);
      const before = decryptCredentials(provider, row?.credentials_encrypted, secret);
      const credentials = mergeCredentials(provider, before, body.credentials);
      const changedIdentity = config.unitId !== (row?.config?.unitId || '') || JSON.stringify(before) !== JSON.stringify(credentials);
      const encrypted = Object.keys(credentials).length ? encryptCredentials(provider, credentials, secret) : null;
      await client.query(`INSERT INTO partner_integration_config(provider, config, credentials_encrypted, revision, updated_by)
        VALUES($1,$2,$3,1,$4) ON CONFLICT(provider) DO UPDATE SET config=$2,credentials_encrypted=$3,
        revision=partner_integration_config.revision+1,updated_at=NOW(),updated_by=$4,
        connection_status=CASE WHEN $5 THEN 'not_tested' ELSE partner_integration_config.connection_status END,
        sync_enabled=CASE WHEN $5 THEN false ELSE partner_integration_config.sync_enabled END,
        tested_at=CASE WHEN $5 THEN NULL ELSE partner_integration_config.tested_at END`, [provider, config, encrypted, req.userId, changedIdentity]);
      await client.query('COMMIT');
      res.json({ data: publicPartnerConfig(provider, await read(provider), credentials, await getPolicies()) });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }));
  app.post(`${base}/test`, adminMiddleware, handler(async (req, res) => {
    const provider = req.params.provider, row = await read(provider);
    const credentials = decryptCredentials(provider, row?.credentials_encrypted, secret);
    if (!publicPartnerConfig(provider, row, credentials, await getPolicies()).configured) invalid('Guarda las credenciales y el identificador de HIVE antes de probar.');
    // Serialize tests so repeated clicks cannot create simultaneous logins.
    const client = await pool.connect();
    let locked = false;
    try {
      locked = (await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [`hive:partner-test:${provider}`])).rows[0].locked;
      if (!locked) throw Object.assign(new Error('Ya hay una prueba en curso.'), { status: 409 });
      let status = 'verified';
      try { await testConnection(provider, credentials, row.config); } catch { status = 'failed'; }
      const result = await client.query('UPDATE partner_integration_config SET connection_status=$1,tested_at=NOW() WHERE provider=$2 AND revision=$3 RETURNING provider', [status, provider, row.revision]);
      if (!result.rowCount) throw Object.assign(new Error('Las credenciales cambiaron durante la prueba. Vuelve a probar.'), { status: 409 });
      res.status(status === 'verified' ? 200 : 422).json({ message: status === 'verified' ? 'Autenticación verificada. La publicación de clases sigue desactivada.' : 'La plataforma no confirmó el acceso. Revisa las credenciales y permisos de esta unidad.' });
    } finally { if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`hive:partner-test:${provider}`]); client.release(); }
  }));
}
