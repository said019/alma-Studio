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
  { value: "reformer_tower", label: "Reformer/Tower" },
  { value: "mixto",          label: "Mixto" },
  { value: "all",            label: "Todo (all)" },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]["value"];

// RIESGO: el borrado en cascada se decide comparando el NOMBRE EXACTO del plan.
// Si alguien renombra este plan en la base de datos, el caso especial deja de
// aplicar (o aplicaría a otro plan que se llame igual) y el ?cascade=true borra
// membresías, órdenes y códigos de descuento ligados al plan en el servidor.
// No cambiar este string sin coordinar con server/index.js (DELETE /api/plans/:id).
const CASCADE_DELETE_PLAN_NAME = "Sesión Extra (Socias o Inscritas)";

const planSchema = z.object({
  name: z.string().min(1, "Nombre requerido"),
  description: z.string().optional(),
  price: z.coerce.number().min(0),
  currency: z.string().default("MXN"),
  durationDays: z.coerce.number().min(1),
  classLimit: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().nullable()),
  classCategory: z.enum(["studio", "reformer_tower", "mixto", "all"]).default("studio"),
  openingPrice: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().nullable()),
  morningOnly: z.boolean().default(false),
  features: z.string().optional(),
  isActive: z.boolean().default(true),
  isNonTransferable: z.boolean().default(false),
  isNonRepeatable: z.boolean().default(false),
  repeatKey: z.string().optional(),
  sortOrder: z.coerce.number().default(0),
  isVisitPack: z.boolean().default(false),
});

type PlanFormData = z.infer<typeof planSchema>;

interface Plan extends PlanFormData {
  id: string;
}

function normalizePlanRow(row: any): Plan {
  return {
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
    features: Array.isArray(row?.features)
      ? row.features.join(", ")
      : String(row?.features ?? ""),
    isActive: Boolean(row?.isActive ?? row?.is_active ?? true),
    isNonTransferable: Boolean(row?.isNonTransferable ?? row?.is_non_transferable ?? false),
    isNonRepeatable: Boolean(row?.isNonRepeatable ?? row?.is_non_repeatable ?? false),
    repeatKey: String(row?.repeatKey ?? row?.repeat_key ?? ""),
    sortOrder: Number(row?.sortOrder ?? row?.sort_order ?? 0),
    isVisitPack: Boolean(row?.isVisitPack ?? row?.is_visit_pack ?? false),
  };
}

const EMPTY: PlanFormData = {
  name: "", description: "", price: 0, currency: "MXN",
  durationDays: 30, classLimit: null, classCategory: "studio",
  openingPrice: null, morningOnly: false,
  features: "", isActive: true, isNonTransferable: false, isNonRepeatable: false, repeatKey: "",
  sortOrder: 0,
  isVisitPack: false,
};

