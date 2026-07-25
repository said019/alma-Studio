// Flujos de Wellhub. Reciben `pool` y `creds` (de getWellhubCredentials).
// La idempotencia la garantiza processed_events a nivel webhook, así que aquí
// los INSERT son planos. Las llamadas salientes son best-effort (nunca lanzan).
import {
  extractBookingNumber, extractExternalSlotId, extractWellhubUserId,
  checkinWindow,
} from "./payload.js";
import { resolveWellhubPrice } from "./pricing.js";
import {
  confirmWellhubBooking, rejectWellhubBooking, validateWellhubVisit,
} from "./api.js";

const CHANNEL = "wellhub";

export async function findOrCreatePartnerUser(pool, payload) {
  const wid = extractWellhubUserId(payload);
  if (!wid) return null;
  const existing = await pool.query("SELECT * FROM users WHERE wellhub_id = $1 LIMIT 1", [String(wid)]);
  if (existing.rows.length) return existing.rows[0];
  const u = payload?.event_data?.user || payload?.user || {};
  const name = u.name || u.display_name || "Socio Wellhub";
  const email = u.email && String(u.email).includes("@") ? u.email : `wellhub+${wid}@alma.partner`;
  const phone = u.phone || null;
  const plan = u.plan || u.plan_name || null;
  try {
    const ins = await pool.query(
      `INSERT INTO users (display_name, email, phone, role, source, wellhub_id, platform_plan, accepts_terms, password_hash)
       VALUES ($1,$2,$3,'client','wellhub',$4,$5,true,NULL) RETURNING *`,
      [name, email, phone, String(wid), plan],
    );
    return ins.rows[0];
  } catch (err) {
    if (err && err.code === "23505") {
      const ins2 = await pool.query(
        `INSERT INTO users (display_name, email, phone, role, source, wellhub_id, accepts_terms, password_hash)
         VALUES ($1,$2,NULL,'client','wellhub',$3,true,NULL) RETURNING *`,
        [name, `wellhub+${wid}@alma.partner`, String(wid)],
      );
      return ins2.rows[0];
    }
    throw err;
  }
}

export async function findLocalClassByMapping(pool, externalSlotId) {
  if (!externalSlotId) return null;
  const r = await pool.query(
    `SELECT c.* FROM partner_class_mappings m JOIN classes c ON c.id = m.class_id
      WHERE m.channel = $1 AND m.external_slot_id = $2 LIMIT 1`,
    [CHANNEL, String(externalSlotId)],
  );
  return r.rows[0] || null;
}

export async function hasChannelCapacity(pool, classId) {
  const r = await pool.query(
    "SELECT max_spots, booked_spots FROM channel_inventory WHERE class_id = $1 AND channel = $2",
    [classId, CHANNEL],
  );
  if (!r.rows.length) return false; // clase no publicada a Wellhub
  return Number(r.rows[0].booked_spots) < Number(r.rows[0].max_spots);
}

// Orden de convenio (decisión del dueño: cada visita = orden method 'wellhub').
async function createWellhubOrder(pool, { userId, price }) {
  try {
    const orderNumber = "WH-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(Math.random() * 9000 + 1000);
    await pool.query(
      `INSERT INTO orders (user_id, status, payment_method, subtotal, total_amount, channel, verified_at, order_number)
       VALUES ($1,'approved','wellhub',$2,$2,'wellhub',NOW(),$3)`,
      [userId, price, orderNumber],
    );
    return orderNumber;
  } catch (err) {
    console.warn("[wellhub] order:", err.message);
    return null;
  }
}

// ── booking-requested ──
export async function handleBookingRequested(pool, creds, payload) {
  const bookingNumber = extractBookingNumber(payload);
  const slotId = extractExternalSlotId(payload);
  const cls = await findLocalClassByMapping(pool, slotId);
  if (!cls) {
    await rejectWellhubBooking(creds, { bookingNumber, reason: "CLASS_NOT_FOUND" });
    return { status: "rejected", reason: "CLASS_NOT_FOUND" };
  }
  const user = await findOrCreatePartnerUser(pool, payload);
  if (!user) return { status: "ignored", reason: "NO_USER" };
  if (!(await hasChannelCapacity(pool, cls.id))) {
    await rejectWellhubBooking(creds, { bookingNumber, reason: "CLASS_IS_FULL" });
    return { status: "rejected", reason: "CLASS_IS_FULL" };
  }
  await pool.query(
    `INSERT INTO bookings (class_id, user_id, membership_id, status, channel, external_ref, partner_metadata)
     VALUES ($1,$2,NULL,'confirmed','wellhub',$3,$4)`,
    [cls.id, user.id, String(bookingNumber), JSON.stringify({ slot_id: slotId })],
  );
  await createWellhubOrder(pool, { userId: user.id, price: resolveWellhubPrice(creds.extra_config) });
  await confirmWellhubBooking(creds, { bookingNumber });
  return { status: "confirmed", bookingNumber, classId: cls.id };
}

