import { useState, useRef, type ComponentType, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { ErrorState } from "@/components/app/AppShell";
import { formatMXN, formatDate, formatDateTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, CalendarDays, Camera, ChevronLeft, ChevronRight, CreditCard,
  MessageCircle, Pencil, Phone, Receipt, RefreshCw, type LucideProps,
} from "lucide-react";
import { ZoomableImage } from "@/components/app/Lightbox";

// Formatea fecha de nacimiento sin que el timezone corra un día: toma solo
// la parte YYYY-MM-DD y la muestra en es-MX (ej. "19 abr 2000").
const fmtBirthdate = (value?: string | null) => {
  if (!value) return "—";
  const ymd = String(value).slice(0, 10);
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
};

const initialsOf = (name?: string | null) => {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  return parts.slice(0, 2).map((p) => p[0]).join("").toUpperCase();
};

const isUnlimited = (classesRemaining: unknown) =>
  classesRemaining == null || Number(classesRemaining) >= 9999;

// ── Etiquetas de estado ────────────────────────────────────────────────────────
const MEMBERSHIP_STATUS: Record<string, string> = {
  active: "Activa",
  paused: "Pausada",
  expired: "Vencida",
  cancelled: "Cancelada",
  pending_activation: "Por activar",
  pending_payment: "Pago pendiente",
};

const memStatusCls = (status: string) => {
  if (status === "active") return "border-transparent bg-alma-olive/15 text-alma-olive hover:bg-alma-olive/15";
  if (status === "paused") return "border-transparent bg-alma-oat text-alma-ink hover:bg-alma-oat";
  if (status === "pending_activation" || status === "pending_payment")
    return "border-alma-sandstone/70 bg-transparent text-alma-berry hover:bg-transparent";
  return "border-transparent bg-alma-ink/10 text-alma-ink/60 hover:bg-alma-ink/10";
};

const BOOKING_STATUS: Record<string, string> = {
  confirmed: "Confirmada",
  checked_in: "Asistió",
  cancelled: "Cancelada",
  late_cancelled: "Cancelación tardía",
  no_show: "No asistió",
  waitlisted: "Lista de espera",
};

const PAYMENT_METHOD: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  stripe: "Stripe",
  mercado_pago: "Mercado Pago",
};

// ── Clases compartidas (tema claro nativo) ─────────────────────────────────────
const fieldCls = "bg-alma-canvas border-alma-sandstone/60 text-alma-ink placeholder:text-alma-ink/40";
const outlineBtnCls = "border-alma-sandstone/70 bg-transparent text-alma-ink hover:bg-alma-mist hover:text-alma-ink";
const primaryBtnCls = "bg-alma-ink-deep text-alma-canvas hover:bg-alma-ink";
const headCls = "text-alma-ink/55 font-semibold text-xs uppercase tracking-wider";
const quickActionCls =
  "inline-flex items-center gap-1.5 rounded-full border border-alma-sandstone/70 px-3.5 py-2 text-xs font-medium text-alma-ink no-underline transition-colors hover:bg-alma-mist";

const EmptyBlock = ({ Icon, title, description }: {
  Icon: ComponentType<LucideProps>;
  title: string;
  description: string;
}) => (
  <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-alma-oat text-alma-berry">
      <Icon size={20} strokeWidth={1.8} />
    </span>
    <div>
      <p className="font-display text-lg text-alma-ink">{title}</p>
      <p className="text-sm text-alma-ink/55 mt-1 max-w-[44ch]">{description}</p>
    </div>
  </div>
);

