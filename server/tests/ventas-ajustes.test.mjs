// Auditoría 2026-09-27, bloque 2 (P0-3 · E2 · D12 · I5). Venta en
// mostrador con quién, referencia y motivo si es $0 o distinto al plan; ajustes
// de saldo/vigencia/estado con motivo; todo en la bitácora.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { api, login, sql, makeClient, studioFixtures, cleanup, closeDb, day, ADMIN, fakeSignaturePng } from "./helpers.mjs";

const PFX = "rgventas";
let A, adminId, f, listPrice;
const venta = (body) => api("POST", "/api/memberships", { token: A, body: { paymentMethod: "cash", startDate: day(0), ...body } });
const auditOf = (entityId, action) => sql(`SELECT * FROM audit_log WHERE entity_id = $1 AND action = $2 ORDER BY created_at`, [entityId, action]);
const membresiaDe = async (userId) => (await sql(
  `SELECT m.id, m.activated_by, m.activated_at, m.payment_reference, m.classes_remaining,
          o.id AS oid, o.order_number, o.total_amount, o.discount_amount
     FROM memberships m LEFT JOIN orders o ON o.id = m.order_id
    WHERE m.user_id = $1 ORDER BY m.created_at DESC LIMIT 1`, [userId]))[0];

before(async () => {
  const l = await login(ADMIN.email, ADMIN.password);
  A = l.token;
  adminId = l.user.id;
  f = await studioFixtures(PFX, A);
  const planes = await api("GET", "/api/plans", { token: A });
  listPrice = Number(planes.body.data.find((p) => p.id === f.plan.id).effectivePrice);
});
after(async () => {
  await cleanup(PFX);
  await sql(`DELETE FROM plans WHERE name LIKE $1`, [`${PFX}%`]);
  await closeDb();
});

