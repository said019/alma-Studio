// One renewal reminder per membership, shared by low-credit and expiry checks.
// Claim before external delivery to prevent repeated mail after restarts or an
// ambiguous provider response. A new purchased membership gets its own claim.
export async function claimRenewalReminder(pool, membershipId) {
  const result = await pool.query(
    `INSERT INTO settings (key,value) VALUES ($1,jsonb_build_object('claimedAt',NOW()))
     ON CONFLICT (key) DO NOTHING RETURNING key`,
    [`renewal_reminder:${membershipId}`],
  );
  return result.rows.length > 0;
}
