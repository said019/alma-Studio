// Read-only connection checks adapted from BAÖ's official TotalPass client and
// Fitpass session flow. Never publish, cancel, import or mark attendance here.
export async function testPartnerConnection(provider, credentials, config, request = fetch) {
  const headers = { Accept: 'application/json' };
  const send = (url, options = {}) => request(url, { redirect: 'error', signal: AbortSignal.timeout(15000), ...options });
  if (provider === 'totalpass') {
    const auth = await send('https://booking-api.totalpass.com/partner/auth', {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ partner_api_key: credentials.partnerApiKey, place_api_key: credentials.placeApiKey }),
    });
    if (!auth.ok) throw new Error('TOTALPASS_AUTH_FAILED');
    const { token } = await auth.json();
    if (typeof token !== 'string' || token.split('.').length !== 3) throw new Error('TOTALPASS_TOKEN_MISSING');
    const place = await send('https://booking-api.totalpass.com/partner/plans', { headers: { ...headers, Authorization: `Bearer ${token}` } });
    if (!place.ok) throw new Error('TOTALPASS_ACCESS_FAILED');
    const data = await place.json();
    const identifier = data?.identifier ?? data?.place?.identifier;
    if (String(identifier ?? '') !== config.unitId) throw new Error('TOTALPASS_UNIT_MISMATCH');
    const plans = Array.isArray(data?.Plans) ? data.Plans : data?.plans;
    if (!Array.isArray(plans) || plans.length === 0) throw new Error('TOTALPASS_RESPONSE_INVALID');
    return;
  }
  throw new Error('UNKNOWN_PARTNER');
}
