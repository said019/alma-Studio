import { internationalPhone, phoneCountries } from "@/lib/internationalPhone";
import { useState } from "react";
import { ResponsivaDialog } from "@/components/app/ResponsivaDialog";
import { useForm } from "react-hook-form";
import { FEATURES } from "@/config/features";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { safeReturnUrl, withReturnUrl } from "@/lib/returnUrl";
import {
  AuthShell,
  AuthField,
  AuthPasswordField,
  AuthSelect,
  AuthSubmit,
  AuthErrorBanner,
  AuthDivider,
  AuthSecondaryLink,
  AuthCheckbox,
  AuthPasswordRules,
} from "@/components/auth/AuthShell";
import { Check } from "lucide-react";
import { HEALTH_CONSENT_TEXT } from "@/lib/legal/privacy-notice";

const todayISO = new Date().toISOString().slice(0, 10);

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(1, "Ingresa tu teléfono"),
  phoneCountry: z.string().default("MX"),
  gender: z.enum(["female", "male", "other"], { required_error: "Selecciona una opción" }),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Selecciona una fecha válida")
    .refine((v) => {
      const d = new Date(v + "T00:00:00Z");
      const y = Number(v.slice(0, 4));
      return !Number.isNaN(d.getTime()) && y >= 1900 && d <= new Date();
    }, "Fecha fuera de rango"),
  password: z
    .string()
    .min(8, "Mínimo 8 caracteres")
    .regex(/[A-Z]/, "Debe incluir una mayúscula")
    .regex(/[0-9]/, "Debe incluir un número"),
  confirmPassword: z.string(),
  acceptsTerms: z.boolean().refine((v) => v, "Debes aceptar los términos"),
  acceptsCommunications: z.boolean().default(false),
  healthConsent: z.boolean().default(false),
}).refine((d) => Boolean(internationalPhone(d.phone, d.phoneCountry)), { message: "Ingresa un número válido para el país seleccionado", path: ["phone"] }).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = {
  displayName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  gender: "female" | "male" | "other";
  dateOfBirth: string;
  password: string;
  confirmPassword: string;
  acceptsTerms: boolean;
  acceptsCommunications: boolean;
  healthConsent: boolean;
};

