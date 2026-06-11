import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { es } from "date-fns/locale";
import { format, isToday, isTomorrow } from "date-fns";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import { safeParse } from "@/lib/utils";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  ListRow,
  Tag,
  EmptyState,
  ErrorState,
  PrimaryButton,
  GhostButton,
  ActionRow,
  SkeletonRow,
  ALMA,
} from "@/components/app/AppShell";
import {
  CalendarDays,
  Award,
  ClipboardList,
  ShoppingBag,
  Wallet as WalletIcon,
} from "lucide-react";
import type { ClientMembership } from "@/types/membership";
import type { BookingClient } from "@/types/booking";

const formatBookingTime = (iso: string | null | undefined) => {
  if (!iso) return "Por confirmar";
  const d = safeParse(iso);
  if (isToday(d)) return `Hoy · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Mañana · ${format(d, "HH:mm")}`;
  return format(d, "EEE d MMM · HH:mm", { locale: es });
};

/* Fila editorial label → valor para la pieza de membresía (sobre blush,
   el hairline sube a sandstone para que se lea). */
const AccountRow = ({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
}) => (
  <div
    className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5"
    style={{ borderTop: `1px solid ${ALMA.sandstone}` }}
  >
    <span className="text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.6 }}>
      {label}
    </span>
    <span className="nums text-[1.05rem] font-medium text-right" style={{ color: accent ? ALMA.berry : ALMA.ink }}>
      {value}
    </span>
  </div>
);

