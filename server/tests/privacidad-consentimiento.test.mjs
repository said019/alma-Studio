// Tarea 8 · auditoría 2026-09-27, bloque 3 (P1-10 · L2 · L3). Consentimiento
// expreso para datos de salud: se registra versión y fecha; una clienta que
// escribe salud sin él no guarda nada; editar otros datos nunca lo pide; el
// personal no queda bloqueado; retirarlo borra los datos de salud.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, cleanup, closeDb, ADMIN } from "./helpers.mjs";

const PFX = "rgpriv";
const VERSION = "2026-09-28";
let A;

const registrar = (key, extra = {}) => api("POST", "/api/auth/register", { body: {
  email: `${PFX}_${key}@qa.local`, password: "QaPass!2026", displayName: `QA ${key}`,
  phone: "+525500000000", acceptsTerms: true, acceptsCommunications: false, ...extra,
} });
const editar = (c, body) => api("PUT", `/api/users/${c.id}`, { token: c.token, body });
const salud = async (id) => (await sql(
  `SELECT health_notes, has_injury, injury_details, health_consent_version, health_consent_at FROM users WHERE id = $1`, [id]))[0];

before(async () => { A = (await login(ADMIN.email, ADMIN.password)).token; });
after(async () => { await cleanup(PFX); await closeDb(); });

test("registrarse deja la versión y la fecha del aviso; la casilla de salud es opcional y se registra si se marca", async () => {
  const a = await registrar("sinsalud");
  assert.equal(a.status, 201, JSON.stringify(a.body).slice(0, 200));
  assert.equal(a.body.user.privacyNoticeVersion, VERSION);
  assert.equal(a.body.user.healthConsentVersion, null);
  const [ua] = await sql(`SELECT privacy_notice_version, privacy_accepted_at, health_consent_at FROM users WHERE email = $1`, [`${PFX}_sinsalud@qa.local`]);
  assert.equal(ua.privacy_notice_version, VERSION);
  assert.ok(ua.privacy_accepted_at);
  assert.equal(ua.health_consent_at, null);
  const b = await registrar("consalud", { healthConsent: true });
  assert.equal(b.status, 201);
  assert.equal(b.body.user.healthConsentVersion, VERSION);
  assert.ok(b.body.user.healthConsentAt);
});

test("una clienta existente que escribe notas de salud sin la casilla → 400 y no cambia nada; con la casilla se guarda", async () => {
  const c = await makeClient(PFX, "existente");
  const sin = await editar(c, { healthNotes: "Lesión en rodilla derecha" });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "HEALTH_CONSENT_REQUIRED");
  assert.equal(sin.body.message, "Para guardar datos de salud necesitamos tu consentimiento expreso: marca la casilla del aviso de privacidad.");
  assert.equal((await salud(c.id)).health_notes, null);
  const con = await editar(c, { healthNotes: "Lesión en rodilla derecha", healthConsent: true });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal(con.body.user.healthNotes, "Lesión en rodilla derecha");
  assert.equal(con.body.user.healthConsentVersion, VERSION);
  const s = await salud(c.id);
  assert.equal(s.health_consent_version, VERSION);
  assert.ok(s.health_consent_at);
  const despues = await editar(c, { healthNotes: "Rodilla y hombro" });
  assert.equal(despues.status, 200, "con el consentimiento vigente ya no se pide la casilla");
});

test("editar otros datos no pide la casilla, aunque ya tenga notas de salud guardadas", async () => {
  const c = await makeClient(PFX, "otros");
  await sql(`UPDATE users SET health_notes = 'Asma' WHERE id = $1`, [c.id]);
  const r = await editar(c, { displayName: "QA otros nuevo", phone: "+525512345678", healthNotes: "Asma" });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.user.displayName, "QA otros nuevo");
});

test("el personal no queda bloqueado al capturar salud", async () => {
  const c = await makeClient(PFX, "staff");
  const r = await api("PUT", `/api/users/${c.id}`, { token: A, body: { healthNotes: "Embarazo de 12 semanas" } });
  assert.equal(r.status, 200);
  assert.equal((await salud(c.id)).health_notes, "Embarazo de 12 semanas");
  assert.equal((await api("PUT", `/api/users/${crypto.randomUUID()}`, { token: A, body: { displayName: "Nadie" } })).status, 404);
});

test("retirar el consentimiento borra los datos de salud y la casilla se vuelve a pedir", async () => {
  const c = await makeClient(PFX, "retira");
  assert.equal((await editar(c, { healthNotes: "Hernia", healthConsent: true })).status, 200);
  await sql(`UPDATE users SET has_injury = true, injury_details = 'Hernia lumbar' WHERE id = $1`, [c.id]);
  const r = await api("DELETE", "/api/me/health-consent", { token: c.token });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.healthConsentVersion, null);
  const s = await salud(c.id);
  for (const k of ["health_notes", "has_injury", "injury_details", "health_consent_version", "health_consent_at"]) assert.equal(s[k], null, k);
  assert.equal((await editar(c, { healthNotes: "Hernia" })).status, 400);
});

test("el cuestionario también pide la casilla cuando reporta una lesión", async () => {
  const c = await makeClient(PFX, "cuestionario");
  const sin = await api("POST", "/api/auth/onboarding", { token: c.token, body: { hasInjury: true, practicedBarreBefore: false, injuryDetails: "Tobillo" } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "HEALTH_CONSENT_REQUIRED");
  const con = await api("POST", "/api/auth/onboarding", { token: c.token, body: { hasInjury: true, practicedBarreBefore: false, injuryDetails: "Tobillo", healthConsent: true } });
  assert.equal(con.status, 200);
  assert.equal(con.body.user.injuryDetails, "Tobillo");
  assert.equal(con.body.user.healthConsentVersion, VERSION);
  const otra = await makeClient(PFX, "sinlesion");
  const r = await api("POST", "/api/auth/onboarding", { token: otra.token, body: { hasInjury: false, practicedBarreBefore: true } });
  assert.equal(r.status, 200, "sin lesión no se pide la casilla");
});

test("el personal que edita su propio perfil no queda bloqueado por la casilla (R12)", async () => {
  const staff = await makeClient(PFX, "staffself", { role: "admin", waiver: false });
  const r = await api("PUT", `/api/users/${staff.id}`, { token: staff.token, body: { healthNotes: "Notas del staff" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal((await salud(staff.id)).health_notes, "Notas del staff");
});
