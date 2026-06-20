import { useMemo, useState } from "react";
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
  ALMA,
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

type Step = "select" | "method" | "bank" | "cash" | "upload" | "done";
type PaymentMethod = "transfer" | "cash" | "card";

const flag = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["true", "1", "yes", "si", "sí", "t"].includes(value.toLowerCase());
  return false;
};

const detectCategory = (plan: any): "studio" | "reformer_tower" | "mixto" | "all" => {
  const raw = String(plan.classCategory ?? plan.class_category ?? "").toLowerCase();
  if (["studio", "reformer_tower", "mixto", "all"].includes(raw)) return raw as any;
  const byName = String(plan.name ?? "").toLowerCase();
  if (byName.includes("reformer") || byName.includes("tower")) return "reformer_tower";
  if (byName.includes("studio") || byName.includes("mat") || byName.includes("barre") || byName.includes("sculpt")) return "studio";
  if (byName.includes("mixto")) return "mixto";
  return "all";
};

const CATEGORY_LABEL: Record<string, string> = {
  studio: "Studio",
  reformer_tower: "Reformer/Tower",
  mixto: "Mixto",
  all: "Todas las disciplinas",
};

/* Mejor precio por clase dentro de una sección (sin datos de popularidad,
   el dato disponible es precio/clase). Solo aplica con 2+ planes. */
