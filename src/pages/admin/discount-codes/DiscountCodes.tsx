import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { EmptyState, ErrorState } from "@/components/app/AppShell";
import { formatDate, formatMXN } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Plus, TicketPercent } from "lucide-react";

const nullableInt = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : Number(v)),
  z.number().int().positive().nullable(),
);

// Taxonomía única (la misma que valida el server: all/studio/reformer_tower/mixto).
const CODE_CATEGORIES = ["all", "studio", "reformer_tower", "mixto"] as const;
type CodeCategory = (typeof CODE_CATEGORIES)[number];

const CATEGORY_LABELS: Record<CodeCategory, string> = {
  all: "General (all)",
  studio: "Studio",
  reformer_tower: "Reformer/Tower",
  mixto: "Mixto",
};

const codeSchema = z.object({
  code: z.string().trim().min(1, "Código requerido"),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.coerce.number().min(0.01, "Valor inválido"),
  minOrderAmount: z.coerce.number().min(0).default(0),
  maxUses: nullableInt,
  planId: z.string().optional(),
  classCategory: z.enum(CODE_CATEGORIES).optional(),
  channel: z.enum(["all", "membership", "pos", "event"]).default("all"),
  expiresAt: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CodeFormData = z.infer<typeof codeSchema>;
interface DiscountCode extends CodeFormData {
  id: string;
  usesCount: number;
  planName?: string | null;
}

function normalizeType(type: unknown): "percent" | "fixed" {
  const value = String(type ?? "").toLowerCase();
  return value === "fixed" ? "fixed" : "percent";
}

function normalizeCategory(raw: unknown): CodeCategory | undefined {
  const value = String(raw ?? "").toLowerCase();
  return (CODE_CATEGORIES as readonly string[]).includes(value) ? (value as CodeCategory) : undefined;
}

function normalizeCode(row: any): DiscountCode {
  return {
    id: row.id,
    code: String(row.code ?? ""),
    discountType: normalizeType(row.discountType ?? row.discount_type),
    discountValue: Number(row.discountValue ?? row.discount_value ?? 0),
    minOrderAmount: Number(row.minOrderAmount ?? row.min_order_amount ?? 0),
    maxUses: row.maxUses ?? row.max_uses ?? null,
    planId: row.planId ?? row.plan_id ?? undefined,
    classCategory: normalizeCategory(row.classCategory ?? row.class_category),
    channel: (row.channel ?? "all") as "all" | "membership" | "pos" | "event",
    planName: row.planName ?? row.plan_name ?? null,
    expiresAt: row.expiresAt ?? row.expires_at ?? "",
    isActive: Boolean(row.isActive ?? row.is_active ?? true),
    usesCount: Number(row.usesCount ?? row.uses_count ?? 0),
  };
}

const CHANNEL_LABELS: Record<string, string> = {
  membership: "Membresías",
  pos: "POS",
  event: "Eventos",
  all: "Todos",
};

const DiscountCodes = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountCode | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<{ data: any[] }>({
    queryKey: ["discount-codes"],
    queryFn: async () => (await api.get("/discount-codes")).data,
  });
  const codes = Array.isArray(data?.data) ? data.data.map(normalizeCode) : [];

  const { data: plansData } = useQuery<{ data: { id: string; name: string }[] }>({
    queryKey: ["plans"],
    queryFn: async () => (await api.get("/plans")).data,
  });
  const plans = Array.isArray(plansData?.data) ? plansData.data : [];

  const form = useForm<CodeFormData>({
    resolver: zodResolver(codeSchema),
    defaultValues: {
      discountType: "percent",
      isActive: true,
      maxUses: null,
      minOrderAmount: 0,
      planId: undefined,
      classCategory: undefined,
      channel: "all",
    },
  });

  const serialize = (d: CodeFormData) => ({
    ...d,
    code: d.code.toUpperCase().trim(),
    planId: d.planId || null,
    classCategory: d.classCategory || null,
    channel: d.channel || "all",
    expiresAt: d.expiresAt || null,
    maxUses: d.maxUses ?? null,
  });

  const createMutation = useMutation({
    mutationFn: (d: CodeFormData) => api.post("/discount-codes", serialize(d)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-codes"] });
      toast({ title: "Código creado" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al crear código", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (d: DiscountCode) => api.put(`/discount-codes/${d.id}`, serialize({
      code: d.code,
      discountType: d.discountType,
      discountValue: d.discountValue,
      minOrderAmount: d.minOrderAmount ?? 0,
      maxUses: d.maxUses ?? null,
      planId: d.planId ?? undefined,
      classCategory: d.classCategory ?? undefined,
      channel: d.channel ?? "all",
      expiresAt: d.expiresAt ?? "",
      isActive: d.isActive,
    })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discount-codes"] });
      toast({ title: "Código actualizado" });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar código", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/discount-codes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["discount-codes"] }); toast({ title: "Código eliminado" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al eliminar código", variant: "destructive" }),
  });

  const requestDelete = async (c: DiscountCode) => {
    const ok = await confirm({
      title: `¿Eliminar el código ${c.code}?`,
      description: "Deja de funcionar de inmediato para compras nuevas. Las compras donde ya se aplicó no cambian.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(c.id);
  };

  const openEdit = (c: DiscountCode) => {
    form.reset({
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderAmount: c.minOrderAmount ?? 0,
      maxUses: c.maxUses ?? null,
      planId: c.planId ?? undefined,
      classCategory: c.classCategory ?? undefined,
      channel: c.channel ?? "all",
      expiresAt: c.expiresAt ?? "",
      isActive: c.isActive,
    });
    setEditing(c);
    setOpen(true);
  };

  const openCreate = () => {
    form.reset({
      code: "",
      discountType: "percent",
      discountValue: 0,
      minOrderAmount: 0,
      isActive: true,
      maxUses: null,
      expiresAt: "",
      planId: undefined,
      classCategory: undefined,
      channel: "all",
    });
    setEditing(null);
    setOpen(true);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AuthGuard>
      <AdminLayout>
        {dialog}
        <div className="admin-page max-w-5xl">
          <SectionTabs
            tabs={[
              { label: "Reportes", to: "/admin/reports" },
              { label: "Lealtad", to: "/admin/loyalty" },
              { label: "Descuentos", to: "/admin/discount-codes" },
            ]}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h1 className="admin-title font-semibold text-alma-ink">Códigos de descuento</h1>
            <Button size="sm" onClick={openCreate}><Plus size={14} className="mr-1" />Nuevo código</Button>
          </div>

          {isError ? (
            <ErrorState
              description="No pudimos cargar los códigos de descuento. Revisa tu conexión y vuelve a intentarlo."
              onRetry={() => refetch()}
            />
          ) : !isLoading && codes.length === 0 ? (
            <div className="rounded-xl border border-alma-hairline bg-alma-mist px-6">
              <EmptyState
                icon={<TicketPercent size={20} strokeWidth={1.8} />}
                title="Aún no hay códigos de descuento"
                description="Son cupones que las clientas escriben al pagar: aplican un porcentaje o un monto fijo. Puedes limitarlos por plan, categoría, canal, número de usos o fecha."
                ctaLabel="Crear el primer código"
                onCta={openCreate}
              />
            </div>
          ) : (
            <div className="rounded-xl border border-alma-hairline bg-alma-mist overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descuento</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Aplica a</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Vence</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array(4).fill(0).map((_, i) => (
                      <TableRow key={i}>{Array(8).fill(0).map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}</TableRow>
                    ))
                    : codes.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono font-bold text-alma-ink">{c.code}</TableCell>
                        <TableCell className="nums text-alma-ink">
                          {c.discountType === "percent" ? `${c.discountValue}%` : formatMXN(c.discountValue)}
                        </TableCell>
                        <TableCell className="text-sm text-alma-ink/70">{CHANNEL_LABELS[c.channel] ?? "Todos"}</TableCell>
                        <TableCell className="text-sm text-alma-ink/70">
                          {c.planName
                            ? c.planName
                            : c.classCategory
                              ? `Categoría ${CATEGORY_LABELS[c.classCategory]}`
                              : "Todos los planes"}
                        </TableCell>
                        <TableCell className="nums text-alma-ink/70">{c.usesCount}/{c.maxUses ?? "∞"}</TableCell>
                        <TableCell className="nums text-sm text-alma-ink/70">{c.expiresAt ? formatDate(c.expiresAt) : "—"}</TableCell>
                        <TableCell><Badge variant={c.isActive ? "default" : "secondary"}>{c.isActive ? "Activo" : "Inactivo"}</Badge></TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal size={14} /></Button></DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => openEdit(c)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => requestDelete(c)}>Eliminar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setEditing(null);
          }}
        >
          <DialogContent className="max-w-md border-alma-hairline bg-alma-canvas">
            <DialogHeader>
              <DialogTitle className="font-display text-alma-ink">{editing ? "Editar código" : "Nuevo código"}</DialogTitle>
            </DialogHeader>
            <form
              noValidate
              onSubmit={form.handleSubmit((d) => editing
                ? updateMutation.mutate({ ...editing, ...d })
                : createMutation.mutate(d))}
              className="space-y-4"
            >
              <div className="space-y-1"><Label>Código</Label><Input {...form.register("code")} className="uppercase font-mono" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <Select value={form.watch("discountType")} onValueChange={(v) => form.setValue("discountType", v as "percent" | "fixed")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Porcentaje</SelectItem>
                      <SelectItem value="fixed">Monto fijo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Valor</Label><Input type="number" className="nums" {...form.register("discountValue")} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Compra mínima</Label><Input type="number" className="nums" {...form.register("minOrderAmount")} /></div>
                <div className="space-y-1"><Label>Máx. usos (vacío = ∞)</Label><Input type="number" className="nums" {...form.register("maxUses")} /></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Canal</Label>
                  <Select value={form.watch("channel")} onValueChange={(v) => form.setValue("channel", v as CodeFormData["channel"])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="membership">Membresías</SelectItem>
                      <SelectItem value="pos">POS</SelectItem>
                      <SelectItem value="event">Eventos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Categoría de clase</Label>
                  <Select value={form.watch("classCategory") ?? "none"} onValueChange={(v) => form.setValue("classCategory", v === "none" ? undefined : (v as CodeCategory))}>
                    <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Todas</SelectItem>
                      <SelectItem value="studio">Studio</SelectItem>
                      <SelectItem value="reformer_tower">Reformer/Tower</SelectItem>
                      <SelectItem value="mixto">Mixto</SelectItem>
                      <SelectItem value="all">General (all)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Plan específico (opcional)</Label>
                <Select value={form.watch("planId") ?? "all"} onValueChange={(v) => form.setValue("planId", v === "all" ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Todos los planes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los planes</SelectItem>
                    {plans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Fecha de expiración</Label><Input type="datetime-local" className="nums" {...form.register("expiresAt")} /></div>
              <div className="flex items-center gap-3"><Switch checked={form.watch("isActive")} onCheckedChange={(v) => form.setValue("isActive", v)} /><Label>Activo</Label></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? "Guardando..." : editing ? "Actualizar" : "Crear"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default DiscountCodes;
