import { EmbeddedCardPayment } from "@/components/checkout/EmbeddedCardPayment";
import type { CardReadiness } from "@/lib/mercadopago";
import { planConditions } from "@/lib/planConditions";
import { ResponsivaDialog } from "@/components/app/ResponsivaDialog";
import { useAuthStore } from "@/stores/authStore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { ClientAuthGuard } from "@/components/layout/ClientAuthGuard";
import {
  AppShell,
  PageHeader,
  Section,
  Tag,
  PrimaryButton,
  GhostButton,
  SkeletonRow,
  ErrorState,
} from "@/components/app/AppShell";
import {
  Stepper,
  StickyCta,
  DataRow,
  InfoBanner,
  formatMoneyMX,
} from "@/components/app/widgets";
import { UploadDropzone } from "@/components/app/UploadDropzone";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  CheckCircle2,
  CreditCard,
  Banknote,
  Building2,
  Tag as TagIcon,
  ArrowLeft,
} from "lucide-react";

type Step = "card" | "external-card" | "select" | "method" | "bank" | "cash" | "upload" | "done" | "stripe-success" | "stripe-cancelled";
type PaymentMethod = "transfer" | "cash" | "card";

const flag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes", "si", "sí", "t"].includes(value.toLowerCase());
  return false;
};

// HIVE groups follow the offer sheet; modality codes remain internal booking rules.
const catalogGroup = (plan: any) => {
  const r = plan.rules ?? {};
  if (flag(plan.personalOnly ?? plan.personal_only)) return "Sesión personalizada";
  if (Number(r.commitment_months) >= 12) return "Plan anual / pago mensual";
  if (Number(r.daily_class_limit) > 0) return "Plan mensual";
  if (r.requires_student_id || flag(plan.afternoonOnly ?? plan.afternoon_only) || r.booking_start_time) return "Promociones";
  return "Sesiones de Pilates Reformer";
};
const GROUP_ORDER = ["Sesiones de Pilates Reformer", "Plan mensual", "Plan anual / pago mensual", "Promociones", "Sesión personalizada"];

