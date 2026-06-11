import { STUDIO } from "@/lib/studio";
import LegalLayout, {
  LegalContact,
  LegalDynamicBody,
  LegalH2,
  LegalSkeleton,
  LegalUpdated,
  usePolicyText,
} from "./LegalLayout";

const Privacidad = () => {
  const { text, loading } = usePolicyText("privacy_policy");

  return (
    <LegalLayout
      current="/legal/privacidad"
      title={
        <>
          Aviso de <span className="font-display-italic">privacidad</span>
        </>
      }
    >
      {loading ? (
        <LegalSkeleton />
      ) : text ? (
        <LegalDynamicBody text={text} />
      ) : (
        <div className="space-y-6">
          <LegalUpdated>26 de febrero de 2026</LegalUpdated>

          <LegalH2>1. Responsable del tratamiento</LegalH2>
          <p>
            <strong className="text-foreground">Alma Movement</strong>, a cargo de Estefanía Torres Lanzagorta, con domicilio en {STUDIO.address}, es responsable del tratamiento de los datos personales que recabamos de usted, en los términos de la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
          </p>

          <LegalH2>2. Datos personales que recabamos</LegalH2>
          <p>Para las finalidades señaladas, recabamos las siguientes categorías de datos personales:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">Datos de identificación:</strong> nombre completo, fecha de nacimiento, género, fotografía de perfil.</li>
            <li><strong className="text-foreground">Datos de contacto:</strong> correo electrónico, número de teléfono, dirección.</li>
            <li><strong className="text-foreground">Datos de salud:</strong> condiciones médicas relevantes (embarazo, lesiones, padecimientos), contacto de emergencia.</li>
            <li><strong className="text-foreground">Datos financieros:</strong> comprobantes de transferencia bancaria para la adquisición de tus paquetes.</li>
            <li><strong className="text-foreground">Datos de uso:</strong> historial de reservaciones, asistencias, preferencias de clase.</li>
          </ul>

          <LegalH2>3. Finalidades del tratamiento</LegalH2>
          <p>Sus datos personales serán utilizados para las siguientes finalidades primarias:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Registro y administración de su cuenta de usuario.</li>
            <li>Gestión de reservaciones y asistencia a clases.</li>
            <li>Procesamiento de pagos y facturación.</li>
            <li>Administración de paquetes y reservaciones de clases.</li>
            <li>Contacto para confirmaciones, recordatorios y notificaciones del servicio.</li>
            <li>Garantizar la seguridad durante las clases, conociendo su estado de salud.</li>
          </ul>
          <p>Finalidades secundarias (opcionales):</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Envío de recordatorios de clase y comunicaciones del estudio por WhatsApp.</li>
            <li>Encuestas de satisfacción y mejora del servicio.</li>
            <li>Publicación de fotografías o videos del estudio en redes sociales y materiales publicitarios.</li>
          </ul>

          <LegalH2>4. Transferencias de datos</LegalH2>
          <p>
            No transferimos sus datos personales a terceros sin su consentimiento, salvo en los casos previstos por la LFPDPPP y su Reglamento. Sus datos pueden ser compartidos con proveedores de servicios tecnológicos (hosting, pasarelas de pago) que operan bajo estrictas medidas de confidencialidad.
          </p>

          <LegalH2>5. Derechos ARCO</LegalH2>
          <p>
            Usted tiene derecho a Acceder, Rectificar, Cancelar u Oponerse (derechos ARCO) al tratamiento de sus datos personales. Para ejercer estos derechos, envíe una solicitud al correo electrónico <a href="mailto:info@almamovement.mx" className="font-medium underline underline-offset-2 text-foreground">info@almamovement.mx</a> indicando:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Nombre completo y datos de contacto.</li>
            <li>Descripción clara del derecho que desea ejercer.</li>
            <li>Cualquier documento que facilite la localización de sus datos.</li>
          </ul>
          <p>
            Responderemos su solicitud en un plazo máximo de 20 días hábiles a partir de la recepción de la misma.
          </p>

          <LegalH2>6. Medidas de seguridad</LegalH2>
          <p>
            Implementamos medidas de seguridad administrativas, técnicas y físicas para proteger sus datos personales contra daño, pérdida, alteración, destrucción o uso, acceso o tratamiento no autorizado. Utilizamos cifrado SSL/TLS para la transmisión de datos y almacenamiento seguro en servidores protegidos.
          </p>

          <LegalH2>7. Uso de cookies</LegalH2>
          <p>
            Nuestra plataforma usa cookies necesarias para que puedas iniciar sesión, reservar tus clases y recordar tus preferencias. Puedes configurar tu navegador para rechazarlas, aunque esto puede limitar la reserva en línea.
          </p>

          <LegalH2>8. Cambios al aviso de privacidad</LegalH2>
          <p>
            Nos reservamos el derecho de modificar el presente Aviso de Privacidad. Cualquier cambio será publicado en nuestra plataforma web y, en caso de cambios significativos, le notificaremos a través de su correo electrónico registrado.
          </p>

          <LegalH2>9. Contacto</LegalH2>
          <p>
            Si tiene alguna duda o comentario sobre este Aviso de Privacidad, puede contactarnos en:
          </p>
          <LegalContact />
        </div>
      )}
    </LegalLayout>
  );
};

export default Privacidad;
