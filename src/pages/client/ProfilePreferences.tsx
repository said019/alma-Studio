import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  ALMA,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { ShieldCheck } from "lucide-react";
// Switch shadcn ya tematizado: track activo = --primary (#43392F, ink),
// track inactivo = --input (hairline) y focus ring = --ring (#6E5A46, berry).
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type PrefKey = "receiveReminders" | "receivePromotions" | "receiveWeeklySummary";
type Prefs = Record<PrefKey, boolean>;

const ProfilePreferences = () => {
  const { user, updateUser } = useAuthStore();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [prefs, setPrefs] = useState<Prefs>({
    receiveReminders: user?.receiveReminders ?? user?.receive_reminders ?? true,
    receivePromotions: user?.receivePromotions ?? user?.receive_promotions ?? false,
    receiveWeeklySummary: user?.receiveWeeklySummary ?? user?.receive_weekly_summary ?? false,
  });

  // Autosave por toggle: optimista, con revert si el servidor falla.
  const mutation = useMutation({
    mutationFn: (vars: { next: Prefs; prev: Prefs }) =>
      api.put(`/users/${user?.id}`, vars.next),
    onSuccess: (res) => {
      const updated = res.data?.data ?? res.data;
      if (updated?.user) updateUser(updated.user);
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (_err, vars) => {
      setPrefs(vars.prev);
      toast({
        title: "No se guardó el cambio",
        description: "Revisa tu conexión e inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const handleToggle = (key: PrefKey, value: boolean) => {
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    mutation.mutate({ next, prev });
  };

  const items: { key: PrefKey; label: string; desc: string }[] = [
    {
      key: "receiveReminders",
      label: "Recordatorios de clase",
      desc: "Te avisamos antes de cada clase reservada.",
    },
    {
      key: "receivePromotions",
      label: "Novedades del estudio",
      desc: "Avisos sobre horarios, clases nuevas y comunidad.",
    },
    {
      key: "receiveWeeklySummary",
      label: "Resumen semanal",
      desc: "Un repaso de tus clases de la semana y lo que viene.",
    },
  ];

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />
        <PageHeader
          eyebrow="Preferencias"
          title={<>Qué te</>}
          titleAccent="avisamos."
          subtitle="Tú decides qué mensajes te llegan por WhatsApp y email. Tus cambios se guardan solos."
        />

        <Section
          trailing={
            <span
              aria-live="polite"
              className="text-[0.72rem] uppercase tracking-[0.18em]"
              style={{ color: ALMA.ink, opacity: 0.5 }}
            >
              {mutation.isPending ? "Guardando…" : ""}
            </span>
          }
        >
          <ul className="list-none m-0 p-0">
            {items.map((it, i, arr) => (
              <li
                key={it.key}
                className="grid grid-cols-[1fr_auto] items-center gap-5 py-5"
                style={{
                  borderTop: `1px solid ${ALMA.border}`,
                  borderBottom: i === arr.length - 1 ? `1px solid ${ALMA.border}` : undefined,
                }}
              >
                <div>
                  <p className="text-[0.94rem] font-medium leading-tight" style={{ color: ALMA.ink }}>
                    {it.label}
                  </p>
                  <p className="mt-1 text-[0.84rem] leading-[1.55]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                    {it.desc}
                  </p>
                </div>
                <Switch
                  checked={prefs[it.key]}
                  onCheckedChange={(v) => handleToggle(it.key, v)}
                  aria-label={it.label}
                />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Privacidad">
          <ListGroup>
            <ListRow
              to="/legal/privacidad"
              icon={<ShieldCheck size={17} strokeWidth={1.7} />}
              iconTint="olive"
              title="Cómo cuidamos tus datos"
              description="Aviso de privacidad"
            />
          </ListGroup>
        </Section>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfilePreferences;
