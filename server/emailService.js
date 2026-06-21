/**
 * Alma Movement — Email Service (Resend)
 * Handles all transactional emails with branded HTML templates.
 */

import { Resend } from "resend";

// Resend es opcional: si no hay API key, el servicio de email queda inactivo
// (los envíos se omiten en vez de crashear el server). Degrada graciosamente.
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Remitente. Configurable por env; el dominio debe estar verificado en Resend.
const FROM_EMAIL = process.env.EMAIL_FROM || "Alma Movement <noreply@agendafull.com.mx>";
const SITE_URL = process.env.SITE_URL || "https://alma-movement.com.mx";
const LOGO_URL = `${SITE_URL}/alma-mark-light.png`; // logo claro sobre el header espresso

// ─── Brand palette (Alma editorial, fondo claro) ───────────────────────────────
// Conservamos los nombres de clave (magenta/violet/lime/cream...) usados por
// los helpers; solo cambian los valores al look claro de Alma.
const B = {
  bg:      "#F4F1EA", // Porcelain Mist — fondo página
  card:    "#FAF9F6", // Feather White — tarjeta
  border:  "#E0D5C6", // hairline
  ink:     "#43392F", // espresso — texto/CTA
  inkDeep: "#241B1A", // espresso profundo — header band
  desert:  "#A48D78", // Desert Rock — acento
  sand:    "#CBB9A4", // Soft Sandstone
  oat:     "#E6DAC8", // Creamed Oat — tints
  text:    "#43392F",
  muted:   "#8C7A68", // gris cálido
  // Alias legacy (los pasan algunas funciones como color; el diseño ya los ignora).
  purple: "#43392F", magenta: "#A48D78", violet: "#CBB9A4",
  lime: "#A48D78", cream: "#43392F", lilac: "#E6DAC8",
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// ─── Base layout ──────────────────────────────────────────────────────────────
function baseLayout({ preheader = "", content = "", ctaUrl = "", ctaText = "" } = {}) {
  const ctaBlock = ctaUrl
    ? `<tr><td align="center" style="padding:26px 0 6px;">
         <a href="${ctaUrl}"
            style="display:inline-block;background:${B.ink};color:${B.card};
                   font-family:${SANS};font-size:12px;font-weight:600;letter-spacing:1.6px;
                   text-transform:uppercase;text-decoration:none;border-radius:50px;padding:15px 38px;">
           ${ctaText}
         </a>
       </td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Alma Movement</title>
  <!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${B.bg};">
  <!-- preheader -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    ${preheader}&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${B.bg};">
    <tr><td align="center" style="padding:32px 16px 40px;">

      <!-- Card -->
      <table role="presentation" cellpadding="0" cellspacing="0" width="560"
             style="max-width:560px;width:100%;background-color:${B.card};
                    border:1px solid ${B.border};border-radius:22px;overflow:hidden;
                    box-shadow:0 22px 60px -30px rgba(36,27,26,.38);">

        <!-- Header: banda espresso + logo + tagline (mismo lenguaje que el pase) -->
        <tr><td align="center" style="background-color:${B.inkDeep};padding:36px 40px 30px;">
          <img src="${LOGO_URL}" alt="Alma Movement" width="84" height="84"
               style="display:block;width:84px;height:auto;margin:0 auto 14px;" />
          <div style="font-family:${SANS};font-size:10px;letter-spacing:4px;text-transform:uppercase;color:${B.oat};">
            Move with intention
          </div>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:34px 40px 6px;">
          ${content}
        </td></tr>

        <!-- CTA -->
        ${ctaBlock}

        <!-- Divider -->
        <tr><td style="padding:12px 40px 0;">
          <hr style="border:none;border-top:1px solid ${B.border};margin:18px 0 0;" />
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:22px 40px 34px;">
          <p style="font-family:${SANS};font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:${B.desert};margin:0 0 9px;">
            Pilates Reformer · Tower · Mat · Barre · Sculpt
          </p>
          <p style="font-family:${SANS};font-size:12px;color:${B.muted};margin:0;line-height:1.7;">
            Alma Movement · Juriquilla, Querétaro<br>
            <a href="${SITE_URL}" style="color:${B.ink};text-decoration:none;">alma-movement.com.mx</a>
          </p>
        </td></tr>

      </table>
      <p style="font-family:${SANS};font-size:11px;color:${B.muted};margin:16px 0 0;">
        © ${new Date().getFullYear()} Alma Movement
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function h1(text) {
  return `<h1 style="font-family:${SERIF};font-size:27px;font-weight:500;color:${B.ink};margin:0 0 10px;line-height:1.25;letter-spacing:-.01em;">${text}</h1>`;
}
function h2(text) {
  return `<h2 style="font-family:${SERIF};font-size:18px;font-weight:500;color:${B.desert};margin:20px 0 6px;">${text}</h2>`;
}
function p(text) {
  return `<p style="font-family:${SANS};font-size:15px;color:${B.text};line-height:1.75;margin:0 0 14px;">${text}</p>`;
}
function small(text) {
  return `<p style="font-family:${SANS};font-size:13px;color:${B.muted};line-height:1.6;margin:0 0 10px;">${text}</p>`;
}
function infoRow(label, value) {
  return `<tr>
    <td style="font-family:${SANS};font-size:11px;letter-spacing:.6px;text-transform:uppercase;
               color:${B.muted};padding:9px 0;border-bottom:1px solid ${B.border};">${label}</td>
    <td style="font-family:${SANS};font-size:14px;color:${B.ink};font-weight:600;padding:9px 0 9px 12px;
               border-bottom:1px solid ${B.border};text-align:right;">${value}</td>
  </tr>`;
}
function infoTable(rows) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="border-top:1px solid ${B.border};margin:18px 0 22px;">
    ${rows.join("")}
  </table>`;
}
function pill(text) {
  return `<span style="display:inline-block;background:${B.oat};border:1px solid ${B.sand};
                        color:${B.ink};border-radius:50px;font-family:${SANS};font-size:11px;font-weight:600;
                        padding:5px 14px;letter-spacing:1px;text-transform:uppercase;">${text}</span>`;
}
function alertBox(text) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                  style="background:${B.oat};border:1px solid ${B.sand};border-radius:14px;margin:14px 0 20px;">
    <tr><td style="padding:15px 18px;font-family:${SANS};font-size:14px;color:${B.ink};line-height:1.65;">${text}</td></tr>
  </table>`;
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-MX", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}
function fmtTime(timeStr) {
  if (!timeStr) return "—";
  const t = String(timeStr).slice(0, 5);
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "pm" : "am";
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
}

// ─── Core send function ───────────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[Email] RESEND_API_KEY not set — skipping email to ${to} (${subject})`);
    return;
  }
  try {
    // BCC opcional vía env EMAIL_BCC (coma-separado). Por defecto NINGUNO:
    // antes copiaba TODO a saidromero19@gmail.com, lo que hacía llegar copias
    // de correos de las clientas (incluidos resets de contraseña) a ese buzón.
    const bccList = String(process.env.EMAIL_BCC || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      ...(bccList.length ? { bcc: bccList } : {}),
      subject,
      html,
    });
    if (error) console.error("[Email] Resend error:", error);
    else console.log(`[Email] Sent "${subject}" → ${to} (id: ${data?.id})`);
  } catch (err) {
    console.error("[Email] Exception sending email:", err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 1. MEMBRESÍA ACTIVADA / ASIGNADA ──────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to          — email del cliente
 * @param {string} opts.name        — nombre del cliente
 * @param {string} opts.planName    — nombre del plan
 * @param {string} opts.startDate   — fecha inicio
 * @param {string} opts.endDate     — fecha fin
 * @param {number|null} opts.classLimit — clases totales (null = ilimitado)
 */
async function sendMembershipActivated(opts) {
  const { to, name, planName, startDate, endDate, classLimit } = opts;
  const classesText = classLimit ? `${classLimit} clases` : "Clases ilimitadas";
  const content = `
    ${h1(`Bienvenida a Alma, ${name.split(" ")[0]}`)}
    ${p("Tu membresía ya está activa. Reserva tu primera clase y empieza a moverte con intención; aquí te acompañamos en cada movimiento.")}
    ${infoTable([
    infoRow("Plan", planName),
    infoRow("Clases incluidas", classesText),
    infoRow("Inicio", fmtDate(startDate)),
    infoRow("Vencimiento", fmtDate(endDate)),
  ])}
    ${p("Entra a tu perfil para reservar tus primeras clases y ver el horario disponible.")}
  `;
  const html = baseLayout({
    preheader: `¡Tu membresía ${planName} está activa! Reserva tus clases ahora.`,
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Reservar clases",
  });
  await sendEmail({ to, subject: `Tu membresía en Alma ya está activa`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 2. RESERVA CONFIRMADA ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.className       — tipo de clase (Barre, etc.)
 * @param {string} opts.date            — fecha de la clase (DATE)
 * @param {string} opts.startTime       — hora inicio (TIME "HH:MM")
 * @param {string} opts.instructor      — nombre instructor
 * @param {number|null} opts.classesLeft — clases restantes después de reservar (null = ilimitado)
 * @param {boolean} opts.isWaitlist     — true si es lista de espera
 */
async function sendBookingConfirmed(opts) {
  const { to, name, className, date, startTime, instructor, classesLeft, isWaitlist } = opts;
  const cancelHours = Number(opts.cancelHours) > 0 ? Number(opts.cancelHours) : 12;

  const statusPill = isWaitlist
    ? pill("Lista de espera")
    : pill("Confirmada");

  const classesLeftText = classesLeft === null
    ? "Ilimitadas"
    : classesLeft !== undefined
      ? `${classesLeft} clases restantes`
      : null;

  const waitlistNote = isWaitlist
    ? alertBox("Estás en la <strong>lista de espera</strong>. Te notificaremos si se libera un lugar. Si quieres asegurar tu spot, reserva otra sesión.", B.lime)
    : "";

  const content = `
    ${h1(isWaitlist ? `En lista de espera, ${name.split(" ")[0]}` : `Nos vemos en clase, ${name.split(" ")[0]}`)}
    ${p(isWaitlist
    ? "Te hemos añadido a la lista de espera para la siguiente clase:"
    : "Tu clase ha sido reservada con éxito. ¡Te esperamos!"
  )}
    <div style="text-align:center;margin:6px 0 16px;">${statusPill}</div>
    ${infoTable([
    infoRow("Clase", className),
    infoRow("Fecha", fmtDate(date)),
    infoRow("Hora", fmtTime(startTime)),
    ...(instructor ? [infoRow("Instructor", instructor)] : []),
    ...(classesLeftText ? [infoRow("Tu paquete", classesLeftText)] : []),
  ])}
    ${waitlistNote}
    ${p(`Recuerda que puedes cancelar tu reserva hasta <strong>${cancelHours} horas antes</strong> para recuperar tu crédito de clase.`)}
  `;
  const html = baseLayout({
    preheader: isWaitlist ? `Estás en lista de espera para ${className}` : `Reserva confirmada para ${className} el ${fmtDate(date)}`,
    content,
    ctaUrl: `${SITE_URL}/app/bookings`,
    ctaText: "Ver mis reservas",
  });
  await sendEmail({ to, subject: isWaitlist ? `En lista de espera — ${className}` : `Reserva confirmada — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 3. RESERVA CANCELADA ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.className
 * @param {string}  opts.date
 * @param {string}  opts.startTime
 * @param {boolean} opts.creditRestored  — true si se devolvió el crédito
 * @param {boolean} opts.isLate          — cancelación tardía (<2h)
 * @param {number|null} opts.classesLeft — clases restantes después de cancelar
 */
async function sendBookingCancelled(opts) {
  const { to, name, className, date, startTime, creditRestored, isLate, classesLeft } = opts;

  const classesLeftText = classesLeft === null ? "Ilimitadas" : classesLeft !== undefined ? `${classesLeft} clases` : null;

  const creditBlock = creditRestored
    ? alertBox(`<strong>Tu clase regresó a tu paquete.</strong> Cancelaste con más de 12 horas de anticipación.`)
    : alertBox(`<strong>Esta vez la clase no regresó a tu paquete.</strong> La cancelación fue con menos de 12 horas de anticipación, como indica nuestra política.`);

  const content = `
    ${h1(`Reserva cancelada, ${name.split(" ")[0]}`)}
    ${p("Tu reserva para la siguiente clase ha sido cancelada:")}
    ${infoTable([
    infoRow("Clase", className),
    infoRow("Fecha", fmtDate(date)),
    infoRow("Hora", fmtTime(startTime)),
    ...(classesLeftText ? [infoRow("Clases restantes", classesLeftText)] : []),
  ])}
    ${creditBlock}
    ${isLate
      ? small("Si tienes dudas sobre la política de cancelación, contáctanos por WhatsApp o visita tu perfil.")
      : p("¿Quieres reservar otra clase? Hay muchos horarios disponibles.")
    }
  `;
  const html = baseLayout({
    preheader: creditRestored ? "Tu clase fue devuelta al paquete." : "Cancelación tardía — crédito no recuperado.",
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Ver horario",
  });
  await sendEmail({ to, subject: `Reserva cancelada — ${className}`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 4. RECORDATORIO SEMANAL (programa tu semana) ──────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {number|null} opts.classesLeft — null = ilimitado
 * @param {string|null} opts.endDate     — fecha de vencimiento del paquete
 */
async function sendWeeklyReminder(opts) {
  const { to, name, classesLeft, endDate } = opts;

  const classesText = classesLeft === null
    ? "Tienes clases <strong>ilimitadas</strong> esta semana."
    : `Tienes <strong>${classesLeft} clase${classesLeft !== 1 ? "s" : ""}</strong> disponible${classesLeft !== 1 ? "s" : ""} en tu paquete.`;

  const expiryNote = endDate
    ? alertBox(`Tu membresía vence el <strong>${fmtDate(endDate)}</strong>. Aún estás a tiempo de aprovechar tus clases.`)
    : "";

  const content = `
    ${h1(`Tu semana en Alma, ${name.split(" ")[0]}`)}
    ${p("Empieza una semana nueva y el horario ya está abierto. Aparta tus clases y date ese tiempo para ti.")}
    ${p(classesText)}
    ${expiryNote}
    ${h2("Date la cita contigo")}
    ${p("Grupos pequeños, técnica cuidada y alguien que te recibe por tu nombre. Reserva tus lugares antes de que se llenen.")}
  `;
  const html = baseLayout({
    preheader: `Nueva semana en Alma. Tienes ${classesLeft === null ? "clases ilimitadas" : `${classesLeft} clases`} para reservar.`,
    content,
    ctaUrl: `${SITE_URL}/app/classes`,
    ctaText: "Reservar mi semana",
  });
  await sendEmail({ to, subject: `Tu semana en Alma — reserva tus clases`, html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 5. RECORDATORIO DE RENOVACIÓN ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string}  opts.to
 * @param {string}  opts.name
 * @param {string}  opts.planName
 * @param {number|null} opts.classesLeft  — null = ilimitado
 * @param {string|null} opts.endDate
 * @param {'last_class'|'expiring_soon'} opts.reason
 */
async function sendRenewalReminder(opts) {
  const { to, name, planName, classesLeft, endDate, reason } = opts;

  const isLastClass = reason === "last_class";
  const isExpiring = reason === "expiring_soon";

  const urgencyBlock = isLastClass
    ? alertBox(`Te queda <strong>1 clase</strong> en tu paquete ${planName}. Renuévalo para no quedarte sin acceso.`)
    : alertBox(`Tu membresía <strong>${planName}</strong> vence el <strong>${fmtDate(endDate)}</strong>. Renuévala para mantener tu ritmo.`);

  const benefit = isLastClass
    ? p("Aprovecha y reserva esa última clase hoy, y de paso renueva tu paquete para seguir entrenando sin interrupciones.")
    : p("Renovar antes del vencimiento es la mejor forma de mantener tu constancia. ¡No dejes que el progreso se detenga!");

  const content = `
    ${h1(`${name.split(" ")[0]}, es momento de renovar`)}
    ${urgencyBlock}
    ${p("En Alma cuidamos tu constancia: renovar a tiempo es la forma de no perder el hilo de tu práctica.")}
    ${infoTable([
    infoRow("Plan actual", planName),
    ...(classesLeft !== null ? [infoRow("Clases restantes", `${classesLeft}`)] : []),
    ...(endDate ? [infoRow("Vencimiento", fmtDate(endDate))] : []),
  ])}
    ${benefit}
  `;
  const html = baseLayout({
    preheader: isLastClass ? `Te queda 1 clase. Renueva tu paquete.` : `Tu membresía vence pronto. Renueva para seguir tu práctica.`,
    content,
    ctaUrl: `${SITE_URL}/app/checkout`,
    ctaText: "Renovar mi membresía",
  });
  await sendEmail({
    to,
    subject: isLastClass
      ? `Te queda 1 clase — renueva tu membresía`
      : `Tu membresía vence pronto — Alma`,
    html,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 6. RECUPERACION DE CONTRASEÑA ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.token
 * @param {string=} opts.resetUrl
 */
async function sendPasswordResetEmail(opts) {
  const { to, name, token, resetUrl } = opts;
  const safeName = String(name || "Clienta");
  const firstName = safeName.trim().split(/\s+/)[0] || "Clienta";
  const resolvedResetUrl = String(
    resetUrl || `${SITE_URL}/auth/reset-password?token=${encodeURIComponent(token)}`,
  );
  const content = `
    ${h1(`Recupera tu contraseña, ${firstName}`)}
    ${p("Hemos recibido una solicitud para cambiar la contraseña de tu cuenta en Alma Movement.")}
    ${p("Si fuiste tú, haz clic en el siguiente enlace para crear una contraseña nueva. Este enlace expirará en 2 horas.")}
    ${p("Si no solicitaste este cambio, puedes ignorar este correo; tu cuenta seguirá segura.")}
    ${small(`Si el botón no abre, copia y pega este enlace en tu navegador:<br><a href="${resolvedResetUrl}" style="color:${B.magenta};word-break:break-all;">${resolvedResetUrl}</a>`)}
  `;
  const html = baseLayout({
    preheader: "Recupera el acceso a tu cuenta de Alma Movement",
    content,
    ctaUrl: resolvedResetUrl,
    ctaText: "Reestablecer mi contraseña",
  });
  await sendEmail({ to, subject: "Restablecer tu contraseña — Alma", html });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── 7. RECHAZO DE COMPROBANTE ─────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * @param {object} opts
 * @param {string} opts.to
 * @param {string} opts.name
 * @param {string} opts.reason
 */
async function sendOrderRejected(opts) {
  const { to, name, reason } = opts;
  const content = `
    ${h1(`Revisamos tu comprobante`)}
    ${p(`Hola ${name.split(" ")[0]}, revisamos tu comprobante de pago y por ahora <strong>no pudimos aprobarlo</strong>.`)}
    ${alertBox(`<strong>Motivo:</strong> ${reason}`)}
    ${p("Si crees que hubo un error, escríbenos por WhatsApp o responde este correo y lo resolvemos contigo.")}
  `;
  const html = baseLayout({
    preheader: "Tu comprobante de pago fue revisado — Alma Movement",
    content,
    ctaUrl: `https://wa.me/521${process.env.STUDIO_PHONE || ""}`,
    ctaText: "Contactar por WhatsApp",
  });
  await sendEmail({ to, subject: "Comprobante de pago no aprobado — Alma Movement", html });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export {
  sendMembershipActivated,
  sendBookingConfirmed,
  sendBookingCancelled,
  sendWeeklyReminder,
  sendRenewalReminder,
  sendPasswordResetEmail,
  sendOrderRejected,
};
