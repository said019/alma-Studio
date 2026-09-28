// Auditoría de producción 2026-09-27, P0-2 (Task 2): las claves de Wellhub
// nunca llegan al navegador — GET enmascarado, PUT que conserva el secreto
// guardado cuando llega vacío o enmascarado, sólo la dueña puede leer/editar,
// y el webhook se rechaza si la integración está encendida sin secreto.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, makeClient, sql, cleanup, closeDb, ADMIN } from "./helpers.mjs";

const PFX = "wbajust";
let A, recepcion;

before(async () => {
  A = (await login(ADMIN.email, ADMIN.password)).token;
  recepcion = await makeClient(PFX, "r", { role: "reception" });
});

after(async () => {
  // La fila de Wellhub es un singleton (channel='wellhub'), no algo sembrado
  // por prefijo: cleanup() no la toca. La dejamos apagada, como al empezar.
  await sql(`UPDATE platform_credentials SET is_enabled=false WHERE channel='wellhub'`);
  await cleanup(PFX);
  await closeDb();
});

test("PUT guarda el secreto real; GET nunca lo expone", async () => {
  const put = await api("PUT", "/api/partners/settings", {
    token: A,
    body: {
      environment: "production", is_enabled: true, gym_id: "g-qa",
      webhook_secret: "s3cr3t-webhook-abcd", access_token: "tok-secreto-xyz",
    },
  });
  assert.equal(put.status, 200);
  assert.ok(!JSON.stringify(put.body).includes("s3cr3t"), "el PUT no debe devolver el secreto en claro");

  const get = await api("GET", "/api/partners/settings", { token: A });
  assert.equal(get.status, 200);
  assert.ok(!JSON.stringify(get.body).includes("s3cr3t"), "el GET no debe devolver el secreto en claro");
  assert.equal(get.body.data.has_webhook_secret, true);
  assert.equal(get.body.data.has_access_token, true);
});

test("PUT con el secreto enmascarado no sobrescribe el valor guardado", async () => {
  const put = await api("PUT", "/api/partners/settings", {
    token: A,
    body: {
      environment: "production", is_enabled: true, gym_id: "g-qa",
      webhook_secret: "••••abcd",
    },
  });
  assert.equal(put.status, 200);

  const [row] = await sql(`SELECT webhook_secret FROM platform_credentials WHERE channel='wellhub'`);
  assert.equal(row.webhook_secret, "s3cr3t-webhook-abcd");
});

test("recepción no puede leer los ajustes de partners", async () => {
  const r = await api("GET", "/api/partners/settings", { token: recepcion.token });
  assert.equal(r.status, 403);
});

test("webhook rechazado cuando la integración está encendida sin webhook_secret configurado", async () => {
  // Precondición: base sin secreto (el defecto que causó la auditoría).
  await sql(`UPDATE platform_credentials SET webhook_secret=NULL WHERE channel='wellhub'`);

  const put = await api("PUT", "/api/partners/settings", {
    token: A,
    body: { environment: "production", is_enabled: true, gym_id: "g-qa" },
  });
  assert.equal(put.status, 200);
  assert.equal(put.body.data.has_webhook_secret, false);

  const r = await api("POST", "/webhooks/wellhub/checkin", {
    raw: JSON.stringify({ event_type: "checkin", gym_id: "g-qa" }),
  });
  assert.equal(r.status, 401);

  await sql(`UPDATE platform_credentials SET is_enabled=false WHERE channel='wellhub'`);
});
