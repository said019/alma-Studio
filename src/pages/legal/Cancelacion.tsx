import { STUDIO } from "@/lib/studio";
import { cancellationRules, useBookingPolicy, waitlistRule } from "@/lib/booking-policy";
import LegalLayout, { LegalContact, LegalH2, LegalSkeleton, LegalUpdated } from "./LegalLayout";

// Política de cancelación de HIVE Pilates Studio (auditoría 2026-09-27, P0-4 y
// punto 7). Las reglas salen de la configuración real (GET /api/public/booking-policy)
// con el mismo texto que el detalle de clase y el diálogo de cancelar
// (src/lib/booking-policy.ts): una sola política. El texto de policies_settings
// ya no se muestra. PENDIENTE: revisión de un abogado.
export const CANCELACION_ACTUALIZADA = "28 de septiembre de 2026";

const Cancelacion = () => {
  const { policy, isLoading } = useBookingPolicy();

  return (
    <LegalLayout
      current="/legal/cancelacion"
      title={
        <>
          Política de <span className="font-display">cancelación</span>
        </>
      }
    >
      {isLoading ? (
        <LegalSkeleton />
      ) : (
        <div className="space-y-6">
          <LegalUpdated>{CANCELACION_ACTUALIZADA}</LegalUpdated>

          <p>
            En <strong className="text-foreground">{STUDIO.name}</strong> los grupos son pequeños: cuando cancelas a tiempo, tu lugar lo puede aprovechar alguien de la lista de espera. Estas reglas son las mismas que ves en la app al reservar y al cancelar.
          </p>

          <LegalH2>1. Cancelar una reserva</LegalH2>
          <ul aria-label="Reglas de cancelación" className="list-disc pl-6 space-y-2">
            {cancellationRules(policy).map((regla) => <li key={regla}>{regla}</li>)}
          </ul>
          <p>En la app ves cuántas cancelaciones te quedan en tu paquete: en el detalle de cada clase y al cancelar.</p>

          <LegalH2>2. Lista de espera</LegalH2>
          <p>{waitlistRule(policy)}</p>
          <p>Salir de la lista de espera no usa una cancelación de tu paquete.</p>

          <LegalH2>3. Inasistencias</LegalH2>
          <p>Si no llegas a una clase reservada, la clase cuenta como usada{policy.faltasEnabled ? " y como falta" : ""}.</p>

          <LegalH2>4. Clases que cancela el estudio</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Si tenemos que cancelar una clase (por ejemplo, por ausencia de la coach o por mantenimiento), la clase regresa a tu paquete, no cuenta como cancelación tuya y te avisamos lo antes posible.</li>
            <li>Por fuerza mayor (fenómenos naturales, cortes de servicio), el estudio puede cancelar clases sin reposición obligatoria, aunque haremos lo posible por reprogramar.</li>
          </ul>

          <LegalH2>5. Cambio de horario</LegalH2>
          <p>Para cambiar de horario, cancela tu reserva y reserva la nueva clase. Aplican las reglas de arriba y el cupo disponible.</p>

          <LegalH2>6. Puntualidad</LegalH2>
          <p>Llega 10 minutos antes. Una vez iniciada la clase no se permite el acceso, por seguridad y por respeto al grupo; esa clase cuenta como usada.</p>

          <LegalH2>7. Paquetes y excepciones</LegalH2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Los paquetes no son reembolsables, salvo en los casos que el estudio apruebe. Si el estudio aprueba un reembolso total o parcial, lo registra y ajusta las clases de tu paquete.</li>
            <li>Ante una fuerza mayor (accidente, hospitalización, emergencia médica comprobable), el estudio puede evaluar extender tu paquete. Pídelo en recepción con tu documentación.</li>
          </ul>

          <LegalH2>8. Contacto</LegalH2>
          <p>Para cualquier duda sobre esta política:</p>
          <LegalContact />
        </div>
      )}
    </LegalLayout>
  );
};

export default Cancelacion;