function serializePlan(d: PlanFormData) {
  return {
    ...d,
    repeatKey: d.isNonRepeatable ? (d.repeatKey?.trim() || null) : null,
    opening_price: d.openingPrice,
    morning_only: !!d.morningOnly,
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
    <p className="border-b border-line pb-2 text-[0.72rem] font-medium uppercase tracking-[0.18em] text-ink">
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
    <Switch checked={checked} onCheckedChange={onCheckedChange} />
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
        {p.openingPrice != null && <span className="nums text-[0.75rem] font-bold text-ink-muted">Apertura {formatMXN(Number(p.openingPrice))}</span>}
      </div>
      <p className="text-[13px] text-ink-muted">
        {p.classLimit == null ? "Ilimitado" : `${p.classLimit} ${p.classLimit === 1 ? "clase" : "clases"}`} · {p.durationDays} días
      </p>
      <div className="flex min-h-[24px] flex-wrap gap-1.5">
        {rules.map((r) => <span key={r} className="rounded-full border border-line px-2.5 py-0.5 text-[0.75rem] font-bold text-ink-muted">{r}</span>)}
      </div>
      <div className="border-t border-line pt-2.5">
        {p.isActive ? <StatusDot tone="success">Activo</StatusDot> : <StatusDot tone="muted">Inactivo</StatusDot>}
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); toast({ title: "Plan creado" }); closeSheet(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Plan) => api.put(`/plans/${id}`, serializePlan(d)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["plans"] }); toast({ title: "Plan actualizado" }); closeSheet(); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, cascade }: { id: string; cascade?: boolean }) =>
      api.delete(`/plans/${id}${cascade ? "?cascade=true" : ""}`),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      const msg = res?.data?.message ?? "Plan eliminado";
      toast({ title: msg });
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
    const isCascade = p.name === CASCADE_DELETE_PLAN_NAME;
    const ok = await confirm({
      title: `¿Eliminar "${p.name}"?`,
      description: isCascade
        ? "Se eliminan también todas las membresías, órdenes y códigos de descuento ligados a este plan. Esta acción no se puede deshacer."
        : "El plan desaparece del catálogo. Si tiene membresías o ventas asociadas, se desactivará en lugar de borrarse.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate({ id: p.id, cascade: isCascade });
  };

  return (
    <AuthGuard>
      <AdminLayout>
        {dialog}
        <AdminPage>
          <AdminPageHeader
            kicker="Más"
            title="Planes"
            subtitle="Los paquetes que vendes. Los cambios aplican a ventas nuevas; lo ya vendido no se toca."
            actions={<Button onClick={openCreate}><Plus size={16} aria-hidden="true" />Nuevo plan</Button>}
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
                {editing ? "Los cambios aplican a ventas nuevas; las membresías ya vendidas no se tocan." : "Define qué incluye el paquete y cómo se vende."}
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-8 pb-4">
              <FormSection title="Esencial">
                <div className="space-y-1">
                  <Label>Nombre</Label>
                  <Input {...form.register("name")} />
                  {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Descripción</Label>
                  <Input {...form.register("description")} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Precio (MXN)</Label>
                    <Input type="number" className="nums" {...form.register("price")} />
                  </div>
                  <div className="space-y-1">
                    <Label>Duración (días)</Label>
                    <Input type="number" className="nums" {...form.register("durationDays")} />
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
                  <Label>Beneficios (separados por coma)</Label>
                  <Input {...form.register("features")} />
                  <FieldHelp>Se muestran como lista del plan en la página de precios.</FieldHelp>
                </div>
                <SwitchRow
                  label="Activo"
                  help="Solo los planes activos aparecen a la venta."
                  checked={form.watch("isActive")}
                  onCheckedChange={(v) => form.setValue("isActive", v)}
                />
              </FormSection>

              <FormSection title="Reglas">
                <div className="space-y-1">
                  <Label>Límite de clases</Label>
                  <Input type="number" className="nums" placeholder="Vacío = ilimitado" {...form.register("classLimit")} />
                  <FieldHelp>Cuántas clases incluye durante la vigencia. Déjalo vacío para clases ilimitadas.</FieldHelp>
                </div>
                <SwitchRow
                  label="No transferible"
                  help="Solo la titular puede usar las clases de este plan."
                  checked={form.watch("isNonTransferable")}
                  onCheckedChange={(v) => form.setValue("isNonTransferable", v)}
                />
                <SwitchRow
                  label="No repetible"
                  help="Cada clienta puede comprar este plan una sola vez."
                  checked={form.watch("isNonRepeatable")}
                  onCheckedChange={(v) => form.setValue("isNonRepeatable", v)}
                />
                <SwitchRow
                  label="Solo horario matutino (AM Club)"
                  help="Solo permite reservar clases que empiezan a las 10:00 am o antes."
                  checked={form.watch("morningOnly")}
                  onCheckedChange={(v) => form.setValue("morningOnly", v)}
                />
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
                      Agrupa planes que comparten el límite de una vez por clienta. Si dos planes tienen la misma clave, comprar uno bloquea el otro. Puedes dejarlo vacío.
                    </FieldHelp>
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Precio de apertura</Label>
                  <Input type="number" min={0} className="nums" {...form.register("openingPrice")} />
                  <FieldHelp>Precio promocional que se muestra en la página de precios. Déjalo vacío si no aplica.</FieldHelp>
                </div>
              </FormSection>

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