/* ── PlanRow ─────────────────────────────────────────────── */
const PlanRow = ({
  plan,
  selected,
  recommended = false,
  onSelect,
}: {
  plan: any;
  selected: boolean;
  recommended?: boolean;
  onSelect: () => void;
}) => {
  const conditions = planConditions(plan);
  const durationDays = Number(plan.durationDays ?? plan.duration_days ?? 0);
  const classLimit = plan.classLimit ?? plan.class_limit ?? null;
  const isUnlimited = classLimit == null || Number(classLimit) >= 900;
  const nonTransferable = flag(plan.isNonTransferable ?? plan.is_non_transferable);
  const nonRepeatable = flag(plan.isNonRepeatable ?? plan.is_non_repeatable);
  // Precio efectivo (anticipado/apertura) — el mismo que muestra el index y
  // que cobra Stripe. Antes el checkout usaba plan.price (regular) → desfase.
  const regularPrice = Number(plan.price ?? 0);
  const effectivePrice = Number(plan.effectivePrice ?? plan.effective_price ?? regularPrice);
  const hasOpening =
    Boolean(plan.promotionActive ?? plan.promotion_active ?? plan.openingActive ?? plan.opening_active) && effectivePrice !== regularPrice;
  const perClass =
    !isUnlimited && effectivePrice > 0 && Number(classLimit) > 1
      ? Math.round(effectivePrice / Number(classLimit))
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full text-left bg-transparent border-0 cursor-pointer p-0"
    >
      <div
        className={
          "rounded-[20px] p-4 sm:p-5 grid grid-cols-[1fr_auto_auto] items-center gap-4 border transition-colors " +
          (selected ? "border-accent bg-accent-soft" : "border-line bg-surface dark:bg-surface/70")
        }
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {recommended && <Tag tint="accent">Recomendado</Tag>}
            <Tag tint="ink">Pilates Reformer</Tag>
            {isUnlimited ? (
              <span className="text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted">
                {plan.rules?.daily_class_limit ? `${plan.rules.daily_class_limit} ${plan.rules.daily_class_limit === 1 ? "sesión" : "sesiones"} por día` : "Ilimitado"}
              </span>
            ) : Number(classLimit) > 0 ? (
              <span className="nums text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted">
                {classLimit} {Number(classLimit) === 1 ? "clase" : "clases"}
              </span>
            ) : null}
          </div>
          <h3 className="font-display leading-tight text-ink" style={{ fontSize: "clamp(1.1rem, 1.6vw, 1.35rem)" }}>
            {plan.name}
          </h3>
          {plan.rules?.requires_student_id && !plan.rules?.booking_start_time && plan.rules?.allowed_weekdays?.length === 7 && <p className="mt-1 text-[0.8rem] text-ink-muted">Disponible en cualquier horario, todos los días</p>}
          {conditions.map(condition => <p key={condition} className="mt-1 text-[0.8rem] text-ink-muted">{condition}</p>)}
          {plan.description && <p className="mt-1 text-[0.8rem] text-ink-muted">{plan.description}</p>}
          {Array.isArray(plan.features) && plan.features.map((feature: string, index: number) => <p key={index} className="mt-1 text-[0.8rem] text-ink-muted">{feature}</p>)}
          {durationDays > 0 && (
            <p className="text-[0.75rem] mt-0.5 text-ink-muted">
              {plan.rules?.billing_period === "month" ? `Vigencia de cada periodo: ${durationDays} días naturales` : `${durationDays} días naturales desde la compra`}
              {nonTransferable && !plan.rules && " · No transferible"}
              {nonRepeatable && " · No repetible"}
            </p>
          )}
        </div>
        <div className="text-right">
          {hasOpening && (
            <div className={`nums text-[0.75rem] text-ink-muted ${effectivePrice < regularPrice ? "line-through" : ""}`}>
              Regular ${formatMoneyMX(regularPrice)}
            </div>
          )}
          <div className="font-display nums leading-none text-ink" style={{ fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)" }}>
            ${formatMoneyMX(effectivePrice)}
            {plan.rules?.billing_period === "month" && <span className="block text-xs font-normal mt-1">por mes</span>}
          </div>
          {hasOpening ? (
            <div className="text-[0.75rem] uppercase tracking-[0.18em] mt-1 text-accent-strong">
              {plan.promotionLabel ?? plan.promotion_label ?? "Promo apertura"}
            </div>
          ) : perClass ? (
            <div className="nums text-[0.75rem] mt-1 text-accent-strong">
              ${formatMoneyMX(perClass)} por clase
            </div>
          ) : (
            <div className="text-[0.75rem] uppercase tracking-[0.18em] mt-1 text-ink-muted">
              MXN
            </div>
          )}
        </div>
        <span
          className={
            "grid h-9 w-9 place-items-center rounded-full border transition-colors " +
            (selected ? "border-transparent bg-ink text-canvas" : "border-line text-ink-faint")
          }
        >
          <Check size={14} strokeWidth={selected ? 3 : 2} />
        </span>
      </div>
    </button>
  );
};

