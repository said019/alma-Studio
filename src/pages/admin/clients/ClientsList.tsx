import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import PersonCell from "@/components/admin/PersonCell";
import ClientEditSheet from "@/components/admin/ClientEditSheet";
import PersonasTabs from "./PersonasTabs";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { waLink } from "@/lib/phone";
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
import { MessageCircle, Cake, MoreHorizontal, Search, SearchX, UserPlus, UsersRound, CreditCard, Banknote, Building2, type LucideProps } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { DatePicker } from "@/components/ui/date-picker";
import { useCanSeeFinance } from "@/lib/roles";

// ── Schemas ────────────────────────────────────────────────────────────────────
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

type ManualFormData = z.infer<typeof manualSchema>;

type Client = { id: string; displayName: string; email?: string | null; phone?: string | null; role?: string; createdAt?: string };

interface Plan { id: string; name: string; price: number; category: string; }

// ── Payment method selector ────────────────────────────────────────────────────
const PAYMENT_METHODS = [
  { value: "cash",     label: "Efectivo",     Icon: Banknote },
  { value: "card",     label: "Tarjeta",      Icon: CreditCard },
  { value: "transfer", label: "Transferencia",Icon: Building2 },
] as const;

// ── Clases compartidas de campos (tema claro nativo) ──────────────────────────
const fieldCls = "bg-canvas border-line-strong/60 text-ink placeholder:text-ink/40";
const outlineBtnCls = "border-line-strong/70 bg-transparent text-ink hover:bg-sunken hover:text-ink";
const primaryBtnCls = "bg-inverse text-canvas hover:bg-ink";

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink mb-3">{children}</p>
);