// ── check-in ──
export async function handleCheckin(pool, creds, payload, now) {
  const user = await findOrCreatePartnerUser(pool, payload);
  if (!user) return { status: "ignored", reason: "NO_USER" };
  const win = checkinWindow(payload, now || Date.now());
  if (!win.withinWindow) return { status: "rejected", reason: "OUTSIDE_WINDOW" };
  const today = await pool.query(
    `SELECT id FROM partner_checkins WHERE user_id = $1 AND channel = 'wellhub'
       AND created_at::date = NOW()::date LIMIT 1`,
    [user.id],
  );
  if (today.rows.length) return { status: "already_checked_in" };

  const bookingNumber = extractBookingNumber(payload);
  let booking = null;
  if (bookingNumber) {
    const b = await pool.query(
      "SELECT * FROM bookings WHERE channel='wellhub' AND external_ref=$1 LIMIT 1",
      [String(bookingNumber)],
    );
    booking = b.rows[0] || null;
  }
  if (!booking) {
    const b = await pool.query(
      `SELECT b.* FROM bookings b JOIN classes c ON c.id=b.class_id
        WHERE b.user_id=$1 AND b.channel='wellhub' AND c.date=NOW()::date
          AND b.status NOT IN ('cancelled','no_show') LIMIT 1`,
      [user.id],
    );
    booking = b.rows[0] || null;
  }

  const ci = await pool.query(
    `INSERT INTO partner_checkins (booking_id, user_id, channel, status, method)
     VALUES ($1,$2,'wellhub','pending','automated') RETURNING id`,
    [booking?.id || null, user.id],
  );
  const checkinId = ci.rows[0].id;

  // customCode viene del wallet del usuario; sin él, usamos wellhub_id (ajustar en sandbox).
  const res = await validateWellhubVisit(creds, { customCode: user.wellhub_id });
  if (res.ok) {
    await pool.query(
      "UPDATE partner_checkins SET status='confirmed', validated_at=NOW(), external_response=$2 WHERE id=$1",
      [checkinId, JSON.stringify(res.data || {})],
    );
    if (booking) {
      await pool.query("UPDATE bookings SET status='checked_in' WHERE id=$1", [booking.id]);
      await createWellhubOrder(pool, { userId: user.id, price: resolveWellhubPrice(creds.extra_config) });
    }
    return { status: "confirmed" };
  }
  await pool.query(
    "UPDATE partner_checkins SET status='failed', external_response=$2 WHERE id=$1",
    [checkinId, JSON.stringify(res.data || { error: res.error } || {})],
  );
  return { status: "failed", detail: res.status };
}

// ── cancelaciones ──
export async function handleCancel(pool, creds, payload, { late = false } = {}) {
  const bookingNumber = extractBookingNumber(payload);
  if (!bookingNumber) return { status: "ignored" };
  const r = await pool.query(
    `UPDATE bookings SET status='cancelled', cancelled_at=NOW(),
       partner_metadata = COALESCE(partner_metadata,'{}'::jsonb) || $2::jsonb
     WHERE channel='wellhub' AND external_ref=$1 AND status <> 'cancelled' RETURNING id`,
    [String(bookingNumber), JSON.stringify({ late_cancel: late })],
  );
  return { status: r.rows.length ? "cancelled" : "not_found", late };
}

// ── cambio / baja de plan del usuario ──
export async function handlePlanChange(pool, creds, payload) {
  const wid = extractWellhubUserId(payload);
  if (!wid) return { status: "ignored" };
  const u = payload?.event_data?.user || payload?.user || {};
  const plan = u.plan || u.plan_name || u.status || null;
  await pool.query("UPDATE users SET platform_plan=$2 WHERE wellhub_id=$1", [String(wid), plan]);
  const inactive = !plan || ["0", "cancelled", "canceled", "paused"].includes(String(plan).toLowerCase());
  if (inactive) {
    await pool.query(
      `UPDATE bookings b SET status='cancelled', cancelled_at=NOW()
         FROM classes c WHERE b.class_id=c.id AND b.channel='wellhub'
           AND b.user_id=(SELECT id FROM users WHERE wellhub_id=$1)
           AND c.date >= NOW()::date AND b.status NOT IN ('cancelled','no_show')`,
      [String(wid)],
    );
  }
  return { status: "updated", plan, inactive };
}
