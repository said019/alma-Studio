import crypto from "crypto";

// Headers donde Wellhub/Gympass puede mandar la firma (primero que exista gana).
const SIGNATURE_HEADERS = [
  "x-gympass-signature",
  "x-api-signature",
  "x-wellhub-signature",
  "x-hub-signature",
  "x-signature",
];

export function extractSignatureHeader(headers = {}) {
  const lower = {};
  for (const k of Object.keys(headers)) lower[k.toLowerCase()] = headers[k];
  for (const h of SIGNATURE_HEADERS) {
    if (lower[h]) return String(lower[h]);
  }
  return null;
}

function normalize(sig) {
  return String(sig || "").replace(/^sha1=/i, "").trim().toLowerCase();
}

// Verifica HMAC-SHA1 del cuerpo crudo. Retorna true/false, o `null` si no hay
// secret configurado (en cuyo caso el caller decide si omite — solo prod exige).
export function verifyWellhubSignature(rawBody, headerSig, secret) {
  if (!secret) return null;
  if (!headerSig) return false;
  const expected = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
  const got = normalize(headerSig);
  if (got.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
