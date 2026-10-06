import { DEFAULT_PLAN_RULES, normalizePlanRules, planConditions } from "@/lib/planConditions";
import { ReorderPlans } from "@/components/admin/ReorderPlans";
import { useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import StatusDot from "@/components/admin/StatusDot";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Package, Plus } from "lucide-react";

const CATEGORIES = [
  { value: "studio",         label: "Studio" },
  { value: "reformer_tower", label: "Pilates Reformer" },
  { value: "mixto",          label: "Mixto" },
  { value: "all",            label: "Todo (all)" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

const nullablePositive = z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().int().positive().nullable());
const nullableTime = z.preprocess(v => v === "" ? null : v, z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida").nullable());
const nullableUrl = z.preprocess(v => v === "" ? null : v, z.string().url("Enlace inválido").refine(v => v.startsWith("https://"), "Usa HTTPS").nullable());
export const planSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  currency: z.string().default("MXN"),
  durationDays: z.coerce.number().int().min(1),
  classLimit: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
  classCategory: z.enum(["studio", "reformer_tower", "mixto", "all"]).default("studio"),
  openingPrice: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nonnegative().nullable()),
  morningOnly: z.boolean().default(false),
  afternoonOnly: z.boolean().default(false),
  personalOnly: z.boolean().default(false),
  features: z.string().optional(),
  isActive: z.boolean().default(true),
  isNonTransferable: z.boolean().default(false),
  isNonRepeatable: z.boolean().default(false),
  repeatKey: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
  isVisitPack: z.boolean().default(false),
  rules: z.object({
    promotion_payment_url: nullableUrl,
    promotion_mode: z.enum(["studio", "disabled", "price", "percent", "amount"]),
    promotion_value: z.preprocess(v => v === "" || v == null ? null : Number(v), z.number().finite().nonnegative().nullable()),
    daily_class_limit: nullablePositive,
    allowed_weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Selecciona al menos un día"),
    booking_start_time: nullableTime, booking_end_time: nullableTime,
    requires_student_id: z.boolean(), guest_passes: z.coerce.number().int().min(0),
    guest_pass_period: z.enum(["membership", "month"]),
    complimentary_coffee_per_day: z.coerce.number().int().min(0),
    billing_period: z.enum(["one_time", "month"]), commitment_months: z.coerce.number().int().min(0),
    auto_renew: z.boolean(), payment_url: nullableUrl, opening_payment_url: nullableUrl,
    transferable: z.boolean(), extendable: z.boolean(),
  }).refine(r => (!r.booking_start_time && !r.booking_end_time) || (r.booking_start_time && r.booking_end_time && r.booking_start_time < r.booking_end_time), { message: "Define ambas horas y un fin posterior al inicio", path: ["booking_end_time"] })
    .refine(r => r.billing_period === "month" || (!r.auto_renew && !r.commitment_months), { message: "El compromiso y la renovación requieren pago mensual", path: ["billing_period"] }),
}).superRefine((p, ctx) => {
  const mode = p.rules.promotion_mode, value = p.rules.promotion_value;
  if (!["studio", "disabled"].includes(mode) && (value == null || (mode === "percent" ? value > 100 : value > p.price))) ctx.addIssue({code:z.ZodIssueCode.custom,path:["rules","promotion_value"],message:"Indica un descuento válido: hasta 100% o un importe no mayor al precio regular."});
});

type PlanFormData = z.infer<typeof planSchema>;

interface Plan extends PlanFormData {
  id: string;
  archivedAt?: string | null;
}

