import { test } from "node:test";
import assert from "node:assert/strict";
import { rateKey } from "./rateKey.js";

const req = (auth, ip = "1.2.3.4") => ({ headers: { authorization: auth, "x-forwarded-for": ip }, ip });
const verify = (t) => { if (t === "bueno") return { userId: "u-1" }; throw new Error("jwt"); };

test("JWT válido → llave por usuaria", () => assert.equal(rateKey(req("Bearer bueno"), verify), "user:u-1"));
test("sin JWT o inválido → llave por IP", () => {
  assert.equal(rateKey(req(undefined), verify), "ip:1.2.3.4");
  assert.equal(rateKey(req("Bearer malo"), verify), "ip:1.2.3.4");
});