const Dashboard = () => {
  const { user } = useAuthStore();

  const {
    data: membershipData,
    isLoading: loadingMembership,
    isError: membershipError,
    refetch: refetchMembership,
  } = useQuery({
    queryKey: ["my-membership"],
    queryFn: async () => (await api.get("/memberships/my")).data,
  });

  const {
    data: bookingsData,
    isLoading: loadingBookings,
    isError: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const {
    data: walletData,
    isLoading: loadingWallet,
    isError: walletError,
    refetch: refetchWallet,
  } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
    retry: false,
  });

  const {
    data: milestonesData,
    isError: milestonesError,
    refetch: refetchMilestones,
  } = useQuery({
    queryKey: ["my-milestones"],
    queryFn: async () => (await api.get("/loyalty/milestones/me")).data,
    retry: false,
  });
  const ms = milestonesData?.data ?? null;

  const membership: ClientMembership | null = membershipData?.data ?? membershipData ?? null;
  const bookings: BookingClient[] = Array.isArray(bookingsData?.data) ? bookingsData.data : Array.isArray(bookingsData) ? bookingsData : [];
  const wallet = walletData?.data ?? walletData ?? null;

  const planName = membership?.planName ?? membership?.plan_name ?? "Sin paquete activo";
  const classLimit = membership?.classLimit ?? membership?.class_limit ?? null;
  const classesRemaining = membership?.classesRemaining ?? membership?.classes_remaining ?? null;
  const membershipEnd = membership?.endDate ?? membership?.end_date ?? null;
  const walletPoints = Number(wallet?.points ?? 0);

  const now = new Date();
  const upcoming = bookings
    .filter((b) => (b.status === "confirmed" || b.status === "waitlist") && new Date(b.start_time) >= now)
    .slice(0, 3);
  const nextBooking = upcoming[0];

  const firstName = (user?.displayName ?? user?.display_name ?? "").split(" ")[0] || "alumna";

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell>
        <PageHeader
          eyebrow={`Hoy · ${format(new Date(), "EEEE d MMM", { locale: es })}`}
          title={<>Tu semana en</>}
          titleAccent="Alma."
          subtitle="Tu próxima clase, tu membresía y tus recompensas, en un solo lugar."
        />

        {/* ── Próxima clase, la acción principal ── */}
        <div className="mt-2">
          {loadingBookings ? (
            <SkeletonRow height={108} />
          ) : bookingsError ? (
            <ErrorState
              title="No pudimos cargar tu agenda"
              description="Tus reservas siguen ahí, solo no pudimos traerlas. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetchBookings()}
            />
          ) : nextBooking ? (
            <ActionRow
              to="/app/bookings"
              eyebrow="Tu próxima clase"
              title={nextBooking.class_type_name ?? "Clase"}
              meta={
                <>
                  {formatBookingTime(nextBooking.start_time)}
                  {nextBooking.instructor_name ? ` · ${nextBooking.instructor_name}` : ""}
                  {nextBooking.status === "waitlist" ? " · en lista de espera" : ""}
                </>
              }
              rightLabel="Ver detalle"
              tint="berry"
            />
          ) : (
            <ActionRow
              to="/app/classes"
              eyebrow="Sin clase reservada"
              title="Reserva tu próxima clase"
              meta="Grupos pequeños, cada clase es distinta."
              rightLabel="Reservar"
              tint="stone"
            />
          )}
        </div>

        {/* ── Próximo milestone (recompensa por asistencia) ── */}
        {milestonesError ? (
          <Section title="Tu próximo logro">
            <div
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 px-1"
              style={{ borderBottom: `1px solid ${ALMA.border}` }}
            >
              <p className="text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                No pudimos cargar tu progreso de logros.
              </p>
              <GhostButton onClick={() => refetchMilestones()}>Reintentar</GhostButton>
            </div>
          </Section>
        ) : ms?.next_milestone ? (
          <Section
            title="Tu próximo logro"
            trailing={
              <Link to="/app/wallet/rewards" className="no-underline" style={{ color: ALMA.berry }}>
                Ver todos
              </Link>
            }
          >
            <Link
              to="/app/wallet/rewards"
              data-lift
              className="block no-underline rounded-3xl p-5 sm:p-6"
              style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}
            >
              <div className="flex items-start gap-4">
                <span
                  className="grid h-12 w-12 place-items-center rounded-2xl shrink-0"
                  style={{ backgroundColor: ALMA.blush, color: ALMA.berry }}
                >
                  <Award size={20} strokeWidth={1.8} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "1.25rem" }}>
                      {ms.next_milestone.name}
                    </h3>
                    <span className="nums text-[0.72rem] font-medium uppercase tracking-[0.18em]" style={{ color: ALMA.berry }}>
                      +{ms.next_milestone.award_points} pts
                    </span>
                  </div>
                  <div className="mt-3">
                    <div className="flex items-center justify-between gap-3 text-[0.74rem]">
                      <span className="nums" style={{ color: ALMA.ink, opacity: 0.7 }}>
                        <strong style={{ color: ALMA.berry }}>{ms.lifetime_classes}</strong> de {ms.next_milestone.classes_required} clases
                      </span>
                      <span className="nums font-medium" style={{ color: ALMA.berry }}>
                        Te faltan {ms.next_remaining ?? 0}
                      </span>
                    </div>
                    <div
                      className="mt-2 h-1.5 rounded-full overflow-hidden"
                      style={{ backgroundColor: ALMA.blush }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={ms.next_milestone.classes_required}
                      aria-valuenow={ms.lifetime_classes}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round((ms.lifetime_classes / Math.max(1, ms.next_milestone.classes_required)) * 100))}%`,
                          backgroundColor: ALMA.berry,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          </Section>
        ) : null}

        {/* ── Membresía + wallet: pieza editorial y fila secundaria ── */}
        <Section title="Tu cuenta">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-3xl p-5 sm:p-6" style={{ backgroundColor: ALMA.blush }}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
                  Membresía
                </span>
                {!membershipError && membership && classLimit !== null && (
                  <Tag tint="olive">Activa</Tag>
                )}
              </div>
              {loadingMembership ? (
                <SkeletonRow height={120} />
              ) : membershipError ? (
                <>
                  <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "1.25rem" }}>
                    No pudimos cargar tu membresía
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                    Revisa tu conexión y vuelve a intentarlo.
                  </p>
                  <div className="mt-5">
                    <GhostButton onClick={() => refetchMembership()}>Reintentar</GhostButton>
                  </div>
                </>
              ) : membership ? (
                <>
                  <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.45rem, 2.2vw, 1.8rem)" }}>
                    {planName}
                  </h3>
                  <div className="mt-4">
                    <AccountRow label="Clases por usar" value={classesRemaining ?? "·"} accent />
                    <AccountRow label="Total del paquete" value={classLimit ?? "·"} />
                    {membershipEnd && (
                      <AccountRow
                        label="Vigente hasta"
                        value={format(safeParse(membershipEnd), "d MMM yyyy", { locale: es })}
                      />
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <PrimaryButton size="sm" to="/app/profile/membership">Ver membresía</PrimaryButton>
                    <GhostButton to="/app/checkout">Renovar</GhostButton>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.45rem, 2.2vw, 1.8rem)" }}>
                    Sin paquete activo
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                    Cuando actives un paquete, cada clase que tomas cuenta para tu constancia y reservas en un tap.
                  </p>
                  <div className="mt-5">
                    <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                  </div>
                </>
              )}
            </div>

            {walletError ? (
              <div
                className="lg:col-span-5 rounded-3xl p-5 sm:p-6 flex flex-col justify-between gap-5"
                style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}
              >
                <div>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
                    Wallet
                  </span>
                  <p className="mt-2 text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.65 }}>
                    No pudimos cargar tus puntos.
                  </p>
                </div>
                <div>
                  <GhostButton onClick={() => refetchWallet()}>Reintentar</GhostButton>
                </div>
              </div>
            ) : (
              <Link
                to="/app/wallet"
                data-lift
                className="lg:col-span-5 rounded-3xl p-5 sm:p-6 no-underline flex flex-col justify-between gap-5"
                style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}`, color: ALMA.ink }}
              >
                <div>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em]" style={{ color: ALMA.berry }}>
                    Wallet
                  </span>
                  {loadingWallet ? (
                    <div className="mt-3">
                      <SkeletonRow height={44} />
                    </div>
                  ) : (
                    <div
                      className="mt-3 grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5"
                      style={{ borderTop: `1px solid ${ALMA.border}` }}
                    >
                      <span className="text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                        Puntos
                      </span>
                      <span className="nums font-display text-2xl leading-none" style={{ color: ALMA.ink }}>
                        {walletPoints}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[0.74rem]" style={{ color: ALMA.berry }}>
                  <span className="uppercase tracking-[0.18em]">Ver recompensas</span>
                  <WalletIcon size={16} strokeWidth={1.8} />
                </div>
              </Link>
            )}
          </div>
        </Section>

        {/* ── Próximas clases (si hay más de la destacada) ── */}
        {!loadingBookings && !bookingsError && upcoming.length > 1 && (
          <Section title="También en tu agenda" trailing={<Link to="/app/bookings" className="no-underline" style={{ color: ALMA.berry }}>Ver todas</Link>}>
            <ListGroup>
              {upcoming.slice(1).map((b) => (
                <ListRow
                  key={b.id}
                  to="/app/bookings"
                  icon={<CalendarDays size={17} strokeWidth={1.7} />}
                  iconTint="berry"
                  title={b.class_type_name ?? "Clase"}
                  description={
                    <>
                      {formatBookingTime(b.start_time)}
                      {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                    </>
                  }
                  trailing={
                    b.status === "waitlist" ? (
                      <Tag tint="berry">En espera</Tag>
                    ) : (
                      <Tag tint="olive">Confirmada</Tag>
                    )
                  }
                />
              ))}
            </ListGroup>
          </Section>
        )}

        {!loadingBookings && !bookingsError && upcoming.length === 0 && (
          <Section title="Tu agenda">
            <EmptyState
              icon={<CalendarDays size={20} />}
              title="Aún no tienes clases reservadas."
              description="Grupos pequeños, cada clase es distinta. Reserva la tuya."
              ctaLabel="Reservar clase"
              ctaTo="/app/classes"
            />
          </Section>
        )}

        {/* ── Atajos: filas con hairline, destinos verificados en App.tsx ── */}
        <Section title="Atajos">
          <ListGroup>
            <ListRow
              to="/app/bookings"
              icon={<ClipboardList size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Mis reservas"
              description="Próximas y pasadas"
            />
            <ListRow
              to="/app/wallet/rewards"
              icon={<Award size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Recompensas"
              description="Canjea tus puntos"
            />
            <ListRow
              to="/app/orders"
              icon={<ShoppingBag size={17} strokeWidth={1.7} />}
              iconTint="berry"
              title="Mis compras"
              description="Tus pagos y paquetes"
            />
          </ListGroup>
        </Section>

        <p className="mt-12 lg:mt-16 text-[0.74rem]" style={{ color: ALMA.ink, opacity: 0.45 }}>
          Buena clase, {firstName}.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Dashboard;
