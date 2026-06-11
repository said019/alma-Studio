import { useQuery } from "@tanstack/react-query";
import { format, differenceInCalendarDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { safeParse } from "@/lib/utils";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  GhostButton,
  EmptyState,
  SkeletonRow,
  ErrorState,
  ALMA,
} from "@/components/app/AppShell";
import { BackLink, DataRow, InfoBanner } from "@/components/app/widgets";
import { CreditCard } from "lucide-react";
import type { ClientMembership } from "@/types/membership";

const STATUS: Record<string, { label: string; tone: keyof typeof ALMA }> = {
  active: { label: "Activa", tone: "olive" },
  expired: { label: "Vencida", tone: "destructive" },
  pending_payment: { label: "Pago pendiente", tone: "berry" },
  pending_activation: { label: "Por activar", tone: "berry" },
  cancelled: { label: "Cancelada", tone: "destructive" },
};

const CATEGORY_LABEL: Record<string, string> = {
  studio: "Studio",
  reformer_tower: "Reformer/Tower",
  mixto: "Mixto",
  all: "Todas las disciplinas",
};

const CANCELLATION_RULES = [
  "Cancela con más de 12 horas de anticipación sin penalización.",
  "Cancelar dentro de las 12h previas cuenta como falta.",
  "Al acumular 5 faltas se aplica una penalización con pérdida de puntos.",
];

const ProfileMembership = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const membership: (ClientMembership & { classCategory?: string }) | null =
    data?.data ?? data ?? null;

  const daysRemaining = membership?.end_date
    ? Math.max(differenceInCalendarDays(safeParse(membership.end_date), new Date()), 0)
    : null;
  const status = membership ? STATUS[membership.status] ?? { label: membership.status, tone: "berry" as const } : null;
  const isUnlimited =
    membership && (membership.class_limit === null || Number(membership.class_limit) >= 9999);
  const classesUsed = membership?.class_limit
    ? Math.max(0, Number(membership.class_limit) - Number(membership.classes_remaining ?? 0))
    : 0;
  const classesPercent =
    membership && membership.class_limit && !isUnlimited
      ? Math.min(100, Math.round((classesUsed / Number(membership.class_limit)) * 100))
      : null;

  // Dos estados honestos: normal (berry) y "por agotarse / por vencer"
  // (destructive suave) SOLO cuando queda <20% del paquete o <7 días.
  const lowClasses = classesPercent !== null && classesPercent > 80;
  const lowDays = daysRemaining !== null && daysRemaining < 7 && membership?.status === "active";
  const isLow = lowClasses || lowDays;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/profile" label="Perfil" />

        {isLoading ? (
          <SkeletonRow height={300} />
        ) : isError ? (
          <ErrorState
            title="No pudimos cargar tu membresía"
            description="Revisa tu conexión y vuelve a intentarlo."
            onRetry={() => refetch()}
          />
        ) : !membership ? (
          <>
            <PageHeader eyebrow="Tu membresía" title="Mi membresía." />
            <Section>
              <EmptyState
                icon={<CreditCard size={20} />}
                title="Aún no tienes paquete activo."
                description="Compra tu primer paquete y reserva en un tap; cada clase que tomas cuenta."
                ctaLabel="Ver paquetes"
                ctaTo="/app/checkout"
              />
            </Section>
          </>
        ) : (
          <>
            <PageHeader
              eyebrow="Tu membresía"
              title={membership.planName ?? membership.plan_name ?? "Tu paquete"}
              actions={status ? <Tag tint={status.tone}>{status.label}</Tag> : null}
            />

            <Section>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.blush }}>
                <div className="flex items-baseline justify-between gap-4 pb-3" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
                    {CATEGORY_LABEL[String(membership.classCategory ?? "all")] ?? "Todas las disciplinas"}
                  </span>
                  <span className="nums font-display" style={{ color: ALMA.berry, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                    {isUnlimited ? "∞" : Number(membership.classes_remaining ?? 0)}{" "}
                    <span className="text-[0.72rem] font-sans uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                      por usar
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                  <DataRow
                    label="Inicio"
                    value={
                      membership.start_date
                        ? format(safeParse(membership.start_date), "d MMM yyyy", { locale: es })
                        : "Sin fecha"
                    }
                  />
                  <DataRow
                    label="Vence"
                    value={
                      membership.end_date
                        ? format(safeParse(membership.end_date), "d MMM yyyy", { locale: es })
                        : "Sin fecha"
                    }
                  />
                  <DataRow
                    label="Días restantes"
                    value={daysRemaining ?? "∞"}
                  />
                  <DataRow
                    label="Total del paquete"
                    value={isUnlimited ? "Ilimitado" : Number(membership.class_limit ?? 0)}
                  />
                </div>
              </div>
            </Section>

            {classesPercent !== null && (
              <Section title="Avance del paquete">
                <div className="rounded-2xl p-5" style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}>
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <span className="nums text-[0.78rem]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                      {classesUsed} de {Number(membership.class_limit)} usadas
                    </span>
                    <span
                      className="nums font-display text-[1.2rem]"
                      style={{ color: isLow ? ALMA.destructive : ALMA.berry }}
                    >
                      {classesPercent}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: ALMA.blush }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-700"
                      style={{
                        width: `${classesPercent}%`,
                        backgroundColor: isLow ? ALMA.destructive : ALMA.berry,
                      }}
                    />
                  </div>
                  {isLow && (
                    <p className="mt-2.5 text-[0.78rem]" style={{ color: ALMA.destructive }}>
                      {lowClasses
                        ? "Te quedan pocas clases en este paquete."
                        : "Tu paquete vence pronto."}
                    </p>
                  )}
                </div>
              </Section>
            )}

            <Section title="Cancelaciones">
              <ol className="list-none m-0 p-0">
                {CANCELLATION_RULES.map((line, i, arr) => (
                  <li
                    key={line}
                    className="grid grid-cols-[auto_1fr] items-baseline gap-4 py-3.5"
                    style={{
                      borderTop: `1px solid ${ALMA.border}`,
                      borderBottom: i === arr.length - 1 ? `1px solid ${ALMA.border}` : undefined,
                    }}
                  >
                    <span className="nums font-display text-[0.95rem] leading-none" style={{ color: ALMA.berry }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[0.9rem] leading-[1.55]" style={{ color: ALMA.ink, opacity: 0.78 }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>

            {(membership.status !== "active" || (daysRemaining !== null && daysRemaining <= 7)) && (
              <Section>
                <InfoBanner
                  tone={membership.status === "active" ? "destructive" : "berry"}
                  title={
                    membership.status === "active"
                      ? "Tu paquete vence pronto."
                      : "Tu paquete ya no está activo."
                  }
                  description={
                    membership.status === "active"
                      ? `Te quedan ${daysRemaining} ${daysRemaining === 1 ? "día" : "días"}. Renueva para no perder ritmo.`
                      : "Compra uno nuevo para seguir reservando."
                  }
                  action={<PrimaryButton size="sm" to="/app/checkout">Renovar</PrimaryButton>}
                />
              </Section>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
              <GhostButton to="/app/wallet">Ver mi wallet</GhostButton>
              <GhostButton to="/app/orders">Historial de compras</GhostButton>
            </div>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default ProfileMembership;
