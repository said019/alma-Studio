// Guardia de marca: los mensajes salientes que no son correo (plantillas de
// WhatsApp, los textos por defecto del pase de wallet y la responsiva vigente)
// no deben mencionar "Alma" ni "Alma Movement". La única excepción permitida
// es el dominio histórico (almamovement.com.mx), conservado en enlaces previos
// por compatibilidad; los enlaces nuevos usan hivestudio.com.mx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "./notificationTemplates.js";
import { PASS_DEFAULT_TEXTS, LOYALTY_MILESTONES_SEED } from "./passDefaults.js";
import { responsivaDocument, CURRENT_RESPONSIVA_VERSION } from "./responsiva.js";

const ALMA_RE = /alma/i;
// Quita cualquier URL/dominio real antes de buscar "alma": así "almamovement.com.mx"
// (y sus variantes con www./https://) no cuenta como marca residual.
const ALLOWED_DOMAIN_RE = /(https?:\/\/)?(www\.)?almamovement\.com\.mx\S*/gi;

function residueIn(label, text) {
  if (text == null) return [];
  const raw = String(text);
  const withoutAllowedDomains = raw.replace(ALLOWED_DOMAIN_RE, "");
  return ALMA_RE.test(withoutAllowedDomains) ? [`${label}: "${raw}"`] : [];
}

test("DEFAULT_NOTIFICATION_TEMPLATES (plantillas de WhatsApp) no mencionan Alma", () => {
  const residue = [];
  for (const [key, tpl] of Object.entries(DEFAULT_NOTIFICATION_TEMPLATES)) {
    residue.push(...residueIn(`${key}.subject`, tpl.subject));
    residue.push(...residueIn(`${key}.body`, tpl.body));
  }
  assert.deepEqual(residue, [], `Quedó marca residual en DEFAULT_NOTIFICATION_TEMPLATES:\n${residue.join("\n")}`);
});

test("PASS_DEFAULT_TEXTS (textos por defecto del pase de wallet) no mencionan Alma", () => {
  const residue = [];
  for (const [key, value] of Object.entries(PASS_DEFAULT_TEXTS)) {
    residue.push(...residueIn(key, value));
  }
  assert.deepEqual(residue, [], `Quedó marca residual en PASS_DEFAULT_TEXTS:\n${residue.join("\n")}`);
});

test("la responsiva vigente (la que se firma hoy) no menciona Alma", () => {
  // La v1 conserva su texto original a propósito: es lo que firmaron las
  // clientas de antes y su PDF debe salir igual (server/lib/responsiva.js).
  const doc = responsivaDocument(CURRENT_RESPONSIVA_VERSION);
  const residue = [...residueIn("studio", doc.studio), ...residueIn("title", doc.title)];
  for (const section of doc.sections) {
    residue.push(...residueIn(`sección ${section.n} (${section.title}) · title`, section.title));
    residue.push(...residueIn(`sección ${section.n} (${section.title}) · body`, section.body));
  }
  assert.deepEqual(residue, [], `Quedó marca residual en la responsiva vigente:\n${residue.join("\n")}`);
});

test("LOYALTY_MILESTONES_SEED (siembra de loyalty_milestones) no menciona Alma", () => {
  const residue = [];
  for (const m of LOYALTY_MILESTONES_SEED) {
    residue.push(...residueIn(`${m.messageTemplateKey}.name`, m.name));
    residue.push(...residueIn(`${m.messageTemplateKey}.description`, m.description));
  }
  assert.deepEqual(residue, [], `Quedó marca residual en LOYALTY_MILESTONES_SEED:\n${residue.join("\n")}`);
});

test("la excepción del dominio real no deja pasar 'Alma' fuera de una URL", () => {
  // Guarda contra un regex demasiado permisivo: un texto que combine el
  // dominio permitido con una mención real de marca debe seguir fallando.
  const trampa = "Bienvenida a Alma Movement, visita https://www.almamovement.com.mx";
  assert.equal(residueIn("trampa", trampa).length, 1);
  // Pero el dominio solo, sin nada más, sí debe pasar.
  const limpio = "Visítanos en https://www.almamovement.com.mx/app";
  assert.equal(residueIn("limpio", limpio).length, 0);
});
