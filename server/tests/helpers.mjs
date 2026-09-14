// Harness compartido para las regresiones de la auditoría 2026-09-08.
// Cada suite siembra sus propias fixtures (prefijo único) y limpia en after().
import pg from "pg";
import bcrypt from "bcryptjs";

export const API = process.env.API_URL || "http://127.0.0.1:8101";
export const DB  = process.env.DATABASE_URL || "postgres://alma:alma@127.0.0.1:5501/alma_fix";
// La suite siembra su propio admin: el servidor ya no crea uno con contrasena
// por defecto (auditoria 2026-09-08, P0-4), asi que depender de esa cuenta
// hacia fallar la suite en una base limpia — y volvia a meter la contrasena
// literal en el repositorio, justo lo que seguridad.test.mjs prohibe.
export const ADMIN = {
  email: process.env.QA_ADMIN_EMAIL || "qa-admin@alma.test",
  password: process.env.QA_ADMIN_PASSWORD || `Qa${Math.random().toString(36).slice(2, 10)}A1!`,
};

// El harness lee la base como lo hace la app: con la zona del estudio anclada.
// Sin esto, las aserciones de fecha miden la zona del runner, no la del producto.
export const STUDIO_TIMEZONE = process.env.STUDIO_TIMEZONE || "America/Mexico_City";
const pool = new pg.Pool({
  connectionString: DB, max: 10,
  options: `-c TimeZone=${STUDIO_TIMEZONE}`,
});
export const sql = async (q, p = []) => (await pool.query(q, p)).rows;
export const closeDb = () => pool.end();

export async function api(method, route, { token, body, raw, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) { payload = raw; h["Content-Type"] = h["Content-Type"] || "application/json"; }
  else if (body !== undefined) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const res = await fetch(`${API}${route}`, { method, headers: h, body: payload });
  const text = await res.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text.slice(0, 300); }
  return { status: res.status, body: parsed };
}

/** Crea (o repone la contrasena de) la cuenta admin sintetica de la suite. */
export async function ensureAdmin() {
  const hash = await bcrypt.hash(ADMIN.password, 10);
  await sql(
    `INSERT INTO users (display_name, email, phone, password_hash, role, accepts_terms, is_active)
     VALUES ('QA Admin', $1, '0000000001', $2, 'admin', true, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'`,
    [ADMIN.email, hash]);
  return ADMIN;
}

export async function login(email, password) {
  if (email === ADMIN.email) await ensureAdmin();
  const r = await api("POST", "/api/auth/login", { body: { email, password } });
  if (r.status !== 200) throw new Error(`login ${email} → ${r.status} ${JSON.stringify(r.body).slice(0, 150)}`);
  return { token: r.body.token, user: r.body.user };
}

/** Id de la reserva: la API devuelve { message, booking }. */
export const bookingId = (r) => r.body?.booking?.id ?? r.body?.data?.id ?? r.body?.id;

// Fecha civil del estudio: toISOString() devuelve UTC y despues de las 18:00
// en CDMX sembraria las fixtures en un dia distinto al que ve el servidor.
export const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: STUDIO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
};

/** Créditos vivos = suma de todas las membresías activas (el sistema debita la más antigua). */
export const credits = async (userId) =>
  Number((await sql(`SELECT COALESCE(SUM(classes_remaining),0)::int t FROM memberships WHERE user_id=$1 AND status='active'`, [userId]))[0].t);

export const liveBookings = async (classId) =>
  Number((await sql(`SELECT count(*)::int n FROM bookings WHERE class_id=$1 AND status IN ('confirmed','checked_in')`, [classId]))[0].n);

export async function makeClient(prefix, key, { role = "client", waiver = true } = {}) {
  const email = `${prefix}_${key}@qa.local`, password = "QaPass!2026";
  const hash = await bcrypt.hash(password, 10);
  const [u] = await sql(
    `INSERT INTO users (display_name,email,phone,password_hash,role,accepts_terms,is_active)
     VALUES ($1,$2,$3,$4,$5,true,true)
     ON CONFLICT (email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role RETURNING id`,
    [`QA ${key}`, email, "55" + Math.floor(10000000 + Math.random() * 89999999), hash, role]);
  const { token } = await login(email, password);
  if (waiver && role === "client") {
    await api("POST", "/api/me/waiver", { token, body: {
      full_name: `QA ${key}`, signature_data: "data:image/png;base64,iVBORw0KGgo=" } });
  }
  return { id: u.id, email, password, token };
}

/** Instructora + tipo de clase compatible + plan de la misma categoría. */
export async function studioFixtures(prefix, adminToken) {
  const r = await api("POST", "/api/instructors", { token: adminToken, body: { displayName: `${prefix} Coach`, isActive: true } });
  const instructorId = r.body?.data?.id;
  const [ct] = await sql(`SELECT id, category FROM class_types WHERE is_active ORDER BY sort_order NULLS LAST LIMIT 1`);
  const [plan] = await sql(
    `SELECT id, name, price FROM plans WHERE is_active AND class_category=$1 AND class_limit>=8 ORDER BY class_limit LIMIT 1`, [ct.category]);
  return { instructorId, classTypeId: ct.id, category: ct.category, plan };
}

export async function makeClass(adminToken, f, { date = day(7), start = "07:00", end = "08:00", cap = 5 } = {}) {
  const r = await api("POST", "/api/classes", { token: adminToken, body: {
    classTypeId: f.classTypeId, instructorId: f.instructorId,
    startTime: `${date}T${start}`, endTime: `${date}T${end}`, maxCapacity: cap } });
  if (!r.body?.data?.id) throw new Error(`makeClass → ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
  return r.body.data.id;
}

export async function giveMembership(adminToken, userId, planId, credits = 8) {
  await api("POST", "/api/memberships", { token: adminToken, body: {
    userId, planId, paymentMethod: "cash", startDate: day(0) } });
  await sql(`UPDATE memberships SET classes_remaining=$2, status='active', end_date=$3 WHERE user_id=$1`,
    [userId, credits, day(60)]);
}

/** Borra todo lo sembrado por un prefijo. Se llama en after(). */
export async function cleanup(prefix) {
  await sql(`DELETE FROM bookings WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)
             OR class_id IN (SELECT id FROM classes WHERE instructor_id IN (SELECT id FROM instructors WHERE display_name LIKE $2))`,
            [`${prefix}%`, `${prefix}%`]);
  await sql(`DELETE FROM waivers WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${prefix}%`]);
  await sql(`DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))`, [`${prefix}%`]);
  await sql(`DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${prefix}%`]);
  await sql(`DELETE FROM memberships WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)`, [`${prefix}%`]);
  await sql(`DELETE FROM classes WHERE instructor_id IN (SELECT id FROM instructors WHERE display_name LIKE $1)`, [`${prefix}%`]);
  await sql(`DELETE FROM instructors WHERE display_name LIKE $1`, [`${prefix}%`]);
  await sql(`DELETE FROM users WHERE email LIKE $1`, [`${prefix}%`]);
  await sql(`DELETE FROM users WHERE email = $1`, [ADMIN.email]);
}
