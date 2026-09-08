// P1-1 · Recepción opera, pero no ve finanzas. Auditoría 2026-09-08.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, makeClient, cleanup, closeDb, ADMIN } from "./helpers.mjs";

const PFX = "rgperm";
let A, recepcion, clienta;

const FINANZAS = ["/api/reports/revenue", "/api/reports/overview", "/api/payments",
                  "/api/admin/bank-info", "/api/reports/instructors"];
const OPERACION = ["/api/admin/today-roster", "/api/users", "/api/admin/orders", "/api/classes"];

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  recepcion = await makeClient(PFX, "recep", { role: "reception", waiver: false });
  clienta = await makeClient(PFX, "cli");
});
after(async () => { await cleanup(PFX); await closeDb(); });

for (const ruta of FINANZAS) {
  test(`P1-1 recepción NO ve ${ruta}`, async () => {
    const r = await api("GET", ruta, { token: recepcion.token });
    assert.equal(r.status, 403, `recepción recibió ${r.status} en una ruta de finanzas`);
  });
}

for (const ruta of OPERACION) {
  test(`P1-1 recepción SÍ puede operar ${ruta}`, async () => {
    const r = await api("GET", ruta, { token: recepcion.token });
    assert.ok(r.status < 400, `recepción recibió ${r.status} en una ruta operativa`);
  });
}

test("P1-1 la clienta sigue sin entrar al panel", async () => {
  const r = await api("GET", "/api/reports/overview", { token: clienta.token });
  assert.equal(r.status, 403);
});

test("P1-1 el admin conserva acceso completo", async () => {
  for (const ruta of [...FINANZAS, ...OPERACION]) {
    const r = await api("GET", ruta, { token: A });
    assert.ok(r.status < 400, `admin recibió ${r.status} en ${ruta}`);
  }
});