const EmptyBlock = ({ Icon, title, description, action }: {
  Icon: ComponentType<LucideProps>;
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="flex flex-col items-center gap-3 py-14 text-center px-6">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-sunken text-ink">
      <Icon size={20} strokeWidth={1.8} />
    </span>
    <div>
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="text-sm text-ink/55 mt-1 max-w-[44ch]">{description}</p>
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
  // "Editar" pisa datos que el servidor sólo deja tocar a la dueña
  // (PUT /users/:id rechaza a los demás roles) — spec §8, I3.
  const canSeeFinance = useCanSeeFinance();

  // Edit sheet
  const [editId, setEditId] = useState<string | null>(null);
  // Manual registration sheet
  const [manualOpen, setManualOpen] = useState(false);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Birthdays filter (?birthday=month, enlace desde Inicio)
  const [birthday, setBirthday] = useSearchParamState("birthday");
  const month = new Date().getMonth() + 1;
  const monthName = format(new Date(), "MMMM", { locale: es });
  const birthdaysQ = useQuery<{ data: { id: string; displayName: string; email?: string | null; phone?: string | null; day: number; month: number }[] }>({
    queryKey: ["admin-birthdays", month],
    queryFn: async () => (await api.get(`/admin/birthdays?month=${month}`)).data,
    enabled: birthday === "month",
  });

  // Clients list
  const { data, isLoading, isError, refetch } = useQuery<{ data: Client[] }>({
    queryKey: ["clients", debouncedSearch],
    queryFn: async () => (await api.get(`/users?role=client&search=${encodeURIComponent(debouncedSearch)}`)).data,
  });
  const clients = Array.isArray(data?.data) ? data.data : [];

  const filteredClients = clients;

  const isBirthdayMode = birthday === "month";
  const rows: (Client & { sub?: string })[] = isBirthdayMode
    ? (birthdaysQ.data?.data ?? []).map((b) => ({ id: b.id, displayName: b.displayName, email: b.email, phone: b.phone, sub: `Cumple el ${b.day} de ${monthName}` }))
    : filteredClients;
  // En modo cumpleañeras, la carga/error de `birthdaysQ` es lo que manda: si
  // no se revisa, una petición caída se ve igual que "cero clientas" (I4).
  const listIsLoading = isBirthdayMode ? birthdaysQ.isLoading : isLoading;
  const listIsError = isBirthdayMode ? birthdaysQ.isError : isError;
  const listRefetch = isBirthdayMode ? birthdaysQ.refetch : refetch;

  // Plans for the manual sheet
  const { data: plansData, isError: plansError, refetch: refetchPlans } = useQuery<{ data: Plan[] }>({
    queryKey: ["plans-active"],
    queryFn: async () => (await api.get("/plans?active=true")).data,
    staleTime: 60_000,
  });
  const plans: Plan[] = Array.isArray(plansData?.data) ? plansData.data : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Clienta eliminada" });
    },
    onError: (e: any) =>
      toast({ title: "No se pudo eliminar", description: e?.response?.data?.message ?? "Revisa si tiene membresías o reservas activas.", variant: "destructive" }),
  });

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
        description: err?.response?.data?.message ?? err?.response?.data?.error ?? "Revisa los datos e intenta de nuevo",
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
        <AdminPage>
          <AdminPageHeader
            kicker="Personas"
            title="Clientas"
            actions={
              <>
                <PersonasTabs />
                <Button onClick={() => setManualOpen(true)}>
                  <UserPlus size={16} aria-hidden="true" />
                  Nueva clienta
                </Button>
              </>
            }
          />

          {/* Search */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative w-full max-w-[480px]">
              <Label htmlFor="clients-search" className="sr-only">Buscar por nombre, email o teléfono</Label>
              <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
              <Input id="clients-search" type="search" className="h-12 pl-10" placeholder="Buscar por nombre, email o teléfono" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <span className="text-sm text-ink-muted"><span className="nums font-extrabold text-ink">{clients.length}</span> clientas registradas</span>
          </div>
          {birthday === "month" && (
            <Panel className="flex flex-wrap items-center gap-3 px-5 py-3">
              <Cake size={18} aria-hidden="true" />
              <span className="flex-1 text-sm font-bold">Cumpleañeras de {monthName}</span>
              <Button variant="ghost" onClick={() => setBirthday(null)}>Quitar filtro</Button>
            </Panel>
          )}

          {/* Table */}
          <Panel className="overflow-hidden">
            {listIsError ? (
              <div className="px-6">
                <ErrorState
                  title="No pudimos cargar a las clientas"
                  onRetry={() => listRefetch()}
                />
              </div>
            ) : !listIsLoading && rows.length === 0 ? (
              isBirthdayMode ? (
                <EmptyBlock
                  Icon={Cake}
                  title={`Nadie cumple años en ${monthName}.`}
                  description="Cuando alguien cumpla años este mes, aparecerá aquí."
                />
              ) : search.trim() ? (
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
                  <TableRow className="border-line hover:bg-transparent">
                    <TableHead className="text-ink/55 font-semibold text-xs uppercase tracking-wider">Nombre</TableHead>
                    <TableHead className="text-ink/55 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Email</TableHead>
                    <TableHead className="text-ink/55 font-semibold text-xs uppercase tracking-wider">Teléfono</TableHead>
                    <TableHead className="text-ink/55 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Clienta desde</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listIsLoading
                    ? Array(5).fill(0).map((_, i) => (
                      <TableRow key={i} className="border-line hover:bg-transparent">
                        {Array(5).fill(0).map((_, j) => (
                          <TableCell key={j} className={cn(j === 1 && "hidden md:table-cell", j === 3 && "hidden lg:table-cell")}>
                            <Skeleton className="h-4 w-full bg-sunken/60" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                    : rows.map((c) => (
                      <TableRow
                        key={c.id}
                        onClick={() => navigate(`/admin/clients/${c.id}`)}
                        className="border-line cursor-pointer transition-colors hover:bg-sunken"
                      >
                        <TableCell className="font-semibold text-ink">
                          <PersonCell name={c.displayName} sub={c.sub} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-ink-muted">{c.email}</TableCell>
                        <TableCell className="nums">{c.phone ?? "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-ink-muted">
                          {c.createdAt ? formatDate(c.createdAt) : "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {waLink(c.phone) && (
                              <a
                                href={waLink(c.phone)!}
                                target="_blank"
                                rel="noreferrer"
                                aria-label={`WhatsApp a ${c.displayName}`}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-muted hover:bg-sunken hover:text-ink"
                              >
                                <MessageCircle size={18} />
                              </a>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" aria-label={`Acciones de ${c.displayName}`}>
                                  <MoreHorizontal size={18} />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {canSeeFinance && (
                                  <DropdownMenuItem onClick={() => setEditId(c.id)}>
                                    Editar
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-danger focus:text-danger"
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
          </Panel>
        </AdminPage>

        {/* ── Manual registration sheet ────────────────────────────────────── */}
        <Sheet open={manualOpen} onOpenChange={(v) => { setManualOpen(v); if (!v) manualForm.reset({ startDate: format(new Date(), "yyyy-MM-dd") }); }}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-canvas border-line text-ink">
            <SheetHeader>
              <SheetTitle className="font-display text-xl text-ink flex items-center gap-2">
                <UserPlus size={18} className="text-ink" />
                Nueva clienta
              </SheetTitle>
              <SheetDescription className="text-ink/55">
                Registro manual. La clienta recibe su contraseña por email.
              </SheetDescription>
            </SheetHeader>

            <form onSubmit={manualForm.handleSubmit(onManualSubmit)} className="mt-6 space-y-6">
              {/* Datos */}
              <div>
                <SectionLabel>Datos</SectionLabel>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Nombre completo *</Label>
                    <Input className={fieldCls} placeholder="Ana García" {...manualForm.register("displayName")} />
                    {manualForm.formState.errors.displayName && (
                      <p className="text-xs text-destructive">{manualForm.formState.errors.displayName.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Fecha de nacimiento</Label>
                    <DatePicker value={manualForm.watch("dateOfBirth")} onChange={(v) => manualForm.setValue("dateOfBirth", v)} />
                  </div>
                </div>
              </div>

              {/* Contacto */}
              <div className="border-t border-line pt-5">
                <SectionLabel>Contacto</SectionLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Email *</Label>
                    <Input type="email" className={fieldCls} placeholder="ana@email.com" {...manualForm.register("email")} />
                    {manualForm.formState.errors.email && (
                      <p className="text-xs text-destructive">{manualForm.formState.errors.email.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Teléfono</Label>
                    <Input className={fieldCls} placeholder="55 1234 5678" {...manualForm.register("phone")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Contacto de emergencia</Label>
                    <Input className={fieldCls} placeholder="Nombre" {...manualForm.register("emergencyContactName")} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-ink/70 text-xs">Teléfono emergencia</Label>
                    <Input className={fieldCls} {...manualForm.register("emergencyContactPhone")} />
                  </div>
                </div>
              </div>

              {/* Salud */}
              <div className="border-t border-line pt-5">
                <SectionLabel>Salud</SectionLabel>
                <div className="space-y-1">
                  <Label className="text-ink/70 text-xs">Notas de salud</Label>
                  <Input className={fieldCls} placeholder="Lesiones, condiciones..." {...manualForm.register("healthNotes")} />
                </div>
              </div>

              {/* Membresía (opcional) */}
              <div className="border-t border-line pt-5">
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
                    <Label className="text-ink/70 text-xs">Plan</Label>
                    <Select
                      value={selectedPlanId ?? "none"}
                      onValueChange={(v) => manualForm.setValue("planId", v === "none" ? undefined : v)}
                    >
                      <SelectTrigger className={fieldCls}>
                        <SelectValue placeholder="Sin plan (solo crear cuenta)" />
                      </SelectTrigger>
                      <SelectContent className="bg-canvas border-line text-ink">
                        <SelectItem value="none" className="text-ink/60 focus:bg-sunken">Sin plan</SelectItem>
                        {plans.map((p) => (
                          <SelectItem key={p.id} value={p.id} className="text-ink focus:bg-sunken">
                            {p.name}
                            {p.price > 0 && (
                              <span className="ml-2 text-ink/50 nums">{formatMXN(p.price)}</span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Show price of selected plan */}
                  {selectedPlan && (
                    <div className="flex items-center justify-between rounded-xl border border-line-strong/60 bg-sunken/50 px-4 py-2.5">
                      <span className="text-sm text-ink/70">{selectedPlan.name}</span>
                      <span className="text-lg font-semibold text-ink nums">{formatMXN(selectedPlan.price)}</span>
                    </div>
                  )}

                  {/* Payment method — only if plan selected */}
                  {hasPlanSelected && (
                    <div className="space-y-1">
                      <Label className="text-ink/70 text-xs">Método de pago</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PAYMENT_METHODS.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => manualForm.setValue("paymentMethod", value)}
                            className={cn(
                              "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-colors",
                              paymentMethod === value
                                ? "border-line-strong bg-sunken text-ink"
                                : "border-line bg-sunken text-ink/55 hover:border-line-strong hover:text-ink"
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
                      <Label className="text-ink/70 text-xs">Fecha de inicio</Label>
                      <DatePicker value={manualForm.watch("startDate")} onChange={(v) => manualForm.setValue("startDate", v)} />
                    </div>
                  )}

                  {/* Discount code — only if plan selected */}
                  {hasPlanSelected && (
                    <div className="space-y-1">
                      <Label className="text-ink/70 text-xs">Cupón de descuento (opcional)</Label>
                      <Input
                        className={cn(fieldCls, "uppercase")}
                        placeholder="Ej: ONLINE75"
                        {...manualForm.register("discountCode")}
                      />
                      <p className="text-xs text-ink/50">Se valida contra el plan elegido y queda anotado en la membresía.</p>
                    </div>
                  )}
                </div>
                )}
              </div>

              {/* Internal notes */}
              <div className="border-t border-line pt-5 space-y-1">
                <Label className="text-ink/70 text-xs">Notas internas</Label>
                <Input className={fieldCls} placeholder="Referida por, observaciones..." {...manualForm.register("notes")} />
              </div>

              <div className="flex justify-end gap-2 border-t border-line pt-4">
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

        <ClientEditSheet clientId={editId} open={!!editId} onOpenChange={(o) => { if (!o) setEditId(null); }} />

        {dialog}
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientsList;
