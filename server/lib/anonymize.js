// Baja de clienta sin perder historial (auditoría 2026-09-27, P1-5 · A9 · EC15).
// Se reemplazan sus datos personales y de salud; órdenes, pagos, membresías y
// reservas se conservan apuntando al mismo id.
export const ANON_NAME = "Clienta dada de baja";
export const ANON_GUEST_NAME = "Invitada dada de baja";
export const anonEmail = (userId) => `baja+${String(userId).replace(/-/g, "")}@hive.invalid`;

/** Columnas de `users` con el valor que las reemplaza. */
export function userAnonymizationValues(userId, actorId) {
  return {
    display_name: ANON_NAME,
    email: anonEmail(userId),
    phone: null,
    photo_url: null,
    date_of_birth: null,
    gender: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    health_notes: null,
    has_injury: null,
    injury_details: null,
    practiced_barre_before: null,
    instructor_notes: null,
    alert_flag: false,
    alert_message: null,
    password_hash: null,
    firebase_uid: null,
    wellhub_id: null,
    platform_plan: null,
    receive_reminders: false,
    receive_promotions: false,
    receive_weekly_summary: false,
    accepts_communications: false,
    is_active: false,
    anonymized_by: actorId ?? null,
  };
}

export const WAIVER_ANON_VALUES = Object.freeze({ full_name: ANON_NAME, phone: null, email: null, signature_data: null });
export const GUEST_ANON_VALUES = Object.freeze({
  display_name: ANON_GUEST_NAME, phone: null, email: null, date_of_birth: null, has_injury: null,
  injury_details: null, practiced_barre_before: null, emergency_contact_name: null, emergency_contact_phone: null,
});

/**
 * Columnas de `event_registrations` con el valor que las reemplaza. `name` y
 * `email` son NOT NULL en ambas fuentes del schema (`ensureSchema` y
 * `schema_complete.sql`) — y `schema_complete.sql` además exige
 * `UNIQUE (event_id, email)`, así que `email` usa `anonEmail(userId)` (único por
 * usuaria, nunca vacío ni repetido) en vez de null o "". `phone` sí es nullable
 * en ambas fuentes, así que va a null.
 */
export function eventRegistrationAnonValues(userId) {
  return { name: ANON_NAME, email: anonEmail(userId), phone: null };
}

/**
 * UPDATE sólo con las columnas que existen en la base (producción puede no tener
 * todas las de schema_complete.sql). `table` y las columnas son constantes del
 * código, nunca entrada de usuaria. null si no hay nada que tocar.
 */
export function buildAnonymizeUpdate({ table, values, nowColumns = [], existing, idColumn = "id", id }) {
  const params = [id];
  const sets = [];
  for (const [col, val] of Object.entries(values)) {
    if (!existing.has(col)) continue;
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  for (const col of nowColumns) if (existing.has(col)) sets.push(`${col} = NOW()`);
  if (!sets.length) return null;
  return { sql: `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $1`, params };
}
