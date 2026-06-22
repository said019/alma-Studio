import { useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { Camera, ShieldCheck } from "lucide-react";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  PrimaryButton,
  GhostButton,
} from "@/components/app/AppShell";
import { BackLink, StickyCta } from "@/components/app/widgets";
import { Field, SelectField, TextAreaField } from "@/components/app/fields";
import { useToast } from "@/hooks/use-toast";
import type { UpdateProfileData } from "@/types/auth";

const schema = z.object({
  displayName: z.string().min(2, "Mínimo 2 caracteres"),
  phone: z
    .string()
    .regex(/^\+52[0-9]{10}$/, "Formato: +521234567890")
    .or(z.literal("")),
  gender: z.enum(["female", "male", "other", ""]).optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const ProfileEdit = () => {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        displayName: user.displayName ?? user.display_name ?? "",
        phone: user.phone ?? "",
        gender: (user as any).gender ?? "",
        dateOfBirth: user.dateOfBirth ?? user.date_of_birth ?? "",
        emergencyContactName: user.emergencyContactName ?? user.emergency_contact_name ?? "",
        emergencyContactPhone: user.emergencyContactPhone ?? user.emergency_contact_phone ?? "",
        healthNotes: user.healthNotes ?? user.health_notes ?? "",
      });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (data: UpdateProfileData) => api.put(`/users/${user?.id}`, data),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      toast({ title: "Perfil actualizado." });
      navigate("/app/profile");
    },
    onError: () => toast({ title: "No se guardaron los cambios", variant: "destructive" }),
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/me/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      const photoUrl = res?.data?.data?.photoUrl;
      if (photoUrl && user) updateUser({ ...user, photoUrl });
      toast({ title: "Foto de perfil actualizada" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "No se pudo subir la foto", variant: "destructive" }),
  });

  const onSubmit = (data: FormValues) => {
    mutation.mutate({
      displayName: data.displayName,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      healthNotes: data.healthNotes || undefined,
    } as any);
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Editar perfil"
          title={<>Tus datos</>}
          titleAccent="al día."
          subtitle="Esto nos ayuda a recibirte mejor y a comunicarnos contigo cuando lo necesitemos."
        />

        {/* ── Avatar uploader ── */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="relative h-20 w-20">
            {user?.photoUrl ? (
              <img
                src={user.photoUrl}
                alt={user.displayName ?? "Tu foto"}
                className="h-full w-full rounded-full object-cover border border-alma-hairline"
              />
            ) : (
              <span className="grid h-full w-full place-items-center rounded-full bg-alma-oat font-display text-2xl text-alma-ink">
                {String(user?.displayName ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "—"}
              </span>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-alma-ink text-alma-canvas shadow-sm hover:bg-alma-ink-deep disabled:opacity-60"
              aria-label="Cambiar foto de perfil"
            >
              <Camera size={14} />
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) avatarMutation.mutate(f); e.target.value = ""; }}
            />
          </div>
          <div className="text-center">
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="text-sm font-medium text-alma-ink underline underline-offset-2 hover:text-alma-ink/70 disabled:opacity-60"
            >
              {avatarMutation.isPending ? "Subiendo…" : "Cambiar foto"}
            </button>
            <p className="mt-0.5 text-xs text-alma-ink/55">Se usa para identificarte en el estudio.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Section title="Personal">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field
                label="Nombre completo"
                placeholder="Tu nombre"
                error={errors.displayName?.message}
                {...register("displayName")}
              />
              <Field
                label="Teléfono"
                placeholder="+521234567890"
                inputMode="tel"
                error={errors.phone?.message}
                {...register("phone")}
              />
              <SelectField label="Sexo" {...register("gender")}>
                <option value="">Selecciona</option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
                <option value="other">Prefiero no decir</option>
              </SelectField>
              <Field label="Fecha de nacimiento" type="date" {...register("dateOfBirth")} />
            </div>
          </Section>

          <Section title="En caso de emergencia">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field
                label="Nombre del contacto"
                placeholder="Nombre completo"
                {...register("emergencyContactName")}
              />
              <Field
                label="Teléfono del contacto"
                placeholder="10 dígitos"
                inputMode="tel"
                {...register("emergencyContactPhone")}
              />
            </div>
          </Section>

          <Section title="Salud">
            <TextAreaField
              label="Notas (opcional)"
              placeholder="Lesiones, alergias, condiciones que debamos saber al ajustar tu clase."
              hint="Solo el equipo del estudio ve esta información."
              {...register("healthNotes")}
            />
          </Section>

          <Section title="Seguridad">
            <ListGroup>
              <ListRow
                to="/app/profile/security"
                icon={<ShieldCheck size={17} strokeWidth={1.7} />}
                iconTint="berry"
                title="Cambiar contraseña"
                description="Actualiza tu acceso"
              />
            </ListGroup>
          </Section>

          <StickyCta>
            <div className="flex flex-wrap items-center gap-3">
              <PrimaryButton
                type="submit"
                className="flex-1 min-w-[180px]"
                disabled={mutation.isPending}
                loading={mutation.isPending}
                loadingLabel="Guardando…"
              >
                Guardar cambios
              </PrimaryButton>
              <GhostButton
                onClick={() => navigate("/app/profile")}
                disabled={mutation.isPending || !isDirty}
              >
                Descartar
              </GhostButton>
            </div>
          </StickyCta>
        </form>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfileEdit;