function normalizePlanRow(row: any): Plan {
  return {
    rules: normalizePlanRules({
      ...((row?.afternoonOnly ?? row?.afternoon_only) ? {allowed_weekdays:[1,2,3,4,5],booking_start_time:"11:00",booking_end_time:"16:00"} : (row?.morningOnly ?? row?.morning_only) ? {booking_start_time:"00:00",booking_end_time:"10:00"} : {}),
      ...row?.rules, transferable: false, extendable: false,
    }),
    id: String(row?.id ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    price: Number(row?.price ?? 0),
    currency: String(row?.currency ?? "MXN"),
    durationDays: Number(row?.durationDays ?? row?.duration_days ?? 30),
    classLimit: (() => {
      const raw = row?.classLimit ?? row?.class_limit ?? row?.class_limit_override;
      if (raw === "" || raw === undefined || raw === null) return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    })(),
    classCategory: ((row?.classCategory ?? row?.class_category ?? "studio") as CategoryValue),
    openingPrice: (() => { const r = (row as any)?.openingPrice ?? (row as any)?.opening_price; return r == null || r === "" ? null : Number(r); })(),
    morningOnly: Boolean((row as any)?.morningOnly ?? (row as any)?.morning_only ?? false),
    afternoonOnly: Boolean((row as any)?.afternoonOnly ?? (row as any)?.afternoon_only ?? false),
    personalOnly: Boolean((row as any)?.personalOnly ?? (row as any)?.personal_only ?? false),
    features: Array.isArray(row?.features)
      ? row.features.join(", ")
      : String(row?.features ?? ""),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
    isNonTransferable: Boolean(row?.isNonTransferable ?? row?.is_non_transferable ?? false),
    isNonRepeatable: Boolean(row?.isNonRepeatable ?? row?.is_non_repeatable ?? false),
    repeatKey: String(row?.repeatKey ?? row?.repeat_key ?? ""),
    sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? 0),
    isVisitPack: Boolean(row?.isVisitPack ?? row?.is_visit_pack ?? false),
    archivedAt: (row?.archivedAt ?? row?.archived_at ?? null) as string | null,
  };
}

const EMPTY: PlanFormData = {
  name: "", description: "", price: 0, currency: "MXN",
  durationDays: 30, classLimit: null, classCategory: "reformer_tower",
  openingPrice: null, morningOnly: false, afternoonOnly: false, personalOnly: false,
  features: "", isActive: true, isNonTransferable: true, isNonRepeatable: false, repeatKey: "",
  sortOrder: 0,
  isVisitPack: false,
  rules: DEFAULT_PLAN_RULES,
};

function serializePlan(d: PlanFormData) {
  return {
    ...d,
    isNonTransferable: true,
    rules: { ...d.rules, transferable: false, extendable: false },
    repeatKey: d.isNonRepeatable ? (d.repeatKey?.trim() || null) : null,
    opening_price: d.openingPrice,
    morningOnly: false, afternoonOnly: false,
    morning_only: false,
    afternoon_only: false,
    personal_only: !!d.personalOnly,
    features: d.features
      ? d.features.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    isVisitPack: !!d.isVisitPack,
    is_visit_pack: !!d.isVisitPack,
  };
}

function normalizePlan(p: Plan): PlanFormData {
  return {
    ...p,
    classCategory: ((p as any).classCategory ?? (p as any).class_category ?? "studio") as CategoryValue,
    openingPrice: (() => { const r = (p as any).openingPrice ?? (p as any).opening_price; return r == null || r === "" ? null : Number(r); })(),
    morningOnly: Boolean((p as any).morningOnly ?? (p as any).morning_only ?? false),
    afternoonOnly: Boolean((p as any)?.afternoonOnly ?? (p as any)?.afternoon_only ?? false),
    personalOnly: Boolean((p as any)?.personalOnly ?? (p as any)?.personal_only ?? false),
    features: Array.isArray(p.features)
      ? (p.features as unknown as string[]).join(", ")
      : (p.features as unknown as string) ?? "",
    isNonTransferable: Boolean((p as any).isNonTransferable ?? (p as any).is_non_transferable),
    isNonRepeatable: Boolean((p as any).isNonRepeatable ?? (p as any).is_non_repeatable),
    repeatKey: String((p as any).repeatKey ?? (p as any).repeat_key ?? ""),
    isVisitPack: Boolean((p as any).isVisitPack ?? (p as any).is_visit_pack ?? false),
  };
}

