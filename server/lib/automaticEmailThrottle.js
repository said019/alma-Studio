// Atomic, durable cooldown shared by optional weekly and renewal emails.
// It does not suppress receipts, password resets or booking confirmations.
// Reserve before sending: ambiguous delivery must not trigger duplicate mail.
export async function claimAutomaticEmail(pool, userId) {
  const result = await pool.query(`
    INSERT INTO settings (key,value)
    VALUES ($1,jsonb_build_object('claimedAt',NOW()))
    ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value
    WHERE (settings.value->>'claimedAt')::timestamptz <= NOW() - INTERVAL '7 days'
    RETURNING key`, [`automatic_email:${userId}`]);
  return result.rows.length > 0;
}

export const WEEKLY_REMINDER_QUERY = `
  SELECT DISTINCT ON (u.id) u.id AS user_id, u.email,
    COALESCE(u.display_name, 'Alumna') AS name, m.classes_remaining, m.end_date
  FROM memberships m JOIN users u ON m.user_id=u.id
  WHERE m.status='active'
    AND u.is_active IS NOT FALSE AND u.receive_weekly_summary=true
    AND NULLIF(TRIM(u.email),'') IS NOT NULL
    AND (m.start_date IS NULL OR m.start_date<=CURRENT_DATE)
    AND (m.end_date IS NULL OR m.end_date>CURRENT_DATE + INTERVAL '7 days')
    AND (m.classes_remaining IS NULL OR m.classes_remaining>1)
    AND NOT EXISTS (
      SELECT 1 FROM memberships urgent WHERE urgent.user_id=u.id AND urgent.status='active'
      AND (urgent.start_date IS NULL OR urgent.start_date<=CURRENT_DATE)
      AND (urgent.end_date IS NULL OR urgent.end_date>=CURRENT_DATE)
      AND (urgent.classes_remaining=1 OR urgent.end_date<=CURRENT_DATE + INTERVAL '7 days')
    )
  ORDER BY u.id,m.end_date ASC NULLS LAST,m.id`;
