import type { ReactNode } from "react";
import { ALMA } from "@/components/app/tokens";
import LegalLayout, {
  LegalContact,
  LegalDynamicBody,
  LegalH2,
  LegalSkeleton,
  LegalUpdated,
  usePolicyText,
} from "./LegalLayout";

// Escenarios de cancelación: veredicto en TEXTO (sin chips ni glifos).
// olive solo para el resultado positivo; destructive solo para pérdidas.
const ESCENARIOS: { veredicto: string; tono: string; titulo: string; detalle: ReactNode }[] = [
  {
    veredicto: "Sin penalización",
    tono: ALMA.olive,
    titulo: "Cancelación con más de 12 horas de anticipación",
    detalle: "Puedes cancelar o reagendar tu clase desde la app sin penalización.",
  },
  {
    veredicto: "Cuenta como falta",
    tono: ALMA.ink,
    titulo: "Cancelación dentro de las 12 horas previas",
    detalle: (
      <>
        Cuenta como una clase reservada sin asistir. Si acumulas <strong className="text-foreground">5 clases reservadas sin asistir</strong>, se aplica una penalización con pérdida de puntos.
      </>
    ),
  },
  {
    veredicto: "Cuenta como falta",
    tono: ALMA.ink,
    titulo: "Inasistencia sin aviso",
    detalle:
      "Cuenta como una clase reservada sin asistir y suma a tu conteo de faltas. Al acumular 5, se aplica la penalización con pérdida de puntos.",
  },
];

// Resumen rápido: resultado en texto con color semántico AA sobre cream.
const RESUMEN: { situacion: string; resultado: string; tono: string }[] = [
  { situacion: "Cancelas con más de 12 horas de anticipación", resultado: "Sin penalización", tono: ALMA.olive },
  { situacion: "Cancelas dentro de las 12 horas previas", resultado: "Cuenta como falta", tono: ALMA.ink },
  { situacion: "No asistes y no avisas", resultado: "Cuenta como falta", tono: ALMA.ink },
  { situacion: "Acumulas 5 clases reservadas sin asistir", resultado: "Pérdida de puntos", tono: ALMA.destructive },
  { situacion: "Llegas después del inicio de la clase", resultado: "Sin acceso, clase utilizada", tono: ALMA.destructive },
  { situacion: "Pides reembolso de un paquete", resultado: "No aplica", tono: ALMA.destructive },
  { situacion: "Emergencia médica comprobable", resultado: "Depende, se evalúa caso por caso", tono: ALMA.ink },
];

const Cancelacion = () => {
  const { text, loading } = usePolicyText("cancellation_policy");

  return (
    <LegalLayout
      current="/legal/cancelacion"
      title={
        <>
          Política de <span className="font-display-italic">cancelación</span>
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

          <p>
            En <strong className="text-foreground">Alma Movement</strong> nos esforzamos por ofrecer la mejor experiencia a todas nuestras alumnas. Las siguientes políticas de cancelación nos permiten mantener un servicio de calidad y garantizar disponibilidad para todas.
          </p>

          <LegalH2>1. Cancelación de reservaciones</LegalH2>
          <div style={{ borderTop: `1px solid ${ALMA.border}` }}>
            {ESCENARIOS.map((esc) => (
              <div key={esc.titulo} className="py-5" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                <p className="text-[0.7rem] uppercase tracking-[0.18em] font-semibold mb-1.5" style={{ color: esc.tono }}>
                  {esc.veredicto}
                </p>
                <p className="font-semibold text-[0.95rem] mb-1 text-foreground">{esc.titulo}</p>
                <p className="text-sm leading-relaxed m-0">{esc.detalle}</p>
              </div>
            ))}
          </div>

          <LegalH2>2. Cancelación de paquetes</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Los paquetes adquiridos <strong className="text-foreground">no son reembolsables</strong> bajo ninguna circunstancia una vez activados.</li>
            <li>Un paquete se considera activado al momento de tomar la primera clase.</li>
            <li>No se realizan extensiones de vigencia. Los 30 días se cuentan a partir de la primera clase.</li>
            <li>Los paquetes no utilizados dentro de su vigencia expiran automáticamente.</li>
          </ul>

          <LegalH2>3. Excepciones</LegalH2>
          <p>
            En casos excepcionales de fuerza mayor (accidente, hospitalización, emergencia médica comprobable), el estudio podrá evaluar caso por caso la posibilidad de:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Congelar temporalmente el paquete (hasta 15 días).</li>
            <li>Extender la vigencia por el periodo de incapacidad comprobada.</li>
          </ul>
          <p>
            Estas excepciones requieren notificación por escrito a <a href="mailto:info@almamovement.mx" className="font-medium underline underline-offset-2 text-foreground">info@almamovement.mx</a> con documentación de soporte y quedan a criterio de la administración del estudio.
          </p>

          <LegalH2>4. Cancelación de clases por parte del estudio</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Si necesitamos cancelar una clase (por ejemplo, ausencia de la coach o mantenimiento), te devolvemos la clase a tu paquete y te avisamos lo antes posible por la app y/o WhatsApp.</li>
            <li>En caso de fenómenos naturales o situaciones de fuerza mayor, el estudio podrá cancelar clases sin reposición obligatoria, aunque se hará el mejor esfuerzo por reprogramar.</li>
          </ul>

          <LegalH2>5. Cambio de horario</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Para cambiar de horario, primero cancela tu reservación actual (con más de 12 horas de anticipación) y reserva la nueva clase disponible.</li>
            <li>Los cambios están sujetos a disponibilidad de cupo.</li>
          </ul>

          <LegalH2>6. Puntualidad</LegalH2>
          <p>
            Te pedimos llegar <strong className="text-foreground">10 minutos antes</strong> de tu clase. Una vez iniciada la sesión no se permite el acceso, por seguridad de todas las participantes y respeto al grupo. Esa clase se contará como utilizada.
          </p>

          <LegalH2>7. Resumen rápido</LegalH2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: `1px solid ${ALMA.sandstone}` }}>
                <th className="py-3 pr-4 text-left text-[0.68rem] uppercase tracking-[0.2em] font-semibold" style={{ color: ALMA.berry }}>
                  Situación
                </th>
                <th className="py-3 text-left text-[0.68rem] uppercase tracking-[0.2em] font-semibold" style={{ color: ALMA.berry }}>
                  Resultado
                </th>
              </tr>
            </thead>
            <tbody>
              {RESUMEN.map((fila) => (
                <tr key={fila.situacion} style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                  <td className="py-3 pr-4 align-top">{fila.situacion}</td>
                  <td className="py-3 align-top font-medium" style={{ color: fila.tono }}>
                    {fila.resultado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <LegalH2>8. Contacto</LegalH2>
          <p>
            Para cualquier duda o aclaración respecto a esta Política de Cancelación:
          </p>
          <LegalContact />
        </div>
      )}
    </LegalLayout>
  );
};

export default Cancelacion;