// Paginación simple client-side para tablas largas (>20 filas).
const PAGE_SIZE = 20;
const Pager = ({ page, setPage, total }: { page: number; setPage: (p: number) => void; total: number }) => {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-alma-hairline px-4 py-2">
      <span className="text-xs text-alma-ink/55 nums">Página {page + 1} de {pages} · {total} filas</span>
      <div className="flex gap-1">
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-alma-ink/70 hover:bg-alma-mist hover:text-alma-ink"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={15} />
        </Button>
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-alma-ink/70 hover:bg-alma-mist hover:text-alma-ink"
          disabled={page >= pages - 1}
          onClick={() => setPage(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={15} />
        </Button>
      </div>
    </div>
  );
};

const TableCard = ({ children }: { children: ReactNode }) => (
  <div className="rounded-xl border border-alma-hairline overflow-hidden bg-alma-canvas">{children}</div>
);

const ClientDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [adjPoints, setAdjPoints] = useState("");
  const [adjReason, setAdjReason] = useState("");

  // Edición de membresía (créditos / estado / vencimiento)
  const [editMem, setEditMem] = useState<any | null>(null);
  const [editCredits, setEditCredits] = useState("");
  const [editUnlimited, setEditUnlimited] = useState(false);
  const [editStatus, setEditStatus] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  // Paginación por pestaña
  const [memPage, setMemPage] = useState(0);
  const [bookPage, setBookPage] = useState(0);
  const [payPage, setPayPage] = useState(0);

  // Foto de perfil
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("photo", file);
      return api.post(`/users/${id}/photo`, fd, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["client", id] }); toast({ title: "Foto actualizada" }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al subir la foto", variant: "destructive" }),
  });

  const { data: user, isLoading, isError: userError, refetch: refetchUser } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => (await api.get(`/users/${id}`)).data,
    enabled: !!id,
  });

  const { data: bookings, isError: bookingsError, refetch: refetchBookings } = useQuery({
    queryKey: ["client-bookings", id],
    queryFn: async () => (await api.get(`/bookings?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: memberships, isError: membershipsError, refetch: refetchMemberships } = useQuery({
    queryKey: ["client-memberships", id],
    queryFn: async () => (await api.get(`/memberships?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: payments, isError: paymentsError, refetch: refetchPayments } = useQuery({
    queryKey: ["client-payments", id],
    queryFn: async () => (await api.get(`/payments?userId=${id}`)).data,
    enabled: !!id,
  });

  const { data: loyalty, isError: loyaltyError, refetch: refetchLoyalty } = useQuery({
    queryKey: ["client-loyalty", id],
    queryFn: async () => (await api.get(`/loyalty/points/${id}`)).data,
    enabled: !!id,
  });

  const { data: waiverData, isError: waiverError, refetch: refetchWaiver } = useQuery({
    queryKey: ["admin-waiver", id],
    queryFn: async () => (await api.get(`/admin/users/${id}/waiver`)).data,
    enabled: !!id,
  });
  const waiver = waiverData?.data;

  const adjustMutation = useMutation({
    mutationFn: ({ points, reason, type }: { points: number; reason: string; type: "earn" | "redeem" }) =>
      api.post("/admin/loyalty/adjust", { userId: id, points, reason, type }),
    onSuccess: () => {
      refetchLoyalty();
      qc.invalidateQueries({ queryKey: ["client-loyalty", id] });
      toast({ title: "Puntos ajustados" });
      setAdjPoints("");
      setAdjReason("");
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al ajustar puntos", variant: "destructive" }),
  });

  const recalcMutation = useMutation({
    mutationFn: () => api.post(`/admin/loyalty/recalculate/${id}`),
    onSuccess: (res: any) => {
      refetchLoyalty();
      qc.invalidateQueries({ queryKey: ["client-loyalty", id] });
      const msg = res?.data?.data?.message ?? "Recalculado";
      toast({ title: msg });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al recalcular", variant: "destructive" }),
  });

  const openEditMem = (m: any) => {
    const unlimited = isUnlimited(m.classesRemaining);
    setEditMem(m);
    setEditUnlimited(unlimited);
    setEditCredits(unlimited ? "" : String(m.classesRemaining));
    setEditStatus(m.status ?? "active");
    setEditStartDate(m.startDate ? String(m.startDate).slice(0, 10) : "");
    setEditEndDate(m.endDate ? String(m.endDate).slice(0, 10) : "");
  };

  const handleEditStartDateChange = (val: string) => {
    setEditStartDate(val);
    // Auto-recalculate end date if plan has a known duration
    if (val && editMem?.durationDays) {
      const d = new Date(val);
      d.setDate(d.getDate() + Number(editMem.durationDays));
      setEditEndDate(d.toISOString().slice(0, 10));
    }
  };

  const editMemMutation = useMutation({
    mutationFn: () => {
      const body: any = { status: editStatus };
      body.classesRemaining = editUnlimited ? 9999 : Math.max(0, Number(editCredits || 0));
      if (editStartDate) body.startDate = editStartDate;
      if (editEndDate) body.endDate = editEndDate;
      return api.put(`/memberships/${editMem.id}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-memberships", id] });
      qc.invalidateQueries({ queryKey: ["client", id] });
      toast({ title: "Membresía actualizada" });
      setEditMem(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? "Error al actualizar", variant: "destructive" }),
  });

  const u = user?.data ?? user;

  const membershipRows: any[] = Array.isArray(memberships?.data) ? memberships.data : [];
  const bookingRows: any[] = Array.isArray(bookings?.data) ? bookings.data : [];
  const paymentRows: any[] = Array.isArray(payments?.data) ? payments.data : [];
  const activeMem = membershipRows.find((m) => m.status === "active");
  const loyaltyBalance = (loyalty as any)?.data?.balance ?? (loyalty as any)?.balance ?? (loyalty as any)?.points ?? 0;

  const phoneDigits = String(u?.phone ?? "").replace(/\D/g, "");
  const waNumber = phoneDigits.length === 10 ? `52${phoneDigits}` : phoneDigits;

  return (
    <AuthGuard>
      <AdminLayout>
        <div className="admin-page max-w-5xl">
          <Link
            to="/admin/clients"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-alma-ink/55 no-underline transition-colors hover:text-alma-ink"
          >
            <ArrowLeft size={13} /> Clientas
          </Link>

          {userError ? (
            <ErrorState
              title="No pudimos cargar el expediente"
              onRetry={() => refetchUser()}
            />
          ) : (
            <>
              {/* ── Header de expediente ── */}
              {isLoading ? (
                <div className="mb-7 flex items-center gap-4">
                  <Skeleton className="h-14 w-14 rounded-full bg-alma-oat/60" />
                  <div className="space-y-2">
                    <Skeleton className="h-7 w-56 bg-alma-oat/60" />
                    <Skeleton className="h-4 w-40 bg-alma-oat/60" />
                  </div>
                </div>
              ) : (
                <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      {u?.photoUrl ? (
                        <ZoomableImage src={u.photoUrl} alt={u.displayName ?? "Cliente"} overlayLabel="Ver" className="h-14 w-14 overflow-hidden rounded-full" />
                      ) : (
                        <span className="grid h-14 w-14 place-items-center rounded-full bg-alma-oat font-display text-lg text-alma-ink">
                          {initialsOf(u?.displayName)}
                        </span>
                      )}
                      <button type="button" onClick={() => photoInputRef.current?.click()}
                        className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-alma-ink text-alma-canvas shadow-sm hover:bg-alma-ink-deep"
                        aria-label="Cambiar foto">
                        <Camera size={12} />
                      </button>
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) photoMutation.mutate(f); e.target.value = ""; }} />
                    </div>
                    <div>
                      <h1 className="admin-title font-display text-alma-ink">{u?.displayName}</h1>
                      <p className="mt-0.5 text-sm text-alma-ink/55">
                        {u?.email}
                        {u?.phone ? <span className="nums"> · {u.phone}</span> : null}
                      </p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        {activeMem ? (
                          <>
                            <Badge className={memStatusCls("active")}>{activeMem.planName} · Activa</Badge>
                            <Badge variant="outline" className="border-alma-sandstone/70 text-alma-ink hover:bg-transparent">
                              {isUnlimited(activeMem.classesRemaining)
                                ? "Clases ilimitadas"
                                : <><span className="nums">{activeMem.classesRemaining}</span>&nbsp;clases restantes</>}
                            </Badge>
                            {activeMem.classCategory === "mixto" && !isUnlimited(activeMem.classesRemaining) && (
                              <Badge variant="outline" className="border-alma-sandstone/70 text-alma-ink hover:bg-transparent">
                                Studio&nbsp;<span className="nums">{activeMem.studioRemaining ?? 0}</span>&nbsp;· R/T&nbsp;<span className="nums">{activeMem.rtRemaining ?? 0}</span>
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline" className="border-alma-hairline text-alma-ink/55 hover:bg-transparent">
                            Sin membresía activa
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  {u?.phone && (
                    <div className="flex shrink-0 items-center gap-2">
                      <a href={`tel:${u.phone}`} className={quickActionCls}>
                        <Phone size={13} /> Llamar
                      </a>
                      <a
                        href={`https://wa.me/${waNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className={quickActionCls}
                      >
                        <MessageCircle size={13} /> WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              )}

              <Tabs defaultValue="profile">
                <TabsList>
                  <TabsTrigger value="profile">Perfil</TabsTrigger>
                  <TabsTrigger value="memberships">Membresías</TabsTrigger>
                  <TabsTrigger value="bookings">Reservas</TabsTrigger>
                  <TabsTrigger value="payments">Pagos</TabsTrigger>
                  <TabsTrigger value="loyalty">Lealtad</TabsTrigger>
                  <TabsTrigger value="waiver">Responsiva</TabsTrigger>
                </TabsList>

                {/* ── Perfil ── */}
                <TabsContent value="profile" className="mt-4">
                  {isLoading ? <Skeleton className="h-40 w-full bg-alma-oat/60" /> : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                        <div className="text-alma-ink/70">
                          <span className="font-medium text-alma-ink">Fecha de nacimiento:</span>{" "}
                          <span className="nums">{fmtBirthdate(u?.dateOfBirth)}</span>
                        </div>
                        <div className="text-alma-ink/70">
                          <span className="font-medium text-alma-ink">Emergencia:</span>{" "}
                          {u?.emergencyContactName ?? "—"} <span className="nums">{u?.emergencyContactPhone ?? ""}</span>
                        </div>
                        <div className="col-span-full text-alma-ink/70">
                          <span className="font-medium text-alma-ink">Notas de salud:</span> {u?.healthNotes ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-alma-hairline bg-alma-mist p-4 space-y-3">
                        <h3 className="text-sm font-semibold text-alma-ink">Cuestionario de ingreso</h3>
                        {u?.onboardingCompleted === false ? (
                          <p className="text-sm text-alma-ink/55">
                            La clienta aún no ha respondido el cuestionario.
                          </p>
                        ) : (
                          <div className="space-y-3 text-sm text-alma-ink/70">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-alma-ink">¿Tiene lesión o condición?</span>
                              {u?.hasInjury == null ? (
                                <span className="text-alma-ink/45">—</span>
                              ) : u?.hasInjury ? (
                                <Badge variant="destructive">Sí, revisar</Badge>
                              ) : (
                                <Badge variant="outline" className="border-alma-sandstone/60 text-alma-ink/70 hover:bg-transparent">No</Badge>
                              )}
                            </div>
                            {u?.hasInjury && (
                              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                                <p className="mb-1 text-xs font-medium text-destructive">Lesión / condición reportada</p>
                                <p className="whitespace-pre-wrap text-alma-ink">{u?.injuryDetails || "Sin detalle."}</p>
                              </div>
                            )}
                            <div>
                              <span className="font-medium text-alma-ink">¿Había practicado pilates antes?</span>{" "}
                              {u?.practicedBarreBefore == null
                                ? "—"
                                : u?.practicedBarreBefore
                                  ? "Sí"
                                  : "No, es nueva"}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* ── Membresías ── */}
                <TabsContent value="memberships" className="mt-4 space-y-6">
                  {membershipsError ? (
                    <ErrorState title="No pudimos cargar las membresías" onRetry={() => refetchMemberships()} />
                  ) : membershipRows.length === 0 ? (
                    <TableCard>
                      <EmptyBlock
                        Icon={CreditCard}
                        title="Sin membresías"
                        description="Esta clienta aún no tiene un plan. Puedes asignarle uno desde Pagos."
                      />
                    </TableCard>
                  ) : (
                    <TableCard>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-alma-hairline hover:bg-transparent">
                            <TableHead className={headCls}>Plan</TableHead>
                            <TableHead className={headCls}>Estado</TableHead>
                            <TableHead className={headCls}>Inicio</TableHead>
                            <TableHead className={headCls}>Vence</TableHead>
                            <TableHead className={headCls}>Clases</TableHead>
                            <TableHead className="w-20" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {membershipRows.slice(memPage * PAGE_SIZE, (memPage + 1) * PAGE_SIZE).map((m: any) => (
                            <TableRow key={m.id} className="border-alma-hairline hover:bg-alma-mist">
                              <TableCell className="font-medium text-alma-ink">{m.planName ?? m.planId}</TableCell>
                              <TableCell>
                                <Badge className={memStatusCls(m.status)}>{MEMBERSHIP_STATUS[m.status] ?? m.status}</Badge>
                              </TableCell>
                              <TableCell className="text-alma-ink/70 nums">{m.startDate ? formatDate(m.startDate) : "—"}</TableCell>
                              <TableCell className="text-alma-ink/70 nums">{m.endDate ? formatDate(m.endDate) : "—"}</TableCell>
                              <TableCell className="text-alma-ink/70">
                                {isUnlimited(m.classesRemaining) ? "Ilimitadas" : <span className="nums">{m.classesRemaining}</span>}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost" size="sm"
                                  className="h-7 text-xs text-alma-ink/70 hover:bg-alma-oat/60 hover:text-alma-ink"
                                  onClick={() => openEditMem(m)}
                                >
                                  <Pencil size={12} className="mr-1" /> Editar
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Pager page={memPage} setPage={setMemPage} total={membershipRows.length} />
                    </TableCard>
                  )}
                </TabsContent>

                {/* ── Reservas ── */}
                <TabsContent value="bookings" className="mt-4">
                  {bookingsError ? (
                    <ErrorState title="No pudimos cargar las reservas" onRetry={() => refetchBookings()} />
                  ) : bookingRows.length === 0 ? (
                    <TableCard>
                      <EmptyBlock
                        Icon={CalendarDays}
                        title="Sin reservas todavía"
                        description="Cuando la clienta reserve una clase aparecerá aquí su historial."
                      />
                    </TableCard>
                  ) : (
                    <TableCard>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-alma-hairline hover:bg-transparent">
                            <TableHead className={headCls}>Clase</TableHead>
                            <TableHead className={headCls}>Fecha</TableHead>
                            <TableHead className={headCls}>Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bookingRows.slice(bookPage * PAGE_SIZE, (bookPage + 1) * PAGE_SIZE).map((b: any) => (
                            <TableRow key={b.id} className="border-alma-hairline hover:bg-alma-mist">
                              <TableCell className="font-medium text-alma-ink">{b.className ?? b.classId}</TableCell>
                              <TableCell className="text-alma-ink/70 nums">{b.startTime ? formatDateTime(b.startTime) : "—"}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="border-alma-sandstone/60 text-alma-ink/70 hover:bg-transparent">
                                  {BOOKING_STATUS[b.status] ?? b.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <Pager page={bookPage} setPage={setBookPage} total={bookingRows.length} />
                    </TableCard>
                  )}
                </TabsContent>

                {/* ── Pagos ── */}
                <TabsContent value="payments" className="mt-4">
                  {paymentsError ? (
                    <ErrorState title="No pudimos cargar los pagos" onRetry={() => refetchPayments()} />
                  ) : paymentRows.length === 0 ? (
                    <TableCard>
                      <EmptyBlock
                        Icon={Receipt}
                        title="Sin pagos registrados"
                        description="Los pagos aprobados y las membresías asignadas aparecerán aquí."
                      />
                    </TableCard>
                  ) : (
                    <TableCard>
                      <Table>
                        <TableHeader>
                          <TableRow className="border-alma-hairline hover:bg-transparent">
                            <TableHead className={headCls}>Monto</TableHead>
                            <TableHead className={headCls}>Plan</TableHead>
                            <TableHead className={headCls}>Método</TableHead>
                            <TableHead className={headCls}>Fecha</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paymentRows.slice(payPage * PAGE_SIZE, (payPage + 1) * PAGE_SIZE).map((p: any) => {
                            const createdAt = p.createdAt ?? p.created_at;
                            return (
                              <TableRow key={p.id} className="border-alma-hairline hover:bg-alma-mist">
                                <TableCell className="font-medium text-alma-ink nums">
                                  {formatMXN(Number(p.total_amount ?? p.amount ?? 0))}
                                </TableCell>
                                <TableCell className="text-alma-ink/70">{p.planName ?? p.plan_name ?? "—"}</TableCell>
                                <TableCell className="text-alma-ink/70">{PAYMENT_METHOD[p.method] ?? p.method ?? "—"}</TableCell>
                                <TableCell className="text-alma-ink/70 nums">{createdAt ? formatDate(createdAt) : "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                      <Pager page={payPage} setPage={setPayPage} total={paymentRows.length} />
                    </TableCard>
                  )}
                </TabsContent>

                {/* ── Lealtad ── */}
                <TabsContent value="loyalty" className="mt-4 space-y-6">
                  {loyaltyError ? (
                    <ErrorState title="No pudimos cargar los puntos de lealtad" onRetry={() => refetchLoyalty()} />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-end gap-4">
                        <div>
                          <div className="font-display text-4xl text-alma-ink nums">{loyaltyBalance}</div>
                          <p className="text-sm text-alma-ink/55">puntos acumulados</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className={outlineBtnCls}
                          disabled={recalcMutation.isPending}
                          onClick={() => recalcMutation.mutate()}
                        >
                          <RefreshCw size={13} className={cn("mr-1.5", recalcMutation.isPending && "animate-spin")} />
                          {recalcMutation.isPending ? "Recalculando…" : "Recalcular desde membresías"}
                        </Button>
                      </div>
                      <div className="max-w-sm space-y-3 rounded-xl border border-alma-hairline bg-alma-mist p-4">
                        <p className="text-sm font-semibold text-alma-ink">Ajustar puntos manualmente</p>
                        <div className="space-y-1">
                          <Label className="text-xs text-alma-ink/70">Puntos (número positivo)</Label>
                          <Input
                            type="number"
                            min="1"
                            className={cn(fieldCls, "nums")}
                            placeholder="Ej: 150"
                            value={adjPoints}
                            onChange={(e) => setAdjPoints(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-alma-ink/70">Motivo</Label>
                          <Input
                            className={fieldCls}
                            placeholder="Ej: Membresía no contabilizada"
                            value={adjReason}
                            onChange={(e) => setAdjReason(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className={primaryBtnCls}
                            disabled={!adjPoints || adjustMutation.isPending}
                            onClick={() => adjustMutation.mutate({ points: Math.abs(Number(adjPoints)), reason: adjReason || "Ajuste manual", type: "earn" })}
                          >
                            + Agregar puntos
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className={outlineBtnCls}
                            disabled={!adjPoints || adjustMutation.isPending}
                            onClick={() => adjustMutation.mutate({ points: Math.abs(Number(adjPoints)), reason: adjReason || "Ajuste manual", type: "redeem" })}
                          >
                            − Deducir puntos
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ── Responsiva ── */}
                <TabsContent value="waiver" className="mt-4">
                  {waiverError ? (
                    <ErrorState title="No pudimos cargar la responsiva" onRetry={() => refetchWaiver()} />
                  ) : !waiver ? (
                    <div className="rounded-xl border border-alma-hairline bg-alma-mist p-6 text-sm text-alma-ink/55">
                      Esta clienta aún no ha firmado su responsiva. La firmará al reservar su primera clase.
                    </div>
                  ) : (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-alma-hairline bg-alma-mist p-5">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-base font-semibold text-alma-ink">Responsiva y consentimiento informado</h3>
                          <Badge className="border-transparent bg-alma-olive/15 text-alma-olive hover:bg-alma-olive/15">Firmada</Badge>
                        </div>
                        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                          {[
                            ["Nombre", waiver.full_name || "—"],
                            ["Correo", waiver.email || "—"],
                            ["Teléfono", waiver.phone || "—"],
                            ["Uso de imagen", waiver.image_consent ? "Sí autorizado" : "No autorizado"],
                            ["Firmada el", waiver.signed_at ? formatDate(waiver.signed_at) : "—"],
                          ].map(([k, v]) => (
                            <div key={k} className="flex justify-between gap-4 border-b border-alma-hairline/60 py-1.5">
                              <dt className="text-alma-ink/55">{k}</dt>
                              <dd className="text-right text-alma-ink nums">{v}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                      {waiver.signature_data && (
                        <div className="rounded-xl border border-alma-hairline bg-alma-mist p-5">
                          <p className="mb-3 text-xs uppercase tracking-wider text-alma-ink/55">Firma</p>
                          <img
                            src={waiver.signature_data}
                            alt="Firma de la clienta"
                            className="max-h-32 rounded-lg border border-alma-hairline bg-alma-canvas p-2"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>

        {/* ── Editar membresía (créditos / estado / vencimiento) ── */}
        <Dialog open={!!editMem} onOpenChange={(v) => !v && setEditMem(null)}>
          <DialogContent className="max-w-md bg-alma-canvas border-alma-hairline text-alma-ink">
            <DialogHeader>
              <DialogTitle className="font-display text-alma-ink">Editar membresía</DialogTitle>
            </DialogHeader>
            {editMem && (
              <div className="space-y-4">
                <p className="text-sm text-alma-ink/55">
                  {editMem.planName ?? editMem.planId}
                </p>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-alma-hairline bg-alma-mist px-4 py-3">
                  <div>
                    <Label htmlFor="mem-unlimited" className="text-sm font-medium text-alma-ink">Clases ilimitadas</Label>
                    <p className="text-xs text-alma-ink/55">La clienta reserva sin tope de créditos.</p>
                  </div>
                  <Switch
                    id="mem-unlimited"
                    checked={editUnlimited}
                    onCheckedChange={setEditUnlimited}
                    className="data-[state=checked]:bg-alma-ink data-[state=unchecked]:bg-alma-sandstone/60"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-alma-ink/70">Clases restantes</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    disabled={editUnlimited}
                    placeholder={editUnlimited ? "Sin tope" : "Ej: 8"}
                    className={cn(fieldCls, "nums disabled:opacity-50")}
                    value={editUnlimited ? "" : editCredits}
                    onChange={(e) => setEditCredits(e.target.value)}
                  />
                  <p className="text-xs text-alma-ink/50">
                    Ajusta los créditos de la clienta (sirve para paquetes por semana o por mes).
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-alma-ink/70">Estado</Label>
                  <Select value={editStatus} onValueChange={setEditStatus}>
                    <SelectTrigger className={fieldCls}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-alma-canvas border-alma-hairline text-alma-ink">
                      {Object.entries(MEMBERSHIP_STATUS).map(([v, label]) => (
                        <SelectItem key={v} value={v} className="text-alma-ink focus:bg-alma-mist">{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-alma-ink/70">Inicio</Label>
                    <Input
                      type="date"
                      className={cn(fieldCls, "nums")}
                      value={editStartDate}
                      onChange={(e) => handleEditStartDateChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-alma-ink/70">Vence</Label>
                    <Input
                      type="date"
                      className={cn(fieldCls, "nums")}
                      value={editEndDate}
                      onChange={(e) => setEditEndDate(e.target.value)}
                    />
                  </div>
                </div>
                {editMem?.durationDays && editStartDate && (
                  <p className="text-xs text-alma-ink/50">
                    Vencimiento calculado automáticamente ({editMem.durationDays} días desde el inicio).
                    Puedes ajustarlo manualmente.
                  </p>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" className={outlineBtnCls} onClick={() => setEditMem(null)}>
                Cancelar
              </Button>
              <Button
                className={primaryBtnCls}
                disabled={editMemMutation.isPending || (!editUnlimited && editCredits.trim() === "")}
                onClick={() => editMemMutation.mutate()}
              >
                {editMemMutation.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </AuthGuard>
  );
};

export default ClientDetail;
