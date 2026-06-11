import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/authStore";
import { useNavigate } from "react-router-dom";
import { ALMA } from "@/components/app/tokens";
import { PrimaryButton } from "@/components/app/AppShell";
import { PasswordField, PasswordRules } from "@/components/app/fields";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Escribe tu contraseña actual"),
    newPassword: z
      .string()
      .min(8, "Mínimo 8 caracteres")
      .regex(/[A-Z]/, "Debe incluir una mayúscula")
      .regex(/[0-9]/, "Debe incluir un número"),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "La nueva contraseña debe ser distinta a la actual",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

/**
 * Tarjeta reutilizable para cambiar la contraseña estando logueado.
 * La usan tanto el perfil del cliente como la config del admin.
 * Campos, errores y CTA usan los tokens canónicos de la app
 * (vía fields.tsx y PrimaryButton), no la paleta legacy de AuthShell.
 *
 * Props:
 *  - logoutAfter: si true, al cambiar la contraseña cierra sesión y manda
 *    a /auth/login (recomendado para que el usuario re-entre con la nueva).
 */
export const ChangePassword = ({
  logoutAfter = false,
}: {
  logoutAfter?: boolean;
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [serverError, setServerError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const newPassword = watch("newPassword") ?? "";

  const onSubmit = async (data: FormValues) => {
    setServerError(null);
    try {
      await api.post("/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      setDone(true);
      reset();
      toast({ title: "Contraseña actualizada." });
      if (logoutAfter) {
        setTimeout(() => {
          logout();
          navigate("/auth/login");
        }, 1200);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? "No pudimos cambiar la contraseña.";
      setServerError(msg);
    }
  };

  if (done && !logoutAfter) {
    return (
      <div
        role="status"
        className="rounded-2xl px-5 py-4 text-[0.9rem] leading-[1.55]"
        style={{
          backgroundColor: `${ALMA.olive}14`,
          border: `1px solid ${ALMA.olive}40`,
          color: ALMA.ink,
        }}
      >
        Tu contraseña se actualizó correctamente.{" "}
        <button
          type="button"
          onClick={() => setDone(false)}
          className="font-medium underline bg-transparent border-0 p-0 cursor-pointer"
          style={{ color: ALMA.berry }}
        >
          Cambiar de nuevo
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
      {serverError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.86rem]"
          style={{
            backgroundColor: `${ALMA.destructive}10`,
            border: `1px solid ${ALMA.destructive}30`,
            color: ALMA.destructive,
          }}
        >
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="leading-[1.5]">{serverError}</span>
        </div>
      )}

      <PasswordField
        label="Contraseña actual"
        placeholder="Tu contraseña actual"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register("currentPassword")}
      />

      <div className="flex flex-col gap-3">
        <PasswordField
          label="Nueva contraseña"
          placeholder="Mínimo 8 caracteres"
          autoComplete="new-password"
          error={errors.newPassword?.message}
          {...register("newPassword")}
        />
        <PasswordRules password={newPassword} />
      </div>

      <PasswordField
        label="Confirmar nueva contraseña"
        placeholder="Repite la nueva contraseña"
        autoComplete="new-password"
        error={errors.confirmPassword?.message}
        {...register("confirmPassword")}
      />

      <div className="pt-1">
        <PrimaryButton
          type="submit"
          className="w-full sm:w-auto"
          loading={isSubmitting}
          loadingLabel="Guardando…"
        >
          Cambiar contraseña
        </PrimaryButton>
      </div>
    </form>
  );
};

export default ChangePassword;
