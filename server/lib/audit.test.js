import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonProblem, cleanReason, changedFields, recordAudit, recordAuditBestEffort, buildAuditQuery, auditRowOut, AUDIT_ACTIONS } from "./audit.js";

const U = "3f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const V = "4f1b2c4d-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

test("reasonProblem: mínimo 5 caracteres sin contar espacios, máximo 500", () => {
  assert.match(reasonProblem(undefined), /mínimo 5/);
  assert.match(reasonProblem("   ok   "), /mínimo 5/);
  assert.match(reasonProblem(12345), /mínimo 5/);
  assert.equal(reasonProblem("Cortesía por evento"), null);
  assert.match(reasonProblem("x".repeat(501)), /máximo 500/);
});

test("cleanReason recorta y deja null si no hay", () => {
  assert.equal(cleanReason("  hola mundo  "), "hola mundo");
  assert.equal(cleanReason(""), null);
  assert.equal(cleanReason(null), null);
  assert.equal(cleanReason("x".repeat(600)).length, 500);
});

test("changedFields sólo devuelve lo que cambia, con normalización", () => {
  const before = { classes_remaining: null, end_date: "2026-10-01", status: "active" };
  const norm = (k, v) => (k === "classes_remaining" && (v == null || Number(v) >= 9999) ? "ilimitado" : v);
  const keys = ["classes_remaining", "status", "end_date"];
  assert.deepEqual(changedFields(before, { classes_remaining: 9999, status: "active" }, keys, norm).changed, []);
  assert.deepEqual(changedFields(before, { end_date: "2026-12-31", status: "active" }, keys, norm), {
    changed: ["end_date"], before: { end_date: "2026-10-01" }, after: { end_date: "2026-12-31" },
  });
});

test("recordAudit escribe una fila con actor, motivo limpio y JSON", async () => {
  const calls = [];
  const db = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } };
  await recordAudit(db, {
    actorId: U, action: "membership.adjust", entityType: "membership", entityId: V, subjectUserId: U,
    reason: "  Compensación  ", before: { classes_remaining: 1 }, after: { classes_remaining: 3 }, meta: { above_plan: false },
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO audit_log/);
  const [actor, action, type, entity, subject, reason, before, after, meta] = calls[0].params;
  assert.equal(actor, U);
  assert.equal(action, "membership.adjust");
  assert.equal(type, "membership");
  assert.equal(entity, V);
  assert.equal(subject, U);
  assert.equal(reason, "Compensación");
  assert.deepEqual(JSON.parse(before), { classes_remaining: 1 });
  assert.deepEqual(JSON.parse(after), { classes_remaining: 3 });
  assert.deepEqual(JSON.parse(meta), { above_plan: false });
});

test("recordAudit: ids que no son UUID quedan en null; acción o entidad desconocidas lanzan", async () => {
  const calls = [];
  const db = { query: async (_s, p) => { calls.push(p); return { rows: [] }; } };
  await recordAudit(db, { actorId: "no-uuid", action: "class.week_clear", entityType: "class_week" });
  assert.equal(calls[0][0], null);
  assert.equal(calls[0][3], null);
  assert.equal(calls[0][6], null);
  await assert.rejects(recordAudit(db, { action: "otra.cosa", entityType: "booking" }), /desconocida/);
  await assert.rejects(recordAudit(db, { action: "booking.cancel", entityType: "planeta" }), /desconocida/);
});

test("recordAuditBestEffort nunca lanza", async () => {
  const db = { query: async () => { throw new Error("base caída"); } };
  await assert.doesNotReject(recordAuditBestEffort(db, { action: "booking.checkin", entityType: "booking" }));
  await assert.doesNotReject(recordAuditBestEffort(db, { action: "otra.cosa", entityType: "booking" }));
});

test("buildAuditQuery: valores por defecto y paginación", () => {
  const q = buildAuditQuery({});
  assert.equal(q.ok, true);
  assert.equal(q.page, 1);
  assert.equal(q.limit, 50);
  assert.deepEqual(q.params, [50, 0]);
  assert.match(q.sql, /ORDER BY a\.created_at DESC/);
  assert.match(q.sql, /LIMIT \$1 OFFSET \$2/);
  assert.deepEqual(buildAuditQuery({ page: "3", limit: "20" }).params, [20, 40]);
});

test("buildAuditQuery: entidad (también la clienta), actor y fechas en la zona del estudio", () => {
  const q = buildAuditQuery(
    { entityType: "membership", entityId: U, actorId: V, from: "2026-09-01", to: "2026-09-30" },
    { timezone: "America/Mexico_City" },
  );
  assert.equal(q.ok, true);
  assert.deepEqual(q.countParams, ["membership", U, V, "2026-09-01", "2026-09-30"]);
  assert.match(q.countSql, /a\.entity_id = \$2::uuid OR a\.subject_user_id = \$2::uuid/);
  assert.match(q.countSql, /AT TIME ZONE 'America\/Mexico_City'/);
  assert.deepEqual(q.params.slice(-2), [50, 0]);
});

test("buildAuditQuery: entradas malas → ok:false con mensaje, nunca lanza", () => {
  for (const bad of [
    { entityType: "planeta" }, { action: "borrar.todo" }, { entityId: "basura" }, { actorId: "1" },
    { from: "2026-13-40" }, { to: "28/09/2026" }, { from: "2026-09-30", to: "2026-09-01" },
    { page: "0" }, { page: "-1" }, { page: "1.5" }, { limit: "0" }, { limit: "101" }, { limit: "abc" },
  ]) {
    const r = buildAuditQuery(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.equal(typeof r.message, "string");
  }
});

test("auditRowOut pasa a camelCase", () => {
  const out = auditRowOut({
    id: "x", created_at: "t", actor_id: U, actor_name: "Dueña", actor_role: "admin", action: "booking.cancel",
    entity_type: "booking", entity_id: V, subject_user_id: U, subject_name: "Ana", reason: "r", before: {}, after: {}, meta: null,
  });
  assert.equal(out.actorName, "Dueña");
  assert.equal(out.subjectName, "Ana");
  assert.deepEqual(out.meta, {});
});

test("acciones conocidas", () => {
  assert.ok(AUDIT_ACTIONS.includes("booking.no_show_corrected"));
  assert.ok(AUDIT_ACTIONS.includes("user.anonymize"));
});
