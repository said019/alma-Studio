import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  ListGroup,
  Tag,
  EmptyState,
  ErrorState,
  PrimaryButton,
  SkeletonRow,
} from "@/components/app/AppShell";
import { BackLink } from "@/components/app/widgets";
import { useToast } from "@/hooks/use-toast";
import { Gift, Trophy, Check } from "lucide-react";

type Milestone = {
  id: string;
  name: string;
  description: string | null;
  classes_required: number;
  period: "lifetime" | "month" | "year";
  award_type: "points" | "reward";
  award_points: number;
  achieved: boolean;
  awarded_at: string | null;
};

type MilestonesMe = {
  lifetime_classes: number;
  next_milestone: Milestone | null;
  next_progress: number | null;
  next_remaining: number | null;
  milestones: Milestone[];
};

const WalletRewards = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const {
    data: rewardsData,
    isLoading,
    isError: rewardsError,
    refetch: refetchRewards,
  } = useQuery({
    queryKey: ["loyalty-rewards"],
    queryFn: async () => (await api.get("/loyalty/rewards")).data,
  });

  const {
    data: walletData,
    isError: walletError,
    refetch: refetchWallet,
  } = useQuery({
    queryKey: ["wallet-pass"],
    queryFn: async () => (await api.get("/wallet/pass")).data,
  });

  const {
    data: milestonesData,
    isError: milestonesError,
    refetch: refetchMilestones,
  } = useQuery<{ data: MilestonesMe }>({
    queryKey: ["my-milestones"],
    queryFn: async () => (await api.get("/loyalty/milestones/me")).data,
  });
  const ms = milestonesData?.data;

  const hasError = rewardsError || walletError || milestonesError;
  const retryAll = () => {
    if (rewardsError) refetchRewards();
    if (walletError) refetchWallet();
    if (milestonesError) refetchMilestones();
  };

  const rewards: any[] = Array.isArray(rewardsData?.data) ? rewardsData.data : Array.isArray(rewardsData) ? rewardsData : [];
  const myPoints: number = walletData?.data?.points ?? walletData?.points ?? 0;

  const redeemMutation = useMutation({
    mutationFn: (rewardId: string) => api.post("/loyalty/redeem", { rewardId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallet-pass"] });
      qc.invalidateQueries({ queryKey: ["loyalty-history"] });
      toast({ title: "Recompensa canjeada." });
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo canjear",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
    onSettled: () => setPendingId(null),
  });

  const handleRedeem = (rewardId: string) => {
    setPendingId(rewardId);
    redeemMutation.mutate(rewardId);
  };

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <BackLink to="/app/wallet" label="Volver a Wallet" />
        <PageHeader
          eyebrow="Canjear puntos"
          title={<>Tus recompensas</>}
          titleAccent="del estudio."
          actions={
            <Tag tint="accent">
              <span className="nums">{myPoints.toLocaleString("es-MX")}</span> pts
            </Tag>
          }
        />

        {hasError ? (
          <Section>
            <ErrorState
              title="Tus recompensas no cargaron"
              description="No pudimos traer tus puntos y recompensas. Revisa tu conexión y vuelve a intentarlo."
              onRetry={retryAll}
            />
          </Section>
        ) : (
          <>
            {/* ── Próximo logro: la única barra de progreso de la pantalla ── */}
            {ms?.next_milestone && (
              <Section title="Tu próximo logro">
                <div className="rounded-3xl border border-line bg-canvas p-5 sm:p-6">
                  <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sunken text-accent-strong">
                      <Trophy size={20} strokeWidth={1.7} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-[1.25rem] leading-tight text-ink">
                          {ms.next_milestone.name}
                        </h3>
                        <span className="nums text-[0.72rem] uppercase tracking-[0.18em] text-accent-strong">
                          +{ms.next_milestone.award_points} pts
                        </span>
                      </div>
                      {ms.next_milestone.description && (
                        <p className="mt-1 text-[0.84rem] leading-[1.55] text-ink-muted">
                          {ms.next_milestone.description}
                        </p>
                      )}
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-[0.74rem]">
                          <span className="nums text-ink-muted">
                            <strong className="text-accent-strong">{ms.lifetime_classes}</strong> de {ms.next_milestone.classes_required} clases
                          </span>
                          <span className="nums font-medium text-accent-strong">
                            Te faltan {ms.next_remaining ?? 0}
                          </span>
                        </div>
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={ms.next_milestone.classes_required}
                          aria-valuenow={ms.lifetime_classes}
                        >
                          <div
                            className="h-full rounded-full bg-ink transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
                            style={{
                              width: `${Math.min(100, Math.round((ms.lifetime_classes / Math.max(1, ms.next_milestone.classes_required)) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Logros conseguidos */}
                  {ms.milestones.some((m) => m.achieved) && (
                    <div className="mt-5 border-t border-line pt-5">
                      <p className="mb-3 text-[0.72rem] uppercase tracking-[0.22em] text-ink-muted">
                        Tus logros desbloqueados
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {ms.milestones.filter((m) => m.achieved).map((m) => (
                          <span
                            key={m.id}
                            className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-3 py-1.5 text-[0.74rem] text-accent-strong"
                          >
                            <Check size={12} />
                            {m.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {ms && !ms.next_milestone && ms.milestones.length > 0 && ms.milestones.every((m) => m.achieved) && (
              <Section title="Logros completos">
                <div className="rounded-3xl bg-sunken p-6 text-center">
                  <Trophy size={28} strokeWidth={1.7} className="mx-auto text-accent-strong" />
                  <p className="font-display mt-3 text-[1.25rem] text-ink">
                    Has desbloqueado todos los logros.
                  </p>
                  <p className="mt-1 text-[0.84rem] text-ink-muted">
                    Gracias por tu constancia. Nos encanta verte en cada clase.
                  </p>
                </div>
              </Section>
            )}

            {/* ── Recompensas: lista editorial con hairlines ── */}
            <Section title="Recompensas">
              {isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <SkeletonRow key={i} height={76} />)}
                </div>
              ) : rewards.length === 0 ? (
                <EmptyState
                  icon={<Gift size={20} />}
                  title="Sin recompensas disponibles."
                  description="Cuando el estudio active recompensas nuevas, aparecen aquí."
                />
              ) : (
                <ListGroup>
                  {rewards.map((r) => {
                    const cost = Number(r.points_cost ?? 0);
                    const stockLeft = r.stock != null ? Number(r.stock) : null;
                    const outOfStock = stockLeft != null && stockLeft <= 0;
                    const canRedeem = myPoints >= cost && !outOfStock;
                    const missing = Math.max(0, cost - myPoints);
                    const isRedeeming = redeemMutation.isPending && pendingId === r.id;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-4 border-t border-line px-1 py-4"
                      >
                        <div className="min-w-0">
                          <h3 className="font-display text-[1.1rem] leading-tight text-ink">
                            {r.name}
                          </h3>
                          {r.description && (
                            <p className="mt-1 text-[0.82rem] leading-[1.5] text-ink-muted">
                              {r.description}
                            </p>
                          )}
                          <p className="mt-1.5 text-[0.78rem] text-ink">
                            <span className="nums font-medium text-accent-strong">
                              {cost.toLocaleString("es-MX")} pts
                            </span>
                            {stockLeft != null && (
                              <span className="text-ink-muted">
                                {" "}· <span className="nums">{stockLeft}</span> disponibles
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          {canRedeem ? (
                            <PrimaryButton
                              size="sm"
                              onClick={() => handleRedeem(r.id)}
                              disabled={redeemMutation.isPending}
                              loading={isRedeeming}
                              loadingLabel="Canjeando…"
                            >
                              Canjear
                            </PrimaryButton>
                          ) : (
                            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-ink-muted">
                              {outOfStock ? (
                                "Agotada"
                              ) : (
                                <>Te faltan <span className="nums">{missing.toLocaleString("es-MX")}</span> pts</>
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </ListGroup>
              )}
            </Section>
          </>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default WalletRewards;
