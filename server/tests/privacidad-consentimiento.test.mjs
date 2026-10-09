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
  phone: "+525512345678", gender: "other", dateOfBirth: "1990-05-05", acceptsTerms: true, acceptsCommunications: false, ...extra,
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

test("el personal que edita su propio perfil no queda bloqueado por la casilla", async () => {
  const staff = await makeClient(PFX, "staffself", { role: "admin", waiver: false });
  const r = await api("PUT", `/api/users/${staff.id}`, { token: staff.token, body: { healthNotes: "Notas del staff" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal((await salud(staff.id)).health_notes, "Notas del staff");
});

// La casilla la da la titular de los datos: recepción tampoco queda bloqueada
// al editar su propio perfil, no sólo admin.
test("el personal de recepción que edita su propio perfil tampoco queda bloqueado", async () => {
  const staff = await makeClient(PFX, "recepself", { role: "reception", waiver: false });
  const r = await api("PUT", `/api/users/${staff.id}`, { token: staff.token, body: { healthNotes: "Notas de recepción" } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal((await salud(staff.id)).health_notes, "Notas de recepción");
});

// Un tipo raro en healthNotes haría fallar la escritura con un 500: debe dar
// 400 en español antes de tocar la fila.
test("healthNotes con un tipo que no es texto → 400 en español y no cambia nada", async () => {
  const c = await makeClient(PFX, "tiporaro");
  const antes = await salud(c.id);
  const r = await api("PUT", `/api/users/${c.id}`, { token: c.token, body: { healthNotes: 12345 } });
  assert.equal(r.status, 400, JSON.stringify(r.body).slice(0, 200));
  assert.equal(r.body.message, "Las notas de salud deben ser texto.");
  assert.deepEqual(await salud(c.id), antes);
  const rArr = await api("PUT", `/api/users/${c.id}`, { token: c.token, body: { healthNotes: ["Asma"] } });
  assert.equal(rArr.status, 400);
});

// Retirar el consentimiento sólo borra las 5 columnas de salud; el resto de la
// fila (cuestionario, contacto de emergencia) no depende de él y queda intacto.
test("retirar el consentimiento deja intacto el resto de la fila", async () => {
  const c = await makeClient(PFX, "retiraintacto");
  await sql(
    `UPDATE users SET emergency_contact_name = 'Mamá', emergency_contact_phone = '+525599998888', practiced_barre_before = true WHERE id = $1`,
    [c.id],
  );
  assert.equal((await editar(c, { healthNotes: "Hernia", healthConsent: true })).status, 200);
  const r = await api("DELETE", "/api/me/health-consent", { token: c.token });
  assert.equal(r.status, 200);
  const [row] = await sql(
    `SELECT emergency_contact_name, emergency_contact_phone, practiced_barre_before FROM users WHERE id = $1`, [c.id],
  );
  assert.equal(row.emergency_contact_name, "Mamá");
  assert.equal(row.emergency_contact_phone, "+525599998888");
  assert.equal(row.practiced_barre_before, true);
});

// El 400 del cuestionario (falta la casilla) se decide antes de escribir: no
// deja nada a medias en la fila.
test("el 400 del cuestionario por falta de consentimiento no cambia nada", async () => {
  const c = await makeClient(PFX, "onboarding400");
  const antes = await sql(
    `SELECT has_injury, injury_details, practiced_barre_before, onboarding_completed FROM users WHERE id = $1`, [c.id],
  );
  const r = await api("POST", "/api/auth/onboarding", { token: c.token, body: { hasInjury: true, practicedBarreBefore: true, injuryDetails: "Rodilla" } });
  assert.equal(r.status, 400);
  assert.equal(r.body.code, "HEALTH_CONSENT_REQUIRED");
  const despues = await sql(
    `SELECT has_injury, injury_details, practiced_barre_before, onboarding_completed FROM users WHERE id = $1`, [c.id],
  );
  assert.deepEqual(despues, antes);
});

// El registro no acepta datos de salud directos (sólo la casilla
// healthConsent): se capturan después, con el consentimiento a la vista. Si
// alguien los manda igual, se descartan.
test("un registro con datos de salud en el cuerpo los descarta", async () => {
  const r = await registrar("saludenregistro", { healthNotes: "Debe ignorarse", injuryDetails: "Tampoco esto", hasInjury: true });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const s = await salud(r.body.user.id);
  assert.equal(s.health_notes, null);
  assert.equal(s.has_injury, null);
  assert.equal(s.injury_details, null);
});
