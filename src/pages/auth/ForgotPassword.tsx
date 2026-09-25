import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { CheckCircle2, MailCheck } from "lucide-react";
import {
  AuthShell,
  AuthField,
  AuthSubmit,
  AuthErrorBanner,
} from "@/components/auth/AuthShell";

const schema = z.object({ email: z.string().email("Email inválido") });
type FormValues = { email: string };

const ForgotPassword = () => {
  const [sent, setSent] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    setGlobalError(null);
    try {
      await api.post("/auth/forgot-password", data);
      setSubmittedEmail(data.email);
      setSent(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "Inténtalo de nuevo.";
      setGlobalError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      brandTint="coral"
      brandEyebrow="Recuperar acceso"
      brandHeadline={<>Te ayudamos</>}
      brandHeadlineItalic="a entrar."
      brandSubline="Pasa con frecuencia. Olvidar la contraseña es lo más normal del mundo."
      formEyebrow="Recuperar contraseña"
      formHeadline={sent ? "Listo," : "Dinos tu correo,"}
      formHeadlineItalic={sent ? "revisa tu correo." : "te enviamos un enlace."}
      formIntro={
        sent
          ? undefined
          : "Si tu correo está registrado, te llega un enlace para crear una contraseña nueva."
      }
    >
      {sent ? (
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 rounded-2xl border border-line-strong/30 bg-sunken px-5 py-5">
            <span className="grid h-10 w-10 place-items-center rounded-full shrink-0 bg-ink text-canvas">
              <MailCheck size={18} />
            </span>
            <div>
              <p className="text-[0.95rem] leading-[1.6] text-ink">
                Enviamos un enlace a{" "}
                <strong className="font-medium text-accent-strong">{submittedEmail}</strong>.
              </p>
              <p className="mt-1 text-[0.84rem] leading-[1.5] text-ink-muted">
                El enlace expira en 30 minutos. Revisa también la carpeta de spam.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-2 list-none m-0 p-0">
            {[
              "Abre el correo de HIVE Pilates Studio.",
              "Haz click en “Crear nueva contraseña”.",
              "Vuelve aquí y entra con tu nueva clave.",
            ].map((step, i) => (
              <li
                key={step}
                className={"grid grid-cols-[auto_1fr] gap-3 items-start py-2 " + (i === 0 ? "" : "border-t border-line")}
              >
                <span className="font-display nums text-[0.95rem] leading-none text-accent-strong">
                  0{i + 1}
                </span>
                <span className="text-[0.92rem] leading-[1.55] text-ink-muted">
                  {step}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={() => setSent(false)}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-line px-6 py-3.5 text-[0.78rem] font-medium uppercase tracking-[0.18em] text-ink transition-colors duration-200 hover:border-line-strong hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              Cambiar correo
            </button>
            <Link
              to="/auth/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-[0.78rem] font-medium uppercase tracking-[0.18em] text-canvas no-underline transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            >
              <CheckCircle2 size={14} />
              Volver a iniciar sesión
            </Link>
          </div>
        </div>
      ) : (
        <>
          {globalError && <AuthErrorBanner message={globalError} />}

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
            <AuthField
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="tu@email.com"
              error={errors.email?.message}
              {...register("email")}
            />

            <AuthSubmit loading={loading} loadingLabel="Enviando…">
              Enviar enlace
            </AuthSubmit>
          </form>

          <p className="mt-7 text-center text-[0.86rem] text-ink-muted">
            ¿Ya recordaste?{" "}
            <Link to="/auth/login" className="no-underline font-medium text-accent-strong">
              Volver a iniciar sesión
            </Link>
          </p>
        </>
      )}
    </AuthShell>
  );
};

export default ForgotPassword;