/* ── Checkout ─────────────────────────────────────────────── */
const Checkout = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [externalCheckoutUrl, setExternalCheckoutUrl] = useState<string | null>(null);
  const {data: cardReadiness, isLoading: loadingCardReadiness} = useQuery<CardReadiness>({queryKey:["card-readiness"], queryFn:async () => { const res = await api.get("/payments/card-readiness"); return res.data.data ?? res.data; }});
  const { user } = useAuthStore();
  const [waiverOpen, setWaiverOpen] = useState(false);

  const [step, setStep] = useState<Step>("select");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  const [searchParams] = useSearchParams();
  const checkoutReturn = searchParams.get("checkout"); // "success" | "cancelled" | null

  useEffect(() => {
    if (checkoutReturn === "success") {
      setStep("stripe-success");
      qc.invalidateQueries({ queryKey: ["my-orders"] });
    } else if (checkoutReturn === "cancelled") {
      setStep("stripe-cancelled");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutReturn]);

  const {
    data: plansData,
    isLoading: loadingPlans,
    isError: plansError,
    refetch: refetchPlans,
  } = useQuery({
    queryKey: ["plans", "active"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
  });
  const rawPlans: any[] = Array.isArray(plansData?.data) ? plansData.data : Array.isArray(plansData) ? plansData : [];
  const activePlans = rawPlans.filter((p) => (p.isActive ?? p.is_active) !== false);

  // Marca si un plan es pack de visitas (para llevar acompañantes).
  const isVisitPack = (p: any): boolean =>
    Boolean(p?.isVisitPack ?? p?.is_visit_pack);

  const planGroups = useMemo(() => GROUP_ORDER.map(title => ({
    title,
    plans: activePlans.filter(p => !isVisitPack(p) && catalogGroup(p) === title)
      .sort((a, b) => Number(a.sortOrder ?? a.sort_order ?? 0) - Number(b.sortOrder ?? b.sort_order ?? 0)),
  })).filter(group => group.plans.length), [plansData]);
  const visitPacks = activePlans.filter(isVisitPack);

  const validateCodeMutation = useMutation({
    mutationFn: () => api.post("/discount-codes/validate", { code: discountCode, planId: selectedPlan?.id }),
    onSuccess: (res) => setDiscountResult(res.data?.data ?? res.data),
    onError: () => toast({ title: "Código inválido", variant: "destructive" }),
  });

  const createOrderMutation = useMutation({
    mutationFn: () =>
      api.post("/orders", {
        planId: selectedPlan.id,
        discountCode: discountResult?.code,
        paymentMethod,
      }),
    onSuccess: (res) => {
      const data = res.data?.data ?? res.data;
      setOrderId(data.orderId ?? data.id);
      setOrderNumber(data.orderNumber ?? data.order_number ?? null);
      if (paymentMethod === "card" && (data.mp_checkout_mode === "embedded" || data.mpCheckoutMode === "embedded")) {
        setStep("card");
        return;
      }
      if (paymentMethod === "card" && data.checkout_url) {
        setExternalCheckoutUrl(data.checkout_url);
        setStep("external-card");
        return;
      }
      if (paymentMethod === "card") {
        navigate(`/app/orders/${data.orderId ?? data.id}`);
        return;
      }
      setBankDetails(data.bankDetails ?? data.bank_details);
      setStep(paymentMethod === "transfer" ? "bank" : "cash");
    },
    onError: (err: any) => {
      if (err?.response?.data?.code === "WAIVER_REQUIRED") { setWaiverOpen(true); return; }
      toast({
        title: "No se pudo crear la orden",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  const uploadProofMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("file", file!);
      return api.post(`/orders/${orderId}/proof`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-orders"] });
      setStep("done");
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo enviar el comprobante",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
  });

  const selectedEffective = Number(
    selectedPlan?.effectivePrice ?? selectedPlan?.effective_price ?? selectedPlan?.price ?? 0
  );
  const finalAmount = discountResult
    ? selectedEffective - (discountResult.discount_amount ?? 0)
    : selectedEffective;

  const STEPS: { id: Step; label: string }[] = [
    { id: "select", label: "Plan" },
    { id: "method", label: "Pago" },
    { id: "upload", label: "Comprobante" },
    { id: "done", label: "Listo" },
  ];

  const stepperCurrent: Step =
    step === "bank" || step === "cash" || step === "card" || step === "external-card" ? "method" : step;
  const recurringPlan = Boolean(selectedPlan?.rules?.auto_renew);
  const resolvedPaymentUrl = selectedPlan && Object.hasOwn(selectedPlan, "paymentUrl") ? selectedPlan.paymentUrl
    : selectedPlan && Object.hasOwn(selectedPlan, "payment_url") ? selectedPlan.payment_url
    : (selectedPlan?.rules?.promotion_mode ?? "studio") === "studio"
      ? (selectedPlan?.openingActive ?? selectedPlan?.opening_active) ? selectedPlan?.rules?.opening_payment_url : selectedPlan?.rules?.payment_url
      : selectedEffective === Number(selectedPlan?.price) ? selectedPlan?.rules?.payment_url : selectedPlan?.rules?.promotion_payment_url;
  const annualExternal = Boolean(recurringPlan && resolvedPaymentUrl && finalAmount === selectedEffective);
  const cardAvailable = finalAmount > 0 && (recurringPlan ? annualExternal : cardReadiness?.ready === true);

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <ResponsivaDialog open={waiverOpen} onClose={() => setWaiverOpen(false)} onSigned={() => { setWaiverOpen(false); createOrderMutation.mutate(); }} defaultName={user?.displayName ?? user?.display_name ?? user?.full_name ?? ""} defaultEmail={user?.email ?? ""} defaultPhone={(user as any)?.phone ?? ""} />
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Membresía"
          title={<>Compra tu</>}
          titleAccent="paquete."
          subtitle="Elige tu plan y cómo pagar. Con tarjeta completas el pago aquí; para transferencia, adjunta tu comprobante."
        />

        <Section>
          <Stepper steps={STEPS} current={stepperCurrent} />
        </Section>

        {/* ── Step 1: error de planes ── */}
        {step === "select" && plansError && (
          <Section>
            <ErrorState
              title="No pudimos cargar los paquetes"
              description="Revisa tu conexión y vuelve a intentarlo. Si sigue fallando, escríbenos por WhatsApp."
              onRetry={() => refetchPlans()}
            />
          </Section>
        )}

        {/* ── Step 1: Select plan ── */}
        {step === "select" && !plansError && (
          <>
            <Section title="Elige tu paquete">
              {loadingPlans ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <SkeletonRow key={i} height={88} />)}
                </div>
              ) : planGroups.length === 0 ? (
                <p className="text-[0.86rem] text-ink-muted">
                  Aún no hay paquetes activos. Si esto persiste, escríbenos por WhatsApp.
                </p>
              ) : (
                <>
                  <p className="mb-5 text-sm text-ink-muted">Precios en MXN. Los paquetes son personales e intransferibles. La vigencia comienza al comprar; el paquete de 20 sesiones dura 60 días y los demás, 30 días.</p>
                  {planGroups.map(group => <section key={group.title} aria-label={group.title} className="mb-7 space-y-3">
                    <h2 className="font-display text-xl text-ink">{group.title}</h2>
                    {group.plans.map((plan: any) => <PlanRow key={plan.id} plan={plan} selected={selectedPlan?.id === plan.id} onSelect={() => { setSelectedPlan(plan); setDiscountResult(null); }} />)}
                  </section>)}
                </>
              )}
            </Section>

            {visitPacks.length > 0 && (
              <Section title="Paquetes de visita">
                <p className="text-[0.78rem] mb-3 text-ink-muted">
                  Para traer acompañantes a clase. Cada pase descuenta 1 clase del paquete y se asigna desde tu app al reservar.
                </p>
                <div className="space-y-3">
                  {visitPacks.map((plan: any) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      selected={selectedPlan?.id === plan.id}
                      onSelect={() => { setSelectedPlan(plan); setDiscountResult(null); }}
                    />
                  ))}
                </div>
              </Section>
            )}

            {selectedPlan && (
              <Section title="Resumen">
                <div className="rounded-3xl p-5 sm:p-6 space-y-4 border border-line bg-sunken">
                  <div>
                    <DataRow label="Paquete" value={selectedPlan.name} />
                    <DataRow label="Precio" value={`$${formatMoneyMX(selectedEffective)} MXN`} />
                    {discountResult && (
                      <DataRow
                        label="Descuento"
                        value={`−$${formatMoneyMX(discountResult.discount_amount)} MXN`}
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-canvas text-accent-strong">
                      <TagIcon size={14} />
                    </span>
                    <span className="text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted">
                      Código de descuento
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="CODIGO"
                      className="uppercase"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                    />
                    <GhostButton
                      onClick={() => validateCodeMutation.mutate()}
                      disabled={!discountCode || validateCodeMutation.isPending}
                      className="shrink-0 disabled:opacity-50"
                    >
                      Aplicar
                    </GhostButton>
                  </div>
                  {discountResult && (
                    <p className="flex items-center gap-2 text-[0.84rem] text-success">
                      <CheckCircle2 size={14} />
                      Descuento ${formatMoneyMX(discountResult.discount_amount)} MXN aplicado
                    </p>
                  )}

                  <div className="flex items-baseline justify-between pt-3 border-t border-line">
                    <span className="text-[0.78rem] uppercase tracking-[0.18em] text-ink-muted">
                      Total
                    </span>
                    <span className="font-display nums text-ink" style={{ fontSize: "clamp(2rem, 3vw, 2.6rem)" }}>
                      ${formatMoneyMX(finalAmount)} <span className="text-[0.78rem] uppercase tracking-[0.18em] text-ink-muted">MXN</span>
                    </span>
                  </div>
                </div>
              </Section>
            )}
            {selectedPlan && <div className="h-24" aria-hidden="true" />}
          </>
        )}

        {/* Barra fija: al elegir paquete, pagar de una vez sin bajar a confirmar. */}
        {step === "select" && selectedPlan && (
          <div
            className="fixed inset-x-0 bottom-20 lg:bottom-6 z-40 px-5 sm:px-7 lg:px-12"
            style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mx-auto flex max-w-[680px] items-center gap-3 rounded-2xl border border-line bg-canvas p-3 pl-5 shadow-float">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.75rem] uppercase tracking-[0.18em] text-ink-muted">
                  {selectedPlan.name}
                </p>
                <p className="nums font-display leading-none text-ink" style={{ fontSize: "1.35rem" }}>
                  ${formatMoneyMX(finalAmount)} <span className="text-[0.75rem] uppercase tracking-[0.16em] text-ink-muted">MXN</span>
                </p>
              </div>
              <PrimaryButton onClick={() => setStep("method")} className="shrink-0">
                Continuar a pago
              </PrimaryButton>
            </div>
          </div>
        )}

        {step === "card" && orderId && <EmbeddedCardPayment key={orderId} orderId={orderId} onClose={() => navigate(`/app/orders/${orderId}`)} />}
        {step === "external-card" && orderId && externalCheckoutUrl && <Section title="Plan anual">
          <p className="mb-4 text-sm text-ink-muted">La contratación de este plan anual se completa en Mercado Pago. Revisa ahí las condiciones de renovación y autoriza el pago. Tu orden se activará cuando el estudio confirme el cobro.</p>
          <a href={externalCheckoutUrl} className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-bold text-accent-foreground">Continuar con plan anual en Mercado Pago</a>
          <GhostButton onClick={() => navigate(`/app/orders/${orderId}`)}>Ver mi orden</GhostButton>
        </Section>}

        {/* ── Step 2: Payment method ── */}
        {step === "method" && (
          <>
            <button
              type="button"
              onClick={() => setStep("select")}
              className="inline-flex min-h-[44px] items-center gap-2 text-[0.75rem] uppercase tracking-[0.2em] mb-5 bg-transparent border-0 cursor-pointer text-ink-muted"
            >
              <ArrowLeft size={13} /> Cambiar plan
            </button>

            <Section>
              <div className="rounded-2xl p-4 flex items-center justify-between gap-3 border border-line bg-sunken">
                <span className="text-[0.92rem] text-ink">{selectedPlan?.name}</span>
                <span className="font-display nums text-accent-strong" style={{ fontSize: "1.3rem" }}>
                  ${formatMoneyMX(finalAmount)} MXN
                </span>
              </div>
            </Section>

            <Section title="Condiciones del plan">
              <ul className="space-y-1 text-sm text-ink-muted">{planConditions(selectedPlan).map(condition => <li key={condition}>{condition}</li>)}</ul>
              <p className="mt-2 text-sm text-ink-muted">Vigencia de {selectedPlan?.durationDays ?? selectedPlan?.duration_days} días naturales desde la compra.</p>
            </Section>

            <Section title="¿Cómo quieres pagar?">
              <div role="radiogroup" aria-label="Método de pago" className="space-y-2">
                {[
                  { id: "card" as const, label: "Tarjeta", sub: finalAmount <= 0 ? "El estudio debe confirmar la activación de los planes sin costo" : annualExternal ? "Contratación anual en Mercado Pago" : cardAvailable ? "Paga aquí con Mercado Pago, sin salir de la app" : recurringPlan ? "Este precio requiere un enlace de suscripción actualizado; elige otro método o contacta al estudio" : loadingCardReadiness ? "Consultando disponibilidad…" : cardReadiness?.message || "Pago con tarjeta aún no disponible; elige otro método", icon: CreditCard },
                  { id: "transfer" as const, label: "Transferencia", sub: "Subes tu comprobante", icon: Building2 },
                  { id: "cash" as const, label: "Efectivo", sub: "Pagas en recepción del estudio", icon: Banknote },
                ].map((opt) => {
                  const Icon = opt.icon;
                  const sel = paymentMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="radio"
                      aria-checked={sel}
                      disabled={opt.id === "card" && !cardAvailable}
                      onClick={() => setPaymentMethod(opt.id)}
                      className={
                        "w-full grid grid-cols-[auto_1fr_auto] items-center gap-4 rounded-2xl border p-4 text-left cursor-pointer transition-colors " +
                        (sel ? "border-accent bg-accent-soft" : "border-line bg-surface dark:bg-surface/70 hover:bg-sunken")
                      }
                    >
                      <span
                        className={
                          "grid h-11 w-11 place-items-center rounded-2xl shrink-0 transition-colors " +
                          (sel ? "bg-ink text-canvas" : "bg-sunken text-accent-strong")
                        }
                      >
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.94rem] font-medium leading-tight text-ink">
                          {opt.label}
                        </span>
                        <span className="block text-[0.78rem] mt-0.5 text-ink-muted">
                          {opt.sub}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={
                          "grid h-5 w-5 place-items-center rounded-full shrink-0 border-[1.5px] transition-colors " +
                          (sel ? "border-accent-strong" : "border-line-strong")
                        }
                      >
                        {sel && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <p className="text-sm text-ink-muted">Tienes 1 hora para completar el pago. Después, la orden sin pagar vence automáticamente.</p>
            <StickyCta>
              <PrimaryButton
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending || (paymentMethod === "card" && !cardAvailable)}
                loading={createOrderMutation.isPending}
                loadingLabel="Procesando…"
                className="w-full"
              >
                <CreditCard size={14} />
                {paymentMethod === "card" ? "Pagar con Mercado Pago" : "Confirmar"}
              </PrimaryButton>
            </StickyCta>
          </>
        )}

        {/* ── Step 3a: Bank details ── */}
        {step === "bank" && bankDetails && (
          <>
            <Section title="Datos para transferencia">
              <p className="mb-4 text-[0.92rem] leading-[1.6] text-ink-muted">
                Realiza la transferencia con los datos abajo. Después sube el comprobante para que activemos tu paquete.
              </p>
              <div className="rounded-3xl p-5 sm:p-7 border border-line bg-canvas">
                {[
                  { label: "CLABE", value: bankDetails.clabe, mono: true },
                  { label: "Cuenta", value: bankDetails.account_number ?? bankDetails.accountNumber, mono: true },
                  { label: "Banco", value: bankDetails.bank },
                  { label: "Titular", value: bankDetails.account_holder ?? bankDetails.accountHolder },
                  { label: "Monto", value: `$${formatMoneyMX(bankDetails.amount)} MXN`, mono: true, copyable: String(bankDetails.amount ?? "") },
                ].filter((r) => r.value).map((row) => (
                  <DataRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    mono={row.mono}
                    copyable={row.copyable ?? (typeof row.value === "string" ? row.value : undefined)}
                  />
                ))}
              </div>
            </Section>
            <StickyCta>
              <PrimaryButton onClick={() => setStep("upload")} className="w-full">
                Ya transferí
              </PrimaryButton>
            </StickyCta>
          </>
        )}

        {/* ── Step 3b: Cash ── */}
        {step === "cash" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center border border-line bg-sunken">
              <span className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4 bg-ink text-canvas">
                <Banknote size={22} />
              </span>
              <h3 className="font-display leading-tight text-ink" style={{ fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                Págalo en el estudio
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto text-ink-muted">
                Acércate a recepción con tu número de orden. Activamos tu paquete cuando confirmemos el pago.
              </p>
              {(orderNumber || orderId) && (
                <div className="inline-flex flex-col gap-1 px-5 py-3 rounded-2xl mt-5 border border-line bg-canvas">
                  <span className="text-[0.75rem] uppercase tracking-[0.24em] text-ink-muted">
                    Número de orden
                  </span>
                  <span className="nums font-mono text-[1.1rem] tracking-widest font-medium text-accent-strong">
                    {orderNumber ?? orderId}
                  </span>
                </div>
              )}
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {/* ── Step 4: Upload proof ── */}
        {step === "upload" && (
          <>
            <Section title="Subir comprobante">
              <UploadDropzone file={file} onFileChange={setFile} />
            </Section>
            <StickyCta>
              <div className="flex gap-3">
                <PrimaryButton
                  onClick={() => uploadProofMutation.mutate()}
                  disabled={!file || uploadProofMutation.isPending}
                  loading={uploadProofMutation.isPending}
                  loadingLabel="Enviando…"
                  className="flex-1"
                >
                  Enviar comprobante
                </PrimaryButton>
                {file && <GhostButton onClick={() => setFile(null)}>Cambiar</GhostButton>}
              </div>
            </StickyCta>
          </>
        )}

        {/* ── Step 5: Done ── */}
        {step === "done" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center border border-line bg-sunken">
              <span className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4 bg-success text-canvas">
                <CheckCircle2 size={22} />
              </span>
              <h3 className="font-display leading-tight text-ink" style={{ fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Comprobante recibido
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto text-ink-muted">
                Estamos verificando tu pago. Te avisamos en cuanto tu paquete esté activo.
              </p>
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {/* ── Stripe return: success ── */}
        {step === "stripe-success" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center border border-line bg-sunken">
              <span className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4 bg-success text-canvas">
                <CheckCircle2 size={22} />
              </span>
              <h3 className="font-display leading-tight text-ink" style={{ fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Pago recibido
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto text-ink-muted">
                Tu pago fue procesado. Activamos tu paquete en segundos — revisa tus órdenes para confirmar.
              </p>
            </div>
            <StickyCta>
              <PrimaryButton to="/app/orders" className="w-full">
                Ver mis órdenes
              </PrimaryButton>
            </StickyCta>
          </Section>
        )}

        {/* ── Stripe return: cancelled ── */}
        {step === "stripe-cancelled" && (
          <Section>
            <div className="rounded-3xl p-7 sm:p-10 text-center border border-line bg-sunken">
              <span className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4 bg-line text-canvas">
                <ArrowLeft size={22} />
              </span>
              <h3 className="font-display leading-tight text-ink" style={{ fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Pago cancelado
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto text-ink-muted">
                Cancelaste el pago. Tu orden quedó pendiente — puedes intentarlo de nuevo cuando quieras.
              </p>
            </div>
            <StickyCta>
              <div className="flex gap-3">
                <PrimaryButton onClick={() => setStep("select")} className="flex-1">
                  Intentar de nuevo
                </PrimaryButton>
                <PrimaryButton to="/app/orders" className="flex-1">
                  Ver órdenes
                </PrimaryButton>
              </div>
            </StickyCta>
          </Section>
        )}

        {step === "select" && !plansError && !selectedPlan && (
          <Section>
            <InfoBanner
              tone="muted"
              title="Selecciona un paquete para continuar."
              description="Elige una clase o paquete para comenzar. Consulta sus condiciones antes de pagar."
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Checkout;
