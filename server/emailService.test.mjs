import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { EMAIL_SAMPLES } from "./emailSamples.mjs";

// Valores por defecto: sin remitente, sitio, número ni llave de Resend en el
// entorno. Las pruebas sólo usan los render; ninguna envía correos.
for (const k of ["EMAIL_FROM", "SITE_URL", "RESEND_API_KEY", "STUDIO_PHONE", "EMAIL_BCC"]) delete process.env[k];
const mail = await import("./emailService.js");

const DEFAULT_FROM = "HIVE Pilates Studio <noreply@agendafull.com.mx>";
const LOGO = "https://www.almamovement.com.mx/email/hive-mark.png";
const FORBIDDEN = [/Alma/, /alma-movement/i, /Move with intention/i, /Juriquilla/i];

const render = (s) => mail[s.render](s.opts);
/** Texto visible: sin comentarios condicionales, head, etiquetas ni entidades de espacio. */
function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<head[\s\S]*?<\/head>/i, " ")
    .replace(/<\/?(strong|b|em|span|a)(\s[^>]*)?>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#847;|&zwnj;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const count = (html, re) => (html.match(re) || []).length;

test("hay un ejemplo por cada uno de los 8 correos", () => {
  const principales = EMAIL_SAMPLES.filter((s) => !s.variant);
  assert.equal(principales.length, 8);
  assert.equal(new Set(principales.map((s) => s.render)).size, 8);
  for (const s of EMAIL_SAMPLES) assert.equal(typeof mail[s.render], "function", s.render);
});

test("remitente y sitio por defecto", () => {
  assert.equal(mail.FROM_EMAIL, DEFAULT_FROM);
  assert.equal(mail.SITE_URL, "https://www.almamovement.com.mx");
  assert.equal(mail.LOGO_URL, LOGO);
});

for (const s of EMAIL_SAMPLES) {
  test(`${s.id}: marca HIVE, logo y remitente nuevos`, () => {
    const msg = render(s);
    assert.equal(msg.from, DEFAULT_FROM);
    assert.equal(msg.to, s.opts.to);
    assert.equal(msg.subject, s.subject);
    assert.match(msg.html, /HIVE/);
    assert.ok(msg.html.includes(`src="${LOGO}"`), "falta la URL del logo");
    assert.match(msg.html, /<img src="[^"]+" width="40" height="46" alt="HIVE"/);
    const text = visibleText(msg.html);
    assert.match(text, /MOVIMIENTO · BIENESTAR · COMUNIDAD/);
    assert.ok(text.includes("Cuauhtémoc #68, Del Carmen, Coyoacán, C.P. 04100, CDMX"), "falta la dirección");
    assert.ok(text.includes(`© ${new Date().getFullYear()} HIVE Pilates Studio`), "falta el ©");
    assert.ok(text.includes("www.almamovement.com.mx"), "el enlace del sitio muestra el dominio real");
  });

  test(`${s.id}: sin rastro de la marca anterior`, () => {
    const msg = render(s);
    for (const re of FORBIDDEN) {
      assert.doesNotMatch(msg.html, re, `html contiene ${re}`);
      assert.doesNotMatch(msg.subject, re, `asunto contiene ${re}`);
      assert.doesNotMatch(msg.from, re, `remitente contiene ${re}`);
    }
  });

  test(`${s.id}: HTML válido de forma básica y sin variables vacías`, () => {
    const { html } = render(s);
    assert.match(html, /^<!DOCTYPE html>/);
    assert.ok(html.includes("<html") && html.trimEnd().endsWith("</html>"));
    assert.equal(count(html, /<body[\s>]/g), 1);
    assert.equal(count(html, /<\/body>/g), 1);
    for (const tag of ["table", "tr", "td", "p", "a"]) {
      assert.equal(count(html, new RegExp(`<${tag}[\\s>]`, "g")), count(html, new RegExp(`</${tag}>`, "g")), `<${tag}> sin cerrar`);
    }
    assert.match(html, /<meta name="color-scheme" content="light">/);
    assert.match(html, /<meta name="supported-color-schemes" content="light">/);
    assert.doesNotMatch(html, /\bundefined\b|\bnull\b|\bNaN\b|\[object Object\]/);
    assert.doesNotMatch(html, /\b(display\s*:\s*(flex|grid)|mask\s*:|-webkit-mask)/i, "CSS no apto para correo");
  });

  test(`${s.id}: tabla de datos`, () => {
    const { html } = render(s);
    if (!s.table) {
      assert.ok(!html.includes('class="hive-datos"'), "este correo no lleva tabla de datos");
      return;
    }
    assert.equal(count(html, /class="hive-datos"/g), 1);
    const tabla = html.slice(html.indexOf('class="hive-datos"'), html.indexOf("</table>", html.indexOf('class="hive-datos"')));
    const etiquetas = [...tabla.matchAll(/<td class="hive-label"[^>]*>([^<]+)<\/td>/g)].map((m) => m[1]);
    assert.deepEqual(etiquetas, s.table);
  });
}

test("reserva confirmada: datos de la clase y política de cancelación intacta", () => {
  const s = EMAIL_SAMPLES.find((x) => x.id === "2-reserva-confirmada");
  const text = visibleText(render(s).html);
  for (const v of ["Pilates Reformer", "7:00 am", "Ana", "2 clases restantes", "✓ Confirmada", "Ver mis reservas"]) {
    assert.ok(text.includes(v), `falta ${v}`);
  }
  assert.ok(text.includes("Puedes cancelar tu reserva hasta 12 horas antes para recuperar tu clase."));
  const otra = visibleText(mail.renderBookingConfirmed({ ...s.opts, cancelHours: 6 }).html);
  assert.ok(otra.includes("hasta 6 horas antes"));
});

test("lista de espera: aviso, píldora y paquete ilimitado", () => {
  const s = EMAIL_SAMPLES.find((x) => x.id === "2b-reserva-lista-de-espera");
  const text = visibleText(render(s).html);
  assert.ok(text.includes("Estás en la lista de espera. Te notificaremos si se libera un lugar."));
  assert.ok(text.includes("Ilimitadas"));
});

test("cancelación: los textos de crédito conservan su significado", () => {
  const aTiempo = visibleText(render(EMAIL_SAMPLES.find((x) => x.id === "3-reserva-cancelada")).html);
  assert.ok(aTiempo.includes("Tu clase regresó a tu paquete. Cancelaste con más de 12 horas de anticipación."));
  assert.ok(aTiempo.includes("¿Quieres reservar otra clase?"));
  const tardia = visibleText(render(EMAIL_SAMPLES.find((x) => x.id === "3b-reserva-cancelada-tardia")).html);
  assert.ok(tardia.includes(
    "Esta vez la clase no regresó a tu paquete. La cancelación fue con menos de 12 horas de anticipación, como indica nuestra política.",
  ));
  assert.ok(tardia.includes("Si tienes dudas sobre la política de cancelación"));
});

test("contacto honesto: Instagram sin número del estudio, WhatsApp con STUDIO_PHONE", () => {
  const s = EMAIL_SAMPLES.find((x) => x.id === "7-comprobante-rechazado");
  const sinNumero = render(s).html;
  assert.ok(sinNumero.includes('href="https://www.instagram.com/hive.pilates"'));
  assert.ok(!sinNumero.includes("wa.me"), "sin número no hay liga de WhatsApp");
  assert.ok(visibleText(sinNumero).includes("El monto de la transferencia no coincide con el paquete."));
  process.env.STUDIO_PHONE = "5512345678";
  try {
    const conNumero = render(s).html;
    assert.ok(conNumero.includes('href="https://wa.me/5215512345678"'));
    assert.ok(visibleText(conNumero).includes("Contactar por WhatsApp"));
  } finally {
    delete process.env.STUDIO_PHONE;
  }
});

test("recuperar contraseña: botón y enlace de respaldo con el token", () => {
  const s = EMAIL_SAMPLES.find((x) => x.id === "6-recuperar-contrasena");
  const { html } = render(s);
  const url = "https://www.almamovement.com.mx/auth/reset-password?token=muestra-7f3a9c2e";
  assert.equal(count(html, new RegExp(`href="${url.replace(/[.?]/g, "\\$&")}"`, "g")), 2);
  assert.ok(visibleText(html).includes("Restablecer mi contraseña"));
  assert.ok(visibleText(html).includes("El enlace expira en 2 horas."));
});

test("los datos de la clienta se escapan", () => {
  const { html, subject } = mail.renderBookingConfirmed({
    to: "x@example.com", name: "<b>Eva</b>", className: "Reformer & Mat", date: "2026-12-15T12:00:00Z",
    startTime: "08:00", instructor: '<img src="x">', classesLeft: 3, isWaitlist: false,
  });
  assert.ok(!html.includes("<b>Eva</b>") && !html.includes('<img src="x">'));
  assert.ok(html.includes("&lt;b&gt;Eva&lt;/b&gt;"));
  assert.ok(html.includes("Reformer &amp; Mat"));
  assert.equal(subject, "Reserva confirmada — Reformer & Mat");
});

test("sin nombre ni clase no quedan huecos", () => {
  const { html } = mail.renderBookingConfirmed({ to: "x@example.com", date: null, startTime: null });
  assert.doesNotMatch(html, /\bundefined\b|\bnull\b/);
  assert.ok(visibleText(html).includes("Nos vemos en clase."));
  const semanal = mail.renderWeeklyReminder({ to: "x@example.com", classesLeft: 9999 });
  assert.ok(visibleText(semanal.html).includes("Clases ilimitadas"));
});

test("los datos del estudio coinciden con src/lib/studio.ts", () => {
  const ts = fs.readFileSync(new URL("../src/lib/studio.ts", import.meta.url), "utf8");
  const campo = (k) => ts.match(new RegExp(`${k}: "([^"]+)"`))?.[1];
  assert.equal(mail.STUDIO.name, campo("name"));
  assert.equal(mail.STUDIO.address, campo("address"));
  assert.equal(mail.STUDIO.instagram, campo("instagram"));
});

test("public/email/hive-mark.png: PNG con transparencia a 3× del tamaño en el correo", () => {
  const png = fs.readFileSync(new URL("../public/email/hive-mark.png", import.meta.url));
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.equal(png.subarray(12, 16).toString("ascii"), "IHDR");
  assert.equal(png.readUInt32BE(16), mail.LOGO_W * 3);
  assert.equal(png.readUInt32BE(20), mail.LOGO_H * 3);
  assert.equal(png[25], 6, "color RGBA (con canal alfa)");
  assert.ok(fs.existsSync(new URL("../public/email-logo.png", import.meta.url)), "email-logo.png se conserva");
});

test("bienvenida de administradora: correo y contraseña temporal completos", () => {
  const s = EMAIL_SAMPLES.find((x) => x.id === "8-bienvenida-administradora");
  const text = visibleText(render(s).html);
  assert.ok(text.includes("Correo fernanda.lopez@example.com"));
  assert.ok(text.includes("Contraseña temporal Hive-7kP2q9"));
  assert.ok(text.includes("Perfil → Editar perfil → Seguridad"));
});

test("píldora de estado: texto en tinta sobre terracota suave (AA); el ✓ es decorativo", () => {
  const pildora = (html) => html.match(/<td bgcolor="#F3DED3" class="hive-pill" style="([^"]*)">([\s\S]*?)<\/td>/);
  const conf = pildora(render(EMAIL_SAMPLES.find((x) => x.id === "2-reserva-confirmada")).html);
  assert.ok(conf, "falta la píldora");
  assert.match(conf[1], /;color:#1A1714;/, "el texto de la píldora va en tinta");
  assert.match(conf[2], /^<span aria-hidden="true" style="color:#9A5236;">✓<\/span>&nbsp;Confirmada$/);
  const espera = pildora(render(EMAIL_SAMPLES.find((x) => x.id === "2b-reserva-lista-de-espera")).html);
  assert.equal(espera[2], "Lista de espera", "el estado se lee sin el ✓");
  const activa = pildora(render(EMAIL_SAMPLES.find((x) => x.id === "1-membresia-activada")).html);
  assert.match(activa[2], /✓<\/span>&nbsp;Activa$/);
});
