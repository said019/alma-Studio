import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { addDays, format, getISOWeek, parseISO, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import api from "@/lib/api";
import { AuthGuard } from "@/components/admin/AuthGuard";
import AdminLayout from "@/components/admin/AdminLayout";
import { FEATURES } from "@/config/features";
import { useSearchParamState } from "@/hooks/use-search-param-state";
import { AdminPage, AdminPageHeader } from "@/components/admin/AdminPage";
import { Panel } from "@/components/admin/Panel";
import MasterDetail from "@/components/admin/MasterDetail";
import WeekNav from "@/components/admin/WeekNav";
import DayStrip from "@/components/admin/DayStrip";
import StatusDot from "@/components/admin/StatusDot";
import { Avatar } from "@/components/admin/PersonCell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/admin/ConfirmDialog";
import { ErrorState, SkeletonRow } from "@/components/app/AppShell";
import { formatMXN } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Check, MoreHorizontal, Search, UserPlus, UserX } from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";
import VisitAssignDialog from "@/components/admin/VisitAssignDialog";
import { hhmm } from "@/lib/today-roster";
import ReservasTabs from "./ReservasTabs";

// ── Types ──────────────────────────────────────────────────────────────────────
interface RosterEntry {
  bookingId: string;
  status: string;
  checkedInAt: string | null;
  userId: string;
  displayName: string;
  email: string;
  phone: string | null;
  planName: string | null;
  classesRemaining: number | null;
}

interface ClientOption {
  id: string;
  displayName: string;
  email?: string;
  phone?: string | null;
}