const Register = () => {
  const [registration, setRegistration] = useState<FormValues | null>(null);
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refCode = params.get("ref");
  const returnUrl = safeReturnUrl(params.get("returnUrl"));

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phoneCountry: "MX", acceptsTerms: false, acceptsCommunications: false, healthConsent: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");
  const healthConsent = watch("healthConsent");
  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const onSubmit = async (data: FormValues) => {
    clearError();
    const phone = internationalPhone(data.phone, data.phoneCountry)!;
    try {
      await registerUser({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        phone,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth,
        acceptsTerms: data.acceptsTerms,
        acceptsCommunications: data.acceptsCommunications,
        healthConsent: data.healthConsent,
        ...(refCode ? { referralCode: refCode } : {}),
      } as any);
      // La inscripción continúa con la firma del documento vigente.
      setRegistration({ ...data, phone });
    } catch {
      // El error del store se muestra en el AuthErrorBanner, único canal de error.
    }
  };

  if (registration) return (
    <AuthShell brandEyebrow="HIVE Pilates Studio" brandHeadline="Bienvenida/o a HIVE" formEyebrow="Último paso" formHeadline="Firma tu" formHeadlineItalic="responsiva.">
      <p className="text-ink-muted">Tu cuenta está creada. Completa la firma para terminar tu inscripción y adquirir tus clases.</p>
      <ResponsivaDialog open onClose={() => navigate(FEATURES.onboarding ? withReturnUrl("/auth/onboarding", returnUrl) : (returnUrl ?? "/app"))} defaultName={registration.displayName}
        defaultEmail={registration.email} defaultPhone={registration.phone}
        onSigned={() => navigate(FEATURES.onboarding ? withReturnUrl("/auth/onboarding", returnUrl) : (returnUrl ?? "/app"))} />
    </AuthShell>
  );

  return (
    <AuthShell
      brandTint="berry"
      brandEyebrow="Nueva/o en HIVE"
      brandHeadline={<>Te recibimos</>}
      brandHeadlineItalic="como te reciben en casa."
      brandSubline="Crea tu cuenta y reserva tu primera clase. Grupos pequeños, atención personalizada, técnica cuidada."
      brandList={[
        { label: "Reservas y check-in en línea" },
        { label: "Tus reservas y clases siempre a la mano" },
        { label: "Recordatorios por WhatsApp" },
        { label: "Atención cercana: te conocen por tu nombre" },
      ]}
      formEyebrow="Crear cuenta"
      formHeadline="Únete a"
      formHeadlineItalic="HIVE."
    >
      {refCode && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-accent-strong/20 bg-sunken px-4 py-3 text-[0.84rem] text-accent-strong">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-canvas">
            <Check size={11} strokeWidth={3} />
          </span>
          Código de referido <strong className="ml-1 nums font-medium tracking-wide">{refCode}</strong>
        </div>
      )}

      {error && <AuthErrorBanner message={error} />}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <AuthField
            label="Nombre"
            placeholder="Tu nombre"
            autoComplete="given-name"
            error={errors.displayName?.message}
            {...register("displayName")}
          />
          <div className="space-y-3 min-w-0">
            <AuthSelect label="País del teléfono" {...register("phoneCountry")}>
              {phoneCountries.map(country => <option key={country.code} value={country.code}>{country.name} (+{country.dial})</option>)}
            </AuthSelect>
            <AuthField
              label="WhatsApp"
              type="tel"
              placeholder="Tu número de teléfono"
              inputMode="tel"
              autoComplete="tel-national"
              hint="Escribe tu número local o pega el número completo con + y su lada."
              error={errors.phone?.message}
              {...register("phone")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <AuthSelect
            label="Sexo"
            defaultValue=""
            error={errors.gender?.message}
            {...register("gender")}
          >
            <option value="" disabled>Selecciona</option>
            <option value="female">Femenino</option>
            <option value="male">Masculino</option>
            <option value="other">Prefiero no decir</option>
          </AuthSelect>

          <AuthField
            label="Fecha de nacimiento"
            type="date"
            max={todayISO}
            min="1900-01-01"
            hint="Para felicitarte el día"
            error={errors.dateOfBirth?.message}
            {...register("dateOfBirth")}
          />
        </div>

        <AuthField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="tu@email.com"
          error={errors.email?.message}
          {...register("email")}
        />

        <div className="flex flex-col gap-3">
          <AuthPasswordField
            label="Contraseña"
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            error={errors.password?.message}
            {...register("password")}
          />
          <AuthPasswordRules password={password} />
        </div>

        <AuthPasswordField
          label="Confirmar"
          placeholder="Repite tu contraseña"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          success={passwordsMatch ? "Coincide" : undefined}
          {...register("confirmPassword")}
        />

        <div className="flex flex-col gap-3 pt-1">
          <AuthCheckbox
            checked={acceptsTerms}
            onChange={(v) => setValue("acceptsTerms", v, { shouldValidate: true })}
            error={errors.acceptsTerms?.message}
          >
            Acepto los{" "}
            <a
              href="/legal/terminos"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium text-accent-strong"
            >
              términos y condiciones
            </a>{" "}
            y el{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium text-accent-strong"
            >
              aviso de privacidad
            </a>
            .
          </AuthCheckbox>

          <AuthCheckbox
            checked={acceptsCommunications}
            onChange={(v) => setValue("acceptsCommunications", v)}
          >
            Quiero recibir recordatorios y novedades por WhatsApp.
          </AuthCheckbox>

          {/* Consentimiento expreso para datos de salud (LFPDPPP, auditoría
              2026-09-27, P1-10). Opcional aquí: el registro no guarda salud;
              se vuelve obligatoria al escribirlos en el perfil. */}
          <AuthCheckbox
            checked={healthConsent}
            onChange={(v) => setValue("healthConsent", v)}
          >
            {HEALTH_CONSENT_TEXT}{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium text-accent-strong"
            >
              Leer el aviso
            </a>
            . Opcional al registrarte.
          </AuthCheckbox>
        </div>

        <AuthSubmit loading={isLoading} loadingLabel="Creando…">
          Crear mi cuenta
        </AuthSubmit>
      </form>

      <AuthDivider label="¿Ya tienes cuenta?" />

      <AuthSecondaryLink to={withReturnUrl("/auth/login", returnUrl)}>Iniciar sesión</AuthSecondaryLink>
    </AuthShell>
  );
};

export default Register;
