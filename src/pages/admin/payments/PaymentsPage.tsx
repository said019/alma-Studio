import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ErrorState, EmptyState } from "@/components/app/AppShell";
import { formatMXN, formatDate } from "@/lib/format";
import { Loader2, Search, User, Package, CheckCircle2, CreditCard, Banknote, ArrowRight, ChevronLeft, History, Check, Receipt } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo", icon: Banknote },
  { value: "card", label: "Tarjeta", icon: CreditCard },
  { value: "transfer", label: "Transferencia", icon: ArrowRight },
];

const STEP_META = [
  { label: "Buscar clienta", icon: User },
  { label: "Elegir plan", icon: Package },
  { label: "Confirmar", icon: CheckCircle2 },
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

// ── Indicador de pasos ────────────────────────────────────
const StepBar = ({ step }: { step: number }) => (
  <div className="flex flex-wrap items-center gap-y-2 mb-8">
    {STEP_META.map((s, i) => {
      const done = step > i + 1;
      const active = step === i + 1;
      return (
        <div key={i} className="flex items-center">
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
              active && "bg-sunken text-ink ring-1 ring-inset ring-line-strong",
              done && "bg-sunken text-ink/70 border border-line",
              !done && !active && "border border-line text-ink/55",
            )}
          >
            <span
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold nums",
                active && "bg-inverse text-canvas",
                done && "bg-sunken text-ink",
                !done && !active && "bg-sunken text-ink/55",
              )}
            >
              {done ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            {s.label}
          </div>
          {i < 2 && <div className={cn("w-8 h-px mx-1", done ? "bg-line" : "bg-line")} />}
        </div>
      );
    })}
  </div>
);