// ── Diálogo de cancelar reserva: muestra la ventana (a tiempo/tarde) y deja
// elegir si devolver el crédito. Default: devolver (la admin desmarca si no). ──
const CancelBookingDialog = ({
  entry, classStartsAt, windowHours, pending, onConfirm, onClose,
}: {
  entry: RosterEntry | null;
  classStartsAt: string | null;
  windowHours: number;
  pending: boolean;
  onConfirm: (args: { reason?: string; refundCredit: boolean }) => void;
  onClose: () => void;
}) => {
  const [reason, setReason] = useState("");
  const [refundCredit, setRefundCredit] = useState(true);

  useEffect(() => {
    if (entry) { setReason(""); setRefundCredit(true); }
  }, [entry?.bookingId]);

  if (!entry) return null;

  const isUnlimited = entry.classesRemaining == null || entry.classesRemaining >= 9999;
  const minutesUntil = classStartsAt ? (new Date(classStartsAt).getTime() - Date.now()) / 60000 : null;
  const isLate = minutesUntil != null && minutesUntil < windowHours * 60;
  const timeLabel = minutesUntil == null ? null
    : minutesUntil < 0 ? "La clase ya pasó"
    : minutesUntil < 60 ? `Faltan ${Math.round(minutesUntil)} min`
    : `Faltan ${Math.round(minutesUntil / 60)} h`;

  return (
    <Dialog open={!!entry} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md bg-canvas border-line text-ink">
        <DialogHeader>
          <DialogTitle className="font-display text-ink">Cancelar reserva de {entry.displayName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {timeLabel && (
            <div className={cn(
              "rounded-xl border px-3 py-2 text-sm font-medium",
              isLate ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-success/40 bg-success/10 text-success",
            )}>
              {timeLabel} para la clase — {isLate ? `tarde (dentro de ${windowHours}h)` : "a tiempo"}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-ink/70">Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. nos pidió moverla por teléfono"
              rows={2}
              className="bg-canvas border-line-strong/60 text-ink placeholder:text-ink/40"
            />
            <p className="text-[11px] text-ink/50">Se incluye en el WhatsApp que le llega a {entry.displayName}.</p>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-sunken px-4 py-3">
            <div>
              <Label className="text-sm font-medium text-ink">Devolver crédito</Label>
              <p className="text-xs text-ink/55">
                {isUnlimited
                  ? "Plan ilimitado — no usa créditos."
                  : refundCredit
                    ? "La clase regresa a su paquete."
                    : "La clase cuenta como usada (no se devuelve)."}
              </p>
            </div>
            <Switch
              checked={refundCredit && !isUnlimited}
              onCheckedChange={setRefundCredit}
              disabled={isUnlimited}
              className="data-[state=checked]:bg-ink data-[state=unchecked]:bg-line/60"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-line-strong/70 bg-transparent text-ink hover:bg-sunken" onClick={onClose} disabled={pending}>
            Volver
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => onConfirm({ reason: reason.trim() || undefined, refundCredit: isUnlimited ? false : refundCredit })}
            disabled={pending}
          >
            {pending ? "Cancelando…" : "Cancelar reserva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

function RosterStatus({ status }: { status: string }) {
  if (status === "checked_in") return <StatusDot tone="success">Asistió</StatusDot>;
  if (status === "no_show") return <StatusDot tone="danger">No asistió</StatusDot>;
  if (status === "cancelled") return <StatusDot tone="muted">Cancelada</StatusDot>;
  if (status === "waitlist") return <span className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] font-extrabold text-ink">Lista de espera</span>;
  return <StatusDot tone="ink">Confirmada</StatusDot>;
}

// ── Class Roster panel ─────────────────────────────────────────────────────────
const ClassRoster = ({ classId, onBack, onClassLoaded }: { classId: string; onBack: () => void; onClassLoaded?: (date: string) => void }) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { confirm, promptText, dialog } = useConfirm();
  const [cancelTarget, setCancelTarget] = useState<RosterEntry | null>(null);
  const { data: loyaltyCfgData } = useQuery<{ data: { faltas_cancel_window_hours?: number } }>({
    queryKey: ["loyalty-config"],
    queryFn: async () => (await api.get("/loyalty/config")).data,
  });
  const creditWindowHours = Number(loyaltyCfgData?.data?.faltas_cancel_window_hours ?? 12) || 12;
  const [assignOpen, setAssignOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const debouncedMemberSearch = useDebounce(memberSearch, 250);

  // ── Asignar socia + acompañante (opcional, descuenta 2 créditos) ──
  const [assignWithGuest, setAssignWithGuest] = useState(false);
  const [selectedMember, setSelectedMember] = useState<ClientOption | null>(null);
  const [agGuestPhone, setAgGuestPhone] = useState("");
  const [agGuestName, setAgGuestName] = useState("");
  const [agGuestEmail, setAgGuestEmail] = useState("");
  const [agGuestInjury, setAgGuestInjury] = useState(false);
  const [agGuestInjuryDetails, setAgGuestInjuryDetails] = useState("");
  const [agGuestPracticed, setAgGuestPracticed] = useState(false);
  const [agGuestWaiver, setAgGuestWaiver] = useState(false);
  const [agSearching, setAgSearching] = useState(false);
  const [agFound, setAgFound] = useState(false);

  const resetAssignForm = () => {
    setAssignWithGuest(false);
    setSelectedMember(null);
    setMemberSearch("");
    setAgGuestPhone(""); setAgGuestName(""); setAgGuestEmail("");
    setAgGuestInjury(false); setAgGuestInjuryDetails("");
    setAgGuestPracticed(false); setAgGuestWaiver(false);
    setAgFound(false);
    setGuestChargeMode("host_pack");
    setGuestSalePlanId("");
    setGuestSalePayment("cash");
  };

  const searchAdminGuest = async () => {
    if (!agGuestPhone.trim()) return;
    setAgSearching(true);
    try {
      const r = await api.get(`/admin/guest-profiles/search?phone=${encodeURIComponent(agGuestPhone)}`);
      const data = r.data?.data;
      if (data?.profile) {
        const g = data.profile;
        setAgFound(true);
        setAgGuestName(g.display_name || "");
        setAgGuestEmail(g.email || "");
        setAgGuestInjury(g.has_injury === true);
        setAgGuestInjuryDetails(g.injury_details || "");
        setAgGuestPracticed(g.practiced_barre_before === true);
        toast({ title: "Acompañante encontrada", description: "Cuestionario cargado." });
      } else {
        setAgFound(false);
        toast({ title: "Nueva acompañante", description: "Llena el cuestionario abajo." });
      }
    } catch {
      toast({ title: "Error al buscar", variant: "destructive" });
    } finally {
      setAgSearching(false);
    }
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["roster", classId],
    queryFn: async () => (await api.get(`/classes/${classId}/roster`)).data,
    refetchInterval: 15000,
  });

  const classInfo = data?.data?.class ?? null;
  const roster: RosterEntry[] = data?.data?.roster ?? [];

  useEffect(() => {
    const d = classInfo?.date ? String(classInfo.date).slice(0, 10) : null;
    if (d) onClassLoaded?.(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classInfo?.date]);

  const { data: usersData, isFetching: searchingUsers } = useQuery<{ data: ClientOption[] }>({
    queryKey: ["booking-assign-users", classId, debouncedMemberSearch],
    enabled: assignOpen,
    queryFn: async () => (
      await api.get(`/users?role=client${debouncedMemberSearch ? `&search=${encodeURIComponent(debouncedMemberSearch)}` : ""}`)
    ).data,
  });
  const userOptions = Array.isArray(usersData?.data) ? usersData.data : [];

  // Las acciones de abajo cambian cupo/lista de espera, que la lista de la
  // semana (panel izquierdo) también muestra — sin esto se queda con números
  // viejos hasta que la ventana recupera el foco (M1).
  const invalidateWeek = () => qc.invalidateQueries({ queryKey: ["admin-classes-week"] });

  const checkinMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/check-in`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      invalidateWeek();
      toast({ title: "Check-in registrado" });
    },
    onError: () => toast({ title: "Error al hacer check-in", variant: "destructive" }),
  });

  const noShowMutation = useMutation({
    mutationFn: (id: string) => api.put(`/bookings/${id}/no-show`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      invalidateWeek();
      toast({ title: "Marcada como no asistió" });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  // Admin cancela reserva (override política 2h, devuelve crédito).
  const cancelMutation = useMutation({
    mutationFn: ({ id, reason, refundCredit }: { id: string; reason?: string; refundCredit: boolean }) =>
      api.delete(`/admin/bookings/${id}`, { data: { reason, refundCredit } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["my-bookings"] });
      invalidateWeek();
      const restored = res?.data?.data?.credit_restored;
      toast({
        title: "Reserva cancelada",
        description: restored ? "Crédito devuelto a la alumna." : "Cancelada (sin crédito por devolver).",
      });
      setCancelTarget(null);
    },
    onError: (e: any) => toast({
      title: "Error al cancelar",
      description: e?.response?.data?.message || "Inténtalo de nuevo",
      variant: "destructive",
    }),
  });

  // Admin cancela la clase completa (cascada: todos los bookings + créditos + WA).
  const cancelClassMutation = useMutation({
    mutationFn: (reason?: string) =>
      api.put(`/classes/${classId}/cancel`, { reason }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      qc.invalidateQueries({ queryKey: ["classes"] });
      invalidateWeek();
      const d = res?.data?.data || {};
      toast({
        title: "Clase cancelada",
        description: `${d.bookings_cancelled ?? 0} reservas canceladas · ${d.credits_restored ?? 0} créditos devueltos · ${d.wa_sent ?? 0} WhatsApps`,
      });
    },
    onError: (e: any) => toast({
      title: "Error",
      description: e?.response?.data?.message || "No se pudo cancelar",
      variant: "destructive",
    }),
  });

  const assignMutation = useMutation({
    mutationFn: (vars: { userId: string; guest?: any; guestSale?: any }) =>
      api.post("/admin/bookings/assign", {
        classId,
        userId: vars.userId,
        guest: vars.guest,
        guestSale: vars.guestSale,
      }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["roster", classId] });
      invalidateWeek();
      const msg = res?.data?.message ?? "Reserva asignada";
      toast({ title: msg });
      setAssignOpen(false);
      resetAssignForm();
    },
    onError: (e: any) => {
      toast({ title: e?.response?.data?.message ?? "Error al asignar reserva", variant: "destructive" });
    },
  });

  // ── Cobro de la acompañante ──────────────────────────────────────
  // Modo 'host_pack': usa el pack de visitas de la socia (default, comportamiento anterior).
  // Modo 'guest_sale': vende clase suelta (o cualquier plan) directo a la acompañante.
  const [guestChargeMode, setGuestChargeMode] = useState<"host_pack" | "guest_sale">("host_pack");
  const [guestSalePlanId, setGuestSalePlanId] = useState<string>("");
  const [guestSalePayment, setGuestSalePayment] = useState<"cash" | "transfer" | "card">("cash");
  const { data: plansData } = useQuery<{ data: any[] }>({
    queryKey: ["plans-for-guest-sale"],
    queryFn: async () => (await api.get("/plans")).data,
    enabled: assignOpen && assignWithGuest && guestChargeMode === "guest_sale",
  });
  const guestSalePlans = (Array.isArray(plansData?.data) ? plansData!.data : [])
    .filter((p: any) => p.is_active !== false)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price ?? 0),
      classLimit: p.class_limit ?? p.classLimit ?? 1,
      isVisitPack: p.is_visit_pack === true || p.isVisitPack === true,
    }))
    // Ordenar primero los visit-pack (clase suelta, paquetes de visita)
    .sort((a: any, b: any) => (b.isVisitPack ? 1 : 0) - (a.isVisitPack ? 1 : 0));

  const checkedIn = roster.filter((r) => r.status === "checked_in").length;
  const confirmed = roster.filter((r) => r.status === "confirmed").length;
  const waitlist  = roster.filter((r) => r.status === "waitlist").length;
  const noShow    = roster.filter((r) => r.status === "no_show").length;

  const handleCancelClass = async () => {
    const total = confirmed + waitlist;
    const reason = await promptText({
      title: "Motivo de cancelación",
      description: `Se incluye en el WhatsApp a la${total === 1 ? "" : "s"} ${total} alumna${total === 1 ? "" : "s"}. Puedes dejarlo vacío.`,
      placeholder: "Ej. la instructora se enfermó",
      confirmLabel: "Continuar",
    });
    if (reason === null) return;
    const ok = await confirm({
      title: "¿Cancelar la clase completa?",
      description: `Se cancela${total === 1 ? "" : "n"} ${total} reserva${total === 1 ? "" : "s"}, se devuelve${confirmed === 1 ? "" : "n"} ${confirmed} crédito${confirmed === 1 ? "" : "s"} y se avisa por WhatsApp a cada alumna.`,
      destructive: true,
      confirmLabel: "Cancelar clase",
      cancelLabel: "Volver",
    });
    if (!ok) return;
    cancelClassMutation.mutate(reason || undefined);
  };

  const handleCancelBooking = (entry: RosterEntry) => {
    // Abre el diálogo dedicado (ventana de política + elección de crédito).
    setCancelTarget(entry);
  };

  if (isError) {
    return (
      <Panel className="p-6">
        <ErrorState title="No pudimos cargar la clase" description="Puede que la hayan borrado o que el enlace sea viejo." onRetry={() => refetch()} />
        <Button variant="outline" onClick={onBack}>Elegir otra clase</Button>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <Panel aria-label="Lista de la clase" className="overflow-hidden">
        {isLoading ? (
          <div className="p-6"><SkeletonRow height={72} /></div>
        ) : (
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between lg:p-6">
            <div className="min-w-0">
              <p className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">
                {classInfo?.startsAt ? format(new Date(classInfo.startsAt), "EEEE d 'de' MMMM · HH:mm", { locale: es }) : classInfo?.date ?? "—"}
              </p>
              <h2 className="mt-2 font-display text-[1.375rem] font-semibold leading-tight text-ink">{classInfo?.classTypeName ?? "Clase"}</h2>
              <p className="mt-1 text-[13px] text-ink-muted">con {classInfo?.instructorName ?? "—"} · se actualiza sola cada 15 s</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => setAssignOpen(true)}>
                <UserPlus size={16} aria-hidden="true" />
                Asignar socia
              </Button>
              {FEATURES.visits && (
                <Button variant="outline" onClick={() => setVisitOpen(true)}>Asignar visitante</Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Más acciones de la clase"><MoreHorizontal size={18} /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => refetch()}>Actualizar</DropdownMenuItem>
                  {confirmed + waitlist > 0 && (
                    <DropdownMenuItem className="text-danger" onClick={handleCancelClass}>Cancelar clase</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        <dl className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
          {([["Confirmadas", confirmed], ["Asistieron", checkedIn], ["En espera", waitlist], ["Faltas", noShow]] as const).map(([label, value], i) => (
            <div key={label} className={cn("px-5 py-3.5", i % 2 === 1 && "border-l border-line", i >= 2 && "border-t border-line lg:border-t-0", i > 0 && "lg:border-l")}>
              <dt className="text-[0.75rem] font-bold uppercase tracking-[0.12em] text-ink-muted">{label}</dt>
              <dd className="nums mt-1.5 font-display text-[1.375rem] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>

        {isLoading ? (
          <div className="space-y-2 border-t border-line p-5"><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
        ) : roster.length === 0 ? (
          <p className="border-t border-line px-6 py-8 text-sm text-ink-muted">No hay reservas para esta clase</p>
        ) : (
          <ul>
            {roster.map((entry: RosterEntry) => {
              const canCheckin = entry.status === "confirmed" || entry.status === "waitlist";
              const canNoShow = entry.status === "confirmed";
              const canCancel = entry.status === "confirmed" || entry.status === "waitlist";
              const unlimited = entry.classesRemaining == null || entry.classesRemaining >= 9999;
              const plan = entry.planName
                ? `${entry.planName} · ${unlimited ? "Ilimitado" : `${entry.classesRemaining} ${entry.classesRemaining === 1 ? "restante" : "restantes"}`}`
                : "Sin plan";
              return (
                <li key={entry.bookingId} className="grid grid-cols-[40px_minmax(0,1fr)] items-center gap-3 border-t border-line px-5 py-3 lg:grid-cols-[40px_minmax(0,1fr)_150px_auto] lg:gap-4 lg:px-6">
                  {entry.status === "checked_in" ? (
                    <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-full bg-success text-canvas"><Check size={18} /></span>
                  ) : (
                    <Avatar name={entry.displayName} size={40} />
                  )}
                  <span className="min-w-0 leading-snug">
                    <span className="block truncate text-sm font-extrabold">{entry.displayName}</span>
                    <span className="block truncate text-xs text-ink-muted">{[plan, entry.phone].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="col-start-2 lg:col-start-auto"><RosterStatus status={entry.status} /></span>
                  <span className="col-span-2 flex flex-wrap justify-end gap-1.5 lg:col-span-1">
                    {canCheckin && (
                      <Button variant="outline" aria-label={`Check-in de ${entry.displayName}`} onClick={() => checkinMutation.mutate(entry.bookingId)} disabled={checkinMutation.isPending}>
                        <Check size={16} aria-hidden="true" />
                        Check-in
                      </Button>
                    )}
                    {canNoShow && (
                      <Button variant="ghost" aria-label={`Marcar falta de ${entry.displayName}`} onClick={() => noShowMutation.mutate(entry.bookingId)} disabled={noShowMutation.isPending}>
                        <UserX size={16} aria-hidden="true" />
                        Falta
                      </Button>
                    )}
                    {canCancel && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Más acciones para ${entry.displayName}`}><MoreHorizontal size={18} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleCancelBooking(entry)}>Cancelar reserva (devuelve crédito)</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5 lg:px-6">
          <p className="text-[13px] text-ink-muted">Cancelar una reserva devuelve el crédito, salvo que elijas lo contrario.</p>
          {confirmed + waitlist > 0 && (
            <Button variant="outline" className="border-danger text-danger hover:bg-sunken" onClick={handleCancelClass}>Cancelar clase</Button>
          )}
        </div>
      </Panel>

      {/* Asignar socia (+ acompañante): panel lateral */}
      <Sheet
        open={assignOpen}
        onOpenChange={(next) => {
          setAssignOpen(next);
          if (!next) resetAssignForm();
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-ink">Asignar reserva a socia</SheetTitle>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            {/* Toggle "+ acompañante" */}
            {FEATURES.visits && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-sunken p-2.5">
                <input
                  type="checkbox"
                  checked={assignWithGuest}
                  onChange={(e) => { setAssignWithGuest(e.target.checked); if (!e.target.checked) setSelectedMember(null); }}
                  className="mt-0.5"
                />
                <div className="space-y-0.5">
                  <span className="text-sm font-medium text-ink">Llevará acompañante</span>
                  <p className="text-[11px] text-ink/55">
                    Descuenta 2 créditos: 1 del pack regular + 1 del pack de visitas de la socia.
                  </p>
                </div>
              </label>
            )}

            {/* Paso 1: elegir socia */}
            {(!assignWithGuest || !selectedMember) && (
              <div className="space-y-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                  <Input
                    className="pl-8"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Buscar por nombre, email o teléfono"
                  />
                </div>
                <div className="max-h-72 overflow-auto rounded-xl border border-line">
                  {searchingUsers ? (
                    <p className="px-3 py-2 text-xs text-ink/55">Buscando…</p>
                  ) : userOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-ink/55">Sin resultados</p>
                  ) : (
                    userOptions.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        disabled={assignMutation.isPending}
                        onClick={() => {
                          if (assignWithGuest) {
                            setSelectedMember(u);
                          } else {
                            assignMutation.mutate({ userId: u.id });
                          }
                        }}
                        className="w-full border-b border-line px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-sunken/40 disabled:opacity-60"
                      >
                        <p className="text-sm font-medium text-ink">{u.displayName}</p>
                        <p className="text-xs text-ink/55">
                          {u.email ?? "—"}
                          {u.phone ? ` · ${u.phone}` : ""}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Paso 2: socia ya elegida + form acompañante */}
            {assignWithGuest && selectedMember && (
              <div className="space-y-3">
                {/* Tarjeta de socia seleccionada */}
                <div className="flex items-start justify-between gap-2 rounded-xl border border-line-strong/60 bg-sunken/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] uppercase tracking-[0.12em] text-ink">Socia</p>
                    <p className="truncate text-sm font-medium text-ink">{selectedMember.displayName}</p>
                    <p className="truncate text-[11px] text-ink/55">
                      {selectedMember.email ?? "—"}{selectedMember.phone ? ` · ${selectedMember.phone}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[11px] text-ink/55 transition-colors hover:text-ink"
                    onClick={() => setSelectedMember(null)}
                  >
                    Cambiar
                  </button>
                </div>

                {/* Form acompañante */}
                <div className="space-y-3 rounded-xl border border-line bg-sunken p-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink/55">
                    Acompañante
                  </p>

                  <div className="space-y-1">
                    <label className="text-xs text-ink">Teléfono</label>
                    <div className="flex gap-2">
                      <Input
                        value={agGuestPhone}
                        onChange={(e) => { setAgGuestPhone(e.target.value); setAgFound(false); }}
                        placeholder="10 dígitos"
                        autoComplete="off"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={searchAdminGuest}
                        disabled={!agGuestPhone.trim() || agSearching}
                        className="border-line-strong/70 bg-transparent text-ink hover:bg-sunken/40 hover:text-ink"
                      >
                        {agSearching ? "…" : <Search size={14} />}
                      </Button>
                    </div>
                    {agFound && (
                      <p className="text-[11px] text-success">
                        Ya estuvo antes, cuestionario cargado.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-ink">Nombre</label>
                    <Input
                      value={agGuestName}
                      onChange={(e) => setAgGuestName(e.target.value)}
                      placeholder="Nombre y apellido"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-ink">Email (opcional)</label>
                    <Input
                      type="email"
                      value={agGuestEmail}
                      onChange={(e) => setAgGuestEmail(e.target.value)}
                      placeholder="ej. ana@correo.com"
                    />
                  </div>

                  <div className="space-y-2 border-t border-line pt-2.5">
                    <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink/55">
                      Cuestionario inicial
                    </p>

                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-ink">
                      <span>¿Tiene lesión o condición física?</span>
                      <input
                        type="checkbox"
                        checked={agGuestInjury}
                        onChange={(e) => setAgGuestInjury(e.target.checked)}
                      />
                    </label>
                    {agGuestInjury && (
                      <textarea
                        rows={2}
                        value={agGuestInjuryDetails}
                        onChange={(e) => setAgGuestInjuryDetails(e.target.value)}
                        placeholder="Cuéntanos qué debemos saber"
                        className="w-full rounded-md border border-line-strong/50 bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-ink/40"
                      />
                    )}

                    <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-ink">
                      <span>¿Practicó pilates antes?</span>
                      <input
                        type="checkbox"
                        checked={agGuestPracticed}
                        onChange={(e) => setAgGuestPracticed(e.target.checked)}
                      />
                    </label>

                    <label className="flex cursor-pointer items-start justify-between gap-2 border-t border-line pt-2 text-[11px] text-ink">
                      <span className="leading-relaxed">
                        Confirmo que la acompañante leyó y aceptó los términos y riesgos.
                      </span>
                      <input
                        type="checkbox"
                        checked={agGuestWaiver}
                        onChange={(e) => setAgGuestWaiver(e.target.checked)}
                      />
                    </label>
                  </div>
                </div>

                {/* ── Cobro de la acompañante ───────────────────────────────── */}
                <div className="space-y-2.5 rounded-2xl border border-line bg-sunken p-3">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.12em] text-ink/55">
                    Cobro de la acompañante
                  </p>
                  <div className="flex flex-col gap-2 text-xs text-ink">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="guestChargeMode"
                        checked={guestChargeMode === "host_pack"}
                        onChange={() => setGuestChargeMode("host_pack")}
                        className="mt-0.5"
                      />
                      <span>
                        Usar <strong>pack de visitas de la socia</strong>
                        <span className="mt-0.5 block text-[10px] text-ink/55">
                          Descuenta 1 crédito del pack de visitas activo. La socia debe tenerlo.
                        </span>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input
                        type="radio"
                        name="guestChargeMode"
                        checked={guestChargeMode === "guest_sale"}
                        onChange={() => setGuestChargeMode("guest_sale")}
                        className="mt-0.5"
                      />
                      <span>
                        Venderle <strong>clase suelta / pack</strong> a la acompañante
                        <span className="mt-0.5 block text-[10px] text-ink/55">
                          La socia no usa su pack de visitas; la acompañante paga su propia clase.
                        </span>
                      </span>
                    </label>
                  </div>

                  {guestChargeMode === "guest_sale" && (
                    <div className="space-y-2 border-t border-line pt-2">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Plan a vender</label>
                        <select
                          value={guestSalePlanId}
                          onChange={(e) => setGuestSalePlanId(e.target.value)}
                          className="w-full rounded-md border border-line-strong/50 bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          <option value="">— Seleccionar plan —</option>
                          {guestSalePlans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} — {p.classLimit ?? "?"} clase{p.classLimit === 1 ? "" : "s"} · {formatMXN(p.price)}
                            </option>
                          ))}
                        </select>
                        {guestSalePlans.length === 0 && (
                          <p className="text-[10px] text-ink/55">
                            Cargando planes… o marca al menos un plan como activo en Planes.
                          </p>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-ink">Método de pago</label>
                        <select
                          value={guestSalePayment}
                          onChange={(e) => setGuestSalePayment(e.target.value as any)}
                          className="w-full rounded-md border border-line-strong/50 bg-canvas px-2.5 py-1.5 text-xs text-ink"
                        >
                          <option value="cash">Efectivo</option>
                          <option value="transfer">Transferencia</option>
                          <option value="card">Tarjeta</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => { setAssignOpen(false); resetAssignForm(); }}
                    disabled={assignMutation.isPending}
                    className="flex-1 border-line-strong/70 bg-transparent text-ink hover:bg-sunken/40 hover:text-ink"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => assignMutation.mutate({
                      userId: selectedMember.id,
                      guest: {
                        name: agGuestName,
                        phone: agGuestPhone,
                        email: agGuestEmail || undefined,
                        hasInjury: agGuestInjury,
                        injuryDetails: agGuestInjury ? (agGuestInjuryDetails || null) : null,
                        practicedBarreBefore: agGuestPracticed,
                        acceptedWaiver: agGuestWaiver,
                      },
                      guestSale: guestChargeMode === "guest_sale"
                        ? { planId: guestSalePlanId, paymentMethod: guestSalePayment }
                        : undefined,
                    })}
                    disabled={
                      !agGuestName.trim() || !agGuestPhone.trim() || !agGuestWaiver ||
                      (guestChargeMode === "guest_sale" && !guestSalePlanId) ||
                      assignMutation.isPending
                    }
                    className="flex-1 bg-ink text-canvas hover:bg-inverse"
                  >
                    {assignMutation.isPending
                      ? "Asignando…"
                      : guestChargeMode === "guest_sale"
                        ? "Confirmar (socia + venta a invitada)"
                        : "Confirmar (2 créditos)"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {FEATURES.visits && (
        <VisitAssignDialog
          classId={classId}
          open={visitOpen}
          onOpenChange={setVisitOpen}
          onSuccess={() => refetch()}
        />
      )}

      <CancelBookingDialog
        entry={cancelTarget}
        classStartsAt={classInfo?.startsAt ?? null}
        windowHours={creditWindowHours}
        pending={cancelMutation.isPending}
        onConfirm={({ reason, refundCredit }) => {
          if (cancelTarget) cancelMutation.mutate({ id: cancelTarget.bookingId, reason, refundCredit });
        }}
        onClose={() => setCancelTarget(null)}
      />

      {dialog}
    </div>
  );
};

type WeekClass = {
  id: string;
  date?: string;
  start_time: string;
  end_time?: string;
  class_type_name?: string;
  className?: string;
  instructor_name?: string | null;
  max_capacity?: number;
  current_bookings?: number;
  waitlist_count?: number;
};

const dateOf = (c: WeekClass) => c.date ?? String(c.start_time).split("T")[0];
const weekDayLabel = (d: Date) => format(d, "EEE", { locale: es }).replace(".", "").toUpperCase();

function WeekClassList({ weekStart, day, onDayChange, selectedId, onSelect }: {
  weekStart: Date; day: string; onDayChange: (d: string) => void; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const start = format(weekStart, "yyyy-MM-dd");
  const end = format(addDays(weekStart, 6), "yyyy-MM-dd");
  const { data, isLoading, isError, refetch } = useQuery<{ data: WeekClass[] }>({
    queryKey: ["admin-classes-week", start],
    queryFn: async () => (await api.get(`/classes?start=${start}&end=${end}`)).data,
  });
  const classes = Array.isArray(data?.data) ? data!.data : [];
  const todayKey = format(new Date(), "yyyy-MM-dd");
  const nowHHMM = format(new Date(), "HH:mm");
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const key = format(d, "yyyy-MM-dd");
    return { date: key, label: weekDayLabel(d), day: d.getDate(), count: classes.filter((c) => dateOf(c) === key).length };
  });
  const dayClasses = classes
    .filter((c) => dateOf(c) === day)
    .sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
  const booked = dayClasses.reduce((s, c) => s + (Number(c.current_bookings) || 0), 0);
  const capacity = dayClasses.reduce((s, c) => s + (Number(c.max_capacity) || 0), 0);
  const title = format(parseISO(day), "EEEE d", { locale: es });

  return (
    <Panel aria-label="Clases de la semana" className="p-4">
      <DayStrip days={days} value={day} onChange={onDayChange} today={todayKey} />
      <div className="mt-4 flex items-baseline justify-between px-1">
        <h2 className="text-[15px] font-extrabold capitalize">{title}{day === todayKey ? " · hoy" : ""}</h2>
        <span className="nums text-[13px] text-ink-muted">{booked}/{capacity} lugares</span>
      </div>
      {isError ? (
        <ErrorState title="No pudimos cargar la semana" onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="mt-3 space-y-2"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>
      ) : dayClasses.length === 0 ? (
        <p className="px-1 py-6 text-sm text-ink-muted">
          {classes.length === 0 ? "No hay clases programadas esta semana" : "No hay clases este día."}
        </p>
      ) : (
        <ul className="mt-2">
          {dayClasses.map((c, i) => {
            const cap = Number(c.max_capacity) || 0;
            const taken = Number(c.current_bookings) || 0;
            const full = cap > 0 && taken >= cap;
            const past = day < todayKey || (day === todayKey && hhmm(c.end_time ?? c.start_time) <= nowHHMM);
            const selected = c.id === selectedId;
            const name = c.class_type_name ?? c.className ?? "Clase";
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={selected ? "true" : undefined}
                  className={cn(
                    "grid w-full grid-cols-[50px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-xl px-3 py-3 text-left",
                    selected ? "bg-canvas ring-2 ring-inset ring-ink" : i > 0 && "border-t border-line",
                  )}
                >
                  <span className={cn("nums text-sm font-extrabold", past ? "text-ink-muted" : "text-ink")}>{hhmm(c.start_time)}</span>
                  <span className="min-w-0 leading-tight">
                    <span className={cn("block truncate text-sm font-extrabold", past ? "text-ink-muted" : "text-ink")}>{name}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      con {c.instructor_name ?? "—"}{past ? " · terminó" : ""}
                      {Number(c.waitlist_count) > 0 ? ` · ${c.waitlist_count} en espera` : ""}
                    </span>
                  </span>
                  {full && !past ? (
                    <Badge variant="attention">Llena</Badge>
                  ) : (
                    <span className="nums text-[13px] font-bold text-ink-muted">{taken}/{cap}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

const BookingsList = () => {
  const [classId, setClassId] = useSearchParamState("clase");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));

  // Si la clase del enlace es de otra semana, la lista se va a esa semana y día.
  const onClassLoaded = useCallback((date: string) => {
    setWeekStart(startOfWeek(parseISO(date), { weekStartsOn: 1 }));
    setDay(date);
  }, []);

  const changeWeek = (w: Date) => {
    setWeekStart(w);
    const today = new Date();
    const inWeek = today >= w && today < addDays(w, 7);
    setDay(format(inWeek ? today : w, "yyyy-MM-dd"));
  };

  return (
    <AuthGuard>
      <AdminLayout>
        <AdminPage>
          <AdminPageHeader kicker={`Reservas · semana ${getISOWeek(weekStart)}`} title="Reservas" actions={<ReservasTabs />} />
          <WeekNav weekStart={weekStart} onChange={changeWeek} />
          <MasterDetail
            hasSelection={!!classId}
            onBack={() => setClassId(null)}
            backLabel="Volver a la semana"
            list={<WeekClassList weekStart={weekStart} day={day} onDayChange={setDay} selectedId={classId} onSelect={setClassId} />}
            detail={
              classId ? (
                <ClassRoster key={classId} classId={classId} onBack={() => setClassId(null)} onClassLoaded={onClassLoaded} />
              ) : (
                <Panel className="px-6 py-10">
                  <p className="text-sm text-ink-muted">Elige una clase para ver su lista de alumnas.</p>
                </Panel>
              )
            }
          />
        </AdminPage>
      </AdminLayout>
    </AuthGuard>
  );
};

export default BookingsList;
