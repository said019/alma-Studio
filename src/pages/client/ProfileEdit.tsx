import { useEffect, useRef, useState } from "react";
import { FEATURES } from "@/config/features";
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
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { AuthCheckbox } from "@/components/auth/AuthShell";
import { HEALTH_CONSENT_TEXT, hasCurrentHealthConsent } from "@/lib/legal/privacy-notice";

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

  // Consentimiento expreso para datos de salud (auditoría 2026-09-27, P1-10):
  // a las clientas existentes se les pide la próxima vez que escriban salud, sin
  // bloquear lo demás.
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [confirmarRetiro, setConfirmarRetiro] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const yaConsintio = hasCurrentHealthConsent(user as { healthConsentVersion?: string | null; healthConsentAt?: string | null } | null);
  const consentidoEl = user?.healthConsentAt ? format(parseISO(user.healthConsentAt), "d 'de' MMMM, yyyy", { locale: es }) : null;
  // Ronda de ajustes 1 (P1-10): una clienta con notas o lesión guardadas pero
  // sin consentimiento vigente (dato capturado por el equipo, o de una versión
  // anterior del aviso) también debe poder borrarlas, no sólo "retirar" un
  // consentimiento que no tiene.
  const tieneDatosSalud = Boolean(
    String(user?.healthNotes ?? user?.health_notes ?? "").trim() ||
    user?.hasInjury ||
    String(user?.injuryDetails ?? "").trim(),
  );

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
    onError: (e: any) => {
      if (e?.response?.data?.code === "HEALTH_CONSENT_REQUIRED") setConsentError(e.response.data.message);
      toast({ title: "No se guardaron los cambios", description: e?.response?.data?.message, variant: "destructive" });
    },
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

  const retirar = useMutation({
    mutationFn: (_origen: "retirar" | "borrar") => api.delete("/me/health-consent"),
    onSuccess: (res, origen) => {
      const updated = res.data?.user;
      if (updated) updateUser(updated);
      setConfirmarRetiro(false);
      setConfirmarBorrar(false);
      setConsent(false);
      reset({ ...(user as unknown as Record<string, unknown>), healthNotes: "" } as never);
      toast({
        title: origen === "retirar" ? "Retiraste tu consentimiento" : "Borramos tus datos de salud",
        description: "Borramos tus datos de salud de tu perfil.",
      });
    },
    onError: () => toast({ title: "No pudimos borrarlos", description: "Inténtalo de nuevo o pídelo en recepción.", variant: "destructive" }),
  });

  const onSubmit = (data: FormValues) => {
    const notasNuevas = (data.healthNotes ?? "").trim();
    const notasGuardadas = String(user?.healthNotes ?? user?.health_notes ?? "").trim();
    const escribeSalud = notasNuevas !== "" && notasNuevas !== notasGuardadas;
    if (escribeSalud && !yaConsintio && !consent) {
      setConsentError("Marca la casilla para guardar tus datos de salud.");
      return;
    }
    setConsentError(null);
    mutation.mutate({
      displayName: data.displayName,
      phone: data.phone || undefined,
      gender: data.gender || undefined,
      dateOfBirth: data.dateOfBirth || undefined,
      emergencyContactName: data.emergencyContactName || undefined,
      emergencyContactPhone: data.emergencyContactPhone || undefined,
      healthNotes: data.healthNotes || undefined,
      ...(!yaConsintio && consent ? { healthConsent: true } : {}),
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
                className="h-full w-full rounded-full object-cover border border-line"
              />
            ) : (
              <span className="grid h-full w-full place-items-center rounded-full bg-sunken font-display text-2xl text-ink">
                {String(user?.displayName ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "—"}
              </span>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarMutation.isPending}
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-ink text-canvas shadow-sm hover:bg-inverse disabled:opacity-60"
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
              className="text-sm font-medium text-ink underline underline-offset-2 hover:text-ink/70 disabled:opacity-60"
            >
              {avatarMutation.isPending ? "Subiendo…" : "Cambiar foto"}
            </button>
            <p className="mt-0.5 text-xs text-ink/55">Se usa para identificarte en el estudio.</p>
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
            {yaConsintio ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="m-0 text-[0.8125rem] text-ink-muted">
                  Autorizaste el tratamiento de tus datos de salud{consentidoEl ? ` el ${consentidoEl}` : ""}.
                </p>
                {confirmarRetiro ? (
                  <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                    <p className="m-0 text-[0.8125rem] text-ink">Se borran tus notas de salud y tus lesiones registradas. El equipo ya no las verá.</p>
                    <div className="flex flex-wrap gap-2">
                      <GhostButton tone="danger" onClick={() => retirar.mutate("retirar")} disabled={retirar.isPending}>Sí, retirar y borrar</GhostButton>
                      <GhostButton onClick={() => setConfirmarRetiro(false)}>Volver</GhostButton>
                    </div>
                  </div>
                ) : (
                  <div>
                    <GhostButton onClick={() => setConfirmarRetiro(true)}>Retirar mi consentimiento</GhostButton>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <AuthCheckbox
                  checked={consent}
                  onChange={(v) => { setConsent(v); if (v) setConsentError(null); }}
                  error={consentError ?? undefined}
                >
                  {HEALTH_CONSENT_TEXT}{" "}
                  <a href="/legal/privacidad" target="_blank" rel="noopener noreferrer" className="no-underline font-medium text-accent-strong">
                    Leer el aviso
                  </a>
                </AuthCheckbox>

                {/* Ronda de ajustes 1 (P1-10): notas o lesión guardadas sin
                    consentimiento vigente (p. ej. capturadas por el equipo, o de
                    una versión anterior del aviso) — sin esto no había forma de
                    borrarlas desde la app. */}
                {tieneDatosSalud && (
                  confirmarBorrar ? (
                    <div className="flex flex-col gap-2 rounded-2xl border border-line p-3">
                      <p className="m-0 text-[0.8125rem] text-ink">Se borran tus notas de salud y tus lesiones registradas. El equipo ya no las verá.</p>
                      <div className="flex flex-wrap gap-2">
                        <GhostButton tone="danger" onClick={() => retirar.mutate("borrar")} disabled={retirar.isPending}>Sí, borrar mis datos</GhostButton>
                        <GhostButton onClick={() => setConfirmarBorrar(false)}>Volver</GhostButton>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <GhostButton tone="danger" onClick={() => setConfirmarBorrar(true)}>Borrar mis datos de salud</GhostButton>
                    </div>
                  )
                )}
              </div>
            )}
          </Section>

          <Section title="Seguridad">
            <ListGroup>
              {FEATURES.profileSecurity && (
                <ListRow
                  to="/app/profile/security"
                  icon={<ShieldCheck size={17} strokeWidth={1.7} />}
                  iconTint="accent"
                  title="Cambiar contraseña"
                  description="Actualiza tu acceso"
                />
              )}
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
