import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
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
  ALMA,
} from "@/components/auth/AuthShell";
import { Check } from "lucide-react";

const todayISO = new Date().toISOString().slice(0, 10);

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 10, "Debe tener 10 dígitos"),
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
}).refine((d) => d.password === d.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type FormValues = {
  displayName: string;
  email: string;
  phone: string;
  gender: "female" | "male" | "other";
  dateOfBirth: string;
  password: string;
  confirmPassword: string;
  acceptsTerms: boolean;
  acceptsCommunications: boolean;
};

const Register = () => {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const refCode = params.get("ref");

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { acceptsTerms: false, acceptsCommunications: false },
  });

  const acceptsTerms = watch("acceptsTerms");
  const acceptsCommunications = watch("acceptsCommunications");
  const password = watch("password") ?? "";
  const confirmPassword = watch("confirmPassword") ?? "";
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const onSubmit = async (data: FormValues) => {
    clearError();
    const rawPhone = data.phone.replace(/\D/g, "");
    const phone = rawPhone.startsWith("52") ? `+${rawPhone}` : `+52${rawPhone}`;
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
        ...(refCode ? { referralCode: refCode } : {}),
      } as any);
      navigate("/auth/onboarding");
    } catch {
      // El error del store se muestra en el AuthErrorBanner, único canal de error.
    }
  };

  return (
    <AuthShell
      brandTint="berry"
      brandEyebrow="Nueva en Alma"
      brandHeadline={<>Te recibimos</>}
      brandHeadlineItalic="como te recibe una amiga."
      brandSubline="Crea tu cuenta y reserva tu primera clase. Grupos pequeños, atención personalizada, técnica cuidada."
      brandList={[
        { label: "Reservas y check-in en línea" },
        { label: "Tus reservas y clases siempre a la mano" },
        { label: "Recordatorios por WhatsApp" },
        { label: "Atención cercana: te conocen por tu nombre" },
      ]}
      formEyebrow="Crear cuenta"
      formHeadline="Únete a"
      formHeadlineItalic="Alma."
    >
      {refCode && (
        <div
          className="mb-6 flex items-center gap-3 rounded-2xl px-4 py-3 text-[0.84rem]"
          style={{ backgroundColor: ALMA.blush, color: ALMA.berry, border: `1px solid ${ALMA.berry}30` }}
        >
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}>
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
          <AuthField
            label="WhatsApp"
            placeholder="4271234567"
            inputMode="numeric"
            autoComplete="tel"
            hint="Solo dígitos, agregamos +52"
            error={errors.phone?.message}
            {...register("phone")}
          />
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
              className="no-underline font-medium"
              style={{ color: ALMA.berry }}
            >
              términos y condiciones
            </a>{" "}
            y el{" "}
            <a
              href="/legal/privacidad"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline font-medium"
              style={{ color: ALMA.berry }}
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
        </div>

        <AuthSubmit loading={isLoading} loadingLabel="Creando…">
          Crear mi cuenta
        </AuthSubmit>
      </form>

      <AuthDivider label="¿Ya tienes cuenta?" />

      <AuthSecondaryLink to="/auth/login">Iniciar sesión</AuthSecondaryLink>
    </AuthShell>
  );
};

export default Register;
