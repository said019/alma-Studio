import { Link } from "react-router-dom";

import { STUDIO } from "@/lib/studio";
import { COLOR } from "@/design/tokens";
import LegalLayout, { LegalContact, LegalH2, LegalUpdated } from "./LegalLayout";

// Términos y condiciones de HIVE Pilates Studio (auditoría 2026-09-27, punto 7).
// Texto versionado en el código: el de policies_settings ya no se muestra. Las
// reglas de cancelación viven en /legal/cancelacion (una sola política).
// PENDIENTE: revisión de un abogado antes de darlo por definitivo.
export const TERMINOS_ACTUALIZADOS = "1 de octubre de 2026";

const fuerte = "font-semibold";
const liga = "font-medium underline underline-offset-2";

const Terminos = () => (
  <LegalLayout
    current="/legal/terminos"
    title={
      <>
        Términos y <span className="font-display">condiciones</span>
      </>
    }
  >
    <div className="space-y-6">
      <LegalUpdated>{TERMINOS_ACTUALIZADOS}</LegalUpdated>

      <p>
        Al usar los servicios de <strong className={fuerte} style={{ color: COLOR.ink }}>{STUDIO.name}</strong>, incluidas la app de reservas y las clases presenciales en el estudio, aceptas estos Términos y Condiciones. Te pedimos leerlos con calma.
      </p>

      <LegalH2>1. Definiciones</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Estudio":</strong> {STUDIO.name} y sus instalaciones en {STUDIO.address}.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Alumna":</strong> cualquier persona registrada en la app que toma clases.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Paquete":</strong> el plan de clases que compras en el estudio o en la app, con su número de clases y su vigencia.</li>
        <li><strong className={fuerte} style={{ color: COLOR.ink }}>"Clase":</strong> cada sesión programada en el calendario del estudio.</li>
      </ul>

      <LegalH2>2. Registro y cuenta</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Para reservar necesitas una cuenta con datos verdaderos y al día.</li>
        <li>Cuida tu contraseña: tu cuenta es personal.</li>
        <li>Debes tener 16 años o más para registrarte. Si eres menor de edad, necesitas la autorización de tu madre, padre o tutor.</li>
        <li>El estudio puede suspender una cuenta que incumpla estos términos.</li>
      </ul>

      <LegalH2>3. Paquetes y pagos</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Los precios están en pesos mexicanos (MXN).</li>
        <li>Los paquetes y clases tienen una vigencia de 30 días naturales desde la compra, excepto el paquete de 20 clases, con 60 días naturales. La vigencia no se extiende y las clases no pueden utilizarse una vez vencidas.</li>
        <li>Los paquetes son personales: no se transfieren a otra persona.</li>
        <li>Puedes pagar en el estudio (efectivo, transferencia o terminal) o en línea cuando la app lo ofrezca. Los datos para transferir se muestran al pagar.</li>
        <li>Los paquetes no son reembolsables, salvo en los casos que el estudio apruebe. Si el estudio aprueba un reembolso total o parcial, lo registra y ajusta las clases de tu paquete.</li>
      </ul>

      <LegalH2>4. Reservaciones y lista de espera</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Puedes reservar en la app o directamente en el estudio. El cupo de cada clase es el que muestra la app.</li>
        <li>Las reservas desde la app cierran 2 horas antes del inicio de la clase.</li>
        <li>Si la clase está llena puedes entrar a la lista de espera. Si se libera un lugar hasta 2 horas antes, quedas inscrita sola, por orden de llegada, y se usa una clase de tu paquete.</li>
      </ul>

      <LegalH2>5. Cancelaciones e inasistencias</LegalH2>
      <p>
        Cuántas veces puedes cancelar, con cuánta anticipación y qué pasa si cancelas tarde o no llegas está en la{" "}
        <Link to="/legal/cancelacion" className={liga} style={{ color: COLOR.ink }}>Política de cancelación</Link>. Es la misma que ves en la app al reservar y al cancelar.
      </p>

      <LegalH2>6. Puntualidad</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Llega 10 minutos antes de tu clase.</li>
        <li>La puerta se cierra 5 minutos después del inicio de la clase, por seguridad y por respeto al grupo. Después de ese plazo no se permite el acceso. Esa clase cuenta como usada.</li>
      </ul>

      <LegalH2>7. Salud y responsabilidad</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Al momento de la inscripción o compra de clase firmas en la app la responsiva y consentimiento informado.</li>
        <li>Avísanos de cualquier lesión, condición médica o embarazo antes de tu clase, para cuidarte durante la práctica.</li>
        <li>El estudio no se hace responsable por lesiones derivadas de condiciones de salud que no nos informaste.</li>
        <li>Te recomendamos consultar a tu médico antes de empezar un programa de ejercicio.</li>
        <li>
          Cómo tratamos tus datos de salud está en el{" "}
          <Link to="/legal/privacidad" className={liga} style={{ color: COLOR.ink }}>Aviso de privacidad</Link>.
        </li>
      </ul>

      <LegalH2>8. Vestimenta y objetos personales</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Los <strong className={fuerte} style={{ color: COLOR.ink }}>calcetines antiderrapantes son obligatorios</strong> en todas las clases. Te recomendamos ropa deportiva cómoda.</li>
        <li>Guarda tus pertenencias en el espacio destinado para ello y mantenlas fuera del área de equipo.</li>
        <li>El celular va en silencio durante la clase.</li>
        <li>El estudio no se hace responsable por objetos perdidos o robados.</li>
      </ul>

      <LegalH2>9. Conducta</LegalH2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Esperamos un trato respetuoso hacia coaches, personal y demás alumnas.</li>
        <li>No toleramos ningún tipo de discriminación, acoso o conducta inapropiada.</li>
        <li>El estudio puede negar el servicio a quien no respete estas reglas.</li>
      </ul>

      <p><Link to="/legal/informacion#reglamento" className={liga} style={{ color: COLOR.ink }}>Consultar el reglamento completo del estudio</Link>.</p>

      <LegalH2>10. Uso de imagen</LegalH2>
      <p>
        Sólo usamos fotos o videos en los que aparezcas, en redes o material promocional, si lo autorizas en tu responsiva. Puedes retirar esa autorización en recepción cuando quieras.
      </p>

      <LegalH2>11. Cambios</LegalH2>
      <p>
        {STUDIO.name} puede cambiar estos términos, sus horarios, precios y políticas. Los cambios se publican en esta página con su fecha y entran en vigor al publicarse.
      </p>

      <LegalH2>12. Contacto</LegalH2>
      <p>Para cualquier duda sobre estos términos:</p>
      <LegalContact />
    </div>
  </LegalLayout>
);

export default Terminos;
