import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { rateKey } from "./rateKey.js";

const req = (auth, ip = "1.2.3.4") => ({ headers: { authorization: auth, "x-forwarded-for": ip }, ip });
const verify = (t) => { if (t === "bueno") return { sub: "u-1" }; throw new Error("jwt"); };

test("JWT válido → llave por usuaria", () => assert.equal(rateKey(req("Bearer bueno"), verify), "user:u-1"));
test("sin JWT o inválido → llave por IP", () => {
  assert.equal(rateKey(req(undefined), verify), "ip:1.2.3.4");
  assert.equal(rateKey(req("Bearer malo"), verify), "ip:1.2.3.4");
});

// authMiddleware sólo acepta `sub` como id de la usuaria: un token firmado con
// otro campo (p. ej. el de magic link, { userId }) no abre sesión, así que
// tampoco debe ganar un balde propio en el limitador.
test("token firmado con {userId} y sin sub → llave por IP, igual que authMiddleware", () => {
  const SECRET = "secreto-de-prueba";
  const verifyReal = (t) => jwt.verify(t, SECRET);
  const conSub = jwt.sign({ sub: "u-9" }, SECRET);
  const sinSub = jwt.sign({ userId: "u-9", role: "client" }, SECRET);
  assert.equal(rateKey(req(`Bearer ${conSub}`), verifyReal), "user:u-9");
  assert.equal(rateKey(req(`Bearer ${sinSub}`), verifyReal), "ip:1.2.3.4");
});
