// URLs base por defecto de Wellhub/Gympass según environment.
const DEFAULT_BASES = {
  production: {
    access: "https://api.partners.gympass.com/access/v1",
    booking: "https://api.partners.gympass.com/booking/v1",
  },
  sandbox: {
    access: "https://apitesting.partners.gympass.com/access/v1",
    booking: "https://apitesting.partners.gympass.com/booking/v1",
  },
};

// Lee la fila de credenciales del canal Wellhub y resuelve las URLs base
// (override de la BD o default por environment). Retorna null si no hay fila.
export async function getWellhubCredentials(pool) {
  const r = await pool.query("SELECT * FROM platform_credentials WHERE channel = 'wellhub'");
  if (!r.rows.length) return null;
  const row = r.rows[0];
  const env = row.environment === "sandbox" ? "sandbox" : "production";
  const def = DEFAULT_BASES[env];
  return {
    ...row,
    environment: env,
    accessBaseUrl: row.access_base_url || def.access,
    bookingBaseUrl: row.booking_base_url || def.booking,
    extra_config: row.extra_config || {},
  };
}
