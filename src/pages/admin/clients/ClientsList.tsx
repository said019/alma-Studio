import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import SectionTabs from "@/components/admin/SectionTabs";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState } from "@/components/app/AppShell";
import { formatMXN, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { MoreHorizontal, Search, SearchX, UserPlus, UsersRound, CreditCard, Banknote, Building2, type LucideProps } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";

// ── Schemas ────────────────────────────────────────────────────────────────────
const editSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  displayName: z.string().min(1),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  acceptsCommunications: z.boolean().default(true),
});

const manualSchema = z.object({
  displayName: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
  planId: z.string().optional(),
  paymentMethod: z.enum(["cash", "card", "transfer"]).optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
  discountCode: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;
type ManualFormData = z.infer<typeof manualSchema>;

interface Client extends EditFormData {
  id: string;
  role: string;
  createdAt?: string;
}

interface Plan { id: string; name: string; price: number; category: string; }

// ── Payment method selector ────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash",     label: "Efectivo",     Icon: Banknote },
  { value: "card",     label: "Tarjeta",      Icon: CreditCard },
  { value: "transfer", label: "Transferencia",Icon: Building2 },
] as const;

// ── Clases compartidas de campos (tema claro nativo) ──────────────────────────
const fieldCls = "bg-alma-canvas border-alma-sandstone/60 text-alma-ink placeholder:text-alma-ink/40";
const outlineBtnCls = "border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-mist hover:text-alma-ink";
const primaryBtnCls = "bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink";

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-alma-berry mb-3">{children}</p>
);

