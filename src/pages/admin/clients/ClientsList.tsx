import { BirthDateInput } from "@/components/ui/birth-date-input";
import { useState, type ComponentType, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ResponsivaDialog } from "@/components/app/ResponsivaDialog";
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
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { MessageCircle, Cake, MoreHorizontal, Search, SearchX, UserPlus, UsersRound, CreditCard, type LucideProps } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { useCanSeeFinance } from "@/lib/roles";

// ── Schemas ────────────────────────────────────────────────────────────────────
const manualSchema = z.object({
  displayName: z.string().min(1, "Nombre requerido"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  startDate: z.string().optional(),
  notes: z.string().optional(),
});

type ManualFormData = z.infer<typeof manualSchema>;

type Client = { id: string; displayName: string; email?: string | null; phone?: string | null; role?: string; createdAt?: string };

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
  const { promptText, dialog } = useConfirm();
  // "Editar" y "Eliminar" (dar de baja) pisan datos o cierran el acceso de la
  // clienta: el servidor sólo deja tocarlos a la dueña (PUT /users/:id y
  // DELETE /users/:id rechazan a los demás roles) — spec §8, I3.
  const canSeeFinance = useCanSeeFinance();

  // Edit sheet
  const [editId, setEditId] = useState<string | null>(null);
  // Manual registration sheet
  const [manualOpen, setManualOpen] = useState(false);
  const [newUserToSign, setNewUserToSign] = useState<Client | null>(null);

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
    queryFn: async () => (await api.get(`/users?search=${encodeURIComponent(debouncedSearch)}`)).data,
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

  const deleteMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      api.delete(`/users/${id}`, { data: reason ? { reason } : {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast({ title: "Usuario dado de baja", description: "Se borraron sus datos personales; su historial y sus pagos se conservan." });
    },
    onError: (e: any) =>
      toast({ title: "No se pudo eliminar", description: e?.response?.data?.message ?? "Revisa si tiene membresías o reservas activas.", variant: "destructive" }),
  });

  const askDelete = async (c: Client) => {
    const reason = await promptText({
      title: `¿Dar de baja a ${c.displayName}?`,
      description: "Se borran sus datos personales y de salud y se cierra su acceso. Sus reservas, órdenes y pagos se conservan sin su nombre. No se puede deshacer.",
      placeholder: "Motivo (opcional): p. ej. lo pidió por WhatsApp",
      confirmLabel: "Eliminar usuario",
      destructive: true,
    });
    if (reason !== null) deleteMutation.mutate({ id: c.id, reason: reason || undefined });
  };

  // ── Manual registration form ───────────────────────────────────────────────
  const manualForm = useForm<ManualFormData>({
    resolver: zodResolver(manualSchema),
    defaultValues: { startDate: format(new Date(), "yyyy-MM-dd") },
  });
  const manualMutation = useMutation({
    mutationFn: (d: ManualFormData) => api.post("/admin/clients/manual", d),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setSearch("");
      setBirthday(null);
      toast({ title: "Usuario registrado", description: "Ahora debe leer y firmar su responsiva antes de comprar." });
      if (res.data?.data?.user?.id) setNewUserToSign(res.data.data.user);
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



  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AuthGuard>
      {newUserToSign && <ResponsivaDialog key={newUserToSign.id} userId={newUserToSign.id} open onClose={() => setNewUserToSign(null)} onSigned={() => { const id = newUserToSign.id; setNewUserToSign(null); navigate(canSeeFinance ? `/admin/payments?clienta=${id}` : `/admin/clients/${id}`); }} defaultName={newUserToSign.displayName} defaultEmail={newUserToSign.email ?? ""} defaultPhone={newUserToSign.phone ?? ""} />}
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader
            kicker="Personas"
            title="Usuarios"
            actions={
              <>
                <PersonasTabs />
                <Button onClick={() => setManualOpen(true)}>
                  <UserPlus size={16} aria-hidden="true" />
                  Nuevo usuario
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
            <span className="text-sm text-ink-muted"><span className="nums font-extrabold text-ink">{clients.length}</span> usuarios registrados</span>
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
                  title="No pudimos cargar a los usuarios"
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
                  title="Aún no hay usuarios registrados"
                  description="Registra a tu primer usuario para llevar su expediente, membresías y reservas."
                  action={
                    <Button size="sm" className={cn(primaryBtnCls, "gap-2")} onClick={() => setManualOpen(true)}>
                      <UserPlus size={14} /> Nuevo usuario
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
                    <TableHead className="text-ink/55 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Usuario desde</TableHead>
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
                            {canSeeFinance && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" aria-label={`Acciones de ${c.displayName}`}>
                                    <MoreHorizontal size={18} />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => setEditId(c.id)}>
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-danger focus:text-danger"
                                    onClick={() => askDelete(c)}
                                  >
                                    Eliminar
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
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
                Nuevo usuario
              </SheetTitle>
              <SheetDescription className="text-ink/55">
                Registro manual. El usuario recibe su contraseña por email.
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
                    <BirthDateInput value={manualForm.watch("dateOfBirth")} onChange={(v) => manualForm.setValue("dateOfBirth", v)} />
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
              <p className="rounded-xl border border-line p-4 text-sm text-ink-muted">Primero registra al usuario y solicita su firma de consentimiento informado y responsiva. Después podrás seleccionar y cobrar un plan en Cobrar.</p>

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
                  {manualMutation.isPending ? "Registrando…" : "Registrar y solicitar firma"}
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
