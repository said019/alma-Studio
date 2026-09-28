// Guardia de marca: los mensajes salientes que no son correo (plantillas de
// WhatsApp y los textos por defecto del pase de wallet / PDF de responsiva)
// no deben mencionar "Alma" ni "Alma Movement". La única excepción permitida
// es el dominio real del sitio (almamovement.com.mx), que sí se queda: es la
// URL pública del estudio, no la marca anterior.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NOTIFICATION_TEMPLATES } from "./notificationTemplates.js";
import { PASS_DEFAULT_TEXTS, RESPONSIVA_PDF_HEADER, RESPONSIVA_PDF_SECTIONS } from "./passDefaults.js";

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

test("RESPONSIVA_PDF_SECTIONS (PDF de responsiva) no mencionan Alma", () => {
  const residue = [...residueIn("header", RESPONSIVA_PDF_HEADER)];
  for (const section of RESPONSIVA_PDF_SECTIONS) {
    residue.push(...residueIn(`sección ${section.n} (${section.title}) · title`, section.title));
    residue.push(...residueIn(`sección ${section.n} (${section.title}) · body`, section.body));
  }
  assert.deepEqual(residue, [], `Quedó marca residual en RESPONSIVA_PDF_SECTIONS:\n${residue.join("\n")}`);
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
