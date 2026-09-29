import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import ClientSearch from "@/components/admin/ClientSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { REASON_MIN_CHARS } from "@/lib/audit-log";
import { CreditCard, Banknote, ArrowRight, Check } from "lucide-react";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { cn } from "@/lib/utils";
import CobrosTabs from "./CobrosTabs";

// ── Helpers ──────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: ArrowRight },
];

// ── Agrupación de planes por categoría (taxonomía única) ──
const GROUP_LABELS: Record<string, string> = {
  studio: "Studio",
  reformer_tower: "Reformer & Tower",
  mixto: "Mixtos",
  otro: "Otros paquetes",
};

function groupPlans(plans: any[]) {
  const groups: Record<string, any[]> = { studio: [], reformer_tower: [], mixto: [], otro: [] };
  for (const p of plans) {
    const cat = p.classCategory ?? p.class_category ?? "";
    const name = p.name?.toLowerCase() ?? "";
    if (cat === "studio") groups.studio.push(p);
    else if (cat === "reformer_tower") groups.reformer_tower.push(p);
    else if (cat === "mixto") groups.mixto.push(p);
    else if (name.includes("reformer") || name.includes("tower")) groups.reformer_tower.push(p);
    else if (name.includes("studio")) groups.studio.push(p);
    else if (name.includes("mixto")) groups.mixto.push(p);
    else groups.otro.push(p);
  }
  return groups;
}

// ── Wizard de cobro en mostrador ─────────────────────────
type SelectedUser = { id: string; displayName: string; email?: string | null; phone?: string | null };
type SelectedPlan = { id: string; name: string; price: number; durationDays?: number | null };

// Precio que el servidor cobra: el efectivo (con precio de apertura si aplica).
const planPrice = (p: any) => Number(p.effectivePrice ?? p.effective_price ?? p.price ?? 0);

function StepTitle({ n, done, children }: { n: number; done: boolean; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      {done ? (
        <span className="grid h-7 w-7 place-items-center rounded-full bg-ink text-canvas"><Check size={14} aria-hidden="true" /></span>
      ) : (
        <span className="nums grid h-7 w-7 place-items-center rounded-full border border-line-strong text-[13px] font-extrabold">{n}</span>
      )}
      <h2 className="text-base font-extrabold">{children}</h2>
    </div>
  );
}

