import { STUDIO } from "@/lib/studio";
import { COLOR } from "@/design/tokens";
import { PRIVACY_NOTICE_UPDATED, PRIVACY_NOTICE_VERSION } from "@/lib/legal/privacy-notice";
import LegalLayout, { LegalContact, LegalH2, LegalUpdated } from "./LegalLayout";

// Aviso de privacidad integral (auditoría 2026-09-27, P1-10; LFPDPPP). Texto
// versionado en el código: el de policies_settings ya no se muestra.
// PENDIENTE (dueño y abogado): revisión legal; nombre o razón social del
// responsable; correo para solicitudes ARCO (STUDIO.privacyEmail); autoridad y
// plazos tras la reforma de 2025 a la LFPDPPP.
const fuerte = "font-semibold";

const Privacidad = () => (
  <LegalLayout
    current="/legal/privacidad"
    title={
      <>
        Aviso de <span className="font-display">privacidad</span>
      </>
    }
  >
    <div className="space-y-6">
      <LegalUpdated>{PRIVACY_NOTICE_UPDATED}</LegalUpdated>
      <p className="text-[0.82rem]">Versión {PRIVACY_NOTICE_VERSION}</p>
      <p>
        Este aviso explica qué datos personales tratamos, para qué, con quién los compartimos y cómo puedes ejercer tus derechos, conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
      </p>

      <LegalH2>1. Responsable</LegalH2>
      <p>
        <strong className={fuerte} style={{ color: COLOR.ink }}>{STUDIO.name}</strong>, con domicilio en {STUDIO.address}, es responsable del tratamiento de tus datos personales.
      </p>

      <LegalH2>2. Datos que recabamos</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Identificación y contacto:</strong> nombre, correo electrónico, teléfono o WhatsApp, fecha de nacimiento, sexo y, si la subes, tu foto de perfil.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Contacto de emergencia:</strong> nombre y teléfono de la persona que nos indiques. Al dárnoslos, confirmas que esa persona está de acuerdo.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Datos de salud (sensibles):</strong> lesiones, condiciones físicas o médicas, embarazo y las notas de salud que nos compartas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Acompañantes:</strong> si registras a alguien que te acompaña a una clase, su nombre y, si nos los compartes, sus datos de salud para esa clase.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Responsiva:</strong> tu nombre, tu firma, la fecha y la versión del documento que firmaste, y si autorizas el uso de tu imagen.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Reservas y asistencia:</strong> clases que reservas, lista de espera, asistencias, faltas, cancelaciones, puntos y reseñas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Pagos:</strong> paquete, monto, método, referencia o comprobante de transferencia y reembolsos. Los pagos en línea con tarjeta los procesa un proveedor de pagos: no guardamos el número completo de tu tarjeta.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Wellhub:</strong> si reservas por Wellhub, tu identificador y tu plan de Wellhub y la confirmación de tus visitas.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>Datos técnicos:</strong> lo que tu navegador guarda para mantener tu sesión (sección 8).</li>
      </ul>

      <LegalH2>3. Para qué los usamos (finalidades primarias)</LegalH2>
      <p>Son necesarias para darte el servicio:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Crear y administrar tu cuenta.</li>
        <li>Gestionar tus reservas, la lista de espera (incluido inscribirte sola cuando se libera un lugar) y tu asistencia.</li>
        <li>Registrar cobros, pagos y reembolsos.</li>
        <li>Enviarte avisos del servicio por WhatsApp, correo o la app: confirmaciones, cambios, cancelaciones de clase y recordatorios.</li>
        <li>Cuidar tu seguridad en clase con tus datos de salud.</li>
        <li>Guardar tu responsiva y, si lo pides, generar tu pase digital para Apple Wallet o Google Wallet.</li>
        <li>Conciliar tus visitas con Wellhub, si reservas por Wellhub.</li>
        <li>Atender tus dudas, aclaraciones y quejas, y cumplir obligaciones legales.</li>
      </ul>

      <LegalH2>4. Finalidades secundarias</LegalH2>
      <p>No son necesarias para el servicio y puedes negarte:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Enviarte promociones y novedades del estudio.</li>
        <li>Invitarte a encuestas y reseñas.</li>
        <li>Publicar fotos o videos de clase en redes o en material promocional, sólo si lo autorizas en tu responsiva.</li>
      </ul>
      <p>
        Para negarte, desmarca "Quiero recibir recordatorios y novedades por WhatsApp" al registrarte o en las preferencias de tu perfil, no autorices el uso de imagen en tu responsiva, o pídelo en recepción. Negarte no afecta tus reservas ni tus clases.
      </p>

      <LegalH2>5. Datos de salud y consentimiento expreso</LegalH2>
      <p>
        Tus datos de salud son datos personales sensibles. Los pedimos para cuidarte en clase y adaptar los ejercicios. Cuando tú misma los escribes en la app —al registrarte o en tu perfil— te pedimos tu consentimiento expreso marcando la casilla de este aviso; guardamos la fecha y la versión que aceptaste. El equipo del estudio (dueña, recepción y coaches) también puede registrar los datos de salud que tú le comuniques de viva voz o por otro medio, para cuidarte en clase. Sólo el equipo del estudio los ve.
      </p>
      <p>
        Puedes retirar tu consentimiento o pedir que borremos tus datos de salud cuando quieras desde tu perfil ("Retirar mi consentimiento" o "Borrar mis datos de salud") o en recepción. Al hacerlo borramos tus datos de salud de tu perfil.
      </p>

      <LegalH2>6. Con quién compartimos tus datos</LegalH2>
      <p>
        Para prestarte el servicio, algunos proveedores tratan tus datos por cuenta nuestra y bajo confidencialidad: servidores y base de datos (hosting), envío de correos, envío de mensajes de WhatsApp, procesamiento de pagos con tarjeta, almacenamiento de archivos (fotos de perfil y comprobantes) y pases digitales de Apple y Google.
      </p>
      <p>Sólo transferimos tus datos a terceros en estos casos, necesarios para el servicio o exigidos por la ley:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>A Wellhub, si reservas a través de Wellhub: la confirmación de tus reservas y de tus visitas.</li>
        <li>A autoridades, cuando una ley o una orden lo exija.</li>
      </ul>
      <p>No vendemos tus datos personales.</p>

      <LegalH2>7. Tus derechos ARCO, revocación y limitación</LegalH2>
      <p>
        Tienes derecho a Acceder a tus datos, Rectificarlos, Cancelarlos u Oponerte a su uso (derechos ARCO), a revocar tu consentimiento y a limitar el uso de tus datos.
      </p>
      <p>
        Para ejercerlos, presenta tu solicitud {STUDIO.privacyEmail ? <>al correo {STUDIO.privacyEmail}, </> : null}en recepción, en {STUDIO.address}, o por el medio que el estudio publique en esta página. Tu solicitud debe incluir:
      </p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Tu nombre y un medio para responderte.</li>
        <li>Un documento que acredite tu identidad o, en su caso, la representación de quien presenta la solicitud.</li>
        <li>La descripción clara del derecho que quieres ejercer y de los datos de que se trata.</li>
        <li>Cualquier dato que ayude a localizar tus datos y, si pides una rectificación, el dato correcto.</li>
      </ul>
      <p>
        Te respondemos en un máximo de 20 días hábiles desde que recibimos tu solicitud y, si procede, la hacemos efectiva dentro de los 15 días hábiles siguientes. Algunos datos los puedes corregir tú misma en tu perfil de la app.
      </p>

      <LegalH2>8. Almacenamiento local y cookies</LegalH2>
      <p>
        La app no usa cookies de publicidad ni herramientas de rastreo de terceros. Guarda en tu navegador (almacenamiento local) tu sesión iniciada y algunas preferencias de pantalla, como si ya viste el aviso para instalar la app. Si borras los datos del navegador, se cierra tu sesión.
      </p>

      <LegalH2>9. Seguridad y conservación</LegalH2>
      <p>
        Protegemos tus datos con medidas administrativas, técnicas y físicas: conexión cifrada y acceso sólo para el personal que los necesita según su función.
      </p>
      <p>
        Conservamos tus datos mientras tengas cuenta. Si pides tu baja, borramos tus datos personales y de salud y cerramos tu acceso; tus reservas, órdenes y pagos se conservan sin tu nombre por obligaciones contables.
      </p>

      <LegalH2>10. Cambios a este aviso</LegalH2>
      <p>
        Si cambiamos este aviso, publicamos la versión nueva en esta página con su fecha. Si cambian las finalidades, te lo informaremos y, cuando la ley lo exija, te pediremos de nuevo tu consentimiento.
      </p>

      <LegalH2>11. Contacto</LegalH2>
      <p>Si tienes dudas sobre este aviso:</p>
      <LegalContact />
    </div>
  </LegalLayout>
);

export default Privacidad;