/* ── Piezas del formulario ───────────────────────────────────────────── */

const FormSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-4">
    <p className="border-b border-line pb-2 text-[0.75rem] font-medium uppercase tracking-[0.18em] text-ink">
      {title}
    </p>
    {children}
  </section>
);

const FieldHelp = ({ children }: { children: ReactNode }) => (
  <p className="text-xs leading-relaxed text-ink/55">{children}</p>
);

const SwitchRow = ({
  label, help, checked, onCheckedChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) => (
  <div className="flex items-start justify-between gap-3 rounded-xl border border-line bg-sunken/60 p-3">
    <div className="space-y-0.5">
      <Label>{label}</Label>
      {help && <FieldHelp>{help}</FieldHelp>}
    </div>
    <Switch aria-label={label} checked={checked} onCheckedChange={onCheckedChange} />
  </div>
);

// Una tarjeta de plan, para reutilizar dentro de cada categoría conocida y
// en el cajón "Otros" (M8).
function PlanCard({ p, onEdit, onToggleActive, onDelete }: {
  p: Plan; onEdit: (p: Plan) => void; onToggleActive: (p: Plan) => void; onDelete: (p: Plan) => void;
}) {
  const rules = [
    p.isNonTransferable && "No transferible",
    p.isNonRepeatable && "No repetible",
    p.morningOnly && "Sólo mañanas",
    ...planConditions(p),
    p.personalOnly && "Sesión individual",
    p.isVisitPack && "Paquete de visitas",
  ].filter(Boolean) as string[];
  return (
    <article className={cn("flex flex-col gap-2.5 rounded-2xl border border-line bg-surface p-5", !p.isActive && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-extrabold leading-snug">{p.name}</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Acciones de ${p.name}`}><MoreHorizontal size={18} /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onEdit(p)}>Editar</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onToggleActive(p)}>
              {p.isActive ? "Desactivar" : "Activar"}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(p)}>
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="nums font-display text-[1.625rem] font-semibold leading-none">{formatMXN(Number(p.price))}</span>
        {p.rules.promotion_mode === "studio" && p.openingPrice != null && <span className="nums text-[0.75rem] font-bold text-ink-muted">Apertura {formatMXN(Number(p.openingPrice))}</span>}
        {!["studio", "disabled"].includes(p.rules.promotion_mode) && <span className="text-xs">{p.rules.promotion_mode === "percent" ? `${p.rules.promotion_value}% de descuento` : p.rules.promotion_mode === "amount" ? `${formatMXN(Number(p.rules.promotion_value))} de descuento` : `Promoción ${formatMXN(Number(p.rules.promotion_value))}`}</span>}
      </div>
      <p className="text-[13px] text-ink-muted">
        {p.classLimit == null ? (p.rules.daily_class_limit ? `${p.rules.daily_class_limit} ${p.rules.daily_class_limit === 1 ? "sesión" : "sesiones"}/día` : "Ilimitado") : `${p.classLimit} ${p.classLimit === 1 ? "clase" : "clases"}`} · {p.durationDays} días
      </p>
      <div className="flex min-h-[24px] flex-wrap gap-1.5">
        {rules.map((r) => <span key={r} className="rounded-full border border-line px-2.5 py-0.5 text-[0.75rem] font-bold text-ink-muted">{r}</span>)}
      </div>
      <div className="border-t border-line pt-2.5">
        {p.isActive
          ? <StatusDot tone="success">Activo</StatusDot>
          : <StatusDot tone="muted">{p.archivedAt ? "Archivado" : "Inactivo"}</StatusDot>}
      </div>
    </article>
  );
}

const KNOWN_CATEGORIES = new Set(CATEGORIES.map((c) => c.value));

const PlansList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = Array.isArray(data?.data) ? data.data.map(normalizePlanRow) : [];

  const form = useForm<PlanFormData>({ resolver: zodResolver(planSchema), defaultValues: EMPTY });

  const createMutation = useMutation({
    mutationFn: (d: PlanFormData) => api.post("/plans", serializePlan(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["plans-public"] }); toast({ title: "Plan creado" }); closeSheet(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Plan) => api.put(`/plans/${id}`, serializePlan(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); qc.invalidateQueries({ queryKey: ["plans-public"] }); toast({ title: "Plan actualizado" }); closeSheet(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  // Un plan con historial se archiva en el servidor; ya no hay "Eliminar con
  // todo" (auditoría 2026-09-27, familia de P1-5).
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/plans/${id}`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      toast({ title: res?.data?.message ?? "Plan eliminado" });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar", variant: "destructive" }),
  });

  const openCreate = () => { form.reset(EMPTY); setEditing(null); setOpen(true); };
  const openEdit = (p: Plan) => { form.reset(normalizePlan(p)); setEditing(p); setOpen(true); };
  const closeSheet = () => { setOpen(false); setEditing(null); };

  const onSubmit = (d: PlanFormData) => {
    if (editing) updateMutation.mutate({ ...d, id: editing.id });
    else createMutation.mutate(d);
  };

  const requestDelete = async (p: Plan) => {
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      description: "Si el plan tiene membresías, órdenes o códigos de descuento, se archiva: deja de venderse y su historial se conserva. Si no tiene nada ligado, se borra.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(p.id);
  };

  return (
    <AuthGuard>
      <AdminLayout>
        {dialog}
        <AdminPage>
          <AdminPageHeader
            kicker="Más"
            title="Planes"
            subtitle="Configura precios, vigencias, beneficios y restricciones. Las condiciones de reserva también aplican a membresías vigentes."
            actions={<><ReorderPlans plans={plans} /><Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo plan</Button></>}
          />

          {isError ? (
            <ErrorState
              description="No pudimos cargar los planes. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : !isLoading && plans.length === 0 ? (
            <div className="rounded-xl border border-line bg-sunken px-6">
              <EmptyState
                icon={<Package size={20} strokeWidth={1.8} />}
                title="Aún no hay planes"
                description="Los planes son los paquetes que vendes: definen el precio, la vigencia y cuántas clases incluyen. Crea el primero para empezar a vender membresías."
                ctaLabel="Crear el primer plan"
                onCta={openCreate}
              />
            </div>
          ) : isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
          ) : (
            <>
              {CATEGORIES.map((cat) => {
                const list = plans.filter((p) => (p.classCategory ?? "studio") === cat.value);
                if (!list.length) return null;
                return (
                  <section key={cat.value} className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-2.5">
                      <h2 className="text-base font-extrabold">{cat.label}</h2>
                      <span className="text-[13px] text-ink-muted">{list.length} {list.length === 1 ? "plan" : "planes"}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {list.map((p) => (
                        <PlanCard
                          key={p.id}
                          p={p}
                          onEdit={openEdit}
                          onToggleActive={(plan) => updateMutation.mutate({ ...plan, isActive: !plan.isActive })}
                          onDelete={requestDelete}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
              {/* Categoría no reconocida (por ejemplo "" heredada de datos
                  viejos): antes desaparecía del todo y no había forma de
                  editarla ni borrarla (M8). */}
              {(() => {
                const others = plans.filter((p) => !KNOWN_CATEGORIES.has((p.classCategory ?? "studio") as CategoryValue));
                if (!others.length) return null;
                return (
                  <section key="otros" className="flex flex-col gap-3">
                    <div className="flex items-baseline gap-2.5">
                      <h2 className="text-base font-extrabold">Otros</h2>
                      <span className="text-[13px] text-ink-muted">{others.length} {others.length === 1 ? "plan" : "planes"}</span>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                      {others.map((p) => (
                        <PlanCard
                          key={p.id}
                          p={p}
                          onEdit={openEdit}
                          onToggleActive={(plan) => updateMutation.mutate({ ...plan, isActive: !plan.isActive })}
                          onDelete={requestDelete}
                        />
                      ))}
                    </div>
                  </section>
                );
              })()}
            </>
          )}
        </AdminPage>

        {/* Formulario lateral */}
        <Sheet open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(null); }}>
          <SheetContent side="right" className="w-full overflow-y-auto border-line bg-canvas sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="font-display text-ink">{editing ? "Editar plan" : "Nuevo plan"}</SheetTitle>
              <SheetDescription className="text-ink/55">
                {editing ? "Los precios nuevos aplican a compras futuras. Las reglas de reserva también cambian para las membresías vigentes." : "Define qué incluye el paquete y cómo se vende."}
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-8 pb-4">
              <FormSection title="Esencial">
                <div className="space-y-1">
                  <Label htmlFor="plan-name">Nombre</Label>
                  <Input id="plan-name" {...form.register("name")} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plan-description">Descripción visible al usuario</Label>
                  <Input id="plan-description" {...form.register("description")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="plan-price">Precio (MXN)</Label>
                    <Input id="plan-price" type="number" className="nums" {...form.register("price")} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="plan-duration">Duración (días)</Label>
                    <Input id="plan-duration" type="number" className="nums" {...form.register("durationDays")} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Categoría de clases</Label>
                  <Select
                    value={form.watch("classCategory") ?? "all"}
                    onValueChange={(v) => form.setValue("classCategory", v as CategoryValue)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="plan-features">Beneficios (separados por coma)</Label>
                  <Input id="plan-features" {...form.register("features")} />
                  <FieldHelp>Se muestran como lista del plan en la página de precios.</FieldHelp>
                </div>
                <Label htmlFor="plan-sort">Orden de aparición</Label><Input id="plan-sort" type="number" {...form.register("sortOrder")} />
                <SwitchRow
                  label="Activo"
                  help="Solo los planes activos aparecen a la venta."
                  checked={form.watch("isActive")}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
              </FormSection>

              <FormSection title="Reglas">
                <div className="space-y-1">
                  <Label htmlFor="plan-limit">Límite de clases</Label>
                  <Input id="plan-limit" type="number" className="nums" placeholder="Vacío = ilimitado" {...form.register("classLimit")} />
                  <FieldHelp>Cuántas clases incluye durante la vigencia. Déjalo vacío para clases ilimitadas.</FieldHelp>
                </div>
                <FieldHelp>Todos los planes HIVE son personales e intransferibles y no permiten extensión de vigencia. Los guest pass son beneficios independientes para invitadas.</FieldHelp>
                <SwitchRow
                  label="No repetible"
                  help="Cada usuario puede comprar este plan una sola vez."
                  checked={form.watch("isNonRepeatable")}
                  onCheckedChange={(v) => form.setValue("isNonRepeatable", v)}
                />
                <SwitchRow
                  label="Sesión personalizada"
                  help="Solo permite reservar sesiones con cupo de una persona."
                  checked={form.watch("personalOnly")}
                  onCheckedChange={(v) => form.setValue("personalOnly", v)}
                />
              </FormSection>

              <FormSection title="Disponibilidad y límites diarios">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => { form.setValue("rules.allowed_weekdays", [0,1,2,3,4,5,6]); form.setValue("rules.booking_start_time", null); form.setValue("rules.booking_end_time", null); }}>Cualquier día y horario</Button>
                  <Button type="button" variant="outline" onClick={() => { form.setValue("rules.allowed_weekdays", [1,2,3,4,5]); form.setValue("rules.booking_start_time", "11:00"); form.setValue("rules.booking_end_time", "16:00"); }}>Usar horario especial HIVE</Button>
                </div>
                <Label htmlFor="daily-limit">Sesiones máximas por día</Label>
                <Input id="daily-limit" type="number" min={1} placeholder="Vacío = sin límite diario" {...form.register("rules.daily_class_limit")} />
                <FieldHelp>El límite total y el límite diario se aplican juntos. Mensual HIVE: 1; anual HIVE: 2.</FieldHelp>
                <fieldset><legend className="mb-2 text-sm font-medium">Días permitidos</legend><div className="flex flex-wrap gap-3">
                  {[[1,"Lun"],[2,"Mar"],[3,"Mié"],[4,"Jue"],[5,"Vie"],[6,"Sáb"],[0,"Dom"]].map(([day, label]) => <label key={day} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.watch("rules.allowed_weekdays").includes(Number(day))} onChange={e => { const days = form.getValues("rules.allowed_weekdays"); form.setValue("rules.allowed_weekdays", e.target.checked ? [...days, Number(day)] : days.filter(d => d !== Number(day)), { shouldValidate: true }); }} />{label}</label>)}
                </div></fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label htmlFor="start-time">Desde (CDMX)</Label><Input id="start-time" type="time" {...form.register("rules.booking_start_time")} /></div>
                  <div><Label htmlFor="end-time">Hasta (CDMX)</Label><Input id="end-time" type="time" {...form.register("rules.booking_end_time")} /></div>
                </div>
                <FieldHelp>Se valida la hora de inicio de la clase. Deja ambas horas vacías para cualquier horario. Estas son las únicas restricciones de horario del plan; puedes cambiar libremente los días y la franja.</FieldHelp>
                <SwitchRow label="Credencial de estudiante vigente" help="Requiere verificación por el equipo antes de usar el plan." checked={form.watch("rules.requires_student_id")} onCheckedChange={v => form.setValue("rules.requires_student_id", v)} />
              </FormSection>
              <FormSection title="Beneficios incluidos">
                <Label htmlFor="guest-passes">Guest pass incluidos</Label><Input id="guest-passes" type="number" min={0} {...form.register("rules.guest_passes")} />
                <Label htmlFor="guest-period">Periodo de guest pass</Label><select id="guest-period" className="w-full rounded-md border border-line bg-surface p-2" {...form.register("rules.guest_pass_period")}><option value="membership">Por vigencia</option><option value="month">Por mes</option></select>
                <Label htmlFor="coffee">Cafés regulares de cortesía por día</Label><Input id="coffee" type="number" min={0} {...form.register("rules.complimentary_coffee_per_day")} />
              </FormSection>
              <FormSection title="Cobro y compromiso">
                <Label htmlFor="billing-period">Periodicidad de pago</Label><select id="billing-period" className="w-full rounded-md border border-line bg-surface p-2" {...form.register("rules.billing_period")}><option value="one_time">Pago único</option><option value="month">Pago mensual</option></select>
                <Label htmlFor="commitment">Compromiso mínimo (meses)</Label><Input id="commitment" type="number" min={0} {...form.register("rules.commitment_months")} />
                <FieldHelp>0 = sin compromiso. El plan anual de HIVE tiene compromiso de 12 meses y precio por mensualidad; la duración indica la vigencia de cada periodo pagado.</FieldHelp>
                <SwitchRow label="Renovación mensual prevista" help="Esta opción describe el plan; no activa cargos automáticos. La suscripción debe contratarse y confirmarse con el proveedor." checked={form.watch("rules.auto_renew")} onCheckedChange={v => form.setValue("rules.auto_renew", v)} />
                <Label htmlFor="payment-url">Enlace de pago regular</Label><Input id="payment-url" type="url" placeholder="https://mpago.la/..." {...form.register("rules.payment_url")} />
                <Label htmlFor="opening-payment-url">Enlace de pago de apertura</Label><Input id="opening-payment-url" type="url" placeholder="https://mpago.la/..." {...form.register("rules.opening_payment_url")} />
                <Label htmlFor="promotion-payment-url">Enlace de pago para descuento propio</Label><Input id="promotion-payment-url" type="url" placeholder="https://mpago.la/..." {...form.register("rules.promotion_payment_url")} />
                <FieldHelp>Enlaces HTTPS del proveedor de pago. Confirma que el importe y la periodicidad coincidan con este plan.</FieldHelp>
              </FormSection>
              <FormSection title="Precios y descuentos">
                <div className="space-y-1">
                  <Label htmlFor="opening-price">Precio de apertura</Label>
                  <Input id="opening-price" type="number" min={0} className="nums" {...form.register("openingPrice")} />
                  <FieldHelp>Precio promocional de venta. Déjalo vacío si no aplica. La promoción se cobra cuando el periodo de apertura del estudio está activo.</FieldHelp>
                </div>
                <Label htmlFor="promotion-mode">Promoción de este plan</Label>
                <select id="promotion-mode" className="w-full rounded-md border border-line bg-surface p-2" {...form.register("rules.promotion_mode")}>
                  <option value="studio">Usar promoción de apertura del estudio</option><option value="disabled">Sin descuento (precio regular)</option><option value="percent">Descuento en porcentaje</option><option value="amount">Descuento en pesos</option><option value="price">Precio promocional fijo</option>
                </select>
                {!["studio", "disabled"].includes(form.watch("rules.promotion_mode")) && <><Label htmlFor="promotion-value">{form.watch("rules.promotion_mode") === "percent" ? "Descuento (%)" : form.watch("rules.promotion_mode") === "amount" ? "Descuento (MXN)" : "Precio promocional (MXN)"}</Label><Input id="promotion-value" type="number" min={0} step="0.01" {...form.register("rules.promotion_value")} />
                  <p role="status" className="font-semibold">Precio de venta: {formatMXN(Math.max(0, form.watch("rules.promotion_mode") === "price" ? Number(form.watch("rules.promotion_value") ?? 0) : Number(form.watch("price")) - (form.watch("rules.promotion_mode") === "percent" ? Number(form.watch("price")) * Number(form.watch("rules.promotion_value") ?? 0) / 100 : Number(form.watch("rules.promotion_value") ?? 0))))}</p></>}
                <FieldHelp>Los descuentos propios se aplican al precio regular y no se suman al de apertura. Guarda para actualizar el precio mostrado y cobrado a nuevas compras. En suscripciones con enlace fijo, un precio distinto requiere configurar el enlace de pago para descuento propio en Mercado Pago; mientras tanto se puede pagar en el estudio o por transferencia.</FieldHelp>
              </FormSection>
              <FormSection title="Avanzado">
                <SwitchRow
                  label="Paquete de visitas (invitadas)"
                  help="Para venderlo a invitadas no socias desde el POS o el roster. El cuestionario inicial se les pide una sola vez."
                  checked={form.watch("isVisitPack")}
                  onCheckedChange={(v) => form.setValue("isVisitPack", v)}
                />
                {form.watch("isNonRepeatable") && (
                  <div className="space-y-1">
                    <Label>Clave de repetición (grupo)</Label>
                    <Input placeholder="ej. trial_single_session" {...form.register("repeatKey")} />
                    <FieldHelp>
                      Agrupa planes que comparten el límite de una vez por usuario. Si dos planes tienen la misma clave, comprar uno bloquea el otro. Puedes dejarlo vacío.
                    </FieldHelp>
                  </div>
                )}

              </FormSection>

              {Object.keys(form.formState.errors).length > 0 && <div role="alert" className="space-y-1 text-sm text-destructive"><p>Revisa los campos: usa importes no negativos, límites enteros positivos, días y horarios válidos, enlaces HTTPS y pago mensual para renovación o compromiso.</p>{Object.values(form.formState.errors.rules ?? {}).map((error, index) => error && typeof error === "object" && "message" in error ? <p key={index}>{String(error.message)}</p> : null)}</div>}
              <SheetFooter className="gap-2 border-t border-line pt-4">
                <Button type="button" variant="outline" onClick={closeSheet}>Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editing ? "Guardar cambios" : "Crear plan"}
                </Button>
              </SheetFooter>
            </form>
          </SheetContent>
        </Sheet>
      </AdminLayout>
    </AuthGuard>
  );
};

export default PlansList;
