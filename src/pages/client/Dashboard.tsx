import type { ReactNode } from "react";
import { FEATURES } from "@/config/features";
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

/* Fila editorial label → valor para la pieza de membresía. */
const AccountRow = ({
  label,
  value,
  valueClassName = "text-[1.05rem] font-medium text-ink",
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) => (
  <div className="grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5 border-t border-line">
    <span className="text-[0.72rem] uppercase tracking-[0.18em] text-ink-muted">
      {label}
    </span>
    <span className={`nums text-right ${valueClassName}`}>
      {value}
    </span>
  </div>
);

/* Anillo de progreso del próximo logro: pista en text-line, avance en
   text-accent, ambos en stroke="currentColor" para seguir al tema. */
const RING_R = 26;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

const MilestoneRing = ({ value, max }: { value: number; max: number }) => {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - pct);
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="32" cy="32" r={RING_R} fill="none" strokeWidth="6" className="text-line" stroke="currentColor" />
      <circle
        cx="32"
        cy="32"
        r={RING_R}
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        className="text-accent"
        stroke="currentColor"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
      />
    </svg>
  );
};

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
          title="Tu semana"
          titleAccent="en HIVE."
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
              tint="accent"
            />
          ) : (
            <ActionRow
              to="/app/classes"
              eyebrow="Sin clase reservada"
              title="Reserva tu próxima clase"
              meta="Grupos pequeños, cada clase es distinta."
              rightLabel="Reservar"
              tint="muted"
            />
          )}
        </div>

        {/* ── Próximo milestone (recompensa por asistencia) ── */}
        {milestonesError ? (
          <Section title="Tu próximo logro">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 py-4 px-1 border-b border-line">
              <p className="text-[0.92rem] leading-[1.6] text-ink-muted">
                No pudimos cargar tu progreso de logros.
              </p>
              <GhostButton onClick={() => refetchMilestones()}>Reintentar</GhostButton>
            </div>
          </Section>
        ) : ms?.next_milestone ? (
          <Section
            title="Tu próximo logro"
            trailing={
              FEATURES.walletExtras && (
                <Link to="/app/wallet/rewards" className="no-underline text-accent-strong">
                  Ver todos
                </Link>
              )
            }
          >
            {FEATURES.walletExtras && (
              <Link
                to="/app/wallet/rewards"
                data-lift
                className="flex items-center gap-4 no-underline rounded-[20px] border border-line bg-surface dark:bg-surface/70 p-5 sm:p-6"
              >
                <MilestoneRing value={ms.lifetime_classes} max={ms.next_milestone.classes_required} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <h3 className="font-display leading-tight text-ink text-[1.25rem]">
                      {ms.next_milestone.name}
                    </h3>
                    <span className="nums text-[0.72rem] font-medium uppercase tracking-[0.18em] text-accent-strong">
                      +{ms.next_milestone.award_points} pts
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-[0.74rem]">
                    <span className="nums text-ink-muted">
                      <strong className="text-accent-strong">{ms.lifetime_classes}</strong> de {ms.next_milestone.classes_required} clases
                    </span>
                    <span className="nums font-medium text-accent-strong">
                      Te faltan {ms.next_remaining ?? 0}
                    </span>
                  </div>
                </div>
              </Link>
            )}
          </Section>
        ) : null}

        {/* ── Membresía + wallet: pieza editorial y fila secundaria ── */}
        <Section title="Tu cuenta">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-[20px] border border-line bg-surface dark:bg-surface/70 p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-accent-strong">
                  Membresía
                </span>
                {!membershipError && membership && classLimit !== null && (
                  <Tag tint="success">Activa</Tag>
                )}
              </div>
              {loadingMembership ? (
                <SkeletonRow height={120} />
              ) : membershipError ? (
                <>
                  <h3 className="font-display leading-tight text-ink text-[1.25rem]">
                    No pudimos cargar tu membresía
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-[1.6] text-ink-muted">
                    Revisa tu conexión y vuelve a intentarlo.
                  </p>
                  <div className="mt-5">
                    <GhostButton onClick={() => refetchMembership()}>Reintentar</GhostButton>
                  </div>
                </>
              ) : membership ? (
                <>
                  <h3 className="font-display leading-tight text-ink text-[length:clamp(1.45rem,2.2vw,1.8rem)]">
                    {planName}
                  </h3>
                  <div className="mt-4">
                    <AccountRow
                      label="Clases por usar"
                      value={classesRemaining ?? "·"}
                      valueClassName="font-display text-[2rem] text-accent leading-none"
                    />
                    <AccountRow label="Total del paquete" value={classLimit ?? "·"} />
                    {membershipEnd && (
                      <AccountRow
                        label="Vigente hasta"
                        value={format(safeParse(membershipEnd), "d MMM yyyy", { locale: es })}
                      />
                    )}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    {FEATURES.membershipDetail && (
                      <PrimaryButton size="sm" to="/app/profile/membership">Ver membresía</PrimaryButton>
                    )}
                    <GhostButton to="/app/checkout">Renovar</GhostButton>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-display leading-tight text-ink text-[length:clamp(1.45rem,2.2vw,1.8rem)]">
                    Sin paquete activo
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-[1.6] text-ink-muted">
                    Cuando actives un paquete, cada clase que tomas cuenta para tu constancia y reservas en un tap.
                  </p>
                  <div className="mt-5">
                    <PrimaryButton size="sm" to="/app/checkout">Ver paquetes</PrimaryButton>
                  </div>
                </>
              )}
            </div>

            {walletError ? (
              <div className="lg:col-span-5 rounded-[20px] border border-line bg-surface dark:bg-surface/70 p-5 sm:p-6 flex flex-col justify-between gap-5">
                <div>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-accent-strong">
                    Wallet
                  </span>
                  <p className="mt-2 text-[0.92rem] leading-[1.6] text-ink-muted">
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
                className="lg:col-span-5 rounded-[20px] border border-line bg-surface dark:bg-surface/70 p-5 sm:p-6 no-underline flex flex-col justify-between gap-5 text-ink"
              >
                <div>
                  <span className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-accent-strong">
                    Wallet
                  </span>
                  {loadingWallet ? (
                    <div className="mt-3">
                      <SkeletonRow height={44} />
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-[1fr_auto] items-baseline gap-4 py-2.5 border-t border-line">
                      <span className="text-[0.72rem] uppercase tracking-[0.18em] text-ink-muted">
                        Puntos
                      </span>
                      <span className="nums font-display text-2xl leading-none text-ink">
                        {walletPoints}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-[0.74rem] text-accent-strong">
                  <span className="uppercase tracking-[0.18em]">Ver recompensas</span>
                  <WalletIcon size={16} strokeWidth={1.8} />
                </div>
              </Link>
            )}
          </div>
        </Section>

        {/* ── Próximas clases (si hay más de la destacada) ── */}
        {!loadingBookings && !bookingsError && upcoming.length > 1 && (
          <Section title="También en tu agenda" trailing={<Link to="/app/bookings" className="no-underline text-accent-strong">Ver todas</Link>}>
            <ListGroup>
              {upcoming.slice(1).map((b) => (
                <ListRow
                  key={b.id}
                  to="/app/bookings"
                  icon={<CalendarDays size={17} strokeWidth={1.7} />}
                  iconTint="accent"
                  title={b.class_type_name ?? "Clase"}
                  description={
                    <>
                      {formatBookingTime(b.start_time)}
                      {b.instructor_name ? ` · ${b.instructor_name}` : ""}
                    </>
                  }
                  trailing={
                    b.status === "waitlist" ? (
                      <Tag tint="accent">En espera</Tag>
                    ) : (
                      <Tag tint="success">Confirmada</Tag>
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
              iconTint="accent"
              title="Mis reservas"
              description="Próximas y pasadas"
            />
            {FEATURES.walletExtras && (
              <ListRow
                to="/app/wallet/rewards"
                icon={<Award size={17} strokeWidth={1.7} />}
                iconTint="accent"
                title="Recompensas"
                description="Canjea tus puntos"
              />
            )}
            <ListRow
              to="/app/orders"
              icon={<ShoppingBag size={17} strokeWidth={1.7} />}
              iconTint="accent"
              title="Mis compras"
              description="Tus pagos y paquetes"
            />
          </ListGroup>
        </Section>

        <p className="mt-12 lg:mt-16 text-[0.74rem] text-ink-muted">
          Buena clase, {firstName}.
        </p>
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Dashboard;