test("venta al precio del plan: activated_by, referencia y bitácora sin motivo", async () => {
  const c = await makeClient(PFX, "lista");
  const r = await venta({ userId: c.id, planId: f.plan.id });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(m.activated_by, adminId);
  assert.ok(m.activated_at);
  assert.ok([m.order_number, m.oid].includes(m.payment_reference), `payment_reference=${m.payment_reference}`);
  assert.equal(Number(m.total_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.subject_user_id, c.id);
  assert.equal(log.reason, null);
  assert.equal(Number(log.after.amount), listPrice);
  assert.equal(log.meta.courtesy, false);
});

test("cortesía $0: sin motivo → 400 y no crea nada; con motivo → orden en $0 y sin puntos de compra", async () => {
  const c = await makeClient(PFX, "cortesia");
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: 0 });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql(`SELECT COUNT(*)::int n FROM memberships WHERE user_id=$1`, [c.id]))[0].n, 0);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: 0, reason: "Cortesía por evento de apertura" });
  assert.equal(con.status, 201, JSON.stringify(con.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), 0);
  assert.equal(Number(m.discount_amount), listPrice);
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.reason, "Cortesía por evento de apertura");
  assert.equal(log.meta.courtesy, true);
  const pts = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND description LIKE 'Membresía asignada%'`, [c.id]);
  assert.equal(pts[0].n, 0, "una cortesía no da puntos de compra");
});

test("precio distinto al plan: sin motivo → 400; con motivo → 201 con descuento", async () => {
  const c = await makeClient(PFX, "descuento");
  const cobrado = listPrice - 200;
  const sin = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado });
  assert.equal(sin.status, 400);
  const con = await venta({ userId: c.id, planId: f.plan.id, amount: cobrado, reason: "Descuento de amiga de la dueña" });
  assert.equal(con.status, 201);
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), cobrado);
  assert.equal(Number(m.discount_amount), 200);
});

test("la referencia escrita por la admin se guarda tal cual", async () => {
  const c = await makeClient(PFX, "referencia");
  const r = await venta({ userId: c.id, planId: f.plan.id, paymentMethod: "transfer", paymentReference: "SPEI 998877" });
  assert.equal(r.status, 201);
  assert.equal((await membresiaDe(c.id)).payment_reference, "SPEI 998877");
});

test("entradas malas en la venta → 400, nunca 500", async () => {
  const c = await makeClient(PFX, "malas");
  for (const body of [
    { userId: c.id, planId: f.plan.id, amount: "abc" },
    { userId: "basura", planId: f.plan.id },
    { userId: c.id, planId: f.plan.id, paymentReference: "x".repeat(101) },
    { userId: c.id, planId: f.plan.id, startDate: "no-es-fecha" },
    { userId: c.id, planId: f.plan.id, startDate: "2026-02-30" },
    { userId: c.id, planId: f.plan.id, startDate: "2026-09-25Tbasura" },
    { userId: c.id, planId: f.plan.id, startDate: "2026-09-25 junk" },
  ]) {
    const r = await venta(body);
    assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
  }
});

test("venta de un plan con precio de apertura: cobra el efectivo, sin motivo ni descuento falso", async () => {
  const c = await makeClient(PFX, "apertura");
  const [op] = await sql(
    `INSERT INTO plans (name, description, price, opening_price, currency, duration_days, class_limit, class_category, is_active, sort_order)
     VALUES ($1, 'QA apertura', 2700, 2300, 'MXN', 30, NULL, $2, true, 999) RETURNING id`,
    [`${PFX} apertura`, f.category],
  );
  const r = await venta({ userId: c.id, planId: op.id });
  assert.equal(r.status, 201, JSON.stringify(r.body).slice(0, 200));
  const m = await membresiaDe(c.id);
  assert.equal(Number(m.total_amount), 2300, "cobra el precio efectivo (de apertura), no el de lista");
  assert.equal(Number(m.discount_amount), 0, "sin descuento falso: lo cobrado es el precio de lista de apertura");
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.reason, null);
  assert.equal(log.meta.courtesy, false);
  assert.equal(log.meta.price_differs, false);
});

test("ajuste de saldo: sin motivo → 400 y no cambia; con motivo → 200 y bitácora antes/después", async () => {
  const c = await makeClient(PFX, "ajuste");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  await sql(`UPDATE memberships SET classes_remaining = 1 WHERE id = $1`, [m.id]);
  const sin = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3 } });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await membresiaDe(c.id)).classes_remaining, 1);
  const con = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { classesRemaining: 3, reason: "Compensación por clase cancelada" } });
  assert.equal(con.status, 200, JSON.stringify(con.body).slice(0, 200));
  assert.equal((await membresiaDe(c.id)).classes_remaining, 3);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.equal(log.actor_id, adminId);
  assert.equal(log.reason, "Compensación por clase cancelada");
  assert.deepEqual(log.before, { classes_remaining: 1 });
  assert.deepEqual(log.after, { classes_remaining: 3 });
});

test("ajuste con un id de membresía inválido → 400, nunca 500", async () => {
  const r = await api("PUT", `/api/memberships/basura`, { token: A, body: { classesRemaining: 3, reason: "Motivo válido" } });
  assert.equal(r.status, 400, JSON.stringify(r.body).slice(0, 200));
});

test("ajuste que deja el saldo por encima del plan: meta.above_plan en la bitácora", async () => {
  const c = await makeClient(PFX, "porencima");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const [{ class_limit }] = await sql(`SELECT class_limit FROM plans WHERE id=$1`, [f.plan.id]);
  const r = await api("PUT", `/api/memberships/${m.id}`, {
    token: A, body: { classesRemaining: Number(class_limit) + 5, reason: "Cortesía de clases extra por su cumpleaños" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.equal(log.meta.above_plan, true);
});

test("9999 sobre una membresía ilimitada (NULL): cambiar sólo el estado no toca classes_remaining", async () => {
  const c = await makeClient(PFX, "ilimitada");
  const [unl] = await sql(
    `INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
     VALUES ($1, 'QA ilimitado', 1900, 'MXN', 30, NULL, $2, true, 999) RETURNING id`,
    [`${PFX} ilimitado`, f.category],
  );
  await venta({ userId: c.id, planId: unl.id });
  const m = await membresiaDe(c.id);
  assert.equal(m.classes_remaining, null, "arranca ilimitada (NULL)");
  const r = await api("PUT", `/api/memberships/${m.id}`, {
    token: A, body: { status: "paused", classesRemaining: 9999, reason: "Pausa acordada con la clienta" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  assert.equal((await membresiaDe(c.id)).classes_remaining, null, "9999 y NULL son el mismo valor: no debe escribirse");
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.deepEqual(log.after, { status: "paused" }, "classes_remaining no cambió de verdad: no va en la bitácora");
});

test("venta normal + recalcular puntos: una sola fila, no duplica", async () => {
  const c = await makeClient(PFX, "lealtad-normal");
  await venta({ userId: c.id, planId: f.plan.id });
  const antes = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND type='earn'`, [c.id]);
  assert.equal(antes[0].n, 1, "la venta ya dejó su fila de puntos");
  const r = await api("POST", `/api/admin/loyalty/recalculate/${c.id}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const despues = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND type='earn'`, [c.id]);
  assert.equal(despues[0].n, 1, "recalcular no debe duplicar la fila de la venta");
});