const bestPerClassId = (plans: any[]): string | number | null => {
  if (plans.length < 2) return null;
  let bestId: string | number | null = null;
  let bestPpc = Infinity;
  for (const p of plans) {
    const limit = Number(p.classLimit ?? p.class_limit ?? 0);
    const price = Number(p.price ?? 0);
    if (limit <= 0 || limit >= 900 || price <= 0) continue;
    const ppc = price / limit;
    if (ppc < bestPpc) {
      bestPpc = ppc;
      bestId = p.id;
    }
  }
  return bestId;
};

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
  const category = detectCategory(plan);
  const durationDays = Number(plan.durationDays ?? plan.duration_days ?? 0);
  const classLimit = plan.classLimit ?? plan.class_limit ?? null;
  const isUnlimited = Number(classLimit) >= 900;
  const nonTransferable = flag(plan.isNonTransferable ?? plan.is_non_transferable);
  const nonRepeatable = flag(plan.isNonRepeatable ?? plan.is_non_repeatable);
  const perClass =
    !isUnlimited && Number(plan.price) > 0 && Number(classLimit) > 1
      ? Math.round(Number(plan.price) / Number(classLimit))
      : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full text-left bg-transparent border-0 cursor-pointer p-0"
    >
      <div
        className="rounded-2xl p-4 sm:p-5 grid grid-cols-[1fr_auto_auto] items-center gap-4 transition-colors"
        style={{
          backgroundColor: selected || recommended ? ALMA.blush : ALMA.cream,
          border: `1px solid ${selected ? ALMA.berry : recommended ? ALMA.sandstone : ALMA.border}`,
          boxShadow: selected ? `0 0 0 2px ${ALMA.berry}1a` : "none",
        }}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {recommended && <Tag tint="berry">Recomendado</Tag>}
            <Tag tint="ink">{CATEGORY_LABEL[category]}</Tag>
            {isUnlimited ? (
              <span className="text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                Ilimitado
              </span>
            ) : Number(classLimit) > 0 ? (
              <span className="nums text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                {classLimit} {Number(classLimit) === 1 ? "clase" : "clases"}
              </span>
            ) : null}
          </div>
          <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.1rem, 1.6vw, 1.35rem)" }}>
            {plan.name}
          </h3>
          {durationDays > 0 && (
            <p className="text-[0.74rem] mt-0.5" style={{ color: ALMA.ink, opacity: 0.55 }}>
              {durationDays} días de vigencia
              {nonTransferable && " · No transferible"}
              {nonRepeatable && " · No repetible"}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="font-display nums leading-none" style={{ color: ALMA.berry, fontSize: "clamp(1.4rem, 2.2vw, 1.8rem)" }}>
            ${formatMoneyMX(plan.price ?? 0)}
          </div>
          {perClass ? (
            <div className="nums text-[0.72rem] mt-1" style={{ color: ALMA.berry }}>
              ${formatMoneyMX(perClass)} por clase
            </div>
          ) : (
            <div className="text-[0.72rem] uppercase tracking-[0.18em] mt-1" style={{ color: ALMA.ink, opacity: 0.45 }}>
              MXN
            </div>
          )}
        </div>
        <span
          className="grid h-9 w-9 place-items-center rounded-full transition-colors"
          style={{
            backgroundColor: selected ? ALMA.berry : "transparent",
            color: selected ? ALMA.cream : ALMA.ink,
            border: selected ? "0" : `1px solid ${ALMA.border}`,
            opacity: selected ? 1 : 0.5,
          }}
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

  const [step, setStep] = useState<Step>("select");
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [discountCode, setDiscountCode] = useState("");
  const [discountResult, setDiscountResult] = useState<any>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

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

  // Para Alma (estudio de Pilates): no se usan tabs por categoría.
  // Sólo se separan las clases sueltas (1 clase) de los paquetes mensuales (>1 clase).
  // Los packs de visitas se muestran aparte para que la socia entienda que son
  // para llevar acompañantes, no para asistir ella misma.
  const allMonthlyPackages = useMemo(() => {
    return activePlans
      .filter((p) => Number(p.classLimit ?? p.class_limit ?? 0) > 1)
      .filter((p) => !isVisitPack(p))
      .filter((p) => !String(p.name ?? "").toLowerCase().includes("muestra"))
      .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansData]);

  const visitPacks = useMemo(() => {
    return activePlans
      .filter(isVisitPack)
      .filter((p) => !String(p.name ?? "").toLowerCase().includes("muestra"))
      .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansData]);

  const singleClassPlan = useMemo(() => {
    return activePlans.find((p) => {
      const limit = Number(p.classLimit ?? p.class_limit ?? 0);
      const name = String(p.name ?? "").toLowerCase();
      return limit === 1 && !name.includes("muestra") && !isVisitPack(p);
    }) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plansData]);

  const recommendedMonthlyId = useMemo(() => bestPerClassId(allMonthlyPackages), [allMonthlyPackages]);
  const recommendedVisitId = useMemo(() => bestPerClassId(visitPacks), [visitPacks]);

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
      // Card: redirect browser to Stripe Hosted Checkout
      if (paymentMethod === "card" && data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setBankDetails(data.bankDetails ?? data.bank_details);
      setStep(paymentMethod === "transfer" ? "bank" : "cash");
    },
    onError: (err: any) =>
      toast({
        title: "No se pudo crear la orden",
        description: err.response?.data?.message ?? "Inténtalo de nuevo.",
        variant: "destructive",
      }),
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

  const finalAmount = discountResult
    ? (selectedPlan?.price ?? 0) - (discountResult.discount_amount ?? 0)
    : selectedPlan?.price ?? 0;

  const STEPS: { id: Step; label: string }[] = [
    { id: "select", label: "Plan" },
    { id: "method", label: "Pago" },
    { id: "upload", label: "Comprobante" },
    { id: "done", label: "Listo" },
  ];

  const stepperCurrent: Step =
    step === "bank" || step === "cash" ? "method" : step;

  return (
    <ClientAuthGuard requiredRoles={["client"]}>
      <AppShell hideGreeting>
        <PageHeader
          eyebrow="Membresía"
          title={<>Compra tu</>}
          titleAccent="paquete."
          subtitle="Cuatro pasos: elige plan, elige cómo pagar, sube el comprobante y listo."
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
            <Section title="Clase suelta">
              {loadingPlans ? (
                <SkeletonRow height={88} />
              ) : singleClassPlan ? (
                <PlanRow
                  plan={singleClassPlan}
                  selected={selectedPlan?.id === singleClassPlan.id}
                  onSelect={() => { setSelectedPlan(singleClassPlan); setDiscountResult(null); }}
                />
              ) : (
                <p className="text-[0.86rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                  No hay clase suelta disponible.
                </p>
              )}
            </Section>

            {visitPacks.length > 0 && (
              <Section title="Paquetes de visita">
                <p className="text-[0.78rem] mb-3" style={{ color: ALMA.ink, opacity: 0.6 }}>
                  Para traer acompañantes a clase. Cada pase descuenta 1 clase del paquete y se asigna desde tu app al reservar.
                </p>
                <div className="space-y-3">
                  {visitPacks.map((plan: any) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      selected={selectedPlan?.id === plan.id}
                      recommended={recommendedVisitId === plan.id}
                      onSelect={() => { setSelectedPlan(plan); setDiscountResult(null); }}
                    />
                  ))}
                </div>
              </Section>
            )}

            <Section title="Paquetes mensuales">
              {loadingPlans ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <SkeletonRow key={i} height={88} />)}
                </div>
              ) : allMonthlyPackages.length === 0 ? (
                <p className="text-[0.86rem]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                  Aún no hay paquetes activos. Si esto persiste, escríbenos por WhatsApp.
                </p>
              ) : (
                <div className="space-y-3">
                  {allMonthlyPackages.map((plan: any) => (
                    <PlanRow
                      key={plan.id}
                      plan={plan}
                      selected={selectedPlan?.id === plan.id}
                      recommended={recommendedMonthlyId === plan.id}
                      onSelect={() => { setSelectedPlan(plan); setDiscountResult(null); }}
                    />
                  ))}
                </div>
              )}
            </Section>

            {selectedPlan && (
              <Section title="Resumen">
                <div className="rounded-3xl p-5 sm:p-6 space-y-4" style={{ backgroundColor: ALMA.blush }}>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full" style={{ backgroundColor: ALMA.cream, color: ALMA.berry }}>
                      <TagIcon size={14} />
                    </span>
                    <span className="text-[0.72rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                      Código de descuento
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="CODIGO"
                      className="uppercase"
                      value={discountCode}
                      onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                      style={{ backgroundColor: ALMA.cream, borderColor: ALMA.border }}
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
                    <p className="flex items-center gap-2 text-[0.84rem]" style={{ color: ALMA.olive }}>
                      <CheckCircle2 size={14} />
                      Descuento ${formatMoneyMX(discountResult.discount_amount)} MXN aplicado
                    </p>
                  )}

                  <div className="flex items-baseline justify-between pt-3" style={{ borderTop: `1px solid ${ALMA.border}` }}>
                    <span className="text-[0.78rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.6 }}>
                      Total
                    </span>
                    <span className="font-display nums" style={{ color: ALMA.ink, fontSize: "clamp(2rem, 3vw, 2.6rem)" }}>
                      ${formatMoneyMX(finalAmount)} <span className="text-[0.78rem] uppercase tracking-[0.18em]" style={{ color: ALMA.ink, opacity: 0.55 }}>MXN</span>
                    </span>
                  </div>
                </div>

                <StickyCta>
                  <PrimaryButton onClick={() => setStep("method")} className="w-full">
                    Continuar a pago
                  </PrimaryButton>
                </StickyCta>
              </Section>
            )}
          </>
        )}

        {/* ── Step 2: Payment method ── */}
        {step === "method" && (
          <>
            <button
              type="button"
              onClick={() => setStep("select")}
              className="inline-flex items-center gap-2 text-[0.74rem] uppercase tracking-[0.2em] mb-5 bg-transparent border-0 cursor-pointer"
              style={{ color: ALMA.ink, opacity: 0.55 }}
            >
              <ArrowLeft size={13} /> Cambiar plan
            </button>

            <Section>
              <div className="rounded-2xl p-4 flex items-center justify-between gap-3" style={{ backgroundColor: ALMA.blush }}>
                <span className="text-[0.92rem]" style={{ color: ALMA.ink }}>{selectedPlan?.name}</span>
                <span className="font-display nums" style={{ color: ALMA.berry, fontSize: "1.3rem" }}>
                  ${formatMoneyMX(finalAmount)} MXN
                </span>
              </div>
            </Section>

            <Section title="¿Cómo quieres pagar?">
              <div role="radiogroup" aria-label="Método de pago" style={{ borderBottom: `1px solid ${ALMA.border}` }}>
                {[
                  { id: "card" as const, label: "Tarjeta", sub: "Visa, Mastercard — pago seguro con Stripe", icon: CreditCard },
                  { id: "transfer" as const, label: "Transferencia", sub: "Banorte, subes tu comprobante", icon: Building2 },
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
                      onClick={() => setPaymentMethod(opt.id)}
                      className="w-full grid grid-cols-[auto_1fr_auto] items-center gap-4 px-1 py-4 text-left bg-transparent border-0 cursor-pointer transition-colors hover:bg-[#F4F1EA]"
                      style={{ borderTop: `1px solid ${ALMA.border}`, color: ALMA.ink }}
                    >
                      <span
                        className="grid h-11 w-11 place-items-center rounded-2xl shrink-0 transition-colors"
                        style={{
                          backgroundColor: sel ? ALMA.berry : ALMA.blush,
                          color: sel ? ALMA.cream : ALMA.berry,
                        }}
                      >
                        <Icon size={18} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[0.94rem] font-medium leading-tight" style={{ color: ALMA.ink }}>
                          {opt.label}
                        </span>
                        <span className="block text-[0.78rem] mt-0.5" style={{ color: ALMA.ink, opacity: 0.6 }}>
                          {opt.sub}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="grid h-5 w-5 place-items-center rounded-full shrink-0 transition-colors"
                        style={{ border: `1.5px solid ${sel ? ALMA.berry : ALMA.sandstone}` }}
                      >
                        {sel && <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ALMA.berry }} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <StickyCta>
              <PrimaryButton
                onClick={() => createOrderMutation.mutate()}
                disabled={createOrderMutation.isPending}
                loading={createOrderMutation.isPending}
                loadingLabel="Procesando…"
                className="w-full"
              >
                <CreditCard size={14} />
                Confirmar
              </PrimaryButton>
            </StickyCta>
          </>
        )}

        {/* ── Step 3a: Bank details ── */}
        {step === "bank" && bankDetails && (
          <>
            <Section title="Datos para transferencia">
              <p className="mb-4 text-[0.92rem] leading-[1.6]" style={{ color: ALMA.ink, opacity: 0.7 }}>
                Realiza la transferencia con los datos abajo. Después sube el comprobante para que activemos tu paquete.
              </p>
              <div className="rounded-3xl p-5 sm:p-7" style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}>
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
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: ALMA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: ALMA.berry, color: ALMA.cream }}
              >
                <Banknote size={22} />
              </span>
              <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.6rem, 2.6vw, 2.1rem)" }}>
                Págalo en el estudio
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: ALMA.ink, opacity: 0.7 }}>
                Acércate a recepción con tu número de orden. Activamos tu paquete cuando confirmemos el pago.
              </p>
              {(orderNumber || orderId) && (
                <div
                  className="inline-flex flex-col gap-1 px-5 py-3 rounded-2xl mt-5"
                  style={{ backgroundColor: ALMA.cream, border: `1px solid ${ALMA.border}` }}
                >
                  <span className="text-[0.72rem] uppercase tracking-[0.24em]" style={{ color: ALMA.ink, opacity: 0.55 }}>
                    Número de orden
                  </span>
                  <span className="nums font-mono text-[1.1rem] tracking-widest font-medium" style={{ color: ALMA.berry }}>
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
            <div className="rounded-3xl p-7 sm:p-10 text-center" style={{ backgroundColor: ALMA.blush }}>
              <span
                className="grid h-14 w-14 mx-auto place-items-center rounded-2xl mb-4"
                style={{ backgroundColor: ALMA.olive, color: ALMA.cream }}
              >
                <CheckCircle2 size={22} />
              </span>
              <h3 className="font-display leading-tight" style={{ color: ALMA.ink, fontSize: "clamp(1.7rem, 2.8vw, 2.3rem)" }}>
                Comprobante recibido
              </h3>
              <p className="mt-3 text-[0.92rem] leading-[1.6] max-w-[44ch] mx-auto" style={{ color: ALMA.ink, opacity: 0.7 }}>
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

        {step === "select" && !plansError && !selectedPlan && (
          <Section>
            <InfoBanner
              tone="stone"
              title="Selecciona un paquete para continuar."
              description="Si nunca has venido, prueba con la clase muestra desde el sitio principal."
            />
          </Section>
        )}
      </AppShell>
    </ClientAuthGuard>
  );
};

export default Checkout;