function CashAssignment() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [clientParam, setClientParam] = useSearchParamState("clienta");
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  // Precio cobrado, referencia y motivo (auditoría 2026-09-27, P0-3).
  const [amountStr, setAmountStr] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [reason, setReason] = useState("");

  // "Renovar" desde la ficha: /admin/payments?clienta=<id>. Misma llave que la ficha.
  const preselectQ = useQuery<Record<string, any>>({
    queryKey: ["client", clientParam],
    queryFn: async () => (await api.get(`/users/${clientParam}`)).data,
    enabled: !!clientParam && !selectedUser,
    retry: false,
  });
  useEffect(() => {
    const u = preselectQ.data?.data ?? preselectQ.data;
    if (u?.id && !selectedUser) {
      setSelectedUser({ id: u.id, displayName: u.displayName ?? u.display_name ?? "Usuario", email: u.email, phone: u.phone });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectQ.data]);

  // Consulta de planes: la misma de hoy y el mismo filtro de activos.
  const { data: plansData, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery<{ data: any[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = (Array.isArray(plansData?.data) ? plansData!.data : []).filter((p) => p.isActive !== false && p.is_active !== false);
  const planGroups = groupPlans(plans);

  const listPrice = selectedPlan?.price ?? 0;
  const amount = amountStr.trim() === "" ? NaN : Number(amountStr.trim().replace(",", "."));
  const amountValid = Number.isFinite(amount) && amount >= 0;
  const courtesy = amountValid && amount === 0;
  const differs = amountValid && Math.abs(amount - listPrice) >= 0.01;
  const needsReason = !!selectedPlan && (courtesy || differs);
  const reasonOk = reason.trim().length >= REASON_MIN_CHARS;

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post("/memberships", {
        userId: selectedUser!.id,
        planId: selectedPlan!.id,
        paymentMethod,
        startDate: format(new Date(), "yyyy-MM-dd"),
        amount,
        ...(paymentReference.trim() ? { paymentReference: paymentReference.trim() } : {}),
        ...(needsReason ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ title: "Membresía activada" });
      setSelectedUser(null);
      setSelectedPlan(null);
      setPaymentMethod("cash");
      setAmountStr("");
      setPaymentReference("");
      setReason("");
      setClientParam(null);
    },
    onError: (e: any) =>
      toast({ title: e?.response?.data?.message ?? "Error al asignar", variant: "destructive" }),
  });

  const today = new Date();
  const vigencia = selectedPlan?.durationDays
    ? `${format(today, "d MMM", { locale: es })} – ${format(addDays(today, selectedPlan.durationDays), "d MMM", { locale: es })}`
    : selectedPlan ? "Desde hoy" : "—";
  const methodLabel = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? "—";
  const row = (k: string, v: ReactNode) => (
    <div className="flex justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <dt className="text-sm text-ink-muted">{k}</dt>
      <dd className="nums text-right text-sm font-bold">{v}</dd>
    </div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel aria-label="Usuario" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={1} done={!!selectedUser}>Usuario</StepTitle>
          {selectedUser ? (
            <div className="flex items-center gap-3.5 rounded-xl bg-canvas px-3.5 py-3">
              <PersonCell name={selectedUser.displayName} sub={[selectedUser.email, selectedUser.phone].filter(Boolean).join(" · ")} size={40} />
              <Button variant="ghost" className="ml-auto" onClick={() => { setSelectedUser(null); setClientParam(null); }}>Cambiar</Button>
            </div>
          ) : (
            <>
              {preselectQ.isError && <p className="text-[13px] font-bold text-danger">No encontramos a esa usuario. Búscala abajo.</p>}
              <ClientSearch
                label="Buscar usuario para cobrar"
                placeholder="Nombre, email o teléfono…"
                onSelect={(c) => setSelectedUser({ id: c.id, displayName: c.displayName, email: c.email, phone: c.phone })}
              />
            </>
          )}
        </Panel>

        <Panel aria-label="Plan" className="flex flex-col gap-4 p-5 lg:p-6">
          <StepTitle n={2} done={!!selectedPlan}>Plan</StepTitle>
          {plansLoading ? (
            <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
          ) : plansError ? (
            <ErrorState title="No pudimos cargar los planes" description="Revisa tu conexión y vuelve a intentarlo." onRetry={() => refetchPlans()} />
          ) : plans.length === 0 ? (
            <EmptyState
              title="Sin planes activos"
              description="Crea un plan en la sección de Planes para poder cobrarlo en mostrador."
              ctaLabel="Ir a Planes"
              ctaTo="/admin/plans"
            />
          ) : (
            Object.entries(planGroups)
              .filter(([, list]) => list.length > 0)
              .map(([key, list]) => (
                <div key={key} className="flex flex-col gap-2.5">
                  <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{GROUP_LABELS[key]}</p>
                  <div role="radiogroup" aria-label={GROUP_LABELS[key]} className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((p: any) => {
                      const sel = selectedPlan?.id === p.id;
                      const limit = p.classLimit ?? p.class_limit;
                      const days = p.durationDays ?? p.duration_days;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={sel}
                          onClick={() => { const price = planPrice(p); setSelectedPlan({ id: p.id, name: p.name, price, durationDays: days }); setAmountStr(String(price)); setReason(""); }}
                          className={cn("flex min-h-[88px] items-start gap-3 rounded-xl bg-surface p-4 text-left", sel ? "border-2 border-ink" : "border border-line hover:border-line-strong")}
                        >
                          <span aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0 rounded-full", sel ? "border-[6px] border-ink" : "border border-line-strong")} />
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-extrabold">{p.name}</span>
                            <span className="text-[13px] text-ink-muted">
                              {limit == null ? "Ilimitado" : `${limit} ${Number(limit) === 1 ? "clase" : "clases"}`}
                              {days ? ` · ${days} días` : ""}
                            </span>
                            <span className="nums mt-1.5 text-base font-extrabold">{formatMXN(planPrice(p))}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
          )}
        </Panel>

        <Panel aria-label="Método de pago" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={3} done={false}>Método de pago</StepTitle>
          <div role="radiogroup" aria-label="Método de pago" className="grid gap-2.5 sm:grid-cols-3">
            {PAYMENT_METHODS.map((m) => {
              const sel = paymentMethod === m.value;
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={sel}
                  onClick={() => setPaymentMethod(m.value)}
                  className={cn("flex min-h-[56px] items-center gap-2.5 rounded-xl bg-surface px-4 text-sm font-bold", sel ? "border-2 border-ink" : "border border-line")}
                >
                  <Icon size={18} aria-hidden="true" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel aria-label="Cobro" className="flex flex-col gap-3.5 p-5 lg:p-6">
          <StepTitle n={4} done={false}>Cobro</StepTitle>
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cobro-monto">Precio cobrado</Label>
              <Input id="cobro-monto" type="number" inputMode="decimal" min={0} step="1" className="nums" disabled={!selectedPlan}
                value={amountStr} onChange={(e) => setAmountStr(e.target.value)} />
              <p className="text-[0.75rem] text-ink-muted">
                {selectedPlan ? `Precio del plan: ${formatMXN(listPrice)}.` : "Elige un plan primero."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cobro-ref">Referencia de pago (opcional)</Label>
              <Input id="cobro-ref" maxLength={100} value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Folio de la transferencia o del voucher" />
            </div>
          </div>
          {needsReason && (
            <div className="flex flex-col gap-1.5 rounded-xl border border-accent/30 bg-accent-soft p-3.5">
              <Label htmlFor="cobro-motivo">Motivo (obligatorio)</Label>
              <p className="text-[0.75rem] text-ink">
                {courtesy ? "Es una cortesía ($0)." : "Lo cobrado es distinto al precio del plan."} Queda en la bitácora con tu nombre.
              </p>
              <Textarea id="cobro-motivo" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. cortesía por evento de apertura" />
              {!reasonOk && <p className="text-[0.75rem] text-ink-muted">Mínimo {REASON_MIN_CHARS} caracteres.</p>}
            </div>
          )}
        </Panel>
      </div>

      <aside aria-label="Resumen de la membresía" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-surface p-6 lg:sticky lg:top-24">
        <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">Resumen de la membresía</p>
        <dl className="mt-2">
          {row("Usuario", selectedUser?.displayName ?? "—")}
          {row("Plan", selectedPlan?.name ?? "—")}
          {row("Vigencia", vigencia)}
          {row("Método", methodLabel)}
          {paymentReference.trim() && row("Referencia", paymentReference.trim())}
          {selectedPlan && differs && row("Precio del plan", formatMXN(listPrice))}
        </dl>
        <div className="flex items-baseline justify-between border-t-2 border-ink pb-2 pt-4">
          <span className="flex items-center gap-2 text-[15px] font-bold">
            Total
            {courtesy && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[0.75rem] font-extrabold text-accent-strong">Cortesía</span>}
          </span>
          <span className="nums font-display text-[2rem] font-semibold">{selectedPlan && amountValid ? formatMXN(amount) : "—"}</span>
        </div>
        <Button size="lg" className="w-full" disabled={!selectedUser || !selectedPlan || !amountValid || (needsReason && !reasonOk) || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
          {assignMutation.isPending ? "Activando…" : "Confirmar y activar membresía"}
        </Button>
        <p className="mt-1.5 text-center text-[0.75rem] text-ink-muted">La membresía se activa hoy y el usuario recibe su confirmación.</p>
      </aside>
    </div>
  );
}

// ── Página principal de pagos ─────────────────────────────
// Cobrar es sólo de quien ve dinero (spec §8, I3): el servidor no lo protege
// (POST /memberships acepta recepción y coach), así que aquí es el único
// control.
const PaymentsPage = () => (
  <AuthGuard requiredRoles={["admin", "super_admin"]}>
    <AdminLayout>
      <AdminPage>
        <AdminPageHeader kicker="Cobros · mostrador" title="Cobrar" subtitle="Asigna una membresía y cóbrala en el momento." actions={<CobrosTabs />} />
        <CashAssignment />
      </AdminPage>
    </AdminLayout>
  </AuthGuard>
);

export default PaymentsPage;
