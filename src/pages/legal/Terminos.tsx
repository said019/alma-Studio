import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import almaLogo from "@/assets/alma/alma-logo.png";
import api from "@/lib/api";

const Terminos = () => {
  const navigate = useNavigate();
  const [dynamicPolicy, setDynamicPolicy] = useState("");

  useEffect(() => {
    api.get("/public/settings/policies_settings").then(({ data }) => {
      const value = data?.data;
      const text = typeof value?.terms_of_service === "string" ? value.terms_of_service.trim() : "";
      setDynamicPolicy(text);
    }).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border px-6 lg:px-[60px] py-4 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="flex items-center bg-transparent border-none cursor-pointer">
          <img src={almaLogo} alt="Alma Movement" className="h-14 w-auto object-contain" />
        </button>
        <button
          onClick={() => navigate(-1)}
          className="text-muted-foreground text-sm hover:text-foreground transition-colors bg-transparent border-none cursor-pointer"
        >
          ← Volver
        </button>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-[0.72rem] tracking-[0.15em] uppercase text-primary font-medium mb-4 flex items-center gap-[10px]">
          <span className="w-[30px] h-[1px] bg-primary inline-block" />
          Legal
        </div>
        <h1 className="font-bebas text-[clamp(2.5rem,5vw,4rem)] leading-[0.95] text-foreground mb-10">
          TÉRMINOS Y CONDICIONES
        </h1>

        {dynamicPolicy ? (
          <div className="prose-alma space-y-6 text-[0.92rem] text-muted-foreground leading-[1.8]">
            <p className="text-foreground font-medium">
              Última actualización: {new Date().toLocaleDateString("es-MX")}
            </p>
            <div className="rounded-2xl border border-border bg-secondary/40 p-6 whitespace-pre-wrap leading-[1.9]">
              {dynamicPolicy}
            </div>
          </div>
        ) : (
          <div className="prose-alma space-y-6 text-[0.92rem] text-muted-foreground leading-[1.8]">
          <p className="text-foreground font-medium">
            Última actualización: 26 de febrero de 2026
          </p>

          <p>
            Al utilizar los servicios de <strong className="text-foreground">Alma Movement</strong>, incluyendo nuestra plataforma de reservas en línea y las clases presenciales en el estudio, usted acepta los presentes Términos y Condiciones. Le recomendamos leerlos detenidamente.
          </p>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">1. Definiciones</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong className="text-foreground">"Estudio"</strong> se refiere a Alma Movement y sus instalaciones en Juriquilla, Querétaro.</li>
            <li><strong className="text-foreground">"Alumna/o"</strong> se refiere a cualquier persona registrada en la plataforma que asiste a clases.</li>
            <li><strong className="text-foreground">"Paquete"</strong> se refiere a los planes de clases (Pilates Reformer, Pilates Tower, Pilates Mat, Barre y Sculpt) adquiridos en el estudio.</li>
            <li><strong className="text-foreground">"Clase"</strong> se refiere a cada sesión de ejercicio programada en el estudio.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">2. Registro y cuenta</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Para acceder a los servicios, es necesario crear una cuenta con información veraz y actualizada.</li>
            <li>Usted es responsable de mantener la confidencialidad de sus credenciales de acceso.</li>
            <li>Debe ser mayor de 16 años para registrarse. Menores de edad requieren autorización de un padre o tutor.</li>
            <li>El estudio se reserva el derecho de suspender o cancelar cuentas que incumplan estos términos.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">3. Paquetes y pagos</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Los precios de los paquetes están expresados en pesos mexicanos (MXN) e incluyen IVA.</li>
            <li>Todos los paquetes tienen una vigencia de <strong className="text-foreground">30 días naturales</strong> a partir de la primera clase tomada.</li>
            <li>Los paquetes <strong className="text-foreground">no son transferibles</strong> a otra persona.</li>
            <li>Los paquetes <strong className="text-foreground">no son reembolsables</strong> una vez adquiridos.</li>
            <li>Las clases no utilizadas dentro del periodo de vigencia se pierden sin derecho a reembolso ni extensión.</li>
            <li>Los pagos deben realizarse antes o el mismo día de la primera clase del paquete.</li>
            <li>El pago se realiza por transferencia bancaria (Banorte, a nombre de Estefanía Torres Lanzagorta) o en efectivo en el estudio.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">4. Reservaciones</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Todas las clases requieren <strong className="text-foreground">reservación previa</strong> a través de la plataforma.</li>
            <li>El cupo máximo por clase es de <strong className="text-foreground">4 personas</strong> en el área de Reformer y Tower, y de <strong className="text-foreground">8 personas</strong> en el área de Studio (Mat, Barre y Sculpt).</li>
            <li>Las reservaciones pueden realizarse hasta 5 minutos antes del inicio de la clase, sujeto a disponibilidad.</li>
            <li>No se permiten reservaciones por teléfono ni en persona sin confirmar en la plataforma.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">5. Cancelaciones e inasistencias</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Si cancelas dentro de las <strong className="text-foreground">12 horas previas</strong> a tu clase y acumulas <strong className="text-foreground">5 clases reservadas sin asistir</strong>, se aplica una penalización con pérdida de puntos.</li>
            <li>Te pedimos avisar con la mayor anticipación posible para liberar tu lugar a otra alumna.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">6. Puntualidad</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Te pedimos llegar 10 minutos antes de tu clase. Una vez iniciada la sesión no se permite el acceso, por seguridad y respeto al grupo.</li>
            <li>La inasistencia por impuntualidad se contará como clase utilizada.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">7. Salud y responsabilidad</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Cada alumna/o es responsable de informar cualquier condición médica, embarazo, lesión o padecimiento <strong className="text-foreground">antes de tomar su primera clase</strong>.</li>
            <li>El estudio no se hace responsable por lesiones derivadas de condiciones médicas no reportadas.</li>
            <li>Se recomienda consultar a un médico antes de iniciar cualquier programa de ejercicio.</li>
            <li>Es tu responsabilidad informarnos cualquier condición de salud (embarazo, lesión o padecimiento) antes de tu primera clase para cuidarte durante la práctica.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">8. Vestimenta y artículos personales</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>El uso de <strong className="text-foreground">calcetines antiderrapantes es obligatorio en todas las clases</strong>. Te recomendamos ropa deportiva cómoda.</li>
            <li>Te pedimos guardar tus pertenencias en el espacio destinado para ello dentro del estudio.</li>
            <li>Mantén tus objetos personales fuera del área de equipo para tu seguridad y la de las demás.</li>
            <li>El celular debe permanecer en silencio durante la clase.</li>
            <li>El estudio no se hace responsable por objetos perdidos o robados.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">9. Conducta</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Se espera un comportamiento respetuoso hacia instructoras, personal y demás alumnas.</li>
            <li>No se tolera ningún tipo de discriminación, acoso o conducta inapropiada.</li>
            <li>El estudio se reserva el derecho de negar el servicio a personas que no respeten el código de conducta.</li>
          </ul>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">10. Uso de imagen</h2>
          <p>
            Al asistir al estudio, usted acepta que se pueden tomar fotografías y/o videos del ambiente general de las clases con fines promocionales. Si no desea aparecer en material publicitario, favor de notificarlo al personal antes de la clase.
          </p>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">11. Modificaciones</h2>
          <p>
            Alma Movement se reserva el derecho de modificar los presentes Términos y Condiciones, así como los horarios, precios y políticas del estudio. Los cambios serán publicados en la plataforma y entrarán en vigor al momento de su publicación.
          </p>

          <h2 className="font-syne font-bold text-lg text-foreground mt-8 mb-3">12. Contacto</h2>
          <p>
            Para cualquier duda respecto a estos Términos y Condiciones:
          </p>
          <ul className="list-none space-y-1">
            <li><strong className="text-foreground">Email:</strong> info@almamovement.mx</li>
            <li><strong className="text-foreground">Teléfono:</strong> por confirmar</li>
            <li><strong className="text-foreground">Dirección:</strong> Plaza Arce, Calle Acueducto de Querétaro 513, Jurica Acueducto, 76230 Juriquilla, Querétaro</li>
          </ul>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 lg:px-[60px] py-6 text-center">
        <p className="text-xs text-muted-foreground/50">© 2026 Alma Movement. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
};

export default Terminos;