test("cortesía + recalcular puntos: no da puntos retroactivos", async () => {
  const c = await makeClient(PFX, "lealtad-cortesia");
  await venta({ userId: c.id, planId: f.plan.id, amount: 0, reason: "Cortesía por evento de apertura" });
  const r = await api("POST", `/api/admin/loyalty/recalculate/${c.id}`, { token: A });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const pts = await sql(`SELECT COUNT(*)::int n FROM loyalty_transactions WHERE user_id=$1 AND type='earn'`, [c.id]);
  assert.equal(pts[0].n, 0, "una cortesía no debe recibir puntos retroactivos al recalcular");
});

test("guardar sin cambios (como el panel) no pide motivo ni escribe bitácora", async () => {
  const c = await makeClient(PFX, "igual");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const [cur] = await sql(`SELECT status::text AS status, classes_remaining, to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e FROM memberships WHERE id=$1`, [m.id]);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { status: cur.status, classesRemaining: cur.classes_remaining, startDate: cur.s, endDate: cur.e } });
  assert.equal(r.status, 200);
  assert.equal(r.body.unchanged, true);
  assert.equal((await auditOf(m.id, "membership.adjust")).length, 0);
});

test("cambiar sólo el método: sin motivo y queda en la bitácora", async () => {
  const c = await makeClient(PFX, "metodo");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body: { paymentMethod: "transfer" } });
  assert.equal(r.status, 200);
  const [log] = await auditOf(m.id, "membership.adjust");
  assert.deepEqual(log.after, { payment_method: "transfer" });
});

test("fechas inválidas o fin antes del inicio → 400", async () => {
  const c = await makeClient(PFX, "fechas");
  await venta({ userId: c.id, planId: f.plan.id });
  const m = await membresiaDe(c.id);
  for (const body of [{ endDate: "2026-13-45", reason: "Motivo válido" }, { startDate: day(10), endDate: day(1), reason: "Motivo válido" }, { classesRemaining: 2.5, reason: "Motivo válido" }]) {
    const r = await api("PUT", `/api/memberships/${m.id}`, { token: A, body });
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test("alta manual, firma y venta: activated_by, referencia y bitácora; cortesía exige motivo", async () => {
  const createAndSign = async (email, name) => {
    const created = await api("POST", "/api/admin/clients/manual", { token: A, body: { displayName: name, email, phone: "5512340000" } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const u = created.body.data.user;
    assert.equal((await sql('SELECT count(*)::int n FROM memberships WHERE user_id=$1',[u.id]))[0].n, 0);
    const signed = await api("POST", `/api/admin/users/${u.id}/waiver`, { token: A, body: {
      full_name: name, phone: "5512340000", waiver_version: "v3", signature_data: fakeSignaturePng(),
      emergency_contact_name: "Contacto QA", emergency_contact_phone: "5511112222",
    } });
    assert.equal(signed.status, 201, JSON.stringify(signed.body));
    return u;
  };
  const u = await createAndSign(`${PFX}_alta@qa.local`, "QA alta");
  const r = await venta({ userId: u.id, planId: f.plan.id, paymentReference: "Alta presencial QA" });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const m = await membresiaDe(u.id);
  assert.equal(m.activated_by, adminId);
  assert.equal(m.payment_reference, "Alta presencial QA");
  const [log] = await auditOf(m.id, "membership.sale");
  assert.equal(log.meta.source, "mostrador");

  const [p0] = await sql(`INSERT INTO plans (name, description, price, currency, duration_days, class_limit, class_category, is_active, sort_order)
                          VALUES ($1, 'QA cortesía', 0, 'MXN', 30, 1, $2, true, 999) RETURNING id`, [`${PFX} cortesía`, f.category]);
  const u0 = await createAndSign(`${PFX}_alta0@qa.local`, "QA alta 0");
  const sin = await venta({ userId: u0.id, planId: p0.id });
  assert.equal(sin.status, 400);
  assert.equal(sin.body.code, "REASON_REQUIRED");
  assert.equal((await sql('SELECT count(*)::int n FROM memberships WHERE user_id=$1',[u0.id]))[0].n, 0);
  assert.equal((await sql('SELECT count(*)::int n FROM orders WHERE user_id=$1',[u0.id]))[0].n, 0, "el cobro fallido no crea venta");
  const con = await venta({ userId: u0.id, planId: p0.id, reason: "Cortesía por evento de apertura" });
  assert.equal(con.status, 201, JSON.stringify(con.body));
  assert.equal((await sql('SELECT count(*)::int n FROM orders WHERE user_id=$1',[u0.id]))[0].n, 1);
});