// ── Wizard de cobro en mostrador ─────────────────────────
const CashAssignment = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [selectedUser, setSelectedUser] = useState<{ id: string; displayName: string; email?: string; phone?: string | null } | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<{ id: string; name: string; price: number } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  const { data: usersData, isLoading: usersLoading, isError: usersError, refetch: refetchUsers } = useQuery<{ data: { id: string; displayName: string; email: string; phone?: string | null }[] }>({
    queryKey: ["users-search", debouncedSearch],
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ""}`)
    ).data,
  });

  const filteredUsers = Array.isArray(usersData?.data) ? usersData.data : [];

  const { data: plansData, isLoading: plansLoading, isError: plansError, refetch: refetchPlans } = useQuery<{ data: { id: string; name: string; price: number; classLimit?: number | null; durationDays?: number; classCategory?: string }[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });

  const assignMutation = useMutation({
    mutationFn: () => api.post("/memberships", {
      userId: selectedUser?.id,
      planId: selectedPlan?.id,
      paymentMethod,
      startDate: new Date().toISOString().split("T")[0],
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memberships"] });
      toast({ title: "Membresía activada" });
      setStep(1); setSelectedUser(null); setSelectedPlan(null); setSearch("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al asignar", variant: "destructive" }),
  });

  const plans = (Array.isArray(plansData?.data) ? plansData.data : []).filter((p) => (p as any).isActive !== false && (p as any).is_active !== false);
  const planGroups = groupPlans(plans);

  return (
    <div className="max-w-2xl mx-auto">
      <StepBar step={step} />

      {/* ── Paso 1: Buscar clienta ─────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-sunken p-5">
            <h3 className="text-[0.72rem] font-semibold text-ink/70 uppercase tracking-[0.14em] mb-4">Buscar clienta</h3>
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/55" />
              <Input
                className="pl-9 rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nombre, email o teléfono…"
                autoFocus
              />
            </div>
          </div>

          {usersLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[68px] w-full rounded-2xl" />
              ))}
            </div>
          )}

          {usersError && !usersLoading && (
            <ErrorState
              title="No pudimos buscar clientas"
              description="Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetchUsers()}
            />
          )}

          {!usersLoading && !usersError && (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl border border-line bg-sunken hover:bg-sunken/40 hover:border-line-strong transition-colors group text-left"
                  onClick={() => { setSelectedUser(u); setStep(2); }}
                >
                  <div className="w-9 h-9 rounded-full bg-sunken ring-1 ring-inset ring-line-strong/50 flex items-center justify-center text-sm font-bold text-ink shrink-0">
                    {u.displayName?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-ink truncate">{u.displayName}</p>
                    <p className="text-xs text-ink/55 truncate">
                      {u.email}
                      {u.phone ? ` · ${u.phone}` : ""}
                    </p>
                  </div>
                  <ArrowRight size={14} className="text-ink/30 group-hover:text-ink transition-colors shrink-0" />
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center py-6 text-ink/55 text-sm">
                  {debouncedSearch
                    ? "No encontramos a nadie con esos datos."
                    : "Escribe un nombre, email o teléfono para buscar."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Paso 2: Elegir plan ────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          {/* Clienta seleccionada */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-sunken/50 border border-line-strong/50">
            <div className="w-8 h-8 rounded-full bg-sunken ring-1 ring-inset ring-line-strong flex items-center justify-center text-xs font-bold text-ink">
              {selectedUser?.displayName?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">{selectedUser?.displayName}</p>
              <p className="text-xs text-ink/55">{selectedUser?.email}</p>
            </div>
            <Button variant="ghost" size="sm" className="ml-auto text-ink/70 hover:text-ink text-xs" onClick={() => setStep(1)}>
              <ChevronLeft size={12} className="mr-1" /> Cambiar
            </Button>
          </div>

          {plansLoading && (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          )}

          {plansError && !plansLoading && (
            <ErrorState
              title="No pudimos cargar los planes"
              description="Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetchPlans()}
            />
          )}

          {!plansLoading && !plansError && plans.length === 0 && (
            <EmptyState
              icon={<Package size={20} strokeWidth={1.8} />}
              title="Sin planes activos"
              description="Crea un plan en la sección de Planes para poder cobrarlo en mostrador."
              ctaLabel="Ir a Planes"
              ctaTo="/admin/plans"
            />
          )}

          {/* Grupos de planes */}
          {!plansLoading && !plansError && Object.entries(planGroups).map(([group, items]) => {
            if (!items.length) return null;
            return (
              <div key={group}>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink mb-2 px-1">
                  {GROUP_LABELS[group] ?? group}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {items.map((p) => {
                    const isSelected = selectedPlan?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        aria-pressed={isSelected}
                        className={cn(
                          "w-full flex items-center justify-between gap-3 p-3.5 rounded-xl border transition-colors text-left group",
                          isSelected
                            ? "border-line-strong bg-sunken ring-1 ring-inset ring-line-strong"
                            : "border-line bg-sunken hover:border-line-strong hover:bg-sunken/40",
                        )}
                        onClick={() => setSelectedPlan(p)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={cn(
                              "w-5 h-5 rounded-full flex items-center justify-center shrink-0 transition-colors",
                              isSelected ? "bg-inverse text-canvas" : "border border-line-strong/60",
                            )}
                          >
                            {isSelected && <Check size={11} strokeWidth={3} />}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{p.name}</p>
                            <p className="text-xs text-ink/55 nums">
                              {p.classLimit === null ? "Ilimitado" : `${p.classLimit} clases`}
                              {p.durationDays ? ` · ${p.durationDays} días` : ""}
                            </p>
                          </div>
                        </div>
                        <span className="text-base font-semibold text-ink nums shrink-0">
                          {formatMXN(Number(p.price))}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="border-line-strong text-ink hover:bg-sunken" onClick={() => setStep(1)}>
              <ChevronLeft size={14} className="mr-1" /> Volver
            </Button>
            <Button
              className="flex-1 bg-inverse text-canvas hover:bg-ink font-semibold"
              disabled={!selectedPlan}
              onClick={() => setStep(3)}
            >
              Continuar <ArrowRight size={14} className="ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Paso 3: Confirmar ─────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Resumen */}
          <div className="rounded-2xl border border-line bg-sunken overflow-hidden">
            <div className="px-5 py-3 border-b border-line flex items-center gap-2">
              <Receipt size={14} className="text-ink" />
              <span className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/70">Resumen de la membresía</span>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-ink/70">Clienta</span>
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-sunken ring-1 ring-inset ring-line-strong flex items-center justify-center text-[9px] font-bold text-ink">
                    {selectedUser?.displayName?.[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold text-ink">{selectedUser?.displayName}</span>
                </div>
              </div>
              <div className="h-px bg-line" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-ink/70">Plan</span>
                <span className="text-sm font-semibold text-ink">{selectedPlan?.name}</span>
              </div>
              <div className="h-px bg-line" />
              <div className="flex justify-between items-center">
                <span className="text-sm text-ink/70">Total</span>
                <span className="text-lg font-semibold text-ink nums">{formatMXN(Number(selectedPlan?.price ?? 0))}</span>
              </div>
            </div>
          </div>

          {/* Método de pago */}
          <div className="rounded-2xl border border-line bg-sunken p-5">
            <Label className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink/70 mb-3 block">Método de pago</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PAYMENT_METHODS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  aria-pressed={paymentMethod === value}
                  className={cn(
                    "flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors",
                    paymentMethod === value
                      ? "border-line-strong bg-sunken text-ink ring-1 ring-inset ring-line-strong"
                      : "border-line bg-canvas text-ink/55 hover:border-line-strong hover:text-ink",
                  )}
                  onClick={() => setPaymentMethod(value)}
                >
                  <Icon size={16} />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="border-line-strong text-ink hover:bg-sunken" onClick={() => setStep(2)}>
              <ChevronLeft size={14} className="mr-1" /> Volver
            </Button>
            <Button
              className="flex-1 bg-inverse text-canvas hover:bg-ink font-semibold h-11"
              onClick={() => assignMutation.mutate()}
              disabled={assignMutation.isPending}
            >
              {assignMutation.isPending
                ? <><Loader2 className="animate-spin mr-2" size={14} /> Activando…</>
                : <><CheckCircle2 size={15} className="mr-2" /> Confirmar y activar membresía</>
              }
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Historial de pagos ────────────────────────────────────
const PaymentsHistory = () => {
  const { data, isLoading, isError, refetch } = useQuery<{ data: any[] }>({
    queryKey: ["payments"],
    queryFn: async () => (await api.get("/payments")).data,
  });
  const payments = Array.isArray(data?.data) ? data.data : [];

  const methodLabels: Record<string, string> = { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia" };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        title="No pudimos cargar el historial"
        description="Revisa tu conexión y vuelve a intentarlo."
        onRetry={() => refetch()}
      />
    );
  }

  if (!payments.length) {
    return (
      <EmptyState
        icon={<History size={20} strokeWidth={1.8} />}
        title="Sin pagos registrados aún"
        description="Cuando cobres una membresía en mostrador, aparecerá aquí."
      />
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((p: any) => (
        <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl border border-line bg-sunken hover:bg-sunken/30 transition-colors">
          <div className="w-8 h-8 rounded-full bg-sunken ring-1 ring-inset ring-line-strong/50 flex items-center justify-center shrink-0">
            <CreditCard size={13} className="text-ink" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{p.userName ?? p.userId ?? "—"}</p>
            <p className="text-xs text-ink/55 nums">{p.createdAt ? formatDate(p.createdAt) : "—"}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full border border-line bg-canvas text-ink/70">
              {methodLabels[p.method] ?? p.method ?? "—"}
            </span>
            <span className="text-sm font-semibold text-ink nums">{formatMXN(Number(p.total_amount ?? p.amount ?? 0))}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Página principal de pagos ─────────────────────────────
const PaymentsPage = () => (
  <AuthGuard>
    <AdminLayout>
      <div className="admin-page max-w-3xl">
        <SectionTabs
          tabs={[
            { label: "Cobrar", to: "/admin/payments" },
            { label: "Verificar", to: "/admin/orders" },
          ]}
        />
        {/* Header */}
        <div className="mb-6">
          <h1 className="admin-title text-ink mb-1">Pagos</h1>
          <p className="text-sm text-ink/55">Asigna membresías en mostrador y consulta el historial</p>
        </div>

        <Tabs defaultValue="cash">
          <TabsList className="h-auto rounded-2xl border border-line bg-sunken p-1 mb-6">
            <TabsTrigger
              value="cash"
              className="rounded-xl px-4 py-2 text-[13px] font-semibold text-ink/70 data-[state=active]:bg-sunken data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-line-strong"
            >
              Cobro en mostrador
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-xl px-4 py-2 text-[13px] font-semibold text-ink/70 data-[state=active]:bg-sunken data-[state=active]:text-ink data-[state=active]:shadow-none data-[state=active]:ring-1 data-[state=active]:ring-inset data-[state=active]:ring-line-strong"
            >
              Historial
            </TabsTrigger>
          </TabsList>
          <TabsContent value="cash"><CashAssignment /></TabsContent>
          <TabsContent value="history"><PaymentsHistory /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  </AuthGuard>
);

export default PaymentsPage;