const EmptyBlock = ({ Icon, title, description, action }: {
  Icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 py-14 text-center px-6">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-alma-oat text-alma-berry">
      <Icon size={20} strokeWidth={1.8} />
    </span>
    <div>
      <p className="font-display text-lg text-alma-ink">{title}</p>
      <p className="text-sm text-alma-ink/55 mt-1 max-w-[44ch]">{description}</p>
    </div>
    {action}
  </div>
);

// ── Main component ─────────────────────────────────────────────────────────────
const ClientsList = () => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();

  // Edit sheet
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing]   = useState<Client | null>(null);
  // Manual registration sheet
  const [manualOpen, setManualOpen] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Clients list
  const { data, isLoading, isError, refetch } = useQuery<{ data: Client[] }>({
    queryKey: ["clients", debouncedSearch],
    queryFn: async () => (await api.get(`/users?role=client&search=${debouncedSearch}`)).data,
  });
  const clients = Array.isArray(data?.data) ? data.data : [];

  const filteredClients = clients;

  // Plans for the manual sheet
  const { data: plansData, isError: plansError, refetch: refetchPlans } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans-active"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
    staleTime: 60_000,
  });
  const plans: Plan[] = Array.isArray(plansData?.data) ? plansData.data : [];

  // ── Edit form ──────────────────────────────────────────────────────────────
  const editForm = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: Client) => api.put(`/users/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Clienta actualizada" });
      setEditOpen(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Clienta eliminada" });
    },
  });

  const openEdit = (c: Client) => { editForm.reset(c); setEditing(c); setEditOpen(true); };
  const onEditSubmit = (d: EditFormData) => {
    if (editing) updateMutation.mutate({ ...d, id: editing.id, role: "client" });
  };

  const askDelete = async (c: Client) => {
    const ok = await confirm({
      title: `¿Eliminar a ${c.displayName}?`,
      description: "Se borra su cuenta y su acceso al estudio. Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar clienta",
      destructive: true,
    });
    if (ok) deleteMutation.mutate(c.id);
  };

  // ── Manual registration form ───────────────────────────────────────────────
  const manualForm = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { startDate: format(new Date(), "yyyy-MM-dd") },
  });
  const selectedPlanId = manualForm.watch("planId");
  const selectedPlan   = plans.find((p) => p.id === selectedPlanId);
  const paymentMethod  = manualForm.watch("paymentMethod");

  const manualMutation = useMutation({
    mutationFn: (d: ManualFormData) => api.post("/admin/clients/manual", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      const msg = res.data?.data?.membershipId
        ? "Clienta registrada y membresía activada"
        : "Clienta registrada";
      toast({ title: msg });
      setManualOpen(false);
      manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") });
    },
    onError: (err: any) => {
      toast({
        title: "Error al registrar",
        description: err?.response?.data?.error ?? "Revisa los datos e intenta de nuevo",
        variant: "destructive",
      });
    },
  });

  const onManualSubmit = (d: ManualFormData) => manualMutation.mutate(d);

  const hasPlanSelected = !!selectedPlanId && selectedPlanId !== "none";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-6xl">
          <SectionTabs
            tabs={[
              { label: "Clientas", to: "/admin/clients" },
              { label: "Visitas", to: "/admin/visitas" },
            ]}
          />
          {/* Header */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
            <div>
              <h1 className="admin-title font-display text-alma-ink mb-1">Clientas</h1>
              <p className="text-sm text-alma-ink/55">
                <span className="nums">{clients.length}</span> clientas registradas
              </p>
            </div>
            <Button onClick={() => setManualOpen(true)} className={cn(primaryBtnCls, "gap-2 rounded-xl")}>
              <UserPlus size={15} /> Nueva clienta
            </Button>
          </div>

          {/* Search */}
          <div className="relative mb-5 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-alma-ink/40" />
            <Input
              className={cn(fieldCls, "pl-8")}
              placeholder="Buscar clienta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-alma-hairline overflow-hidden bg-alma-canvas">
            {isError ? (
              <div className="px-6">
                <ErrorState
                  title="No pudimos cargar a las clientas"
                  onRetry={() => refetch()}
                />
              </div>
            ) : !isLoading && filteredClients.length === 0 ? (
              search.trim() ? (
                <EmptyBlock
                  Icon={SearchX}
                  title="No encontramos a nadie con ese nombre"
                  description="Revisa la escritura o intenta con el email o el teléfono."
                  action={
                    <Button variant="outline" size="sm" className={outlineBtnCls} onClick={() => setSearch("")}>
                      Limpiar búsqueda
                    </Button>
                  }
                />
              ) : (
                <EmptyBlock
                  Icon={UsersRound}
                  title="Aún no hay clientas registradas"
                  description="Registra a tu primera clienta para llevar su expediente, membresías y reservas."
                  action={
                    <Button size="sm" className={cn(primaryBtnCls, "gap-2")} onClick={() => setManualOpen(true)}>
                      <UserPlus size={14} /> Nueva clienta
                    </Button>
                  }
                />
              )
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-alma-hairline hover:bg-transparent">
                    <TableHead className="text-alma-ink/55 font-semibold text-xs uppercase tracking-wider">Nombre</TableHead>
                    <TableHead className="text-alma-ink/55 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-alma-ink/55 font-semibold text-xs uppercase tracking-wider">Teléfono</TableHead>
                    <TableHead className="text-alma-ink/55 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Clienta desde</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array(5).fill(0).map((_, i) => (
                      <TableRow key={i} className="border-alma-hairline hover:bg-transparent">
                        {Array(5).fill(0).map((_, j) => (
                          <TableCell key={j} className={cn(j === 1 && "hidden md:table-cell", j === 3 && "hidden lg:table-cell")}>
                            <Skeleton className="h-4 w-full bg-alma-oat/60" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                    : filteredClients.map((c) => (
                      <TableRow
                        key={c.id}
                        onClick={() => navigate(`/admin/clients/${c.id}`)}
                        className="border-alma-hairline cursor-pointer transition-colors hover:bg-alma-mist"
                      >
                        <TableCell className="font-semibold text-alma-ink">
                          <span>{c.displayName}</span>
                        </TableCell>
                        <TableCell className="text-sm text-alma-ink/60 hidden md:table-cell">{c.email}</TableCell>
                        <TableCell className="text-sm text-alma-ink/60 nums">{c.phone ?? "—"}</TableCell>
                        <TableCell className="text-sm text-alma-ink/60 nums hidden lg:table-cell">
                          {c.createdAt ? formatDate(c.createdAt) : "—"}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-alma-ink/45 hover:text-alma-ink hover:bg-alma-oat/60">
                                  <MoreHorizontal size={14} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-alma-canvas border-alma-hairline">
                                <DropdownMenuItem
                                  className="text-alma-ink/80 focus:text-alma-ink focus:bg-alma-mist"
                                  onClick={() => openEdit(c)}
                                >
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive focus:bg-destructive/10"
                                  onClick={() => askDelete(c)}
                                >
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>

        {/* ── Edit sheet ───────────────────────────────────────────────────── */}
        <Sheet open={editOpen} onOpenChange={setEditOpen}>
          <SheetContent className="w-full sm:max-w-md overflow-y-auto bg-alma-canvas border-alma-hairline text-alma-ink">
            <SheetHeader>
              <SheetTitle className="font-display text-xl text-alma-ink">Editar clienta</SheetTitle>
              <SheetDescription className="text-alma-ink/55">
                Actualiza los datos del expediente de {editing?.displayName ?? "la clienta"}.
              </SheetDescription>
            </SheetHeader>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="mt-6 space-y-6">
              <div>
                <SectionLabel>Datos</SectionLabel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Nombre</Label>
                    <Input className={fieldCls} {...editForm.register("displayName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Fecha de nacimiento</Label>
                    <DatePicker value={editForm.watch("dateOfBirth")} onChange={(v) => editForm.setValue("dateOfBirth", v)} />
                  </div>
                </div>
              </div>

              <div className="border-t border-alma-hairline pt-5">
                <SectionLabel>Contacto</SectionLabel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Email</Label>
                    <Input type="email" className={fieldCls} {...editForm.register("email")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Teléfono</Label>
                    <Input className={fieldCls} {...editForm.register("phone")} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-alma-ink/70 text-xs">Contacto de emergencia</Label>
                      <Input className={fieldCls} placeholder="Nombre" {...editForm.register("emergencyContactName")} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-alma-ink/70 text-xs">Teléfono emergencia</Label>
                      <Input className={fieldCls} {...editForm.register("emergencyContactPhone")} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-alma-hairline pt-5">
                <SectionLabel>Salud</SectionLabel>
                <div className="space-y-1">
                  <Label className="text-alma-ink/70 text-xs">Notas de salud</Label>
                  <Input className={fieldCls} placeholder="Lesiones, condiciones..." {...editForm.register("healthNotes")} />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-alma-hairline pt-4">
                <Button type="button" variant="outline" className={outlineBtnCls} onClick={() => setEditOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} className={primaryBtnCls}>
                  {updateMutation.isPending ? "Guardando…" : "Actualizar"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>

        {/* ── Manual registration sheet ────────────────────────────────────── */}
        <Sheet open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") }); }}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-alma-canvas border-alma-hairline text-alma-ink">
            <SheetHeader>
              <SheetTitle className="font-display text-xl text-alma-ink flex items-center gap-2">
                <UserPlus size={18} className="text-alma-berry" />
                Nueva clienta
              </SheetTitle>
              <SheetDescription className="text-alma-ink/55">
                Registro manual. La clienta recibe su contraseña por email.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="mt-6 space-y-6">
              {/* Datos */}
              <div>
                <SectionLabel>Datos</SectionLabel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Nombre completo *</Label>
                    <Input className={fieldCls} placeholder="Ana García" {...manualForm.register("displayName")} />
                    {manualForm.formState.errors.displayName && (
                      <p className="text-xs text-destructive">{manualForm.formState.errors.displayName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Fecha de nacimiento</Label>
                    <DatePicker value={manualForm.watch("dateOfBirth")} onChange={(v) => manualForm.setValue("dateOfBirth", v)} />
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div className="border-t border-alma-hairline pt-5">
                <SectionLabel>Contacto</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Email *</Label>
                    <Input type="email" className={fieldCls} placeholder="ana@email.com" {...manualForm.register("email")} />
                    {manualForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{manualForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Teléfono</Label>
                    <Input className={fieldCls} placeholder="55 1234 5678" {...manualForm.register("phone")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Contacto de emergencia</Label>
                    <Input className={fieldCls} placeholder="Nombre" {...manualForm.register("emergencyContactName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Teléfono emergencia</Label>
                    <Input className={fieldCls} {...manualForm.register("emergencyContactPhone")} />
                  </div>
                </div>
              </div>

              {/* Salud */}
              <div className="border-t border-alma-hairline pt-5">
                <SectionLabel>Salud</SectionLabel>
                <div className="space-y-1">
                  <Label className="text-alma-ink/70 text-xs">Notas de salud</Label>
                  <Input className={fieldCls} placeholder="Lesiones, condiciones..." {...manualForm.register("healthNotes")} />
                </div>
              </div>

              {/* Membresía (opcional) */}
              <div className="border-t border-alma-hairline pt-5">
                <SectionLabel>Membresía (opcional)</SectionLabel>
                {plansError ? (
                  <ErrorState
                    title="No pudimos cargar los planes"
                    description="Puedes registrar a la clienta sin plan y asignarlo después, o reintentar."
                    onRetry={() => refetchPlans()}
                  />
                ) : (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-alma-ink/70 text-xs">Plan</Label>
                    <Select
                      value={selectedPlanId ?? "none"}
                      onValueChange={(v) => manualForm.setValue("planId", v === "none" ? undefined : v)}
                    >
                      <SelectTrigger className={fieldCls}>
                        <SelectValue placeholder="Sin plan (solo crear cuenta)" />
                      </SelectTrigger>
                      <SelectContent className="bg-alma-canvas border-alma-hairline text-alma-ink">
                        <SelectItem value="none" className="text-alma-ink/60 focus:bg-alma-mist">Sin plan</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-alma-ink focus:bg-alma-mist">
                            {p.name}
                            {p.price > 0 && (
                              <span className="ml-2 text-alma-ink/50 nums">{formatMXN(p.price)}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show price of selected plan */}
                  {selectedPlan && (
                    <div className="flex items-center justify-between rounded-xl border border-alma-sandstone/60 bg-alma-oat/50 px-4 py-2.5">
                      <span className="text-sm text-alma-ink/70">{selectedPlan.name}</span>
                      <span className="text-lg font-semibold text-alma-ink nums">{formatMXN(selectedPlan.price)}</span>
                    </div>
                  )}

                  {/* Payment method — only if plan selected */}
                  {hasPlanSelected && (
                    <div className="space-y-1">
                      <Label className="text-alma-ink/70 text-xs">Método de pago</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PAYMENT_METHODS.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => manualForm.setValue("paymentMethod", value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors",
                              paymentMethod === value
                                ? "border-alma-sandstone bg-alma-oat text-alma-ink"
                                : "border-alma-hairline bg-alma-mist text-alma-ink/55 hover:border-alma-sandstone hover:text-alma-ink"
                            )}
                          >
                            <Icon size={16} />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Start date — only if plan selected */}
                  {hasPlanSelected && (
                    <div className="space-y-1">
                      <Label className="text-alma-ink/70 text-xs">Fecha de inicio</Label>
                      <DatePicker value={manualForm.watch("startDate")} onChange={(v) => manualForm.setValue("startDate", v)} />
                    </div>
                  )}

                  {/* Discount code — only if plan selected */}
                  {hasPlanSelected && (
                    <div className="space-y-1">
                      <Label className="text-alma-ink/70 text-xs">Cupón de descuento (opcional)</Label>
                      <Input
                        className={cn(fieldCls, "uppercase")}
                        placeholder="Ej: ONLINE75"
                        {...manualForm.register("discountCode")}
                      />
                      <p className="text-xs text-alma-ink/50">Se valida contra el plan elegido y queda anotado en la membresía.</p>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Internal notes */}
              <div className="border-t border-alma-hairline pt-5 space-y-1">
                <Label className="text-alma-ink/70 text-xs">Notas internas</Label>
                <Input className={fieldCls} placeholder="Referida por, observaciones..." {...manualForm.register("notes")} />
              </div>

              <div className="flex justify-end gap-2 border-t border-alma-hairline pt-4">
                <Button type="button" variant="outline" className={outlineBtnCls} onClick={() => setManualOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={manualMutation.isPending} className={cn(primaryBtnCls, "min-w-[140px]")}>
                  {manualMutation.isPending ? "Registrando…" : hasPlanSelected ? "Registrar + activar plan" : "Registrar clienta"}
                </Button>
              </div>
            </form>
          </SheetContent>
        </Sheet>

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientsList;
